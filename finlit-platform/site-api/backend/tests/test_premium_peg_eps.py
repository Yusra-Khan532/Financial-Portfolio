"""PEG growth (model 3.6.12, current 3.6.20): EPS growth first, split/bonus adjusted; net profit growth only when there is no usable EPS CAGR."""
import pytest
from backend.premium_engine import score_company, split_adjusted_eps
from backend.premium_model_config import MODEL_VERSION
from backend.premium_trace import build_calculation_trace

PE_INPUTS = {"price": 100.0, "eps_ttm": 10.0}      # P/E = 10


def peg(eps_y, profit_y, group="MFG", **extra):
    data = {"sales_y": profit_y, "net_profit_y": profit_y, "eps_y": eps_y, **PE_INPUTS, **extra}
    rating = score_company(data, group)
    rows = {r["metric"]: r for r in rating["metrics"]}
    return data, rating, rows.get("PEG")


def series(start, rate, n):
    return [start * (1 + rate) ** i for i in range(n)]


def test_model_version_is_3_6_12():
    assert MODEL_VERSION == "3.6.20"


def test_peg_uses_eps_growth_not_profit_growth():
    # EPS grows 20% a year; total profit grows 50% a year (new shares were issued): the shareholder's growth is the EPS growth.
    _, _, row = peg(series(10, .20, 6), series(100, .50, 6))
    assert row["details"]["growthKind"] == "eps" and row["details"]["growthYears"] == 5
    assert row["details"]["growthUsed"] == pytest.approx(20.0)
    assert row["value"] == pytest.approx(10 / 20.0)                     # P/E 10 / 20% = 0.5
    assert row["points"] == pytest.approx(100.0)                         # PEG 0.5 or less = 100 points


def test_peg_points_are_the_straight_line_2_5_to_0_5():
    _, _, row = peg(series(10, .1905, 6), series(100, .1905, 6))         # growth about 19%: the founder's example (P/E 13.31 / 19 = 0.70)
    assert row["value"] == pytest.approx(10 / 19.05, rel=1e-3)
    assert row["points"] == pytest.approx((row["value"] - 2.5) / (0.5 - 2.5) * 100, rel=1e-6)


def test_growth_is_capped_at_40_percent():
    _, _, row = peg(series(10, .60, 6), series(100, .60, 6))
    assert row["details"]["growthUsed"] == pytest.approx(40.0) and row["details"]["growthRaw"] == pytest.approx(60.0)
    assert row["value"] == pytest.approx(10 / 40.0)


def test_falls_back_to_net_profit_cagr_when_eps_history_is_missing_or_unusable():
    profit = series(100, .25, 6)
    for eps_y in ([], [10.0], [None, None, None, None, None, 10.0]):
        _, _, row = peg(eps_y, profit)
        assert row["details"]["growthKind"] == "profit_cagr", eps_y
        assert row["details"]["growthUsed"] == pytest.approx(25.0)
        assert "net profit" in row["details"]["growthBasis"]


def test_an_eps_window_whose_start_is_not_positive_falls_back_to_the_4_year_eps_growth_not_to_profit():
    # owner, 17 November 2026: the 5-year EPS CAGR cannot be worked out from a zero or negative start, so the 4-year one is used (2 to 6)
    for eps_y in ([-1.0, 2.0, 3.0, 4.0, 5.0, 6.0], [0.0, 2.0, 3.0, 4.0, 5.0, 6.0]):
        _, _, row = peg(eps_y, series(100, .25, 6))
        assert row["details"]["growthKind"] == "eps" and row["details"]["growthYears"] == 4, eps_y
        assert row["details"]["growthUsed"] == pytest.approx(((6 / 2) ** (1 / 4) - 1) * 100)
        assert "the 5-year EPS growth was not measurable" in row["details"]["growthBasis"]


@pytest.mark.parametrize("eps_y,years", [
    ([10.0, 12.0, 8.0, 9.0, 10.0, 11.0], 5),     # 5 years: 10 -> 11 is up; kept
    ([20.0, 12.0, 8.0, 9.0, 10.0, 11.0], 3),     # 5 and 4 years down (20, 12 -> 11), 3 years up (8 -> 11)
])
def test_a_negative_eps_growth_falls_back_to_the_next_shorter_window(eps_y, years):
    _, _, row = peg(eps_y, [e * 100 for e in eps_y])          # profit moves with EPS, so no share split or bonus is read into the history
    assert row["details"]["growthKind"] == "eps" and row["details"]["growthYears"] == years
    start = eps_y[-1 - years]
    assert row["details"]["growthUsed"] == pytest.approx(((eps_y[-1] / start) ** (1 / years) - 1) * 100)
    if years < 5:
        assert "the 5-year EPS growth was negative" in row["details"]["growthBasis"]


def test_with_no_eps_the_net_profit_growth_ladder_is_used_the_same_way():
    # no EPS at all: net profit over 5 and 4 years is down, over 3 years up -> the 3-year net profit growth
    profit = [679.36, 586.08, 562.03, 551.27, 517.09, 572.35]
    _, _, row = peg([], profit)
    assert row["details"]["growthKind"] == "profit_cagr" and row["details"]["growthYears"] == 3
    assert row["details"]["growthUsed"] == pytest.approx(((572.35 / 562.03) ** (1 / 3) - 1) * 100)
    assert "the 5-year net profit growth was negative" in row["details"]["growthBasis"]


def test_non_positive_eps_growth_gives_no_peg_and_zero_points_and_does_not_fall_back_to_profit():
    # EPS falls while profit rises: no PEG, and the profit growth is NOT used instead (the EPS growth exists and is negative)
    _, _, row = peg([24.0, 20.0, 16.0, 12.0, 10.0, 8.0], series(100, .30, 6))
    assert row["status"] == "Z" and row["points"] == 0
    assert row["details"]["note"].startswith("Earnings growth is not positive (") and "EPS growth over 5 years" in row["details"]["note"]
    assert row["value"] is None


def test_loss_making_company_has_no_peg():
    _, _, row = peg(series(10, .2, 6), series(100, .2, 6), eps_ttm=-1.0)
    assert row["status"] == "Z" and row["points"] == 0


def test_bonus_issue_does_not_make_eps_growth_look_negative():
    # a 1:1 bonus (shares double) between years 3 and 4: reported EPS halves although profit keeps growing 10% a year
    profit = series(100, .10, 6)
    shares = [10, 10, 10, 20, 20, 20]
    eps_y = [p / s for p, s in zip(profit, shares)]
    assert eps_y[-1] < eps_y[0]                                           # the raw reported numbers would show a decline
    _, _, row = peg(eps_y, profit)
    assert row["status"] != "Z"
    assert row["details"]["growthKind"] == "eps" and row["details"]["growthUsed"] == pytest.approx(10.0, rel=1e-6)
    assert row["details"]["epsSplitAdjustments"] == [{"fromIndex": 2, "ratio": 2.0}]


def test_gradual_dilution_is_not_adjusted():
    profit = series(100, .10, 6)
    shares = series(10, .06, 6)                                           # about 6% more shares a year: really dilutes each holder, not a split
    eps_y = [p / s for p, s in zip(profit, shares)]
    adjusted, applied = split_adjusted_eps(eps_y, profit)
    assert applied == [] and adjusted == pytest.approx(eps_y)
    _, _, row = peg(eps_y, profit)
    assert row["details"]["growthUsed"] == pytest.approx(((eps_y[-1] / eps_y[0]) ** (1 / 5) - 1) * 100)


def test_already_restated_history_is_left_alone():
    profit = series(100, .10, 6)
    eps_y = [p / 20 for p in profit]                                       # the provider restated every year to the new share count: no step
    adjusted, applied = split_adjusted_eps(eps_y, profit)
    assert applied == [] and adjusted == pytest.approx(eps_y)


def test_split_adjustment_helper_cases():
    profit = [100.0, 100.0, 100.0, 100.0]
    # 5:1 split before the last year, and a 2:1 bonus before the one after (newest boundary first)
    shares = [10.0, 10.0, 50.0, 100.0]
    eps_y = [p / s for p, s in zip(profit, shares)]
    adjusted, applied = split_adjusted_eps(eps_y, profit)
    assert [round(a["ratio"], 2) for a in applied] == [2.0, 5.0]
    assert adjusted == pytest.approx([p / 100.0 for p in profit])
    # a reverse split (shares / 10): the older EPS is raised to the new basis
    shares = [100.0, 100.0, 10.0, 10.0]
    adjusted, applied = split_adjusted_eps([p / s for p, s in zip(profit, shares)], profit)
    assert adjusted == pytest.approx([p / 10.0 for p in profit]) and len(applied) == 1
    # a loss year hides the share count: no adjustment is guessed across it
    adjusted, applied = split_adjusted_eps([5.0, None, 2.5], [100.0, -20.0, 100.0])
    assert applied == []


def test_trace_and_review_say_earnings_growth_and_name_the_basis():
    data, rating, row = peg(series(10, .2, 6), series(100, .5, 6))
    trace = next(r for r in build_calculation_trace(data, rating, {})["metrics"] if r["metric"] == "PEG")
    assert "earnings growth" in trace["valueCalculation"] and "EPS growth over 5 years" in trace["valueCalculation"]


def test_eps_down_over_5_4_3_and_2_years_gives_no_peg_even_if_the_last_year_is_up():
    # the ladder stops at 2 years (a 1-year figure is used only when no longer history exists); the 5-year figure is the one reported
    eps_y = [20.0, 15.0, 14.0, 12.0, 10.0, 11.0]
    _, _, row = peg(eps_y, [e * 100 for e in eps_y])
    assert row["status"] == "Z" and row["points"] == 0 and row["value"] is None
    assert "EPS growth over 5 years" in row["details"]["note"] and "the 4-year EPS growth was negative" in row["details"]["note"]
