"""Short- and long-term trend readings for a list of holdings (the stocks inside a member's funds), from the Prism technical scores.

Port of the design package's portfolioTrend.js: pure Python. Scores run from -100 to 100; the cut-offs below and the rules behind the words stay on the
server, and `public` returns words, shares and counts only (no score, weight or cut-off). Describes price trends; not a recommendation.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

LABELS = ["Strong downtrend", "Downtrend", "Sideways", "Uptrend", "Strong uptrend"]
# Task #274 (the 20 Nov portfolio packs, change 6): plain names, the same on every portfolio page; (long term, short term), up first
CELL = {(1, 1): "Rising", (1, 0): "Rising but resting", (1, -1): "Rising but dipping", (0, 1): "Flat, turning up", (0, 0): "Flat", (0, -1): "Flat, turning down",
        (-1, 1): "Falling but bouncing", (-1, 0): "Falling but resting", (-1, -1): "Falling"}
BIZ = {"HEALTHY": "strong", "STRONG": "strong", "POOR": "weak", "WEAK": "weak"}


def _r(v: float) -> int:
    """The score as the page shows it (whole, half up), so the number, its word, its cell and the filters agree (task #274: 19.6 shows +20 and is Rising)."""
    return math.floor(v + 0.5)


def rank(v: float) -> int:
    v = _r(v)
    return 2 if v >= 50 else 1 if v >= 20 else 0 if v > -20 else -1 if v > -50 else -2


def side(v: float) -> int:
    v = _r(v)
    return 1 if v >= 20 else 0 if v > -20 else -1


def label(v: float) -> str:
    return LABELS[rank(v) + 2]


BIZ_STRONG, BIZ_WEAK = 65.0, 50.0   # the Equity portfolio pack (15 Nov, task #183): business = the FinLit Prism score, 65 or above strong, below 50 weak


def business_of(x: Dict[str, Any]) -> Optional[str]:
    """"strong" / "weak" business: from the Prism score when the item carries one (`prism`, the Equity portfolio), else from Prism's word (the funds' look-through)."""
    if x.get("prism") is not None:
        v = float(x["prism"])
        return "strong" if v >= BIZ_STRONG else "weak" if v < BIZ_WEAK else None
    return BIZ.get(x.get("prismLabel") or "")


def portfolio_trend(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """items: [{symbol, weight, st, lt, prismLabel}] (st / lt None when the company has no technical score)."""
    rated = [x for x in items if x.get("st") is not None and x.get("lt") is not None and (x.get("weight") or 0) > 0]
    tot = sum(x.get("weight") or 0 for x in items) or 1.0
    cw = sum(x["weight"] for x in rated) or 1.0
    grid = {k: {"name": v, "share": 0.0, "n": 0, "items": []} for k, v in CELL.items()}
    dirs = {"improving": 0.0, "weakening": 0.0, "steady": 0.0}
    ndir = {"improving": 0, "weakening": 0, "steady": 0}
    business: Dict[str, List[Dict[str, Any]]] = {"strong_up": [], "strong_down": [], "weak_up": [], "weak_down": []}
    mid: List[Dict[str, Any]] = []   # rated, in none of the four (task #274 change 7: the fifth box, "In between")
    up = down = st = lt = 0.0
    for x in rated:
        g = grid[(side(x["lt"]), side(x["st"]))]
        g["share"] += x["weight"]; g["n"] += 1; g["items"].append(x)
        d = rank(x["st"]) - rank(x["lt"])
        k = "improving" if d > 0 else "weakening" if d < 0 else "steady"
        dirs[k] += x["weight"]; ndir[k] += 1
        if side(x["lt"]) == 1:
            up += x["weight"]
        if side(x["lt"]) == -1:
            down += x["weight"]
        st += x["weight"] * x["st"]; lt += x["weight"] * x["lt"]
        b = business_of(x)
        t = {1: "up", -1: "down"}.get(side(x["lt"]))
        if b and t:
            business[f"{b}_{t}"].append(x)
        else:
            mid.append(x)

    def names(a):
        return [x["symbol"] for x in sorted(a, key=lambda x: -x["weight"])]
    for g in grid.values():
        g["share"] /= cw
        g["symbols"] = names(g.pop("items"))
    biz = {k: {"n": len(a), "share": sum(x["weight"] for x in a) / cw, "symbols": names(a)} for k, a in business.items()}
    between = len(mid)   # rated, but neither strong nor weak business, or a flat long-term trend

    def why(x):   # the reason each in-between share is there: its Prism score when 50 to 64 (or none), and "flat trend" when the long term is flat
        p = x.get("prism")
        return {"symbol": x["symbol"], "prism": round(float(p), 1) if p is not None else None, "flat": side(x["lt"]) == 0}
    biz_mid = {"n": len(mid), "share": sum(x["weight"] for x in mid) / cw, "items": [why(x) for x in sorted(mid, key=lambda x: -x["weight"])]}
    breadth = {"up": up / cw, "down": down / cw}
    direction = {k: v / cw for k, v in dirs.items()}
    gap = biz["strong_down"]["share"] + biz["weak_up"]["share"]
    return {
        "n": len(items), "rated": len(rated), "coverage": cw / tot if rated else 0.0,
        "grid": {f"{a},{b}": v for (a, b), v in grid.items()}, "breadth": breadth, "direction": direction, "ndirection": ndir, "business": biz, "between": between, "betweenList": biz_mid,
        "average": {"stLabel": label(st / cw), "ltLabel": label(lt / cw)} if rated else None,
        "words": {
            "longTerm": "Mostly rising" if breadth["up"] >= 0.55 else "Mostly falling" if breadth["down"] >= 0.55 else "Split",
            "shortAgainstLong": "Improving" if direction["improving"] - direction["weakening"] >= 0.15 else "Fading" if direction["weakening"] - direction["improving"] >= 0.15 else "Mixed",
            "businessAndPrice": "Out of step" if gap >= 0.3 else "Partly out of step" if gap >= 0.1 else "In step",
        },
        "gap": gap,
    }


def fund_trends(funds: List[Dict[str, Any]], tech: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """funds: [{code, w, holdings: [{stockSymbol, pct, assetClass}]}]; tech: symbol -> {st, lt, prismLabel}."""
    look: Dict[str, float] = {}
    held: Dict[str, set] = {}
    per_fund: Dict[int, Dict[str, Any]] = {}
    for f in funds:
        eq = [h for h in (f.get("holdings") or []) if h.get("assetClass") == "equity" and h.get("stockSymbol")]
        if not eq:
            continue
        per_fund[f["code"]] = portfolio_trend([{"symbol": h["stockSymbol"], "weight": h["pct"], **tech.get(h["stockSymbol"], {})} for h in eq])
        for h in eq:
            look[h["stockSymbol"]] = look.get(h["stockSymbol"], 0.0) + (h["pct"] / 100) * f["w"]
            held.setdefault(h["stockSymbol"], set()).add(f["code"])
    items = [{"symbol": s, "weight": w, **tech.get(s, {})} for s, w in look.items()]
    allt = portfolio_trend(items)
    rated_w = sum(x["weight"] for x in items if x.get("st") is not None and x.get("lt") is not None) or 1.0
    shared = sorted((x for x in items if len(held[x["symbol"]]) >= 2 and x.get("lt") is not None and side(x["lt"]) == -1), key=lambda x: -x["weight"])
    return {"all": allt, "perFund": per_fund, "sharedWeakSpots": {"n": len(shared), "share": sum(x["weight"] for x in shared) / rated_w, "symbols": [x["symbol"] for x in shared]}}


def public(t: Dict[str, Any]) -> Dict[str, Any]:
    """Words, shares and counts only. The bands behind the words and the gap figure stay on the server."""
    a = dict(t)
    a.pop("gap", None)
    return a
