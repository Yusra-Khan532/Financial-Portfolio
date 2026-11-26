"""26 Nov 2026: every technical refresh from the jobs container was answered "400 Invalid host header".

The jobs container calls this backend at http://app:8001 (deploy/jobs.sh). Production mode set a real ALLOWED_HOSTS (no longer "*"), and the
defaults did not hold "app", so TrustedHostMiddleware refused every call: 2,493 of 2,500 refreshes failed and the technical views went stale.
"app" is now always trusted, whatever ALLOWED_HOSTS says; a host nobody listed is still refused."""
import asyncio

import httpx
from starlette.applications import Starlette
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from backend import server

PRODUCTION = "finlitventures.com,www.finlitventures.com,app.finlitventures.com"


def _status(allowed, host):
    async def ok(_request):
        return PlainTextResponse("ok")
    app = Starlette(routes=[Route("/api/premium-reports/technical", ok, methods=["POST"])])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed)

    async def call():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=f"http://{host}") as c:
            return (await c.post("/api/premium-reports/technical")).status_code
    return asyncio.run(call())


def test_the_jobs_container_is_trusted_under_a_production_allowed_hosts(monkeypatch):
    monkeypatch.setenv("ALLOWED_HOSTS", PRODUCTION)
    allowed = server.configured_allowed_hosts()
    assert {"app", "localhost", "finlitventures.com"} <= set(allowed)          # host names in the allowed list (a set check, not a URL test)
    assert _status(allowed, "app:8001") == 200                 # the jobs container (http://app:8001)
    assert _status(allowed, "localhost:8001") == 200           # the research API in the app container
    assert _status(allowed, "evil.example") == 400             # a host nobody listed is still refused


def test_before_the_fix_the_jobs_container_was_refused(monkeypatch):
    monkeypatch.setenv("ALLOWED_HOSTS", PRODUCTION)
    without_app = [h for h in server.configured_allowed_hosts() if h != "app"]
    assert _status(without_app, "app:8001") == 400             # what every technical refresh got on 26 Nov
