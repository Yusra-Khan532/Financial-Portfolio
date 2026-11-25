"""Daily prices kept small (docs/STORAGE.md): price_daily holds the last PRICE_DAYS days, is written only where a row is new or changed, keeps its
older days compressed (TimescaleDB), and the nightly prune drops whole old chunks; daily_candles keeps CANDLE_DAYS days."""
from datetime import date, timedelta

import asyncpg
import pytest

from finlit import store as store_mod
from test_integration import ingested, make_settings, store  # noqa: F401  (fixtures)


def series(days: int, end: date, bump: float = 0.0) -> dict:
    ds = [end - timedelta(days=k) for k in range(days - 1, -1, -1)]
    return {"t": [d.isoformat() for d in ds], "o": [100 + bump] * days, "h": [101 + bump] * days, "l": [99 + bump] * days,
            "c": [100.5 + bump] * days, "v": [1000] * days}


async def write(st, sym, daily) -> int:
    async with st.pool.acquire() as conn, conn.transaction():
        return await st._upsert_prices(conn, sym, daily)


async def rows(st, sym):
    async with st.pool.acquire() as conn:
        return {r["day"]: r for r in await conn.fetch("SELECT day, close FROM price_daily WHERE symbol = $1", sym)}


@pytest.mark.integration
async def test_only_the_kept_window_is_written(store):  # noqa: F811
    today = date.today()
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM price_daily WHERE symbol = 'PXA'")
    await write(store, "PXA", series(2200, today))                       # six years from the provider
    got = await rows(store, "PXA")
    assert min(got) >= today - timedelta(days=store_mod.PRICE_DAYS) and len(got) == store_mod.PRICE_DAYS + 1


@pytest.mark.integration
async def test_an_unchanged_save_rewrites_nothing_and_a_changed_past_price_is_written(store):  # noqa: F811
    today = date.today()
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM price_daily WHERE symbol = 'PXB'")
    assert await write(store, "PXB", series(400, today)) == 400           # first save: every day is new
    assert await write(store, "PXB", series(400, today)) == 0             # the same series again: no row written
    split = series(400, today)
    old = (today - timedelta(days=300)).isoformat()
    split["c"][split["t"].index(old)] = 50.25                              # a split or bonus changes a past close
    assert await write(store, "PXB", split) == 1                           # only that row is written
    assert float((await rows(store, "PXB"))[date.fromisoformat(old)]["close"]) == 50.25


@pytest.mark.integration
async def test_a_day_the_provider_no_longer_reports_goes(store):  # noqa: F811
    today = date.today()
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM price_daily WHERE symbol = 'PXC'")
    await write(store, "PXC", series(30, today))
    s = series(30, today)
    gone = s["t"].pop(10); [s[k].pop(10) for k in "ohlcv"]
    await write(store, "PXC", s)
    assert date.fromisoformat(gone) not in await rows(store, "PXC") and len(await rows(store, "PXC")) == 29


@pytest.mark.integration
async def test_older_days_are_kept_compressed_with_timescaledb(store):  # noqa: F811
    if not store.timescale:
        pytest.skip("TimescaleDB is not installed here; on the server it is (timescale/timescaledb image)")
    async with store.pool.acquire() as conn:
        h = await conn.fetchrow("SELECT compression_enabled FROM timescaledb_information.hypertables WHERE hypertable_name = 'price_daily'")
        assert h and h["compression_enabled"] is True
        job = await conn.fetchrow("SELECT config FROM timescaledb_information.jobs WHERE hypertable_name = 'price_daily' AND proc_name = 'policy_compression'")
        assert job and f"{store_mod.COMPRESS_AFTER} days" in str(job["config"])
        seg = await conn.fetch("SELECT attname, segmentby_column_index, orderby_column_index, orderby_asc FROM timescaledb_information.compression_settings "
                               "WHERE hypertable_name = 'price_daily'")
        by = {r["attname"]: r for r in seg}
        assert by["symbol"]["segmentby_column_index"] == 1 and by["day"]["orderby_column_index"] == 1 and by["day"]["orderby_asc"] is False
    # a compressed chunk is still read and written as before
    today = date.today()
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM price_daily WHERE symbol = 'PXD'")
    await write(store, "PXD", series(120, today))
    async with store.pool.acquire() as conn:
        for c in await conn.fetch("SELECT format('%I.%I', chunk_schema, chunk_name) AS c FROM timescaledb_information.chunks "
                                  "WHERE hypertable_name = 'price_daily' AND range_end < now() - interval '40 days' AND NOT is_compressed"):
            try:
                await conn.execute("SELECT compress_chunk($1::regclass, if_not_compressed => TRUE)", c["c"])
            except asyncpg.exceptions.DuplicateObjectError:   # a chunk an earlier run left partly compressed: already in the state wanted
                pass
        assert await conn.fetchval("SELECT count(*) FROM timescaledb_information.chunks WHERE hypertable_name = 'price_daily' AND is_compressed") > 0
    assert len(await rows(store, "PXD")) == 120
    before = await rows(store, "PXD")
    assert await write(store, "PXD", series(120, today)) == 0             # unchanged: nothing written, compressed days left alone
    assert len(await rows(store, "PXD")) == 120
    s = series(120, today); s["c"][5] = 77.0                              # a change inside a compressed chunk still lands
    assert await write(store, "PXD", s) == 1
    after = await rows(store, "PXD")
    assert float(after[date.fromisoformat(s["t"][5])]["close"]) == 77.0 and len(after) == len(before)


@pytest.mark.integration
async def test_the_prune_drops_old_prices_and_old_candles(store):  # noqa: F811
    today = date.today()
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles WHERE symbol = 'PXE'")
        await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ('PXE', $1, 1, 1, 1, 1, 1, 'NSE')",
                               [(today - timedelta(days=k),) for k in (5, store_mod.CANDLE_DAYS - 5, store_mod.CANDLE_DAYS + 5, 1500)])
        await conn.execute("INSERT INTO price_daily (symbol, day, open, high, low, close, volume) VALUES ('PXE', $1, 1, 1, 1, 1, 1)",
                           today - timedelta(days=store_mod.PRICE_DAYS + 200))
        await conn.execute("INSERT INTO price_daily (symbol, day, open, high, low, close, volume) VALUES ('PXE', $1, 1, 1, 1, 1, 1)", today - timedelta(days=3))
    out = await store.prune(keep_top=100000)
    async with store.pool.acquire() as conn:
        left = sorted((today - r["day"]).days for r in await conn.fetch("SELECT day FROM daily_candles WHERE symbol = 'PXE'"))
        assert left == [5, store_mod.CANDLE_DAYS - 5]
        p = sorted((today - r["day"]).days for r in await conn.fetch("SELECT day FROM price_daily WHERE symbol = 'PXE'"))
        assert p == [3]
    assert out["candle_days"] == 2 and "price_days" in out
