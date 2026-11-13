"""Deploys wait for long jobs (deploy_gate.py): the pure decision, the Redis flag, and the supervisor holding new long jobs while a deploy waits."""
import json

import pytest

from finlit.jobs import deploy_gate as dg
from finlit.jobs.signals import BEAT_KEY
from test_jobs_supervisor import NOON, audit, bulk, light, make

T0 = 1_800_000_000.0


class FakeRedis:
    def __init__(self, data=None, broken=False):
        self.data, self.broken, self.ttl = dict(data or {}), broken, {}

    async def get(self, key):
        if self.broken:
            raise ConnectionError("redis down")
        return self.data.get(key)

    async def set(self, key, value, ex=None):
        if self.broken:
            raise ConnectionError("redis down")
        self.data[key], self.ttl[key] = value, ex
        return True

    async def delete(self, key):
        if self.broken:
            raise ConnectionError("redis down")
        self.data.pop(key, None)


class FakeStore:
    def __init__(self, redis):
        self.redis = redis


# ---- the pure decision -------------------------------------------------------------------------------------------------------------

def test_no_long_job_means_go():
    d = dg.decide([], None, "abc", T0, 150)
    assert d.go and d.hold is None and "no long job" in d.reason


def test_a_running_long_job_holds_the_deploy_and_names_it():
    d = dg.decide(["ingest"], None, "abc", T0, 150)
    assert not d.go
    assert d.hold == {"sha": "abc", "since": T0, "waitingFor": ["ingest"], "maxMinutes": 150}
    assert "waiting for ingest" in d.reason and "held 0 of 150 min" in d.reason


def test_the_wait_keeps_its_start_time_across_checks():
    first = dg.decide(["ingest"], None, "abc", T0, 150)
    later = dg.decide(["ingest"], first.hold, "def", T0 + 40 * 60, 150)
    assert not later.go and later.hold["since"] == T0 and later.hold["sha"] == "def" and "held 40 of 150" in later.reason


def test_a_deploy_never_waits_longer_than_the_cap():
    d = dg.decide(["ingest"], {"since": T0}, "abc", T0 + 150 * 60, 150)
    assert d.go and d.hold is None and "resumes where it left off" in d.reason


def test_a_dead_supervisor_never_holds_a_deploy():
    d = dg.decide(["ingest"], None, "abc", T0, 150, supervisor_alive=False)
    assert d.go and d.hold is None


def test_the_cap_has_a_floor_and_survives_bad_values():
    assert dg.hold_max_min({}) == 150
    assert dg.hold_max_min({"DEPLOY_HOLD_MAX_MIN": "5"}) == 30
    assert dg.hold_max_min({"DEPLOY_HOLD_MAX_MIN": "200"}) == 200
    assert dg.hold_max_min({"DEPLOY_HOLD_MAX_MIN": "soon"}) == 150


def test_hold_reason_wording():
    assert dg.hold_reason(None, T0) is None
    r = dg.hold_reason({"since": T0, "waitingFor": ["ingest"], "maxMinutes": 150}, T0 + 12 * 60)
    assert r.startswith("waiting for a deploy") and "ingest" in r and "held 12 min, at most 150" in r


# ---- check(): the heartbeat in, the flag out ---------------------------------------------------------------------------------------

def beat(running, at=T0):
    return {BEAT_KEY: json.dumps({"at": at, "running": running})}


@pytest.mark.asyncio
async def test_check_writes_a_flag_that_expires_by_itself_while_a_bulk_job_runs():
    r = FakeRedis(beat(["ingest"]))
    d = await dg.check(FakeStore(r), "abc", env={}, now=T0 + 5)
    assert not d.go and json.loads(r.data[dg.HOLD_KEY])["waitingFor"] == ["ingest"]
    assert r.ttl[dg.HOLD_KEY] == dg.HOLD_TTL_S


@pytest.mark.asyncio
async def test_check_ignores_light_jobs_and_removes_the_flag():
    r = FakeRedis({**beat(["results_light"]), dg.HOLD_KEY: json.dumps({"since": T0})})
    d = await dg.check(FakeStore(r), "abc", env={}, now=T0 + 5)
    assert d.go and dg.HOLD_KEY not in r.data


@pytest.mark.asyncio
async def test_check_goes_when_the_heartbeat_is_stale():
    r = FakeRedis(beat(["ingest"], at=T0 - 3600))
    d = await dg.check(FakeStore(r), "abc", env={}, now=T0)
    assert d.go and dg.HOLD_KEY not in r.data


@pytest.mark.asyncio
async def test_check_and_release_never_fail_without_redis():
    r = FakeRedis(broken=True)
    d = await dg.check(FakeStore(r), "abc", env={}, now=T0)
    assert d.go                                                          # no heartbeat to read: nothing is held
    await dg.release(FakeStore(r))
    assert await dg.read_hold(r) is None


@pytest.mark.asyncio
async def test_release_removes_the_flag():
    r = FakeRedis({dg.HOLD_KEY: json.dumps({"since": T0})})
    await dg.release(FakeStore(r))
    assert dg.HOLD_KEY not in r.data


# ---- the supervisor while a deploy waits -------------------------------------------------------------------------------------------

def held_at(now):
    return FakeRedis({dg.HOLD_KEY: json.dumps({"since": now.timestamp() - 600, "waitingFor": ["ingest"], "maxMinutes": 150})})


@pytest.mark.asyncio
async def test_no_new_long_job_starts_while_a_deploy_waits_but_light_jobs_run():
    sup, _ = make([bulk("score", 10), audit("check", 60), light("quotes", 5)])
    sup.signals.redis = held_at(NOON)
    await sup.step()
    assert sup.runner.started == ["quotes"]
    st = await sup.state.load_all()
    for name in ("score", "check"):
        assert st[name].state == "waiting" and st[name].state_reason.startswith("waiting for a deploy")
        assert "ingest" in st[name].state_reason


@pytest.mark.asyncio
async def test_long_jobs_start_as_soon_as_the_flag_is_gone():
    sup, clock = make([bulk("score", 10)])
    sup.signals.redis = held_at(NOON)
    await sup.step()
    assert sup.runner.started == []
    sup.signals.redis.data.clear()                                       # released after the deploy (or expired)
    clock.advance(seconds=61)
    await sup.step()
    assert sup.runner.started == ["score"]


@pytest.mark.asyncio
@pytest.mark.parametrize("redis", [None, FakeRedis(broken=True), FakeRedis({dg.HOLD_KEY: "not json"})])
async def test_a_missing_or_broken_flag_never_holds_a_job(redis):
    sup, _ = make([bulk("score", 10)])
    if redis is not None:
        sup.signals.redis = redis
    await sup.step()
    assert sup.runner.started == ["score"]


@pytest.mark.asyncio
async def test_a_running_long_job_is_never_touched_by_the_hold():
    sup, clock = make([bulk("ingest", 10, max_runtime_min=90)])
    await sup.step()
    assert sup.runner.started == ["ingest"]
    sup.signals.redis = held_at(clock.now())
    clock.advance(minutes=30)
    await sup.step()
    assert "ingest" in sup.running                                       # still running: the hold only stops new starts
