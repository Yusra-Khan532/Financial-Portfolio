"""The full IPO record (finlit/iporecord.py), NSE's book by category (finlit/iponse.py), the job that stores both (finlit/ipogmp.refresh) and the
all-IPOs table and IPO report endpoints (finlit/ipoapi.py). Figures follow BLS Polymers (Oct 2026), as InvestorGain and NSE published them."""
import json
from datetime import date

import pytest

from finlit import ipoapi, ipogmp, iponse, iporecord

FIN = ("<div class='row'><div class='col-md-12'><h2 itemProp='about'>Company Financials (Restated Consolidated)</h2><table>"
       "<tr><td>Period Ended</td><td>30 Jun 2026</td><td>31 Mar 2026</td><td>31 Mar 2025</td></tr>"
       "<tr><td>Assets</td><td>231.34</td><td>206.13</td><td>179.14</td></tr>"
       "<tr><td>Total Income</td><td>107.81</td><td>354.41</td><td>336.70</td></tr>"
       "<tr><td>Profit After Tax</td><td>10.23</td><td>27.01</td><td>21.14</td></tr>"
       "<tr><td>Amount in ₹ Crore</td></tr></table></div></div>")
OBJ = ("<table><tr><th>#</th><th>Issue Objects</th><th>Est Amt (₹ Cr.)</th></tr><tr><td>1</td><td>Funding working capital requirements</td><td>89.50</td></tr>"
       "<tr><td>2</td><td>General Corporate Purposes</td><td>62.94</td></tr><tr><td></td><td>Total</td><td>152.44</td></tr></table>")
RES = ("<table><tr><th></th><th>Investor Category</th><th>Shares</th><th>% of Total Issue</th><th>Max Allottees</th></tr>"
       "<tr><td>bNII &gt; ₹10L</td><td>17,00,000</td><td>10.00%</td><td>1,214</td></tr><tr><td>sNII</td><td>8,50,000</td><td>5.00%</td><td>607</td></tr>"
       "<tr><td>Retail</td><td>59,50,000</td><td>35.00%</td><td>59,500</td></tr></table>")
ANC = ("<table><tr><td>Bid Date</td><td>Oct 26, 2026</td></tr><tr><th>#</th><th>Anchor</th><th>Shares Allotted</th><th>Amt (₹ cr.)</th></tr>"
       "<tr><td>1</td><td>NAKSHATRA BHARAT VANTAGE FUND</td><td>11,02,000</td><td>16.53</td><td>21.61</td></tr>"
       "<tr><td>2</td><td>PINE OAK GLOBAL FUND</td><td>6,66,700</td><td>10.00</td><td>13.07</td></tr>"
       "<tr><td></td><td>17,68,700</td><td>26.54</td><td>34.68</td></tr></table>")


def ipo_data(**over):
    d = {"id": 1849, "company_name": "BLS Polymers Ltd.", "company_incorporation": "1991", "city_name": "Delhi", "company_sector": "Specialty Chemicals",
         "website": "https://www.blspolymers.com/", "ipo_category_sub": "IPO", "issue_process_type": "BB", "ipo_listing_at": "BSE, NSE", "face_value": 10,
         "issue_price_lower": "142.00", "issue_price_upper": "150.00", "issue_price_final": "150.00", "market_lot_size": 100, "min_order_amount": "15000",
         "max_retail_qty": "1400 shares (14 lots)", "min_hni_qty": "1400 shares (14 lots)", "min_hni_amt": 210000, "min_bhni_qty": "6700 shares (67 lots)",
         "min_bhni_amt": 1005000, "ttl_issue_size_in_shares": 17000000, "ttl_issue_size_fresh_in_shares": 17000000, "ttl_issue_size_fresh_in_amt": "2550000000.00",
         "ttl_issue_size_ofs_in_amt": "0.00", "issue_size_in_amt": "2550000000.00", "total_shareholding_pre_issue": 45031834, "total_shareholding_post_issue": 62031834,
         "promoter_shareholding_pre_issue": "98.53", "promoter_shareholding_post_issue": "71.53", "market_cap": "930.48", "pe_ratio": 25, "post_pe_ratio": 22.73,
         "kpi_eps": "6.00", "kpi_eps_post": "6.60",
         "shares_offered_anchor_investor": 5100000, "shares_offered_qib_ex_anchor": 3400000, "shares_offered_nii": 2550000, "shares_offered_small_nii": 850000,
         "shares_offered_big_nii": 1700000, "shares_offered_rii": 5950000, "shares_offered_total": 17000000, "shares_offered_emp": 0,
         "timetable_anchor_bid_dt": "2026-10-26T00:00:00.000Z", "issue_open_dt_json": "2026-10-27", "issue_end_dt_json": "2026-10-29",
         "timetable_boa_dt": "2026-10-30T00:00:00.000Z", "timetable_refunds_dt": "2026-11-02T00:00:00.000Z", "timetable_share_credit_dt": "2026-11-02T00:00:00.000Z",
         "ipo_listing_date": "2026-11-03T00:00:00.000Z", "timetable_anchor_lockin_end_dt_1": "2026-11-28T00:00:00.000Z",
         "prospectus_drhp": "https://nsearchives.nseindia.com/corporate/x.pdf", "prospectus_rhp": "https://www.sebi.gov.in/filings/public-issues/oct-2026/x-rhp.html",
         "final_prospectus": "javascript:alert(1)", "ipo_allotment_url": "https://ipostatus.kfintech.com/",
         "kpi_as_of_date": "2026-03-31", "kpi_roe": "33.17", "kpi_roce": "29.51", "kpi_debt_equity": "0.56", "kpi_ronw": "28.45", "kpi_pat_margin": "7.73",
         "kpi_ebitda": "13.33", "nav": "21.08", "price_to_book_value": "7.12", "kpi_as_of_date_2": "", "kpi_roe_2": "",
         "promoters": "<p>Vinod Aggarwal, Sushil Aggarwal, Madhukar Aggarwal</p>",
         "financial": "$2f", "issue_objects": "$30", "ipo_reservation_desc": "$33", "anchor_investor_detail": "$32"}
    d.update(over)
    return d


def page(data=None, chunks=None):
    """An InvestorGain IPO page in the shape the reader uses: the Next.js stream with the IPO record and its text chunks ("<ref>:T<hex bytes>,<text>")."""
    data = data or ipo_data()
    chunks = {"2f": FIN, "30": OBJ, "33": RES, "32": ANC} if chunks is None else chunks
    stream = json.dumps({"ipoData": [data], "ipoLeadManagersList": [{"id": 1, "comp_name": "Unistone Capital Pvt.Ltd."}],
                         "registrarInfo": [{"id": 2, "registrar_name": "Kfin Technologies Ltd."}]}, separators=(",", ":"))
    for ref, t in chunks.items():
        stream += "\n%s:T%x,%s" % (ref, len(t.encode("utf-8")), t)
    return f"<html><body><script>self.__next_f.push([1,{json.dumps(stream)}])</script></body></html>"


def test_the_record_reads_as_the_offer_document_says():
    r = iporecord.parse_detail(page())
    i = r["issue"]
    assert (i["kind"], i["board"], i["exchanges"]) == ("Book built", "Mainboard", ["BSE", "NSE"])
    assert (i["priceLow"], i["priceHigh"], i["issuePrice"], i["lotSize"], i["minAmount"]) == (142.0, 150.0, 150.0, 100.0, 15000.0)
    assert (i["totalCr"], i["freshCr"], i["ofsCr"], i["promoterPre"], i["promoterPost"]) == (255.0, 255.0, None, 98.53, 71.53)
    assert (i["sniiMinShares"], i["bniiMinShares"], i["bniiMinAmount"]) == (1400.0, 6700.0, 1005000.0)
    res = r["reservation"]
    assert res["total"] == 17000000 and [x["key"] for x in res["rows"]] == ["anchor", "qib", "bnii", "snii", "retail"]   # NII shown as its two parts, employees (0) left out
    assert [x["pct"] for x in res["rows"]] == [30.0, 20.0, 10.0, 5.0, 35.0] and round(sum(x["pct"] for x in res["rows"]), 2) == 100.0
    assert {x["key"]: x.get("maxAllottees") for x in res["rows"]} == {"anchor": None, "qib": None, "bnii": 1214.0, "snii": 607.0, "retail": 59500.0}
    assert r["timetable"] == {"anchorBid": "2026-10-26", "open": "2026-10-27", "close": "2026-10-29", "allotment": "2026-10-30", "refunds": "2026-11-02",
                              "credit": "2026-11-02", "listing": "2026-11-03", "anchorLockin30": "2026-11-28", "anchorLockin90": None}
    assert r["documents"]["rhp"].startswith("https://www.sebi.gov.in/") and r["documents"]["prospectus"] is None       # only http(s) links are kept
    assert r["people"] == {"registrar": "Kfin Technologies Ltd.", "allotmentUrl": "https://ipostatus.kfintech.com/", "leadManagers": ["Unistone Capital Pvt.Ltd."]}
    assert r["company"]["promoters"] == ["Vinod Aggarwal", "Sushil Aggarwal", "Madhukar Aggarwal"] and r["company"]["incorporated"] == "1991"
    assert r["kpis"] == [{"asOf": "2026-03-31", "roe": 33.17, "roce": 29.51, "debtEquity": 0.56, "ronw": 28.45, "patMargin": 7.73, "ebitdaMargin": 13.33,
                          "nav": 21.08, "priceToBook": 7.12}]
    f = r["financials"]
    assert f["basis"] == "Restated Consolidated" and f["unit"] == "₹ crore" and f["periods"] == ["2026-06-30", "2026-03-31", "2025-03-31"]
    assert f["rows"][2] == {"label": "Profit After Tax", "values": [10.23, 27.01, 21.14]} and len(f["rows"]) == 3
    assert r["objects"] == [{"label": "Funding working capital requirements", "amountCr": 89.5}, {"label": "General Corporate Purposes", "amountCr": 62.94}]
    a = r["anchors"]
    assert (a["count"], a["shares"], a["amountCr"]) == (2, 1768700.0, 26.54) and a["investors"][0]["name"] == "NAKSHATRA BHARAT VANTAGE FUND"


def test_sme_offer_for_sale_and_missing_parts():
    d = ipo_data(ipo_category_sub="SME", issue_process_type="FP", ipo_listing_at="NSE SME", ttl_issue_size_fresh_in_amt="0", issue_size_fresh_in_amt="0",
                 ttl_issue_size_ofs_in_amt="150000000", issue_size_in_amt="142500000", shares_offered_market_maker=60000)
    r = iporecord.parse_detail(page(d, chunks={}))
    assert (r["issue"]["board"], r["issue"]["kind"], r["issue"]["exchanges"]) == ("SME", "Fixed price", ["NSE SME"])
    assert (r["issue"]["totalCr"], r["issue"]["freshCr"], r["issue"]["ofsCr"]) == (15.0, None, 15.0)     # the market maker's portion counted in the issue
    assert "market_maker" in [x["key"] for x in r["reservation"]["rows"]]
    assert r["financials"] is None and r["objects"] is None and r["anchors"] is None                       # chunks not on the page: nothing made up
    assert iporecord.parse_detail("<html>no record</html>") is None


def test_dates_and_numbers():
    assert [iporecord.day(x) for x in ("2026-10-27T00:00:00.000Z", "3rd Nov 2026", "", None, "soon")] == ["2026-10-27", "2026-11-03", None, None, None]
    assert [iporecord.num(x) for x in ("1,19,00,000", "&#8377;255.00 Cr", "NA", None, 25)] == [11900000.0, 255.0, None, None, 25.0]
    assert iporecord.pos("0.00") is None and iporecord.cr("2550000000.00") == 255.0


BOOK = {"metaInfo": {"symbol": "BLSPOLY", "listingDate": "2026-11-03"}, "activeCat": {"dataList": [
    {"category": "Category", "noOfShareOffered": "No.of shares offered/reserved", "noOfSharesBid": "No. of shares bid for", "noOfTotalMeant": "No. of times", "srNo": "Sr.No."},
    {"category": "Qualified Institutional Buyers(QIBs)", "noOfShareOffered": "3400000", "noOfSharesBid": "680857700", "noOfTotalMeant": "200.25226470588234", "srNo": "1"},
    {"category": "Foreign Institutional Investors(FIIs)", "noOfShareOffered": "", "noOfSharesBid": "91090400", "noOfTotalMeant": "", "srNo": "1(a)"},
    {"category": "Non Institutional Investors", "noOfShareOffered": "2550000", "noOfSharesBid": "1425967000", "noOfTotalMeant": "559.2027", "srNo": "2"},
    {"category": "Non Institutional Investors(Bid amount of more than Ten Lakh Rupees)", "noOfShareOffered": "1700000", "noOfSharesBid": "1", "noOfTotalMeant": "592.832", "srNo": "2.1"},
    {"category": "Non Institutional Investors(Bid amount of more than Two Lakh Rupees upto Ten Lakh Rupees)", "noOfShareOffered": "850000", "noOfSharesBid": "1", "noOfTotalMeant": "491.946", "srNo": "2.2"},
    {"category": "Retail Individual Investors(RIIs)", "noOfShareOffered": "5950000", "noOfSharesBid": "763730000", "noOfTotalMeant": "128.358", "srNo": "3"},
    {"category": "Total", "noOfShareOffered": "1.19E7", "noOfSharesBid": "2870554700", "noOfTotalMeant": "241.223", "srNo": None}]},
    "demandGraphALL": {"graphData": [{"type": "142", "value": "16.23"}, {"type": "150", "value": "21848.175"}, {"type": "Cut-off", "value": "6880.726"}]}}


def test_nse_book_by_category():
    b = iponse.parse(BOOK)
    assert b["total"] == 241.22 and [(c["key"], c["times"]) for c in b["categories"]] == [("qib", 200.25), ("nii", 559.2), ("bnii", 592.83), ("snii", 491.95), ("retail", 128.36)]
    assert b["demand"][-1] == {"price": "Cut-off", "lakhShares": 6880.726} and b["symbol"] == "BLSPOLY"
    zero = json.loads(json.dumps(BOOK).replace("200.25226470588234", "0").replace("559.2027", "0").replace("592.832", "0").replace("491.946", "0")
                      .replace("128.358", "0").replace("241.223", "0"))
    assert iponse.parse(zero) is None and iponse.parse({}) is None and iponse.parse([]) is None          # SME issues: NSE's figures are all zeros


def test_adjustment_for_later_splits_and_bonuses():
    assert ipoapi.adjustment(248.0, 248.0) == 1.0 and ipoapi.adjustment(249.5, 248.0) == 1.0                      # within 2%: nothing adjusted
    assert ipoapi.adjustment(124.0, 248.0) == 0.5                                                                  # a 1:1 bonus or 2-for-1 split since
    assert ipoapi.adjustment(300.0, 248.0) is None and ipoapi.adjustment(None, 248.0) is None                      # a mismatch, or no open: not adjusted
    base = {"ig_id": 1, "name": "X", "nse": "X", "bse": None, "board": "mainboard", "sector": None, "issue_price": 150, "listing_price": 248, "listing_date": date(2026, 11, 3),
            "subscription": None, "issue_size_cr": None, "gmp": None, "gmp_pct": None, "listing_pct": 65.33, "listed": True, "open_date": None, "close_date": None,
            "issue": None, "tt": None, "cats": None, "listing_open": 124.0, "listing_close": 127.75, "last_close": 115.5, "last_day": date(2026, 11, 20),
            "quote_price": None, "quote_at": None}
    r = ipoapi.row(base, date(2026, 11, 21))
    assert (r["listingClosePct"], r["sinceIpoPct"], r["adjustedBy"]) == (70.33, 54.0, 0.5)                          # the same as before the split
    from datetime import datetime, timezone
    q = {**base, "listing_open": None, "listing_close": None, "last_close": None, "last_day": None, "quote_price": 231.0, "quote_at": datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc)}
    r = ipoapi.row(q, date(2026, 11, 21))
    assert (r["lastClose"], r["lastDay"], r["sinceIpoPct"]) == (231.0, "2026-11-20", 54.0)                         # no daily closes: the nightly quote, within a year
    r = ipoapi.row({**q, "listing_date": date(2024, 11, 3)}, date(2026, 11, 21))
    assert (r["lastClose"], r["sinceIpoPct"]) == (None, None)                                                         # older: not used (it is not split-adjusted)


def test_status_of_an_issue():
    t = date(2026, 11, 21)
    assert ipoapi.status(False, False, date(2026, 11, 25), date(2026, 11, 27), t) == "upcoming"
    assert ipoapi.status(False, False, date(2026, 11, 19), date(2026, 11, 23), t) == "open"
    assert ipoapi.status(False, False, date(2026, 11, 14), date(2026, 11, 18), t) == "closed"
    assert ipoapi.status(False, False, date(2026, 8, 1), date(2026, 8, 3), t) == "not_listed"
    assert ipoapi.status(True, False, None, None, t) == "listed" and ipoapi.status(False, True, None, None, t) == "withdrawn"


# ------------------------------------------------------------------------------------------------ the job and the API, against Postgres
from test_auth import app  # noqa: F401,E402
from test_integration import ingested, make_settings, store  # noqa: F401,E402
from test_ipogmp import page as gmp_page  # noqa: E402


class FakeNse:
    def __init__(self):
        self.asked = []

    async def ipo(self, symbol):
        self.asked.append(symbol)
        return iponse.parse(BOOK) if symbol == "BLSPOLY" else None

    async def aclose(self):
        pass


@pytest.mark.integration
async def test_job_stores_the_record_and_the_nse_book_and_the_api_serves_them(app):  # noqa: F811
    import httpx
    from httpx import ASGITransport, AsyncClient
    full = gmp_page().replace("</body>", page()[page().index("<script>"):])          # one page: the GMP parts and the full record
    sitemap = "<loc>https://www.investorgain.com/gmp/bls-polymers-ipo/1849/</loc>"

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=sitemap if "sitemap" in str(req.url) else full)

    store_ = app.state.store
    async with store_.pool.acquire() as conn:
        await conn.execute("DELETE FROM ipo_gmp")
        await conn.execute("DELETE FROM price_daily WHERE symbol = 'BLSPOLY'")
        await conn.execute("INSERT INTO price_daily (symbol, day, open, high, low, close) VALUES ('BLSPOLY', '2026-11-03', 248, 260, 240, 255.5), "
                           "('BLSPOLY', '2026-11-20', 230, 232, 228, 231.0)")
    nse = FakeNse()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        out = await ipogmp.refresh(store_, pause_s=0, http=http, nse=nse)
        assert (out["stored"], out["listed"], out["withDetail"], out["nseAsked"], out["nseBooks"]) == (1, 1, 1, 1, 1) and nse.asked == ["BLSPOLY"]
        again = await ipogmp.refresh(store_, pause_s=0, http=http, nse=nse)
        assert again["read"] == 0 and again["nseAsked"] == 0                                   # listed with its record, and NSE asked once: nothing read again
    ipoapi._history.update(t=0.0, body=None)                                                    # the five-minute copy would hide this test's rows
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        h = (await c.get("/api/ipos/history")).json()
        row = h["items"][0]
        assert (row["id"], row["status"], row["openDate"], row["listingDate"], row["issuePrice"], row["issueSizeCr"]) == (1849, "listed", "2026-10-27", "2026-11-03", 150.0, 255.0)
        assert (row["subscription"], row["subQib"], row["subNii"], row["subRetail"]) == (241.22, 200.25, 559.2, 128.36)
        assert (row["listingPct"], row["listingClose"], row["listingClosePct"], row["lastClose"], row["sinceIpoPct"]) == (65.33, 255.5, 70.33, 231.0, 54.0)
        assert h["sources"]["nse"]["name"] == "NSE" and "unofficial" in h["note"]
        assert (h["coverage"]["listed"], h["coverage"]["nseBooks"], h["coverage"]["day1"]) == (1, 1, 0)       # what the sources have given so far
        r = (await c.get("/api/ipos/record/1849")).json()
        assert r["detail"]["reservation"]["rows"][0]["key"] == "anchor" and r["nseBook"]["total"] == 241.22 and [g["gmp"] for g in r["gmpHistory"]] == [18.0, 69.0]
        assert (await c.get("/api/ipos/record/99999")).status_code == 404 and (await c.get("/api/ipos/record/0")).status_code == 422
