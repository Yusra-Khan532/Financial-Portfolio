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
        return [{"isin": i, "stockSymbol": i, "name": i, "pct": p, "industry": s, "assetClass": "equity"} for i, p, s in rows]
    return [
        {"code": 1, "name": "Alpha MNC Fund", "amc": "Alpha Mutual Fund", "category": "Sectoral / Thematic", "holdings": H([("A", 10, "Banks"), ("B", 5, "Auto"), ("C", 85, "IT - Software")]),
         "assetSplit": {"equity": 100}, "series": {"t": t, "v": v1}},
        {"code": 2, "name": "Beta MNC Fund", "amc": "Beta Mutual Fund", "category": "Sectoral / Thematic", "holdings": H([("A", 20, "Banks"), ("D", 80, "IT - Software")]),
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
    it = next(s for s in out["industries"] if s["name"] == "IT - Software")   # NSE's industry, one spelling (taxonomy.holding_level, task #192)
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


def test_task_183_holdings_are_read_by_their_isin():
    """COMMON-RULES 9: a line filed as a share whose ISIN is the company's bond or paper (INE040A08…) counts as debt, never as the share; a share ISIN
    with no listed company behind it is counted as not matched; foreign ISINs stay shares (listed abroad)."""
    from finlit.mfportfolio.spread import by_isin
    lines = [{"isin": "INE040A01034", "stockSymbol": "HDFCBANK", "name": "HDFC Bank", "pct": 6.0, "assetClass": "equity"},
             {"isin": "INE040A08AB1", "stockSymbol": None, "name": "HDFC Bank NCD", "pct": 2.0, "assetClass": "equity"},
             {"isin": "INE999Z01011", "stockSymbol": None, "name": "Unlisted Co", "pct": 1.0, "assetClass": "equity"},
             {"isin": "US0378331005", "stockSymbol": None, "name": "Apple Inc", "pct": 1.5, "assetClass": "equity"}]
    out, unmatched = by_isin(lines)
    assert [h["assetClass"] for h in out] == ["equity", "debt", "equity", "equity"] and unmatched == 1
    fund = {"code": 9, "name": "Epsilon Banking Fund", "amc": "E", "category": "Sectoral / Thematic", "holdings": lines, "assetSplit": {"equity": 100}, "series": None}
    res = spread([fund], lambda isin, sym: "Large" if sym else None)
    stocks = {t["name"] for t in res["topStocks"]}
    assert "HDFC Bank NCD" not in stocks and "HDFC Bank" in stocks and res["coverage"]["notMatched"] == 1
    assert abs(res["knownShares"] - (6.0 + 1.0 + 1.5) / 100) < 1e-9                    # the bond's 2% is not counted as shares


def test_task_183_look_through_grid_adds_up_at_both_levels_and_lists_every_company():
    """Pack 02: the macro sector x size and sector x size grids carry every company per cell, biggest first, and add up to the list's share in shares."""
    def H(isin, sym, pct, macro, sector):
        return {"isin": isin, "stockSymbol": sym, "name": sym, "pct": pct, "assetClass": "equity", "macroSector": macro, "sector": sector, "industry": sector}
    a = {"code": 1, "name": "A Fund", "amc": "A", "category": "Flexi Cap", "assetSplit": {"equity": 60, "debt": 40}, "series": None,
         "holdings": [H("INE000A01011", "HDFCBANK", 30, "Financial Services", "Financial Services"), H("INE000B01011", "TCS", 20, "Information Technology", "Information Technology"),
                      H("INE000C01011", "SMALLCO", 10, "Financial Services", "Capital Markets"), {"isin": "INE000A08011", "name": "HDFC NCD", "pct": 40, "assetClass": "debt"}]}
    b = {"code": 2, "name": "B Fund", "amc": "B", "category": "Small Cap", "assetSplit": {"equity": 100}, "series": None,
         "holdings": [H("INE000C01011", "SMALLCO", 70, "Financial Services", "Capital Markets"), H("US0378331005", None, 30, None, None)]}
    sizes = {"INE000A01011": "Large", "INE000B01011": "Large", "INE000C01011": "Small"}
    out = spread([a, b], lambda isin, sym: sizes.get(isin))
    lt = out["lookThrough"]
    for lvl in ("macro", "sector"):
        assert abs(sum(c["w"] for c in lt[lvl].values()) - out["knownShares"]) < 1e-12        # the grid adds up to the list's share in shares, at both levels
    fs = lt["macro"]["Financial Services|Large"]
    assert fs["n"] == 1 and abs(fs["w"] - 0.15) < 1e-12                                            # 30% of fund A, which is half the list
    sm = lt["macro"]["Financial Services|Small"]
    assert sm["n"] == 1 and abs(sm["w"] - (0.05 + 0.35)) < 1e-12 and sm["stocks"][0]["symbol"] == "SMALLCO"   # one company, held by both funds
    assert "Listed abroad|Unsized" in lt["macro"] and lt["sector"]["Capital Markets|Small"]["n"] == 1 and out["sectorMacro"]["Capital Markets"] == "Financial Services"
    assert out["perFund"]["1"]["macro"] == {"Financial Services": 0.4, "Information Technology": 0.2} and out["perFund"]["2"]["size"] == {"Small": 0.7, "Unsized": 0.3}
