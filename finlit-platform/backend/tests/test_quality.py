import copy
from datetime import datetime, timezone

import pytest

from finlit import quality
from finlit.snapshot import build

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def clean(reliance_bundle):
    return build(reliance_bundle, now=NOW)


def keys(result, severity=None):
    return {i["key"] for i in result["issues"] if severity is None or i["severity"] == severity}


def test_real_data_passes_every_check(clean):
    result = clean["summary"]["dataQuality"]["checks"]
    assert result["status"] == "ok" and result["passed"] == result["total"] >= 20


def test_unit_slip_in_market_cap_is_rejected(clean):
    broken = copy.deepcopy(clean)
    broken["summary"]["quote"]["marketCapCr"] *= 100  # rupees vs crore style mistake
    result = quality.run(broken, today=NOW.date())
    assert result["status"] == "rejected" and "market_cap_consistent" in keys(result, "critical")


def test_balance_sheet_that_does_not_balance_is_rejected(clean):
    broken = copy.deepcopy(clean)
    broken["financials"]["yearly"]["bs"]["rows"]["total_assets"][-1] *= 1.5
    result = quality.run(broken, today=NOW.date())
    assert "balance_sheet_balances" in keys(result, "critical")


def test_old_site_dividend_bug_is_caught_and_only_that_figure_is_held_back(clean):
    broken = copy.deepcopy(clean)
    for r in broken["summary"]["returns"]:
        if r["dividend"] is not None:
            r["dividend"] = 89.14
    res = quality.run(broken, today=NOW.date())
    assert "dividend_return_1Y" in keys(res, "warning") and res["status"] != "rejected"     # the report is shown ...
    quality.withhold_unbelievable(broken["summary"], res)
    one = next(r for r in broken["summary"]["returns"] if r["period"] == "1Y")
    assert one["dividend"] is None and one["total"] is None and "not shown" in one["withheld"]   # ... without the figure it cannot stand behind


def test_a_real_high_dividend_payer_is_shown_when_its_earnings_could_pay_it(clean):
    """14 Nov 2026: Chennai Petroleum (5Y dividend return 147%) and Coal India (81%) were refused their whole report although the figures are real."""
    rich = copy.deepcopy(clean)
    r = next(x for x in rich["summary"]["returns"] if x["period"] == "1Y" and x["price"] is not None)
    end = rich["price"]["daily"]["c"][-1]
    start = end / (1 + r["price"] / 100)
    eps = rich["financials"]["yearly"]["pl"]["rows"]["eps"]
    for i in range(len(eps) - 3, len(eps)):
        eps[i] = round(0.2 * start, 2)                                                   # a company that earns about a fifth of its share price a year (CPCL: P/E near 5)
    r["dividend"] = 40.0                                                                 # 40% in a year: far above the old 15% limit, but less than what it earned
    assert 0.4 * start <= 1.5 * sum(eps[-3:])
    assert "dividend_return_1Y" not in keys(quality.run(rich, today=NOW.date()))


def since_listing(clean, dividend, listed="1999-03-01"):
    broken = copy.deepcopy(clean)
    broken["summary"]["returns"] = [r for r in broken["summary"]["returns"] if r["period"] != "Since listing"] + [
        {"period": "Since listing", "price": 400.0, "dividend": dividend, "total": 400.0 + dividend, "annualised": 8.0, "from": listed}]
    return quality.run(broken, today=NOW.date())


def test_a_long_listed_dividend_payer_is_not_rejected_for_what_it_paid_since_listing(clean):
    """Kennametal India (listed for decades) was refused its whole report because 17.29% since listing was held to the one-year limit of 15%."""
    r = since_listing(clean, 17.29, listed="1999-03-01")                      # 27 years: the limit is 15% a year, so about 400%
    assert "dividend_return_Since listing" not in keys(r)
    assert since_listing(clean, 380.0, listed="1999-03-01") and "dividend_return_Since listing" not in keys(since_listing(clean, 380.0, listed="1999-03-01"))


def test_the_dividend_check_still_catches_an_impossible_figure_since_listing(clean):
    assert "dividend_return_Since listing" in keys(since_listing(clean, 89.0, listed="2026-01-02"), "warning")         # a company listed 9 months ago did not pay 89%: held back
    assert "dividend_return_Since listing" in keys(since_listing(clean, 900.0, listed="1999-03-01"), "warning")        # nor 900% in 27 years, beyond its earnings: held back


def test_stale_prices_and_odd_ratios_only_warn(clean):
    broken = copy.deepcopy(clean)
    next(m for m in broken["summary"]["keyMetrics"] if m["key"] == "pe")["value"] = 5000
    result = quality.run(broken, today=datetime(2026, 12, 1).date())
    assert result["status"] == "warnings"
    assert {"range_pe", "price_fresh"} <= keys(result, "warning")


def test_zero_price_is_rejected(clean):
    broken = copy.deepcopy(clean)
    broken["summary"]["quote"]["price"] = 0.0
    assert quality.run(broken, today=NOW.date())["status"] == "rejected"
