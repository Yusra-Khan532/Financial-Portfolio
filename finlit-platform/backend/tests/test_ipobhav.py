"""Listing-day prices and the latest close from the exchanges' daily price files (finlit/ipobhav.py), and how the IPO API uses them."""
import io
import zipfile
from datetime import date

import pytest

from finlit import ipoapi, ipobhav

NSE = """SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER
BLSPOLY, EQ, 03-Nov-2026, 150.00, 248.00, 285.00, 225.00, 272.00, 268.80, 265.38, 79314574, 210482.39, 729955, 12988772, 16.38
BLSPOLY, BL, 03-Nov-2026, 150.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1, 1, 1, 1, 1
SMECO, SM, 03-Nov-2026, 90.00, 95.00, 99.75, 90.25, 99.75, 99.75, 97.00, 100000, 97.00, 120, -, -
"""
BSE_NEW = """TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric
2026-11-03,2026-11-03,CM,BSE,STK,545010,INE0WISC01015,WISCON,MT,,,,,WISCON INDUSTRIES LTD,204.00,214.20,196.00,203.55,203.55
"""
BSE_OLD = """SC_CODE,SC_NAME,SC_GROUP,SC_TYPE,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,NO_TRADES,NO_OF_SHRS,NET_TURNOV,TDCLOINDI,ISIN_CODE,TRADING_DATE,FILLER2,FILLER3
543270,MTARTECH    ,B ,Q,1063.90,1154.00,1035.70,1082.25,1082.25,0.00,105505,1630020,1783143252.00,,INE864I01014,15-Mar-21,,
"""


def old_zip(text: str) -> bytes:
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("EQ_ISINCODE_150321.CSV", text)
    return b.getvalue()


def test_the_files_read_as_the_exchanges_publish_them():
    n = ipobhav.nse_rows(NSE)
    assert n["BLSPOLY"] == (248.0, 285.0, 225.0, 268.8) and n["SMECO"] == (95.0, 99.75, 90.25, 99.75)        # EQ, not the block-deal series; SME's SM
    b = ipobhav.bse_rows(BSE_NEW)
    assert b["545010"] == (204.0, 214.2, 196.0, 203.55) and b["INE0WISC01015"] == b["545010"]
    o = ipobhav.bse_rows(ipobhav.bse_old_text(old_zip(BSE_OLD)))
    assert o["543270"] == (1063.9, 1154.0, 1035.7, 1082.25)


def test_pick_nse_first_then_bse_by_code_then_isin():
    n, b = ipobhav.nse_rows(NSE), ipobhav.bse_rows(BSE_NEW)
    assert ipobhav.pick({"nse": "BLSPOLY", "bse": "545011"}, n, b)[1] == "NSE"
    assert ipobhav.pick({"nse": None, "bse": "545010"}, n, b) == ((204.0, 214.2, 196.0, 203.55), "BSE")
    assert ipobhav.pick({"nse": None, "bse": None, "isin": "ine0wisc01015"}, n, b)[1] == "BSE"
    assert ipobhav.pick({"nse": "NOPE", "bse": "1"}, n, b) is None


def test_the_api_uses_the_exchange_day1_close_and_the_latest_file_close():
    base = {"ig_id": 1, "name": "X", "nse": None, "bse": "545010", "board": "sme", "sector": None, "issue_price": 204, "listing_price": 204, "listing_date": date(2026, 11, 3),
            "subscription": None, "issue_size_cr": None, "gmp": None, "gmp_pct": None, "listing_pct": 0.0, "listed": True, "open_date": None, "close_date": None,
            "issue": None, "tt": None, "cats": None, "listing_open": None, "listing_close": None, "last_close": None, "last_day": None,
            "day1_open": 204, "day1_high": 214.2, "day1_low": 196, "day1_close": 203.55, "day1_src": "BSE", "last_px": 180.0, "last_px_date": date(2026, 11, 20)}
    r = ipoapi.row(base, date(2026, 11, 21))
    assert (r["listingClose"], r["listingClosePct"], r["day1"]["high"], r["day1"]["source"]) == (203.55, -0.22, 214.2, "BSE")
    assert (r["lastClose"], r["lastDay"], r["sinceIpoPct"]) == (180.0, "2026-11-20", -11.76)
    old = ipoapi.row({**base, "listing_date": date(2023, 11, 3)}, date(2026, 11, 21))
    assert old["listingClosePct"] == -0.22 and old["sinceIpoPct"] is None                 # day 1 is as traded; a 3-year-old close is not split-adjusted


# ------------------------------------------------------------------------------------------------ the job, against Postgres
from test_auth import app  # noqa: F401,E402
from test_integration import ingested, make_settings, store  # noqa: F401,E402


@pytest.mark.integration
async def test_job_reads_each_listing_date_once_and_the_latest_close(app):  # noqa: F811
    import httpx
    asked = []

    def handler(req: httpx.Request) -> httpx.Response:
        u = str(req.url)
        asked.append(u)
        if "sec_bhavdata_full_03112026" in u:
            return httpx.Response(200, text=NSE, headers={"content-type": "text/csv"})
        if "BhavCopy_BSE_CM_0_0_0_20261103" in u:
            return httpx.Response(200, text=BSE_NEW, headers={"content-type": "text/csv"})
        if "EQ_ISINCODE_150321" in u:
            return httpx.Response(200, content=old_zip(BSE_OLD), headers={"content-type": "application/zip"})
        if "sec_bhavdata_full_20112026" in u:
            return httpx.Response(200, text=NSE.replace("268.80", "231.00"), headers={"content-type": "text/csv"})
        if "20261120" in u:
            return httpx.Response(200, text=BSE_NEW.replace("203.55", "180.00"), headers={"content-type": "text/csv"})
        return httpx.Response(404, text="<!DOCTYPE html>", headers={"content-type": "text/html"})

    rows = [(1, "BLSPOLY", "545011", "2026-11-03"), (2, None, "545010", "2026-11-03"), (3, None, "543270", "2021-03-15"), (4, "GONE", None, "2026-11-03")]
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM ipo_gmp")
        for i, n, b, d in rows:
            await conn.execute("INSERT INTO ipo_gmp (ig_id, url, name, nse, bse, board, issue_price, listed, listing_date) VALUES ($1, 'u', 'X', $2, $3, 'mainboard', 100, true, $4)",
                               i, n, b, date.fromisoformat(d))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        out = await ipobhav.refresh(app.state.store, pause_s=0, http=http, today=date(2026, 11, 21))
        assert (out["dates"], out["day1"], out["missing"], out["latestDate"]) == (2, 3, 1, "2026-11-20")
        async with app.state.store.pool.acquire() as conn:
            got = {r["ig_id"]: (float(r["day1_close"]) if r["day1_close"] else None, r["day1_src"], float(r["last_px"]) if r["last_px"] else None)
                   for r in await conn.fetch("SELECT ig_id, day1_close, day1_src, last_px FROM ipo_gmp")}
        assert got == {1: (268.8, "NSE", 231.0), 2: (203.55, "BSE", 180.0), 3: (1082.25, "BSE", None), 4: (None, None, None)}
        asked.clear()
        again = await ipobhav.refresh(app.state.store, pause_s=0, http=http, today=date(2026, 11, 21))
        assert again["dates"] == 0 and again["day1"] == 0 and asked == []                 # each date read once; the latest day stored already
