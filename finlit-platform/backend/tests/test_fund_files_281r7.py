"""Task #281 round 7: an administrator's upload of a fund house's monthly portfolio file (finlit/fund_files.py), for the houses whose sites refuse the server.

The owner's rule (21 Nov 2026): the job never disguises itself or goes around a block; a person's browser downloads the same public file and uploads it. The
file's type is checked from its bytes, the raw file is kept, and it is read by the nightly job's own reader for that house; a file nothing can be read from
is kept and says so, never claimed as read."""
import gzip
import io
import json
from datetime import date
from pathlib import Path

import pytest

from finlit import fund_files as F
from finlit import portfolios
from finlit.disclosure_parsers import houses_e
from test_holdings_r4a_281 import _Page
from test_portfolios import store  # noqa: F401

FX = Path(__file__).parent / "fixtures" / "disclosure"
TODAY = date(2026, 11, 21)


def _xlsx(rows) -> bytes:
    """A one-sheet workbook from a fixture sheet's rows (what a fund house's monthly portfolio file holds)."""
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append([None if v == "" else v for v in r])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ------------------------------------------------------------------------------------------------------------ pure helpers
def test_the_file_type_comes_from_its_bytes_never_its_name():
    assert F.kind_of(b"%PDF-1.7\n...") == "pdf"
    assert F.kind_of(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 20) == "xls"
    assert F.kind_of(_xlsx([["a"]])) == "xlsx"
    z = io.BytesIO()
    import zipfile
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("Kotak Monthly Portfolio.xlsx", _xlsx([["a"]]))
    assert F.kind_of(z.getvalue()) == "zip"
    assert F.kind_of(b"<html><body>Access denied</body></html>") is None          # a saved error page is refused, whatever its name
    assert F.kind_of(b"PK\x03\x04 not really a zip") is None


def test_months_and_the_month_due():
    assert F.month_end("2026-10") == date(2026, 10, 31) and F.month_end("2024-02") == date(2024, 2, 29) and F.month_end("2026-13") is None
    assert F.month_due(date(2026, 11, 21)) == date(2026, 10, 31)        # October's file is due by 10 November
    assert F.month_due(date(2026, 11, 5)) == date(2026, 9, 30)          # before the 10th, September's is the newest due


def test_the_blocked_houses_are_listed_first_with_their_reason():
    hs = F.houses()
    assert [h.key for h in hs[:6]] == ["hdfc", "kotak", "edelweiss", "navi", "union", "barodabnp"]
    assert all(h.why and h.page.startswith("https://") for h in hs[:6])
    assert any(h.key == "sbi" for h in hs[6:])                           # every nightly house can be uploaded too


# ------------------------------------------------------------------------------------------------------------ reading an upload
async def test_a_workbook_upload_is_read_by_the_nightly_reader_and_stored(store):  # noqa: F811
    data = _xlsx(json.loads((FX / "sbi_automotive_2026_09.json").read_text()))
    r = await F.store_file(store.pool, F.house_of("sbi"), date(2026, 9, 30), "SBI Monthly Portfolio Sep 2026.xlsx", data, "xlsx", "boss@example.com")
    assert r["status"] == "read" and r["stored"] == 1 and r["reader"] == "monthly portfolio workbook reader", r
    assert r["schemes"][0]["scheme"] == "SBI Automotive Opportunities Fund" and r["schemes"][0]["asOf"] == "2026-09-30"
    port = await portfolios.get_portfolio(store.pool, 152655)            # the fund page shows it like the nightly job's
    assert port["asOf"] == "2026-09-30" and len(port["holdings"]) >= 30
    async with store.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT house, month_end, kind, size_bytes, sha256, content, uploaded_by, status FROM fund_house_files WHERE id = $1", r["id"])
    assert row["house"] == "sbi" and row["kind"] == "xlsx" and bytes(row["content"]) == data and row["uploaded_by"] == "boss@example.com"
    again = await F.store_file(store.pool, F.house_of("sbi"), date(2026, 9, 30), "same file.xlsx", data, "xlsx", "boss@example.com")
    assert again["again"] is True and again["id"] == r["id"]                # the same file twice is one stored file


async def test_a_file_nothing_can_be_read_from_is_kept_and_says_so(store):  # noqa: F811
    data = _xlsx([["Kotak Mahindra Mutual Fund"], ["A layout no reader knows yet"], ["x", 1, 2]])
    r = await F.store_file(store.pool, F.house_of("kotak"), date(2026, 10, 31), "Kotak portfolio Oct 2026.xlsx", data, "xlsx", "boss@example.com")
    assert r["status"] == "stored, no reader" and r["stored"] == 0 and "being built" in r["why"]
    async with store.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT house, status, content FROM fund_house_files WHERE id = $1", r["id"])
        assert row["house"] == "kotak" and row["status"] == "stored, no reader" and bytes(row["content"]) == data   # the file is kept
        assert await conn.fetchval("SELECT count(*) FROM disclosure_portfolios") == 0        # nothing is claimed or shown


async def test_hdfc_factsheet_pdf_upload_is_read_by_the_factsheet_reader(store, monkeypatch):  # noqa: F811
    async with store.pool.acquire() as conn:
        for code, plan in ((101762, "Regular"), (118955, "Direct")):
            await conn.execute("""INSERT INTO mf_schemes (code, name, amc, scheme_type, category, plan, option_class, family, active)
                                  VALUES ($1, 'HDFC Flexi Cap Fund', 'HDFC Mutual Fund', 'Open Ended', 'Equity Scheme - Flexi Cap Fund', $2, 'Growth',
                                          'hdfc|Equity Scheme - Flexi Cap Fund|hdfc flexi cap fund', true)""", code, plan)

    def from_fixture(path, as_of, source, url, title_re=None):      # the round-4a fixture: the pages' characters as pdfplumber gives them
        assert open(path, "rb").read(5) == b"%PDF-"
        with gzip.open(FX / "hdfc_flexicap_factsheet_2026_09.json.gz", "rt", encoding="utf-8") as fh:
            pages = [_Page(d) for d in json.load(fh)]
        return houses_e.read_pages(pages, as_of, source, url, title_re)
    monkeypatch.setattr(houses_e, "factsheet_portfolios", from_fixture)
    monkeypatch.setattr(portfolios, "_today", lambda: TODAY)
    r = await F.store_file(store.pool, F.house_of("hdfc"), date(2026, 9, 30), "HDFC MF Factsheet - September 2026.pdf", b"%PDF-1.7\n%fixture", "pdf", "a@b")
    assert r["status"] == "read" and r["stored"] == 1 and r["reader"] == "factsheet PDF reader", r
    port = await portfolios.get_portfolio(store.pool, 118955)
    top = max(port["holdings"], key=lambda h: h["pct"] if "pct" in h else h.get("pctNav", 0))
    assert port["asOf"] == "2026-09-30" and "ICICI Bank" in json.dumps(top)


async def test_a_pdf_for_an_excel_house_is_kept_not_read(store):  # noqa: F811
    r = await F.store_file(store.pool, F.house_of("kotak"), date(2026, 10, 31), "Kotak factsheet.pdf", b"%PDF-1.7\nx", "pdf", "a@b")
    assert r["status"] == "stored, no reader" and r["stored"] == 0 and "Excel" in r["why"]


async def test_data_health_lists_what_each_blocked_house_needs(store):  # noqa: F811
    data = _xlsx(json.loads((FX / "sbi_automotive_2026_09.json").read_text()))
    await F.store_file(store.pool, F.house_of("sbi"), date(2026, 9, 30), "sbi.xlsx", data, "xlsx", "a@b")
    o = await F.overview(store.pool, TODAY)
    assert o["dueLabel"] == "October 2026"
    by = {h["key"]: h for h in o["houses"]}
    assert by["kotak"]["blocked"] and by["kotak"]["latest"] is None and by["kotak"]["needs"] == "October 2026"
    assert by["sbi"]["latest"] == "2026-09-30" and by["sbi"]["needs"] is None    # a house the nightly job reads is not asked for
    assert o["uploads"][0]["house"] == "sbi" and o["uploads"][0]["stored"] == 1
