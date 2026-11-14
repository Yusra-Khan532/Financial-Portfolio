"""GET /api/screener/presets, /presets/{id} and /presets/{id}/export. Gold only (as the Prism columns of the Advanced score screener); admins see everything.
The server never sends a value above the plan: below Gold the list carries names and card text only (count null, locked true) and the detail answers 403."""
from __future__ import annotations

import csv
import io
import re
from typing import List

from fastapi import APIRouter, Request, Response

from ..auth.entitlements import has, sees_all
from ..auth.routes import NO_STORE, fail
from ..auth.service import current
from datetime import date as _date

from ..screener.data import get_table
from . import engine, history, service
from .registry import ALL, BY_ID, DISCLAIMER, GROUPS, Preset, render_card

router = APIRouter(prefix="/api/screener/presets")
gainers_router = APIRouter(prefix="/api/screener/gainers")
API_ONLY = ("exportRows",)


def _gold(ctx) -> bool:
    return bool(ctx.authed and (has(ctx.plan, "gold") or sees_all(ctx)))


def _allowed(ctx, tab: str) -> bool:
    """The Advanced tab's screens are Gold (Prism columns); the Basic tab's are Silver (FinLit score columns)."""
    return bool(ctx.authed and (has(ctx.plan, "gold" if tab == "advanced" else "silver") or sees_all(ctx)))


def _tab_of(request: Request) -> str:
    return "basic" if request.query_params.get("tab") == "basic" else "advanced"


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


def _card(p: Preset, gold: bool, cached: dict | None) -> dict:
    live = p.status == "live" and p.kind != "quickview"
    return {"id": p.id, "name": p.name, "group": p.group, "cardText": render_card(p, (cached or {}).get("of", {}).get("n") if cached else None), "count": cached["count"] if (gold and cached) else None, "listText": _list_text(p, cached) if gold else None,
            "asOf": cached["asOf"] if (gold and cached) else None, "status": p.status, "blockedReason": p.blocked_reason, "chips": _chips(p), "howItWorks": list(p.how_it_works),
            "locked": not gold, "tab": p.tab, "kind": p.kind, "handledBy": "frontend" if p.kind == "quickview" else "server", "computed": bool(live and cached), "disclaimer": DISCLAIMER}


async def _resolve(request: Request, pid: str):
    p = BY_ID.get(pid)
    if p is None:
        raise fail(404, "not_found", "No such screen.")
    ctx = await current(request)
    if not _allowed(ctx, p.tab):
        need = "gold" if p.tab == "advanced" else "silver"
        raise fail(403, "plan_required", f"Prebuilt screens on this tab are part of the {need.title()} plan.", plan=need)
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


def _history_columns(cols: List[dict], p: Preset, then: bool) -> List[dict]:
    """The On this list band: Added and Since added (Since then when a past day is shown), after the standard columns and before This screen's own."""
    if p.kind in ("themes", "gainers") or any(c["key"] in ("added_on", "since_added_pct", "since_then_pct") for c in cols):
        return cols
    extra = [{"key": "added_on", "label": "Added", "format": "date", "align": "left", "band": "On this list"} if not then else None,
             {"key": "since_then_pct" if then else "since_added_pct", "label": "Since then" if then else "Since added", "format": "since", "align": "right", "band": "On this list"}]
    extra = [c for c in extra if c]
    at = next((n for n, c in enumerate(cols) if c.get("band") == "This screen"), len(cols))          # after the standard columns, before this screen's own
    return cols[:at] + extra + cols[at:]


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
    page = "Basic" if p.tab == "basic" else "Advanced"
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
        latest = {}
        t = await get_table(store)
        for r in snap["rows"]:
            i = t.pos.get(r["symbol"])
            latest[r["symbol"]] = t.cols["price"][i] if i is not None and "price" in t.cols and t.cols["price"][i] == t.cols["price"][i] else None
            c0 = r.pop("_close", None)
            r["since_then_pct"] = None if not c0 or not latest[r["symbol"]] else round((latest[r["symbol"]] / c0 - 1) * 100, 2)
        bench = await history._bench(store, as_on)
        b0, b1 = history._bench_at(bench, as_on.isoformat()), history._bench_at(bench, _date.today().isoformat())
        out = {**base, "rows": snap["rows"], "exportRows": snap["rows"], "count": snap["count"], "shown": len(snap["rows"]), "asOn": snap["session"],
               "benchSincePct": history._pct(b0, b1)}
        out.pop("listText", None)
        out["columns"] = _history_columns(out.get("columns") or [], p, then=True)
        return out
    body = await service.get_result(store, p, active)
    if body is None:
        raise fail(503, "computing", "This screen is being prepared. Try again in a few seconds.")
    try:       # Added and Since added on every row (the stored spells; nothing is worked out on the page)
        t = await get_table(store)
        latest = {r["symbol"]: (t.cols["price"][t.pos[r["symbol"]]] if r["symbol"] in t.pos else None) for r in (body.get("exportRows") or body.get("rows") or [])}
        bench = await history._bench(store, _date.today())
        rows = body.get("exportRows") or body.get("rows") or []
        await history.enrich(store, p.id, engine.chip_key(active), rows, {k: v for k, v in latest.items() if v == v}, bench, _date.fromisoformat(body["asOf"]))
        if body.get("exportRows") is not None and body.get("rows") is not body["exportRows"]:
            by = {r["symbol"]: r for r in rows}
            for r in body.get("rows") or []:
                if r["symbol"] in by:
                    r.update({k: by[r["symbol"]][k] for k in ("added_on", "since_added_pct", "bench_since_added_pct") if k in by[r["symbol"]]})
        body["columns"] = _history_columns(body.get("columns") or [], p, then=False)
    except Exception:
        pass
    return body


@router.get("")
async def listing(request: Request):
    ctx = await current(request)
    tab = _tab_of(request)
    gold = _allowed(ctx, tab)
    store = request.app.state.store
    by_group = {g: [] for g, _ in GROUPS}
    as_of = None
    for p in ALL:
        if p.tab != tab:
            continue
        cached = None
        if gold and p.status == "live" and p.kind != "quickview":
            cached = await service.read_cached(store, p.id, engine.chip_key([c.id for c in p.chips if c.default]))
            as_of = max(filter(None, [as_of, (cached or {}).get("asOf")]), default=as_of)
        by_group[p.group].append(_card(p, gold, cached))
    return _json({"tab": tab, "asOf": as_of, "groups": [{"id": g, "name": n, "presets": by_group[g]} for g, n in GROUPS if by_group[g]]})


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
    return None if not isinstance(mc, (int, float)) else ("Large" if mc > 50000 else "Mid" if mc >= 10000 else "Small")


def _strong(r: dict) -> bool:
    iq, pr = r.get("overall"), r.get("prism_final")
    return (isinstance(iq, (int, float)) and iq >= 62) or (isinstance(pr, (int, float)) and pr >= 65)


def _facets(rows: List[dict]) -> dict:
    """What the filter bar offers for this screen's list: counts by size and by sector (the list as the screen made it, before the bar's own filters)."""
    sizes, sectors = {}, {}
    for r in rows:
        z = _size_of(r)
        if z:
            sizes[z] = sizes.get(z, 0) + 1
        if r.get("sector"):
            sectors[r["sector"]] = sectors.get(r["sector"], 0) + 1
    return {"sizes": sizes, "sectors": sorted(sectors.items(), key=lambda kv: (-kv[1], kv[0]))[:80], "strong": sum(1 for r in rows if _strong(r))}


def _filtered(request: Request, rows: List[dict]) -> List[dict]:
    """The filter bar: search, size, sector and Only Strong or Healthy, applied to the screen's own list. Order and ranks stay as the screen made them."""
    q = (request.query_params.get("q") or "").strip().lower()[:60]
    sizes = set(request.query_params.getlist("size"))
    secs = set(request.query_params.getlist("sector"))
    strong = request.query_params.get("strong") == "1"
    if not (q or sizes or secs or strong):
        return rows
    out = []
    for r in rows:
        if q and q not in str(r.get("symbol", "")).lower() and q not in str(r.get("name", "")).lower() and q not in str(r.get("sector", "")).lower():
            continue
        if sizes and _size_of(r) not in sizes:
            continue
        if secs and r.get("sector") not in secs:
            continue
        if strong and not _strong(r):
            continue
        out.append(r)
    return out


def _page(request: Request, body: dict) -> dict:
    """A screen that is not a Top-10 list and not a theme view pages: `offset` (default 0) and `limit` (default 25, at most EXPORT_MAX) pick rows of the ranked list.
    The answer carries `offset`, `limit`, `available` (rows that can be paged to) and `hasMore`; `count` stays the number of companies that pass."""
    if "pageSize" not in body:
        return body
    avail = body.get("exportRows") or body["rows"]
    facets = _facets(avail)
    avail = _filtered(request, avail)
    body = {**body, "facets": facets, "filtered": len(avail)} if len(avail) != len(body.get("exportRows") or body["rows"]) or facets else body
    offset = _int(request, "offset", 0, 0, engine.EXPORT_MAX)
    limit = _int(request, "limit", body["pageSize"], 1, engine.EXPORT_MAX)
    rows = avail[offset:offset + limit]
    return {**body, "rows": rows, "shown": len(rows), "offset": offset, "limit": limit, "available": len(avail), "hasMore": offset + len(rows) < len(avail)}


@router.get("/{pid}")
async def detail(request: Request, pid: str):
    p, ctx, active = await _resolve(request, pid)
    body = _page(request, await _body(request, p, active))
    await service.log_usage(request.app.state.store, p.id, "open")
    return _json({k: v for k, v in body.items() if k not in API_ONLY})


@router.get("/{pid}/history")
async def history_route(request: Request, pid: str):
    p, ctx, active = await _resolve(request, pid)
    if p.kind == "gainers":
        return _json({"id": p.id, "sessions": await history.gainer_sessions(request.app.state.store, p.tab, p.id.rsplit("-", 1)[-1])})
    return _json({"id": p.id, "sessions": await history.sessions(request.app.state.store, p.id, engine.chip_key(active))})


@router.get("/{pid}/left")
async def left_route(request: Request, pid: str):
    p, ctx, active = await _resolve(request, pid)
    return _json({"id": p.id, "left": await history.left_list(request.app.state.store, p.id, engine.chip_key(active))})


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
    """Top gainers of a page and window, for the latest close or any close of the last 2 months. Silver on the Basic page, Gold on the Advanced one."""
    page = "basic" if request.query_params.get("page") == "basic" else "advanced"
    win = request.query_params.get("window", "day")
    if win not in history.WINDOWS:
        raise fail(422, "bad_window", "window must be day, week or month.")
    ctx = await current(request)
    if not _allowed(ctx, page):
        raise fail(403, "plan_required", "Top gainers are part of the Silver plan (Basic page) or the Gold plan (Advanced page).", plan="gold" if page == "advanced" else "silver")
    got = await history.gainers_for(request.app.state.store, page, win, _as_on(request))
    if got is None:
        raise fail(404, "no_history", "No Top gainers are stored for that day yet.")
    return _json(got)
