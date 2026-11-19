"""Task #254 (19 Nov 2026): "train finlit AI for deeper any company related document to investor presentation, call transcript, result fillings
given in learn>document". FinLit AI reads the right company document for the question (a call transcript for what management said, an annual
report for strategy and risks, a results filing for a quarter's results, the presentation for the company's own deck and plans), two when the
question compares them, the one of the period asked when it names one; keeps the newest document of each kind per company (an annual report until
the next one); and picks a document's pages by kind (management's answers first in a call, the main sections in an annual report), naming a
call's speakers as the page names them. No model, no network: the model is stubbed and the exchange is never asked."""
from __future__ import annotations

import json
import re
from datetime import date
from types import SimpleNamespace as NS
from typing import Any, Dict, List

import pytest

from finlit.ask import docstore, pages as P, service, tools as T

TODAY = date(2026, 11, 19)

# ------------------------------------------------------------------------------------------------ 1. which document a question reads first


@pytest.mark.parametrize("q,kinds", [
    ("What did management say on the Sansera concall?", ["call_transcript"]),
    ("Sansera concall mein kya bola", ["call_transcript"]),
    ("TVS Motor earnings call transcript", ["call_transcript"]),
    ("guidance on the call for L&T", ["call_transcript"]),
    ("What did the management say about demand?", ["call_transcript"]),
    ("Infosys management commentary on deal wins", ["call_transcript"]),
    ("Reliance Q2 FY27 results", ["results_filing"]),
    ("profit in the September quarter for TCS", ["results_filing"]),
    ("Infosys results filing", ["results_filing"]),
    ("HDFC Bank quarterly results", ["results_filing"]),
    ("Sansera latest results", ["results_filing"]),
    ("quarter ended 30 September 2026 numbers of Bharat Electronics", ["results_filing"]),
    ("TCS annual report on attrition", ["annual_report"]),
    ("Reliance chairman's letter", ["annual_report"]),
    ("risk factors of Zomato", ["annual_report"]),
    ("related party transactions of Adani Ports", ["annual_report"]),
    ("Titan long-term strategy", ["annual_report"]),
    ("Reliance ppt kya bolta hai Jio ke baare mein", ["investor_presentation"]),
    ("Reliance capex plans for FY27", ["investor_presentation"]),
    ("Q2 results presentation of Sansera", ["investor_presentation"]),
    ("compare what Reliance said in the presentation and on the call", ["call_transcript", "investor_presentation"]),
    ("Sansera annual report and concall: compare the capex", ["call_transcript", "annual_report"]),
    ("all documents of Sansera", ["investor_presentation", "call_transcript"]),
    ("saare documents of TVS Motor", ["investor_presentation", "call_transcript"]),
    ("TCS vs Infosys concall", ["call_transcript"]),            # two companies, one kind: one document of the first company
])
def test_each_question_reads_the_right_document_and_a_comparison_reads_two(q, kinds):
    assert service.document_intents(q) == kinds
    assert service.document_intent(q) == kinds[0]


@pytest.mark.parametrize("q", ["How is TCS doing?", "TCS ka profit", "What is P/E?", "Prism score of JSW Steel", "Show my portfolio", "repo rate kya hai"])
def test_questions_about_no_document_read_none(q):
    assert service.document_intents(q) == [] and service.document_intent(q) is None


# ------------------------------------------------------------------------------------------------ 2. the period asked


@pytest.mark.parametrize("q,kind,label,first,last", [
    ("Q2 FY27 results", "Results filing", "Q2 FY27", "2026-10-01", "2026-12-14"),
    ("Q2 results", "Results filing", "Q2 FY27", "2026-10-01", "2026-12-14"),           # the latest Q2 on or before today
    ("Q1 call", "Call transcript", "Q1 FY27", "2026-07-01", "2026-09-13"),
    ("september quarter", "Results filing", "the quarter ended 30 September 2026", "2026-10-01", "2026-12-14"),
    ("june quarter of 2026", "Results filing", "the quarter ended 30 June 2026", "2026-07-01", "2026-09-13"),
    ("FY26 annual report", "Annual report", "FY26", "2026-04-01", "2026-12-26"),
    ("2025-26 annual report", "Annual report", "FY26", "2026-04-01", "2026-12-26"),
    ("FY26 results", "Results filing", "Q4 FY26 (the year's last quarter)", "2026-04-01", "2026-06-14"),
])
def test_the_period_a_question_names_gives_the_filing_dates_to_look_for(q, kind, label, first, last):
    w = P.period_window(q, kind, TODAY)
    assert w is not None and (str(w[0]), str(w[1]), w[2]) == (first, last, label)


@pytest.mark.parametrize("q,kind", [("last quarter results", "Results filing"), ("latest concall", "Call transcript"),
                                    ("capex plans for FY27", "Investor presentation"), ("FY30 aspiration", "Investor presentation")])
def test_no_period_means_the_newest_and_a_presentations_year_is_a_plans_year_not_a_period(q, kind):
    assert P.period_window(q, kind, TODAY) is None


# ------------------------------------------------------------------------------------------------ 3. results filings, the lookup and the database fallback

RESULTS_FEED = [
    {"kind": "result", "symbol": "SANSERA", "title": "Sansera Engineering Ltd: board meeting for results", "link": None, "date": "2026-11-05", "category": "Results date"},
    {"kind": "result", "symbol": "SANSERA", "title": "Sansera Engineering Limited has submitted to the Exchange, the financial results for the period ended September 30, 2026",
     "link": "https://nsearchives.nseindia.com/corporate/SANSERA_Q2.pdf", "date": "2026-11-05", "category": "Outcome of Board Meeting"},
    {"kind": "result", "symbol": "SANSERA", "title": "Press Release: results", "link": "https://nsearchives.nseindia.com/corporate/SANSERA_PR.pdf",
     "date": "2026-11-05", "category": "Press Release"},
    {"kind": "result", "symbol": "SANSERA", "title": "Sansera Engineering Limited has submitted to the Exchange, the financial results for the period ended June 30, 2026",
     "link": "https://nsearchives.nseindia.com/corporate/SANSERA_Q1.pdf", "date": "2026-08-12", "category": "Outcome of Board Meeting"},
]


def test_a_results_filing_is_the_filed_results_not_the_meeting_notice_a_call_or_a_press_release():
    assert [P.is_results_filing(r) for r in RESULTS_FEED] == [False, True, False, True]
    assert not P.is_results_filing({"title": "Analysts/Institutional Investor Meet/Con. Call Updates: Audio recording", "category": "Analysts/Institutional Investor Meet/Con. Call Updates",
                                    "link": "https://x/y.pdf"})


class Fetcher:
    """The exchange: hands out a tiny PDF per link and records each ask."""
    asked: List[str] = []
    files: Dict[str, List[str]] = {}

    def __init__(self, **kw):
        pass

    async def pdf(self, url, cap=None):
        from test_ask_pages import tiny_pdf
        Fetcher.asked.append(url)
        return tiny_pdf(Fetcher.files[url])

    async def aclose(self):
        pass


@pytest.fixture
def exchange(monkeypatch):
    P._texts.clear()
    Fetcher.asked, Fetcher.files = [], {}
    monkeypatch.setattr("finlit.earnings.transcripts.Fetcher", Fetcher)
    return Fetcher


def gw_feed(by_kind: Dict[str, List[Dict[str, Any]]], store: Any = None, asked: list = None):
    class G:
        app = NS(state=NS(store=store))

        async def json(self, path, params=None, **kw):
            assert path == "/api/feed"
            if asked is not None:
                asked.append(params["kind"])
            return {"items": [i for i in by_kind.get(params["kind"], []) if i.get("symbol") == params.get("symbol")]}
    return G()


async def test_a_results_filing_comes_from_news_and_filings_results_newest_first_and_names_the_period(exchange):
    exchange.files = {"https://nsearchives.nseindia.com/corporate/SANSERA_Q2.pdf": ["Cover", "Statement of results for the quarter ended 30 September 2026: revenue 9,000"],
                      "https://nsearchives.nseindia.com/corporate/SANSERA_Q1.pdf": ["Cover", "Statement of results for the quarter ended 30 June 2026"]}
    asked: list = []
    r = await T.run(gw_feed({"result": RESULTS_FEED}, asked=asked), "read_company_document", {"symbol": "SANSERA", "document": "results_filing", "question": "revenue"})
    d = json.loads(r["text"])["data"]
    assert asked == ["result"] and d["link"].endswith("SANSERA_Q2.pdf") and d["filed"] == "2026-11-05" and d["document"] == "Results filing"
    assert "FinLit's own results" in r["text"] and "get_quarter_results" in r["text"]      # FinLit's figures are the numbers; the filing is the source
    r1 = await T.run(gw_feed({"result": RESULTS_FEED}), "read_company_document", {"symbol": "SANSERA", "document": "results_filing", "question": "Q1 FY27 results"})
    d1 = json.loads(r1["text"])["data"]
    assert d1["link"].endswith("SANSERA_Q1.pdf") and d1["period"] == "Q1 FY27"            # the period asked, not the newest


async def test_a_period_with_no_filing_gives_the_newest_with_a_note_saying_so(exchange):
    exchange.files = {"https://nsearchives.nseindia.com/corporate/SANSERA_Q2.pdf": ["Cover", "Results"]}
    r = await T.run(gw_feed({"result": RESULTS_FEED[:2]}), "read_company_document", {"symbol": "SANSERA", "document": "results_filing", "question": "Q4 FY27 results"})
    d = json.loads(r["text"])["data"]
    assert d["link"].endswith("SANSERA_Q2.pdf") and d["period"] == "Q4 FY27"
    assert "holds no results filing of SANSERA filed for Q4 FY27; this is the newest one, filed 2026-11-05" in r["text"]


async def test_with_no_results_filing_or_annual_report_it_says_so_with_the_page_and_the_window():
    r = await T.run(gw_feed({}), "read_company_document", {"symbol": "ZZNONE", "document": "results_filing"})
    d = json.loads(r["text"])["data"]
    assert d["found"] is False and d["searched"] == "the last 400 days" and "News & filings page holds no results filing for ZZNONE" in r["text"]
    r2 = await T.run(gw_feed({}), "read_company_document", {"symbol": "ZZNONE", "document": "annual_report"})
    assert json.loads(r2["text"])["data"]["searched"] == "the last 760 days" and "Documents page holds no annual report" in r2["text"]


class Conn:
    """The feed_items and document_pages the database fallback reads (task #254's FEED_KIND_SQL), in memory."""

    def __init__(self, db):
        self.db = db

    async def fetchval(self, sql, link):
        r = self.db["pages"].get(link)
        return json.dumps(r["pages"]) if r else None

    async def fetch(self, sql, sym, *a):
        if "f.kind = $2" in sql:
            kind, want, avoid, _days = a
            return [r for r in self.db["feed"] if r["symbol"] == sym and r["kind"] == kind
                    and re.search(want, r["category"] + " " + r["title"], re.I) and not re.search(avoid, r["category"] + " " + r["title"], re.I)]
        return [r for r in self.db["feed"] if r["symbol"] == sym]

    async def fetchrow(self, sql, *a):
        return None

    async def execute(self, sql, *a):
        if sql.startswith("INSERT INTO document_pages"):
            self.db["pages"][a[0]] = {"symbol": a[1], "kind": a[2], "filed": a[4], "pages": json.loads(a[5])}
        self.db.setdefault("sql", []).append(sql.split()[0])
        return "DELETE 0"


def store_with(db):
    class Pool:
        def acquire(self):
            class Ctx:
                async def __aenter__(self):
                    return Conn(db)

                async def __aexit__(self, *a):
                    return False
            return Ctx()
    return NS(pool=Pool())


async def test_a_transcript_the_documents_list_does_not_reach_is_found_in_the_database_and_its_kept_text_read_without_the_exchange(exchange):
    link = "https://nsearchives.nseindia.com/corporate/ZZ_transcript.pdf"
    db = {"pages": {link: {"pages": ["Participants", "Management: demand stayed strong"]}},
          "feed": [{"kind": "document", "symbol": "ZZ", "title": "ZZ Ltd has informed the Exchange about Transcript", "category": "Analysts/Institutional Investor Meet/Con. Call Updates",
                    "item_date": "2026-11-04", "link": link},
                   {"kind": "document", "symbol": "ZZ", "title": "Schedule of meet", "category": "Analysts/Institutional Investor Meet/Con. Call Updates",
                    "item_date": "2026-11-10", "link": "https://x/meet.pdf"}]}
    r = await T.run(gw_feed({}, store_with(db)), "read_company_document", {"symbol": "ZZ", "document": "call_transcript", "question": "demand"})
    d = json.loads(r["text"])["data"]
    assert d["link"] == link and d["read"] == "kept" and exchange.asked == []


async def test_a_document_read_from_the_exchange_is_kept_under_its_own_kind(exchange):
    link = "https://nsearchives.nseindia.com/corporate/ZZ_AR.pdf"
    exchange.files = {link: ["Annual Report 2025-26", "Management Discussion and Analysis: risks"]}
    db: Dict[str, Any] = {"pages": {}, "feed": [{"kind": "document", "symbol": "ZZ", "title": "Annual Report 2025-26", "category": "Annual Report",
                                                 "item_date": "2025-08-01", "link": link}]}
    r = await T.run(gw_feed({}, store_with(db)), "read_company_document", {"symbol": "ZZ", "document": "annual_report", "question": "risks"})
    assert json.loads(r["text"])["data"]["read"] == "exchange" and exchange.asked == [link]
    assert db["pages"][link]["kind"] == "Annual report" and "DELETE" in db["sql"]       # kept, and older ones of its kind cleared


# ------------------------------------------------------------------------------------------------ 4. pages by kind: a call's management first, an annual report's sections

CALL = [
    "Cover letter\nSubject: Transcript of the earnings call\nScrip code: 500001\nEncls: as above",
    "Q2 FY27 Earnings Conference Call\nMANAGEMENT: MR. A.K. MEHTA - CHIEF FINANCIAL\nOFFICER\n MR. RAVI RAO - MANAGING DIRECTOR\nMODERATOR: MS. NEHA - XYZ SECURITIES",
    "Moderator: The first question is from Rohit Shah.\nRohit Shah: What is the capex plan for next year? And the capex split?",
    "A. K. Mehta: Our capex for next year will be about Rs 800 crore, mostly the new plant.\nRohit Shah: Thank you.",
    "Ravi Rao: Demand stayed strong in exports.",
]


def test_a_calls_management_is_read_from_its_participants_list_with_titles_over_two_lines():
    m = P.management_of(CALL)
    assert m == {"A.K. MEHTA": "CHIEF FINANCIAL OFFICER", "RAVI RAO": "MANAGING DIRECTOR"}       # the moderator is not management


def test_management_answers_come_first_and_each_page_names_its_speakers_as_the_page_does():
    picked = [n for n, _ in P.best_pages(CALL, "what is the capex plan", n=2, kind="Call transcript")]
    assert picked == [1, 4]                       # the cover page and management's answer, ahead of the analyst's question (page 3)
    m = P.management_of(CALL)
    assert P.speakers_on(CALL[3], m) == ["A. K. Mehta (CHIEF FINANCIAL OFFICER, management)", "Rohit Shah"]
    assert P.speakers_on(CALL[2], m) == ["Moderator", "Rohit Shah"]                   # an analyst is not management
    assert P.speakers_on(CALL[0], m) == []                                            # letterhead labels are not speakers


async def test_a_transcripts_result_names_management_and_the_speakers_of_each_page(exchange):
    link = "https://nsearchives.nseindia.com/corporate/ZZ_call.pdf"
    exchange.files = {link: CALL}
    feed = [{"kind": "document", "symbol": "ZZ", "title": "ZZ Ltd has informed the Exchange about Transcript", "category": "Analysts/Institutional Investor Meet/Con. Call Updates",
             "date": "2026-11-04", "link": link}]
    r = await T.run(gw_feed({"document": feed}), "read_company_document", {"symbol": "ZZ", "document": "call_transcript", "question": "capex"})
    d = json.loads(r["text"])["data"]
    assert d["management"] == ["A.K. MEHTA (CHIEF FINANCIAL OFFICER)", "RAVI RAO (MANAGING DIRECTOR)"]
    assert any(p.get("speakers") == ["A. K. Mehta (CHIEF FINANCIAL OFFICER, management)", "Rohit Shah"] for p in d["text"])
    assert "Never put words in management's mouth" in r["text"] and "not management's view" in r["text"]


def test_an_annual_reports_main_sections_come_first():
    ar = ["Annual Report 2025-26", "Our people: risk of attrition mentioned in passing", "Management Discussion and Analysis\nRisks and concerns: attrition and wage costs",
          "Notes to the financial statements"]
    picked = [n for n, _ in P.best_pages(ar, "attrition risk", n=2, kind="Annual report")]
    assert picked == [1, 3]


# ------------------------------------------------------------------------------------------------ 5. two documents before the model, and the label the member sees

def test_two_reads_go_to_the_model_as_one_turn_of_calls_and_one_of_results_the_first_keeping_its_id():
    msgs: List[Dict[str, Any]] = [{"role": "user", "content": "q"}]
    service.with_prefetches(msgs, [("read_company_document", {"document": "investor_presentation"}, {"text": "deck", "error": False}),
                                   ("read_company_document", {"document": "call_transcript"}, {"text": "call", "error": True})])
    calls, results = msgs[-2]["content"], msgs[-1]["content"]
    assert [c["id"] for c in calls] == [service.PREFETCH_ID, service.PREFETCH_ID + "_2"]
    assert [(r["tool_use_id"], r["content"], r.get("is_error", False)) for r in results] == [(service.PREFETCH_ID, "deck", False), (service.PREFETCH_ID + "_2", "call", True)]


def test_the_member_sees_which_document_is_being_read():
    assert T.label("read_company_document", {"symbol": "SANSERA", "document": "call_transcript"}) == "Reading the call transcript (SANSERA)"
    assert T.label("read_company_document", {"symbol": "TCS", "document": "results_filing"}) == "Reading the results filing (TCS)"
    assert T.label("read_company_document", {"symbol": "TCS"}) == "Reading the document (TCS)"


def test_the_tool_offers_every_document_kind_and_a_period_and_the_instructions_name_them():
    listing = next(t for t in P.TOOLS if t.name == "read_company_document").listing()["inputSchema"]["properties"]
    assert listing["document"]["enum"] == ["investor_presentation", "annual_report", "call_transcript", "results_filing"] and "period" in listing
    s = service.SYSTEM
    assert "earnings-call transcript, annual report or results filing" in s and "name the speaker as the page shows it" in s
    assert "never present an analyst's question as management's view" in s


def test_no_advice_words_in_the_new_text():
    line = next(x for x in service.SYSTEM.splitlines() if "results filing says" in x)      # the instructions' rule names the words; this line must not
    text = " ".join([*P.KIND_NOTES.values(), line])
    for w in ("buy", "sell", "hold", "accumulate", "multibagger", "top pick"):
        assert not re.search(rf"\b{w}\b", text, re.I), w


# ------------------------------------------------------------------------------------------------ 6. with the real database: one document of each kind kept, annual reports until the next one

from test_ask import FakeClient, ask, enable, pg  # noqa: E402
from test_auth import app, signed_in  # noqa: E402,F401
from test_integration import ingested, make_settings, store  # noqa: E402,F401


@pg
async def test_the_newest_document_of_each_kind_is_kept_per_company_and_an_annual_report_stays_until_the_next(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM document_pages WHERE symbol = 'ZZKEEP'")
    put = docstore.put_pages
    assert await put(store, "https://x/zz_call_old.pdf", "ZZKEEP", "Call transcript", "old", "2026-08-10", ["a"])
    assert await put(store, "https://x/zz_ip.pdf", "ZZKEEP", "Investor presentation", "deck", "2026-08-01", ["b"])
    assert await put(store, "https://x/zz_call_new.pdf", "ZZKEEP", "Call transcript", "new", "2026-11-04", ["c"])
    assert await put(store, "https://x/zz_ar_2023.pdf", "ZZKEEP", "Annual report", "AR 2023", "2023-08-01", ["d"])
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT link, kind FROM document_pages WHERE symbol = 'ZZKEEP' ORDER BY link")
    assert [r["link"] for r in rows] == ["https://x/zz_ar_2023.pdf", "https://x/zz_call_new.pdf", "https://x/zz_ip.pdf"]   # the older call went
    await docstore.prune(store)
    async with store.pool.acquire() as conn:
        left = [r["link"] for r in await conn.fetch("SELECT link FROM document_pages WHERE symbol = 'ZZKEEP' ORDER BY link")]
    assert "https://x/zz_ar_2023.pdf" in left                    # three years old, but the company's newest annual report: kept
    async with store.pool.acquire() as conn:            # an older annual report beside a newer one, both past the window: the older goes
        await conn.execute("INSERT INTO document_pages (link, symbol, kind, filed, pages) VALUES ('https://x/zz_ar_2022.pdf','ZZKEEP','Annual report','2022-08-01','[]')")
        await conn.execute("INSERT INTO document_pages (link, symbol, kind, filed, pages) VALUES ('https://x/zz_call_2024.pdf','ZZKEEP','Call transcript','2024-05-01','[]')")
    await docstore.prune(store)
    async with store.pool.acquire() as conn:
        left = [r["link"] for r in await conn.fetch("SELECT link FROM document_pages WHERE symbol = 'ZZKEEP' ORDER BY link")]
        await conn.execute("DELETE FROM document_pages WHERE symbol = 'ZZKEEP'")
    assert left == ["https://x/zz_ar_2023.pdf", "https://x/zz_call_new.pdf", "https://x/zz_ip.pdf"]


@pg
async def test_a_question_comparing_the_presentation_and_the_call_reads_both_before_the_model_starts(app):  # noqa: F811
    P._texts.clear()
    ip, call = "https://nsearchives.nseindia.com/corporate/ZZTEST_IP254.pdf", "https://nsearchives.nseindia.com/corporate/ZZTEST_call254.pdf"
    st = app.state.store
    async with st.pool.acquire() as conn:
        await conn.execute("DELETE FROM document_pages WHERE symbol = 'ZZTEST'")
        await conn.execute("DELETE FROM feed_items WHERE symbol = 'ZZTEST'")
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, link, item_date, category) VALUES "
                           "('document','Zz Test Ltd has informed the Exchange about Investor Presentation','ZZTEST',$1,'2026-11-05','Investor Presentation'),"
                           "('document','Zz Test Ltd has informed the Exchange about Transcript','ZZTEST',$2,'2026-11-12','Analysts/Institutional Investor Meet/Con. Call Updates')",
                           ip, call)
    assert await docstore.put_pages(st, ip, "ZZTEST", "Investor presentation", "deck", "2026-11-05", ["Zz Test Q2 FY27", "Capex Rs 500 crore for the new plant"])
    assert await docstore.put_pages(st, call, "ZZTEST", "Call transcript", "call", "2026-11-12",
                                    ["MANAGEMENT: MR. Z KUMAR - CHIEF FINANCIAL OFFICER", "Z Kumar: capex will be Rs 550 crore"])
    client = FakeClient([{"text": ["The deck (p.2) says Rs 500 crore; on the call the CFO said Rs 550 crore (p.2)."]}])
    enable(app, client)
    m = await signed_in(app, "p254@example.com", plan="silver")
    try:
        r, ev = await ask(m, "Compare the capex in the presentation and on the call", symbol="ZZTEST")
        assert r.status_code == 200 and ev[-1][0] == "done"
        for d in ("call_transcript", "investor_presentation"):
            assert ("status", {"text": T.label("read_company_document", {"symbol": "ZZTEST", "document": d})}) in ev
        first = client.calls[0]["messages"]
        calls, results = first[-2]["content"], first[-1]["content"]
        assert [c["input"]["document"] for c in calls] == ["call_transcript", "investor_presentation"]
        assert "Rs 550 crore" in results[0]["content"] and "Rs 500 crore" in results[1]["content"]
        assert "Z KUMAR (CHIEF FINANCIAL OFFICER)" in results[0]["content"]
    finally:
        async with st.pool.acquire() as conn:
            await conn.execute("DELETE FROM document_pages WHERE symbol = 'ZZTEST'")
            await conn.execute("DELETE FROM feed_items WHERE symbol = 'ZZTEST'")
