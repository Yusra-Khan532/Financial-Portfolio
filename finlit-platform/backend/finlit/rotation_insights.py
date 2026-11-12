"""The insight cards under the two Sector Rotation charts "Who is ahead, and which way they are moving" and "Six months of ranks" (9 Nov 2026 pages update).

Worked out here, on the server, from the rows of the rotation map the nightly run wrote; the page only shows the title and the sentence. They describe what happened and never
what to do. Nothing that says how a corner or a rank is decided goes into the text: only the industry names and plain numbers (places, percentage points).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

MOVE_PTS = 0.5       # a change of direction needs at least this many points the other way last month (the reference page's rule)


def _num(x: Any) -> Optional[float]:
    return float(x) if isinstance(x, (int, float)) and x == x else None


def _vs(row: dict, key: str) -> Optional[float]:
    return _num((row.get("vs_average") or {}).get(key))


def six_month(row: dict) -> Optional[float]:
    return _vs(row, "126d")


def last_month(row: dict) -> Optional[float]:
    return _vs(row, "21d")


def changed_direction(row: dict) -> bool:
    """Ahead of the average industry over six months but behind it last month (or the other way round), by at least MOVE_PTS."""
    s, m = six_month(row), last_month(row)
    return s is not None and m is not None and ((s > 0 and m <= -MOVE_PTS) or (s < 0 and m >= MOVE_PTS))


def _pts(x: float) -> str:
    return f"{abs(x):.1f} points"


def _names(rows: List[dict], n: int = 3) -> str:
    names = [r["name"] for r in rows[:n]]
    more = len(rows) - len(names)
    s = ", ".join(names[:-1]) + (" and " if len(names) > 1 else "") + names[-1]
    return s + (f" and {more} more" if more > 0 else "")


def ahead_insights(rows: List[dict]) -> List[dict]:
    out: List[dict] = []
    usable = [r for r in rows if six_month(r) is not None and last_month(r) is not None]
    slipped = sorted((r for r in usable if six_month(r) > 0 and last_month(r) <= -MOVE_PTS), key=lambda r: -six_month(r))
    gained = sorted((r for r in usable if six_month(r) < 0 and last_month(r) >= MOVE_PTS), key=lambda r: six_month(r))
    if slipped:
        out.append({"kind": "watch", "title": "Leaders that slipped last month", "text": f"{_names(slipped)} {'is' if len(slipped) == 1 else 'are'} still ahead of the average industry over six months but behind it over the last month."})
    if gained:
        out.append({"kind": "insight", "title": "Laggards that gained", "text": f"{_names(gained)} {'is' if len(gained) == 1 else 'are'} still behind the average industry over six months but ahead of it over the last month."})
    if usable:
        big = max(usable, key=lambda r: abs(last_month(r)))
        m = last_month(big)
        out.append({"kind": "insight", "title": "The biggest move last month", "text": f"{big['name']} moved {_pts(m)} {'ahead of' if m > 0 else 'behind'} the average industry over the last month, the largest of the {len(usable)} industries."})
    if not slipped and not gained and usable:
        out.append({"kind": "good", "title": "No change of direction", "text": "No industry changed direction against the average industry last month."})
    return out[:4]


def _history(row: dict) -> List[int]:
    return [h["rank"] for h in row.get("rank_history") or [] if isinstance(h, dict) and isinstance(h.get("rank"), int)]


def rank_insights(rows: List[dict]) -> List[dict]:
    out: List[dict] = []
    series = [(r, _history(r)) for r in rows]
    series = [(r, h) for r, h in series if len(h) >= 8]
    if not series:
        return out
    climb = max(series, key=lambda x: x[1][0] - x[1][-1])
    d = climb[1][0] - climb[1][-1]
    if d > 0:
        out.append({"kind": "good", "title": "Biggest climb", "text": f"{climb[0]['name']} climbed {d} {'place' if d == 1 else 'places'} over the period, from rank {climb[1][0]} to rank {climb[1][-1]}."})
    top = [(r, h) for r, h in series if h[-1] <= 5]
    if top:
        steady = min(top, key=lambda x: (max(x[1]) - min(x[1]), x[1][-1]))
        span = max(steady[1]) - min(steady[1])
        out.append({"kind": "insight", "title": "Steadiest in the top 5", "text": f"{steady[0]['name']} stayed within {span} {'place' if span == 1 else 'places'} over the period."})
    fall = min(series, key=lambda x: x[1][0] - x[1][-1])
    f = fall[1][-1] - fall[1][0]
    if f > 0:
        out.append({"kind": "warning", "title": "Biggest fall", "text": f"{fall[0]['name']} fell {f} {'place' if f == 1 else 'places'} over the period, from rank {fall[1][0]} to rank {fall[1][-1]}."})
    return out[:3]


def rotation_insights(rows: List[dict]) -> Dict[str, List[dict]]:
    return {"ahead": ahead_insights(rows), "ranks": rank_insights(rows)}
