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

GET /api/superinvestors          the list (every plan, signed in or not)
GET /api/superinvestors/{key}    one portfolio (Silver and Gold; Basic and visitors get plan_required)
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

from .auth.entitlements import has, sees_all
from .auth.service import current

log = logging.getLogger("finlit.superinvestors")
router = APIRouter()

CACHE_KEY = "superinvestors:v1"
CACHE_SECONDS = 3600
MIN_COMPANIES = 2           # named in at least this many listed companies (1% or more today) to be listed
MIN_STAKE = 1.0             # the filing names holders of 1% or more
MOVE = 0.01                 # a stake change smaller than this (percentage points) is "unchanged"
SOURCE = "Each company's shareholding filing (named public shareholders of 1% or more), via FinEdge; values at today's market capitalisation."
DISCLAIMER = "Information only, not investment advice. Holdings below 1% are not named in filings, so a portfolio here shows only stakes of 1% or more."
NOTE_NAMES = "Names are matched as the filings write them; one investor filing under two spellings, or through a company, appears separately."

# Category lines a filing lists next to named holders. They are groups of shareholders, not one investor.
_CATEGORY = re.compile(
    r"^(?:any other|others?|trusts?|clearing members?|bodies corporate|body corporate|huf|hindu undivided famil(?:y|ies)|llps?|"
    r"limited liability partnerships?|non[- ]?resident indians?(?: \(nris?\))?|nris?|foreign nationals?|foreign compan(?:y|ies)|"
    r"overseas depositor(?:y|ies).*|key managerial personnel.*|directors? and (?:their )?relatives.*|iepf|investor education.*|"
    r"unclaimed.*|suspense.*|escrow.*|employees?.*|esop.*|resident individuals?.*|individuals?.*|associate compan.*|"
    r"(?:i+|iv|v)\.? .*nominal share capital.*|.*nominal share capital.*|alternate investment funds?|"
    r"foreign portfolio investors?.*|banks?|insurance compan(?:y|ies)|mutual funds?|provident funds?.*|pension funds?.*|"
    r"nbfcs? registered with rbi|central government.*|state government.*|president of india)$")
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
            "key": slug(k), "name": display(inv["names"]), "companies": len(holdings), "valueCr": round(total, 2) if total else None,
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
    out = build([{"symbol": r["symbol"], "as_of": r["as_of"], "holders": orjson.loads(r["holders"]) if isinstance(r["holders"], (str, bytes)) else r["holders"],
                  "premium_at": r["premium_at"].isoformat() if r["premium_at"] else None} for r in rows], names, quotes, classes)
    out["companies"] = total
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
    rows = [{k: v for k, v in inv.items() if k not in ("holdings", "sectors", "history")} for inv in d["investors"].values()]
    rows.sort(key=lambda x: (-(x["valueCr"] or 0), x["name"]))
    meta = {k: d.get(k) for k in ("covered", "companies", "asOf", "fetchedFrom", "fetchedTo", "pricesAt", "source", "disclaimer", "noteNames", "rule", "builtAt")}
    why = None if rows else ("No company's named-holder details are stored yet; they are fetched overnight." if not d.get("covered")
                              else "No public shareholder is named in two or more companies in the stored filings.")
    return {"investors": rows, "count": len(rows), "emptyWhy": why, **meta}


@router.get("/api/superinvestors")
async def list_investors(request: Request) -> Response:
    return _reply(summary(await data(request.app)))


@router.get("/api/superinvestors/{key}")
async def one_investor(request: Request, key: str) -> Response:
    ctx = await current(request)
    if not sees_all(ctx) and not has(ctx.plan, "silver"):
        return _reply({"status": "plan_required", "detail": "Superinvestor portfolios are part of the Silver and Gold plans.", "plan": "silver"}, 403, private=True)
    d = await data(request.app)
    inv = d["investors"].get(key.lower()[:200])
    if inv is None:
        return _reply({"status": "not_found", "detail": "No investor by that name in the stored filings."}, 404, private=True)
    meta = {k: d.get(k) for k in ("asOf", "fetchedFrom", "fetchedTo", "pricesAt", "source", "disclaimer", "noteNames", "rule")}
    return _reply({**inv, **meta}, private=True)
