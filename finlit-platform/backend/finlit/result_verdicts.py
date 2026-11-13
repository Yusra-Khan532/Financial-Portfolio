"""How each company's quarter compares with similar companies (the "FinLit final pages" pack, 13 Nov 2026, boards 10 and 11: Results calendar and Latest results).

Three checks on a year ago: revenue growth, net profit growth and the change in net margin. Each is set against the typical company (the median) of the same NSE industry
this quarter: above it, close to it, or below it. The verdict follows from the balance of the three: Strong, Good, In line, Weak or Poor; Loss when the company lost money.
Company size does not change the yardstick. An NSE industry with too few declared results so far is compared with its broad group instead; a company with no NSE
industry is placed in its broad group ("Information Technology (broad group)").

The page is sent the verdict and an arrow per check, never the bands that decide them (CLAUDE.md: describe what is measured, not how it is scored)."""
from __future__ import annotations

import json
from pathlib import Path
from statistics import median
from typing import Any, Dict, List, Optional, Tuple

MIN_PEERS = 5                                   # declared results with figures an industry needs before it is its own yardstick
_BAND = {"rev": 5.0, "profit": 10.0, "margin": 0.5}   # percentage points either side of the typical company that still count as "close to typical"
CHECK_FIELD = {"rev": "revenueYoY", "profit": "profitYoY", "margin": "npmChange"}
VERDICTS = ("Strong", "Good", "In line", "Weak", "Poor", "Loss")
_CLASSES: Dict[str, Tuple[str, Optional[str]]] = {}


def _classes() -> Dict[str, Tuple[str, Optional[str]]]:
    """symbol -> (NSE industry, NSE sector), the classification Sector Pulse groups by."""
    if not _CLASSES:
        raw = json.loads((Path(__file__).resolve().parents[1] / "finlit_technicals" / "data" / "nse_industries.json").read_text(encoding="utf-8")).get("stocks") or {}
        _CLASSES.update({str(k).upper(): (v[0], v[1] if len(v) > 1 else None) for k, v in raw.items() if isinstance(v, list) and v and v[0]})
    return _CLASSES


def broad(sector: Optional[str]) -> Optional[str]:
    return f"{sector} (broad group)" if sector else None


_BOARD: Dict[str, Any] = {"rel": None, "ind": {}, "sec": {}}


def _sector_groups() -> Tuple[Dict[str, str], Dict[str, str]]:
    """The Sector Pulse groups of the live release: NSE industry -> group name, and NSE sector -> sector-group name (small industries roll up into their sector, as on
    Sector Pulse, so "Personal Products" is read as FMCG). Empty when no release is live."""
    from . import sector_data as sd
    rel = sd.live_release()
    if rel != _BOARD["rel"]:
        board = sd.read_json(rel / "sectors" / "_board.json") if rel else None
        ind: Dict[str, str] = {}
        sec: Dict[str, str] = {}
        for r in (board or {}).get("rows", []):
            if not isinstance(r, dict) or not r.get("name"):
                continue
            if r.get("kind") == "sector":
                sec[str(r["name"])] = str(r["name"])
            for i in r.get("industries") or []:
                ind[str(i)] = str(r["name"])
        _BOARD.update(rel=rel, ind=ind, sec=sec)
    return _BOARD["ind"], _BOARD["sec"]


def industry_of(symbol: str, sector: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """(the industry shown, the broad group behind it): the company's Sector Pulse group (the same 38 groups as Sector Pulse and Sector Rotation); with no group, its NSE
    industry; with no NSE industry at all, its broad group ("Information Technology (broad group)")."""
    c = _classes().get(symbol.upper())
    if not c:
        return broad(sector), broad(sector)
    ind, sec = _sector_groups()
    return ind.get(c[0]) or (sec.get(c[1]) if c[1] else None) or c[0], broad(sector)


def _arrow(v: Optional[float], typical: Optional[float], band: float) -> Optional[str]:
    if v is None or typical is None:
        return None
    return "up" if v >= typical + band else "down" if v <= typical - band else "flat"


def _verdict(checks: Dict[str, Optional[str]]) -> Optional[str]:
    got = [a for a in checks.values() if a is not None]
    if len(got) < 2:
        return None                           # one figure is not enough to judge a quarter
    score = sum(1 for a in got if a == "up") - sum(1 for a in got if a == "down")
    return "Strong" if score >= 2 else "Good" if score == 1 else "In line" if score == 0 else "Weak" if score == -1 else "Poor"


def add_verdicts(rows: List[dict]) -> None:
    """Gives every row `industry`, and every row with figures `verdict` and `checks` ({rev, profit, margin}: up / flat / down, or loss). In place."""
    groups: Dict[str, List[dict]] = {}
    for r in rows:
        ind, grp = industry_of(r["symbol"], r.get("sector"))
        r["industry"], r["_group"] = ind, grp
        if r.get("hasNumbers") and ind:
            groups.setdefault(ind, []).append(r)
            if grp and grp != ind:
                groups.setdefault(grp, []).append(r)

    def typical(name: Optional[str], field: str) -> Optional[float]:
        xs = [x[field] for x in groups.get(name or "", []) if x.get(field) is not None]
        return median(xs) if len(xs) >= MIN_PEERS else None

    cache: Dict[Tuple[str, str], Optional[float]] = {}

    def yardstick(r: dict, field: str) -> Optional[float]:
        for name in (r["industry"], r["_group"]):          # the industry; with too few declared so far, its broad group
            key = (name or "", field)
            if key not in cache:
                cache[key] = typical(name, field)
            if cache[key] is not None:
                return cache[key]
        return None

    for r in rows:
        r["verdict"] = r["checks"] = None
        if not r.get("hasNumbers"):
            continue
        checks = {k: _arrow(r.get(f), yardstick(r, f), _BAND[k]) for k, f in CHECK_FIELD.items()}
        if r.get("netProfit") is not None and r["netProfit"] < 0:
            checks["profit"] = checks["margin"] = "loss"
            r["verdict"] = "Loss"
        else:
            r["verdict"] = _verdict(checks)
        r["checks"] = checks
    for r in rows:
        r.pop("_group", None)


def industries(rows: List[dict]) -> List[Dict[str, Any]]:
    """Each NSE industry this quarter: companies, how many have declared with figures, the typical revenue and profit growth so far, and how many beat it (Strong or Good)."""
    by: Dict[str, List[dict]] = {}
    for r in rows:
        if r.get("industry") and not str(r["industry"]).endswith("(broad group)"):
            by.setdefault(r["industry"], []).append(r)
    out = []
    for name, rs in by.items():
        withnum = [r for r in rs if r.get("hasNumbers")]
        ry = [r["revenueYoY"] for r in withnum if r.get("revenueYoY") is not None]
        py = [r["profitYoY"] for r in withnum if r.get("profitYoY") is not None]
        v = [r["verdict"] for r in withnum if r.get("verdict")]
        out.append({"name": name, "companies": len(rs), "declared": sum(1 for r in rs if r["status"] != "due"), "withNumbers": len(withnum),
                    "medianRevenueYoY": round(median(ry), 1) if ry else None, "medianProfitYoY": round(median(py), 1) if py else None,
                    "beat": sum(1 for x in v if x in ("Strong", "Good")), "judged": len(v)})
    return sorted(out, key=lambda x: (-x["withNumbers"], x["name"]))


def verdict_counts(rows: List[dict]) -> Dict[str, int]:
    out = {k: 0 for k in VERDICTS}
    for r in rows:
        if r.get("verdict") in out:
            out[r["verdict"]] += 1
    return out
