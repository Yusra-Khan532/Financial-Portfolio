"""Trading Lab > Order Flow > Option Pulse, Global (founder, 26 Nov 2026: "the same things we have to build for the global market").

US option open interest strike by strike for the large US index funds (SPY, QQQ, IWM, DIA) and the largest US companies, from Nasdaq's public
option chain (composite of the US option exchanges; delayed). The answer is shaped like Dhan's so the India maths is reused as it is
(options.summarize: rows, the strike nearest the price, in-the-money flags, totals, PCR and max pain), and the page draws it unchanged.

OI change: Nasdaq gives today's open interest only, so FinLit keeps each day's OI per contract (Redis, 10 days) and compares with the
previous day it holds; until a second day is kept, OI change and build-up are null with a note, never made up. One US contract is 100
shares. The founder's decision of 26 Nov 2026 (internal, invite-only Lab) covers the data; FinLit names itself in the User-Agent.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
import orjson
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, Response

from ..auth.service import Ctx
from ..options import summarize
from .access import lab_ctx
from .global_flow import NY, session_open

log = logging.getLogger("finlit.lab.global_options")
router = APIRouter()

URL = "https://api.nasdaq.com/api/quote/{sym}/option-chain"
FUNDS = [("SPY", "S&P 500 fund (SPY)"), ("QQQ", "Nasdaq 100 fund (QQQ)"), ("IWM", "Russell 2000 fund (IWM)"), ("DIA", "Dow Jones fund (DIA)")]
STOCKS = [("AAPL", "Apple"), ("NVDA", "Nvidia"), ("MSFT", "Microsoft"), ("AMZN", "Amazon"), ("GOOGL", "Alphabet"), ("META", "Meta Platforms"),
          ("TSLA", "Tesla"), ("AVGO", "Broadcom"), ("JPM", "JPMorgan Chase"), ("NFLX", "Netflix"), ("AMD", "AMD"), ("BRK.B", "Berkshire Hathaway")]
KNOWN = {k: (n, "etf") for k, n in FUNDS} | {k: (n, "stocks") for k, n in STOCKS}
WINDOW_DAYS = 70                       # expiries listed: the next ten weeks
CACHE_KEY, CACHE_TTL = "lab:gopt:chain:", 300
OI_KEY, OI_DAYS = "lab:gopt:oi:", 10
LOT = 100
LAST = re.compile(r"\$([\d,]+\.?\d*)\s*\(AS OF ([A-Z]{3}) (\d{1,2}), (\d{4})\)", re.I)
MONTHS = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}


def _num(v: Any) -> Optional[float]:
    if v in (None, "", "--", "N/A"):
        return None
    try:
        return float(str(v).replace(",", "").replace("$", ""))
    except ValueError:
        return None


def last_trade(text: Optional[str]) -> Tuple[Optional[float], Optional[date]]:
    """'LAST TRADE: $716.81 (AS OF NOV 25, 2026)' -> (716.81, 2026-11-25)."""
    m = LAST.search(text or "")
    if not m:
        return None, None
    try:
        return float(m.group(1).replace(",", "")), date(int(m.group(4)), MONTHS[m.group(2).upper()], int(m.group(3)))
    except (KeyError, ValueError):
        return None, None


def parse(body: dict) -> Tuple[Dict[str, List[dict]], Optional[float], Optional[date]]:
    """Nasdaq's rows grouped by expiry: {"2026-11-27": [row, ...]}, with the underlying's last price and its date. A header row
    ("expirygroup": "November 27, 2026") starts each expiry; the rows under it carry the strike and both sides."""
    data = (body or {}).get("data") or {}
    spot, day = last_trade(data.get("lastTrade"))
    out: Dict[str, List[dict]] = {}
    cur: Optional[str] = None
    for r in ((data.get("table") or {}).get("rows") or []):
        g = (r.get("expirygroup") or "").strip()
        if g:
            try:
                cur = datetime.strptime(g, "%B %d, %Y").date().isoformat()
            except ValueError:
                cur = None
            continue
        if cur and _num(r.get("strike")):
            out.setdefault(cur, []).append(r)
    return out, spot, day


def dhan_like(rows: List[dict], spot: Optional[float], prev_oi: Dict[str, int]) -> dict:
    """The rows as Dhan's {"last_price", "oc": {strike: {"ce": {...}, "pe": {...}}}} so options.summarize does the rest."""
    oc: Dict[str, dict] = {}
    for r in rows:
        k = _num(r.get("strike"))
        sides = {}
        for tag, key in (("c", "ce"), ("p", "pe")):
            last, chg, oi = _num(r.get(f"{tag}_Last")), _num(r.get(f"{tag}_Change")), _num(r.get(f"{tag}_Openinterest"))
            vol, bid, ask = _num(r.get(f"{tag}_Volume")), _num(r.get(f"{tag}_Bid")), _num(r.get(f"{tag}_Ask"))
            if all(v is None for v in (last, oi, vol, bid, ask)):
                continue
            prev = prev_oi.get(f"{tag}:{k:g}")
            sides[key] = {"last_price": last, "previous_close_price": round(last - chg, 2) if last is not None and chg is not None and last - chg > 0 else None,
                          "oi": int(oi) if oi is not None else None, "previous_oi": prev, "volume": int(vol) if vol is not None else None,
                          "top_bid_price": bid, "top_ask_price": ask}
        if sides:
            oc[f"{k:.6f}"] = sides
    return {"last_price": spot, "oc": oc}


def oi_map(rows: List[dict]) -> Dict[str, int]:
    out = {}
    for r in rows:
        k = _num(r.get("strike"))
        for tag in ("c", "p"):
            oi = _num(r.get(f"{tag}_Openinterest"))
            if k is not None and oi is not None:
                out[f"{tag}:{k:g}"] = int(oi)
    return out


async def _fetch(sym: str, kind: str, today: date, client: Optional[httpx.AsyncClient] = None) -> dict:
    own = client is None
    client = client or httpx.AsyncClient(timeout=30, headers={"User-Agent": "FinLit (finlitventures.com) market data", "Accept": "application/json"})
    try:
        r = await client.get(URL.format(sym=sym.replace(".", "%2F")), params={"assetclass": kind, "limit": "3000", "fromdate": today.isoformat(),
                                                                              "todate": (today + timedelta(days=WINDOW_DAYS)).isoformat(),
                                                                              "excode": "oprac", "callput": "callput", "money": "all", "type": "all"})
        return r.json() if r.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        return {}
    finally:
        if own:
            await client.aclose()


async def load(redis, sym: str, now: datetime, client: Optional[httpx.AsyncClient] = None) -> Optional[dict]:
    """The parsed chain of one underlying, kept five minutes; each expiry's OI of the trade day stored for tomorrow's change."""
    raw = None
    try:
        raw = await redis.get(CACHE_KEY + sym)
    except Exception:
        pass
    if raw:
        return orjson.loads(raw)
    name, kind = KNOWN[sym]
    groups, spot, day = parse(await _fetch(sym, kind, now.astimezone(NY).date(), client))
    if not groups:
        return None
    day = day or now.astimezone(NY).date()
    for exp, rows in groups.items():
        key = f"{OI_KEY}{sym}:{exp}:{day.isoformat()}"
        try:
            await redis.set(key, orjson.dumps(oi_map(rows)), ex=OI_DAYS * 86400)
        except Exception:
            pass
    body = {"groups": groups, "spot": spot, "day": day.isoformat(), "at": now.isoformat(timespec="seconds")}
    try:
        await redis.set(CACHE_KEY + sym, orjson.dumps(body), ex=CACHE_TTL)
    except Exception:
        pass
    return body


async def previous_oi(redis, sym: str, exp: str, day: date) -> Tuple[Dict[str, int], Optional[str]]:
    """The OI of the latest earlier day FinLit kept for this contract series (up to ten days back)."""
    for back in range(1, OI_DAYS + 1):
        d = (day - timedelta(days=back)).isoformat()
        try:
            raw = await redis.get(f"{OI_KEY}{sym}:{exp}:{d}")
        except Exception:
            raw = None
        if raw:
            return orjson.loads(raw), d
    return {}, None


def underlying(sym: str) -> dict:
    name, kind = KNOWN[sym]
    return {"key": sym, "name": name, "kind": "index" if kind == "etf" else "stock", "segment": "US", "securityId": 0, "exchange": "US"}


def _bad(status: str, detail: str, code: int = 400) -> JSONResponse:
    return JSONResponse({"detail": {"status": status, "detail": detail}}, status_code=code, headers={"Cache-Control": "no-store"})


@router.get("/api/lab/options/global/underlyings")
async def g_underlyings(request: Request, _ctx: Ctx = Depends(lab_ctx)):
    return {"indices": [underlying(k) for k, _ in FUNDS], "stocks": [{"key": k, "name": n, "securityId": 0, "lotSize": LOT} for k, n in STOCKS], "connected": True}


@router.get("/api/lab/options/global/expiries")
async def g_expiries(request: Request, u: str = Query(..., max_length=12), _ctx: Ctx = Depends(lab_ctx)):
    sym = u.strip().upper()
    if sym not in KNOWN:
        return _bad("unknown_underlying", "Choose one of the listed US funds or companies.")
    now = datetime.now(timezone.utc)
    body = await load(request.app.state.store.redis, sym, now)
    if body is None:
        return _bad("source_down", "Nasdaq's option chain did not answer; it comes back by itself.", 503)
    return {"underlying": underlying(sym), "expiries": sorted(body["groups"]), "asOf": body["at"], "state": "fresh"}


@router.get("/api/lab/options/global/chain")
async def g_chain(request: Request, u: str = Query(..., max_length=12), expiry: str = Query(..., max_length=10), _ctx: Ctx = Depends(lab_ctx)):
    sym = u.strip().upper()
    if sym not in KNOWN:
        return _bad("unknown_underlying", "Choose one of the listed US funds or companies.")
    now = datetime.now(timezone.utc)
    redis = request.app.state.store.redis
    body = await load(redis, sym, now)
    if body is None:
        return _bad("source_down", "Nasdaq's option chain did not answer; it comes back by itself.", 503)
    rows = body["groups"].get(expiry)
    if not rows:
        return _bad("unknown_expiry", "That expiry is not listed for this underlying.", 404)
    day = date.fromisoformat(body["day"])
    prev, prev_day = await previous_oi(redis, sym, expiry, day)
    s = summarize(dhan_like(rows, body["spot"], prev))
    notes = list(s["notes"])
    if not prev:
        notes.append("OI change and build-up start from the second US session FinLit reads: the previous day's open interest is kept from then on.")
    else:
        notes.append(f"OI change against {prev_day}, the previous day FinLit kept.")
    notes.append("US options from Nasdaq's public chain (delayed). One contract is 100 shares. No implied volatility in this feed.")
    out = {"underlying": underlying(sym), "expiry": expiry, "daysToExpiry": max(0, (date.fromisoformat(expiry) - now.astimezone(NY).date()).days),
           **{k: s[k] for k in ("spot", "atm", "rows", "summary", "maxPainCurve")}, "notes": notes,
           "lotSize": LOT, "lotSource": "US options: 100 shares a contract", "lotMixed": False, "asOf": body["at"],
           "ageSeconds": int((now - datetime.fromisoformat(body["at"])).total_seconds()), "state": "fresh",
           "marketOpen": session_open(now), "nextOpen": None, "refreshSeconds": CACHE_TTL}
    return Response(content=orjson.dumps(out), media_type="application/json", headers={"Cache-Control": "no-store"})
