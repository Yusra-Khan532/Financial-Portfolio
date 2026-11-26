"""Trading Lab, RSI heatmap (docs/TRADING-LAB.md "RSI heatmap").

For every NSE F&O stock, the 14-bar Relative Strength Index on four timeframes, worked out by Wilder's formula
(analytics.indicators.rsi, the one the company report's technicals use):

    change     close of a bar minus the close of the bar before it
    AG, AL     the average gain and average loss: the plain mean of the first 14 changes, then AG = (AG * 13 + gain) / 14 and the
               same for AL, bar by bar (Wilder's smoothing)
    RSI        100 - 100 / (1 + AG / AL); 100 when AL is 0

  * 5m    Dhan's 5-minute candles (only the closes are kept: Redis lab:rsi:c5:{SYMBOL}, about 30 calendar days).
  * 15m   the same candles grouped into 15-minute bars from 09:15 IST (09:15, 09:30, ... 15:15); a bar's close is its last 5-minute close.
  * 1h    grouped into hourly bars from 09:15 IST: 09:15, 10:15, ... 14:15 and a short last bar 15:15 to 15:30 (NSE's session is 6 h 15 min).
  * 1D    the daily closes in FinLit's price_daily, with today's latest price as today's close until today's daily row is stored (a day is
          never counted twice). No Dhan call.

A value needs at least 50 bars (so Wilder's smoothing has settled); with fewer it is null and the reason says how many there are. The
latest bar may still be forming (the 5-minute, 15-minute or hourly bar not yet over, or today's daily close); that is flagged, never hidden.

Bands are descriptive names for where the value sits, nothing more: 30 or less "oversold band", above 30 and below 40 "weak", 40 to 60
"middle", above 60 and below 70 "strong", 70 or more "overbought band". RSI is a fixed formula on past closes; it is not a forecast.

Job `lab-rsi` (command `refresh-lab-rsi --max-minutes 6`): every 15 minutes in market hours plus a closing pass. The first fill of a stock
asks Dhan for 30 calendar days of 5-minute candles in one call; later runs ask only from the last stored bar and merge (no duplicates,
trimmed to 30 days). Every call takes a slot of the shared Dhan Data API pacer (intraday.slot) with share=True: a second's slot only when
no other call has used that second, so visitors keep the headroom. The run stops starting calls at its deadline; stocks not reached keep
their stored candles. The grid is then built from what is stored (lab:rsi:latest).
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from datetime import time as dtime
from typing import Any, Dict, List, Optional, Sequence, Tuple

import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from ..analytics.indicators import rsi as wilder_rsi
from ..auth.service import Ctx
from ..dhan import IST, DhanError
from ..options import TEST_SYMBOL
from .access import lab_ctx

log = logging.getLogger("finlit.lab.rsi")
router = APIRouter()

PERIOD = 14
MIN_BARS = 50
KEEP_DAYS = 30
TIMEFRAMES = ("5m", "15m", "1h", "1D")
MINUTES = {"5m": 5, "15m": 15, "1h": 60}
C5_KEY = "lab:rsi:c5:"                  # + symbol: {"f": epoch fetched, "c": [[bar start epoch, close], ...]} oldest first
C5_TTL = 3 * 86400
LATEST_KEY = "lab:rsi:latest"
LATEST_TTL = 7 * 86400
OPEN_MIN = 9 * 60 + 15                  # 09:15 IST
CLOSE_MIN = 15 * 60 + 30                # 15:30 IST
LAST_BAR_MIN = CLOSE_MIN - 5            # the session's last 5-minute bar starts at 15:25
SETTLED_MIN = CLOSE_MIN + 5             # a fetch from 15:35 on has the session's last bar complete
DAILY_KEEP = 300                        # daily closes per stock read for the 1D value
NO_STORE = {"Cache-Control": "no-store"}
STALE_OPEN_S = 30 * 60                  # in market hours the grid is due every 15 minutes
STALE_CLOSED_S = 80 * 3600              # outside them the last session's grid is current until the next session (a weekend included)
NOTE = "RSI is a fixed formula on past closes; it is not a forecast."

BANDS: Tuple[dict, ...] = (
    {"key": "oversold", "label": "oversold band", "from": None, "to": 30},
    {"key": "weak", "label": "weak", "from": 30, "to": 40},
    {"key": "middle", "label": "middle", "from": 40, "to": 60},
    {"key": "strong", "label": "strong", "from": 60, "to": 70},
    {"key": "overbought", "label": "overbought band", "from": 70, "to": None},
)
BAND_LABEL = {b["key"]: b["label"] for b in BANDS}


# ------------------------------------------------------------------------------------------------------------------ pure calculations

def band(v: Optional[float]) -> Optional[str]:
    """The band key of an RSI value: oversold (<= 30), weak (30-40), middle (40-60, both ends included), strong (60-70), overbought (>= 70)."""
    if v is None:
        return None
    if v <= 30:
        return "oversold"
    if v < 40:
        return "weak"
    if v <= 60:
        return "middle"
    if v < 70:
        return "strong"
    return "overbought"


def value(closes: Sequence[float]) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    """(latest RSI, the one before it, why it is null) for a series of closes, oldest first."""
    n = len(closes)
    if n < MIN_BARS:
        return None, None, f"{n} bar{'' if n == 1 else 's'} stored; RSI({PERIOD}) is shown from {MIN_BARS} bars."
    out = wilder_rsi(list(closes), PERIOD)
    last, prev = out[-1], out[-2]
    return (round(last, 1) if last is not None else None), (round(prev, 1) if prev is not None else None), None


def _minute(ts: int) -> Tuple[date, int]:
    t = datetime.fromtimestamp(ts, IST)
    return t.date(), t.hour * 60 + t.minute


def _at(d: date, minute: int) -> int:
    return int(datetime.combine(d, dtime(minute // 60, minute % 60), tzinfo=IST).timestamp())


def resample(c5: Sequence[Sequence[float]], minutes: int) -> List[Tuple[int, float, int]]:
    """5-minute [start, close] pairs as bars of `minutes` from 09:15 IST: [(bar start, close, bar end)], oldest first. A bar's close is the
    last 5-minute close inside it; the last bar of a day ends at 15:30 (the hourly 15:15 bar is 15 minutes long). Bars outside 09:15 to 15:30 are left out."""
    bars: Dict[Tuple[date, int], Tuple[int, float]] = {}
    for ts, close in c5:
        d, m = _minute(int(ts))
        if m < OPEN_MIN or m >= CLOSE_MIN:
            continue
        k = (d, (m - OPEN_MIN) // minutes)
        prev = bars.get(k)
        if prev is None or int(ts) >= prev[0]:
            bars[k] = (int(ts), float(close))
    out = []
    for (d, b) in sorted(bars):
        start = OPEN_MIN + b * minutes
        out.append((_at(d, start), bars[(d, b)][1], _at(d, min(start + minutes, CLOSE_MIN))))
    return out


def merge(old: Sequence[Sequence[float]], new: Sequence[Sequence[float]], now_ts: int) -> List[List[float]]:
    """Stored and newly fetched [start, close] pairs as one series: a bar fetched again replaces the stored one (it may have been forming),
    no duplicates, oldest first, nothing older than 30 days."""
    by: Dict[int, float] = {int(t): float(c) for t, c in old}
    for t, c in new:
        by[int(t)] = float(c)
    cut = now_ts - KEEP_DAYS * 86400
    return [[t, by[t]] for t in sorted(by) if t >= cut]


def daily_closes(rows: Sequence[Tuple[date, float]], session: Optional[date], price: Optional[float]) -> Tuple[List[float], bool, Optional[date]]:
    """The 1D closes: price_daily's closes, plus `price` as the close of `session` (the day of the latest 5-minute bar) when price_daily has
    no row for that day yet. (closes, whether the last one is that added price, the last day)."""
    rows = sorted(rows)
    closes = [float(c) for _, c in rows]
    last = rows[-1][0] if rows else None
    if session is not None and price is not None and (last is None or session > last):
        return closes + [float(price)], True, session
    return closes, False, last


def stock_row(meta: dict, stored: Optional[dict], daily: Sequence[Tuple[date, float]], now: datetime) -> dict:
    """One stock's line of the grid. `meta` {sym, name, sector}; `stored` the Redis candles {"f", "c"}; `daily` [(day, close)] from price_daily."""
    now_ts = int(now.timestamp())
    c5 = (stored or {}).get("c") or []
    row: Dict[str, Any] = {"sym": meta["sym"], "name": meta.get("name") or meta["sym"], "sector": meta.get("sector") or "Other",
                           "price": None, "rsi": {}, "prev": {}, "band": {}, "bars": {}, "forming": {}, "barAt": {}, "reason": {}, "lastBar": None}
    for tf, mins in MINUTES.items():
        bars = resample(c5, mins)
        v, p, why = value([b[1] for b in bars])
        if not c5:
            why = "No 5-minute candles stored yet; they fill in on the next run in market hours."
        row["rsi"][tf], row["prev"][tf], row["band"][tf], row["bars"][tf] = v, p, band(v), len(bars)
        row["forming"][tf] = bool(bars) and bars[-1][2] > now_ts
        row["barAt"][tf] = datetime.fromtimestamp(bars[-1][0], IST).isoformat() if bars else None
        if why:
            row["reason"][tf] = why
    last5 = resample(c5, 5)
    if last5:
        row["lastBar"] = datetime.fromtimestamp(last5[-1][0], IST).isoformat()
        row["price"] = round(last5[-1][1], 2)
    session = datetime.fromtimestamp(last5[-1][0], IST).date() if last5 else None
    closes, added, day = daily_closes(daily, session, row["price"])
    if row["price"] is None and closes:
        row["price"] = round(closes[-1], 2)
    v, p, why = value(closes)
    row["rsi"]["1D"], row["prev"]["1D"], row["band"]["1D"], row["bars"]["1D"] = v, p, band(v), len(closes)
    row["forming"]["1D"] = added and now_ts < _at(session, CLOSE_MIN) if session else False
    row["barAt"]["1D"] = day.isoformat() if day else None
    if why:
        row["reason"]["1D"] = why if closes else "No daily closes stored for this stock."
    return row


def grid(rows: List[dict], now: datetime) -> dict:
    """The whole heatmap: every stock (by symbol), each sector's average per timeframe, and how many stocks sit in each band per timeframe."""
    rows = sorted(rows, key=lambda r: r["sym"])
    by_sector: Dict[str, List[dict]] = defaultdict(list)
    for r in rows:
        by_sector[r["sector"] or "Other"].append(r)
    sectors = []
    for name in sorted(by_sector):
        g = by_sector[name]
        avg, counted = {}, {}
        for tf in TIMEFRAMES:
            vals = [r["rsi"][tf] for r in g if r["rsi"].get(tf) is not None]
            avg[tf] = round(sum(vals) / len(vals), 1) if vals else None
            counted[tf] = len(vals)
        sectors.append({"sector": name, "stocks": len(g), "avg": avg, "band": {tf: band(avg[tf]) for tf in TIMEFRAMES}, "counted": counted})
    counts = {}
    for tf in TIMEFRAMES:
        c = {b["key"]: 0 for b in BANDS}
        c["none"] = 0
        for r in rows:
            c[r["band"].get(tf) or "none"] += 1
        counts[tf] = c
    return {"takenAt": now.astimezone(IST).isoformat(timespec="seconds"), "period": PERIOD, "minBars": MIN_BARS, "timeframes": list(TIMEFRAMES),
            "bands": list(BANDS), "stocks": rows, "sectors": sectors, "counts": counts, "note": NOTE}


def settled(stored: Optional[dict], now: datetime) -> bool:
    """True when the stored candles already end with a session's last bar, fetched after that session closed, and no session has opened since:
    asking Dhan again would bring nothing new (the 09:00 run and the runs after the closing pass make no call)."""
    c = (stored or {}).get("c") or []
    if not c:
        return False
    d, m = _minute(int(c[-1][0]))
    if m < LAST_BAR_MIN or int(stored.get("f") or 0) < _at(d, SETTLED_MIN):
        return False
    nxt = d + timedelta(days=1)
    while nxt.weekday() >= 5:
        nxt += timedelta(days=1)
    return now.timestamp() < _at(nxt, OPEN_MIN)


def fetch_from(stored: Optional[dict], now: datetime) -> datetime:
    """Where the Dhan call starts: the last stored bar (asked again: it may have been forming), or 30 calendar days back for a first fill."""
    c = (stored or {}).get("c") or []
    if c:
        return datetime.fromtimestamp(int(c[-1][0]), IST)
    return datetime.combine(now.astimezone(IST).date() - timedelta(days=KEEP_DAYS), dtime(0, 0), tzinfo=IST)


# ------------------------------------------------------------------------------------------------------------------ the job

async def _universe(store) -> Dict[str, dict]:
    """Every F&O share: its Dhan id, FinLit company symbol (for price_daily), name and sector (as lab.flow._universe reads them)."""
    async with store.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT ON (d.symbol) d.symbol, d.security_id, c.symbol AS company, COALESCE(c.name, d.name) AS name, c.sector "
            "FROM dhan_instruments d LEFT JOIN companies c ON c.nse_code = d.symbol AND c.nse_code <> '' "
            "WHERE d.exch = 'NSE' AND d.fno ORDER BY d.symbol, c.symbol")
    return {r["symbol"]: {"sym": r["symbol"], "security_id": r["security_id"], "company": r["company"], "name": r["name"], "sector": r["sector"]}
            for r in rows if (r["security_id"] or "").isdigit() and not TEST_SYMBOL.match(r["symbol"])}


async def _daily(store, companies: List[str], today: date) -> Dict[str, List[Tuple[date, float]]]:
    """The latest daily closes of each company in price_daily (at most DAILY_KEEP, oldest first)."""
    if not companies:
        return {}
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT symbol, day, close FROM price_daily WHERE symbol = ANY($1) AND day > $2 AND day <= $3 ORDER BY symbol, day",
                                companies, today - timedelta(days=DAILY_KEEP * 7 // 5 + 30), today)
    out: Dict[str, List[Tuple[date, float]]] = defaultdict(list)
    for r in rows:
        out[r["symbol"]].append((r["day"], float(r["close"])))
    return {k: v[-DAILY_KEEP:] for k, v in out.items()}


async def _load(redis, syms: List[str]) -> Dict[str, dict]:
    if not syms:
        return {}
    raw = await redis.mget([C5_KEY + s for s in syms])
    out = {}
    for s, v in zip(syms, raw):
        if v:
            try:
                out[s] = orjson.loads(v)
            except orjson.JSONDecodeError:
                continue
    return out


async def build(store, universe: Dict[str, dict], stored: Dict[str, dict], now: datetime) -> dict:
    daily = await _daily(store, sorted({u["company"] for u in universe.values() if u.get("company")}), now.astimezone(IST).date())
    rows = [stock_row(u, stored.get(sym), daily.get(u.get("company") or "", []), now) for sym, u in universe.items()]
    return grid(rows, now)


async def refresh(store, client, now: Optional[datetime] = None, max_minutes: float = 6.0, clock=time.monotonic) -> dict:
    """One run: fetch new 5-minute candles stock by stock (least recently fetched first) until the deadline, then rebuild and store the grid."""
    from .. import intraday
    fixed = now is not None                  # tests pass the time; a real run reads the clock before each call
    now = now or datetime.now(IST)
    deadline = clock() + max_minutes * 60
    redis = store.redis
    universe = await _universe(store)
    if not universe:
        return {"status": "failed", "error": "no F&O shares in the instrument table (refresh-instruments has not run)"}
    stored = await _load(redis, list(universe))
    order = sorted(universe, key=lambda s: (int((stored.get(s) or {}).get("f") or 0), s))
    fetched = settled_n = busy = failed = 0
    stopped = None
    for sym in order:
        if clock() > deadline:
            stopped = "deadline"
            break
        st = stored.get(sym)
        if settled(st, now):
            settled_n += 1
            continue
        why = await intraday.slot(redis, share=True)
        if why == "budget":
            stopped = "budget"
            break
        if why:
            busy += 1
            continue
        at = now if fixed else datetime.now(IST)
        try:
            got = await client.intraday(universe[sym]["security_id"], "NSE_EQ", 5, fetch_from(st, at), at.replace(microsecond=0))
        except DhanError as e:
            log.info("lab-rsi: %s: %s", sym, e)
            failed += 1
            continue
        new = [[int(c["at"].timestamp()), float(c["close"])] for c in got if c.get("close") is not None]
        rec = {"f": int(at.timestamp()), "c": merge((st or {}).get("c") or [], new, int(at.timestamp()))}
        await redis.set(C5_KEY + sym, orjson.dumps(rec), ex=C5_TTL)
        stored[sym] = rec
        fetched += 1
    left = len(order) - fetched - settled_n - busy - failed
    snap = await build(store, universe, stored, now if fixed else datetime.now(IST))
    await redis.set(LATEST_KEY, orjson.dumps(snap), ex=LATEST_TTL)
    attempted = fetched + failed
    status = "failed" if attempted and not fetched else "ok"
    return {"status": status, "stocks": len(universe), "fetched": fetched, "settled": settled_n, "busy": busy, "failed": failed, "left": left,
            "stopped": stopped, "with5m": sum(1 for r in snap["stocks"] if r["rsi"]["5m"] is not None),
            "with1D": sum(1 for r in snap["stocks"] if r["rsi"]["1D"] is not None)}


# ------------------------------------------------------------------------------------------------------------------ API

def is_stale(taken_at: str, now: datetime) -> bool:
    from .. import intraday
    age = (now - datetime.fromisoformat(taken_at)).total_seconds()
    return age > (STALE_OPEN_S if intraday.phase(now) == "open" else STALE_CLOSED_S)


@router.get("/api/lab/rsi")
async def rsi_heatmap(request: Request, _ctx: Ctx = Depends(lab_ctx)):
    """The latest RSI grid of every F&O stock (5m, 15m, 1h, 1D), with when it was worked out and whether that is older than it should be."""
    raw = await request.app.state.store.redis.get(LATEST_KEY)
    if not raw:
        out: Dict[str, Any] = {"ready": False, "asOf": None, "stale": False, "note": NOTE,
                               "reason": "The first RSI grid is worked out in the next market session (every 15 minutes, 09:15 to 15:30 IST, weekdays)."}
    else:
        snap = orjson.loads(raw)
        out = {"ready": True, **snap, "asOf": snap["takenAt"], "stale": is_stale(snap["takenAt"], datetime.now(IST))}
    return Response(content=orjson.dumps(out), media_type="application/json", headers=NO_STORE)
