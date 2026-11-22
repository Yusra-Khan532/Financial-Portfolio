"""Splits and bonuses since an IPO listed (finlit/ipocorp.py), and "since IPO" in the same terms (finlit/ipoapi.row)."""
from datetime import date

from finlit import ipoapi, ipocorp


def test_each_action_and_its_factor():
    f = ipocorp.action_factor
    assert f("Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 5/- Per Share") == 0.5     # BLS E-Services, Oct 2026
    assert f("Face Value Split (Sub-Division) - From Rs 10/- Per Share To Re 1/- Per Share") == 0.1
    assert f("Bonus 1:1") == 0.5 and f("Bonus 1:2") == 2 / 3 and f("Bonus 3:1") == 0.25
    assert f("Consolidation Of Shares From Re 1/- Per Share To Rs 10/- Per Share") == 10.0
    assert f("Bonus 1:1 And Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 5/- Per Share") == 0.25
    assert [f(s) for s in ("Dividend - Rs 3 Per Share", "Annual General Meeting", "Rights 1:5 @ Premium Rs 100/-", "")] == [None, None, None, None]


def test_only_actions_after_listing_count_and_duplicates_once():
    acts = [{"subject": "Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 5/- Per Share", "exDate": "06-Oct-2026"},
            {"subject": "Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 5/- Per Share", "exDate": "06-Oct-2026"},
            {"subject": "Bonus 1:1", "exDate": "10-Jan-2023"}, {"subject": "Dividend - Re 0.50 Per Share", "exDate": "08-Sep-2026"}]
    got = ipocorp.since_listing(acts, date(2024, 2, 6))
    assert got["factor"] == 0.5 and [a["exDate"] for a in got["actions"]] == ["2026-10-06"]      # the 2023 bonus was before listing
    assert ipocorp.since_listing([], date(2024, 2, 6)) == {"factor": 1.0, "actions": []}


def test_since_ipo_in_the_same_terms_after_a_split():
    base = {"ig_id": 1, "name": "BLS E-Services", "nse": "BLSE", "bse": None, "board": "mainboard", "sector": None, "issue_price": 135, "listing_price": 305,
            "listing_date": date(2024, 2, 6), "subscription": None, "issue_size_cr": None, "gmp": None, "gmp_pct": None, "listing_pct": 125.93, "listed": True,
            "open_date": None, "close_date": None, "issue": None, "tt": None, "cats": None, "listing_open": None, "listing_close": None, "last_close": None,
            "last_day": None, "last_px": 160.95, "last_px_date": date(2026, 11, 20), "ca_factor": 0.5}
    r = ipoapi.row(base, date(2026, 11, 21))
    assert (r["lastClose"], r["sinceIpoPct"]) == (160.95, 138.44)                 # 160.95 against 135 x 0.5 = 67.50, not a 'fall' to 160.95 from 135
    assert ipoapi.row({**base, "ca_factor": None}, date(2026, 11, 21))["sinceIpoPct"] is None     # over a year, no factor: not shown
