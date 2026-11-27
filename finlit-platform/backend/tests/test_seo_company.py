"""Search growth, Phase 1 (docs/search-growth/PROGRESS.md): a company page's crawler HTML carries the company's real stored figures, each dated, answer first, with the
questions people ask, its peers, its industry group and the glossary terms it uses; only what a visitor who is not signed in is sent; never advice.
Every figure here is made up for an invented company."""
import json
import re

import httpx
import pytest
from fastapi import FastAPI

from finlit import seo
from finlit.web import mount_frontend
from test_seo import BASE, INDEX

ADVICE = re.compile(r"\b(buy|sell|hold|reduce|avoid|accumulate|target|fair value|undervalued|overvalued|best stock|top pick|multibagger|outperform)\b", re.I)


def sections(bank: bool = False, de: float = 0.0):
    q_per = ["Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026", "Sep 2026"]
    y_per = ["FY21", "FY22", "FY23", "FY24", "FY25", "FY26"]
    return {
        "summary": {"meta": {"symbol": "EXIND", "statement": "consolidated", "generatedAt": "2026-11-27T03:00:00+00:00", "isin": "INE000X01010"},
                    "profile": {"name": "Example Industries Ltd", "nse": "EXIND", "bse": "500001", "industry": "Industrial Products", "subIndustry": "Industrial Machinery",
                                "macroSector": "Industrials", "website": "www.example.com"},
                    "quote": {"price": 1234.5, "asOf": "2026-11-26T15:30:00+05:30", "high52": 1500.0, "low52": 900.25},
                    "keyMetrics": [{"key": "market_cap", "value": 123456.7, "period": "Today"}, {"key": "pe", "value": 25.4, "period": "As of 26 Nov 2026"},
                                   {"key": "pb", "value": 4.1, "period": "As of 26 Nov 2026"}, {"key": "roe", "value": 18.2, "period": "TTM"},
                                   {"key": "roce", "value": 21.5, "period": "TTM"}, {"key": "debt_to_equity", "value": de, "period": "TTM"},
                                   {"key": "dividend_yield", "value": 1.25, "period": "TTM"}, {"key": "operating_margin", "value": 15.0, "period": "TTM"},
                                   {"key": "sales_cagr", "value": 12.0, "period": "5Y"}, {"key": "profit_cagr", "value": 14.5, "period": "5Y"}],
                    "strengths": ["GOLD-ONLY-STRENGTH"], "watchouts": ["SILVER-ONLY-WATCHOUT"], "returns": [{"label": "GOLD-ONLY-RETURN"}],
                    "dataQuality": {"priceAsOf": "2026-11-26", "fundamentalsAsOf": "FY26", "isBank": bank, "statement": "consolidated"}},
        "financials": {"quarterly": {"pl": {"periods": q_per, "rows": {"revenue": [1000.0, 1050.0, 1100.0, 1150.0, 1200.0], "net_profit": [100.0, 90.0, 95.0, 105.0, 80.0]}}},
                       "yearly": {"pl": {"periods": y_per, "rows": {"revenue": [3000.0, 3300.0, 3600.0, 4000.0, 4400.0, 4600.0], "net_profit": [300.0, 320.0, 350.0, 380.0, 400.0, 410.0]}}}},
        "ownership": {"periods": ["Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026", "Sep 2026"], "asOf": "Sep 2026", "comparedWith": "Sep 2025",
                      "series": {"promoters": [55.0, 55.0, 55.0, 55.0, 54.5], "fii": [20.0, 20.5, 21.0, 21.0, 21.5], "dii": [10.0, 10.0, 10.2, 10.3, 10.4],
                                 "public": [15.0, 14.5, 13.8, 13.7, 13.6], "government": [0.0, 0.0, 0.0, 0.0, 0.0]}},
        "peers": {"items": [{"symbol": "PEERA", "name": "Peer A Ltd"}, {"symbol": "PEERB", "name": "Peer B Ltd"}, {"symbol": "PEERC", "name": "Peer C Ltd"},
                            {"symbol": "PEERD", "name": "Peer D Ltd"}, {"symbol": "PEERE", "name": "Peer E Ltd"}, {"symbol": "PEERF", "name": "Peer F Ltd"}]},
        "events": {"dividendsByFY": {"periods": ["FY25", "FY26", "FY27"], "dps": [10.0, 12.5, 4.0], "endedFY": "FY26"}},
    }


GROUP = {"slug": "industrial-machinery", "name": "Industrial Machinery"}


def page(**kw):
    return seo.render_company(BASE, "EXIND", "Example Industries Ltd", "Industrials", seo.company_facts(sections(**kw)), GROUP)


def visible(body: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body)).replace("&#x27;", "'").replace("&amp;", "&")


def test_the_page_carries_each_figure_with_its_date_and_the_answer_comes_first():
    r = page()
    text, body = visible(r.body), r.body
    assert r.title == "Example Industries Share Price, Financials & Results 2026 | FinLit"      # the brief's full pattern is 78 characters for this name: the next one under 70
    short = seo.render_company(BASE, "EXIND", "Exind Ltd", "Industrials", seo.company_facts(sections()), GROUP)
    assert short.title == "Exind Share Price, Financials, Results & Analysis 2026 | FinLit"
    desc = re.search(r'<meta name="description" content="([^"]*)"', r.head).group(1)
    assert desc.startswith("Example Industries (NSE: EXIND): market cap ₹1,23,457 crore, P/E 25.4, ROCE 21.5%") and "26 Nov 2026" in desc and len(desc) <= 165
    assert "<h1>Example Industries share price, financials and results</h1>" in body
    # answer first, before the site's shared links
    assert body.index("How healthy is Example Industries financially?") < body.index('<nav aria-label="Main pages">') < body.index("What you can do on FinLit")
    assert ("Over the last twelve months Example Industries reported a debt to equity ratio of 0.00, a return on capital employed of 21.5% and an operating margin of 15.0% "
            "(consolidated figures to FY26). Over five years its sales grew 12.0% a year and its net profit 14.5% a year.") in text
    for row in ("Share price ₹1,234.50 26 Nov 2026", "52-week range ₹900.25 to ₹1,500.00", "Market capitalisation ₹1,23,457 crore today", "Price to earnings (P/E) 25.40 26 Nov 2026",
                "Return on capital employed (ROCE) 21.50% last twelve months", "Dividend yield 1.25% last twelve months"):
        assert row in text, row
    assert ("In the quarter to Sep 2026, revenue was ₹1,200 crore, up 20.0% from ₹1,000 crore and net profit was ₹80 crore, down 20.0% from ₹100 crore "
            "a year earlier (Sep 2025).") in text
    assert "Revenue went from ₹3,000 crore in FY21 to ₹4,600 crore in FY26. Net profit went from ₹300 crore in FY21 to ₹410 crore in FY26." in text
    assert "promoters 54.50% (down from 55.00%); foreign institutions (FII/FPI) 21.50% (up from 20.00%)" in text and "the government" not in text
    assert "For FY26 it declared ₹12.50 per share in dividends." in text
    assert "Promoters held 54.50% of Example Industries in the shareholding pattern for Sep 2026." in text


def test_the_questions_people_ask_are_answered_with_numbers():
    body = page().body
    qs = re.findall(r"<h3>(.*?)</h3>", body)
    assert [q.replace("&#x27;", "'") for q in qs] == ["Is Example Industries debt free?", "What is Example Industries' dividend yield?", "What is Example Industries' P/E ratio?",
                                                       "What is Example Industries' market capitalisation?", "How much of Example Industries do its promoters own?"]
    assert "its borrowings were nil or close to nil against shareholders" in visible(body)
    assert "its borrowings were 0.45 times shareholders' equity." in visible(page(de=0.45).body)


def test_it_links_its_peers_its_industry_group_and_the_terms_it_uses():
    body = page().body
    hrefs = re.findall(r'href="(/[^"]*)"', body)
    assert [h for h in hrefs if h.startswith("/stocks/")][:5] == ["/stocks/PEERA", "/stocks/PEERB", "/stocks/PEERC", "/stocks/PEERD", "/stocks/PEERE"] and "/stocks/PEERF" not in hrefs
    assert '<a href="/sectors/industrial-machinery">Industrial Machinery industry group</a>' in body
    for term in ("price-to-earnings-ratio-p-e", "return-on-capital-employed-roce", "debt-to-equity-ratio-d-e", "dividend-yield", "shareholding-pattern", "promoter"):
        assert f"/glossary/{term}" in hrefs, term
    assert all(h == "/" or seo.is_known(h.strip("/")) is not False for h in hrefs)
    links = re.findall(r'<a href="([^"]+)"[^>]*>(.*?)</a>', body)
    assert len({h for h, _ in links}) == len(links), [h for h, _ in links if [x for x, _ in links].count(h) > 1]      # each address once on the page
    texts = [t.lower() for _, t in links]
    assert len(texts) == len(set(texts))


def test_the_structured_data_names_the_company_and_matches_the_page():
    r = page()
    blocks = [json.loads(b) for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', r.head, re.S)]
    corp = blocks[1]["about"]
    assert corp == {"@type": "Corporation", "name": "Example Industries", "legalName": "Example Industries Ltd", "tickerSymbol": "NSE:EXIND",
                    "alternateName": ["Example Industries Ltd", "EXIND"], "identifier": {"@type": "PropertyValue", "propertyID": "ISIN", "value": "INE000X01010"},
                    "url": "https://www.example.com", "sameAs": ["https://www.example.com"]}
    assert blocks[1]["dateModified"] == "2026-11-27" and blocks[1]["description"] in r.head
    assert not re.search(r"aggregaterating|ratingvalue|\"review\"", r.head.lower())


def test_a_bank_gets_no_debt_to_equity_and_a_page_without_figures_stays_honest():
    text = visible(page(bank=True).body)
    assert "debt free" not in text and "Debt to equity" not in text and "return on capital employed of 21.5%" in text
    thin = seo.render_company(BASE, "EXIND", "Example Industries Ltd", "Industrials", seo.company_facts({}), None)
    assert seo.company_facts({}) is None and "<h1>Example Industries Ltd (EXIND) share analysis</h1>" in thin.body and "How healthy" not in thin.body
    assert "Describes the company's financial health" in visible(thin.body) and len(thin.title) <= 70


def test_no_crawler_template_contains_advice_words():
    """Search growth rule 1: describe, never advise. Every page template the server writes, filled with figures, is scanned (the glossary's own definitions
    explain what buying and selling mean, so a term page is checked on its title and description only)."""
    import datetime
    pages = [page(), page(bank=True), page(de=1.7), seo.render_company(BASE, "EXIND", "Example Industries Ltd", None)]
    pages += [seo.render_static(BASE, p) for p in seo.PUBLIC]
    pages.append(seo.render_fund(BASE, 1, {"name": "Example Flexi Cap Fund", "amc": "Example Mutual Fund", "category": "Equity Scheme - Flexi Cap Fund", "plan": "Direct",
                                           "option_class": "Growth", "nav": 10.5, "nav_date": datetime.date(2026, 11, 26), "active": True, "r1y": 12.0, "r3y": 10.0, "r5y": None}))
    pages.append(seo.render_directory(BASE, "e", {"e": [("EXIND", "Example Industries Ltd", "Industrials")]}))
    for r in pages:
        main = r.body.split("<h2>What you can do on FinLit</h2>")[0]           # the page's own text (the shared block is covered by the static pages)
        hit = ADVICE.search(visible(main + " " + r.title))
        assert hit is None, (r.title, hit and hit.group(0))
    for tid in list(seo.TERMS)[:200]:
        t = seo.render_term(BASE, tid)
        assert t is None or not re.search(r"\b(buy now|strong buy|top pick|multibagger)\b", t.title.lower()), tid


@pytest.fixture
def site(tmp_path):
    (tmp_path / "index.html").write_text(INDEX)
    app = FastAPI()
    snap = sections()

    class Conn:
        async def fetchrow(self, q, sym):
            return {"name": "Example Industries Ltd", "sector": "Industrials", "has_consolidated": True} if sym == "EXIND" else None

        async def fetch(self, q, *a):
            assert "FROM snapshots" in q and a[0] == "EXIND"
            rows = [{"statement": "consolidated", "section": k, "body": json.dumps(v)} for k, v in snap.items()]
            return rows + [{"statement": "standalone", "section": "summary", "body": json.dumps({"meta": {}, "keyMetrics": [{"key": "pe", "value": 999.0}]})}]

    class Acq:
        async def __aenter__(self):
            return Conn()

        async def __aexit__(self, *a):
            return False

    class Pool:
        def acquire(self):
            return Acq()

    class Redis:
        async def get(self, k):
            return None

        async def set(self, *a, **k):
            return True

    class S:
        public_site_url = BASE

    app.state.settings, app.state.store = S(), type("St", (), {"pool": Pool(), "redis": Redis()})()
    assert mount_frontend(app, tmp_path)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_the_server_page_shows_only_what_a_visitor_is_sent(site, monkeypatch):
    from finlit import sector_api
    monkeypatch.setattr(sector_api, "group_of", lambda sym: GROUP)
    seo._cache.clear()
    r = await site.get("/stocks/EXIND")
    assert r.status_code == 200 and "How healthy is Example Industries financially?" in r.text and "Price to earnings (P/E)</a></td>" not in r.text
    assert "25.40" in r.text and "999" not in r.text                                    # the consolidated report, the one the app opens first
    for gated in ("GOLD-ONLY-STRENGTH", "SILVER-ONLY-WATCHOUT", "GOLD-ONLY-RETURN"):  # trimmed to the visitor's plan, as the API sends them
        assert gated not in r.text, gated
    assert '<a href="/sectors/industrial-machinery">' in r.text and r.text.count("<title>") == 1


async def test_a_broken_snapshot_leaves_the_plain_company_page(site, monkeypatch):
    from finlit import web
    async def boom(*a, **k):
        raise ValueError("bad snapshot")
    seo._cache.clear()
    monkeypatch.setattr(web.seo, "company_facts", lambda s: (_ for _ in ()).throw(ValueError("bad")))
    r = await site.get("/stocks/EXIND")
    assert r.status_code == 200 and "Example Industries Ltd (EXIND) share analysis" in r.text and "How healthy" not in r.text
