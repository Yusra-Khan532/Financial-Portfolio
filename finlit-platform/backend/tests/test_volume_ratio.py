"""Volume against its 20-day average: both sides from the same daily candles (task #37). The quote's volume comes from another source and
counts differently; dividing one by the other put the median of the ratio near 9 instead of near 1."""

from finlit.screener.compute import compute


def sections(vols, quote_volume=None):
    return {"summary": {"quote": {"price": 100.0, **({"volume": quote_volume} if quote_volume is not None else {})}},
            "price": {"daily": {"v": vols}}}


def test_the_latest_session_against_the_median_of_the_20_before_it():
    vols = [1000.0] * 20 + [1500.0]
    m = compute(sections(vols, quote_volume=13500.0))          # a quote volume nine times bigger must not move the ratio
    assert m["avg_volume_20d"] == 1000.0
    assert m["volume_vs_avg"] == 1.5
    assert m["volume"] == 13500.0                              # the volume shown is still the quote's


def test_too_few_sessions_or_no_candle_gives_no_ratio():
    assert "volume_vs_avg" not in compute(sections([1000.0] * 5))
    assert "volume_vs_avg" not in compute(sections([], quote_volume=5000.0))


def test_d4_the_ratio_is_measured_at_the_latest_session_the_nse_file_covers():
    """Task #243, data finding D4: the NSE file is brought up to date by the weekly sector run, so the last sessions' full-day volume can be blank. The ratio
    then uses the latest session that has one (at most 7 sessions back) and says which session that is; it was blank for most companies on 18 Nov."""
    days = [f"2026-10-{d:02d}" for d in range(1, 29)]
    vols = [1000.0] * 20 + [2000.0] + [None] * 7
    s = sections(vols)
    s["price"]["daily"]["t"] = days
    m = compute(s)
    assert m["volume_vs_avg"] == 2.0 and m["avg_volume_20d"] == 1000.0
    assert m["volume_vs_avg_on"] == 20261021.0                  # the 21st session, the last with a full-day volume
    s2 = sections([1000.0] * 20 + [2000.0] + [None] * 8)         # more than 7 sessions without one: no ratio, never an old one passed off as current
    assert "volume_vs_avg" not in compute(s2)
