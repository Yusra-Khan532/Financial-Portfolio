"""The IPO calendar completed from the IPO record (finlit/ipoapi.complete_calendar): what the provider's row lacks is filled, nothing it has is changed."""
from datetime import date

from finlit import ipoapi

REC = {"ig_id": 2241, "name": "HGS (India)", "nse": "HGSINDIALT", "bse": None, "board": "sme", "sector": "Industrial Products", "issue_price": 120, "listing_price": 160,
       "listing_date": date(2026, 11, 6), "subscription": 248.58, "issue_size_cr": 34.56, "gmp": 27, "gmp_pct": 22.5, "listed": True, "open_date": date(2026, 10, 30),
       "close_date": date(2026, 11, 3), "day1_open": 161.5, "day1_close": 169.0,
       "detail": {"issue": {"lotSize": 1200, "totalCr": 34.56, "kind": "Book built", "exchanges": ["NSE SME"], "issuePrice": 120, "freshCr": 27.91, "ofsCr": 6.65},
                  "timetable": {"allotment": "2026-11-04", "listing": "2026-11-06"}, "people": {"registrar": "Kfin Technologies Ltd.", "leadManagers": ["Hem Securities Ltd."]},
                  "documents": {"rhp": "https://www.sebi.gov.in/x.html"}, "company": {}},
       "nse_book": None}
CAL = {"id": 73083, "name": "HGS (India) Limited", "symbol": "HGSINDIALT", "kind": "sme", "sector": None, "status": "closed", "openDate": "2026-10-30", "closeDate": "2026-11-03",
       "listingDate": None, "priceLow": 114.0, "priceHigh": 120.0, "lotSize": None, "issueSizeCr": None, "listingPrice": None, "details": {"exchange": ["NSE"], "statusText": "Listed"}}


def index(recs):
    by_sym, by_name = {}, {}
    for r in recs:
        for s in (r["nse"], r["bse"]):
            if s:
                by_sym[s.upper()] = r
        by_name.setdefault(ipoapi._norm(r["name"]), []).append(r)
    return by_sym, by_name


def test_a_listed_issue_the_provider_left_closed_is_completed():
    by_sym, by_name = index([REC])
    r = ipoapi.match(CAL, [REC], by_sym, by_name)
    out = ipoapi.complete(CAL, r, date(2026, 11, 22))
    assert (out["status"], out["lotSize"], out["sector"], out["listingDate"], out["listingPrice"], out["issueSizeCr"], out["recordId"]) == \
           ("listed", 1200, "Industrial Products", "2026-11-06", 161.5, 34.56, 2241)          # the exchange's open, not InvestorGain's 160
    d = out["details"]
    assert d["exchange"] == ["NSE"] and d["subscription"] == {"overall": 248.58} and d["registrar"] == "Kfin Technologies Ltd." and d["docs"] == {"rhp": "https://www.sebi.gov.in/x.html"}
    assert d["gmp"] == {"rupees": 27.0, "pct": 22.5, "source": "InvestorGain"}


def test_matching_by_name_needs_the_same_bidding_week():
    rec = {**REC, "nse": None}
    by_sym, by_name = index([rec])
    assert ipoapi.match({**CAL, "symbol": None}, [rec], by_sym, by_name) is rec
    assert ipoapi.match({**CAL, "symbol": None, "openDate": "2025-10-30"}, [rec], by_sym, by_name) is None
    assert ipoapi.match({**CAL, "symbol": None, "name": "Other Co Ltd"}, [rec], by_sym, by_name) is None
