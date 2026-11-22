"""Exchange candles in place of the provider's daily quotes (finlit/candles.py): the parts that need no database."""
from datetime import date, timedelta

from finlit import candles
from finlit.normalize import market


def _candles(n=80, start=date(2026, 7, 1), close=100.0, volume=1_800_000):
    return [{"day": start + timedelta(days=i), "open": close - 1, "high": close + 2, "low": close - 2, "close": close + i * 0.1, "volume": volume, "exch": "NSE"} for i in range(n)]


def _provider(n=120, start=date(2026, 4, 1), close=100.0, volume=36_000):
    return {"price": [{"quote_date": (start + timedelta(days=i)).isoformat(), "open_price": close, "high_price": close + 1, "low_price": close - 1,
                       "close_price": close, "volume": volume} for i in range(n)]}


def test_payload_is_in_the_providers_shape_and_drops_bad_rows():
    rows = _candles(3) + [{"day": date(2026, 12, 1), "close": 0, "volume": 5}, {"day": date(2026, 12, 2), "close": None}]
    out = candles.payload(rows)["price"]
    assert len(out) == 3 and set(out[0]) == {"quote_date", "open_price", "high_price", "low_price", "close_price", "volume"}
    assert out[0]["quote_date"] == "2026-07-01" and out[0]["volume"] == 1_800_000


def test_merge_uses_exchange_volume_on_every_day_the_candles_cover():
    merged = candles.merge(_provider(), _candles())["price"]
    days = [r["quote_date"] for r in merged]
    assert days == sorted(days) and len(days) == len(set(days))
    after = [r for r in merged if r["quote_date"] >= "2026-07-01"]
    assert len(after) == 80 and all(r["volume"] == 1_800_000 for r in after)
    before = [r for r in merged if r["quote_date"] < "2026-07-01"]
    assert before and all(r["volume"] == 36_000 for r in before)          # older days keep the provider's rows


def test_merge_scales_older_provider_rows_when_the_two_series_disagree():
    prov = _provider(close=200.0)                                           # e.g. the provider has not applied a 1:1 bonus yet
    merged = candles.merge(prov, _candles(close=100.0))["price"]
    old = [r for r in merged if r["quote_date"] < "2026-07-01"]
    assert 95 <= old[-1]["close_price"] <= 110
    assert prov["price"][0]["close_price"] == 200.0                         # the provider's own rows are not changed in place


def test_merge_leaves_the_provider_alone_when_there_are_no_candles():
    prov = _provider()
    assert candles.merge(prov, []) is prov


def test_price_history_reads_the_merged_series():
    h = market.price_history(candles.merge(_provider(), _candles()))
    assert h["t"][-1] == "2026-09-18" and h["v"][-1] == 1_800_000 and not h["removedBadTicks"]
