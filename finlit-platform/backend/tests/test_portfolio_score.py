"""Your portfolio score (portfolio_page/score.py): readings weighted by value, a private blend, words and plain figures out."""
import json

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


def test_no_quantities_means_no_total():
    out = run({})
    assert out["needsQuantities"] and out["total"] is None and out["totalWhy"] == "Needs quantities"
    assert out["readings"]["concentration"]["word"] == "Needs quantities"


def test_quantities_weight_the_readings_and_give_a_total():
    heavy_a = run({"A": 900.0, "B": 100.0})
    heavy_b = run({"A": 100.0, "B": 900.0})
    assert heavy_a["total"] > heavy_b["total"]
    assert heavy_a["readings"]["strength"]["figure"] == 76 and heavy_b["readings"]["strength"]["figure"] == 44
    assert heavy_a["readings"]["concentration"]["word"] == "High" and heavy_a["readings"]["concentration"]["largestName"] == "A"
    assert heavy_a["band"] in ("Strong", "Fair", "Weak")


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
