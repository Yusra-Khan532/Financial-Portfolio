"""Tracked investors (task #289, the superinvestors developer file of 21 Nov 2026): well-known investors, each grouped with every name they file under.

The filings name an investor in different ways (Vijay Kedia files as "Vijay Kishanlal Kedia", "Vijay Kedia" and "Kedia Securities"), so the
All named holders list splits one investor into several rows and mixes them with company insiders. FinLit's editors keep a short list,
`data/tracked_investors.json`: an investor qualifies when they are an individual widely followed as a market investor, are not a promoter or
insider of the companies listed, and hold 1% or more in two or more listed companies across their names. Each entry groups the filed names.

Rules (one meaning everywhere; the README's "Rules" table):
  * Combined stake: the sum of the investor's filed names' stakes in one company, in the same filing.
  * Move: the combined stake now against the earlier filing (a year ago today; the previous quarter once quarterly history is stored).
    New stake (not named before, 1%+ now) · Stake up / Stake cut (0.01 points or more) · No longer named (named before, not now: under 1% or gone).
  * Source error: a stake above 100% or below 0 in the source. The row shows "source error" and is left out of moves and counts; a holding
    with a sound stake today stays in the portfolio, one that is only an error (no longer named from an impossible year-ago stake) is dropped.
  * Value of the change: change in points x today's market cap / 100; for "no longer named", the earlier stake x today's market cap ("about").
  * Held by 2 or more: companies where two or more tracked investors have a combined stake today.
  * Named stakes, 1 year: sum(value today x 1-year price move) / sum(value today), over the stocks named today that have a 1-year price;
    "—" when under 60% of the value has one. It is not the investor's own return: prices and dates paid, and stakes under 1%, are not filed.
  * Same-size market: sum over FinLit's four sizes of (the investor's value share in that size x the median 1-year move of all listed
    companies of that size), from the screener universe.
  * Sizes: Large above 75,000 cr, Mid 25,000 to 75,000 cr, Small 10,000 to 25,000 cr, Micro below 10,000 cr.
Pure: the same input gives the same answer. Describes; never advises.
"""
from __future__ import annotations

import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .sizes import size_of   # FinLit's four sizes, one rule site-wide (Large above 75,000 cr ... Micro below 10,000 cr)

MOVE = 0.01
MIN_STAKE = 1.0
COVER_MIN = 60.0                     # "Named stakes, 1 year" needs a 1-year price for this share of the value
SIZES = ("Large", "Mid", "Small", "Micro")
SIZE_TEXT = {"Large": "above ₹75,000 cr", "Mid": "₹25,000–75,000 cr", "Small": "₹10,000–25,000 cr", "Micro": "below ₹10,000 cr"}
MOVE_WORDS = {"new": "New stake", "added": "Stake up", "reduced": "Stake cut", "exited": "No longer named", "unchanged": "No change"}
ORDER = {"new": 0, "added": 1, "reduced": 2, "exited": 3}
CONFIG = Path(__file__).parent / "data" / "tracked_investors.json"




def load_config(path: Path = CONFIG) -> List[dict]:
    return json.loads(path.read_text())["investors"]


def _bad(x: Optional[float]) -> bool:
    return x is not None and (x > 100 or x < 0)


def status_of(now: float, ago: float) -> str:
    if now > 0 and ago <= 0:
        return "new"
    if now <= 0 and ago > 0:
        return "exited"
    d = round(now - ago, 4)          # 5.31 - 5.32 is -0.00999... in floating point: a 0.01-point cut is a cut
    if d >= MOVE:
        return "added"
    if d <= -MOVE:
        return "reduced"
    return "unchanged"


def medians(universe: Dict[str, dict]) -> Dict[str, Optional[float]]:
    """The median 1-year price move of every listed company of each size (the same-size market's parts)."""
    by: Dict[str, List[float]] = defaultdict(list)
    for u in universe.values():
        z, r = size_of(u.get("mcap")), u.get("r1")
        if z and r is not None:
            by[z].append(float(r))
    return {z: round(statistics.median(by[z]), 2) if by[z] else None for z in SIZES}


def _r(x: Optional[float], d: int = 2) -> Optional[float]:
    return None if x is None else round(x, d)


def build(cfg: List[dict], stakes: Dict[str, Dict[str, dict]], universe: Dict[str, dict], leaders: Optional[Dict[str, dict]] = None,
          med: Optional[Dict[str, Optional[float]]] = None, quotes: Optional[Dict[str, Optional[float]]] = None, since: str = "year",
          first_named: Optional[Dict[Tuple[str, str], Optional[float]]] = None) -> dict:
    """cfg: the tracked list. stakes: {filed-name key: {symbol: {"now", "ago", "asOf", "as_filed"}}} for every named public holder (any number
    of companies). universe: {symbol: {name, mcap, r1, isin, prism_label, prism_final, st, lt, sector}}. leaders: {symbol: {chip, text}}.
    med: the four sizes' median 1-year moves (worked out from the universe when not given). quotes: {symbol: market cap in crore} from today's
    quote list, which values each stake as the live page does; the universe's market cap stands in where a company has no quote today."""
    leaders = leaders or {}
    quotes = quotes or {}
    first_named = first_named or {}
    quarter = since == "quarter"     # compare with the previous quarter's filing instead of the one a year ago (each name's quarters, when stored)
    med = med if med is not None else medians(universe)
    investors: Dict[str, dict] = {}
    holders_of: Dict[str, List[str]] = defaultdict(list)       # symbol -> tracked keys named today
    bad_rows = 0
    for inv in cfg:
        key = inv["key"]
        per: Dict[str, dict] = {}
        names = []
        for fn in inv["filed_names"]:
            mine = stakes.get(fn["key"]) or {}
            names.append({"key": fn["key"], "name": fn.get("as_filed") or fn["key"], "kind": fn.get("kind") or "person",
                          "companies": sum(1 for s in mine.values() if (s.get("now") or 0) >= MIN_STAKE and not _bad(s.get("now")))})
            for sym, s in mine.items():
                row = per.setdefault(sym, {"by": [], "asOf": s.get("asOf"), "q": {}, "hasQ": True})
                qs = s.get("quarters")
                if not qs:
                    row["hasQ"] = False
                for per_, v in (qs or []):
                    if v is not None and not _bad(v):
                        row["q"][per_] = row["q"].get(per_, 0.0) + v
                then = (qs[1][1] or 0.0) if quarter and qs and len(qs) > 1 else (None if quarter else s.get("ago"))
                row["by"].append([fn["key"], s.get("now"), then])
        holdings: List[dict] = []
        for sym, row in per.items():
            if quarter and not row["hasQ"]:      # no quarterly history for this company yet: no quarter-on-quarter move to show
                row["by"] = [[b[0], b[1], b[1]] for b in row["by"]]
            bad = any(_bad(b[1]) or _bad(b[2]) for b in row["by"])
            now = sum(b[1] or 0 for b in row["by"] if not _bad(b[1]))
            ago = sum(b[2] or 0 for b in row["by"] if not _bad(b[2]))
            if bad:
                bad_rows += 1
                if now <= 0:          # only an impossible year-ago stake: nothing sound to show
                    continue
                ago_bad = any(_bad(b[2]) for b in row["by"])
                st = "unchanged"
                if ago_bad:
                    ago = now
            else:
                st = status_of(round(now, 4), round(ago, 4))
            if now <= 0 and ago <= 0:
                continue
            u = universe.get(sym) or {}
            umcap = u.get("mcap")
            mcap = quotes[sym] if sym in quotes else umcap      # a company in the quote list with no market cap today has no value
            value = round(now / 100 * mcap, 2) if mcap and now > 0 else None
            cm = mcap or umcap
            if st == "exited":
                cv = round(ago / 100 * cm, 2) if cm else None
            elif st in ("new", "added", "reduced"):
                cv = round((now - ago) / 100 * cm, 2) if cm else None
            else:
                cv = 0.0
            ld = leaders.get(sym) or {}
            holdings.append({
                "symbol": sym, "name": u.get("name") or sym, "isin": u.get("isin"), "asOf": row["asOf"],
                "stakeNow": _r(now) if now > 0 else None, "stakeThen": _r(ago) if ago > 0 else None, "changePts": None if bad else _r(now - ago),
                "move": st, "moveText": MOVE_WORDS[st], "sourceError": bad, "names": len([b for b in row["by"] if (b[1] or 0) > 0]),
                "by": [{"key": b[0], "now": b[1], "then": b[2]} for b in row["by"]],
                "valueCr": value, "changeValueCr": cv, "changeAbout": st == "exited",
                "size": size_of(umcap or mcap), "mcapCr": umcap or mcap, "return1y": u.get("r1"), "sector": u.get("sector"),
                "prism": {"label": u.get("prism_label"), "score": u.get("prism_final") if u.get("prism_label") not in (None, "Not rated") else None},
                "quarters": [[p, round(v, 2)] for p, v in _oldest_first(row["q"])][-8:] if row["hasQ"] and row["q"] else None,
                "sinceFirstNamed": _first_named(row, sym, first_named),
                "technical": {"short": u.get("st"), "long": u.get("lt")}, "peers": {"chip": ld.get("chip"), "text": ld.get("text")},
            })
        held = [h for h in holdings if h["move"] != "exited" and (h["stakeNow"] or 0) > 0]
        total = sum(h["valueCr"] or 0 for h in held)
        for h in holdings:
            h["weightPct"] = round(h["valueCr"] / total * 100, 2) if total and h["valueCr"] else None
        for h in held:
            holders_of[h["symbol"]].append(key)
        holdings.sort(key=lambda h: (h["move"] == "exited", -(h["valueCr"] or -1), h["symbol"]))
        moves = [h for h in holdings if h["move"] in ORDER and not h["sourceError"]]
        moves.sort(key=lambda h: -abs(h["changeValueCr"] or 0))
        counts = Counter(h["move"] for h in moves)
        with_r = [h for h in held if h["return1y"] is not None and h["valueCr"]]
        cov = sum(h["valueCr"] for h in with_r) / total * 100 if total else 0.0
        wr = sum(h["valueCr"] * h["return1y"] for h in with_r) / sum(h["valueCr"] for h in with_r) if with_r else None
        zmix: Dict[str, float] = defaultdict(float)
        for h in held:
            if h["size"] and h["valueCr"]:
                zmix[h["size"]] += h["valueCr"]
        zshare = {z: round(v / total * 100, 1) for z, v in zmix.items()} if total else {}
        ref = sum(zmix[z] / total * med[z] for z in zmix if med.get(z) is not None) if total else None
        secs: Dict[str, float] = defaultdict(float)
        for h in held:
            if h["valueCr"]:
                secs[h["sector"] or "Not classified"] += h["valueCr"]
        investors[key] = {
            "key": key, "name": inv["name"], "names": names, "groupedNames": len(names),
            "companies": len(held), "valueCr": round(total, 1) if total else None,
            "moves": {m: counts.get(m, 0) for m in ORDER}, "movesTotal": sum(counts.values()),
            "namedStakes1y": {"pct": _r(wr, 1) if wr is not None and cov >= COVER_MIN else None, "coverPct": round(cov),
                              "why": None if wr is not None and cov >= COVER_MIN else f"Only {round(cov)}% of the value has a 1-year price, under {COVER_MIN:g}%."},
            "sameSizeMarketPct": _r(ref, 1), "sizes": [{"size": z, "text": SIZE_TEXT[z], "pct": zshare[z], "companies": sum(1 for h in held if h["size"] == z)} for z in SIZES if z in zshare],
            "sectors": sorted(({"sector": s, "valueCr": round(v, 1), "pct": round(v / total * 100, 1), "companies": sum(1 for h in held if (h["sector"] or "Not classified") == s)} for s, v in secs.items()), key=lambda x: -x["valueCr"]),
            "top": [{"symbol": h["symbol"], "name": h["name"], "weightPct": h["weightPct"]} for h in held[:3]],
            "holdings": holdings, "moveList": moves,
        }
    # Also held by: other tracked investors named today in the same company
    for key, inv in investors.items():
        for h in inv["holdings"]:
            h["alsoHeldBy"] = [k for k in holders_of.get(h["symbol"], []) if k != key]
    agree = _agree(investors, universe, leaders)
    all_moves = sorted(({"investor": k, "investorName": inv["name"], **{f: h[f] for f in ("symbol", "name", "asOf", "move", "moveText", "stakeThen", "stakeNow", "changePts", "changeValueCr", "changeAbout", "size", "prism")}}
                        for k, inv in investors.items() for h in inv["moveList"]), key=lambda m: -abs(m["changeValueCr"] or 0))
    named = {h["symbol"] for inv in investors.values() for h in inv["holdings"] if (h["stakeNow"] or 0) > 0}
    return {
        "investors": investors, "moves": all_moves, "agree": agree, "medians": med, "sourceErrors": bad_rows,
        "tiles": {"tracked": len(investors), "companies": len(named), "moves": len(all_moves), "heldBy2": sum(1 for a in agree if len(a["heldBy"]) >= 2)},
        "moveCounts": dict(Counter(m["move"] for m in all_moves)),
    }


_MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}


def period_key(p: str) -> Tuple[int, int]:
    """'Sep 2026' (or '2026-09') -> (2026, 9), for ordering quarters; unknown shapes sort first."""
    t = str(p).strip().lower().replace("-", " ").split()
    try:
        if len(t) == 2 and t[0][:3] in _MONTHS:
            return int(t[1]), _MONTHS[t[0][:3]]
        if len(t) >= 2 and t[0].isdigit():
            return int(t[0]), int(t[1])
    except ValueError:
        pass
    return 0, 0


def _oldest_first(q: Dict[str, float]) -> List[Tuple[str, float]]:
    return sorted(q.items(), key=lambda kv: period_key(kv[0]))


def first_named_period(q: Dict[str, float]) -> Optional[str]:
    """The earliest stored quarter with a combined stake of 1% or more (the start of the unbroken run up to now)."""
    run: Optional[str] = None
    for p, v in _oldest_first(q):
        if v >= MIN_STAKE:
            run = run or p
        else:
            run = None
    return run


def _first_named(row: dict, sym: str, first_named: Dict[Tuple[str, str], Optional[float]]) -> Optional[dict]:
    if not row["hasQ"] or not row["q"]:
        return None
    p = first_named_period(row["q"])
    if p is None:
        return None
    return {"from": p, "pct": first_named.get((sym, p))}


def _agree(investors: Dict[str, dict], universe: Dict[str, dict], leaders: Dict[str, dict]) -> List[dict]:
    """One row per company any tracked investor is named in (now or a year ago), with who holds, added and cut."""
    rows: Dict[str, dict] = {}
    for k, inv in investors.items():
        for h in inv["holdings"]:
            r = rows.setdefault(h["symbol"], {"symbol": h["symbol"], "name": h["name"], "size": h["size"], "heldBy": [], "addedBy": [], "cutBy": [],
                                              "stake": 0.0, "valueCr": 0.0, "prism": h["prism"], "technical": h["technical"], "peers": h["peers"], "return1y": h["return1y"]})
            if (h["stakeNow"] or 0) > 0:
                r["heldBy"].append(k)
                r["stake"] += h["stakeNow"]
                r["valueCr"] += h["valueCr"] or 0
            if h["sourceError"]:
                continue
            if h["move"] in ("new", "added"):
                r["addedBy"].append(k)
            elif h["move"] in ("reduced", "exited"):
                r["cutBy"].append(k)
    out = []
    for r in rows.values():
        r["stake"], r["valueCr"] = round(r["stake"], 2), round(r["valueCr"], 1)
        out.append(r)
    out.sort(key=lambda r: (-len(r["heldBy"]), -r["valueCr"], r["symbol"]))
    return out


def agree_view(agree: List[dict], view: str) -> List[dict]:
    """held: two or more tracked investors named today; added: new or up for two or more; cut: cut or no longer named for two or more."""
    if view == "added":
        rows = [a for a in agree if len(a["addedBy"]) >= 2]
        return sorted(rows, key=lambda a: (-len(a["addedBy"]), -a["valueCr"], a["symbol"]))
    if view == "cut":
        rows = [a for a in agree if len(a["cutBy"]) >= 2]
        return sorted(rows, key=lambda a: (-len(a["cutBy"]), -a["valueCr"], a["symbol"]))
    return [a for a in agree if len(a["heldBy"]) >= 2]


def by_filed_name(cfg: Iterable[dict]) -> Dict[str, Dict[str, Any]]:
    """{filed-name key: {key, name}} of the tracked investor each filed name belongs to (the All named holders tab marks them)."""
    return {fn["key"]: {"key": inv["key"], "name": inv["name"]} for inv in cfg for fn in inv["filed_names"]}
