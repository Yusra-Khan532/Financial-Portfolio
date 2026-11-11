"""The nightly price fields behind the Setups screens (pre-breakout; breakout, then pulled back), worked out from ONE company's daily candles.

Pure Python on purpose: the website process never imports numpy or pandas. Every figure, volume included, comes from the same candle series (the quote's own volume
counts differently and must not be mixed in). Needs about 60 sessions; a field that needs more is left out (None) rather than guessed.
Port of the design package's 3_screeners/setup-scans/server/price_fields.py (minus ema9_cons, which needs Prism's own 9-EMA signal).
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence

BASE_MIN_SESSIONS = 15      # a breakout needs a base: the old high was set at least this long before
BREAKOUT_LOOKBACK = 30      # only breakouts in the last 30 sessions count
HIGH_WINDOW = 252           # 52 weeks of sessions
MIN_SESSIONS = 60

FIELDS = ("vs_ema9", "vs_ema20", "ema_stack", "ema9_hold_10", "range_10d", "atr_ratio", "vol_ratio_10_50", "vol_ratio_5_50",
          "days_since_high", "breakout_age", "breakout_level", "vs_breakout", "breakout_vol_ratio",
          "b2_age", "b2_level", "b2_vs_level", "b2_pullback", "b2_vol_x", "ema9_above4", "ema9_near4", "ema9_touch4", "range_4d", "turnover20_cr")


def _ema(xs: Sequence[float], n: int) -> List[float]:
    a, out = 2.0 / (n + 1), []
    for i, x in enumerate(xs):
        out.append(x if i == 0 else a * x + (1 - a) * out[-1])
    return out


def _atr(h: Sequence[float], l: Sequence[float], c: Sequence[float], n: int) -> List[float]:
    """Wilder's average true range (smoothing 1/n, first value = the first day's range)."""
    a, out = 1.0 / n, []
    for i in range(len(c)):
        tr = h[i] - l[i] if i == 0 else max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
        out.append(tr if i == 0 else a * tr + (1 - a) * out[-1])
    return out


def _r(x: Optional[float], d: int = 2) -> Optional[float]:
    return None if x is None or math.isnan(x) or math.isinf(x) else round(float(x), d)


def _mean(xs: Sequence[float]) -> float:
    return sum(xs) / len(xs)


def price_fields(h: Sequence[Optional[float]], l: Sequence[Optional[float]], c: Sequence[Optional[float]], v: Sequence[Optional[float]]) -> Dict[str, Optional[float]]:
    """The fields of the latest session; every key is present, None where there is not enough history."""
    out: Dict[str, Optional[float]] = {k: None for k in FIELDS}
    rows = [(hh, ll, cc, vv) for hh, ll, cc, vv in zip(h, l, c, v) if None not in (hh, ll, cc) and cc > 0]
    n = len(rows)
    if n < MIN_SESSIONS:
        return out
    hi, lo, cl = [float(x[0]) for x in rows], [float(x[1]) for x in rows], [float(x[2]) for x in rows]
    vol = [float(x[3]) if x[3] is not None and x[3] > 0 else 0.0 for x in rows]        # a blank or zero volume is not a quiet day: the averages below skip it
    last = cl[-1]
    e9, e20, e50 = _ema(cl, 9), _ema(cl, 20), _ema(cl, 50)
    out["vs_ema9"], out["vs_ema20"] = _r((last / e9[-1] - 1) * 100), _r((last / e20[-1] - 1) * 100)
    out["ema_stack"] = 1.0 if e9[-1] > e20[-1] > e50[-1] else 0.0
    out["ema9_hold_10"] = float(sum(1 for i in range(n - 10, n) if cl[i] >= e9[i]))
    out["range_10d"] = _r((max(hi[-10:]) - min(lo[-10:])) / last * 100)
    a10, a50 = _atr(hi, lo, cl, 10)[-1], _atr(hi, lo, cl, 50)[-1]
    out["atr_ratio"] = _r(a10 / a50) if a50 else None
    pos = lambda xs: [x for x in xs if x > 0]   # noqa: E731
    v50 = _mean(pos(vol[-50:])) if pos(vol[-50:]) else 0.0
    if v50 and pos(vol[-10:]) and pos(vol[-5:]):
        out["vol_ratio_10_50"], out["vol_ratio_5_50"] = _r(_mean(pos(vol[-10:])) / v50), _r(_mean(pos(vol[-5:])) / v50)
    w = cl[-HIGH_WINDOW:]
    out["days_since_high"] = float(len(w) - 1 - w.index(max(w)))     # the latest of equal highs counts as the high
    if n > BASE_MIN_SESSIONS + 20:
        for t in range(n - 1, max(n - 1 - BREAKOUT_LOOKBACK, BASE_MIN_SESSIONS) - 1, -1):
            start = max(0, t - HIGH_WINDOW)
            prior = cl[start:t]
            if not prior:
                continue
            level = max(prior)
            set_at = start + prior.index(level)
            if cl[t] > level and (t - set_at) >= BASE_MIN_SESSIONS:
                vbase = _mean(pos(vol[max(0, t - 50):t])) if pos(vol[max(0, t - 50):t]) else 0.0
                out["breakout_age"], out["breakout_level"] = float(n - 1 - t), _r(level)
                out["vs_breakout"] = _r((last / level - 1) * 100)
                out["breakout_vol_ratio"] = _r(vol[t] / vbase) if vbase else None
                break
    _breakouts_v2(out, hi, lo, cl, vol, e9, n)
    return out


def _breakouts_v2(out: Dict[str, Optional[float]], hi, lo, cl, vol, e9, n: int) -> None:
    """The Breakouts group's fields (version 2 of the rules, 11 Nov 2026): a breakout 3 to 25 sessions ago whose old high was at least 10 sessions old, the pull
    back from the highest close since, and the 9-day-average fields (the last four sessions). Needs a full year of sessions, else left out."""
    if n < 240:
        return
    last, i = cl[-1], n - 1
    for b in range(i - 3, i - 26, -1):
        start = max(0, b - 252)
        prior = cl[start:b]
        if not prior:
            continue
        level = max(prior)
        if cl[b] > level and b - (start + prior.index(level)) >= 10:
            base = [x for x in vol[max(0, b - 50):b] if x > 0]
            newhigh = max(cl[b:])
            out["b2_age"], out["b2_level"] = float(i - b), _r(level)
            out["b2_vs_level"], out["b2_pullback"] = _r((last / level - 1) * 100), _r((newhigh - last) / newhigh * 100)
            out["b2_vol_x"] = _r(vol[b] / _mean(base)) if base and vol[b] > 0 else None
            break
    w = range(i - 3, i + 1)
    out["ema9_above4"] = 1.0 if all(cl[j] > e9[j] for j in w) else 0.0
    out["ema9_near4"] = 1.0 if all((cl[j] / e9[j] - 1) * 100 <= 4 for j in w) else 0.0
    out["ema9_touch4"] = 1.0 if any(lo[j] <= e9[j] for j in w) else 0.0
    out["range_4d"] = _r((max(hi[j] for j in w) - min(lo[j] for j in w)) / last * 100)
    tv = [cl[j] * vol[j] for j in range(i - 19, i + 1) if vol[j] > 0]
    out["turnover20_cr"] = _r(_mean(tv) / 1e7) if tv else None
