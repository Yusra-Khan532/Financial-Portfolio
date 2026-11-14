"""The MF portfolio's risk figures (finlit/mfportfolio/risk.py): swing, worst fall, beta and falls taken against the NIFTY 500, and the list's level."""
import math
from datetime import date

from finlit.mfportfolio import risk

D0 = date(2023, 11, 1).toordinal()


def line(n, step, start=100.0):
    v, out = start, []
    for i in range(n):
        v *= 1 + step(i)
        out.append(v)
    return out


def test_worst_fall_is_the_deepest_drop_from_a_high():
    assert risk.worst_fall([100, 120, 90, 110, 130, 104]) == -25.0
    assert risk.worst_fall([100, 101, 102]) == 0.0
    assert risk.worst_fall([100]) is None


def test_swing_scales_daily_changes_to_a_year():
    r = [0.01, -0.01] * 50
    assert abs(risk.swing(r) - __import__("statistics").stdev(r) * math.sqrt(252) * 100) < 1e-9


def test_a_fund_that_moves_twice_the_index_has_beta_two_and_takes_twice_its_falls():
    days = list(range(D0, D0 + 1200))
    b = line(1200, lambda i: 0.01 if i % 3 else -0.012)
    f = line(1200, lambda i: 0.02 if i % 3 else -0.024)
    out = risk.fund_figures(days, f, dict(zip(days, b)), days[-1])
    assert out["beta"] == 2.0
    assert out["fallsTaken"] == 200
    assert out["why"] is None and out["years"] == 3.0


def test_a_young_fund_says_why_and_a_very_young_one_has_no_figures():
    days = list(range(D0, D0 + 500))
    v = line(500, lambda i: 0.001 * (1 if i % 2 else -1))
    out = risk.fund_figures(days, v, dict(zip(days, v)), days[-1])
    assert out["swing"] is not None and "younger than three years" in out["why"]
    short = risk.fund_figures(days[:100], v[:100], dict(zip(days, v)), days[99])
    assert short["swing"] is None and "less than a year" in short["why"]


def test_only_the_last_three_years_count():
    days = list(range(D0, D0 + 2000))
    v = [100.0] * 900 + line(1100, lambda i: 0.0005)
    out = risk.fund_figures(days, v, dict(zip(days, v)), days[-1])
    assert out["from"] == date.fromordinal(days[-1] - risk.WINDOW + 1).isoformat()


def test_the_list_level_names_the_funds_that_make_it_so():
    funds = [{"short": "SBI Small Cap", "category": "Small Cap", "swing": 17.9}, {"short": "Nippon India Small Cap", "category": "Small Cap", "swing": 19.4},
             {"short": "Parag Parikh Flexi Cap", "category": "Flexi Cap", "swing": 11.2}]
    out = risk.list_level(15.0, 13.0, funds)
    assert out == {"word": "A little higher", "vs": "the Nifty 500", "because": "because of the two small-cap funds", "riskier": ["SBI Small Cap", "Nippon India Small Cap"]}
    assert risk.list_level(13.2, 13.0, funds)["because"] is None
    assert risk.list_level(10.0, 13.0, funds)["word"] == "Lower"
    assert risk.list_level(None, 13.0, funds) is None


def test_because_reads_as_words():
    assert risk.because([("Quant Active", "Multi Cap")]) == "because of Quant Active (multi cap)"
    assert risk.because([("A", "Small Cap"), ("B", "Mid Cap")]) == "because of A and B"
    assert risk.because([]) is None


def test_the_list_line_weights_each_days_change():
    days = list(range(D0, D0 + 3))
    d, v = risk.list_series([(days, [100, 110, 110], 1.0), (days, [100, 100, 90], 1.0)], days[-1])
    assert d == days[1:] and [round(x, 4) for x in v] == [105.0, 99.75]
    # a day only one fund has is skipped: the change runs from the last common day to the next
    d, v = risk.list_series([(days, [100, 110, 121], 1.0), ([days[0], days[2]], [100, 100], 1.0)], days[-1])
    assert d == [days[2]] and [round(x, 4) for x in v] == [110.5]


def test_short_names():
    assert risk.short_name("HDFC Flexi Cap Fund - Growth Option - Direct Plan") == "HDFC Flexi Cap"
    assert risk.short_name("Parag Parikh Flexi Cap Fund") == "Parag Parikh Flexi Cap"


def test_short_names_drop_brackets_and_shouting():
    assert risk.short_name("ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)") == "ICICI Prudential Large Cap"
    assert risk.short_name("SBI SMALL CAP FUND") == "SBI Small Cap"


def test_the_reason_stays_short_when_many_funds_make_it():
    f = lambda n, c, s: {"short": n, "category": c, "swing": s}
    funds = [f("A", "Flexi Cap", 17), f("B", "Large Cap", 16), f("C", "Small Cap", 19), f("D", "Small Cap", 20), f("E", "Liquid", 1)]
    assert risk.list_level(17, 13, funds)["because"] == "because four of your five funds swing more than it"
    assert risk.list_level(17, 13, funds[:4])["because"] == "because each of your funds swings more than it"
    assert risk.list_level(9, 13, [f("L", "Liquid", 1), f("M", "Liquid", 2), f("N", "Large Cap", 14)])["because"] == "because of the two liquid funds"


def test_swing_follows_how_many_navs_a_year_the_series_has():
    days = list(range(D0, D0 + 1500, 5))                   # a NAV every five days
    v = line(len(days), lambda i: 0.01 if i % 2 else -0.01)
    out = risk.fund_figures(days, v, dict(zip(days, v)), days[-1])
    yearly = __import__("statistics").stdev(risk.returns(risk.window(days, v, days[-1])[1])) * math.sqrt(365.25 / 5) * 100
    assert abs(out["swing"] - round(yearly, 1)) <= 0.15
