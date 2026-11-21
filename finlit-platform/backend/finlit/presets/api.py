"""GET /api/screener/presets, /presets/{id} and /presets/{id}/export. Gold only (as the Prism columns of the Advanced score screener); admins see everything.
The server never sends a value above the plan: below Gold the list carries names and card text only (count null, locked true) and the detail answers 403."""
from __future__ import annotations

import csv
import io
import logging
import math
import re
from typing import Dict, List, Optional

import orjson
from fastapi import APIRouter, Request, Response

from ..auth.entitlements import has, sees_all
from ..auth.routes import NO_STORE, fail
from ..auth.service import current
from datetime import date as _date

from ..screener.data import get_table
from . import engine, history, savedlists, service
from .registry import ALL, BY_ID, DISCLAIMER, FEATURED_GROUPS, GROUPS, Preset, render_card

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/screener/presets")
gainers_router = APIRouter(prefix="/api/screener/gainers")
API_ONLY = ("exportRows",)


def _gold(ctx) -> bool:
    return bool(ctx.authed and (has(ctx.plan, "gold") or sees_all(ctx)))


def _allowed(ctx, tab: str = "advanced") -> bool:
    """The ready-made screens are built on FinLit Prism: Gold (task #283: the Basic tab, built on the retired FinLit IQ for Silver, is gone)."""
    return _gold(ctx)


def _tab_of(request: Request) -> str:
    """The one tab. An older request for ?tab=basic gets the same Prism screens (its own screens were retired with the Basic stock screener)."""
    return "advanced"


def _json(body, status: int = 200) -> Response:
    import json
    return Response(content=json.dumps(body, separators=(",", ":"), default=str), status_code=status, media_type="application/json", headers={**NO_STORE, "Vary": "Cookie"})


def _chips(p: Preset) -> List[dict]:
    return [{"id": c.id, "label": c.label, "default": c.default, "description": c.description} for c in p.chips]


def _list_text(p: Preset, cached: dict | None) -> str | None:
    """What the card says about its list: "Top 10 of 40 that pass" (the Top 10 screens), nothing for the others (they page through everything that passes)."""
    if not cached:
        return None
    if p.kind == "themes":
        return cached.get("listText")
    n = cached["count"]
    return f"Top {p.limit} of {n} that pass" if p.top10 else None      # the other screens page through everything that passes: the count says it all


NEW_DAYS = 14      # task #243: a new screen's card carries the NEW tag ("new screen") for two weeks after its first run


def _is_new(p: Preset, today: Optional[_date] = None) -> bool:
    if not p.added:
        return False
    return 0 <= ((today or _date.today()) - _date.fromisoformat(p.added)).days <= NEW_DAYS


def _about(p: Preset) -> Optional[dict]:
    """The i beside the screen's name (pack v4): what it shows, and three points on how to use it."""
    return {"shows": p.about[0], "use": list(p.about[1])} if p.about else None


def _with_meta(body: dict, p: Preset) -> dict:
    """Task #243: the i beside the name, the screen's own notes (first in the notes line), and whether it is new."""
    body["about"], body["isNew"] = _about(p), _is_new(p)
    if p.notes:
        body["notes"] = list(p.notes) + [n for n in (body.get("notes") or []) if n not in p.notes]
    return body


def _card(p: Preset, gold: bool, cached: dict | None) -> dict:
    live = p.status == "live" and p.kind != "quickview"
    return {"id": p.id, "name": p.name, "group": p.group, "cardText": render_card(p, (cached or {}).get("of", {}).get("n") if cached else None), "count": cached["count"] if (gold and cached) else None, "listText": _list_text(p, cached) if gold else None,
            "asOf": cached["asOf"] if (gold and cached) else None, "status": p.status, "blockedReason": p.blocked_reason, "chips": _chips(p), "howItWorks": list(p.how_it_works),
            "locked": not gold, "tab": p.tab, "kind": p.kind, "handledBy": "frontend" if p.kind == "quickview" else "server", "computed": bool(live and cached), "disclaimer": DISCLAIMER,
            "about": _about(p), "isNew": _is_new(p)}


async def _resolve(request: Request, pid: str):
    p = BY_ID.get(pid)
    if p is None:
        raise fail(404, "not_found", "No such screen.")
    ctx = await current(request)
    if not _allowed(ctx, p.tab):
        raise fail(403, "plan_required", "Prebuilt screens are part of the Gold plan.", plan="gold")
    if p.kind in ("blocked", "quickview"):
        raise fail(409, "blocked" if p.kind == "blocked" else "not_a_server_screen",
                   p.blocked_reason or "This quick view is handled by the page itself.", blockedReason=p.blocked_reason)
    try:
        active = engine.resolve_chips(p, request.query_params.getlist("chip") or None)
    except engine.UnknownChip as exc:
        raise fail(422, "unknown_chip", str(exc))
    return p, ctx, active


def _as_on(request: Request):
    raw = request.query_params.get("as_on")
    if not raw:
        return None
    try:
        d = _date.fromisoformat(raw)
    except ValueError:
        raise fail(422, "bad_as_on", "as_on must be a date like 2026-11-06.")
    if (_date.today() - d).days > history.SHOW_DAYS:
        raise fail(404, "outside_history", "That day is outside the last 2 months.")
    return d


RETIRED_KEYS = ("overall", "pillar_quality", "pillar_growth", "pillar_profitability", "pillar_balance", "pillar_technical")


def _bands_now(cols: List[dict]) -> List[dict]:
    """Task #283: a list stored before FinLit IQ was retired may still name one of its columns; it is never served (the rows keep only the columns shown)."""
    return [c for c in cols if c.get("key") not in RETIRED_KEYS]


def _history_columns(cols: List[dict], p: Preset, then: bool) -> List[dict]:
    """The On this list band (Added, Since added) after the standard columns and before This screen's own, on EVERY date; a past date adds one column, Since then,
    in its own "After this list" band, and never drops one (task #243, pack P5.1 and L3)."""
    if p.kind in ("themes", "gainers"):
        return cols
    cols = [c for c in cols if c.get("key") not in ("added_on", "since_added_pct", "since_then_pct")]
    extra = [{"key": "added_on", "label": "Added", "format": "date", "align": "left", "band": "On this list"},
             {"key": "since_added_pct", "label": "Since added", "format": "since", "align": "right", "band": "On this list"}]
    if then:
        extra.append({"key": "since_then_pct", "label": "Since then", "format": "since", "align": "right", "band": "After this list"})
    at = next((n for n, c in enumerate(cols) if c.get("band") == "This screen"), len(cols))          # after the standard columns, before this screen's own
    return cols[:at] + extra + cols[at:]


SAVED_KEYS = ("added_on", "lists_on", "added_baseline", "since_added_pct", "price_added", "price_on", "bench_since_added_pct", "since_then_pct", "price_latest", "bench_since_then_pct")


async def _saved_figures(store, p: Preset, active: List[str], rows: List[dict], day: _date) -> Optional[dict]:
    """Task #243 (pack L): Added, Since added (and Since then on a past date) on every row, worked out only from the screen's saved lists (savedlists.py), and the
    date bar's figures for that day. None when the screen has no saved list for the day."""
    sl = await savedlists.load(store, p.id, engine.chip_key(active))
    if day not in sl.days:
        return None
    bench = await history._bench(store, _date.today())
    latest = sl.days[-1]
    t = None
    if day != latest:
        try:
            t = await get_table(store)
        except Exception:
            t = None
    for r in rows:
        sym = r.get("symbol")
        lp = sl.on(latest).get(sym)
        if lp is None and t is not None and sym in t.pos and "price" in t.cols:      # no longer on the latest list: the latest close
            v = t.cols["price"][t.pos[sym]]
            lp = v if v == v else None
        r.update(savedlists.row_figures(sl, sym, day, lp, bench))
    j, l, prev = savedlists.joined_left(sl, day)
    return {"date": day.isoformat(), "latest": latest.isoformat(), "count": sl.counts.get(day, len(sl.on(day))), "joined": len(j) if prev else None,
            "left": len(l) if prev else None, "prev": prev.isoformat() if prev else None, "first": sl.days[0].isoformat(), "rulesUpdated": bool(sl.rules_changed.get(day))}


async def _gainers_body(request: Request, p: Preset) -> dict:
    win = p.id.rsplit("-", 1)[-1]
    got = await history.gainers_for(request.app.state.store, p.tab, win, _as_on(request))
    if got is None:
        raise fail(404, "no_history", "No Top gainers are stored for that day yet.")
    rows = [{**r, "position": r["rank"], "badges": []} for r in got["rows"]]
    for r in rows:
        r["stillOn"] = "On the list" if r.get("stillOn") else (f"Left {r['leftOn']}" if r.get("leftOn") else "Left")
        if r.get("others"):
            r["screen"] = f"{r['screen']} (also {', '.join(r['others'])})"
    page = "Advanced"
    return {"id": p.id, "name": p.name, "asOf": got["session"], "count": len(rows), "shown": len(rows), "columns": [{"key": c.key, "label": c.label, "format": c.format, "align": c.align} for c in p.columns],
            "rows": rows, "exportRows": rows, "chips": [], "howItWorks": [], "cardText": p.card_text, "disclaimer": DISCLAIMER, "pageSize": 25,
            "heading": f"The 20 biggest rises · of the companies that joined a {page} screen at one of the closes before {got['session']}" if rows else None,
            "emptyText": "No company that joined a screen in this period has risen yet." if not rows else None}


async def _body(request: Request, p: Preset, active: List[str]) -> dict:
    if p.kind == "gainers":
        return await _gainers_body(request, p)
    store = request.app.state.store
    as_on = _as_on(request)
    if as_on is not None:
        snap = await history.snapshot(store, p.id, engine.chip_key(active), as_on)
        if snap is None:
            raise fail(404, "no_history", "This screen has no stored list for that day.")
        base = await service.get_result(store, p, active) or {}
        for r in snap["rows"]:
            r.pop("_close", None)
        figs = await _saved_figures(store, p, active, snap["rows"], as_on)
        bench = await history._bench(store, as_on)
        b0, b1 = history._bench_at(bench, as_on.isoformat()), history._bench_at(bench, (figs or {}).get("latest") or _date.today().isoformat())
        out = {**base, "rows": snap["rows"], "exportRows": snap["rows"], "count": snap["count"], "shown": len(snap["rows"]), "asOn": snap["session"],
               "asOf": snap["session"], "benchSincePct": history._pct(b0, b1), "list": figs}      # L1: the date picked, everywhere
        out.pop("listText", None)
        out["columns"] = _bands_now(_history_columns(out.get("columns") or [], p, then=True))
        return _with_meta(out, p)
    body = await service.get_result(store, p, active)
    if body is None:
        raise fail(503, "computing", "This screen is being prepared. Try again in a few seconds.")
    try:       # Added and Since added on every row, from the saved lists (task #243, pack L); nothing is worked out on the page
        rows = body.get("exportRows") or body.get("rows") or []
        figs = await _saved_figures(store, p, active, rows, _date.fromisoformat(str(body["asOf"])[:10]))
        if figs is not None:
            body["list"] = figs
            if body.get("exportRows") is not None and body.get("rows") is not body["exportRows"]:
                by = {r["symbol"]: r for r in rows}
                for r in body.get("rows") or []:
                    if r["symbol"] in by:
                        r.update({k: v for k, v in by[r["symbol"]].items() if k in SAVED_KEYS})
        body["columns"] = _history_columns(body.get("columns") or [], p, then=False)
    except Exception:
        log.warning("saved-list figures not added for %s", p.id, exc_info=True)
    try:       # task #269: today's price and day change, the same as the company page, the search box and the dashboard
        latest = await latest_prices(request.app)
        seen = {id(r): r for r in (body.get("rows") or []) + (body.get("exportRows") or [])}
        if overlay_prices(list(seen.values()), latest, str(body["asOf"])):
            days = sorted({r["price_day"] for r in seen.values() if r.get("price_day")})
            body["priceDay"] = days[-1] if days else None
    except Exception:
        log.warning("latest prices not added for %s", p.id, exc_info=True)
    body["columns"] = _bands_now(body.get("columns") or [])
    body["name"] = p.name          # a list stored under an older name is served with today's (14 Nov N-35)
    return _with_meta(body, p)


async def latest_prices(app) -> Dict[str, tuple]:
    """Task #269 (20 Nov 2026, the team: "the scores are different when we open it", APOLLOHOSP at 8,738 -0.9% on a screen and 9,141 +4.61% on its page): a
    screen's list is built from last night's frame, so its price and day change were last night's close all day while the company page showed today's.
    These are the latest prices the search box and the dashboard use (search.quote_rows: the stored report or the market-wide listing, whichever is newer,
    with the trading day it belongs to), from their saved copy (rebuilt every 2 minutes). {symbol: (price, day change %, trading day)}."""
    from .. import search
    try:
        raw = await app.state.store.redis.hget("search-quotes:silver", "body")
    except Exception:
        raw = None
    if raw is None:
        raw = (await search.build(app, "silver"))[0]
    doc = orjson.loads(raw)
    return {r[0]: (r[1], r[2], r[3]) for r in doc.get("rows") or [] if r[1] is not None and r[3]}


def overlay_prices(rows: List[dict], latest: Dict[str, tuple], list_day: str) -> int:
    """Each row's price and day change set to the latest when it is from the list's own trading day or later (an older one is never put over a newer
    close); the row says which day its price is from (price_day). Whether a company is on the screen still follows the list's rules. Returns how many changed."""
    n = 0
    for r in rows:
        q = latest.get(r.get("symbol"))
        if q is None or q[2] < list_day[:10]:
            continue
        r["price"], r["ret_1d"], r["price_day"] = q[0], q[1], q[2]
        n += 1
    return n


FIGURE = {"setups": ("From 52-week high", "pct_from_high"), "top-gainers": ("Since it joined", "since")}


def _score_figure(tab: str = "advanced") -> tuple:
    return ("FinLit Prism", "prism_final")


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None


async def _joined_counts(store, keys: List[tuple]) -> dict:
    """{(preset_id, chips): companies on the list now whose Added date is that screen's latest close}. Lists built on the first stored close count none:
    every company on them was already there when FinLit began storing lists, so 'joined since yesterday' would not be true."""
    if not keys:
        return {}
    base = await history.baseline_session(store)
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT preset_id, chips, added_on, count(*) AS n FROM screen_spells WHERE left_on IS NULL AND preset_id = ANY($1::text[]) "
                                "AND added_on >= CURRENT_DATE - 14 GROUP BY preset_id, chips, added_on", list({k[0] for k in keys}))
    out = {}
    for r in rows:
        if base is not None and r["added_on"] == base:
            continue
        out[(r["preset_id"], r["chips"], r["added_on"].isoformat())] = r["n"]
    return out


def _first3(p: Preset, cached: dict | None, table) -> List[dict]:
    """The first three companies on the stored list, in the list's own order, each with the figure the card names (the score, the distance from the
    52-week high, or for Top gainers the change since it joined). Values come from the stored rows or the screener table; a missing one stays None."""
    rows = (cached or {}).get("rows") or (cached or {}).get("exportRows") or []
    _, key = FIGURE.get(p.group, _score_figure(p.tab))
    out = []
    for r in rows[:3]:
        v = _num(r.get(key))
        if v is None and table is not None and key in table.cols and r.get("symbol") in table.pos:
            v = _num(table.cols[key][table.pos[r["symbol"]]])
        out.append({"symbol": r.get("symbol"), "name": r.get("name") or r.get("symbol"), "value": None if v is None else round(float(v), 2)})
    return out


@router.get("")
async def listing(request: Request):
    ctx = await current(request)
    tab = _tab_of(request)
    gold = _allowed(ctx, tab)
    store = request.app.state.store
    by_group = {g: [] for g, _ in GROUPS}
    as_of = None
    found = []
    for p in ALL:
        if p.tab != tab or p.status == "blocked":      # task #243 (pack L12): a screen that cannot run yet is not listed; its card comes back once it runs
            continue
        cached = None
        if gold and p.kind == "gainers" and p.status == "live":
            try:      # Top gainers are stored per close, not as a screen result: the card reads the latest stored list
                g = await history.gainers_for(store, p.tab, p.id.rsplit("-", 1)[-1], None)
            except Exception:
                g = None
            if g is not None:
                cached = {"count": len(g["rows"]), "asOf": g["session"], "rows": g["rows"]}
        elif gold and p.status == "live" and p.kind != "quickview":
            cached = await service.read_cached(store, p.id, engine.chip_key([c.id for c in p.chips if c.default]))
            as_of = max(filter(None, [as_of, (cached or {}).get("asOf")]), default=as_of)
        card = _card(p, gold, cached)
        found.append((p, card, cached))
        by_group[p.group].append(card)
    if gold:      # the strip's cards (task #64, N-38): pass count, how many joined at the latest close, the first three with their figure
        try:
            table = await get_table(store)
        except Exception:      # the cards then show the figures the stored rows carry, and a dash with its reason for the rest
            table = None
        keys = [(p.id, engine.chip_key([c.id for c in p.chips if c.default])) for p, _, cached in found if cached and p.kind != "gainers"]
        try:
            joined = await _joined_counts(store, keys)
        except Exception:
            joined = None
        for p, card, cached in found:
            card["top10"] = bool(p.top10)
            card["figure"] = FIGURE.get(p.group, _score_figure(p.tab))[0]
            if not cached:
                continue
            if p.kind == "gainers":
                card["count"], card["asOf"] = cached["count"], cached["asOf"]
            card["first"] = _first3(p, cached, table)
            if joined is not None and p.kind != "gainers" and cached.get("asOf"):
                card["joined"] = joined.get((p.id, engine.chip_key([c.id for c in p.chips if c.default]), str(cached["asOf"])[:10]), 0)
    return _json({"tab": tab, "asOf": as_of, "groups": [{"id": g, "name": n, "featured": g in FEATURED_GROUPS, "presets": by_group[g], **GROUP_EXTRA.get(g, {})}
                                                        for g, n in GROUPS if by_group[g]]})


# Task #243 (pack v4): the Sectors tab (Advanced only) is new, and has a one-line intro over its cards with an i.
GROUP_EXTRA: Dict[str, dict] = {"sectors": {
    "isNew": True,
    "intro": "Screens that read each company's industry: where it stands on Sector Rotation and Sector Pulse, and how the company compares with its peers.",
    "about": {"shows": "Sector Rotation places each industry against the average industry: Ahead and gaining, Ahead but slowing, Behind but gaining or Behind and slipping. "
                       "Sector Pulse reads how many of an industry's stocks are rising: Sold off, Bouncing back, Bouncing back after a crash, Rising together, Losing steam or No clear signal. "
                       "The peer label compares a company with the others in its industry: Leader, In line or Laggard.",
              "use": ["Pick a screen by the question it answers: leaders in strong industries, the first stocks to rise in weak ones, or setups with the industry behind them.",
                      "Columns, then Sector reading, adds the same five readings to any Advanced screen.",
                      "The sector reading comes from a weekly run: the page says which date it is from."]}}}


BADGE_GROUPS = ("top-rated", "themes")      # the screens a company page names: the highest-rated lists and the themes (a value or safety screen would read as a verdict on one company)
SYMBOL = re.compile(r"^[A-Z0-9&._-]{1,24}$")


@router.get("/for/{symbol}")
async def screens_for(request: Request, symbol: str):
    """The top-rated and theme screens a company is in, from the latest nightly results (every company that passes, not only the ones shown). Gold, like the screens."""
    ctx = await current(request)
    if not _gold(ctx):
        raise fail(403, "plan_required", "Prebuilt screens are part of the Gold plan.", plan="gold")
    sym = symbol.strip().upper()
    if not SYMBOL.match(sym):
        raise fail(422, "bad_symbol", "That is not a company symbol.")
    store, screens, as_of, ready = request.app.state.store, [], None, False
    for p in ALL:
        if p.tab != "advanced" or p.group not in BADGE_GROUPS or p.status != "live" or p.kind in ("blocked", "quickview"):
            continue
        cached = await service.read_cached(store, p.id, engine.chip_key([c.id for c in p.chips if c.default]))
        if not cached:
            continue
        ready = True
        as_of = max(filter(None, [as_of, cached.get("asOf")]), default=as_of)
        if any(r.get("symbol") == sym for r in (cached.get("exportRows") or cached.get("rows") or [])):
            screens.append({"id": p.id, "name": p.name, "group": p.group, "asOf": cached.get("asOf")})
    return _json({"symbol": sym, "screens": screens, "ready": ready, "asOf": as_of})


def _int(request: Request, name: str, default: int, lo: int, hi: int) -> int:
    raw = request.query_params.get(name)
    if raw is None or raw == "":
        return default
    try:
        v = int(raw)
    except ValueError:
        raise fail(422, "bad_" + name, f"{name} must be a whole number.")
    if v < lo or v > hi:
        raise fail(422, "bad_" + name, f"{name} must be between {lo} and {hi}.")
    return v


def _size_of(r: dict) -> str | None:
    mc = r.get("market_cap")
    from ..sizes import size_of
    return size_of(mc) if isinstance(mc, (int, float)) else None


def _strong(r: dict) -> bool:
    """Prism Strong or Healthy (65 or more). Task #283: the retired FinLit IQ is never read."""
    pr = r.get("prism_final")
    return isinstance(pr, (int, float)) and not isinstance(pr, bool) and pr >= 65


def _strong_only(r: dict) -> bool:
    """Prism Strong (80 or more)."""
    pr = r.get("prism_final")
    return isinstance(pr, (int, float)) and not isinstance(pr, bool) and pr >= 80


def _bse_only(r: dict) -> bool:
    return str(r.get("exchange") or "").upper() == "BSE"


# Task #258 (20 Nov handoff, Advanced SPEC §2 and §3): an open Advanced screen filters on NSE's three levels, the Prism rating words, five score ranges and
# the two technical views in five words. NSE's classification (task #192) is read once an hour and joined onto the screen's rows.
_CLS: Dict[str, object] = {"at": 0.0, "map": {}}
CLS_TTL = 3600.0


async def _classification(store) -> Dict[str, tuple]:
    import time
    if _CLS["map"] and time.monotonic() - float(_CLS["at"]) < CLS_TTL:      # type: ignore[arg-type]
        return _CLS["map"]       # type: ignore[return-value]
    try:
        async with store.pool.acquire() as conn:
            rows = await conn.fetch("SELECT symbol, macro_sector, sector, industry FROM company_classification")
        _CLS["map"] = {r["symbol"]: (r["macro_sector"] or None, r["sector"] or None, r["industry"] or None) for r in rows}
        _CLS["at"] = time.monotonic()
    except Exception:
        log.warning("NSE classification not read for the open screen", exc_info=True)
    return _CLS["map"]       # type: ignore[return-value]


async def _with_classification(store, body: dict) -> dict:
    """Adds cls_macro / cls_sector / cls_industry to each row of a screen (None when NSE does not classify the company)."""
    cls = await _classification(store)
    seen = set()
    for r in (body.get("exportRows") or []) + (body.get("rows") or []):
        if id(r) in seen or not isinstance(r, dict):
            continue
        seen.add(id(r))
        r["cls_macro"], r["cls_sector"], r["cls_industry"] = cls.get(r.get("symbol"), (None, None, None))
    return body


def _name_key(s) -> str:
    """A level name without case, commas or spacing: NSE's file writes "Oil, Gas & Consumable Fuels", the site's taxonomy "Oil Gas & Consumable Fuels"."""
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


RATING_SLUGS = ("strong", "healthy", "average", "weak", "poor", "notrated")
TREND5 = ("su", "u", "s", "d", "sd")
_TREND_OF = {"strongpos": "su", "pos": "u", "neutral": "s", "neg": "d", "strongneg": "sd"}
SCORE_RANGES = {"z": "prism_final", "zf": "prism_fundamental", "zv": "prism_valuation", "zq": "prism_quality", "zr": "prism_risk"}
# Task #283: the Basic screen's panel on the retired FinLit IQ (its ranges o, pq ... pt and its rating groups, ?iqg=) is gone; such parameters are ignored.


def _rating_of(r: dict) -> str:
    """SHARED §4: Strong 80 and above, Healthy 65-79, Average 50-64, Weak 35-49, Poor below 35, Not rated without a Prism score."""
    v = r.get("prism_final")
    if not isinstance(v, (int, float)) or isinstance(v, bool) or v != v:
        return "notrated"
    return "strong" if v >= 80 else "healthy" if v >= 65 else "average" if v >= 50 else "weak" if v >= 35 else "poor"


def _trend_of(v) -> Optional[str]:
    from ..technical_wording import score_band
    return _TREND_OF.get(score_band(v))


def _range_of(qp, k: str) -> Optional[tuple]:
    """A from-to box pair: empty means no limit, values are held to 0-100; None when neither box is set."""
    def one(name):
        raw = (qp.get(name) or "").strip()
        try:
            v = float(raw)
        except ValueError:
            return None
        return None if v != v else min(100.0, max(0.0, v))
    lo, hi = one(k + "min"), one(k + "max")
    if lo is None and hi is None:
        return None
    if lo is not None and hi is not None and lo > hi:
        lo, hi = hi, lo
    return (lo, hi)


# Task #243 (pack P4): the open screen's filters. Each one is a test on a row; the drop-downs offer each option with the number of rows it would leave, given the
# OTHER filters that are on. "New on this list" = joined since the previous saved list; "Ahead of NIFTY 500 since added" = Since added above NIFTY 500 over the same days.
def _bar(request: Request) -> dict:
    qp = request.query_params
    rating = qp.get("rating") or ("healthy" if qp.get("strong") == "1" else "")
    return {"q": (qp.get("q") or "").strip().lower()[:60], "size": set(qp.getlist("size")), "sector": set(qp.getlist("sector")),
            "rating": rating if rating in ("healthy", "strong") else "", "new": qp.get("new") == "1", "ahead": qp.get("ahead") == "1", "nse": qp.get("nse") == "1",
            "fno": qp.get("fno") == "1", "liquid": qp.get("liquid") == "1",
            # task #243 (pack v4, Advanced): Industry ahead and gaining, Peer leaders only, and the industry board's chip (an industry's address on Sector Pulse)
            "sag": qp.get("sag") == "1", "plead": qp.get("plead") == "1", "ind": (qp.get("ind") or "").strip().lower()[:80],
            # task #258 (Advanced SPEC §2, §3): NSE's macro sector, sector and industry; the Prism rating words, score ranges and the five trend words
            "macro": {x[:80] for x in qp.getlist("macro") if x}, "nsec": {x[:80] for x in qp.getlist("nsec") if x}, "indu": {x[:80] for x in qp.getlist("indu") if x},
            "pl": {x for x in ",".join(qp.getlist("pl")).split(",") if x in RATING_SLUGS},
            "ranges": {k: rg for k in SCORE_RANGES if (rg := _range_of(qp, k)) is not None},
            "st5": {x for x in (qp.get("st5") or "").split(",") if x in TREND5}, "lt5": {x for x in (qp.get("lt5") or "").split(",") if x in TREND5}}


def _tests(f: dict, new_day: Optional[str]) -> Dict[str, object]:
    t: Dict[str, object] = {}
    if f["q"]:
        q = f["q"]; t["q"] = lambda r: q in str(r.get("symbol", "")).lower() or q in str(r.get("name", "")).lower() or q in str(r.get("sector", "")).lower()
    if f["size"]:
        t["size"] = lambda r: _size_of(r) in f["size"]
    if f["sector"]:
        t["sector"] = lambda r: r.get("sector") in f["sector"]
    if f["rating"]:
        t["rating"] = _strong_only if f["rating"] == "strong" else _strong
    if f["new"]:
        t["new"] = lambda r: bool(new_day) and r.get("added_on") == new_day and not r.get("added_baseline")
    if f["ahead"]:
        t["ahead"] = lambda r: isinstance(r.get("since_added_pct"), (int, float)) and isinstance(r.get("bench_since_added_pct"), (int, float)) and r["since_added_pct"] > r["bench_since_added_pct"]
    if f["nse"]:
        t["nse"] = lambda r: not _bse_only(r)
    if f.get("fno"):
        t["fno"] = _fno_on
    if f.get("liquid"):
        t["liquid"] = _liquid
    if f.get("sag"):
        t["sag"] = _sector_ahead
    if f.get("plead"):
        t["plead"] = _peer_leader
    if f.get("ind"):
        ind = f["ind"]; t["ind"] = lambda r: r.get("sr_slug") == ind
    if f.get("macro"):
        want_m = {_name_key(x) for x in f["macro"]}; t["macro"] = lambda r: _name_key(r.get("cls_macro")) in want_m
    if f.get("nsec"):
        want_s = {_name_key(x) for x in f["nsec"]}; t["nsec"] = lambda r: _name_key(r.get("cls_sector")) in want_s
    if f.get("indu"):
        want_i = {_name_key(x) for x in f["indu"]}; t["indu"] = lambda r: _name_key(r.get("cls_industry")) in want_i
    if f.get("pl"):
        t["pl"] = lambda r: _rating_of(r) in f["pl"]
    for k, (lo, hi) in (f.get("ranges") or {}).items():
        col = SCORE_RANGES[k]
        t["rg_" + k] = lambda r, col=col, lo=lo, hi=hi: isinstance(r.get(col), (int, float)) and (lo is None or r[col] >= lo) and (hi is None or r[col] <= hi)
    for k, col in (("st5", "prism_st_score"), ("lt5", "prism_lt_score")):
        if f.get(k):
            t[k] = lambda r, col=col, want=f[k]: _trend_of(r.get(col)) in want
    return t


def _sector_ahead(r: dict) -> bool:
    return r.get("sr_ag") == 1


def _peer_leader(r: dict) -> bool:
    return r.get("sr_lead") == 1


def _board(rows: List[dict], tests: Dict[str, object]) -> List[dict]:
    """The industry board of a Sectors screen: one chip per industry on the list (after the other filters), with its count, rotation corner and Pulse state.
    The counts add up to the list; a company with no sector reading is counted under "No sector reading"."""
    by: Dict[str, dict] = {}
    for r in rows:
        if not _passes(r, tests, "ind"):
            continue
        slug = r.get("sr_slug") or ""
        b = by.setdefault(slug, {"slug": slug or None, "name": r.get("sr_industry") or "No sector reading", "n": 0, "corner": r.get("sr_corner"),
                                 "rotation": (r.get("sr_rotation") or "").split(" · ")[0] or None, "pulse": r.get("sr_pulse"), "pulseCode": r.get("sr_pulse_code")})
        b["n"] += 1
    return sorted(by.values(), key=lambda b: (b["slug"] is None, -b["n"], str(b["name"])))


LIQUID_CR = 10.0     # pack v4: "Liquid only" = 20-session average value traded of Rs 10 Cr or more


def _fno_on(r: dict) -> bool:
    return r.get("fno") == 1


def _liquid(r: dict) -> bool:
    v = r.get("turnover20_cr")
    return isinstance(v, (int, float)) and v >= LIQUID_CR


def _passes(r: dict, tests: Dict[str, object], skip: str = "") -> bool:
    return all(fn(r) for k, fn in tests.items() if k != skip)       # type: ignore[operator]


def _facets(rows: List[dict], tests: Optional[Dict[str, object]] = None, new_day: Optional[str] = None) -> dict:
    """What the filters offer for this screen's list: each option's count is the rows it would leave with the other filters that are on."""
    tests = tests or {}
    sizes: Dict[str, int] = {}
    sectors: Dict[str, int] = {}
    for r in rows:
        if _passes(r, tests, "size"):
            z = _size_of(r)
            if z:
                sizes[z] = sizes.get(z, 0) + 1
        if _passes(r, tests, "sector") and r.get("sector"):
            sectors[r["sector"]] = sectors.get(r["sector"], 0) + 1
    probe = _tests({"q": "", "size": set(), "sector": set(), "rating": "", "new": True, "ahead": True, "nse": True, "fno": True, "liquid": True, "sag": True, "plead": True, "ind": ""}, new_day)
    n = lambda key, fn: sum(1 for r in rows if _passes(r, tests, key) and fn(r))       # noqa: E731
    # task #258 (SPEC §2, §3): each NSE level's values on this list with their counts (own level left out), and the counts of each rating and trend word
    levels: Dict[str, Dict[str, int]] = {"macros": {}, "nsecs": {}, "industries": {}}
    ratings = {s: 0 for s in RATING_SLUGS}
    trend = {"st": {s: 0 for s in TREND5}, "lt": {s: 0 for s in TREND5}}
    for r in rows:
        for key, test, col in (("macros", "macro", "cls_macro"), ("nsecs", "nsec", "cls_sector"), ("industries", "indu", "cls_industry")):
            if r.get(col) and _passes(r, tests, test):
                levels[key][r[col]] = levels[key].get(r[col], 0) + 1
        if _passes(r, tests, "pl"):
            ratings[_rating_of(r)] += 1
        for k, col in (("st", "prism_st_score"), ("lt", "prism_lt_score")):
            w = _trend_of(r.get(col))
            if w and _passes(r, tests, k + "5"):
                trend[k][w] += 1
    return {**{k: sorted(v.items(), key=lambda kv: (-kv[1], kv[0])) for k, v in levels.items()}, "ratings": ratings, "trend": trend,
            "sizes": sizes, "sectors": sorted(sectors.items(), key=lambda kv: (-kv[1], kv[0]))[:80],
            "strong": n("rating", _strong), "strongOnly": n("rating", _strong_only), "anyRating": n("rating", lambda r: True),
            "new": n("new", probe["new"]), "ahead": n("ahead", probe["ahead"]), "nse": n("nse", probe["nse"]), "bse": sum(1 for r in rows if _bse_only(r)),
            "fno": n("fno", probe["fno"]), "liquid": n("liquid", probe["liquid"]),
            "sag": n("sag", probe["sag"]), "plead": n("plead", probe["plead"])}


def _filtered(request: Request, rows: List[dict], new_day: Optional[str] = None) -> List[dict]:
    """The open screen's filters, applied to the screen's own list. Order and ranks stay as the screen made them."""
    tests = _tests(_bar(request), new_day)
    return rows if not tests else [r for r in rows if _passes(r, tests)]


def _page(request: Request, body: dict) -> dict:
    """A screen that is not a Top-10 list and not a theme view pages: `offset` (default 0) and `limit` (default 25, at most EXPORT_MAX) pick rows of the ranked list.
    The answer carries `offset`, `limit`, `available` (rows that can be paged to) and `hasMore`; `count` stays the number of companies that pass."""
    if "pageSize" not in body:
        return body
    avail = body.get("exportRows") or body["rows"]
    lst = body.get("list") or {}
    new_day = lst.get("date") if lst.get("prev") else None          # the first saved list has no "new": nothing to compare with
    tests = _tests(_bar(request), new_day)
    facets = _facets(avail, tests, new_day)
    board = _board(avail, tests) if BY_ID.get(str(body.get("id"))) is not None and BY_ID[str(body["id"])].group == "sectors" else None
    avail = _filtered(request, avail, new_day)
    body = {**body, "facets": facets, "filtered": len(avail)} if len(avail) != len(body.get("exportRows") or body["rows"]) or facets else body
    if board is not None:
        body = {**body, "industryBoard": board}
    offset = _int(request, "offset", 0, 0, engine.EXPORT_MAX)
    limit = _int(request, "limit", body["pageSize"], 1, engine.EXPORT_MAX)
    rows = avail[offset:offset + limit]
    return {**body, "rows": rows, "shown": len(rows), "offset": offset, "limit": limit, "available": len(avail), "hasMore": offset + len(rows) < len(avail)}


@router.get("/{pid}")
async def detail(request: Request, pid: str):
    p, ctx, active = await _resolve(request, pid)
    body = await _body(request, p, active)
    # task #258: NSE's three levels on every row, for the open screen's Macro sector, Sector and Industry filters
    body = await _with_classification(request.app.state.store, body)
    body = _page(request, body)
    await service.log_usage(request.app.state.store, p.id, "open")
    return _json({k: v for k, v in body.items() if k not in API_ONLY})


@router.get("/{pid}/history")
async def history_route(request: Request, pid: str):
    p, ctx, active = await _resolve(request, pid)
    if p.kind == "gainers":
        return _json({"id": p.id, "sessions": await history.gainer_sessions(request.app.state.store, p.tab, p.id.rsplit("-", 1)[-1])})
    store = request.app.state.store      # task #243 (pack P3, L7): every saved list with joined / left, and the trading days with no saved list
    sl = await savedlists.load(store, p.id, engine.chip_key(active))
    return _json({"id": p.id, "sessions": savedlists.sessions_view(sl, await history._bench(store, _date.today()))})


@router.get("/{pid}/left")
async def left_route(request: Request, pid: str):
    p, ctx, active = await _resolve(request, pid)
    store, key = request.app.state.store, engine.chip_key(active)      # task #243 (pack P8, L9, L15): follows the date picked, only from saved lists
    sl = await savedlists.load(store, p.id, key)
    if not sl.days:
        return _json({"id": p.id, "date": None, "left": [], "counts": {"on": 0, "upto": 0, "after": 0}})
    day = _as_on(request) or sl.days[-1]
    if day not in sl.days:
        raise fail(404, "no_history", "This screen has no stored list for that day.")
    mode = request.query_params.get("mode") or "on"
    if mode not in ("on", "upto", "after"):
        raise fail(422, "bad_mode", "mode must be on, upto or after.")
    reasons = await savedlists.reasons_for(store, p.id, key)
    rows = savedlists.left_rows(sl, day, mode, reasons)
    for r in rows:
        r["sessions"] = r["lists_on"]       # the older name the page read
    counts = {m: len(savedlists.left_rows(sl, day, m)) for m in ("on", "upto", "after")}
    return _json({"id": p.id, "date": day.isoformat(), "first": sl.days[0].isoformat(), "mode": mode, "left": rows, "counts": counts})


@router.get("/{pid}/export")
async def export(request: Request, pid: str):
    p, ctx, active = await _resolve(request, pid)
    body = await _body(request, p, active)
    cols = body["columns"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Symbol"] + [c["label"] for c in cols])
    for r in body.get("exportRows", []):
        w.writerow([r["symbol"]] + ["" if r.get(c["key"]) is None else r[c["key"]] for c in cols])
    w.writerow([])
    w.writerow([DISCLAIMER + f" {p.name}, as of {body['asOf']}."])
    await service.log_usage(request.app.state.store, p.id, "export")
    return Response(content="﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={**NO_STORE, "Content-Disposition": f'attachment; filename="finlit-{p.id}.csv"'})


@gainers_router.get("")
async def gainers_route(request: Request):
    """Top gainers of a window, for the latest close or any close of the last 2 months. Gold, like the screens (task #283: the Basic page is retired; an older
    ?page=basic gets the same list)."""
    page = "advanced"
    win = request.query_params.get("window", "day")
    if win not in history.WINDOWS:
        raise fail(422, "bad_window", "window must be day, week or month.")
    ctx = await current(request)
    if not _allowed(ctx, page):
        raise fail(403, "plan_required", "Top gainers are part of the Gold plan.", plan="gold")
    got = await history.gainers_for(request.app.state.store, page, win, _as_on(request))
    if got is None:
        raise fail(404, "no_history", "No Top gainers are stored for that day yet.")
    return _json(got)
