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
