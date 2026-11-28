"""Sector Pulse "Alert me" (task #333, developer file 30, addition 5): a member picks, for one sector or industry, any of three alerts, sent after the weekly close.

    state   "when its state changes (Sector Pulse)": its state at this week's close differs from its state at last week's close
    box     "when it moves to another box (Sector Rotation)": its confirmed box changed at this week's close (the same rule as rotation_alerts "corner")
    top5    "when it enters or leaves the top 5 by rank": it is in the top 5 this week and was not last week, or the other way round

The choices are kept in the member's preferences as `sectorAlerts`, one entry per alert: "<kind>:<view>:<slug>" (view: sectors or industries, the page's Show
switch), so a sector of the Sectors view and an industry of the Industries view are told apart. Each group with at least one alert counts as one of the member's
alerts (alertapi: ALERT_LIMITS). Task #448 (developer file 42, 02 §1.2): the slug "mine" is one alert for all the member's sectors (or industries): at each run
it is the groups of the shares the member holds then (their portfolio, owned shares), so the sectors of shares added later are covered too; it counts as one
alert. Everything is read from the live release's nightly files; nothing here writes them. Dedupe is auto_alert_sent's primary key
(user, "@<view>:<slug>", kind, the week's closing date). Messages describe what happened; never advice."""
from __future__ import annotations

import json
import logging
import re
from datetime import date, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

from . import sector_data as sd
from .rotation_alerts import events_for

log = logging.getLogger("finlit.sector_alerts")
ENTRY = re.compile(r"^(state|box|top5):(sectors|industries):([a-z0-9][a-z0-9-]{0,79})$")
KINDS = {"state": "sector_state", "box": "sector_box", "top5": "sector_top5"}
PER_RUN = 20
TOP = 5
FOOTER = "This describes what the group's stocks and returns did; it is information, not investment advice."
WORD = {"thrust_cap": "Bouncing back after a crash", "thrust_c": "Bouncing back", "confirmed": "Rising together", "fading": "Losing steam", "washout": "Sold off", "neutral": "No clear signal"}


def parse(entries: Any) -> List[Tuple[str, str, str]]:
    """The valid (kind, view, slug) entries of a member's sectorAlerts preference."""
    out = []
    for e in entries if isinstance(entries, list) else []:
        m = ENTRY.match(e) if isinstance(e, str) else None
        if m:
            out.append((m.group(1), m.group(2), m.group(3)))
    return out


def groups_alerted(prefs: Any) -> int:
    """How many groups carry at least one alert: each counts as one of the member's alerts."""
    if isinstance(prefs, str):
        try:
            prefs = json.loads(prefs)
        except ValueError:
            prefs = {}
    p = prefs if isinstance(prefs, dict) else {}
    return len({(v, s) for _k, v, s in parse(p.get("sectorAlerts"))})


def week_before(dates: List[str], codes: List[Any]) -> Tuple[Optional[str], Optional[Any], Optional[Any]]:
    """(this week's closing date, the state then, the state at the last close at least 7 days earlier) from a group's daily history."""
    if not dates or not codes or len(dates) != len(codes):
        return None, None, None
    last = date.fromisoformat(dates[-1][:10])
    cut = (last - timedelta(days=7)).isoformat()
    prev = next((codes[i] for i in range(len(dates) - 1, -1, -1) if dates[i][:10] <= cut), None)
    return dates[-1][:10], codes[-1], prev


def top5_event(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    h = [x for x in row.get("rank_history") or [] if isinstance(x, dict)]
    if len(h) < 2 or h[-1].get("rank") is None or h[-2].get("rank") is None:
        return None
    now, before = h[-1]["rank"], h[-2]["rank"]
    if (now <= TOP) == (before <= TOP):
        return None
    return {"kind": "top5", "period": str(h[-1].get("date")), "in": now <= TOP, "rank": now, "ranked": row.get("ranked")}


def events(rel, view: str, slug: str) -> List[Dict[str, Any]]:
    """This week's events for one group of one view (empty until the week has closed)."""
    base = rel / sd.LEVELS_DIR if view == "sectors" else rel
    out: List[Dict[str, Any]] = []
    rmap = sd.read_json(base / "rotation" / "_map.json")
    closed = isinstance(rmap, dict) and rmap.get("week_closed")
    if not closed:
        return out
    row = next((r for r in rmap.get("rows", []) if isinstance(r, dict) and r.get("slug") == slug), None)
    if row:
        out += [{**e, "kind": "box"} for e in events_for(row, True) if e["kind"] == "corner"]
        t = top5_event(row)
        if t:
            out.append(t)
    board = sd.read_json(base / "sectors" / "_board.json")
    if isinstance(board, dict) and slug in sd.board_slugs(board) and sd.SLUG.match(slug):
        page = sd.read_json(base / "sectors" / f"{slug}.json")
        hist = (page or {}).get("history") if isinstance(page, dict) else None
        if isinstance(hist, dict):
            day, now, prev = week_before(list(hist.get("dates") or []), list(hist.get("state_code") or []))
            if day and now and prev and now != prev:
                out.append({"kind": "state", "period": day, "from": WORD.get(prev, str(prev)), "to": WORD.get(now, str(now))})
    return out


def name_of(rel, view: str, slug: str) -> str:
    base = rel / sd.LEVELS_DIR if view == "sectors" else rel
    board = sd.read_json(base / "sectors" / "_board.json")
    row = next((r for r in (board or {}).get("rows", []) if isinstance(r, dict) and r.get("slug") == slug), None) if isinstance(board, dict) else None
    return (row or {}).get("name") or slug


def message(name: str, view: str, ev: Dict[str, Any]) -> Tuple[str, str]:
    unit = "sector" if view == "sectors" else "industry"
    if ev["kind"] == "state":
        return (f"{name} is now {ev['to']} on Sector Pulse",
                f"At this week's close {name} reads {ev['to']}; a week earlier it read {ev['from']}. {FOOTER}")
    if ev["kind"] == "box":
        return (f"{name} moved from {ev['from']} to {ev['to']} on Sector Rotation",
                f"{name} was {ev['from']} and has been {ev['to']} since this week's close, after two weekly closes there. {FOOTER}")
    where = f"rank {ev['rank']} of {ev['ranked']}" if ev.get("ranked") else f"rank {ev['rank']}"
    return ((f"{name} entered the top {TOP} {unit}s by rank" if ev["in"] else f"{name} left the top {TOP} {unit}s by rank"),
            f"At this week's close {name} is {where} on Sector Rotation. {FOOTER}")


MINE = "mine"


def held_symbols(portfolio: Any) -> List[str]:
    """The member's shares, each once: the portfolio's holdings that are owned (owned is not false) and not a sale."""
    if isinstance(portfolio, str):
        try:
            portfolio = json.loads(portfolio)
        except ValueError:
            portfolio = {}
    hs = portfolio.get("holdings") if isinstance(portfolio, dict) else None
    out: List[str] = []
    for h in hs if isinstance(hs, list) else []:
        sym = str(h.get("symbol") or "").strip().upper() if isinstance(h, dict) else ""
        if sym and h.get("owned") is not False and h.get("side") != "sell" and sym not in out:
            out.append(sym)
    return out


def groups_of(rel, view: str, symbols: Iterable[str]) -> List[str]:
    """The Sector Pulse groups (slugs) of these shares in one view, as /api/sectors/membership answers it; shares with no group are left out."""
    from .sector_api import _group_maps, _nse_classes   # imported here: sector_api is the web layer
    base = rel / sd.LEVELS_DIR if view == "sectors" else rel
    board = sd.read_json(base / "sectors" / "_board.json")
    if not isinstance(board, dict):
        return []
    by_ind, by_sec = _group_maps(board)
    cls, out = _nse_classes(), []
    for sym in symbols:
        if sym not in cls:
            continue
        ind, sec = cls[sym]
        hit = (by_sec.get(sec) if sec else None) if view == "sectors" else (by_ind.get(ind) or (by_sec.get(sec) if sec else None))
        if hit and hit["slug"] not in out:
            out.append(hit["slug"])
    return out


def wanted(entries: Iterable[Tuple[str, str, str]], mine: Optional[Dict[str, List[str]]] = None) -> Dict[Tuple[str, str], set]:
    """(view, slug) -> the kinds asked. A "mine" entry adds its kinds to each of the member's groups in that view (`mine`: view -> slugs)."""
    out: Dict[Tuple[str, str], set] = {}
    for k, v, s in entries:
        for slug in ((mine or {}).get(v, []) if s == MINE else [s]):
            out.setdefault((v, slug), set()).add(k)
    return out


async def auto_sector_alerts(pool, mailer, site_url: str, release=None) -> int:
    """Send this week's Sector Pulse alerts (state, box, top 5) the members set with "Alert me". Silver and Gold members, as the other built-in alerts."""
    from .alertengine import deliver   # imported here: alertengine imports this module's caller
    rel = release or sd.live_release()
    if rel is None:
        return 0
    cache: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    sent = 0
    async with pool.acquire() as conn:
        users = await conn.fetch(
            "SELECT u.id, u.email, s.prefs, s.portfolio FROM users u JOIN user_state s ON s.user_id = u.id "
            "WHERE u.status = 'active' AND u.email_verified_at IS NOT NULL AND u.plan IN ('silver', 'gold', 'mfetf', 'equity', 'combined', 'platinum') "
            "AND (u.plan_until IS NULL OR u.plan_until > now())")
        for u in users:
            prefs = json.loads(u["prefs"]) if isinstance(u["prefs"], str) else (u["prefs"] or {})
            entries = parse(prefs.get("sectorAlerts"))
            mine: Dict[str, List[str]] = {}
            for view in {v for _, v, sl in entries if sl == MINE}:
                try:
                    mine[view] = groups_of(rel, view, held_symbols(u["portfolio"]))
                except Exception:
                    log.exception("sector alert: the member's groups could not be read")
            asked = wanted(entries, mine)
            n = 0
            for (view, slug), kinds in asked.items():
                if (view, slug) not in cache:
                    try:
                        cache[(view, slug)] = events(rel, view, slug)
                    except Exception:
                        log.exception("sector alert events failed for %s:%s", view, slug)
                        cache[(view, slug)] = []
                for ev in cache[(view, slug)]:
                    if ev["kind"] not in kinds or n >= PER_RUN:
                        continue
                    try:
                        key = f"@{view}:{slug}"
                        new = await conn.fetchval("INSERT INTO auto_alert_sent (user_id, symbol, kind, period) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1",
                                                  u["id"], key, KINDS[ev["kind"]], ev["period"])
                        if not new:
                            continue
                        title, body = message(name_of(rel, view, slug), view, ev)
                        link = f"/sectors/{slug}" + ("?show=sectors" if view == "sectors" else "")
                        await deliver(conn, mailer, site_url, {"id": u["id"], "email": u["email"], "prefs": u["prefs"]},
                                      {"id": None, "symbol": key, "channels": ["app", "browser"]}, title, body, link)
                        n += 1
                        sent += 1
                    except Exception:   # one member's trouble must not stop the rest
                        log.exception("sector alert failed for %s", slug)
    log.info("Sector Pulse alerts: %d sent", sent)
    return sent
