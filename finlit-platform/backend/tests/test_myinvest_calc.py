"""All my investments (task #137): the pure figures. Each test is one point of the team's pack (finlit-08-all-my-investments-14nov)."""

import math
from datetime import date

from finlit.myinvest import calc

SH = [{"symbol": "HDFCBANK", "name": "HDFC Bank", "qty": 10, "price": 1600.0}, {"symbol": "TCS", "name": "TCS", "qty": 2, "price": 4000.0}]   # 16,000 + 8,000
FU = [{"code": 1, "name": "Flexi", "units": 100, "nav": 80.0, "assetSplit": {"equity": 90, "debt": 5, "cash": 5},           # 8,000
       "holdings": [{"stockSymbol": "HDFCBANK", "name": "HDFC Bank", "assetClass": "equity", "pct": 8.0}, {"stockSymbol": "INFY", "name": "Infosys", "assetClass": "equity", "pct": 5.0},
                    {"stockSymbol": None, "name": "GOI 2033", "assetClass": "debt", "pct": 5.0}]}]


def test_the_look_through_sums_add_up_for_one_company():
    """Done when: for one test company, the direct, fund and ETF weights add up to the 'All together' figure (all as % of everything)."""
    split = calc.split_parts(SH, FU)
    assert split["byValue"] and split["total"] == 32000
    rows = {r["symbol"]: r for r in calc.look_through(SH, FU, split)}
    h = rows["HDFCBANK"]
    assert math.isclose(h["direct"], 16000 / 32000 * 100) and math.isclose(h["funds"], 8000 / 32000 * 8.0)     # 50% direct + 25% x 8% = 2% through the fund
    assert math.isclose(h["direct"] + h["funds"] + h["etfs"], h["all"]) and math.isclose(h["all"], 52.0)
    assert h["twice"] and h["ways"] == 2 and h["via"] == [1]
    assert not rows["INFY"]["twice"] and math.isclose(rows["INFY"]["all"], 25 * 0.05)                           # only through the fund
    assert "GOI 2033" not in {r["name"] for r in rows.values()}                                                  # debt is not a company


def test_without_quantities_every_holding_and_every_part_counts_the_same():
    """Done when: without quantities, the page says it counts each holding the same (byValue False, equal weights)."""
    s = [dict(SH[0], qty=0), SH[1]]
    split = calc.split_parts(s, FU)
    assert not split["byValue"] and split["total"] is None and split["part"] == {"shares": 0.5, "funds": 0.5}
    assert split["shares"]["w"] == [0.5, 0.5] and not split["shares"]["valued"] and split["funds"]["valued"]


def test_one_part_only_and_nothing_at_all():
    split = calc.split_parts(SH, [])
    assert split["byValue"] and split["part"] == {"shares": 1.0, "funds": 0.0}
    empty = calc.split_parts([], [])
    assert not empty["byValue"] and empty["part"] == {"shares": 0, "funds": 0}


def test_asset_mix_counts_shares_as_equity_and_each_fund_by_its_split():
    split = calc.split_parts(SH, FU)
    mix = calc.asset_mix(SH, FU, split)
    assert math.isclose(mix["equity"], 75 + 25 * 0.9) and math.isclose(mix["debt"], 25 * 0.05) and math.isclose(mix["cash"], 25 * 0.05)
    nofile = [dict(FU[0], assetSplit=None)]
    assert calc.asset_mix([], nofile, calc.split_parts([], nofile)) == {"unknown": 100.0}


def test_sectors_are_counted_through_funds_against_the_nifty_500_by_market_value():
    split = calc.split_parts(SH, FU)
    rows = calc.look_through(SH, FU, split)
    bench = calc.bench_sectors([{"sector": "Banks", "mcap": 30}, {"sector": "IT", "mcap": 70}, {"sector": None, "mcap": 0}])
    assert bench == {"Banks": 30.0, "IT": 70.0}
    sec = calc.sectors(rows, {"HDFCBANK": "Banks", "TCS": "IT", "INFY": "IT"}, bench)
    assert sec[0] == {"sector": "Banks", "mine": 52.0, "bench": 30.0} and sec[1]["sector"] == "IT" and math.isclose(sec[1]["mine"], 25 + 1.25)


def test_weekly_grid_and_prices_on_it():
    d0 = date(2026, 1, 5).toordinal()   # a Monday
    bench = {d0 + i: 100.0 + i for i in range(0, 30) if date.fromordinal(d0 + i).weekday() < 5}   # trading days only
    grid = calc.weekly_grid(bench, max(bench))
    assert all(date.fromordinal(g).weekday() == 4 or g == max(bench) for g in grid)    # Fridays (the last trading day of each week)
    vals = calc.on_grid([d0, d0 + 20], [10.0, 20.0], [d0 + 3, d0 + 15, d0 + 21])
    assert vals == [10.0, None, 20.0]                                                     # no price older than 10 days


def test_risk_figures_against_the_index():
    b = [None] + [0.01 if i % 2 else -0.01 for i in range(80)]
    p = [None] + [x * 0.8 for x in b[1:]]
    r = calc.risk_figures(p, b)
    assert math.isclose(r["beta"], 0.8, rel_tol=1e-9) and math.isclose(r["fallsTaken"], 80.0) and math.isclose(r["swing"], r["benchSwing"] * 0.8)
    assert calc.risk_figures(p[:20], b[:20]) is None                                      # under a year of weeks: no figures
    shares = calc.swing_shares({"shares": b, "funds": p}, {"shares": 0.5, "funds": 0.5}, calc.blend([b, p], [0.5, 0.5]))
    assert math.isclose(sum(x["swings"] for x in shares), 100.0, abs_tol=0.2)


def test_insights_follow_the_three_rules_only():
    sec = [{"sector": "Banks", "mine": 31.0, "bench": 27.0}]
    comp = [{"name": "HDFC Bank", "ways": 2, "all": 6.1}]
    risk = {"worstWeek": -4.0, "benchWorstWeek": -6.5}
    ins = calc.insights(sec, comp, {"equity": 80, "debt": 15, "cash": 5}, risk)
    assert [i["id"] for i in ins] == ["sector", "soften"]
    assert ins[0]["text"] == "Counted through your funds, Banks is 31% of all you hold, against 27% of the Nifty 500."
    assert calc.insights([{"sector": "Banks", "mine": 20.0, "bench": 27.0}], comp, {"equity": 100}, risk) == []
    words = " ".join(i["text"] + i["title"] for i in ins).lower()
    assert not any(w in words for w in ("buy", "sell", "hold on", "should", "best"))


def test_highest_overlap_between_two_funds():
    a = {"short": "A", "holdings": [{"stockSymbol": "X", "pct": 10.0, "assetClass": "equity"}, {"stockSymbol": "Y", "pct": 5.0, "assetClass": "equity"}]}
    b = {"short": "B", "holdings": [{"stockSymbol": "X", "pct": 6.0, "assetClass": "equity"}, {"stockSymbol": "Z", "pct": 9.0, "assetClass": "equity"}]}
    assert calc.fund_overlap([a, b]) == {"pct": 6.0, "a": "A", "b": "B"}
    assert calc.fund_overlap([a]) is None
