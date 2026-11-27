"""Trading Lab, Risk read-out (docs/TRADING-LAB.md "Risk read-out"; Build order item 6). Computed from stored daily closes, no LLM, no Dhan call.

For one NSE stock, and for the Nifty 50 as the reference row, how its price moved in the past. Every figure carries its own window (first and last
day, number of daily returns) and a plain one-line explanation of what it measures. Figures from fewer than 200 daily returns are flagged.

Data (read only, bound parameters):
  * the stock    `daily_candles` (exchange daily candles through Dhan, NSE first; about 1,150 days, refreshed every evening, plus the exchanges'
                 end-of-day files) or `price_daily` (FinLit's stored daily prices, 500 days). The one that is current (newest day within a week of
                 the newer store) and longer is used; the answer names it.
  * Nifty 50     `flows_index`, code NIF50 (migration 051): the index's daily closes kept by the FII/DII flows job, five years.

Formulas (one year = 252 sessions, three years = 756; returns are daily, from one stored close to the next):
  * Volatility         sample standard deviation of daily log returns ln(C_t / C_t-1), times sqrt(252), in %. Over the last 20 returns and the
                       last 252; the ratio is the first over the second.
  * Deepest fall       on the closes of the window: running high H_t = max(C_0..C_t), fall F_t = C_t / H_t - 1; the deepest F_t is the trough,
                       the high before it the peak, the first later close at or above the peak's close the recovery (or "not recovered yet",
                       with the sessions and calendar days since the peak).
  * VaR and ES         historical, one day, from the last 252 simple daily returns R_t = C_t / C_t-1 - 1 sorted from worst. With n returns and
                       level a (95% or 99%), k = ceil(n x (1 - a)): VaR is the k-th worst loss, ES the average of the k worst. In % and in
                       rupees per 1 lakh held (loss x 1,00,000).
  * Sortino            mean(R) / sqrt(mean(min(R, 0)^2)) x sqrt(252), minimum acceptable return 0. No day below 0: no figure (nothing to divide by).
  * Calmar             compounded yearly return (C_last / C_first)^(252 / n) - 1 divided by the depth of the deepest fall in the same window.
  * Beta, correlation  on the days both the stock and the Nifty 50 have a close inside the stock's 1-year window: R_s and R_m from one shared day
                       to the next; beta = cov(R_s, R_m) / var(R_m), correlation = cov / (sd_s x sd_m). The count of aligned days and the days
                       only one side has are reported.
  * Big one-day moves  a simple return of 30% or more either way is named with its day: if it is a split or bonus the stored prices do not
                       adjust for, the figures that include it overstate the swings. The prices are never changed here.

Every figure describes the past; nothing here says what to do, and nothing is a forecast.
"""
from __future__ import annotations

import asyncio
import logging
import math
import re
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from ..auth.service import Ctx
from .access import lab_ctx

router = APIRouter()
log = logging.getLogger(__name__)

Point = Tuple[str, float]                 # (ISO day, close)

SYMBOL = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
NO_STORE = {"Cache-Control": "no-store"}
YEAR = 252                                # sessions in a year (annualising and the 1-year window)
THREE_YEARS = 3 * YEAR
SHORT = 20                                # the recent volatility window
MIN_RETURNS = 200                         # a 1- or 3-year figure from fewer daily returns than this is flagged
BIG_MOVE = 0.30                           # a one-day move this large is named (a split or bonus the stored prices may not adjust for)
LAKH = 100_000
CURRENT_DAYS = 7                          # a price store whose newest day is more than this many days behind the other one is not used
CACHE_S = 1800                            # Redis copy of one stock's read-out
CACHE_KEY = "lab:risk:v1:"
INDEX_CODE = "NIF50"
INDEX_NAME = "Nifty 50"
LEVELS = (0.95, 0.99)

SOURCE_LABEL = {
    "daily_candles": "Exchange daily candles (Dhan)",
    "price_daily": "FinLit stored daily prices",
    "flows_index": "Nifty 50 daily closes (FinLit index store)",
}

# What each figure measures, in one line (shown beside the figure). Describes; never says what to do.
EXPLAIN = {
    "vol20": "How widely the daily price changes swung over the last 20 sessions, scaled to a year.",
    "vol1y": "How widely the daily price changes swung over the last year (252 sessions), scaled to a year.",
    "volRatio": "The 20-session volatility divided by the 1-year level: above 1, recent swings were wider than the year's; below 1, narrower.",
    "drawdown": "The largest drop from a closing high to a later closing low in the window, and when the price closed back at that high.",
    "var": "The one-day loss that was reached or passed on the worst 5% (or 1%) of days in the last year.",
    "es": "The average one-day loss on those worst 5% (or 1%) of days.",
    "sortino": "The average daily return for each unit of downside swing (only days below zero count), scaled to a year.",
    "calmar": "The compounded yearly return divided by the depth of the deepest fall in the same window.",
    "beta": "How far the stock's daily return moved, on average, for each 1% move of the Nifty 50 on the same days.",
    "corr": "How closely the stock's daily returns moved with the Nifty 50's on the same days, from -1 to +1.",
}
NOTE = "Measures of how the stock moved in the past; not a forecast or a recommendation."


# ------------------------------------------------------------------------------------------------------------------ pure helpers

def clean(rows: Sequence[Tuple[Any, Any]]) -> List[Point]:
    """(day, close) rows as ISO day and float, oldest first, one per day; a missing, zero or negative close is dropped."""
    out: Dict[str, float] = {}
    for d, c in rows:
        try:
            v = float(c)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(v) or v <= 0:
            continue
        out[d.isoformat() if hasattr(d, "isoformat") else str(d)[:10]] = v
    return sorted(out.items())


def pick_source(sources: Sequence[Tuple[str, List[Point]]]) -> Optional[Tuple[str, List[Point]]]:
    """Of the stores (in order of preference), the longest one whose newest day is within CURRENT_DAYS of the newest store's; a tie keeps the first."""
    live = [(n, p) for n, p in sources if p]
    if not live:
        return None
    newest = max(date.fromisoformat(p[-1][0]) for _, p in live)
    current = [(n, p) for n, p in live if (newest - date.fromisoformat(p[-1][0])).days <= CURRENT_DAYS]
    return max(current, key=lambda x: len(x[1]))          # max keeps the first of equal lengths


def log_returns(closes: Sequence[float]) -> List[float]:
    return [math.log(b / a) for a, b in zip(closes, closes[1:])]


def simple_returns(closes: Sequence[float]) -> List[float]:
    return [b / a - 1 for a, b in zip(closes, closes[1:])]


def _mean(xs: Sequence[float]) -> float:
    return sum(xs) / len(xs)


def stdev(xs: Sequence[float]) -> Optional[float]:
    """Sample standard deviation (n - 1); None for fewer than two values."""
    if len(xs) < 2:
        return None
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def ann_vol(log_rets: Sequence[float]) -> Optional[float]:
    """Annualised volatility as a fraction (0.25 = 25%)."""
    s = stdev(log_rets)
    return None if s is None else s * math.sqrt(YEAR)


def last(points: List[Point], returns: int) -> List[Point]:
    """The closes that give the last `returns` daily returns (one more close than returns)."""
    return points[-(returns + 1):]


def window(points: List[Point], wanted: int, label: str) -> Dict[str, Any]:
    """The window a figure was worked out on: its first and last close, how many daily returns, and whether that is short."""
    n = max(0, len(points) - 1)
    floor = SHORT if wanted <= SHORT else MIN_RETURNS
    return {"label": label, "from": points[0][0] if points else None, "to": points[-1][0] if points else None, "returns": n,
            "wanted": wanted, "full": n >= wanted, "short": n < floor}


def drawdown(points: List[Point]) -> Dict[str, Any]:
    """The fall below the running high on every day, and the deepest fall with its peak, trough and recovery."""
    if len(points) < 2:
        return {"series": [], "deepest": None}
    series: List[float] = []
    hi, hi_i = points[0][1], 0
    worst, worst_i, worst_peak = 0.0, None, 0
    for i, (_, c) in enumerate(points):
        if c >= hi:
            hi, hi_i = c, i
        f = c / hi - 1
        series.append(f)
        if f < worst:
            worst, worst_i, worst_peak = f, i, hi_i
    if worst_i is None:
        return {"series": series, "deepest": None}
    peak_d, peak_c = points[worst_peak]
    trough_d, trough_c = points[worst_i]
    rec = next((i for i in range(worst_i + 1, len(points)) if points[i][1] >= peak_c), None)
    last_d = points[-1][0]
    deepest: Dict[str, Any] = {
        "depthPct": worst * 100, "peak": {"d": peak_d, "close": peak_c}, "trough": {"d": trough_d, "close": trough_c},
        "fallSessions": worst_i - worst_peak, "fallDays": (date.fromisoformat(trough_d) - date.fromisoformat(peak_d)).days,
        "recovered": None, "recoverySessions": None, "recoveryDays": None,
    }
    if rec is not None:
        rec_d = points[rec][0]
        deepest.update(recovered={"d": rec_d, "close": points[rec][1]}, recoverySessions=rec - worst_i,
                       recoveryDays=(date.fromisoformat(rec_d) - date.fromisoformat(trough_d)).days)
    else:
        deepest.update(sessionsSincePeak=len(points) - 1 - worst_peak,
                       daysSincePeak=(date.fromisoformat(last_d) - date.fromisoformat(peak_d)).days,
                       belowPeakPct=(points[-1][1] / peak_c - 1) * 100)
    return {"series": series, "deepest": deepest}


def tail(rets: Sequence[float], level: float) -> Optional[Dict[str, Any]]:
    """Historical one-day VaR and expected shortfall at `level` from simple returns: the k-th worst loss and the mean of the k worst."""
    n = len(rets)
    if n == 0:
        return None
    k = max(1, math.ceil(round(n * (1 - level), 9)))
    worst = sorted(rets)[:k]
    var, es = -worst[-1], -_mean(worst)
    return {"level": level, "k": k, "n": n, "varPct": var * 100, "esPct": es * 100, "varRs": var * LAKH, "esRs": es * LAKH}


def sortino(rets: Sequence[float]) -> Dict[str, Any]:
    """Annualised Sortino ratio with a minimum acceptable return of 0."""
    if len(rets) < 2:
        return {"value": None, "why": "Too few daily returns."}
    m = _mean(rets)
    down = math.sqrt(sum(min(r, 0.0) ** 2 for r in rets) / len(rets))
    if down == 0:
        return {"value": None, "meanPct": m * 100, "downsidePct": 0.0,
                "why": "No day in the window closed below the day before, so there is no downside swing to divide by."}
    return {"value": m / down * math.sqrt(YEAR), "meanPct": m * 100, "downsidePct": down * 100,
            "annMeanPct": m * YEAR * 100, "annDownsidePct": down * math.sqrt(YEAR) * 100}


def cagr(points: List[Point]) -> Optional[float]:
    n = len(points) - 1
    if n < 1:
        return None
    return (points[-1][1] / points[0][1]) ** (YEAR / n) - 1


def calmar(points: List[Point]) -> Dict[str, Any]:
    g = cagr(points)
    dd = drawdown(points)["deepest"]
    if g is None:
        return {"value": None, "why": "Too few closes."}
    if dd is None:
        return {"value": None, "annReturnPct": g * 100, "maxFallPct": 0.0, "why": "The price never closed below an earlier high in the window, so there is no fall to divide by."}
    return {"value": g / abs(dd["depthPct"] / 100), "annReturnPct": g * 100, "maxFallPct": dd["depthPct"]}


def align(stock: List[Point], index: List[Point], since: str) -> Dict[str, Any]:
    """Daily returns of the stock and the index on the days both have a close, from one shared day to the next, from `since` on."""
    s, m = dict(stock), dict(index)
    s_days = [d for d, _ in stock if d >= since]
    m_days = [d for d, _ in index if d >= since and d <= (stock[-1][0] if stock else since)]
    common = sorted(set(s_days) & set(m_days))
    days, rs, rm = [], [], []
    for a, b in zip(common, common[1:]):
        days.append(b)
        rs.append(s[b] / s[a] - 1)
        rm.append(m[b] / m[a] - 1)
    return {"days": days, "s": rs, "m": rm, "onlyStock": len(set(s_days) - set(m_days)), "onlyIndex": len(set(m_days) - set(s_days))}


def beta(rs: Sequence[float], rm: Sequence[float]) -> Dict[str, Any]:
    n = len(rs)
    if n < 3:
        return {"value": None, "corr": None, "alphaPct": None, "why": "Fewer than three days with a close for both."}
    ms, mm = _mean(rs), _mean(rm)
    cov = sum((a - ms) * (b - mm) for a, b in zip(rs, rm)) / (n - 1)
    vs = sum((a - ms) ** 2 for a in rs) / (n - 1)
    vm = sum((b - mm) ** 2 for b in rm) / (n - 1)
    if vm == 0:
        return {"value": None, "corr": None, "alphaPct": None, "why": "The Nifty 50 did not move on these days."}
    b = cov / vm
    corr = cov / math.sqrt(vs * vm) if vs > 0 else None
    return {"value": b, "corr": corr, "alphaPct": (ms - b * mm) * 100, "r2": None if corr is None else corr * corr}


def big_moves(points: List[Point]) -> List[Dict[str, Any]]:
    return [{"d": points[i + 1][0], "pct": r * 100} for i, r in enumerate(simple_returns([c for _, c in points])) if abs(r) >= BIG_MOVE]


def _rounded(o: Any) -> Any:
    if isinstance(o, float):
        return round(o, 4)
    if isinstance(o, dict):
        return {k: _rounded(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_rounded(v) for v in o]
    return o


def figures(points: List[Point]) -> Dict[str, Any]:
    """Every figure of one series (a stock or the index), each with its window."""
    p20, p1, p3 = last(points, SHORT), last(points, YEAR), last(points, THREE_YEARS)
    lr20, lr1 = log_returns([c for _, c in p20]), log_returns([c for _, c in p1])
    sr1, sr3 = simple_returns([c for _, c in p1]), simple_returns([c for _, c in p3])
    v20, v1 = ann_vol(lr20), ann_vol(lr1)
    longer = len(points) - 1 > YEAR                       # the 3-year figures only when more than a year is stored
    w3_label = "3 years" if len(p3) - 1 >= THREE_YEARS else "Stored history"
    out: Dict[str, Any] = {
        "vol20": {"pct": None if v20 is None else v20 * 100, "window": window(p20, SHORT, "20 sessions")},
        "vol1y": {"pct": None if v1 is None else v1 * 100, "window": window(p1, YEAR, "1 year")},
        "volRatio": {"value": (v20 / v1) if v20 is not None and v1 else None, "window": window(p1, YEAR, "20 sessions against 1 year")},
        "drawdown1y": {**{k: v for k, v in drawdown(p1).items() if k != "series"}, "window": window(p1, YEAR, "1 year")},
        "drawdown3y": ({**{k: v for k, v in drawdown(p3).items() if k != "series"}, "window": window(p3, THREE_YEARS, w3_label)} if longer else None),
        "tail": {"levels": [tail(sr1, a) for a in LEVELS], "window": window(p1, YEAR, "1 year")},
        "sortino1y": {**sortino(sr1), "window": window(p1, YEAR, "1 year")},
        "sortino3y": ({**sortino(sr3), "window": window(p3, THREE_YEARS, w3_label)} if longer else None),
        "calmar1y": {**calmar(p1), "window": window(p1, YEAR, "1 year")},
        "calmar3y": ({**calmar(p3), "window": window(p3, THREE_YEARS, w3_label)} if longer else None),
        "last": {"d": points[-1][0], "close": points[-1][1]} if points else None,
    }
    if not longer:
        out["threeYearNote"] = f"Only {max(0, len(points) - 1)} daily returns are stored, so the 3-year figures are not shown."
    return out


def rolling_vol(points: List[Point], n: int = SHORT, keep: int = YEAR) -> Dict[str, list]:
    """The 20-session volatility (annualised %) on each of the last `keep` days."""
    lr = log_returns([c for _, c in points])
    days = [d for d, _ in points[1:]]
    out_d, out_v = [], []
    for i in range(max(n - 1, len(lr) - keep), len(lr)):
        if i - n + 1 < 0:
            continue
        v = ann_vol(lr[i - n + 1:i + 1])
        out_d.append(days[i])
        out_v.append(None if v is None else round(v * 100, 3))
    return {"d": out_d, "v": out_v}


def readout(stock: List[Point], index: List[Point]) -> Dict[str, Any]:
    """Everything the Risk read-out tab shows, from the stock's and the index's stored closes (oldest first)."""
    fs = figures(stock)
    p1, p3 = last(stock, YEAR), last(stock, THREE_YEARS)
    under = drawdown(p3)
    notes: List[str] = []
    out: Dict[str, Any] = {"stock": fs, "nifty": figures(index) if len(index) > 2 else None, "explain": EXPLAIN, "note": NOTE}
    if out["nifty"] is None:
        notes.append("Nifty 50 closes are not stored yet, so beta, correlation and the reference row are not shown.")
        out["beta"] = None
    else:
        al = align(stock, index, p1[0][0])
        b = beta(al["s"], al["m"])
        n = len(al["days"])
        out["beta"] = {**b, "aligned": n, "onlyStock": al["onlyStock"], "onlyIndex": al["onlyIndex"],
                       "window": {"label": "1 year", "from": p1[0][0], "to": al["days"][-1] if al["days"] else p1[-1][0], "returns": n,
                                  "wanted": YEAR, "full": n >= YEAR, "short": n < MIN_RETURNS}}
        out["pairs"] = {"d": al["days"], "s": [round(x * 100, 4) for x in al["s"]], "m": [round(x * 100, 4) for x in al["m"]]}
        if index[-1][0] < stock[-1][0]:
            notes.append(f"The Nifty 50's newest stored close is from {index[-1][0]}, the stock's from {stock[-1][0]}: beta uses the days both have.")
    sr1 = simple_returns([c for _, c in p1])
    out["returns1y"] = {"d": [d for d, _ in p1[1:]], "r": [round(r * 100, 4) for r in sr1]}
    out["underwater"] = {"d": [d for d, _ in p3], "c": [c for _, c in p3], "dd": [round(f * 100, 3) for f in under["series"]]}
    out["rolling"] = rolling_vol(stock)
    moves = big_moves(p3)
    for mv in moves:
        notes.append(f"A one-day move of {mv['pct']:+.1f}% on {mv['d']}. If that was a split, bonus or other corporate action the stored prices do "
                     "not adjust for, the figures that include that day overstate the swings.")
    out["bigMoves"] = moves
    if fs["vol1y"]["window"]["short"]:
        notes.append(f"Only {fs['vol1y']['window']['returns']} daily returns are stored for the last year (fewer than {MIN_RETURNS}): "
                     "the 1-year figures are flagged as short.")
    out["notes"] = notes
    return _rounded(out)


# ------------------------------------------------------------------------------------------------------------------ data + route

_SEM: Optional[asyncio.Semaphore] = None


def _sem() -> asyncio.Semaphore:
    global _SEM
    if _SEM is None:
        _SEM = asyncio.Semaphore(2)                       # at most two read-outs worked out at once, process-wide
    return _SEM


async def load(pool, symbol: str) -> Dict[str, Any]:
    """The stock's name, its closes from both price stores, and the Nifty 50's closes. Read only."""
    async with pool.acquire() as conn:
        name = await conn.fetchval("SELECT name FROM companies WHERE symbol = $1", symbol)
        dc = await conn.fetch("SELECT day, close, exch FROM daily_candles WHERE symbol = $1 ORDER BY day", symbol)
        try:
            pdly = await conn.fetch("SELECT day, close FROM price_daily WHERE symbol = $1 ORDER BY day", symbol)
        except Exception:                                 # a database without the table: the candles alone
            pdly = []
        try:
            idx = await conn.fetch("SELECT d, close FROM flows_index WHERE code = $1 ORDER BY d", INDEX_CODE)
        except Exception:
            idx = []
    return {"name": name, "exch": dc[-1]["exch"] if dc else None,
            "daily_candles": clean([(r["day"], r["close"]) for r in dc]),
            "price_daily": clean([(r["day"], r["close"]) for r in pdly]),
            "index": clean([(r["d"], r["close"]) for r in idx])}


def build(symbol: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    chosen = pick_source([("daily_candles", data["daily_candles"]), ("price_daily", data["price_daily"])])
    if chosen is None or len(chosen[1]) < 3:
        return None
    src, pts = chosen
    idx = data["index"]
    out = readout(pts, idx)
    label = SOURCE_LABEL[src] + (f", {data['exch']}" if src == "daily_candles" and data.get("exch") else "")
    out.update({
        "status": "ok", "symbol": symbol, "name": data.get("name") or symbol, "asOf": pts[-1][0],
        "source": {"table": src, "label": label, "from": pts[0][0], "to": pts[-1][0], "closes": len(pts),
                   "other": {k: {"closes": len(data[k]), "to": data[k][-1][0] if data[k] else None} for k in ("daily_candles", "price_daily") if k != src}},
        "index": {"name": INDEX_NAME, "table": "flows_index", "label": SOURCE_LABEL["flows_index"], "closes": len(idx),
                  "from": idx[0][0] if idx else None, "to": idx[-1][0] if idx else None},
    })
    return out


@router.get("/api/lab/risk/{symbol}")
async def risk_readout(request: Request, symbol: str, ctx: Ctx = Depends(lab_ctx)):
    from ..auth.routes import limit
    sym = symbol.strip().upper()
    if not SYMBOL.match(sym):
        return JSONResponse({"status": "invalid_symbol", "detail": "That is not a stock symbol."}, status_code=400, headers=NO_STORE)
    await limit(request, "lab-risk", ctx.user_id or "?", 40, 60, fail_open=True)
    store = request.app.state.store
    key = CACHE_KEY + sym
    try:
        hit = await store.redis.get(key)
    except Exception:
        hit = None
    if hit:
        return Response(content=hit, media_type="application/json", headers=NO_STORE)
    data = await load(store.pool, sym)
    if not data["daily_candles"] and not data["price_daily"]:
        status = "no_prices" if data["name"] else "not_found"
        detail = (f"No daily closes are stored for {sym} yet." if data["name"] else f"We could not find the stock {sym}.")
        return JSONResponse({"status": status, "symbol": sym, "detail": detail}, status_code=404, headers=NO_STORE)
    async with _sem():
        out = await asyncio.to_thread(build, sym, data)
    if out is None:
        return JSONResponse({"status": "no_prices", "symbol": sym, "detail": f"Too few daily closes are stored for {sym} to work out the figures."},
                            status_code=404, headers=NO_STORE)
    body = orjson.dumps(out)
    try:
        await store.redis.set(key, body, ex=CACHE_S)
    except Exception as exc:                              # Redis down: the answer is still sent, only not kept
        log.debug("risk read-out not cached for %s: %s", sym, exc)
    return Response(content=body, media_type="application/json", headers=NO_STORE)
