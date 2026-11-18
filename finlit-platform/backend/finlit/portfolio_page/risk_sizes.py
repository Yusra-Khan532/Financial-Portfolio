"""Risk analytics of the Equity portfolio by company size (task #183 W8, pack 01-equity-portfolio E72–E85).

Each share is compared with the index of companies its own size, from index closes (never ETF prices): Large with the Nifty 50, Mid with the Nifty Midcap 150,
Small with the Nifty Smallcap 250. Sizes are FinLit's rupee bands on the company's market value (Large above ₹50,000 Cr, Mid above ₹10,000 Cr, Small below).

- Betas are over the past year of weekly closes (Friday to Friday): each share against its own size index (beta, R², the share of its moves its index explains),
  each size's average, the size-weighted beta of the list (each size's average beta times its share of the list), the list against a benchmark blended in the
  same proportions, and the list against the Nifty 50 alone. A share with under a year of prices gets no beta: it says "under a year".
- Typical swing (annualised volatility of daily closes) and worst fall (largest drop from a high) are over 3 years of daily closes, with the years of data used
  when a share has under 3.
- The list's 10 worst weeks are the Nifty 50's 10 worst weeks of the past year.
- Each size against its own index: the size's shares held in equal amounts, the past year's return, and how much they moved for every 100 the index moved in its
  down weeks and in its up weeks.

Pure functions on plain inputs (pandas), so every figure is checked against a hand calculation in tests/test_risk_sizes_183.py. Describes past prices; not advice.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

SIZE_INDEX = {"Large": ("NIF50", "Nifty 50"), "Mid": ("NIFMID150", "Nifty Midcap 150"), "Small": ("NIFSMA250", "Nifty Smallcap 250")}
SIZES = ("Large", "Mid", "Small")
LARGE_ABOVE, MID_ABOVE = 50000.0, 10000.0      # ₹ crore, the site's one size scale (lib/capBuckets.ts): a value on an edge belongs to the band below
YEAR_WEEKS = 52
MIN_WEEKS = 45                                  # a share needs most of a year of weekly closes for a beta
DAYS_3Y = 3 * 365
BANDS: List[Tuple[float, str, str]] = [(0.65, "less", "Less sensitive"), (0.90, "defensive", "Defensive"), (1.10, "similar", "Similar"),
                                       (1.35, "more", "More sensitive"), (1.75, "high", "High"), (math.inf, "very_high", "Very high")]


def size_of(mcap_cr: Optional[float]) -> Optional[str]:
    if mcap_cr is None or not math.isfinite(mcap_cr) or mcap_cr < 0:
        return None
    return "Large" if mcap_cr > LARGE_ABOVE else "Mid" if mcap_cr > MID_ABOVE else "Small"


def band_of(beta: Optional[float]) -> Optional[Dict[str, str]]:
    """The six ranges of the pack's beta scale: Less sensitive below 0.65 … Very high above 1.75."""
    if beta is None:
        return None
    for top, key, word in BANDS:
        if beta < top:
            return {"key": key, "word": word}
    return {"key": "very_high", "word": "Very high"}


def daily(t: List[str], c: List[float]) -> pd.Series:
    s = pd.Series([float(x) for x in c], index=pd.to_datetime([str(x)[:10] for x in t]), dtype="float64")
    s = s[s > 0].sort_index()
    return s[~s.index.duplicated(keep="last")]


def weekly(s: pd.Series, end: pd.Timestamp, weeks: int = YEAR_WEEKS) -> pd.Series:
    """Friday closes (the last close of each week up to that Friday) of the `weeks` + 1 weeks ending `end`, so `weeks` weekly returns."""
    w = s.resample("W-FRI").last()
    w = w[w.index <= end].tail(weeks + 1)
    return w


def ols_beta(y: pd.Series, x: pd.Series) -> Tuple[Optional[float], Optional[float]]:
    """(beta of y on x, R²) over the weeks both have; None with too few weeks."""
    d = pd.concat([y, x], axis=1).dropna()
    if len(d) < MIN_WEEKS - 1:
        return None, None
    a, b = d.iloc[:, 0].to_numpy(), d.iloc[:, 1].to_numpy()
    vb = float(np.var(b, ddof=1))
    if vb <= 0:
        return None, None
    beta = float(np.cov(a, b, ddof=1)[0, 1] / vb)
    r = float(np.corrcoef(a, b)[0, 1])
    return beta, r * r


def capture(y: pd.Series, x: pd.Series) -> Tuple[Optional[float], Optional[float]]:
    """How much y moved for every 100 x moved: (in x's down weeks, in x's up weeks)."""
    d = pd.concat([y, x], axis=1).dropna()
    if d.empty:
        return None, None
    dn, up = d[d.iloc[:, 1] < 0], d[d.iloc[:, 1] > 0]
    f = lambda part: float(part.iloc[:, 0].mean() / part.iloc[:, 1].mean() * 100) if len(part) and part.iloc[:, 1].mean() != 0 else None   # noqa: E731
    return f(dn), f(up)


def swing_and_fall(s: pd.Series, end: pd.Timestamp) -> Dict[str, Optional[float]]:
    """Typical swing in a year (annualised volatility of daily returns, %) and worst fall from a high (%), over up to 3 years of daily closes."""
    x = s[(s.index > end - pd.Timedelta(days=DAYS_3Y)) & (s.index <= end)]
    if len(x) < 20:
        return {"swing": None, "worstFall": None, "years": None}
    r = x.pct_change().dropna()
    years = round((x.index[-1] - x.index[0]).days / 365.25, 1)
    dd = float((x / x.cummax() - 1).min() * 100)
    return {"swing": float(r.std(ddof=1) * math.sqrt(252) * 100), "worstFall": dd, "years": years}


def r2(v: Optional[float], d: int = 2) -> Optional[float]:
    return None if v is None or not math.isfinite(float(v)) else round(float(v), d)   # plain floats (numpy values are not JSON)


def build(prices: Dict[str, Optional[dict]], index_rows: Dict[str, List[dict]], sizes: Dict[str, Optional[str]], sectors: Dict[str, str]) -> Dict[str, Any]:
    """prices: symbol -> {t, c} daily closes; index_rows: code -> [{d, c}] daily index closes (NIF50, NIFMID150, NIFSMA250); sizes: symbol -> Large/Mid/Small/None."""
    idx = {code: daily([r["d"] for r in rows], [r["c"] for r in rows]) for code, rows in index_rows.items() if rows}
    nifty = idx.get("NIF50")
    if nifty is None or nifty.empty:
        raise ValueError("Nifty 50 closes are needed")
    end = nifty.resample("W-FRI").last().index[-1]
    if end > nifty.index[-1]:                                   # the current week is not finished: end at the last complete Friday
        end = end - pd.Timedelta(days=7)
    bw = {code: weekly(s, end).pct_change().dropna() for code, s in idx.items()}
    shares: List[Dict[str, Any]] = []
    rets: Dict[str, pd.Series] = {}
    for sym, p in prices.items():
        size = sizes.get(sym)
        row: Dict[str, Any] = {"symbol": sym, "size": size, "sector": sectors.get(sym), "benchmark": SIZE_INDEX[size][1] if size else None,
                               "beta": None, "explained": None, "band": None, "why": None, "swing": None, "worstFall": None, "years": None, "oneYear": None}
        if not p or not p.get("t"):
            row["why"] = "No stored prices"
            shares.append(row)
            continue
        s = daily(p["t"], p["c"])
        row.update({k: r2(v, 1) if k != "years" else v for k, v in swing_and_fall(s, end).items()})
        w = weekly(s, end)
        r = w.pct_change().dropna()
        if len(r) < MIN_WEEKS or (s.index[0] > end - pd.Timedelta(days=360)):
            row["why"] = "Under a year of prices"
        elif not size:
            row["why"] = "No size band yet"
        else:
            code = SIZE_INDEX[size][0]
            b = bw.get(code)
            beta, rr = ols_beta(r, b) if b is not None else (None, None)
            row.update({"beta": r2(beta), "explained": r2(rr * 100 if rr is not None else None, 0), "band": band_of(beta)})
            if beta is None:
                row["why"] = f"No {SIZE_INDEX[size][1]} closes"
            else:
                rets[sym] = r
        if len(w) >= 2:
            row["oneYear"] = r2((w.iloc[-1] / w.iloc[0] - 1) * 100, 1)
        shares.append(row)

    counted = [x for x in shares if x["beta"] is not None]
    n = len(counted)
    by_size: List[Dict[str, Any]] = []
    for k in SIZES:
        xs = [x for x in counted if x["size"] == k]
        avg = float(np.mean([x["beta"] for x in xs])) if xs else None
        share = len(xs) / n if n else 0.0
        code, name = SIZE_INDEX[k]
        port = pd.concat([rets[x["symbol"]] for x in xs], axis=1).mean(axis=1) if xs else None
        b = bw.get(code)
        dn, up = capture(port, b) if port is not None and b is not None else (None, None)
        yr = (lambda q: float((1 + q).prod() - 1) * 100)
        by_size.append({"size": k, "benchmark": name, "n": len(xs), "avgBeta": r2(avg), "band": band_of(avg), "listShare": r2(share * 100, 1),
                        "adds": r2(avg * share if avg is not None else None), "oneYear": r2(yr(port), 1) if port is not None else None,
                        "benchOneYear": r2(yr(b), 1) if b is not None else None, "downPer100": r2(dn, 0), "upPer100": r2(up, 0)})
    weighted = sum((s["avgBeta"] or 0) * (s["listShare"] or 0) / 100 for s in by_size) if n else None
    lst = pd.concat([rets[x["symbol"]] for x in counted], axis=1).mean(axis=1) if counted else None
    blend = None
    if lst is not None:
        parts = [bw[SIZE_INDEX[s["size"]][0]] * (s["n"] / n) for s in by_size if s["n"] and SIZE_INDEX[s["size"]][0] in bw]
        blend = pd.concat(parts, axis=1).sum(axis=1, min_count=1) if parts else None
    b_blend = ols_beta(lst, blend)[0] if lst is not None and blend is not None else None
    b_nifty = ols_beta(lst, bw["NIF50"])[0] if lst is not None else None

    # the list as a whole, equal amounts: swing and worst fall over 3 years of daily closes; its 10 worst weeks are the Nifty 50's 10 worst of the past year
    daily_rets = [daily(p["t"], p["c"]).pct_change() for s, p in prices.items() if p and p.get("t") and s in rets]
    glance: Dict[str, Any] = {}
    if daily_rets:
        dr = pd.concat(daily_rets, axis=1)
        dr = dr[(dr.index > end - pd.Timedelta(days=DAYS_3Y)) & (dr.index <= end)].mean(axis=1, skipna=True).dropna()
        lvl = (1 + dr).cumprod()
        glance["list"] = {"swing": r2(float(dr.std(ddof=1) * math.sqrt(252) * 100), 1), "worstFall": r2(float((lvl / lvl.cummax() - 1).min() * 100), 1)}
    glance["nifty"] = {k: r2(v, 1) for k, v in swing_and_fall(nifty, end).items() if k != "years"}
    nw = bw["NIF50"]
    worst = nw.nsmallest(10).index
    glance["worst10"] = {"list": r2(float(lst.reindex(worst).mean() * 100), 1) if lst is not None else None, "nifty": r2(float(nw.reindex(worst).mean() * 100), 1)}
    glance["weighted"] = r2(weighted)
    return {"to": end.date().isoformat(), "from": (end - pd.Timedelta(weeks=YEAR_WEEKS)).date().isoformat(), "counted": n, "shares": shares, "sizes": by_size,
            "betas": {"weighted": r2(weighted), "blended": r2(b_blend), "nifty": r2(b_nifty), "weightedBand": band_of(weighted), "blendedBand": band_of(b_blend), "niftyBand": band_of(b_nifty)},
            "glance": glance, "ranges": [{"key": k, "word": w, "below": None if math.isinf(t) else t} for t, k, w in BANDS]}
