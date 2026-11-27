"""Trading Lab, Strategy backtest per stock (docs/TRADING-LAB.md "Strategy backtest", build order item 3).

The 23 fixed swing rules of market-lab, run on one NSE stock's stored daily prices, with every rule's past trades and their results in R.

Attribution. The rules, the indicators, the exits, the trade loop and the delivery cost model are re-implemented from market-lab
(https://github.com/heysanjeevv/market-lab, MIT licence, Copyright (c) 2026 Market Lab contributors), files lab/swing.py and
lab/features.py at commit ba3f771 (3 Nov 2026). Each rule below names its source function in lab/swing.py:

   1 20-day breakout              s_breakout20        13 EMA20/SMA50 cross            s_ema_cross
   2 55-day breakout (Turtle)     s_breakout55        14 Golden cross                 s_golden
   3 52-week high + volume        s_52wk              15 MACD cross above zero        s_macd
   4 Pullback to 20 EMA           s_pullback20        16 Supertrend flip              s_supertrend
   5 Pullback to 50 SMA           s_pullback50        17 ADX trend, dip under 10 EMA  s_adx
   6 RSI(2) dip                   s_rsi2              18 Rising engulfing at 20 EMA  s_engulf
   7 3 down days in uptrend       s_3down             19 Hammer at a moving average   s_hammer
   8 Close under lower Bollinger  s_bb_low            20 Pocket pivot                 s_pocket
   9 Volatility squeeze break     s_squeeze           21 Earnings-style gap and go    s_gap_go
  10 NR7 breakout                 s_nr7               22 VCP tightening break         s_vcp
  11 Inside-day breakout          s_inside            23 RS leader, dip under 10 EMA  s_rs_leader
  12 Bull flag                    s_flag
  Indicators: features() from swing.features and features.ema / rma / shift / supertrend; exits: follow() from swing.follow; trade loop:
  trades() from swing.run_symbol; costs: COST_PARTS from swing.cost_frac. Three names were reworded to FinLit's wording rules ("dip-buy" became
  "dip under 10 EMA", "Bullish engulfing @EMA" became "Rising engulfing candle at 20 EMA"); the logic is unchanged. The page calls a rule's
  signal its "trigger".

Method (the same as market-lab's backtest):
  * A rule's signal uses only the bars up to and including the signal bar (every rolling high, low and average of earlier bars is shifted).
    The trade starts at the NEXT bar's open. The lower exit level is fixed at the signal bar; R (the initial risk) = entry - lower exit level.
  * Each session the lower exit level is checked first (an open under it fills at the open), then the upper exit level (2R or 3R exits), then
    the exit rule. A trade still running at the last stored bar is left out of the figures.
  * One trade at a time per rule; a signal while a trade is running is ignored. The first 260 bars only warm the indicators up.
  * Skipped: a risk of 0 or less, or above 25% of the entry; a one-day move above 35% (a split or a bad print) from 5 bars before the signal
    to the exit.
  * Result in R = (exit - entry) / entry, less the round-trip cost (net) or not (gross), times entry / R.

Data: the stock's stored daily prices, the longest daily series FinLit keeps: the report's price series in `snapshots` (about six years,
the main data provider's daily quotes) joined to the exchange candles in `daily_candles` (Dhan, NSE first, about three years) from the first
candle on, the older part scaled to meet the candles (candles.merge, the same join the report uses). Volumes before the first exchange candle
are the provider's (about a fifteenth of NSE's), so they are left out: the four volume rules are tested only on exchange volumes. Nifty 50
daily closes (for rule 23) come from the shared index-history copy (/api/indices/NIF50/history); no Dhan call is made here.

Nothing here says what to do: every rule is shown, in its list order, with its sample size; results are past results of fixed rules.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
import zlib
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import orjson
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, Response

from ..auth.routes import limit
from ..auth.service import Ctx
from .access import lab_ctx

log = logging.getLogger(__name__)
router = APIRouter()

VERSION = 1                      # bump when a rule, an exit, the costs or the data join changes: the cache key carries it
SYMBOL = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
NO_STORE = {"Cache-Control": "no-store"}
CACHE_TTL = 24 * 3600
MIN_BARS = 400                   # market-lab's run_symbol: fewer bars and the stock is not tested
WARMUP = 260                     # market-lab's run_symbol: signals before this bar are ignored
MAX_RISK = 0.25                  # a risk above 25% of the entry is skipped
BAD_MOVE = 35.0                  # a one-day move above 35% is a split or a bad print
FEW = 30                         # fewer trades than this: the figure is flagged
KEEP_TRADES = 400                # per rule and exit, the newest (all of them for any real stock: a rule rarely trades 100 times in six years)
DEFAULT_EXIT = "trail3"          # market-lab's chart default for a rule
RATE = (60, 600)                 # per member: 60 answers in 10 minutes

# ------------------------------------------------------------------------------------------------------------------ costs
# Delivery (CNC) costs as market-lab's swing.cost_frac sets them, per Rs 1 lakh traded, as a % of the trade's value on each side.
COST_PARTS: Dict[str, List[Tuple[str, float]]] = {
    "entry": [("STT", 0.1), ("Stamp duty", 0.015), ("Exchange transaction charge", 0.00297), ("SEBI fee", 0.0001),
              ("GST 18% on exchange charge and SEBI fee", 0.18 * (0.00297 + 0.0001)), ("Slippage", 0.05), ("Brokerage (free delivery)", 0.0)],
    "exit": [("STT", 0.1), ("Exchange transaction charge", 0.00297), ("SEBI fee", 0.0001), ("DP charge (Rs 15.93 on Rs 1 lakh)", 0.01593),
             ("GST 18% on exchange charge, SEBI fee and DP charge", 0.18 * (0.00297 + 0.0001 + 0.01593)), ("Slippage", 0.05),
             ("Brokerage (free delivery)", 0.0)],
}
SIDE_PCT = {k: sum(p for _, p in v) for k, v in COST_PARTS.items()}
COST = (SIDE_PCT["entry"] + SIDE_PCT["exit"]) / 100    # round trip as a fraction of the entry value (market-lab: 0.00341)

# ------------------------------------------------------------------------------------------------------------------ rules
TREND = "Uptrend: close above the 200-day SMA, 50-day SMA above the 200-day SMA, and 20-day EMA above the 50-day SMA."
ENTRY = "The next session's open."
RULES: List[Dict[str, Any]] = [
    {"id": "breakout20", "name": "20-day breakout", "src": "s_breakout20", "kind": "trend",
     "signal": "The close is above the highest high of the previous 20 sessions, in an uptrend.", "lower": "Trigger close minus 2 ATR."},
    {"id": "breakout55", "name": "55-day breakout (Turtle)", "src": "s_breakout55", "kind": "trend",
     "signal": "The close is above the highest high of the previous 55 sessions, in an uptrend.", "lower": "Trigger close minus 2.5 ATR."},
    {"id": "high52", "name": "52-week high + volume", "src": "s_52wk", "kind": "trend", "volume": True,
     "signal": "The close is above the highest high of the previous 252 sessions, on volume above 1.5 times the average of the 50 sessions before.",
     "lower": "Trigger close minus 2.5 ATR."},
    {"id": "pullback20", "name": "Pullback to 20 EMA", "src": "s_pullback20", "kind": "trend",
     "signal": "The low reaches the 20-day EMA, the close ends above it and above the open, in an uptrend.",
     "lower": "The lower of the trigger and previous session's lows, minus 0.5 ATR."},
    {"id": "pullback50", "name": "Pullback to 50 SMA", "src": "s_pullback50", "kind": "trend",
     "signal": "The low comes within 1% of the 50-day SMA, the close ends above it and above the open; close above the 200-day SMA and the 50-day SMA above the 200-day SMA.",
     "lower": "Trigger session low minus 0.5 ATR."},
    {"id": "rsi2", "name": "RSI(2) dip", "src": "s_rsi2", "kind": "mr",
     "signal": "The 2-day RSI is under 10, with the close above the 200-day SMA.", "lower": "Trigger close minus 2.5 ATR."},
    {"id": "down3", "name": "3 down days in uptrend", "src": "s_3down", "kind": "mr",
     "signal": "Three lower closes in a row, in an uptrend.", "lower": "Trigger close minus 2.5 ATR."},
    {"id": "bblow", "name": "Close under lower Bollinger", "src": "s_bb_low", "kind": "mr",
     "signal": "The close is under the lower Bollinger band (20-day SMA minus 2 standard deviations), with the close above the 200-day SMA.",
     "lower": "Trigger close minus 2.5 ATR."},
    {"id": "squeeze", "name": "Volatility squeeze break", "src": "s_squeeze", "kind": "trend",
     "signal": "The previous session's Bollinger width is within 10% of its 120-session low, and the close breaks above the upper band; close above the 200-day SMA.",
     "lower": "The 20-day SMA minus 0.5 ATR."},
    {"id": "nr7", "name": "NR7 breakout", "src": "s_nr7", "kind": "trend",
     "signal": "The previous session had the narrowest high-low range of the last 7, and the close is above its high, in an uptrend.",
     "lower": "The previous session's low minus 0.3 ATR."},
    {"id": "inside", "name": "Inside-day breakout", "src": "s_inside", "kind": "trend",
     "signal": "The previous session traded inside the one before it, and the close is above that earlier session's high, in an uptrend.",
     "lower": "The previous session's low minus 0.3 ATR."},
    {"id": "flag", "name": "Bull flag", "src": "s_flag", "kind": "trend",
     "signal": "A rise of more than 12% from 15 to 5 sessions ago, then 5 sessions within 2 ATR of high to low, and a close above their high; close above the 50-day SMA.",
     "lower": "The low of those 5 sessions minus 0.3 ATR."},
    {"id": "emacross", "name": "EMA20/SMA50 cross", "src": "s_ema_cross", "kind": "trend",
     "signal": "The 20-day EMA crosses above the 50-day SMA, with the close above the 200-day SMA.", "lower": "Trigger close minus 2.5 ATR."},
    {"id": "golden", "name": "Golden cross", "src": "s_golden", "kind": "trend",
     "signal": "The 50-day SMA crosses above the 200-day SMA.", "lower": "Trigger close minus 3 ATR."},
    {"id": "macd", "name": "MACD cross above zero", "src": "s_macd", "kind": "trend",
     "signal": "MACD (12, 26) crosses above its own 9-day EMA while above zero, in an uptrend.", "lower": "Trigger close minus 2.5 ATR."},
    {"id": "supertrend", "name": "Supertrend flip", "src": "s_supertrend", "kind": "trend",
     "signal": "Supertrend (10 days, 3 ATR) turns up, with the close above the 200-day SMA.", "lower": "The Supertrend line at the trigger."},
    {"id": "adx", "name": "ADX trend, dip under 10 EMA", "src": "s_adx", "kind": "trend",
     "signal": "ADX (14) above 25 with +DI above -DI, and the close back above the 10-day EMA after a close at or under it, in an uptrend.",
     "lower": "The lowest low of the last 10 sessions minus 0.3 ATR."},
    {"id": "engulf", "name": "Rising engulfing candle at 20 EMA", "src": "s_engulf", "kind": "trend",
     "signal": "A rising candle whose body covers the previous falling one, with the low within 1% of the 20-day EMA, in an uptrend.",
     "lower": "The lower of the two lows minus 0.3 ATR."},
    {"id": "hammer", "name": "Hammer at a moving average", "src": "s_hammer", "kind": "trend",
     "signal": "A lower wick at least twice the body and an upper wick at most 30% of the range, with the low within 1% of the 50-day SMA or at the 20-day EMA, in an uptrend.",
     "lower": "Trigger session low minus 0.3 ATR."},
    {"id": "pocket", "name": "Pocket pivot", "src": "s_pocket", "kind": "trend", "volume": True,
     "signal": "A higher close on volume above the largest falling-day volume of the previous 10 sessions, close above the 10-day EMA and the low within 5% of the 50-day SMA, in an uptrend.",
     "lower": "Trigger close minus 2 ATR."},
    {"id": "gapgo", "name": "Earnings-style gap and go", "src": "s_gap_go", "kind": "trend", "volume": True,
     "signal": "An open more than 3% above the previous close on volume above 2.5 times the 50-session average, closing above the open and above the 50-day SMA.",
     "lower": "Trigger session low minus 0.3 ATR."},
    {"id": "vcp", "name": "VCP tightening break", "src": "s_vcp", "kind": "trend", "volume": True,
     "signal": "The previous 10 sessions' range is under 3.6 ATR within 8% of the 52-week high, and the close breaks above their high on volume above 1.3 times the average, in an uptrend.",
     "lower": "The low of those 10 sessions minus 0.3 ATR."},
    {"id": "rsleader", "name": "RS leader, dip under 10 EMA", "src": "s_rs_leader", "kind": "trend", "nifty": True,
     "signal": "The 63-session return beats Nifty 50's by more than 15 points, and the close is back above the 10-day EMA after a close at or under it, in an uptrend.",
     "lower": "The lowest low of the last 10 sessions minus 0.3 ATR."},
]
TREND_RULES = {"breakout20", "breakout55", "pullback20", "down3", "nr7", "inside", "macd", "adx", "engulf", "hammer", "pocket", "vcp", "rsleader"}

# market-lab's exits (swing.EXITS, names from swing_live.EXIT_NAMES, reworded): id -> (name, rule, longest hold in sessions)
EXITS: Dict[str, Tuple[str, str, int]] = {
    "trail3": ("Trailing 3 ATR", "The lower exit level trails 3 ATR under the highest close so far, and rises to the entry once a close is 1R above it. At most 120 sessions.", 120),
    "ema20": ("Close under 20 EMA", "The first close under the 20-day EMA after the entry session. At most 120 sessions.", 120),
    "rr2_20": ("2R or 20 sessions", "An upper exit level at entry plus 2R; otherwise the close of the 20th session.", 20),
    "rr3_40": ("3R or 40 sessions", "An upper exit level at entry plus 3R; otherwise the close of the 40th session.", 40),
    "time5": ("5 sessions", "The close of the 5th session.", 5),
    "time10": ("10 sessions", "The close of the 10th session.", 10),
    "mr5": ("Close above 5 SMA", "The first close above the 5-day SMA (the three mean-reversion rules only). At most 10 sessions.", 10),
}
HOW = {"gap": "opened under the lower exit level", "lower": "lower exit level reached", "upper": "upper exit level reached",
       "rule": "exit rule (close)", "time": "time limit reached"}


# ------------------------------------------------------------------------------------------------------------------ indicators (pure)
def _ema(x, n):
    import pandas as pd
    return pd.Series(x).ewm(span=n, adjust=False).mean().values


def _rma(x, n):
    import pandas as pd
    return pd.Series(x).ewm(alpha=1 / n, adjust=False).mean().values


def _shift(x, k=1, fill=float("nan")):
    import numpy as np
    out = np.empty(len(x), dtype=float)
    if k > 0:
        out[:k] = fill
        out[k:] = np.asarray(x, dtype=float)[:-k]
    else:
        out[:] = x
    return out


def _supertrend(h, l, c, atr, mult=3.0):
    import numpy as np
    hl2 = (h + l) / 2
    up, dn = hl2 - mult * atr, hl2 + mult * atr
    n = len(c)
    fu, fd, d = up.copy(), dn.copy(), np.ones(n)
    for i in range(1, n):
        fu[i] = max(up[i], fu[i - 1]) if c[i - 1] > fu[i - 1] else up[i]
        fd[i] = min(dn[i], fd[i - 1]) if c[i - 1] < fd[i - 1] else dn[i]
        d[i] = 1 if c[i] > fd[i - 1] else -1 if c[i] < fu[i - 1] else d[i - 1]
    return d, np.where(d > 0, fu, fd)


def features(bars: Dict[str, list], nifty: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    """market-lab's swing.features on parallel arrays {t, o, h, l, c, v} (oldest first). `nifty`: {iso day: close}. A value at bar i uses bars
    up to i only."""
    import numpy as np
    import pandas as pd
    o, h, l, c = (np.asarray(bars[k], dtype=float) for k in "ohlc")
    v = np.asarray([np.nan if x is None else x for x in bars["v"]], dtype=float)
    n = len(c)
    shift = _shift
    f: Dict[str, Any] = {"o": o, "h": h, "l": l, "c": c, "v": v, "n": n, "date": list(bars["t"])}
    tr = np.maximum(h - l, np.maximum(abs(h - shift(c, 1, c[0])), abs(l - shift(c, 1, c[0]))))
    f["atr"] = _rma(tr, 14)
    s = pd.Series(c)
    for k in (5, 10, 20, 50, 100, 200):
        f[f"sma{k}"] = s.rolling(k).mean().values
    for k in (10, 20, 50):
        f[f"ema{k}"] = _ema(c, k)
    dlt = np.diff(c, prepend=c[0])
    for k in (2, 14):
        f[f"rsi{k}"] = 100 - 100 / (1 + _rma(np.maximum(dlt, 0), k) / np.maximum(_rma(np.maximum(-dlt, 0), k), 1e-12))
    sd = s.rolling(20).std().values
    f["bbu"], f["bbl"] = f["sma20"] + 2 * sd, f["sma20"] - 2 * sd
    f["bbw"] = 4 * sd / f["sma20"]
    f["bbw_min"] = pd.Series(f["bbw"]).rolling(120).min().values
    f["hh20"] = shift(pd.Series(h).rolling(20).max().values)
    f["hh55"] = shift(pd.Series(h).rolling(55).max().values)
    f["hh252"] = shift(pd.Series(h).rolling(252).max().values)
    f["ll10"] = pd.Series(l).rolling(10).min().values
    f["ll20"] = pd.Series(l).rolling(20).min().values
    f["vavg"] = shift(pd.Series(v).rolling(50).mean().values)
    m = _ema(c, 12) - _ema(c, 26)
    f["macd"], f["macds"] = m, _ema(m, 9)
    f["st"], f["stl"] = _supertrend(h, l, c, _rma(tr, 10), 3.0)
    up, dn = h - shift(h, 1, h[0]), shift(l, 1, l[0]) - l
    pdm, mdm = np.where((up > dn) & (up > 0), up, 0), np.where((dn > up) & (dn > 0), dn, 0)
    a = np.maximum(f["atr"], 1e-12)
    pdi, mdi = 100 * _rma(pdm, 14) / a, 100 * _rma(mdm, 14) / a
    f["adx"], f["pdi"], f["mdi"] = _rma(100 * abs(pdi - mdi) / np.maximum(pdi + mdi, 1e-12), 14), pdi, mdi
    rng = h - l
    f["nr7"] = rng <= pd.Series(rng).rolling(7).min().values
    f["inside"] = (h < shift(h)) & (l > shift(l))
    f["roc63"] = s.pct_change(63).values * 100
    f["roc126"] = s.pct_change(126).values * 100
    f["gap"] = (o / shift(c) - 1) * 100
    f["chg"] = (c / shift(c) - 1) * 100
    body = abs(c - o)
    f["bull_engulf"] = (c > o) & (shift(c) < shift(o)) & (c >= shift(o)) & (o <= shift(c))
    f["hammer"] = ((np.minimum(o, c) - l) >= 2 * body) & ((h - np.maximum(o, c)) <= 0.3 * np.maximum(rng, 1e-9))
    # relative strength against Nifty 50, aligned by date (market-lab: nifty.reindex(dates)); no Nifty -> NaN, so rule 23 cannot fire
    if nifty:
        days = sorted(nifty)
        nc = pd.Series([nifty[d] for d in days], index=days, dtype=float)
        nroc = (nc.pct_change(63) * 100).reindex(f["date"]).values
    else:
        nroc = np.full(n, np.nan)
    f["mkt_roc63"] = nroc
    f["rs63"] = f["roc63"] - nroc
    f["uptrend"] = (c > f["sma200"]) & (f["sma50"] > f["sma200"]) & (f["ema20"] > f["sma50"])
    return f


def _x(cond):
    import numpy as np
    return np.nan_to_num(np.asarray(cond, float)) > 0


# ------------------------------------------------------------------------------------------------------------------ the 23 rules: (signal, lower exit level)
def s_breakout20(f):
    return _x(f["c"] > f["hh20"]) & f["uptrend"], f["c"] - 2 * f["atr"]


def s_breakout55(f):
    return _x(f["c"] > f["hh55"]) & f["uptrend"], f["c"] - 2.5 * f["atr"]


def s_52wk(f):
    return _x(f["c"] > f["hh252"]) & _x(f["v"] > 1.5 * f["vavg"]), f["c"] - 2.5 * f["atr"]


def s_pullback20(f):
    import numpy as np
    touch = _x(f["l"] <= f["ema20"]) & _x(f["c"] > f["ema20"]) & _x(f["c"] > f["o"])
    return touch & f["uptrend"], np.fmin(f["l"], _shift(f["l"])) - 0.5 * f["atr"]


def s_pullback50(f):
    touch = _x(f["l"] <= f["sma50"] * 1.01) & _x(f["c"] > f["sma50"]) & _x(f["c"] > f["o"])
    return touch & _x(f["c"] > f["sma200"]) & _x(f["sma50"] > f["sma200"]), f["l"] - 0.5 * f["atr"]


def s_rsi2(f):
    return _x(f["rsi2"] < 10) & _x(f["c"] > f["sma200"]), f["c"] - 2.5 * f["atr"]


def s_3down(f):
    c = f["c"]
    d3 = _x(c < _shift(c)) & _x(_shift(c) < _shift(c, 2)) & _x(_shift(c, 2) < _shift(c, 3))
    return d3 & f["uptrend"], c - 2.5 * f["atr"]


def s_bb_low(f):
    return _x(f["c"] < f["bbl"]) & _x(f["c"] > f["sma200"]), f["c"] - 2.5 * f["atr"]


def s_squeeze(f):
    tight = _x(_shift(f["bbw"]) <= _shift(f["bbw_min"]) * 1.1)
    return tight & _x(f["c"] > f["bbu"]) & _x(f["c"] > f["sma200"]), f["sma20"] - 0.5 * f["atr"]


def s_nr7(f):
    was = _shift(f["nr7"].astype(float), 1, 0) > 0
    return was & _x(f["c"] > _shift(f["h"])) & f["uptrend"], _shift(f["l"]) - 0.3 * f["atr"]


def s_inside(f):
    was = _shift(f["inside"].astype(float), 1, 0) > 0
    return was & _x(f["c"] > _shift(f["h"], 2)) & f["uptrend"], _shift(f["l"]) - 0.3 * f["atr"]


def s_flag(f):
    import pandas as pd
    pole = (_shift(f["c"], 5) / _shift(f["c"], 15) - 1) * 100
    fh = _shift(pd.Series(f["h"]).rolling(5).max().values)
    fl = _shift(pd.Series(f["l"]).rolling(5).min().values)
    ok = _x(pole > 12) & _x((fh - fl) < 2.0 * f["atr"]) & _x(f["c"] > fh)
    return ok & _x(f["c"] > f["sma50"]), fl - 0.3 * f["atr"]


def s_ema_cross(f):
    x = _x(f["ema20"] > f["sma50"]) & _x(_shift(f["ema20"]) <= _shift(f["sma50"]))
    return x & _x(f["c"] > f["sma200"]), f["c"] - 2.5 * f["atr"]


def s_golden(f):
    x = _x(f["sma50"] > f["sma200"]) & _x(_shift(f["sma50"]) <= _shift(f["sma200"]))
    return x, f["c"] - 3 * f["atr"]


def s_macd(f):
    x = _x(f["macd"] > f["macds"]) & _x(_shift(f["macd"]) <= _shift(f["macds"])) & _x(f["macd"] > 0)
    return x & f["uptrend"], f["c"] - 2.5 * f["atr"]


def s_supertrend(f):
    return (f["st"] > 0) & (_shift(f["st"]) < 0) & _x(f["c"] > f["sma200"]), f["stl"]


def s_adx(f):
    strong = _x(f["adx"] > 25) & _x(f["pdi"] > f["mdi"])
    dip = _x(f["c"] > f["ema10"]) & _x(_shift(f["c"]) <= _shift(f["ema10"]))
    return strong & dip & f["uptrend"], f["ll10"] - 0.3 * f["atr"]


def s_engulf(f):
    import numpy as np
    near = _x(f["l"] <= f["ema20"] * 1.01)
    return f["bull_engulf"] & near & f["uptrend"], np.fmin(f["l"], _shift(f["l"])) - 0.3 * f["atr"]


def s_hammer(f):
    near = _x(f["l"] <= f["sma50"] * 1.01) | _x(f["l"] <= f["ema20"])
    return f["hammer"] & near & f["uptrend"], f["l"] - 0.3 * f["atr"]


def s_pocket(f):
    import numpy as np
    import pandas as pd
    v, c = f["v"], f["c"]
    down_v = np.where(c < _shift(c), v, 0)
    mx = _shift(pd.Series(down_v).rolling(10).max().values)
    return _x(c > _shift(c)) & _x(v > mx) & _x(c > f["ema10"]) & f["uptrend"] & _x(f["l"] <= f["sma50"] * 1.05), c - 2 * f["atr"]


def s_gap_go(f):
    return _x(f["gap"] > 3) & _x(f["v"] > 2.5 * f["vavg"]) & _x(f["c"] > f["o"]) & _x(f["c"] > f["sma50"]), f["l"] - 0.3 * f["atr"]


def s_vcp(f):
    import pandas as pd
    hh10 = _shift(pd.Series(f["h"]).rolling(10).max().values)
    ll10 = _shift(pd.Series(f["l"]).rolling(10).min().values)
    near = _x(f["c"] >= 0.92 * f["hh252"])
    return _x((hh10 - ll10) < 1.8 * f["atr"] * 2) & near & _x(f["c"] > hh10) & f["uptrend"] & _x(f["v"] > 1.3 * f["vavg"]), ll10 - 0.3 * f["atr"]


def s_rs_leader(f):
    dip = _x(f["c"] > f["ema10"]) & _x(_shift(f["c"]) <= _shift(f["ema10"]))
    return dip & _x(f["rs63"] > 15) & f["uptrend"], f["ll10"] - 0.3 * f["atr"]


SIGNALS = {r["id"]: globals()[r["src"]] for r in RULES}


# ------------------------------------------------------------------------------------------------------------------ trades
def follow(f, ie: int, lower: float, mode: str) -> Tuple[int, float, str]:
    """market-lab's swing.follow: a trade from bar ie's open. Returns (exit bar, exit price, how)."""
    o, h, l, c, atr = f["o"], f["h"], f["l"], f["c"], f["atr"]
    e = o[ie]
    r = e - lower
    n = f["n"]
    upper = {"rr2_20": e + 2 * r, "rr3_40": e + 3 * r}.get(mode)
    maxd = EXITS[mode][2]
    st, peak = lower, e
    for j in range(ie, min(n, ie + maxd)):
        if j > ie and o[j] <= st:
            return j, float(o[j]), "gap"                 # opened through the lower exit level
        if l[j] <= st:
            return j, float(st), "lower"
        if upper is not None and h[j] >= upper:
            return j, float(max(upper, o[j]) if j > ie else upper), "upper"
        if mode == "mr5" and c[j] > f["sma5"][j]:
            return j, float(c[j]), "rule"
        if mode == "ema20" and c[j] < f["ema20"][j] and j > ie:
            return j, float(c[j]), "rule"
        if mode == "trail3":
            peak = max(peak, c[j])
            if peak >= e + r:
                st = max(st, e)
            st = max(st, peak - 3 * atr[j])
    j = min(n - 1, ie + maxd - 1)
    return j, float(c[j]), "time"


def trades(f, rule_id: str, mode: str, start: int = WARMUP) -> Tuple[List[dict], int]:
    """market-lab's swing.run_symbol loop for one rule and exit. Returns (closed trades, trades still running at the last bar)."""
    import numpy as np
    sig, lower = SIGNALS[rule_id](f)
    sig = np.asarray(sig, bool).copy()
    sig[:start] = False
    lower = np.asarray(lower, dtype=float)
    bad = np.abs(np.nan_to_num(f["chg"])) > BAD_MOVE
    n, maxd = f["n"], EXITS[mode][2]
    out, running, busy = [], 0, -1
    for i in np.nonzero(sig)[0]:
        ie = int(i) + 1
        if ie >= n - 1 or ie <= busy or not np.isfinite(lower[i]):
            continue
        e = float(f["o"][ie])
        r = e - float(lower[i])
        if not np.isfinite(e) or r <= 0 or r / e > MAX_RISK or bad[max(0, i - 5):ie + 1].any():
            continue
        j, px, how = follow(f, ie, float(lower[i]), mode)
        if bad[ie:j + 1].any():
            continue
        busy = j
        if j == n - 1 and j - ie + 1 < maxd and how == "time":       # ran out of bars, not out of time: still running at the last bar
            running += 1
            continue
        g = (px - e) / e
        out.append({"i": int(i), "ie": ie, "j": j, "trigger": f["date"][i], "entry": f["date"][ie], "exit": f["date"][j],
                    "entryPrice": round(e, 2), "lower": round(float(lower[i]), 2),
                    "upper": round(e + (2 if mode == "rr2_20" else 3) * r, 2) if mode in ("rr2_20", "rr3_40") else None,
                    "exitPrice": round(px, 2), "days": j - ie + 1, "how": how, "riskPct": round(r / e * 100, 2),
                    "pctGross": round(g * 100, 2), "pctNet": round((g - COST) * 100, 2),
                    "rGross": round(g * e / r, 3), "rNet": round((g - COST) * e / r, 3)})
    return out, running


def stats(ts: List[dict], key: str) -> Dict[str, Any]:
    """Figures for one rule from its trades, by result in R (`key`: rNet or rGross). Worst run: the longest run of losing trades in a row;
    drawdown: the deepest fall of the running total of R from its high (the start counts as 0), with the dates it ran between."""
    n = len(ts)
    if not n:
        return {"trades": 0, "few": True, "winRate": None, "avgR": None, "medianR": None, "totalR": 0.0, "avgDays": None,
                "worstRun": {"count": 0, "from": None, "to": None, "r": 0.0}, "drawdown": {"r": 0.0, "from": None, "to": None}}
    rs = [t[key] for t in ts]
    srt = sorted(rs)
    med = srt[n // 2] if n % 2 else (srt[n // 2 - 1] + srt[n // 2]) / 2
    best_run = (0, None, None, 0.0)
    cur, cur_from, cur_r = 0, None, 0.0
    for t, r in zip(ts, rs):
        if r <= 0:
            cur, cur_from, cur_r = cur + 1, cur_from or t["entry"], cur_r + r
            if cur > best_run[0]:
                best_run = (cur, cur_from, t["exit"], cur_r)
        else:
            cur, cur_from, cur_r = 0, None, 0.0
    total, peak, peak_at, dd = 0.0, 0.0, ts[0]["entry"], (0.0, None, None)
    for t, r in zip(ts, rs):
        total += r
        if total > peak:
            peak, peak_at = total, t["exit"]
        if peak - total > dd[0]:
            dd = (peak - total, peak_at, t["exit"])
    return {"trades": n, "few": n < FEW, "winRate": round(100 * sum(r > 0 for r in rs) / n, 1), "avgR": round(sum(rs) / n, 3),
            "medianR": round(med, 3), "totalR": round(sum(rs), 2), "avgDays": round(sum(t["days"] for t in ts) / n, 1),
            "worstRun": {"count": best_run[0], "from": best_run[1], "to": best_run[2], "r": round(best_run[3], 2)},
            "drawdown": {"r": round(dd[0], 2), "from": dd[1], "to": dd[2]}}


def backtest(bars: Dict[str, list], nifty: Optional[Dict[str, float]] = None, volume_from: Optional[str] = None) -> Dict[str, Any]:
    """Every rule under every exit it takes, on one stock's daily bars. Pure: no I/O."""
    t0 = time.perf_counter()
    f = features(bars, nifty)
    n = f["n"]
    rules = []
    for r in RULES:
        modes = [m for m in EXITS if m != "mr5" or r["kind"] == "mr"]
        by_exit = {}
        for m in modes:
            ts, running = trades(f, r["id"], m)
            by_exit[m] = {"net": stats(ts, "rNet"), "gross": stats(ts, "rGross"), "running": running,
                          "trades": [{k: v for k, v in t.items() if k not in ("i", "ie", "j")} for t in ts[-KEEP_TRADES:]],
                          "shown": min(len(ts), KEEP_TRADES)}
        note = None
        if r.get("nifty") and not nifty:
            note = "Nifty 50's daily closes could not be read, so this rule could not be tested."
        elif r.get("volume") and volume_from:
            note = f"A volume rule: tested from {volume_from} on, when the exchange's own volumes begin (50 sessions are needed for the average)."
        rules.append({"id": r["id"], "name": r["name"], "kind": "mean reversion" if r["kind"] == "mr" else "trend",
                      "trigger": r["signal"] + ("" if r["id"] not in TREND_RULES else " " + TREND),
                      "entry": ENTRY, "lower": r["lower"], "source": f"market-lab lab/swing.py {r['src']}",
                      "available": not (r.get("nifty") and not nifty), "note": note, "exits": by_exit})
    return {"version": VERSION, "rules": rules, "bars": n, "testedFrom": f["date"][min(WARMUP, n - 1)], "ms": round((time.perf_counter() - t0) * 1000)}


# ------------------------------------------------------------------------------------------------------------------ data
def _fmt(d: str) -> str:
    x = date.fromisoformat(d)
    return f"{x.day} {x.strftime('%b')} {x.year}"


def join(snapshot_daily: Optional[Dict[str, list]], candle_rows: List[dict]) -> Tuple[Dict[str, list], Optional[str]]:
    """The longest daily series: the report's series before the first exchange candle (scaled to meet the candles, candles.merge), then the
    candles. Returns (bars, first exchange candle day or None). Volumes before the first candle are the provider's and are dropped when candles
    exist; bars with a volume of 0 (no trading) and duplicate days are dropped, as market-lab does."""
    from .. import candles
    old = []
    sd = snapshot_daily or {}
    for i, t in enumerate(sd.get("t") or []):
        try:
            old.append({"quote_date": t, "open_price": sd["o"][i], "high_price": sd["h"][i], "low_price": sd["l"][i],
                        "close_price": sd["c"][i], "volume": (sd.get("v") or [None] * (i + 1))[i]})
        except (IndexError, KeyError, TypeError):
            continue
    rows = [r for r in candle_rows if r.get("close") is not None and r["close"] > 0]
    merged = candles.merge({"price": old}, rows)["price"] if rows else old
    first = rows[0]["day"].isoformat() if rows and hasattr(rows[0]["day"], "isoformat") else (str(rows[0]["day"]) if rows else None)
    by_day: Dict[str, dict] = {}
    for r in merged:
        d = str(r.get("quote_date") or "")[:10]
        try:
            o, h, l, c = (float(r[k]) for k in ("open_price", "high_price", "low_price", "close_price"))
        except (TypeError, ValueError, KeyError):
            continue
        if len(d) != 10 or c <= 0 or o <= 0:
            continue
        v = r.get("volume")
        v = None if v is None or (first is not None and d < first) else float(v)
        if v == 0:
            continue
        by_day[d] = {"o": o, "h": max(h, o, c), "l": min(l, o, c), "c": c, "v": v}
    days = sorted(by_day)
    out = {"t": days, **{k: [by_day[d][k] for d in days] for k in "ohlcv"}}
    return out, first


async def load(store, symbol: str) -> Tuple[Optional[Dict[str, list]], Optional[str], Dict[str, Any]]:
    """Reads the stock's report price series and its exchange candles (bound parameters only)."""
    from .. import candles
    async with store.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT body FROM snapshots WHERE symbol = $1 AND section = 'price' "
                                  "ORDER BY (statement = 'consolidated') DESC, generated_at DESC LIMIT 1", symbol)
    daily = None
    if row:
        try:
            daily = (orjson.loads(row["body"]) or {}).get("daily")
        except orjson.JSONDecodeError:
            daily = None
    rows = await candles.rows_for(store, symbol, days=5000)
    exch = rows[-1].get("exch") if rows else None
    if not daily and not rows:
        return None, None, {}
    bars, first = join(daily, rows)
    return bars, first, {"exchange": exch, "provider": bool(daily and daily.get("t"))}


async def nifty_closes(app) -> Optional[Dict[str, float]]:
    """Nifty 50 daily closes from the shared index-history copy (the same Redis copy /api/indices/NIF50/history serves; the index provider is
    asked at most every six hours, never Dhan). None when it cannot be read within 10 seconds."""
    from .. import indices
    try:
        raw = await asyncio.wait_for(indices._cached(app, "idx:px:NIF50", 6 * 3600, lambda: indices._fetch_levels(app, "NIF50")), 10)
    except (asyncio.TimeoutError, Exception):   # noqa: BLE001 - the index copy is optional: rule 23 says it could not be tested
        return None
    rows = indices.shape_levels(raw, 10)["rows"] if raw else []
    return {r["d"]: float(r["c"]) for r in rows} or None


def coverage(bars: Dict[str, list], first_candle: Optional[str], tested_from: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    t = bars["t"]
    a, b = date.fromisoformat(t[0]), date.fromisoformat(t[-1])
    years = round((b - a).days / 365.25, 1)
    src = []
    if meta.get("provider") and (first_candle is None or t[0] < first_candle):
        src.append(f"the main data provider's daily quotes from {_fmt(t[0])}" + (f" to the day before {_fmt(first_candle)}, scaled to meet the exchange candles" if first_candle else ""))
    if first_candle:
        src.append(f"exchange candles ({meta.get('exchange') or 'NSE'}, through Dhan) from {_fmt(max(first_candle, t[0]))}")
    text = f"{years} years of daily prices, {_fmt(t[0])} – {_fmt(t[-1])} ({len(t):,} sessions). Rules are tested from {_fmt(tested_from)}: the first {WARMUP} sessions only warm the indicators up."
    return {"first": t[0], "last": t[-1], "bars": len(t), "years": years, "testedFrom": tested_from, "exchangeFrom": first_candle,
            "text": text, "source": "Sources: " + "; ".join(src) + "." if src else None}


def cost_model() -> Dict[str, Any]:
    return {"roundTripPct": round(COST * 100, 3), "entryPct": round(SIDE_PCT["entry"], 4), "exitPct": round(SIDE_PCT["exit"], 4),
            "parts": {k: [{"name": nm, "pct": round(p, 5)} for nm, p in v] for k, v in COST_PARTS.items()},
            "text": (f"Delivery (CNC) costs as market-lab sets them, on a trade of Rs 1 lakh: {SIDE_PCT['entry']:.3f}% of the value when the trade "
                     f"opens and {SIDE_PCT['exit']:.3f}% when it closes ({COST * 100:.3f}% round trip): STT 0.1% each side, stamp duty 0.015% on the "
                     "opening side, exchange charge 0.00297% and SEBI fee 0.0001% each side, a DP charge of about Rs 15.93 on the closing side, "
                     "18% GST on those charges, slippage 0.05% each side, and no brokerage (most brokers charge none for delivery). "
                     "Net results take the round trip off each trade; gross results do not.")}


# ------------------------------------------------------------------------------------------------------------------ route
_SEMS: Dict[int, asyncio.Semaphore] = {}


def _sem() -> asyncio.Semaphore:
    """One computation at a time in this process (the server has 2 vCPUs shared with the site)."""
    loop = id(asyncio.get_running_loop())
    if loop not in _SEMS:
        _SEMS.clear()
        _SEMS[loop] = asyncio.Semaphore(1)
    return _SEMS[loop]


def cache_key(symbol: str, last_bar: str, nifty_last: Optional[str]) -> str:
    return f"lab:bt:v{VERSION}:{symbol}:{last_bar}:{nifty_last or 'none'}"


async def computed(app, symbol: str) -> Tuple[Optional[Dict[str, Any]], str]:
    """(answer for every exit, why it is missing). Cached in Redis per (stock, last bar, Nifty's last day, method version) for 24 hours."""
    store = app.state.store
    bars, first, meta = await load(store, symbol)
    if not bars or not bars["t"]:
        return None, "no_data"
    if len(bars["t"]) < MIN_BARS:
        return {"short": True, "bars": len(bars["t"]), "first": bars["t"][0], "last": bars["t"][-1]}, "too_short"
    nifty = await nifty_closes(app)
    key = cache_key(symbol, bars["t"][-1], max(nifty) if nifty else None)
    hit = await _cached(store, key)
    if hit:
        return hit, ""
    async with _sem():
        hit = await _cached(store, key)              # another request may have worked it out while this one waited
        if hit:
            return hit, ""
        bt = await asyncio.to_thread(backtest, bars, nifty, _volume_from(bars, first))
    out = {**bt, "coverage": coverage(bars, first, bt["testedFrom"], meta), "prices": {"t": bars["t"], **{k: [round(x, 2) for x in bars[k]] for k in "ohlc"}}}
    log.info("lab backtest %s: %d bars in %d ms", symbol, bt["bars"], bt["ms"])
    try:
        await store.redis.set(key, zlib.compress(orjson.dumps(out), 6), ex=CACHE_TTL)
    except Exception as exc:   # noqa: BLE001 - the answer is served all the same
        log.warning("lab backtest %s: not cached (%s)", symbol, type(exc).__name__)
    return {**out, "cached": False}, ""


async def _cached(store, key: str) -> Optional[Dict[str, Any]]:
    try:
        hit = await store.redis.get(key)
        return {**orjson.loads(zlib.decompress(hit)), "cached": True} if hit else None
    except Exception as exc:   # noqa: BLE001 - Redis down or a damaged copy: work it out again
        log.warning("lab backtest cache read failed (%s)", type(exc).__name__)
        return None


def _volume_from(bars: Dict[str, list], first: Optional[str]) -> Optional[str]:
    """The first day a volume rule can fire on exchange volumes: 51 sessions after the first exchange candle (the 50-session average of the
    sessions before). None when the whole series carries comparable volumes."""
    if not first or bars["t"][0] >= first:
        return None
    k = next((i for i, d in enumerate(bars["t"]) if d >= first), None)
    return _fmt(bars["t"][min(len(bars["t"]) - 1, k + 50)]) if k is not None else None


def answer(full: Dict[str, Any], symbol: str, mode: str) -> Dict[str, Any]:
    """One exit's view of the cached answer: every rule in its list order."""
    rules = []
    for r in full["rules"]:
        e = r["exits"].get(mode)
        rules.append({**{k: v for k, v in r.items() if k != "exits"}, "exitApplies": e is not None,
                      **({"net": e["net"], "gross": e["gross"], "running": e["running"], "trades": e["trades"], "shown": e["shown"]} if e else
                         {"net": stats([], "rNet"), "gross": stats([], "rGross"), "running": 0, "trades": [], "shown": 0})})
    return {"status": "ok", "symbol": symbol, "version": full["version"], "exit": mode,
            "exits": [{"id": k, "name": v[0], "rule": v[1], "meanReversionOnly": k == "mr5"} for k, v in EXITS.items()],
            "coverage": full["coverage"], "costs": cost_model(), "fewTrades": FEW, "prices": full["prices"], "rules": rules,
            "computeMs": full["ms"], "cached": full.get("cached", False),
            "note": "Past results of fixed rules on past prices; not a forecast or a recommendation."}


@router.get("/api/lab/backtest/{symbol}")
async def strategy_backtest(request: Request, symbol: str, exit: str = Query(DEFAULT_EXIT), ctx: Ctx = Depends(lab_ctx)):  # noqa: A002
    sym = symbol.strip().upper()
    if not SYMBOL.match(sym):
        return JSONResponse({"status": "invalid_symbol", "detail": "That is not a stock symbol."}, status_code=400, headers=NO_STORE)
    if exit not in EXITS:
        return JSONResponse({"status": "invalid_exit", "detail": "Unknown exit."}, status_code=400, headers=NO_STORE)
    await limit(request, "lab_backtest", ctx.user_id or "", RATE[0], RATE[1], fail_open=True)
    full, why = await computed(request.app, sym)
    if why == "no_data":
        return JSONResponse({"status": "not_found", "symbol": sym, "detail": f"FinLit has no stored daily prices for {sym}."}, status_code=404, headers=NO_STORE)
    if why == "too_short":
        return JSONResponse({"status": "too_short", "symbol": sym, "detail": f"Only {full['bars']} sessions of daily prices are stored for {sym} "
                             f"({_fmt(full['first'])} – {_fmt(full['last'])}); the rules need at least {MIN_BARS}."}, status_code=404, headers=NO_STORE)
    return Response(content=orjson.dumps(answer(full, sym, exit)), media_type="application/json", headers=NO_STORE)
