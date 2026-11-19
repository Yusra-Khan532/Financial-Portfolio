"""AMFI's NAV file leaves Plan and Option blank for about 460 live schemes (19 Nov 2026: HSBC's former L&T funds, many Motilal Oswal, ICICI, Mirae, DSP,
UTI ...). FinLit read only that file, so they showed "Plan not stated", "Not stated", no returns, no NAV chart, no risk and no Mutual Fund Score. AMFI's
scheme master names them ("HSBC Small Cap Fund - Direct Growth"). These rows are copied from AMFI's own files of 19 Nov 2026."""
import json
from datetime import date

import pytest

from finlit import mf
from test_mfscore_engine import store  # noqa: F401  (the score tests' database fixture: a real Postgres, truncated mf_scores)

NAVALL = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Small Cap Fund)

HSBC Mutual Fund

151130;INF917K01QA1;-;HSBC Small Cap Fund;;;101.0485;19-Nov-2026
151132;INF917K01PZ0;INF917K01XP5;HSBC Small Cap Fund;;;47.9835;19-Nov-2026
151133;INF917K01QC7;-;HSBC Small Cap Fund;;;89.7123;19-Nov-2026
151131;INF917K01QB9;INF917K01XQ3;HSBC Small Cap Fund;;;40.597;19-Nov-2026

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)

PPFAS Mutual Fund

122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth;94.1452;18-Nov-2026

Open Ended Schemes(Equity Scheme - Large Cap Fund)

Motilal Oswal Mutual Fund

152354;INF247L01AY3;-;Motilal Oswal Large Cap Fund;;;12.5;19-Nov-2026
152351;INF247L01AV9;-;Motilal Oswal Large Cap Fund;;;11.9;19-Nov-2026

Open Ended Schemes(Other Scheme - Other  ETFs)

Kotak Mahindra Mutual Fund

133122;INF174K014P6;-;Kotak Nifty Bank ETF;;;573.1;19-Nov-2026
"""

MASTER = """AMC,Code,Scheme Name,Scheme Type,Scheme Category,Scheme NAV Name,Scheme Minimum Amount,Launch Date, Closure Date,ISIN Div Payout/ ISIN GrowthISIN Div Reinvestment
HSBC Asset Management (India) Private Ltd.,151130,HSBC Small Cap Fund,Open Ended,Equity Schemes - Small Cap Fund,HSBC Small Cap Fund - Direct Growth,Rs. 5000,22-Apr-2014,,INF917K01QA1
HSBC Asset Management (India) Private Ltd.,151131,HSBC Small Cap Fund,Open Ended,Equity Schemes - Small Cap Fund,HSBC Small Cap Fund - Regular IDCW,Rs. 5000,22-Apr-2014,,INF917K01QB9INF917K01XQ3
HSBC Asset Management (India) Private Ltd.,151132,HSBC Small Cap Fund,Open Ended,Equity Schemes - Small Cap Fund,HSBC Small Cap Fund - Direct IDCW,Rs. 5000,22-Apr-2014,,INF917K01PZ0INF917K01XP5
HSBC Asset Management (India) Private Ltd.,151133,HSBC Small Cap Fund,Open Ended,Equity Schemes - Small Cap Fund,HSBC Small Cap Fund - Regular Growth,Rs. 5000,22-Apr-2014,,INF917K01QC7
PPFAS Asset Management Pvt. Ltd.,122639,Parag Parikh Flexi Cap Fund,Open Ended,Equity Scheme - Flexi Cap Fund,Parag Parikh Flexi Cap Fund - Regular Plan - IDCW,Rs. 1000,24-May-2013,,INF879O01027
Motilal Oswal Asset Management Company Limited,152354,Motilal Oswal Large Cap Fund,Open Ended,Equity Scheme - Large Cap Fund,Motilal Oswal Large Cap Direct Plan Growth,Rs. 500,06-Feb-2024,,INF247L01AY3
Motilal Oswal Asset Management Company Limited,152351,Motilal Oswal Large Cap Fund,Open Ended,Equity Scheme - Large Cap Fund,Motilal Oswal Large Cap Direct Plan IDCW,Rs. 500,06-Feb-2024,,INF247L01AV9
Kotak Mahindra Asset Management Co Ltd,133122,Kotak Nifty Bank ETF,Open Ended,Other Scheme - Other  ETFs,Kotak Nifty Bank ETF,Rs. 5000,04-Dec-2014,,INF174K014P6
"""
TODAY = date(2026, 11, 19)


def test_the_scheme_master_is_read_by_its_column_names():
    m = mf.parse_scheme_master(MASTER)
    assert len(m) == 8 and m[151130] == "HSBC Small Cap Fund - Direct Growth" and m[151131] == "HSBC Small Cap Fund - Regular IDCW"
    # a reordered file still reads; a file without the two columns gives nothing (never a guess)
    reordered = "Scheme NAV Name,Code\nX Fund - Direct Growth,1\n"
    assert mf.parse_scheme_master(reordered) == {1: "X Fund - Direct Growth"}
    assert mf.parse_scheme_master("Code,Name\n1,X\n") == {}
    assert mf.parse_scheme_master("") == {}


def test_blank_plan_and_option_come_from_the_master():
    p = mf.parse_navall(NAVALL, today=TODAY, master=mf.parse_scheme_master(MASTER))
    by = {s.code: s for s in p.schemes}
    got = {c: (by[c].plan, by[c].option_class, by[c].option_label) for c in (151130, 151131, 151132, 151133)}
    assert got == {151130: ("Direct", "Growth", "Growth"), 151131: ("Regular", "IDCW", "IDCW"), 151132: ("Direct", "IDCW", "IDCW"),
                   151133: ("Regular", "Growth", "Growth")}
    # the four share one family, so an IDCW option finds its Growth sibling of the same plan
    assert len({by[c].family for c in (151130, 151131, 151132, 151133)}) == 1
    # the master spells Motilal's fund differently ("Motilal Oswal Large Cap Direct Plan Growth"): its extra words carry the plan and option
    assert (by[152354].plan, by[152354].option_class) == ("Direct", "Growth") and (by[152351].plan, by[152351].option_class) == ("Direct", "IDCW")
    assert sorted(p.from_master) == [151130, 151131, 151132, 151133, 152351, 152354]


def test_a_plan_or_option_amfi_states_is_never_replaced():
    p = mf.parse_navall(NAVALL, today=TODAY, master=mf.parse_scheme_master(MASTER))
    pp = next(s for s in p.schemes if s.code == 122639)   # the master (here, deliberately) says Regular IDCW; NAVAll says Direct Growth: NAVAll stands
    assert (pp.plan, pp.option_class) == ("Direct", "Growth") and 122639 not in p.from_master


def test_what_neither_file_states_stays_unstated_and_is_counted():
    p = mf.parse_navall(NAVALL, today=TODAY, master=mf.parse_scheme_master(MASTER))
    etf = next(s for s in p.schemes if s.code == 133122)    # an ETF: one unit class, AMFI states no plan or option anywhere
    assert (etf.plan, etf.option_class, etf.option_label) == ("Unspecified", "Other", "Not stated") and p.blank_unresolved == 1
    # without the master, every blank row stays unstated (the old behaviour)
    q = mf.parse_navall(NAVALL, today=TODAY)
    assert {s.code: s.plan for s in q.schemes if s.code in (151130, 151133)} == {151130: "Unspecified", 151133: "Unspecified"} and q.from_master == []


@pytest.mark.parametrize("nav_name, name, want", [
    ("HSBC Small Cap Fund - Direct Growth", "HSBC Small Cap Fund", ("Direct", "Growth")),
    ("UTI - Credit Risk Fund (Segregated - 06032020) - Direct Plan - Annual Dividend Option", "UTI - Credit Risk Fund (Segregated - 06032020)", ("Direct", "Annual Dividend Option")),
    ("Motilal Oswal Nifty 200 Momentum 30 Index Fund-Regular Plan", "Motilal Oswal Nifty 200 Momentum 30 Index Fund", ("Regular", "")),
    ("Motilal Oswal Large Cap Regular Plan IDCW", "Motilal Oswal Large Cap Fund", ("Regular", "IDCW")),
    ("Kotak Nifty Bank ETF", "Kotak Nifty Bank ETF", ("", "")),
])
def test_the_plan_and_option_words_of_a_master_name(nav_name, name, want):
    assert mf.master_plan_option(nav_name, name) == want


class _Conn:
    def __init__(self, meta):
        self.meta = meta

    async def fetchval(self, sql, key):
        v = self.meta.get(key)
        return json.dumps(v) if v is not None else None

    async def execute(self, sql, key, value):
        self.meta[key] = json.loads(value)


class _Pool:
    def __init__(self, meta):
        self.conn = _Conn(meta)

    def acquire(self):
        pool = self

        class _Ctx:
            async def __aenter__(self):
                return pool.conn

            async def __aexit__(self, *a):
                return False
        return _Ctx()


class _Store:
    def __init__(self, meta=None):
        self.pool = _Pool(meta if meta is not None else {})


class _Client:
    def __init__(self, text=None, fail=False):
        self.text, self.fail = text, fail

    async def get(self, url):
        import httpx
        if self.fail:
            raise httpx.ConnectError("no route")
        return httpx.Response(200, content=self.text.encode(), request=httpx.Request("GET", url))


def _big_master(n=mf.MASTER_MIN):
    head = MASTER.splitlines()[0]
    return "\n".join([head] + [f"A,{100000 + i},F{i},Open Ended,Cat,F{i} - Direct Growth,Rs,1-Jan-2020,,X" for i in range(n)]) + "\n"


async def test_a_good_master_is_kept_and_a_failed_download_uses_the_last_good_copy(monkeypatch):
    monkeypatch.setattr(mf.asyncio, "sleep", lambda *_: _noop())
    store = _Store()
    got, info = await mf.load_scheme_master(store, _Client(_big_master()))
    assert info["source"] == "download" and len(got) == mf.MASTER_MIN and len(store.pool.conn.meta[mf.MASTER_META]["names"]) == mf.MASTER_MIN
    again, info2 = await mf.load_scheme_master(store, _Client(fail=True))        # AMFI unreachable tonight: last night's copy, and the run goes on
    assert again == got and info2["source"].startswith("stored copy of") and "download failed" in info2["problem"]
    short, info3 = await mf.load_scheme_master(store, _Client(MASTER))            # a short file is not AMFI's full master: it never replaces the good copy
    assert short == got and "fewer than" in info3["problem"] and len(store.pool.conn.meta[mf.MASTER_META]["names"]) == mf.MASTER_MIN


async def test_no_master_at_all_never_stops_the_run(monkeypatch):
    monkeypatch.setattr(mf.asyncio, "sleep", lambda *_: _noop())
    got, info = await mf.load_scheme_master(_Store(), _Client(fail=True))
    assert got == {} and info["source"] is None and "download failed" in info["problem"]


async def _noop():
    return None


def test_the_returns_note_says_what_is_missing_and_where_finlit_looked():
    base = {"active": True, "option_class": "Other"}
    assert "Neither AMFI's NAV file nor its scheme master" in mf.returns_note({**base, "option_label": "Not stated"}, "amfi", True)
    assert 'the "Bonus Option" option, not a Growth option' in mf.returns_note({**base, "option_label": "Bonus Option"}, "amfi", True)
    assert "does not state a Growth option" not in mf.returns_note({**base, "option_label": "Not stated"}, "amfi", True)


async def test_the_idcw_option_inherits_its_growth_siblings_score_once_the_plan_is_known(store, monkeypatch):
    """With the master, 151131 (Regular IDCW) finds 151133 (Regular Growth) of the same family and carries its score; before, every code read
    "Unspecified / Not stated" and the page said "Not scored: Not scored: IDCW and other options inherit the Growth plan's score."."""
    from test_mfscore_engine import _client, _write
    from mfscore_synth import fund
    codes = [151130, 151131, 151132, 151133]
    p = mf.parse_navall(NAVALL, today=TODAY, master=mf.parse_scheme_master(MASTER))
    ss = [s for s in p.schemes if s.code in codes]
    async with store.pool.acquire() as c:
        await c.execute("DELETE FROM mf_schemes WHERE code = ANY($1::int[])", codes)
        await c.execute("DELETE FROM mf_scores WHERE key = ANY($1::text[])", [f"mf:{x}" for x in codes])
        cols = list(zip(*[(s.code, s.name, s.isin, s.isin_reinvest, s.amc, s.scheme_type, s.category, s.plan, s.option_class, s.option_label, s.family, s.nav,
                           s.nav_date, TODAY) for s in ss]))
        await c.execute(mf.UPSERT, *[list(x) for x in cols])
        await c.execute("UPDATE mf_schemes SET active = true WHERE code = ANY($1::int[])", codes)
    g = fund("mf:151133", "EQ-SMALL", "small-cap", seed=5)
    g.code, g.category = 151133, "Equity Schemes - Small Cap Fund"
    await _write(store, [g])
    try:
        async with await _client(store, monkeypatch, "gold") as cl:
            r = (await cl.get("/api/mf/151131/score")).json()
            assert r["inherited"]["code"] == 151133 and "Not scored" not in (r.get("reason") or "")
    finally:
        async with store.pool.acquire() as c:
            await c.execute("DELETE FROM mf_scores WHERE key = ANY($1::text[])", [f"mf:{x}" for x in codes])
            await c.execute("DELETE FROM mf_schemes WHERE code = ANY($1::int[])", codes)
