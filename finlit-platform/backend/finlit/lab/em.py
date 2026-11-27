"""Trading Lab > Global > Emerging markets (docs/GLOBAL-MARKETS.md; founder, 26 Nov 2026: "global markets or emerging markets").

India beside sixteen other emerging economies:
  * the economy, from the World Bank's open data (CC BY 4.0; annual): GDP growth, consumer-price inflation, the current account, trade as a share
    of GDP, GDP per person and in total (US dollars), and reserves in months of imports. The `global-em` job reads them once a week; for
    each country and figure the latest year with a value is kept with the year before.
  * each country's main stock index, from Yahoo Finance's chart endpoint when the page asks (kept for an hour): the latest level, the day's
    change and, where Yahoo has the year's history, the change over a year and since 1 January, in the index's own currency.

Facts only: "India's GDP grew 6.5% in 2025, the 3rd fastest of 17", never what to do. The founder's decision of 26 Nov 2026 (internal,
invite-only Lab) covers the data; FinLit names itself in the User-Agent.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from ..auth.service import Ctx
from .access import lab_ctx

log = logging.getLogger("finlit.lab.em")
router = APIRouter()

WB = "https://api.worldbank.org/v2/country/{codes}/indicator/{ind}"
YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/"
KEY = "em:wb"
INDEX_KEY, INDEX_TTL = "lab:em:index", 3600
UA = {"User-Agent": "FinLit (finlitventures.com) market data"}
# ISO3 -> (name, Yahoo symbol of the main index, index name)
COUNTRIES: Dict[str, Tuple[str, Optional[str], str]] = {
    "IND": ("India", "^NSEI", "Nifty 50"), "CHN": ("China", "000001.SS", "Shanghai Composite"), "BRA": ("Brazil", "^BVSP", "Bovespa"),
    "IDN": ("Indonesia", "^JKSE", "Jakarta Composite"), "MEX": ("Mexico", "^MXX", "IPC"), "ZAF": ("South Africa", "^J203.JO", "All Share"),
    "TUR": ("Türkiye", "XU100.IS", "BIST 100"), "SAU": ("Saudi Arabia", "^TASI.SR", "Tadawul All Share"), "KOR": ("South Korea", "^KS11", "KOSPI"),
    "VNM": ("Vietnam", "^VNINDEX.VN", "VN-Index"), "THA": ("Thailand", "^SET.BK", "SET"), "MYS": ("Malaysia", "^KLSE", "FTSE Bursa KLCI"),
    "PHL": ("Philippines", "PSEI.PS", "PSEi"), "POL": ("Poland", "WIG20.WA", "WIG20"), "CHL": ("Chile", None, "IPSA"),
    "ARG": ("Argentina", "^MERV", "Merval"), "EGY": ("Egypt", "^CASE30", "EGX 30"),
}
# key -> (World Bank indicator, label, unit)
INDICATORS: Dict[str, Tuple[str, str, str]] = {
    "growth": ("NY.GDP.MKTP.KD.ZG", "GDP growth", "%"),
    "inflation": ("FP.CPI.TOTL.ZG", "Inflation (consumer prices)", "%"),
    "currentAccount": ("BN.CAB.XOKA.GD.ZS", "Current account", "% of GDP"),
    "trade": ("NE.TRD.GNFS.ZS", "Trade", "% of GDP"),
    "gdpPerPerson": ("NY.GDP.PCAP.CD", "GDP per person", "US$"),
    "gdp": ("NY.GDP.MKTP.CD", "GDP", "US$"),
    "reserves": ("FI.RES.TOTL.MO", "Reserves", "months of imports"),
}


def latest_two(rows: List[dict]) -> Dict[str, Dict[str, list]]:
    """World Bank rows of one indicator -> {iso3: [[year, value], [year before, value]]}, latest year with a value first."""
    by: Dict[str, List[Tuple[int, float]]] = {}
    for r in rows or []:
        iso, v = r.get("countryiso3code"), r.get("value")
        if iso and isinstance(v, (int, float)):
            try:
                by.setdefault(iso, []).append((int(r["date"]), float(v)))
            except (KeyError, ValueError):
                continue
    return {iso: [[y, round(v, 4)] for y, v in sorted(vals, reverse=True)[:2]] for iso, vals in by.items()}


async def refresh(store, client: Optional[httpx.AsyncClient] = None) -> dict:
    """The `global-em` job: one World Bank call per figure for all seventeen countries (the last six years, latest kept)."""
    from ..macro import set_meta
    own = client is None
    client = client or httpx.AsyncClient(timeout=60, headers=UA, follow_redirects=True)
    out: Dict[str, Dict[str, Any]] = {}
    failed = []
    try:
        for key, (ind, _l, _u) in INDICATORS.items():
            try:
                r = await client.get(WB.format(codes=";".join(COUNTRIES), ind=ind), params={"format": "json", "mrv": 6, "per_page": 500})
                body = r.json() if r.status_code == 200 else None
                rows = body[1] if isinstance(body, list) and len(body) > 1 else None
            except (httpx.HTTPError, ValueError):
                rows = None
            if not rows:
                failed.append(key)
                continue
            for iso, pair in latest_two(rows).items():
                out.setdefault(iso, {})[key] = pair
    finally:
        if own:
            await client.aclose()
    if not out:
        return {"status": "failed", "error": "the World Bank did not answer", "failed": failed}
    async with store.pool.acquire() as conn:
        await set_meta(conn, KEY, {"countries": out, "at": datetime.now(timezone.utc).isoformat(timespec="minutes")})
    return {"status": "ok", "countries": len(out), "failed": failed}


def index_move(body: dict, today: date) -> Optional[dict]:
    """One Yahoo chart answer (range 1y): the level, the day's change, and the year's and the year-to-date change where the history allows."""
    try:
        r = body["chart"]["result"][0]
        m = r["meta"]
    except (KeyError, IndexError, TypeError):
        return None
    price = m.get("regularMarketPrice")
    if not isinstance(price, (int, float)) or price <= 0:
        return None
    ts = r.get("timestamp") or []
    closes = (((r.get("indicators") or {}).get("quote") or [{}])[0].get("close")) or []
    pts = [(datetime.fromtimestamp(t, timezone.utc).date(), c) for t, c in zip(ts, closes) if isinstance(c, (int, float))]
    at = datetime.fromtimestamp(m["regularMarketTime"], timezone.utc).date() if m.get("regularMarketTime") else (pts[-1][0] if pts else None)
    before = [c for d, c in pts if at is not None and d < at]
    prev = before[-1] if before else None          # the close of the session before the index's latest one (a weekend never skips a day)
    first = pts[0][1] if len(pts) >= 200 else None                     # a year's change only with most of a year of history
    ytd_base = next((c for d, c in reversed(pts) if d.year < today.year), None) if len(pts) >= 200 else None
    pct = lambda a, b: round((a - b) / b * 100, 2) if a and b else None  # noqa: E731
    return {"level": round(price, 2), "currency": m.get("currency"), "dayPct": pct(price, prev), "yearPct": pct(price, first), "ytdPct": pct(price, ytd_base),
            "spark": [round(c, 2) for _d, c in pts[::5]] if len(pts) >= 20 else []}


async def indices(redis, client: Optional[httpx.AsyncClient] = None, today: Optional[date] = None) -> Dict[str, Optional[dict]]:
    try:
        raw = await redis.get(INDEX_KEY)
        if raw:
            return orjson.loads(raw)
    except Exception:
        pass
    today = today or date.today()
    own = client is None
    client = client or httpx.AsyncClient(timeout=15, headers=UA)
    sem = asyncio.Semaphore(5)

    async def one(iso: str, sym: Optional[str]) -> Tuple[str, Optional[dict]]:
        if not sym:
            return iso, None
        async with sem:
            try:
                r = await client.get(YAHOO + sym, params={"range": "1y", "interval": "1d"})
                return iso, index_move(r.json(), today) if r.status_code == 200 else None
            except (httpx.HTTPError, ValueError):
                return iso, None
    try:
        got = dict(await asyncio.gather(*(one(iso, c[1]) for iso, c in COUNTRIES.items())))
    finally:
        if own:
            await client.aclose()
    try:
        await redis.set(INDEX_KEY, orjson.dumps(got), ex=INDEX_TTL if any(got.values()) else 120)
    except Exception:
        pass
    return got


def rank_of(rows: List[dict], key: str, iso: str = "IND", high_first: bool = True) -> Optional[Tuple[int, int]]:
    vals = [(r["iso3"], r[key]["value"]) for r in rows if r.get(key)]
    if not any(i == iso for i, _ in vals):
        return None
    vals.sort(key=lambda x: -x[1] if high_first else x[1])
    return [i for i, _ in vals].index(iso) + 1, len(vals)


def table(kept: Optional[dict], idx: Dict[str, Optional[dict]]) -> List[dict]:
    rows = []
    for iso, (name, sym, iname) in COUNTRIES.items():
        figs = ((kept or {}).get("countries") or {}).get(iso, {})
        row: Dict[str, Any] = {"iso3": iso, "name": name, "index": {"name": iname, "symbol": sym, **(idx.get(iso) or {})} if idx.get(iso) else {"name": iname, "symbol": sym}}
        for key in INDICATORS:
            pair = figs.get(key)
            if pair:
                row[key] = {"year": pair[0][0], "value": pair[0][1], "prev": pair[1][1] if len(pair) > 1 else None, "prevYear": pair[1][0] if len(pair) > 1 else None}
        rows.append(row)
    return rows


@router.get("/api/lab/em")
async def emerging(request: Request, _ctx: Ctx = Depends(lab_ctx)):
    from ..macro import get_meta
    async with request.app.state.store.pool.acquire() as conn:
        kept = await get_meta(conn, KEY)
    idx = await indices(request.app.state.store.redis)
    rows = table(kept, idx)
    notes = []
    if not kept:
        notes.append("The World Bank figures load once a week; the first load has not run yet.")
    ranks = {k: rank_of(rows, k) for k in ("growth", "gdpPerPerson", "reserves")}
    body = {"countries": rows, "indicators": {k: {"label": v[1], "unit": v[2]} for k, v in INDICATORS.items()},
            "india": {k: v for k, v in ranks.items() if v}, "at": (kept or {}).get("at"), "notes": notes,
            "source": "World Bank open data (CC BY 4.0); stock indices from Yahoo Finance"}
    return Response(content=orjson.dumps(body), media_type="application/json", headers={"Cache-Control": "no-store"})
