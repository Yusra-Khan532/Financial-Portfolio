"""Task #255 (19 Nov 2026): "chatbot is still not taking investor presentation data. it is using claude api but not fetching the investor presentation data".

Causes found and what must now hold:
  1. The model could answer without reading the document: a question about what a company's own document says (investor presentation, call transcript,
     annual report, its guidance, plans, capex, order book; English and Hinglish) now reads it BEFORE the model starts, as a tool call and its result.
  2. The Documents list can name no presentation (TVSMOTOR's showed only transcripts and meeting notices): the tool then takes the one Discovery read,
     then any stored filing that says "presentation" in 400 days; with none it says plainly what FinLit holds and the window searched.
  3. Reading at question time can fail (the exchange is slow or throttles): the text of every document read (by FinLit AI or the Discovery job) is kept
     and read first. Keeping it never stops the Discovery job.
  4. Pages were picked by exact words: now by stems, a finance synonym list, numbers and years, and highlights pages for a general question.
Claude is a scripted fake (no key, no cost)."""

import asyncio
import json
from types import SimpleNamespace as NS
from typing import Any, Dict, List

import pytest

from finlit.ask import docstore, pages as P, service, tools as T
from finlit.ask import companies as C
from finlit.discovery import service as DS
from finlit.mcp.gateway import ToolError


# ------------------------------------------------------------------------------------------------ 1. which questions read a document first

@pytest.mark.parametrize("q,kind", [
    ("What does Reliance's investor presentation say about Jio?", "investor_presentation"),
    ("TVS Motor ppt kya bolta hai EV ke baare mein", "investor_presentation"),
    ("Sansera latest deck highlights", "investor_presentation"),
    ("What is in the IP of Persistent?", "investor_presentation"),
    ("Reliance capex plans for FY27", "investor_presentation"),
    ("L&T order book and guidance", "investor_presentation"),
    ("What did management say on the Infosys concall?", "call_transcript"),
    ("HDFC Bank earnings call transcript", "call_transcript"),
    ("TCS annual report on attrition", "annual_report"),
])
def test_a_question_about_a_companys_own_document_is_recognised(q, kind):
    assert service.document_intent(q) == kind


@pytest.mark.parametrize("q", ["What is P/E?", "How is TCS doing?", "Prism score of JSW Steel", "what is the ip address of the site", "Show my portfolio"])
def test_other_questions_read_no_document(q):
    assert service.document_intent(q) is None


def test_the_short_names_people_use_resolve_and_a_longer_name_or_the_english_word_wins():
    rows = [["RELIANCE", "Reliance Industries Ltd"], ["RPOWER", "Reliance Power Ltd"], ["TVSMOTOR", "TVS Motor Company Ltd"],
            ["SANSERA", "Sansera Engineering Ltd"], ["LT", "Larsen & Toubro Ltd"], ["SBIN", "State Bank of India"], ["INDIANB", "Indian Bank"]]
    names, syms = C.index_from(rows)
    f = lambda q: C.find(q, names, syms)   # noqa: E731
    assert f("what does reliance investor presentation say") == ["RELIANCE"]
    assert f("tvs ki presentation") == ["TVSMOTOR"] and f("TVS Motor ppt") == ["TVSMOTOR"]
    assert f("Sansera order book") == ["SANSERA"]                      # a first word only one company starts with
    assert f("L&T order book") == ["LT"] and f("SBI presentation") == ["SBIN"]
    assert f("Reliance Power presentation") == ["RPOWER"]                # the full name wins over the short one
    assert f("reliance on imports of crude") == []                       # the English word
    assert f("indian banks outlook") == []                               # a group of companies, never Indian Bank


# a scripted Claude that records what it was sent
class Stream:
    def __init__(self, turn):
        self.turn = turn

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def __aiter__(self):
        async def gen():
            for t in self.turn.get("text", []):
                yield NS(type="text", text=t)
        return gen()

    async def get_final_message(self):
        blocks = [NS(type="text", text="".join(self.turn.get("text", [])))]
        return NS(content=blocks, stop_reason="end_turn", usage=NS(input_tokens=1, output_tokens=1, cache_read_input_tokens=0, cache_creation_input_tokens=0))


class Client:
    def __init__(self, turns):
        self.turns, self.calls = list(turns), []
        self.messages = self

    def stream(self, **params):
        self.calls.append({**params, "messages": list(params["messages"])})
        return Stream(self.turns.pop(0))


async def test_the_documents_text_reaches_the_model_before_its_first_turn_as_a_tool_result_and_counts_as_read():
    msgs = service.build_messages([], "What does the investor presentation say?", "SANSERA", "silver")
    args = {"symbol": "SANSERA", "document": "investor_presentation", "question": "What does the investor presentation say?"}
    service.with_prefetch(msgs, "read_company_document", args, {"text": '{"text": [{"page": 6, "text": "Highest ever quarterly performance"}]}', "error": False})
    client = Client([{"text": ["Sansera's presentation (5 Nov 2026) says p.6: highest ever quarterly performance."]}])
    events: List[tuple] = []

    async def emit(e, d):
        events.append((e, d))
    res = await service.answer(client, "m", NS(), msgs, emit, [("read_company_document", args)])
    first = client.calls[0]["messages"]
    assert first[-2]["role"] == "assistant" and first[-2]["content"][0]["type"] == "tool_use" and first[-2]["content"][0]["name"] == "read_company_document"
    assert first[-1]["content"][0]["type"] == "tool_result" and "Highest ever quarterly performance" in first[-1]["content"][0]["content"]
    assert first[-1]["content"][0]["tool_use_id"] == first[-2]["content"][0]["id"]
    assert res["tools"] == ["read_company_document"] and res["calls"] == [("read_company_document", args)]     # the answer's sources and page links
    assert "toolu_" in service.PREFETCH_ID


def test_the_instructions_say_to_quote_the_page_date_and_link_and_never_that_it_cannot_open_the_presentation():
    s = service.SYSTEM
    assert "Quote what it says with the document, the page number, the date it was filed and its link" in s     # task #254: every document
    assert "never say you cannot open or access it" in s


# ------------------------------------------------------------------------------------------------ 2 and 3: where the document is found, and kept text

class Conn:
    """A tiny in-memory stand-in for the three tables the tool reads (document_pages, discovery_companies, feed_items)."""

    def __init__(self, db):
        self.db = db

    async def fetchval(self, sql, link):
        r = self.db["pages"].get(link)
        return json.dumps(r["pages"]) if r else None

    async def fetchrow(self, sql, sym, *a):
        if "discovery_companies" in sql:
            return self.db["discovery"].get(sym)
        rows = [r for r in self.db["feed"] if r["symbol"] == sym and "presentation" in (r["category"] + " " + r["title"]).lower()]
        return rows[0] if rows else None

    async def fetch(self, sql, sym, *a):
        return [r for r in self.db["feed"] if r["symbol"] == sym]

    async def execute(self, sql, *a):
        if self.db.get("fail_write"):
            raise RuntimeError("disk full")
        if sql.startswith("INSERT INTO document_pages"):
            self.db["pages"][a[0]] = {"symbol": a[1], "kind": a[2], "title": a[3], "filed": a[4], "pages": json.loads(a[5])}
        return "DELETE 0"


class Pool:
    def __init__(self, db):
        self.db = db

    def acquire(self):
        db = self.db

        class Ctx:
            async def __aenter__(self):
                return Conn(db)

            async def __aexit__(self, *a):
                return False
        return Ctx()


def gw_with(feed_items: List[Dict[str, Any]], db: Dict[str, Any]):
    store = NS(pool=Pool(db))

    class G:
        app = NS(state=NS(store=store))

        async def json(self, path, params=None, **kw):
            assert path == "/api/feed"
            return {"items": feed_items}
    return G()


def empty_db(**kw):
    return {"pages": {}, "discovery": {}, "feed": [], **kw}


def no_exchange(monkeypatch, got: list):
    class Fetcher:
        def __init__(self, **kw):
            pass

        async def pdf(self, url, cap=None):
            got.append(url)
            raise AssertionError("the exchange must not be asked")

        async def aclose(self):
            pass
    monkeypatch.setattr("finlit.earnings.transcripts.Fetcher", Fetcher)


TVS_FEED = [{"kind": "document", "symbol": "TVSMOTOR", "title": "TVS Motor Company Limited has informed the Exchange about Transcript",
             "category": "Analysts/Institutional Investor Meet/Con. Call Updates", "date": "2026-11-04", "link": "https://nsearchives.nseindia.com/x_trans.pdf"},
            {"kind": "document", "symbol": "TVSMOTOR", "title": "TVS Motor Company Limited has informed the Exchange about Schedule of meet",
             "category": "Analysts/Institutional Investor Meet/Con. Call Updates", "date": "2026-10-21", "link": "https://nsearchives.nseindia.com/x_meet.pdf"}]
IP_LINK = "https://nsearchives.nseindia.com/corporate/TVSMOTOR_IP.pdf"


async def test_when_the_documents_list_names_no_presentation_the_one_discovery_read_is_used_and_its_kept_text_is_read_without_the_exchange(monkeypatch):
    P._texts.clear()
    got: list = []
    no_exchange(monkeypatch, got)
    db = empty_db(discovery={"TVSMOTOR": {"doc_title": "Investor Presentation Q2 FY27", "doc_date": "2026-10-28", "doc_link": IP_LINK}},
                  pages={IP_LINK: {"pages": ["TVS Motor Q2 FY27", "Highlights: record revenue", "EV: iQube volumes up 40%", "Capex Rs 1,200 cr"]}})
    r = await T.run(gw_with(TVS_FEED, db), "read_company_document", {"symbol": "TVSMOTOR", "question": "What about electric vehicles and capital expenditure?"})
    assert not r["error"]
    out = json.loads(r["text"])
    d = out["data"]
    assert d["link"] == IP_LINK and d["filed"] == "2026-10-28" and d["read"] == "kept" and got == []
    texts = {p["page"]: p["text"] for p in d["text"]}
    assert 1 in texts and 3 in texts and 4 in texts                      # "electric vehicles" finds "EV"; "capital expenditure" finds "Capex"
    assert "Discovery" in out["source"]


async def test_then_any_stored_filing_that_says_presentation_and_a_download_is_kept_for_next_time(monkeypatch):
    P._texts.clear()
    from test_ask_pages import tiny_pdf
    got: list = []

    class Fetcher:
        def __init__(self, **kw):
            pass

        async def pdf(self, url, cap=None):
            got.append(url)
            return tiny_pdf(["Cover", "Order book Rs 5,000 cr"])

        async def aclose(self):
            pass
    monkeypatch.setattr("finlit.earnings.transcripts.Fetcher", Fetcher)
    db = empty_db(feed=[{"symbol": "TVSMOTOR", "title": "Investor Presentation", "category": "", "item_date": "2026-09-01", "link": IP_LINK}])
    r = await T.run(gw_with(TVS_FEED, db), "read_company_document", {"symbol": "TVSMOTOR", "question": "orders"})
    d = json.loads(r["text"])["data"]
    assert got == [IP_LINK] and d["read"] == "exchange" and d["filed"] == "2026-09-01"
    assert db["pages"][IP_LINK]["pages"][1].startswith("Order book") and db["pages"][IP_LINK]["kind"] == "Investor presentation"   # kept
    P._texts.clear()
    r2 = await T.run(gw_with(TVS_FEED, db), "read_company_document", {"symbol": "TVSMOTOR"})
    assert json.loads(r2["text"])["data"]["read"] == "kept" and got == [IP_LINK]    # the second time: no exchange


async def test_with_no_presentation_anywhere_it_says_what_finlit_holds_and_the_window_searched(monkeypatch):
    P._texts.clear()
    no_exchange(monkeypatch, [])
    r = await T.run(gw_with(TVS_FEED, empty_db()), "read_company_document", {"symbol": "TVSMOTOR"})
    out = json.loads(r["text"])
    assert out["data"]["found"] is False and out["data"]["held"] == ["Call transcript", "Other filing"]
    note = out["notes"][0]
    assert "no investor presentation for TVSMOTOR filed in the last 400 days" in note and "Call transcript" in note


async def test_a_page_text_that_cannot_be_kept_never_stops_an_answer(monkeypatch):
    P._texts.clear()
    from test_ask_pages import tiny_pdf

    class Fetcher:
        def __init__(self, **kw):
            pass

        async def pdf(self, url, cap=None):
            return tiny_pdf(["Cover", "Guidance: 15% growth"])

        async def aclose(self):
            pass
    monkeypatch.setattr("finlit.earnings.transcripts.Fetcher", Fetcher)
    db = empty_db(discovery={"TVSMOTOR": {"doc_title": "IP", "doc_date": "2026-10-28", "doc_link": IP_LINK}}, fail_write=True)
    r = await T.run(gw_with(TVS_FEED, db), "read_company_document", {"symbol": "TVSMOTOR", "question": "outlook"})
    assert not r["error"] and "Guidance: 15% growth" in r["text"]


# ------------------------------------------------------------------------------------------------ 3. the Discovery job keeps the text and never stops for it

async def test_the_discovery_job_keeps_each_presentations_text_and_a_failure_to_keep_it_never_stops_the_run(monkeypatch):
    db = empty_db()
    store = NS(pool=Pool(db), redis=NS(set=lambda *a, **k: asyncio.sleep(0)))
    docs = [{"symbol": "AAA", "company": "A", "title": "IP", "item_date": "2026-11-01", "link": "https://nsearchives.nseindia.com/a.pdf"},
            {"symbol": "BBB", "company": "B", "title": "IP", "item_date": "2026-11-02", "link": "https://nsearchives.nseindia.com/b.pdf"}]

    async def tag_new(s):
        return {}

    async def pending(s, limit=None):
        return list(docs)

    saved = []

    async def save(s, doc, result, n):
        saved.append(doc["symbol"])

    async def read_one(f, link, keep=None):
        if keep is not None:
            keep[:] = [f"text of {link}", "page 2"]
        return {"status": "ok"}, 2

    class F:
        async def aclose(self):
            pass
    monkeypatch.setattr(DS.S, "tag_new", tag_new)
    monkeypatch.setattr(DS, "pending", pending)
    monkeypatch.setattr(DS, "save", save)
    monkeypatch.setattr(DS, "read_one", read_one)
    res = await DS.run(store, fetcher=F())
    assert saved == ["AAA", "BBB"] and res["textsKept"] == 2 and set(db["pages"]) == {d["link"] for d in docs}
    db["pages"].clear()
    db["fail_write"] = True                                              # the table cannot be written: the run still reads and saves every company
    saved.clear()
    res = await DS.run(store, fetcher=F())
    assert saved == ["AAA", "BBB"] and res["textsKept"] == 0 and res["read"] == 2


async def test_read_one_hands_the_page_texts_to_the_job(monkeypatch):
    from test_ask_pages import tiny_pdf

    class F:
        async def pdf(self, url, cap=None):
            return tiny_pdf(["Cover page", "Solar modules 2 GW capacity"])
    keep: List[str] = []
    result, n = await DS.read_one(F(), "https://nsearchives.nseindia.com/x.pdf", keep)
    assert n == 2 and len(keep) == 2 and "Solar modules" in keep[1]


# ------------------------------------------------------------------------------------------------ 4. pages by meaning

DECK = ["Company X Investor Presentation Q2 FY27", "Q2 FY27 highlights: revenue up 18%", "Segments: auto 60%, non-auto 40%",
        "Electric vehicles: two new models", "Capital expenditure of Rs 2,000 crore over FY27-FY28", "Order inflows of Rs 900 crore",
        "Borrowings reduced to Rs 300 crore", "Plant at Hosur commissioned", "Board of directors"]


@pytest.mark.parametrize("q,want", [
    ("What about EV plans?", 4), ("capex for next year", 5), ("order book", 6), ("debt levels", 7), ("new capacity", 8),
    ("sales growth", 2), ("FY27 investments", 5)])
def test_a_page_is_found_by_meaning_not_only_by_the_exact_word(q, want):
    nums = [n for n, _ in P.best_pages(DECK, q)]
    assert nums[0] == 1 and want in nums


def test_a_general_question_takes_the_highlights_first_and_the_cover_and_stays_within_the_limit():
    nums = [n for n, _ in P.best_pages(DECK, "What does the investor presentation say?")]
    assert nums[:2] == [1, 2]
    big = ["x " * 4000] * 20
    assert sum(len(t) for _, t in P.best_pages(big, "what does it say", chars=9000)) <= 9000
    assert len(P.best_pages(big, "what does it say")) <= 6


def test_plurals_and_verb_forms_match():
    assert P._doc_stem("orders") == "order" and P._doc_stem("expanding") == "expand" and P._doc_stem("companies") == "company"


async def test_docstore_is_silent_without_a_database():
    assert await docstore.get_pages(None, "x") is None and await docstore.put_pages(None, "x", "A", "k", None, None, ["a"]) is False
    assert await docstore.discovery_presentation(None, "A") is None and await docstore.prune(None) == 0
    assert docstore.store_of(NS()) is None
    with pytest.raises(ToolError):
        await P._locate(NS(json=_raise), "A", "Investor presentation", None)


async def _raise(*a, **k):
    raise ToolError("down")


# ------------------------------------------------------------------------------------------------ 1, end to end: the real endpoint, database and member

from test_ask import FakeClient, ask, enable, pg  # noqa: E402
from test_auth import app, signed_in  # noqa: E402,F401
from test_integration import ingested, make_settings, store  # noqa: E402,F401


@pg
async def test_on_a_company_page_a_presentation_question_reads_the_kept_presentation_before_the_model_starts(app):  # noqa: F811
    P._texts.clear()
    link = "https://nsearchives.nseindia.com/corporate/ZZTEST_IP.pdf"
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM document_pages WHERE link = $1", link)
        await conn.execute("INSERT INTO discovery_companies (symbol, company, doc_title, doc_date, doc_link, status) VALUES ('ZZTEST','Zz Test Ltd',"
                           "'Investor Presentation Q2 FY27','2026-11-05',$1,'ok') ON CONFLICT (symbol) DO UPDATE SET doc_link=$1, doc_date='2026-11-05'", link)
    assert await docstore.put_pages(app.state.store, link, "ZZTEST", "Investor presentation", "Investor Presentation Q2 FY27", "2026-11-05",
                                    ["Zz Test Q2 FY27", "Highlights: highest ever quarterly revenue", "Board"])
    client = FakeClient([{"text": ["Its presentation of 5 Nov 2026 says (p.2) revenue was the highest ever."]}])
    enable(app, client)
    m = await signed_in(app, "p255@example.com", plan="silver")
    try:
        r, ev = await ask(m, "What does the investor presentation say?", symbol="ZZTEST")
        assert r.status_code == 200 and ev[-1][0] == "done"
        assert ("status", {"text": T.label("read_company_document", {"symbol": "ZZTEST", "document": "investor_presentation"})}) in ev   # "Reading the investor presentation"
        first = client.calls[0]["messages"]
        assert first[-2]["content"][0]["name"] == "read_company_document"
        res = first[-1]["content"][0]
        assert res["type"] == "tool_result" and "highest ever quarterly revenue" in res["content"]
        assert link in res["content"] and "2026-11-05" in res["content"]
        assert "read_company_document" in ev[-1][1]["sources"]
    finally:
        async with app.state.store.pool.acquire() as conn:
            await conn.execute("DELETE FROM discovery_companies WHERE symbol = 'ZZTEST'")
            await conn.execute("DELETE FROM document_pages WHERE link = $1", link)


@pg
async def test_a_question_that_names_no_company_reads_no_document(app):  # noqa: F811
    client = FakeClient([{"text": ["A presentation is a company's slide deck for investors."]}])
    enable(app, client)
    m = await signed_in(app, "p255b@example.com", plan="silver")
    r, ev = await ask(m, "What is an investor presentation?")
    assert r.status_code == 200
    assert not any(isinstance(msg.get("content"), list) for msg in client.calls[0]["messages"])     # no tool result before the model
