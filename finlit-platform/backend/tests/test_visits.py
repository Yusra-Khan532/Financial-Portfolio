"""FinLit's own visitor counter (finlit/visits.py, migration 148): cookie-free, nothing that identifies a person, crawlers, scripts, other sites
and administrators not counted, and the Console > Visitors report for administrators only."""
import datetime as dt

import httpx
import pytest
from fastapi import FastAPI

from finlit import visits
from finlit.auth.routes import admin_ctx
from finlit.auth.service import Ctx

OWN = {"finlitventures.com", "www.finlitventures.com"}
BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"


def test_the_source_is_the_name_of_the_site_a_visit_came_from():
    cases = {("www.google.co.in", ""): "google", ("news.google.com", ""): "google", ("gemini.google.com", ""): "gemini", ("www.bing.com", ""): "bing",
             ("chatgpt.com", ""): "chatgpt", ("", "chatgpt.com"): "chatgpt", ("www.perplexity.ai", ""): "perplexity", ("claude.ai", ""): "claude",
             ("l.facebook.com", ""): "facebook", ("t.co", ""): "x", ("www.linkedin.com", ""): "linkedin", ("www.reddit.com", ""): "reddit",
             ("finlitventures.com", ""): "internal", ("www.finlitventures.com", ""): "internal", ("", ""): "direct", ("some.blog.example", ""): "other",
             ("", "newsletter-dec"): "campaign", ("", "linkedin"): "linkedin", ("bad host!", ""): "other", ("notgoogle.com", ""): "other"}
    for (ref, utm), want in cases.items():
        assert visits.source_of(ref, utm, OWN) == want, (ref, utm)


def test_only_real_site_addresses_are_kept_and_member_pages_only_by_their_first_part():
    assert visits.page_of("/") == "/" and visits.page_of("/stocks/TCS?utm_source=x#top") == "/stocks/TCS" and visits.page_of("/glossary/dividend-yield") == "/glossary/dividend-yield"
    assert visits.page_of("/account/profile") == "/account" and visits.page_of("/holdings") == "/holdings"      # a member page: no identifiers of the member's own
    for bad in ("/no-such-page", "/stocks/a/b", "/<script>", "/" + "x" * 200, "/wp-admin"):
        assert visits.page_of(bad) is None, bad


class Conn:
    def __init__(self, store):
        self.store = store

    async def execute(self, q, *a):
        self.store.append((q, a))

    async def fetch(self, q, *a):
        d = dt.date.today()
        if "GROUP BY day" in q:
            return [{"day": a[0], "views": 12, "visits": 5}]
        if "GROUP BY source" in q:
            return [{"source": "google", "visits": 3, "views": 7}, {"source": "direct", "visits": 2, "views": 3}]
        if "GROUP BY path" in q:
            return [{"path": "/stocks/TCS", "views": 6, "visits": 2}]
        if "GROUP BY device" in q:
            return [{"device": "desktop", "views": 8, "visits": 3}, {"device": "mobile", "views": 4, "visits": 2}]
        if "FROM users" in q:
            return [{"day": a[0], "n": 2}]
        return []

    async def fetchval(self, q, *a):
        return dt.date(2026, 11, 27)


class Acq:
    def __init__(self, store):
        self.store = store

    async def __aenter__(self):
        return Conn(self.store)

    async def __aexit__(self, *a):
        return False


class Pool:
    def __init__(self):
        self.writes = []

    def acquire(self):
        return Acq(self.writes)


class Limiter:
    def __init__(self, allow=True):
        self.allow, self.calls = allow, []

    async def hit(self, name, key, count, seconds, fail_open=True):
        self.calls.append((name, key, count, seconds))
        return self.allow, 0


class S:
    public_site_url = "https://finlitventures.com"
    cors_origins = ["https://finlitventures.com"]
    client_ip_header = ""
    cookie_secure = True


@pytest.fixture
def app():
    a = FastAPI()
    a.include_router(visits.router)
    a.state.settings, a.state.limiter = S(), Limiter()
    a.state.store = type("St", (), {"pool": Pool()})()
    return a


def client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://finlitventures.com")


H = {"origin": "https://finlitventures.com", "user-agent": BROWSER}


async def test_a_page_view_is_one_daily_count_with_nothing_personal(app):
    async with client(app) as c:
        r = await c.post("/api/visits", json={"path": "/stocks/TCS", "ref": "www.google.co.in", "w": 390, "land": True}, headers=H)
    assert r.status_code == 204 and r.headers["cache-control"] == "no-store"
    (q, args), = app.state.store.pool.writes
    assert "INSERT INTO site_visits" in q and "ON CONFLICT" in q
    day, path, source, device, land = args
    assert (path, source, device, land) == ("/stocks/TCS", "google", "mobile", 1) and isinstance(day, dt.date)
    assert app.state.limiter.calls[0][0] == "visit"                     # the address is used only for the rate limit, never stored
    assert "127.0.0.1" not in repr(args) and "testclient" not in repr(args)


async def test_a_later_page_of_a_visit_counts_as_internal_and_desktop(app):
    async with client(app) as c:
        await c.post("/api/visits", json={"path": "/glossary/dividend-yield", "ref": "www.google.com", "w": 1440, "land": False}, headers=H)
    (_, (_, path, source, device, land)), = app.state.store.pool.writes
    assert (path, source, device, land) == ("/glossary/dividend-yield", "internal", "desktop", 0)


async def test_crawlers_other_sites_unknown_pages_and_floods_are_not_counted(app):
    async with client(app) as c:
        assert (await c.post("/api/visits", json={"path": "/stocks/TCS", "land": True}, headers={**H, "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"})).status_code == 204
        assert (await c.post("/api/visits", json={"path": "/stocks/TCS", "land": True}, headers={**H, "origin": "https://evil.example"})).status_code == 204
        assert (await c.post("/api/visits", json={"path": "/stocks/TCS", "land": True}, headers={"user-agent": BROWSER})).status_code == 204   # no Origin: a script
        assert (await c.post("/api/visits", json={"path": "/no-such-page", "land": True}, headers=H)).status_code == 204
        app.state.limiter.allow = False
        assert (await c.post("/api/visits", json={"path": "/stocks/TCS", "land": True}, headers=H)).status_code == 204
    assert app.state.store.pool.writes == []


async def test_administrators_are_not_counted_and_a_database_failure_never_shows(app, monkeypatch):
    async def admin(request):
        return Ctx(user_id="u1", role="admin")
    monkeypatch.setattr(visits, "current", admin)
    async with client(app) as c:
        assert (await c.post("/api/visits", json={"path": "/", "land": True}, headers=H)).status_code == 204
    assert app.state.store.pool.writes == []
    monkeypatch.undo()

    class Broken:
        def acquire(self):
            raise RuntimeError("database down")
    app.state.store.pool = Broken()
    async with client(app) as c:
        assert (await c.post("/api/visits", json={"path": "/", "land": True}, headers=H)).status_code == 204


async def test_the_report_is_for_administrators_only_and_fills_every_day(app):
    async with client(app) as c:
        assert (await c.get("/api/admin/visitors")).status_code in (401, 403)
        app.dependency_overrides[admin_ctx] = lambda: Ctx(user_id="u1", role="admin", mfa_ok=True)
        r = await c.get("/api/admin/visitors?days=7")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    b = r.json()
    assert b["days"] == 7 and len(b["daily"]) == 7 and b["daily"][0]["views"] == 12 and b["daily"][0]["signups"] == 2 and b["daily"][-1]["views"] == 0
    assert b["totals"] == {"views": 12, "visits": 5, "signups": 2} and b["sources"][0] == {"source": "google", "visits": 3, "views": 7}
    assert b["pages"][0]["path"] == "/stocks/TCS" and {d["device"] for d in b["devices"]} == {"desktop", "mobile"} and b["countingSince"] == "2026-11-27"
    assert "Nothing identifies a person" in b["how"]
