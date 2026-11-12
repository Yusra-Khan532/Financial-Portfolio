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
    yield
    data.reset()


pytestmark = pytest.mark.integration


async def test_free_visitors_and_other_plans_cannot_read_the_page(app, anon):  # noqa: F811
    assert (await anon.get("/api/stress/ASIANPAINT/page")).status_code in (401, 403)
    basic = await signed_in(app, "sb@example.com", plan="basic")
    assert (await basic.get("/api/stress/ASIANPAINT/page")).status_code == 403
    await basic.aclose()


async def test_silver_reads_the_page_but_cannot_run_compare_or_ask_for_a_peer(app, store):  # noqa: F811
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
