"""Task #277 (All my investments pack of 20 Nov): live number fixes 4 and 6.
Fix 4: every beta on the page is the one each kind's own page headlines: weekly closes over the past year against the Nifty 500 (the MF and ETF pages'
`beta500`), with its window ("vs Nifty 500 · weekly · past year"); the page had read the 3-year daily beta (fund 0.50 here, 0.68 on the MF page).
Fix 6: one band function gives the word and its sentence ("0.79 · Defensive" sat over "Similar moves")."""
from datetime import date, timedelta

from finlit.mfportfolio import bench as mfb
from finlit.myinvest import calc
from finlit.myinvest.api import _days_closes, beta500_weekly

END = date(2026, 11, 20).toordinal()


def _series(beta: float, wobble: float = 0.0):
    """Daily closes for 450 days: the index rises and falls in a fixed weekly pattern; the item moves `beta` times as much (plus its own wobble)."""
    days = [END - 449 + i for i in range(450)]
    idx, item, lvl_i, lvl_x = [], [], 100.0, 100.0
    for k, d in enumerate(days):
        r = 0.004 * ((k // 5) % 7 - 3) / 3          # a weekly-varying move
        e = wobble * (1 if (k // 5) % 2 else -1) * 0.001
        lvl_i *= 1 + r / 5
        lvl_x *= 1 + beta * r / 5 + e / 5
        idx.append(lvl_i); item.append(lvl_x)
    return days, idx, item


def test_one_weekly_past_year_beta_for_a_list_and_its_items():
    days, idx, a = _series(1.5)
    _, _, b = _series(0.5)
    out = beta500_weekly([(days, a), (days, b)], [1.0, 1.0], dict(zip(days, idx)), END)
    assert out["each"] == [1.5, 0.5] and out["beta"] == 1.0
    w = out["window"]
    assert (w["index"], w["grain"], w["window"]) == ("Nifty 500", "weekly", "past year") and w["weeks"] >= mfb.MIN_WEEKS
    assert w["to"] <= date.fromordinal(END).isoformat()


def test_the_list_beta_is_the_same_sum_as_the_mf_page():
    """The MF page's list beta500: weekly changes weighted by the list's weights, regressed on the Nifty 500's (mfportfolio.bench.build, bottom)."""
    days, idx, a = _series(1.2, wobble=1)
    _, _, b = _series(0.4)
    weeks_at = mfb.fridays(END)
    n500 = mfb.changes(mfb.weekly(days, idx, weeks_at))
    ca, cb = (mfb.changes(mfb.weekly(days, v, weeks_at)) for v in (a, b))
    port = [None if x is None or y is None else 0.75 * x + 0.25 * y for x, y in zip(ca, cb)]
    assert beta500_weekly([(days, a), (days, b)], [3.0, 1.0], dict(zip(days, idx)), END)["beta"] == mfb.r2(mfb.ols(port, n500)[0])


def test_too_few_weeks_gives_no_beta_and_share_prices_read_from_iso_dates():
    days, idx, a = _series(1.0)
    short = [(days[-60:], a[-60:])]
    assert beta500_weekly(short, [1.0], dict(zip(days, idx)), END)["beta"] is None
    d, c = _days_closes({"t": ["2026-11-19", "2026-11-18"], "c": [10.0, 9.0]})
    assert d == [date(2026, 11, 18).toordinal(), date(2026, 11, 19).toordinal()] and c == [9.0, 10.0]
    assert _days_closes(None) == ([], [])


def test_a_share_with_a_few_months_of_prices_is_left_out_not_blanking_the_list():
    """QA of 21 Nov (fail 1): 2 of 71 shares with under a year of prices had blanked the shares' beta ("—"). As on the Equity portfolio's Risk analytics, they
    are left out, the others' weights scaled up, and the window names them."""
    days, idx, a = _series(1.5)
    _, _, b = _series(0.5)
    out = beta500_weekly([(days, a), (days[-60:], b[-60:]), (days, b)], [1.0, 5.0, 1.0], dict(zip(days, idx)), END, ["AAA", "UTLSOLAR", "BBB"])
    assert out["beta"] == 1.0                                     # AAA and BBB, equal weights after UTLSOLAR is left out
    assert out["each"][1] is None and out["each"][0] == 1.5
    w = out["window"]
    assert (w["counted"], w["of"], w["short"]) == (2, 3, ["UTLSOLAR"]) and w["weeks"] >= mfb.MIN_WEEKS


def test_one_band_gives_the_word_and_its_sentence():
    assert calc.band_line(0.79) == "Defensive: moves a little less than the market. When the Nifty 500 moved 1%, this moved about 0.79%."
    assert calc.band_line(1.0).startswith("Similar: moves about with the market.")
    assert calc.band_line(None) is None
    for edge, word in calc.BETA_BANDS:
        assert word in calc.BAND_SAYS
    r = calc.risk_together({"shares": {"share": 0.5, "beta": 0.8}, "funds": {"share": 0.5, "beta": 0.78}}, None)
    assert r["band"] == "Defensive" and r["bandLine"].startswith("Defensive: moves a little less")
