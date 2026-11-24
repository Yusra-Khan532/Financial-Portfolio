"""Task #366: thumbs up / down on AI-written text, stored for the team: who may vote, one vote per member per answer, visitors without personal
detail, withdraw, and the administrators' totals."""

from pathlib import Path

import pytest

from finlit import ai_feedback as fb
from test_auth import ORIGIN, app, new_client, signed_in  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: F401  (fixtures)
from test_page_feedback import mfa_admin

MIGRATIONS = Path(fb.__file__).parent / "migrations"


@pytest.fixture
async def fapp(app):  # noqa: F811
    """The shared fixtures drop users but not this table: rebuild it so the foreign key is real."""
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DROP TABLE IF EXISTS ai_feedback CASCADE")
        await conn.execute((MIGRATIONS / "137_ai_feedback.sql").read_text())
    return app


def vote(**over):
    return {"surface": "ask", "ref": "RELIANCE|how is reliance performing", "rating": 1, "question": "How is Reliance performing?",
            "excerpt": "Reliance's revenue grew 7% in the latest quarter.", **over}


async def rows(app):
    async with app.state.store.pool.acquire() as conn:
        return await conn.fetch("SELECT * FROM ai_feedback ORDER BY id")


async def test_a_member_has_one_vote_per_answer_that_they_can_change_or_withdraw(fapp):
    c = await signed_in(fapp, "votes@example.com", plan="gold")
    assert (await c.post("/api/ai-feedback", json=vote())).status_code == 201
    assert (await c.post("/api/ai-feedback", json=vote(rating=-1))).status_code == 201
    [r] = await rows(fapp)
    assert r["rating"] == -1 and r["user_id"] is not None and r["plan"] == "gold" and r["question"] == "How is Reliance performing?"
    assert r["visitor"] is None
    assert (await c.post("/api/ai-feedback", json=vote(rating=0))).json()["status"] == "withdrawn"
    assert await rows(fapp) == []


async def test_a_visitor_votes_without_any_personal_detail_and_only_once_per_answer(fapp):
    async with new_client(fapp) as anon:
        for r in (1, -1):
            assert (await anon.post("/api/ai-feedback", json=vote(surface="company_brief", ref="TCS|2026-11-20", rating=r), headers=ORIGIN)).status_code == 201
    [r] = await rows(fapp)
    assert r["user_id"] is None and r["rating"] == -1 and len(r["visitor"]) == 24 and "127.0.0.1" not in r["visitor"]
    assert r["question"] is None   # only an Ask FinLit AI vote keeps its question


async def test_our_pages_only_a_member_proves_it_and_bad_votes_are_refused(fapp):
    async with new_client(fapp) as anon:
        assert (await anon.post("/api/ai-feedback", json=vote())).status_code == 403                                    # no Origin
        assert (await anon.post("/api/ai-feedback", json=vote(rating=5), headers=ORIGIN)).status_code == 422
        assert (await anon.post("/api/ai-feedback", json=vote(surface="other"), headers=ORIGIN)).status_code == 422
    c = await signed_in(fapp, "csrf2@example.com")
    c.headers.pop("X-CSRF-Token")
    assert (await c.post("/api/ai-feedback", json=vote())).json()["detail"]["status"] == "bad_csrf"
    assert await rows(fapp) == []


async def test_the_team_reads_totals_by_feature_and_thumbs_down_first(fapp):
    c = await signed_in(fapp, "m1@example.com")
    await c.post("/api/ai-feedback", json=vote())
    await c.post("/api/ai-feedback", json=vote(surface="prism_summary", ref="INFY|2026-11-24", rating=-1, question=None))
    admin = await mfa_admin(fapp, "lead@example.com")
    j = (await admin.get("/api/admin/ai-feedback")).json()
    assert {t["surface"]: (t["up"], t["down"]) for t in j["totals"]} == {"ask": (1, 0), "prism_summary": (0, 1)}
    assert j["items"][0]["rating"] == -1
    assert (await c.get("/api/admin/ai-feedback")).status_code in (401, 403)
