"""When the cache or the database is busy or down, and when a request carries values the database cannot read: clear answers, not 500s."""

import httpx
import redis.asyncio as aioredis

from test_integration import ingested, make_settings, store  # noqa: F401


class _DownPipeline:
    """As redis-py's: queued commands are plain calls; only `execute` reaches the server, and fails."""
    def __init__(self, owner):
        self.owner = owner

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def __getattr__(self, name):
        return lambda *a, **k: self

    async def execute(self):
        self.owner.failed.append("pipeline.execute")
        raise aioredis.ConnectionError("No connection available.")


class _DownRedis:
    """Stands in for a Redis whose pool is exhausted: every command fails at once. `pipeline()` is a plain call, as in redis-py, so the
    store's write-back is tried and refused the way a real one is (not skipped by a TypeError)."""
    def __init__(self):
        self.failed = []

    def pipeline(self, *a, **k):
        return _DownPipeline(self)

    def __getattr__(self, name):
        async def fail(*a, **k):
            self.failed.append(name)
            raise aioredis.ConnectionError("No connection available.")
        return fail


async def test_stock_pages_and_search_read_postgres_when_redis_fails(ingested):  # noqa: F811
    real = ingested.redis
    down = ingested.redis = _DownRedis()
    try:
        got = await ingested.get_section("RELIANCE", "consolidated", "summary")
        assert got is not None and got[0]
        assert down.failed[:2] == ["hmget", "pipeline.execute"]     # read from Postgres, then the cache write-back was tried and refused quietly
        body, packed, etag = await ingested.search_index()
        assert b"RELIANCE" in body and packed and etag
        assert await ingested.get_etag("RELIANCE", "consolidated", "summary") is None
    finally:
        ingested.redis = real


async def test_a_busy_store_answers_503_and_unreadable_values_400(store):  # noqa: F811
    from finlit.api import create_app
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        @app.get("/api/__redis")
        async def boom():
            raise aioredis.ConnectionError("No connection available.")
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get("/api/__redis")
            assert r.status_code == 503 and r.headers["retry-after"] == "5"
            r = await c.get("/api/mf", params={"q": "abc\x00def"})
            assert r.status_code in (200, 400), r.text
            r = await c.post("/api/auth/login", json={"email": "not-an-email", "password": 123456789})
            assert r.status_code == 422 and "123456789" not in r.text and "input" not in r.text
