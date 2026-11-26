"""26 Nov 2026: the ready-made screens read "Updated after the 23 Nov close" on 26 Nov (Prism 26 Nov, technical views to 25 Nov).

Why: the lists are dated by the newest complete session in the exchange candles (task #394). The exchange's candles for a day often arrive after the
lists' nightly build: the build at 01:55 IST on 26 Nov found 25 Nov's candles missing or too few (under half of the busiest day), so 25 Nov did not
count as a session; 24 Nov was a holiday; every list was dated 23 Nov. The candles caught up later, but the job ran once a night, so the lists stayed a
session behind for a whole day, and nothing said so: the job was "ok", the self-check passed 7 of 7, and no freshness line watched the lists.

The fix: the presets job has a probe that is True whenever the candles hold a complete session newer than the lists, so the lists are rebuilt as soon as
the candles catch up; the self-check's C8 and a "Ready-made screens" freshness line say when the lists are behind."""
from datetime import date, datetime, timezone

import pytest

from finlit.jobs import freshness, probes
from finlit.jobs.registry import by_name
from finlit.presets import listday, service
from finlit.presets.registry import REGISTRY_VERSION
from test_integration import store  # noqa: F401  (fixture)

pytestmark = pytest.mark.integration

D23, HOLIDAY, D25, D26 = date(2026, 11, 23), date(2026, 11, 24), date(2026, 11, 25), date(2026, 11, 26)
BUILD = datetime(2026, 11, 25, 20, 25, tzinfo=timezone.utc)      # 26 Nov 01:55 IST, the night build that dated every list 23 Nov
SYMS = [f"S{i:03d}" for i in range(120)]


async def _candles(conn, day: date, n: int) -> None:
    await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1,$2,10,11,9,10,1000,'NSE') "
                           "ON CONFLICT (symbol, day) DO NOTHING", [(s, day) for s in SYMS[:n]])


async def _lists_on(conn, day: date) -> None:
    await conn.execute("INSERT INTO preset_results (preset_id, chips, registry, as_of, body) VALUES ('top-large', 'none', $1, $2, '{}'::jsonb) "
                       "ON CONFLICT (preset_id, chips, registry) DO UPDATE SET as_of = $2", REGISTRY_VERSION, day)


@pytest.fixture
async def market(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles")
        await conn.execute("DELETE FROM preset_results")
        for d in (date(2026, 11, 19), date(2026, 11, 20), D23):
            await _candles(conn, d, 120)          # complete sessions
    return store


async def test_the_night_of_25_nov_replayed_lists_follow_the_candles_as_soon_as_they_catch_up(market):
    async with market.pool.acquire() as conn:
        await _candles(conn, D25, 40)                                  # 25 Nov partly loaded at the build: 40 of 120, under half of the busiest day
        assert await listday.newest_day(conn, D25) == D23              # 24 Nov is a holiday: the lists can only be dated 23 Nov
        await _lists_on(conn, D23)                                     # what the build at 01:55 IST stored
    assert await service.has_work(market, BUILD) is False              # nothing newer yet: no rebuild loop

    async with market.pool.acquire() as conn:
        await _candles(conn, D25, 120)                                 # the morning: the candles catch up
    assert await service.has_work(market, BUILD) is True               # before: nothing ran until the next night; now the probe starts the job

    async with market.pool.acquire() as conn:
        await _lists_on(conn, D25)                                     # the rebuild dates the lists 25 Nov
    assert await service.has_work(market, BUILD) is False


async def test_no_lists_yet_and_candles_there_is_work(market):
    assert await service.has_work(market, BUILD) is True


def test_the_presets_job_has_the_probe_and_the_probe_is_registered(store):  # noqa: F811
    job = by_name()["presets"]
    assert job.probe == "presets" and job.min_gap_min >= 30
    assert "presets" in probes.build(store)


def test_a_freshness_line_says_when_the_lists_are_behind():
    now = datetime(2026, 11, 26, 14, 30, tzinfo=timezone.utc)        # 26 Nov 20:00 IST, the founder's screenshot
    out = freshness.evaluate_facts({"lists_day": D23, "found_target": D25}, now)
    line = next(d for d in out["datasets"] if d["key"] == "ready_lists")
    assert line["label"] == "Ready-made screens" and line["status"] == "stale" and line["actual"] == "2026-11-23"
    fresh = freshness.evaluate_facts({"lists_day": D25, "found_target": D25}, now)
    assert next(d for d in fresh["datasets"] if d["key"] == "ready_lists")["status"] == "fresh"
