"""How spread a member's mutual funds are: the readings behind the Diversification section of /mf-portfolio.

Pure Python (no numpy or pandas: the website process never imports them). Inputs are data the platform already holds: each fund's category, house and
latest monthly holdings, its asset split, and the weekly NAV changes of its Growth option over a year.

The rule that turns the six readings into the overall word (the levels and the bands) stays here: `public_view` removes the levels, so the page gets words and
plain figures only. Information only, not investment advice.
"""

from __future__ import annotations

import math
import re
from datetime import date, timedelta
from typing import Any, Callable, Dict, List, Optional, Sequence

LIQUID = re.compile(r"liquid|overnight|money market", re.I)
SECTORAL = re.compile(r"sectoral|thematic", re.I)
SKIP_WORDS = re.compile(r"^(direct|regular|growth|idcw|option|plan|mutual)$", re.I)


def mean(a: Sequence[float]) -> float:
    return sum(a) / len(a)


def corr(a: Sequence[float], b: Sequence[float]) -> float:
    if not a:
        return 0.0
    ma, mb = mean(a), mean(b)
    s = sa = sb = 0.0
    for x, y in zip(a, b):
        s += (x - ma) * (y - mb)
        sa += (x - ma) ** 2
        sb += (y - mb) ** 2
    return s / math.sqrt(sa * sb) if sa and sb else 0.0


def weekly(series: Dict[str, List[Any]]) -> Dict[str, float]:
    """The last NAV of each week (weeks start on Monday), keyed by the Monday."""
    out: Dict[str, float] = {}
    for t, v in zip(series["t"], series["v"]):
        d = date.fromisoformat(t)
        out[(d - timedelta(days=d.weekday())).isoformat()] = v
    return out


def spread(funds: List[Dict[str, Any]], size_of: Callable[[Optional[str], Optional[str]], Optional[str]]) -> Dict[str, Any]:
    """funds: [{code, name, amc, category, units?, nav?, holdings: [...] | None, assetSplit: {...} | None, series: {t, v} | None}]
    size_of(isin, symbol) -> 'Large' | 'Mid' | 'Small' | None"""
    valued = all((f.get("units") or 0) > 0 and (f.get("nav") or 0) > 0 for f in funds)
    tot = sum(f["units"] * f["nav"] for f in funds) if valued else len(funds)
    for f in funds:
        f["w"] = (f["units"] * f["nav"]) / tot if valued else 1 / len(funds)

    disclosed = [f for f in funds if f.get("holdings")]
    stocks: Dict[str, Dict[str, Any]] = {}
    sectors: Dict[str, Dict[str, Any]] = {}
    size = {"Large": 0.0, "Mid": 0.0, "Small": 0.0, "Other": 0.0}
    known = 0.0
    for f in disclosed:
        for h in f["holdings"]:
            if h.get("assetClass") != "equity":
                continue
            w = (h["pct"] / 100) * f["w"]
            known += w
            k = h.get("isin") or h.get("name")
            s = stocks.setdefault(k, {"name": h.get("name"), "symbol": h.get("stockSymbol"), "sector": h.get("sector"), "w": 0.0, "funds": []})
            s["w"] += w
            if f["code"] not in s["funds"]:
                s["funds"].append(f["code"])
            sk = (h.get("sector") or "Other").lower()                   # fund houses spell some sectors differently ("It - Software")
            sec = sectors.setdefault(sk, {"name": h.get("sector") or "Other", "w": 0.0})
            sec["w"] += w
            size[size_of(h.get("isin"), h.get("stockSymbol")) or "Other"] += w
    stock_list = sorted(stocks.values(), key=lambda s: -s["w"])
    multi = [s for s in stock_list if len(s["funds"]) >= 2]

    mix = {"shares": 0.0, "sharesUnknown": 0.0, "debt": 0.0, "other": 0.0}
    for f in funds:
        a = f.get("assetSplit")
        if not a:
            mix["sharesUnknown"] += f["w"]
            continue
        t = (a.get("equity") or 0) + (a.get("debt") or 0) + (a.get("cash") or 0) + (a.get("other") or 0)
        if not t:
            mix["sharesUnknown"] += f["w"]
            continue
        mix["shares"] += f["w"] * (a.get("equity") or 0) / t
        mix["debt"] += f["w"] * ((a.get("debt") or 0) + (a.get("cash") or 0)) / t
        mix["other"] += f["w"] * (a.get("other") or 0) / t

    def eq_map(f):
        m: Dict[str, float] = {}
        for h in f["holdings"]:
            if h.get("assetClass") == "equity":
                k = h.get("isin") or h.get("name")
                m[k] = m.get(k, 0.0) + h["pct"]
        return m

    overlap: List[Dict[str, Any]] = []
    with_shares = [f for f in disclosed if any(h.get("assetClass") == "equity" for h in f["holdings"])]
    for i in range(len(with_shares)):
        for j in range(i + 1, len(with_shares)):
            a, b = eq_map(with_shares[i]), eq_map(with_shares[j])
            pct, n = 0.0, 0
            for k, v in a.items():
                if k in b:
                    pct += min(v, b[k])
                    n += 1
            overlap.append({"a": with_shares[i]["code"], "b": with_shares[j]["code"], "pct": pct, "n": n})

    # co-movement of the equity-holding funds (a liquid fund's weekly NAV change is noise; leave it out)
    moving = [f for f in funds if f.get("series") and not LIQUID.search(f.get("category") or "")]
    wk = [weekly(f["series"]) for f in moving]
    weeks = sorted(set.intersection(*(set(m) for m in wk))) if wk else []
    R = [[m[weeks[i + 1]] / m[weeks[i]] - 1 for i in range(len(weeks) - 1)] for m in wk]
    C = [[corr(a, b) for b in R] for a in R]
    fro = sum(x * x for r in C for x in r)
    independent = (len(moving) ** 2) / fro if moving and fro else 0.0     # participation ratio of the correlation matrix
    pairs = [C[i][j] for i in range(len(C)) for j in range(i + 1, len(C))]

    # theme repeats: sectoral / thematic funds sharing a theme word in their names
    words: Dict[str, List[int]] = {}
    for f in funds:
        if SECTORAL.search(f.get("category") or ""):
            for w in set(re.sub("fund", "", f["name"], count=1, flags=re.I).split()):
                if len(w) >= 3 and not SKIP_WORDS.match(w):
                    words.setdefault(w, []).append(f["code"])
    amc_words = {w for f in funds for w in (f.get("amc") or "").split()}
    themes = sorted(((w, c) for w, c in words.items() if len(c) >= 2 and w not in amc_words), key=lambda x: -len(x[1]))
    theme = themes[0] if themes else None

    houses: Dict[str, int] = {}
    for f in funds:
        houses[f.get("amc") or ""] = houses.get(f.get("amc") or "", 0) + 1
    top_house = sorted(houses.items(), key=lambda x: -x[1])[0]
    top_overlap = max(overlap, key=lambda o: o["pct"]) if overlap else None
    equity_share = mix["shares"] + mix["sharesUnknown"]

    # readings -> words (kept on the server)
    r = independent / len(moving) if moving else 1.0
    wide = bool(stock_list) and stock_list[0]["w"] < 0.03
    low_ov = top_overlap is None or top_overlap["pct"] < 15
    lean = top_house[1] / len(funds) >= 0.4
    readings = {
        "together": {"word": "Move as one" if r < 0.35 else "Move partly together" if r < 0.6 else "Move on their own", "level": 0 if r < 0.35 else 1 if r < 0.6 else 2,
                     "independent": independent, "of": len(moving), "range": [min(pairs), max(pairs)] if pairs else None},
        "underneath": {"word": "Widely spread" if wide else "Concentrated", "level": 2 if wide else 0, "stocks": len(stock_list), "inTwoOrMore": len(multi),
                       "inTwoOrMoreShare": sum(s["w"] for s in multi)},
        "overlap": {"word": "Low" if low_ov else "Moderate" if top_overlap["pct"] < 30 else "High", "level": 2 if low_ov else 1 if top_overlap["pct"] < 30 else 0, "top": top_overlap},
        "theme": {"word": "Repeated" if theme else "None", "level": 0 if theme else 2, "theme": theme[0] if theme else None, "funds": theme[1] if theme else []},
        "houses": {"word": "Leans on one" if lean else "Spread", "level": 1 if lean else 2, "top": top_house[0], "count": top_house[1]},
        "assets": {"word": "Mostly equity" if equity_share >= 0.65 else "Balanced", "level": 1 if equity_share >= 0.65 else 2, "equityShare": equity_share},
    }
    avg = mean([x["level"] for x in readings.values()])
    overall = "Widely spread" if avg >= 1.5 else "Spread" if avg >= 1.0 else "Partly spread" if avg >= 0.5 else "Concentrated"

    return {
        "basis": "value" if valued else "equal",
        "coverage": {"funds": len(funds), "disclosed": len(disclosed), "missing": [f["code"] for f in funds if not f.get("holdings")]},
        "overall": overall, "readings": readings, "mix": mix, "knownShares": known,
        "size": {k: (v / known if known else 0.0) for k, v in size.items()},
        "sectors": [{"name": s["name"], "share": s["w"] / known if known else 0.0} for s in sorted(sectors.values(), key=lambda s: -s["w"])],
        "topStocks": stock_list[:10], "overlap": overlap,
        "together": {"codes": [f["code"] for f in moving], "C": C, "weeks": max(len(weeks) - 1, 0), "from": weeks[0] if weeks else None, "to": weeks[-1] if weeks else None},
    }


def public_view(out: Dict[str, Any]) -> Dict[str, Any]:
    """What the page gets: words and plain figures, no levels and no rule."""
    r = {k: {a: b for a, b in v.items() if a != "level"} for k, v in out["readings"].items()}
    return {**out, "readings": r}
