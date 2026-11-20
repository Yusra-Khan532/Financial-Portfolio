"""Task #281 round 4b: holdings and expense ratios that were missing on the live site (20 Nov 2026), each with the shape of the real file that caused it.

- Tata: the portfolio links moved from betacms.tatamutualfund.com to www.tatamutualfund.com, so the lister found no file and no Tata scheme had holdings.
- Names written two ways by the fund house's file and AMFI (SBI 'Gilt Index-APR-2029' / 'Gilt Index - April 2029', Axis 'IBX50:50' / 'IBX 50:50',
  Nippon India 'Series 2' / 'Serie-II', Aditya Birla 'BONDS ETFS' / 'Bond ETFs', Motilal Oswal 'Passive FOF' / 'Fund of Funds').
- ICICI Prudential's Liquid and Overnight sheets: a 'Reverse Repo' line carrying the sum of the dated repo lines below it (counted twice: 195 %), and the
  repo deal numbers ('GSECREPO1183') in the ISIN column (13 'ISINs' failing the check digit: the sheet was refused).
- AMFI's TER file: rows dated in the future, and a fund house missing from one night's file.
"""

from __future__ import annotations

import io
from datetime import date, timedelta

import httpx
import pytest

from finlit import disclosure as d
from finlit import portfolios
from finlit.disclosure_parsers.houses_a import list_tata
from finlit.disclosure_parsers.model import validate
from finlit.disclosure_parsers.sebi import parse_rows
from test_mf import needs_db, store  # noqa: F401  (fixtures)

TODAY = date(2026, 11, 20)


# ------------------------------------------------------------------------------------------------------------ Tata's file links

async def test_tata_lister_reads_the_files_on_the_www_host():
    """The page embeds its document list as escaped JSON; since Nov 2026 the files sit on www.tatamutualfund.com (before: betacms.)."""
    page = ('{"docs":[{"url":"https://www.tatamutualfund.com/system/files/2026-11/Monthly%20Portfolio%20as%20on%2031st%20October%202026....xlsx\\"},'
            '{"url":"https://www.tatamutualfund.com/system/files/2026-10/Monthly%20Portfolio%20as%20on%2030th%20September%202026%20%281%29.xlsx\\"},'
            '{"url":"https://www.tatamutualfund.com/system/files/2025-11/Monthly%20Portfolio%20as%2031st%20October%202025.xlsx\\"},'
            '{"url":"https://betacms.tatamutualfund.com/system/files/2026-09/Monthly%20Portfolio%20as%20on%2031st%20August%202026.xlsx\\"}]}')
    transport = httpx.MockTransport(lambda req: httpx.Response(200, text=page))
    async with httpx.AsyncClient(transport=transport) as c:
        refs = await list_tata(c, [date(2026, 10, 31), date(2026, 9, 30), date(2026, 8, 31)])
    got = sorted((r.month_end, r.url.split("/")[2]) for r in refs)
    assert got == [(date(2026, 8, 31), "betacms.tatamutualfund.com"), (date(2026, 9, 30), "www.tatamutualfund.com"),
                   (date(2026, 10, 31), "www.tatamutualfund.com")], got


# ------------------------------------------------------------------------------------------------------------ names written two ways

AMFI = [   # (AMFI scheme name, fund house) as in AMFI's NAV file; the family key is what the job uses
    ("SBI CRISIL IBX Gilt Index - April 2029 Fund", "SBI Mutual Fund"),
    ("SBI CRISIL IBX SDL Index - September 2027 Fund", "SBI Mutual Fund"),
    ("SBI Crisil - IBX SDL Index - June 2034 Index Fund", "SBI Mutual Fund"),
    ("Axis CRISIL IBX 50:50 Gilt Plus SDL June 2028 Index Fund", "Axis Mutual Fund"),
    ("Axis Crisil IBX 50:50 Gilt Plus SDL September 2027 Index Fund", "Axis Mutual Fund"),
    ("Nippon India Interval Fund-Quarterly Interval Fund Serie-II", "Nippon India Mutual Fund"),
    ("Nippon India Interval Fund-Quarterly Interval Fund Serie-III", "Nippon India Mutual Fund"),
    ("Aditya Birla Sun Life US Treasury 1-3 Year Bond ETFs Passive FOF", "Aditya Birla Sun Life Mutual Fund"),
    ("Aditya Birla Sun Life US Treasury 3-10 Year Bond ETFs Passive FOF", "Aditya Birla Sun Life Mutual Fund"),
    ("Aditya Birla Sun Life Crisil IBX Gilt April 2033 Index Fund", "Aditya Birla Sun Life Mutual Fund"),
    ("Motilal Oswal Asset Allocation Fund of Fund- Conservative", "Motilal Oswal Mutual Fund"),
    ("Motilal Oswal Asset Allocation Fund of Fund- Aggressive", "Motilal Oswal Mutual Fund"),
    ("Motilal Oswal Diversified Equity Flexicap Passive Fund of Funds", "Motilal Oswal Mutual Fund"),
]


def _index():
    idx = portfolios.Index()
    for i, (name, amc) in enumerate(AMFI, 1):
        idx.add(i, name, amc, f"f{i}")
    return idx


@pytest.mark.parametrize("sheet_name, family", [
    ("SBI CRISIL IBX Gilt Index-APR-2029 Fund", "f1"),
    ("SBI CRISIL IBX SDL Index-Sept 2027 Fund", "f2"),
    ("SBI CRI IBX SDL Index-June 2034 Ind Fund", "f3"),
    ("Axis CRISIL IBX50:50 Gilt Plus SDL June 2028 Index Fund", "f4"),
    ("Axis CRISIL IBX50:50 Gilt Plus SDL Sep 2027 Index Fund", "f5"),
    ("Nippon India Quarterly Interval Fund-Series 2", "f6"),
    ("ADITYA BIRLA SUN LIFE US TREASURY 1-3 YEAR BONDS ETFS PASSIVE FOF", "f8"),
    ("ADITYA BIRLA SUN LIFE US TREASURY 3-10 YEAR BONDS ETFS PASSIVE FOF", "f9"),
    ("ADITYA BIRLA SUN LIFE CRISIL IBX GILT APR 2033 INDEX FUND", "f10"),
    ("Motilal Oswal Asset Allocation Passive Fund of Fund - Conservative", "f11"),
    ("Motilal Oswal Diversified Equity Flexicap Passive FOF", "f13"),
])
def test_a_fund_houses_spelling_finds_amfis_scheme(sheet_name, family):
    assert _index().resolve([sheet_name])[0] == family


def test_the_word_passive_is_ignored_only_when_nothing_else_matches():
    idx = portfolios.Index()
    idx.add(1, "X Nifty 50 Passive FOF", "X Mutual Fund", "passive")
    idx.add(2, "X Nifty 50 FOF", "X Mutual Fund", "plain")
    assert idx.resolve(["X Nifty 50 Passive FOF"])[0] == "passive"      # the exact name wins
    assert idx.resolve(["X Nifty 50 FOF"])[0] == "plain"
    one = portfolios.Index()
    one.add(1, "Y Asset Allocation FOF - Conservative", "Y Mutual Fund", "only")
    assert one.resolve(["Y Asset Allocation Passive FOF - Conservative"])[0] == "only"


@pytest.mark.parametrize("amfi, sheet", [
    ("DSP Nifty Midcap 150 Quality 50 Index Fund", "DSP Nifty Midcap 150 Qlty 50 Index Fund"),
    ("Groww Nifty Smallcap 250 Momentum Quality 100 Index Fund", "Groww Nifty Smallcap 250Mom Qlty100 Indx"),
    ("Groww Nifty EV & New Age Automotive ETF FOF", "Groww Nifty EV & New Age Auto ETF FOF"),
])
def test_shortened_words_in_a_sheet_name(amfi, sheet):
    idx = portfolios.Index()
    idx.add(1, amfi, "House Mutual Fund", "it")
    idx.add(2, "Something Else Fund", "House Mutual Fund", "other")
    assert idx.resolve([sheet])[0] == "it"


def test_one_active_scheme_wins_over_stopped_ones_of_the_same_name():
    """'JM Short Term Fund' is the name of the active scheme and of two stopped ones (other AMFI categories): the active one is meant."""
    idx = portfolios.Index()
    idx.add(150545, "JM Short Term Fund", "JM Financial Mutual Fund", "jm|Short Term|active", True)
    idx.add(101520, "JM Short Term Fund..", "JM Financial Mutual Fund", "jm|Short Duration|stopped", False)
    assert idx.resolve(["JM Short Term Fund"])[0] == "jm|Short Term|active"
    two = portfolios.Index()
    two.add(1, "K Fund", "K Mutual Fund", "a", True)
    two.add(2, "K Fund", "K Mutual Fund", "b", True)
    assert two.resolve(["K Fund"])[0] is None                            # two active ones: still refused, never guessed


async def test_carnelian_lists_its_monthly_portfolio_item():
    from finlit.disclosure_parsers.houses_c import list_carnelian
    page = ('{"items":[{"file":{"alt":null,"url":"/api/documents/file/Monthly_Portfolio_Carnelian%20Liquid%20Fund.xlsx?prefix=documents%2F01a0","width":null},'
            '"id":"6aec","label":"Scheme Related Disclosures","name":"Monthly_Portfolio_Carnelian Liquid Fund_October 2026"},'
            '{"file":{"alt":null,"url":"/api/documents/file/Fortnightly.xlsx?prefix=x","width":null},"id":"7","label":"x",'
            '"name":"Fortnightly_Portfolio_Carnelian Liquid Fund_October 2026"}]}').replace('"', '\\"')
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, text=page))) as c:
        refs = await list_carnelian(c, [date(2026, 10, 31)])
    assert [(r.month_end, r.url.split("?")[0].rsplit("/", 1)[-1]) for r in refs] == [(date(2026, 10, 31), "Monthly_Portfolio_Carnelian%20Liquid%20Fund.xlsx")]


def test_two_series_stay_two_schemes():
    idx = _index()
    assert idx.resolve(["Nippon India Quarterly Interval Fund-Series 3"])[0] == "f7"
    assert portfolios.name_key("Fund Series II") != portfolios.name_key("Fund Series III")


# ------------------------------------------------------------------------------------------------------------ ICICI's cash block

def _icici(*rows):
    head = [["ICICI Prudential Mutual Fund"], ["ICICI Prudential Overnight Fund"], ["Portfolio as on Oct 31,2026"],
            ["Company/Issuer/Instrument Name", "ISIN", "Coupon", "Industry/Rating", "Quantity", "Exposure/Market Value(Rs.Lakh)", "% to Nav", "Yield"]]
    return iter(head + [list(r) for r in rows])


def test_icici_reverse_repo_heading_and_deal_numbers():
    """The Overnight sheet of 31 Oct 2026, cut down: a 'Reverse Repo' line with the sum of the two dated repo lines under it, each carrying ICICI's deal
    number in the ISIN column (one of them happens to pass the ISIN check digit)."""
    p = parse_rows(_icici(
        ["Money Market Instruments", None, None, None, None, 50433.85, 0.0379398996238],
        ["Treasury Bills", None, None, None, None, 50433.85, 0.0379398996238],
        ["91 Days Treasury Bills", "IN002026X180", None, "SOV", 20000000.0, 50433.85, 0.0379398996238, 5.72],
        ["Reverse Repo", None, None, None, None, 1264331.44, 0.9511192963697],
        ["REVERSE REPO (11/2/2026)", "GSECREPO1186", None, None, None, 80175.99, 0.0603140353723],
        ["REVERSE REPO (11/2/2026)", "GSECREPO1183", None, None, None, 1184155.45, 0.8908052609973],
        ["TREPS", None, None, None, None, 15989.68, 0.0120285652239],
        ["Net Current Assets", None, None, None, None, -1445.9707760599, -0.0010877612180],
        ["Total Net Assets", None, None, None, None, 1329308.99922394, 0.9999999999994],
    ), "ICICI Prudential Mutual Fund", "https://example/x.xlsx")
    names = [(h.name, h.isin, h.asset_class) for h in p.holdings]
    assert ("Reverse Repo", None, "cash") not in names, names
    assert [n for n in names if n[0].startswith("REVERSE REPO")] == [("REVERSE REPO (11/2/2026)", None, "cash")] * 2
    assert abs(sum(h.pct_nav for h in p.holdings) - 100.0) < 0.01
    assert validate(p, TODAY).ok


def test_a_cash_line_equal_to_the_next_one_is_kept_when_its_name_is_not_their_heading():
    p = parse_rows(_icici(
        ["91 Days Treasury Bills", "IN002026X180", None, "SOV", 100.0, 500.0, 0.5],
        ["TREPS", None, None, None, None, 250.0, 0.25],
        ["Net Current Assets", None, None, None, None, 250.0, 0.25],
        ["Total Net Assets", None, None, None, None, 1000.0, 1.0],
    ), "x", "u")
    assert [h.name for h in p.holdings] == ["91 Days Treasury Bills", "TREPS", "Net Current Assets"]


# ------------------------------------------------------------------------------------------------------------ AMFI's TER file

def _ter_xlsx(rows) -> bytes:
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(d.TER_HEAD))
    for r in rows:
        ws.append(list(r))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_a_ter_row_dated_in_the_future_is_a_typo_and_skipped(tmp_path):
    p = tmp_path / "ter.xlsx"
    p.write_bytes(_ter_xlsx([("Nippon India Small Cap Fund", "Small Cap", "19-Nov-2026", 1.42, 0.65),
                             ("Nippon India Small Cap Fund", "Small Cap", "22-Nov-2026", 9.99, 9.99)]))
    rows = d.parse_ter_xlsx(str(p), latest=date(2026, 11, 21))
    r = rows[d.name_key("Nippon India Small Cap Fund")]
    assert (r.day, r.regular, r.direct) == (date(2026, 11, 19), 1.42, 0.65)


@needs_db
async def test_a_fund_house_missing_from_one_ter_file_keeps_its_recent_figures(store):  # noqa: F811
    def row(name, day, reg):
        return d.TerRow(d.name_key(name), name, "Equity", reg, reg / 2, day)
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM mf_ter")
    day1 = date(2026, 11, 8)
    first = {r.key: r for r in (row("Nippon India Small Cap Fund", day1, 1.4), row("HSBC Small Cap Fund", day1, 1.7),
                                row("Old Closed Fund", day1 - timedelta(days=60), 2.0))}
    assert (await d.store_ter(store, first, "11-2026", min_schemes=1))["status"] == "ok"
    second = {r.key: r for r in (row("HSBC Small Cap Fund", date(2026, 11, 19), 1.77),)}
    res = await d.store_ter(store, second, "11-2026", min_schemes=1)
    assert res["keptFromBefore"] == 1
    async with store.pool.acquire() as conn:
        got = {r["name"]: (r["ter_regular"], r["ter_date"]) for r in await conn.fetch("SELECT name, ter_regular, ter_date FROM mf_ter")}
        await conn.execute("DELETE FROM mf_ter")
    assert got == {"HSBC Small Cap Fund": (1.77, date(2026, 11, 19)), "Nippon India Small Cap Fund": (1.4, day1)}
