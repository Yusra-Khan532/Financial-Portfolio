"""Task #243 (screeners pack v4, section 3): the sector reading on the Advanced screens, from the site's own Sector Pulse and Sector Rotation files.

Every company the live sector release lists (counted or not) gets its industry group's reading; a counted company also gets its own peer label, leader flag and
6-month quarter inside the industry. The fields go on the screen frame's per-company fields (the same place as the Prism fields), as numbers the rules test and
words the columns show:

    sr_industry    the group's name                          sr_slug        its address on Sector Pulse
    sr_rank        rotation rank (1 = strongest)             sr_ranked      groups ranked
    sr_rank_4w     ranks climbed in 4 weeks (+ = up)         sr_corner      ahead_gaining | ahead_slowing | behind_gaining | behind_slipping
    sr_rotation    "Ahead and gaining · 3 wk"                sr_weeks       weeks in that corner
    sr_pulse       the Sector Pulse state in words (PULSE_WORDS)  sr_pulse_code  its stored code
    sr_above50     % of the group's stocks above their 50-day average
    sr_rebound     how recent the last thrust is ("5 sessions ago"), blank when there was none in the file
    sr_peer        Leader | In line | Laggard (blank: no label)
    sr_flag        Full flag | Early flag (blank: none)      sr_q6m         1 = top quarter of its industry by 6-month return ... 4
    sr_ag = 1      industry Ahead and gaining                sr_bg = 1      industry Behind but gaining
    sr_up = 1      industry bouncing back (after a crash or not) or rising together
    sr_thrust = 1  industry bouncing back (after a crash or not)  sr_lead = 1  peer Leader      sr_flagged = 1  a Full or Early leader flag
    sr_on_setup=1  on a Setups or Chart patterns list tonight (set by mark_setups, once the lists are known)
    sr_tailwinds   0 to 4: sr_ag + sr_up + sr_lead + sr_on_setup. A count of facts that line up, not a score and not a view.

Plain Python and the standard library: the website process reads these files too (no pandas). Nothing here fetches: a stale release (the sector job runs on
weekend nights) is read as it is, and the page says which date each kind of data is from (`dates`)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

from .. import sector_data as sd

log = logging.getLogger("finlit.presets.sectors")

UP_STATES = {"thrust_c", "thrust_cap", "confirmed"}       # bouncing back or rising together
# Task #258 (20 Nov handoff, SHARED §3): the one set of words a reader sees for each stored Pulse state (the stored codes stay as they are). The frontend twin is
# frontend/src/lib/pulseWords.ts; a test keeps the two the same.
PULSE_WORDS = {"thrust_cap": "Bouncing back after a crash", "thrust_c": "Bouncing back", "confirmed": "Rising together", "fading": "Losing steam",
               "washout": "Sold off", "neutral": "No clear signal"}
THRUST_STATES = {"thrust_c", "thrust_cap"}
CORNER_NAMES = {"ahead_gaining": "Ahead and gaining", "ahead_slowing": "Ahead but slowing", "behind_gaining": "Behind but gaining", "behind_slipping": "Behind and slipping"}
FLAG_NAMES = {2: "Full flag", 1: "Early flag"}
PEERS = ("Leader", "In line", "Laggard")
FIELDS = ("sr_industry", "sr_slug", "sr_rank", "sr_ranked", "sr_rank_4w", "sr_corner", "sr_rotation", "sr_weeks", "sr_pulse", "sr_pulse_code", "sr_above50",
          "sr_rebound", "sr_peer", "sr_flag", "sr_q6m", "sr_ag", "sr_bg", "sr_up", "sr_thrust", "sr_lead", "sr_flagged", "sr_on_setup", "sr_tailwinds")


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None


def _when(thrust: Any) -> Optional[str]:
    if not isinstance(thrust, dict):
        return None
    n = thrust.get("sessions_ago")
    if isinstance(n, (int, float)):
        n = int(n)
        return "today" if n == 0 else f"{n} session{'' if n == 1 else 's'} ago"
    return thrust.get("when")


def group_fields(board_row: Dict[str, Any], rot_row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """The reading every member of one group shares."""
    rot = rot_row or {}
    corner = rot.get("corner") or ((board_row.get("rotation") or {}).get("corner"))
    weeks = rot.get("weeks_in_corner") if rot else (board_row.get("rotation") or {}).get("weeks_in_corner")
    code = board_row.get("state_code")
    breadth = board_row.get("breadth") or {}
    name = CORNER_NAMES.get(corner or "")
    return {
        "sr_industry": board_row.get("name"), "sr_slug": board_row.get("slug"),
        "sr_rank": _num(rot.get("rank")), "sr_ranked": _num(rot.get("ranked")), "sr_rank_4w": _num(rot.get("rank_change_4w")),
        "sr_corner": corner, "sr_rotation": (f"{name} · {int(weeks)} wk" if name and isinstance(weeks, (int, float)) else name), "sr_weeks": _num(weeks),
        "sr_pulse": PULSE_WORDS.get(code or "", board_row.get("state")), "sr_pulse_code": code, "sr_above50": _num(breadth.get("above_50")), "sr_rebound": _when(board_row.get("last_thrust")),
        "sr_ag": 1.0 if corner == "ahead_gaining" else 0.0, "sr_bg": 1.0 if corner == "behind_gaining" else 0.0,
        "sr_up": 1.0 if code in UP_STATES else 0.0, "sr_thrust": 1.0 if code in THRUST_STATES else 0.0,
    }


def stock_fields(s: Dict[str, Any]) -> Dict[str, Any]:
    """A counted company's own place in its group."""
    peer = s.get("peer_label")
    peer = peer if peer in PEERS else None
    lf = s.get("leader_flag")
    tier = lf.get("tier_code") if isinstance(lf, dict) else None
    flag = FLAG_NAMES.get(int(tier)) if isinstance(tier, (int, float)) else None
    return {"sr_peer": peer, "sr_lead": 1.0 if peer == "Leader" else 0.0, "sr_flag": flag, "sr_flagged": 1.0 if flag else 0.0, "sr_q6m": _num(s.get("quarter")),
            "sr_q6m_name": s.get("quarter_name")}


def tailwinds(f: Dict[str, Any]) -> Optional[float]:
    if not f.get("sr_industry"):
        return None
    return float(sum(1 for k in ("sr_ag", "sr_up", "sr_lead", "sr_on_setup") if f.get(k) == 1.0))


def build(board: Dict[str, Any], rotation: Optional[Dict[str, Any]], pages: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """symbol -> sector fields, from the board, the rotation map and the industry pages (slug -> page)."""
    rot = {r.get("slug"): r for r in (rotation or {}).get("rows", []) if isinstance(r, dict)}
    out: Dict[str, Dict[str, Any]] = {}
    for row in board.get("rows", []):
        if not isinstance(row, dict) or not row.get("slug"):
            continue
        g = group_fields(row, rot.get(row["slug"]))
        page = pages.get(row["slug"]) or {}
        for s in page.get("not_counted") or []:
            if isinstance(s, dict) and s.get("symbol"):
                out.setdefault(str(s["symbol"]).upper(), {**g, "sr_peer": None, "sr_lead": 0.0, "sr_flag": None, "sr_flagged": 0.0, "sr_q6m": None})
        for s in page.get("stocks") or []:
            if isinstance(s, dict) and s.get("symbol"):
                out[str(s["symbol"]).upper()] = {**g, **stock_fields(s)}
    for f in out.values():
        f["sr_on_setup"] = 0.0
        f["sr_tailwinds"] = tailwinds(f)
    return out


def load(rel: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    """{"date", "rotationDate", "by": symbol -> fields} from the live sector release, or None when there is none. Never raises."""
    try:
        rel = rel or sd.live_release()
        if rel is None:
            return None
        board = sd.read_json(rel / "sectors" / "_board.json")
        if not isinstance(board, dict):
            return None
        rotation = sd.read_json(rel / "rotation" / "_map.json")
        pages: Dict[str, Dict[str, Any]] = {}
        for row in board.get("rows", []):
            slug = row.get("slug") if isinstance(row, dict) else None
            if slug and sd.SLUG.match(slug):
                page = sd.read_json(rel / "sectors" / f"{slug}.json")
                if isinstance(page, dict):
                    pages[slug] = page
        return {"date": board.get("date"), "rotationDate": (rotation or {}).get("date") if isinstance(rotation, dict) else None,
                "by": build(board, rotation if isinstance(rotation, dict) else None, pages)}
    except Exception:
        log.warning("the sector reading was not read: the sector screens and columns stay blank tonight", exc_info=True)
        return None


def mark(prism: Dict[str, dict], reading: Optional[Dict[str, Any]]) -> int:
    """Put the reading on each company's frame fields. Returns how many companies got one."""
    if not reading:
        return 0
    for sym, f in reading["by"].items():
        prism.setdefault(sym, {}).update(f)
    return len(reading["by"])


def mark_setups(fr, lists: Dict[str, Iterable[str]]) -> None:
    """sr_on_setup = 1 (and sr_setups, the names of the lists) for the companies on tonight's Setups and Chart patterns lists ({list name: symbols}), and Tailwinds
    counted again. Sets fr.setups_marked so it runs once per frame."""
    on: Dict[str, list] = {}
    for name, syms in lists.items():
        for s in syms:
            on.setdefault(s, []).append(name)
    for i, sym in enumerate(fr.symbols):
        z = fr.pz[i]
        if not z.get("sr_industry"):
            continue
        z["sr_on_setup"] = 1.0 if sym in on else 0.0
        z["sr_setups"] = " · ".join(on[sym]) if sym in on else None
        z["sr_tailwinds"] = tailwinds(z)
    fr.setups_marked = True
