"""The registry is data: check it is coherent, that every command the old bash scheduler ran is still scheduled at an equal or better time, and that the env switches mean what they did."""
from datetime import timedelta
from pathlib import Path

from finlit.jobs.due import Ctx, JobState, evaluate
from finlit.jobs.registry import JobsConfig, build_jobs, by_name, disabled_reason
from jobs_fakes import ist

ENV = {"FUND_LOADS_ENABLED": "1", "DHAN_CLIENT_ID": "x"}
JOBS = by_name(ENV)
OLD = [l.strip() for l in (Path(__file__).parent / "fixtures/old_scheduler_commands.txt").read_text().splitlines() if l.strip() and not l.startswith("#")]


def test_score_all_stops_by_itself_before_the_supervisor_limit():
    j = JOBS["score"]
    i = j.args.index("--max-minutes")
    assert float(j.args[i + 1]) <= j.max_runtime_min - 15        # its own budget ends well before the watchdog (both were 90: every run was killed as a timeout)


def test_names_are_unique_priorities_sane_and_prerequisites_exist():
    jobs = build_jobs(ENV)
    names = [j.name for j in jobs]
    assert len(names) == len(set(names))
    for j in jobs:
        assert j.cls in ("bulk", "light", "audit", "ondemand") and j.max_runtime_min > 0 and j.weight_mb > 0
        for p in j.prerequisites:
            assert p in names, (j.name, p)
        if j.sla.kind != "none":
            assert j.sla.hours > 0
        for w in j.windows:
            assert w.window in ("MORNING", "AFTER_CLOSE", "NIGHT")
        if not j.external and j.cls != "ondemand":
            assert j.windows or j.interval_min or j.daily_at or j.probe or j.sla.kind != "none", f"{j.name} has no schedule"
    # no prerequisite cycles
    for j in jobs:
        seen, todo = set(), list(j.prerequisites)
        while todo:
            p = todo.pop()
            assert p != j.name
            if p not in seen:
                seen.add(p)
                todo += list(JOBS[p].prerequisites)


def test_every_command_the_old_scheduler_ran_is_registered():
    registered = [" ".join(j.args) for j in JOBS.values()]
    for cmd in OLD:
        assert any(r == cmd or r.startswith(cmd + " ") or cmd.startswith(r + " ") or (cmd.split()[0] == r.split()[0] and all(t in r.split() for t in cmd.split()[1:])) for r in registered), cmd


def test_the_always_on_processes_are_visible_but_not_scheduled():
    assert JOBS["drain-queue"].external and JOBS["commodities"].external and JOBS["drain-queue"].cls == "ondemand"
    assert JOBS["drain-queue"].honours_pause is False


def test_bulk_and_light_classes_match_the_incident_analysis():
    for n in ("technicals", "ingest", "score", "prism", "score-mf", "portfolios", "backfill-history", "leadership"):
        assert JOBS[n].cls == "bulk", n          # the three that ran at once on 2 GB are now strictly sequential
    for n in ("results", "results-light", "calendars", "quotes", "listing"):
        assert JOBS[n].cls == "light" and JOBS[n].honours_pause is False, n
    # task #281: the fund score follows the night's NAVs, fund facts and portfolios (it used to follow the portfolios only, and ran before all three)
    assert JOBS["score-mf"].prerequisites == ("mf", "facts", "portfolios") and JOBS["score-mf"].nightly_inputs and "ingest" in JOBS["prism"].prerequisites
    assert JOBS["results"].sla.hours == 1.5 and JOBS["calendars"].sla.hours == 1.0 and JOBS["listing"].sla.hours == 6
    for n in ("ingest", "score", "prism", "mf", "portfolios"):
        assert JOBS[n].sla.hours == 26, n


def test_env_switches_keep_their_meaning():
    for n in ("mf", "etf", "facts", "industry", "instruments", "portfolios", "score-mf", "backfill-mf"):
        for env in ({}, {"FUND_LOADS_ENABLED": "0"}, ENV):
            assert disabled_reason(JOBS[n], env) is None, (n, env)          # no environment value switches a scheduled job off
    for env in ({"PRISM_PRECOMPUTE_ENABLED": "0"}, {}):
        assert disabled_reason(JOBS["prism"], env) is None
    assert disabled_reason(JOBS["dhan-check"], {}) and disabled_reason(JOBS["dhan-check"], ENV) is None
    cfg = JobsConfig.from_env({"BOOT_LOAD_ENABLED": "0", "BULK_CONCURRENCY": "2", "QUOTES_EVERY_MINUTES": "3", "BOOT_LOAD_DELAY_S": "10"})
    assert not cfg.boot_load_enabled and cfg.bulk_concurrency == 2 and cfg.quotes_every_min == 3 and cfg.boot_delay_s == 10
    assert JobsConfig.from_env({}).bulk_concurrency == 1 and JobsConfig.from_env({"BULK_CONCURRENCY": "junk"}).bulk_concurrency == 1
    assert by_name({"INGEST_LIMIT": "500"})["ingest"].args[-4:-2] == ("--limit", "500") or "500" in by_name({"INGEST_LIMIT": "500"})["ingest"].args
    assert "--limit" not in by_name({"INGEST_LIMIT": "0"})["ingest"].args


# ------------------------------------------------------------------------------------------------ schedule parity with the old slots
FRI, SAT, SUN = (2026, 10, 30), (2026, 10, 31), (2026, 11, 1)


def runs_near(name, day, hm, age_h, probe=None, back=150, fwd=10):
    """True when the job is due (for a schedule reason, not because the SLA is blown) at some moment from `back` minutes before the old slot to `fwd` after."""
    slot = ist(*day, *hm)
    j = JOBS[name]
    for off in range(-back, fwd + 1, 5):
        t = slot + timedelta(minutes=off)
        st = JobState(job=name, first_seen_at=t - timedelta(days=60), last_success_at=t - timedelta(hours=age_h), last_attempt_at=t - timedelta(hours=age_h))
        probes = {j.probe: probe} if j.probe else {}
        v = evaluate(j, st, Ctx(now=t, env=ENV, probes=probes))
        if v.due and "SLA" not in v.reason and "never" not in v.reason:
            return True
    return False


def test_every_old_time_slot_is_covered_by_the_same_job_at_or_before_that_time():
    old_slots = [
        # (job, day, IST time, how old the last success is at that moment)
        ("results", FRI, (10, 20), 0.5), ("results", FRI, (10, 50), 0.5), ("results", FRI, (23, 30), 2), ("results", SAT, (6, 45), 8), ("results", FRI, (15, 50), 1),
        ("results-light", FRI, (10, 35), 1.0), ("results-light", FRI, (21, 10), 1.0),
        ("calendars", FRI, (10, 5), 1.0), ("calendars", SAT, (6, 45), 12), ("calendars", FRI, (23, 30), 2),
        ("listing", FRI, (15, 50), 5), ("listing", FRI, (19, 10), 3), ("listing", SAT, (19, 10), 3),
        ("technicals", FRI, (18, 30), 24, True), ("technicals", FRI, (21, 10), 3, True), ("technicals", SAT, (6, 45), 12, True),
        ("flows-nse", FRI, (19, 10), 24), ("flows", FRI, (19, 10), 24), ("flows", FRI, (21, 10), 2), ("macro", FRI, (19, 10), 24), ("industry", FRI, (19, 10), 24),
        ("mf", FRI, (21, 10), 24), ("mf", FRI, (23, 30), 2.5), ("facts", FRI, (21, 10), 24), ("etf", FRI, (21, 10), 24), ("etf", FRI, (23, 30), 2.5),
        ("instruments", SAT, (6, 45), 24), ("screens", FRI, (6, 45), 24),
        ("alerts-daily", FRI, (19, 10), 24), ("digest", SUN, (19, 10), 24 * 7),
        ("prune", SAT, (1, 0), 24), ("ingest", SAT, (1, 0), 24), ("score", SAT, (1, 0), 24), ("indices", SAT, (1, 0), 24), ("coverage", SAT, (1, 0), 24),
        ("integrity", SAT, (1, 0), 24), ("backfill-mf", SAT, (1, 0), 24), ("backfill-history", SAT, (1, 0), 24), ("prism", SAT, (1, 0), 24, False),
        ("portfolios", SAT, (1, 0), 24), ("score-mf", SAT, (1, 0), 24), ("logos", SAT, (1, 0), 24),
        ("leadership", SAT, (1, 0), 24 * 7), ("universe", SUN, (1, 0), 24 * 7), ("backtest-leadership", (2027, 1, 3), (1, 0), 24 * 100),
        ("rebuild-metrics", SAT, (1, 0), 24 * 7), ("short-history", SAT, (1, 0), 24 * 7), ("history-probe", SAT, (1, 0), 24 * 7), ("dhan-check", SAT, (1, 0), 24 * 7),
    ]
    missing = [s[:3] for s in old_slots if not runs_near(s[0], s[1], s[2], s[3], probe=(s[4] if len(s) > 4 else None))]
    assert not missing, missing


def test_the_new_morning_window_runs_the_whole_catch_up_chain_when_the_night_failed():
    day = (2026, 10, 31)
    need = ["ingest", "score", "prism", "technicals", "mf", "portfolios", "score-mf", "results", "calendars", "listing", "macro", "flows", "indices", "instruments"]
    t = ist(*day, 5, 30)
    for n in need:
        j = JOBS[n]
        st = JobState(job=n, first_seen_at=t - timedelta(days=30), last_success_at=t - timedelta(hours=24 if n == "instruments" else 16), last_attempt_at=t - timedelta(hours=16))
        v = evaluate(j, st, Ctx(now=t, env=ENV, probes={"technicals": True, "prism": True}))
        assert v.due, (n, v.reason)


# ------------------------------------------------------------------------------------------------ the sector job (docs/SECTORS.md)
SEC_ENV = {**ENV, "SECTORS_ENABLED": "1", "SECTORS_JOB": "on"}


def _sec_due(t, last_success_hours_ago, env=SEC_ENV, technicals_ok=True):
    j = by_name(env)["sectors"]
    st = JobState(job="sectors", first_seen_at=t - timedelta(days=30), last_success_at=t - timedelta(hours=last_success_hours_ago), last_attempt_at=t - timedelta(hours=last_success_hours_ago))
    return evaluate(j, st, Ctx(now=t, env=env, probes={}))


def test_the_sector_job_is_a_weekend_bulk_job_after_technicals_at_the_lowest_priority_and_off_until_switched_on():
    # owner, 18 Nov 2026: market data changes only on weekdays and the build is heavy, so it runs once a week on the weekend nights, after every other job
    j = JOBS["sectors"]
    assert j.cls == "bulk" and j.command == "refresh-sectors" and j.prerequisites == ("technicals",) and j.owns == ("sectors",)
    assert j.sla.kind == "hours" and j.sla.hours == 192 and j.max_runtime_min == 90 and 364 <= j.weight_mb <= 600 and j.honours_pause
    assert [(w.window, w.min_age_h) for w in j.windows] == [("NIGHT", 120), ("MORNING", 120)] and j.time_rule is not None
    assert j.resumable                                                        # longer than one run on the server: it continues where it stopped
    assert all(o.priority < j.priority for o in JOBS.values() if o.cls == "bulk" and o.name != "sectors")    # every other bulk job of the night goes first
    assert disabled_reason(j, {}) is None and disabled_reason(j, SEC_ENV) is None    # on since the owner's decision of 18 Nov 2026, no server step needed
    assert "SECTORS_JOB=off" in disabled_reason(j, {"SECTORS_JOB": "off"})         # the line still switches it off
    assert evaluate(j, JobState(job="sectors", first_seen_at=ist(2026, 10, 1)), Ctx(now=ist(*SAT, 23, 30), env={"SECTORS_JOB": "off"}, probes={})).state == "disabled"
    assert evaluate(j, JobState(job="sectors", first_seen_at=ist(2026, 10, 1)), Ctx(now=ist(*SAT, 23, 30), env=SEC_ENV, probes={})).state != "disabled"


MON = (2026, 11, 2)


def test_the_sector_job_runs_only_on_weekend_nights_and_never_on_a_weekday():
    week = 168
    assert not _sec_due(ist(*FRI, 19, 5), week).due and "weekend nights" in _sec_due(ist(*FRI, 19, 5), week).reason     # weekday evening: no
    assert not _sec_due(ist(*SAT, 6, 0), week).due                            # Saturday morning (Friday's night shift): no
    assert not _sec_due(ist(*SAT, 22, 59), week).due
    assert _sec_due(ist(*SAT, 23, 5), week).due                               # Saturday 23:00: the weekly build
    assert _sec_due(ist(*SUN, 6, 0), week).due                                # still running through the night shift to 08:00
    assert not _sec_due(ist(*SUN, 6, 0), 3).due                               # once it has succeeded, nothing more that weekend
    assert not _sec_due(ist(*SUN, 8, 30), week).due                           # Sunday daytime: no
    assert _sec_due(ist(*SUN, 23, 30), week).due                              # Sunday night: catch-up when Saturday's did not finish
    assert _sec_due(ist(*MON, 3, 0), week).due and not _sec_due(ist(*MON, 3, 31), week).due     # last start 03:30, so a 90-minute run ends by 05:00
    assert not _sec_due(ist(2026, 11, 4, 2, 0), 300).due                      # a weekday night, even with the SLA long past: it waits for the weekend


def test_a_retry_or_a_continuation_of_the_sector_job_waits_for_the_weekend_night():
    j = by_name(SEC_ENV)["sectors"]
    t = ist(*SUN, 8, 30)                                                      # a run stopped at 07:59 (time cap or failure) with its retry due at 08:01
    st = JobState(job="sectors", first_seen_at=t - timedelta(days=30), last_success_at=t - timedelta(days=7), last_attempt_at=t - timedelta(minutes=31),
                  last_status="failed", consecutive_failures=1, retry_at=t - timedelta(minutes=29))
    v = evaluate(j, st, Ctx(now=t, env=SEC_ENV, probes={}))
    assert not v.due and v.next_due_at == ist(*SUN, 23, 0) and "Sunday 23:00" in v.reason
    st.forced_at = t                                                          # a freshness force waits too
    assert not evaluate(j, st, Ctx(now=t, env=SEC_ENV, probes={})).due
    assert evaluate(j, st, Ctx(now=ist(*SUN, 23, 1), env=SEC_ENV, probes={})).due


def test_the_presets_job_always_has_time_to_finish_after_waiting_for_candles():
    # 13 Nov 2026: the pattern scan waited up to 30 minutes for candles inside a 20-minute job, so every run timed out and no list was stored
    from finlit.jobs.registry import build_jobs
    from finlit.presets.patterns import CANDLE_WAIT_S
    presets = next(j for j in build_jobs({}) if j.name == "presets")
    assert presets.max_runtime_min * 60 >= CANDLE_WAIT_S + 20 * 60          # the wait, plus 20 minutes for the screens, their history and Top gainers
