"""FinLit's own visitor counter, without cookies (the owner's choice of 27 Nov 2026, "both, in two steps": this is step 1; step 2 adds Google
Analytics only for visitors who accept a cookie banner). docs/search-growth/PROGRESS.md, Phase 0; docs/launch-readiness/CHECKLIST.md, section 7.

POST /api/visits         the website sends one small message per page it shows: the page address, the NAME of the site the visitor came from
                         (taken from the browser's referrer, host only), a campaign tag if the link had one (utm_source), whether the screen is
                         phone- or desktop-sized, and whether this is the first page of the visit. Answered 204, always; never an error the visitor sees.
GET  /api/admin/visitors administrators: daily page views and visits, visits by source, the most-opened pages, phone/desktop, and sign-ups a day.

Nothing that identifies a person is kept: no IP address (used only in memory for the rate limit), no cookie, no identifier, no user id, no full
referrer URL. Rows are daily totals per page, source and screen size (migration 148). Administrators, known bots and other sites' pages are not
counted. No background job is added."""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from . import seo
from .auth.routes import NO_STORE, admin_ctx, ip_of, origin_allowed
from .auth.service import current

router = APIRouter(prefix="/api")
IST = ZoneInfo("Asia/Kolkata")
PER_MINUTE = 120            # per address: far above a person clicking around, low enough that one script cannot inflate the counts
MOBILE_BELOW = 768          # screen width in CSS pixels under which a view counts as a phone

# The site a visit came from, by the referrer's host (or the utm_source tag). Checked in order: the first rule whose host matches wins, so the
# more specific hosts (gemini.google.com) come before the general ones (google.*). Anything else is "other"; no referrer is "direct".
SOURCES: List[tuple] = [
    ("gemini", ("gemini.google.com", "bard.google.com")),
    ("google", ("google.",)),                       # google.com, google.co.in, news.google.com ...
    ("bing", ("bing.com",)),
    ("chatgpt", ("chatgpt.com", "chat.openai.com", "openai.com")),
    ("perplexity", ("perplexity.ai",)),
    ("claude", ("claude.ai",)),
    ("copilot", ("copilot.microsoft.com", "copilot.cloud.microsoft")),
    ("duckduckgo", ("duckduckgo.com",)),
    ("yahoo", ("yahoo.com",)),
    ("brave", ("search.brave.com",)),
    ("linkedin", ("linkedin.com", "lnkd.in")),
    ("x", ("x.com", "t.co", "twitter.com")),
    ("facebook", ("facebook.com", "fb.com", "fb.me")),
    ("instagram", ("instagram.com",)),
    ("youtube", ("youtube.com", "youtu.be")),
    ("reddit", ("reddit.com",)),
    ("whatsapp", ("whatsapp.com", "wa.me")),
    ("quora", ("quora.com",)),
    ("producthunt", ("producthunt.com",)),
    ("alternativeto", ("alternativeto.net",)),
    ("crunchbase", ("crunchbase.com",)),
]
NAMES = {n for n, _ in SOURCES} | {"direct", "internal", "other", "campaign"}
BOT = re.compile(r"bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|httpx|java/|go-http|okhttp|facebookexternalhit|embedly", re.I)
HOST = re.compile(r"^[a-z0-9.-]{1,253}$")


class VisitIn(BaseModel):
    path: str = Field(max_length=300)
    ref: str = Field(default="", max_length=253)       # the referrer's HOST only (the page sends no path or query of the page it came from)
    utm: str = Field(default="", max_length=60)        # utm_source of the address, if the link carried one
    w: int = Field(default=0, ge=0, le=20000)          # the viewport width in CSS pixels, to tell phone from desktop
    land: bool = False                                  # the first page of this visit (the page load, not a click inside the site)


def _match(host: str) -> Optional[str]:
    h = host.lower().strip().strip(".")
    if h.startswith("www."):
        h = h[4:]
    for name, hosts in SOURCES:
        for x in hosts:
            if (x.endswith(".") and (h.startswith(x) or ("." + x) in ("." + h))) or h == x or h.endswith("." + x):
                return name
    return None


def source_of(ref: str, utm: str, own_hosts: set) -> str:
    """The NAME of where a page view came from. A campaign tag wins over the referrer (ChatGPT adds utm_source=chatgpt.com to its links)."""
    tag = re.sub(r"[^a-z0-9.\-_]", "", (utm or "").lower())[:60]
    if tag:
        return _match(tag) or (tag if tag in NAMES else "campaign")
    host = (ref or "").lower().strip()
    if not host:
        return "direct"
    if not HOST.match(host):
        return "other"
    if host in own_hosts or host.removeprefix("www.") in own_hosts:
        return "internal"
    return _match(host) or "other"


def page_of(path: str) -> Optional[str]:
    """The address stored for a page view: a public page in full (/stocks/TCS), a member page by its first part only (/account, /holdings), so no
    member's own identifiers are kept. None for an address the site does not have (it is not counted)."""
    p = seo.clean((path or "").split("?", 1)[0].split("#", 1)[0])
    if len(p) > 160 or re.search(r"[^A-Za-z0-9/_.&\-]", p):
        return None
    known = seo.is_known(p)
    if known is False:
        return None
    if seo.is_private(p):
        return "/" + p.split("/", 1)[0]
    return "/" + p if p else "/"


def own_hosts(request: Request) -> set:
    st = request.app.state.settings
    hosts = {request.headers.get("host", "").lower()}
    for u in [getattr(st, "public_site_url", "")] + list(getattr(st, "cors_origins", []) or []):
        h = re.sub(r"^https?://", "", str(u or "")).split("/", 1)[0].lower()
        if h:
            hosts |= {h, h.removeprefix("www."), "www." + h.removeprefix("www.")}
    hosts |= {"finlitventures.com", "www.finlitventures.com", "app.finlitventures.com"}
    return {h for h in hosts if h}


def _ok() -> Response:
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.post("/visits", status_code=204)
async def visit(request: Request, body: VisitIn) -> Response:
    """Count one page view. Always 204: counting must never disturb the page, and an uncounted view is better than a visitor seeing an error."""
    try:
        if not origin_allowed(request) or BOT.search(request.headers.get("user-agent", "")):
            return _ok()                                   # another site's page, or a script or crawler (pages for crawlers are counted by the crawl tools)
        allowed, _ = await request.app.state.limiter.hit("visit", ip_of(request), PER_MINUTE, 60, fail_open=True)
        if not allowed:
            return _ok()
        path = page_of(body.path)
        if path is None:
            return _ok()
        if (await current(request)).role == "admin":
            return _ok()                                   # the team's own clicks would distort the numbers
        source = source_of(body.ref, body.utm, own_hosts(request))
        if not body.land and source != "internal":
            source = "internal"                            # a later page of a visit: the source belongs to its first page
        land = 1 if body.land else 0
        device = "mobile" if 0 < body.w < MOBILE_BELOW else "desktop"
        day = datetime.now(IST).date()
        async with request.app.state.store.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO site_visits (day, path, source, device, views, landings) VALUES ($1, $2, $3, $4, 1, $5) "
                "ON CONFLICT (day, path, source, device) DO UPDATE SET views = site_visits.views + 1, landings = site_visits.landings + EXCLUDED.landings",
                day, path, source, device, land)
    except Exception:   # nosec B110 - counting must never turn a page view into an error
        pass
    return _ok()


@router.get("/admin/visitors")
async def visitors(request: Request, days: int = Query(30, ge=1, le=400), ctx=Depends(admin_ctx)) -> JSONResponse:
    """Console > Visitors: the last `days` India days, today included."""
    today = datetime.now(IST).date()
    start = today - timedelta(days=days - 1)
    async with request.app.state.store.pool.acquire() as conn:
        daily = await conn.fetch("SELECT day, sum(views)::bigint AS views, sum(landings)::bigint AS visits FROM site_visits WHERE day >= $1 GROUP BY day ORDER BY day", start)
        by_source = await conn.fetch("SELECT source, sum(landings)::bigint AS visits, sum(views)::bigint AS views FROM site_visits WHERE day >= $1 AND source <> 'internal' "
                                     "GROUP BY source ORDER BY visits DESC, source", start)
        pages = await conn.fetch("SELECT path, sum(views)::bigint AS views, sum(landings)::bigint AS visits FROM site_visits WHERE day >= $1 GROUP BY path "
                                 "ORDER BY views DESC, path LIMIT 30", start)
        devices = await conn.fetch("SELECT device, sum(views)::bigint AS views, sum(landings)::bigint AS visits FROM site_visits WHERE day >= $1 GROUP BY device ORDER BY device", start)
        signups = await conn.fetch("SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, count(*)::bigint AS n FROM users "
                                   "WHERE created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND role <> 'admin' GROUP BY 1 ORDER BY 1", start)
        first = await conn.fetchval("SELECT min(day) FROM site_visits")
    joins = {r["day"]: r["n"] for r in signups}
    by_day: Dict[Any, Dict[str, Any]] = {r["day"]: {"views": r["views"], "visits": r["visits"]} for r in daily}
    rows = [{"day": d.isoformat(), "views": by_day.get(d, {}).get("views", 0), "visits": by_day.get(d, {}).get("visits", 0), "signups": joins.get(d, 0)}
            for d in (start + timedelta(days=i) for i in range(days))]
    body = {"from": start.isoformat(), "to": today.isoformat(), "days": days, "countingSince": first.isoformat() if first else None,
            "totals": {"views": sum(r["views"] for r in rows), "visits": sum(r["visits"] for r in rows), "signups": sum(r["signups"] for r in rows)},
            "daily": rows,
            "sources": [{"source": r["source"], "visits": r["visits"], "views": r["views"]} for r in by_source],
            "pages": [{"path": r["path"], "views": r["views"], "visits": r["visits"]} for r in pages],
            "devices": [{"device": r["device"], "views": r["views"], "visits": r["visits"]} for r in devices],
            "how": "Counted on FinLit's own server without cookies: one count per page opened in a browser (crawlers, scripts and administrators are not counted). "
                   "A visit is the first page opened from outside the site; its source is the site it came from. Nothing identifies a person."}
    return JSONResponse(body, headers=NO_STORE)
