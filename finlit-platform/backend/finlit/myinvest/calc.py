"""All my investments (task #137): the member's shares and mutual funds read together, looking through each fund to the companies inside it.

Pure Python: no database, no network. Inputs are plain dicts gathered by api.py from the lists the member already keeps (Equity portfolio, MF portfolio) and
from the data the portfolio pages already use. ETFs are not here yet: the ETF portfolio does not exist, and the page says so (founder, 15 Nov 2026).

Weights. A part (shares, mutual funds) is "valued" when every holding in it has a quantity and a price. Inside a valued part each holding weighs its value;
inside a part without quantities each holding counts the same. Across parts the money decides only when every part is valued; otherwise each part counts
the same, and the page says so.

Look-through. A company's weight = its direct weight + the sum over funds of (fund weight x the company's share of that fund's net assets). Only the fund's
equity holdings matched to a listed company are counted as companies; the rest of a fund sits in its asset split (debt, cash, other).

Describes the past and the present mix; not a forecast and not a recommendation. Information only, not investment advice.
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Optional, Sequence, Tuple

WEEKS_A_YEAR = 52
YEARS = 3
MIN_WEEKS = 50          # about a year of weekly points before any risk figure is given
STALE_DAYS = 10         # a price older than this on a grid date is no price
SECTOR_FLAG = 25.0      # % of everything: the insight rule "a sector over 25% of everything"
SOFTEN_SHARE = 10.0     # % in debt, cash and other before the "softening" insight is considered


def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None


# ------------------------------------------------------------------------------------------------ weights

def part_weights(items: List[Dict[str, Any]], qty_key: str, price_key: str) -> Tuple[bool, Optional[float], List[float]]:
    """(valued, total value or None, each item's weight inside the part). Valued only when every item has a quantity above 0 and a price."""
    if not items:
        return False, None, []
    vals = [(_num(i.get(qty_key)) or 0) * (_num(i.get(price_key)) or 0) for i in items]
    valued = all((_num(i.get(qty_key)) or 0) > 0 and (_num(i.get(price_key)) or 0) > 0 for i in items)
    if valued and sum(vals) > 0:
        tot = sum(vals)
        return True, tot, [v / tot for v in vals]
    return False, None, [1 / len(items)] * len(items)


def split_parts(shares: List[Dict[str, Any]], funds: List[Dict[str, Any]]) -> Dict[str, Any]:
    """The weight of each part of everything, and how it was decided."""
    sv, stot, sw = part_weights(shares, "qty", "price")
    fv, ftot, fw = part_weights(funds, "units", "nav")
    present = [k for k, items in (("shares", shares), ("funds", funds)) if items]
    by_value = bool(present) and all({"shares": sv, "funds": fv}[k] for k in present)
    if by_value:
        total = (stot or 0) + (ftot or 0)
        pw = {"shares": (stot or 0) / total if total else 0, "funds": (ftot or 0) / total if total else 0}
    else:
        pw = {k: (1 / len(present) if k in present else 0) for k in ("shares", "funds")}
        total = None
    return {"byValue": by_value, "total": total, "part": pw, "shares": {"valued": sv, "value": stot, "w": sw}, "funds": {"valued": fv, "value": ftot, "w": fw}}


# ------------------------------------------------------------------------------------------------ look-through

def look_through(shares: List[Dict[str, Any]], funds: List[Dict[str, Any]], split: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Every company counted once: its weight held directly and through funds (both as % of everything), largest first.
    shares: [{symbol, name}], funds: [{code, name, holdings: [{stockSymbol, name, assetClass, pct}]}]."""
    rows: Dict[str, Dict[str, Any]] = {}
    ps, pf = split["part"]["shares"], split["part"]["funds"]

    def row(sym: str, name: str) -> Dict[str, Any]:
        return rows.setdefault(sym, {"symbol": sym, "name": name, "direct": 0.0, "funds": 0.0, "etfs": 0.0, "via": []})

    for s, w in zip(shares, split["shares"]["w"]):
        row(s["symbol"], s.get("name") or s["symbol"])["direct"] += ps * w * 100
    for f, w in zip(funds, split["funds"]["w"]):
        for h in f.get("holdings") or []:
            sym, pct = h.get("stockSymbol"), _num(h.get("pct"))
            if not sym or pct is None or (h.get("assetClass") or "equity") != "equity":
                continue
            r = row(sym, h.get("name") or sym)
            r["funds"] += pf * w * pct
            if f.get("code") not in r["via"]:
                r["via"].append(f.get("code"))
    out = []
    for r in rows.values():
        r["all"] = r["direct"] + r["funds"] + r["etfs"]
        r["twice"] = r["direct"] > 0 and (r["funds"] > 0 or r["etfs"] > 0)
        r["ways"] = (r["direct"] > 0) + (r["funds"] > 0) + (r["etfs"] > 0)
        out.append(r)
    return sorted(out, key=lambda r: (-r["all"], r["symbol"]))


def asset_mix(shares: List[Dict[str, Any]], funds: List[Dict[str, Any]], split: Dict[str, Any]) -> Dict[str, float]:
    """% of everything in equity, debt, cash and other (gold sits in other where a fund house files it so). Shares are all equity; each fund adds its
    monthly asset split; a fund with no split is counted as 'not known'."""
    mix: Dict[str, float] = defaultdict(float)
    mix["equity"] += split["part"]["shares"] * 100 if shares else 0
    for f, w in zip(funds, split["funds"]["w"]):
        part = split["part"]["funds"] * w * 100
        a = f.get("assetSplit") or {}
        known = {k: _num(a.get(k)) for k in ("equity", "debt", "cash", "other")}
        if not any(v is not None for v in known.values()):
            mix["unknown"] += part
            continue
        tot = sum(v for v in known.values() if v is not None) or 100
        for k, v in known.items():
            if v:
                mix[k] += part * v / tot
    return {k: round(v, 4) for k, v in mix.items() if v > 0}


def sectors(rows: List[Dict[str, Any]], sector_of: Dict[str, Optional[str]], bench: Dict[str, float]) -> List[Dict[str, Any]]:
    """Each sector's % of everything, counted through funds, against its % of the NIFTY 500 by market value. Companies without a sector go to
    'No sector on record'."""
    mine: Dict[str, float] = defaultdict(float)
    for r in rows:
        mine[sector_of.get(r["symbol"]) or "No sector on record"] += r["all"]
    keys = sorted(set(mine) | {k for k, v in bench.items() if v >= 1}, key=lambda k: (-mine.get(k, 0), -bench.get(k, 0), k))
    return [{"sector": k, "mine": round(mine.get(k, 0), 2), "bench": round(bench[k], 2) if k in bench else None} for k in keys]


def bench_sectors(members: List[Dict[str, Any]]) -> Dict[str, float]:
    """The NIFTY 500's sector split by market value of its companies: [{sector, mcap}] -> {sector: %}."""
    by: Dict[str, float] = defaultdict(float)
    for m in members:
        v = _num(m.get("mcap"))
        if v and v > 0:
            by[m.get("sector") or "No sector on record"] += v
    tot = sum(by.values())
    return {k: v / tot * 100 for k, v in by.items()} if tot else {}


def fund_overlap(funds: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The highest overlap between two of the member's funds: the share of net assets in the same companies, sum over common companies of the smaller weight."""
    best = None
    eq = [(f, {h["stockSymbol"]: _num(h.get("pct")) or 0 for h in f.get("holdings") or [] if h.get("stockSymbol") and (h.get("assetClass") or "equity") == "equity"}) for f in funds]
    for i in range(len(eq)):
        for j in range(i + 1, len(eq)):
            a, b = eq[i][1], eq[j][1]
            ov = sum(min(a[k], b[k]) for k in set(a) & set(b))
            if best is None or ov > best["pct"]:
                best = {"pct": round(ov, 1), "a": eq[i][0].get("short") or eq[i][0].get("name"), "b": eq[j][0].get("short") or eq[j][0].get("name")}
    return best


def weighted_mean(values: Sequence[Optional[float]], weights: Sequence[float]) -> Optional[float]:
    pairs = [(v, w) for v, w in zip(values, weights) if v is not None]
    tw = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / tw if pairs and tw else None


# ------------------------------------------------------------------------------------------------ risk: weekly, against the NIFTY 500

def weekly_grid(bench: Dict[int, float], end: int) -> List[int]:
    """The last trading day of each week in the three years to `end` (ordinal days), from the index's own days."""
    start = end - round(365.25 * YEARS)
    last: Dict[Tuple[int, int], int] = {}
    for d in sorted(k for k in bench if start <= k <= end):
        iso = date.fromordinal(d).isocalendar()
        last[(iso[0], iso[1])] = d
    return sorted(last.values())


def on_grid(days: Sequence[int], values: Sequence[float], grid: Sequence[int]) -> List[Optional[float]]:
    """The last value on or before each grid day, no older than STALE_DAYS; None where there is none."""
    out: List[Optional[float]] = []
    i, n = 0, len(days)
    for g in grid:
        while i < n and days[i] <= g:
            i += 1
        out.append(values[i - 1] if i and g - days[i - 1] <= STALE_DAYS else None)
    return out


def rets(levels: Sequence[Optional[float]]) -> List[Optional[float]]:
    return [None] + [(b / a - 1) if a and b else None for a, b in zip(levels, levels[1:])]


def blend(series: List[List[Optional[float]]], weights: List[float]) -> List[Optional[float]]:
    """A weighted weekly return; each week uses the holdings that have a return that week, their weights re-scaled to 1."""
    if not series:
        return []
    out: List[Optional[float]] = []
    for t in range(len(series[0])):
        have = [(s[t], w) for s, w in zip(series, weights) if s[t] is not None and w > 0]
        tw = sum(w for _, w in have)
        out.append(sum(r * w for r, w in have) / tw if have and tw else None)
    return out


def worst_fall(rs: Sequence[Optional[float]]) -> Optional[float]:
    level, peak, worst = 1.0, 1.0, 0.0
    seen = False
    for r in rs:
        if r is None:
            continue
        seen = True
        level *= 1 + r
        peak = max(peak, level)
        worst = min(worst, level / peak - 1)
    return worst * 100 if seen else None


def risk_figures(port: List[Optional[float]], bench: List[Optional[float]]) -> Optional[Dict[str, Any]]:
    """Swing a year (%), worst fall (%), beta and falls taken (%) of a weekly return line against the index's, on the weeks both have."""
    pairs = [(p, b) for p, b in zip(port, bench) if p is not None and b is not None]
    if len(pairs) < MIN_WEEKS:
        return None
    ps, bs = [p for p, _ in pairs], [b for _, b in pairs]
    var_b = statistics.pvariance(bs)
    cov = sum((p - statistics.fmean(ps)) * (b - statistics.fmean(bs)) for p, b in pairs) / len(pairs)
    down = [(p, b) for p, b in pairs if b < 0]
    return {"swing": statistics.pstdev(ps) * math.sqrt(WEEKS_A_YEAR) * 100, "benchSwing": statistics.pstdev(bs) * math.sqrt(WEEKS_A_YEAR) * 100,
            "worstFall": worst_fall(ps), "benchWorstFall": worst_fall(bs), "beta": cov / var_b if var_b else None,
            "fallsTaken": (statistics.fmean([p for p, _ in down]) / statistics.fmean([b for _, b in down]) * 100) if down and statistics.fmean([b for _, b in down]) else None,
            "weeks": len(pairs), "worstWeek": min(ps) * 100, "benchWorstWeek": min(bs) * 100}


def swing_shares(parts: Dict[str, List[Optional[float]]], part_w: Dict[str, float], port: List[Optional[float]]) -> List[Dict[str, Any]]:
    """Each part's share of the ups and downs: weight x cov(part, everything) / var(everything), so the shares add up to 100%."""
    idx = [t for t, p in enumerate(port) if p is not None and all(s[t] is not None for k, s in parts.items() if part_w.get(k))]
    if len(idx) < MIN_WEEKS:
        return []
    pv = [port[t] for t in idx]
    mp, var_p = statistics.fmean(pv), statistics.pvariance(pv)
    out = []
    for k, s in parts.items():
        w = part_w.get(k, 0)
        if not w:
            continue
        sv = [s[t] for t in idx]
        cov = sum((a - statistics.fmean(sv)) * (b - mp) for a, b in zip(sv, pv)) / len(idx)
        out.append({"part": k, "money": round(w * 100, 1), "swings": round(w * cov / var_p * 100, 1) if var_p else None})
    return out


# ------------------------------------------------------------------------------------------------ insights (up to three, by these rules only)

PART_WORD = {"shares": "shares", "funds": "mutual funds", "etfs": "ETFs"}


def insights(sector_rows: List[Dict[str, Any]], companies: List[Dict[str, Any]], mix: Dict[str, float], risk: Optional[Dict[str, Any]]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    big = [s for s in sector_rows if s["mine"] > SECTOR_FLAG and s["sector"] != "No sector on record"]
    if big:
        s = big[0]
        vs = f", against {s['bench']:.0f}% of the Nifty 500" if s.get("bench") is not None else ""
        out.append({"id": "sector", "title": f"{s['sector']} is {s['mine']:.0f}% of everything", "text": f"Counted through your funds, {s['sector']} is {s['mine']:.0f}% of all you hold{vs}."})
    three = [c for c in companies if c["ways"] >= 3]
    if three:
        c = three[0]
        out.append({"id": "three", "title": f"{c['name']} is owned three ways", "text": f"You hold {c['name']} directly, through your funds and through your ETFs: {c['all']:.1f}% of everything together."})
    soft = mix.get("debt", 0) + mix.get("cash", 0) + mix.get("other", 0)
    if risk and soft >= SOFTEN_SHARE and risk.get("worstWeek") is not None and risk.get("benchWorstWeek") is not None and risk["worstWeek"] > risk["benchWorstWeek"]:
        out.append({"id": "soften", "title": "Debt, cash and gold softened the worst week",
                    "text": f"With {soft:.0f}% outside shares, your worst week in three years was {risk['worstWeek']:.1f}%, against {risk['benchWorstWeek']:.1f}% for the Nifty 500."})
    return out[:3]
