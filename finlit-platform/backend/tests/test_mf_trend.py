"""Trend readings (mfportfolio/trend.py): a port of the design package's self-check."""
from finlit.mfportfolio.trend import fund_trends, portfolio_trend, public


def test_portfolio_trend_matches_the_design_package_check():
    r = portfolio_trend([
        {"symbol": "A", "weight": 1, "st": 30, "lt": 60, "prismLabel": "STRONG"},
        {"symbol": "B", "weight": 1, "st": -30, "lt": 25, "prismLabel": "AVERAGE"},
        {"symbol": "C", "weight": 2, "st": 25, "lt": -55, "prismLabel": "HEALTHY"},
        {"symbol": "D", "weight": 1, "st": None, "lt": 10, "prismLabel": "WEAK"},
    ])
    assert r["rated"] == 3 and abs(r["coverage"] - 0.8) < 1e-9
    assert abs(r["grid"]["1,1"]["share"] - 0.25) < 1e-9 and abs(r["grid"]["-1,1"]["share"] - 0.5) < 1e-9
    assert abs(r["breadth"]["up"] - 0.5) < 1e-9 and abs(r["breadth"]["down"] - 0.5) < 1e-9
    assert abs(r["direction"]["improving"] - 0.5) < 1e-9 and abs(r["direction"]["weakening"] - 0.5) < 1e-9
    assert r["business"]["strong_down"]["n"] == 1 and r["words"]["businessAndPrice"] == "Out of step"
    assert "gap" not in public(r)


def test_fund_trends_shared_weak_spots():
    tech = {"A": {"st": 30, "lt": 60, "prismLabel": "STRONG"}, "C": {"st": 25, "lt": -55, "prismLabel": "HEALTHY"}}
    m = fund_trends([
        {"code": 1, "w": 0.5, "holdings": [{"stockSymbol": "C", "pct": 50, "assetClass": "equity"}, {"stockSymbol": "A", "pct": 50, "assetClass": "equity"}]},
        {"code": 2, "w": 0.5, "holdings": [{"stockSymbol": "C", "pct": 100, "assetClass": "equity"}]},
    ], tech)
    assert m["sharedWeakSpots"]["n"] == 1 and abs(m["sharedWeakSpots"]["share"] - 0.75) < 1e-9


def test_nothing_rated_does_not_break():
    r = portfolio_trend([{"symbol": "X", "weight": 1}])
    assert r["rated"] == 0 and r["average"] is None


def test_task_183_equity_business_is_the_prism_score_65_and_50():
    """The Equity portfolio pack: business = the FinLit Prism score (65 or above strong, below 50 weak), price = the long-term trend; the shares in
    between (Prism 50 to 64, or a sideways trend) are counted, not listed. The funds' look-through keeps Prism's word (no `prism` field there)."""
    r = portfolio_trend([
        {"symbol": "A", "weight": 1, "st": 30, "lt": 60, "prism": 65.0, "prismLabel": "AVERAGE"},   # 65 is strong, whatever the word
        {"symbol": "B", "weight": 1, "st": 30, "lt": 60, "prism": 64.9, "prismLabel": "HEALTHY"},   # 64.9 is in between
        {"symbol": "C", "weight": 1, "st": 0, "lt": -40, "prism": 49.9},                               # weak, long-term down
        {"symbol": "D", "weight": 1, "st": 0, "lt": 0, "prism": 80.0},                                 # strong business, sideways price: in between
        {"symbol": "E", "weight": 1, "st": 0, "lt": 30, "prism": 50.0},                                # 50 is not weak
    ])
    assert r["business"]["strong_up"]["symbols"] == ["A"] and r["business"]["weak_down"]["symbols"] == ["C"]
    assert r["business"]["strong_down"]["n"] == 0 and r["business"]["weak_up"]["n"] == 0
    assert r["between"] == 3 and r["rated"] == 5
    assert portfolio_trend([{"symbol": "F", "weight": 1, "st": 0, "lt": 60, "prismLabel": "HEALTHY"}])["business"]["strong_up"]["n"] == 1
