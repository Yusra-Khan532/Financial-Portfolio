"""The data behind two more Sector Pulse charts of the 9 Nov 2026 pages update: "Industry map" (the board) and "A year of <industry>" (an industry page).

Both use what the nightly run already wrote: each board row's share of stocks rising and how far its index is below its 1-year high, and each industry page's daily share of
stocks rising and its state. The insight sentences and the numbered moments are worked out here, on the server; the page only shows the words. No cut-off, weight or look-back
length is sent: the words say what happened ("rising broadly", "near its 1-year high"), never how a state is decided. Nothing here is advice.
"""
from __future__ import annotations

from datetime import date as _date
from typing import Any, Dict, List, Optional

from .sector_history import WORD, key_of

_BROAD, _NARROW = 70.0, 30.0          # "almost all rising" / "almost all falling": kept here, never sent
_NEAR, _FAR = -10.0, -20.0            # near / far below the 1-year high: kept here, never sent
YEAR = 260                            # about a year of trading sessions


def _names(xs: List[str], most: int = 5) -> str:
    xs = sorted(xs)
    if len(xs) <= most:
        return ", ".join(xs[:-1]) + (" and " if len(xs) > 1 else "") + xs[-1] if xs else ""
    return ", ".join(xs[:most]) + f" and {len(xs) - most} more"


def _day(d: str) -> str:
    x = _date.fromisoformat(d)
    return f"{x.day} {x.strftime('%b')} {x.year}"


def industry_map(board: dict) -> Optional[dict]:
    """Every industry with a reading as a point: stocks rising of 100 across, how far the industry is below its 1-year high up and down, coloured by state."""
    rows = []
    for r in board.get("rows", []):
        if not isinstance(r, dict):
            continue
        b, hi = (r.get("breadth") or {}).get("above_20"), r.get("index_vs_52w_high")
        k = key_of(r.get("state_code"))
        if not isinstance(b, (int, float)) or not isinstance(hi, (int, float)) or not k:
            continue
        rot = r.get("rotation") or {}
        rows.append({"name": r.get("name"), "slug": r.get("slug"), "state": k, "state_word": WORD[k], "rising": round(float(b), 1), "below_high": round(float(hi), 1),
                     "corner": rot.get("corner_name") if isinstance(rot, dict) else None})
    if len(rows) < 3:
        return None
    rows.sort(key=lambda x: str(x["name"]).lower())
    near = [x["name"] for x in rows if x["rising"] >= _BROAD and x["below_high"] >= _NEAR]
    far = [x["name"] for x in rows if x["rising"] >= 50 and x["below_high"] <= _FAR]
    sold_half = [x["name"] for x in rows if x["state"] == "sold_off" and x["rising"] >= 50]
    ins = [
        {"kind": "good" if near else "insight", "title": "Rising and near their highs",
         "text": f"Rising broadly and near their 1-year highs: {_names(near)}." if near else "No industry is both rising broadly and near its 1-year high today."},
        {"kind": "insight", "title": "Rising but still far below",
         "text": f"Half or more of their stocks rising, but still far below their 1-year highs: {_names(far)}." if far else "No industry with half or more of its stocks rising is still far below its 1-year high."},
        {"kind": "watch" if sold_half else "insight", "title": "Marked Sold off, yet half rising",
         "text": f"Still marked Sold off with half or more of their stocks rising: {_names(sold_half)}." if sold_half else "No industry marked Sold off has half or more of its stocks rising."},
    ]
    return {"date": board.get("date"), "rows": rows, "insights": ins, "words": WORD}


def _runs(keys: List[Optional[str]], want: str) -> List[tuple]:
    out, start = [], None
    for i, k in enumerate(keys + [None]):
        if k == want and start is None:
            start = i
        elif k != want and start is not None:
            out.append((start, i - 1))
            start = None
    return out


def industry_year(page: dict, days: int = YEAR) -> Optional[dict]:
    """A year of one industry: how many of every 100 stocks were rising each day, its state each day, the numbered moments and the insights."""
    h = page.get("history") or {}
    dates, rising, codes = h.get("dates") or [], h.get("above_20") or [], h.get("state_code") or []
    n = min(len(dates), len(rising), len(codes))
    if n < 40:
        return None
    dates, rising, codes = dates[-n:][-days:], rising[-n:][-days:], codes[-n:][-days:]
    keys = [key_of(c) for c in codes]
    runk = ["bouncing" if k == "crash" else k for k in keys]       # a bounce after a crash is a bounce for the runs and the moments; `keys` keeps it apart for the shading
    vals = [None if not isinstance(v, (int, float)) else round(float(v), 1) for v in rising]
    name = page.get("name") or "This industry"
    moments = []
    for a, b in _runs(keys, "sold_off"):
        i = min((j for j in range(a, b + 1) if vals[j] is not None), key=lambda j: vals[j], default=None)
        if i is not None:
            moments.append((i, f"{_day(dates[i])}. Sold off: {vals[i]:.0f} in 100 stocks were rising, the lowest of that run."))
    for a, b in _runs(runk, "bouncing"):
        i = max((j for j in range(a, b + 1) if vals[j] is not None), key=lambda j: vals[j], default=None)
        if i is not None:
            crash = any(codes[j] == "thrust_cap" for j in range(a, b + 1))
            moments.append((i, f"{_day(dates[a])}. {'A bounce after a crash' if crash else 'A bounce'}: by {_day(dates[i])}, {vals[i]:.0f} in 100 were rising."))
    last = len(dates) - 1
    moments = sorted({i: t for i, t in moments}.items())[-5:]
    if vals[last] is not None:
        moments.append((last, f"{_day(dates[last])}. Latest close: {vals[last]:.0f} in 100 rising, {WORD.get(keys[last] or '', 'no clear signal').lower()}."))
    days_in = {k: sum(1 for x in keys if x == k) for k in WORD}
    bounces = [{"from": dates[a], "to": dates[b], "days": b - a + 1} for a, b in _runs(runk, "bouncing")]
    sold = days_in.get("sold_off", 0)
    ins = [{"kind": "watch" if sold else "good", "title": "Days sold off",
            "text": f"{name} was Sold off on {sold} of the last {len(dates)} trading days." if sold else f"{name} was not Sold off on any of the last {len(dates)} trading days."}]
    done = [x["days"] for x in bounces[:-1]] if bounces and runk[-1] == "bouncing" else [x["days"] for x in bounces]
    if done:
        last4 = [str(d) for d in done[-4:]]
        ins.append({"kind": "insight", "title": "How long bounces lasted",
                    "text": f"The earlier bounces lasted {', '.join(last4[:-1])} and {last4[-1]} trading days." if len(last4) > 1 else f"The earlier bounce lasted {last4[0]} trading days."})
    else:
        ins.append({"kind": "insight", "title": "How long bounces lasted", "text": "There was no earlier bounce in the year to compare with."})
    return {"name": name, "slug": page.get("slug"), "dates": dates, "rising": vals, "states": keys, "words": WORD,
            "moments": [{"n": k + 1, "i": i, "date": dates[i], "text": t} for k, (i, t) in enumerate(moments)],
            "insights": ins, "bounces": bounces, "days_in_state": days_in}
