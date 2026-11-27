"""Task #391 (developer file 35, All my investments): the data faults, on made-up lists only.
F2: a fund held in two accounts (one lot with a buy amount, one without) kept its units but lost its whole buy price, so Invested and Gain dropped it.
F1: a holding that weighs 0 in the split is not part of a list's weekly line. F12: each kind's swing window is sent and said.
Developer file 41 v4: A1 (a share price from inside the session keeps its time, and each kind's prices are sent) and A4 (a holding left out of a kind's
beta for having no quantity says so; "under a year of prices" is only for a short history)."""
from datetime import date
from decimal import Decimal

from finlit.myinvest.api import beta500_weekly, fund_cost, fund_units, name_of, price_at, prices_of, swing_window, swing_windows
from test_myinvest_277 import END, _series


def lot(units, invested=None, pf="myfunds"):
    return {"units": Decimal(units), "invested": None if invested is None else Decimal(invested), "bought_on": date(2025, 1, 1), "pf": pf}


def test_f2_a_fund_in_two_accounts_adds_its_units_and_keeps_the_buy_price_of_the_lots_that_have_one():
    # before: units 300, invested None (the lot without an amount wiped the fund's cost); after: units 300, 100 of them cost 9,000
    held = [{"code": 7, "lots": [lot("200", None, "myfunds")]}, {"code": 7, "lots": [lot("100", "9000", "sample")]}]
    units, unknown = fund_units(held)
    assert unknown == set() and units[7]["units"] == Decimal("300") and (units[7]["lots"], units[7]["priced"]) == (2, 1)
    got = fund_cost(units[7], 40.0, False)
    assert got["units"] == 300.0 and got["invested"] is None                                   # all the units: cost not known, so no like-for-like gain
    assert got["investedPriced"] == 9000.0 and got["unitsPriced"] == 100.0 and got["valuePriced"] == 4000.0
    assert (got["lotsPriced"], got["lots"]) == (1, 2)                                         # "1 of 2 with a buy price"


def test_f2_every_lot_priced_in_both_accounts_adds_the_cost():
    units, _ = fund_units([{"code": 7, "lots": [lot("50", "5000", "a"), lot("25", "2600", "b")]}, {"code": 8, "lots": []}])
    got = fund_cost(units[7], 110.0, False)
    assert got["invested"] == 7600.0 == got["investedPriced"] and got["valuePriced"] == 8250.0 and (got["lotsPriced"], got["lots"]) == (2, 2)
    followed = fund_cost(units[8], 110.0, False)                                                # a fund only followed: no units, nothing invested
    assert followed["units"] is None and followed["invested"] is None and followed["lots"] == 0
    assert fund_cost(None, 10.0, False)["units"] is None


def test_f1_a_holding_that_weighs_0_is_not_part_of_the_lists_line():
    days, idx, a = _series(1.5)
    _, _, b = _series(0.5)
    both = beta500_weekly([(days, a), (days[-60:], b[-60:])], [1.0, 0.0], dict(zip(days, idx)), END, ["AAA", "NOQTY"])
    assert both["beta"] == 1.5 and both["window"]["counted"] == 1                             # weight 0: left out, the list keeps its full window
    equal = beta500_weekly([(days, a), (days, b)], [0.0, 0.0], dict(zip(days, idx)), END)     # no weights at all: as before
    assert equal["window"]["counted"] == 2


def test_f12_each_kinds_swing_window_is_sent_and_said():
    assert swing_window("weekly", 2.0) == {"grain": "weekly", "years": 2.0, "label": "weekly prices, 2 years"}
    assert swing_window("daily", 3.0)["label"] == "daily NAVs and prices, 3 years" and swing_window("daily", 1.4)["label"] == "daily NAVs and prices, 1.4 years"
    assert swing_window("daily", None) is None
    kinds = {"shares": {"swingWindow": swing_window("weekly", 2.0)}, "funds": {"swingWindow": swing_window("daily", 3.0)}, "etfs": {"swingWindow": swing_window("daily", 3.0)}}
    assert swing_windows(kinds) == {"differ": True, "line": "Shares: weekly prices, 2 years. Mutual funds and ETFs: daily NAVs and prices, 3 years."}
    assert swing_windows({"funds": kinds["funds"]}) == {"differ": False, "line": "Mutual funds: daily NAVs and prices, 3 years."}
    assert swing_windows({}) == {"differ": False, "line": None}


def test_names_for_the_lists():
    assert name_of("funds", {"code": 3, "short": "Sample Flexi", "name": "Sample Flexi Cap Fund - Direct Growth"}) == {"code": 3, "name": "Sample Flexi"}
    assert name_of("etfs", {"symbol": "ETX", "name": None}) == {"symbol": "ETX", "name": "ETX"}


def test_41_a4_left_out_for_no_quantity_is_not_called_a_short_history():
    # before: both ETFs below sat in window.short, which the page prints as "under a year of prices", although NOQTY has the full year
    days, idx, a = _series(1.5)
    _, _, b = _series(0.5)
    got = beta500_weekly([(days, a), (days, b), (days[-60:], a[-60:])], [0.6, 0.0, 0.4], dict(zip(days, idx)), END, ["AAA", "NOQTY", "YOUNG"])
    w = got["window"]
    assert (w["counted"], w["of"]) == (1, 3)
    assert w["noQty"] == ["NOQTY"] and w["short"] == ["YOUNG"]                                  # each its own reason
    assert got["each"][1] == 0.5                                                                # NOQTY's own beta: it has a year of prices
    none = beta500_weekly([(days, a), (days, b)], [0.0, 0.0], dict(zip(days, idx)), END, ["A", "B"])
    assert none["window"]["noQty"] == [] and none["window"]["short"] == []                     # no weights at all: each counts the same, none left out


def test_41_a1_a_price_from_inside_the_session_keeps_its_time():
    assert price_at("2026-11-26T10:16:05+05:30") == "2026-11-26T10:16:05+05:30"
    assert price_at("2026-11-25") is None and price_at(None) is None and price_at("not a time") is None
    shares = [{"priceAt": "2026-11-26T10:16:05+05:30", "priceDate": "2026-11-26"}, {"priceAt": "2026-11-26T04:50:00+00:00", "priceDate": "2026-11-26"},
              {"priceAt": None, "priceDate": "2026-11-25"}]
    got = prices_of(shares, [{"priceDate": "2026-11-23"}, {"priceDate": "2026-11-25"}])
    assert got == {"sharesAt": "2026-11-26T04:50:00+00:00", "sharesTo": "2026-11-26", "etfsTo": "2026-11-25"}   # 10:20 IST is later than 10:16 IST
    assert prices_of([], []) == {"sharesAt": None, "sharesTo": None, "etfsTo": None}
