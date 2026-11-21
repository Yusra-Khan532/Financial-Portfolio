"""Superinvestor portfolios (task #212): what named investors hold, from the companies' own shareholding filings.

Every listed company files, each quarter, the names of the public shareholders who own 1% or more of it. FinEdge sends those
filings (shareholdingDetails); the nightly `ownership-insights` job keeps each company's named holders in
`ownership_insights.extra.holders` as [name, group, % now, % a year ago] (docs/OWNERSHIP.md). This module turns that around:
by investor instead of by company. No provider call is made here, and no job is added: the data is what the nightly job already keeps.

Who is listed: a named holder in the PUBLIC group of the filings (not a fund, bank, insurer or other institution, not a promoter,
not the government), named in two or more listed companies with 1% or more today. Category lines of the filing ("Bodies corporate",
"Clearing members", "HUF" ...) are not people and are left out.

What each portfolio shows (all described, never advised):
  * stock picks and stakes (% of the company), with the value of the stake at today's market capitalisation (listing_quotes);
  * weightings: each stake's share of the portfolio's value;
  * sector allocation: the same values by NSE sector (company_classification);
  * the year's changes (the "transaction history" the filings allow): newly named, added, reduced, no longer named. A holder below 1%
    is not named in a filing, so "no longer named" means sold or below 1%; the filing does not say which.
Blanks always say why. Information only, not investment advice.

Each investor is marked "person" or "firm" from the shape of the name; the page opens on people (the "superinvestors" of the task) with
companies and funds one tab away.

GET /api/superinvestors                 the All named holders list (every plan, signed in or not); a name grouped into a tracked investor carries `tracked`
GET /api/superinvestors/tracked         the Tracked investors tab: tiles, cards, latest moves, stocks they agree on (Gold; task #289)
GET /api/superinvestors/name/{key}      one filed name's portfolio, as the filings write it (Gold)
GET /api/superinvestors/{key}           a tracked investor's page; a filed name that belongs to a tracked investor answers `moved` with its page;
                                        any other name answers its own portfolio (Gold; other plans get plan_required)
Task #289 (21 Nov 2026): the whole feature is part of the Gold plan; the Silver lock is gone. Tracked investors: superinvestors_tracked.py.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from collections import Counter, defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

import orjson
from fastapi import APIRouter, Request, Response

from . import superinvestors_tracked as tracked
from .auth.entitlements import has, sees_all
from .auth.service import current

log = logging.getLogger("finlit.superinvestors")
router = APIRouter()

CACHE_KEY = "superinvestors:v3"   # v2: every investor carries kind (person | firm); v3: tracked investors (task #289)
CACHE_SECONDS = 3600
MIN_COMPANIES = 2           # named in at least this many listed companies (1% or more today) to be listed
MIN_STAKE = 1.0             # the filing names holders of 1% or more
MOVE = 0.01                 # a stake change smaller than this (percentage points) is "unchanged"
SOURCE = "Each company's shareholding filing (named public shareholders of 1% or more), via FinEdge; values at today's market capitalisation."
DISCLAIMER = "Information only, not investment advice. Holdings below 1% are not named in filings, so a portfolio here shows only stakes of 1% or more."
NOTE_NAMES = ("Names are matched as the filings write them: one investor filing under two spellings, or through a company, appears separately, "
              "and two different people with the same name appear as one. People and companies are told apart by the shape of the name.")

# Category lines a filing lists next to named holders. They are groups of shareholders, not one investor.
_CATEGORY = re.compile(
    r"^(?:any other|others?|trusts?|clearing members?|bodies corporate|body corporate|huf|hindu undivided famil(?:y|ies)|llps?|"
    r"limited liability partnerships?|non[- ]?resident indians?(?: \(nris?\))?|nris?|foreign nationals?|foreign compan(?:y|ies)|"
    r"overseas depositor(?:y|ies).*|key managerial personnel.*|directors? and (?:their )?relatives.*|iepf|investor education.*|"
    r"unclaimed.*|suspense.*|escrow.*|employees?.*|esop.*|resident individuals?.*|individuals?.*|associate compan.*|"
    r"(?:i+|iv|v)\.? .*nominal share capital.*|.*nominal share capital.*|alternate investment funds?|"
    r"foreign portfolio investors?.*|banks?|insurance compan(?:y|ies)|mutual funds?|provident funds?.*|pension funds?.*|"
    r"nbfcs? registered with rbi|central government.*|state government.*|president of india|overseas corporate bod(?:y|ies)|"
    r"public\s*-\s*pac|independent directors?.*|firms?|societ(?:y|ies)|.*clearing corporation.*|.*employees? welfare trust.*|"
    r".*trusteeship.*|.*trustees? (?:company|co|pvt|private|ltd|limited).*)$")
_HONORIFIC = re.compile(r"^(?:mr|mrs|ms|miss|shri|smt|sri|dr|late)\.?\s+")


def holder_key(name: str) -> str:
    """One spelling of an investor's name: lower case, honorifics and punctuation dropped, company suffixes made alike."""
    s = (name or "").lower().replace("&", " and ")
    s = _HONORIFIC.sub("", s.strip())
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\bprivate\b", "pvt", s)
    s = re.sub(r"\blimited\b", "ltd", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def slug(key: str) -> str:
    return key.replace(" ", "-")


# A name that reads as a company, fund or firm rather than a person. A Hindu Undivided Family (HUF) is a family, so it stays with people.
_FIRM = re.compile(r"\b(?:ltd|limited|pvt|private|llp|pte|inc|llc|plc|corporation|corp|company|fund|funds|trust|capital|investments?|holdings?|bank|"
                   r"securities|ventures|partners|finance|financial|enterprises|industries|associates|advis[eo]rs|management|group|foundation|"
                   r"sdn bhd|bhd|gmbh|ag|sa|bv|nv|opportunities|equity|board|mauritius|master|trading|exports?|infra(?:structure)?|"
                   r"realty|properties|estates?|developers|technologies|motors|mills|commerce|credit|leasing)\b", re.I)


def kind_of(name: str) -> str:
    """"person" or "firm", from the shape of the name (an HUF counts as a person's family)."""
    n = name or ""
    return "person" if re.search(r"\bhuf\b", n, re.I) or not _FIRM.search(n) else "firm"


def is_investor(name: str) -> bool:
    n = re.sub(r"\s+", " ", (name or "").strip().lower())
    return len(re.sub(r"[^a-z]", "", n)) >= 4 and not _CATEGORY.match(n)


def display(names: Iterable[str]) -> str:
    """The spelling seen most often; an all-capitals name is shown in title case."""
    best = Counter(n.strip() for n in names if n and n.strip()).most_common(1)[0][0]
    return best.title() if best.isupper() else best


def _num(x: Any) -> Optional[float]:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v == v else None


def status_of(now: Optional[float], ago: Optional[float]) -> str:
    n, a = now or 0.0, ago or 0.0
    if n > 0 and a <= 0:
        return "new"
    if n <= 0 and a > 0:
        return "exited"
    if n - a >= MOVE:
        return "added"
    if n - a <= -MOVE:
        return "reduced"
    return "unchanged"


STATUS_WORDS = {"new": "Newly named (not in the filing a year ago)", "added": "Stake up", "reduced": "Stake down",
                "exited": "No longer named (sold, or below 1%)", "unchanged": "No change"}


def build(rows: List[dict], names: Dict[str, str], quotes: Dict[str, dict], classes: Dict[str, dict]) -> dict:
    """rows: [{symbol, as_of, holders, premium_at}]. Pure: the same input gives the same answer."""
    by: Dict[str, dict] = {}
    covered = 0
    as_ofs: Counter = Counter()
    fetched: List[str] = []
    for r in rows:
        holders = r.get("holders") or []
        if not isinstance(holders, list):
            continue
        covered += 1
        sym = str(r["symbol"]).upper()
        if r.get("as_of"):
            as_ofs[r["as_of"]] += 1
        if r.get("premium_at"):
            fetched.append(str(r["premium_at"])[:10])
        for h in holders:
            if not isinstance(h, (list, tuple)) or len(h) < 4 or h[1] != "public" or not is_investor(str(h[0] or "")):
                continue
            k = holder_key(str(h[0]))
            if not k:
                continue
            inv = by.setdefault(k, {"names": [], "stakes": {}})
            inv["names"].append(str(h[0]))
            now, ago = _num(h[2]), _num(h[3])
            prev = inv["stakes"].get(sym)
            if prev is None or (now or 0) > (prev["now"] or 0):     # the same investor named twice in one filing: the larger line
                inv["stakes"][sym] = {"now": now, "ago": ago, "asOf": r.get("as_of"), "fetched": str(r["premium_at"])[:10] if r.get("premium_at") else None}

    investors: Dict[str, dict] = {}
    for k, inv in by.items():
        current = [s for s, st in inv["stakes"].items() if (st["now"] or 0) >= MIN_STAKE]
        if len(current) < MIN_COMPANIES:
            continue
        holdings, exited = [], []
        for sym, st in inv["stakes"].items():
            q, c = quotes.get(sym) or {}, classes.get(sym) or {}
            mcap = _num(q.get("market_cap"))
            now, ago = st["now"], st["ago"]
            stt = status_of(now, ago)
            item = {"symbol": sym, "name": names.get(sym) or sym, "industry": c.get("industry"), "sector": c.get("sector"),
                    "stakeNow": now, "stakeYearAgo": ago, "changePts": None if now is None or ago is None else round(now - ago, 2),
                    "status": stt, "statusText": STATUS_WORDS[stt], "asOf": st["asOf"], "fetched": st["fetched"]}
            if stt == "exited":
                exited.append(item)
                continue
            if not now or now <= 0:
                continue
            if mcap and mcap > 0:
                item["valueCr"] = round(now / 100.0 * mcap, 2)
                item["valueWhy"] = None
            else:
                item["valueCr"] = None
                item["valueWhy"] = "No market capitalisation in today's quote list for this company."
            if not c.get("sector"):
                item["sectorWhy"] = "Not classified by NSE's sector list."
            holdings.append(item)
        total = sum(h["valueCr"] or 0 for h in holdings)
        for h in holdings:
            h["weightPct"] = round(h["valueCr"] / total * 100, 2) if total and h["valueCr"] is not None else None
        holdings.sort(key=lambda h: (-(h["valueCr"] or -1), -(h["stakeNow"] or 0), h["symbol"]))
        sectors: Dict[str, float] = defaultdict(float)
        for h in holdings:
            if h["valueCr"] is not None:
                sectors[h["sector"] or "Not classified"] += h["valueCr"]
        sector_rows = sorted(({"sector": s, "valueCr": round(v, 2), "weightPct": round(v / total * 100, 2) if total else None, "companies": sum(1 for h in holdings if (h["sector"] or "Not classified") == s)}
                              for s, v in sectors.items()), key=lambda x: -x["valueCr"])
        changes = [h for h in holdings if h["status"] != "unchanged"] + exited
        order = {"new": 0, "added": 1, "reduced": 2, "exited": 3}
        changes.sort(key=lambda h: (order[h["status"]], -abs(h["changePts"] or (h["stakeYearAgo"] or 0)), h["symbol"]))
        counts = Counter(h["status"] for h in changes)
        unvalued = sum(1 for h in holdings if h["valueCr"] is None)
        investors[slug(k)] = {
            "key": slug(k), "name": display(inv["names"]), "kind": kind_of(display(inv["names"])), "companies": len(holdings), "valueCr": round(total, 2) if total else None,
            "valueNote": None if not unvalued else f"{unvalued} holding{'s' if unvalued > 1 else ''} without a market value today, left out of the total.",
            "top": [{"symbol": h["symbol"], "name": h["name"], "weightPct": h["weightPct"]} for h in holdings[:3]],
            "changes": {s: counts.get(s, 0) for s in ("new", "added", "reduced", "exited")},
            "holdings": holdings, "sectors": sector_rows, "history": changes,
        }
    as_of = as_ofs.most_common(1)[0][0] if as_ofs else None
    fetched.sort()
    return {
        "investors": investors, "covered": covered, "asOf": as_of,
        "fetchedFrom": fetched[0] if fetched else None, "fetchedTo": fetched[-1] if fetched else None,
        "source": SOURCE, "disclaimer": DISCLAIMER, "noteNames": NOTE_NAMES,
        "rule": f"Named public shareholders (not funds, banks, insurers, promoters or the government) who hold {MIN_STAKE:g}% or more of at least {MIN_COMPANIES} listed companies today.",
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def stakes_by_name(rows: List[dict]) -> Dict[str, Dict[str, dict]]:
    """{filed-name key: {symbol: {now, ago, asOf, as_filed}}} for every named public holder, in any number of companies: a tracked investor's
    second name may be named in one company only (Vijay Kedia files once as "Vijay Kedia")."""
    out: Dict[str, Dict[str, dict]] = {}
    for r in rows:
        holders = r.get("holders") or []
        if not isinstance(holders, list):
            continue
        sym = str(r["symbol"]).upper()
        for h in holders:
            if not isinstance(h, (list, tuple)) or len(h) < 4 or h[1] != "public" or not is_investor(str(h[0] or "")):
                continue
            k = slug(holder_key(str(h[0])))
            if not k:
                continue
            now, ago = _num(h[2]), _num(h[3])
            # task #289: the holder's last 8 quarters, newest first, when the filing data carries them ([period, stake])
            qs = [[str(q[0]), _num(q[1])] for q in h[4] if isinstance(q, (list, tuple)) and len(q) >= 2 and q[0]] if len(h) > 4 and isinstance(h[4], list) else None
            prev = out.setdefault(k, {}).get(sym)
            if prev is None or (now or 0) > (prev["now"] or 0):
                out[k][sym] = {"now": now, "ago": ago, "asOf": r.get("as_of"), "as_filed": str(h[0]), "quarters": qs or None}
    return out


async def _finlit_view(app, symbols: List[str]) -> Tuple[Dict[str, dict], Dict[str, dict], Dict[str, Optional[float]]]:
    """FinLit's own view of the companies in the tracked investors' filings, from the same sources as the company report: the stored score row
    (name, market cap, 1-year move), the Prism card (label, score, short- and long-term technical words), the weekly peer label and the ISIN.
    Also the four sizes' median 1-year move over every scored company (the same-size market)."""
    from . import isin as isin_mod, prism_screen
    from .leadership import ordinal
    from .leadership_api import agreeing, public_now
    store = app.state.store
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT DISTINCT ON (symbol) symbol, name, market_cap, return_1y FROM scores ORDER BY symbol, (statement = 'consolidated') DESC")
        lead = await conn.fetch("SELECT symbol, label, raw_label, rel52, rank, ranked, group_short, group_name FROM leadership WHERE symbol = ANY($1::text[])", symbols)
        classes = {r["symbol"]: r["sector"] for r in await conn.fetch("SELECT symbol, sector FROM company_classification WHERE symbol = ANY($1::text[])", symbols)}
    every = {r["symbol"]: {"mcap": _num(r["market_cap"]), "r1": _num(r["return_1y"])} for r in rows}
    med = tracked.medians(every)
    prism = prism_screen.cards(await store.prism_cards(symbols))
    try:
        isins = await isin_mod.symbol_isins(app)
    except Exception:   # the ISIN map is a convenience for matching a member's stocks; the page works without it
        log.warning("superinvestors: ISIN map unavailable", exc_info=True)
        isins = {}
    names = {r["symbol"]: r["name"] for r in rows}
    universe: Dict[str, dict] = {}
    for s in symbols:
        e, p = every.get(s) or {}, prism.get(s) or {}
        universe[s] = {"name": names.get(s), "mcap": e.get("mcap"), "r1": e.get("r1"), "isin": isins.get(s), "sector": classes.get(s),
                       "prism_label": p.get("prism_label") or ("Not rated" if s in every else None), "prism_final": p.get("prism_final"),
                       "st": p.get("prism_st"), "lt": p.get("prism_lt")}
    leaders: Dict[str, dict] = {}
    if await public_now(store):
        words = {"leader": "Leader", "in_line": "In line", "laggard": "Laggard"}
        for r in lead:
            lab = agreeing(r["label"], r["raw_label"], r["rel52"])
            if lab in words and r["rank"] and r["ranked"]:
                leaders[r["symbol"]] = {"chip": words[lab], "text": f"{ordinal(int(r['rank']))} of {r['ranked']} {r['group_short'] or r['group_name']} peers"}
    return universe, leaders, med


def quarter_end(period: str):
    """'Sep 2026' -> 30 Sep 2026 (the last day of the quarter's month); None for a shape not understood."""
    import calendar
    from datetime import date
    y, m = tracked.period_key(period)
    if not y or not 1 <= m <= 12:
        return None
    return date(y, m, calendar.monthrange(y, m)[1])


async def _first_named_moves(app, wanted) -> Dict[Tuple[str, str], Optional[float]]:
    """{(symbol, quarter): the price move in % from that quarter's last close to the latest close}, from the stored daily prices."""
    out: Dict[Tuple[str, str], Optional[float]] = {}
    pairs = [(s, p, quarter_end(p)) for s, p in wanted]
    pairs = [x for x in pairs if x[2] is not None]
    if not pairs:
        return out
    async with app.state.store.pool.acquire() as conn:
        for s, p, d in pairs:
            row = await conn.fetchrow("SELECT (SELECT close FROM price_daily WHERE symbol = $1 AND day <= $2 ORDER BY day DESC LIMIT 1) AS then_close, "
                                      "(SELECT close FROM price_daily WHERE symbol = $1 ORDER BY day DESC LIMIT 1) AS now_close", s, d)
            a, b = (_num(row["then_close"]), _num(row["now_close"])) if row else (None, None)
            out[(s, p)] = round((b / a - 1) * 100, 1) if a and b else None
    return out


async def _load(app) -> dict:
    pool = app.state.store.pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT ON (symbol) symbol, as_of, extra->'holders' AS holders, premium_at FROM ownership_insights "
            "WHERE premium_state = 'ok' AND extra ? 'holders' ORDER BY symbol, (statement = 'consolidated') DESC")
        names = {r["symbol"]: r["name"] for r in await conn.fetch("SELECT symbol, name FROM companies")}
        quotes = {r["symbol"]: dict(r) for r in await conn.fetch("SELECT symbol, market_cap, traded_at FROM listing_quotes")}
        classes = {r["symbol"]: dict(r) for r in await conn.fetch("SELECT symbol, industry, sector FROM company_classification WHERE symbol IS NOT NULL")}
    total = await pool.fetchval("SELECT count(*) FROM companies")
    filings = [{"symbol": r["symbol"], "as_of": r["as_of"], "holders": orjson.loads(r["holders"]) if isinstance(r["holders"], (str, bytes)) else r["holders"],
                "premium_at": r["premium_at"].isoformat() if r["premium_at"] else None} for r in rows]
    out = build(filings, names, quotes, classes)
    out["companies"] = total
    # task #289: the tracked investors, each grouped with every name they file under, with FinLit's own view of each stock
    cfg = tracked.load_config()
    stakes = stakes_by_name(filings)
    mine = sorted({sym for inv in cfg for fn in inv["filed_names"] for sym in (stakes.get(fn["key"]) or {})})
    universe, leaders, med = await _finlit_view(app, mine)
    for s in mine:
        universe[s]["name"] = names.get(s) or universe[s].get("name") or s
        c = classes.get(s) or {}
        universe[s]["sector"] = c.get("sector") or universe[s].get("sector")
    qmc = {s: _num((quotes.get(s) or {}).get("market_cap")) for s in mine if s in quotes}
    out["tracked"] = tracked.build(cfg, stakes, universe, leaders, med, qmc)
    out["trackedNames"] = tracked.by_filed_name(cfg)
    # task #289: quarter-on-quarter moves once each company's quarters are stored (the nightly ownership job fills them, tracked companies first)
    held = [h for inv in out["tracked"]["investors"].values() for h in inv["holdings"] if (h["stakeNow"] or 0) > 0]
    cover = round(sum(1 for h in held if h.get("quarters")) / len(held) * 100) if held else 0
    out["quarterCover"] = cover
    if cover > 0:
        q = tracked.build(cfg, stakes, universe, leaders, med, qmc, since="quarter")
        wanted = {(h["symbol"], h["sinceFirstNamed"]["from"]) for inv in q["investors"].values() for h in inv["holdings"] if h.get("sinceFirstNamed")}
        prices = await _first_named_moves(app, wanted)
        out["trackedQ"] = tracked.build(cfg, stakes, universe, leaders, med, qmc, since="quarter", first_named=prices)
        out["tracked"] = tracked.build(cfg, stakes, universe, leaders, med, qmc, first_named=prices)
    traded = [q["traded_at"] for q in quotes.values() if q.get("traded_at")]
    out["pricesAt"] = max(traded).isoformat() if traded else None
    return out


_lock = asyncio.Lock()
_mem: Tuple[float, Optional[dict]] = (0.0, None)


async def data(app) -> dict:
    """The whole answer, kept for an hour (Redis, then this process)."""
    global _mem
    if _mem[1] is not None and time.time() - _mem[0] < CACHE_SECONDS:
        return _mem[1]
    async with _lock:
        if _mem[1] is not None and time.time() - _mem[0] < CACHE_SECONDS:
            return _mem[1]
        redis = getattr(app.state.store, "redis", None)
        raw = None
        try:
            raw = await redis.get(CACHE_KEY) if redis is not None else None
        except Exception:   # the cache is a convenience: without it the answer is built again
            raw = None
        if raw:
            out = orjson.loads(raw)
        else:
            out = await _load(app)
            try:
                if redis is not None:
                    await redis.set(CACHE_KEY, orjson.dumps(out), ex=CACHE_SECONDS)
            except Exception:
                log.warning("superinvestors: cache write failed", exc_info=True)
        _mem = (time.time(), out)
        return out


def _reply(body: Any, status: int = 200, private: bool = False) -> Response:
    cache = "private, no-store" if private else "public, max-age=600"
    return Response(content=orjson.dumps(body), status_code=status, media_type="application/json",
                    headers={"Cache-Control": cache, **({"Vary": "Cookie"} if private else {})})


def summary(d: dict) -> dict:
    marks = d.get("trackedNames") or {}
    rows = [{**{k: v for k, v in inv.items() if k not in ("holdings", "sectors", "history")}, "tracked": marks.get(inv["key"])} for inv in d["investors"].values()]
    rows.sort(key=lambda x: (-(x["valueCr"] or 0), x["name"]))
    meta = {k: d.get(k) for k in ("covered", "companies", "asOf", "fetchedFrom", "fetchedTo", "pricesAt", "source", "disclaimer", "noteNames", "rule", "builtAt")}
    why = None if rows else ("No company's named-holder details are stored yet; they are fetched overnight." if not d.get("covered")
                              else "No public shareholder is named in two or more companies in the stored filings.")
    kinds = Counter(r["kind"] for r in rows)
    return {"investors": rows, "count": len(rows), "people": kinds.get("person", 0), "firms": kinds.get("firm", 0), "emptyWhy": why, **meta}


@router.get("/api/superinvestors")
async def list_investors(request: Request) -> Response:
    return _reply(summary(await data(request.app)))


PLAN = "gold"
PLAN_DETAIL = "Superinvestor portfolios are part of the Gold plan."
META = ("asOf", "fetchedFrom", "fetchedTo", "pricesAt", "source", "disclaimer", "noteNames", "rule")
TRACKED_SOURCE = ("Tracked investors. A list kept by FinLit's editors: individuals widely followed as market investors, who are not promoters of the companies "
                  "shown. Each groups the names the investor files under, checked against the filings. FinLit Prism, technical scores and peer tags are "
                  "FinLit's own, as on each company report.")
NAMED_STAKES_NOTE = ("The 12-month price move of each stock named today, largest stakes first; the total weights each by today's value. It is not the "
                     "investor's own return: the prices and dates they paid, and stakes under 1%, are not in the filings.")


def _allowed(ctx) -> bool:
    """Gold (the top plan) and administrators; a plan named platinum counts as Gold if one is ever added."""
    return sees_all(ctx) or has(ctx.plan, PLAN) or ctx.plan == "platinum"


def _locked() -> Response:
    return _reply({"status": "plan_required", "detail": PLAN_DETAIL, "plan": PLAN}, 403, private=True)


QUARTER_READY = 90   # % of the tracked holdings with stored quarters before "Since last quarter" is the default


def _pick(d: dict, since: Optional[str]) -> Tuple[dict, str, dict]:
    """The tracked build to answer with: since last quarter when asked for and stored, or by default once QUARTER_READY% is stored; else a year ago."""
    cover = d.get("quarterCover") or 0
    has_q = d.get("trackedQ") is not None
    use = "quarter" if has_q and (since == "quarter" or (since != "year" and cover >= QUARTER_READY)) else "year"
    info = {"since": use, "sinceText": "Since last quarter" if use == "quarter" else "Since a year ago", "quarterReady": has_q and cover >= QUARTER_READY,
            "quarterAvailable": has_q, "quarterCover": cover}
    return (d["trackedQ"] if use == "quarter" else d.get("tracked") or {}), use, info


def _card(inv: dict) -> dict:
    return {k: v for k, v in inv.items() if k not in ("holdings", "moveList")}


@router.get("/api/superinvestors/tracked")
async def tracked_tab(request: Request, since: Optional[str] = None) -> Response:
    if not _allowed(await current(request)):
        return _locked()
    d = await data(request.app)
    t, use, info = _pick(d, since)
    invs = t.get("investors") or {}
    body = {"tiles": t.get("tiles"), "moveCounts": t.get("moveCounts"), "sourceErrors": t.get("sourceErrors"), "medians": t.get("medians"),
            "investors": sorted((_card(i) for i in invs.values()), key=lambda c: -(c["valueCr"] or 0)), "moves": t.get("moves") or [],
            "agree": {v: tracked.agree_view(t.get("agree") or [], v) for v in ("held", "added", "cut")},
            "allCount": {"names": len(d["investors"]), "people": sum(1 for i in d["investors"].values() if i["kind"] == "person"),
                         "firms": sum(1 for i in d["investors"].values() if i["kind"] == "firm")},
            "trackedSource": TRACKED_SOURCE, "namedStakesNote": NAMED_STAKES_NOTE, **info, **{k: d.get(k) for k in META}}
    return _reply(body, private=True)


@router.get("/api/superinvestors/name/{key}")
async def one_name(request: Request, key: str) -> Response:
    """One filed name's portfolio as the filings write it (the All named holders tab)."""
    if not _allowed(await current(request)):
        return _locked()
    d = await data(request.app)
    inv = d["investors"].get(key.lower()[:200])
    if inv is None:
        return _reply({"status": "not_found", "detail": "No investor by that name in the stored filings."}, 404, private=True)
    return _reply({**inv, "kind_of_page": "name", "tracked": (d.get("trackedNames") or {}).get(inv["key"]), **{k: d.get(k) for k in META}}, private=True)


@router.get("/api/superinvestors/{key}")
async def one_investor(request: Request, key: str, since: Optional[str] = None) -> Response:
    if not _allowed(await current(request)):
        return _locked()
    d = await data(request.app)
    k = key.lower()[:200]
    built, use, info = _pick(d, since)
    t = built.get("investors") or {}
    if k in t:      # a tracked key that matches an old name key (ashish-kacholia) takes over that address
        inv = t[k]
        return _reply({**inv, **info, "kind_of_page": "tracked", "medians": built.get("medians"), "trackedSource": TRACKED_SOURCE,
                       "namedStakesNote": NAMED_STAKES_NOTE, **{m: d.get(m) for m in META}}, private=True)
    mark = (d.get("trackedNames") or {}).get(k)
    if mark:        # an old link to a name that belongs to a tracked investor: its page now
        return _reply({"status": "moved", "to": mark["key"], "name": mark["name"]}, 200, private=True)
    inv = d["investors"].get(k)
    if inv is None:
        return _reply({"status": "not_found", "detail": "No investor by that name in the stored filings."}, 404, private=True)
    return _reply({**inv, "kind_of_page": "name", "tracked": None, **{m: d.get(m) for m in META}}, private=True)
