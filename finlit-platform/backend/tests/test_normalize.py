from datetime import date

from finlit.normalize import events, market, statements
from finlit.normalize.common import fiscal_year_label, parse_date


def test_parse_date_formats():
    assert parse_date(20260331) == date(2026, 3, 31)
    assert parse_date("20260331") == date(2026, 3, 31)
    assert parse_date("05-Jun-2026") == date(2026, 6, 5)
    assert parse_date("2026-09-25 22:49:04") == date(2026, 9, 25)
    assert parse_date("28-09-2026") == date(2026, 9, 28)
    assert parse_date(1_758_000_000) is not None  # unix seconds
    assert parse_date(None) is None
    assert parse_date("garbage") is None


def test_fiscal_year_label():
    assert fiscal_year_label(20260331) == "FY26"
    assert fiscal_year_label(date(2025, 6, 30)) == "FY26"


def test_dividends_parse_and_dedupe():
    # The old site could not parse DD-Mon-YYYY and counted duplicates, showing an 89% dividend return.
    payload = {"dividend": [
        {"date": "05-Jun-2026", "amount": 5.5, "adj_amount": 5.5, "dividend_type": "Final", "subject": "Final Dividend - Rs 5.50"},
        {"date": "05-Jun-2026", "amount": 5.5, "adj_amount": 5.5, "dividend_type": "Final", "subject": "Final Dividend - Rs 5.50"},
        {"date": "14-Aug-2025", "amount": 10, "adj_amount": 5, "dividend_type": "Final", "subject": "Dividend"},
    ]}
    actions = events.corporate_actions(payload)
    assert len(actions) == 2
    assert actions[0]["date"] == "2026-06-05"  # newest first
    assert events.dividends_between(actions, date(2025, 9, 1), date(2026, 9, 1)) == 5.5
    assert events.dividends_between(actions, date(2025, 1, 1), date(2026, 9, 1)) == 10.5  # adjusted amounts


def test_bad_ticks_removed():
    rows = [{"quote_date": f"2026-08-{d:02d}", "close_price": 300 + d} for d in range(1, 21)]
    rows[9]["close_price"] = 0          # zero tick
    rows[14]["close_price"] = 3.17      # isolated spike down
    history = market.price_history({"price": rows})
    assert "2026-08-10" in history["removedBadTicks"]
    assert "2026-08-15" in history["removedBadTicks"]
    assert min(history["c"]) > 300
    assert history["t"] == sorted(history["t"])


def test_weekly_downsample():
    rows = [{"quote_date": f"2026-09-{d:02d}", "close_price": 100 + d, "volume": 1} for d in range(1, 29)]
    w = market.weekly(market.price_history({"price": rows}))
    assert len(w["t"]) == 5 and sum(w["v"]) == 28 and w["c"][-1] == 128


def test_statement_dedupes_restated_periods():
    rows = [
        {"period_end": 20250331, "revenueFromOperations": 1e9, "profitLossForPeriod": 1e8},
        {"period_end": 20260331, "revenueFromOperations": 2e9, "profitLossForPeriod": 2e8},
        {"period_end": 20260331, "revenueFromOperations": 3e9, "profitLossForPeriod": 3e8},  # restated
    ]
    pl = statements.profit_and_loss(rows)
    assert pl["periods"] == ["FY25", "FY26"]
    assert pl["rows"]["revenue"] == [100.0, 300.0]


def test_reliance_statements(reliance_bundle):
    pl = statements.profit_and_loss(reliance_bundle["pl_annual"]["financials"])
    assert pl["periods"][-1] == "FY26"
    assert round(statements.latest(pl, "revenue")) == 524105
    assert round(statements.latest(pl, "net_profit")) == 43851


def test_segments_merge_spelling(reliance_bundle):
    seg = events.segments(reliance_bundle["segments"])
    names = [s["name"].lower().replace("&", "and") for s in seg["latest"]]
    assert names and len(names) == len(set(names))
    assert abs(sum(s["sharePct"] for s in seg["latest"]) - 100) < 0.1


def test_quote_time_is_ist_not_utc():
    assert market.ist_timestamp("2026-09-29T15:59:02Z") == "2026-09-29T15:59:02+05:30"
    assert market.ist_timestamp("2026-09-29 09:15:00") == "2026-09-29T09:15:00+05:30"
    assert market.ist_timestamp("2026-09-29T10:00:00+05:30") == "2026-09-29T10:00:00+05:30"
    assert market.ist_timestamp("garbage") is None and market.ist_timestamp(None) is None


def test_shareholding_keeps_the_providers_whole_history():
    import json
    from pathlib import Path
    from finlit.normalize import ownership
    raw = json.loads((Path(__file__).parent / "fixtures" / "finedge" / "shareholdings_pattern_reliance_period_quarterly.json").read_text())
    full = ownership.shareholding(raw)
    assert len(full["periods"]) == len(raw["columns"]) == 41
    assert full["periods"][0] == "Jun 2016" and full["periods"][-1] == full["asOf"] == "Jun 2026"
    assert all(len(v) == 41 for v in full["series"].values())
    assert len(json.dumps(full)) < 6000                      # still a small array of numbers
    assert full["comparedWith"] == "Jun 2025"
    cut = ownership.shareholding(raw, limit=12)
    assert cut["periods"] == full["periods"][-12:] and cut["series"]["promoters"] == full["series"]["promoters"][-12:]
    assert cut["latest"] == full["latest"]


def test_equity_falls_back_to_share_capital_plus_reserves_for_older_years():
    from finlit.normalize import statements as st
    assert st._equity({"equityCapital": 1_000_000_000, "reserves": 9_000_000_000}) == st.crore(10_000_000_000)
    assert st._equity({"capital": 1_000_000_000, "reserves": 9_000_000_000}) == st.crore(10_000_000_000)
    assert st._equity({"equityCapital": 1_000_000_000}) is None          # one half alone is not the total
    assert st._equity({"totalEquity": 5_000_000_000, "equityCapital": 1, "reserves": 1}) == st.crore(5_000_000_000)


def test_weekly_candles_carry_open_high_low_so_3y_and_5y_charts_draw_candles_not_dots():
    # a week (Mon 7 to Fri 11 Sep 2026) of daily candles: open from Monday, high and low over the week, close from Friday, the week's volume
    h = {"t": ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14"],
         "o": [100, 103, 101, 104, 106, 108], "h": [104, 105, 103, 109, 107, 110], "l": [99, 100, 97, 102, 104, 107],
         "c": [103, 101, 102, 106, 105, 109], "v": [10, 20, 30, 40, 50, 60]}
    w = market.weekly(h)
    assert w["t"] == ["2026-09-11", "2026-09-14"]                     # dated on the last trading day of the week
    assert (w["o"][0], w["h"][0], w["l"][0], w["c"][0], w["v"][0]) == (100, 109, 97, 105, 150)
    assert (w["o"][1], w["h"][1], w["l"][1], w["c"][1], w["v"][1]) == (108, 110, 107, 109, 60)
    close_only = market.weekly({"t": h["t"], "c": h["c"], "v": h["v"]})
    assert "o" not in close_only and close_only["c"] == [105, 109]    # no open/high/low: the chart draws a line, never dots


def test_every_price_range_sends_candles_and_the_9_20_50_200_day_lines(reliance_sections):
    for rng in ("1M", "6M", "1Y", "3Y", "5Y"):
        s = reliance_sections[f"price-{rng}"]["series"]
        n = len(s["t"])
        assert n > 0, rng
        for k in ("o", "h", "l", "c", "v", "ema9", "ema20", "ema50", "ema200"):
            assert k in s and len(s[k]) == n, (rng, k)
        assert all(lo <= c <= hi for lo, c, hi in zip(s["l"], s["c"], s["h"]) if None not in (lo, c, hi)), rng
        if reliance_sections[f"price-{rng}"]["grain"] == "weekly":
            assert sum(1 for o, c in zip(s["o"], s["c"]) if o != c) > n // 2, rng      # real weekly candles, not open = close dots
