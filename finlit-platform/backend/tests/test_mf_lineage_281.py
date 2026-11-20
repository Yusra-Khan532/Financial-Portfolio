"""Task #281 round 2: a scheme whose AMFI code changed in a takeover keeps its whole NAV history.

Live case (checked 20 Nov 2026): HSBC Small Cap Fund Direct Growth (151130) started on FinLit on 28 Nov 2022 at 51.7909, with no 5-year return. It was
L&T Emerging Businesses Fund Direct Growth (129220), whose last NAV was 51.2176 on 24 Nov 2022 (api.mfapi.in, AMFI's data). Joined, the 1 and 3 year
returns are unchanged (13.02%, 12.16%: AMFI's own figures) and the 5-year return appears (16.02%; AMFI 15.96%, the start day 19 Nov 2021 being a holiday)."""

from datetime import date, timedelta
from types import SimpleNamespace

import httpx
import pytest

from finlit import mf
from finlit import mf_lineage as L
from test_mf import needs_db, store  # noqa: F401  (fixtures)

FIRST = date(2022, 11, 28)
SMALL = "Equity Scheme - Small Cap Fund"


def cand(code, name, plan="Direct", last=date(2022, 11, 24), nav=51.2176, category=SMALL, option="Growth"):
    return L.Cand(code, name, "L&T Mutual Fund", category, plan, option, last, nav)


LT_DIRECT = cand(129220, "L&T Emerging Businesses Fund - Direct Plan - Growth")
POOL = [
    LT_DIRECT,
    cand(129223, "L&T Emerging Businesses Fund - Regular Plan - Growth", plan="Regular", nav=47.1),
    cand(129222, "L&T Emerging Businesses Fund - Direct Plan - IDCW", option="IDCW"),
    cand(119807, "L&T Mid Cap Fund-Direct Plan-Growth", nav=209.3, category="Equity Scheme - Mid Cap Fund"),
    cand(119283, "L&T Overnight Fund - Direct Plan - Growth", nav=1711.25, category="Debt Scheme - Overnight Fund"),
    cand(119999, "L&T Focused Equity Fund - Direct Plan - Growth", nav=51.6, category="Equity Scheme - Focused Fund"),   # within 2%, other category
    cand(101696, "HSBC Cash Fund - Growth", last=date(2012, 12, 28), nav=51.5),                                           # right NAV, wrong date
]


def test_the_hsbc_lt_pair_joins_and_nothing_else_does():
    best, gap, why = L.continuity("Direct", "Equity Schemes - Small Cap Fund", FIRST, 51.7909, POOL)
    assert best is LT_DIRECT and round(gap, 2) == 1.12
    assert any("119999" in w and "category" in w for w in why)                 # a NAV within 2% in another category is not taken
    best, _, _ = L.continuity("Regular", "Equity Schemes - Small Cap Fund", FIRST, 47.6, POOL)
    assert best.old_code == 129223                                             # each plan joins its own plan


def test_a_pair_that_does_not_join_is_not_linked():
    # NAVs 3% apart: a re-based unit or another fund, never joined
    assert L.continuity("Direct", SMALL, FIRST, 51.2176 * 1.03, [LT_DIRECT])[0] is None
    # the old code stopped weeks before the new one began
    assert L.continuity("Direct", SMALL, FIRST, 51.79, [cand(1, "L&T X - Direct Plan - Growth", last=date(2022, 10, 31))])[0] is None
    # two candidates about equally close: no guess
    two = [LT_DIRECT, cand(2, "L&T Small Cap Twin - Direct Plan - Growth", nav=51.25)]
    best, _, why = L.continuity("Direct", SMALL, FIRST, 51.7909, two)
    assert best is None and why[-1].startswith("ambiguous")
    # the other plan, or an IDCW option, never stands in
    assert L.continuity("Regular", SMALL, FIRST, 51.7909, [LT_DIRECT])[0] is None
    assert L.continuity("Direct", SMALL, FIRST, 51.7909, [cand(3, "x", option="IDCW")])[0] is None


def test_the_mirrors_older_names_are_read_with_any_hyphen():
    assert L.mirror_option("L&T India Value Fund-Regular Plan-Growth") == "Growth"
    assert L.mirror_option("L&T Money Market Fund -Direct Plan- Growth") == "Growth"
    assert L.mirror_option("L&T Next Nifty 50 Index Fund - Direct Plan - Growth Option") == "Growth"
    assert L.mirror_option("L&T Tax Advantage Fund-Regular Plan-IDCW") == "IDCW"
    assert L.mirror_option("L&T Short Term Bond Fund -Direct Plan - Bonus Option") == "Other"
    assert L.mirror_option("HSBC Dividend Yield Fund") == "Other"           # no option stated: not taken as Growth
    assert L.house_key("HSBC Mutual Fund") == "hsbc" and L.house_key("Axis Mutual Fund") is None


def series(start: date, end: date, nav0: float, a_year: float):
    """Weekday NAVs growing `a_year` (e.g. 0.10) a year from nav0 on `start`."""
    days, navs, d = [], [], start
    while d <= end:
        if d.weekday() < 5:
            days.append(d.toordinal())
            navs.append(round(nav0 * (1 + a_year) ** ((d - start).days / 365.25), 4))
        d += timedelta(days=1)
    return days, navs


def test_the_join_puts_the_earlier_navs_first_and_never_replaces_the_schemes_own():
    earlier = series(date(2014, 5, 15), date(2022, 11, 30), 10.0, 0.10)       # the mirror's old code overlaps the new one by a few days
    own = series(FIRST, date(2026, 11, 19), 20.0, 0.10)
    days, navs = L.join(own, earlier)
    assert days == sorted(days) and len(set(days)) == len(days)
    assert days[0] == date(2014, 5, 15).toordinal()
    i = days.index(FIRST.toordinal())
    assert days[i:] == own[0] and navs[i:] == own[1]                           # every day of its own is its own NAV
    assert days[i - 1] < FIRST.toordinal() and navs[i - 1] == earlier[1][earlier[0].index(days[i - 1])]
    assert L.join(([], []), earlier) == ([], [])                               # nothing of its own: nothing is made up


def test_a_joined_series_has_a_5_year_return_and_the_cut_one_has_none():
    earlier = series(date(2014, 5, 15), date(2022, 11, 24), 10.0, 0.12)
    start_new = earlier[1][-1] * 1.12 ** (4 / 365.25)
    own = series(FIRST, date(2026, 11, 19), start_new, 0.12)
    cut = mf.metrics_for(*own, True)["returns"]
    joined = mf.metrics_for(*L.join(own, earlier), True)["returns"]
    assert cut["5y"]["value"] is None
    assert joined["5y"]["value"] == pytest.approx(12.0, abs=0.05)
    assert joined["1y"]["value"] == pytest.approx(cut["1y"]["value"]) and joined["3y"]["value"] == pytest.approx(cut["3y"]["value"])
    assert "28 Nov 2022" in L.note_for("L&T Emerging Businesses Fund - Direct Plan - Growth", FIRST)


NAV = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Small Cap Fund)

HSBC Mutual Fund

151130;INF917K01QA1;-;HSBC Small Cap Fund;Direct;Growth;{nav};19-Nov-2026
"""


class Mirror:
    """api.mfapi.in for the test: the scheme list, the old code's latest NAV and its full history."""
    def __init__(self, earlier):
        self.earlier, self.asked = earlier, []

    def client(self) -> httpx.AsyncClient:
        def handler(req: httpx.Request) -> httpx.Response:
            p = req.url.path
            self.asked.append(p)
            if p == "/mf":
                return httpx.Response(200, json=[{"schemeCode": 129220, "schemeName": "L&T Emerging Businesses Fund - Direct Plan - Growth"},
                                                 {"schemeCode": 129222, "schemeName": "L&T Emerging Businesses Fund - Direct Plan - IDCW"},
                                                 {"schemeCode": 120000, "schemeName": "Axis Something Fund - Direct Plan - Growth"}])
            meta = {"fund_house": "L&T Mutual Fund", "scheme_category": SMALL, "scheme_code": 129220, "scheme_name": "L&T Emerging Businesses Fund - Direct Plan - Growth"}
            rows = [{"date": date.fromordinal(d).strftime("%d-%m-%Y"), "nav": f"{v:.4f}"} for d, v in zip(*self.earlier)][::-1]
            if p == "/mf/129220/latest":
                return httpx.Response(200, json={"meta": meta, "data": rows[:1], "status": "SUCCESS"})
            if p == "/mf/129220":
                return httpx.Response(200, json={"meta": meta, "data": rows, "status": "SUCCESS"})
            return httpx.Response(404)
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://api.mfapi.in")


@needs_db
async def test_the_nightly_step_links_joins_and_the_fund_page_says_so(store):  # noqa: F811
    earlier = series(date(2014, 5, 15), date(2022, 11, 24), 10.0, 0.12)
    own = series(FIRST, date(2026, 11, 19), earlier[1][-1] * 1.0112, 0.12)
    newest = date(2026, 11, 19)
    async with store.pool.acquire() as conn:
        await conn.execute("TRUNCATE mf_facts, mf_lineage_cands")
    await mf.apply_navall(store, mf.parse_navall(NAV.format(nav=own[1][-1]), today=newest), newest)
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO mf_facts (code, base_name, name_key, launch_date) VALUES (151130, 'HSBC Small Cap Fund', 'hsbcsmallcapfund', '2014-04-22')")
        await mf._write_series(conn, [(151130, own[0], own[1], True)])
        assert await conn.fetchval("SELECT r5y FROM mf_schemes WHERE code = 151130") is None      # the bug: the history was cut in Nov 2022
    m = Mirror(earlier)
    async with m.client() as c:
        res = await L.link(store, c, pause=0)
    assert res["successors"] == 1 and len(res["linked"]) == 1 and "129220" in res["linked"][0]
    assert "/mf/129222/latest" not in m.asked and "/mf/120000/latest" not in m.asked           # IDCW and other houses are never asked
    async with store.pool.acquire() as conn:
        p = await conn.fetchrow("SELECT * FROM mf_predecessors WHERE code = 151130")
        h = await conn.fetchrow("SELECT d0, d1 FROM mf_history WHERE code = 151130")
        s = await conn.fetchrow("SELECT r1y, r3y, r5y, sip5y FROM mf_schemes WHERE code = 151130")
        months = await conn.fetchval("SELECT cardinality(days) FROM mf_monthly WHERE code = 151130")
    assert p["old_code"] == 129220 and p["old_last"] == date(2022, 11, 24) and p["new_first"] == FIRST and round(p["gap_pct"], 2) == 1.12
    assert h["d0"] == date(2014, 5, 15) and h["d1"] == newest
    # 12% a year plus the 1.12% step on the switch day (as in the real pair) spread over 5 years: 12.2%; SIP and month-ends from 2014
    assert s["r5y"] == pytest.approx(12.2, abs=0.05) and s["sip5y"] is not None and months > 140
    # the fund page names the earlier scheme
    app = SimpleNamespace(state=SimpleNamespace(store=store))
    async with store.pool.acquire() as conn:
        row = await conn.fetchrow(f"SELECT {mf.LIST_COLS}, isin, isin_reinvest, family FROM mf_schemes WHERE code = 151130")  # nosec B608 - test
    page = await mf.detail_payload(app, row)
    assert page["history"]["earlier"]["oldCode"] == 129220 and page["history"]["from"] == "2014-05-15"
    assert page["history"]["note"].startswith("Includes the NAV history of L&T Emerging Businesses Fund") and page["returns"]["5y"]["value"] is not None
    # a later run: nothing new to link, nothing asked again; a history rebuilt without the earlier part is joined again
    async with store.pool.acquire() as conn:
        await mf._write_series(conn, [(151130, own[0], own[1], True)])
        await conn.execute("UPDATE mf_history SET d0 = $1 WHERE code = 151130", FIRST)
    m2 = Mirror(earlier)
    async with m2.client() as c:
        res = await L.link(store, c, pause=0)
    assert res["successors"] == 0 and res["rejoined"] == 1 and "/mf" not in m2.asked
    async with store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT d0 FROM mf_history WHERE code = 151130") == date(2014, 5, 15)


@needs_db
async def test_a_scheme_whose_navs_do_not_join_stays_unlinked(store):  # noqa: F811
    earlier = series(date(2014, 5, 15), date(2022, 11, 24), 10.0, 0.12)
    own = series(FIRST, date(2026, 11, 19), earlier[1][-1] * 1.5, 0.12)      # 50% apart: another unit, not the same fund
    newest = date(2026, 11, 19)
    async with store.pool.acquire() as conn:
        await conn.execute("TRUNCATE mf_facts, mf_lineage_cands")
    await mf.apply_navall(store, mf.parse_navall(NAV.format(nav=own[1][-1]), today=newest), newest)
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO mf_facts (code, base_name, name_key, launch_date) VALUES (151130, 'HSBC Small Cap Fund', 'hsbcsmallcapfund', '2014-04-22')")
        await mf._write_series(conn, [(151130, own[0], own[1], True)])
    async with Mirror(earlier).client() as c:
        res = await L.link(store, c, pause=0)
    assert res["linked"] == [] and res["noMatch"] and res["rejectedSample"]
    async with store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM mf_predecessors") == 0
        assert await conn.fetchval("SELECT d0 FROM mf_history WHERE code = 151130") == FIRST
