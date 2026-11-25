"""Task #349 PR 5: "What's new for me" (docs/ASK-AI.md "What's new for me").

"anything new in my holdings?", "what changed in my portfolio this week", "kya naya hai mere stocks mein" (memory.asks_whatsnew) is the intent
`mine:-:whatsnew`. For EVERY company the member holds or watches (the whole Equity portfolio, with or without a quantity, then the watchlists; task
#349 fix A: it read only the first 5, so 40 of 45 holdings were never looked at), a deterministic diff, with no model:

    since     the company's last memory row (a question about it, or an earlier "what's new" that compared it), at most 30 days back; with none,
              the last 7 days
    price     the close on or before that day (price_daily) against the LATEST price, from the same source the Equity portfolio page (/holdings)
              and the dashboard show: the stored report's quote with the shared latest quote laid over it (livequote, task #338), or the newest
              stored close when that is newer. Both with their dates (memory.diff). Fix A: the newest price_daily close alone was days old.
    Prism     only when the earlier row had a score: read again as the member (get_finlit_prism, so the plan is respected) and compared (memory.diff)
    filings   the company's news and results filings dated after that day and up to today, at most 3 (one query on the public feed for all)

Every company is ranked by the size of its price move (biggest first; new results, Prism moves and filings break ties). The TOP biggest go in
`<whats_new_for_you>` one by one, after a first line saying how many were compared, and the rest are summed up in one line, so none is silently
left out. The facts go in the note with the question (never the system prompt). Members who keep no company get a plain answer, without the
model, that points to adding shares or a watchlist. Every query is scoped to the member's user_id."""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .. import livequote
from . import memory, mine

MAX = 300                                   # companies compared at most: a guard only (the Equity portfolio and watchlists hold fewer)
TOP = 12                                    # companies listed one by one in the note, the biggest moves first; the rest are summed up
PRISM_READS = 10                            # FinLit Prism read again for at most this many companies (those with an earlier score)
WINDOW = dt.timedelta(days=7)
ROW_WITHIN = memory.SINCE_WITHIN            # an earlier question older than this is not a starting point: the last 7 days are used instead
ITEMS = 3                                   # new filings named per company

NOTHING_KEPT = ("You have no shares in your Equity portfolio and no companies on a watchlist on FinLit yet, so there is nothing to compare. "
                "Add shares in Workspace > Equity portfolio, or add companies to a watchlist, and ask again: FinLit AI will then say what changed "
                "in each of them, with dates.")
NOTHING_PAGES = [{"to": "/holdings", "label": "Your Equity portfolio"}, {"to": "/watchlist", "label": "Your watchlists"}]

INSTRUCTION = ("[The member asked what is new in the companies they hold or watch. Answer from <whats_new_for_you>: first say how many of their "
               "companies were compared, as its first line says; lead with the biggest moves, in its order, one short line each with its dates; "
               "then one line for the companies with smaller or no moves. Every figure keeps its date. A company with no quantity saved is on "
               "their list: never say they hold it. Describe only, never advise: never say to buy, add, sell, trim, exit, hold or rebalance.]")


# ------------------------------------------------------------------------------------------------------------------ the member's companies

async def kept(pool, user_id: str) -> List[Dict[str, Any]]:
    """Every company the member holds or watches (at most MAX, a guard): the Equity portfolio first (by weight in it, the page's own rule, then
    by value, then as listed; a share with no quantity too), then the watchlists in their order. Each: {symbol, how ("hold" | "list" | "watch"),
    link (a few words with the date)}."""
    async with pool.acquire() as conn:
        st = await conn.fetchrow("SELECT portfolio, watchlist FROM user_state WHERE user_id = $1", user_id)
        portfolio = mine._json(st["portfolio"], {}) if st else {}
        watchlist = mine._json(st["watchlist"], {}) if st else {}
        holdings = [h for h in (portfolio.get("holdings") if isinstance(portfolio, dict) and isinstance(portfolio.get("holdings"), list) else [])
                    if isinstance(h, dict) and mine.SYMBOL.match(str(h.get("symbol") or "").upper())]
        closes = await mine._closes(conn, user_id) if holdings else {}
    names = list(dict.fromkeys(str(h["symbol"]).upper() for h in holdings))
    held: List[Tuple[Tuple[float, float, int], Dict[str, Any]]] = []
    for i, s in enumerate(names):
        eq = mine.equity(holdings, closes, s) or {}
        if eq.get("qty"):
            bits = [mine.qty_words(eq["qty"])]
            if eq.get("weight") is not None:
                bits.append(f"{eq['weight']:.1f}% of your Equity portfolio by value")
            on = f", close {mine.day(eq['closeOn'])}" if eq.get("closeOn") and eq.get("weight") is not None else ""
            item = {"symbol": s, "how": "hold", "link": "you hold " + "; ".join(bits) + on}
        else:
            item = {"symbol": s, "how": "list", "link": "on your Equity portfolio, no quantity saved"}
        held.append(((-(eq.get("weight") or -1.0), -(eq.get("value") or 0.0) if eq.get("qty") else 1.0, i), item))
    out = [x for _, x in sorted(held, key=lambda t: t[0])]
    lists = watchlist.get("lists") if isinstance(watchlist, dict) and isinstance(watchlist.get("lists"), list) else []
    for wl in lists:
        if not isinstance(wl, dict):
            continue
        for sym in wl.get("symbols") or []:
            s = str(sym or "").upper()
            if isinstance(sym, str) and mine.SYMBOL.match(s) and s not in {x["symbol"] for x in out}:
                out.append({"symbol": s, "how": "watch", "link": f"on your watchlist '{str(wl.get('name') or 'My watchlist')[:28]}'"})
    return out[:MAX]


async def last_rows(pool, user_id: str, symbols: Sequence[str]) -> Dict[str, Dict[str, Any]]:
    """The newest memory row of each company within ROW_WITHIN: a question about it, or an earlier "what's new" that compared it. None when the
    member switched remembering off (prefs.aiMemory false): the last 7 days are used for every company."""
    if not symbols:
        return {}
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT s.sym, r.asked_at, r.figures, r.plan FROM unnest($2::text[]) AS s(sym)
               JOIN LATERAL (SELECT asked_at, figures, plan FROM ai_question_memory m
                             WHERE m.user_id = $1 AND m.asked_at >= now() - make_interval(secs => $3)
                               AND ((m.subject_kind = 'company' AND m.subject_id = s.sym) OR (m.topic_key = $4 AND m.figures->'companies' ? s.sym))
                             ORDER BY m.asked_at DESC, m.id DESC LIMIT 1) r ON true
               WHERE COALESCE((SELECT prefs->>'aiMemory' FROM user_state WHERE user_id = $1), '') <> 'false'""",
            user_id, list(symbols), ROW_WITHIN.total_seconds(), memory.WHATSNEW_TOPIC[0])
    out: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        figs = mine._json(r["figures"], {})
        out[r["sym"]] = {"askedAt": r["asked_at"], "figures": ((figs.get("companies") or {}).get(r["sym"]) or {}) if isinstance(figs, dict) else {},
                         "plan": r["plan"]}
    return out


async def prices(pool, since: Dict[str, dt.date], redis=None) -> Tuple[Dict[str, Tuple[float, dt.date]], Dict[str, Tuple[float, dt.date]]]:
    """(the close on or before each company's starting day, from price_daily; the latest price, from latest()), each with its day."""
    syms = list(since)
    if not syms:
        return {}, {}
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT s.sym, b.day AS bday, b.close AS bclose FROM unnest($1::text[], $2::date[]) AS s(sym, d)
               LEFT JOIN LATERAL (SELECT day, close FROM price_daily WHERE symbol = s.sym AND day <= s.d AND close > 0 ORDER BY day DESC LIMIT 1) b ON true""",
            syms, [since[s] for s in syms])
    before = {r["sym"]: (float(r["bclose"]), r["bday"]) for r in rows if r["bclose"] is not None}
    return before, await latest(pool, syms, redis)


def _quote_day(q: Optional[dict]) -> Optional[dt.date]:
    w = memory._when((q or {}).get("asOf"))
    return memory._ist_day(w) if w is not None else None


async def latest(pool, symbols: Sequence[str], redis=None) -> Dict[str, Tuple[float, dt.date]]:
    """The latest price of each company with its day, as the Equity portfolio page and the dashboard show it: the stored report's quote with the
    shared latest quote laid over it when newer (portfolio_overview.holding, livequote.overlay), or the newest price_daily close when that is newer
    still. A price with no date is never used (no date, no figure)."""
    syms = list(dict.fromkeys(symbols))
    if not syms:
        return {}
    async with pool.acquire() as conn:
        daily = await conn.fetch(
            """SELECT s.sym, n.day, n.close FROM unnest($1::text[]) AS s(sym)
               JOIN LATERAL (SELECT day, close FROM price_daily WHERE symbol = s.sym AND close > 0 ORDER BY day DESC LIMIT 1) n ON true""", syms)
        snaps = await conn.fetch(
            """SELECT DISTINCT ON (symbol) symbol, body::jsonb #> '{quote}' AS quote FROM snapshots
               WHERE symbol = ANY($1::text[]) AND section = 'summary' ORDER BY symbol, (statement = 'consolidated') DESC""", syms)
    out: Dict[str, Tuple[float, dt.date]] = {r["sym"]: (float(r["close"]), r["day"]) for r in daily}
    quotes = {r["symbol"]: mine._json(r["quote"], None) for r in snaps}
    live = await livequote.read(redis, syms) if redis is not None else {}
    for s in syms:
        base = quotes.get(s) if isinstance(quotes.get(s), dict) else None
        q = (livequote.overlay(base, live.get(s)) or base) if base else live.get(s)
        try:
            price = float(q["price"]) if q and q.get("price") else None
        except (TypeError, ValueError):
            price = None
        day = _quote_day(q)
        if price and price > 0 and day and (s not in out or day >= out[s][1]):
            out[s] = (price, day)
    return out


async def filings(pool, since: Dict[str, dt.date], today: dt.date) -> Dict[str, List[Dict[str, Any]]]:
    """Each company's news and results filings dated after its starting day and up to today (the public News & filings feed), results first,
    then newest first, at most ITEMS each: one query for every company."""
    syms = list(since)
    if not syms:
        return {}
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT s.sym, f.kind, f.title, f.item_date FROM unnest($1::text[], $2::date[]) AS s(sym, d)
               JOIN LATERAL (SELECT kind, title, item_date FROM feed_items WHERE symbol = s.sym AND kind IN ('news', 'result')
                             AND item_date > s.d AND item_date <= $3 ORDER BY (kind = 'result') DESC, item_date DESC, id DESC LIMIT $4) f ON true""",
            syms, [since[s] for s in syms], today, ITEMS)
    out: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        title = " ".join(str(r["title"] or "").replace("<", " ").replace(">", " ").split())
        if title:
            out.setdefault(r["sym"], []).append({"title": memory._cut(title, 120), "date": r["item_date"].isoformat(), "symbol": r["sym"],
                                                 "kind": "results" if r["kind"] == "result" else "news"})
    return out


async def lookup(pool, user_id: str, now: Optional[dt.datetime] = None, redis=None) -> Dict[str, Any]:
    """Everything read from the database before the model starts: {companies: [{symbol, how, link, since, row, before, now, items}]}. `companies`
    is empty for a member who keeps no company (the plain answer)."""
    now = now or dt.datetime.now(dt.timezone.utc)
    cos = await kept(pool, user_id)
    rows = await last_rows(pool, user_id, [c["symbol"] for c in cos])
    for c in cos:
        row = rows.get(c["symbol"])
        c["row"] = row
        c["since"] = row["askedAt"] if row else now - WINDOW
    start = {c["symbol"]: memory._ist_day(c["since"]) for c in cos}
    before, last = await prices(pool, start, redis)
    feed = await filings(pool, start, memory._ist_day(now))
    for c in cos:
        c["before"], c["now"], c["items"] = before.get(c["symbol"]), last.get(c["symbol"]), feed.get(c["symbol"], [])
    return {"companies": cos}


def reads(plan: Dict[str, Any]) -> List[Tuple[str, Dict[str, Any]]]:
    """The reads made as the member, in the answer's budget: FinLit Prism where the earlier row had a score (at most PRISM_READS). The filings of
    every company are already in the plan (one query)."""
    return [("get_finlit_prism", {"symbol": c["symbol"]}) for c in plan["companies"]
            if ((c.get("row") or {}).get("figures") or {}).get("prism")][:PRISM_READS]


# ------------------------------------------------------------------------------------------------------------------ the diff

def _price(v: Optional[Tuple[float, dt.date]]) -> Optional[Dict[str, Any]]:
    return {"value": v[0], "asOf": v[1].isoformat()} if v else None


def build(plan: Dict[str, Any], results: Sequence[Tuple[str, Dict[str, Any], Optional[Dict[str, Any]]]], now_plan: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """(one entry per company: {symbol, link, since, sinceText, facts, items, move, size}, the biggest price move first; the figures compared, to
    keep with the answer). `results`: (tool, arguments, tools.run result or None when not read in time)."""
    by: Dict[str, List[Tuple[str, Dict[str, Any], Dict[str, Any]]]] = {}
    for name, args, res in results:
        if res and not res.get("error"):
            by.setdefault(str(args.get("symbol") or ""), []).append((name, args, res))
    out: List[Dict[str, Any]] = []
    keep: Dict[str, Dict[str, Any]] = {}
    for c in plan["companies"]:
        s = c["symbol"]
        row = c.get("row") or {}
        prev = {k: v for k, v in (row.get("figures") or {}).items() if k in ("price", "prism")}   # only what is compared again here
        if not prev.get("price") and c.get("before"):
            prev["price"] = _price(c["before"])
        got = by.get(s, [])
        now_fig: Dict[str, Any] = {}
        if c.get("now"):
            now_fig["price"] = _price(c["now"])
        tr = [(n, a, r["text"]) for n, a, r in got if n == "get_finlit_prism"]
        prism = (memory.extract_figures(tr).get("companies") or {}).get(s, {}).get("prism") if tr else None
        if prism:
            now_fig["prism"] = prism
        if not tr:
            prev.pop("prism", None)          # not read again (no earlier score, or not in time): never said as a change or as a plan change
        facts = memory.diff({"companies": {s: prev}}, {"companies": {s: now_fig}}, asked_at=c["since"], subject=s,
                            prev_plan=row.get("plan") or "", now_plan=now_plan, locked=memory.locked_of(tr))
        facts = [f for f in facts if f["kind"] != "sector"]
        items: List[Dict[str, Any]] = [dict(i) for i in c.get("items") or []]
        for n, a, r in got:
            if n == "get_news_and_filings":
                for i in memory.new_items(r["text"], c["since"], ITEMS):
                    items.append({**i, "kind": "results" if a.get("kind") == "results" else "news"})
        items = sorted(sorted(items, key=lambda i: i["date"], reverse=True), key=lambda i: i["kind"] != "results")[:ITEMS]   # results first, newest first
        events = sum(3 if f["kind"] in ("prism", "results", "formula", "plan") else 0 for f in facts) + 2 * len(items)
        pp, np_ = prev.get("price") or {}, now_fig.get("price") or {}
        move = None
        if pp.get("value") and np_.get("value") is not None and any(f["kind"] == "price" for f in facts):
            move = (float(np_["value"]) / float(pp["value"]) - 1) * 100
        when = memory.moment_of(c["since"]) if row else memory.day_of(c["since"])
        since_text = f"since your question of {when}" if row else f"last 7 days, since {when}"
        out.append({"symbol": s, "how": c["how"], "link": c["link"], "since": c["since"], "sinceText": since_text, "facts": facts, "items": items,
                    "move": move, "size": (abs(move) if move is not None else 0.0, events), "hasPrice": bool(np_), "now": np_ or None})
        if now_fig:
            keep[s] = now_fig
    out.sort(key=lambda e: (-e["size"][0], -e["size"][1]))           # fix A: the biggest price move first; new results, Prism and filings break ties
    return out, ({"companies": keep} if keep else {})


def _lines(e: Dict[str, Any]) -> List[str]:
    lines = [f["text"] for f in e["facts"]]
    lines += [f"New {'results filing' if i['kind'] == 'results' else 'filing'}: {i['title']} ({memory.day_of(i['date'])})" for i in e["items"]]
    if not lines:
        lines = [memory.NO_CHANGE] if e["hasPrice"] else ["No stored close to compare (FinLit holds no daily price for it yet), and no new filing"]
    return lines


def _move(e: Dict[str, Any]) -> str:
    m = e["move"]
    return f"{e['symbol']} {'+' if m > 0 else mine.MINUS if m < 0 else ''}{abs(m):.1f}%"


def note(entries: List[Dict[str, Any]], top: int = TOP) -> str:
    """<whats_new_for_you> and the one instruction, for the note with the question: how many companies were compared, the `top` biggest moves one
    by one, then one line for the rest (their moves, or that they had no price to compare), so none is silently left out."""
    n = len(entries)
    held = sum(1 for e in entries if e.get("how") in ("hold", "list"))
    shown, rest = entries[:top], entries[top:]
    head = (f"Compared all {n} of your companies ({held} on your Equity portfolio, {n - held} on watchlists only), the biggest price move first"
            + (f"; the {len(shown)} biggest are listed one by one, the other {len(rest)} on the last line." if rest else "."))
    rows = [head]
    for e in shown:
        rows.append(f"- {e['symbol']} ({e['link']}), {e['sinceText']}:")
        rows += [f"  - {x}" for x in _lines(e)]
    if rest:
        moved = [e for e in rest if e.get("move")]
        flat = [e["symbol"] for e in rest if e.get("move") == 0]
        alone = [e["symbol"] for e in rest if e.get("move") is None and e["hasPrice"]]
        none = [e["symbol"] for e in rest if not e["hasPrice"]]
        bits = []
        if moved:
            bits.append("smaller moves: " + ", ".join(_move(e) for e in moved))
        if flat:
            bits.append("price unchanged: " + ", ".join(flat))
        if alone:
            bits.append("no earlier price to compare with: " + ", ".join(alone))
        if none:
            bits.append("no stored price to compare: " + ", ".join(none))
        days = sorted({e["now"]["asOf"] for e in rest if isinstance(e.get("now"), dict) and e["now"].get("asOf")})
        on = f" (latest prices of {memory.day_of(days[-1])})" if days else ""
        rows.append(f"- The other {len(rest)}{on}: " + "; ".join(bits) + ".")
    return "<whats_new_for_you>\n" + "\n".join(rows) + "\n</whats_new_for_you>\n" + INSTRUCTION
