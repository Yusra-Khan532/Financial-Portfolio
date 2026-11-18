"""The nightly prune in small batches (16 to 18 Nov 2026: one DELETE of every dropped company's reports hit the pool's 10-second statement limit,
rolled back, and failed 15 nights in a row). Real Postgres and Redis (TEST_DATABASE_URL / TEST_REDIS_URL)."""

import inspect
import re
from datetime import date, timedelta

import pytest

from finlit.store import Store
from test_integration import store  # noqa: F401

pg = pytest.mark.integration


async def _fill(st, n: int, old_days: int = 0):
    """n companies with stored reports and recent prices, none of them in the ranked symbol list (so all of them are pruned), plus `old_days` old prices."""
    today = date.today()
    async with st.pool.acquire() as conn:
        await conn.executemany("INSERT INTO snapshots (symbol, statement, section, body, etag, generated_at) VALUES ($1, 'consolidated', $2, $3, 'e', now()) "
                               "ON CONFLICT DO NOTHING", [(f"ZZP{i:03d}", sec, "{}" * 50) for i in range(n) for sec in ("summary", "ratios")])
        await conn.executemany("INSERT INTO price_daily (symbol, day, close) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING",
                               [(f"ZZP{i:03d}", today - timedelta(days=1), ) for i in range(n)])
        await conn.executemany("INSERT INTO price_daily (symbol, day, close) VALUES ('ZZOLD', $1, 1) ON CONFLICT DO NOTHING",
                               [(today - timedelta(days=600 + k),) for k in range(old_days)])


async def _count(st, sql: str) -> int:
    async with st.pool.acquire() as conn:
        return int(await conn.fetchval(sql))


@pg
async def test_prune_goes_in_batches_and_a_stopped_run_keeps_what_it_removed(store, monkeypatch):  # noqa: F811
    await _fill(store, 60, old_days=45)
    monkeypatch.setattr(Store, "PRUNE_CHUNK", 10)
    monkeypatch.setattr(Store, "PRUNE_ROWS", 7)
    out = await store.prune(keep_top=0, keep_viewed_days=0, budget_s=0)          # no time at all: nothing is started, and it says what is left
    assert out["companies"] == 0 and out["left"] >= 60
    assert await _count(store, "SELECT count(*) FROM snapshots WHERE symbol LIKE 'ZZP%'") == 120
    out = await store.prune(keep_top=0, keep_viewed_days=0)                       # the next night: everything goes, 10 companies and 7 rows at a time
    assert "left" not in out and out["companies"] >= 60 and out["snapshots"] >= 120
    assert await _count(store, "SELECT count(*) FROM snapshots WHERE symbol LIKE 'ZZP%'") == 0
    assert await _count(store, "SELECT count(*) FROM price_daily WHERE symbol LIKE 'ZZP%'") == 0
    assert out["price_days"] >= 45 and await _count(store, "SELECT count(*) FROM price_daily WHERE symbol = 'ZZOLD'") == 0


def test_every_prune_statement_has_its_own_longer_limit_than_the_pools_ten_seconds():
    src = inspect.getsource(Store.prune)
    executes = re.findall(r"conn\.(?:execute|fetch)\((?:[^()]|\([^()]*\))*\)", src, re.S)
    assert executes and all("timeout=T" in e for e in executes), [e for e in executes if "timeout=T" not in e]
    assert Store.PRUNE_STMT_S >= 60 and Store.PRUNE_BUDGET_S < 30 * 60        # the job's own limit is 30 minutes
    assert "prune_mf_score_history(conn, timeout=T)" in src
