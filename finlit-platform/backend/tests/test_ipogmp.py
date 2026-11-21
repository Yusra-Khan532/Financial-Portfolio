"""IPO GMP against the actual listing (finlit/ipogmp.py): reading InvestorGain's GMP page, the figures under the chart, and /api/ipos/gmp-record."""
import json
from datetime import date

import pytest

from finlit import ipogmp


def page(name="BLS Polymers", issue="150.00", band="142.00-150.00", lp="248.00", ld="2026-11-03T00:00:00.000Z", cat="IPO", gmp="69", sub="241.22"):
    """The parts of an InvestorGain GMP page the reader uses, in the same shape (title, the FinancialProduct data and the embedded Next.js stream)."""
    stream = ('{"nse_cd":"BLSPOLY","bse_cd":"545011","listing_price":"%s","allotment_price":"%s","issue_price":"%s","ipo_category_sub":"%s",'
              '"ipo_listing_date":"%s","isin":"INE0ZCQ01019","issue_size":"&#8377;255.00 Cr",'
              '"gmpData":[{"Seq":3,"id":1,"ipo_id":1849,"gmp_date":"03-11-2026","gmp":"%s","gmp_comments":"<p>[x]</p>"}],'
              '"gmpHistoryData":[{"gmp":"18","gmp_time":"2026-10-19T09:37:01.000Z"},{"gmp":"69","gmp_time":"2026-11-03T09:02:01.000Z"}]}') % (lp, issue, band, cat, ld, gmp)
    ld_json = json.dumps({"@context": "https://schema.org", "@type": "FinancialProduct", "additionalProperty": [
        {"@type": "PropertyValue", "name": "GMP", "value": gmp}, {"@type": "PropertyValue", "name": "Subscription", "value": sub},
        {"@type": "PropertyValue", "name": "Issue Size", "value": "255.00"}, {"@type": "PropertyValue", "name": "Sector", "value": "Specialty Chemicals"}]})
    return (f"<html><head><title>{name} IPO GMP Today &amp; History</title></head><body>"
            f'<script type="application/ld+json">{ld_json}</script>'
            f'<script>self.__next_f.push([1,{json.dumps(stream)}])</script></body></html>')


def test_a_listed_ipo_reads_as_investorgain_shows_it():
    r = ipogmp.parse_page(page(), 1849, "https://www.investorgain.com/gmp/bls-polymers-ipo/1849/")
    assert r["name"] == "BLS Polymers" and r["nse"] == "BLSPOLY" and r["board"] == "mainboard" and r["listed"]
    assert (r["issue_price"], r["gmp"], r["listing_price"], r["listing_date"]) == (150.0, 69.0, 248.0, date(2026, 11, 3))
    assert (r["gmp_pct"], r["listing_pct"]) == (46.0, 65.33)              # InvestorGain: GMP 69 (46.00%), listed at 248 (65.33%)
    assert r["subscription"] == 241.22 and r["issue_size_cr"] == 255.0 and r["sector"] == "Specialty Chemicals"
    assert [h["gmp"] for h in r["history"]] == [18.0, 69.0]


def test_sme_unlisted_and_unreadable_pages():
    assert ipogmp.parse_page(page(cat="SME"), 1, "u")["board"] == "sme"
    r = ipogmp.parse_page(page(lp="", ld=""), 2, "u")
    assert not r["listed"] and r["listing_pct"] is None and r["gmp_pct"] == 46.0
    assert ipogmp.parse_page("<html><title>Not an IPO</title></html>", 3, "u") is None
    assert ipogmp.parse_page(page(issue="", band="")[:0] + page(issue="", band="142.00-150.00"), 4, "u")["issue_price"] == 150.0   # from the band when there is no issue price


def test_verdicts_fit_and_summary():
    assert [ipogmp.verdict(10, 20), ipogmp.verdict(10, 2), ipogmp.verdict(10, 14), ipogmp.verdict(None, 1)] == ["beat", "short", "band", None]
    assert ipogmp.fit([{"x": 0, "y": 1}, {"x": 10, "y": 21}, {"x": 20, "y": 41}]) == {"slope": 2.0, "intercept": 1.0}
    s = ipogmp.summary([{"gmp_pct": 10, "listing_pct": 20}, {"gmp_pct": 10, "listing_pct": 2}, {"gmp_pct": 10, "listing_pct": 12}, {"gmp_pct": 5, "listing_pct": -3}])
    assert (s["count"], s["beat"], s["short"], s["band"], s["directionRight"]) == (4, 1, 2, 1, 3)
    assert s["medianGap"] == 8.0


def test_page_urls_from_the_sitemap():
    xml = "<loc>https://www.investorgain.com/gmp/a-ipo/10/</loc><loc>https://www.investorgain.com/gmp/b-ipo/2401/</loc><loc>https://www.investorgain.com/gmp/a-ipo/10/</loc>"
    assert [p["id"] for p in ipogmp.page_urls(xml)] == [2401, 10]


# ------------------------------------------------------------------------------------------------ the API, against Postgres
from test_auth import app  # noqa: F401,E402
from test_integration import ingested, make_settings, store  # noqa: F401,E402


@pytest.mark.integration
async def test_gmp_record_api(app):  # noqa: F811
    from httpx import ASGITransport, AsyncClient
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM ipo_gmp")
        for i, (cat, lp, ld) in enumerate([("IPO", "248.00", "2026-11-03T00:00:00.000Z"), ("SME", "120.00", "2026-10-01T00:00:00.000Z"), ("IPO", "", "")]):
            r = ipogmp.parse_page(page(cat=cat, lp=lp, ld=ld), 100 + i, f"https://www.investorgain.com/gmp/x/{100 + i}/")
            await conn.execute(ipogmp.UPSERT, *ipogmp.to_row(r))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        d = (await c.get("/api/ipos/gmp-record")).json()
        assert [i["board"] for i in d["items"]] == ["mainboard", "sme"]          # the unlisted issue is left out, newest listing first
        assert d["items"][0] == {**d["items"][0], "gmpPct": 46.0, "listingPct": 65.33, "verdict": "beat", "symbol": "BLSPOLY"}
        assert d["source"]["name"] == "InvestorGain" and "unofficial" in d["note"]
        assert [i["board"] for i in (await c.get("/api/ipos/gmp-record?board=sme")).json()["items"]] == ["sme"]
        assert (await c.get("/api/ipos/gmp-record?board=nonsense")).status_code == 422
