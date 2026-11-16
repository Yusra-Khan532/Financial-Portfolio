"""What each Ready-made screens card shows besides its name and count (task #64, 14 Nov file, N-38): how many companies joined at the latest close,
and the first three companies on the list with one figure each. Everything comes from the stored lists the screens already serve; nothing is recomputed."""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, Iterable, List, Optional

# The figure beside each of the first three names: the screen's own score on most groups, the distance from the 52-week high on New highs,
# and the change since the company joined on Top gainers.
FIGURE_SCORE, FIGURE_FROM_HIGH, FIGURE_SINCE = "score", "from_high", "since"
SCORE_KEY = {"basic": "overall", "advanced": "prism_final"}
FIRST_N = 3


def figure_of(group: str) -> str:
    return FIGURE_FROM_HIGH if group == "setups" else FIGURE_SINCE if group == "top-gainers" else FIGURE_SCORE


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None          # NaN is no value


def first_three(rows: Iterable[dict], group: str, tab: str, lookup=None) -> List[dict]:
    """The first three rows of the stored list, in the list's own order, with the card's figure. `lookup(symbol, key)` fills a figure the row does not carry
    (the screener table), so a screen whose columns leave the score out still shows it."""
    kind = figure_of(group)
    key = "since" if kind == FIGURE_SINCE else "pct_from_high" if kind == FIGURE_FROM_HIGH else SCORE_KEY.get(tab, "overall")
    out: List[dict] = []
    for r in rows:
        sym = r.get("symbol")
        if not sym:
            continue
        v = _num(r.get(key))
        if v is None and lookup is not None:
            v = _num(lookup(sym, key))
        if v is not None:
            v = round(v, 1) if kind != FIGURE_SCORE else round(v)
        out.append({"symbol": sym, "name": r.get("name") or (lookup(sym, "name") if lookup else None) or sym, "value": v})
        if len(out) == FIRST_N:
            break
    return out


def joined_count(added: Dict[str, int], session: Optional[str], baseline: Optional[date]) -> Optional[int]:
    """Companies whose Added date is the latest close (`added`: added_on ISO date -> open spells). None when the list's close is unknown.
    The first stored close is not counted as a join: every company was already on the list when FinLit began storing lists."""
    if not session:
        return None
    if baseline is not None and session == baseline.isoformat():
        return 0
    return int(added.get(session, 0))
