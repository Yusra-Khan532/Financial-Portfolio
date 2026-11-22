"""Your portfolio score (portfolio_page/score.py): readings weighted by value, a private blend, words and plain figures out."""
import json

import pytest

from finlit.mfportfolio.trend import portfolio_trend
from finlit.portfolio_page import score

CARDS = {
    "A": {"prism_final": 80, "prism_valuation": 75, "prism_st_score": 30, "prism_lt_score": 60, "prism_label": "STRONG"},
    "B": {"prism_final": 40, "prism_valuation": 30, "prism_st_score": -30, "prism_lt_score": -55, "prism_label": "WEAK"},
}
MARKET = {"beta": 1.3, "vol": 20.0, "vol_nifty": 14.0, "max_fall": -25.0, "max_fall_nifty": -15.0, "worst10_list": -2.0, "worst10_nifty": -1.5}
PAGE = {"score": 70, "band": "Fairly spread"}


def run(values, **kw):
    a = dict(horizon="3-5", risk="medium", goal="grow", benchmark="NIF50")
    a.update(kw)
    return score.build(["A", "B"], values, CARDS, PAGE, MARKET, a["horizon"], a["risk"], a["goal"], a["benchmark"], portfolio_trend)


def test_no_quantities_every_share_counts_the_same_and_a_total_is_given():
    """Developer file 28: the score panel shows a score and asks for the buys ("Add buys for N shares to weight the score by value now"); before, the
    server gave no total without quantities, so the panel read "being worked out" for good."""
    out = run({})
    assert out["needsQuantities"] and out["basis"] == "equal" and out["valued"] == 0 and out["of"] == 2
    assert isinstance(out["total"], int) and out["totalWhy"] is None
    assert out["readings"]["strength"]["figure"] == 60                           # (80 + 40) / 2
    assert out["readings"]["concentration"]["word"] == "Needs quantities"


def test_one_quantity_never_makes_the_score_that_share_alone():
    """Developer file 28 (founder, 23 Nov: "check the score we are giving is weighted average when we have proper quantity and price"): before, a share
    without a quantity counted at zero once another had one, so A's quantity alone gave A's reading (80) as the list's. Now every share counts the same until
    each has a value, as on the MF, ETF and All my investments pages."""
    out = run({"A": 900.0})
    assert out["basis"] == "equal" and out["needsQuantities"] and out["valued"] == 1
    assert out["readings"]["strength"]["figure"] == 60
    assert out["readings"]["concentration"]["word"] == "Needs quantities"
    assert out == {**run({}), "valued": 1}


def test_weights_of_is_all_or_nothing():
    assert score.weights_of(["A", "B"], {"A": 300.0, "B": 100.0}) == ({"A": 0.75, "B": 0.25}, "value")
    assert score.weights_of(["A", "B"], {"A": 300.0}) == ({"A": 0.5, "B": 0.5}, "equal")
    assert score.weights_of(["A", "B"], {"A": 300.0, "B": 0.0}) == ({"A": 0.5, "B": 0.5}, "equal")
    assert score.weights_of([], {}) == ({}, "equal")


def test_quantities_weight_the_readings_and_give_a_total():
    heavy_a = run({"A": 900.0, "B": 100.0})
    heavy_b = run({"A": 100.0, "B": 900.0})
    assert heavy_a["total"] > heavy_b["total"]
    assert heavy_a["readings"]["strength"]["figure"] == 76 and heavy_b["readings"]["strength"]["figure"] == 44
    assert heavy_a["readings"]["concentration"]["word"] == "High" and heavy_a["readings"]["concentration"]["largestName"] == "A"
    assert heavy_a["basis"] == "value" and not heavy_a["needsQuantities"] and heavy_a["valued"] == 2
    assert heavy_a["band"] in ("Strong", "Healthy", "Average", "Weak", "Poor")


def test_the_total_reads_in_finlit_prisms_words():
    """Developer file 28: the total's word is FinLit Prism's, as on each share and the Portfolio card (it was Strong 70+, Fair 50+, Weak, so a 76 read
    "Strong" beside shares whose 76 reads "Healthy")."""
    from finlit.mfscore.engine import label_of
    for values in ({"A": 900.0, "B": 100.0}, {"A": 100.0, "B": 900.0}, {"A": 1.0, "B": 1.0}, {}):
        out = run(values)
        assert out["band"] == label_of(out["total"])
    assert [label_of(v) for v in (80, 79.9, 65, 50, 49.9, 35, 34.9)] == ["Strong", "Healthy", "Healthy", "Average", "Weak", "Weak", "Poor"]


@pytest.mark.parametrize("risk", ["low", "medium", "high"])
def test_risk_reading_never_improves_as_the_beta_rises(risk):
    """Developer file 28: the risk reading fell to 80 at the comfort beta and then jumped to 100 just above it (beta 1.00 -> 80, 1.01 -> 99 for "medium")."""
    c = score._COMFORT_BETA[risk]
    betas = [round(0.3 + i * 0.01, 2) for i in range(250)]
    pts = [score.risk_points(b, c) for b in betas]
    assert all(a >= b for a, b in zip(pts, pts[1:]))
    assert score.risk_points(c, c) == 80 and score.risk_points(c + 0.01, c) < 80 and score.risk_points(c - 0.01, c) > 80
    assert 0 <= min(pts) and max(pts) <= 100


def test_risk_is_judged_against_the_comfort():
    low = run({"A": 1.0, "B": 1.0}, risk="low")["readings"]["risk"]
    high = run({"A": 1.0, "B": 1.0}, risk="high")["readings"]["risk"]
    assert low["word"] == "Above your comfort" and high["word"] == "Within your comfort" and low["against"] == "Above the index"


def test_short_horizon_reads_the_short_term_trend():
    assert run({"A": 1.0, "B": 1.0}, horizon="lt1")["readings"]["trend"]["term"] == "short"


def test_response_holds_no_weights_points_or_blend():
    text = json.dumps(run({"A": 3.0, "B": 1.0})).lower()
    for k in ("weight", "points", "blend", "level", "cutoff"):
        assert k not in text, k
