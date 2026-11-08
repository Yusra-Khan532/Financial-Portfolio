"""Your portfolio score: the readings of a share list weighted by the money in each share, and the one total that goes with them.

Pure Python over numbers the caller has already worked out (the heavy pandas part stays in portfolio_page.inputs / metrics). The blend that turns the
readings into the total, the points behind each reading and the cut-offs all stay in this file: `public` returns the total and the readings as words and
plain figures only. Describes the list; not a recommendation. Information only, not investment advice.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

HORIZONS = ("lt1", "1-3", "3-5", "gt5")
RISKS = ("low", "medium", "high")
GOALS = ("grow", "income", "protect")
BENCHMARKS = {"NIF50": "NIFTY 50", "NIF500": "NIFTY 500", "NIFMID150": "NIFTY Midcap 150", "NIFSMA250": "NIFTY Smallcap 250"}

# private: how the readings combine, by horizon and goal
_BASE = {"strength": 0.30, "spread": 0.20, "risk": 0.20, "trend": 0.10, "valuation": 0.10, "concentration": 0.10}
_COMFORT_BETA = {"low": 0.85, "medium": 1.0, "high": 1.2}


def word3(v: float) -> str:
    return "Strong" if v >= 70 else "Fair" if v >= 50 else "Weak"


def _wavg(pairs: List[tuple]) -> Optional[float]:
    """Weighted average of (value, weight) over the pairs that have a value; None when none do."""
    p = [(v, w) for v, w in pairs if v is not None and w > 0]
    t = sum(w for _, w in p)
    return sum(v * w for v, w in p) / t if t else None


def _weights(symbols: List[str], values: Dict[str, float]) -> Dict[str, float]:
    """Each share's weight: its share of the value entered; equal for every share when no quantity is given."""
    have = {s: values[s] for s in symbols if values.get(s, 0) > 0}
    if have:
        t = sum(have.values())
        return {s: have.get(s, 0.0) / t for s in symbols}
    return {s: 1 / len(symbols) for s in symbols}


def build(symbols: List[str], values: Dict[str, float], cards: Dict[str, Dict[str, Any]], page_score: Optional[Dict[str, Any]], market: Optional[Dict[str, Any]],
          horizon: str, risk: str, goal: str, benchmark: str, trend_fn) -> Dict[str, Any]:
    """symbols: the list; values: symbol -> rupee value (qty x last stored price), missing when unknown; cards: symbol -> prism_screen shape;
    page_score: metrics page 'score' (diversification); market: market_measures against the benchmark for the value weights, or None;
    trend_fn(items) -> trend.portfolio_trend-style dict."""
    quantities = any(values.get(s, 0) > 0 for s in symbols)
    w = _weights(symbols, values)
    total_w = {s: w[s] for s in symbols}

    # holding strength: weighted Prism score
    strength = _wavg([(cards.get(s, {}).get("prism_final"), total_w[s]) for s in symbols])
    scored_share = sum(total_w[s] for s in symbols if cards.get(s, {}).get("prism_final") is not None)
    valuation = _wavg([(cards.get(s, {}).get("prism_valuation"), total_w[s]) for s in symbols])

    # price trend (short term for a horizon under a year)
    key = "st" if horizon == "lt1" else "lt"
    items = [{"symbol": s, "weight": total_w[s], "st": cards.get(s, {}).get("prism_st_score"), "lt": cards.get(s, {}).get("prism_lt_score"), "prismLabel": cards.get(s, {}).get("prism_label")} for s in symbols]
    tr = trend_fn(items)
    rated = [x for x in items if x["st"] is not None and x["lt"] is not None and x["weight"] > 0]
    rw = sum(x["weight"] for x in rated)
    up = sum(x["weight"] for x in rated if x[key] >= 20) / rw if rw else None
    down = sum(x["weight"] for x in rated if x[key] <= -20) / rw if rw else None
    trend_points = _wavg([((x[key] + 100) / 2, x["weight"]) for x in rated])

    # concentration needs amounts
    conc = None
    if quantities:
        vs = sorted((total_w[s] for s in symbols), reverse=True)
        conc = {"top": vs[0], "top5": sum(vs[:5]), "name": max(symbols, key=lambda s: total_w[s])}

    # risk against the chosen index, judged against the person's comfort
    risk_points = None
    if market:
        beta = market["beta"]
        risk_points = max(0.0, min(100.0, 100 - (beta - _COMFORT_BETA[risk]) * 60)) if beta > _COMFORT_BETA[risk] else min(100.0, 80 + (_COMFORT_BETA[risk] - beta) * 20)

    readings: Dict[str, Any] = {}
    readings["strength"] = ({"word": word3(strength), "figure": round(strength), "scoredShare": round(scored_share, 2)} if strength is not None
                            else {"word": "Not scored", "why": "None of the shares has a stored FinLit Prism score yet."})
    readings["spread"] = ({"word": page_score["band"], "figure": page_score["score"]} if page_score else {"word": "Not enough data", "why": "Needs 3 shares with a year of weekly prices."})
    if market:
        b = market["beta"]
        c = _COMFORT_BETA[risk]
        readings["risk"] = {"word": "Above your comfort" if b > c + 0.1 else "Within your comfort" if b >= c - 0.25 else "Well within your comfort",
                            "against": "Above the index" if b > 1.1 else "Below the index" if b < 0.9 else "In line with the index", "beta": b, "benchmark": BENCHMARKS[benchmark],
                            "swing": market["vol"], "swingIndex": market["vol_nifty"], "worstFall": market["max_fall"], "worstFallIndex": market["max_fall_nifty"]}
    else:
        readings["risk"] = {"word": "Not enough data", "why": "Needs shares with a year of weekly prices."}
    if up is not None:
        readings["trend"] = {"word": tr["words"]["longTerm"] if key == "lt" else ("Mostly rising" if up >= 0.55 else "Mostly falling" if (down or 0) >= 0.55 else "Split"),
                             "term": "short" if key == "st" else "long", "upShare": round(up, 2), "downShare": round(down or 0, 2), "ratedShare": round(rw, 2)}
    else:
        readings["trend"] = {"word": "Not rated", "why": "None of the shares has a stored Prism trend reading yet."}
    readings["valuation"] = {"word": word3(valuation)} if valuation is not None else {"word": "Not scored", "why": "None of the shares has a stored Prism valuation reading yet."}
    readings["concentration"] = ({"word": "High" if conc["top"] > 0.20 else "Moderate" if conc["top"] > 0.10 else "Low", "largest": round(conc["top"], 3), "largestName": conc["name"], "topFive": round(conc["top5"], 3)}
                                 if conc else {"word": "Needs quantities", "why": "Largest holding and top five, once amounts are in."})

    # the total (private blend)
    pts = {"strength": strength, "spread": page_score["score"] if page_score else None, "risk": risk_points, "trend": trend_points, "valuation": valuation,
           "concentration": max(0.0, 100 - max(0.0, conc["top"] * 100 - 5) * 4) if conc else None}
    wt = dict(_BASE)
    if horizon == "lt1":
        wt["trend"], wt["strength"] = 0.20, 0.20
    elif horizon == "gt5":
        wt["strength"], wt["trend"] = 0.35, 0.05
    if goal == "protect":
        wt["risk"], wt["concentration"], wt["trend"] = 0.30, 0.15, 0.05
    elif goal == "income":
        wt["strength"], wt["valuation"] = 0.35, 0.15
    got = {k: v for k, v in pts.items() if v is not None}
    tw = sum(wt[k] for k in got)
    total = round(sum(wt[k] * v for k, v in got.items()) / tw) if quantities and tw else None
    coverage = (scored_share if strength is not None else 0.0)
    out = {"needsQuantities": not quantities, "total": total, "totalWhy": None if total is not None else ("Needs quantities" if not quantities else "Not enough scored shares."),
           "readings": readings, "coverage": round(coverage, 2), "confidence": "Lower" if coverage < 0.6 else "Usual", "benchmark": BENCHMARKS[benchmark]}
    if total is not None:
        out["band"] = "Strong" if total >= 70 else "Fair" if total >= 50 else "Weak"
    return out
