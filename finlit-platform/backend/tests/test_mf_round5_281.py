"""Task #281 round 5 (20 Nov 2026): the score runs after the night's fund data; the fund page's 'not available' note names only real gaps; fund search treats
'and' and '&' alike; the admin Data health panel counts every fund data gap."""
from datetime import date, timedelta

import pytest

from finlit.dataaudit import FUND_GAPS, fund_gap_counts
from finlit.jobs.due import JobState
from finlit.jobs.registry import Job, Sla, WindowRun, by_name
from finlit.jobs.schedule import shift_start
from finlit.jobs.state import MemoryState
from finlit.jobs.supervisor import Supervisor
from finlit.mf import NA_ITEMS, SearchIndex, not_available
from jobs_fakes import FakeClock, FakePause, FakeResources, FakeRunner, FakeSignals, config, ist


# ------------------------------------------------------------------ 1. score-mf after the night's mf, facts and portfolios

def test_the_registry_puts_the_fund_score_after_the_nights_navs_facts_and_portfolios():
    jobs = by_name({})
    s = jobs["score-mf"]
    assert set(s.prerequisites) == {"mf", "facts", "portfolios"} and s.nightly_inputs
    assert "NIGHT" in {w.window for w in jobs["facts"].windows}          # facts runs in the night too, not only at 05:00 IST after the score
    assert s.sla.kind == "hours" and s.sla.hours == 26                      # the promise is unchanged


def test_shift_start_is_the_23_00_ist_that_began_the_night():
    assert shift_start(ist(2026, 11, 20, 23, 30)) == ist(2026, 11, 20, 23, 0)
    assert shift_start(ist(2026, 11, 21, 4, 5)) == ist(2026, 11, 20, 23, 0)
    assert shift_start(ist(2026, 11, 21, 7, 59)) == ist(2026, 11, 20, 23, 0)
    assert shift_start(ist(2026, 11, 21, 12, 0)) is None


def _bulk(name, prio, **kw):
    kw.setdefault("weight_mb", 300)
    return Job(name, (name,), cls="bulk", priority=prio, max_runtime_min=60, **kw)


def _sup(jobs, now):
    clock = FakeClock(now)
    return Supervisor(jobs=jobs, state=MemoryState(), runner=FakeRunner(clock), resources=FakeResources(900), signals=FakeSignals(), pause=FakePause(), clock=clock,
                      config=config(bulk_concurrency=2), env={})


NIGHT = (WindowRun("NIGHT", 18), WindowRun("MORNING", 14))


@pytest.mark.asyncio
async def test_at_night_the_score_waits_for_tonights_portfolios_not_last_nights():
    # 20 Nov 2026 (live): score-mf 04:05 IST, portfolios 04:24 IST. The next night at 03:00 IST the old rule saw last night's portfolios (newer than last
    # night's score) and let the score go first again; with nightly_inputs it waits for tonight's run.
    now = ist(2026, 11, 21, 3, 0)
    jobs = [_bulk("portfolios", 50, windows=NIGHT, sla=Sla("hours", 26)), _bulk("score-mf", 55, prerequisites=("portfolios",), nightly_inputs=True, windows=NIGHT, sla=Sla("hours", 26))]
    sup = _sup(jobs, now)
    await sup.state.save(JobState(job="portfolios", first_seen_at=now - timedelta(days=5), last_success_at=ist(2026, 11, 20, 4, 24)))
    await sup.state.save(JobState(job="score-mf", first_seen_at=now - timedelta(days=5), last_success_at=ist(2026, 11, 20, 4, 5)))
    plan = await sup.plan()
    assert [j.name for j in plan.start] == ["portfolios"] and "waiting for portfolios" in plan.blocked["score-mf"]


@pytest.mark.asyncio
async def test_once_tonights_portfolios_are_in_the_score_runs():
    now = ist(2026, 11, 21, 4, 30)
    jobs = [_bulk("portfolios", 50, windows=NIGHT, sla=Sla("hours", 26)), _bulk("score-mf", 55, prerequisites=("portfolios",), nightly_inputs=True, windows=NIGHT, sla=Sla("hours", 26))]
    sup = _sup(jobs, now)
    await sup.state.save(JobState(job="portfolios", first_seen_at=now - timedelta(days=5), last_success_at=ist(2026, 11, 21, 4, 20)))
    await sup.state.save(JobState(job="score-mf", first_seen_at=now - timedelta(days=5), last_success_at=ist(2026, 11, 20, 4, 5)))
    plan = await sup.plan()
    assert [j.name for j in plan.start] == ["score-mf"]


@pytest.mark.asyncio
async def test_the_score_never_waits_past_its_promise_for_a_prerequisite_that_does_not_deliver():
    now = ist(2026, 11, 21, 7, 0)    # 26 h 55 min after the last score: past the 26 h promise, so it runs on what is there (jobs never stop)
    jobs = [_bulk("portfolios", 50, windows=NIGHT, sla=Sla("hours", 26), weight_mb=5000), _bulk("score-mf", 55, prerequisites=("portfolios",), nightly_inputs=True, windows=NIGHT, sla=Sla("hours", 26))]
    sup = _sup(jobs, now)
    await sup.state.save(JobState(job="portfolios", first_seen_at=now - timedelta(days=5), last_success_at=ist(2026, 11, 20, 4, 24)))
    await sup.state.save(JobState(job="score-mf", first_seen_at=now - timedelta(days=5), last_success_at=ist(2026, 11, 20, 4, 5)))
    plan = await sup.plan()
    assert "score-mf" in [j.name for j in plan.start]


@pytest.mark.asyncio
async def test_a_job_without_nightly_inputs_keeps_the_old_rule():
    now = ist(2026, 11, 21, 3, 0)
    jobs = [_bulk("prism", 40, windows=NIGHT, sla=Sla("hours", 26), weight_mb=5000), _bulk("presets", 42, prerequisites=("prism",), windows=NIGHT, sla=Sla("hours", 30))]
    sup = _sup(jobs, now)
    await sup.state.save(JobState(job="prism", first_seen_at=now - timedelta(days=5), last_success_at=ist(2026, 11, 20, 4, 24)))
    await sup.state.save(JobState(job="presets", first_seen_at=now - timedelta(days=5), last_success_at=ist(2026, 11, 20, 4, 5)))
    plan = await sup.plan()
    assert [j.name for j in plan.start] == ["presets"]


# ------------------------------------------------------------------ 2. the 'not available' note names only real gaps

HSBC_FACTS = {"aum": {"value": "₹18,453 crore"}, "terRegular": {"value": "1.77% a year"}, "terDirect": {"value": "0.76% a year"},
              "exitLoad": {"unavailable": "Exit load is stated in each scheme's own documents."}, "benchmark": {"unavailable": "AMFI publishes the benchmark on its fund performance page."},
              "managers": {"unavailable": "Fund managers are named in each scheme's factsheet."}, "riskometer": {"unavailable": "AMFI publishes the risk-o-meter on its fund performance page."},
              "launchDate": {"value": "2014-04-22"}}
HSBC_PORT = {"holdings": [{"name": "Apar Industries Ltd", "pct": 2.6}], "sectors": [{"name": "Industrial Products", "pct": 12.6}]}


def test_the_note_lists_only_what_is_missing_for_this_scheme_with_its_reason():
    na = not_available("Direct", HSBC_FACTS, HSBC_PORT)
    assert na["items"] == ["Exit load", "Benchmark", "Fund manager", "Risk-o-meter"]              # 151130 on 20 Nov: AUM, TER, holdings, launch date are on the page
    assert na["reasons"]["Exit load"].startswith("Exit load is stated") and "not loaded yet" not in na["why"]


def test_nothing_missing_means_no_note():
    full = {**HSBC_FACTS, "exitLoad": {"value": "1% within 1 year"}, "benchmark": {"value": "Nifty Smallcap 250 TRI"}, "managers": {"value": "Sonal Gupta"}, "riskometer": {"value": "Very High"}}
    assert not_available("Direct", full, HSBC_PORT) is None


def test_the_ter_counts_for_the_schemes_own_plan_and_a_missing_portfolio_names_holdings_and_sectors():
    f = {**HSBC_FACTS, "terDirect": {"unavailable": "No Direct plan TER filed."}}
    assert "Expense ratio (TER)" in not_available("Direct", f, HSBC_PORT)["items"]
    assert "Expense ratio (TER)" not in not_available("Regular", f, HSBC_PORT)["items"]
    na = not_available("Regular", HSBC_FACTS, None)
    assert {"Holdings", "Sector split"} <= set(na["items"])
    assert [lab for lab, _ in NA_ITEMS if lab in na["items"]] == na["items"]                         # page order kept


def test_unreadable_facts_never_read_as_complete():
    na = not_available("Direct", None, None)
    assert len(na["items"]) == len(NA_ITEMS)


# ------------------------------------------------------------------ 3. search: 'and' and '&' alike

NAMES = [(154093, "Bank of India Banking & Financial Services Fund", "Bank of India Mutual Fund"),
         (154381, "The Wealth Company Large & Mid Cap Fund", "The Wealth Company Mutual Fund"),
         (151381, "Kotak Banking and Financial Services Fund", "Kotak Mahindra Mutual Fund"),
         (151130, "HSBC Small Cap Fund", "HSBC Mutual Fund"),
         (120503, "Nippon India ETF Nifty 50 BeES", "Nippon India Mutual Fund"),
         (118989, "HDFC Mid Cap Fund", "HDFC Mutual Fund")]


@pytest.mark.parametrize("q,code", [
    ("Bank of India Banking and Financial Services Fund", 154093),       # 20 Nov live: 0 results before
    ("Bank of India Banking & Financial Services", 154093),
    ("The Wealth Company Large and Mid Cap Fund", 154381),               # 20 Nov live: 0 results before
    ("Kotak Banking & Financial Services", 151381),
    ("HSBC small-cap", 151130), ("HSBC Smallcap", 151130), ("hdfc midcap", 118989),
    ("Nippon India Nifty 50 BeES fund", 120503),                         # 'fund' is optional: the ETF's name has none
])
def test_search_finds_the_scheme_whichever_way_it_is_typed(q, code):
    assert SearchIndex(NAMES).search(q)[0] == code


def test_a_query_of_only_optional_words_still_searches():
    assert SearchIndex(NAMES).search("fund")


# ------------------------------------------------------------------ 4. fund data gaps on Data health

def _row(code, **kw):
    r = {"code": code, "name": f"Scheme {code}", "category": "Equity Scheme - Small Cap Fund", "plan": "Direct", "option_class": "Growth", "aum_lakh": 100.0,
         "ter": 0.7, "r5y": 12.0, "launch_date": date(2014, 4, 22), "hold": True, "exitl": True, "bench": True, "risk": True}
    r.update(kw)
    return r


def test_fund_gap_counts_each_gap_among_the_schemes_it_applies_to():
    today = date(2026, 11, 20)
    rows = [_row(1), _row(2, plan="Unspecified", exitl=False), _row(3, hold=False, r5y=None), _row(4, launch_date=date(2026, 9, 28), r5y=None),
            _row(5, category="Other Scheme - Exchange Traded Fund", name="X ETF", plan="Unspecified", option_class="Other", hold=False),   # an ETF: no plan/option/holdings gap
            _row(6, option_class="IDCW", r5y=None)]
    g = {x["key"]: x for x in fund_gap_counts(rows, today)["gaps"]}
    assert [k for k, *_ in FUND_GAPS] == list(g)
    assert (g["plan"]["count"], g["plan"]["of"]) == (1, 5) and g["plan"]["examples"] == ["2 Scheme 2"]
    assert (g["option"]["count"], g["holdings"]["count"], g["holdings"]["of"]) == (0, 1, 5)
    assert g["exitload"]["count"] == 1 and g["exitload"]["of"] == 6
    assert (g["r5y"]["count"], g["r5y"]["of"]) == (1, 3)                 # the new fund and the IDCW option are not counted for a 5-year return
    assert (g["new"]["count"], g["new"]["of"]) == (1, 4)
