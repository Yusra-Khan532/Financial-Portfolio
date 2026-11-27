"""Task #260 (the 20 Nov Discover pack): the quote rule (finlit/discovery/quotes.py, a port of code/quote-rule.js), the 22-level sector and the filing's PDF
on each board row, and GET /api/discovery/company: every passage FinLit kept with whether it names the theme and its PDF page, the presentation's PDF."""

from datetime import timedelta

import httpx

from finlit.discovery import board as B
from finlit.discovery import quotes as Q
from finlit.discovery import service as D
from test_discovery import TODAY, exchange, seed
from test_integration import make_settings, store  # noqa: F401  (fixture)


def test_clean_q_keeps_a_sentence_marks_slide_text_and_drops_tables_and_design_leftovers():
    s = Q.clean_q("The company commissioned a 2 GW solar module line at Mundra and started commercial production in October 2026.")
    assert s == {"t": "The company commissioned a 2 GW solar module line at Mundra and started commercial production in October 2026.", "kind": "sentence"}
    assert Q.clean_q("Key Business Highlights Years Countries Served Customers Worldwide Assessment Proctoring Platform")["kind"] == "slide"
    assert Q.clean_q("FY23 FY24 FY25 0.7% 1.1% 1.1% 0.7% 0.8% 0.7% 0.6% 0.6%") is None                 # a table of figures
    assert Q.clean_q("COLOR PALETTE R=12 G=40 B=99 primary accent and secondary accent colours") is None
    assert Q.clean_q("short") is None
    # press-release dateline and the exchange code go; the sentence after them stays
    d = Q.clean_q("Mumbai, 12 November 2026: Acme Solar Ltd (NSE: ACMESOLAR) has commissioned 300 MW of solar capacity in Rajasthan for its customers.")
    assert d and d["t"].startswith("Acme Solar Ltd has commissioned 300 MW") and "NSE:" not in d["t"]


def test_kw_test_finds_the_phrase_its_short_form_or_two_key_words():
    ok = Q.kw_test(["Artificial intelligence", "Large language models", "Battery energy storage"])
    assert ok("We use artificial intelligence in underwriting.")
    assert ok("Our AI platform serves 200 banks.") and not ok("We said hi to the team in Mumbai.")
    assert ok("New LLMs were deployed for clients.")
    assert ok("The battery storage project is under execution.")                     # two of its key words (stems)
    assert not ok("Revenue grew 12% on volumes.")
    assert Q.kw_test([]) is None


def test_passages_name_the_theme_first_and_carry_their_page():
    pages = ["Cover page Investor Presentation", "Our AI platform now serves 200 banks and 40 insurers across India, up from 120 a year ago.",
             "We opened a new office in Pune with 300 seats for our growing engineering teams across the country."]
    out = Q.passages(["We opened a new office in Pune with 300 seats for our growing engineering teams across the country."], ["Artificial intelligence"], pages,
                     extra=["Our AI platform now serves 200 banks and 40 insurers across India, up from 120 a year ago."])
    assert [(x["names"], x["page"]) for x in out] == [(True, 2), (False, 3)]
    assert out[0]["kind"] == "sentence"
    assert Q.page_of("not in any page at all, nowhere to be found", pages) is None and Q.page_of("x", None) is None


def test_only_exchange_files_are_linked():
    assert B.safe_link("https://nsearchives.nseindia.com/corporate/A_1.pdf") and B.safe_link("https://www.bseindia.com/xml-data/corpfiling/x.pdf")
    assert not B.safe_link("https://nseindia.com.evil.com/x.pdf") and not B.safe_link("http://nsearchives.nseindia.com/x.pdf") and not B.safe_link(None)


async def test_board_rows_carry_the_sector_and_the_company_route_gives_passages_pages_and_pdfs(store):  # noqa: F811
    from finlit.api import create_app
    await seed(store)
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM company_classification WHERE symbol = 'BSHIELD'")
        await conn.execute("INSERT INTO company_classification (symbol, macro_sector, sector, industry, rule_version) VALUES "
                           "('BSHIELD', 'Industrials', 'Capital Goods', 'Aerospace & Defense', 1)")
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, category, auto, dedupe) VALUES "
                           "('news', 'Bharat Shield has received orders worth Rs 400 crore for radar systems', 'BSHIELD', 'Bharat Shield Ltd', "
                           "'https://nsearchives.nseindia.com/corporate/BSHIELD_order.pdf', $1, 'Bagging/Receiving of orders/contracts', true, 'n260')",
                           TODAY - timedelta(days=1))
    await D.run(store, fetcher=exchange())
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            b = (await c.get("/api/discovery/board")).json()
            r = await c.get("/api/discovery/company?symbol=bshield")
            missing = await c.get("/api/discovery/company?symbol=NOSUCH")
            bad = await c.get("/api/discovery/company?symbol=../x")
    row = next(x for x in b["rows"] if x["s"] == "BSHIELD")
    assert row["sc"] == "Capital Goods" and row["mac"] == "Industrials" and row["ind"] == "Aerospace & Defense"
    assert row["lf"]["l"] == "https://nsearchives.nseindia.com/corporate/BSHIELD_order.pdf"
    # "Latest filings in this theme": only companies whose main theme it is (task #250 still holds: no list of every filing that names a theme)
    assert [f["s"] for f in b["thfil"]["Defence & Aerospace"]] == ["BSHIELD"] and "tfil" not in b
    assert all(next(x for x in b["rows"] if x["s"] == f["s"])["th"] == th for th, fs in b["thfil"].items() for f in fs)
    assert r.status_code == 200 and r.headers["cache-control"] == "public, max-age=600"
    d = r.json()
    assert d["symbol"] == "BSHIELD" and d["theme"] == "Defence & Aerospace" and d["words"]
    assert d["document"]["date"] and d["document"]["pages"] and (d["document"]["link"] or "").startswith("https://")
    assert d["passages"] and all({"t", "kind", "names", "page"} <= set(p) for p in d["passages"])
    assert d["passages"][0]["names"] and d["passages"][0]["page"] is not None            # the passage that names the theme, with its page
    assert d["filings"][0]["l"] == "https://nsearchives.nseindia.com/corporate/BSHIELD_order.pdf" and d["filings"][0]["el"] == "Order win"
    assert missing.status_code == 404 and bad.status_code == 400


async def test_a_placed_companys_older_filing_is_not_hidden_by_thousands_of_newer_filings_of_other_companies(store):  # noqa: F811
    """Found on the live page (20 Nov): the board read the newest 4,000 filings of every company, which reached back only a few days, so 40 of 950 rows
    had a latest filing and most themes had no "Latest filings in this theme". It now reads the placed companies' event filings over the 90 days."""
    from finlit.api import create_app
    await seed(store)
    await D.run(store, fetcher=exchange())
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM discovery_signals")
        await conn.execute("INSERT INTO discovery_signals (feed_id, symbol, item_date, event, title, link) VALUES "
                           "(1, 'BSHIELD', current_date - 60, 'order', 'Order worth Rs 90 crore for radar systems', 'https://nsearchives.nseindia.com/corporate/old.pdf')")
        await conn.execute("INSERT INTO discovery_signals (feed_id, symbol, item_date, event, title) "
                           "SELECT 100 + g, 'NOTPLACED', current_date - 1, 'order', 'Other company order ' || g FROM generate_series(1, 4100) g")
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            b = (await c.get("/api/discovery/board")).json()
    row = next(x for x in b["rows"] if x["s"] == "BSHIELD")
    assert row["lf"]["t"] == "Order worth Rs 90 crore for radar systems" and row["lf"]["l"].endswith("old.pdf")
    assert [f["s"] for f in b["thfil"]["Defence & Aerospace"]] == ["BSHIELD"]
    assert [f["s"] for f in b["efil"]["order"]] == ["BSHIELD"]                     # only companies placed on Discover (task #250)
