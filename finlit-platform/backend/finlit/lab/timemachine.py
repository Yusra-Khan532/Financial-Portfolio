"""Trading Lab, Time Machine (docs/TRADING-LAB.md "Time Machine"): a member's plan for one NSE F&O share on one day, replayed on the share's own
past 5-minute bars.

    POST /api/lab/timemachine    {symbol, date, start?, flatBy, price, lower, upper}

The plan: the share, the date D, the start time t0 (09:15 when left out), the start price P, a lower level L and an upper level U, and the time F by
which the plan is flat. Nothing on or after D is read (no look-ahead).

Past sessions (the sample): the stored sessions (candles_5m, lab/candles5m.py) strictly before D with at least 70 of their 75 bars, the latest 60.
A missing bar is drawn flat at the close before it. A session that opened more than 25% away from the close of the stored session before it (a split,
a bonus or another corporate action) is left out, and the count is reported. Fewer than 20 sessions: no replay ("no_history").

Each bar's move, from the close before it (the first bar of a session: from its own open):
    r = ln(close / base)    h = ln(high / base)    l = ln(low / base)
Replays (10,000): a stratified block bootstrap by time of day. A replay walks the slots from t0 to F in blocks of 6 slots (30 minutes); each block is
copied from one past session picked at random, at the same slots. The close path is P * exp(cumsum r); a bar's high and low are the close before it
times e^h and e^l. First touch: the first bar whose high reaches U or whose low reaches L; both in the same bar is "both in one bar (order unknown)";
neither by F is "neither". Out: the count of each, the price at F as a 40-bin histogram (the path continues after a touch), the 5th, 25th, 50th, 75th
and 95th percentile of the price after each bar (the fan), and the median number of bars to the first touch.

Exact replay: the same rule on every past session in the sample, starting at that session's open at t0 with the levels at the same % gaps; each
session's outcome, touch time and % change at F, with the totals.

Seed: int(sha256(canonical rounded plan + method version + time of the last bar used)[:16], 16) for numpy's default_rng, so the same plan on the same
stored candles always gives the same answer. Results are kept in Redis (lab:tm:{hash}) for 24 hours. The work runs in a thread, one at a time per
process; numpy is imported only when a replay runs. Describes how the share moved in the past; never a forecast or a recommendation.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError

from ..auth.routes import ip_of
from ..auth.service import Ctx
from ..dhan import IST
from .access import lab_ctx

log = logging.getLogger("finlit.lab.timemachine")
router = APIRouter()

VERSION = "tm-1"
REPLAYS = 10_000
BLOCK = 6                                   # slots per block: 30 minutes
SLOTS = 75                                  # 09:15 ... 15:25 bar starts
OPEN_MIN = 9 * 60 + 15
CLOSE_MIN = 15 * 60 + 30
MIN_BARS = 70                               # a session counts with at least 70 of its 75 bars
MIN_SESSIONS = 20
MAX_SESSIONS = 60
GAP_LIMIT = 0.25                            # an open more than 25% from the close before it: a corporate action
BINS = 40
TICK = 0.05
LEVEL_MIN, LEVEL_MAX = 0.1, 20.0            # % from the start price
AHEAD_DAYS = 7
CACHE_KEY = "lab:tm:"
CACHE_TTL = 24 * 3600
WAIT_S = 5.0
PER_MINUTE, PER_HOUR = 6, 30
NO_STORE = {"Cache-Control": "no-store"}
SYMBOL = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
HM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
OUTCOMES = ("upper", "lower", "both", "neither")

NOTE = "Describes how the stock moved in the past; not a forecast or a recommendation."
FILL_NOTE = "The 60-session store fills after the close each weekday."
METHOD = ("Each replay walks the 5-minute bars from the start time to the flat-by time in blocks of 30 minutes. Each block is copied, bar by bar, from "
          "one past session picked at random, at the same time of day. A bar's move is the change of its close, high and low from the close before it "
          "(the first bar of a session: from its own open), applied to the start price. A level counts as reached when a bar's high reaches the upper "
          "level or its low reaches the lower level; when one bar reaches both, the order inside that bar is unknown. The price at the flat-by time is "
          "where the replay stands then, whether or not a level was reached. Past sessions: the latest 60 sessions before the chosen date with at least "
          "70 of their 75 bars; a missing bar is drawn flat; a session that opened more than 25% away from the close before it (a split, a bonus or "
          "another corporate action) is left out. The same plan on the same stored candles gives the same seed and the same result.")


def labels(flat_by: str) -> Dict[str, str]:
    return {"upper": "Upper level first", "lower": "Lower level first", "both": "Both in one bar (order unknown)", "neither": f"Neither by {flat_by}"}


# ------------------------------------------------------------------------------------------------------------------ the plan

@dataclass(frozen=True)
class Plan:
    symbol: str
    day: date
    t0: int                                 # minutes after midnight, IST
    flat: int
    price: float
    lower: float
    upper: float

    @property
    def s0(self) -> int:
        return (self.t0 - OPEN_MIN) // 5

    @property
    def s1(self) -> int:
        return (self.flat - OPEN_MIN) // 5

    def canonical(self) -> Dict[str, Any]:
        return {"symbol": self.symbol, "date": self.day.isoformat(), "start": hm(self.t0), "flatBy": hm(self.flat),
                "price": round(self.price, 2), "lower": round(self.lower, 2), "upper": round(self.upper, 2)}


class PlanIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=24)
    date: str = Field(min_length=10, max_length=10)
    start: Optional[str] = Field(default=None, max_length=5)
    flatBy: str = Field(min_length=5, max_length=5)
    price: float
    lower: float
    upper: float


class Invalid(Exception):
    def __init__(self, field: str, detail: str):
        super().__init__(detail)
        self.field, self.detail = field, detail


def hm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def tick(x: float) -> float:
    """To the exchange's price step of 0.05."""
    return round(round(x / TICK) * TICK, 2)


def _minutes(v: str, field: str) -> int:
    m = HM.match(v or "")
    if not m:
        raise Invalid(field, "Give the time as HH:MM, for example 09:15.")
    return int(m.group(1)) * 60 + int(m.group(2))


def parse(body: PlanIn, today: date) -> Plan:
    """The plan from the request, checked the way the page checks it (Invalid(field, detail) on the first fault). The date's lower bound (20 full
    sessions before it) needs the stored candles and is checked by the route."""
    sym = body.symbol.strip().upper()
    if not SYMBOL.match(sym):
        raise Invalid("symbol", "Choose an NSE F&O stock.")
    try:
        day = date.fromisoformat(body.date)
    except ValueError:
        raise Invalid("date", "Give the date as YYYY-MM-DD.") from None
    if day.weekday() >= 5:
        raise Invalid("date", "Choose a weekday: NSE does not trade on Saturday or Sunday.")
    if day > today + timedelta(days=AHEAD_DAYS):
        raise Invalid("date", f"Choose a date up to {AHEAD_DAYS} days ahead ({(today + timedelta(days=AHEAD_DAYS)).isoformat()} at the latest).")
    t0 = _minutes(body.start or "09:15", "start")
    if t0 < OPEN_MIN:
        raise Invalid("start", "The start time is 09:15 or later (the session opens at 09:15).")
    if t0 % 5:
        raise Invalid("start", "The start time is on a 5-minute bar: 09:15, 09:20, 09:25 ...")
    if t0 > CLOSE_MIN - 5:
        raise Invalid("start", "The start time is 15:25 at the latest (the last 5-minute bar).")
    flat = _minutes(body.flatBy, "flatBy")
    if flat % 5:
        raise Invalid("flatBy", "The flat-by time is a multiple of 5 minutes.")
    if flat < t0 + 5:
        raise Invalid("flatBy", "The flat-by time is at least 5 minutes after the start time.")
    if flat > CLOSE_MIN:
        raise Invalid("flatBy", "The flat-by time is 15:30 at the latest (the session closes at 15:30).")
    for name in ("price", "lower", "upper"):
        v = getattr(body, name)
        if not math.isfinite(v) or v <= 0:
            raise Invalid(name, "Give a price above 0." if name == "price" else "Give a level above 0.")
    p, lo, up = tick(body.price), tick(body.lower), tick(body.upper)
    if p <= 0:
        raise Invalid("price", "Give a price above 0.")
    if not lo < p:
        raise Invalid("lower", "The lower level is below the start price.")
    if not up > p:
        raise Invalid("upper", "The upper level is above the start price.")
    for name, v in (("lower", lo), ("upper", up)):
        gap = abs(v / p - 1) * 100
        if gap < LEVEL_MIN - 1e-9 or gap > LEVEL_MAX + 1e-9:
            raise Invalid(name, f"Each level is {LEVEL_MIN:g}% to {LEVEL_MAX:g}% from the start price (this one is {gap:.2f}%).")
    return Plan(sym, day, t0, flat, p, lo, up)


# ------------------------------------------------------------------------------------------------------------------ sessions

@dataclass
class Session:
    day: date
    bars: int                               # bars stored, of 75
    o: List[float]
    h: List[float]
    l: List[float]
    c: List[float]
    last_at: int                            # epoch of the last stored bar


def sessions_of(rows: Sequence[Tuple[datetime, float, float, float, float]]) -> List[Session]:
    """Stored bars [(start, open, high, low, close)] as sessions of 75 slots, oldest first. A missing slot is a flat bar at the close before it
    (before the first stored bar of a session: at that bar's open)."""
    by: Dict[date, Dict[int, Tuple[float, float, float, float, int]]] = {}
    for at, o, h, lo, c in rows:
        t = at.astimezone(IST)
        m = t.hour * 60 + t.minute
        if m < OPEN_MIN or m >= CLOSE_MIN:
            continue
        by.setdefault(t.date(), {})[(m - OPEN_MIN) // 5] = (float(o), float(h), float(lo), float(c), int(at.timestamp()))
    out = []
    for d in sorted(by):
        slots = by[d]
        first = slots[min(slots)]
        prev = first[0]
        o, h, lo, c = [], [], [], []
        for i in range(SLOTS):
            b = slots.get(i)
            if b is None:
                b = (prev, prev, prev, prev, 0)
            o.append(b[0]); h.append(b[1]); lo.append(b[2]); c.append(b[3])       # noqa: E702
            prev = b[3]
        out.append(Session(d, len(slots), o, h, lo, c, max(v[4] for v in slots.values())))
    return out


def full_before(sessions: Sequence[Session], day: date) -> List[Session]:
    return [s for s in sessions if s.day < day and s.bars >= MIN_BARS]


def history(sessions: Sequence[Session], day: date) -> Tuple[List[Session], int]:
    """(the sample, how many sessions were left out for a corporate action): full sessions strictly before `day`, without those that opened more
    than 25% from the close of the stored session before them, the latest 60."""
    prev_close: Optional[float] = None
    kept, dropped = [], 0
    for s in sessions:
        if s.day >= day:
            break
        jump = prev_close is not None and abs(s.o[0] / prev_close - 1) > GAP_LIMIT
        prev_close = s.c[-1]
        if s.bars < MIN_BARS:
            continue
        if jump:
            dropped += 1
            continue
        kept.append(s)
    return kept[-MAX_SESSIONS:], dropped


def seed_of(plan: Plan, last_at: int) -> Tuple[int, str]:
    """(seed, cache hash) from the rounded plan, the method version and the time of the last bar used."""
    text = json.dumps(plan.canonical(), sort_keys=True, separators=(",", ":")) + "|" + VERSION + "|" + str(int(last_at))
    digest = hashlib.sha256(text.encode()).hexdigest()
    return int(digest[:16], 16), digest[:32]


# ------------------------------------------------------------------------------------------------------------------ the replays

def _moves(sample: Sequence[Session]):
    import numpy as np
    o = np.array([s.o for s in sample], dtype=np.float64)
    h = np.array([s.h for s in sample], dtype=np.float64)
    lo = np.array([s.l for s in sample], dtype=np.float64)
    c = np.array([s.c for s in sample], dtype=np.float64)
    base = np.concatenate([o[:, :1], c[:, :-1]], axis=1)
    return np.log(c / base), np.log(h / base), np.log(lo / base)


def replays(plan: Plan, sample: Sequence[Session], seed: int, n: int = REPLAYS) -> Dict[str, Any]:
    """The bootstrap: outcome counts, the histogram of the price at F, the fan and the median bars to the first touch."""
    import numpy as np
    r, hh, ll = _moves(sample)
    s0, s1 = plan.s0, plan.s1
    k = s1 - s0
    r, hh, ll = r[:, s0:s1], hh[:, s0:s1], ll[:, s0:s1]
    rng = np.random.default_rng(seed)
    blocks = -(-k // BLOCK)
    pick = np.repeat(rng.integers(0, len(sample), size=(n, blocks)), BLOCK, axis=1)[:, :k]
    cols = np.broadcast_to(np.arange(k), (n, k))
    rr, rh, rl = r[pick, cols], hh[pick, cols], ll[pick, cols]
    logc = np.cumsum(rr, axis=1)
    prev = np.concatenate([np.zeros((n, 1)), logc[:, :-1]], axis=1)
    close = plan.price * np.exp(logc)
    up = plan.price * np.exp(prev + rh) >= plan.upper - 1e-9
    down = plan.price * np.exp(prev + rl) <= plan.lower + 1e-9
    hit = up | down
    touched = hit.any(axis=1)
    first = np.argmax(hit, axis=1)
    rows = np.arange(n)
    fu, fd = up[rows, first] & touched, down[rows, first] & touched
    counts = {"upper": int((fu & ~fd).sum()), "lower": int((fd & ~fu).sum()), "both": int((fu & fd).sum()), "neither": int((~touched).sum())}
    bars = first + 1

    def med(mask) -> Optional[float]:
        return float(np.median(bars[mask])) if mask.any() else None
    end = close[:, -1]
    hist, edges = np.histogram(end, bins=BINS)
    q = np.percentile(close, [5, 25, 50, 75, 95], axis=0)
    p0 = round(plan.price, 2)
    fan = {"times": [hm(plan.t0 + 5 * i) for i in range(k + 1)]}
    for name, row in zip(("p5", "p25", "p50", "p75", "p95"), q):
        fan[name] = [p0] + [round(float(v), 2) for v in row]
    return {"outcomes": counts, "replays": n,
            "medianBars": {"any": med(touched), "upper": med(fu & ~fd), "lower": med(fd & ~fu)},
            "histogram": {"edges": [round(float(e), 2) for e in edges], "counts": [int(x) for x in hist],
                          "median": round(float(np.median(end)), 2)},
            "fan": fan}


def exact(plan: Plan, sample: Sequence[Session]) -> Dict[str, Any]:
    """The same rule on every past session in the sample: start at its open at t0, levels at the same % gaps from it."""
    lo_k, up_k = plan.lower / plan.price, plan.upper / plan.price
    rows, totals = [], {k: 0 for k in OUTCOMES}
    for s in sample:
        start = s.o[plan.s0]
        lo, up = start * lo_k, start * up_k
        outcome, at = "neither", None
        for i in range(plan.s0, plan.s1):
            a, b = s.h[i] >= up - 1e-9, s.l[i] <= lo + 1e-9
            if a or b:
                outcome, at = ("both" if a and b else "upper" if a else "lower"), hm(OPEN_MIN + 5 * i)
                break
        end = s.c[plan.s1 - 1]
        totals[outcome] += 1
        rows.append({"date": s.day.isoformat(), "start": round(start, 2), "lower": round(lo, 2), "upper": round(up, 2), "outcome": outcome,
                     "touchAt": at, "end": round(end, 2), "changePct": round((end / start - 1) * 100, 2), "bars": s.bars})
    return {"rows": rows, "totals": {**totals, "sessions": len(sample)}}


def run(plan: Plan, sample: Sequence[Session], dropped: int, seed: int, n: int = REPLAYS) -> Dict[str, Any]:
    """The whole answer for one plan (pure: the same input always gives the same output)."""
    canon = plan.canonical()
    out = replays(plan, sample, seed, n)
    return {"status": "ok", "version": VERSION, "seed": str(seed), "plan": {**canon,
            "lowerPct": round((plan.lower / plan.price - 1) * 100, 2), "upperPct": round((plan.upper / plan.price - 1) * 100, 2)},
            "sample": {"sessions": len(sample), "from": sample[0].day.isoformat(), "to": sample[-1].day.isoformat(), "dropped": dropped,
                       "replays": n, "blockMinutes": BLOCK * 5, "barMinutes": 5},
            **{k: out[k] for k in ("outcomes", "medianBars", "histogram", "fan")},
            "past": exact(plan, sample),
            "text": {"labels": labels(canon["flatBy"]), "note": NOTE, "method": METHOD}}


# ------------------------------------------------------------------------------------------------------------------ API

_lock: Optional[asyncio.Semaphore] = None


def _sem() -> asyncio.Semaphore:
    global _lock
    if _lock is None:
        _lock = asyncio.Semaphore(1)
    return _lock


def _json(body: Dict[str, Any], status: int = 200, extra: Optional[Dict[str, str]] = None) -> Response:
    return Response(content=orjson.dumps(body), status_code=status, media_type="application/json", headers={**NO_STORE, **(extra or {})})


def _invalid(field: str, detail: str) -> Response:
    return _json({"status": "invalid", "field": field, "detail": detail}, 422)


async def _rows(store, security_id: str) -> List[tuple]:
    async with store.pool.acquire() as conn:
        got = await conn.fetch("SELECT at, open, high, low, close FROM candles_5m WHERE security_id = $1 ORDER BY at", security_id)
    return [(r["at"], r["open"], r["high"], r["low"], r["close"]) for r in got]


async def _limit(request: Request, ctx: Ctx) -> Optional[Response]:
    limiter = getattr(request.app.state, "limiter", None)
    if limiter is None:
        return None
    who = ctx.user_id or "ip:" + ip_of(request)
    for scope, limit, window in (("lab-tm-min", PER_MINUTE, 60), ("lab-tm-hour", PER_HOUR, 3600)):
        allowed, wait = await limiter.hit(scope, who, limit, window, fail_open=False)
        if not allowed:
            return _json({"status": "rate_limited", "detail": f"At most {PER_MINUTE} new replays a minute and {PER_HOUR} an hour. "
                          "A plan already replayed opens again at once.", "retryAfter": max(1, int(wait))}, 429, {"Retry-After": str(max(1, int(wait)))})
    return None


@router.post("/api/lab/timemachine")
async def timemachine(request: Request, ctx: Ctx = Depends(lab_ctx)):
    """Replay a plan on the stock's past 5-minute bars: 10,000 bootstrapped replays and every past session, with the sample it used."""
    try:
        raw = await request.json()
        body = PlanIn.model_validate(raw)
    except ValidationError as e:
        err = e.errors()[0]
        field = str(err["loc"][0]) if err.get("loc") else "body"
        return _invalid(field, "This value is missing or not valid.")
    except ValueError:
        return _invalid("body", "Send the plan as JSON.")
    try:
        plan = parse(body, datetime.now(IST).date())
    except Invalid as e:
        return _invalid(e.field, e.detail)
    store = request.app.state.store
    from .rsi import _universe
    uni = await _universe(store)
    meta = uni.get(plan.symbol)
    if meta is None:
        return _json({"status": "not_listed", "symbol": plan.symbol,
                      "detail": f"{plan.symbol} is not in the NSE F&O list our intraday source carries; the Time Machine covers F&O stocks only."}, 404)
    sessions = sessions_of(await _rows(store, meta["security_id"]))
    full = [s for s in sessions if s.bars >= MIN_BARS]
    before = full_before(sessions, plan.day)
    if len(before) < MIN_SESSIONS:
        if len(full) > MIN_SESSIONS - 1 and plan.day <= full[MIN_SESSIONS - 1].day:
            return _invalid("date", f"Choose a weekday after {full[MIN_SESSIONS - 1].day.isoformat()}: the replays need {MIN_SESSIONS} full sessions before the date.")
        return _json({"status": "no_history", "symbol": plan.symbol, "sessions": len(before), "needed": MIN_SESSIONS,
                      "detail": f"{len(before)} full session{'' if len(before) == 1 else 's'} of 5-minute bars stored before {plan.day.isoformat()}; "
                                f"the replays need {MIN_SESSIONS}. {FILL_NOTE}"})
    sample, dropped = history(sessions, plan.day)
    if len(sample) < MIN_SESSIONS:
        return _json({"status": "no_history", "symbol": plan.symbol, "sessions": len(sample), "needed": MIN_SESSIONS, "dropped": dropped,
                      "detail": f"{len(sample)} usable sessions before {plan.day.isoformat()} ({dropped} left out for a corporate action); "
                                f"the replays need {MIN_SESSIONS}. {FILL_NOTE}"})
    seed, digest = seed_of(plan, sample[-1].last_at)
    redis = store.redis
    try:
        hit = await redis.get(CACHE_KEY + digest)
    except Exception:
        hit = None
    if hit:
        return _json({**orjson.loads(hit), "cached": True})
    limited = await _limit(request, ctx)
    if limited is not None:
        return limited
    sem = _sem()
    try:
        await asyncio.wait_for(sem.acquire(), WAIT_S)
    except asyncio.TimeoutError:
        return _json({"status": "busy", "detail": "Another replay is running. Try again in a few seconds.", "retryAfter": 5}, 429, {"Retry-After": "5"})
    try:
        out = await asyncio.to_thread(run, plan, sample, dropped, seed)
    finally:
        sem.release()
    out["name"] = meta.get("name") or plan.symbol
    try:
        await redis.set(CACHE_KEY + digest, orjson.dumps(out), ex=CACHE_TTL)
    except Exception:
        log.warning("timemachine: the result could not be kept in Redis")
    return _json({**out, "cached": False})
