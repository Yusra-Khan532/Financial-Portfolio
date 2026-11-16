"""PEG growth on standalone history (model 3.6.14, owner 15 November 2026). FinEdge's consolidated history can start years after the standalone one
(Nestle, ABB: one or two consolidated years against eight or nine standalone). When the consolidated EPS history is too short for a 3-year window, PEG
measures EPS growth on the standalone statements, if they reach the same latest year and give a longer window. P/E stays on the report's basis."""
from datetime import date
import pytest
from backend.premium_engine import score_company
from backend.premium_data import adapt_inputs

PE = {"price": 100.0, "eps_ttm": 10.0}      # P/E = 10


def series(start, rate, n):
    return [start * (1 + rate) ** i for i in range(n)]


def ends(first_year, n, month="03-31"):
    return [f"{first_year + i}-{month}" for i in range(n)]


def peg(**data):
    rating = score_company({**PE, **data}, "MFG")
    return next(r for r in rating["metrics"] if r["metric"] == "PEG")


def test_short_consolidated_eps_uses_standalone_five_year_growth():
    row = peg(eps_y=[50.0, 45.0], net_profit_y=[500.0, 450.0], sales_y=[1.0, 1.0], consolidated_years=[2024, 2025],
              eps_y_standalone=series(10, .20, 6), net_profit_y_standalone=series(100, .20, 6), standalone_period_ends=ends(2020, 6))
    d = row["details"]
    assert d["growthKind"] == "eps_standalone" and d["growthYears"] == pytest.approx(5.0, abs=.01) and d["consolidatedYears"] == 1
    assert d["growthUsed"] == pytest.approx(20.0, abs=.05) and row["value"] == pytest.approx(0.5, abs=.01) and row["status"] == "A"
    assert d["growthBasis"] == "standalone EPS growth over 5.0 years, 2020-03-31 to 2025-03-31 (consolidated history too short)"


def test_no_consolidated_eps_at_all_uses_standalone():
    row = peg(eps_y=[None, 40.0], net_profit_y=[450.0, 400.0], sales_y=[1.0, 1.0], consolidated_years=[2024, 2025],
              eps_y_standalone=series(10, .15, 4), net_profit_y_standalone=series(100, .15, 4), standalone_period_ends=ends(2022, 4))
    assert row["details"]["growthKind"] == "eps_standalone" and row["details"]["growthYears"] == pytest.approx(3.0, abs=.01)
    assert row["details"]["growthUsed"] == pytest.approx(15.0, abs=.05)


def test_a_change_of_year_end_does_not_break_the_run():
    # Nestle-shaped: December years to 2023, the 15-month period to March 2024 dropped, then March 2025 and March 2026
    sa_ends = ["2020-12-31", "2021-12-31", "2022-12-31", "2023-12-31", "2025-03-31", "2026-03-31"]
    sa_eps = [10.8, 11.12, 12.4, 15.55, 17.19, 18.38]
    row = peg(eps_y=[16.63, 18.15], net_profit_y=[1603.0, 1750.0], sales_y=[1.0, 1.0], consolidated_years=[2025, 2026],
              eps_y_standalone=sa_eps, net_profit_y_standalone=[e * 96.4 for e in sa_eps], standalone_period_ends=sa_ends)
    d = row["details"]
    years = (date(2026, 3, 31) - date(2020, 12, 31)).days / 365.25          # 5 periods back: December 2020 to March 2026, 5.25 years (one gap is 15 months)
    assert d["growthKind"] == "eps_standalone" and d["growthYears"] == pytest.approx(years, abs=.01)
    assert d["growthRaw"] == pytest.approx(((18.38 / 10.8) ** (1 / years) - 1) * 100, rel=1e-3)
    assert row["value"] == pytest.approx(10 / d["growthUsed"]) and row["status"] == "A"


def test_a_real_gap_in_the_standalone_years_shortens_the_window():
    sa_ends = ["2019-03-31", "2020-03-31", "2023-03-31", "2024-03-31", "2025-03-31"]       # nothing reported for 2021 and 2022
    row = peg(eps_y=[50.0, 45.0], net_profit_y=[500.0, 450.0], sales_y=[1.0, 1.0], consolidated_years=[2024, 2025],
              eps_y_standalone=[5.0, 6.0, 10.0, 12.0, 14.4], net_profit_y_standalone=[50.0, 60.0, 100.0, 120.0, 144.0], standalone_period_ends=sa_ends)
    d = row["details"]
    assert d["growthKind"] == "eps_standalone" and d["growthYears"] == pytest.approx(2.0, abs=.01) and d["growthUsed"] == pytest.approx(20.0, abs=.1)


def test_three_or_more_consolidated_years_keep_the_consolidated_growth():
    row = peg(eps_y=series(10, .10, 4), net_profit_y=series(100, .10, 4), sales_y=[1.0] * 4, consolidated_years=[2022, 2023, 2024, 2025],
              eps_y_standalone=series(10, .30, 6), net_profit_y_standalone=series(100, .30, 6), standalone_period_ends=ends(2020, 6))
    assert row["details"]["growthKind"] == "eps" and row["details"]["growthUsed"] == pytest.approx(10.0)


def test_stale_standalone_history_is_not_used():
    row = peg(eps_y=[50.0, 45.0], net_profit_y=[500.0, 450.0], sales_y=[1.0, 1.0], consolidated_years=[2024, 2025],
              eps_y_standalone=series(10, .20, 6), net_profit_y_standalone=series(100, .20, 6), standalone_period_ends=ends(2019, 6))
    assert row["details"]["growthKind"] != "eps_standalone"


def test_negative_growth_says_so_instead_of_loss_making():
    row = peg(eps_y=[50.0, 45.0], net_profit_y=[500.0, 450.0], sales_y=[1.0, 1.0], consolidated_years=[2024, 2025])
    assert row["status"] == "Z" and row["points"] == 0
    assert row["details"]["note"] == "Earnings growth is not positive (-10.0% a year, EPS growth over 1 years)"


def test_loss_still_says_loss_making():
    rating = score_company({"price": 100.0, "eps_ttm": -5.0, "eps_y": series(10, .2, 6), "net_profit_y": series(100, .2, 6), "sales_y": [1.0] * 6}, "MFG")
    row = next(r for r in rating["metrics"] if r["metric"] == "PEG")
    assert row["details"]["note"].startswith("Loss-making")


def _row(end, eps, profit):
    return {"period_start": f"{end - 1}-04-01", "period_end": f"{end}-03-31", "basicEPS": eps, "netProfit": profit * 1e7, "netSales": 1e9}


def test_adapter_keeps_standalone_series_only_for_consolidated_reports():
    raw = {"annual": {"financials": [_row(2025, 45, 450), _row(2026, 50, 500)]},
           "annual_standalone": {"financials": [_row(y, 10 + y - 2020, 100 + y - 2020) for y in range(2019, 2027)]},
           "profile": {"industry": "Packaged Foods", "sector": "FMCG"}}
    d, _ = adapt_inputs(raw, "TEST", date(2026, 11, 15), "consolidated")[:2]
    assert d["standalone_period_ends"] == [f"{y}-03-31" for y in range(2019, 2027)] and d["consolidated_years"] == [2025, 2026]
    assert d["eps_y_standalone"] == [9, 10, 11, 12, 13, 14, 15, 16] and d["net_profit_y_standalone"][-1] == pytest.approx(106)
    d2, _ = adapt_inputs(raw, "TEST", date(2026, 11, 15), "standalone")[:2]
    assert d2["eps_y_standalone"] == [] and d2["standalone_period_ends"] == []
