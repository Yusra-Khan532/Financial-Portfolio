"""Model 3.6.21 (owner Pranjal, 22 November 2026, task #318): recently listed companies were NOT RATED on inputs their filings could supply.

The Prism audit of 22 Nov 2026 counted 233 companies NOT RATED for low confidence; for nearly all of them the margin change (232), PEG (230), P/E vs
industry (218) and P/E vs own history (216) were missing together. The trailing EPS came from the four latest quarterly slots only, so one empty slot
(a pre-listing quarter, a gap) left the P/E and everything built on it empty, although the latest full year's EPS was reported. SEDEMAC (listed
11 Mar 2026): 45% confidence, exactly Fundamental 45% x 0.4 + Valuation 0% x 0.3 + Quality 100% x 0.2 + Risk 70% x 0.1."""
import json
from pathlib import Path

import pytest

from backend.premium_engine import score_company, trailing_eps

EXAMPLE = json.loads(Path(__file__).with_name("premium_example.json").read_text())


def sedemac():
    """SEDEMAC's published figures (standalone, ₹ crore): three quarters since listing plus an empty pre-listing slot, four years of annual P&L with
    EBITDA for the latest year only, 171 sessions of prices."""
    return {
        "sales_q": [None, 287.71, 309.77, 400.64], "net_profit_q": [None, 32.08, 33.31, 39.18], "operating_profit_q": [None, 60.49, 59.17, 75.57],
        "eps_q": [None, 7.26, 7.54, 8.87], "eps_fy": 23.45,
        "sales_y": [429.87, 535.89, 662.53, 1058.38], "net_profit_y": [8.57, 5.88, 47.05, 103.58], "operating_profit_y": [None, None, None, 216.93],
        "eps_y": [None, None, None, 23.45], "operating_cash_flow_y": [20., 35., 60., 120.],
        "total_debt": 240., "cash": 60., "net_worth": 520., "profit_before_tax": 150.19, "interest_cost": 8.53, "price": 3075.05, "shares": 4.42,
        "industry_median_pe": 45., "volatility_pct": 42., "biggest_fall_pct": 24., "biggest_fall_sessions": 171, "trading_value_cr": 35., "promoter_pledged_pct": 0.,
    }


def row(result, metric):
    return next(r for r in result["metrics"] if r["metric"] == metric)


def test_complete_data_scores_exactly_as_before():
    base = score_company(dict(EXAMPLE), "MFG")
    extra = score_company({**EXAMPLE, "operating_profit_y": [None] * 6, "biggest_fall_sessions": None}, "MFG")
    assert (extra["final"], extra["confidence"], extra["status"], extra["parts"]) == (base["final"], base["confidence"], base["status"], base["parts"])
    assert trailing_eps(EXAMPLE) == (pytest.approx(sum(EXAMPLE["eps_q"][-4:])), "Last four quarters")
    assert row(base, "PE_VS_INDUSTRY")["details"]["epsBasis"] == "Last four quarters"
    assert "note" not in row(base, "BIGGEST_FALL")["details"]


def test_one_empty_quarter_slot_no_longer_empties_the_valuation():
    eps, basis = trailing_eps(sedemac())
    assert eps == 23.45 and basis == "Latest full year (the latest four quarters are incomplete)"
    r = score_company(sedemac(), "MFG")
    for metric in ("PE_VS_INDUSTRY", "PE_VS_HISTORY"):
        assert row(r, metric)["status"] in ("A", "S") and row(r, metric)["value"] is not None
    assert row(r, "PE_VS_INDUSTRY")["value"] == pytest.approx(3075.05 / 23.45 / 45.)
    assert row(r, "PE_VS_HISTORY")["status"] == "S"        # no own history yet: the industry median stands in, as before
    assert r["coverage"]["valuation"] == pytest.approx(1.)


def test_sedemac_is_rated_provisionally_instead_of_not_rated():
    r = score_company(sedemac(), "MFG")
    assert r["status"] == "PROVISIONAL" and r["final"] is not None and r["notRatedReasons"] == []
    assert r["confidence"] >= 0.5
    # the streaks and the margin change stay missing: three quarters cannot be compared, and EBITDA is reported for one year only
    for metric in ("SALES_STREAK", "PROFIT_STREAK", "MARGIN_CHANGE"):
        assert row(r, metric)["status"] == "F"
    fall = row(r, "BIGGEST_FALL")
    assert fall["status"] == "A" and fall["details"]["sessions"] == 171
    assert r["coverage"]["risk"] == pytest.approx((30 * 171 / 250 + 30 + 20 + 20) / 100)


def test_without_the_fallbacks_the_same_company_was_not_rated_at_45_percent():
    old = {**sedemac(), "eps_fy": None, "biggest_fall_pct": None, "biggest_fall_sessions": None}
    r = score_company(old, "MFG")
    assert r["status"] == "NOT RATED" and r["confidence"] == pytest.approx(0.45, abs=0.005)
    assert "45% of the inputs" in r["notRatedReasons"][0]["text"]


def test_margin_change_falls_back_to_full_years_when_quarters_cannot_be_compared():
    d = {**sedemac(), "operating_profit_y": [None, None, 99.5, 216.93]}
    m = row(score_company(d, "MFG"), "MARGIN_CHANGE")
    assert m["status"] == "A" and m["value"] == pytest.approx((216.93 / 1058.38 - 99.5 / 662.53) * 100)
    assert m["details"]["basis"].startswith("Latest financial year vs previous year")
    # with comparable quarters the quarterly measure stays and no basis note is added
    q = row(score_company(dict(EXAMPLE, operating_profit_y=[1.] * 6), "MFG"), "MARGIN_CHANGE")
    assert "basis" not in (q["details"] or {})


def test_no_eps_is_derived_from_net_profit():
    d = {**sedemac(), "eps_fy": None}
    assert trailing_eps(d) == (None, None)
    assert row(score_company(d, "MFG"), "PE_VS_INDUSTRY")["status"] == "F"
