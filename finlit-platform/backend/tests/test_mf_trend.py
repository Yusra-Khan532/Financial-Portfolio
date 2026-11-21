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


def test_task_274_cells_have_the_new_names_and_in_between_is_listed_with_reasons():
    """The 20 Nov pack (changes 4 and 7): the nine cells carry the new names (Up first in the matrix), and every rated share sits in exactly one
    Business and price box: the four, or the fifth, In between, each with its reason (its Prism score, and "flat trend" when the long term is flat)."""
    r = portfolio_trend([
        {"symbol": "A", "weight": 1, "st": 30, "lt": 60, "prism": 70.0},     # strong, up
        {"symbol": "B", "weight": 1, "st": 0, "lt": 60, "prism": 56.0},      # Prism 56: in between
        {"symbol": "C", "weight": 1, "st": -30, "lt": 0, "prism": 64.0},     # Prism 64 and flat
        {"symbol": "D", "weight": 1, "st": 30, "lt": 5, "prism": 80.0},      # strong, but flat
        {"symbol": "E", "weight": 1, "st": 0, "lt": -40, "prism": 30.0},     # weak, down
        {"symbol": "F", "weight": 1, "st": None, "lt": None, "prism": 60.0}, # not rated: in no box
    ])
    assert {k: v["name"] for k, v in r["grid"].items()} == {
        "1,1": "Rising", "1,0": "Rising but resting", "1,-1": "Rising but dipping", "0,1": "Flat, turning up", "0,0": "Flat", "0,-1": "Flat, turning down",
        "-1,1": "Falling but bouncing", "-1,0": "Falling but resting", "-1,-1": "Falling"}
    mid = r["betweenList"]
    assert r["between"] == mid["n"] == 3 and abs(mid["share"] - 0.6) < 1e-9
    assert {x["symbol"]: (x["prism"], x["flat"]) for x in mid["items"]} == {"B": (56.0, False), "C": (64.0, True), "D": (80.0, True)}
    boxed = [s for b in r["business"].values() for s in b["symbols"]] + [x["symbol"] for x in mid["items"]]
    assert sorted(boxed) == ["A", "B", "C", "D", "E"] and len(boxed) == r["rated"]
    assert abs(sum(b["share"] for b in r["business"].values()) + mid["share"] - 1) < 1e-9


def test_task_274_scores_are_placed_as_the_page_shows_them():
    """19.6 shows as +20 on the page, so it is Rising in the matrix, the boxes and the breadth; −19.6 shows as −20 and is Falling; 19.4 is Flat."""
    r = portfolio_trend([
        {"symbol": "A", "weight": 1, "st": 19.6, "lt": 19.6, "prism": 70.0},
        {"symbol": "B", "weight": 1, "st": -19.6, "lt": -19.6, "prism": 30.0},
        {"symbol": "C", "weight": 1, "st": 19.4, "lt": 19.4, "prism": 70.0},
    ])
    assert r["grid"]["1,1"]["symbols"] == ["A"] and r["grid"]["-1,-1"]["symbols"] == ["B"] and r["grid"]["0,0"]["symbols"] == ["C"]
    assert r["business"]["strong_up"]["symbols"] == ["A"] and r["business"]["weak_down"]["symbols"] == ["B"]
    assert [x["symbol"] for x in r["betweenList"]["items"]] == ["C"]
