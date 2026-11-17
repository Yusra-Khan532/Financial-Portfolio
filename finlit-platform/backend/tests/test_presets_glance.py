"""The Ready-made screens cards (task #64, 14 Nov file, N-38): joined since yesterday and the first three companies with the card's figure."""
from datetime import date

from finlit.presets import glance


def test_first_three_keep_the_list_order_and_carry_the_score_of_the_page():
    rows = [{"symbol": "A", "name": "Alpha", "overall": 90.4}, {"symbol": "B", "overall": 88}, {"symbol": "C", "name": "Gamma", "overall": None}, {"symbol": "D", "overall": 70}]
    got = glance.first_three(rows, "top-rated", "basic", lookup=lambda s, k: {"B": {"name": "Beta"}, "C": {"overall": 86.6}}.get(s, {}).get(k))
    assert got == [{"symbol": "A", "name": "Alpha", "value": 90}, {"symbol": "B", "name": "Beta", "value": 88}, {"symbol": "C", "name": "Gamma", "value": 87}]
    adv = glance.first_three([{"symbol": "A", "prism_final": 81.2, "overall": 10}], "trend", "advanced")
    assert adv[0]["value"] == 81 and glance.figure_of("trend") == "score"


def test_new_highs_show_the_distance_from_the_high_and_top_gainers_the_change_since_joining():
    nh = glance.first_three([{"symbol": "A", "pct_from_high": 0}, {"symbol": "B", "pct_from_high": 2.44}], "setups", "basic")
    assert [r["value"] for r in nh] == [0, 2.4] and glance.figure_of("setups") == "from_high"
    tg = glance.first_three([{"symbol": "A", "name": "Alpha", "since": 4.83}], "top-gainers", "advanced")
    assert tg == [{"symbol": "A", "name": "Alpha", "value": 4.8}] and glance.figure_of("top-gainers") == "since"


def test_a_missing_figure_stays_blank_and_never_becomes_zero():
    assert glance.first_three([{"symbol": "A", "overall": float("nan")}], "growth", "basic")[0]["value"] is None
    assert glance.first_three([], "growth", "basic") == []


def test_joined_counts_the_latest_close_only_and_not_the_first_stored_close():
    added = {"2026-11-13": 3, "2026-11-12": 9}
    assert glance.joined_count(added, "2026-11-13", date(2026, 11, 11)) == 3
    assert glance.joined_count(added, "2026-11-14", date(2026, 11, 11)) == 0
    assert glance.joined_count(added, "2026-11-11", date(2026, 11, 11)) == 0          # everyone was "added" on the day storing began
    assert glance.joined_count(added, None, None) is None


def test_basic_technical_is_inside_the_finlit_iq_band_even_on_a_list_stored_before():
    """14 Nov N-25: Technical is the fifth part of the FinLit IQ, not a band of its own."""
    from finlit.presets.api import _bands_now
    from finlit.presets.registry import STD_BASIC
    assert next(b for k, _l, _f, _a, b in STD_BASIC if k == "pillar_technical") == "FinLit IQ"
    old = [{"key": "overall", "band": "FinLit IQ"}, {"key": "pillar_technical", "band": "Technical"}, {"key": "rank"}]
    assert [c.get("band") for c in _bands_now(old)] == ["FinLit IQ", "FinLit IQ", None]
