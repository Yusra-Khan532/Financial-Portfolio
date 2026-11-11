"""
FinLit chart-pattern scans (Chart patterns group on the Basic and Advanced score screeners).

Eleven scans on daily candles: Daily base, Weekly base, Near pivot, Volatility contraction (VCP), Tight range,
Flag, 50-day EMA pullback, Relative strength leading price, IPO base, Big reversal, Shakeout.

How to run (nightly, after the candles for the day are stored):
    from pattern_scans import scan_stock, run_universe
    hits = scan_stock(df, bench=bench_close, listed_on=date(2025, 12, 3))   # one company
    table = run_universe(frames, bench_close, listing_dates)                  # every company

df: daily candles for ONE company, oldest first, columns date, open, high, low, close, volume, adjusted for
splits and bonuses (Dhan /v2/charts/historical gives these as parallel arrays; see dhan_chart_feed.py).
bench: closes of the market index on the same dates (NIFTY 500 from Dhan), as a pd.Series indexed by date.

Everything in UPPERCASE below is a rule. Rules stay on the server: the page and the API show what a scan found
(the pattern, the level, how far away, how long) and a plain description, never these numbers.
Nothing here is advice. A scan describes what a chart has done; it is not a call to buy or sell.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd

# ------------------------------------------------------------------ rules (server only)
MIN_TURNOVER_CR = 2.0          # median daily turnover over 20 sessions, Rs crore
MIN_SESSIONS = 120             # history needed for every scan except IPO base

DB_LEN = (10, 100)             # daily base: sessions since the base high
DB_DEPTH = (0.06, 0.40)        # high-to-low depth of the base
DB_NEAR_TOP = 0.08             # close within 8% of the base high
DB_PRIOR_RISE = 0.20           # the stock rose at least 20% into the base

WB_LEN = (16, 78)              # weekly base: weeks since the base high (4 to 18 months)
WB_DEPTH = (0.12, 0.45)
WB_NEAR_TOP = 0.08
WB_PRIOR_RISE = 0.30

NP_WINDOW = (5, 120)           # near pivot: the pivot is the highest high 5 to 120 sessions back
NP_MIN_AGE = 8                 # and was set at least 8 sessions ago
NP_ATR = 2.0                   # close within 2 x ATR(20) under it

VCP_WINDOW = 100               # look for the pattern in the last 100 sessions
VCP_SWING = 0.025              # a swing needs a 2.5% move (or ATR%, whichever is larger)
VCP_FIRST = (0.08, 0.40)       # the first pullback is 8-40% deep
VCP_LAST_MAX = 0.12            # the last pullback is 12% or less
VCP_MIN_PULLBACKS = 2
VCP_VOL_DRY = 0.95             # 10-session volume below 85% of the 50-session average
VCP_NEAR_PIVOT = 0.08

TR_CLOSE_BAND = 0.025          # tight range A: last 5 closes within 2.5%
TR_RANGE10 = 0.07              # tight range B: 10-session high-low within 7% of the close ...
TR_ATR_RATIO = 0.75            # ... and ATR(10) / ATR(50) at 0.75 or less
TR_NEAR_HIGH = 0.15            # within 15% of the 52-week high

FL_POLE_RISE = 0.20            # flag: a rise of 20%+ ...
FL_POLE_MAX = 20               # ... within 20 sessions
FL_LEN = (3, 15)               # the pause after it lasts 3-15 sessions
FL_RETRACE = 0.50              # and gives back half the rise or less
FL_DEPTH = 0.15                # and 15% or less of the price

EP_TOUCH = 0.025               # 50-EMA pullback: a low within 2.5% of the 50-day EMA in the last 3 sessions
EP_HOLD = 0.985                # close at or above 98.5% of the EMA
EP_ABOVE_SHARE = 0.60          # above the EMA on 60% of the last 60 sessions
EP_NEAR_HIGH = 0.25

RS_NEW_HIGH_DAYS = 10          # RS line at a new high in the last 10 sessions
RS_PRICE_BELOW = 0.02          # while the price is 2%+ under its own 52-week closing high

IPO_MAX_DAYS = 365             # listed in the last year
IPO_MIN_SESSIONS = 25
IPO_DEPTH = (0.10, 0.50)
IPO_NEAR_TOP = 0.10
IPO_MIN_AGE = 8                # the first high was set at least 8 sessions ago

BR_LOOKBACK = 3                # big reversal: in the last 3 sessions
BR_UP = 0.05                   # an up day of 5%+
BR_CLOSE_POS = 0.70            # closing in the top 30% of the day's range
BR_VOL = 2.0                   # on 2x the 50-session average volume
BR_FROM_HIGH = 0.20            # after a fall: the day before, 20%+ under the 52-week high

SO_LOOKBACK = 10               # shakeout: a drop below the 50-day average in the last 10 sessions
SO_UNDERCUT = 0.99
SO_RECOVER = 0.98              # and the close is back to within 2% of where it was before the drop


# ------------------------------------------------------------------ helpers
def _sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def _atr(df: pd.DataFrame, n: int) -> pd.Series:
    pc = df["close"].shift(1)
    tr = pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def _r(x, d=2):
    if x is None:
        return None
    x = float(x)
    return None if math.isnan(x) or math.isinf(x) else round(x, d)


def _uptrend(df, ind, strict=False) -> bool:
    c = df["close"].iloc[-1]
    s50, s150, s200 = ind["sma50"].iloc[-1], ind["sma150"].iloc[-1], ind["sma200"].iloc[-1]
    if math.isnan(s50):
        return False
    if strict:  # the trend template used by VCP
        if math.isnan(s200):
            s200 = s150 if not math.isnan(s150) else s50
        rising = ind["sma200"].iloc[-1] >= ind["sma200"].iloc[-21] if not math.isnan(ind["sma200"].iloc[-21]) else True
        hi, lo = df["high"].iloc[-252:].max(), df["low"].iloc[-252:].min()
        return bool(c > s50 > s200 and rising and c >= 0.75 * hi and c >= 1.30 * lo)
    return bool(c > s50 and (math.isnan(s200) or s50 > s200))


def _swings(h: np.ndarray, l: np.ndarray, thr: float):
    """Zig-zag on highs and lows: returns [(index, price, 'H'|'L'), ...] alternating, a turn needs a `thr` move."""
    out, mode = [], None
    hi_i, lo_i = 0, 0
    for i in range(1, len(h)):
        if h[i] >= h[hi_i]:
            hi_i = i
        if l[i] <= l[lo_i]:
            lo_i = i
        if mode in (None, "up") and l[i] <= h[hi_i] * (1 - thr) and hi_i < i:
            out.append((hi_i, h[hi_i], "H")); mode = "down"; lo_i = i
        elif mode in (None, "down") and h[i] >= l[lo_i] * (1 + thr) and lo_i < i:
            out.append((lo_i, l[lo_i], "L")); mode = "up"; hi_i = i
    return out


@dataclass
class Hit:
    scan: str
    pivot: float | None = None          # the level the pattern sits under, if it has one
    to_pivot_pct: float | None = None   # how far the close is below it
    depth_pct: float | None = None
    length: int | None = None           # sessions (weeks for the weekly base)
    detail: dict = field(default_factory=dict)
    draw: dict = field(default_factory=dict)   # what the chart draws: level, box, swings, pole


def indicators(df: pd.DataFrame) -> dict:
    c = df["close"]
    return {"sma20": _sma(c, 20), "sma50": _sma(c, 50), "sma150": _sma(c, 150), "sma200": _sma(c, 200),
            "ema20": _ema(c, 20), "ema50": _ema(c, 50), "atr20": _atr(df, 20), "atr10": _atr(df, 10),
            "atr50": _atr(df, 50), "vol50": _sma(df["volume"].astype(float), 50)}


# ------------------------------------------------------------------ the eleven scans
def daily_base(df, ind):
    n = len(df); h, l, c = df["high"].values, df["low"].values, df["close"].values
    a, b = n - 1 - DB_LEN[1], n - 1 - DB_LEN[0]
    if a < 30:
        a = 30
    if b <= a:
        return None
    hidx = a + int(np.argmax(h[a:b + 1]))
    H = h[hidx]
    if h[hidx + 1:].max(initial=0) > H or (c[hidx + 1:] > H).any():
        return None
    L = l[hidx:].min(); depth = (H - L) / H
    prior = c[max(0, hidx - 120):hidx]
    if not (DB_DEPTH[0] <= depth <= DB_DEPTH[1]) or prior.size < 20 or c[hidx] < (1 + DB_PRIOR_RISE) * prior.min():
        return None
    if not (c[-1] >= (1 - DB_NEAR_TOP) * H and c[-1] > ind["sma50"].iloc[-1]):
        return None
    return Hit("daily_base", _r(H), _r((H / c[-1] - 1) * 100), _r(depth * 100, 1), n - 1 - hidx,
               draw={"level": _r(H), "box": [hidx, n - 1, _r(L), _r(H)]})


def weekly_base(df, ind):
    w = df.set_index(pd.to_datetime(df["date"])).resample("W-FRI").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()
    m = len(w)
    if m < WB_LEN[0] + 10:
        return None
    h, l, c = w["high"].values, w["low"].values, w["close"].values
    a, b = max(4, m - 1 - WB_LEN[1]), m - 1 - WB_LEN[0]
    if b <= a:
        return None
    hidx = a + int(np.argmax(h[a:b + 1])); H = h[hidx]
    if h[hidx + 1:].max(initial=0) > H or (c[hidx + 1:] > H).any():
        return None
    L = l[hidx:].min(); depth = (H - L) / H
    prior = c[max(0, hidx - 26):hidx]
    if not (WB_DEPTH[0] <= depth <= WB_DEPTH[1]) or prior.size < 4 or c[hidx] < (1 + WB_PRIOR_RISE) * prior.min():
        return None
    if c[-1] < (1 - WB_NEAR_TOP) * H:
        return None
    start = int(np.searchsorted(pd.to_datetime(df["date"]).values, w.index[hidx].to_datetime64() - np.timedelta64(6, "D")))
    return Hit("weekly_base", _r(H), _r((H / c[-1] - 1) * 100), _r(depth * 100, 1), m - 1 - hidx,
               draw={"level": _r(H), "box": [start, len(df) - 1, _r(L), _r(H)]})


def near_pivot(df, ind):
    n = len(df); h, c = df["high"].values, df["close"].values
    a, b = max(0, n - 1 - NP_WINDOW[1]), n - 1 - NP_WINDOW[0]
    pidx = a + int(np.argmax(h[a:b + 1])); P = h[pidx]
    if n - 1 - pidx < NP_MIN_AGE or h[pidx + 1:].max(initial=0) > P or c[-1] >= P:
        return None
    atr = ind["atr20"].iloc[-1]
    if not _uptrend(df, ind) or (P - c[-1]) > NP_ATR * atr:
        return None
    return Hit("near_pivot", _r(P), _r((P / c[-1] - 1) * 100), None, n - 1 - pidx,
               detail={"atr_away": _r((P - c[-1]) / atr, 1)}, draw={"level": _r(P), "from": pidx})


def vcp(df, ind):
    if not _uptrend(df, ind, strict=True):
        return None
    n = len(df); h, l, c, v = df["high"].values, df["low"].values, df["close"].values, df["volume"].values.astype(float)
    a = max(0, n - VCP_WINDOW)
    pidx = a + int(np.argmax(h[a:n - 5]))
    thr = max(VCP_SWING, ind["atr20"].iloc[-1] / c[-1])
    sw = [(i + pidx, p, k) for i, p, k in _swings(h[pidx:], l[pidx:], thr)]
    if not sw or sw[0][2] != "H":
        sw = [(pidx, h[pidx], "H")] + sw
    pulls = []
    for (i1, p1, k1), (i2, p2, k2) in zip(sw, sw[1:]):
        if k1 == "H" and k2 == "L":
            pulls.append((i1, i2, (p1 - p2) / p1))
    if len(pulls) < VCP_MIN_PULLBACKS:
        return None
    d = [x[2] for x in pulls]
    if not (VCP_FIRST[0] <= d[0] <= VCP_FIRST[1]) or d[-1] > VCP_LAST_MAX or any(d[i + 1] >= d[i] for i in range(len(d) - 1)):
        return None
    piv = h[pulls[-1][0]:].max() if pulls[-1][0] < n else h[-1]
    piv = h[pulls[-1][0]]
    if c[-1] >= piv or c[-1] < (1 - VCP_NEAR_PIVOT) * piv:
        return None
    if v[-10:].mean() > VCP_VOL_DRY * ind["vol50"].iloc[-1]:
        return None
    return Hit("vcp", _r(piv), _r((piv / c[-1] - 1) * 100), _r(d[0] * 100, 1), n - 1 - pidx,
               detail={"pullbacks": [_r(x * 100, 1) for x in d]},
               draw={"level": _r(piv), "swings": [[int(i), _r(p), k] for i, p, k in sw]})


def tight_range(df, ind):
    if not _uptrend(df, ind):
        return None
    c, h, l = df["close"].values, df["high"].values, df["low"].values
    if c[-1] < (1 - TR_NEAR_HIGH) * h[-252:].max():
        return None
    band5 = c[-5:].max() / c[-5:].min() - 1
    rng10 = (h[-10:].max() - l[-10:].min()) / c[-1]
    ratio = ind["atr10"].iloc[-1] / ind["atr50"].iloc[-1]
    a, b = band5 <= TR_CLOSE_BAND, (rng10 <= TR_RANGE10 and ratio <= TR_ATR_RATIO)
    if not (a or b):
        return None
    kind = "Both" if a and b else ("Tight closes" if a else "Narrow 10-day range")
    n = len(df)
    return Hit("tight_range", None, None, _r(rng10 * 100, 1), 10 if b else 5,
               detail={"kind": kind, "close_band_5d": _r(band5 * 100, 1), "atr_ratio": _r(ratio)},
               draw={"box": [n - (10 if b else 5), n - 1, _r(l[-10:].min() if b else c[-5:].min()), _r(h[-10:].max() if b else c[-5:].max())]})


def flag(df, ind):
    n = len(df); h, l, c, v = df["high"].values, df["low"].values, df["close"].values, df["volume"].values.astype(float)
    best = None
    for e in range(n - 1 - FL_LEN[1], n - FL_LEN[0]):
        if e < FL_POLE_MAX + 1 or h[e + 1:].max(initial=0) > h[e]:
            continue
        s = e - FL_POLE_MAX + int(np.argmin(l[e - FL_POLE_MAX:e]))
        rise = h[e] / l[s] - 1
        if rise < FL_POLE_RISE:
            continue
        fl = l[e + 1:].min(); retr = (h[e] - fl) / (h[e] - l[s]); depth = (h[e] - fl) / h[e]
        if retr > FL_RETRACE or depth > FL_DEPTH or c[-1] >= h[e] or v[e + 1:].mean() >= v[s:e + 1].mean():
            continue
        cand = (rise, e, s, retr, depth)
        if best is None or rise > best[0]:
            best = cand
    if best is None or c[-1] <= ind["sma50"].iloc[-1]:
        return None
    rise, e, s, retr, depth = best
    return Hit("flag", _r(h[e]), _r((h[e] / c[-1] - 1) * 100), _r(depth * 100, 1), n - 1 - e,
               detail={"pole_rise": _r(rise * 100, 1), "gave_back": _r(retr * 100)},
               draw={"level": _r(h[e]), "pole": [int(s), _r(l[s]), int(e), _r(h[e])], "box": [e, n - 1, _r(l[e + 1:].min()), _r(h[e])]})


def ema50_pullback(df, ind):
    c, l, h = df["close"].values, df["low"].values, df["high"].values
    e50, s50, s200 = ind["ema50"], ind["sma50"].iloc[-1], ind["sma200"].iloc[-1]
    if math.isnan(s50) or (not math.isnan(s200) and s50 <= s200):
        return None
    if e50.iloc[-1] <= e50.iloc[-21] or c[-1] < (1 - EP_NEAR_HIGH) * h[-252:].max():
        return None
    above = (df["close"].iloc[-60:] > e50.iloc[-60:]).mean()
    E = e50.iloc[-1]
    if above < EP_ABOVE_SHARE or l[-3:].min() > E * (1 + EP_TOUCH) or c[-1] < EP_HOLD * E or c[-1] > E * 1.05:
        return None
    quiet = df["volume"].iloc[-20:].mean() < ind["vol50"].iloc[-1] or (h[-20:].max() - l[-20:].min()) / c[-1] <= 0.15
    if not quiet or c[-1] >= ind["sma20"].iloc[-1]:
        return None
    return Hit("ema50_pullback", None, None, _r((1 - c[-1] / h[-60:].max()) * 100, 1), None,
               detail={"vs_ema50": _r((c[-1] / E - 1) * 100)}, draw={"ema": 50})


def rs_before_price(df, ind, bench: pd.Series | None):
    if bench is None:
        return None
    s = pd.Series(df["close"].values, index=pd.to_datetime(df["date"]))
    b = bench.reindex(s.index).ffill()
    rs = (s / b).dropna()
    if len(rs) < 200:
        return None
    new_high = rs.iloc[-RS_NEW_HIGH_DAYS:].max() >= rs.iloc[:-RS_NEW_HIGH_DAYS].max()
    hi = s.iloc[-252:].max()
    below = 1 - s.iloc[-1] / hi
    if not new_high or below < RS_PRICE_BELOW or s.iloc[-1] < ind["sma50"].iloc[-1]:
        return None
    return Hit("rs_before_price", _r(hi), _r((hi / s.iloc[-1] - 1) * 100), None, None,
               detail={"price_below_high": _r(below * 100, 1)}, draw={"rs": True, "level": _r(hi)})


def ipo_base(df, ind, listed_on: date | None, today: date):
    n = len(df)
    if listed_on is None or (today - listed_on).days > IPO_MAX_DAYS or n < IPO_MIN_SESSIONS:
        return None
    h, l, c = df["high"].values, df["low"].values, df["close"].values
    hidx = 2 + int(np.argmax(h[2:]))
    if n - 1 - hidx < IPO_MIN_AGE:
        return None
    H = h[hidx]
    if (c[hidx + 1:] > H).any():
        return None
    L = l[hidx:].min(); depth = (H - L) / H
    if not (IPO_DEPTH[0] <= depth <= IPO_DEPTH[1]) or c[-1] < (1 - IPO_NEAR_TOP) * H:
        return None
    return Hit("ipo_base", _r(H), _r((H / c[-1] - 1) * 100), _r(depth * 100, 1), n - 1 - hidx,
               detail={"days_listed": (today - listed_on).days}, draw={"level": _r(H), "box": [hidx, n - 1, _r(L), _r(H)]})


def big_reversal(df, ind):
    n = len(df); o, h, l, c, v = (df[k].values.astype(float) for k in ("open", "high", "low", "close", "volume"))
    for r in range(n - 1, n - 1 - BR_LOOKBACK, -1):
        p = r - 1
        s50, s200 = ind["sma50"].iloc[p], ind["sma200"].iloc[p]
        if math.isnan(s50):
            continue
        down = c[p] < s50 and (math.isnan(s200) or s50 < s200) and c[p] <= (1 - BR_FROM_HIGH) * h[max(0, p - 251):p + 1].max()
        if not down:
            continue
        chg = c[r] / c[p] - 1
        pos = (c[r] - l[r]) / (h[r] - l[r]) if h[r] > l[r] else 0
        vol_x = v[r] / ind["vol50"].iloc[p] if ind["vol50"].iloc[p] else 0
        if chg >= BR_UP and pos >= BR_CLOSE_POS and vol_x >= BR_VOL:
            return Hit("big_reversal", None, None, None, n - 1 - r,
                       detail={"day_change": _r(chg * 100, 1), "volume_x": _r(vol_x, 1), "outside_day": bool(l[r] < l[p] and c[r] > h[p])},
                       draw={"bar": int(r)})
    return None


def shakeout(df, ind):
    c, l = df["close"].values, df["low"].values
    s50, s200 = ind["sma50"], ind["sma200"]
    if math.isnan(s50.iloc[-1]) or (not math.isnan(s200.iloc[-1]) and s50.iloc[-1] <= s200.iloc[-1]) or s50.iloc[-1] < s50.iloc[-21]:
        return None
    n = len(df)
    for d in range(n - 2, n - 1 - SO_LOOKBACK, -1):
        if l[d] < SO_UNDERCUT * s50.iloc[d] and c[d - 3] > s50.iloc[d - 3]:
            before = c[d - 3]
            if c[-1] > s50.iloc[-1] and c[-1] >= SO_RECOVER * before:
                lo = l[d - 2:n].min()
                return Hit("shakeout", None, None, _r((1 - lo / before) * 100, 1), n - 1 - d,
                           detail={"recovered_from_low": _r((c[-1] / lo - 1) * 100, 1)}, draw={"bar": int(d), "level": _r(before)})
            return None
    return None


SCANS = ["daily_base", "weekly_base", "near_pivot", "vcp", "tight_range", "flag", "ema50_pullback",
         "rs_before_price", "ipo_base", "big_reversal", "shakeout"]

# What the page says about each scan. No numbers from the rules above.
LABELS = {
    "daily_base": ("Daily base", "A young base on the daily chart, a few weeks to a few months old, with price back near its top and no close above it yet."),
    "weekly_base": ("Weekly base", "The same on the weekly chart: a longer base, about 4 to 18 months old, with price back near its top."),
    "near_pivot": ("Near pivot", "Price sitting just under a recent high that has held. How close counts depends on how much the stock usually moves in a day."),
    "vcp": ("Volatility contraction", "In an uptrend, each pullback smaller than the one before, tightening under a high, with trading volume drying up."),
    "tight_range": ("Tight range", "In an uptrend, price moving in a very narrow band: either a few closes very close together, or a narrow range over two weeks."),
    "flag": ("Flag", "A sharp run up, then a short, orderly pause that gives back only part of it, on lighter volume."),
    "ema50_pullback": ("50-day EMA pullback", "A stock in a strong uptrend resting on its 50-day average after a quiet few weeks."),
    "rs_before_price": ("Relative strength leading price", "The stock's line against the market made a new high while the price is still under its own high."),
    "ipo_base": ("IPO base", "Listed in the last year, still inside its first base and sitting near the top of it."),
    "big_reversal": ("Big reversal", "After a clear fall, one strong up day on heavy volume that closed near its high."),
    "shakeout": ("Shakeout", "In an uptrend, a quick drop below the 50-day average that was bought back within days; the trend is still in place."),
}


def liquid(df: pd.DataFrame) -> bool:
    t = (df["close"] * df["volume"]).iloc[-20:].median() / 1e7
    return bool(t >= MIN_TURNOVER_CR)


def scan_stock(df: pd.DataFrame, bench: pd.Series | None = None, listed_on: date | None = None, today: date | None = None) -> list[Hit]:
    df = df.dropna(subset=["close"]).reset_index(drop=True)
    today = today or pd.to_datetime(df["date"].iloc[-1]).date()
    if len(df) < IPO_MIN_SESSIONS or not liquid(df):
        return []
    ind = indicators(df)
    hits = []
    if len(df) >= MIN_SESSIONS:
        for fn in (daily_base, weekly_base, near_pivot, vcp, tight_range, flag, ema50_pullback, big_reversal, shakeout):
            try:
                h = fn(df, ind)
            except (IndexError, ValueError, ZeroDivisionError):
                h = None
            if h:
                hits.append(h)
        h = rs_before_price(df, ind, bench)
        if h:
            hits.append(h)
    h = ipo_base(df, ind, listed_on, today)
    if h:
        hits.append(h)
    return hits


def run_universe(frames: dict[str, pd.DataFrame], bench: pd.Series | None, listing: dict[str, date] | None = None) -> dict[str, list[tuple[str, Hit]]]:
    out = {k: [] for k in SCANS}
    for sym, df in frames.items():
        for h in scan_stock(df, bench, (listing or {}).get(sym)):
            out[h.scan].append((sym, h))
    return out
