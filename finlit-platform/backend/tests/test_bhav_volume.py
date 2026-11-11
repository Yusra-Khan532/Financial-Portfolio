"""NSE's bhavcopy as the source of daily volume (fix 8): full-day volume per company and date, blanks where there is none, stale holiday copies dropped."""
import csv
import gzip
from datetime import date

from finlit import bhav_volume
from finlit.screener.price_fields import price_fields


def _write(folder, rows):
    with gzip.open(folder / "bhav_2026.csv.gz", "wt", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["date", "symbol", "series", "isin", "open", "high", "low", "close", "last", "prev_close", "volume", "value", "trades"])
        w.writerows(rows)


def test_volume_comes_from_the_file_with_blanks_for_missing_days_and_no_stale_copies(tmp_path, monkeypatch):
    monkeypatch.setenv("SECTOR_NSE_DIR", str(tmp_path))
    bhav_volume._cache.update(sig=None, data=None)
    _write(tmp_path, [
        ["2026-11-03", "AAA", "EQ", "", 10, 11, 9, 10.5, 10.5, 10, 1000000, 1, 1],
        ["2026-11-04", "AAA", "EQ", "", 10, 11, 9, 10.5, 10.5, 10, 1000000, 1, 1],      # the same values as the day before: a holiday copy
        ["2026-11-05", "AAA", "EQ", "", 10.5, 12, 10, 11, 11, 10.5, 2500000, 1, 1],
        ["2026-11-05", "AAA", "SM", "", 1, 1, 1, 1, 1, 1, 5, 1, 1],                       # not the main board
        ["2026-11-05", "BBB", "EQ", "", 5, 6, 4, 5, 5, 5, 0, 0, 0],                        # zero volume: a blank, not a quiet day
    ])
    got = bhav_volume.for_candles("AAA", ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"], [1, 1, 1, 1])
    assert got == [1000000, None, 2500000, None]
    assert bhav_volume.for_candles("BBB", ["2026-11-05"], [9]) == [None]
    monkeypatch.setenv("SECTOR_NSE_DIR", str(tmp_path / "nope"))
    assert bhav_volume.for_candles("AAA", ["2026-11-05"], [7]) == [7]                  # no bhavcopy on this machine: the candles' own volume stays
    bhav_volume._cache.update(sig=None, data=None)


def test_a_blank_volume_is_skipped_by_the_averages_not_counted_as_zero():
    n = 260
    c = [100 + i * 0.1 for i in range(n)]
    h, l = [x * 1.01 for x in c], [x * 0.99 for x in c]
    v = [1e6] * n
    for i in range(0, n, 3):
        v[i] = 0.0                      # blank days
    f = price_fields(h, l, c, v)
    assert abs(f["vol_ratio_10_50"] - 1.0) < 0.05 and abs(f["vol_ratio_5_50"] - 1.0) < 0.1
