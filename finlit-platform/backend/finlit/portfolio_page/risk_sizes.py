"""Risk analytics of the Equity portfolio by company size (task #183 W8, pack 01-equity-portfolio E72–E85).

Each share is compared with the index of companies its own size, from index closes (never ETF prices): Large with the Nifty 50, Mid with the Nifty Midcap 150,
Small with the Nifty Smallcap 250, Micro with the Nifty Microcap 250 (task #262, the handoff's suggested micro benchmark). Sizes are FinLit's rupee bands on the
company's market value (finlit/sizes.py: Large above ₹75,000 Cr, Mid ₹25,000-75,000 Cr, Small ₹10,000-25,000 Cr, Micro below ₹10,000 Cr).

- Betas are over the past year of weekly closes (Friday to Friday): each share against its own size index (beta, R², the share of its moves its index explains),
  each size's average, the size-weighted beta of the list (each size's average beta times its share of the list), the list against a benchmark blended in the
  same proportions, and the list against the Nifty 50 alone. A share with under a year of prices gets no beta: it says "under a year".
- Typical swing (annualised volatility of returns) and worst fall (largest drop from a high) are over 3 years of closes, with the years of data used when a share
  has under 3. The shares' stored closes are weekly (price-MAX) and are annualised with √52; the index's are daily (√252). Each figure carries its grain and years
  (task #274, number fix 1: the weekly closes had been annualised with √252, 2.2 times too high).
- The list's 10 worst weeks are the Nifty 50's 10 worst weeks of the past year.
- Each size against its own index: the size's shares held in equal amounts, the past year's return, and how much they moved for every 100 the index moved in its
  down weeks and in its up weeks.
- Task #385 (developer file 33, open item 1): the shares and the index are measured the same way: both from Friday closes (the index's daily closes are read
  weekly too), so the list's swing and worst fall sit beside the Nifty 50's on one footing, to the same last full week (`to`).
- Task #385 (open item 7): `weights` (each share's value now) weights every list figure by what is held: each size's share of the list and average beta, the
  size-weighted, blended and Nifty 50 betas, each size's 1 year and down- and up-week figures, the swing and worst fall, the 10 worst weeks, and each share's
  part of the list's ups and downs (`riskShare`, w_i (Σw)_i / w'Σw over the past year's weekly returns). Without weights every share counts the same.

Pure functions on plain inputs (pandas), so every figure is checked against a hand calculation in tests/test_risk_sizes_183.py. Describes past prices; not advice.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

SIZE_INDEX = {"Large": ("NIF50", "Nifty 50"), "Mid": ("NIFMID150", "Nifty Midcap 150"), "Small": ("NIFSMA250", "Nifty Smallcap 250"),
              "Micro": ("NIFMIC250", "Nifty Microcap 250")}
from ..sizes import SIZES, size_of as _site_size   # noqa: E402  task #262: the site's one rule
# Task #274 (the 20 Nov equity pack, change 17 and live text issue 7): "Compare with" picks one of these indices, and Risk at a glance's four tiles follow it
COMPARE = {"NIF50": "Nifty 50", "NIF500": "Nifty 500", "NIFMID150": "Nifty Midcap 150", "NIFSMA250": "Nifty Smallcap 250"}
YEAR_WEEKS = 52
MIN_WEEKS = 45                                  # a share needs most of a year of weekly closes for a beta
DAYS_3Y = 3 * 365
BANDS: List[Tuple[float, str, str]] = [(0.65, "less", "Less sensitive"), (0.90, "defensive", "Defensive"), (1.10, "similar", "Similar"),
                                       (1.35, "more", "More sensitive"), (1.75, "high", "High"), (math.inf, "very_high", "Very high")]


def size_of(mcap_cr: Optional[float]) -> Optional[str]:
    return _site_size(mcap_cr)


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
    d = pd.concat([y, x], axis=1, sort=True).dropna()
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
    d = pd.concat([y, x], axis=1, sort=True).dropna()
    if d.empty:
        return None, None
    dn, up = d[d.iloc[:, 1] < 0], d[d.iloc[:, 1] > 0]
    f = lambda part: float(part.iloc[:, 0].mean() / part.iloc[:, 1].mean() * 100) if len(part) and part.iloc[:, 1].mean() != 0 else None   # noqa: E731
    return f(dn), f(up)


PER_YEAR = {"daily": 252, "weekly": 52, "monthly": 12}


def grain_of(idx: pd.DatetimeIndex) -> str:
    """How far apart the closes are: daily, weekly or monthly, from the median gap between them (task #274, number fix 1)."""
    if len(idx) < 3:
        return "daily"
    gap = float(np.median(np.diff(idx.values).astype("timedelta64[D]").astype(int)))
    return "daily" if gap <= 3 else "weekly" if gap <= 8 else "monthly"


def swing_and_fall(s: pd.Series, end: pd.Timestamp) -> Dict[str, Any]:
    """Typical swing in a year (annualised volatility of returns, %) and worst fall from a high (%), over up to 3 years of closes.
    Task #274 (number fix 1): the stored share prices (price-MAX) are WEEKLY closes, and they were annualised with the daily factor (√252), which put every swing
    about 2.2 times too high (INFY 59% for a true 27%). Each series is now annualised by its own spacing (√52 for weekly), and the spacing is returned so the page
    can say what the figure rests on."""
    x = s[(s.index > end - pd.Timedelta(days=DAYS_3Y)) & (s.index <= end)]
    if len(x) < 20:
        return {"swing": None, "worstFall": None, "years": None, "grain": None}
    r = x.pct_change().dropna()
    g = grain_of(x.index)
    years = round((x.index[-1] - x.index[0]).days / 365.25, 1)
    dd = float((x / x.cummax() - 1).min() * 100)
    return {"swing": float(r.std(ddof=1) * math.sqrt(PER_YEAR[g]) * 100), "worstFall": dd, "years": years, "grain": g}


def fridays(s: pd.Series) -> pd.Series:
    """The last close of each week, dated its Friday (task #385, open item 1: the index's daily closes and the shares' weekly ones read the same way)."""
    return s.resample("W-FRI").last().dropna()


def wmean(frame: pd.DataFrame, w: Dict[str, float]) -> pd.Series:
    """Each row's average over the columns that have a figure, weighted by `w` (equal weights give the plain average)."""
    ww = pd.Series({c: float(w[c]) for c in frame.columns})
    num = frame.mul(ww, axis=1).sum(axis=1, min_count=1)
    den = frame.notna().mul(ww, axis=1).sum(axis=1)
    return num / den.replace(0, np.nan)


def risk_parts(rets: pd.DataFrame, w: Dict[str, float]) -> Dict[str, Optional[float]]:
    """Each share's part of the list's ups and downs, in %: w_i (Σw)_i / w'Σw over the weeks every share has (they add to 100)."""
    if rets.shape[1] == 1:
        return {rets.columns[0]: 100.0}
    d = rets.dropna()
    if len(d) < 10:
        return {c: None for c in rets.columns}
    v = np.array([float(w[c]) for c in d.columns])
    m = d.cov().values @ v
    tot = float(v @ m)
    if tot <= 0:
        return {c: None for c in rets.columns}
    return {c: float(x) for c, x in zip(d.columns, v * m / tot * 100)}


def r2(v: Optional[float], d: int = 2) -> Optional[float]:
    return None if v is None or not math.isfinite(float(v)) else round(float(v), d)   # plain floats (numpy values are not JSON)


def build(prices: Dict[str, Optional[dict]], index_rows: Dict[str, List[dict]], sizes: Dict[str, Optional[str]], sectors: Dict[str, str],
          weights: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    """prices: symbol -> {t, c} closes; index_rows: code -> [{d, c}] daily index closes (NIF50, NIFMID150, NIFSMA250, NIFMIC250); sizes: symbol -> Large/Mid/Small/None.
    weights: symbol -> value now (task #385, open item 7); used when every counted share has one above 0, otherwise every share counts the same."""
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
                               "beta": None, "explained": None, "band": None, "why": None, "swing": None, "worstFall": None, "years": None, "grain": None, "oneYear": None}
        if not p or not p.get("t"):
            row["why"] = "No stored prices"
            shares.append(row)
            continue
        s = daily(p["t"], p["c"])
        row.update({k: r2(v, 1) if k not in ("years", "grain") else v for k, v in swing_and_fall(fridays(s), end).items()})
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
    by_value = bool(weights) and n > 0 and all(float((weights or {}).get(x["symbol"]) or 0) > 0 for x in counted)
    raw = {x["symbol"]: (float((weights or {})[x["symbol"]]) if by_value else 1.0) for x in counted}
    tot = sum(raw.values()) or 1.0
    cw = {k: v / tot for k, v in raw.items()}                    # each counted share's part of the list (equal amounts: 1/n)
    by_size: List[Dict[str, Any]] = []
    for k in SIZES:
        xs = [x for x in counted if x["size"] == k]
        share = sum(cw[x["symbol"]] for x in xs)
        avg = float(sum(cw[x["symbol"]] * x["beta"] for x in xs) / share) if xs and share > 0 else None
        code, name = SIZE_INDEX[k]
        port = wmean(pd.concat({x["symbol"]: rets[x["symbol"]] for x in xs}, axis=1, sort=True), cw) if xs else None
        b = bw.get(code)
        dn, up = capture(port, b) if port is not None and b is not None else (None, None)
        yr = (lambda q: float((1 + q.dropna()).prod() - 1) * 100)
        by_size.append({"size": k, "benchmark": name, "n": len(xs), "avgBeta": r2(avg), "band": band_of(avg), "listShare": r2(share * 100, 1),
                        "adds": r2(avg * share if avg is not None else None), "oneYear": r2(yr(port), 1) if port is not None else None,
                        "benchOneYear": r2(yr(b), 1) if b is not None else None, "downPer100": r2(dn, 0), "upPer100": r2(up, 0)})
    weighted = sum((s["avgBeta"] or 0) * (s["listShare"] or 0) / 100 for s in by_size) if n else None
    frame = pd.concat({x["symbol"]: rets[x["symbol"]] for x in counted}, axis=1, sort=True) if counted else None
    lst = wmean(frame, cw) if frame is not None else None
    parts_of = risk_parts(frame, cw) if frame is not None else {}
    for x in shares:
        x["listShare"] = r2(cw[x["symbol"]] * 100, 1) if x["symbol"] in cw else None
        x["riskShare"] = r2(parts_of.get(x["symbol"]), 1) if x["symbol"] in cw else None
    blend = None
    if lst is not None:
        parts = [bw[SIZE_INDEX[s["size"]][0]] * ((s["listShare"] or 0) / 100) for s in by_size if s["n"] and SIZE_INDEX[s["size"]][0] in bw]
        blend = pd.concat(parts, axis=1, sort=True).sum(axis=1, min_count=1) if parts else None
    b_blend = ols_beta(lst, blend)[0] if lst is not None and blend is not None else None
    b_nifty = ols_beta(lst, bw["NIF50"])[0] if lst is not None else None

    # the list as a whole (equal amounts, or by value): swing and worst fall over 3 years of Friday closes (task #385, open item 1: the same way as the index);
    # its 10 worst weeks are the Nifty 50's 10 worst of the past year
    week_rets = {s: fridays(daily(p["t"], p["c"])).pct_change() for s, p in prices.items() if p and p.get("t") and s in rets}
    glance: Dict[str, Any] = {}
    if week_rets:
        dr = pd.concat(week_rets, axis=1, sort=True)
        dr = wmean(dr[(dr.index > end - pd.Timedelta(days=DAYS_3Y)) & (dr.index <= end)], cw).dropna()
        lvl = (1 + dr).cumprod()
        g = grain_of(dr.index)
        glance["list"] = {"swing": r2(float(dr.std(ddof=1) * math.sqrt(PER_YEAR[g]) * 100), 1), "worstFall": r2(float((lvl / lvl.cummax() - 1).min() * 100), 1),
                          "grain": g, "years": round((dr.index[-1] - dr.index[0]).days / 365.25, 1) if len(dr) > 1 else None}
    nf = swing_and_fall(fridays(nifty), end)             # task #385 open item 1: the index from its Friday closes, as the shares
    glance["nifty"] = {"swing": r2(nf["swing"], 1), "worstFall": r2(nf["worstFall"], 1), "grain": nf["grain"], "years": nf["years"]}
    nw = bw["NIF50"]
    worst = nw.nsmallest(10).index
    glance["worst10"] = {"list": r2(float(lst.reindex(worst).mean() * 100), 1) if lst is not None else None, "nifty": r2(float(nw.reindex(worst).mean() * 100), 1)}
    glance["weighted"] = r2(weighted)
    # the same figures against each index "Compare with" offers: its swing and worst fall (3 years), the list's and the index's average move in that index's
    # 10 worst weeks of the past year, and the list's beta against it. An index without closes is left out (the page falls back to the Nifty 50)
    vs: Dict[str, Any] = {}
    for code, name in COMPARE.items():
        lv = idx.get(code)
        if lv is None or lv.empty:
            continue
        sf = swing_and_fall(fridays(lv), end)
        wk = bw.get(code)                                       # the same weekly returns as every other figure here (the past year, to the last full week)
        if wk is None or wk.empty:
            continue
        w10 = wk.nsmallest(10).index
        vs[code] = {"name": name, "swing": r2(sf["swing"], 1), "worstFall": r2(sf["worstFall"], 1), "grain": sf["grain"], "years": sf["years"],
                    "worst10": {"list": r2(float(lst.reindex(w10).mean() * 100), 1) if lst is not None and len(w10) else None, "index": r2(float(wk.reindex(w10).mean() * 100), 1) if len(w10) else None},
                    "beta": r2(ols_beta(lst, wk)[0]) if lst is not None else None}
    glance["vs"] = vs
    return {"to": end.date().isoformat(), "from": (end - pd.Timedelta(weeks=YEAR_WEEKS)).date().isoformat(), "counted": n, "shares": shares, "sizes": by_size,
            "basis": "value" if by_value else "equal",
            "betas": {"weighted": r2(weighted), "blended": r2(b_blend), "nifty": r2(b_nifty), "weightedBand": band_of(weighted), "blendedBand": band_of(b_blend), "niftyBand": band_of(b_nifty)},
            "glance": glance, "ranges": [{"key": k, "word": w, "below": None if math.isinf(t) else t} for t, k, w in BANDS]}
