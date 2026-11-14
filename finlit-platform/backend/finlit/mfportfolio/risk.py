"""Risk figures for the funds in a member's MF portfolio, from each fund's daily NAV over the last three years, set against the NIFTY 500.

For every fund: how much it swings in a typical year, its worst fall from a high, its beta to the NIFTY 500, and the share of the NIFTY 500's falls
it took (downside capture, on the days the index fell). For the whole list: its swing against the index's and one word for the risk level, with the
funds that make it so. The cut-offs behind the word stay in this file; the page gets the word, the plain figures and the reason in words.

Pure Python: no database, no network. Describes the past; not a forecast and not a recommendation. Information only, not investment advice.
"""

from __future__ import annotations

import math
import re
import statistics
from datetime import date
from typing import Any, Dict, List, Optional, Sequence, Tuple

YEARS = 3
DAYS_A_YEAR = 252
MIN_DAYS = 240            # about a year of trading days (the list line and the index need this much)
MIN_POINTS = 40           # the fewest NAVs a fund needs for its figures, and they must span about a year
WINDOW = round(365.25 * YEARS)


def window(days: Sequence[int], values: Sequence[float], end: int) -> Tuple[List[int], List[float]]:
    """The points of the last three years up to `end` (a date ordinal), oldest first, positive values only."""
    cut = end - WINDOW
    pts = [(d, v) for d, v in zip(days, values) if cut < d <= end and v and v > 0]
    return [p[0] for p in pts], [p[1] for p in pts]


def returns(values: Sequence[float]) -> List[float]:
    return [values[i] / values[i - 1] - 1.0 for i in range(1, len(values))]


def swing(rets: Sequence[float], per_year: float = DAYS_A_YEAR) -> Optional[float]:
    """How much it rises and falls in a typical year: the spread of its changes from one NAV to the next, scaled to a year by how many NAVs a year
    the series really has (a fund with gaps in its NAVs is not scaled as if it had one every trading day), in percent."""
    return None if len(rets) < 3 else statistics.stdev(rets) * math.sqrt(per_year) * 100


def per_year(days: Sequence[int]) -> float:
    """Points a year in a series of date ordinals (252 for a NAV every trading day)."""
    span = (days[-1] - days[0]) / 365.25 if len(days) > 1 else 0
    return (len(days) - 1) / span if span > 0 else DAYS_A_YEAR


def worst_fall(values: Sequence[float]) -> Optional[float]:
    """The deepest drop from a high to a later low, in percent (negative; 0 when it never fell)."""
    if len(values) < 2:
        return None
    high, worst = values[0], 0.0
    for v in values:
        high = max(high, v)
        worst = min(worst, v / high - 1.0)
    return worst * 100


def paired(fd: Sequence[int], fv: Sequence[float], bench: Dict[int, float]) -> Tuple[List[float], List[float]]:
    """Daily changes of the fund and the index between consecutive days both have a value."""
    common = [(d, v) for d, v in zip(fd, fv) if d in bench]
    f, b = [], []
    for (d0, v0), (d1, v1) in zip(common, common[1:]):
        f.append(v1 / v0 - 1.0)
        b.append(bench[d1] / bench[d0] - 1.0)
    return f, b


def beta(f: Sequence[float], b: Sequence[float]) -> Optional[float]:
    if len(f) < MIN_POINTS:
        return None
    vb = statistics.variance(b)
    if vb <= 0:
        return None
    mf, mb = statistics.fmean(f), statistics.fmean(b)
    cov = sum((x - mf) * (y - mb) for x, y in zip(f, b)) / (len(f) - 1)
    return cov / vb


def falls_taken(f: Sequence[float], b: Sequence[float]) -> Optional[float]:
    """Of the index's falls, the share the fund took: its average change on the days the index fell, over the index's average change on those days, in percent."""
    down = [(x, y) for x, y in zip(f, b) if y < 0]
    if len(down) < MIN_POINTS // 2:
        return None
    mb = statistics.fmean(y for _, y in down)
    return None if mb >= 0 else statistics.fmean(x for x, _ in down) / mb * 100


def r1(x: Optional[float], dp: int = 1) -> Optional[float]:
    return None if x is None else round(x, dp)


def fund_figures(days: Sequence[int], navs: Sequence[float], bench: Dict[int, float], end: int) -> Dict[str, Any]:
    """One fund's four figures over its last three years (or since its start, if that is between one and three years), with `why` when there are none."""
    d, v = window(days, navs, end)
    if len(v) < MIN_POINTS or (d[-1] - d[0]) < 350:
        return {"swing": None, "worstFall": None, "beta": None, "fallsTaken": None, "from": None, "to": None, "years": None,
                "why": "The fund has less than a year of daily NAVs, too short for these figures."}
    f, b = paired(d, v, bench)
    years = (d[-1] - d[0]) / 365.25
    return {"swing": r1(swing(returns(v), per_year(d))), "worstFall": r1(worst_fall(v)), "beta": r1(beta(f, b), 2), "fallsTaken": r1(falls_taken(f, b), 0),
            "from": date.fromordinal(d[0]).isoformat(), "to": date.fromordinal(d[-1]).isoformat(), "years": round(years, 1),
            "why": None if years >= YEARS - 0.05 else f"The fund is younger than three years: these figures cover its {years:.1f} years so far."}


def list_series(funds: List[Tuple[Sequence[int], Sequence[float], float]], end: int) -> Tuple[List[int], List[float]]:
    """The whole list as one line, chained from 100 over the days every fund has a NAV: from one such day to the next, each fund's change, weighted.
    Days only some funds have are skipped, so funds with NAVs on different days are never mixed."""
    pts = []
    for days, navs, w in funds:
        d, v = window(days, navs, end)
        pts.append((dict(zip(d, v)), w))
    if not pts:
        return [], []
    common = sorted(set.intersection(*(set(m) for m, _ in pts)))
    tw = sum(w for _, w in pts)
    out_d, out_v, level = [], [], 100.0
    for d0, d1 in zip(common, common[1:]):
        level *= 1.0 + sum(w * (m[d1] / m[d0] - 1.0) for m, w in pts) / tw
        out_d.append(d1)
        out_v.append(level)
    return out_d, out_v


def level_word(ratio: float) -> str:
    return ("Lower" if ratio < 0.85 else "A little lower" if ratio < 0.95 else "About the same" if ratio <= 1.05 else "A little higher" if ratio <= 1.2 else "Higher")


NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]


def because(names: List[Tuple[str, str]], of: int = 0, more: bool = True) -> Optional[str]:
    """Why the list's level is what it is, in words. names: [(short name, category)] of the funds that swing clearly more (more=True) or less than the index;
    of: how many funds have figures. 'because of the two small-cap funds', 'because of SBI Small Cap and Quant Active', 'because four of your five funds swing more than it'."""
    if not names:
        return None
    word = "more" if more else "less"
    if of > 1 and len(names) == of:
        return f"because each of your funds swings {word} than it"
    cats = {c for _, c in names if c}
    if len(cats) == 1 and len(names) > 1:
        cat = next(iter(cats)).lower().replace(" cap", "-cap")
        return f"because of the {NUM[len(names)] if len(names) < len(NUM) else len(names)} {cat} funds"
    if len(names) >= 3:
        return f"because {NUM[len(names)] if len(names) < len(NUM) else len(names)} of your {NUM[of] if of < len(NUM) else of} funds swing {word} than it"
    if len(names) == 1:
        n, c = names[0]
        return f"because of {n}" + (f" ({c.lower()})" if c else "")
    return f"because of {names[0][0]} and {names[1][0]}"


def list_level(list_swing: Optional[float], bench_swing: Optional[float], funds: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The list's risk level against the NIFTY 500. funds: [{short, category, swing}]. The funds named are the ones that swing clearly more (or less) than the index."""
    if list_swing is None or not bench_swing:
        return None
    ratio = list_swing / bench_swing
    word = level_word(ratio)
    if word in ("A little higher", "Higher"):
        who = [(f["short"], f["category"]) for f in funds if f.get("swing") is not None and f["swing"] > bench_swing * 1.15]
    elif word in ("A little lower", "Lower"):
        who = [(f["short"], f["category"]) for f in funds if f.get("swing") is not None and f["swing"] < bench_swing * 0.85]
    else:
        who = []
    of = sum(1 for f in funds if f.get("swing") is not None)
    return {"word": word, "vs": "the Nifty 500", "because": because(who, of, word in ("A little higher", "Higher")), "riskier": [n for n, _ in who] if word in ("A little higher", "Higher") else []}


ACRONYMS = {"SBI", "HDFC", "ICICI", "UTI", "DSP", "PPFAS", "IDFC", "LIC", "HSBC", "ITI", "JM", "PGIM", "WOC", "NJ", "IDBI", "BOI", "ELSS", "ETF", "PSU", "IT", "ESG", "MNC", "US"}


def short_name(name: str) -> str:
    """'HDFC Flexi Cap Fund - Growth Option - Direct Plan' -> 'HDFC Flexi Cap'; 'ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)' -> 'ICICI Prudential
    Large Cap'; 'SBI SMALL CAP FUND' -> 'SBI Small Cap'."""
    s = (name or "").split(" - ")[0]
    s = re.sub(r"\s*\([^)]*\)", "", s).strip()
    s = re.sub(r"\s+(fund|scheme)$", "", s, flags=re.I).strip()
    if s.isupper():
        s = " ".join(w if w in ACRONYMS else w.capitalize() for w in s.split())
    return s
