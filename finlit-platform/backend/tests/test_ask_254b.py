"""Task #254 rework (19 Nov 2026). The team showed two live answers: "how to see key red flags in business model of hdfc bank" (the AI said it could
not read the bank's figures, called the stored 17 Oct "presentation" a cover letter, used sales growth for a bank and told the member to go and look
for GNPA and NIM) and "what is issue with pricol" (twice "FinLit AI could not answer just now"). And the owner's rules of the same day: a company
question is answered from the investor presentation, then the results, then the earnings call, then news and the team's sites, then FinLit's company
report, then any other FinLit page; every kind of question is read for its type; answers are short explanatory prose, each figure with its source and
date. No model, no network: the model is stubbed and the exchange is never asked."""
from __future__ import annotations

from types import SimpleNamespace as NS
from typing import Any, Dict, List

import anthropic
import httpx
import pytest

from finlit.ask import pages as P, routing, service, tools as T

LETTER = ["Regd. Office: HDFC Bank Limited, HDFC Bank House, Senapati Bapat Marg, Lower Parel (West), Mumbai 400 013. Ref. No. SE/2026-27/129 "
          "October 17, 2026. BSE Limited, National Stock Exchange of India Limited, Dept of Corporate Services, The Listing Department. Dear Sir, "
          "Pursuant to Regulation 30 of the SEBI Listing Regulations, please find attached the presentation, also available at "
          "https://www.hdfc.bank.in/about-us/investor-relations . Kindly take the same on record. Yours faithfully, Company Secretary"]
DECK = ["Listing Department, NSE. Please find enclosed the investor presentation. Yours faithfully, Company Secretary",
        "Q2 FY27 highlights: net interest income Rs 31,500 crore, NIM 3.4%", "Asset quality: GNPA 1.42%, NNPA 0.47%, PCR 67%",
        "Deposits grew 15%; CASA ratio 34%", "Capital adequacy (CRAR) 19.6%, CET1 16.8%", "Advances grew 9%"]


# ------------------------------------------------------------------------------------------------ 1. a covering letter is never "the presentation"


def test_a_covering_letter_is_told_apart_from_a_deck_that_starts_with_one():
    assert P.is_cover_letter(LETTER)                      # HDFC Bank's "presentation" of 17 Oct 2026: one page to the Listing Department
    assert not P.is_cover_letter(DECK)                    # a letter, then the slides (Pricol's 19 Nov presentation: 11 pages)
    assert not P.is_cover_letter(["Q2 FY27 highlights: revenue up 12%"])     # a short deck without letter words
    assert P.letter_links(LETTER) == ([], ["https://www.hdfc.bank.in/about-us/investor-relations"])
    assert P.letter_links(["The deck: https://investor.example.com/q2fy27.pdf and https://nsearchives.nseindia.com/x.pdf"])[0] == \
        ["https://investor.example.com/q2fy27.pdf"]                          # the exchange's own links are not the company's site


class Fetcher:
    """The exchange and the company's site: a tiny PDF per link."""
    files: Dict[str, List[str]] = {}
    asked: List[str] = []

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
    Fetcher.files, Fetcher.asked = {}, []
    monkeypatch.setattr("finlit.earnings.transcripts.Fetcher", Fetcher)
    return Fetcher


def gw_feed(items: List[Dict[str, Any]]):
    class G:
        app = NS(state=NS(store=None))

        async def json(self, path, params=None, **kw):
            return {"items": [i for i in items if i.get("symbol") == params.get("symbol") and i.get("kind", "document") == params.get("kind")]}
    return G()


def doc(link, date, title="HDFC Bank Limited has informed the Exchange about Presentation", cat="Investor Presentation"):
    return {"kind": "document", "symbol": "HDFCBANK", "title": title, "link": link, "date": date, "category": cat}


A = "https://nsearchives.nseindia.com/corporate/HDFCBANK_letter.pdf"


async def test_a_letter_with_the_deck_filed_the_same_day_reads_the_deck(exchange):
    deck = "https://nsearchives.nseindia.com/corporate/HDFCBANK_deck.pdf"
    exchange.files = {A: LETTER, deck: DECK}
    r = await T.run(gw_feed([doc(A, "2026-10-17"), doc(deck, "2026-10-17", "Investor Presentation Q2 FY27")]), "read_company_document",
                    {"symbol": "HDFCBANK", "question": "asset quality GNPA"})
    assert not r["error"] and "GNPA 1.42%" in r["text"] and "only a covering letter" in r["text"]
    assert '"link":"' + deck in r["text"]


async def test_a_letter_that_links_a_pdf_on_the_company_site_reads_that_file(exchange):
    site = "https://www.hdfc.bank.in/content/dam/q2fy27-presentation.pdf"
    exchange.files = {A: [LETTER[0].replace("https://www.hdfc.bank.in/about-us/investor-relations", site)], site: DECK}
    r = await T.run(gw_feed([doc(A, "2026-10-17")]), "read_company_document", {"symbol": "HDFCBANK", "question": "NIM CASA"})
    assert not r["error"] and "CASA ratio 34%" in r["text"] and site in exchange.asked
    assert "the file on the company's own site" in r["text"]


async def test_a_letter_falls_back_to_the_next_newest_presentation(exchange):
    old = "https://nsearchives.nseindia.com/corporate/HDFCBANK_july.pdf"
    exchange.files = {A: LETTER, old: DECK}
    r = await T.run(gw_feed([doc(A, "2026-10-17"), doc(old, "2026-07-19")]), "read_company_document", {"symbol": "HDFCBANK", "question": "NIM"})
    assert not r["error"] and "NIM 3.4%" in r["text"] and "2026-07-19" in r["text"] and "only a covering letter" in r["text"]


async def test_when_every_filing_is_a_letter_the_answer_says_so_and_points_to_the_results_and_the_call(exchange):
    exchange.files = {A: LETTER}
    r = await T.run(gw_feed([doc(A, "2026-10-17")]), "read_company_document", {"symbol": "HDFCBANK", "question": "red flags"})
    assert not r["error"]
    assert '"coverLetterOnly":true' in r["text"] and '"text":[]' in r["text"]
    for must in ("only the company's covering letter", "Never call this letter the presentation", "results filing", "call transcript",
                 "https://www.hdfc.bank.in/about-us/investor-relations"):
        assert must in r["text"], must


# ------------------------------------------------------------------------------------------------ 2. banks are read for their own measures


def test_a_bank_question_finds_the_pages_with_its_own_measures():
    picked = [n for n, _ in P.best_pages(DECK, f"red flags in the business model {P.BANK_TERMS}", n=3, chars=9000)]
    assert 3 in picked and (4 in picked or 5 in picked)          # asset quality and CASA / capital pages, not just the cover
    assert P.best_pages(DECK, "slippage and credit cost", n=2)[1][0] == 3


@pytest.mark.parametrize("card,bank", [
    ('{"classification":{"macroSector":"Financial Services","sector":"Financial Services","industry":"Banks","basicIndustry":"Private Sector Bank"}}', True),
    ('{"classification":{"sector":"Financial Services","industry":"Finance","basicIndustry":"Non Banking Financial Company (NBFC)"}}', True),
    ('{"classification":{"industry":"Insurance","basicIndustry":"Life Insurance"}}', True),
    ('{"classification":{"macroSector":"Consumer Discretionary","industry":"Auto Components","basicIndustry":"Auto Components & Equipments"}}', False),
    (None, False)])
def test_banks_nbfcs_and_insurers_are_known_from_the_company_card(card, bank):
    assert service.bank_like(card) is bank


def test_the_instructions_never_call_a_banks_income_sales_and_name_its_measures():
    s = service.SYSTEM
    for must in ('Never call a bank\'s income "sales"', "GNPA and NNPA", "net interest margin", "CASA ratio", "CRAR", "credit cost"):
        assert must in s, must


# ------------------------------------------------------------------------------------------------ 3. the owner's order of sources, and the kinds of question


def test_a_company_question_reads_the_presentation_then_the_results_then_the_call():
    assert service.COMPANY_DOCS == ["investor_presentation", "results_filing", "call_transcript"]
    kinds = routing.classify("how to see key red flags in business model of hdfc bank", named_company=True)
    assert kinds == ["company"]
    assert service.company_documents("how to see key red flags in business model of hdfc bank", kinds) == service.COMPANY_DOCS
    assert service.company_documents("HDFC Bank annual report risk factors", ["company"]) == service.COMPANY_DOCS + ["annual_report"]
    assert service.company_documents("What is ROCE?", ["concept"]) == []          # no company, nothing read
    assert service.ISSUE_WORDS.search("red flags in business model") and service.ISSUE_WORDS.search("what is issue with pricol")


@pytest.mark.parametrize("q,named,page,kinds", [
    ("what is issue with pricol", True, False, ["company"]),                   # it was ["concept"]: the web search kept to the glossary sites
    ("how to see key red flags in business model of hdfc bank", True, False, ["company"]),
    ("TCS ka profit", True, False, ["company", "financials"]),
    ("Why did Infosys fall today?", True, False, ["company", "news"]),
    ("what are the risks here?", False, True, ["company"]),                    # on a company's page
    ("What is ROCE?", False, True, ["concept"]),                               # a meaning, even on a company's page
    ("repo rate kya hai", False, False, ["economy"]),
    ("Which small cap funds have the lowest expense ratio?", False, False, ["funds"]),
    ("new SEBI rules on F&O", False, False, ["regulation"]),
    ("DCF valuation method", False, False, ["valuation"]),
    ("auto sector sales this month", False, False, ["sector:auto"]),
    ("aaj market kyu gira", False, False, ["news"]),
])
def test_every_question_is_read_for_its_type(q, named, page, kinds):
    assert routing.classify(q, named_company=named, on_company_page=page) == kinds


def test_the_note_and_the_instructions_name_the_order_and_the_prose_rule():
    note = routing.note(["company"])
    assert note.index("investor presentation") < note.index("results") < note.index("earnings calls") < note.index("news") < note.index("company report")
    assert "Moneycontrol" in note and "The web search keeps to these sites." in note
    assert routing.web_domains(["company", "financials"]) == routing.COMPANY_SITES          # still one kind: the company
    assert routing.web_domains(["company", "economy"]) is None                              # two kinds: an open search
    s = service.SYSTEM
    for must in ("(1) the company's investor presentation, (2) its results", "(3) its earnings calls", "(4) news and the web pages",
                 "(5) FinLit's company report", "(6) any other FinLit page", "short paragraphs of 2 to 4 sentences", "Few or no bullet points",
                 "Every figure carries its source and date in the sentence", "Never send the member to \"go and check\"", "only a covering letter"):
        assert must in s, must
    assert "at most 4 short bullet points" not in s and "Under 90 words" not in s


# ------------------------------------------------------------------------------------------------ 4. "what is issue with pricol": never "could not answer"


def refused(msg="allowed_domains: Domains not accessible to our user agent: investopedia.com"):
    return anthropic.BadRequestError(msg, response=httpx.Response(400, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")), body=None)


class PickyClient:
    """The provider: refuses a request whose web search keeps to some sites (rule 'domains'), or any request with the web search (rule 'web')."""

    def __init__(self, rule: str, text: str = "Pricol's Q2 FY27 presentation (19 Nov 2026, p.4) says ..."):
        self.rule, self.text, self.calls = rule, text, []
        self.messages = self

    def stream(self, **params):
        self.calls.append(params)
        web = [t for t in params["tools"] if t.get("name") == "web_search"]
        if (self.rule == "domains" and web and web[0].get("allowed_domains")) or (self.rule in ("web", "always") and web) or self.rule == "always":
            raise refused()
        from test_ask import FakeStream
        return FakeStream({"text": [self.text]})


def company_messages():
    return service.build_messages([], "what is issue with pricol", None, "gold", '{"symbol":"PRICOLLTD"}', routing.note(["company"]))


async def run(client, domains):
    events: List[tuple] = []

    async def emit(e, d):
        events.append((e, d))
    from test_ask import FakeGateway
    res = await service.answer(client, "m", FakeGateway({}), company_messages(), emit, None, domains)
    return res, events


async def test_the_pricol_failure_a_refused_kept_to_search_is_asked_again_with_an_open_search():
    c = PickyClient("domains")
    res, _ = await run(c, routing.web_domains(["company"]))
    assert res["text"].startswith("Pricol's Q2 FY27 presentation") and res["stop"] == "end_turn"
    assert c.calls[0]["tools"][-1].get("allowed_domains") and not c.calls[1]["tools"][-1].get("allowed_domains")


async def test_a_refused_web_search_is_dropped_and_the_answer_written_from_what_was_read():
    c = PickyClient("web")
    res, _ = await run(c, routing.web_domains(["company"]))
    assert res["text"] and len(c.calls) == 3 and not any(t.get("name") == "web_search" for t in c.calls[2]["tools"])


async def test_a_request_refused_for_another_reason_still_reaches_the_caller():
    with pytest.raises(anthropic.BadRequestError):
        await run(PickyClient("always"), None)


# ------------------------------------------------------------------------------------------------ 5. end to end, with the real database

from test_ask import FakeClient, ask, enable, pg  # noqa: E402
from test_auth import app, signed_in  # noqa: E402,F401
from test_integration import ingested, make_settings, store  # noqa: E402,F401


@pg
async def test_a_red_flags_question_reads_presentation_results_call_prism_and_ownership_first_in_that_order(app):  # noqa: F811
    from finlit.ask import docstore
    P._texts.clear()
    ip = "https://nsearchives.nseindia.com/corporate/ZZRF_IP.pdf"
    res = "https://nsearchives.nseindia.com/corporate/ZZRF_RES.pdf"
    call = "https://nsearchives.nseindia.com/corporate/ZZRF_CALL.pdf"
    st = app.state.store
    async with st.pool.acquire() as conn:
        await conn.execute("DELETE FROM document_pages WHERE symbol = 'ZZRF'")
        await conn.execute("DELETE FROM feed_items WHERE symbol = 'ZZRF'")
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, link, item_date, category) VALUES "
                           "('document','Zz Rf Ltd has informed the Exchange about Investor Presentation','ZZRF',$1,'2026-11-05','Investor Presentation'),"
                           "('result','Zz Rf Limited has submitted to the Exchange, the financial results for the period ended September 30, 2026','ZZRF',$2,"
                           "'2026-11-04','Outcome of Board Meeting'),"
                           "('document','Zz Rf Ltd has informed the Exchange about Transcript','ZZRF',$3,'2026-11-12','Analysts/Institutional Investor Meet/Con. Call Updates')",
                           ip, res, call)
    assert await docstore.put_pages(st, ip, "ZZRF", "Investor presentation", "deck", "2026-11-05", ["Zz Rf Q2 FY27", "Margin pressure from raw material costs"])
    assert await docstore.put_pages(st, res, "ZZRF", "Results filing", "results", "2026-11-04", ["Statement of results", "Profit fell 18%"])
    assert await docstore.put_pages(st, call, "ZZRF", "Call transcript", "call", "2026-11-12",
                                    ["MANAGEMENT: MR. Z RAO - CHIEF FINANCIAL OFFICER", "Z Rao: demand from exports was weak this quarter"])
    client = FakeClient([{"text": ["Zz Rf's Q2 FY27 presentation (5 Nov 2026, p.2) names margin pressure from raw material costs."]}])
    enable(app, client)
    m = await signed_in(app, "rf254@example.com", plan="gold")
    try:
        r, ev = await ask(m, "what are the red flags here?", symbol="ZZRF")
        assert r.status_code == 200 and ev[-1][0] == "done"
        first = client.calls[0]["messages"]
        calls, results = first[-2]["content"], first[-1]["content"]
        assert [(c["name"], c["input"].get("document") or c["input"].get("section")) for c in calls] == [
            ("read_company_document", "investor_presentation"), ("read_company_document", "results_filing"),
            ("read_company_document", "call_transcript"), ("get_finlit_prism", None), ("get_company_section", "ownership_insights")]
        assert all(c["input"].get("max_chars") == service.COMPANY_DOC_CHARS for c in calls[:3])
        assert "Margin pressure" in results[0]["content"] and "Profit fell 18%" in results[1]["content"] and "exports was weak" in results[2]["content"]
        assert "answer in this order of sources" in first[-3]["content"]               # the note with the question names the order
    finally:
        async with st.pool.acquire() as conn:
            await conn.execute("DELETE FROM document_pages WHERE symbol = 'ZZRF'")
            await conn.execute("DELETE FROM feed_items WHERE symbol = 'ZZRF'")


@pg
async def test_the_company_list_failing_never_fails_the_answer_and_an_unknown_company_still_gets_an_answer(app, monkeypatch):  # noqa: F811
    from finlit.ask import companies

    async def broken(*a, **k):
        raise RuntimeError("the search index could not be read")
    monkeypatch.setattr(companies, "named_in", broken)
    client = FakeClient([{"text": ["FinLit holds no listed company called Zqxwy; if it is listed under another name, say which."]}])
    enable(app, client)
    m = await signed_in(app, "unk254@example.com", plan="silver")
    r, ev = await ask(m, "what is issue with zqxwy industries")
    assert r.status_code == 200 and ev[-1][0] == "done" and not any(e == "error" for e, _ in ev)


@pg
async def test_the_pricol_question_end_to_end_answers_even_when_the_provider_refuses_the_kept_to_search(app):  # noqa: F811
    client = PickyClient("domains", "Pricol's results (filed 5 Nov 2026) show ...")
    enable(app, client)
    m = await signed_in(app, "pricol254@example.com", plan="gold")
    r, ev = await ask(m, "what is issue with pricol")
    assert r.status_code == 200 and ev[-1][0] == "done" and not any(e == "error" for e, _ in ev)
    assert any(e == "text" and "Pricol's results" in d["text"] for e, d in ev)
