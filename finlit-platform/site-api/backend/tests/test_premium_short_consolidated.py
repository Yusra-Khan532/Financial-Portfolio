"""Short consolidated history (model 3.6.16, owner 15 November 2026). FinEdge's consolidated statements for some companies cover only the latest one or
two years (ABB: 2011, 2012, then 2024-2025; Nestle: from 2024, with its 15-month period to March 2024 labelled as a year), so every factor that needs
history failed or fell back to one year. When the latest unbroken run of consolidated full years is shorter than 4 and the standalone run is at least 4
and as recent, the whole report uses the standalone statements and says why."""
import copy
import json
import sys
from datetime import date
from pathlib import Path
import pytest
from backend.premium_data import recent_annual_run
from backend.premium_engine import dated_cagr_window, score_company
from backend import server

sys.path.insert(0, str(Path(__file__).parent))
from test_premium_input_assembly import replay, new_report  # noqa: F401,E402


def row(start, end, profit=100.0):
    return {"period_start": start, "period_end": end, "netProfit": profit}


def test_abb_run_stops_at_the_gap():
    rows = [row(20110101, 20111231), row(20120101, 20121231), row(20240101, 20241231), row(20250101, 20251231)]
    assert recent_annual_run(rows) == (2, date(2025, 12, 31))


def test_nestle_overlapping_15_month_year_does_not_break_the_run():
    rows = [row(f"{y}0101", f"{y}1231") for y in range(2020, 2024)] + [row(20230401, 20240331), row(20240401, 20250331), row(20250401, 20260331)]
    assert recent_annual_run(rows) == (6, date(2026, 3, 31))      # 2020-2022, then calendar 2023 and the mislabelled year to March 2024 share a slot


def test_a_row_without_profit_or_of_odd_length_is_not_counted():
    rows = [row(20230401, 20240331), row(20240401, 20250331, None), row(20250101, 20260331)]
    assert recent_annual_run(rows)[0] == 1


def test_nestle_standalone_eps_growth_with_the_overlap():
    ends = ["2020-12-31", "2021-12-31", "2022-12-31", "2023-12-31", "2024-03-31", "2025-03-31", "2026-03-31"]
    eps = [10.8, 11.12, 12.4, 15.55, 20.4, 17.19, 18.38]
    i, years = dated_cagr_window(eps, ends)
    assert ends[i] == "2020-12-31" and years == pytest.approx((date(2026, 3, 31) - date(2020, 12, 31)).days / 365.25)
    rating = score_company({"price": 100.0, "eps_ttm": 10.0, "eps_y": [20.4, 17.19, 18.38], "net_profit_y": [1.0] * 3, "sales_y": [1.0] * 3,
                            "consolidated_years": [2024, 2025, 2026], "eps_y_standalone": eps, "net_profit_y_standalone": [e * 96.4 for e in eps],
                            "standalone_period_ends": ends}, "MFG")
    peg = next(r for r in rating["metrics"] if r["metric"] == "PEG")
    assert peg["status"] == "A" and peg["details"]["growthKind"] == "eps_standalone"


def short_consolidated(fixture):
    """The recording with the consolidated yearly P&L cut to its last two years and standalone answers equal to the full consolidated ones."""
    fixture = copy.deepcopy(fixture)
    rec = fixture["recorded"]
    for key, answer in list(rec.items()):
        path, params = json.loads(key)
        if params.get("statement_type") == "c":
            rec.setdefault(json.dumps([path, {**params, "statement_type": "s"}], sort_keys=True), copy.deepcopy(answer))
    for key, answer in list(rec.items()):
        path, params = json.loads(key)
        if path.startswith("/financials/") and params == {"statement_type": "c", "statement_code": "pl", "period": "annual"}:
            rows = answer.get("financials") if isinstance(answer, dict) else answer
            rows[:] = rows[-2:]
    return fixture


def test_short_consolidated_history_switches_the_whole_report_to_standalone(replay):  # noqa: F811
    fixture, provider = replay("TCS")
    provider.recorded = short_consolidated(fixture)["recorded"]
    report, fresh, _ = new_report(fixture)
    assert report["statementType"] == "standalone"
    assert any("this report uses the standalone statements" in w for w in report["warnings"])
    rows = {r["metric"]: r for r in report["rating"]["metrics"]}
    assert rows["PROFIT_CAGR"]["details"]["years"] == 5 and rows["SALES_CAGR"]["details"]["years"] == 5
    assert rows["PEG"]["details"].get("growthYears") == 5 and rows["PEG"]["details"]["growthKind"] == "eps"


def test_full_consolidated_history_keeps_consolidated(replay):  # noqa: F811
    fixture, _ = replay("TCS")
    report, _, _ = new_report(fixture)
    assert report["statementType"] == "consolidated" and not any("standalone statements" in w for w in report["warnings"])


SA_ANNUAL = json.dumps(["/financials/TCS", {"statement_type": "s", "statement_code": "pl", "period": "annual"}], sort_keys=True)


def failing(provider, times):
    """The standalone yearly P&L request fails `times` times (as during a busy nightly run), then answers."""
    real, left = provider.once, {"n": times}
    def once(path, params=None):
        if json.dumps([path, params or {}], sort_keys=True) == SA_ANNUAL and left["n"] > 0:
            left["n"] -= 1
            raise server.HTTPException(status_code=503, detail="busy")
        return real(path, params)
    return once


def test_a_failed_standalone_fetch_is_fetched_again_not_ignored(replay, monkeypatch):  # noqa: F811
    fixture, provider = replay("TCS")
    provider.recorded = short_consolidated(fixture)["recorded"]
    monkeypatch.setattr(server, "_finedge_get_once", failing(provider, 1))
    monkeypatch.setattr(server, "_finedge_get", lambda path, params=None: server._finedge_get_once(path, params))   # no provider-level retry
    report, _, _ = new_report(fixture)
    assert report["statementType"] == "standalone"


def test_standalone_that_cannot_be_read_stops_the_calculation(replay, monkeypatch):  # noqa: F811
    fixture, provider = replay("TCS")
    provider.recorded = short_consolidated(fixture)["recorded"]
    monkeypatch.setattr(server, "_finedge_get_once", failing(provider, 99))
    monkeypatch.setattr(server, "_finedge_get", lambda path, params=None: server._finedge_get_once(path, params))
    with pytest.raises(server.HTTPException) as err:
        new_report(fixture)
    assert err.value.status_code == 503 and "standalone statements could not be read" in err.value.detail


def test_inputs_kept_before_version_4_are_refused():
    from backend import premium_cache
    assert premium_cache.INPUTS_VERSION == 4


def failing_path(provider, match, times=99):
    real, left = provider.once, {"n": times}
    def once(path, params=None):
        if match(path, params or {}) and left["n"] > 0:
            left["n"] -= 1
            raise server.HTTPException(status_code=503, detail="busy")
        return real(path, params)
    return once


@pytest.mark.parametrize("what,match", [
    ("quote", lambda p, q: p == "/quote" and q.get("symbol") == "TCS"),
    ("ownership", lambda p, q: p == "/shareholdings/summary/TCS"),
    ("price history", lambda p, q: p == "/daily-quotes/TCS"),
])
def test_a_provider_failure_on_the_companys_own_data_stops_instead_of_storing_estimates(replay, monkeypatch, what, match):  # noqa: F811
    fixture, provider = replay("TCS")
    monkeypatch.setattr(server, "_finedge_get_once", failing_path(provider, match))
    monkeypatch.setattr(server, "_finedge_get", lambda path, params=None: server._finedge_get_once(path, params))
    with pytest.raises(server.HTTPException) as err:
        new_report(fixture)
    assert err.value.status_code == 503 and "did not answer for this company" in err.value.detail


def test_a_no_data_answer_is_not_a_failure(replay):  # noqa: F811
    # the recording answers 404 for every request it never saw (dividends, segments, ...): those are "no data", the report is made
    fixture, _ = replay("TCS")
    report, _, _ = new_report(fixture)
    assert report["rating"]["final"] is not None


def test_a_peer_that_cannot_be_read_does_not_stop_the_report(replay, monkeypatch):  # noqa: F811
    fixture, provider = replay("TCS")
    monkeypatch.setattr(server, "_finedge_get_once", failing_path(provider, lambda p, q: p.startswith("/daily-price-ratios/") and not p.endswith("/TCS")))
    report, _, _ = new_report(fixture)
    assert report["rating"]["final"] is not None


def test_stale_consolidated_switches_to_standalone(replay):  # noqa: F811
    """SBFC-type: the consolidated statements stop a year and more before the standalone ones."""
    fixture, provider = replay("TCS")
    rec = short_consolidated(fixture)["recorded"]
    for key in list(rec):
        path, params = json.loads(key)
        if path == "/financials/TCS" and params.get("statement_type") == "c" and params.get("statement_code") == "pl":
            original = json.loads(json.dumps(fixture["recorded"][key]))
            rows = original.get("financials") if isinstance(original, dict) else original
            newest = sorted({r["period_end"] for r in rows}, reverse=True)[:2 if params["period"] == "annual" else 6]
            cut = [r for r in rows if r["period_end"] not in newest]                  # consolidated stops two years / six quarters earlier
            if isinstance(original, dict):
                original["financials"] = cut
            rec[key] = original if isinstance(original, dict) else cut
    provider.recorded = rec
    report, _, _ = new_report(fixture)
    assert report["statementType"] == "standalone" and any("stop earlier" in w for w in report["warnings"])
