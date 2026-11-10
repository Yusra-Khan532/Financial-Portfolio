"""Serves the built website (frontend/dist) from the same origin as the API.

One host for pages and /api means no cross-site cookies and no CORS, which is what makes a single free container work.
The API keeps its own strict JSON headers; website files get the site's policy instead (same rules as frontend/public/_headers).
Unknown paths fall back to the app shell so client-side routes (/stocks/TCS) work on refresh; /api/* never does.
"""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response

from . import seo

log = logging.getLogger("finlit.web")

SITE_HEADERS = {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Content-Security-Policy": ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; "
                                "img-src 'self' data: https:; connect-src 'self'; frame-src 'self'; worker-src 'self'; manifest-src 'self'; "
                                "object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"),
}


def _cache_control(rel: str) -> str:
    if rel.startswith("assets/"):
        return "public, max-age=31536000, immutable"  # hashed file names
    if rel in ("index.html", "sw.js", "theme-init.js", "version.json"):
        return "no-cache"
    return "public, max-age=3600"


def mount_frontend(app: FastAPI, dist: Path) -> bool:
    """Add the sitemap and the catch-all website route. Call last, after every /api route exists. Returns False when there is no build."""
    root = dist.resolve()
    index = root / "index.html"
    if not index.is_file():
        return False
    shell: dict = {"mtime": 0.0, "text": ""}

    def shell_text() -> str:
        m = index.stat().st_mtime
        if shell["mtime"] != m:
            shell["text"], shell["mtime"] = index.read_text(encoding="utf-8"), m
        return shell["text"]

    def base_of(request: Request) -> str:
        settings = getattr(request.app.state, "settings", None)
        return getattr(settings, "public_site_url", "") or ""

    async def company(request: Request, symbol: str) -> Optional[tuple]:
        sym = symbol.upper()
        if not seo.SYMBOL.match(sym):
            return None
        hit, value = seo.recall(sym)
        if hit:
            return value
        async with request.app.state.store.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT name, sector FROM companies WHERE symbol = $1", sym)
        value = (row["name"], row["sector"]) if row else None
        seo.remember(sym, value)
        return value

    async def directory(request: Request) -> dict:
        """Every company grouped by the first letter of its name; kept for an hour (one query serves the index, every letter page and the sitemap)."""
        hit, value = seo.recall("dir:all")
        if hit and value:
            return value  # type: ignore[return-value]
        async with request.app.state.store.pool.acquire() as conn:
            rows = await conn.fetch("SELECT symbol, name, sector FROM companies ORDER BY lower(name)")
        groups = seo.bucket([(r["symbol"], r["name"], r["sector"]) for r in rows])
        seo.remember("dir:all", groups, 3600.0)  # type: ignore[arg-type]
        return groups

    async def rendered(request: Request, path: str) -> Optional[seo.Rendered]:
        """This address's head and content; the 404 version for an address that does not exist; None when a lookup failed (the plain shell is served)."""
        base, p = base_of(request), seo.clean(path)
        known = seo.is_known(p)
        if known is False:
            return seo.not_found(base)
        try:
            if p == "companies":
                return seo.render_directory(base, None, await directory(request))
            if known is None:
                if p.startswith("companies/"):
                    return seo.render_directory(base, p.split("/", 1)[1], await directory(request))
                if p.startswith("stocks/"):
                    c = await company(request, p.split("/", 1)[1])
                    return seo.render_company(base, p.split("/", 1)[1], c[0], c[1]) if c else seo.not_found(base)
                return seo.render_term(base, p.split("/", 1)[1]) or seo.not_found(base)
        except Exception:
            log.warning("seo lookup failed for %s", p, exc_info=True)
            return None
        if p in seo.PUBLIC:
            return seo.render_static(base, p)
        if seo.is_private(p):
            return seo.render_private(base, p)
        return seo.render_generic(base, p)

    @app.api_route("/sitemap.xml", methods=["GET", "HEAD"], include_in_schema=False)
    async def sitemap(request: Request):
        redis = request.app.state.store.redis
        try:
            cached = await redis.get("seo:sitemap:v1")
        except Exception:
            cached = None
        if cached:
            body = cached.decode() if isinstance(cached, bytes) else cached
        else:
            async with request.app.state.store.pool.acquire() as conn:
                rows = await conn.fetch("SELECT c.symbol, c.updated_at FROM companies c WHERE EXISTS (SELECT 1 FROM scores s WHERE s.symbol = c.symbol AND s.model = 'v1') ORDER BY c.symbol")
            groups = await directory(request)
            body = seo.sitemap_xml(base_of(request), [(r["symbol"], r["updated_at"].date() if r["updated_at"] else None) for r in rows], datetime.now(timezone.utc).date(),
                                   tuple(k for k in seo.DIR_LETTERS if groups.get(k)))
            try:
                await redis.set("seo:sitemap:v1", body, ex=3600)
            except Exception:   # nosec B110 - Redis down: built each time
                pass
        return Response(body, media_type="application/xml", headers={"Cache-Control": "public, max-age=3600", **SITE_HEADERS})

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def website(path: str, request: Request):
        if path == "api" or path.startswith("api/"):
            return JSONResponse({"status": "not_found"}, status_code=404, headers={"Cache-Control": "no-store"})
        target = (root / path).resolve()
        if path and target.is_file() and root in target.parents:
            rel = target.relative_to(root).as_posix()
        elif path.startswith("assets/") or "." in path.rsplit("/", 1)[-1]:
            return Response("not found", status_code=404, media_type="text/plain", headers={"Cache-Control": "no-store"})
        else:
            r = await rendered(request, path)
            headers = {"Cache-Control": _cache_control("index.html"), **SITE_HEADERS}
            if r is None:
                return FileResponse(index, headers=headers)
            if r.robots == "noindex":
                headers["X-Robots-Tag"] = "noindex, nofollow"
            return Response(seo.inject(shell_text(), r), status_code=r.status, media_type="text/html", headers=headers)
        response: Response = FileResponse(target)
        response.headers["Cache-Control"] = _cache_control(rel)
        for key, value in SITE_HEADERS.items():
            response.headers[key] = value
        return response

    return True
