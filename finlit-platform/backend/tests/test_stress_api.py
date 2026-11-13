"""Stress Lab on the site: the plan rules, the compare default, the clipping of the reader's numbers, the value switch, the coverage rule and who may call what."""
import json
from datetime import date

import pytest

from finlit.macro import steo_quarters
from finlit.screener import data
from finlit.screener.data import Table
from finlit.stress import engine, page as P, router as R, service
from test_auth import ORIGIN, anon, app, new_client, signed_in  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: F401  (fixtures)

S = engine()


# ---------------------------------------------------------------------------------------------------------------- plans and the compare default
FULL = {"scenarios": [{"id": k, "name": k} for k in ("today", "today_eia", "2022", "2020", "oil", "rupee", "rates", "slowdown")], "company": {}}


def test_silver_gets_only_its_scenarios_and_the_names_of_the_rest_and_free_gets_nothing():
    s = P.plan_payload(FULL, "silver")
    assert [x["id"] for x in s["scenarios"]] == ["today", "today_eia", "2022", "2020"]
    assert s["locked_scenarios"] == [{"id": k, "name": k} for k in ("oil", "rupee", "rates", "slowdown")] and s["plan"] == "silver"
    assert len(P.plan_payload(FULL, "gold")["scenarios"]) == 8
    with pytest.raises(ValueError):
        P.plan_payload(FULL, "free")


def test_the_second_company_is_the_first_covered_peer_on_the_same_quarter():
    cov = {"A": "2026-09-30", "P1": "2026-06-30", "P2": "2026-09-30", "BANK": None}
    assert P.default_peer("A", ["BANK", "P1", "P2"], cov) == {"symbol": "P2", "same_quarter": True}
    assert P.default_peer("A", ["P1"], cov) == {"symbol": "P1", "same_quarter": False}
    assert P.default_peer("A", ["XYZ"], cov) is None


# ---------------------------------------------------------------------------------------------------------------- coverage
def test_the_launch_rule_leaves_out_financials_and_companies_under_ten_thousand_crore():
    assert service.covered_by_rule(20000, 0.0) is None
    assert service.covered_by_rule(20000, 1.0) == service.FINANCIAL
    assert service.covered_by_rule(9999, 0.0) == service.NOT_SIZE and service.covered_by_rule(None, 0.0) == service.NOT_SIZE


def _row(sym, mcap, bank=0, q=20260930):
    return {"symbol": sym, "name": sym, "sector": "S", "industry": "I", "band": "mixed", "metrics": json.dumps({"market_cap": mcap, "is_bank": bank, "q_period_end": q})}


def test_covered_quarters_come_from_the_table_without_building_any_pack():
    t = Table([_row("ASIAN", 200000), _row("BANKX", 90000, bank=1), _row("SMALL", 500), _row("PEER", 80000, q=20260630)], {}, {})
    got = service.covered_quarters(t, ["ASIAN", "BANKX", "SMALL", "PEER", "NOPE"])
    assert set(got) == {"ASIAN", "PEER"} and got == {"ASIAN": "2026-09-30", "PEER": "2026-06-30"}


# ---------------------------------------------------------------------------------------------------------------- the reader's numbers
def test_sliders_are_clipped_to_the_specs_ranges_and_the_scenario_becomes_custom():
    sc = R.scenario_from(R.ScenarioIn(crude=900, rate_bp=-9000, demand=-99, cpi=3.0, persistence="permanent"))
    assert (sc.crude, sc.rate_bp, sc.demand, sc.cpi, sc.persistence, sc.name) == (300.0, -500.0, -60.0, 3.0, "permanent", "Custom")
    assert R.scenario_from(R.ScenarioIn(persistence="forever")).persistence == "one_year"
    base = S.PRESETS["oil"]
    assert R.scenario_from(R.ScenarioIn(rate_bp=25), base).crude == base.crude          # untouched shocks keep the preset's value


def _co():
    t = S.ExposureTable()
    e = t.lookup(symbol="ASIANPAINT", basic="Paints", industry="Consumer Durables", sector="Consumer Durables")
    return S.Company(symbol="X", name="X", revenue=1000.0, rm=500.0, emp=100.0, opex=100.0, other_income=10.0, dep=20.0, interest=10.0, tax_rate=0.25, shares=10.0, debt=100.0, cash=50.0, exposure=e)


def test_your_value_boxes_refuse_what_breaks_the_share_rules():
    from fastapi import HTTPException
    co = _co()
    assert R.with_settings(co, {"pass_through": 0.7}).exposure.pass_through == 0.7 and R.with_settings(co, None) is co
    for bad in ({"pass_through": 1.5}, {"demand_beta": 0.1}, {"crude_rm": 0.9, "import_rm": 0.5}, {"colour": 1}):
        with pytest.raises(HTTPException) as e:
            R.with_settings(co, bad)
        assert e.value.status_code == 422


def test_the_value_switch_removes_the_value_move_wherever_it_sits():
    out = R.strip_value({"value": {"move_pct": 3}, "rows": [{"value_move": 2, "eps": 1}], "x": {"value_other_persistence": 1, "keep": 1}})
    assert out == {"rows": [{"eps": 1}], "x": {"keep": 1}}


def test_the_value_move_is_a_percentage_only_never_a_price():
    r = S.run(_co(), S.PRESETS["oil"])
    assert set(r["value"]) <= {"move_pct", "base", "stressed", "cost_of_equity", "growth", "persistence", "note"} or "price" not in json.dumps(r["value"]).lower()
    assert "₹" not in json.dumps(r["value"])


def test_eia_outlook_is_the_average_of_the_next_four_full_quarters():
    months = {f"2026-{m:02d}": 60.0 + m for m in range(1, 13)}
    months.update({f"2027-{m:02d}": 70.0 for m in range(1, 13)})
    assert steo_quarters(months, date(2026, 11, 11)) == [70.0, 70.0, 70.0, 70.0]            # 2027 Q1 to Q4
    assert steo_quarters(months, date(2026, 5, 2)) == [round((67 + 68 + 69) / 3, 2), round((70 + 71 + 72) / 3, 2), 70.0, 70.0]
    assert steo_quarters({"2026-12": 1.0}, date(2026, 11, 1)) is None                           # a short outlook is refused, never padded


# ---------------------------------------------------------------------------------------------------------------- who may call what
@pytest.fixture(autouse=True)
def fake_table():
    data._table = Table([_row("ASIANPAINT", 233000), _row("BANKX", 90000, bank=1), _row("SMALLCO", 500)], {}, {})
    R._failed_at.clear()                 # each test starts with no failed build waiting out its retry gap
    yield
    data.reset()
    R._failed_at.clear()


pytestmark = pytest.mark.integration


async def test_free_visitors_and_other_plans_cannot_read_the_page(app, anon):  # noqa: F811
    assert (await anon.get("/api/stress/ASIANPAINT/page")).status_code in (401, 403)
    basic = await signed_in(app, "sb@example.com", plan="basic")
    assert (await basic.get("/api/stress/ASIANPAINT/page")).status_code == 403
    await basic.aclose()


async def test_silver_reads_the_page_but_cannot_run_compare_or_ask_for_a_peer(app, store):  # noqa: F811
    await _clean(store)
    silver = await signed_in(app, "ss@example.com", plan="silver")
    body = {"preset": "today"}
    assert (await silver.post("/api/stress/ASIANPAINT/run", json=body)).status_code in (403,)
    assert (await silver.post("/api/stress/compare", json={"a": "ASIANPAINT", "b": "BANKX"})).status_code == 403
    assert (await silver.get("/api/stress/ASIANPAINT/peer")).status_code == 403
    r = await silver.get("/api/stress/ASIANPAINT/page")
    assert r.status_code in (404, 503)                       # a report is not stored in the test database: "not ready", never a result built from nothing
    await silver.aclose()


async def test_a_bank_and_a_small_company_say_why_they_are_not_covered(app):  # noqa: F811
    silver = await signed_in(app, "sc@example.com", plan="silver")
    for sym, words in (("BANKX", "financial companies"), ("SMALLCO", "large and mid caps")):
        r = await silver.get(f"/api/stress/{sym}/page")
        d = r.json()
        assert r.status_code == 404 and words in json.dumps(d), (sym, d)
    assert (await silver.get("/api/stress/bad%20one/page")).status_code in (400, 404)
    await silver.aclose()


# ---------------------------------------------------------------------------------------------------------------- the whole payload, on Asian Paints' own figures
FIX = __import__("pathlib").Path(__file__).parent.parent / "finlit_technicals" / "tests" / "fixtures"


def _payload(eia=(95.0, 92.0, 90.0, 88.0)):
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    m = json.loads((FIX / "macro_2026-11-04.json").read_text(encoding="utf-8"))
    co = S.company_from_pack(pack)
    today = S.load_today(m, co.base_end)
    return P.page_payload(pack, co, today, eia_brent_next4=eia, today_dates={}, base_window=tuple(today.inputs["base_window"]), closes={}, nifty={}, as_of="2026-11-04", size="Large cap",
                          price_as_of="2026-11-03", inventory_days=None)


def test_the_page_payload_has_every_scenario_and_no_rupee_value_beside_the_value_move():
    p = _payload()
    assert [s["id"] for s in p["scenarios"]] == ["today", "today_eia", "2022", "2020", "oil", "rupee", "rates", "slowdown"]
    assert p["eia_outlook"]["avg"] == 91.25 and p["company"]["field_source"]["pass_through"]
    eia = next(s for s in p["scenarios"] if s["id"] == "today_eia")
    today = next(s for s in p["scenarios"] if s["id"] == "today")
    assert eia["crude"] < today["crude"]                                  # "Crude eases": the outlook is below today's level
    silver = P.plan_payload(p, "silver")
    assert [s["id"] for s in silver["scenarios"]] == ["today", "today_eia", "2022", "2020"] and len(silver["locked_scenarios"]) == 4
    text = json.dumps(p).lower()
    for w in ("buy", "sell", "hold ", "target price", "fair value"):
        assert w not in text.replace("holds up well", ""), w


def test_the_public_payload_keeps_model_workings_off_the_page():
    text = json.dumps(_payload())
    for w in ("weight_on_history", "industry_value", "years_used", "cost_of_equity", "implied_price_rise_pct", "rm_share_before"):
        assert w not in text, w


def test_without_an_eia_outlook_there_is_no_crude_eases_scenario():
    p = _payload(eia=None)
    assert "today_eia" not in [s["id"] for s in p["scenarios"]] and p["eia_outlook"] is None


def test_the_router_runs_the_same_numbers_as_the_engine_and_strips_the_value_when_switched_off():
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    co = S.company_from_pack(pack)
    out = R._result(co, S.PRESETS["2022"])
    assert out["label"] and out["explain"] and "assumptions" not in out and out["value_other_persistence"] is not None
    assert out["change_pct"]["eps"] == S.run(co, S.PRESETS["2022"])["change_pct"]["eps"]
    assert "value" not in R.strip_value(out) and "change_pct" in R.strip_value(out)


# ---------------------------------------------------------------------------------------------------------------- the latest-quarter check and inventory days (task 79)
def test_latest_quarter_check_gives_the_margin_the_model_put_and_the_one_reported():
    import json as _json
    from pathlib import Path
    fx = Path(__file__).resolve().parent.parent / "finlit_technicals" / "tests" / "fixtures"
    pack, macro = _json.loads((fx / "ASIANPAINT.json").read_text()), _json.loads((fx / "macro_2026-11-04.json").read_text())
    co = S.company_from_pack(pack)
    lq = P.latest_quarter_check(pack, co, macro["series"], macro["brent_quarterly"], macro["usdinr_monthly"])
    assert lq == {"from": "Jul to Sep 2025", "to": "Jul to Sep 2026", "margin_before": 17.6, "predicted": 13.9, "reported": 15.6}
    # no price in the windows: a blank, never a guess
    assert P.latest_quarter_check(pack, co, macro["series"], [], macro["usdinr_monthly"]) is None
    short = {**pack, "quarterly": {**pack["quarterly"], "periods": pack["quarterly"]["periods"][:4]}}
    assert P.latest_quarter_check(short, co, macro["series"], macro["brent_quarterly"], macro["usdinr_monthly"]) is None


# ---------------------------------------------------------------------------------------------------------------- the 12 Nov live check (task 79): SL-1 to SL-5
INTERNAL = __import__("re").compile(r"usdinr=|another source|traceback|keyerror|exception|none of|\bpass \w+=", __import__("re").I)


async def _clean(store):
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM stress_pages")
        await conn.execute("DELETE FROM stress_failures")


async def _clean_pages(store):
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM stress_pages")


def _macro_today(m):
    async def fake(store):
        return {"as_of": "2026-11-04", "series": m["series"], "brent": [list(p) for p in m["brent_quarterly"]], "usdinr_monthly": service.stopgap_usdinr()}, None
    return fake


def test_sl1_the_rupee_hole_no_longer_blocks_a_company_and_the_page_names_the_source_it_really_used():
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    m = json.loads((FIX / "macro_2026-11-04.json").read_text(encoding="utf-8"))
    co = S.company_from_pack(pack)
    holed = {"as_of": "2026-11-04", "series": {**m["series"], "usdinr": {"points": [["2025-08-31", 88.0], ["2026-10-27", 94.0], ["2026-11-02", 94.9]]}}, "brent": [list(p) for p in m["brent_quarterly"]]}
    with pytest.raises(ValueError):
        S.load_today(holed, co.base_end)                                   # the 12 Nov failure: no month inside the base window and no fallback
    today = S.load_today({**holed, "usdinr_monthly": service.stopgap_usdinr()}, co.base_end)
    assert today.inputs["usdinr_source"] == "usdinr argument"
    row = next(r for r in P.today_rows(today, {}) if r["driver"].startswith("Rupees"))
    assert "x-rates.com" in row["source"] and "stop-gap" in row["source"]      # never "FBIL" for numbers that did not come from it
    months = [[f"{y}-{mo:02d}-28", 88.0 + i * 0.3] for i, (y, mo) in enumerate([(2025, 10), (2025, 11), (2025, 12)] + [(2026, k) for k in range(1, 10)])]
    full = {**holed, "series": {**holed["series"], "usdinr": {"points": months + [["2026-11-02", 94.9]]}}}
    today2 = S.load_today({**full, "usdinr_monthly": service.stopgap_usdinr()}, co.base_end)
    assert today2.inputs["usdinr_source"] == "FinLit usdinr"                   # the site's own series is used as soon as it has the months
    assert next(r for r in P.today_rows(today2, {}) if r["driver"].startswith("Rupees"))["source"] == "FBIL reference rate, published by the RBI"


def test_sl1_the_stop_gap_file_says_what_it_is():
    d = json.loads(service.STOPGAP_FX.read_text(encoding="utf-8"))
    assert "STOP-GAP" in d["_note"] and d["source"] == service.STOPGAP_FX_SOURCE and len(d["points"]) >= 19


async def test_sl4_a_page_that_cannot_be_built_says_plain_words_and_keeps_the_reason_in_the_log(app, store, monkeypatch, caplog):  # noqa: F811
    await _clean(store)
    async def boom(app_, sym, **kw):
        raise service.NotReady("Today's inputs are not complete yet: FinLit's USD/INR series has 0 of 12 months in the base window; pass usdinr= monthly averages from another source")
    monkeypatch.setattr(service, "build_payload_and_pack", boom)
    silver = await signed_in(app, "s4@example.com", plan="silver")
    with caplog.at_level("WARNING", logger="finlit.stress"):
        r = await silver.get("/api/stress/ASIANPAINT/page")
    body = json.dumps(r.json())
    assert r.status_code == 503 and service.PLAIN_NOT_READY in body and not INTERNAL.search(body)
    assert "usdinr=" in caplog.text                                       # the reason is for the people who run the site
    async with store.pool.acquire() as conn:
        assert "usdinr=" in await conn.fetchval("SELECT reason FROM stress_failures WHERE symbol = 'ASIANPAINT'")
    await silver.aclose()


async def test_sl4_a_timeout_and_an_unexpected_fault_are_plain_too(app, store, monkeypatch):  # noqa: F811
    async def hang(app_, sym, **kw):
        await __import__("asyncio").sleep(5)
    monkeypatch.setattr(service, "build_payload_and_pack", hang)
    monkeypatch.setattr(service, "LIVE_BUILD_S", 0.05)
    silver = await signed_in(app, "s4b@example.com", plan="silver")
    r = await silver.get("/api/stress/ASIANPAINT/page")
    assert r.status_code == 503 and service.PLAIN_NOT_READY in json.dumps(r.json())
    async def bug(app_, sym, **kw):
        raise KeyError("cost_of_materials")
    monkeypatch.setattr(service, "build_payload_and_pack", bug)
    r = await silver.get("/api/stress/ASIANPAINT/page")
    assert r.status_code == 503 and "cost_of_materials" not in r.text and not INTERNAL.search(r.text)
    await silver.aclose()


async def test_sl2_a_stored_page_is_served_without_building_anything_and_gold_runs_on_the_stored_pack(app, store, monkeypatch):  # noqa: F811
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    m = json.loads((FIX / "macro_2026-11-04.json").read_text(encoding="utf-8"))
    payload = _payload()
    await service.save_page(store, "ASIANPAINT", payload, pack)
    async def never(*a, **k):
        raise AssertionError("the data provider must not be called when a stored page exists")
    monkeypatch.setattr(service, "build_payload_and_pack", never)
    monkeypatch.setattr(service, "build_pack", never)
    monkeypatch.setattr(service, "macro_today", _macro_today(m))
    silver = await signed_in(app, "s2@example.com", plan="silver")
    r = await silver.get("/api/stress/ASIANPAINT/page")
    d = r.json()
    assert r.status_code == 200 and [s["id"] for s in d["scenarios"]] == ["today", "today_eia", "2022", "2020"] and d["flags"]["showValue"] is True
    await silver.aclose()
    gold = await signed_in(app, "g2@example.com", plan="gold")
    r = await gold.post("/api/stress/ASIANPAINT/run", json={"preset": "2022"})
    assert r.status_code == 200 and r.json()["label"] and r.json()["change_pct"]["eps"] is not None
    await gold.aclose()


async def test_sl5_quick_picks_are_only_covered_companies_with_a_stored_page(app, store, monkeypatch):  # noqa: F811
    await _clean(store)
    async def not_yet(app_, sym, **kw):
        raise service.NotReady("not stored yet")
    monkeypatch.setattr(service, "build_payload_and_pack", not_yet)                     # the warm-up the empty start page starts finds nothing to build here
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    silver = await signed_in(app, "s5@example.com", plan="silver")
    assert (await silver.get("/api/stress/quick-picks")).json() == {"picks": []}            # nothing stored yet: nothing offered
    await service.save_page(store, "ASIANPAINT", _payload(), pack)
    await service.save_page(store, "BANKX", _payload(), pack)                                 # a bank with a page by mistake is still never offered
    picks = (await silver.get("/api/stress/quick-picks")).json()["picks"]
    assert [p["symbol"] for p in picks] == ["ASIANPAINT"] and picks[0]["name"] and "HDFCBANK" not in json.dumps(picks)
    await silver.aclose()
    basic = await signed_in(app, "b5@example.com", plan="basic")
    assert (await basic.get("/api/stress/quick-picks")).status_code == 403
    await basic.aclose()


async def test_sl2_the_nightly_run_stores_every_covered_company_resumes_and_logs_why_one_failed(store, monkeypatch):  # noqa: F811
    await _clean(store)
    data._table = Table([_row("ASIANPAINT", 233000), _row("TITAN", 300000), _row("BANKX", 90000, bank=1), _row("SMALLCO", 500)], {}, {})
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    calls = []
    async def build(app_, sym, size, statement="consolidated"):
        calls.append(sym)
        if sym == "TITAN":
            raise RuntimeError("provider answered 502")
        return _payload(), pack
    monkeypatch.setattr(service, "build_payload_and_pack", build)
    res = await service.refresh_stress(store, object(), max_minutes=5)
    assert res["covered"] == 2 and res["built"] == 1 and res["failed"] == 1 and res["failures"][0]["symbol"] == "TITAN" and "502" in res["failures"][0]["reason"]
    assert calls == ["TITAN", "ASIANPAINT"]                              # largest market value first; the bank and the small company are never tried
    assert await service.stored_symbols(store) == ["ASIANPAINT"]
    calls.clear()
    again = await service.refresh_stress(store, object(), max_minutes=5)
    assert calls == ["TITAN"] and again["skipped_built_today"] == 1       # resumable: what was built today is not built again
    async def fine(app_, sym, size, statement="consolidated"):
        return _payload(), pack
    monkeypatch.setattr(service, "build_payload_and_pack", fine)
    ok = await service.refresh_stress(store, object(), max_minutes=5)
    assert ok["failed"] == 0 and sorted(await service.stored_symbols(store)) == ["ASIANPAINT", "TITAN"]
    async with store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM stress_failures WHERE symbol = 'TITAN'") == 0      # a success clears the reason


async def test_sl2_a_slow_company_times_out_alone_and_the_others_are_still_built(store, monkeypatch):  # noqa: F811
    await _clean(store)
    data._table = Table([_row("ASIANPAINT", 233000), _row("TITAN", 300000)], {}, {})
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    async def build(app_, sym, size, statement="consolidated"):
        if sym == "TITAN":
            await __import__("asyncio").sleep(5)
        return _payload(), pack
    monkeypatch.setattr(service, "build_payload_and_pack", build)
    res = await service.refresh_stress(store, object(), max_minutes=5, per_company_s=0.05)
    assert res["built"] == 1 and res["failed"] == 1 and "timed out" in res["failures"][0]["reason"]


async def test_sl2_a_company_that_is_not_ready_is_waiting_not_a_failure_and_recent_failures_go_last(store, monkeypatch):  # noqa: F811
    await _clean(store)
    data._table = Table([_row("ASIANPAINT", 233000), _row("TITAN", 300000), _row("HINDUNILVR", 280000)], {}, {})
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    calls = []
    async def build(app_, sym, size, statement="consolidated"):
        calls.append(sym)
        if sym == "TITAN":
            raise service.NotReady("This company's report is not stored yet.")
        return _payload(), pack
    monkeypatch.setattr(service, "build_payload_and_pack", build)
    res = await service.refresh_stress(store, object(), max_minutes=5)
    assert res["built"] == 2 and res["not_ready"] == 1 and res["failed"] == 0 and res["left"] == 1       # waiting for its report: not a fault of the run
    async with store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT kind FROM stress_failures WHERE symbol = 'TITAN'") == "not_ready"
    await _clean_pages(store)
    calls.clear()
    await service.refresh_stress(store, object(), max_minutes=5)
    assert calls == ["HINDUNILVR", "ASIANPAINT", "TITAN"]                 # TITAN failed a moment ago: the others are tried first, then it again


async def test_sl2_a_few_companies_are_built_at_once_and_all_of_them_are_stored(store, monkeypatch):  # noqa: F811
    import asyncio
    await _clean(store)
    syms = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"]
    data._table = Table([_row(s, 200000 + i) for i, s in enumerate(syms)], {}, {})
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    running = peak = 0
    async def build(app_, sym, size, statement="consolidated"):
        nonlocal running, peak
        running += 1; peak = max(peak, running)
        await asyncio.sleep(0.02)
        running -= 1
        return _payload(), pack
    monkeypatch.setattr(service, "build_payload_and_pack", build)
    res = await service.refresh_stress(store, object(), max_minutes=5)
    assert res["built"] == 6 and res["failed"] == 0 and 1 < peak <= service.CONCURRENCY and sorted(await service.stored_symbols(store)) == sorted(syms)


async def test_a_slow_build_is_not_cancelled_it_finishes_in_the_background_and_the_next_visit_gets_the_page(app, store, monkeypatch):  # noqa: F811
    import asyncio
    await _clean(store)
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    calls = []
    async def slow(app_, sym, **kw):
        calls.append(sym)
        await asyncio.sleep(0.4)                     # longer than the reader waits, much shorter than the build's own limit
        return _payload(), pack
    monkeypatch.setattr(service, "build_payload_and_pack", slow)
    monkeypatch.setattr(service, "LIVE_BUILD_S", 0.05)
    silver = await signed_in(app, "slow@example.com", plan="silver")
    first, second = await asyncio.gather(silver.get("/api/stress/ASIANPAINT/page"), silver.get("/api/stress/ASIANPAINT/page"))
    assert first.status_code == 503 and second.status_code == 503 and service.PLAIN_NOT_READY in first.text
    assert calls == ["ASIANPAINT"]                   # two readers at once: one build
    for _ in range(40):                              # the build carries on after the readers were answered, and stores the page
        if await service.stored_symbols(store) == ["ASIANPAINT"]:
            break
        await asyncio.sleep(0.05)
    assert await service.stored_symbols(store) == ["ASIANPAINT"]
    r = await silver.get("/api/stress/ASIANPAINT/page")
    assert r.status_code == 200 and r.json()["company"]["symbol"] == "ASIANPAINT" and calls == ["ASIANPAINT"]     # served stored, not built again
    await silver.aclose()


async def test_the_start_page_gets_the_largest_companies_ready_a_few_at_a_time_and_offers_them_once_stored(app, store, monkeypatch):  # noqa: F811
    import asyncio
    from finlit.stress import router as R2
    await _clean(store)
    syms = ["AAA", "BBB", "CCC", "DDD", "EEE"]
    data._table = Table([_row(s, 300000 - i * 1000) for i, s in enumerate(syms)] + [_row("BANKX", 900000, bank=1)], {}, {})
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    built = []
    gate = asyncio.Event()
    async def build(app_, sym, **kw):
        built.append(sym)
        await gate.wait()
        return _payload(), pack
    monkeypatch.setattr(service, "build_payload_and_pack", build)
    silver = await signed_in(app, "warm@example.com", plan="silver")
    assert (await silver.get("/api/stress/quick-picks")).json() == {"picks": []}
    await asyncio.sleep(0.05)
    assert built == ["AAA", "BBB", "CCC"]                                             # the largest first, three at a time, never the bank
    await silver.get("/api/stress/quick-picks"); await asyncio.sleep(0.05)
    assert built == ["AAA", "BBB", "CCC"]                                             # asking again while they run starts nothing more
    gate.set()
    for _ in range(40):
        if len(await service.stored_symbols(store)) >= 3:
            break
        await asyncio.sleep(0.05)
    picks = (await silver.get("/api/stress/quick-picks")).json()["picks"]
    assert [p["symbol"] for p in picks] == ["AAA", "BBB", "CCC"]                     # stored, so offered
    await asyncio.sleep(0.1)
    assert "DDD" in built and "EEE" in built and "BANKX" not in built                # and the next ones are being got ready
    await silver.aclose()
    for t in list(R2._building.values()):
        await t


async def test_admins_can_read_why_pages_are_missing_readers_cannot(app, store, monkeypatch):  # noqa: F811
    from test_earnings_api import admin_client
    await _clean(store)
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    await service.save_page(store, "ASIANPAINT", _payload(), pack)
    await service.save_failure(store, "TITAN", "not_ready", "This company's report is not stored yet.")
    silver = await signed_in(app, "st1@example.com", plan="silver")
    assert (await silver.get("/api/stress/admin/status")).status_code == 403
    await silver.aclose()
    admin = await admin_client(app, "stressadmin@example.com")
    assert (await admin.get("/api/stress/admin/status")).json()["detail"]["status"] == "mfa_required"     # admin tools need the authenticator step, like every admin page
    from types import SimpleNamespace
    from finlit.auth.routes import admin_ctx
    app.dependency_overrides[admin_ctx] = lambda: SimpleNamespace(role="admin", mfa_ok=True)               # past that step
    try:
        r = await admin.get("/api/stress/admin/status")
    finally:
        app.dependency_overrides.pop(admin_ctx, None)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["stored"] == 1 and d["stored_today"] == 1 and d["reasons"][0] == {"kind": "not_ready", "reason": "This company's report is not stored yet.", "companies": 1}
    assert d["latest_failures"][0]["symbol"] == "TITAN" and "ASIANPAINT" not in d["largest_without_page"] and isinstance(d["building"], list)
    await admin.aclose()


# ---------------------------------------------------------------------------------------------------------------- the statements the page is built from
class _FakeRedis:
    def __init__(self, held=None):
        self.held = held or {}

    async def get(self, key):
        return self.held.get(key)


def _fake_app(held=None):
    from types import SimpleNamespace
    return SimpleNamespace(state=SimpleNamespace(store=SimpleNamespace(redis=_FakeRedis(held))))


async def test_the_statements_are_asked_for_lean_and_twice_before_a_company_is_not_ready(monkeypatch):
    from finlit import premium
    calls = []

    async def refresh(app, key, path, params, fresh):
        calls.append(dict(params))
        return None if len(calls) == 1 else b'{"periods": ["Mar 2026"], "rows": {}}'
    monkeypatch.setattr(premium, "_refresh", refresh)
    monkeypatch.setattr(service, "PREMIUM_RETRY_S", 0.0)
    got = await service.premium_json(_fake_app(), "TCS", "consolidated", "yearly")
    assert got == {"periods": ["Mar 2026"], "rows": {}}
    assert len(calls) == 2 and all(c.get("lean") == "true" and c["query"] == "TCS" for c in calls)      # the lean view, and the second try after a failure

    async def never(app, key, path, params, fresh):
        return None
    monkeypatch.setattr(premium, "_refresh", never)
    with pytest.raises(service.NotReady):
        await service.premium_json(_fake_app(), "TCS", "consolidated", "yearly")


async def test_a_copy_the_company_financials_page_already_holds_is_used_without_asking_the_provider(monkeypatch):
    from finlit import premium
    path, params = "/api/stocks/admin/fundamentals", {"query": "TCS", "statement_type": "consolidated", "period": "yearly"}
    held = {premium._key(path, params): json.dumps({"t": 0, "f": 900, "b": '{"periods": ["Mar 2025"], "rows": {}}'})}

    async def boom(*a, **k):
        raise AssertionError("the provider must not be asked")
    monkeypatch.setattr(premium, "_refresh", boom)
    assert (await service.premium_json(_fake_app(held), "TCS", "consolidated", "yearly"))["periods"] == ["Mar 2025"]


async def test_yearly_and_quarterly_statements_are_fetched_at_the_same_time(monkeypatch):
    import asyncio
    live = {"now": 0, "peak": 0}

    async def slow(app, sym, statement, period):
        live["now"] += 1
        live["peak"] = max(live["peak"], live["now"])
        await asyncio.sleep(0.05)
        live["now"] -= 1
        return {"periods": [], "rows": {}}
    monkeypatch.setattr(service, "premium_json", slow)
    a, b = await asyncio.gather(service.premium_json(None, "X", "consolidated", "yearly"), service.premium_json(None, "X", "consolidated", "quarterly"))
    assert a == b and live["peak"] == 2
    import inspect
    assert "asyncio.gather(premium_json(app, sym, statement, \"yearly\"), premium_json(app, sym, statement, \"quarterly\"))" in inspect.getsource(service.build_pack)
