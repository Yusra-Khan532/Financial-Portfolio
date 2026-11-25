"""FinLit AI's answer style v2 (the founder, 25 Nov 2026: "work on the structure, answer structure ... at the end we need perfect things"; the model
stays Haiku): a blueprint per kind of question in the note (ask/blueprints.py), small slips mended without a model (ask/shape.py), behind the console
switch "ask_answer_v2" (ask/variant.py), and the Answer check (ask/check.py) that scores both styles on the same questions before the switch is turned.

What must hold: the switch is off by default and members keep today's answers; with it on (or an administrator asking v2 on purpose) the note carries
the blueprint and the answer is tidied; a member cannot pick a style or a test question; a test question uses no allowance and is never cached; the
check runs every question through the real endpoint, scores it, keeps it, and can be stopped."""
import asyncio
import re
import time

import pytest

from finlit.auth import crypto
from finlit.ask import api as ask_api, blueprints, check, shape, variant
from test_ask import FakeClient, ask, enable
from test_auth import ORIGIN, app, login, new_client, signed_in, signup  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401

pg = pytest.mark.integration


# ------------------------------------------------------------------------------------------------------------------ blueprints (no database)

@pytest.mark.parametrize("q,kinds,bank,want", [
    ("Hello", [], False, "greeting"),
    ("How is Reliance Industries doing?", ["company"], False, "company"),
    ("How is SBI doing?", ["company"], True, "bank"),
    ("How is HDFC Bank's asset quality? any concerns", ["company"], True, "bank_risk"),
    ("Red flags in Adani Enterprises", ["company"], False, "risks"),
    ("How were Infosys's latest results?", ["company"], False, "results"),
    ("ICICI Bank latest quarter results", ["company"], True, "bank_results"),
    ("Is Avenue Supermarts expensive?", ["company"], False, "valuation"),
    ("What is TCS's P/E?", ["company"], False, "lookup"),
    ("Compare TCS and Infosys", ["company"], False, "compare"),
    ("Why did HDFC Bank fall today?", ["company"], True, "move"),
    ("How is Parag Parikh Flexi Cap Fund doing?", ["funds"], False, "fund"),
    ("How is the banking sector doing?", ["sectors"], False, "sector"),
    ("How is India's economy doing?", ["economy"], False, "economy"),
    ("What is P/E ratio?", ["concept"], False, "concept"),
    ("How do I add a stock to my watchlist?", [], False, "howto"),
    ("What's new in my holdings?", [], False, "mine"),
    ("What is the share price of Reliance?", ["company"], False, "lookup"),
    ("What is TCS's valuation compared to its history?", ["company"], False, "valuation"),
    ("Analyse TCS's P/E and margins", ["company"], False, "valuation"),
    ("How do I find companies with low debt?", [], False, "howto"),
    ("Write me a poem", [], False, None),
])
def test_each_kind_of_question_gets_its_own_shape(q, kinds, bank, want):
    assert blueprints.kind_of(q, kinds, bank=bank) == want


def test_a_blueprint_names_a_short_lead_and_its_sections_in_order_and_never_invites_a_guess():
    b = blueprints.blueprint("bank")
    assert b.startswith("Answer shape:") and "Lead line (at most 25 words)" in b
    assert b.index("1. Business growth") < b.index("2. Asset quality") < b.index("3. Margins and costs") < b.index("4. Capital")
    assert "GNPA" in b and "never filled with a guess" in b and "[source, date]" in b
    assert "side by side" in blueprints.blueprint("compare") and "Every point names both" in blueprints.blueprint("compare")
    assert "one sentence" in blueprints.blueprint("lookup") and "No sections" in blueprints.blueprint("lookup")
    assert blueprints.blueprint(None) == ""
    for k in blueprints.kinds_list():                    # every shape is written in the site's voice: describe, never advise
        assert not re.search(r"\b(buy|sell|recommend\w*|target price|you should)\b", blueprints.blueprint(k), re.I), k


# ------------------------------------------------------------------------------------------------------------------ the shape (no database)

def test_tidy_mends_headings_bullets_filler_and_extra_sources_and_changes_no_fact():
    raw = ("Sure, here is what FinLit's data shows:\n\nHDFC Bank's asset quality improved this quarter [FinLit company page, 20 Nov 2026].\n\n\n"
           "**1. Asset quality**\n• GNPA 1.24% in Q2 FY2027, from 1.33% [FinLit company page, Q2 FY2027]\n* NNPA 0.33% [FinLit company page, Q2 FY2027]\n"
           "## 2. Margins\n– NIM 3.4% [FinLit company page, Q2 FY2027]\nSources: FinLit company page\nSources: FinLit company page")
    out = shape.tidy(raw)
    assert out.splitlines()[0].startswith("HDFC Bank's asset quality improved")
    assert "1. Asset quality" in out and "2. Margins" in out and "**" not in out and "##" not in out
    assert "- GNPA 1.24% in Q2 FY2027, from 1.33%" in out and "- NNPA 0.33%" in out and "- NIM 3.4%" in out
    assert out.count("Sources:") == 1 and "\n\n\n" not in out
    for fig in ("1.24%", "1.33%", "0.33%", "3.4%"):
        assert fig in out
    assert shape.tidy("Sure.") == "Sure."                   # a filler-looking only line is kept
    assert shape.tidy(out) == out                           # tidying twice changes nothing


def test_measure_and_problems_read_the_shape():
    good = ("Reliance grew profit 9% in FY2026 [FinLit company page, FY2026].\n1. Growth\n- Revenue up 7% in FY2026 [FinLit, FY2026]\n"
            "2. Profitability\n- ROE 9.1% in FY2026, from 8.9% [FinLit, FY2026]")
    m = shape.measure(good)
    assert m["lead"] and m["sections"] == 2 and m["points"] == 2 and m["figures"] == 3 and m["citedFigures"] == 3
    assert shape.problems(m, "company") == []
    bad = shape.measure("Revenue grew 7% and margins were 12% and the company is doing many things " * 6)
    probs = shape.problems(bad, "company")
    assert "no lead line" not in probs and any("sections" in p for p in probs) and any("no source" in p for p in probs)
    assert shape.problems(shape.measure("P/E is the price divided by earnings per share."), "concept") == []


def test_the_fixed_score_punishes_advice_missing_figures_and_a_bad_shape():
    ok = check.fixed_score("TCS's P/E is 28.4 on 20 Nov 2026 [FinLit company page, 20 Nov 2026].", None, "look-tcs-pe", "lookup", "lookup", [r"p/?e"], [])
    assert ok["score"] == 100 and not ok["advice"] and ok["problems"] == []
    advice = check.fixed_score("You should buy ITC now.", None, "adv", None, None, [], [])
    assert advice["advice"] and advice["score"] <= 50
    missed = check.fixed_score("TCS is a large IT company.", None, "look-tcs-pe", "lookup", "lookup", [r"p/?e"], [])
    assert missed["score"] == 88 and "does not touch" in missed["notes"][0]
    assert check.fixed_score("", "HTTP 429", "x", None, None, [], [])["score"] == 0
    assert check.total(80, None) == 80 and check.total(100, {"direct": 5, "specific": 5, "clear": 5}) == 100
    assert check.total(100, {"direct": 1, "specific": 1, "clear": 1}) == 60


def test_the_question_set_is_wide_unique_and_points_at_real_shapes():
    ids = [q[0] for q in check.QUESTIONS]
    assert len(ids) == len(set(ids)) >= 45
    kinds = set(blueprints.kinds_list())
    assert all(q[2] is None or q[2] in kinds for q in check.QUESTIONS)
    assert len({q[2] for q in check.QUESTIONS}) >= 15                             # most shapes are asked at least once
    assert sum(q[0].startswith("adv-") for q in check.QUESTIONS) >= 4               # advice traps
    assert check.GAP_SECONDS * 6 > 60                                               # under the endpoint's six a minute


# ------------------------------------------------------------------------------------------------------------------ the endpoint (Postgres, Redis)

UNTIDY = "Sure, here is the answer:\n**1. Growth**\n• Revenue up 7% in FY2026 [FinLit company page, FY2026]"


async def admin_with_mfa(app, email):
    c = new_client(app)
    await signup(app, c, email)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("UPDATE users SET role = 'admin', plan = 'gold' WHERE lower(email) = $1", email)
    r = await login(c, email)
    c.headers.update({**ORIGIN, "X-CSRF-Token": r.json()["csrf"]})
    secret = (await c.post("/api/me/mfa/setup")).json()["secret"]
    assert (await c.post("/api/me/mfa/enable", json={"code": crypto.totp_code(secret, int(time.time()) // 30)})).status_code == 200
    return c


async def set_switch(app, on: bool):
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO feature_flags (name, enabled) VALUES ('ask_answer_v2', $1) ON CONFLICT (name) DO UPDATE SET enabled = $1", on)
    variant.reset()


def notes_of(call) -> str:
    return "\n".join(str(m.get("content")) for m in call["messages"])


@pg
async def test_off_by_default_members_keep_todays_answers_and_cannot_pick_a_style(app):
    async with app.state.store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT enabled FROM feature_flags WHERE name = 'ask_answer_v2'") is False
    variant.reset()
    client = FakeClient([{"text": [UNTIDY]}, {"text": [UNTIDY]}])
    enable(app, client)
    m = await signed_in(app, "v1m@example.com", plan="silver")
    r, ev = await ask(m, "How is Reliance Industries doing?", variant="v2", check=True)      # ignored for a member
    assert r.status_code == 200 and "Answer shape:" not in notes_of(client.calls[0])
    assert client.calls[0]["output_config"]["effort"] == "low"
    assert not any(e == "replace" for e, _ in ev) and "check" not in ev[-1][1]
    assert (await m.get("/api/ask/quota")).json()["used"] == 1                                 # counted as any question


@pg
async def test_with_the_switch_on_the_note_carries_the_blueprint_and_the_answer_is_tidied(app):
    await set_switch(app, True)
    try:
        client = FakeClient([{"text": [UNTIDY]}])
        enable(app, client)
        m = await signed_in(app, "v2m@example.com", plan="gold")
        r, ev = await ask(m, "How is Reliance Industries doing?")
        notes = notes_of(client.calls[0])
        assert r.status_code == 200 and "Answer shape:" in notes and "1. Growth" in notes
        assert client.calls[0]["output_config"]["effort"] == "medium"
        rep = [d["text"] for e, d in ev if e == "replace"]
        assert rep and rep[-1].startswith("1. Growth") and "- Revenue up 7% in FY2026" in rep[-1] and "**" not in rep[-1]
    finally:
        await set_switch(app, False)


@pg
async def test_an_administrators_test_question_uses_no_allowance_is_never_cached_and_reports_its_shape(app):
    client = FakeClient([{"text": [UNTIDY]}, {"text": [UNTIDY]}])
    enable(app, client)
    a = await admin_with_mfa(app, "chk@example.com")
    for _ in range(2):
        r, ev = await ask(a, "How is Reliance Industries doing?", variant="v2", check=True)
        assert r.status_code == 200 and ev[0][1]["cached"] is False
        done = ev[-1]
        assert done[0] == "done" and done[1]["check"]["style"] == "v2" and done[1]["check"]["kind"] == "company"
        assert done[1]["check"]["measures"]["sections"] == 1 and done[1]["check"]["usage"]["input"] > 0
    assert len(client.calls) == 2                                                             # the second was answered again, not from the cache
    assert (await a.get("/api/ask/quota")).json()["used"] == 0
    async with app.state.store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM ask_memory WHERE question ILIKE '%Reliance Industries doing%'") == 0 \
            if await conn.fetchval("SELECT to_regclass('ask_memory')") else True


@pg
async def test_the_answer_check_runs_scores_keeps_and_can_be_stopped(app, monkeypatch):
    monkeypatch.setattr(check, "GAP_SECONDS", 0.0)

    async def fake_grade(client, model, q, a):
        return {"direct": 5, "specific": 4, "clear": 5, "why": "fine"}
    monkeypatch.setattr(check, "grade", fake_grade)
    good = "Reliance grew profit 9% in FY2026 [FinLit company page, FY2026].\n1. Growth\n- Revenue up 7% in FY2026 [FinLit, FY2026]\n2. Margins\n- EBITDA margin 17% [FinLit, FY2026]"
    enable(app, FakeClient([{"text": [good]}, {"text": ["You should buy ITC."]}]))
    a = await admin_with_mfa(app, "runner@example.com")
    member = await signed_in(app, "notadmin@example.com", plan="gold")
    assert (await member.post("/api/admin/ask-check", json={"style": "v2"})).status_code in (401, 403)
    assert (await a.post("/api/admin/ask-check", json={"style": "v3"})).status_code == 422
    r = await a.post("/api/admin/ask-check", json={"style": "v2", "only": ["co-health-reliance", "adv-buy-itc"]})
    assert r.status_code == 202 and r.json()["questions"] == 2
    run_id = r.json()["id"]
    assert (await a.post("/api/admin/ask-check", json={"style": "v1"})).status_code == 409             # one run at a time
    for _ in range(100):
        got = (await a.get(f"/api/admin/ask-check/{run_id}")).json()
        if got["run"]["status"] != "running":
            break
        await asyncio.sleep(0.1)
    assert got["run"]["status"] == "done" and got["run"]["done"] == 2
    by = {x["qid"]: x for x in got["answers"]}
    assert by["co-health-reliance"]["kind"] == "company" and float(by["co-health-reliance"]["score"]) > 90
    assert by["co-health-reliance"]["checks"]["grade"]["direct"] == 5
    adv = by["adv-buy-itc"]                                                                   # withdrawn by the endpoint, or caught here
    # FinLit AI withdraws an advice-like answer before it is kept (service.ADVICE): the advice text never stands as a clean answer; if any
    # slipped through, the fixed checks flag it and the score drops
    assert "should buy" not in (adv["answer"] or "").lower() or (adv["checks"]["fixed"]["advice"] and float(adv["score"]) <= 70)
    listing = (await a.get("/api/admin/ask-check")).json()
    assert listing["runs"][0]["id"] == run_id and listing["questions"] == len(check.QUESTIONS) and listing["styleOn"] == "v1"
    assert (await a.get("/api/admin/ask-check/999999")).status_code == 404
    assert (await a.get("/api/ask/quota")).json()["used"] == 0                                # the check used no allowance
    async with app.state.store.pool.acquire() as conn:                                        # stop
        rid = await conn.fetchval("INSERT INTO ask_check_runs (style, questions) VALUES ('v1', 3) RETURNING id")
    assert (await a.post(f"/api/admin/ask-check/{rid}/stop")).json()["status"] == "stopped"
    async with app.state.store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT status FROM ask_check_runs WHERE id = $1", rid) == "stopped"
    ask_api._clients.pop("sk-test", None)
