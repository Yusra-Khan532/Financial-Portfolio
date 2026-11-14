"""The data behind two Sector Pulse charts of the 9 Nov 2026 pages update: "The market's mood, day by day" and "Six months of every industry".

Both are drawn from what the nightly run already wrote: every industry page carries its state for each trading day (`history.state_code`). This module lines those up on one calendar for the last
six months and works the insight cards out here, on the server; the page only shows the words. State names are the plain ones (Sold off, Bouncing back, Rising together, Losing steam, No clear
signal). Nothing here says how a state is decided, and nothing is advice.
"""
from __future__ import annotations

from datetime import date as _date
from typing import Any, Dict, List, Optional, Sequence

DAYS = 126                       # about six months of trading sessions
# The "FinLit final pages" pack (13 Nov 2026) keeps "Bouncing back after a crash" apart from "Bouncing back" in the mood chart and the state table, so the two have their own key;
# every sentence that says "bouncing back" counts both (BOUNCE).
KEYS = ("sold_off", "crash", "bouncing", "rising", "losing", "no_signal")
WORD = {"sold_off": "Sold off", "crash": "Bouncing back after a crash", "bouncing": "Bouncing back", "rising": "Rising together", "losing": "Losing steam", "no_signal": "No clear signal"}
OF_CODE = {"washout": "sold_off", "thrust_c": "bouncing", "thrust_cap": "crash", "confirmed": "rising", "fading": "losing", "neutral": "no_signal"}
BOUNCE = ("bouncing", "crash")


def key_of(code: Any) -> Optional[str]:
    return OF_CODE.get(code) if isinstance(code, str) else None


def week_ends(dates: Sequence[str]) -> List[int]:
    """Index of the last trading day of each calendar week, oldest first."""
    out: List[int] = []
    last = None
    for i, d in enumerate(dates):
        y, w, _ = _date.fromisoformat(d).isocalendar()
        if last is not None and (y, w) != last:
            out.append(i - 1)
        last = (y, w)
    if dates:
        out.append(len(dates) - 1)
    return out


def build(pages: List[dict], days: int = DAYS) -> Optional[dict]:
    """`pages`: industry pages (name, slug, kind, history.dates, history.state_code). None when there is not enough history."""
    usable = [p for p in pages if isinstance(p.get("history"), dict) and p["history"].get("dates") and p["history"].get("state_code")]
    if not usable:
        return None
    dates = sorted({d for p in usable for d in p["history"]["dates"]})[-days:]
    if len(dates) < 20:
        return None
    pos = {d: i for i, d in enumerate(dates)}
    groups = []
    for p in usable:
        codes: List[Optional[str]] = [None] * len(dates)
        rising: List[Optional[float]] = [None] * len(dates)      # out of every 100 counted stocks, how many are above their medium trend (the pack's "stocks rising")
        above = p["history"].get("above_20") or []
        for i, (d, c) in enumerate(zip(p["history"]["dates"], p["history"]["state_code"])):
            if d in pos:
                codes[pos[d]] = key_of(c)
                v = above[i] if i < len(above) else None
                rising[pos[d]] = round(float(v), 1) if isinstance(v, (int, float)) and v == v else None
        if any(codes):
            groups.append({"name": p["name"], "slug": p["slug"], "kind": p.get("kind", "industry"), "states": codes, "rising": rising})
    if not groups:
        return None
    groups.sort(key=lambda g: g["name"].lower())
    counts = {k: [sum(1 for g in groups if g["states"][i] == k) for i in range(len(dates))] for k in KEYS}
    ends = week_ends(dates)
    weeks = [{"date": dates[i], "counts": {k: counts[k][i] for k in KEYS}} for i in ends[-8:]]
    out = {"dates": dates, "words": WORD, "groups": groups, "counts": counts, "weeks": weeks, "week_ends": ends[-27:]}
    out["insights"] = {"mood": mood_insights(groups, dates, counts, ends), "strip": strip_insights(groups, dates, ends)}
    out["changed_this_week"] = changed_this_week(groups, dates, ends)
    return out


def _fmt(d: str) -> str:
    x = _date.fromisoformat(d)
    return f"{x.day} {x.strftime('%b %Y')}"


def mood_insights(groups: List[dict], dates: List[str], counts: Dict[str, List[int]], ends: List[int]) -> List[dict]:
    out: List[dict] = []
    n, last = len(dates), len(dates) - 1
    both = [a + b for a, b in zip(counts["bouncing"], counts["crash"])]
    now = both[last]
    prev = both[ends[-2]] if len(ends) > 1 else both[max(0, last - 5)]
    ind = "industry" if now == 1 else "industries"
    out.append({"kind": "insight", "title": "Bouncing back now", "text": f"{now} {ind} {'is' if now == 1 else 'are'} bouncing back today, against {prev} at last week's close."})
    rising_days = [i for i in range(n) if counts["rising"][i] > 0]
    if counts["rising"][last] > 0:
        r = counts["rising"][last]
        out.append({"kind": "good", "title": "Rising together", "text": f"{r} {'industry is' if r == 1 else 'industries are'} rising together today."})
    elif rising_days:
        out.append({"kind": "watch", "title": "No industry rising together", "text": f"No industry is rising together today. The last day one was: {_fmt(dates[rising_days[-1]])}."})
    else:
        out.append({"kind": "watch", "title": "No industry rising together", "text": "No industry has been rising together in the last six months."})
    sold = counts["sold_off"][last]
    if sold:
        out.append({"kind": "warning" if sold * 2 >= len(groups) else "insight", "title": "Sold off today", "text": f"{sold} of {len(groups)} {'industry is' if sold == 1 else 'industries are'} sold off today."})
    return out[:3]


def _longest_run(flags: List[bool]) -> int:
    best = cur = 0
    for f in flags:
        cur = cur + 1 if f else 0
        best = max(best, cur)
    return best


def strip_insights(groups: List[dict], dates: List[str], ends: List[int]) -> List[dict]:
    out: List[dict] = []
    if len(ends) < 2:
        return out
    this, prev = ends[-1], ends[-2]
    turned = [g["name"] for g in groups if g["states"][this] in BOUNCE and g["states"][prev] not in BOUNCE]
    if turned:
        names = ", ".join(turned[:3]) + (f" and {len(turned) - 3} more" if len(turned) > 3 else "")
        out.append({"kind": "insight", "title": "Turned to a bounce this week", "text": f"{names} turned to bouncing back since last Friday."})
    else:
        out.append({"kind": "insight", "title": "Turned to a bounce this week", "text": "No industry turned to bouncing back this week."})
    runs = [(_longest_run([g["states"][i] == "sold_off" for i in ends]), g["name"]) for g in groups]
    top = max(runs, key=lambda x: x[0])
    if top[0] >= 2:
        out.append({"kind": "watch", "title": "Longest run of Sold off Fridays", "text": f"{top[1]} was sold off at {top[0]} Friday closes in a row, the longest of any industry."})
    rise = [i for i in ends if any(g["states"][i] == "rising" for g in groups)]
    out.append({"kind": "insight", "title": "Last Friday any industry was rising together",
                "text": (f"{_fmt(dates[rise[-1]])}." if rise else "None in the last six months.")})
    return out[:3]


def changed_this_week(groups: List[dict], dates: List[str], ends: List[int]) -> List[dict]:
    if len(ends) < 2:
        return []
    this, prev = ends[-1], ends[-2]
    return [{"name": g["name"], "slug": g["slug"], "last": WORD.get(g["states"][prev]), "now": WORD.get(g["states"][this])}
            for g in groups if g["states"][this] != g["states"][prev] and g["states"][this] and g["states"][prev]]
