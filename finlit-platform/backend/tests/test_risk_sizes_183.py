"""Task #183 W8 (Equity portfolio, Risk analytics, E72–E85): betas against each size's own index, the size-weighted, blended and Nifty 50 betas, the size table,
swing and worst fall over 3 years, the 10 worst weeks: each against a hand calculation on series whose answers are known."""
import math

import numpy as np
import pandas as pd
import pytest

from finlit.portfolio_page import risk_sizes as rs

FRIDAYS = pd.date_range("2023-11-03", periods=160, freq="W-FRI")       # Friday-only closes, so every weekly return is exactly the one written


def path(rets, start=100.0):
    return [start] + list(start * np.cumprod(1 + np.asarray(rets)))


def series(closes):
    return {"t": [d.date().isoformat() for d in FRIDAYS[: len(closes)]], "c": list(closes)}


rng = np.random.default_rng(3)
NIFTY = rng.normal(0.002, 0.02, len(FRIDAYS) - 1)
MID = rng.normal(0.003, 0.03, len(FRIDAYS) - 1)
SMALL = rng.normal(0.003, 0.035, len(FRIDAYS) - 1)
IDX = {code: [{"d": d.date().isoformat(), "c": c} for d, c in zip(FRIDAYS, path(r))] for code, r in (("NIF50", NIFTY), ("NIFMID150", MID), ("NIFSMA250", SMALL))}


def test_sizes_and_ranges():
    # task #262 (finlit/sizes.py): Large above 75,000 Cr; Mid 25,000-75,000 (both lines Mid); Small 10,000-<25,000; Micro below 10,000
    assert [rs.size_of(v) for v in (75001, 75000, 25000, 24999, 10000, 9999, 5, None)] == ["Large", "Mid", "Mid", "Small", "Small", "Micro", "Micro", None]
    assert [rs.band_of(b)["word"] for b in (0.5, 0.65, 0.9, 1.1, 1.35, 1.75, 2.4)] == ["Less sensitive", "Defensive", "Similar", "More sensitive", "High", "Very high", "Very high"]
    assert rs.band_of(None) is None


def test_each_share_against_its_own_size_index_to_two_decimals():
    prices = {"BIG": series(path(1.5 * NIFTY)), "MIDCO": series(path(0.8 * MID)), "SMALLCO": series(path(1.2 * SMALL)), "NEW": series(path(NIFTY[-30:]))}
    out = rs.build(prices, IDX, {"BIG": "Large", "MIDCO": "Mid", "SMALLCO": "Small", "NEW": "Large"}, {"BIG": "Energy", "MIDCO": "IT", "SMALLCO": "IT", "NEW": "IT"})
    by = {x["symbol"]: x for x in out["shares"]}
    assert (by["BIG"]["beta"], by["BIG"]["explained"], by["BIG"]["benchmark"], by["BIG"]["band"]["word"]) == (1.5, 100, "Nifty 50", "High")
    assert (by["MIDCO"]["beta"], by["MIDCO"]["benchmark"]) == (0.8, "Nifty Midcap 150")
    assert (by["SMALLCO"]["beta"], by["SMALLCO"]["benchmark"]) == (1.2, "Nifty Smallcap 250")
    assert by["NEW"]["beta"] is None and by["NEW"]["why"] == "Under a year of prices"            # the pack: shares with under a year of prices say so
    assert out["counted"] == 3
    sz = {s["size"]: s for s in out["sizes"]}
    assert (sz["Large"]["n"], sz["Large"]["avgBeta"], sz["Large"]["listShare"], sz["Large"]["adds"]) == (1, 1.5, 33.3, 0.5)
    # size-weighted beta = each size's average beta times its share of the list: (1.5 + 0.8 + 1.2) / 3
    assert out["betas"]["weighted"] == round((1.5 + 0.8 + 1.2) / 3, 2) == out["glance"]["weighted"]
    # each size moved 150 / 80 / 120 for every 100 its index moved, in down weeks and in up weeks
    assert (sz["Large"]["downPer100"], sz["Large"]["upPer100"]) == (150, 150) and (sz["Mid"]["downPer100"], sz["Mid"]["upPer100"]) == (80, 80)


def test_the_blended_and_nifty_betas_match_a_hand_regression():
    prices = {"BIG": series(path(1.5 * NIFTY)), "MIDCO": series(path(0.8 * MID))}
    out = rs.build(prices, IDX, {"BIG": "Large", "MIDCO": "Mid"}, {})
    end = 52
    lst = (1.5 * NIFTY[-end:] + 0.8 * MID[-end:]) / 2                     # equal amounts, last 52 weeks
    blend = 0.5 * NIFTY[-end:] + 0.5 * MID[-end:]                         # each size's index in its share of the list
    hand = lambda y, x: np.cov(y, x, ddof=1)[0, 1] / np.var(x, ddof=1)    # noqa: E731
    assert out["betas"]["blended"] == round(hand(lst, blend), 2)
    assert out["betas"]["nifty"] == round(hand(lst, NIFTY[-end:]), 2)


def test_swing_and_worst_fall_over_three_years_and_the_ten_worst_weeks():
    s = rs.daily([d.date().isoformat() for d in FRIDAYS], path(NIFTY))
    f = rs.swing_and_fall(s, FRIDAYS[-1])
    x = s[s.index > FRIDAYS[-1] - pd.Timedelta(days=3 * 365)]
    # task #274 (number fix 1): these are WEEKLY closes, so a year has 52 of them (√52), not 252 (√252 put every swing 2.2 times too high)
    assert f["grain"] == "weekly"
    assert f["swing"] == pytest.approx(float(x.pct_change().dropna().std(ddof=1)) * math.sqrt(52) * 100)
    assert f["worstFall"] == pytest.approx(float((x / x.cummax() - 1).min() * 100)) and f["worstFall"] < 0 and f["years"] == pytest.approx(3.0, abs=0.1)
    out = rs.build({"BIG": series(path(1.5 * NIFTY))}, IDX, {"BIG": "Large"}, {})
    worst = np.sort(NIFTY[-52:])[:10]
    assert out["glance"]["worst10"] == {"list": round(float(np.mean(1.5 * worst)) * 100, 1), "nifty": round(float(np.mean(worst)) * 100, 1)}


def test_task274_each_series_is_annualised_by_its_own_spacing_and_says_which():
    """Number fix 1 (20 Nov pack): the shares' stored closes (price-MAX) are weekly and were annualised with √252: INFY read 59% for a true 27%. The index's closes
    are daily and stay √252. Every swing carries its grain and years so the page can say what it rests on."""
    days = pd.bdate_range(end=FRIDAYS[-1], periods=3 * 252)
    rng = np.random.default_rng(7)
    d = pd.Series(100 * np.cumprod(1 + rng.normal(0, 0.01, len(days))), index=days)
    fd = rs.swing_and_fall(d, FRIDAYS[-1])
    assert fd["grain"] == "daily" and fd["swing"] == pytest.approx(float(d[d.index > FRIDAYS[-1] - pd.Timedelta(days=3 * 365)].pct_change().dropna().std(ddof=1)) * math.sqrt(252) * 100)
    w = d.resample("W-FRI").last()
    fw = rs.swing_and_fall(w, FRIDAYS[-1])
    assert fw["grain"] == "weekly"
    assert 0.75 < fw["swing"] / fd["swing"] < 1.33          # the same prices read weekly or daily give about the same yearly swing; the old √252 gave about 2.2 times
    assert rs.grain_of(pd.DatetimeIndex(pd.date_range("2024-01-31", periods=24, freq="ME"))) == "monthly"
    out = rs.build({"BIG": series(path(1.5 * NIFTY))}, IDX, {"BIG": "Large"}, {})
    assert out["glance"]["list"]["grain"] == "weekly" and out["glance"]["nifty"]["grain"] in ("weekly", "daily")
    assert out["shares"][0]["grain"] == "weekly" and out["glance"]["list"]["years"] == pytest.approx(3.0, abs=0.1)
    big = out["shares"][0]["swing"]
    lst = out["glance"]["list"]["swing"]
    assert lst == pytest.approx(big, rel=0.02)              # a list of one share swings as that share


def test_no_nifty_is_an_error_and_a_share_with_no_prices_says_why():
    with pytest.raises(ValueError):
        rs.build({}, {}, {}, {})
    out = rs.build({"X": None}, IDX, {"X": "Small"}, {})
    assert out["shares"][0]["why"] == "No stored prices" and out["counted"] == 0


def test_task274_the_glance_figures_against_each_compare_index():
    """Change 17 and live text issue 7 (20 Nov pack): picking NIFTY 500, Midcap 150 or Smallcap 250 in Compare with changed the picker but not the four
    tiles. The answer now carries each index's swing and worst fall, the list's and the index's move in that index's 10 worst weeks, and the list's beta
    against it; an index without closes is left out."""
    big = 1.2 * MID
    n500 = rng.normal(0.002, 0.022, len(FRIDAYS) - 1)
    idx = {**IDX, "NIF500": [{"d": d.date().isoformat(), "c": c} for d, c in zip(FRIDAYS, path(n500))]}
    out = rs.build({"MIDCO": series(path(big))}, idx, {"MIDCO": "Mid"}, {})
    vs = out["glance"]["vs"]
    assert set(vs) == {"NIF50", "NIF500", "NIFMID150", "NIFSMA250"}
    assert vs["NIFMID150"]["name"] == "Nifty Midcap 150" and vs["NIFMID150"]["beta"] == 1.2          # the list moves exactly 1.2 times the Midcap 150
    w = pd.Series(MID[-52:]); worst = w.nsmallest(10)
    assert vs["NIFMID150"]["worst10"]["index"] == pytest.approx(round(float(worst.mean() * 100), 1))
    assert vs["NIFMID150"]["worst10"]["list"] == pytest.approx(round(float(1.2 * worst.mean() * 100), 1), abs=0.11)
    assert vs["NIF50"]["swing"] == out["glance"]["nifty"]["swing"] and vs["NIF50"]["worstFall"] == out["glance"]["nifty"]["worstFall"]   # the Nifty 50 as before
    assert "NIF500" not in rs.build({"MIDCO": series(path(big))}, IDX, {"MIDCO": "Mid"}, {})["glance"]["vs"]   # no closes, no figures
