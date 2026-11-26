"""Trading Lab > Order Flow, Global (docs/GLOBAL-MARKETS.md; founder, 26 Nov 2026: "the same things we have to build for the global market ...
a switching option of global with a single button").

The US market as the India pages show NSE's F&O stocks: the largest US-listed companies, each with its price, change and volume, and the
day's path of every one, from one public Nasdaq screener call (all US-listed shares, with sector and industry) every five minutes in the US
session (09:30 to 16:00 New York time, about 20:00 to 02:30 IST in winter; plus one closing snapshot). The answer has the same shape as
/api/lab/flow, so Market depth and the Flow board draw it unchanged; what the US data does not have (futures open interest, so no build-up;
the previous day's high and low, so no pivots) is null with a note, never made up.

The founder's decision of 26 Nov 2026 (internal, invite-only Lab) covers the data; FinLit names itself in the User-Agent.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import httpx
import orjson
from fastapi import APIRouter, Depends, Request

from ..auth.service import Ctx
from ..dhan import IST
from .access import lab_ctx
from .flow import lines, money, rank, summarize

log = logging.getLogger("finlit.lab.global_flow")
router = APIRouter()

NY = ZoneInfo("America/New_York")
SCREENER = "https://api.nasdaq.com/api/screener/stocks"
LATEST_KEY = "lab:gflow:latest"
SERIES_KEY = "lab:gflow:series:"          # + US trade day: [HH:MM IST, {symbol: [change %, null, price, volume]}], as the India engine
SERIES_TTL = 4 * 86400
TOP = 500                                 # the largest US companies by market value (about the S&P 500's size)
OPEN, CLOSE = time(9, 25), time(16, 5)    # New York time; the closing snapshot is taken up to 16:05
MILLION = 1e6
NOTE = ("US data: no futures open interest for single shares, so no build-up; no previous-day high and low in this feed, so no pivots. "
        "Prices are US dollars from Nasdaq's public screener.")
SUFFIX = re.compile(r"\s+(Common Stock|Class [A-C] Common Stock|Ordinary Shares|American Depositary Shares|Common Shares)\b.*$", re.I)


def session_open(now: datetime) -> bool:
    t = now.astimezone(NY)
    return t.weekday() < 5 and OPEN <= t.time() <= CLOSE


def _num(v: Any) -> Optional[float]:
    if v in (None, "", "NA", "--"):
        return None
    try:
        return float(str(v).replace("$", "").replace(",", "").replace("%", "").strip())
    except ValueError:
        return None


def clean_name(name: str) -> str:
    return SUFFIX.sub("", (name or "").strip()).strip() or name


def rows_from_screener(body: dict, top: int = TOP) -> List[dict]:
    """The largest `top` US-listed companies with a price and a sector, as Order Flow stock rows (largest first)."""
    raw = ((body or {}).get("data") or {}).get("rows") or []
    out = []
    for r in raw:
        price, cap, chg = _num(r.get("lastsale")), _num(r.get("marketCap")), _num(r.get("netchange"))
        sym = (r.get("symbol") or "").strip().upper()
        if not sym or not price or price <= 0 or not cap or not (r.get("sector") or "").strip() or "^" in sym or "/" in sym:
            continue
        prev = round(price - chg, 4) if chg is not None else None
        pctv = _num(r.get("pctchange"))
        if pctv is None and prev:
            pctv = round(chg / prev * 100, 2)
        vol = _num(r.get("volume"))
        out.append({"symbol": sym, "name": clean_name(r.get("name") or sym), "sector": r["sector"].strip(), "industry": (r.get("industry") or "").strip() or None,
                    "lot": None, "price": round(price, 2), "previousClose": prev if prev and prev > 0 else None, "change": chg,
                    "changePct": pctv, "open": None, "high": None, "low": None, "volume": int(vol) if vol else None, "marketCap": cap,
                    "vwap": None, "vwapGapPct": None, "oi": None, "oiChange": None, "oiChangePct": None, "buildup": None,
                    "direction": 1 if (pctv or 0) > 0 else -1 if (pctv or 0) < 0 else 0, "pivots": None, "pivotsFrom": None, "zone": None,
                    "agreement": {"score": 0, "of": 0, "facts": {}}, "asOf": None, "notes": []})
    out.sort(key=lambda s: -s["marketCap"])
    return out[:top]


async def refresh(store, client: Optional[httpx.AsyncClient] = None, now: Optional[datetime] = None, force: bool = False) -> dict:
    """The `global-flow` job: one screener call when the US session is open (or `force`); the snapshot and one point of the day's series."""
    now = now or datetime.now(timezone.utc)
    if not force and not session_open(now):
        return {"status": "ok", "skipped": "the US market is closed"}
    own = client is None
    client = client or httpx.AsyncClient(timeout=60, headers={"User-Agent": "FinLit (finlitventures.com) market data", "Accept": "application/json"})
    try:
        r = await client.get(SCREENER, params={"tableonly": "true", "limit": "25", "download": "true"})
        body = r.json() if r.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        body = {}
    finally:
        if own:
            await client.aclose()
    rows = rows_from_screener(body)
    if not rows:
        return {"status": "failed", "error": "the Nasdaq screener did not answer"}
    redis = store.redis
    if not force:
        # a US holiday (or a stalled feed): the screener repeats the last session. Nothing traded since the last snapshot = no new snapshot.
        prev_raw = await redis.get(LATEST_KEY)
        if prev_raw:
            prev = {r["symbol"]: (r["price"], r["volume"]) for r in orjson.loads(prev_raw)["stocks"]}
            if prev and all(prev.get(r["symbol"]) == (r["price"], r["volume"]) for r in rows[:50]):
                return {"status": "ok", "skipped": "no trading since the last snapshot (a US holiday or a stalled feed)"}
    rows = rank(rows)
    day = now.astimezone(NY).date()
    stamp = now.astimezone(IST).strftime("%H:%M")
    snap = {"market": "us", "currency": "USD", "tradeDay": day.isoformat(), "takenAt": now.astimezone(IST).isoformat(timespec="seconds"),
            "summary": summarize(rows), "stocks": rows, "notes": [NOTE]}
    point = [stamp, {s["symbol"]: [s["changePct"], None, s["price"], s["volume"]] for s in rows}]
    await redis.set(LATEST_KEY, orjson.dumps(snap))
    key = SERIES_KEY + day.isoformat()
    last = await redis.lrange(key, -1, -1)
    if last and orjson.loads(last[0])[0] == stamp:
        await redis.rpop(key)
    await redis.rpush(key, orjson.dumps(point))
    await redis.expire(key, SERIES_TTL)
    return {"status": "ok", "stocks": len(rows), "tradeDay": day.isoformat(), "at": stamp}


@router.get("/api/lab/flow/global")
async def global_flow(request: Request, ctx: Ctx = Depends(lab_ctx)) -> Dict[str, Any]:
    redis = request.app.state.store.redis
    raw = await redis.get(LATEST_KEY)
    if not raw:
        return {"ready": False, "reason": "The first US snapshot is taken in the next US session (every five minutes, about 20:00 to 02:30 IST, weekdays)."}
    snap = orjson.loads(raw)
    pts = [orjson.loads(p) for p in await redis.lrange(SERIES_KEY + snap["tradeDay"], 0, -1)]
    return {"ready": True, **snap, "lines": lines(pts)}


@router.get("/api/lab/flow/global/money")
async def global_money(request: Request, ctx: Ctx = Depends(lab_ctx)) -> Dict[str, Any]:
    """Money Flow for the US: the same tick rule as India, in US$ million."""
    redis = request.app.state.store.redis
    raw = await redis.get(LATEST_KEY)
    if not raw:
        return {"ready": False, "reason": "Money Flow needs two US snapshots; the first is taken in the next US session."}
    snap = orjson.loads(raw)
    pts = [orjson.loads(p) for p in await redis.lrange(SERIES_KEY + snap["tradeDay"], 0, -1)]
    sector_of = {s["symbol"]: s["sector"] for s in snap["stocks"]}
    m = money(pts, sector_of, unit=MILLION)
    if m["steps"] < 1 or not m["stocks"]:
        return {"ready": False, "reason": "Money Flow needs two US snapshots with traded volume; it fills in within the next few minutes of the US session."}
    return {"ready": True, "market": "us", "currency": "USD", "unit": "US$ million", "tradeDay": snap["tradeDay"], "takenAt": snap["takenAt"], **m}
