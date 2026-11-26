"""Task #349 PR 2: question memory for Ask FinLit AI (finlit/ask/memory.py, finlit/ask/history.py, migration 135).

Real Postgres and Redis, signed-in Basic / Silver / Gold members and an administrator, the scripted model of test_ask.py. What must hold: a completed
written answer is kept (question, key lines, cited figures with dates) and listed newest first; rows past 180 days and beyond 200 per member go;
prefs.aiMemory false writes nothing; a member clears all or deletes one, and never reads or deletes another's; deleting the account deletes them;
summaries, errors, withdrawn answers and "view as" write nothing; the topic key is worked out without a model; and no answer changes."""

import hashlib
import json
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List

import anthropic
import httpx
import pytest

from finlit.ask import api as ask_api, memory, routing, service
from finlit.auth.service import VIEW_AS_HEADER, Ctx
from test_ask import FakeClient, ask, enable, store_prism, summary
from test_auth import PW, anon, app, make_admin, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401

MIGRATION = Path(memory.__file__).resolve().parent.parent / "migrations" / "135_ai_question_memory.sql"


@pytest.fixture
async def memtable(app):  # noqa: F811
    """test_integration's store drops `users` (CASCADE) and migrates again, which leaves a table outside its drop list without its foreign key. The
    table is made afresh from migration 135 for every test here, so the tests run on the real schema (ON DELETE CASCADE included)."""
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DROP TABLE IF EXISTS ai_question_memory")
        await conn.execute(MIGRATION.read_text())
    yield


def pg(f):
    return pytest.mark.integration(pytest.mark.usefixtures("memtable")(f))


async def uid_of(c) -> str:
    return (await c.get("/api/auth/me")).json()["user"]["id"]


async def history(c, **params) -> Dict[str, Any]:
    r = await c.get("/api/ask/history", params=params)
    assert r.status_code == 200, r.text
    return r.json()


async def asked(c, q="What is P/E?", **kw):
    r, ev = await ask(c, q, **kw)
    await memory.drain()
    return r, ev


async def insert_rows(app, uid: str, n: int, days_ago: int = 0, topic: str = "company:TCS:overview") -> None:
    async with app.state.store.pool.acquire() as conn:
        await conn.executemany(
            "INSERT INTO ai_question_memory (user_id, asked_at, topic_key, subject_kind, subject_id, intent, question, plan) "
            "VALUES ($1, now() - make_interval(days => $2) - make_interval(secs => $3), $4, 'company', 'TCS', 'overview', $5, 'silver')",
            [(uid, days_ago, i, topic, f"old question {i}") for i in range(n)])


async def rows_of(app, uid: str) -> List[Any]:
    async with app.state.store.pool.acquire() as conn:
        return await conn.fetch("SELECT * FROM ai_question_memory WHERE user_id = $1 ORDER BY id", uid)


# ------------------------------------------------------------------------------------------------------------------ write and list

@pg
async def test_a_completed_answer_is_kept_with_its_key_lines_and_figures_and_listed_newest_first(app):
    await store_prism(app)
    enable(app, FakeClient([{"text": ["**Reliance reads as strong.**\n", "- FinLit Prism 85.4 (Strong)\n- Sources: none"]}, {"text": ["P/E is price over earnings."]}]))
    m = await signed_in(app, "mem-w@example.com", plan="gold")
    r, ev = await asked(m, "prism score?", symbol="RELIANCE")
    assert r.status_code == 200 and ev[-1][0] == "done"
    await asked(m, "What is P/E?")
    h = await history(m)
    assert h["count"] == 2 and h["remember"] is True and h["retentionDays"] == 180 and h["maxRows"] == 200
    assert [i["question"] for i in h["items"]] == ["What is P/E?", "prism score?"]                     # newest first
    first = h["items"][1]
    assert first["topic"] == "company:RELIANCE:prism" and (first["subjectKind"], first["subjectId"], first["intent"]) == ("company", "RELIANCE", "prism")
    assert h["items"][0]["topic"] == "concept:pe:concept"
    row = (await rows_of(app, await uid_of(m)))[0]
    assert json.loads(row["points"]) == ["Reliance reads as strong.", "FinLit Prism 85.4 (Strong)"]     # bold and bullets gone, Sources left out
    figs = json.loads(row["figures"])["companies"]["RELIANCE"]
    assert figs["prism"]["score"] == 85.4 and figs["prism"]["label"] == "Strong" and figs["prism"]["parts"]["quality"] == 90
    assert figs["price"]["value"] > 0 and figs["price"]["asOf"]                                         # read from the card the answer read
    assert row["plan"] == "gold" and len((await history(m, limit=1))["items"]) == 1


@pg
async def test_history_needs_a_session_and_deletes_need_origin_and_csrf(app, anon):  # noqa: F811
    assert (await anon.get("/api/ask/history")).status_code == 401
    assert (await anon.delete("/api/ask/history")).status_code == 401
    m = await signed_in(app, "mem-csrf@example.com", plan="silver")
    bad = new_client(app, cookies=m.cookies, headers={"Origin": "http://test"})
    assert (await bad.delete("/api/ask/history")).json()["detail"]["status"] == "bad_csrf"
    evil = new_client(app, cookies=m.cookies, headers={"Origin": "https://evil.example", "X-CSRF-Token": m.headers["X-CSRF-Token"]})
    assert (await evil.delete("/api/ask/history/1")).json()["detail"]["status"] == "bad_origin"
    assert (await m.get("/api/ask/history", params={"limit": 0})).status_code == 422
    assert (await m.get("/api/ask/history", params={"limit": 201})).status_code == 422


# ------------------------------------------------------------------------------------------------------------------ retention

@pg
async def test_rows_older_than_180_days_are_pruned(app):
    enable(app, FakeClient([{"text": ["New answer."]}]))
    m = await signed_in(app, "mem-181@example.com", plan="silver")
    uid = await uid_of(m)
    await insert_rows(app, uid, 2, days_ago=181)
    await insert_rows(app, uid, 1, days_ago=179)
    await asked(m, "What is ROCE?")
    qs = [r["question"] for r in await rows_of(app, uid)]
    assert "What is ROCE?" in qs and len(qs) == 2 and "old question 0" in qs                         # the 179-day row stays, both 181-day rows went
    await insert_rows(app, uid, 1, days_ago=181)
    assert (await history(m))["count"] == 2                                                            # reading the list also drops what is past 180 days


@pg
async def test_beyond_200_rows_the_oldest_go(app):
    enable(app, FakeClient([{"text": ["Answer 201."]}]))
    m = await signed_in(app, "mem-201@example.com", plan="gold")
    uid = await uid_of(m)
    await insert_rows(app, uid, 200, days_ago=1)                                                       # old question 199 is the oldest
    await asked(m, "What is EBITDA?")
    rows = await rows_of(app, uid)
    qs = {r["question"] for r in rows}
    assert len(rows) == 200 and "What is EBITDA?" in qs and "old question 199" not in qs and "old question 0" in qs
    assert (await history(m, limit=200))["count"] == 200


# ------------------------------------------------------------------------------------------------------------------ the member's choice and rights

@pg
async def test_with_ai_memory_off_nothing_is_written_and_older_prefs_still_load(app):
    enable(app, FakeClient([{"text": ["One."]}, {"text": ["Two."]}]))
    m = await signed_in(app, "mem-off@example.com", plan="silver")
    assert (await m.put("/api/me/prefs", json={"palette": "gold"})).status_code == 200                 # an older save without aiMemory: on by default
    st = (await m.get("/api/me/state")).json()["prefs"]
    assert st.get("aiMemory") is True
    assert (await m.put("/api/me/prefs", json={"palette": "gold", "aiMemory": False})).status_code == 200
    assert (await m.get("/api/me/state")).json()["prefs"]["aiMemory"] is False
    r, ev = await asked(m, "What is P/E?")
    assert r.status_code == 200 and ev[-1][0] == "done"
    h = await history(m)
    assert h["count"] == 0 and h["items"] == [] and h["remember"] is False
    assert (await m.put("/api/me/prefs", json={"aiMemory": "maybe"})).status_code == 422
    async with app.state.store.pool.acquire() as conn:                                                 # prefs saved before this field existed
        await conn.execute("UPDATE user_state SET prefs = '{\"palette\": \"gold\"}'::jsonb WHERE user_id = $1", await uid_of(m))
    await asked(m, "What is ROE?")
    assert (await history(m))["count"] == 1


@pg
async def test_clear_all_and_delete_one(app):
    m = await signed_in(app, "mem-del@example.com", plan="silver")
    uid = await uid_of(m)
    await insert_rows(app, uid, 3)
    items = (await history(m))["items"]
    r = await m.delete(f"/api/ask/history/{items[0]['id']}")
    assert r.status_code == 200 and r.json() == {"status": "deleted"}
    assert [i["id"] for i in (await history(m))["items"]] == [i["id"] for i in items[1:]]
    assert (await m.delete(f"/api/ask/history/{items[0]['id']}")).status_code == 404                  # already gone
    assert (await m.delete("/api/ask/history/99999999999999999999")).status_code in (404, 422)
    r = await m.delete("/api/ask/history")
    assert r.status_code == 200 and r.json() == {"status": "cleared", "deleted": 2}
    assert (await history(m))["count"] == 0


@pg
async def test_a_member_never_reads_or_deletes_another_members_rows(app):
    a = await signed_in(app, "mem-a@example.com", plan="gold")
    b = await signed_in(app, "mem-b@example.com", plan="gold")
    await insert_rows(app, await uid_of(b), 2, topic="company:INFY:results")
    b_ids = [i["id"] for i in (await history(b))["items"]]
    assert (await history(a))["items"] == [] and (await history(a))["count"] == 0
    for i in b_ids:
        assert (await a.delete(f"/api/ask/history/{i}")).status_code == 404
    assert (await a.delete("/api/ask/history")).json()["deleted"] == 0
    assert [i["id"] for i in (await history(b))["items"]] == b_ids                                     # untouched


@pg
async def test_deleting_the_account_deletes_its_history(app):
    m = await signed_in(app, "mem-gone@example.com", plan="silver")
    uid = await uid_of(m)
    await insert_rows(app, uid, 4)
    r = await m.request("DELETE", "/api/me", json={"password": PW})
    assert r.status_code == 200, r.text
    assert await rows_of(app, uid) == []


# ------------------------------------------------------------------------------------------------------------------ what is never written

@pg
async def test_summaries_errors_withdrawn_answers_and_view_as_write_nothing(app):
    await store_prism(app)
    m = await signed_in(app, "mem-none@example.com", plan="gold")
    uid = await uid_of(m)
    enable(app, FakeClient([{"text": ["The business is sound and the share has traded calmly."]}]))   # task #404: a stance
    r, ev = await summary(m)
    assert r.status_code == 200 and ev[-1][0] == "done"
    await memory.drain()
    enable(app, FakeClient([], fail=anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com"))))
    r, ev = await asked(m, "What is ROE?")
    assert ev[-1][0] == "error"
    enable(app, FakeClient([{"text": ["You should buy TCS now."]}]))
    r, ev = await asked(m, "What about TCS shares?")
    assert ("replace", {"text": service.WITHDRAWN}) in ev
    assert await rows_of(app, uid) == []
    boss = await make_admin(app, "mem-boss@example.com")
    enable(app, FakeClient([{"text": ["Previewed answer."]}, {"text": ["Admin's own answer."]}]))
    r = await boss.post("/api/ask", json={"question": "What is ROCE?"}, headers={VIEW_AS_HEADER: "silver"})
    await memory.drain()
    assert r.status_code == 200 and "Previewed answer." in r.text
    boss_id = await uid_of(boss)
    assert await rows_of(app, boss_id) == []                                                           # an admin previewing a plan: nothing kept
    r = await boss.post("/api/ask", json={"question": "What is ROCE today?"})
    await memory.drain()
    assert [x["plan"] for x in await rows_of(app, boss_id)] == ["admin"]                               # the admin's own question is kept


@pg
async def test_basic_members_and_the_record_rules_write_nothing(app):
    b = await signed_in(app, "mem-basic@example.com")
    ctx = Ctx(user_id=await uid_of(b), plan="basic")
    res = {"text": "An answer.", "stop": "end_turn"}
    pool = app.state.store.pool
    topic = memory.topic_of("What is P/E?")
    assert await memory.record(pool, ctx, kind="question", question="q", result=res, topic=topic) is None            # Basic: no written answers
    g = Ctx(user_id=ctx.user_id, plan="gold")
    assert await memory.record(pool, g, kind="summary", question="q", result=res, topic=topic) is None
    assert await memory.record(pool, g, kind="question", question="q", result=res, topic=topic, error=True) is None
    assert await memory.record(pool, g, kind="question", question="q", result={"text": "", "stop": "end_turn"}, topic=topic) is None
    assert await memory.record(pool, g, kind="question", question="q", result={"text": "x", "stop": "refusal"}, topic=topic) is None
    assert await memory.record(pool, Ctx(user_id=ctx.user_id, role="admin", plan="silver", extra={"view_as": "silver"}), kind="question",
                               question="q", result=res, topic=topic) is None
    assert await memory.record(pool, g, kind="question", question="x" * 900, result=res, topic=topic) is not None    # cut to 500
    assert len((await rows_of(app, ctx.user_id))[0]["question"]) == 500


# ------------------------------------------------------------------------------------------------------------------ the topic, without a model

TOPICS = [
    # (question, companies named, page company, expected topic key)
    ("What is TCS's ROE?", ["TCS"], None, "company:TCS:results"),
    ("prism score of jsw steels ?", ["JSWSTEEL"], None, "company:JSWSTEEL:prism"),
    ("TCS Q2 results", ["TCS"], None, "company:TCS:results"),
    ("Reliance share price kya hai", ["RELIANCE"], None, "company:RELIANCE:price"),
    ("is HDFC Bank expensive?", ["HDFCBANK"], None, "company:HDFCBANK:valuation"),
    ("red flags in Pricol", ["PRICOL"], None, "company:PRICOL:risks"),
    ("What did management say on the Infosys earnings call?", ["INFY"], None, "company:INFY:documents"),
    ("Tata Motors investor presentation kya kehta hai", ["TMCV"], None, "company:TMCV:documents"),
    ("promoter holding of Wipro", ["WIPRO"], None, "company:WIPRO:ownership"),
    ("Why did ITC fall today?", ["ITC"], None, "company:ITC:news"),
    ("how is TCS doing?", ["TCS"], None, "company:TCS:overview"),
    ("prism score?", [], "RELIANCE", "company:RELIANCE:prism"),
    ("what is its debt?", [], "HCLTECH", "company:HCLTECH:risks"),
    ("Infosys ka munafa kitna hai", ["INFY"], None, "company:INFY:results"),
    ("compare wipro and infosys", ["WIPRO", "INFY"], None, "company:WIPRO:overview"),
    ("HDFC Bank NPA kitna hai", ["HDFCBANK"], None, "company:HDFCBANK:risks"),
    ("TCS market cap", ["TCS"], None, "company:TCS:valuation"),
    ("52 week high of Infosys", ["INFY"], None, "company:INFY:price"),
    ("Reliance ka share kaisa hai", ["RELIANCE"], None, "company:RELIANCE:overview"),
    ("What is P/E?", [], None, "concept:pe:concept"),
    ("PE ratio kya hai", [], None, "concept:pe:concept"),
    ("ROE kya hota hai", [], None, "concept:roe:concept"),
    ("What is SEBI's rule on insider trading?", [], None, "concept:sebi-insider-trading:concept"),
    ("What is the repo rate?", [], None, "economy:india:concept"),
    ("inflation aaj kitni hai", [], None, "economy:india:news"),
    ("GDP latest", [], None, "economy:india:news"),
    ("pharma sector outlook", [], None, "sector:pharma:overview"),
    ("how are IT companies doing", [], None, "sector:it:overview"),
    ("real estate housing sales trend", [], None, "sector:real_estate:results"),
    ("monsoon impact on rural demand", [], None, "sector:rural_agri:overview"),
    ("small cap mutual funds returns", [], None, "fund:all:overview"),
    ("SIP kya hai", [], None, "fund:all:concept"),
    ("Nifty BeES ETF expense ratio", [], None, "etf:all:overview"),
    ("Nifty today", [], None, "market:india:news"),
    ("sensex kyu gira", [], None, "market:india:news"),
    ("FII DII flows this week", [], None, "market:india:news"),
    ("hello", [], None, "general:all:overview"),
]


@pytest.mark.parametrize("q, named, page, want", TOPICS)
def test_topic_of_a_table_of_questions(q, named, page, want):
    kinds = routing.classify(q, named_company=bool(named), on_company_page=bool(page))
    key, sk, sid, intent = memory.topic_of(q, named, page, None, kinds)
    assert key == want, (q, kinds)
    assert key == f"{sk}:{sid}:{intent}" and sk in memory.KINDS and intent in memory.INTENTS
    assert memory.topic_of(q, named, page, None, kinds) == (key, sk, sid, intent)        # deterministic


def test_topic_table_is_large_enough_and_has_hinglish():
    assert len(TOPICS) >= 30
    assert sum(1 for q, *_ in TOPICS if any(w in q.lower().split() for w in ("kya", "hai", "ka", "kyu", "aaj", "kaisa"))) >= 8


def test_a_fund_or_etf_in_context_is_the_subject():
    assert memory.topic_of("what are its returns", [], None, {"kind": "fund", "id": "120503"}, [])[0] == "fund:120503:overview"
    assert memory.topic_of("premium to NAV?", [], None, {"kind": "etf", "id": "NIFTYBEES"}, ["funds"])[0] == "etf:NIFTYBEES:overview"
    assert memory.topic_of("TCS results", ["TCS"], None, {"kind": "fund", "id": "1"}, [])[0] == "company:TCS:results"   # a company named wins


# ------------------------------------------------------------------------------------------------------------------ points and figures (no model)

def test_extract_points_keeps_up_to_eight_short_lines():
    text = "\n".join(["**Direct answer here.**", "", "1. First point", "- Second point", "* " + "long " * 60, "Sources: Moneycontrol, 18 Nov 2026"]
                     + [f"- extra {i}" for i in range(10)])
    pts = memory.extract_points(text)
    assert pts[:3] == ["Direct answer here.", "First point", "Second point"] and len(pts) == 8
    assert all(len(p) <= 160 for p in pts) and pts[3].endswith("…") and not any(p.startswith("Sources") for p in pts)
    assert memory.extract_points("TCS earned ₹12,000 Cr. Margins were 24%. Debt is low.") == ["TCS earned ₹12,000 Cr.", "Margins were 24%.", "Debt is low."]
    assert memory.extract_points("") == []


def env(tool: str, data: Dict[str, Any], as_of: str = "2026-11-20T10:00:00") -> str:
    return json.dumps({"tool": tool, "data": data, "asOf": as_of})


def test_extract_figures_only_from_what_the_tools_returned():
    reads = [
        ("get_company_card", {"symbol": "TCS"}, env("get_company_card", {
            "symbol": "TCS", "quote": {"price": 3412.5, "changePct": -1.2, "asOf": "2026-11-20T15:30:00"}, "range52": {"high": 4500, "low": 3000},
            "finlitPrism": {"unavailable": "FinLit Prism is part of the Gold plan."}, "profile": {"marketCapCr": 1234567.0},
            "keyMetrics": [{"key": "pe", "value": 25.1, "unit": "x", "period": "TTM"}, {"key": "roe", "value": 41.0}]})),
        ("get_finlit_prism", {"symbol": "INFY"}, env("get_finlit_prism", {"symbol": "INFY", "finlitPrism": {
            "score": 71.0, "label": "Healthy", "parts": {"quality": 80, "risk": None}, "calculatedAt": "2026-11-19", "modelVersion": "prism-2"}})),
        ("read_company_document", {"symbol": "TCS", "document": "results_filing"}, env("read_company_document", {
            "symbol": "TCS", "document": "Results filing", "title": "Financial results Q2 FY27", "filed": "2026-10-09", "link": "https://nse/x.pdf"})),
        ("get_news_and_filings", {"symbol": "TCS", "kind": "news"}, env("get_news_and_filings", {"kind": "news", "items": [
            {"date": "2026-11-18", "symbol": "TCS", "title": "Older", "link": "https://a"}, {"date": "2026-11-21", "symbol": "TCS", "title": "Newest", "link": "https://b"}]})),
        ("get_company_section", {"symbol": "TCS", "section": "macro_outlook"}, env("get_company_section", {
            "symbol": "TCS", "section": "macro_outlook", "data": {"sector": {"name": "IT", "box": "Leading", "state": "Improving"}}})),
        ("get_ratios", {"symbol": "WIPRO"}, "not json at all"),
    ]
    f = memory.extract_figures(reads)
    tcs, infy = f["companies"]["TCS"], f["companies"]["INFY"]
    assert tcs["price"] == {"value": 3412.5, "changePct": -1.2, "asOf": "2026-11-20T15:30:00"}
    assert tcs["range52"] == {"high": 4500.0, "low": 3000.0, "asOf": "2026-11-20T15:30:00"}
    assert "prism" not in tcs                                                                # a plan without Prism: nothing kept
    assert tcs["pe"] == {"value": 25.1, "unit": "x", "period": "TTM", "asOf": "2026-11-20T10:00:00"}
    assert tcs["marketCap"]["value"] == 1234567.0 and tcs["marketCap"]["unit"] == "Cr"
    assert tcs["results"]["filed"] == "2026-10-09" and tcs["newest"] == {"id": "https://b", "date": "2026-11-21", "title": "Newest", "kind": "news"}
    assert tcs["sector"]["box"] == "Leading" and tcs["sector"]["state"] == "Improving"
    assert infy["prism"] == {"score": 71.0, "label": "Healthy", "parts": {"quality": 80.0}, "modelVersion": "prism-2", "asOf": "2026-11-19"}
    assert "WIPRO" not in f["companies"]
    assert memory.extract_figures([]) == {}


def test_tool_results_are_taken_from_the_turns_and_errors_are_left_out():
    from types import SimpleNamespace as NS
    msgs = [{"role": "user", "content": "q"},
            {"role": "assistant", "content": [{"type": "tool_use", "id": "p1", "name": "read_company_document", "input": {"symbol": "TCS"}}]},
            {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "p1", "content": "{\"data\":{}}"}]},
            {"role": "assistant", "content": [NS(type="text", text="..."), NS(type="tool_use", id="tu0", name="get_ratios", input={"symbol": "TCS"}),
                                              NS(type="tool_use", id="tu1", name="get_shareholding", input={"symbol": "TCS"})]},
            {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "tu0", "content": "R"},
                                         {"type": "tool_result", "tool_use_id": "tu1", "content": "not found", "is_error": True}]}]
    got = memory.tool_results_of(msgs, [("get_company_card", {"symbol": "TCS"}, {"text": "C", "error": False}),
                                        ("get_company_card", {"symbol": "X"}, {"text": "no", "error": True})])
    assert got == [("get_company_card", {"symbol": "TCS"}, "C"), ("read_company_document", {"symbol": "TCS"}, "{\"data\":{}}"),
                   ("get_ratios", {"symbol": "TCS"}, "R")]


# ------------------------------------------------------------------------------------------------------------------ answers unchanged (golden)

FIXED = datetime(2026, 11, 23, 10, 30, tzinfo=service.IST)


class _Fixed(datetime):
    @classmethod
    def now(cls, tz=None):
        return FIXED.astimezone(tz) if tz else FIXED


def test_golden_build_messages_and_cache_key_are_unchanged(monkeypatch):
    """The values below were computed from origin/main before this PR (task #349 PR 2 changes no answer)."""
    monkeypatch.setattr(service, "datetime", _Fixed)
    monkeypatch.setattr(ask_api, "datetime", _Fixed)
    msgs = service.build_messages([{"role": "user", "content": "How is TCS doing?"}, {"role": "assistant", "content": "TCS reads as steady."}],
                                  "and its margins?", "TCS", "silver", '{"tool":"get_company_card","data":{"symbol":"TCS"}}', "[Sources: test]",
                                  page_is_subject=True)
    assert hashlib.sha256(json.dumps(msgs, sort_keys=True, ensure_ascii=False).encode()).hexdigest() == \
        "7c39b4fcc2dcb4b603ca83bed8b527d069c750c2d45a346055083aa9de13901f"
    assert ask_api.cache_key("m1", Ctx(user_id="u", plan="gold"), ask_api.AskIn(question="What is TCS's ROE?", symbol="tcs")) == \
        "ask:answer:m1:gold:2026-11-23:ab28c738ad90ce1f008706a4f3ac690b"
    assert ask_api.cache_key("m1", Ctx(user_id="u", plan="silver"), ask_api.AskIn(kind="summary", symbol="RELIANCE")) == \
        "ask:answer:summary:v6:m1:RELIANCE:2026-11-23"   # task #404: the stance form


@pg
async def test_the_same_question_gets_the_same_request_and_the_same_answer_with_memory_on_or_off(app):
    """End to end: what reaches the model and what reaches the member are identical whether the question is kept or not."""
    turns = [{"tools": [("get_ratios", {"symbol": "RELIANCE"})]}, {"text": ["Reliance's ROE ", "was steady."]}]
    on_client, off_client = FakeClient([dict(t) for t in turns]), FakeClient([dict(t) for t in turns])
    on = await signed_in(app, "mem-on@example.com", plan="gold")
    off = await signed_in(app, "mem-offg@example.com", plan="gold")
    assert (await off.put("/api/me/prefs", json={"aiMemory": False})).status_code == 200
    enable(app, on_client)
    _, ev_on = await asked(on, "what is the roe of this company?", symbol="RELIANCE")
    async with app.state.store.redis.pipeline(transaction=False) as p:     # the same first question would come from the cache: ask it afresh
        for k in await app.state.store.redis.keys("ask:answer:*"):
            p.delete(k)
        await p.execute()
    enable(app, off_client)
    _, ev_off = await asked(off, "what is the roe of this company?", symbol="RELIANCE")

    def plain(calls):
        return json.dumps([{k: v for k, v in c.items()} for c in calls], default=lambda o: getattr(o, "__dict__", str(o)), sort_keys=True)
    assert plain(on_client.calls) == plain(off_client.calls) and len(on_client.calls) == 2
    assert [e for e in ev_on if e[0] != "meta"] == [e for e in ev_off if e[0] != "meta"]
    assert (await history(on))["count"] == 1 and (await history(off))["count"] == 0
    row = (await rows_of(app, await uid_of(on)))[0]
    assert row["topic_key"] == "company:RELIANCE:results" and "RELIANCE" in json.loads(row["figures"]).get("companies", {})
