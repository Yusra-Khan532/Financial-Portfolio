"""A scheme's unit face value changing (ICICI Prudential Overnight Fund: ₹100 to ₹1,000 a unit in August 2022, its NAV 10x overnight) is not a return.
Before the fix its 5-year return showed 67.61% a year and topped every 5-year ranking on the site."""
from datetime import date

from finlit import mf


def series(jump_on=date(2022, 8, 17), factor=10.0, daily=1.00016, start=date(2021, 11, 1), n=5 * 365 + 20):
    d0 = start.toordinal()
    days, navs, v = list(range(d0, d0 + n)), [], 100.0
    for d in days:
        v *= daily
        if jump_on and d == jump_on.toordinal():
            v *= factor
        navs.append(v)
    return days, navs


def values(r):
    return {k: round(x["value"], 2) for k, x in r.items() if x["value"] is not None}


def test_a_face_value_step_is_not_a_return_with_the_series():
    days, navs = series()
    smooth_days, smooth = series(jump_on=None)
    m, ref = mf.metrics_for(days, navs, True), mf.metrics_for(smooth_days, smooth, True)
    assert values(m["returns"]) == values(ref["returns"])
    assert round(values(m["returns"])["5y"], 1) == 6.0
    assert m["mdd"]["value"] == ref["mdd"]["value"] == 0.0
    assert [round(x, 4) for x in m["dash"]] == [round(x, 4) for x in ref["dash"]]


def test_the_step_down_and_bigger_multiples_too():
    for factor in (0.1, 100.0, 1000.0):
        days, navs = series(factor=factor)
        assert round(values(mf.metrics_for(days, navs, True)["returns"])["5y"], 1) == 6.0, factor


def test_only_the_two_nav_dates_known_anchor_returns():
    # most schemes keep no daily series: their returns come from two NAVs (refresh_anchors), so the step cannot be seen and the ratio is read instead
    days, navs = series()
    start = mf.shift_months(date.fromordinal(days[-1]), 60).toordinal()   # AMFI's NAV on the 5-year start date, and today's
    two_days, two_navs = [start, days[-1]], [navs[days.index(start)], navs[-1]]
    r = values(mf.trailing_returns(two_days, two_navs, True))
    assert round(r["5y"], 1) == 6.0


def test_unit_ratio_leaves_real_moves_alone():
    assert mf.unit_ratio(5.5, 60) == 5.5          # 5.5x in 5 years: rare, but a fund can do it
    assert mf.unit_ratio(0.3, 60) == 0.3          # a 70% fall
    assert mf.unit_ratio(9.0, 120) == 9.0         # 10-year horizons are not touched
    assert round(mf.unit_ratio(13.2, 60), 2) == 1.32
    assert round(mf.unit_ratio(132.0, 60), 2) == 1.32
    assert round(mf.unit_ratio(0.11, 60), 2) == 1.1


def test_continuous_only_moves_exact_power_of_ten_steps():
    days = list(range(1, 6))
    assert mf.continuous(days, [10, 10.1, 101.0, 102.0, 103.0])[:2] == [100.0, 101.0]
    assert mf.continuous(days, [10, 11, 7, 9, 10]) == [10, 11, 7, 9, 10]   # big real moves stay
