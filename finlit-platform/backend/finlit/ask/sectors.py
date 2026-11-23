"""Task #349 PR 5: FinLit AI reads Sector Pulse and Sector Rotation (docs/ASK-AI.md "Sector Pulse and Sector Rotation").

Sector questions went to the web. These two read-only tools read the site's own feeds in-process, as the member (ask/gateway.py), like every other
tool: the routes decide what a plan sees (auth/entitlements.py redact_sector_* and redact_rotation_map: a locked field is null and `locked` names
the plan that opens it), so the AI never sees more than the page shows that member.

    get_sector_pulse(show=sectors|industries, slug?)    /api/sectors[?show=sectors]: the state and breadth of every group, or one group
                                                        (/api/sectors/{slug}): its state since when, breadth, the summary, and the ranked stocks (Silver)
    get_sector_rotation(show, slug?)                    /api/rotation: each group's box, rank and moves, and "what happened next" after each box
                                                        (`what_next`); with a slug, /api/rotation/{slug}: the group's box since when, rank, path,
                                                        and what happened next after its box

`slug` may be a loose name ("pharma", "banking", "cement"): it is matched against the groups the board lists (their names and, in the Sectors
view, the industries inside each); several matches are returned for the model to choose from, never guessed."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from ..mcp.gateway import Gateway, ToolError
from ..mcp.tools import Out, Tool

SOURCE_PULSE = "FinLit's Sector Pulse page (finlitventures.com/sectors): NSE daily prices, equal-weighted industry and sector groups"
SOURCE_ROTATION = "FinLit's Sector Rotation page (finlitventures.com/sectors/rotation): each group against the average industry, from weekly closes"
SHOW = {"type": "string", "enum": ["sectors", "industries"], "default": "sectors",
        "description": "sectors: NSE's 22 sectors; industries: the finer NSE industry groups"}
SLUG = {"type": "string", "minLength": 1, "maxLength": 80, "description": "Optional: one sector or industry, by its name or address (e.g. pharma, banks)"}
STOCKS = 15                         # ranked stocks named for one group (Silver), the strongest 6 months first
_WORD = re.compile(r"[a-z0-9]+")
BOXES = {"ahead_gaining": "Ahead and gaining", "ahead_slowing": "Ahead but slowing", "behind_slipping": "Behind and slipping",
         "behind_gaining": "Behind but gaining"}
_LOCK_WORDS = {"stocks": "the ranked stock table", "not_counted": "the stocks not counted", "leader_flags": "the leader flags"}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower().replace("&", " ")).strip("-")


def pick_group(rows: List[Dict[str, Any]], want: str) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """(the one group `want` names, or None with the candidates): the address, then the name, then every word of `want` (cut to its first 4
    letters: "banking" finds "Banks", "pharma" finds "Pharmaceuticals & Biotechnology") starting a word of the group's name or of an industry
    inside it. Several matches: none is chosen."""
    w = _norm(want)
    if not w:
        return None, []
    for r in rows:
        if w in (r.get("slug"), _norm(r.get("name", ""))):
            return r, []
    words = [x[:4] for x in _WORD.findall(w.replace("-", " ")) if x not in ("and", "the", "sector", "sectors", "industry", "industries")]
    if not words:
        return None, []

    def hit(text: str) -> bool:
        have = _WORD.findall(_norm(text).replace("-", " "))
        return all(any(h.startswith(x) for h in have) for x in words)
    by_name = [r for r in rows if hit(r.get("name", ""))]
    found = by_name or [r for r in rows if any(hit(i) for i in r.get("industries") or [])]
    return (found[0], []) if len(found) == 1 else (None, found)


def _locked(data: Dict[str, Any]) -> List[str]:
    lk = data.get("locked") if isinstance(data.get("locked"), dict) else {}
    return [f"{_LOCK_WORDS.get(k, k.replace('_', ' '))} is part of the {str(v).title()} plan, which this member's plan does not include"
            for k, v in lk.items() if v]


async def _board(gw: Gateway, show: str) -> Tuple[Dict[str, Any], str, List[str]]:
    """The Sector Pulse board in the view asked; the Sectors view not loaded yet falls back to Industries, and says so."""
    notes: List[str] = []
    try:
        return await gw.json("/api/sectors", {"show": show}, subject="Sector Pulse"), show, notes
    except ToolError as e:
        if show != "sectors":
            raise
        notes.append(f"The Sectors view could not be read ({e}); this is the Industries view.")
        return await gw.json("/api/sectors", {"show": "industries"}, subject="Sector Pulse"), "industries", notes


def _pulse_row(r: Dict[str, Any]) -> Dict[str, Any]:
    rot = r.get("rotation") if isinstance(r.get("rotation"), dict) else {}
    lt = r.get("last_thrust") if isinstance(r.get("last_thrust"), dict) else {}
    br = r.get("breadth") if isinstance(r.get("breadth"), dict) else {}
    above = "/".join("–" if br.get(k) is None else f"{br[k]:.0f}" for k in ("above_9", "above_20", "above_50")) if br else None
    return {k: v for k, v in {        # compact: every group of the board fits one result (the meanings are given once, in stateMeanings)
        "name": r.get("name"), "slug": r.get("slug"), "state": r.get("state"),
        "above9/20/50": above, "vs52wHighPct": r.get("index_vs_52w_high"), "stocks": r.get("stocks_counted"),
        "lastThrust": f"{lt.get('type')} {lt.get('date_label')}" if lt.get("date_label") else None,
        "box": rot.get("corner_name"),
        "industries": r.get("industries") if r.get("kind") == "sector" and len(r.get("industries") or []) > 1 else None}.items() if v not in (None, [], {})}


async def get_sector_pulse(gw: Gateway, a: Dict[str, Any]) -> Out:
    show = a.get("show") or "sectors"
    board, show, notes = await _board(gw, show)
    rows = [r for r in board.get("rows") or [] if isinstance(r, dict)]
    base = {"show": show, "date": board.get("date_label") or board.get("date"), "market": (board.get("market") or {}).get("note")}
    if not a.get("slug"):
        out = {**base, "counts": board.get("counts"), "stateMeanings": board.get("state_meanings"), "groups": [_pulse_row(r) for r in rows],
               "tooFewStocksForAReading": [x.get("name") for x in board.get("too_few_stocks") or [] if isinstance(x, dict)]}
        return Out(out, as_of=board.get("date"), source=SOURCE_PULSE, routes=["/api/sectors"],
                   notes=notes + _locked(board) + ["above9/20/50: how many of every 100 counted stocks are above their 9, 20 and 50-day averages. "
                                                   "box: the group's Sector Rotation box (get_sector_rotation has its rank). "
                                                   "vs52wHighPct: the equal-weighted group index against its 52-week high. Describe; never call a group a buy."])
    hit, cands = pick_group(rows, a["slug"])
    if hit is None:
        small = [x.get("name") for x in board.get("too_few_stocks") or [] if isinstance(x, dict) and pick_group([x], a["slug"])[0]]
        return Out({**base, "found": False, "asked": a["slug"], "matches": [{"name": c.get("name"), "slug": c.get("slug")} for c in cands][:12],
                    "groups": [r.get("name") for r in rows]}, as_of=board.get("date"), source=SOURCE_PULSE, routes=["/api/sectors"],
                   notes=notes + ([f"{', '.join(small)} has too few stocks for a reading."] if small else [])
                   + ["No single group matches; ask again with one of `matches` (or a name from `groups`)."])
    page = await gw.json(f"/api/sectors/{hit['slug']}", {"show": show}, subject=f"Sector Pulse for {hit.get('name')}")
    stocks = page.get("stocks") if isinstance(page.get("stocks"), list) else None
    if stocks is not None:
        stocks = sorted([s for s in stocks if isinstance(s, dict)], key=lambda s: (s.get("rank_6m") is None, s.get("rank_6m") or 0))[:STOCKS]
        stocks = [{k: s.get(k) for k in ("symbol", "name", "return_6m_pct", "rank_6m", "peer_label") if s.get(k) is not None} for s in stocks]
    lt = page.get("last_thrust") if isinstance(page.get("last_thrust"), dict) else {}
    one = {**base, "group": {k: v for k, v in {
        "name": page.get("name"), "slug": page.get("slug"), "kind": page.get("kind"), "sector": page.get("sector"), "state": page.get("state"),
        "since": page.get("since_label"), "meaning": page.get("meaning"), "summary": page.get("summary"), "how": page.get("how"),
        "breadth": page.get("breadth"), "vs52wHighPct": page.get("index_vs_52w_high"), "stocksCounted": page.get("stocks_counted"),
        "stocksListed": page.get("stocks_listed"), "lastThrust": f"{lt.get('type')} on {lt.get('date_label')} ({lt.get('when')})" if lt.get("date_label") else None,
        "industries": page.get("industries"), "date": page.get("date_label")}.items() if v not in (None, [], {})}}
    if stocks is not None:
        one["stocks"] = stocks
        one["stocksTotal"] = page.get("stocks_total")
    return Out(one, as_of=page.get("date"), source=SOURCE_PULSE, routes=[f"/api/sectors/{hit['slug']}"], notes=notes + _locked(page))


def _rot_row(r: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in {
        "name": r.get("name"), "slug": r.get("slug"), "box": r.get("corner_name"), "weeksInBox": r.get("weeks_in_corner"),
        "rank": r.get("rank_label") or (f"{r.get('rank')} of {r.get('ranked')}" if r.get("rank") else None),
        "rankChange1w": r.get("rank_change_1w"), "rankChange4w": r.get("rank_change_4w"),
        "vsAverage6mPts": r.get("strength_pts"), "vsAverage1mPts": r.get("change_pts"), "breadth": r.get("breadth_name")}.items() if v is not None}


def _what_next(wn: Any, box: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if not isinstance(wn, dict) or not wn.get("cards"):
        return None
    cards = [c for c in wn["cards"] if isinstance(c, dict) and (box is None or c.get("box") == box)]
    return {"caption": wn.get("caption"), "from": wn.get("from_label"), "to": wn.get("to_label"),
            "boxes": [{"box": c.get("box_name"), "timesEntered": c.get("entered"), "typicalWeeks": c.get("typical_weeks"), "staysEnded": c.get("ended"),
                       "inItNow": c.get("now"), "wentNext": [{"box": x.get("box_name"), "times": x.get("n")} for x in c.get("next") or [] if isinstance(x, dict)]}
                      for c in cards]}


async def _rotation(gw: Gateway, show: str) -> Tuple[Dict[str, Any], str, List[str]]:
    notes: List[str] = []
    try:
        return await gw.json("/api/rotation", {"show": show}, subject="Sector Rotation"), show, notes
    except ToolError as e:
        if show != "sectors":
            raise
        notes.append(f"The Sectors view could not be read ({e}); this is the Industries view.")
        return await gw.json("/api/rotation", {"show": "industries"}, subject="Sector Rotation"), "industries", notes


async def get_sector_rotation(gw: Gateway, a: Dict[str, Any]) -> Out:
    show = a.get("show") or "sectors"
    m, show, notes = await _rotation(gw, show)
    rows = [r for r in m.get("rows") or [] if isinstance(r, dict)]
    base = {"show": show, "date": m.get("date_label") or m.get("date"), "weekClosed": m.get("week_closed"), "benchmark": m.get("benchmark")}
    tail = ["Boxes: Ahead and gaining, Ahead but slowing, Behind and slipping, Behind but gaining, against the average industry (6 months and the "
            "last month, in points). What happened next counts what did happen after each box, never what will. Describe; never call a group a buy."]
    if not a.get("slug"):
        out = {**base, "groupsLine": m.get("groups_line"), "counts": m.get("counts"),
               "movedThisWeek": [{k: x.get(k) for k in ("name", "from", "to")} for x in m.get("moved_this_week") or [] if isinstance(x, dict)],
               "groups": [_rot_row(r) for r in rows], "whatHappenedNext": _what_next(m.get("what_next"))}
        return Out(out, as_of=m.get("date"), source=SOURCE_ROTATION, routes=["/api/rotation"], notes=notes + _locked(m) + tail)
    hit, cands = pick_group(rows, a["slug"])
    if hit is None:
        return Out({**base, "found": False, "asked": a["slug"], "matches": [{"name": c.get("name"), "slug": c.get("slug")} for c in cands][:12],
                    "groups": [r.get("name") for r in rows]}, as_of=m.get("date"), source=SOURCE_ROTATION, routes=["/api/rotation"],
                   notes=notes + ["No single group with a rotation reading matches (a group needs 8 counted stocks); ask again with one of `matches`."])
    card = await gw.json(f"/api/rotation/{hit['slug']}", {"show": show}, subject=f"Sector Rotation for {hit.get('name')}")
    tail_pts = [{"date": p.get("date_label"), "box": BOXES.get(p.get("corner"), p.get("corner"))} for p in (card.get("tail") or [])[-4:] if isinstance(p, dict)]
    rotation = {k: v for k, v in {
        "name": card.get("name"), "slug": card.get("slug"), "box": card.get("corner_name"), "since": card.get("corner_since_label"),
        "weeksInBox": card.get("weeks_in_corner"), "previousBox": card.get("previous_corner_name"), "meaning": card.get("corner_meaning"),
        "rank": card.get("rank_label"), "rankChange1w": card.get("rank_change_1w"), "rankChange4w": card.get("rank_change_4w"),
        "bestRank26w": card.get("rank_best_26w"), "worstRank26w": card.get("rank_worst_26w"), "vsAverage6mPts": card.get("strength_pts"),
        "vsAverage1mPts": card.get("change_pts"), "breadth": card.get("breadth_name"), "pulseState": card.get("sector_state"),
        "summary": card.get("summary"), "lastWeeks": tail_pts or None, "asOf": base["date"]}.items() if v not in (None, [], {})}
    return Out({**base, "rotation": rotation, "whatHappenedNextAfterThisBox": _what_next(m.get("what_next"), card.get("corner"))},
               as_of=m.get("date"), source=SOURCE_ROTATION, routes=["/api/rotation", f"/api/rotation/{hit['slug']}"], notes=notes + _locked(m) + tail)


TOOLS: List[Tool] = [
    Tool("get_sector_pulse", "Sector Pulse", "FinLit's Sector Pulse page: the state of every NSE sector or industry group (Thrust C, Thrust CAP, "
         "Confirmed, Washout, Fading, Neutral, with what each means), its breadth (how many of every 100 stocks are above their 9, 20 and 50-day "
         "averages), how far its index is below its 52-week high and its last thrust, each with its date. With `slug`: one group in full (its "
         "state since when, the summary, and its ranked stocks on Silver). Use it first for any question about how a sector or industry is doing.",
         {"show": SHOW, "slug": SLUG}, get_sector_pulse),
    Tool("get_sector_rotation", "Sector Rotation", "FinLit's Sector Rotation page: each NSE sector or industry group's box against the average "
         "industry (Ahead and gaining, Ahead but slowing, Behind and slipping, Behind but gaining), its rank and how it moved, the groups that "
         "changed box this week, and \"what happened next\" after each box, counted from past weekly closes. With `slug`: one group's box since "
         "when, rank, path and what happened next after its box. Use it for which sectors lead or lag, rotation and momentum questions.",
         {"show": SHOW, "slug": SLUG}, get_sector_rotation),
]
DOING = {"get_sector_pulse": "Reading Sector Pulse", "get_sector_rotation": "Reading Sector Rotation"}
