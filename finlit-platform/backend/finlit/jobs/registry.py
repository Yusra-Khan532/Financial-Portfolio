"""The declarative list of every background job (docs/JOBS.md, "How to add a job").

!!! THE FOUNDER'S RULE (7 Nov 2026), above every other line in this package: background jobs NEVER stop. Every scheduled job runs every day and
!!! completes every day. Never switch off, pause, skip, disable or weaken a job, its schedule, its time limit or its retries. See JOBS_RULE below.

One Job per thing the supervisor runs. Nothing here runs anything: due.py decides WHEN from this data, supervisor.py runs it.
Changing a schedule, an SLA or a priority is a one-line edit here plus a test; there is no scheduling logic to touch.

Fields in plain words
  cls            bulk: strictly one (BULK_CONCURRENCY) at a time, niced, first by priority. light: up to LIGHT_CONCURRENCY beside the bulk job.
                 audit: slow checks that are never urgent (coverage, integrity): their own lane, one (AUDIT_CONCURRENCY) at a time, niced, so a 15-minute audit can never hold a light slot that results or calendars are waiting for.
                 ondemand: its own always-on process kept by deploy/scheduler.sh (visible in the status, never started by the supervisor).
  windows        quiet windows in which the job runs when its last success is at least min_age_h old (not_before: not earlier than that IST time).
  interval_min   also run when the last success is this old (inside active_hours / market hours when those are set).
  daily_at       also run once a day from this IST time (until it has succeeded since).
  day_rule       the job's windows / daily_at / interval apply only on days where this is true (Saturday, weekdays ...); never starves: the SLA still applies.
  sla            the freshness promise. 'hours': a success within N hours. 'active': N hours, counted only from 08:00 IST (results). 'session': a success
                 after the latest trading day's data is final (18:30 IST), and overdue N hours after that. 'none': no promise (visitor-driven jobs).
  probe          a cheap question ("is there anything to do?") asked at most every 5 minutes; the job runs when the answer is yes (unknown = run on the clock).
  prerequisites  jobs that must not be running or due right now (a failing prerequisite never blocks for long: it is held or in backoff).
  resumable      the job continues where it stopped, so reaching max_runtime is a polite yield (retried in 2 minutes), not a failure.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
from typing import Callable, Dict, List, Mapping, Optional, Tuple


JOBS_RULE = ('Background jobs NEVER stop. Every scheduled job runs every day and completes every day. Never switch off, pause, skip, disable or weaken a job, its schedule, its time limit or its retries, and never ship a change that leaves a job stopped or unfinished. If a job cannot complete, the cause is fixed the same day. One job stopping, failing or being switched off never stops any other job: the others keep running on the data that is there. Only the founder can make an exception, in writing, for a named job (now: the sector job, which runs only on weekend nights by the owner\'s decision of 18 Nov 2026).')
"""The founder's rule for every background job, shown on GET /api/jobs/status and in the Admin Console. Do not weaken it."""


@dataclass(frozen=True)
class WindowRun:
    window: str
    min_age_h: float
    not_before: Optional[Tuple[int, int]] = None


@dataclass(frozen=True)
class Sla:
    kind: str = "none"          # none | hours | active | session
    hours: float = 0.0


@dataclass(frozen=True)
class Gate:
    """An environment switch. kind 'equals': enabled only when env[var] == wants (default used when unset). kind 'set': enabled when env[var] is non-empty."""
    var: str
    message: str
    wants: str = "1"
    default: str = "1"
    kind: str = "equals"
    forced: bool = False        # an always-on job: no environment value can switch it off (the founder's rule: scheduled night jobs never stop)

    def disabled_reason(self, env: Mapping[str, str]) -> Optional[str]:
        if self.forced:
            return None
        if self.kind == "set":
            return None if env.get(self.var) else self.message
        return None if str(env.get(self.var, self.default)).strip() == self.wants else self.message


@dataclass(frozen=True)
class TimeRule:
    """The hours of the week (IST) a job may start in, checked before everything else: its windows, retries after a failure, the continuation of a
    resumable run, a freshness force and a breached SLA all wait for the next allowed moment. `ok(t)` takes an IST datetime; `next_start(t)` gives the
    next allowed moment at or after t; `text` is the sentence shown in the status."""
    ok: Callable[[datetime], bool]
    next_start: Callable[[datetime], datetime]
    text: str


# The sector job (owner, 18 Nov 2026): market data changes only on weekdays and the job is heavy (about 2.5 h of one core), so it runs once a week on the
# weekend nights, after every daily and weekly job of the night: Saturday 23:00 IST to Sunday 08:00 (the main run), and Sunday 23:00 to Monday 03:30 as a
# catch-up, so a 90-minute run started at the latest moment still ends by 05:00, before Monday morning's jobs. Never on a weekday night.
def _weekend_nights(t: datetime) -> bool:
    wd, hm = t.weekday(), (t.hour, t.minute)
    return (wd == 5 and hm >= (23, 0)) or (wd == 6 and (hm < (8, 0) or hm >= (23, 0))) or (wd == 0 and hm < (3, 30))


def _weekend_nights_next(t: datetime) -> datetime:
    if _weekend_nights(t):
        return t
    for k in range(8):
        d = (t + timedelta(days=k)).replace(second=0, microsecond=0)
        for h in ((23, 0),) if d.weekday() in (5, 6) else ():
            c = d.replace(hour=h[0], minute=h[1])
            if c >= t:
                return c
    return t + timedelta(days=7)


WEEKEND_NIGHTS = TimeRule(_weekend_nights, _weekend_nights_next,
                          "runs only on weekend nights, after every other job of the night: Saturday 23:00 to Sunday 08:00 IST, and Sunday 23:00 to Monday 03:30 as a catch-up")


@dataclass(frozen=True)
class Job:
    name: str
    args: Tuple[str, ...] = ()
    module: str = "finlit.worker"
    cls: str = "light"
    priority: int = 50
    max_runtime_min: float = 30
    weight_mb: int = 100
    group: Optional[str] = None
    windows: Tuple[WindowRun, ...] = ()
    interval_min: Optional[float] = None
    interval_idle_min: Optional[float] = None       # quotes: the slower rhythm when only member alerts (no visitor) need the prices
    interval_market: bool = False                   # the interval applies only in market hours
    active_hours: Optional[Tuple[int, int]] = None
    daily_at: Optional[Tuple[int, int]] = None
    day_rule: Optional[Callable[[date], bool]] = None
    time_rule: Optional["TimeRule"] = None          # the only hours of the week the job may START in, retries and continuations included (the sector job: weekend nights)
    # Inside these hours, while the job is due or running, it has the server's long-job lane to itself (owner's written exception, 21 Nov 2026, the sector
    # job only): it goes first, every other bulk or audit job waits, and one already running is paused (it continues afterwards, never counted as a failure).
    first_in: Optional["TimeRule"] = None
    sla: Sla = field(default_factory=Sla)
    probe: Optional[str] = None
    min_gap_min: float = 30.0                       # probe-driven re-runs: at least this long after the last attempt
    prerequisites: Tuple[str, ...] = ()
    nightly_inputs: bool = False                    # in the night shift, a prerequisite counts as delivered only if it succeeded TONIGHT (score-mf: task #281)
    resumable: bool = False
    max_attempts: int = 5
    honours_pause: bool = True
    stall_min: Optional[float] = 25.0               # no output and no heartbeat for this long: the job is hung and is killed
    shards: int = 1
    ok_exit: Tuple[int, ...] = (0,)
    gate: Optional[Gate] = None
    visitor_gate: Optional[str] = None              # visitor | alerts | visitor_or_alerts | env:NAME (only when that env var is 1)
    deploy_hold_exempt: bool = False                # 27 Nov 2026: a short job whose restart costs at most a re-run is never held by a waiting deploy
    catchup: bool = True                            # a job that never succeeded is due at once (first start / boot catch-up); False for jobs that send mail or follow visitors
    boot: bool = False                              # a first-start load: BOOT_LOAD_ENABLED=0 stops it from starting just because it never ran
    external: bool = False
    owns: Tuple[str, ...] = ()                      # freshness datasets this job keeps current
    what: str = ""

    @property
    def command(self) -> str:
        return " ".join(self.args)

    @property
    def argv(self) -> List[str]:
        return ["-m", self.module, *self.args]


def _weekdays(d: date) -> bool:
    return d.weekday() < 5


def _saturday(d: date) -> bool:
    return d.weekday() == 5


def _sunday(d: date) -> bool:
    return d.weekday() == 6


def _first_sunday_of_quarter(d: date) -> bool:
    return d.weekday() == 6 and d.day <= 7 and d.month % 3 == 1


@dataclass(frozen=True)
class JobsConfig:
    """Resource and behaviour knobs, all from the environment with safe defaults (docs/JOBS.md, "Resource knobs")."""
    bulk_concurrency: int = 1
    light_cap: int = 2
    audit_cap: int = 1
    tick_s: float = 60.0
    poll_s: float = 5.0
    reserve_mb: int = 100                   # memory left alone for the website beyond a job's own weight
    max_load_per_cpu: float = 3.0           # a new job waits while the 1-minute load average per CPU is above this
    boot_delay_s: float = 240.0
    boot_load_enabled: bool = True
    quotes_every_min: float = 1.0
    web_port: int = 8000
    oom_score_adj: int = 500
    nice: int = 15

    @staticmethod
    def from_env(env: Mapping[str, str]) -> "JobsConfig":
        def num(k, d, cast=float):
            try:
                return cast(env.get(k, d))
            except (TypeError, ValueError):
                return cast(d)
        return JobsConfig(
            bulk_concurrency=max(1, num("BULK_CONCURRENCY", 1, int)), light_cap=max(1, num("LIGHT_CONCURRENCY", 2, int)), audit_cap=max(1, num("AUDIT_CONCURRENCY", 1, int)),
            tick_s=max(5.0, num("JOBS_TICK_S", 60.0)), poll_s=max(1.0, num("JOBS_POLL_S", 5.0)),
            reserve_mb=max(0, num("JOBS_RESERVE_MB", 100, int)), max_load_per_cpu=num("JOBS_MAX_LOAD_PER_CPU", 3.0),
            boot_delay_s=max(0.0, num("BOOT_LOAD_DELAY_S", 240.0)), boot_load_enabled=str(env.get("BOOT_LOAD_ENABLED", "1")) == "1",
            quotes_every_min=max(1.0, num("QUOTES_EVERY_MINUTES", 1.0)), web_port=num("PORT", 8000, int))


SECTORS_WEIGHT_MB = 450         # measured on a synthetic folder of the real size (docs/SECTORS.md, section 8): the staged job's largest moment was 364 MB (job process + the stage working), 450 leaves a margin for real NSE files having more securities
FUNDS_GATE = Gate("FUND_LOADS_ENABLED", "ETF and fund loads are switched off: set FUND_LOADS_ENABLED=1 in /opt/finlit/.env.aws and restart", wants="1", default="1", forced=True)


# What happens to each job when its time limit is reached. A job that does not say is not allowed (tests/test_jobs_limits.py): a job must never be written
# so that the supervisor kills it at its limit with nothing saved (the nightly `coverage` audit failed 19 times in 3 days exactly like that, and every
# time the founder saw "overdue"). resume = it continues where it stopped (Job.resumable). The others are declared here, with the reason:
#   deadline   it stops starting new work by itself before the limit and records what it did (the flag is in its arguments; the test checks it)
#   fixed      a small, fixed amount of work whatever the data size
#   database   works on tables already held, no provider calls
#   measured   no hard bound known: the typical run is far below the limit, and the early warning (status.near_limit) tells the admin before it nears it
LIMIT_POLICY: Dict[str, str] = {
    "eod-candles": "fixed: two downloads and two inserts, done in a minute; a run stopped at its limit stored nothing half-way (each exchange's file is one statement) and the probe asks again 10 minutes later",
    "ath": "deadline: stops itself after --max-minutes 8 (limit 12)",
    "coverage": "deadline: stops itself after --max-minutes 13 and records what it checked (limit 22)",
    "calendars": "fixed: two provider calendars (IPO and results dates); measured about 9 s",
    "ipo-prices": "deadline: no new file after --max-minutes 10 and at most --max-dates 250 listing dates a run, one file a second (limit 14)",
    "deals": "deadline: no new request after --max-minutes 8, today's three NSE files plus at most --backfill-months 1 month of history (three requests), one a second, and it stops after 5 refusals (limit 12)",
    "ipo-gmp": "deadline: no new page or NSE request after --max-minutes 10, at most --limit 300 pages and --nse-limit 80 NSE books a run, one a second (limit 14)",
    "quotes": "deadline: no new slice after --max-minutes 7 (each slice followed up inside it), Dhan phase 90 s, a company 30 s (limit 10)",
    "alerts-live": "fixed: members' own alerts only; measured about 3 s",
    "market-mood": "fixed: eight Google News topics, about 100 new headlines scored by the sentiment model; measured about 30 s",
    "global-cues": "fixed: nine small FRED downloads (one series each); measured about 10 s",
    "lab-flow": "fixed: one Dhan quote call for every F&O stock and its two futures contracts; missing previous-session open interest is filled for at most 90 s a run, the rest next run (limit 4)",
    "listing": "fixed: two provider calls for the whole market list; measured about 13 s",
    "alerts-flag": "fixed: one flag in Redis; measured about 4 s",
    "alerts-daily": "fixed: members' own alerts only; measured about 4 s",
    "screens": "fixed: members' saved screens only; measured about 2 s",
    "digest": "fixed: members who switched the digest on; measured about 6 s",
    "scores-live": "deadline: stops itself at --max-minutes; at most RT_PRISM_PER_RUN companies a run, what is left stays queued",
    "prune": "database: deletes old rows; measured about 9 s",
    "scores-export": "database: reads stored scores and screen lists only, at most one new day plus 3 back-fill days a run; measured in seconds",
    "presets": "database: builds the prebuilt screens from tables already held and runs the eleven chart-pattern scans on the stored daily candles; screens about 4 s, scans a few minutes (its own guard, so a scan problem never stops the screens)",
    "leadership": "database: weekly labels from stored prices, Saturdays only",
    "watchlist-prices": "database: reads members' saved watchlists and stored daily closes; writes only the missing added prices; measured in seconds",
    "peer-labels": "database: one time, builds the weekly peer-label record from the stored weekly readings (task #409)",
    "score-mf": "database: scores from tables already held; measured about 2 s",
    "mf-screen": "database: one transaction over tables already held; measured about 4 s",
    "backtest-leadership": "database: quarterly, stored weekly prices only",
    "rebuild-metrics": "database: only the companies still missing their screener values (--only-missing)",
    "universe": "fixed: one provider list, Sundays only",
    "indices": "fixed: one membership list per index; measured about 6 s",
    "integrity": "fixed: a sample of at most 40 companies, one provider call each; measured about 25 s",
    "logos": "measured: about 132 s against a 30-minute limit; the early warning watches it",
    "macro": "measured: about 50 s against a 20-minute limit; the early warning watches it",
    "macro-outlook": "database: scores 35 sectors from tables already held, no provider calls; measured about 5 s",
    "flows-nse": "fixed: one request for the latest session; measured about 3 s",
    "flows": "measured: about 20 s against a 20-minute limit; the early warning watches it",
    "history-probe": "measured: a read-only count per source; the early warning watches it",
    "dhan-check": "fixed: a handful of calls that prove the credentials; limit 5 minutes",
    "canary": "fixed: a few reference companies; measured about 6 s",
    "instruments": "fixed: one public file; measured about 5 s",
    "mf": "measured: about 56 s against a 20-minute limit (AMFI's NAV file); the early warning watches it",
    "facts": "measured: about 159 s against a 20-minute limit (AMFI files, often unreachable from AWS); the early warning watches it",
    "industry": "measured: about 25 s against a 20-minute limit (one AMFI report a month); the early warning watches it",
    "etf": "measured: about 20 s against a 30-minute limit and it can --resume; the early warning watches it",
}


def limit_policy(job: "Job") -> Optional[str]:
    """How the job behaves at its time limit: "resume", or the declared text above; None for the always-on lanes (they have no limit to hit)."""
    if job.cls == "ondemand":
        return None
    return "resume" if job.resumable else LIMIT_POLICY.get(job.name)


def build_jobs(env: Optional[Mapping[str, str]] = None) -> List[Job]:
    env = os.environ if env is None else env
    W = WindowRun
    limit = ["--limit", env["INGEST_LIMIT"]] if env.get("INGEST_LIMIT", "0") not in ("", "0") else []
    qe = JobsConfig.from_env(env).quotes_every_min
    ingest_cap = float(env.get("NIGHT_INGEST_MAX_MIN", 90) or 90)
    prism_workers = max(1, int(env.get("PRISM_WORKERS", 2) or 2))
    parallel = str(env.get("INGEST_PARALLEL", 2) or 2)
    night_morning = (W("NIGHT", 18), W("MORNING", 14))
    jobs = [
        # ---------------------------------------------------------------- results and calendars: light, never paused by the admin switch, never starved
        Job("results", ("refresh-results",), priority=1, max_runtime_min=20, weight_mb=60, honours_pause=False, stall_min=15, resumable=True,
            interval_min=25, active_hours=(8, 23), windows=(W("MORNING", 4),), sla=Sla("active", 1.5), visitor_gate="env:RESULTS_NEED_VISITOR",
            owns=("results",), what="rebuild companies that have just declared quarterly results"),
        Job("results-light", ("refresh-results-light",), priority=2, max_runtime_min=30, weight_mb=60, honours_pause=False, stall_min=15, resumable=True,
            interval_min=55, active_hours=(8, 23), windows=(W("MORNING", 4),), sla=Sla("active", 2.0), visitor_gate="env:RESULTS_NEED_VISITOR",
            owns=("results",), what="quarter figures of smaller companies that declared (one provider call each)"),
        Job("ath", ("backfill-history", "--limit", "120", "--max-minutes", "8", "--results-first"), priority=4, max_runtime_min=12, weight_mb=120, stall_min=10,
            interval_min=20, active_hours=(8, 23), windows=(W("MORNING", 4),), sla=Sla("none"), probe="ath", min_gap_min=15,
            what="all-time highs: long price history of the companies that declared results first (the results calendar's all-time-high column)"),
        Job("ipo-gmp", ("refresh-ipo-gmp", "--limit", "300", "--nse-limit", "80", "--pause", "1", "--max-minutes", "10"), priority=3, max_runtime_min=14, weight_mb=60, honours_pause=False,
            stall_min=12, interval_min=30, sla=Sla("none"),     # round the clock, every 30 min: the first fill of ~1,400 issues takes hours, not days; later runs read only new and unlisted issues
            what="Every IPO's record and GMP from InvestorGain's IPO page, one page at a time, then NSE's subscription by category of listed mainboard issues (IPO calendar, all-IPOs table, IPO report)"),
        Job("ipo-prices", ("refresh-ipo-prices", "--max-dates", "250", "--max-minutes", "10"), priority=3, max_runtime_min=14, weight_mb=120, honours_pause=False,
            stall_min=12, interval_min=30, sla=Sla("none"),
            what="Each listed IPO's listing-day open, high, low and close, and its latest close, from the NSE and BSE daily price files (all-IPOs table, IPO report)"),
        # NSE posts the day's bulk and block files after the close: every 30 minutes from 16:00 to 22:00 IST on weekdays, and once in the morning
        # (the previous evening's files if the evening runs missed them, and the next month of history). docs/DEALS.md
        Job("deals", ("refresh-deals", "--backfill-months", "1", "--max-minutes", "8"), priority=3, max_runtime_min=12, weight_mb=60, honours_pause=False,
            stall_min=10, interval_min=30, active_hours=(16, 21), day_rule=_weekdays, windows=(W("MORNING", 10),), sla=Sla("none"),
            deploy_hold_exempt=True, what="NSE's bulk, block and short-selling deals (today's files, then two years of history a month a run): Bulk & Block Deals page, IPO report, company report"),
        Job("calendars", ("refresh-calendars",), priority=3, max_runtime_min=10, weight_mb=60, honours_pause=False, stall_min=10,
            interval_min=40, active_hours=(8, 23), windows=(W("MORNING", 4),), sla=Sla("active", 1.0), visitor_gate="env:RESULTS_NEED_VISITOR",
            owns=("results_calendar", "ipo_calendar"), what="IPO and results calendars (board-meeting dates)"),
        # ---------------------------------------------------------------- prices and alerts
        Job("quotes", ("refresh-quotes", "--max-minutes", "7"), priority=4, max_runtime_min=10, weight_mb=100, honours_pause=False, stall_min=10,
            interval_min=qe, interval_idle_min=15, interval_market=True, visitor_gate="visitor_or_alerts", owns=("quotes",),
            catchup=False, what="live prices into stored summaries: every minute while a visitor is on the site, every 15 minutes when only member alerts need them"),
        Job("scores-live", ("refresh-scores-live", "--max-minutes", "10"), priority=7, max_runtime_min=15, weight_mb=200, honours_pause=False, stall_min=10, probe="scores-live", min_gap_min=3,
            windows=(W("MORNING", 6),), catchup=False, owns=("score_lag",),
            what="real-time scores: the FinLit Prism rating of every company whose results were just stored, recalculated within minutes, one at a time (docs/REALTIME-SCORES.md)"),
        Job("alerts-live", ("check-alerts", "--kind", "live"), priority=5, max_runtime_min=10, weight_mb=80, honours_pause=False, stall_min=10,
            interval_min=15, interval_market=True, visitor_gate="alerts", prerequisites=("quotes",), catchup=False, what="member price alerts during market hours"),
        Job("lab-flow", ("refresh-lab-flow",), priority=6, max_runtime_min=4, weight_mb=90, honours_pause=False, stall_min=4,
            interval_min=3, interval_market=True, daily_at=(15, 40), day_rule=_weekdays, catchup=False,
            gate=Gate("DHAN_CLIENT_ID", "Dhan is not set up (DHAN_CLIENT_ID empty)", kind="set"),
            what="Trading Lab Order Flow: change, futures open interest and build-up, VWAP and pivot zone of every F&O stock, every 3 minutes in market hours plus the closing snapshot (docs/TRADING-LAB.md)"),
        Job("listing", ("refresh-listing", "--force"), priority=6, max_runtime_min=15, weight_mb=100, honours_pause=False, stall_min=10,
            interval_min=30, interval_market=True, daily_at=(15, 50), windows=(W("AFTER_CLOSE", 2), W("MORNING", 6)),
            sla=Sla("hours", 6), owns=("quotes", "ticker"), what="price, market cap and 52-week range of every listed company (two provider calls); final prices after the close"),
        Job("alerts-flag", ("refresh-alerts",), module="finlit.wake", priority=8, max_runtime_min=3, weight_mb=40, honours_pause=False, stall_min=3,
            windows=(W("MORNING", 4), W("AFTER_CLOSE", 4), W("NIGHT", 4)), what="refreshes the 'any member alert exists' flag"),
        Job("alerts-daily", ("check-alerts", "--kind", "daily"), priority=9, max_runtime_min=10, weight_mb=80, honours_pause=False, stall_min=10,
            daily_at=(19, 10), day_rule=_weekdays, sla=Sla("hours", 80), catchup=False, what="daily member alerts, weekdays after the close"),
        Job("screens", ("check-screens",), priority=9, max_runtime_min=15, weight_mb=80, windows=(W("MORNING", 20),), day_rule=_weekdays,
            sla=Sla("hours", 80), catchup=False, what="emails members when a company newly matches a saved screen"),
        Job("digest", ("send-digest",), priority=9, max_runtime_min=15, weight_mb=80, daily_at=(19, 10), day_rule=_sunday, sla=Sla("hours", 192),
            catchup=False, what="weekly week-ahead email"),
        # ---------------------------------------------------------------- bulk: one at a time, in this order
        Job("prune", ("prune",), cls="bulk", priority=5, max_runtime_min=30, weight_mb=150, windows=(W("NIGHT", 20),), sla=Sla("hours", 30),
            owns=("disk",), what="old prices and logs out of the database (keeps the disk from filling); never-confirmed accounts after 7 days"),
        Job("technicals", ("refresh-technicals",), cls="bulk", priority=10, max_runtime_min=75, weight_mb=350, resumable=True, probe="technicals",
            windows=(W("AFTER_CLOSE", 0), W("MORNING", 0)), sla=Sla("session", 12), owns=("technicals", "daily_prices"),
            what="technical view of every stored Prism report from fresh Dhan daily candles (resumable, yields to members)"),
        # task #325 (developer file 26, 5.5): the exchange's own daily candles (NSE first, Dhan) for prices, volume and the chart patterns; three years on first
        # sight, then only new sessions; resumable (the longest-unloaded company first). Task #394 (developer file 37, F1): it finishes every night: the
        # time box is 150 minutes (was 45, which left companies a night behind), and a run that still stops with companies left exits partial (degraded,
        # with the count) so the supervisor tries it again, never silently "done"
        # 26 Nov 2026 (the founder: after the 15:30 close the screens move to that day's data as fast as possible): the exchanges' own end-of-day files,
        # one download each with every company's official close, written into daily_candles the moment they are out (asked every 10 minutes from
        # 16:30 IST until both are in); the candles job below fills what they did not have. Light: two downloads and two statements
        Job("eod-candles", ("refresh-eod",), priority=8, max_runtime_min=10, weight_mb=150, stall_min=8, honours_pause=False, probe="eod-candles",
            min_gap_min=10, catchup=False, owns=("daily_candles",),
            what="the day's official closes of every company from NSE's and BSE's end-of-day files, as soon as they are published (16:30 to 23:30 IST)"),
        Job("candles", ("refresh-candles", "--max-minutes", "150"), cls="bulk", priority=9, max_runtime_min=160, weight_mb=150, resumable=True,
            probe="candles", min_gap_min=60,   # task #394: a session Dhan published after the evening run is loaded the same morning, not the next evening
            windows=(W("AFTER_CLOSE", 0), W("MORNING", 0)), sla=Sla("session", 12), owns=("daily_candles",),
            what="daily candles from the exchange (Dhan, NSE first, BSE only where there is no NSE row) into daily_candles: the prices, volume and chart patterns read them"),
        # task #394 (developer file 37, F1 and W1): the charts of every stored report from the candles just loaded; database only, a few minutes
        Job("price-sections", ("refresh-price-sections", "--max-minutes", "40"), cls="bulk", priority=11, max_runtime_min=50, weight_mb=200, resumable=True,
            prerequisites=("candles",), probe="price-sections", min_gap_min=30,
            windows=(W("AFTER_CLOSE", 0), W("MORNING", 0)), sla=Sla("session", 12), owns=("price_sections",),
            deploy_hold_exempt=True, what="the price charts (1M to MAX, and 3Y on daily candles) of every stored report from daily_candles, after the candles job: every chart ends on the latest close, no part-day candle; no provider calls"),
        # weekend nights only, at the lowest bulk priority (owner, 18 Nov 2026; docs/JOBS.md "The sector job on weekend nights"): one full build a week on the
        # week's data up to Friday's close; every daily and weekly job of the night goes first; never on a weekday night
        Job("sectors", ("refresh-sectors",), cls="bulk", priority=95, max_runtime_min=90, weight_mb=SECTORS_WEIGHT_MB, stall_min=45, prerequisites=("technicals",), resumable=True,
            windows=(W("NIGHT", 120), W("MORNING", 120)), time_rule=WEEKEND_NIGHTS, first_in=WEEKEND_NIGHTS, sla=Sla("hours", 192), owns=("sectors",), catchup=False,
            probe="sectors-view", min_gap_min=60,   # task #192: a live set without the Sectors view gets it added (minutes, same files), in these hours only
            gate=Gate("SECTORS_JOB", "The sector job is switched off by SECTORS_JOB=off in /opt/finlit/.env.aws: Sector Pulse and Rotation keep the last published data. Remove the line (or set it to on) and restart the jobs container to bring back the weekend build (docs/JOBS.md section 4b)", wants="on", default="on"),   # on since the owner's decision of 18 Nov 2026 (weekend nights only); SECTORS_JOB=off still switches it off
            what="Sector Pulse: NSE's daily files, then every industry's breadth state, leader flags and ranked stocks, swapped in whole (docs/SECTORS.md)"),
        Job("ingest-flagship", ("ingest", "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "ITC", "LT", "BHARTIARTL", "HINDUNILVR"), cls="bulk",
            priority=15, max_runtime_min=30, weight_mb=300, windows=(W("NIGHT", 144),), sla=Sla("hours", 400), boot=True, resumable=True,
            what="the ten flagship companies first (first start: visitors see them before the long load)"),
        Job("ingest", ("ingest-all", "--hours", "20", *limit, "--parallel", parallel, "--max-minutes", f"{max(10.0, ingest_cap - 15):g}"), cls="bulk", priority=20, max_runtime_min=ingest_cap, weight_mb=450,
            windows=night_morning, sla=Sla("hours", 26), resumable=True, boot=True, owns=("daily_prices",), prerequisites=("ingest-flagship",),
            what="load or reload every company's statements (resumable; one run is capped so other bulk jobs get their turn)"),
        Job("score", ("score-all", "--max-minutes", "70"), cls="bulk", priority=30, max_runtime_min=90, weight_mb=300, windows=night_morning, sla=Sla("hours", 26), resumable=True,
            boot=True, prerequisites=("ingest",), owns=("scores",), what="The retired overall score of every listed company (kept running, not shown, task #283)"),
        Job("prism", ("precompute-prism", "--max-minutes", "55", "--limit", "800"), cls="bulk", priority=40, max_runtime_min=60, weight_mb=250 * prism_workers,
            shards=prism_workers, resumable=True, probe="prism", interval_min=10, windows=(W("NIGHT", 20), W("MORNING", 14)), sla=Sla("hours", 26), boot=True, prerequisites=("ingest", "score"),
            gate=Gate("PRISM_PRECOMPUTE_ENABLED", "Prism pre-compute is switched off: PRISM_PRECOMPUTE_ENABLED is not 1", forced=True), owns=("prism",),
            what="FinLit Prism rating of every company with a full report (resumable, one company at a time per worker)"),
        # task #394 (developer file 37, F4): the ready-made lists are built only after the charts are brought up to the newest candles (price-sections,
        # itself after candles), so a list, its figures and its charts read one close
        Job("presets", ("refresh-presets",), cls="bulk", priority=42, max_runtime_min=40, weight_mb=350, windows=(W("NIGHT", 20), W("MORNING", 14)), sla=Sla("hours", 30),
            prerequisites=("prism", "price-sections"), catchup=False,
            probe="presets", min_gap_min=60,   # task #394: candles that arrive after the night's run move the lists the same day, with the charts
            deploy_hold_exempt=True, what="prebuilt screens: momentum and growth scores, industry breadth and theme states, every screen's list into the cache (after the Prism batch; database only)"),
        # task #326: one file per market day for the owner's archive, started by the presets job's completion (its probe sees the finished day without a file;
        # presets is its prerequisite, so it never reads while the lists are being rewritten). Stored results only: a few seconds. Back-fill of earlier days,
        # a few a run, only in the night shift. A run with nothing to do is a success (weekends, holidays).
        Job("scores-export", ("export-scores",), priority=44, max_runtime_min=10, weight_mb=250, stall_min=8, probe="scores-export", min_gap_min=5,
            prerequisites=("presets",), sla=Sla("hours", 30), owns=(), what="the day's scores and every ready-made screen, one file a market day, for the owner's archive (/internal/export/scores)"),
        Job("stress", ("refresh-stress", "--max-minutes", "40"), cls="bulk", priority=43, max_runtime_min=50, weight_mb=300, stall_min=20, windows=(W("NIGHT", 20), W("MORNING", 14)),
            sla=Sla("hours", 30), resumable=True, prerequisites=("ingest", "macro"), catchup=True, max_attempts=5, probe="stress", min_gap_min=5,
            what="Stress Lab: builds and stores the page and the company pack of every covered company (₹10,000 Cr or more: large, mid and small caps that are not banks, NBFCs or insurers), companies with no "
                 "page first, then the oldest; resumable: a run that reaches its time cap with companies left is run again a few minutes later (probe), so every company is "
                 "built every day; a company that fails is logged with the reason and tried again (docs/STRESS.md)"),
        Job("earnings-calls", ("refresh-earnings-calls",), cls="bulk", priority=44, max_runtime_min=60, weight_mb=250, stall_min=40, windows=(W("NIGHT", 20), W("MORNING", 14)),
            sla=Sla("hours", 48), resumable=True, catchup=False, max_attempts=3,
            gate=Gate("GEMINI_API_KEY", "Earnings-call summaries are off: GEMINI_API_KEY is empty (docs/EARNINGS-CALLS.md)", kind="set"),
            what="earnings-call summaries: finds the latest transcripts of the largest companies, reads their text and answers ten fixed questions with the language model, quote by quote (bounded per run, free tier)"),
        Job("discovery", ("refresh-discovery", "--max-minutes", "40", "--limit", "300"), cls="bulk", priority=48, max_runtime_min=50, weight_mb=250, stall_min=25,
            windows=(W("NIGHT", 20), W("MORNING", 14)), sla=Sla("hours", 30), resumable=True, catchup=True, max_attempts=5, probe="discovery", min_gap_min=5,
            what="Discovery (task #221): reads each company's newest investor presentation from Documents (first 80 pages) and puts the company in the founder's 21 "
                 "themes by their keywords, with the sentences that hold figures; only companies with a new presentation (or a failed read a day old); resumable: a run "
                 "that stops with presentations left is run again a few minutes later (probe); a file the exchange does not give is recorded with the reason (docs/DISCOVERY.md)"),
        Job("concalls", ("refresh-concalls", "--max-minutes", "20", "--limit", "160"), priority=49, max_runtime_min=30, weight_mb=150, stall_min=20,
            windows=(W("NIGHT", 20), W("MORNING", 14)), interval_min=120, sla=Sla("hours", 12), resumable=True, catchup=True,
            what="Concall Monitor (task #278): new earnings-call filings (schedule, recording, transcript, presentation) from the stored announcements; reads each "
                 "letter once from the exchange (the call's date and time, the audio link), keeps a transcript's text for the page and FinLit AI; 160 letters a run, "
                 "newest first, none started after 20 min; a file the exchange does not give is tried again on later runs (three tries, the reason kept) (docs/CONCALLS.md)"),
        Job("news-sentiment", ("score-sentiment", "--max-minutes", "30", "--limit", "40000"), cls="bulk", priority=44, max_runtime_min=40, weight_mb=350,
            stall_min=20, windows=(W("NIGHT", 20), W("MORNING", 14)), interval_min=180, sla=Sla("hours", 30), resumable=True, catchup=True, max_attempts=5,
            what="News sentiment (task #365): scores every news item and exchange filing not scored yet with the financial-news language model "
                 "(finlit/sentiment.py: an int8 ONNX DistilRoBERTa, one thread, about 300 MB), newest first, up to 40,000 a run; the score is "
                 "P(positive) - P(negative) from -1 to +1. Database only; continues where it stopped"),
        Job("market-mood", ("refresh-market-mood",), priority=30, max_runtime_min=10, weight_mb=350, stall_min=10,
            interval_min=30, active_hours=(6, 23), sla=Sla("active", 2.0), catchup=False,
            what="Trading Lab Market mood: world headlines from Google News for eight topics that move Indian markets (the Fed, crude, the rupee, "
                 "US and Chinese markets, foreign investors, ...), each scored by the news-sentiment model; the last 48 hours kept (lab/mood.py)"),
        Job("feed-sort", ("feed-sort", "--max-minutes", "20"), priority=45, max_runtime_min=30, weight_mb=120, stall_min=20,
            windows=(W("NIGHT", 20), W("MORNING", 14)), interval_min=180, sla=Sla("hours", 30), resumable=True, catchup=True,
            what="News & filings sorting (task #309): when the feed's sorting rules change (feed.SORT_RULES), re-sorts every stored filing once into result / "
                 "document / news and its FinLit topic, 5,000 rows at a time by id, continuing where the last run stopped; when the rules are current it does nothing"),
        Job("company-brief", ("refresh-company-brief",), cls="bulk", priority=46, max_runtime_min=60, weight_mb=300, stall_min=40, windows=(W("NIGHT", 20), W("MORNING", 14)),
            sla=Sla("hours", 72), resumable=True, catchup=False, max_attempts=3,
            what="company brief (the About section): reads the annual report and the latest filings of followed and largest companies, asks the language model to write what the company does, "
                 "the group, the businesses and the money mix with a citation for every line, checks each citation against its PDF page and stores a DRAFT for a person to review (only companies "
                 "with new filings; bounded per night; no key = recorded as not configured, nothing written; docs/COMPANY-BRIEF.md)"),
        Job("ownership-insights", ("refresh-ownership", "--max-minutes", "20", "--limit", "120", "--concurrency", "3"), priority=47, max_runtime_min=30, weight_mb=120, stall_min=20,
            windows=(W("NIGHT", 20), W("MORNING", 14)), interval_min=180, sla=Sla("hours", 36), resumable=True, catchup=True, prerequisites=("ingest",), owns=("ownership",),
            what="ownership insights of every company: a row from the stored shareholding, then the premium filing details (shareholders, pledge, share count, lock-in, named holders) for companies that lack them, 3 at a time, 120 a run (docs/OWNERSHIP.md)"),
        Job("leadership", ("refresh-leadership", "--if-stale", "--backfill-from", "2022-10-01"), cls="bulk", priority=45, max_runtime_min=60, weight_mb=250,
            windows=(W("NIGHT", 144),), day_rule=_saturday, sla=Sla("hours", 192), boot=True, owns=("leadership",),
            what="weekly Leader / In line / Laggard labels (Saturday, after Friday's close)"),
        # task #408: the price each watchlist entry was added at ("Since added"). While an entry saved before the page stored it has a close to take (probe
        # "watchlist-prices"), fill it from the stored daily closes. Idempotent: once every entry has its price the probe says no and it does not run.
        Job("watchlist-prices", ("backfill-watchlist-prices",), priority=46, max_runtime_min=10, weight_mb=80, stall_min=8, probe="watchlist-prices", min_gap_min=60,
            sla=Sla("none"), catchup=False, owns=(), what="watchlist entries without an added price: the close of the day they were added, from the stored daily prices (task #408)"),
        # task #409: one time. While the weekly peer-label record is empty and stored weekly readings exist (probe "peer-labels"), build it from them with
        # the two-run rule, so every page reads one label from the day this ships, not from the next Saturday. Afterwards the probe says no: it never runs again.
        Job("peer-labels", ("rebuild-peer-labels",), cls="bulk", priority=44, max_runtime_min=20, weight_mb=250, probe="peer-labels", min_gap_min=30,
            sla=Sla("none"), catchup=False, owns=(), what="one time: the weekly peer-label record from the stored weekly readings (task #409)"),
        Job("portfolios", ("refresh-portfolios",), cls="bulk", priority=50, max_runtime_min=120, weight_mb=200, group="funds", windows=night_morning,
            sla=Sla("hours", 26), resumable=True, gate=FUNDS_GATE, boot=True, what="fund holdings, sector split and exit loads (resumable)"),
        Job("score-mf", ("score-mf",), cls="bulk", priority=55, max_runtime_min=60, weight_mb=250, group="funds", windows=night_morning,
            sla=Sla("hours", 26), prerequisites=("mf", "facts", "portfolios"), nightly_inputs=True, gate=FUNDS_GATE, boot=True, owns=("fund_scores",),
            what="Mutual Fund Score (each night after that night's NAVs, fund facts and portfolios)"),
        Job("mf-screen", ("refresh-mf-screen",), cls="bulk", priority=57, max_runtime_min=30, weight_mb=300, group="funds", windows=night_morning,
            sla=Sla("hours", 30), prerequisites=("facts", "industry", "portfolios"), gate=FUNDS_GATE, boot=True,
            what="Mutual Fund Screener figures: risk from month-end NAVs, ranks in category, exit load, portfolio and category-flow summaries, theme tags (database only; docs/MF-FILTERS.md)"),
        Job("backfill-mf", ("backfill-mf",), cls="bulk", priority=60, max_runtime_min=120, weight_mb=200, group="funds", windows=night_morning,
            sla=Sla("hours", 192), resumable=True, gate=FUNDS_GATE, boot=True, what="the full NAV history since April 2006, one fund house at a time (resumable; task #162)"),
        Job("backfill-dii", ("backfill-dii",), cls="bulk", priority=66, max_runtime_min=20, weight_mb=100, windows=(W("NIGHT", 144),), day_rule=_saturday,
            sla=Sla("hours", 24 * 14), resumable=True, catchup=False, what="earlier days of DII flows from NSDL's own date form, weekly until the floor of NSDL's history is found (insert-only)"),
        Job("mf-returns", ("fill-mf-returns", "--limit", "400", "--max-minutes", "10"), priority=27, max_runtime_min=14, weight_mb=120, stall_min=10, interval_min=30,
            windows=night_morning, sla=Sla("hours", 30), gate=FUNDS_GATE, prerequisites=("mf",), resumable=True,
            what="1, 3 and 5 year returns of every fund that has none, from the mirror of AMFI's data (held funds first; also run at once when a fund is added)"),
        Job("backfill-history", ("backfill-history",), cls="bulk", priority=65, max_runtime_min=120, weight_mb=250, windows=night_morning,
            sla=Sla("hours", 192), resumable=True, boot=True, what="weekly closes back to 2004 for the leadership backtest (resumable)"),
        Job("backtest-leadership", ("backtest-leadership",), cls="bulk", priority=70, max_runtime_min=60, weight_mb=250, windows=(W("NIGHT", 24 * 80),),
            day_rule=_first_sunday_of_quarter, sla=Sla("hours", 24 * 100), catchup=False, what="quarterly: has leadership held in each peer group?"),
        Job("rebuild-metrics", ("rebuild-metrics", "--only-missing"), cls="bulk", priority=71, max_runtime_min=45, weight_mb=250, windows=(W("NIGHT", 144),),
            sla=Sla("hours", 400), boot=True, what="screener filters for companies loaded before they existed (database only)"),
        Job("short-history", ("refresh-short-history", "--max-minutes", "45"), cls="bulk", priority=72, max_runtime_min=60, weight_mb=250, windows=(W("NIGHT", 144),),
            sla=Sla("hours", 400), resumable=True, boot=True, what="reload stored reports with four years or fewer of statements"),
        # ---------------------------------------------------------------- light jobs of the nightly chain and the evening data
        Job("universe", ("refresh-universe",), priority=12, max_runtime_min=15, weight_mb=150, windows=(W("NIGHT", 144),), day_rule=_sunday,
            sla=Sla("hours", 192), what="the company list (Sundays)"),
        Job("indices", ("refresh-indices",), priority=60, max_runtime_min=15, weight_mb=100, windows=night_morning, sla=Sla("hours", 30), owns=("indices",),
            what="NIFTY index membership"),
        Job("coverage", ("audit-coverage", "--sample", "60", "--max-minutes", "13", "--record"), cls="audit", priority=62, max_runtime_min=22, weight_mb=100, ok_exit=(0, 1), windows=night_morning,
            sla=Sla("hours", 30), what="compares what the provider sends with what the reports show (exit 1 = mismatches found, recorded)"),
        Job("integrity", ("audit-integrity",), cls="audit", priority=63, max_runtime_min=25, weight_mb=100, ok_exit=(0, 1), windows=night_morning, sla=Sla("hours", 30),
            what="nightly data integrity sample"),
        Job("logos", ("refresh-logos",), priority=80, max_runtime_min=30, weight_mb=100, windows=(W("NIGHT", 20),), sla=Sla("hours", 60), what="company and fund-house logos"),
        Job("macro", ("refresh-macro",), priority=20, max_runtime_min=20, weight_mb=100, windows=(W("AFTER_CLOSE", 18, (19, 10)), W("MORNING", 14)),
            sla=Sla("hours", 30), owns=("macro",), what="India macro data (MoSPI, RBI)"),
        Job("global-cues", ("refresh-global-cues",), priority=21, max_runtime_min=5, weight_mb=60, windows=(W("MORNING", 6), W("AFTER_CLOSE", 6)),
            sla=Sla("hours", 30), what="Trading Lab Global cues: US yields, Fed funds, dollar index, EUR/JPY/CNY and WTI/Brent crude from FRED's public download (docs/GLOBAL-MARKETS.md)"),
        Job("macro-outlook", ("refresh-macro-outlook",), priority=22, max_runtime_min=10, weight_mb=100, windows=(W("AFTER_CLOSE", 8, (19, 40)), W("MORNING", 8)),
            interval_min=360, probe="macro-outlook", min_gap_min=20, prerequisites=("macro", "flows-nse", "flows"), sla=Sla("hours", 30), owns=("macro_outlook",),
            what="Macro & Sector Outlook: sector scores from the stored macro, flows and commodity series (database only; also when new data arrives)"),
        Job("flows-nse", ("refresh-flows", "--only", "nse"), priority=19, max_runtime_min=10, weight_mb=100, windows=(W("AFTER_CLOSE", 1.5, (19, 10)), W("MORNING", 6)),
            sla=Sla("hours", 30), owns=("flows",), what="the exchange's own FII/DII figures for the latest session"),
        Job("flows", ("refresh-flows",), priority=21, max_runtime_min=20, weight_mb=100, windows=(W("AFTER_CLOSE", 1.5, (19, 10)), W("MORNING", 6)),
            sla=Sla("hours", 30), owns=("flows",), what="FII/DII flows (NSDL, NSE archive files)"),
        Job("history-probe", ("history-probe",), priority=85, max_runtime_min=15, weight_mb=100, windows=(W("NIGHT", 144),), sla=Sla("hours", 400),
            what="read-only count of yearly statements per source"),
        Job("dhan-check", ("dhan-check",), priority=85, max_runtime_min=5, weight_mb=60, windows=(W("NIGHT", 144), W("MORNING", 144)), sla=Sla("hours", 400),
            gate=Gate("DHAN_CLIENT_ID", "Dhan is not set up (DHAN_CLIENT_ID empty)", kind="set"), what="proves the Dhan credentials work"),
        Job("canary", ("canary",), priority=7, max_runtime_min=10, weight_mb=100, honours_pause=False, windows=(W("MORNING", 10), W("AFTER_CLOSE", 10, (19, 0))),
            sla=Sla("hours", 30), owns=("canary",), what="re-fetches a few reference companies from the provider and compares them with what we hold"),
        # ---------------------------------------------------------------- funds (one at a time among themselves: group 'funds')
        Job("instruments", ("refresh-instruments",), priority=22, max_runtime_min=15, weight_mb=180, group="funds", windows=(W("MORNING", 20),), sla=Sla("hours", 30),
            gate=FUNDS_GATE, what="Dhan's public instrument file"),
        Job("mf", ("refresh-mf",), priority=23, max_runtime_min=20, weight_mb=180, group="funds",
            windows=(W("AFTER_CLOSE", 20, (21, 10)), W("NIGHT", 1.5), W("MORNING", 6)), sla=Sla("hours", 26), gate=FUNDS_GATE, owns=("mf_nav",),
            what="mutual fund NAVs (AMFI publishes by 11 pm)"),
        # task #281: a NIGHT window too, so the facts (plan and option from AMFI's scheme master, AUM, TER) are in before the night's score run;
        # it ran only at 05:00 IST, an hour after score-mf, so a fixed fund (HSBC Small Cap, 20 Nov) waited a whole day for its score
        Job("facts", ("refresh-facts",), priority=24, max_runtime_min=20, weight_mb=180, group="funds",
            windows=(W("AFTER_CLOSE", 20, (21, 10)), W("NIGHT", 14), W("MORNING", 14)),
            sla=Sla("hours", 30), prerequisites=("mf",), gate=FUNDS_GATE, what="fund size, expense ratios, launch dates (AMFI)"),
        Job("industry", ("refresh-industry",), priority=25, max_runtime_min=20, weight_mb=180, group="funds", windows=(W("AFTER_CLOSE", 20, (19, 10)), W("MORNING", 14)),
            sla=Sla("hours", 30), gate=FUNDS_GATE, what="AMFI monthly category report"),
        Job("etf", ("refresh-etf", "--resume"), priority=26, max_runtime_min=30, weight_mb=180, group="funds", day_rule=_weekdays,
            windows=(W("AFTER_CLOSE", 20, (21, 10)), W("NIGHT", 1.5), W("MORNING", 14)), sla=Sla("hours", 80), prerequisites=("instruments",), gate=FUNDS_GATE,
            owns=("etf_prices",), what="ETF prices and metrics, weekdays (a second pass picks up what the first could not reach)"),
        # ---------------------------------------------------------------- always-on processes kept alive by deploy/scheduler.sh (shown, not scheduled)
        Job("drain-queue", ("drain-queue", "--loop"), cls="ondemand", external=True, honours_pause=False, what="builds stocks a visitor opened before they were loaded; its own always-on process, outside every gate"),
        Job("commodities", ("refresh-commodities", "--loop"), cls="ondemand", external=True, honours_pause=False,
            gate=Gate("COMMODITIES_WORKER", "COMMODITIES_WORKER=0", wants="1", default="1"), what="commodity prices into Redis (always-on loop)"),
    ]
    return jobs


def by_name(env: Optional[Mapping[str, str]] = None) -> Dict[str, Job]:
    return {j.name: j for j in build_jobs(env)}


RESERVE_MB = 100   # what a bulk job leaves for the website (JobsConfig.reserve_mb)


def unfit_reason(job: Job, capacity_mb: Optional[int]) -> Optional[str]:
    """A job that needs more memory than this server's app container can ever give it can never start here: the supervisor's memory gate would make it wait
    for ever, and the founder would be told every day that it is "overdue". It is reported as what it is instead (disabled, with the reason), never as late."""
    if not capacity_mb or job.cls == "ondemand":
        return None
    need = job.weight_mb + (RESERVE_MB if job.cls == "bulk" else 0)
    if need <= capacity_mb:
        return None
    return (f"needs about {job.weight_mb} MB of memory and this server's app container has {capacity_mb} MB, so it can never start here "
            f"(build its data on a PC and upload it, or give the container more memory: see the job's document)")


def disabled_reason(job: Job, env: Mapping[str, str]) -> Optional[str]:
    """Why the job is switched off: its own gate (an env setting), or the server being too small for it. Tests pass their own env dict (JOBS_CAPACITY_MB to try
    a size); the real process environment also reads the container's real limit."""
    if job.gate:
        off = job.gate.disabled_reason(env)
        if off:
            return off
    cap = env.get("JOBS_CAPACITY_MB")
    if cap is None and env is os.environ:
        from .resources import container_limit_mb
        return unfit_reason(job, container_limit_mb())
    return unfit_reason(job, int(cap)) if cap and str(cap).isdigit() else None
