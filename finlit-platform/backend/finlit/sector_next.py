"""Sector Pulse "What happened next" (task #333, developer file 30, addition 1): for each state, how often a group entered it over the last 12 months of weekly
closes, where it went next, its typical stay, and how many groups are in it now. Counting rules (file 30, "What happened next: the counting rule"):

  * each group's reading is taken at every weekly close (the last session of each week) in the window (the last 12 months);
  * a stay is a run of weeks with the same reading;
  * "times it entered" counts stays that began inside the window (a stay already running at the first week is not counted as entered);
  * "where it went next" is the reading of the following stay, counted only for stays that began inside the window and have ended;
  * "typical stay" is the median length of those ended stays, in weeks;
  * "in it now" is the number of groups whose latest stay is that reading.
Rows nobody entered and nobody is in are left out. It describes what did happen, not what will; no chance or forecast is worked out. Built once per release and
view by sector_api (the history it reads changes only when the weekly sector job publishes)."""
from __future__ import annotations

from datetime import date, timedelta
from statistics import median
from typing import Any, Dict, List, Optional

ORDER = ["washout", "thrust_cap", "thrust_c", "confirmed", "fading", "neutral"]     # Sold off first, as the file's table lists them
WINDOW_DAYS = 365


def weekly(dates: List[str], codes: List[Any]) -> List[tuple]:
    """(the week's closing date, the reading then): the last session of each ISO week."""
    out: Dict[tuple, tuple] = {}
    for d, c in zip(dates, codes):
        if not c:
            continue
        try:
            day = date.fromisoformat(str(d)[:10])
        except ValueError:
            continue
        out[day.isocalendar()[:2]] = (day.isoformat(), c)       # a later session of the same week replaces an earlier one
    return [out[k] for k in sorted(out)]


def stays(weeks: List[tuple]) -> List[Dict[str, Any]]:
    """Runs of the same reading: state, first index, length, and whether it began at the first week (not entered inside the window) or is still running."""
    out: List[Dict[str, Any]] = []
    for i, (_d, c) in enumerate(weeks):
        if out and out[-1]["state"] == c:
            out[-1]["weeks"] += 1
        else:
            out.append({"state": c, "start": i, "weeks": 1})
    for j, s in enumerate(out):
        s["entered"] = s["start"] > 0
        s["ended"] = j < len(out) - 1
        s["next"] = out[j + 1]["state"] if s["ended"] else None
    return out


def build(pages: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    series = []
    last_day: Optional[date] = None
    for p in pages:
        h = p.get("history") if isinstance(p, dict) else None
        if not isinstance(h, dict):
            continue
        dates, codes = list(h.get("dates") or []), list(h.get("state_code") or [])
        if not dates or len(dates) != len(codes):
            continue
        series.append((dates, codes))
        d = date.fromisoformat(str(dates[-1])[:10])
        last_day = d if last_day is None or d > last_day else last_day
    if not series or last_day is None:
        return None
    start = (last_day - timedelta(days=WINDOW_DAYS)).isoformat()
    rows: Dict[str, Dict[str, Any]] = {s: {"state": s, "entered": 0, "next": {}, "lengths": [], "now": 0} for s in ORDER}
    first_week: Optional[str] = None
    groups = 0
    for dates, codes in series:
        weeks = [w for w in weekly(dates, codes) if w[0] >= start]
        if len(weeks) < 2:
            continue
        groups += 1
        first_week = weeks[0][0] if first_week is None or weeks[0][0] < first_week else first_week
        ss = stays(weeks)
        for s in ss:
            r = rows.get(s["state"])
            if r is None:
                continue
            if s["entered"]:
                r["entered"] += 1
                if s["ended"]:
                    r["next"][s["next"]] = r["next"].get(s["next"], 0) + 1
                    r["lengths"].append(s["weeks"])
        if ss[-1]["state"] in rows:
            rows[ss[-1]["state"]]["now"] += 1
    out = []
    for s in ORDER:
        r = rows[s]
        if not r["entered"] and not r["now"]:
            continue
        nxt = sorted(r["next"].items(), key=lambda kv: (-kv[1], ORDER.index(kv[0]) if kv[0] in ORDER else 99))
        typical = median(r["lengths"]) if r["lengths"] else None
        out.append({"state": s, "entered": r["entered"], "ended": len(r["lengths"]), "next": [{"state": k, "n": v} for k, v in nxt],
                    "typical_weeks": (int(typical) if typical is not None and float(typical).is_integer() else typical), "now": r["now"]})
    return {"window_from": first_week, "window_to": last_day.isoformat(), "groups": groups, "rows": out}
