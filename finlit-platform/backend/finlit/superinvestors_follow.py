"""Task #289 (the superinvestors developer file of 21 Nov 2026): following tracked investors, alerts on their filings, and "Your stocks they hold".

GET    /api/me/superinvestors/follows         the investors a member follows, their alert choices (all four on until changed) and the latest five alerts
PUT    /api/me/superinvestors/follows/{key}   follow a tracked investor
DELETE /api/me/superinvestors/follows/{key}   stop following
PUT    /api/me/superinvestors/alert-prefs     {new, added, reduced, exited}
GET    /api/me/superinvestors/overlap         the member's equity holdings and watchlist stocks against the tracked investors (ISIN first, then symbol)
All Gold (the feature's plan), signed in; changes need the site's CSRF token.

Alerts (`follow_alerts`, run with the other built-in alerts after the daily alert check): each tracked investor someone follows is compared, company by
company, with what the check saw last time (table si_seen). A company with a new filing quarter gives a move: new stake, stake up or cut (0.01 points or
more), or no longer named (named before, not in the new filing). The first run only records what it sees, so nobody gets a flood of old moves; a stake
above 100% or below 0 in the source never alerts. One alert per member, investor, company and filing quarter (auto_alert_sent), through the site's alerts
(the bell, the browser and email as the member's alert settings allow). The site has no weekly cap on built-in alerts; a per-run cap keeps one night's
mail short. Wording: "Ashish Kacholia: new stake in ESDS Software Solution, 2.05% (filing Sep 2026)". Describes; never advises.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import orjson
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from . import superinvestors as si
from . import superinvestors_tracked as tracked
from .auth.routes import Ctx, fail, secure_ctx

log = logging.getLogger("finlit.superinvestors.follow")
router = APIRouter(prefix="/api/me/superinvestors")

MOVES = ("new", "added", "reduced", "exited")
DEFAULT_PREFS = {m: True for m in MOVES}
PER_RUN = 20            # alerts per member in one run
KIND = "si:"            # auto_alert_sent.kind = "si:<investor key>"
FEED = 5
LINK = "/superinvestors/"


# ------------------------------------------------------------------------------------------------------------------ pure parts
def combined(inv: dict, stakes: Dict[str, Dict[str, dict]]) -> Dict[str, dict]:
    """{symbol: {now, asOf, bad}}: the investor's combined stake per company in the latest filing, over all their filed names."""
    out: Dict[str, dict] = {}
    for fn in inv["filed_names"]:
        for sym, s in (stakes.get(fn["key"]) or {}).items():
            now = s.get("now")
            r = out.setdefault(sym, {"now": 0.0, "asOf": s.get("asOf"), "bad": False})
            if now is not None and (now > 100 or now < 0):
                r["bad"] = True
            elif now:
                r["now"] += now
    return {s: {**r, "now": round(r["now"], 4)} for s, r in out.items() if r["now"] > 0 or r["bad"]}


def events(now: Dict[str, dict], seen: Dict[str, dict], filing: Dict[str, Optional[str]]) -> Tuple[List[dict], Dict[str, dict], List[str]]:
    """Compare the investor's stakes now with what was seen. Returns (moves to alert, rows to store, symbols to forget).
    now: {symbol: {now, asOf, bad}}; seen: {symbol: {stake, asOf}}; filing: {symbol: the company's latest filing quarter}."""
    first = not seen
    out: List[dict] = []
    keep: Dict[str, dict] = {}
    for sym, n in now.items():
        keep[sym] = {"stake": n["now"], "asOf": n["asOf"]}
        if first or n["bad"]:
            continue
        s = seen.get(sym)
        if s is None:
            if n["now"] >= tracked.MIN_STAKE:
                out.append({"symbol": sym, "move": "new", "then": None, "now": n["now"], "asOf": n["asOf"]})
            continue
        if s["asOf"] == n["asOf"]:
            continue                                   # the same filing: nothing new
        move = tracked.status_of(n["now"], float(s["stake"] or 0))
        if move in ("added", "reduced"):
            out.append({"symbol": sym, "move": move, "then": float(s["stake"] or 0), "now": n["now"], "asOf": n["asOf"]})
    forget: List[str] = []
    for sym, s in seen.items():
        if sym in now:
            continue
        latest = filing.get(sym)
        if latest is not None and latest != s["asOf"]:     # the company filed again and does not name the investor
            forget.append(sym)
            if not first and float(s["stake"] or 0) > 0:
                out.append({"symbol": sym, "move": "exited", "then": float(s["stake"] or 0), "now": None, "asOf": latest})
        else:
            keep[sym] = {"stake": s["stake"], "asOf": s["asOf"]}     # no new filing yet: still as seen
    return out, keep, forget


def message(investor: str, company: str, e: dict) -> Tuple[str, str]:
    """The alert's title and body, in the developer file's words."""
    q = f"filing {e['asOf']}" if e.get("asOf") else "latest filing"
    if e["move"] == "new":
        title = f"{investor}: new stake in {company}, {e['now']:.2f}% ({q})"
    elif e["move"] == "added":
        title = f"{investor}: stake up in {company}, {e['then']:.2f}% → {e['now']:.2f}% ({q})"
    elif e["move"] == "reduced":
        title = f"{investor}: stake cut in {company}, {e['then']:.2f}% → {e['now']:.2f}% ({q})"
    else:
        title = f"{investor}: no longer named in {company} ({q})"
    body = ("From the company's shareholding filing, which names holders of 1% or more. "
            + ("“No longer named” means the stake is now under 1% or gone; the filing does not say which. " if e["move"] == "exited" else "")
            + "Information only, not investment advice.")
    return title, body


def overlap(mine: List[Tuple[str, Optional[str], str]], t: dict, names: Dict[str, str]) -> List[dict]:
    """mine: [(symbol, isin, "Portfolio" | "Watchlist")]. t: the tracked build. One row per stock, portfolio first, each with the tracked investors
    named in it today (or who left it this year) and their latest move."""
    by_sym: Dict[str, List[dict]] = {}
    isin_sym: Dict[str, str] = {}
    for k, inv in (t.get("investors") or {}).items():
        for h in inv["holdings"]:
            by_sym.setdefault(h["symbol"], []).append({"key": k, "name": inv["name"], "move": h["move"], "moveText": h["moveText"], "sourceError": h["sourceError"]})
            if h.get("isin"):
                isin_sym[h["isin"]] = h["symbol"]
    rows: Dict[str, dict] = {}
    for sym, isin, where in mine:
        s = isin_sym.get(isin or "", sym)
        r = rows.setdefault(s, {"symbol": s, "name": names.get(s) or names.get(sym) or s, "in": [], "investors": by_sym.get(s, [])})
        if where not in r["in"]:
            r["in"].append(where)
    return sorted(rows.values(), key=lambda r: ("Portfolio" not in r["in"], not r["investors"], r["name"]))


def member_stocks(portfolio: Any, watchlist: Any) -> List[Tuple[str, Optional[str], str]]:
    """The member's equity holdings (sold rows left out) and every watchlist stock, as stored in user_state."""
    load = lambda x: orjson.loads(x) if isinstance(x, (str, bytes)) else (x or {})   # noqa: E731
    p, w = load(portfolio), load(watchlist)
    out: List[Tuple[str, Optional[str], str]] = []
    for h in (p.get("holdings") or []) if isinstance(p, dict) else []:
        if isinstance(h, dict) and h.get("symbol") and h.get("side") != "sell":
            out.append((str(h["symbol"]).upper(), h.get("isin"), "Portfolio"))
    for lst in (w.get("lists") or []) if isinstance(w, dict) else []:
        for s in (lst.get("symbols") or []) if isinstance(lst, dict) else []:
            out.append((str(s).upper(), None, "Watchlist"))
    return out


# ------------------------------------------------------------------------------------------------------------------ API
def _gold(ctx: Ctx) -> None:
    if not si._allowed(ctx):
        raise fail(403, "plan_required", si.PLAN_DETAIL, plan=si.PLAN)


class PrefsIn(BaseModel):
    new: bool = True
    added: bool = True
    reduced: bool = True
    exited: bool = True


async def _state(conn, uid: str) -> dict:
    follows = [r["investor_key"] for r in await conn.fetch("SELECT investor_key FROM si_follows WHERE user_id = $1 ORDER BY created_at", uid)]
    p = await conn.fetchrow("SELECT new, added, reduced, exited FROM si_alert_prefs WHERE user_id = $1", uid)
    feed = await conn.fetch("SELECT title, body, link, created_at FROM notifications WHERE user_id = $1 AND link LIKE $2 ORDER BY created_at DESC LIMIT $3", uid, LINK + "%", FEED)
    return {"follows": follows, "prefs": dict(p) if p else dict(DEFAULT_PREFS),
            "feed": [{"title": r["title"], "body": r["body"], "link": r["link"], "at": r["created_at"].isoformat()} for r in feed],
            "note": "Alerts arrive in the bell, the browser and email as your alert settings allow, once per investor, company and filing quarter."}


@router.get("/follows")
async def get_follows(request: Request, ctx: Ctx = Depends(secure_ctx)):
    _gold(ctx)
    async with request.app.state.store.pool.acquire() as conn:
        return await _state(conn, ctx.user_id)


@router.put("/follows/{key}")
async def follow(request: Request, key: str, ctx: Ctx = Depends(secure_ctx)):
    _gold(ctx)
    k = key.lower()[:200]
    if k not in {i["key"] for i in tracked.load_config()}:
        raise fail(404, "not_found", "Only tracked investors can be followed.")
    async with request.app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO si_follows (user_id, investor_key) VALUES ($1, $2) ON CONFLICT DO NOTHING", ctx.user_id, k)
        return await _state(conn, ctx.user_id)


@router.delete("/follows/{key}")
async def unfollow(request: Request, key: str, ctx: Ctx = Depends(secure_ctx)):
    _gold(ctx)
    async with request.app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM si_follows WHERE user_id = $1 AND investor_key = $2", ctx.user_id, key.lower()[:200])
        return await _state(conn, ctx.user_id)


@router.put("/alert-prefs")
async def set_prefs(request: Request, body: PrefsIn, ctx: Ctx = Depends(secure_ctx)):
    _gold(ctx)
    async with request.app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO si_alert_prefs (user_id, new, added, reduced, exited) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET "
                           "new = $2, added = $3, reduced = $4, exited = $5, updated_at = now()", ctx.user_id, body.new, body.added, body.reduced, body.exited)
        return await _state(conn, ctx.user_id)


@router.get("/overlap")
async def my_overlap(request: Request, ctx: Ctx = Depends(secure_ctx)):
    _gold(ctx)
    store = request.app.state.store
    async with store.pool.acquire() as conn:
        st = await conn.fetchrow("SELECT watchlist, portfolio FROM user_state WHERE user_id = $1", ctx.user_id)
    mine = member_stocks(st["portfolio"] if st else None, st["watchlist"] if st else None)
    if not mine:
        return {"rows": [], "empty": True, "emptyWhy": "Add stocks to your portfolio or a watchlist to see who else holds them."}
    d = await si.data(request.app)
    t = d.get("tracked") or {}
    syms = sorted({s for s, _, _ in mine})
    from . import prism_screen
    async with store.pool.acquire() as conn:
        sc = {r["symbol"]: dict(r) for r in await conn.fetch(
            "SELECT DISTINCT ON (symbol) symbol, name, return_1y FROM scores WHERE symbol = ANY($1::text[]) ORDER BY symbol, (statement = 'consolidated') DESC", syms)}
        cos = {r["symbol"]: r["name"] for r in await conn.fetch("SELECT symbol, name FROM companies WHERE symbol = ANY($1::text[])", syms)}
    prism = prism_screen.cards(await store.prism_cards(syms))
    names = {**{s: r["name"] for s, r in sc.items() if r.get("name")}, **cos}
    rows = overlap(mine, t, names)
    for r in rows:
        p = prism.get(r["symbol"]) or {}
        lab = p.get("prism_label") or ("Not rated" if r["symbol"] in sc else None)
        r["prism"] = {"label": lab, "score": p.get("prism_final") if lab not in (None, "Not rated") else None}
        r["return1y"] = si._num((sc.get(r["symbol"]) or {}).get("return_1y"))
    return {"rows": rows, "empty": False, "emptyWhy": None}


# ------------------------------------------------------------------------------------------------------------------ the alert check
async def follow_alerts(pool, mailer, site_url: str) -> int:
    """Compare each followed tracked investor's stakes with the last check and alert their followers on each new filing's moves."""
    from .alertengine import deliver
    sent = 0
    async with pool.acquire() as conn:
        keys = [r["investor_key"] for r in await conn.fetch("SELECT DISTINCT investor_key FROM si_follows")]
        cfg = {i["key"]: i for i in tracked.load_config()}
        keys = [k for k in keys if k in cfg]
        if not keys:
            return 0
        rows = await conn.fetch("SELECT DISTINCT ON (symbol) symbol, as_of, extra->'holders' AS holders FROM ownership_insights "
                                "WHERE premium_state = 'ok' AND extra ? 'holders' ORDER BY symbol, (statement = 'consolidated') DESC")
        filings = [{"symbol": r["symbol"], "as_of": r["as_of"], "holders": orjson.loads(r["holders"]) if isinstance(r["holders"], (str, bytes)) else r["holders"]} for r in rows]
        latest = {str(r["symbol"]).upper(): r["as_of"] for r in rows}
        stakes = si.stakes_by_name(filings)
        names = {r["symbol"]: r["name"] for r in await conn.fetch("SELECT symbol, name FROM companies")}
        per_user: Dict[Any, int] = {}
        for k in keys:
            inv = cfg[k]
            seen = {r["symbol"]: {"stake": r["stake"], "asOf": r["as_of"]} for r in await conn.fetch("SELECT symbol, stake, as_of FROM si_seen WHERE investor_key = $1", k)}
            evs, keep, forget = events(combined(inv, stakes), seen, latest)
            for sym, s in keep.items():
                await conn.execute("INSERT INTO si_seen (investor_key, symbol, as_of, stake) VALUES ($1, $2, $3, $4) ON CONFLICT (investor_key, symbol) DO UPDATE SET "
                                   "as_of = $3, stake = $4, seen_at = now()", k, sym, s["asOf"], s["stake"])
            if forget:
                await conn.execute("DELETE FROM si_seen WHERE investor_key = $1 AND symbol = ANY($2::text[])", k, forget)
            if not evs:
                continue
            users = await conn.fetch(
                "SELECT u.id, u.email, s.prefs, coalesce(p.new, true) AS new, coalesce(p.added, true) AS added, coalesce(p.reduced, true) AS reduced, "
                "coalesce(p.exited, true) AS exited FROM si_follows f JOIN users u ON u.id = f.user_id LEFT JOIN user_state s ON s.user_id = u.id "
                "LEFT JOIN si_alert_prefs p ON p.user_id = u.id WHERE f.investor_key = $1 AND u.status = 'active' AND u.email_verified_at IS NOT NULL "
                "AND u.plan = 'gold' AND (u.plan_until IS NULL OR u.plan_until > now())", k)
            for u in users:
                for e in evs:
                    if not u[e["move"]] or per_user.get(u["id"], 0) >= PER_RUN:
                        continue
                    try:
                        new = await conn.fetchval("INSERT INTO auto_alert_sent (user_id, symbol, kind, period) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1",
                                                  u["id"], e["symbol"], KIND + k, e["asOf"] or "")
                        if not new:
                            continue
                        title, body = message(inv["name"], names.get(e["symbol"]) or e["symbol"], e)
                        await deliver(conn, mailer, site_url, {"id": u["id"], "email": u["email"], "prefs": u["prefs"] or {}},
                                      {"id": None, "symbol": e["symbol"], "channels": ["app", "browser", "email"]}, title, body, LINK + k)
                        per_user[u["id"]] = per_user.get(u["id"], 0) + 1
                        sent += 1
                    except Exception:   # one member's trouble must not stop the rest
                        log.exception("superinvestor alert failed for %s %s", k, e["symbol"])
    log.info("superinvestor alerts: %d sent", sent)
    return sent
