"""The owner's written exception (21 Nov 2026): "Saturday night till Sunday morning the sector job is given priority; other jobs can be stopped at that
time." That night its build had 3 of 4 parts done when its 90-minute slice ended at 00:31 IST; it then went to the back of the queue (a resumable job
continuing goes last) and `score` took the long-job lane for the rest of the night. Inside its hours (Job.first_in) it now goes first, every other
bulk or audit job waits, one already running is paused (not a failure; it continues afterwards), and light jobs keep running."""
from datetime import timedelta

import pytest

from finlit.jobs.due import JobState
from finlit.jobs.registry import WEEKEND_NIGHTS, Job, build_jobs
from finlit.jobs.state import MemoryState
from finlit.jobs.supervisor import Supervisor
from jobs_fakes import FakeClock, FakePause, FakeResources, FakeRunner, FakeSignals, config, ist

pytestmark = pytest.mark.asyncio
SAT_NIGHT = ist(2026, 11, 21, 23, 5)        # Saturday 23:05 IST
SUN_0035 = ist(2026, 11, 22, 0, 35)         # Sunday 00:35 IST: tonight, just after the sector job's 90-minute slice ended
FRIDAY = ist(2026, 11, 20, 23, 5)


def make(jobs, now):
    clock = FakeClock(now)
    sup = Supervisor(jobs=jobs, state=MemoryState(), runner=FakeRunner(clock), resources=FakeResources(2000), signals=FakeSignals(), pause=FakePause(),
                     clock=clock, config=config(), env={})
    return sup, clock


def sectors():
    return Job("sectors", ("refresh-sectors",), cls="bulk", priority=95, max_runtime_min=90, weight_mb=450, resumable=True,
               time_rule=WEEKEND_NIGHTS, first_in=WEEKEND_NIGHTS)


def score():
    return Job("score", ("score-all",), cls="bulk", priority=30, max_runtime_min=90, weight_mb=300, resumable=True)


def coverage():
    return Job("coverage", ("audit-coverage",), cls="audit", priority=60, max_runtime_min=22, weight_mb=100)


def alerts():
    return Job("alerts", ("check-alerts",), cls="light", priority=5, max_runtime_min=10, weight_mb=60)


async def test_after_its_slice_ends_the_sector_job_continues_first_not_behind_score():
    sup, _ = make([sectors(), score(), coverage(), alerts()], SUN_0035)
    await sup.state.save(JobState(job="sectors", first_seen_at=SUN_0035 - timedelta(days=9), last_status="timeout",
                                  last_attempt_at=SUN_0035 - timedelta(minutes=94), retry_at=SUN_0035 - timedelta(minutes=2)))
    await sup.step()
    assert "sectors" in sup.runner.started and "score" not in sup.runner.started and "coverage" not in sup.runner.started
    assert "alerts" in sup.runner.started                                         # light jobs keep running beside it
    st = await sup.state.load_all()
    assert "has this time to itself" in st["score"].state_reason and "has this time to itself" in st["coverage"].state_reason


async def test_a_long_job_already_running_is_paused_not_failed_and_continues_after():
    sup, clock = make([score(), sectors()], SAT_NIGHT - timedelta(minutes=40))     # 22:25: before the sector hours, score starts
    await sup.step()
    assert sup.runner.started == ["score"]
    clock.advance(minutes=40)                                                      # 23:05: the sector hours begin
    sup.runner.of("score").touch()                                                 # score is busy (output), not hung
    await sup.step()
    assert sup.runner.of("score").terminated
    await sup.step()
    clock.advance(seconds=5)
    await sup.step()
    st = await sup.state.load_all()
    assert st["score"].last_status == "killed" and st["score"].consecutive_failures == 0        # a pause, never a failure
    assert "sectors job" in st["score"].state_reason                              # paused, then waiting for the sector build to finish
    assert sup.runner.started[-1] == "sectors"
    sup.runner.of("sectors").finish(0)                                             # the build is done: everything else runs again
    clock.advance(minutes=3)
    await sup.step()
    assert sup.runner.started[-1] == "score"


async def test_on_a_weekday_nothing_changes():
    sup, _ = make([sectors(), score()], FRIDAY)
    await sup.step()
    assert sup.runner.started == ["score"] and not sup.runner.of("score").terminated


async def test_only_the_sector_job_has_this_rule():
    jobs = {j.name: j for j in build_jobs({})}
    assert jobs["sectors"].first_in is WEEKEND_NIGHTS
    assert [n for n, j in jobs.items() if j.first_in is not None] == ["sectors"]


async def test_left_over_build_folders_are_cleaned_when_a_build_is_published(tmp_path):
    """21 Nov 2026: the server still held build folders of 6 Nov, among them two `.discard-` folders that nothing ever removed."""
    import os
    import time
    from finlit import sector_data as sd
    rel = tmp_path / "releases"
    old = time.time() - 40 * 3600
    for name in (".discard-0d2d", ".discard-0d2d.work", ".building-resume-137fc66ede4d77e8", ".building-resume-137fc66ede4d77e8.work", ".building-resume-fresh"):
        (rel / name).mkdir(parents=True)
        if name != ".building-resume-fresh":
            os.utime(rel / name, (old, old))
    sd.prune(tmp_path, 2)
    assert sorted(p.name for p in rel.iterdir()) == [".building-resume-fresh"]          # tonight's unfinished build is kept for its next run
