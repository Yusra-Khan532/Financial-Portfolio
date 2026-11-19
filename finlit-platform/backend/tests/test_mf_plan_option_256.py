"""Task #256 ("mf data not coming", HSBC Small Cap Fund): AMFI's daily NAV file leaves the Plan and Option columns blank for some fund houses and names those
schemes only "HSBC Small Cap Fund", so the site read plan and option as "not stated" and withheld returns, the NAV chart, the largest fall and the score.
AMFI's scheme master names every code in full ("HSBC Small Cap Fund - Direct Growth"); it is now kept (mf_facts.nav_name) and read when the NAV file states
neither, by the master job and after every daily NAV write. The four HSBC rows below are AMFI's own lines of 19 Nov 2026 (NAVAll.txt and the master)."""

from datetime import date

import httpx

from finlit import disclosure as d
from finlit import mf
from test_mf import needs_db, store  # noqa: F401  (fixtures)

NAV = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Small Cap Fund)

HSBC Mutual Fund

151130;INF917K01QA1;-;HSBC Small Cap Fund;;;101.0485;19-Nov-2026
151132;INF917K01PZ0;INF917K01XP5;HSBC Small Cap Fund;;;47.9835;19-Nov-2026
151133;INF917K01QC7;-;HSBC Small Cap Fund;;;89.7123;19-Nov-2026
151131;INF917K01QB9;INF917K01XQ3;HSBC Small Cap Fund;;;40.597;19-Nov-2026

Open Ended Schemes(Debt Scheme - Liquid Fund)

Edelweiss Mutual Fund

140176;INF754K01AJ6;-;Edelweiss Liquid Fund;;;3402.1;19-Nov-2026
"""
HEAD = "AMC,Code,Scheme Name,Scheme Type,Scheme Category,Scheme NAV Name,Scheme Minimum Amount,Launch Date, Closure Date,ISIN Div Payout/ ISIN GrowthISIN Div Reinvestment\n"
ROWS = [(151130, "HSBC Small Cap Fund - Direct Growth"), (151131, "HSBC Small Cap Fund - Regular IDCW"), (151132, "HSBC Small Cap Fund - Direct IDCW"),
        (151133, "HSBC Small Cap Fund - Regular Growth"), (140176, "Edelweiss Liquid Fund - Retail Plan - Growth Option")]
MASTER = HEAD + "".join(f"Some AMC,{c},{n.split(' - ')[0]},Open Ended,Equity Schemes - Small Cap Fund,{n},Rs. 5000,22-Apr-2014,,INF917K01QA1\n" for c, n in ROWS)


def test_the_master_keeps_each_codes_full_name_and_the_name_states_plan_and_option():
    rows = d.parse_master(MASTER)
    assert rows[151130].nav_name == "HSBC Small Cap Fund - Direct Growth" and rows[151130].base_name == "HSBC Small Cap Fund"
    assert d.parse_master(MASTER.replace("Scheme NAV Name", "Other"))[151130].nav_name is None     # an older file without the column: nothing guessed
    # the NAV file's own line states nothing ...
    s = mf.parse_navall(NAV, today=date(2026, 11, 19)).schemes
    assert [(x.code, x.plan, x.option_label) for x in s][:2] == [(151130, "Unspecified", "Not stated"), (151132, "Unspecified", "Not stated")]
    # ... the master's name does, read the same way
    assert (mf.clean_plan("", ROWS[0][1]), mf.clean_option("", ROWS[0][1])) == ("Direct", ("Growth", "Growth"))
    assert (mf.clean_plan("", ROWS[1][1]), mf.clean_option("", ROWS[1][1])) == ("Regular", ("IDCW", "IDCW"))


@needs_db
async def test_the_master_fills_plan_and_option_and_the_daily_nav_write_keeps_them(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await conn.execute("TRUNCATE mf_facts")
    newest = date(2026, 11, 19)
    await mf.apply_navall(store, mf.parse_navall(NAV, today=newest), newest)
    q = "SELECT code, plan, option_class, option_label FROM mf_schemes WHERE code = ANY($1::int[]) ORDER BY code"
    codes = [c for c, _ in ROWS]
    async with store.pool.acquire() as conn:
        assert {r["plan"] for r in await conn.fetch(q, codes)} == {"Unspecified"}                   # the bug: nothing stated

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=MASTER)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        res = await d.step_master(store, c, min_rows=1)
    assert res["status"] == "ok" and res["planOptionFromMaster"] == 5
    want = [(151130, "Direct", "Growth", "Growth"), (151131, "Regular", "IDCW", "IDCW"), (151132, "Direct", "IDCW", "IDCW"), (151133, "Regular", "Growth", "Growth")]
    async with store.pool.acquire() as conn:
        got = [tuple(r) for r in await conn.fetch(q, codes)]
    assert got[1:] == want and got[0] == (140176, "Unspecified", "Growth", "Growth")            # a Retail plan is neither Direct nor Regular: still not stated
    # the next day's NAV file states nothing again: the write keeps the master's plan and option
    res = await mf.apply_navall(store, mf.parse_navall(NAV.replace("19-Nov-2026", "20-Nov-2026"), today=date(2026, 11, 20)), date(2026, 11, 20))
    assert res["planOptionFromMaster"] == 5
    async with store.pool.acquire() as conn:
        assert [tuple(r) for r in await conn.fetch(q, codes)][1:] == want
        # a plan or option the NAV file does state is never overwritten from the master
        await conn.execute("UPDATE mf_facts SET nav_name = 'HSBC Small Cap Fund - Regular IDCW' WHERE code = 151130")
        await conn.execute("UPDATE mf_schemes SET plan = 'Direct', option_class = 'Growth', option_label = 'Growth' WHERE code = 151130")
        assert await mf.apply_nav_names(conn) == 0
