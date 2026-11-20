"""ETF portfolio sums (task #136): weights, what each ETF tracks and the "twice" key, the asset mix, company size, overlap, the largest stocks,
moving together and each ETF's share of the swings. Pure functions, no database."""

import math
import random
from datetime import date, timedelta

from finlit.etfportfolio import calc
from finlit.etfportfolio.api import match, qty_of, sym_of, RawRow

import pytest


def test_equal_weights_until_every_etf_has_a_quantity_then_by_value():
    items = [{"symbol": "A", "qty": 10, "price": 100.0}, {"symbol": "B", "qty": None, "price": 50.0}]
    assert calc.weights(items) == ({"A": 0.5, "B": 0.5}, "equal")
    items[1]["qty"] = 60
    w, basis = calc.weights(items)
    assert basis == "value" and w["A"] == pytest.approx(1000 / 4000) and w["B"] == pytest.approx(3000 / 4000)


def test_what_an_etf_tracks_and_the_key_that_finds_one_index_twice():
    n1 = calc.track_of("nifty50", "Nifty 50", "nifty50", "Nifty 50", "Nifty 50 TRI")
    n2 = calc.track_of("nifty50", "Nifty 50", "nifty50", "Nifty 50", None)
    gold1 = calc.track_of("gold", "Gold", None, None, "Domestic Price of Gold")
    gold2 = calc.track_of("gold", "Gold", None, None, None)
    us = calc.track_of("intl", "International", None, None, "NASDAQ - 100 TRI")
    none = calc.track_of("theme", "Other themes", None, None, None)
    assert n1["key"] == n2["key"] == "idx:nifty50" and n1["label"] == "Nifty 50"
    assert gold1["key"] == gold2["key"] == "cat:gold" and gold1["label"] == "Gold"         # every gold ETF follows the domestic gold price
    assert us == {"key": "bm:nasdaq100", "label": "NASDAQ-100", "basis": "benchmark"}
    assert none["key"] is None and none["label"] == "Other themes"
    rep = calc.repeats({"NIFTYBEES": n1, "SBINIFTY50": n2, "GOLDBEES": gold1, "MON100": us, "X": none})
    assert rep == [{"key": "idx:nifty50", "label": "Nifty 50", "symbols": ["NIFTYBEES", "SBINIFTY50"]}]


def test_tidy_benchmark():
    assert calc.tidy_benchmark("Nifty 50 Index (TRI)") == "Nifty 50"
    assert calc.tidy_benchmark("NIFTY 50 Total Return Index") == "NIFTY 50"
    assert calc.tidy_benchmark("") is None and calc.tidy_benchmark("TRI") is None


def test_asset_mix_by_type_with_the_cash_in_each_file_as_debt():
    etfs = [{"symbol": "N", "w": 0.4, "assetClass": "equity", "split": {"equity": 99.0, "debt": 0, "cash": 1.0, "other": 0}},
            {"symbol": "G", "w": 0.2, "assetClass": "gold", "split": None},
            {"symbol": "M", "w": 0.2, "assetClass": "international", "split": {"equity": 100.0}},
            {"symbol": "L", "w": 0.2, "assetClass": "debt", "split": {"debt": 10, "cash": 90}}]
    m = calc.asset_mix(etfs)
    assert m["shares"]["indian"] == pytest.approx(0.396) and m["shares"]["debt"] == pytest.approx(0.204)
    assert m["shares"]["gold"] == pytest.approx(0.2) and m["shares"]["abroad"] == pytest.approx(0.2) and m["shares"]["silver"] == 0
    assert m["fromType"] == ["G"] and sum(m["shares"].values()) == pytest.approx(1.0)


H = lambda isin, pct, name=None, sym=None, cls="equity": {"isin": isin, "pct": pct, "name": name or isin, "stockSymbol": sym, "sector": "Banks", "assetClass": cls}  # noqa: E731


def test_overlap_is_the_sum_of_the_smaller_weights_and_gold_holds_no_shares():
    a = {"symbol": "A", "w": 0.5, "holdings": [H("INE1", 10), H("INE2", 5), H("INE3", 2)]}
    b = {"symbol": "B", "w": 0.3, "holdings": [H("INE1", 8), H("INE3", 4), H("INE9", 50)]}
    g = {"symbol": "G", "w": 0.2, "holdings": [H(None, 99, "Gold bar", cls="other")]}
    o = calc.overlap([a, b, g])
    assert o["symbols"] == ["A", "B"] and o["pairs"] == [{"a": "A", "b": "B", "pct": 10.0, "n": 2}]
    same = calc.overlap([a, {**a, "symbol": "A2"}])
    assert same["pairs"][0]["pct"] == 17.0


def test_largest_stocks_weighted_with_the_etfs_that_hold_each_and_abroad_marked():
    a = {"symbol": "NIFTYBEES", "w": 0.5, "assetClass": "equity", "holdings": [H("INE040A01034", 10, "HDFC Bank Limited", "HDFCBANK"), H("INE090A01021", 8, "ICICI", "ICICIBANK")]}
    b = {"symbol": "SBINIFTY50", "w": 0.25, "assetClass": "equity", "holdings": [H("INE040A01034", 10, "HDFC Bank Ltd", "HDFCBANK")]}
    m = {"symbol": "MON100", "w": 0.25, "assetClass": "international", "holdings": [H("US67066G1040", 9, "NVIDIA Corp"), H(None, 8, "Microsoft Corp")]}
    top = calc.top_stocks([a, b, m], n=3)
    assert [t["name"] for t in top] == ["HDFC Bank Limited", "ICICI", "NVIDIA Corp"]
    assert top[0]["w"] == pytest.approx(0.075) and top[0]["etfs"] == ["NIFTYBEES", "SBINIFTY50"] and not top[0]["abroad"]
    assert top[2]["abroad"] and calc.abroad(None, "international") and not calc.abroad("INE040A01034", "international")


def test_company_size_of_the_indian_shares_only():
    a = {"symbol": "A", "w": 1.0, "assetClass": "equity", "holdings": [H("INE1", 60), H("INE2", 40), H("US1", 10)]}
    s = calc.size_mix([a], lambda i: {"INE1": "Large", "INE2": "Mid"}.get(i or ""))
    assert s == {"Large": 0.6, "Mid": 0.4, "Small": 0.0, "Micro": 0.0, "Not sized": 0.0}
    assert calc.size_mix([{"symbol": "G", "w": 1, "assetClass": "gold", "holdings": None}], lambda i: None) is None


def walk(seed, n=400, drift=0.0003, vol=0.01, start=date(2025, 1, 1)):
    r = random.Random(seed)
    d, v, x = [], [], 100.0
    day = start
    while len(d) < n:
        if day.weekday() < 5:
            x *= 1 + drift + r.gauss(0, vol)
            d.append(day.toordinal())
            v.append(x)
        day += timedelta(days=1)
    return d, v


def test_moving_together_and_each_ones_share_of_the_swings():
    d, a = walk(1)
    _, g = walk(2)
    b = [x * (1 + 0.0001 * math.sin(i)) for i, x in enumerate(a)]          # the same index through another fund house
    end = d[-1]
    t = calc.together({"A": (d, a), "B": (d, b), "G": (d, g)}, end)
    r = {(p["a"], p["b"]): p["r"] for p in t["pairs"]}
    assert r[("A", "B")] > 0.99 and abs(r[("A", "G")]) < 0.4 and t["from"] and t["to"]
    s = calc.variance_shares({"A": (d, a), "B": (d, b), "G": (d, g)}, {"A": 1 / 3, "B": 1 / 3, "G": 1 / 3}, end)
    assert sum(s["shares"].values()) == pytest.approx(100, abs=0.5)
    assert s["shares"]["A"] == pytest.approx(s["shares"]["B"], abs=1) and s["shares"]["A"] > s["shares"]["G"]
    flat = ([d[0], d[1]], [1.0, 1.0])
    assert calc.variance_shares({"A": (d, a), "F": flat}, {"A": .5, "F": .5}, end)["why"]


def test_import_matching_isin_first_then_symbol_and_shares_never_guessed():
    by = {"NIFTYBEES": {"display_name": "Nippon India ETF Nifty 50 BeES", "isin": "INF204KB14I2"}}
    by_isin = {"INF204KB14I2": "NIFTYBEES"}
    assert match(RawRow(isin="INF204KB14I2", symbol="WRONG"), by, by_isin)[:2] == ("matched", "NIFTYBEES")
    assert match(RawRow(symbol="NSE:niftybees-eq"), by, by_isin)[:2] == ("matched", "NIFTYBEES")
    assert match(RawRow(isin="INE040A01034", symbol="HDFCBANK"), by, by_isin)[0] == "ignored"
    assert match(RawRow(isin="INF179K01XQ0"), by, by_isin)[0] == "not_found"
    assert sym_of("NIFTYBEES.NS") == "NIFTYBEES"


def test_quantities():
    assert qty_of("1,200") == 1200 and qty_of(None) is None and qty_of(" ") is None and str(qty_of(12.5)) == "12.5000"
    for bad in ("abc", "0", "-3", "1e20"):
        with pytest.raises(ValueError):
            qty_of(bad)
