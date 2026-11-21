"""Task #296 (the 21 Nov Discover filters pack): what the calls and results bucket lists quote and say fits the company (finlit/discovery/fit.py), and the
90 days of filings behind a theme or event page's "Latest …" panel (GET /api/discovery/feed, read once the table below it is filtered).
Pure rules first; then the served lists and the route on real Postgres."""

import json
from datetime import date, timedelta

import httpx

from finlit.discovery import board as B
from finlit.discovery import fit as F
from finlit.discovery import sources as S
from test_discovery import TODAY, exchange, seed
from test_integration import make_settings, store  # noqa: F401  (fixture)

GUIDE, KPI = F.GUIDANCE, F.KPI_BUCKET


def test_a_quote_loses_the_page_header_the_pdf_ran_into_it():
    s = ("Overall, the convergence of energy security prioritizes manufacturing strength, repowering Suzlon Energy Limited October 29, 2026 Page 3 of 18 "
         "opportunities, offshore wind development and rising power demand provide visibility for 5 years.")
    assert F.clean_quote(s) == ("Overall, the convergence of energy security prioritizes manufacturing strength, repowering opportunities, offshore wind "
                                "development and rising power demand provide visibility for 5 years.")
    assert F.clean_quote("Revenue grew 12% this quarter Page 4 of 20 on strong demand.") == "Revenue grew 12% this quarter on strong demand."
    assert F.clean_quote("Acme Industries Ltd 29 October 2026 Page 2 of 9 EBITDA margin was 18%.") == "EBITDA margin was 18%."
    assert F.clean_quote("Pages 3 to 5 explain the 12% growth.") == "Pages 3 to 5 explain the 12% growth."          # no header: unchanged


def test_address_and_contact_lines_are_never_quoted_and_tax_rate_is_not_guidance():
    assert not F.quotable("Registered Office: 12 MG Road, Pune 411001 Tel: +91 20 1234 5678 Email: ir@acme.com", KPI)
    assert not F.quotable("CIN L24110MH1947PLC005719 and the occupancy was 72% in the quarter", KPI)
    assert F.quotable("Occupancy was 72% and ARR rose 9% in the quarter.", KPI)
    assert not F.quotable("For FY27, we expect our effective tax rate to be between 22% and 24%.", GUIDE)
    assert F.quotable("For FY27, we expect our effective tax rate to be between 22% and 24%.", KPI)                # only the guidance bucket
    assert F.quotable("We expect revenue growth of 15% to 18% in FY27.", GUIDE)
    assert F.quotes(["Tel: 0120 4567 Email: a@b.com Website: www.b.com", "Revenue grew 12% Page 4 of 20 on demand.", "Revenue grew 12% on demand."], GUIDE) \
        == ["Revenue grew 12% on demand."]                                                                         # cleaned, and the same sentence once


def test_a_sector_kpi_counts_only_in_its_own_sector_and_order_book_checks_only_for_order_businesses():
    assert set(F.KPI_SECTORS) == {c["name"] for c in S.LEX["results"].directory[KPI]}                         # every KPI keyword of the directory has its sectors
    assert not F.kpi_fits("Pharma and chemicals metrics", "Financial Services") and F.kpi_fits("Pharma and chemicals metrics", "Healthcare")
    assert F.kpi_fits("IT services metrics", None)                                                             # not classified: nothing says it does not fit
    line = "Check conversion history, L1 versus awarded status and bid-to-win ratio."
    assert not F.verify_fits(line, "Services") and F.verify_fits(line, "Industrials") and F.verify_fits(line, None)
    assert F.verify_fits("Confirm base year, organic versus acquired growth.", "Services")


def test_a_lender_keeps_its_banking_kpis_and_loses_the_pharma_ones_or_leaves_the_bucket():
    lex = S.LEX["results"]
    b = {"distinct": 3, "total": 9, "score": 10.5, "terms": {"Banking and NBFC asset quality": 5, "Capital adequacy": 2, "Pharma and chemicals metrics": 2},
         "evidence": ["Gross NPA was 2.1% and net NPA 0.6% at the quarter end.", "US generics sales rose 14% in the quarter."], "verify": []}
    got = F.fit_entry(KPI, b, "Financial Services", lex.patterns, 2, 5, 2)
    assert got["terms"] == {"Banking and NBFC asset quality": 5, "Capital adequacy": 2} and got["distinct"] == 2 and got["total"] == 7
    assert got["evidence"] == ["Gross NPA was 2.1% and net NPA 0.6% at the quarter end."] and got["score"] == 7.5
    only = {"distinct": 2, "total": 3, "score": 5.5, "terms": {"Pharma and chemicals metrics": 2, "IT services metrics": 1}, "evidence": [], "verify": []}
    assert F.fit_entry(KPI, only, "Financial Services", lex.patterns, 2, 5, 2) is None                         # no longer makes the bucket's rule
    assert F.fit_entry(KPI, only, None, lex.patterns, 2, 5, 2)["terms"] == only["terms"]


async def _docs(st):
    """Two results filings and one call transcript as the nightly job stores them, and the companies' NSE classification."""
    async with st.pool.acquire() as conn:
        await conn.execute("TRUNCATE discovery_documents RESTART IDENTITY CASCADE")
        await conn.execute("DELETE FROM company_classification WHERE symbol = ANY($1::text[])", ["LENDCO", "PHARMCO", "SERVCO"])
        await conn.execute("INSERT INTO company_classification (symbol, macro_sector, sector, industry, rule_version) VALUES "
                           "('LENDCO', 'Financial Services', 'Financial Services', 'Finance', 1), ('PHARMCO', 'Healthcare', 'Healthcare', 'Pharmaceuticals', 1), "
                           "('SERVCO', 'Services', 'Services', 'Commercial Services & Supplies', 1)")
        kpi_l = {"distinct": 2, "total": 4, "score": 6.0, "terms": {"Pharma and chemicals metrics": 3, "IT services metrics": 1},
                 "evidence": ["US sales grew 12% in the quarter."], "verify": []}
        kpi_p = {"distinct": 2, "total": 6, "score": 7.0, "terms": {"Pharma and chemicals metrics": 4, "Hospitality and healthcare metrics": 2},
                 "evidence": ["Registered Office: Plot 4, Hyderabad Tel: 040 1234 Email: ir@pharmco.com", "ANDA approvals rose to 14 Page 2 of 9 this year."], "verify": []}
        guide = {"distinct": 2, "total": 4, "score": 6.0, "terms": {"Forward guidance": 3, "Strong pipeline": 1},
                 "evidence": ["For FY27, we expect our effective tax rate to be between 22% and 24%.", "We expect revenue growth of 15% in FY27."],
                 "verify": ["Check conversion history, L1 versus awarded status and bid-to-win ratio.", "Confirm base year, organic versus acquired growth."]}
        for sym, src, b in (("LENDCO", "results", {KPI: kpi_l}), ("PHARMCO", "results", {KPI: kpi_p}), ("SERVCO", "calls", {GUIDE: guide})):
            await conn.execute("INSERT INTO discovery_documents (symbol, source, company, doc_title, doc_date, doc_link, status, buckets, matched, tone, tone_label, read_at) "
                               "VALUES ($1, $2, $3, 't', $4, $5, 'ok', $6::jsonb, $7, 0.2, 'Positive', now())",
                               sym, src, sym.title() + " Ltd", date.today() - timedelta(days=3), f"https://nsearchives.nseindia.com/corporate/{sym}.pdf",
                               json.dumps(b), list(b))


async def test_the_served_lists_fit_each_company_and_the_counts_follow(store):  # noqa: F811
    await _docs(store)
    res = await S.overview(store, "results", bucket=KPI)
    kb = next(b for b in res["buckets"] if b["name"] == KPI)
    assert [e["symbol"] for e in kb["list"]] == ["PHARMCO"] and kb["companies"] == 1                   # the lender's pharma and IT keywords do not count
    e = kb["list"][0]
    assert e["keywords"] == ["Pharma and chemicals metrics", "Hospitality and healthcare metrics"]
    assert e["evidence"] == ["ANDA approvals rose to 14 this year."] and kb["withEvidence"] == 1           # the address line out, the page footer cut
    landing = next(b for b in (await S.overview(store, "results"))["buckets"] if b["name"] == KPI)
    assert landing["companies"] == kb["companies"] and landing["withEvidence"] == kb["withEvidence"]       # the landing card and the list agree
    calls = await S.overview(store, "calls", bucket=GUIDE)
    g = next(b for b in calls["buckets"] if b["name"] == GUIDE)["list"][0]
    assert g["evidence"] == ["We expect revenue growth of 15% in FY27."]                                    # tax rate is not guidance
    assert g["verify"] == ["Confirm base year, organic versus acquired growth."]                            # no order-book check for a services company
    one = await S.company(store, "results", "LENDCO")
    assert one["buckets"] == [] and one["reason"]                                                           # one company's page says the same


async def test_the_feed_route_sends_every_filing_of_the_90_days(store):  # noqa: F811
    from finlit.api import create_app
    from finlit.discovery import service as D
    await seed(store)
    async with store.pool.acquire() as conn:
        for i in range(15):                       # more order filings than the board's newest 12
            await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, category, auto, dedupe) VALUES "
                               "('news', $1, 'BSHIELD', 'Bharat Shield Ltd', 'https://nsearchives.nseindia.com/x.pdf', $2, 'Bagging/Receiving of orders/contracts', true, $3)",
                               f"Bharat Shield has received orders worth Rs {100 + i} crore", TODAY - timedelta(days=1 + i), f"o{i}")
    await D.run(store, fetcher=exchange())
    board = await B.board(store)
    assert len(board["efil"].get("order", [])) == B.FILINGS_PER_EVENT
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get("/api/discovery/feed", params={"event": "order"})
            assert r.status_code == 200 and r.headers["cache-control"] == "public, max-age=600"
            d = r.json()
            assert d["days"] == 90 and d["total"] == len(d["filings"]) >= 15 and d["filings"][0]["d"] >= d["filings"][-1]["d"]
            th = board["rows"][0]["th"]
            t = (await c.get("/api/discovery/feed", params={"theme": th})).json()
            assert t["theme"] == th and t["total"] == len(t["filings"]) >= len(board["thfil"].get(th, []))
            assert (await c.get("/api/discovery/feed", params={"event": "tulips"})).status_code == 404
            assert (await c.get("/api/discovery/feed")).status_code == 400
            assert (await c.get("/api/discovery/feed", params={"event": "order", "theme": th})).status_code == 400
