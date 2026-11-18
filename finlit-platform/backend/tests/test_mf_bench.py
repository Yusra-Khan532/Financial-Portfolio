"""Task #183 part 2 (MF portfolio, pack 02 "Benchmark for each SEBI category", COMMON-RULES 8): each fund against its own category's benchmark, checked against
hand calculations: the category map, Friday closes, beta and R², the down- and up-week moves, the blends, the risk shares and the list's figures."""
from datetime import date, timedelta

import pytest

from finlit.mfportfolio import bench as B


@pytest.mark.parametrize("tab,key,name,expect", [
    ("equity", "small-cap", "Quant Small Cap Fund", ("Nifty Smallcap 250", [("NIFSMA250", 1.0)], False)),
    ("equity", "large-cap", "X Large Cap Fund", ("Nifty 100", [("NIF100", 1.0)], False)),
    ("equity", "large-mid-cap", "X Large & Mid Cap Fund", ("Nifty LargeMidcap 250", [("NIFLAR250", 1.0)], False)),
    ("equity", "mid-cap", "X Midcap Fund", ("Nifty Midcap 150", [("NIFMID150", 1.0)], False)),
    ("equity", "multi-cap", "X Multi Cap Fund", ("Nifty 500 Multicap 50:25:25", [("NIF100", 0.5), ("NIFMID150", 0.25), ("NIFSMA250", 0.25)], False)),
    ("equity", "flexi-cap", "X Flexi Cap Fund", ("Nifty 500", [("NIF500", 1.0)], False)),
    ("equity", "elss", "X ELSS Tax Saver Fund", ("Nifty 500", [("NIF500", 1.0)], False)),
    ("equity", "sectoral-thematic", "ICICI Prudential MNC Fund", ("Nifty MNC", [("NIFMNC", 1.0)], False)),
    ("equity", "sectoral-thematic", "X Banking & Financial Services Fund", ("Nifty Financial Services", [("NIFFINSER", 1.0)], False)),
    ("equity", "sectoral-thematic", "X Manufacturing Fund", ("Nifty 500", [("NIF500", 1.0)], True)),        # no theme index: the Nifty 500, tagged Stand-in
    ("hybrid", "aggressive-hybrid", "X Equity Hybrid Fund", ("65% Nifty 50 + 35% debt", [("NIF50", 0.65), ("DEBT", 0.35)], True)),
    ("hybrid", "balanced-advantage", "X Balanced Advantage Fund", ("50% Nifty 50 + 50% debt", [("NIF50", 0.5), ("DEBT", 0.5)], True)),
])
def test_each_category_gets_its_own_benchmark(tab, key, name, expect):
    b = B.benchmark_for(tab, key, name)
    assert (b["name"], b["legs"], b["standIn"]) == expect and b["compared"] is True


def test_debt_liquid_arbitrage_and_overseas_are_not_compared_and_count_as_zero():
    for tab, key in (("debt", "liquid"), ("debt", "overnight"), ("debt", "corporate-bond"), ("hybrid", "arbitrage"), ("other", "fof-overseas")):
        b = B.benchmark_for(tab, key, "X Fund")
        assert b["compared"] is False and b["legs"] == [] and "counts as 0" in b["why"]


def test_a_multi_asset_fund_is_weighted_as_its_own_holdings():
    b = B.benchmark_for("hybrid", "multi-asset", "X Multi Asset Fund", {"equity": 60, "debt": 20, "cash": 10, "other": 10})
    assert b["legs"] == [("NIF500", 0.6), ("DEBT", 0.3), ("GOLD", 0.1)] and b["name"] == "60% Nifty 500 + 30% debt + 10% gold" and b["standIn"] is True
    assert B.benchmark_for("hybrid", "multi-asset", "X", None)["legs"] == [("NIF500", 0.65), ("DEBT", 0.25), ("GOLD", 0.1)]


def test_friday_closes():
    fri = date(2026, 11, 13).toordinal()                            # a Friday
    assert B.last_friday(fri + 3) == fri and B.last_friday(fri) == fri and B.fridays(fri + 3, 2) == [fri - 14, fri - 7, fri]
    days = [fri - 15, fri - 9, fri - 1, fri + 1]                    # Wed, Tue, Thu, Sat
    assert B.weekly(days, [10.0, 11.0, 12.0, 13.0], [fri - 14, fri - 7, fri]) == [10.0, 11.0, 12.0]
    assert B.weekly([fri - 30], [9.0], [fri]) == [None]             # over a week old: no close for that week


def _series(start, changes):
    lvl, out = 100.0, [100.0]
    for c in changes:
        lvl *= 1 + c
        out.append(lvl)
    return [start + 7 * i for i in range(len(out))], out


X = [0.02, -0.01, 0.03, -0.02, 0.01, -0.03, 0.015, -0.005] * 7    # 56 weeks of index changes


def test_beta_r2_and_down_up_moves_by_hand():
    y = [1.2 * x for x in X]
    beta, rr = B.ols(y, X)
    assert beta == pytest.approx(1.2) and rr == pytest.approx(1.0)
    dn, up = B.capture([0.5 * x if x < 0 else 1.5 * x for x in X], X)
    assert dn == pytest.approx(50.0) and up == pytest.approx(150.0)
    assert B.ols(y[:30], X[:30]) == (None, None)                     # under 40 weeks: no beta


def test_a_blend_is_rebalanced_each_week_and_the_debt_part_is_steady():
    debt = (1 + B.DEBT_RATE) ** (1 / 52) - 1
    got = B.blend([("NIF50", 0.65), ("DEBT", 0.35)], {"NIF50": [0.02, -0.01, None]}, 3)
    assert got[0] == pytest.approx(0.65 * 0.02 + 0.35 * debt) and got[1] == pytest.approx(-0.0065 + 0.35 * debt) and got[2] is None


def test_risk_shares_add_to_100():
    a, b = X, [0.5 * x for x in X]                                   # b moves half as much as a
    s = B.risk_share([1, 1], [a, b])
    assert sum(s) == pytest.approx(100.0) and s[0] == pytest.approx(100 * 0.5 * 1.0 / 0.75)   # cov(a, (a+b)/2) / var((a+b)/2) * w: 0.5*0.75 / 0.5625


def test_the_list_beta_counts_a_liquid_fund_as_zero_and_says_the_figure_without_it():
    end = date(2026, 11, 13).toordinal()
    start = end - 7 * len(X)
    sd, sv = _series(start, X)
    fd, fv = _series(start, [1.2 * x for x in X])                    # a small-cap fund: 1.2 times its index every week
    ld, lv = _series(start, [0.0012] * len(X))                       # a liquid fund: a steady rise
    small = {"code": 1, "bench": B.benchmark_for("equity", "small-cap", "S"), "days": fd, "navs": fv}
    liquid = {"code": 2, "bench": B.benchmark_for("debt", "liquid", "L"), "days": ld, "navs": lv}
    out = B.build([small, liquid], {"NIFSMA250": (sd, sv), "NIF500": (sd, sv)}, None, end)
    f, l = out["funds"]
    assert f["betaOwn"] == 1.2 and f["explained"] == 100 and f["band"]["key"] == "more" and f["benchmark"] == "Nifty Smallcap 250"
    assert f["downPer100"] == 120 and f["upPer100"] == 120
    assert l["betaOwn"] == 0.0 and l["compared"] is False
    assert out["list"]["betaOwn"] == 0.6 and out["list"]["betaExLiquid"] == 1.2 and out["list"]["liquidShare"] == 50.0
    assert out["list"]["beta500"] == 0.6 and out["list"]["fall10"] == {"own": -6.0, "nifty500": -6.0}
    assert f["riskShare"] + l["riskShare"] == pytest.approx(100.0, abs=0.11) and l["riskShare"] == pytest.approx(0.0, abs=0.1)
    assert out["to"] == date.fromordinal(end).isoformat() and out["from"] == (date.fromordinal(end) - timedelta(weeks=52)).isoformat()


def test_down_and_up_weeks_are_hidden_where_the_benchmark_explains_under_a_fifth():   # COMMON-RULES 8
    end = date(2026, 11, 13).toordinal()
    start = end - 7 * len(X)
    sd, sv = _series(start, X)
    noise = [0.03 if i % 4 < 2 else -0.03 for i in range(len(X))]      # moves on its own (a pattern unrelated to the index): it explains almost nothing
    fd, fv = _series(start, [0.1 * x + e for x, e in zip(X, noise)])
    out = B.build([{"code": 1, "bench": B.benchmark_for("equity", "flexi-cap", "F"), "days": fd, "navs": fv}], {"NIF500": (sd, sv)}, None, end)
    f = out["funds"][0]
    assert f["explained"] < 20 and f["saysLittle"] is True and f["downPer100"] is None and f["upPer100"] is None and f["betaOwn"] is not None
