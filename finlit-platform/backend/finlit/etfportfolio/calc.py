"""Pure sums for the ETF portfolio (task #136). No database, no network.

  weights           each ETF's share of the list: by value (units x last close) once every ETF has a quantity, else the same for each
  track_of          what an ETF tracks, as a key (two ETFs with one key follow the same index) and the words the page shows
  asset_mix         Indian shares, shares abroad, gold, silver, and debt or overnight lending, weighted, from each ETF's type and monthly portfolio file
  size_mix          large, mid and small companies among the Indian shares, by the site's one size rule (passed in)
  overlap           for each pair of share ETFs: the sum over the stocks both hold of the smaller weight
  top_stocks        the biggest stocks across all the ETFs, weighted, with the ETFs that hold each
  together          how alike the weekly price moves were over the last year (correlation), liquid ETFs left out
  variance_shares   each ETF's share of the list's ups and downs: weight x covariance with the list / the list's variance
  type_of           task #183: the ETF's type (Indian shares, gold, silver, shares abroad, debt, liquid), and for liquid ETFs payout or growth

Describes the past; not a forecast and not a recommendation. Information only, not investment advice.
"""

from __future__ import annotations

import logging
import math
import re
from datetime import date, timedelta
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

log = logging.getLogger("finlit.etfportfolio.calc")

MIX_KEYS = ("indian", "abroad", "gold", "silver", "debt")
MIX_WORD = {"indian": "Indian shares", "abroad": "Shares abroad", "gold": "Gold", "silver": "Silver", "debt": "Debt or overnight lending"}
MAIN_BUCKET = {"equity": "indian", "hybrid": "indian", "international": "abroad", "gold": "gold", "silver": "silver", "debt": "debt"}
SAME_AS_CATEGORY = {"gold", "silver", "liquid"}     # every gold ETF follows the domestic gold price, every liquid ETF the overnight rate
TYPE_WORD = {"indian": "Indian shares", "gold": "Gold", "silver": "Silver", "abroad": "Shares abroad", "debt": "Debt", "liquid": "Liquid"}
TYPE_BADGE = {"indian": "I", "gold": "G", "silver": "S", "abroad": "A", "debt": "D", "liquid": "L"}
FLAT_PRICE = "pays out its earnings"                 # etf.FLAT_WHY: the site's own sign that a liquid ETF's price stays flat (a payout ETF)
YEAR_DAYS = 371
MIN_WEEKS = 20                                       # weekly changes two ETFs need in common for a correlation
MIN_DAYS = 120                                       # daily changes in common for each one's share of the swings


def type_of(category: Optional[str], asset_class: Optional[str], ret1y_why: Optional[str] = None) -> Dict[str, Any]:
    """Task #183: the type an ETF is grouped and worded by. A liquid ETF whose price the site finds flat pays out its earnings (payout); one whose price
    grows keeps them (growth): "A liquid ETF earns through payouts" is said only of the first."""
    if category == "liquid":
        payout = bool(ret1y_why and FLAT_PRICE in ret1y_why)
        return {"key": "liquid", "word": TYPE_WORD["liquid"], "badge": "L", "payout": payout}
    key = {"international": "abroad", "gold": "gold", "silver": "silver", "debt": "debt"}.get(asset_class or "", "indian")
    return {"key": key, "word": TYPE_WORD[key], "badge": TYPE_BADGE[key], "payout": None}


def weights(items: Sequence[Dict[str, Any]]) -> Tuple[Dict[str, float], str]:
    """items: [{symbol, qty, price}] -> ({symbol: weight 0..1}, "value" | "equal")."""
    if not items:
        return {}, "equal"
    valued = all((i.get("qty") or 0) > 0 and (i.get("price") or 0) > 0 for i in items)
    if valued:
        tot = sum(float(i["qty"]) * float(i["price"]) for i in items)
        return {i["symbol"]: float(i["qty"]) * float(i["price"]) / tot for i in items}, "value"
    return {i["symbol"]: 1 / len(items) for i in items}, "equal"


def tidy_benchmark(text: Optional[str]) -> Optional[str]:
    """'NASDAQ - 100 TRI' -> 'NASDAQ-100'; 'Nifty 50 Index (TRI)' -> 'Nifty 50'. None when nothing is left."""
    if not text:
        return None
    s = re.sub(r"\((?:TRI|total return[^)]*)\)", "", str(text), flags=re.I)
    s = re.sub(r"\b(?:TRI|total return index|total returns index|index)\b", "", s, flags=re.I)
    s = re.sub(r"\s*-\s*", "-", s)
    s = re.sub(r"\s+", " ", s).strip(" -,")
    return s or None


def track_of(category: Optional[str], category_label: Optional[str], index_key: Optional[str], index_label: Optional[str], benchmark: Optional[str]) -> Dict[str, Any]:
    """{key, label, basis}. The key decides "the same index twice": the index told from the stated benchmark or the name (as the ETF vs index fund page tells it),
    else the ETF's kind when every ETF of that kind follows one price (gold, silver, overnight rate), else the stated benchmark. No key: nothing to repeat."""
    if index_key:
        return {"key": f"idx:{index_key}", "label": index_label, "basis": "index"}
    if category in SAME_AS_CATEGORY:
        return {"key": f"cat:{category}", "label": category_label, "basis": "kind"}
    b = tidy_benchmark(benchmark)
    if b:
        return {"key": "bm:" + re.sub(r"[^a-z0-9]", "", b.lower()), "label": b, "basis": "benchmark"}
    return {"key": None, "label": category_label, "basis": "kind" if category_label else None}


def repeats(tracks: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """[{key, label, symbols}] for every index followed by two or more of the ETFs, in the list's order."""
    by: Dict[str, List[str]] = {}
    for sym, t in tracks.items():
        if t.get("key"):
            by.setdefault(t["key"], []).append(sym)
    return [{"key": k, "label": tracks[s[0]]["label"], "symbols": s} for k, s in by.items() if len(s) >= 2]


def asset_mix(etfs: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """etfs: [{symbol, w, assetClass, split: {equity, debt, cash, other} | None}]. The ETF's type decides where its money sits; its monthly portfolio file
    moves the part in debt and cash to "debt or overnight lending". An ETF without a file counts wholly in its type's bucket and is named in `fromType`."""
    out = {k: 0.0 for k in MIX_KEYS}
    from_type: List[str] = []
    for e in etfs:
        main = MAIN_BUCKET.get(e.get("assetClass") or "", "indian")
        a = e.get("split")
        t = sum((a or {}).get(k) or 0 for k in ("equity", "debt", "cash", "other"))
        if not a or not t or main == "debt":
            out[main] += e["w"]
            if main != "debt" and not a:
                from_type.append(e["symbol"])
            continue
        if main in ("gold", "silver") and ((a.get("other") or 0) / t) < 0.5:
            # task #276, number fix 2's guard: a metal ETF whose file was read without its metal counts wholly as its metal, and it is logged
            log.warning("ETF mix: %s (%s) parsed without its metal: %s", e.get("symbol"), main, a)
            out[main] += e["w"]
            from_type.append(e["symbol"])
            continue
        low = ((a.get("debt") or 0) + (a.get("cash") or 0)) / t
        out["debt"] += e["w"] * low
        out[main] += e["w"] * (1 - low)
    return {"shares": out, "fromType": from_type}


def _equity(holdings: Optional[Sequence[Dict[str, Any]]]) -> Dict[str, float]:
    m: Dict[str, float] = {}
    for h in holdings or []:
        if h.get("assetClass") == "equity" and h.get("pct"):
            k = h.get("isin") or (h.get("name") or "").lower()
            m[k] = m.get(k, 0.0) + float(h["pct"])
    return m


def abroad(isin: Optional[str], asset_class: Optional[str]) -> bool:
    """A stock listed abroad: its ISIN is not Indian, or (no ISIN) it sits in an international ETF."""
    return not str(isin).startswith("IN") if isin else asset_class == "international"


def size_mix(etfs: Sequence[Dict[str, Any]], size_of: Callable[[Optional[str]], Optional[str]]) -> Optional[Dict[str, Any]]:
    """Large / Mid / Small among the Indian shares the ETFs hold, weighted; None when no Indian shares are known."""
    sizes = {"Large": 0.0, "Mid": 0.0, "Small": 0.0, "Micro": 0.0, "Not sized": 0.0}   # task #262: four sizes
    for e in etfs:
        for h in e.get("holdings") or []:
            if h.get("assetClass") != "equity" or not h.get("pct") or abroad(h.get("isin"), e.get("assetClass")):
                continue
            sizes[size_of(h.get("isin")) or "Not sized"] += e["w"] * float(h["pct"]) / 100
    tot = sum(sizes.values())
    return {k: v / tot for k, v in sizes.items()} if tot else None


def overlap(etfs: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """{symbols, pairs: [{a, b, pct, n}]} over the ETFs that hold shares (their monthly files); pct in percent of the smaller weights."""
    share = [e for e in etfs if _equity(e.get("holdings"))]
    maps = {e["symbol"]: _equity(e.get("holdings")) for e in share}
    pairs = []
    for i in range(len(share)):
        for j in range(i + 1, len(share)):
            a, b = maps[share[i]["symbol"]], maps[share[j]["symbol"]]
            common = [k for k in a if k in b]
            pairs.append({"a": share[i]["symbol"], "b": share[j]["symbol"], "pct": round(min(100.0, sum(min(a[k], b[k]) for k in common)), 1), "n": len(common)})
    return {"symbols": [e["symbol"] for e in share], "pairs": pairs}


def top_stocks(etfs: Sequence[Dict[str, Any]], n: int = 8, indian_only: bool = False) -> List[Dict[str, Any]]:
    """The n biggest stocks across the ETFs: [{name, isin, symbol, industry (NSE's, or "Listed abroad"), w (0..1 of the list), etfs, abroad}]."""
    stocks: Dict[str, Dict[str, Any]] = {}
    for e in etfs:
        for h in e.get("holdings") or []:
            if h.get("assetClass") != "equity" or not h.get("pct") or (indian_only and abroad(h.get("isin"), e.get("assetClass"))):
                continue
            k = h.get("isin") or (h.get("name") or "").lower()
            s = stocks.setdefault(k, {"name": h.get("name"), "isin": h.get("isin"), "symbol": h.get("stockSymbol"), "industry": h.get("industry"), "w": 0.0, "etfs": [],
                                      "abroad": abroad(h.get("isin"), e.get("assetClass"))})
            s["w"] += e["w"] * float(h["pct"]) / 100
            s["symbol"] = s["symbol"] or h.get("stockSymbol")
            if e["symbol"] not in s["etfs"]:
                s["etfs"].append(e["symbol"])
    return sorted(stocks.values(), key=lambda s: (-s["w"], s["name"] or ""))[:n]


def look_through(etfs: Sequence[Dict[str, Any]], size_of: Callable[[Optional[str]], Optional[str]]) -> Dict[str, Any]:
    """Task #183 (COMMON-RULES 8, the MF page's grid): the Indian shares inside the ETFs as (macro sector, size) and (NSE sector, size) cells, each with its
    weight in the list, its count and every company in it biggest first; each share ETF's own split by macro sector, sector and size; the list's share in
    Indian shares the grid adds up to. A company's weight = its weight inside the ETF x the ETF's share of the list. Holdings listed abroad are left out
    (they are not compared with FinLit's readings); an ETF without a monthly file is left out, never spread over the others."""
    grid: Dict[str, Dict[str, Dict[str, Any]]] = {"macro": {}, "sector": {}}
    sec_macro: Dict[str, str] = {}
    per: Dict[str, Dict[str, Dict[str, float]]] = {}
    known = 0.0
    for e in etfs:
        for h in e.get("holdings") or []:
            if h.get("assetClass") != "equity" or not h.get("pct") or abroad(h.get("isin"), e.get("assetClass")):
                continue
            inside = float(h["pct"]) / 100
            w = e["w"] * inside
            known += w
            k = h.get("isin") or (h.get("name") or "").lower()
            sz = size_of(h.get("isin")) or "Unsized"
            macro = h.get("macroSector") or "Not classified"
            sector = h.get("sector") or macro
            sec_macro.setdefault(sector, macro)
            fs = per.setdefault(e["symbol"], {"macro": {}, "sector": {}, "size": {}})
            fs["size"][sz] = fs["size"].get(sz, 0.0) + inside
            for lvl, name in (("macro", macro), ("sector", sector)):
                cell = grid[lvl].setdefault(f"{name}|{sz}", {"w": 0.0, "stocks": {}})
                cell["w"] += w
                st = cell["stocks"].setdefault(k, {"name": h.get("name"), "symbol": h.get("stockSymbol"), "w": 0.0})
                st["w"] += w
                fs[lvl][name] = fs[lvl].get(name, 0.0) + inside
    return {"knownShares": known,
            "lookThrough": {lvl: {key: {"w": c["w"], "n": len(c["stocks"]), "stocks": sorted(c["stocks"].values(), key=lambda x: -x["w"])} for key, c in cells.items()}
                            for lvl, cells in grid.items()},
            "sectorMacro": sec_macro,
            "perEtf": {sym: {lvl: dict(sorted(v.items(), key=lambda kv: -kv[1])) for lvl, v in parts.items()} for sym, parts in per.items()}}


def abroad_top(etfs: Sequence[Dict[str, Any]], n: int = 5) -> Dict[str, List[Dict[str, Any]]]:
    """Task #183: each international ETF's n largest holdings, as filed ("Not compared with FinLit readings: listed abroad")."""
    out: Dict[str, List[Dict[str, Any]]] = {}
    for e in etfs:
        if e.get("assetClass") != "international":
            continue
        hs = sorted((h for h in e.get("holdings") or [] if h.get("assetClass") == "equity" and h.get("pct")), key=lambda h: -float(h["pct"]))[:n]
        if hs:
            out[e["symbol"]] = [{"name": h.get("name"), "isin": h.get("isin"), "pct": round(float(h["pct"]), 2)} for h in hs]
    return out


# ------------------------------------------------------------------------------------------------------------------------ moving together

def _mean(a: Sequence[float]) -> float:
    return sum(a) / len(a)


def corr(a: Sequence[float], b: Sequence[float]) -> Optional[float]:
    if len(a) < 3:
        return None
    ma, mb = _mean(a), _mean(b)
    s = sa = sb = 0.0
    for x, y in zip(a, b):
        s += (x - ma) * (y - mb)
        sa += (x - ma) ** 2
        sb += (y - mb) ** 2
    return s / math.sqrt(sa * sb) if sa and sb else None


def last_year(days: Sequence[int], vals: Sequence[float], end: int) -> Tuple[List[int], List[float]]:
    pts = [(d, v) for d, v in zip(days, vals) if end - YEAR_DAYS < d <= end and v and v > 0]
    return [p[0] for p in pts], [p[1] for p in pts]


def week_closes(days: Sequence[int], vals: Sequence[float]) -> Dict[int, float]:
    """The last close of each week (weeks start on Monday), keyed by the Monday's ordinal."""
    out: Dict[int, float] = {}
    for d, v in zip(days, vals):
        out[d - date.fromordinal(d).weekday()] = v
    return out


def together(series: Dict[str, Tuple[Sequence[int], Sequence[float]]], end: int) -> Dict[str, Any]:
    """series: {symbol: (days, closes)} of the ETFs to compare (liquid ETFs already left out). Each pair over the weeks both have, last year."""
    wk = {s: week_closes(*last_year(d, v, end)) for s, (d, v) in series.items()}
    syms = list(series)
    pairs, weeks_used = [], []
    for i in range(len(syms)):
        for j in range(i + 1, len(syms)):
            a, b = wk[syms[i]], wk[syms[j]]
            common = sorted(set(a) & set(b))
            ra = [a[common[k + 1]] / a[common[k]] - 1 for k in range(len(common) - 1)]
            rb = [b[common[k + 1]] / b[common[k]] - 1 for k in range(len(common) - 1)]
            c = corr(ra, rb) if len(ra) >= MIN_WEEKS else None
            pairs.append({"a": syms[i], "b": syms[j], "r": None if c is None else round(c, 2), "weeks": len(ra),
                          "why": None if c is not None else "Fewer than 20 weeks of prices in common in the last year."})
            if common:
                weeks_used += [common[0], common[-1]]
    return {"symbols": syms, "pairs": pairs, "from": date.fromordinal(min(weeks_used)).isoformat() if weeks_used else None,
            "to": (date.fromordinal(max(weeks_used)) + timedelta(days=4)).isoformat() if weeks_used else None}


def variance_shares(series: Dict[str, Tuple[Sequence[int], Sequence[float]]], w: Dict[str, float], end: int) -> Dict[str, Any]:
    """Each ETF's share of the list's ups and downs over the last year, from daily changes on the days every ETF has a close.
    share_i = w_i x cov(r_i, r_list) / var(r_list), in percent; the shares add up to 100."""
    maps = {s: dict(zip(*last_year(d, v, end))) for s, (d, v) in series.items()}
    if not maps or any(not m for m in maps.values()):
        return {"shares": {}, "days": 0, "why": "Some of your ETFs have no prices in the last year."}
    common = sorted(set.intersection(*(set(m) for m in maps.values())))
    if len(common) - 1 < MIN_DAYS:
        return {"shares": {}, "days": max(len(common) - 1, 0), "why": "Your ETFs share too few trading days in the last year to split the swings between them."}
    tw = sum(w[s] for s in maps)
    rets = {s: [m[common[k + 1]] / m[common[k]] - 1 for k in range(len(common) - 1)] for s, m in maps.items()}
    lst = [sum(w[s] / tw * rets[s][k] for s in rets) for k in range(len(common) - 1)]
    ml = _mean(lst)
    var = sum((x - ml) ** 2 for x in lst) / (len(lst) - 1)
    if var <= 0:
        return {"shares": {}, "days": len(lst), "why": "Your list's price did not move, so there are no swings to split."}
    out = {}
    for s, r in rets.items():
        mr = _mean(r)
        cov = sum((x - mr) * (y - ml) for x, y in zip(r, lst)) / (len(lst) - 1)
        out[s] = round(w[s] / tw * cov / var * 100, 1)
    return {"shares": out, "days": len(lst), "why": None, "from": date.fromordinal(common[0]).isoformat(), "to": date.fromordinal(common[-1]).isoformat()}
