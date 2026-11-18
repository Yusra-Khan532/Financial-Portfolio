"""All my investments (task #137, 15 Nov 2026 pack): the pure figures. Each test names the point of the pack it proves (B = a live bug of START-HERE,
D = a "Done when" line of the README, L = a layout line, N = "How the numbers are worked out")."""

import math

from finlit.myinvest import calc

SH = [{"symbol": "HDFCBANK", "name": "HDFC Bank", "qty": 10, "price": 1600.0}, {"symbol": "TCS", "name": "TCS", "qty": 2, "price": 4000.0}]   # 16,000 + 8,000
FU = [{"code": 1, "short": "Flexi", "units": 100, "nav": 80.0,                                                                                # 8,000
       "holdings": [{"stockSymbol": "HDFCBANK", "isin": "INE040A01034", "name": "HDFC Bank", "assetClass": "equity", "pct": 8.0, "macroSector": "Financial Services"},
                    {"stockSymbol": "INFY", "isin": "INE009A01021", "name": "Infosys", "assetClass": "equity", "pct": 5.0, "macroSector": "Information Technology"},
                    {"stockSymbol": None, "isin": "US0378331005", "name": "Apple Inc", "assetClass": "equity", "pct": 2.0},
                    {"stockSymbol": None, "isin": None, "name": "GOI 2033", "assetClass": "debt", "pct": 75.0},
                    {"stockSymbol": None, "isin": None, "name": "Gold ETF units", "assetClass": "other", "pct": 10.0}]}]
ET = [{"symbol": "NIFTYBEES", "qty": 100, "price": 80.0, "assetClass": "equity", "category": "equity",                                          # 8,000
       "holdings": [{"stockSymbol": "HDFCBANK", "isin": "INE040A01034", "name": "HDFC Bank", "assetClass": "equity", "pct": 12.0}]}]


def test_three_kinds_with_quantities_weigh_by_money_and_the_look_through_adds_up():
    """N weights with quantities; N look-through: All together = direct + through funds + through ETFs; D10 Held markers."""
    split = calc.split_parts(SH, FU, ET)
    assert split["byValue"] and split["total"] == 40000 and split["missing"] == []
    assert split["part"] == {"shares": 0.6, "funds": 0.2, "etfs": 0.2}
    rows = {r["key"]: r for r in calc.look_through(SH, FU, ET, split)}
    h = rows["HDFCBANK"]
    assert math.isclose(h["direct"], 40.0) and math.isclose(h["funds"], 20 * 0.08) and math.isclose(h["etfs"], 20 * 0.12)
    assert math.isclose(h["all"], h["direct"] + h["funds"] + h["etfs"]) and h["held"] == ["D", "F", "E"] and h["ways"] == 3
    assert h["viaFunds"] == [1] and h["viaEtfs"] == ["NIFTYBEES"]
    assert rows["INFY"]["held"] == ["F"] and not rows["INFY"]["twice"]


def test_every_equity_line_counts_including_shares_listed_abroad():
    """D14: every holding in each file, not only listed Indian ones; debt and other lines are not companies."""
    split = calc.split_parts(SH, FU, ET)
    rows = {r["key"]: r for r in calc.look_through(SH, FU, ET, split)}
    apple = rows["isin:US0378331005"]
    assert apple["abroad"] and apple["symbol"] is None and math.isclose(apple["all"], 20 * 0.02)
    assert not any("GOI" in r["name"] or "Gold" in r["name"] for r in rows.values())


def test_without_quantities_each_kind_counts_the_same_one_third_each():
    """B1 and D8: without quantities each kind counts the same (1/3 each with three kinds) and each holding the same inside its kind; no total (D9)."""
    s = [dict(SH[0], qty=None), SH[1]]
    split = calc.split_parts(s, FU, ET)
    assert not split["byValue"] and split["total"] is None and split["missing"] == ["shares"]
    assert all(math.isclose(v, 1 / 3) for v in split["part"].values())
    assert split["shares"]["w"] == [0.5, 0.5]
    two = calc.split_parts(s, FU)
    assert two["part"] == {"shares": 0.5, "funds": 0.5, "etfs": 0.0}
    assert calc.split_parts([], [], [])["part"] == {"shares": 0.0, "funds": 0.0, "etfs": 0.0}


def test_company_table_filters_have_counts():
    """D11: All, Held more than one way, Only through funds and ETFs, Only direct, each with its count."""
    split = calc.split_parts(SH, FU, ET)
    f = calc.filter_counts(calc.look_through(SH, FU, ET, split))
    assert f == {"all": 4, "twice": 1, "through": 2, "direct": 1}          # HDFCBANK three ways; INFY and Apple through; TCS direct only


def test_peer_words_never_raw_codes():
    """B4 and D12: Leader / In line / Laggard; Not compared; Not on your list."""
    assert [calc.peer_word(x, True) for x in ("leader", "in_line", "laggard", None, "odd")] == ["Leader", "In line", "Laggard", "Not compared", "Not compared"]
    assert calc.peer_word("leader", False) == "Not on your list"


def test_what_it_is_made_of_rows_and_columns():
    """L8 and N asset mix: rows Indian shares, Shares abroad, Gold and silver, Debt and cash (+ Other), File not loaded yet; columns per kind and together."""
    split = calc.split_parts(SH, FU, ET)
    m = calc.made_of(SH, FU, ET, split)
    rows = {r["key"]: r for r in m["rows"]}
    assert [r["label"] for r in m["rows"]] == ["Indian shares", "Shares abroad", "Gold and silver", "Debt and cash", "File not loaded yet"]
    assert math.isclose(rows["indian"]["shares"], 60) and math.isclose(rows["indian"]["funds"], 20 * 0.13) and math.isclose(rows["indian"]["etfs"], 20)
    assert math.isclose(rows["abroad"]["funds"], 0.4) and math.isclose(rows["gold"]["funds"], 2.0) and math.isclose(rows["debt"]["funds"], 15.0)
    assert math.isclose(sum(r["all"] for r in m["rows"]), 100.0, abs_tol=0.05)
    assert m["notLoaded"] == [] and math.isclose(m["outsideIndianShares"], 17.4, abs_tol=0.01)


def test_a_fund_or_etf_without_a_file_is_named():
    """D15: a fund or ETF whose file is not loaded counts in "File not loaded yet" and is named; a gold ETF is counted by its type."""
    nofile = [dict(FU[0], holdings=[])]
    gold = [{"symbol": "GOLDBEES", "qty": 8000, "price": 1.0, "assetClass": "gold", "category": "gold", "holdings": []}]
    split = calc.split_parts([], nofile, gold)
    m = calc.made_of([], nofile, gold, split)
    rows = {r["key"]: r["all"] for r in m["rows"]}
    assert rows["notLoaded"] == 50.0 and rows["gold"] == 50.0
    assert m["notLoaded"] == [{"kind": "funds", "name": "Flexi"}] and m["byType"] == [{"kind": "etfs", "name": "GOLDBEES"}]


def test_macro_sectors_and_fixed_size_amounts():
    """B5 and L9: the 12 macro sectors (NSE's place first, the fund file's line second); sizes large above Rs 50,000 Cr, small below Rs 10,000 Cr."""
    split = calc.split_parts(SH, FU, ET)
    comp = calc.look_through(SH, FU, ET, split)
    sec = {x["sector"]: x for x in calc.macro_sectors(comp, {"HDFCBANK": "Financial Services", "TCS": "Information Technology"})}
    assert math.isclose(sec["Financial Services"]["all"], 44.0) and math.isclose(sec["Information Technology"]["all"], 20 + 1.0)
    assert sec["Listed abroad"]["funds"] == 0.4 and not sec["Listed abroad"]["named"]
    assert [calc.size_of(x) for x in (60000, 50000, 20000, 10000, 9999, None)] == ["Large", "Mid", "Mid", "Mid", "Small", None]
    caps = {"HDFCBANK": 1_200_000, "TCS": 1_300_000, "INFY": 9000}
    sizes = {x["size"]: x for x in calc.company_sizes(comp, lambda c: caps.get(c["symbol"]))}
    assert math.isclose(sizes["Large"]["all"], 64.0) and math.isclose(sizes["Small"]["all"], 1.0) and sizes["Listed abroad"]["all"] == 0.4


def test_beta_together_is_the_sum_of_share_times_beta_and_the_risk_share_follows():
    """D16 and N: beta together = sum of share x beta; risk share = share x beta / together; red when risk share > money share + 10 points (L6)."""
    t = calc.risk_together({"shares": {"share": 0.5, "beta": 1.4}, "funds": {"share": 0.3, "beta": 0.8}, "etfs": {"share": 0.2, "beta": 1.0}}, 100000)
    assert t["beta"] == 1.14 and t["band"] == "More sensitive" and t["largest"] == "shares"
    parts = {p["kind"]: p for p in t["parts"]}
    assert parts["shares"]["riskShare"] == 61.4 and parts["shares"]["red"] and not parts["funds"]["red"]
    assert math.isclose(sum(p["riskShare"] for p in t["parts"]), 100, abs_tol=0.2)
    assert t["fall10"] == {"pct": -11.4, "value": -11400.0}
    gap = calc.risk_together({"shares": {"share": 0.5, "beta": 1.4}, "funds": {"share": 0.5, "beta": None}}, None)
    assert gap["beta"] is None and gap["why"].startswith("No beta for your mutual funds")


def test_beta_bands_and_kind_beta():
    assert [calc.beta_band(b) for b in (0.5, 0.65, 0.9, 1.1, 1.35, 1.75, None)] == ["Less sensitive", "Defensive", "Similar", "More sensitive", "High", "Very high", None]
    b, cover = calc.kind_beta([1.2, None, 0.6], [0.5, 0.25, 0.25])
    assert math.isclose(b, (1.2 * 0.5 + 0.6 * 0.25) / 0.75) and cover == 75.0


def test_band_counts_and_top_two_share():
    """L11: counts per band, the share in the top two bands, and Not rated."""
    c = calc.band_counts(["Strong", "Healthy", "Weak", None], [0.4, 0.3, 0.2, 0.1], ("Strong", "Healthy", "Average", "Weak", "Poor"))
    assert c["topTwoShare"] == 70.0 and c["notRated"] == {"count": 1, "share": 10.0} and c["bands"][3] == {"label": "Weak", "count": 1, "share": 20.0}


def test_highest_overlap_between_two_funds():
    a = {"short": "A", "holdings": [{"stockSymbol": "X", "pct": 10.0, "assetClass": "equity"}, {"stockSymbol": "Y", "pct": 5.0, "assetClass": "equity"}]}
    b = {"short": "B", "holdings": [{"stockSymbol": "X", "pct": 6.0, "assetClass": "equity"}, {"stockSymbol": "Z", "pct": 9.0, "assetClass": "equity"}]}
    assert calc.fund_overlap([a, b]) == {"pct": 6.0, "a": "A", "b": "B", "n": 1}
    assert calc.fund_overlap([a]) is None


def test_the_shares_beta_is_the_equity_portfolios_own_figure():
    """D17: the shares' beta is worked out by the Equity portfolio's own sum (portfolio_page.metrics.market_measures on its weekly frame), so both pages
    show the same figure against the same index."""
    import random
    from datetime import date, timedelta

    import numpy as np

    from finlit.diversification.calc import iso_week_key
    from finlit.myinvest.api import _shares_market
    from finlit.portfolio_page import inputs, metrics

    today = date(2026, 11, 13)
    days = [d for d in (today - timedelta(days=k) for k in range(3 * 366, -1, -1)) if d.weekday() < 5]
    rnd, x, idx = random.Random(5), 100.0, []
    for _ in days:
        x *= 1 + rnd.gauss(0.0003, 0.009)
        idx.append(x)
    a = [v * (1 + rnd.gauss(0, 0.004)) ** 1.3 for v in idx]
    b = [100 * (1 + rnd.gauss(0.0002, 0.01)) for _ in days]
    prices = {"AAA": {"t": [d.isoformat() for d in days], "c": a}, "BBB": {"t": [d.isoformat() for d in days], "c": b}}
    bench_rows = [{"d": d.isoformat(), "c": v} for d, v in zip(days, idx)]
    week = iso_week_key(today)
    got = _shares_market(prices, bench_rows, ["AAA", "BBB"], {"AAA": 0.75, "BBB": 0.25}, week)
    frame, bench = inputs.build_frame(prices, bench_rows, ["AAA", "BBB"], week)
    r, rn, _ = metrics.weekly_returns(frame, bench)
    want = metrics.market_measures(r, rn, np.array([0.75, 0.25]))
    assert got["beta"] == want["beta"] and got["vol"] == want["vol"] and got["max_fall"] == want["max_fall"]
    assert set(got["each"]) == {"AAA", "BBB"} and got["each"]["AAA"] is not None


def test_235_prism_labels_in_capitals_count_in_their_band():
    """Task #235 (the 18 Nov pack, live bug E2): Prism stores "HEALTHY"; every share used to read "Not rated" here and "No share reads Weak" was said
    while two read Weak."""
    c = calc.band_counts(["HEALTHY", "STRONG", "WEAK", "WEAK", "NOT RATED", None], [1] * 6, ("Strong", "Healthy", "Average", "Weak", "Poor"))
    assert [(b["label"], b["count"]) for b in c["bands"]] == [("Strong", 1), ("Healthy", 1), ("Average", 0), ("Weak", 2), ("Poor", 0)]
    assert c["notRated"]["count"] == 2
    assert calc.word_case("AVERAGE") == "Average" and calc.word_case(None) is None
