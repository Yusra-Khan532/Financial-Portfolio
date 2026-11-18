"""Each fund against the benchmark of its own category (task #183 part 2, pack 02-mf-portfolio "Benchmark for each SEBI category", COMMON-RULES 8).

A fund's beta against the Nifty 500 misreads most funds: a small-cap fund that moved less than small companies reads "more than the market", and a hybrid
fund reads calm because half of it is debt. So each fund is set against the index of its own category, from index closes (never ETF prices):

    Large Cap -> Nifty 100            Large & Mid Cap -> Nifty LargeMidcap 250     Mid Cap -> Nifty Midcap 150      Small Cap -> Nifty Smallcap 250
    Multi Cap -> Nifty 500 Multicap 50:25:25, built from its own recipe (50% Nifty 100 + 25% Midcap 150 + 25% Smallcap 250, rebalanced each week)
    Flexi Cap, Focused, Value, Contra, Dividend Yield, ELSS, other equity -> Nifty 500
    Sectoral / Thematic -> its theme index (Nifty MNC for MNC funds, ...); the Nifty 500 tagged "Stand-in" when its theme has no index on the site
    Aggressive Hybrid -> 65% Nifty 50 + 35% debt          Balanced Advantage / Dynamic Asset Allocation -> 50% Nifty 50 + 50% debt
    Conservative Hybrid -> 25% Nifty 50 + 75% debt          Equity Savings -> 35% Nifty 50 + 65% debt
    Multi Asset Allocation -> its own latest split: shares -> Nifty 500, debt and cash -> debt, gold and other -> gold
    Index funds, fund of funds (India) -> Nifty 500 (their own index gives about 1 by design)
    Overseas fund of funds -> not compared (a different market);  liquid, overnight, money market, arbitrage and every debt fund -> not compared, 0 in the list
The site has no NSE bond index, so the debt leg is a steady rate (DEBT_RATE a year, the same every week: it moves the blend's level, not its swings), tagged
"Stand-in"; the gold leg is a gold ETF's NAV, tagged "Stand-in". Every blend is labelled as a blend.

Windows (COMMON-RULES 8): beta, how much the benchmark explains (R²), and the down- and up-week moves per 100 are over the past year of weekly closes (Friday to
Friday). Pure Python (the website process never imports numpy or pandas), so every figure is checked against a hand calculation in tests/test_mf_bench.py.
Describes past prices; not a forecast and not advice.
"""
from __future__ import annotations

import math
import re
import statistics
from datetime import date
from typing import Any, Dict, List, Optional, Sequence, Tuple

DEBT_RATE = 0.065                 # a year: the stand-in debt leg (no NSE bond index on the site)
WEEKS = 52
MIN_WEEKS = 40                    # most of a year of weekly closes for a beta
NIFTY500 = ("NIF500", "Nifty 500")
INDEX_NAME = {"NIF50": "Nifty 50", "NIF100": "Nifty 100", "NIF500": "Nifty 500", "NIFLAR250": "Nifty LargeMidcap 250", "NIFMID150": "Nifty Midcap 150",
              "NIFSMA250": "Nifty Smallcap 250", "NIFMNC": "Nifty MNC", "NIFFINSER": "Nifty Financial Services", "NIFBAN": "Nifty Bank", "NIFIT": "Nifty IT",
              "NIFHEAIND": "Nifty Healthcare", "NIFPHA": "Nifty Pharma", "NIFINF": "Nifty Infrastructure", "NIFINDCON": "Nifty India Consumption",
              "NIFPSE": "Nifty PSE", "NIFCPS": "Nifty CPSE", "NIFENE": "Nifty Energy", "NIFAUT": "Nifty Auto", "NIFFMC": "Nifty FMCG", "NIFCOM": "Nifty Commodities",
              "NIFSERSEC": "Nifty Services Sector", "NIFREA": "Nifty Realty", "NIFMET": "Nifty Metal", "NIFOILGAS": "Nifty Oil & Gas", "NIFPRIBAN": "Nifty Private Bank"}
# A thematic fund's theme from its name: the first that matches, so the narrower themes come first
THEMES: List[Tuple[str, str]] = [(r"\bmnc\b|multinational", "NIFMNC"), (r"private bank", "NIFPRIBAN"), (r"\bbank(ing)?\b|financial", "NIFFINSER"),
                                 (r"pharma", "NIFPHA"), (r"health", "NIFHEAIND"), (r"\bit\b|technology|digital|tech\b", "NIFIT"), (r"infra", "NIFINF"),
                                 (r"consumption|consumer", "NIFINDCON"), (r"\bcpse\b", "NIFCPS"), (r"\bpsu\b|\bpse\b|public sector", "NIFPSE"),
                                 (r"energy|power", "NIFENE"), (r"\bauto|mobility", "NIFAUT"), (r"\bfmcg\b", "NIFFMC"), (r"commodit", "NIFCOM"),
                                 (r"services", "NIFSERSEC"), (r"realty|real estate", "NIFREA"), (r"metal", "NIFMET"), (r"oil|gas", "NIFOILGAS")]
NOT_COMPARED = {"overnight", "liquid", "money-market", "arbitrage", "fof-overseas", "gold-etf", "silver-etf", "index-debt", "etf-debt"}
SIZE_INDEX = {"large-cap": "NIF100", "large-mid-cap": "NIFLAR250", "mid-cap": "NIFMID150", "small-cap": "NIFSMA250"}
BROAD = {"flexi-cap", "focused", "value", "contra", "dividend-yield", "elss", "equity-other", "index-funds", "fof-domestic", "etf",
         "retirement", "childrens", "life-cycle", "solution-other", "hybrid-other", "other"}
HYBRID = {"aggressive-hybrid": 0.65, "balanced-advantage": 0.50, "balanced-hybrid": 0.50, "equity-savings": 0.35, "conservative-hybrid": 0.25}
BANDS = [(0.65, "less", "Less sensitive"), (0.90, "defensive", "Defensive"), (1.10, "similar", "Similar"), (1.35, "more", "More sensitive"),
         (1.75, "high", "High"), (math.inf, "very_high", "Very high")]


def band_of(beta: Optional[float]) -> Optional[Dict[str, str]]:
    """The six ranges of the shared beta scale (the Equity portfolio's): Less sensitive below 0.65 ... Very high from 1.75."""
    if beta is None:
        return None
    return next({"key": k, "word": w} for top, k, w in BANDS if beta < top)


def pct(x: float) -> str:
    return f"{round(x * 100)}%"


def benchmark_for(tab: str, key: str, name: str, split: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    """The benchmark of one fund: {compared, name, legs: [(code | 'DEBT' | 'GOLD', weight)], standIn, why, kind}. `tab, key` from mf.classify;
    `split` the fund's latest asset split (equity / debt / cash / other, any scale) for a multi asset fund."""
    if tab == "debt" or key in NOT_COMPARED:
        why = ("an overseas fund: a different market" if key == "fof-overseas" else
               "a gold or silver fund: not a share benchmark" if key in ("gold-etf", "silver-etf") else
               "an arbitrage fund: it holds shares and their futures together, so it barely moves with the market" if key == "arbitrage" else
               "a debt fund: it barely moves with share prices")
        return {"compared": False, "name": "Not compared", "legs": [], "standIn": False, "why": f"Not compared: {why}. It counts as 0 in the list's beta.", "kind": "none"}
    if key in SIZE_INDEX:
        c = SIZE_INDEX[key]
        return {"compared": True, "name": INDEX_NAME[c], "legs": [(c, 1.0)], "standIn": False, "why": None, "kind": "index"}
    if key == "multi-cap":
        return {"compared": True, "name": "Nifty 500 Multicap 50:25:25", "legs": [("NIF100", 0.5), ("NIFMID150", 0.25), ("NIFSMA250", 0.25)], "standIn": False,
                "why": "Built from the index's own recipe: 50% Nifty 100, 25% Nifty Midcap 150 and 25% Nifty Smallcap 250.", "kind": "blend"}
    if key == "sectoral-thematic":
        low = (name or "").lower()
        hit = next((c for rx, c in THEMES if re.search(rx, low)), None)
        if hit:
            return {"compared": True, "name": INDEX_NAME[hit], "legs": [(hit, 1.0)], "standIn": False, "why": None, "kind": "index"}
        return {"compared": True, "name": NIFTY500[1], "legs": [(NIFTY500[0], 1.0)], "standIn": True,
                "why": "Stand-in: this fund's theme has no index on the site yet, so it is set against the Nifty 500.", "kind": "index"}
    if key in HYBRID:
        e = HYBRID[key]
        return {"compared": True, "name": f"{pct(e)} Nifty 50 + {pct(1 - e)} debt", "legs": [("NIF50", e), ("DEBT", 1 - e)], "standIn": True,
                "why": f"A blend close to its category's CRISIL index. The debt part is a steady {DEBT_RATE * 100:.1f}% a year: the site has no NSE bond index yet.", "kind": "blend"}
    if key == "multi-asset":
        s = {k: max(float((split or {}).get(k) or 0), 0.0) for k in ("equity", "debt", "cash", "other")}
        t = sum(s.values())
        if t <= 0:
            s, t = {"equity": 65.0, "debt": 25.0, "cash": 0.0, "other": 10.0}, 100.0
            note = "Its holdings file is not loaded, so a typical 65 / 25 / 10 mix is used. "
        else:
            note = "Weighted as its latest holdings file. "
        e, d, g = s["equity"] / t, (s["debt"] + s["cash"]) / t, s["other"] / t
        legs = [(c, w) for c, w in ((NIFTY500[0], e), ("DEBT", d), ("GOLD", g)) if w > 0]
        return {"compared": True, "name": f"{pct(e)} Nifty 500 + {pct(d)} debt + {pct(g)} gold", "legs": legs, "standIn": True,
                "why": note + f"Debt is a steady {DEBT_RATE * 100:.1f}% a year and gold a gold ETF's NAV: the site has no NSE bond or gold index yet.", "kind": "blend"}
    return {"compared": True, "name": NIFTY500[1], "legs": [(NIFTY500[0], 1.0)], "standIn": False, "why": None, "kind": "index"}


# ------------------------------------------------------------------------------------------------------------------------ weekly closes

def last_friday(end: int) -> int:
    """The last Friday on or before `end` (a date ordinal)."""
    d = date.fromordinal(end)
    return end - ((d.weekday() - 4) % 7)


def fridays(end: int, weeks: int = WEEKS) -> List[int]:
    f = last_friday(end)
    return [f - 7 * i for i in range(weeks, -1, -1)]


def weekly(days: Sequence[int], values: Sequence[float], weeks_at: Sequence[int]) -> List[Optional[float]]:
    """The close of each week: the last value on or before each Friday (None before the series starts or when the last value is over a week old)."""
    out: List[Optional[float]] = []
    j, n = 0, len(days)
    for f in weeks_at:
        while j < n and days[j] <= f:
            j += 1
        out.append(values[j - 1] if j and f - days[j - 1] < 7 and values[j - 1] > 0 else None)
    return out


def changes(closes: Sequence[Optional[float]]) -> List[Optional[float]]:
    return [None if a is None or b is None else b / a - 1.0 for a, b in zip(closes, closes[1:])]


def blend(legs: Sequence[Tuple[str, float]], leg_changes: Dict[str, List[Optional[float]]], n: int) -> List[Optional[float]]:
    """A blend's weekly change: each leg's change times its weight, rebalanced each week. The debt leg earns DEBT_RATE spread evenly over the weeks."""
    debt = (1 + DEBT_RATE) ** (1 / 52) - 1
    out: List[Optional[float]] = []
    for i in range(n):
        tot, ok = 0.0, True
        for code, w in legs:
            r = debt if code == "DEBT" else (leg_changes.get(code) or [None] * n)[i]
            if r is None:
                ok = False
                break
            tot += w * r
        out.append(tot if ok else None)
    return out


def paired(y: Sequence[Optional[float]], x: Sequence[Optional[float]]) -> Tuple[List[float], List[float]]:
    p = [(a, b) for a, b in zip(y, x) if a is not None and b is not None]
    return [a for a, _ in p], [b for _, b in p]


def ols(y: Sequence[Optional[float]], x: Sequence[Optional[float]]) -> Tuple[Optional[float], Optional[float]]:
    """(beta of y on x, R²) over the weeks both have; None with fewer than MIN_WEEKS."""
    a, b = paired(y, x)
    if len(a) < MIN_WEEKS:
        return None, None
    vb = statistics.variance(b)
    if vb <= 0:
        return None, None
    ma, mb = statistics.fmean(a), statistics.fmean(b)
    cov = sum((p - ma) * (q - mb) for p, q in zip(a, b)) / (len(a) - 1)
    va = statistics.variance(a)
    return cov / vb, (cov * cov / (va * vb) if va > 0 else None)


def capture(y: Sequence[Optional[float]], x: Sequence[Optional[float]]) -> Tuple[Optional[float], Optional[float]]:
    """How much y moved for every 100 x moved: (in x's down weeks, in x's up weeks)."""
    a, b = paired(y, x)
    dn = [(p, q) for p, q in zip(a, b) if q < 0]
    up = [(p, q) for p, q in zip(a, b) if q > 0]
    f = lambda xs: statistics.fmean(p for p, _ in xs) / statistics.fmean(q for _, q in xs) * 100 if len(xs) >= 5 else None   # noqa: E731
    return f(dn), f(up)


def year_change(ch: Sequence[Optional[float]]) -> Optional[float]:
    """The past year's change from the weekly changes, in percent; None when a week is missing."""
    if not ch or any(c is None for c in ch):
        return None
    lvl = 1.0
    for c in ch:
        lvl *= 1 + c   # type: ignore[operator]
    return (lvl - 1) * 100


def r2(v: Optional[float], d: int = 2) -> Optional[float]:
    return None if v is None or not math.isfinite(v) else round(v, d)


def risk_share(weights: Sequence[float], ch: Sequence[List[Optional[float]]]) -> List[Optional[float]]:
    """Each fund's share of the list's weekly ups and downs (its weight times its covariance with the list, over the list's variance), in percent; they
    add to 100. Weeks where any fund has no change are left out; None when the list has too few weeks."""
    rows = [i for i in range(len(ch[0]) if ch else 0) if all(c[i] is not None for c in ch)]
    if len(rows) < MIN_WEEKS:
        return [None] * len(weights)
    tw = sum(weights)
    w = [x / tw for x in weights]
    port = [sum(w[k] * ch[k][i] for k in range(len(ch))) for i in rows]   # type: ignore[operator]
    vp = statistics.variance(port)
    if vp <= 0:
        return [None] * len(weights)
    mp = statistics.fmean(port)
    out = []
    for k in range(len(ch)):
        xs = [ch[k][i] for i in rows]
        mk = statistics.fmean(xs)   # type: ignore[arg-type]
        cov = sum((x - mk) * (p - mp) for x, p in zip(xs, port)) / (len(rows) - 1)   # type: ignore[operator]
        out.append(w[k] * cov / vp * 100)
    return out


def build(funds: List[Dict[str, Any]], index_closes: Dict[str, Tuple[List[int], List[float]]], gold: Optional[Tuple[List[int], List[float]]], end: int,
          weights: Optional[List[float]] = None) -> Dict[str, Any]:
    """funds: [{code, short, typeLabel, bench (from benchmark_for), days, navs}] with daily NAV ordinals; index_closes: code -> (ordinals, closes).
    weights: the funds' values when every fund has units, else every fund counts the same. Returns the funds' figures and the list's."""
    weeks_at = fridays(end)
    n = len(weeks_at) - 1
    leg_ch: Dict[str, List[Optional[float]]] = {c: changes(weekly(d, v, weeks_at)) for c, (d, v) in index_closes.items()}
    if gold is not None:
        leg_ch["GOLD"] = changes(weekly(gold[0], gold[1], weeks_at))
    n500 = leg_ch.get(NIFTY500[0]) or [None] * n
    w = weights or [1.0] * len(funds)
    out, fch = [], []
    for f in funds:
        ch = changes(weekly(f["days"], f["navs"], weeks_at))
        fch.append(ch)
        b = f["bench"]
        row: Dict[str, Any] = {"code": f["code"], "benchmark": b["name"], "standIn": b["standIn"], "benchWhy": b["why"], "compared": b["compared"], "benchKind": b["kind"],
                               "betaOwn": None, "explained": None, "band": None, "downPer100": None, "upPer100": None, "oneYear": r2(year_change(ch), 1),
                               "benchOneYear": None, "beta500": r2(ols(ch, n500)[0]), "weeks": sum(1 for c in ch if c is not None)}
        if not b["compared"]:
            row.update(betaOwn=0.0, band=band_of(0.0))
        else:
            legs = b["legs"]
            if "GOLD" not in leg_ch and any(c == "GOLD" for c, _ in legs):        # no gold series today: its weight is shared out, and the page says so
                keep = [(c, w) for c, w in legs if c != "GOLD"]
                tot = sum(w for _, w in keep)
                legs = [(c, w / tot) for c, w in keep] if tot > 0 else keep
                row["benchWhy"] = (b["why"] or "") + " No gold NAV was available today, so the gold part is left out and the rest weighted up."
            missing = [c for c, _ in legs if c != "DEBT" and c not in leg_ch]
            bch = blend(legs, leg_ch, n) if not missing else [None] * n
            beta, rr = ols(ch, bch)
            dn, up = capture(ch, bch)
            row.update(betaOwn=r2(beta), explained=r2(rr * 100 if rr is not None else None, 0), band=band_of(beta), downPer100=r2(dn, 0), upPer100=r2(up, 0),
                       benchOneYear=r2(year_change(bch), 1))
            if beta is None:
                row["why"] = "Under a year of weekly NAVs, too short for a beta." if row["weeks"] < MIN_WEEKS else f"No {b['name']} closes for the past year."
        out.append(row)
    shares = risk_share(w, fch)
    for row, s in zip(out, shares):
        row["riskShare"] = r2(s, 1)
    tw = sum(w)
    listw = [x / tw for x in w]
    have = [r["betaOwn"] is not None for r in out]
    own = sum(lw * r["betaOwn"] for lw, r in zip(listw, out) if r["betaOwn"] is not None) if all(have) else None
    eq = [(lw, r) for lw, r in zip(listw, out) if r["compared"] and r["betaOwn"] is not None]
    ex = sum(lw * r["betaOwn"] for lw, r in eq) / sum(lw for lw, _ in eq) if eq and len(eq) == sum(1 for r in out if r["compared"]) else None
    rows = [i for i in range(n) if all(c[i] is not None for c in fch)]
    port: List[Optional[float]] = [None] * n
    for i in rows:
        port[i] = sum(listw[k] * fch[k][i] for k in range(len(fch)))   # type: ignore[operator]
    b500 = ols(port, n500)[0] if len(rows) >= MIN_WEEKS else None
    worst = sorted((i for i in range(n) if n500[i] is not None), key=lambda i: n500[i])[:10]   # type: ignore[arg-type,return-value]
    w10 = [port[i] for i in worst if port[i] is not None]
    return {"from": date.fromordinal(weeks_at[0]).isoformat(), "to": date.fromordinal(weeks_at[-1]).isoformat(), "funds": out,
            "list": {"betaOwn": r2(own), "betaOwnBand": band_of(own), "betaExLiquid": r2(ex), "betaExLiquidBand": band_of(ex), "beta500": r2(b500), "beta500Band": band_of(b500),
                     "liquidShare": r2(sum(lw for lw, r in zip(listw, out) if not r["compared"]) * 100, 1),
                     "worst10": {"list": r2(statistics.fmean(w10) * 100, 1) if len(w10) == len(worst) and worst else None,
                                 "nifty500": r2(statistics.fmean(n500[i] for i in worst) * 100, 1) if worst else None},   # type: ignore[misc]
                     "fall10": {"own": r2(-10 * own, 1) if own is not None else None, "nifty500": r2(-10 * b500, 1) if b500 is not None else None}}}
