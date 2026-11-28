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
from finlit.presets import listday
from finlit.presets.registry import REGISTRY_VERSION
from test_integration import store  # noqa: F401  (fixture)

pytestmark = pytest.mark.integration

D23, HOLIDAY, D25, D26 = date(2026, 11, 23), date(2026, 11, 24), date(2026, 11, 25), date(2026, 11, 26)
BUILD = datetime(2026, 11, 25, 20, 25, tzinfo=timezone.utc)      # 26 Nov 01:55 IST, the night build that dated every list 23 Nov
SYMS = [f"S{i:03d}" for i in range(120)]


async def _candles(conn, day: date, n: int) -> None:
    await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1,$2,10,11,9,10,1000,'NSE') "
                           "ON CONFLICT (symbol, day) DO NOTHING", [(s, day) for s in SYMS[:n]])


async def _lists_on(conn, day: date, fingerprint: bool = True) -> None:
    await conn.execute("INSERT INTO preset_results (preset_id, chips, registry, as_of, body) VALUES ('top-large', 'none', $1, $2, '{}'::jsonb) "
                       "ON CONFLICT (preset_id, chips, registry) DO UPDATE SET as_of = $2", REGISTRY_VERSION, day)
    await conn.execute("INSERT INTO preset_meta (key, value) VALUES ('last_run', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = $1::jsonb",
                       '{"asOf": "%s"}' % day.isoformat())
    if fingerprint:      # a build saves the fingerprint of its day's closes (28 Nov 2026); pass False for a build from before that
        await conn.execute("UPDATE preset_meta SET value = value || jsonb_build_object('closesSig', $1::text) WHERE key = 'last_run'",
                           await listday.closes_sig(conn, day))


@pytest.fixture
async def market(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles")
        await conn.execute("DELETE FROM preset_results")
        await conn.execute("DELETE FROM preset_meta WHERE key = 'last_run'")
        for d in (date(2026, 11, 19), date(2026, 11, 20), D23):
            await _candles(conn, d, 120)          # complete sessions
    yield store
    async with store.pool.acquire() as conn:      # the made-up companies' candles do not stay for the tests after (their newest session is 25 Nov)
        await conn.execute("DELETE FROM daily_candles WHERE symbol = ANY($1::text[])", SYMS)
        await conn.execute("DELETE FROM preset_results")
        await conn.execute("DELETE FROM preset_meta WHERE key = 'last_run'")


async def test_the_night_of_25_nov_replayed_lists_follow_the_candles_as_soon_as_they_catch_up(market):
    async with market.pool.acquire() as conn:
        await _candles(conn, D25, 40)                                  # 25 Nov partly loaded at the build: 40 of 120, under half of the busiest day
        assert await listday.newest_day(conn, D25) == D23              # 24 Nov is a holiday: the lists can only be dated 23 Nov
        await _lists_on(conn, D23)                                     # what the build at 01:55 IST stored
    assert await listday.has_work(market, BUILD) is False              # nothing newer yet: no rebuild loop

    async with market.pool.acquire() as conn:
        await _candles(conn, D25, 120)                                 # the morning: the candles catch up
    assert await listday.has_work(market, BUILD) is True               # before: nothing ran until the next night; now the probe starts the job

    async with market.pool.acquire() as conn:
        await _lists_on(conn, D25)                                     # the rebuild dates the lists 25 Nov
    assert await listday.has_work(market, BUILD) is False


async def test_no_lists_yet_and_candles_there_is_work(market):
    assert await listday.has_work(market, BUILD) is True


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


async def test_28_nov_the_official_close_replaces_the_first_one_and_the_lists_are_built_again(market):
    """Task #394 re-check (28 Nov 2026): the list day's first closes (Hikal 230.86) were replaced by the exchange's official ones (231.85) after the
    build; the lists kept the first, so the list and its figures disagreed with the chart. A build saves the day's fingerprint (closesSig)."""
    async with market.pool.acquire() as conn:
        await _candles(conn, D25, 120)
        sig = await listday.closes_sig(conn, D25)
        await _lists_on(conn, D25)
        await conn.execute("UPDATE preset_meta SET value = value || jsonb_build_object('coverage', 120, 'closesSig', $1::text) WHERE key = 'last_run'", sig)
    assert await listday.has_work(market, BUILD) is False              # built on these closes: nothing to do

    async with market.pool.acquire() as conn:
        await conn.execute("UPDATE daily_candles SET close = 10.42, volume = 1200 WHERE symbol = 'S007' AND day = $1", D25)   # the official close lands
    assert await listday.has_work(market, BUILD) is True               # before: the lists kept the first close until the next session

    async with market.pool.acquire() as conn:
        new = await listday.closes_sig(conn, D25)
        assert new != sig
        await conn.execute("UPDATE preset_meta SET value = value || jsonb_build_object('closesSig', $1::text) WHERE key = 'last_run'", new)
    assert await listday.has_work(market, BUILD) is False              # rebuilt on the official closes: no loop


async def test_a_build_from_before_fingerprints_is_built_once_more_then_never_loops(market):
    async with market.pool.acquire() as conn:
        await _candles(conn, D25, 120)
        await _lists_on(conn, D25, fingerprint=False)
        await conn.execute("UPDATE preset_meta SET value = value || '{\"coverage\": 120}'::jsonb WHERE key = 'last_run'")
        await conn.execute("UPDATE daily_candles SET close = 10.42 WHERE symbol = 'S007' AND day = $1", D25)
    assert await listday.has_work(market, BUILD) is True               # a build from before fingerprints: built once more, on the closes as they are now
    async with market.pool.acquire() as conn:
        sig = await listday.closes_sig(conn, D25)
        await conn.execute("UPDATE preset_meta SET value = value || jsonb_build_object('closesSig', $1::text) WHERE key = 'last_run'", sig)
    assert await listday.has_work(market, BUILD) is False              # that build saved its fingerprint: no loop
    async with market.pool.acquire() as conn:
        await conn.execute("UPDATE preset_meta SET value = value || '{\"closesSig\": null}'::jsonb WHERE key = 'last_run'")
    assert await listday.has_work(market, BUILD) is False              # a build that could not read the candles (null) does not loop either


async def test_load_carries_the_fingerprint_the_build_saves(market):
    async with market.pool.acquire() as conn:
        await _candles(conn, D25, 120)
        sig = await listday.closes_sig(conn, D25)
    m = await listday.load(market, SYMS, D25)
    assert m.day == D25 and m.sig == sig
