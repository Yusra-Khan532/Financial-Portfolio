"""Task #349 fixes after the founder's signed-in Gold QA of 24 Nov 2026 (docs/ASK-AI.md "Fixes after the Gold QA").

C  with a company pinned (BSE on the founder's screen, RELIANCE here), the RBI and banking answers carried the company's tag, report link, related
   questions and disclaimer. The server now sends subject {kind, id} with meta, and the relation event, company links and the company disclaimer
   only when subject.kind is "company". Economy, sector and market answers carry their own describe-only disclaimer.
D  Chat History labelled those questions "· BSE": the stored subject was the pinned company. New rows carry the field; older rows are shown by it.
F  the instruction and the relation lines never say "You hold" without a quantity.
I  the CPI quarter averages are calendar quarters: "2026 Q3" reached the model and was said as "Q3 FY27" (Oct-Dec 2026, not over yet).

Real Postgres and Redis and the scripted model of test_ask.py (a live model answer is not needed: the code path is what is tested)."""

import json

import pytest

from finlit import macro
from finlit.ask import memory, pages as P, routing, service
from test_ask import FakeClient, enable
from test_ask_holdings import clear_cache, closes, h, member, put_state  # noqa: F401
from test_ask_memory import asked, memtable, rows_of  # noqa: F401
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401


def pg(f):
    return pytest.mark.integration(pytest.mark.usefixtures("memtable")(f))


# ------------------------------------------------------------------------------------------------------------------ C. a field question is not the page's

@pytest.mark.parametrize("q", ["What did the RBI do on interest rates?", "Is inflation above the RBI target?", "How is the banking sector doing?",
                               "Which sectors have been leading this month?", "Why is the Nifty down today?", "What is the FinLit IQ?",
                               "What is the difference between a mutual fund and an ETF?"])
def test_field_questions_are_not_about_the_pinned_company(q):
    assert routing.off_company(q)


@pytest.mark.parametrize("q", ["And its margins?", "How is this company doing?", "What are the red flags here?", "how is it doing?",
                               "What were the latest quarterly results?", "Is the stock price up?"])
def test_questions_about_the_company_keep_it(q):
    assert not routing.off_company(q)


@pg
async def test_a_pinned_company_does_not_leak_into_an_economy_or_sector_answer(app):
    m, uid = await member(app, "fixc@example.com")
    await closes(app, {"RELIANCE": 2950})
    await put_state(app, uid, [h("RELIANCE", 1, 0)])                      # on the Equity portfolio, no quantity (as BSE on the founder's)
    await clear_cache(app)
    for q, kind in (("What did the RBI do on interest rates?", "economy"), ("How is the banking sector doing?", "sector")):
        client = FakeClient([{"text": ["The RBI kept the repo rate at 5.25% on 5 Dec 2026."]}])
        enable(app, client)
        r, ev = await asked(m, q, symbol="RELIANCE")                     # asked with RELIANCE pinned
        assert r.status_code == 200 and ev[-1][0] == "done", ev
        meta, done = ev[0][1], dict(ev)["done"]
        assert meta["subject"]["kind"] == kind
        assert "relation" not in [e for e, _ in ev]                        # no "In your portfolio list" tag
        assert not [p for p in done["pages"] if p["to"].startswith(("/stocks/", "/prism/"))]   # no "RELIANCE company report" link
        assert done["disclaimer"] == service.disclaimer_for(kind) != service.DISCLAIMER          # not the company disclaimer
        assert "financial health" not in done["disclaimer"] and "not investment advice" in done["disclaimer"]
        sent = client.calls[0]["messages"][-1]["content"]
        assert "<company_card" not in sent and "<member_relation" not in sent
        assert client.calls[0]["system"][0]["text"] == service.SYSTEM
    kept = await rows_of(app, uid)
    assert [(r["subject_kind"], r["subject_id"]) for r in kept] == [("economy", "india"), ("sector", "all")]   # D: not "company RELIANCE"

    # the same page, a question about the company: its tag, its link and the company disclaimer, as before
    client = FakeClient([{"text": ["Reliance's latest quarter: revenue up 8%."]}])
    enable(app, client)
    r, ev = await asked(m, "How is this company doing?", symbol="RELIANCE")
    assert ev[0][1]["subject"] == {"kind": "company", "id": "RELIANCE"} and "relation" in [e for e, _ in ev]
    assert dict(ev)["done"]["disclaimer"] == service.DISCLAIMER
    assert dict(ev)["relation"]["tags"][0]["text"] == "In your portfolio list"


@pg
async def test_an_economy_question_naming_the_company_stays_about_it(app):
    m, _ = await member(app, "fixc2@example.com")
    enable(app, FakeClient([{"text": ["Rates affect Reliance's interest costs."]}]))
    _, ev = await asked(m, "How does the RBI rate decision affect Reliance?", symbol="RELIANCE")
    assert ev[0][1]["subject"] == {"kind": "company", "id": "RELIANCE"}


def test_each_field_has_its_own_describe_only_disclaimer():
    for k in ("economy", "sector", "market", "fund", "etf", "mine", "concept", "general"):
        d = service.disclaimer_for(k)
        assert d != service.DISCLAIMER and "not a recommendation" in d and "Information only, not investment advice." in d
    assert service.disclaimer_for("company") == service.disclaimer_for(None) == service.DISCLAIMER


# ------------------------------------------------------------------------------------------------------------------ D. history labels

def test_older_rows_that_took_the_pinned_company_are_shown_by_their_field():
    assert memory.shown_subject("What did RBI do on rates?", "company", "BSE") == ("economy", "india")
    assert memory.shown_subject("How is the banking sector doing?", "company", "BSE") == ("sector", "all")
    assert memory.shown_subject("hows relance is doing ?", "company", "RELIANCE") == ("company", "RELIANCE")
    assert memory.shown_subject("How does the RBI rate cut affect BSE?", "company", "BSE") == ("company", "BSE")      # it names the company
    assert memory.shown_subject("How does the repo rate affect HDFC Bank?", "company", "HDFCBANK") == ("company", "HDFCBANK")


@pg
async def test_the_history_route_labels_an_older_rbi_row_by_its_field(app):
    m, uid = await member(app, "fixd@example.com")
    async with app.state.store.pool.acquire() as c:
        await c.execute("INSERT INTO ai_question_memory (user_id, topic_key, subject_kind, subject_id, intent, question, plan) "
                        "VALUES ($1, 'company:BSE:news', 'company', 'BSE', 'news', 'What did RBI announce on rates today?', 'gold')", uid)
    items = (await m.get("/api/ask/history")).json()["items"]
    assert (items[0]["subjectKind"], items[0]["subjectId"]) == ("economy", "india")


# ------------------------------------------------------------------------------------------------------------------ I. quarter labels

def test_calendar_quarters_carry_their_months_and_financial_year_quarter():
    assert [macro.fy_quarter(2026, n) for n in (1, 2, 3, 4)] == ["Q4 FY26", "Q1 FY27", "Q2 FY27", "Q3 FY27"]
    assert macro.quarter_months(2026, 3) == "Jul-Sep 2026"
    from finlit import macro_sources as S
    w = macro.target_watch({S.month_end(2026, m): 4.9 for m in range(1, 11)})                 # Oct 2026 published, Nov and Dec not yet
    assert w["lastQuarter"] == "2026 Q3" and w["lastQuarterMonths"] == "Jul-Sep 2026" and w["lastQuarterFy"] == "Q2 FY27"
    assert all(q["fy"] != "Q3 FY27" for q in w["quarters"])                                   # Oct-Dec 2026 is not over: never averaged
    ai = P.target_watch_for_ai(w)
    assert ai["latestCompleteQuarter"] == {"months": "Jul-Sep 2026", "financialYearQuarter": "Q2 FY27"}
    assert "2026 Q3" not in json.dumps(ai) and ai["quarters"][-1] == {"months": "Jul-Sep 2026", "financialYearQuarter": "Q2 FY27", "averageCpi": 4.9,
                                                                     "complete": True}
    old = {"target": 4.0, "quarters": [{"q": "2026 Q3", "avg": 4.94}], "lastQuarter": "2026 Q3"}       # a payload stored before this fix
    assert P.target_watch_for_ai(old)["latestCompleteQuarter"]["financialYearQuarter"] == "Q2 FY27"
