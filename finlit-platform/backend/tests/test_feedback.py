import pytest

from test_auth import app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401

pytestmark = pytest.mark.integration

FULL = {"rating": 4, "nps": 9, "navigation": 4, "data_quality": 5, "tools": 4, "used": ["Stock Screener", "Glossary"], "most_valuable": "Glossary", "improve": ["Faster loading and performance"],
        "wanted": ["Mobile application"], "likes": "Plain words", "early_access": True}


async def test_feedback_is_stored_without_an_email_unless_the_person_asks_to_be_contacted(app):  # noqa: F811
    async with new_client(app) as c:
        a = await c.post("/api/feedback", json={**FULL, "email": "kept.out@example.com"})
        assert a.status_code == 202 and a.json() == {"status": "ok"}
        b = await c.post("/api/feedback", json={**FULL, "contact_ok": True, "email": " Reply.Me@Example.com "})
        assert b.status_code == 202
        assert (await c.post("/api/feedback", json={**FULL, "rating": 9})).status_code == 422          # out of range
        assert (await c.post("/api/feedback", json={**FULL, "contact_ok": True, "email": "nope"})).status_code == 422
        assert (await c.post("/api/feedback", json={**FULL, "website": "http://spam"})).status_code == 202   # a bot sees success, nothing stored
        assert (await c.get("/api/admin/feedback")).status_code == 401
    async with app.state.store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT email, rating, nps FROM feedback ORDER BY id")
    assert [(r["email"], r["rating"], r["nps"]) for r in rows] == [(None, 4, 9), ("reply.me@example.com", 4, 9)]
    member = await signed_in(app, "m@example.com", plan="gold")
    assert (await member.get("/api/admin/feedback")).status_code == 403
