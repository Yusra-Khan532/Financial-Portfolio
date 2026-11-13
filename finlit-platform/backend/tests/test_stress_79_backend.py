"""Task 79 (13 Nov 2026): every backend reason a covered company's Stress Lab page could not be built, stored or served, each with its regression test.
The macro data is a trimmed copy of the live /api/macro of 13 Nov 2026 (usdinr: monthly averages to Oct 2026, then the daily FBIL rate from 27 Oct 2026)."""
import asyncio
import copy
import json
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from finlit import premium
from finlit.jobs import probes
from finlit.jobs.registry import build_jobs
from finlit.screener import data
from finlit.screener.data import Table
from finlit.stress import engine, page as P, router as R, service
from test_auth import ORIGIN, anon, app, new_client, signed_in  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: F401  (fixtures)

S = engine()
pytestmark = pytest.mark.integration
HERE = Path(__file__).parent
FIX = HERE.parent / "finlit_technicals" / "tests" / "fixtures"
LIVE = json.loads((HERE / "stress_launch" / "macro_live_2026-11-13.json").read_text(encoding="utf-8"))
PACK = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _today_in(series=None, stopgap=True):
    s = series or LIVE["series"]
    d = {"as_of": LIVE["today"], "series": s, "brent": [list(p) for p in s["brent_d"]["points"]]}
    if stopgap:
        d["usdinr_monthly"] = service.stopgap_usdinr()
    return d


def _shifted(months):
    """The fixture pack with every quarter label moved by `months` (Sep 2026 -> Dec 2026 for 3), or the newest quarter dropped (-3)."""
    p = copy.deepcopy(PACK)
    q = p["quarterly"]
    if months < 0:
        q["periods"] = q["periods"][1:]
        q["rows"] = {k: v[1:] for k, v in q["rows"].items()}
        return p
    def mv(lbl):
        m, y = lbl.split()
        i = int(y) * 12 + MON.index(m) + months
        return f"{MON[i % 12]} {i // 12}"
    q["periods"] = [mv(x) for x in q["periods"]]
    return p


def _row(sym, mcap, bank=0, q=20260930, sector="Consumer Durables", industry="Paints"):
    return {"symbol": sym, "name": sym, "sector": sector, "industry": industry, "band": "mixed", "metrics": json.dumps({"market_cap": mcap, "is_bank": bank, "q_period_end": q})}


@pytest.fixture(autouse=True)
def fake_table():
    data._table = Table([_row("ASIANPAINT", 233000), _row("BERGEPAINT", 60000), _row("KANSAINER", 30000, q=20260630), _row("BANKX", 90000, bank=1),
                         _row("SBILIFE", 180000), _row("SMALLCO", 500)], {}, {})
    R._failed_at.clear()
    yield
    data.reset()
    R._failed_at.clear()


# ---------------------------------------------------------------------------------------------------------------- SL-1: the rupee base counts months
def test_monthly_averages_take_each_month_once_and_average_daily_rates_into_months():
    series = [["2026-08-31", 95.47], ["2026-09-30", 95.46], ["2026-10-31", 95.51]] + [[f"2026-11-{d:02d}", 94.0 + d / 100] for d in range(2, 14)]
    daily = [p for p in series if p[0] >= "2026-11"]
    got = dict(S.monthly_averages(series, daily))
    assert got["2026-08-31"] == 95.47 and got["2026-10-31"] == 95.51
    assert abs(got["2026-11-30"] - sum(v for _, v in daily) / len(daily)) < 1e-9          # 12 daily rates: one value for November
    assert "2026-12-31" not in dict(S.monthly_averages(series + [["2026-12-01", 93.0]], daily + [["2026-12-01", 93.0]]))   # one day is not a month
    oct_live = dict(S.monthly_averages(LIVE["series"]["usdinr"], LIVE["series"]["usdinr_d"]))
    assert oct_live["2026-10-31"] == 95.5063                                                # October's own average, not mixed with its four daily rates


@pytest.mark.parametrize("months, base_end", [(-3, "2026-06-30"), (0, "2026-09-30"), (3, "2026-12-31")])
def test_with_the_live_series_every_base_window_builds_on_finlits_own_months(months, base_end):
    co = S.company_from_pack(_shifted(months))
    assert co.base_end == base_end
    today = S.load_today(_today_in(), co.base_end, as_of=LIVE["today"])
    ti = today.inputs
    assert ti["usdinr_source"] == "FinLit usdinr" and ti["usdinr_months"]["argument"] == 0
    start = ti["base_window"][0]
    months_in = [v for d, v in S.monthly_averages(LIVE["series"]["usdinr"], LIVE["series"]["usdinr_d"]) if start < d <= base_end]
    assert ti["usdinr_months"]["finlit"] == len(months_in) >= 10
    assert abs(ti["usdinr_base"] - round(sum(months_in) / len(months_in), 4)) < 1e-9      # a month is one value: the daily rates do not outweigh the monthly averages
    assert ti["usdinr_now"] == LIVE["series"]["usdinr_d"]["points"][-1][1]                 # today's FBIL rate


def test_two_weeks_of_daily_rates_no_longer_pass_for_ten_months():
    s = copy.deepcopy(LIVE["series"])
    days = [[(date(2026, 10, 27) + timedelta(days=i)).isoformat(), 94.0] for i in range(60) if (date(2026, 10, 27) + timedelta(days=i)).weekday() < 5]
    s["usdinr"] = {"points": [p for p in s["usdinr"]["points"] if p[0] <= "2025-08-31"] + days}
    s["usdinr_d"] = {"points": days}
    co = S.company_from_pack(_shifted(3))                                                   # base window Jan to Dec 2026
    with pytest.raises(ValueError):
        S.load_today(_today_in(s, stopgap=False), co.base_end)                             # 40-odd daily points were counted as 40 "months" before
    today = S.load_today(_today_in(s), co.base_end)
    ti = today.inputs
    assert ti["usdinr_source"] == "FinLit usdinr + usdinr argument" and ti["usdinr_months"]["finlit"] == 2 and ti["usdinr_months"]["argument"] == 10
    row = next(r for r in P.today_rows(today, {}) if r["driver"].startswith("Rupees"))
    assert "FBIL" in row["source"] and "x-rates.com" in row["source"] and "10 of the base window's 12 months" in row["source"]


def test_asian_paints_today_is_unchanged_on_the_handover_inputs():
    m = json.loads((FIX / "macro_2026-11-04.json").read_text(encoding="utf-8"))
    co = S.company_from_pack(PACK)
    today = S.load_today(m, co.base_end)
    assert today.inputs["usdinr_source"] == "usdinr argument" and abs(today.usdinr - 2.36) < 0.01   # the 11 Nov sample's number


def test_the_page_payload_carries_no_internal_warning_and_a_missing_series_is_a_dash():
    s = copy.deepcopy(LIVE["series"])
    s["gdp"] = {"points": [["2024-03-31", 8.0]]}                                            # no GDP reading in the window
    co = S.company_from_pack(PACK)
    today = S.load_today(_today_in(s), co.base_end)
    assert today.inputs["warnings"]                                                        # the engine says so ...
    p = P.page_payload(PACK, co, today, eia_brent_next4=None, today_dates={}, base_window=tuple(today.inputs["base_window"]), closes={}, nifty={},
                       as_of="2026-11-13", size="Large cap", price_as_of="", inventory_days=None)
    assert "warnings" not in p["today_inputs"] and "months in the base window" not in json.dumps(p)        # ... the reader is not told the engine's words
    gdp = next(r for r in p["today_rows"] if r["driver"].startswith("Real GDP"))
    assert gdp["now"] == "–" and gdp["shock"][1] is None and "no reading" in gdp["source"]


# ---------------------------------------------------------------------------------------------------------------- the builder end to end on the live macro data
class _Conn:
    async def fetchval(self, sql, *a):
        return json.dumps(LIVE) if "macro_meta" in sql and a[0] == "payload" else None

    async def fetch(self, sql, *a):
        pre = (a[0] if a else "").rstrip("%")
        return [{"series": k, "d": date.fromisoformat(d), "v": v} for k, s in LIVE["series"].items() if k.startswith(pre) for d, v in s["points"]]

    async def fetchrow(self, *a):
        return None


class _Store:
    def __init__(self):
        self.pool = SimpleNamespace(acquire=asynccontextmanager(self._acq))

    async def _acq(self):
        yield _Conn()

    async def get_section(self, *a):
        return None


@pytest.mark.parametrize("months", [-3, 0, 3])
async def test_the_real_builder_runs_end_to_end_on_the_live_macro_data(monkeypatch, months):
    pk = _shifted(months)

    async def pack(app_, sym, statement="consolidated"):
        return copy.deepcopy(pk)

    async def nothing(*a):
        return {}
    monkeypatch.setattr(service, "build_pack", pack)
    monkeypatch.setattr(service, "weekly_closes", nothing)
    monkeypatch.setattr(service, "nifty_closes", nothing)
    app_ = SimpleNamespace(state=SimpleNamespace(store=_Store()))
    payload, _ = await service.build_payload_and_pack(app_, "ASIANPAINT", size="Large cap")
    json.dumps(payload)
    assert payload["eia_outlook"] is None and payload["today_inputs"]["usdinr_source"] == "FinLit usdinr"
    assert [s["id"] for s in payload["scenarios"]][0] == "today" and "today_eia" not in [s["id"] for s in payload["scenarios"]]


# ---------------------------------------------------------------------------------------------------------------- a bad provider answer is waiting, not "not covered"
async def test_statements_without_an_income_statement_are_not_ready_and_the_cached_copy_is_dropped(monkeypatch):
    deleted = []

    class Redis:
        async def delete(self, *keys):
            deleted.extend(keys)

    class St:
        redis = Redis()

        async def get_section(self, sym, statement, name):
            return (json.dumps({"profile": {"symbol": sym}, "dataQuality": {}}),) if name == "summary" else (json.dumps({"yearly": {}, "quarterly": {}}),)

    async def body(app_, sym, statement, period):
        return {"detail": "upstream error"}
    monkeypatch.setattr(service, "premium_json", body)
    app_ = SimpleNamespace(state=SimpleNamespace(store=St()))
    with pytest.raises(service.NotReady):
        await service.build_pack(app_, "TITAN")
    path = "/api/stocks/admin/fundamentals"
    for period in ("yearly", "quarterly"):
        params = {"query": "TITAN", "statement_type": "consolidated", "period": period}
        assert premium._key(path, params) in deleted and premium._key(path, {**params, "lean": "true"}) in deleted


# ---------------------------------------------------------------------------------------------------------------- financial companies are out of the universe
async def test_insurers_amcs_and_exchanges_are_financial_without_the_bank_flag(app):  # noqa: F811
    assert service.is_financial("SBILIFE") and service.is_financial("HDFCAMC") and service.is_financial("BSE") and service.is_financial("PAYTM")
    assert service.is_financial("NEWCO", "Financial Services", None) and service.is_financial("NEWCO", None, "Insurance")
    assert not service.is_financial("ASIANPAINT", "Consumer Durables", "Paints")
    t = data._table
    assert service.coverage_reason(t, "SBILIFE") == service.FINANCIAL and "SBILIFE" not in service.covered_quarters(t, ["SBILIFE", "ASIANPAINT"])
    silver = await signed_in(app, "fin79@example.com", plan="silver")
    r = await silver.get("/api/stress/SBILIFE/page")
    assert r.status_code == 404 and "financial companies" in r.text
    await silver.aclose()


# ---------------------------------------------------------------------------------------------------------------- the nightly job reaches every company
async def _clean(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM stress_pages")
        await conn.execute("DELETE FROM stress_failures")


def _payload(base_end="2026-09-30"):
    m = json.loads((FIX / "macro_2026-11-04.json").read_text(encoding="utf-8"))
    co = S.company_from_pack(PACK)
    today = S.load_today(m, co.base_end)
    p = P.page_payload(PACK, co, today, eia_brent_next4=None, today_dates={}, base_window=tuple(today.inputs["base_window"]), closes={}, nifty={},
                       as_of="2026-11-04", size="Large cap", price_as_of="", inventory_days=None)
    p["company"]["base_end"] = base_end
    return p


async def test_the_nightly_queue_puts_companies_without_a_page_first_and_new_results_before_old_pages(store, monkeypatch):  # noqa: F811
    await _clean(store)
    data._table = Table([_row("AAA", 500000), _row("BBB", 400000), _row("CCC", 300000, q=20261231), _row("DDD", 200000)], {}, {})
    for sym, age_h, base in (("AAA", 50, "2026-09-30"), ("BBB", 30, "2026-09-30"), ("CCC", 40, "2026-09-30")):
        await service.save_page(store, sym, _payload(base), PACK)
        async with store.pool.acquire() as conn:
            await conn.execute("UPDATE stress_pages SET built_at = now() - make_interval(hours => $1) WHERE symbol = $2", age_h, sym)
    calls = []

    async def build(app_, sym, size, statement="consolidated"):
        calls.append(sym)
        return _payload(), PACK
    monkeypatch.setattr(service, "build_payload_and_pack", build)
    monkeypatch.setattr(service, "CONCURRENCY", 1)
    await service.refresh_stress(store, object(), max_minutes=5)
    assert calls[0] == "DDD"                       # never built, though the smallest
    assert calls[1] == "CCC"                       # reported a newer quarter than its page
    assert calls[2:] == ["AAA", "BBB"]             # then the oldest page first (it used to be the largest first, every day)


async def test_a_run_that_stops_at_its_time_cap_says_there_is_work_left_and_the_supervisor_probe_sees_it(store, monkeypatch):  # noqa: F811
    await _clean(store)
    data._table = Table([_row("AAA", 500000), _row("BBB", 400000)], {}, {})

    async def build(app_, sym, size, statement="consolidated"):
        return _payload(), PACK
    monkeypatch.setattr(service, "build_payload_and_pack", build)
    res = await service.refresh_stress(store, object(), max_minutes=0)                 # the cap is reached before any company
    assert res["unreached"] == 2 and await service.has_work(store) is True
    assert await probes.build(store)["stress"]() is True
    res = await service.refresh_stress(store, object(), max_minutes=5)
    assert res["unreached"] == 0 and res["built"] == 2 and await service.has_work(store) is False


def test_the_stress_job_asks_its_probe_and_keeps_its_limits():
    j = next(j for j in build_jobs({}) if j.name == "stress")
    assert j.probe == "stress" and j.min_gap_min <= 10 and j.resumable
    assert j.max_runtime_min == 50 and j.max_attempts == 5 and j.sla.hours == 30 and "40" in j.args       # never weakened


# ---------------------------------------------------------------------------------------------------------------- on demand: retried later, not hammered; stale pages refreshed
async def test_a_failed_build_is_tried_again_on_a_later_visit_but_not_on_every_poll(app, store, monkeypatch):  # noqa: F811
    await _clean(store)
    calls = []

    async def fails(app_, sym, **kw):
        calls.append(sym)
        raise service.NotReady("The statements for this company are not available right now.")
    monkeypatch.setattr(service, "build_payload_and_pack", fails)
    silver = await signed_in(app, "retry79@example.com", plan="silver")
    for _ in range(4):
        r = await silver.get("/api/stress/ASIANPAINT/page")
        assert r.status_code == 503 and service.PLAIN_NOT_READY in r.text
    assert calls == ["ASIANPAINT"]                                   # four polls, one provider build
    monkeypatch.setattr(R, "RETRY_AFTER_S", 0.0)
    await silver.get("/api/stress/ASIANPAINT/page")
    assert calls == ["ASIANPAINT", "ASIANPAINT"]                     # after the gap: tried again
    await silver.aclose()


def test_a_page_is_stale_when_a_day_old_or_behind_new_results():
    now = datetime(2026, 11, 13, 12, tzinfo=timezone.utc)
    rec = lambda h, be="2026-09-30": {"built_at": now - timedelta(hours=h), "payload": {"company": {"base_end": be}}}   # noqa: E731
    assert not service.page_is_stale(rec(2), "2026-09-30", now) and service.page_is_stale(rec(31), "2026-09-30", now)
    assert service.page_is_stale(rec(8), "2026-12-31", now) and not service.page_is_stale(rec(2), "2026-12-31", now)


async def test_a_stale_stored_page_is_served_at_once_and_rebuilt_behind_the_reader(app, store, monkeypatch):  # noqa: F811
    await _clean(store)
    await service.save_page(store, "ASIANPAINT", _payload(), PACK)
    async with store.pool.acquire() as conn:
        await conn.execute("UPDATE stress_pages SET built_at = now() - interval '40 hours'")
    calls = []

    async def build(app_, sym, **kw):
        calls.append(sym)
        return _payload(), PACK
    monkeypatch.setattr(service, "build_payload_and_pack", build)
    silver = await signed_in(app, "stale79@example.com", plan="silver")
    r = await silver.get("/api/stress/ASIANPAINT/page")
    assert r.status_code == 200
    for t in list(R._building.values()):
        await t
    assert calls == ["ASIANPAINT"]
    async with store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT built_at > now() - interval '1 hour' FROM stress_pages WHERE symbol = 'ASIANPAINT'")
    await silver.aclose()


# ---------------------------------------------------------------------------------------------------------------- Gold answers keep the model's workings on the server
def _no_internals(r):
    assert "assumptions" not in r and set(r["value"]) == {"move_pct"}
    text = json.dumps(r)
    for w in ("k_pct", "k_new_pct", "g_pct", "weight_on_history", "industry_value", "growth_pct"):
        assert w not in text, w


def test_run_answers_only_the_value_move_percentage():
    co = S.company_from_pack(PACK)
    _no_internals(R._result(co, S.PRESETS["2022"]))


async def test_compare_answers_without_either_companys_assumptions(app, store, monkeypatch):  # noqa: F811
    await _clean(store)
    for sym in ("ASIANPAINT", "BERGEPAINT"):
        await service.save_page(store, sym, _payload(), PACK)
    m = json.loads((FIX / "macro_2026-11-04.json").read_text(encoding="utf-8"))

    async def today(store_):
        return {"as_of": "2026-11-04", "series": m["series"], "brent": [list(p) for p in m["brent_quarterly"]], "usdinr_monthly": service.stopgap_usdinr()}, None
    monkeypatch.setattr(service, "macro_today", today)
    gold = await signed_in(app, "cmp79@example.com", plan="gold")
    r = await gold.post("/api/stress/compare", json={"a": "ASIANPAINT", "b": "BERGEPAINT", "preset": "2022"})
    assert r.status_code == 200, r.text
    d = r.json()
    _no_internals(d["a"])
    _no_internals(d["b"])
    await gold.aclose()


# ---------------------------------------------------------------------------------------------------------------- the compare view's second company
def test_the_default_peer_prefers_a_stored_page_on_the_same_quarter():
    cov = {"A": "2026-09-30", "P1": "2026-09-30", "P2": "2026-06-30", "P3": "2026-09-30"}
    assert P.default_peer("A", ["P1", "P2", "P3"], cov, stored={"P3"}) == {"symbol": "P3", "same_quarter": True, "stored": True}
    assert P.default_peer("A", ["P2", "P1"], cov, stored={"P2"}) == {"symbol": "P1", "same_quarter": True, "stored": False}   # same quarter beats stored
    assert P.default_peer("A", ["P2"], {"A": "2026-12-31", **{k: v for k, v in cov.items() if k != "A"}}, stored={"P2"}) == {"symbol": "P2", "same_quarter": False, "stored": True}
    assert P.default_peer("A", ["P2"], cov, stored=set()) == {"symbol": "P2", "same_quarter": False, "stored": False}
    assert P.default_peer("A", ["P1"], cov) == {"symbol": "P1", "same_quarter": True}                                    # the old call keeps its shape


async def test_a_chosen_peer_without_a_page_starts_being_built(app, store, monkeypatch):  # noqa: F811
    await _clean(store)
    await service.save_page(store, "ASIANPAINT", _payload(), PACK)
    await service.save_page(store, "KANSAINER", _payload(), PACK)                       # stored, but on an older quarter
    built = []
    gate = asyncio.Event()

    async def build(app_, sym, **kw):
        built.append(sym)
        await gate.wait()
        return _payload(), PACK
    monkeypatch.setattr(service, "build_payload_and_pack", build)

    async def peers(sym, statement, name):
        return (json.dumps({"symbols": ["SBILIFE", "KANSAINER", "BERGEPAINT"]}),) if name == "peers" else None
    monkeypatch.setattr(app.state.store, "get_section", peers)
    gold = await signed_in(app, "peer79@example.com", plan="gold")
    d = (await gold.get("/api/stress/ASIANPAINT/peer")).json()
    assert d["peer"] == {"symbol": "BERGEPAINT", "same_quarter": True, "stored": False} and d["peers"] == ["KANSAINER", "BERGEPAINT"]   # never the insurer
    assert {p["symbol"]: p["stored"] for p in d["peer_details"]} == {"KANSAINER": True, "BERGEPAINT": False}
    await asyncio.sleep(0.05)
    assert built == ["BERGEPAINT"]                                                       # its page is being built for the compare view
    gate.set()
    for t in list(R._building.values()):
        await t
    await gold.aclose()


def test_the_base_window_is_said_in_months_from_the_month_after_the_first_quarter_end():
    from finlit.stress import page as P
    assert P.window_words(("2025-09-30", "2026-09-30")) == ("Oct 2025", "Sep 2026")
    assert P.window_words(("2025-12-31", "2026-12-31")) == ("Jan 2026", "Dec 2026")
    assert P.window_words(("Oct 2025", "Sep 2026")) == ("Oct 2025", "Sep 2026")      # already words: kept
