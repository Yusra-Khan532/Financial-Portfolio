"""FinLit AI reads FinLit's own pages (task #218): Superinvestor portfolios, India economy, Glossary, Insights & blog, News & filings, Documents (and the
text of an investor presentation), the Basic and Advanced score screeners; and every answer links the FinLit pages it read.

No database and no model here: the routes answer with copies of the live site's own answers (tests/fixtures/ask_pages, saved 18 Nov 2026) through a
fake gateway, and the PDF reader gets a small real PDF. The member's plan is the route's business (the gateway calls the routes as the member)."""

import json
from pathlib import Path
from typing import Any, Dict

import pytest

from finlit.ask import pages as P, service, tools as T
from finlit.mcp.gateway import ToolError

FIX = Path(__file__).parent / "fixtures" / "ask_pages"
load = lambda n: json.loads((FIX / n).read_text(encoding="utf-8"))   # noqa: E731


class Gw:
    def __init__(self, answers: Dict[str, Any]):
        self.answers, self.calls = answers, []

    async def json(self, path, params=None, *, method="GET", body=None, subject="That"):
        self.calls.append((path, params))
        a = self.answers.get(path)
        if callable(a):
            a = a(params or {})
        if isinstance(a, Exception):
            raise a
        if a is None:
            raise ToolError(f"{subject} was not found in FinLit's data.")
        return a


async def run(gw, name, args):
    r = await T.run(gw, name, args)
    return r, (json.loads(r["text"]) if not r["error"] else None)


# ------------------------------------------------------------------------------------------------ the tools are offered, in a fixed order
def test_every_page_of_the_task_has_a_tool_and_they_stay_in_one_fixed_order():
    names = [d["name"] for d in T.definitions()]
    for n in ("get_company_card", "get_finlit_prism", "screen_stocks", "screen_by_finlit_score", "get_superinvestors", "get_my_portfolio",
              "get_india_economy", "get_fii_dii_flows", "get_results_calendar", "lookup_glossary", "get_insights_and_blogs", "get_news_and_filings",
              "read_company_document"):
        assert n in names, n
    assert names == [d["name"] for d in T.definitions()] and names[-1] == "web_search"     # the cached prefix stays the same
    for t in P.TOOLS:
        assert t.name in T.DOING and T.label(t.name, {}) != "Reading FinLit data"


def test_the_instructions_send_each_page_question_to_its_tool_before_the_web():
    s = service.SYSTEM
    for words in ("Superinvestor portfolios", "India economy", "Glossary", "Insights & blog", "Documents", "investor presentation", "read_company_document",
                  "Basic stock screener", "Advanced stock screener", "Use FinLit's page before the web"):
        assert words in s, words


# ------------------------------------------------------------------------------------------------ Superinvestor portfolios
async def test_superinvestors_list_largest_first_and_one_investor_by_any_spelling_of_the_name():
    si = load("superinvestors.json")
    one = {"key": si["investors"][1]["key"], "holdings": [{"symbol": "TITAN", "pct": 5.1}]}
    gw = Gw({"/api/superinvestors": si, f"/api/superinvestors/{si['investors'][1]['key']}": one})
    _, out = await run(gw, "get_superinvestors", {"limit": 5})
    vals = [i["valueCr"] for i in out["data"]["investors"]]
    assert len(vals) == 5 and vals == sorted(vals, reverse=True) and "superinvestors" in out["source"]
    name = si["investors"][1]["name"]                                    # e.g. "Rekha Jhunjhunwala"
    _, out = await run(gw, "get_superinvestors", {"investor": name.lower()})
    assert out["data"]["investor"] == name and out["data"]["portfolio"]["holdings"][0]["symbol"] == "TITAN"
    _, out = await run(gw, "get_superinvestors", {"investor": "Nobody Atall"})
    assert out["data"]["found"] is False and out["notes"]


async def test_superinvestors_for_a_plan_without_them_says_which_plan_has_them():
    gw = Gw({"/api/superinvestors": load("superinvestors.json"), "/api/superinvestors/rekha-jhunjhunwala":
             ToolError("Superinvestor portfolios are part of the Silver and Gold plans. It is not available through this free server.")})
    r = await T.run(gw, "get_superinvestors", {"investor": "Rekha Jhunjhunwala"})
    assert r["error"] and "Silver and Gold" in r["text"]


# ------------------------------------------------------------------------------------------------ India economy
async def test_india_economy_gives_each_reading_with_its_period_and_publisher_not_the_long_histories():
    m = load("macro.json")
    _, out = await run(Gw({"/api/macro": m}), "get_india_economy", {})
    d = out["data"]
    cpi = next(c for c in d["headline"] if c["key"] == "cpi")
    assert cpi["value"] == m["cards"][0]["value"] and cpi["period"] and cpi["source"] == "MoSPI" and "spark" not in cpi
    assert d["policyAndFx"]["rates"]["repo"] == m["rates"]["rates"]["repo"] and len(d["recentRateDecisions"]) <= 4
    food = next(g for g in d["cpiBySpendingGroup"] if g["group"] == "Food and beverages")
    assert food["latest"] == m["cpiDivisions"][0]["points"][-1][1] and food["month"]
    assert not out["truncated"] and out["asOf"] == m["updatedAt"]


# ------------------------------------------------------------------------------------------------ Glossary
@pytest.mark.parametrize("q, want", [("ROCE", "Return on Capital Employed (ROCE)"), ("finlit prism", "FinLit Prism"), ("Mutual Fund Score", "Mutual Fund Score")])
async def test_glossary_answers_in_the_glossarys_own_words(q, want):
    _, out = await run(Gw({}), "lookup_glossary", {"term": q})
    terms = out["data"]["terms"]
    if want:
        assert terms[0]["term"] == want and terms[0]["meaning"] and "glossary" in out["source"].lower()
    else:
        assert terms and "fundpulse" in json.dumps(terms[0]).lower()


async def test_a_term_the_glossary_does_not_hold_is_said_plainly():
    _, out = await run(Gw({}), "lookup_glossary", {"term": "zzqx"})
    assert out["data"]["terms"] == [] and "no term" in out["notes"][0]


# ------------------------------------------------------------------------------------------------ Insights & blog
async def test_insights_with_no_posts_says_so_and_with_posts_reads_the_best_match():
    _, out = await run(Gw({"/api/content": []}), "get_insights_and_blogs", {"query": "inflation"})
    assert out["data"]["posts"] == [] and "No posts are published" in out["notes"][0]
    posts = [{"title": "Why inflation matters", "slug": "why-inflation", "category": "Explainers", "excerpt": "Prices", "publishedAt": "2026-11-01"},
             {"title": "Myths of SIPs", "slug": "sip-myths", "category": "Myth Busters", "excerpt": "SIP"}]
    gw = Gw({"/api/content": posts, "/api/content/why-inflation": {"articleHtml": "<p>Inflation is the rise in prices.</p>"}})
    _, out = await run(gw, "get_insights_and_blogs", {"query": "inflation"})
    assert [p["slug"] for p in out["data"]["posts"]] == ["why-inflation"] and out["data"]["posts"][0]["text"] == "Inflation is the rise in prices."


# ------------------------------------------------------------------------------------------------ News & filings and Documents: what is an investor presentation
@pytest.mark.parametrize("category, title, want", [
    ("Investor Presentation", "Reliance Industries Limited has informed the Exchange about Investor Presentation", "Investor presentation"),
    ("Analysts/Institutional Investor Meet/Con. Call Updates", "Analysts/Institutional Investor Meet/Con. Call Updates: Please note that the Company executives", "Other filing"),
    ("Analysts/Institutional Investor Meet/Con. Call Updates", "Analysts/Institutional Investor Meet/Con. Call Updates: Transcript of the earnings call", "Call transcript"),
    ("Annual Report", "Annual Report 2025-26", "Annual report"),
    ("General Updates", "Proposed Initial Public Offer of Jio Platforms Limited - filing of the DRHP", "Offer document"),
    ("Updates", "Updates: This is further to the disclosure", "Other filing"),
])
def test_the_documents_rule_a_meeting_notice_is_not_a_presentation(category, title, want):
    assert P.doc_type(category, title) == want


def test_on_the_live_reliance_documents_one_presentation_not_nine():
    items = load("feed_reliance_documents.json")["items"]
    types = [P.doc_type(i["category"], i["title"]) for i in items]
    assert types.count("Investor presentation") == 1                     # before the fix the meet / con-call notices were counted too
    assert items[types.index("Investor presentation")]["date"] == "2026-10-30"


async def test_news_and_filings_by_company_and_documents_by_type_with_their_links():
    feed = load("feed_reliance_documents.json")
    gw = Gw({"/api/feed": lambda p: feed if p.get("kind") == "document" else {"items": []}})
    _, out = await run(gw, "get_news_and_filings", {"kind": "documents", "symbol": "reliance", "type": "Investor presentation"})
    assert [i["date"] for i in out["data"]["items"]] == ["2026-10-30"] and out["data"]["items"][0]["link"].endswith("_IP.pdf")
    assert gw.calls[-1][1]["symbol"] == "RELIANCE" and gw.calls[-1][1]["kind"] == "document"
    _, out = await run(gw, "get_news_and_filings", {"kind": "news", "symbol": "RELIANCE"})
    assert out["data"]["items"] == [] and "no such filing" in out["notes"][0]


# ------------------------------------------------------------------------------------------------ reading the investor presentation itself
def tiny_pdf(pages):
    """A small, valid PDF with one line of text per page (Helvetica), written by hand: no PDF library needed to make it."""
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for text in pages:
        stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
        objs.append(f"<< /Length {len(stream)} >>\nstream\n{stream.decode()}\nendstream")
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {len(objs)} 0 R /Resources << /Font << /F1 3 0 R >> >> >>")
        kids.append(len(objs))
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>"
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


DECK = ["Reliance Industries Investor Presentation Q2 FY27", "Consolidated revenue and EBITDA by segment", "Digital Services: Jio subscribers 500 million, ARPU Rs 210",
        "Oil to Chemicals: throughput and margins", "Retail: stores and footfalls", "New Energy: giga factories timeline"]


async def test_the_investor_presentation_is_read_from_the_exchange_file_and_the_pages_that_answer_come_back(monkeypatch):
    P._texts.clear()
    got = []

    class FakeFetcher:
        def __init__(self, **kw):
            pass

        async def pdf(self, url, cap=None):
            got.append(url)
            return tiny_pdf(DECK)

        async def aclose(self):
            pass
    monkeypatch.setattr("finlit.earnings.transcripts.Fetcher", FakeFetcher)
    gw = Gw({"/api/feed": load("feed_reliance_documents.json")})
    r, out = await run(gw, "read_company_document", {"symbol": "RELIANCE", "document": "investor_presentation", "question": "Jio subscribers and ARPU"})
    assert not r["error"]
    d = out["data"]
    assert got == ["https://nsearchives.nseindia.com/corporate/kavinavora_30102026194557_SE_30102026_IP.pdf"]   # the presentation, not a meeting notice
    assert d["filed"] == "2026-10-30" and d["pages"] == 6 and d["link"] == got[0]
    nums = [p["page"] for p in d["text"]]
    assert nums[0] == 1 and 3 in nums and "ARPU Rs 210" in next(p["text"] for p in d["text"] if p["page"] == 3)
    assert "page" in out["notes"][0] and "not FinLit's view" in out["notes"][0]
    await run(gw, "read_company_document", {"symbol": "RELIANCE", "question": "Retail stores"})
    assert len(got) == 1                                                  # the same file is read once, then kept in memory


async def test_a_company_without_that_document_or_an_unreachable_file_is_said_plainly_with_the_link(monkeypatch):
    P._texts.clear()
    gw = Gw({"/api/feed": {"items": []}})
    _, out = await run(gw, "read_company_document", {"symbol": "TCS", "document": "annual_report"})
    assert out["data"]["found"] is False and "no annual report for TCS" in out["notes"][0]
    from finlit.earnings.transcripts import FetchFailed

    class Down:
        def __init__(self, **kw):
            pass

        async def pdf(self, url, cap=None):
            raise FetchFailed("did not answer")

        async def aclose(self):
            pass
    monkeypatch.setattr("finlit.earnings.transcripts.Fetcher", Down)
    r = await T.run(Gw({"/api/feed": load("feed_reliance_documents.json")}), "read_company_document", {"symbol": "RELIANCE"})
    assert r["error"] and "_IP.pdf" in r["text"] and "did not answer" in r["text"]


def test_best_pages_keep_the_cover_and_the_pages_with_the_questions_words_in_order_and_within_the_limit():
    pages = [f"page {i} " + ("jio arpu " * (5 if i == 7 else 0)) for i in range(20)]
    picked = P.best_pages(pages, "What is Jio's ARPU?", n=2)
    assert [n for n, _ in picked][:2] == [1, 8]
    assert sum(len(t) for _, t in P.best_pages(["x" * 5000] * 10, "", chars=9000)) <= 9000


# ------------------------------------------------------------------------------------------------ the Basic and Advanced score screeners
async def test_score_screeners_filter_by_score_sector_and_size_as_the_member_sees_them():
    rows = [{"symbol": "HDFCBANK", "name": "HDFC Bank", "sector": "Private Sector Bank", "nse_industry": "Banks", "market_cap": 1400000, "overall": 71, "band": "Healthy", "prism_final": 66},
            {"symbol": "SBIN", "name": "SBI", "sector": "Public Sector Bank", "nse_industry": "Banks", "market_cap": 800000, "overall": 64, "band": "Average", "prism_final": 61},
            {"symbol": "BAJFINANCE", "name": "Bajaj Finance", "sector": "Non Banking Financial Company (NBFC)", "nse_industry": "Finance", "market_cap": 500000, "overall": 75, "prism_final": 70},
            {"symbol": "TCS", "name": "TCS", "sector": "Computers - Software & Consulting", "nse_industry": "IT - Software", "market_cap": 1200000, "overall": 80, "prism_final": None}]
    gw = Gw({"/api/screener/universe": {"rows": rows, "as_of": "2026-11-18"}})
    _, out = await run(gw, "screen_by_finlit_score", {"score": "iq", "sector": "Banks"})
    assert [r["symbol"] for r in out["data"]["rows"]] == ["HDFCBANK", "SBIN"]          # "Banks" is a bank, not "Banking"
    _, out = await run(gw, "screen_by_finlit_score", {"score": "iq", "min": 70, "min_market_cap": 600000})
    assert [r["symbol"] for r in out["data"]["rows"]] == ["TCS", "HDFCBANK"] and out["asOf"] == "2026-11-18"
    _, out = await run(gw, "screen_by_finlit_score", {"score": "prism"})
    assert "TCS" not in [r["symbol"] for r in out["data"]["rows"]] and out["data"]["matched"] == 3      # no score yet: left out


async def test_a_plan_without_the_score_gets_the_plans_name_not_an_empty_list():
    u = load("universe_visitor.json")
    for r in u["rows"]:
        r["overall"] = r["prism_final"] = None
    r = await T.run(Gw({"/api/screener/universe": u}), "screen_by_finlit_score", {"score": "prism"})
    assert r["error"] and "Gold plan" in r["text"]
    r = await T.run(Gw({"/api/screener/universe": u}), "screen_by_finlit_score", {"score": "iq"})
    assert r["error"] and "Silver plan" in r["text"]


# ------------------------------------------------------------------------------------------------ "aligned with the web pages": the links under the answer
def test_each_answer_links_the_finlit_pages_it_read_once_each_at_most_four():
    links = P.page_links([("get_company_card", {"symbol": "RELIANCE"}), ("get_finlit_prism", {"symbol": "reliance"}), ("get_company_card", {"symbol": "RELIANCE"}),
                          ("read_company_document", {"symbol": "RELIANCE"}), ("get_india_economy", {}), ("lookup_glossary", {"term": "P/E"})])
    assert links == [{"to": "/stocks/RELIANCE", "label": "RELIANCE company report"}, {"to": "/prism/RELIANCE", "label": "FinLit Prism report: RELIANCE"},
                     {"to": "/documents", "label": "Documents"}, {"to": "/macro", "label": "India economy"}]
    assert P.page_links([("get_superinvestors", {}), ("screen_by_finlit_score", {"score": "prism"}), ("screen_by_finlit_score", {"score": "iq"}),
                         ("get_fii_dii_flows", {})]) == [{"to": "/superinvestors", "label": "Superinvestor portfolios"},
                                                         {"to": "/advanced-score-screener", "label": "Advanced stock screener"},
                                                         {"to": "/score-screener", "label": "Basic stock screener"}, {"to": "/fii-dii", "label": "FII & DII flows"}]
    assert P.page_links([("get_company_card", {"symbol": "../x"}), ("web_search", {}), ("get_news_and_filings", {"kind": "news"})]) == [{"to": "/news", "label": "News & filings"}]


def test_every_linked_page_is_a_page_of_the_website():
    app = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "App.tsx").read_text(encoding="utf-8")
    import re
    routes = set(re.findall(r'path="([^"]+)"', app))
    calls = [(t.name, {"symbol": "TCS", "kind": k, "score": s}) for t in T.TOOLS for k in ("news", "documents") for s in ("iq", "prism")]
    for link in P.page_links(calls[:4]) + [x for c in calls for x in P.page_links([c])]:
        path = link["to"].split("?")[0].strip("/")
        assert path in routes or re.sub(r"/[^/]+$", "/:symbol", path) in routes, link


async def test_the_answer_returns_the_calls_it_made_for_the_links():
    from test_ask import FakeClient
    client = FakeClient([{"tools": [("get_india_economy", {})]}, {"text": ["CPI inflation was 6.09% in Oct 2026."]}])
    res = await service.answer(client, "m", Gw({"/api/macro": load("macro.json")}), service.build_messages([], "Inflation now?", None, "silver"), _noop)
    assert res["calls"] == [("get_india_economy", {})] and P.page_links(res["calls"]) == [{"to": "/macro", "label": "India economy"}]


async def _noop(*a):
    return None


# ------------------------------------------------------------------------------------------------ the endpoint: the links travel with the answer (Postgres, Redis)
from test_ask import FakeClient as _FC, ask as _ask, enable as _enable  # noqa: E402
from test_auth import app, signed_in  # noqa: E402,F401
from test_integration import ingested, make_settings, store  # noqa: E402,F401


@pytest.mark.integration
async def test_the_finished_answer_carries_the_finlit_pages_it_read_and_a_cached_one_too(app):  # noqa: F811
    client = _FC([{"tools": [("lookup_glossary", {"term": "ROCE"})]}, {"text": ["ROCE is operating profit for every Rs 100 of capital used."]}])
    _enable(app, client)
    m = await signed_in(app, "links@example.com", plan="silver")
    _, ev = await _ask(m, "What is ROCE?")
    done = [d for e, d in ev if e == "done"][0]
    assert done["pages"] == [{"to": "/glossary", "label": "Glossary"}] and done["disclaimer"] == service.DISCLAIMER
    _, ev2 = await _ask(m, "what is roce?")
    assert ev2[0][1]["cached"] is True and [d for e, d in ev2 if e == "done"][0]["pages"] == [{"to": "/glossary", "label": "Glossary"}]
