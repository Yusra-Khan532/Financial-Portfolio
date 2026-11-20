"""Task #281 round 3 (mutual fund data gaps): plan and option for every scheme a free source states them for.

#256 read plan and option from AMFI's scheme master name ("Scheme NAV Name") but only split it on " - " with spaces, so names AMFI joins without spaces
("Motilal Oswal Midcap Fund-Regular Plan-Growth Option") or without a separator ("... Fund - Direct Plan Cumulative Option") still read "Not stated"; and the
words "Cumulative" (the older word for Growth) and "IDWC" (AMFI's typo for IDCW) were not known. The names below are AMFI's own (scheme master and NAV file,
19-20 Nov 2026)."""

import pytest

from finlit import disclosure as d
from finlit import mf
from test_mf import needs_db, store  # noqa: F401  (fixtures)


@pytest.mark.parametrize("nav_name,base,want", [
    ("Motilal Oswal Midcap Fund-Regular Plan-Growth Option", "Motilal Oswal Midcap Fund", ("Growth", "Growth")),
    ("Motilal Oswal Nasdaq 100 Fund of Fund- Regular Plan Growth", "Motilal Oswal Nasdaq 100 Fund of Fund", ("Growth", "Growth")),
    ("ICICI Prudential Long Term Wealth Enhancement Fund - Direct Plan Cumulative Option", "ICICI Prudential Long Term Wealth Enhancement Fund", ("Growth", "Growth")),
    ("Navi Liquid Fund-Direct Plan-Growth Option", "Navi Liquid Fund", ("Growth", "Growth")),
    ("BANK OF INDIA Large & Mid Cap Fund Eco Plan-Quarterly IDCW", "BANK OF INDIA LARGE & MID CAP FUND", ("IDCW", "IDCW")),
    ("Nippon India Gilt Fund- Direct Plan- Growth Plan- Bonus Option", "Nippon India Gilt Fund", ("Other", "Bonus")),          # bonus, not growth
    ("DSP Overnight Fund - Unclaimed IDCW - Upto 3 years", "DSP Overnight Fund", ("Other", mf.UNCLAIMED)),                  # never IDCW
    ("Tata Nifty 50 Index Fund -Direct Plan", "Tata Nifty 50 Index Fund", ("Other", "Not stated")),                         # states no option: none guessed
    ("HSBC Small Cap Fund - Direct Growth", "HSBC Small Cap Fund", ("Growth", "Growth")),                                   # #256's own case still holds
    ("Unclaimed Redemption - Upto 3 years (Invested in DSP Overnight Fund)", "DSP Overnight Fund", ("Other", "Not stated")),
])
def test_the_option_is_read_from_the_words_after_the_schemes_own_name(nav_name, base, want):
    assert mf.option_from_nav_name(nav_name, base) == want


def test_the_nav_files_own_option_words_cumulative_and_amfis_idwc_typo():
    assert mf.clean_option("Cumulative", "ICICI Prudential FMP Series 85") == ("Growth", "Cumulative")
    assert mf.clean_option("IDWC Option", "Some Fund") == ("IDCW", "IDWC Option")
    assert mf.clean_option("Unclaimed Redemption Less than 3 years", "Bandhan Liquid Fund")[0] == "Other"
    assert mf.clean_option("Bonus Option", "Nippon India Gilt Fund") == ("Other", "Bonus Option")       # unchanged: bonus stays Other
    assert mf.clean_option("Growth Option", "x") == ("Growth", "Growth Option")                          # unchanged
    assert mf.clean_option("", "LIC MF Gilt Fund - Cumulative") == ("Growth", "Growth")


def test_a_legacy_or_unclaimed_plan_stays_neither_direct_nor_regular():
    for n in ("Axis Liquid Fund - Retail Plan - Growth Option", "Edelweiss Large Cap Fund -Plan B - Growth option", "LIC MF Gilt Fund-PF Plan-Growth",
              "Baroda BNP Paribas LIQUID FUND- Defunct Plan -Growth Option", "BANK OF INDIA ELSS Tax Saver FUND -ECO Plan-Growth"):
        assert mf.clean_plan("", n) == "Unspecified", n


HEAD = "AMC,Code,Scheme Name,Scheme Type,Scheme Category,Scheme NAV Name,Scheme Minimum Amount,Launch Date, Closure Date,ISIN Div Payout/ ISIN GrowthISIN Div Reinvestment\n"
NAV = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Mid Cap Fund)

Motilal Oswal Mutual Fund

127039;INF247L01411;-;Motilal Oswal Midcap Fund;Regular;;98.12;19-Nov-2026
127042;INF247L01445;-;Motilal Oswal Midcap Fund;Direct;;112.4;19-Nov-2026
142134;INF109KC1093;-;ICICI Prudential Long Term Wealth Enhancement Fund;Direct;;31.2;19-Nov-2026
101659;INF277K01451;-;Tata Nifty 50 Index Fund;Regular;;150.1;19-Nov-2026
"""
ROWS = [(127039, "Motilal Oswal Midcap Fund", "Motilal Oswal Midcap Fund-Regular Plan-Growth Option"),
        (127042, "Motilal Oswal Midcap Fund", "Motilal Oswal Midcap Fund-Direct Plan-Growth Option"),
        (142134, "ICICI Prudential Long Term Wealth Enhancement Fund", "ICICI Prudential Long Term Wealth Enhancement Fund - Direct Plan Cumulative Option"),
        (101659, "Tata Nifty 50 Index Fund", "Tata Nifty 50 Index Fund -Regular Plan")]
MASTER = HEAD + "".join(f"Some AMC,{c},{b},Open Ended,Equity Scheme - Mid Cap Fund,{n},Rs. 500,03-Feb-2014,,INF247L01411\n" for c, b, n in ROWS)


@needs_db
async def test_the_master_fills_the_joined_names_and_never_overwrites_a_stated_option(store):  # noqa: F811
    import httpx
    from datetime import date
    async with store.pool.acquire() as conn:
        await conn.execute("TRUNCATE mf_facts")
    newest = date(2026, 11, 19)
    await mf.apply_navall(store, mf.parse_navall(NAV, today=newest), newest)
    q = "SELECT code, plan, option_class, option_label FROM mf_schemes WHERE code = ANY($1::int[]) ORDER BY code"
    codes = [c for c, _, _ in ROWS]
    async with store.pool.acquire() as conn:
        assert {r["option_label"] for r in await conn.fetch(q, codes)} == {"Not stated"}                 # the bug

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=MASTER)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        res = await d.step_master(store, c, min_rows=1)
    assert res["status"] == "ok" and res["planOptionFromMaster"] == 3
    async with store.pool.acquire() as conn:
        got = {r["code"]: (r["plan"], r["option_class"], r["option_label"]) for r in await conn.fetch(q, codes)}
    assert got[127039] == ("Regular", "Growth", "Growth") and got[127042] == ("Direct", "Growth", "Growth")
    assert got[142134] == ("Direct", "Growth", "Growth")                                                 # "Cumulative" is the Growth option
    assert got[101659] == ("Regular", "Other", "Not stated")                                             # the name states no option: none guessed
    async with store.pool.acquire() as conn:
        # a stated option is never replaced from the master, even when the master's name says otherwise
        await conn.execute("UPDATE mf_schemes SET option_class = 'IDCW', option_label = 'IDCW' WHERE code = 127039")
        assert await mf.apply_nav_names(conn) == 0
        assert (await conn.fetchrow(q.replace("ANY($1::int[])", "$1"), 127039))["option_class"] == "IDCW"
