"""Task #349 PR 5: "What's new for me" (docs/ASK-AI.md "What's new for me").

"anything new in my holdings?", "what changed in my portfolio this week", "kya naya hai mere stocks mein" (memory.asks_whatsnew) is the intent
`mine:-:whatsnew`. For each company the member holds or watches (at most MAX, the Equity portfolio first by its weight, then the watchlists), a
deterministic diff, with no model:

    since     the company's last memory row (a question about it, or an earlier "what's new" that compared it), at most 30 days back; with none,
              the last 7 days
    price     the close on or before that day against the latest stored close (price_daily), both with their dates (memory.diff)
    Prism     only when the earlier row had a score: read again as the member (get_finlit_prism, so the plan is respected) and compared (memory.diff)
    filings   the company's news and results filings dated after that day (get_news_and_filings, memory.new_items), at most 3

The facts go in `<whats_new_for_you>` in the note with the question (never the system prompt), the biggest change first. Members who keep no
company get a plain answer, without the model, that points to adding shares or a watchlist. Every query is scoped to the member's user_id."""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Optional, Sequence, Tuple

from . import memory, mine

MAX = 5
WINDOW = dt.timedelta(days=7)
ROW_WITHIN = memory.SINCE_WITHIN            # an earlier question older than this is not a starting point: the last 7 days are used instead
ITEMS = 3                                   # new filings named per company

NOTHING_KEPT = ("You have no shares in your Equity portfolio and no companies on a watchlist on FinLit yet, so there is nothing to compare. "
                "Add shares in Workspace > Equity portfolio, or add companies to a watchlist, and ask again: FinLit AI will then say what changed "
                "in each of them, with dates.")
NOTHING_PAGES = [{"to": "/holdings", "label": "Your Equity portfolio"}, {"to": "/watchlist", "label": "Your watchlists"}]

INSTRUCTION = ("[The member asked what is new in the companies they hold or watch. Answer from <whats_new_for_you>: lead with the biggest changes, "
               "one short line each with its date; then one line naming the companies with no change. Every figure keeps its date. Describe only, "
               "never advise: never say to buy, add, sell, trim, exit, hold or rebalance.]")


# ------------------------------------------------------------------------------------------------------------------ the member's companies

async def kept(pool, user_id: str) -> List[Dict[str, Any]]:
    """The companies the member holds or watches, at most MAX: the Equity portfolio first (by weight in it, the page's own rule, then by value,
    then as listed), then the watchlists in their order. Each: {symbol, how ("hold" | "list" | "watch"), link (a few words with the date)}."""
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
            item = {"symbol": s, "how": "list", "link": "on your Equity portfolio list, no quantity saved"}
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


async def prices(pool, since: Dict[str, dt.date]) -> Tuple[Dict[str, Tuple[float, dt.date]], Dict[str, Tuple[float, dt.date]]]:
    """(the close on or before each company's starting day, the latest close), each with its day, from price_daily."""
    syms = list(since)
    if not syms:
        return {}, {}
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT s.sym, b.day AS bday, b.close AS bclose, n.day AS nday, n.close AS nclose FROM unnest($1::text[], $2::date[]) AS s(sym, d)
               LEFT JOIN LATERAL (SELECT day, close FROM price_daily WHERE symbol = s.sym AND day <= s.d AND close > 0 ORDER BY day DESC LIMIT 1) b ON true
               LEFT JOIN LATERAL (SELECT day, close FROM price_daily WHERE symbol = s.sym AND close > 0 ORDER BY day DESC LIMIT 1) n ON true""",
            syms, [since[s] for s in syms])
    before = {r["sym"]: (float(r["bclose"]), r["bday"]) for r in rows if r["bclose"] is not None}
    now = {r["sym"]: (float(r["nclose"]), r["nday"]) for r in rows if r["nclose"] is not None}
    return before, now


async def lookup(pool, user_id: str, now: Optional[dt.datetime] = None) -> Dict[str, Any]:
    """Everything read from the database before the model starts: {companies: [{symbol, how, link, since, row, before, now}]}. `companies` is
    empty for a member who keeps no company (the plain answer)."""
    now = now or dt.datetime.now(dt.timezone.utc)
    cos = await kept(pool, user_id)
    rows = await last_rows(pool, user_id, [c["symbol"] for c in cos])
    for c in cos:
        row = rows.get(c["symbol"])
        c["row"] = row
        c["since"] = row["askedAt"] if row else now - WINDOW
    start = {c["symbol"]: memory._ist_day(c["since"]) for c in cos}
    before, latest = await prices(pool, start)
    for c in cos:
        c["before"], c["now"] = before.get(c["symbol"]), latest.get(c["symbol"])
    return {"companies": cos}


def reads(plan: Dict[str, Any]) -> List[Tuple[str, Dict[str, Any]]]:
    """The reads made as the member, in the answer's budget: each company's news and results filings, and FinLit Prism where the earlier row had it."""
    out: List[Tuple[str, Dict[str, Any]]] = []
    for c in plan["companies"]:
        s = c["symbol"]
        out += [("get_news_and_filings", {"kind": "news", "symbol": s, "limit": 12}), ("get_news_and_filings", {"kind": "results", "symbol": s, "limit": 6})]
        if (c.get("row") or {}).get("figures", {}).get("prism"):
            out.append(("get_finlit_prism", {"symbol": s}))
    return out


# ------------------------------------------------------------------------------------------------------------------ the diff

def _price(v: Optional[Tuple[float, dt.date]]) -> Optional[Dict[str, Any]]:
    return {"value": v[0], "asOf": v[1].isoformat()} if v else None


def build(plan: Dict[str, Any], results: Sequence[Tuple[str, Dict[str, Any], Optional[Dict[str, Any]]]], now_plan: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """(one entry per company: {symbol, link, since, sinceText, facts, items, size}, biggest change first; the figures compared, to keep with the
    answer). `results`: (tool, arguments, tools.run result or None when not read in time)."""
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
        items: List[Dict[str, Any]] = []
        for n, a, r in got:
            if n == "get_news_and_filings":
                for i in memory.new_items(r["text"], c["since"], ITEMS):
                    items.append({**i, "kind": "results" if a.get("kind") == "results" else "news"})
        items = sorted(sorted(items, key=lambda i: i["date"], reverse=True), key=lambda i: i["kind"] != "results")[:ITEMS]   # results first, newest first
        size = sum(3 if f["kind"] in ("prism", "results", "formula", "plan") else 0 for f in facts) + 2 * len(items)
        pp, np_ = prev.get("price") or {}, now_fig.get("price") or {}
        if pp.get("value") and np_.get("value") is not None:
            size += abs(float(np_["value"]) / float(pp["value"]) - 1) * 100
        when = memory.moment_of(c["since"]) if row else memory.day_of(c["since"])
        since_text = f"since your question of {when}" if row else f"last 7 days, since {when}"
        out.append({"symbol": s, "how": c["how"], "link": c["link"], "since": c["since"], "sinceText": since_text, "facts": facts, "items": items,
                    "size": size, "hasPrice": bool(np_)})
        if now_fig:
            keep[s] = now_fig
    out.sort(key=lambda e: -e["size"])
    return out, ({"companies": keep} if keep else {})


def _lines(e: Dict[str, Any]) -> List[str]:
    lines = [f["text"] for f in e["facts"]]
    lines += [f"New {'results filing' if i['kind'] == 'results' else 'filing'}: {i['title']} ({memory.day_of(i['date'])})" for i in e["items"]]
    if not lines:
        lines = [memory.NO_CHANGE] if e["hasPrice"] else ["No stored close to compare (FinLit holds no daily price for it yet), and no new filing"]
    return lines


def note(entries: List[Dict[str, Any]]) -> str:
    """<whats_new_for_you> and the one instruction, for the note with the question."""
    rows = []
    for e in entries:
        rows.append(f"- {e['symbol']} ({e['link']}), {e['sinceText']}:")
        rows += [f"  - {x}" for x in _lines(e)]
    return "<whats_new_for_you>\n" + "\n".join(rows) + "\n</whats_new_for_you>\n" + INSTRUCTION

