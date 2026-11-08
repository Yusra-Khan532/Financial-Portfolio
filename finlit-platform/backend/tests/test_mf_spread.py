"""The Diversification readings for a member's funds (mfportfolio/spread.py): a port of the design package's self-check."""
import math
from datetime import date, timedelta

from finlit.mfportfolio.spread import public_view, spread


def _days(n):
    return [(date(2025, 11, 3) + timedelta(days=i)).isoformat() for i in range(n)]


def _funds():
    t = _days(364)
    x = y = z = 100.0
    v1, v2, v3, v4 = [], [], [], []
    for i in range(len(t)):
        m = math.sin(i / 3) * 0.01
        x *= 1 + m
        y *= 1 + m * 0.9 + 0.001 * math.cos(i)
        z *= 1 + 0.0002
        v1.append(x); v2.append(y); v3.append(z); v4.append(100 * (1 + 0.004 * math.sin(i / 2 + 1)))

    def H(rows):
        return [{"isin": i, "stockSymbol": i, "name": i, "pct": p, "sector": s, "assetClass": "equity"} for i, p, s in rows]
    return [
        {"code": 1, "name": "Alpha MNC Fund", "amc": "Alpha Mutual Fund", "category": "Sectoral / Thematic", "holdings": H([("A", 10, "Banks"), ("B", 5, "Auto"), ("C", 85, "IT - Software")]),
         "assetSplit": {"equity": 100}, "series": {"t": t, "v": v1}},
        {"code": 2, "name": "Beta MNC Fund", "amc": "Beta Mutual Fund", "category": "Sectoral / Thematic", "holdings": H([("A", 20, "Banks"), ("D", 80, "It - Software")]),
         "assetSplit": {"equity": 100}, "series": {"t": t, "v": v2}},
        {"code": 3, "name": "Gamma Liquid Fund", "amc": "Alpha Mutual Fund", "category": "Liquid", "holdings": [], "assetSplit": {"debt": 100}, "series": {"t": t, "v": v3}},
        {"code": 4, "name": "Delta Flexi Cap Fund", "amc": "Delta Mutual Fund", "category": "Flexi Cap", "holdings": None, "assetSplit": None, "series": {"t": t, "v": v4}},
    ]


def test_readings_match_the_design_package_check():
    out = spread(_funds(), lambda isin, sym: {"A": "Large", "B": "Mid", "C": "Small", "D": "Small"}.get(isin))
    assert out["basis"] == "equal"
    assert len(out["overlap"]) == 1 and abs(out["overlap"][0]["pct"] - 10) < 1e-9 and out["overlap"][0]["n"] == 1   # min(10, 20) on stock A
    assert out["readings"]["theme"]["theme"] == "MNC"
    assert out["together"]["codes"] == [1, 2, 4]                                                                     # the liquid fund is left out
    assert out["readings"]["together"]["range"][1] > 0.9
    it = next(s for s in out["sectors"] if "it - software" in s["name"].lower())
    assert abs(it["share"] - (0.85 * 0.25 + 0.8 * 0.25) / out["knownShares"]) < 1e-9
    assert abs(out["mix"]["sharesUnknown"] - 0.25) < 1e-9 and abs(out["mix"]["debt"] - 0.25) < 1e-9
    assert out["coverage"]["missing"] == [3, 4]


def test_public_view_has_no_levels_or_rule():
    out = spread(_funds(), lambda *_: None)
    pub = public_view(out)
    assert all("level" not in r for r in pub["readings"].values())
    assert pub["overall"] in ("Widely spread", "Spread", "Partly spread", "Concentrated")
    assert "level" in out["readings"]["overlap"]          # the full result keeps them on the server


def test_weights_by_value_once_units_are_in():
    fs = _funds()
    for f, u in zip(fs, (10, 30, 10, 50)):
        f["units"], f["nav"] = u, 1.0
    out = spread(fs, lambda *_: None)
    assert out["basis"] == "value"
    assert abs(out["mix"]["debt"] - 0.1) < 1e-9


def test_single_fund_and_no_history_do_not_break():
    f = [{"code": 9, "name": "Solo Fund", "amc": "Solo", "category": "Large Cap", "holdings": None, "assetSplit": None, "series": None}]
    out = spread(f, lambda *_: None)
    assert out["together"]["codes"] == [] and out["readings"]["together"]["of"] == 0
    assert out["knownShares"] == 0 and out["size"]["Large"] == 0
