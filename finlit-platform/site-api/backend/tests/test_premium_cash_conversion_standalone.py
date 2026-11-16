"""Cash conversion on standalone statements (model 3.6.15, owner 15 November 2026). ABB's consolidated history covers 2024-2025 only, so the three-year
operating cash flow / profit could not be worked out and a group estimate was used. When the consolidated history has fewer than three complete years,
the standalone statements are used if their latest three annual periods are consecutive, complete and reach the same latest year."""
from datetime import date
import pytest
from backend.premium_engine import score_company
from backend.premium_data import adapt_inputs
from backend.premium_trace import build_calculation_trace

ENDS = ["2021-12-31", "2022-12-31", "2023-12-31", "2024-12-31", "2025-12-31"]
ABB = dict(net_profit_y=[1871.64, 1668.26], operating_cash_flow_y=[1331.8, 1219.52], sales_y=[1.0, 1.0], consolidated_years=[2024, 2025],
           standalone_period_ends=ENDS, net_profit_y_standalone=[519.71, 1016.23, 1242.05, 1871.64, 1668.26],
           operating_cash_flow_y_standalone=[649.24, 741.94, 1351.48, 1331.8, 1219.52], total_debt=0, net_worth=5000)


def cash(**kw):
    rating = score_company({**ABB, **kw}, "MFG")
    return next(r for r in rating["metrics"] if r["metric"] == "CASH_CONVERSION"), rating


def test_abb_short_consolidated_history_uses_standalone_three_years():
    row, _ = cash()
    assert row["status"] == "A" and row["value"] == pytest.approx((1351.48 + 1331.8 + 1219.52) / (1242.05 + 1871.64 + 1668.26))
    assert row["details"]["basis"] == "standalone" and "2023-12-31 to 2025-12-31" in row["details"]["note"]


def test_complete_consolidated_history_is_kept():
    row, _ = cash(net_profit_y=[100.0, 100.0, 100.0], operating_cash_flow_y=[90.0, 90.0, 90.0], consolidated_years=[2023, 2024, 2025])
    assert row["value"] == pytest.approx(0.9) and not row["details"]


@pytest.mark.parametrize("change", [
    {"standalone_period_ends": ["2019-12-31", "2020-12-31", "2021-12-31", "2024-12-31", "2025-12-31"]},   # a gap inside the last three years
    {"operating_cash_flow_y_standalone": [649.24, 741.94, None, 1331.8, 1219.52]},                     # a missing year
    {"standalone_period_ends": ["2020-12-31", "2021-12-31", "2022-12-31", "2023-12-31", "2024-12-31"]},   # older than the consolidated year
    {"operating_cash_flow_y_standalone": []},                                                          # not fetched
])
def test_standalone_is_not_used_when_it_does_not_fit(change):
    row, _ = cash(**change)
    assert row["status"] == "F"


def test_trace_shows_the_standalone_sums():
    row, rating = cash()
    trace = build_calculation_trace({**ABB}, rating, {})
    item = next(i for i in trace["metrics"] if i["metric"] == "CASH_CONVERSION")
    assert "3,902.8" in item["valueCalculation"] and "consolidated history too short" in item["valueCalculation"]


def _pl(end, profit):
    return {"period_start": f"{end - 1}-01-01", "period_end": f"{end - 1}-12-31", "basicEPS": 10.0, "netProfit": profit * 1e7, "netSales": 1e9}


def test_adapter_lines_standalone_cash_flow_up_with_the_periods():
    raw = {"annual": {"financials": [_pl(2025, 1871), _pl(2026, 1668)]},
           "annual_standalone": {"financials": [_pl(y, 1000) for y in range(2022, 2027)]},
           "cashflow_standalone": {"financials": [{"period_start": f"{y - 1}-01-01", "period_end": f"{y - 1}-12-31", "netCashFromOperatingActivities": (y - 2000) * 1e7}
                                                  for y in range(2023, 2027)]},
           "profile": {"industry": "Electrical Equipment", "sector": "Capital Goods"}}
    d = adapt_inputs(raw, "ABB", date(2026, 11, 15), "consolidated")[0]
    assert d["standalone_period_ends"] == [f"{y}-12-31" for y in range(2021, 2026)]
    assert d["operating_cash_flow_y_standalone"] == [None, 23, 24, 25, 26]
