# Background jobs: the job supervisor

> **THE FOUNDER'S RULE (7 Nov 2026). Background jobs NEVER stop. Every scheduled job runs every day and completes every day.**
> Never switch off, pause, skip, disable or weaken a job, its schedule, its time limit or its retries, and never ship a change that leaves a job stopped or unfinished.
> If a job cannot complete, fix the cause the same day. One job stopping, failing or being switched off never stops any other job: the others keep running on the data that is there. Only the founder can make an exception, in writing, for a named job
> (now: the sector job, which runs only on weekend nights by the owner's decision of 18 Nov 2026, on by default, `SECTORS_JOB=off` switches it off; section "The sector job on weekend nights"). The same rule is in `CLAUDE.md`, `jobs/registry.py` (`JOBS_RULE`), `GET /api/jobs/status` (`rule`) and the Admin Console.

Written after the 31 Oct 2026 incident. **Goal: failures are impossible to miss, recover by themselves, and stale data is never shown as fresh.**
No system can promise zero failures (see "What cannot be guaranteed" at the end); this one makes sure the founder is told, the box heals, and the pages say when data is old.

## 1. What went wrong, and what now prevents it

| Incident cause (31 Oct) | What now makes it impossible to repeat |
|---|---|
| The admin switch "Heavy data loads" was OFF for a long time, every job skipped silently | The switch is a **time-boxed pause** (30 min default, 2 h, 12 h; longer needs a confirmation). It ends by itself; an old "off" with no expiry is read as "paused until 30 minutes after it was first seen". Results, calendars, quotes, alerts and report builds ignore it. The status shows who/until when. |
| Skips were only visible in a Redis note | Every non-start has a recorded reason: `job_runs` row (status `skipped`), `job_state.state_reason`, `GET /api/jobs/status`, admin banner. |
| Technical scores were 19 days old with nobody noticing | **Data-freshness invariants** (section 5) look at the newest DATA DATE, not at job success; a stale dataset forces its job to run now and alerts the founder in-app. |
| Three heavy jobs at once on 2 GB | Bulk jobs run strictly **one at a time** (`BULK_CONCURRENCY`, default 1), niced, `oom_score_adj +500`, after a memory/CPU gate. |
| Exact-minute slots lost the whole slot when a round was late | Nothing is a slot any more: each minute the supervisor asks "is it **due**?" (SLA breached, window open and not yet done, interval passed). A late supervisor finds the job still due. |
| A failed / OOM-killed / hung job waited for the next calendar slot | Retry after **30 min, then 60, then 120** (reset by a success); a hung job is killed by the watchdog and retried the same way; after 5 failures in a row the job is "held", the founder is alerted, and it is **still retried every 2 hours**. |
| Manual `docker compose exec` workers lacked an env var only start.sh exported | Fixed in `config.py` earlier; the supervisor starts jobs with the container's own environment. |

## 2. Architecture

```
start.sh (deploy/start.sh) -> nohup deploy/scheduler.sh
   scheduler.sh keeps alive (restart with a growing delay, max 5 min):
     1. python -m finlit.worker supervise      <- ALL scheduling
     2. drain-queue --loop                      <- on-demand lane (a visitor opened an unloaded stock), outside every gate
     3. refresh-commodities --loop              <- commodity prices (only when a source is configured)
```

`backend/finlit/jobs/`

| File | Role |
|---|---|
| `registry.py` | **Declarative list of every job** (name, command, class, priority, max runtime, memory weight, group, windows, interval, SLA, prerequisites, retry policy, env gate). Also `JobsConfig` (env knobs). |
| `schedule.py` | IST windows, market hours, expected-session rule (same as `prism_candles.expected_session`). |
| `due.py` | Pure functions: `evaluate(job, state, ctx) -> due / waiting / idle / held / disabled`, `sla_status`, `next_due_at`, retry delays. No I/O. |
| `supervisor.py` | The loop: decide, gate on memory/CPU, start, watch, retry, force on stale data, alert. |
| `runner.py` | Starts job processes (own process group, niced, `oom_score_adj`, log file, heartbeat file) and the fake used in tests. |
| `resources.py` | cgroup v2 / v1 / `/proc/meminfo` free memory, load average, disk percent. |
| `state.py` | `job_runs` (history) and `job_state` (current) in Postgres (migration `077_jobs.sql`); in-memory twin for tests. |
| `pause.py` | The time-boxed pause (`mf_meta` key `switch:loads`), legacy migration, expiry. |
| `freshness.py` | Data-freshness invariants per dataset (section 5). |
| `canary.py` | Daily value self-check against fresh provider calls (section 6). |
| `alerts.py` | In-app notification to every admin (no email), once per 6 h per problem; the web-process heartbeat watcher. |
| `status.py` | `GET /api/jobs/status`. |
| `probes.py`, `signals.py`, `cli.py` | cheap "is there work?" questions, Redis facts/lock/heartbeat, the `supervise` command. |

**Decision: the quote and alert loops are registry jobs, not bash.** The old per-minute light loops in bash had no memory gate, no history, no status and no retry. As registry jobs (`quotes`, `alerts-live`, `listing`) they get all of those. Nothing time-driven is left in `scheduler.sh`.

### Job classes and concurrency

* **bulk** (`technicals`, `ingest`, `score`, `prism`, `portfolios`, `score-mf`, `backfill-*`, `leadership`, `prune` ...): at most `BULK_CONCURRENCY` (default **1**) at a time, in priority order, first come first served among equals, `nice 15`, `oom_score_adj +500`, `MALLOC_ARENA_MAX=2`.
* **light** (results, calendars, quotes, listing, alerts, the fund data jobs ...): up to `LIGHT_CONCURRENCY` (default **2**) beside the bulk job. Jobs in one `group` (the fund jobs: `funds`) never run together.
* **ondemand** (`drain-queue`, `commodities`): their own always-on processes; listed in the status as "kept alive by scheduler.sh", never started by the supervisor, never gated.
* **Prerequisites**: a job always waits while a prerequisite is **running**. A prerequisite that is only **due** holds it back only while waiting makes sense: the prerequisite has finished nothing new since the job last succeeded **and** the job is still inside its SLA. A prerequisite in backoff or held does **not** block for ever. (Before 7 Nov 2026 any due prerequisite blocked: prism is due every 10 minutes and resumable jobs such as ingest and portfolios are due again 2 minutes after each time cap, so presets, score-mf and mf-screen waited three days.) A prerequisite that is due again but has already delivered something new to a due dependent **goes after that dependent** in the queue, and a prerequisite never starts while a dependent that reads its output is running (12 Nov 2026: prism, priority 40 and due every 10 minutes, took every slot of the night shift and presets, priority 42, never ran).
* **Nightly inputs** (`nightly_inputs=True`, score-mf only; task #281, 20 Nov 2026): inside the night shift (23:00 to 08:00 IST) "the prerequisite has finished something new" means **tonight** (since 23:00 IST), not since the job's last success. Without it, last night's portfolios were always newer than last night's score, so score-mf ran before the night's NAVs, fund facts and portfolios every night and scored a day-old picture (HSBC Small Cap Fund, fixed by the facts job at 05:05 IST on 20 Nov, missed that night's 04:05 score). The SLA rule still applies: past its 26 h promise the score runs on what is there, so it never stops. The facts job also gained a NIGHT window (it ran only at 05:00 IST, after the score).
* **Late jobs first**: among due bulk jobs, those past their SLA go first; a job that is only continuing (a resumable job back after its time cap or a restart) or is still inside its SLA goes to the back of the queue, by priority among its kind. A long or repeating job (ingest, portfolios, prism) no longer holds up the late ones (founder, 7 Nov 2026).
* **Own time budget below the limit**: a job with its own budget stops by itself well before `max_runtime_min` (score-all: `--max-minutes 70` against 90). Both were 90, so the watchdog killed every score run as a timeout and it never recorded a success.
* **A website deploy never stops a job** (founder, 14 Nov 2026; replaces "deploys wait for the jobs" of 13 Nov). The jobs run in their own container, the `jobs` service in `deploy/aws/docker-compose.aws.yml` (same image, entrypoint `deploy/jobs.sh`: migrate, then `deploy/scheduler.sh` with the supervisor, the on-demand report lane and the commodity loop); the website container has `JOBS_IN_APP=0` and starts none of them. `deploy.sh deploy` replaces everything **except** `jobs` (the website goes out at once; Caddy holds visitors' requests while it restarts), then runs `deploy.sh jobs`: the jobs container is moved to the new build only when the code the jobs run changed (the git ids of `backend/finlit`, `backend/finlit_technicals`, `backend/requirements.txt`, `Dockerfile`, `deploy/scheduler.sh`, `deploy/jobs.sh`; a website-only merge never touches it), and only when no long job is running: it asks the deploy gate (`python -m finlit.worker deploy-gate check`, `backend/finlit/jobs/deploy_gate.py`), which answers `wait` while a bulk or audit job runs and holds new long jobs back (Redis `jobs:deploy_hold`), so the running job finishes and the move goes in the gap, at most `DEPLOY_HOLD_MAX_MIN` (150) minutes later. Until then `$FINLIT_HOME/state/jobs_pending` exists and `auto-deploy.sh` asks again at every check (also when nothing new was merged or GitHub cannot be reached). `deploy.sh jobs force` or `auto-deploy.sh force` moves it at once. The jobs reach the site backend as `app:8001` (`SITE_API_HOST=0.0.0.0` on the private network only). Memory: `app` 500 MB, `jobs` 800 MB (`APP_MEM_LIMIT`, `JOBS_MEM_LIMIT`); the supervisor's memory gate reads the jobs container's own limit. Job logs are in the jobs container: `docker exec finlit-jobs-1 tail -n 50 /tmp/job-<name>.log`. Tests: `deploy/aws/test-deploy-jobs.sh`, `deploy/aws/test-auto-deploy.sh` (both in CI).
* **Memory gate**: a job starts only if `free MB >= weight` (bulk: weight + `JOBS_RESERVE_MB`, default 100, kept for the website), counting what was started in the same tick. Free memory = container limit minus usage plus droppable page cache. **A job that does not fit WAITS** ("waiting for memory: 300 MB free, needs about 550 MB"), is recorded, and is retried every tick: never skipped silently. A second bulk job also waits while the load average per core is above `JOBS_MAX_LOAD_PER_CPU` (3).
* After a (re)start bulk and fund jobs wait `BOOT_LOAD_DELAY_S` (240) for the web server to settle. Results jobs do not wait.

## 3. When is a job due?

Per job, each tick (60 s; and at once when a job ends):

1. **disabled** by an env gate: state `disabled`, reason shown, flagged `disabledByConfig`, **never counted as overdue**. (`FUND_LOADS_ENABLED` must be `1` for the fund jobs; `PRISM_PRECOMPUTE_ENABLED=0` stops Prism; `dhan-check` needs `DHAN_CLIENT_ID`.)
2. **backoff**: after a failure the job is not due before `retry_at` (30 / 60 / 120 min). Retries ignore windows and visitors.
3. Otherwise it is due when any of these holds:
   * freshness forced it (a dataset it owns is stale);
   * a retry is owed;
   * it never succeeded (first start / boot catch-up; not for jobs that send mail; the old `BOOT_LOAD_ENABLED=0` setting is ignored: scheduled work is never held back);
   * **a quiet window is open** and its last success is older than the window's `min_age_h`;
   * its **interval** has passed (inside its active hours / market hours; quotes follow visitors, `RESULTS_NEED_VISITOR=1` restores "only while a visitor is on the site" for the results jobs);
   * its **daily time** has passed without a success that day (`listing` 15:50, `alerts-daily` 19:10 ...);
   * a **probe** says there is work (technicals: more than 2% of reports behind; prism: unrated companies);
   * its **SLA is breached**: outside a window it runs if no visitor was active in the last 15 minutes, or once it is more than 2 hours late (or more than its SLA, if that is shorter) (**never starved**). With visitors present and less late than that it waits with the reason "waiting for a quiet moment". (Before 13 Nov 2026 the wait lasted up to 2 x the SLA: presets waited a whole day and the 12 Nov screen lists were never stored.)
4. The **admin pause** turns a due job into `waiting` ("paused by the admin until 14:35 IST; resumes automatically") for jobs that honour it (all bulk and fund jobs).

### Windows (IST, no daylight saving)

| Window | Hours | Used for |
|---|---|---|
| MORNING | 05:00 to 08:00 | the full catch-up chain: whatever the night missed, plus results, calendars, listing before the open (fewest visitors) |
| AFTER_CLOSE | 18:30 to 21:30 | technicals, candles, then price-sections, flows, macro, industry, AMFI NAV (from 21:10), facts, ETF, listing |
| NIGHT | 23:00 to 05:00 (wraps midnight) | the heavy loads: ingest-all, score-all, prune, funds, backfills, indices, audits |

A window instance is the specific open span, so NIGHT 23:00 Friday to 05:00 Saturday is one instance. Weekly jobs use a day rule evaluated on the IST date (leadership: Saturday, so it runs Saturday 00:00 to 05:00).

**The night shift (6 Nov 2026).** NIGHT and MORNING meet at 05:00, so 23:00 to 08:00 IST is one unbroken night shift: the jobs run back to back all night (bulk jobs one at a time, by priority). Inside the shift a job that failed is tried again after at most 30 minutes and a held one after at most 60 (`NIGHT_RETRY_MIN`, `NIGHT_HELD_RETRY_MIN` in `jobs/due.py`; by day the waits stay 30/60/120 minutes, at most 3 hours), so a failure at midnight gets several more tries before the morning. A long resumable job (ingest, prism, sectors ...) reaches its time limit, yields for 2 minutes and continues where it stopped, so it finishes inside the shift however long it takes.

## 4. The registry (every job, its SLA, window, class)

SLA kinds: `hours` a success within N hours; `active` N hours counted only from 08:00 to 23:59 IST (no false alarms at night); `session` a success after each trading day's data is final (18:30), overdue 12 h later; `none`. **Overdue = 1.5 x SLA** (that is when the founder is alerted). "w" = windows with minimum age; "int" = interval.

| Job (command) | Class | Pri | SLA | Schedule |
|---|---|---|---|---|
| results (`refresh-results`) | light | 1 | 1.5 h active | int 25 min 08-23; MORNING; ignores pause |
| results-light | light | 2 | 2 h active | int 55 min 08-23; MORNING; ignores pause |
| calendars (`refresh-calendars`) | light | 3 | 1 h active | int 40 min 08-23; MORNING; ignores pause |
| quotes (`refresh-quotes`) | light | 4 | none | every minute with a visitor, every 15 min if only alerts, market hours |
| alerts-live (`check-alerts --kind live`) | light | 5 | none | 15 min market hours, after quotes, only if alerts exist |
| lab-rsi (`refresh-lab-rsi --max-minutes 6`, needs `DHAN_CLIENT_ID`) | light | 6 | none | 15 min market hours; 15:45 weekdays (closing pass); limit 9 min, stops starting Dhan calls at 6; about 5,700 paced 5-minute candle calls a day (about 6% of the Data API cap, at most 1 a second, visitors first); Trading Lab RSI heatmap (docs/TRADING-LAB.md) |
| lab-candles (`refresh-lab-candles --max-minutes 6`, needs `DHAN_CLIENT_ID`) | light | 7 | none | weekdays from 15:55 IST, and AFTER_CLOSE from 19:30 for the shares the first run did not reach; catch-up on first start; limit 10 min, stops starting Dhan calls at 6; one paced 5-minute candle call per F&O share (about 210 for the first 89-day fill, then about 210 a weekday, at most 1 a second through the shared pacer, visitors first); a share already holding the session's 15:25 bar is not asked; into `candles_5m` (migration 146: about 100 days; TimescaleDB hypertable, compressed after 7 days, dropped after 100; on plain PostgreSQL the job deletes rows older than 100 days); Trading Lab Time Machine (docs/TRADING-LAB.md) |
| listing (`refresh-listing --force`) | light | 6 | 6 h | 30 min market hours; 15:50; AFTER_CLOSE; MORNING |
| canary | light | 7 | 30 h | MORNING; AFTER_CLOSE from 19:00 |
| alerts-flag / alerts-daily / screens / digest | light | 8-9 | none / 80 h / 80 h / 8 d | each window / weekdays 19:10 / MORNING weekdays / Sunday 19:10 (alerts reach the bell only and the digest sends nothing: no email since 19 Nov 2026, `finlit/mailpolicy.py`) |
| prune | bulk | 5 | 30 h | NIGHT; also removes accounts that never confirmed their email, made more than 7 days ago, with nothing else on them (no sign-in, session, saved state, plan or plan request; never an administrator), so a made-up sign-up cannot hold someone's mobile for ever (one account per mobile, migration 138; result key `unverified_accounts`, 24 Nov 2026) |
| **technicals** (`refresh-technicals`) | bulk | 10 | session, 12 h | AFTER_CLOSE and MORNING until the session is processed; probe re-runs every 30 min; a company Dhan holds no usable candles for (suspended, delisted, too few or too old sessions) is counted `unavailable` with its reason and keeps its stored view and date; it is not a job failure. A run where every company came back unavailable checks five large companies: if Dhan gives none for them either, the run is `failed` (an outage) |
| **candles** (`refresh-candles`) | bulk | 9 | session, 12 h | AFTER_CLOSE and MORNING (task #325, developer file 26): each company's daily candles from the exchange (Dhan, NSE first; BSE only where there is no NSE row) into `daily_candles`; three years on first sight, then only new sessions with five days of overlap; the longest-unloaded company first. **Finishes every night** (task #394, developer file 37, F1): time box 150 minutes, limit 160 (was 45 and 55, which left companies a night behind and the charts on 18 or 20 Nov); a run that still reaches the time box with companies left logs a warning, records `run:refresh-candles` as `partial` with `left` and exits partial, so the supervisor shows it degraded with the count and tries it again (the companies left are first in line). A full run that ends with the newest stored session (candles for at least 50 companies) older than the expected session also exits partial ("waiting for the exchange's <day> candles", task #394 PR #952), so a night Dhan's candles were not out yet is not counted done. **Probe `candles`** (at least 60 min apart): it runs again at any hour once the technicals run has confirmed from Dhan a session newer than the store's (`prism:tech:target` for today's expected session); a holiday or a morning before the candles are out is never work (25 Nov 2026: Dhan had the candles by 04:50 IST and the charts had waited for the next evening). A report built after this uses the exchange series for its price chart, averages and volume (`candles.apply`); a company with fewer than 60 stored candles keeps the provider's series. First load: `python -m finlit.worker refresh-candles --max-minutes 240` once |
| **price-sections** (`refresh-price-sections --max-minutes 40`) | bulk | 11 | session, 12 h | AFTER_CLOSE and MORNING, **after candles** (its prerequisite), and again whenever candles were stored after its last run (probe `price-sections`, at least 30 min apart) (task #394, developer file 37, F1 and W1): rewrites ONLY the six stored chart sections (`price-1M` ... `price-MAX`) of every stored report from `daily_candles`, no provider calls, a chunk of 50 companies at a time with a short pause, stepping aside while a visitor waits on a report. 1M, 6M and 1Y come from the candles (three years: a true 200-day average); the weekly 3Y gets `dailyAvailable` from the candles' coverage (3Y on daily candles, `?range=3Y&grain=daily`, is not stored: the API builds it per request from that one company's candles and keeps it in Redis 30 minutes, key `p3yd:`); the job refreshes Redis only for a company already cached there (it never loads uncached companies into Redis); 3Y, 5Y and MAX keep the stored weekly bars before the first full week the candles cover and add the weeks made from the candles, so 5Y and MAX are never cut short. A company whose stored chart and candles differ by more than 2% on the same day at the join (a split or bonus not yet absorbed) is left for its next full rebuild and counted `skipped_adjust`. Never writes the live quote (`provisionalLastBar` false, `priceAsOf` the last candle). Resumable: a chart already at its newest candle is skipped (`current`). Result at `run:refresh-price-sections` (companies, written, current, no_candles, behind, skipped_adjust, failed, left) |
| **sectors** (`refresh-sectors`; docs/SECTORS.md) | bulk | **95** (the lowest) | 8 d | **weekend nights only** (owner, 18 Nov 2026): Saturday 23:00 to Sunday 08:00 IST, and Sunday 23:00 to Monday 03:30 as a catch-up (`TimeRule` `WEEKEND_NIGHTS`; retries, continuations, freshness forces and a breached SLA all wait for it); **first in those hours** (owner, 21 Nov 2026, `first_in`: other bulk and audit jobs wait or are paused; section 4b), after technicals; probe `sectors-view` (a live set without the Sectors view gets it added in a few minutes, in these hours only; task #192, docs/SECTORS.md section 14); weight 450 MB (staged, peak 364 MB); 90 min per run, **resumable** (the full build takes about 2.5 h on the server); on by default, `SECTORS_JOB=off` switches it off |
| ingest-flagship / **ingest** (`ingest-all`) | bulk | 15 / 20 | 26 h | NIGHT (18 h), MORNING (14 h); 90 min per run, resumable |
| **score** (`score-all`) | bulk | 30 | 26 h | NIGHT, MORNING; after ingest |
| scores-live (`refresh-scores-live`) | light | 7 | none | probe (queue of just-reported companies), at least 3 min apart; MORNING; docs/REALTIME-SCORES.md |
| **prism** (`precompute-prism`, 2 shards) | bulk | 40 | 26 h | probe every 10 min + NIGHT + MORNING; after ingest and score |
| eod-candles (`refresh-eod`) | light | 8 | — | probe (26 Nov 2026): every 10 min from 16:30 to 23:30 IST on weekdays until both exchanges' end-of-day files (UDiFF bhavcopy, NSE and BSE) for today are loaded: every company's official close in one download each, into daily_candles (NSE first, BSE only without an NSE code), before Dhan's candles arrive; a file not out yet is the normal wait; a refusal or broken file is recorded partial (admin bell); freshness line "Closing prices (every company)" late at 19:30, stale at 22:30 IST (`finlit/eod_bhav.py`) |
| presets (`refresh-presets`) | bulk | 42 | 30 h | NIGHT, MORNING; after prism and price-sections (task #394 F4: the lists are built after the charts reach the newest candles; dated by the last session in the candles; a company whose candles end before that day, or with no trade in 5 sessions, is left off and counted); **probe `presets`** (at least 60 min apart): run again at any hour when the candles hold a newer list day than the lists were built on (`preset_meta` last_run asOf), found as the job finds it, so the lists move with the charts the same day (26 Nov 2026: the 25 Nov candles came in the morning, the lists still said 23 Nov) (docs/PRESETS.md) |
| scores-export (`export-scores`) | light | 44 | 30 h | probe: started by presets finishing a day with no file (presets is its prerequisite); back-fill 3 days a run in the night shift only; seconds (docs/SCORES-EXPORT.md) |
| stress (`refresh-stress`) | bulk | 43 | 30 h | NIGHT (20 h), MORNING (14 h); after ingest and macro; builds and stores every covered company's Stress Lab page and pack, largest first, resumable, 40 min of new companies per run, 150 s per company (docs/STRESS.md) |
| earnings-calls (`refresh-earnings-calls`, needs `GEMINI_API_KEY`) | bulk | 44 | 48 h | NIGHT, MORNING; bounded per run, resumable (docs/EARNINGS-CALLS.md) |
| company-brief (`refresh-company-brief`, needs `GEMINI_API_KEY`, else it records "not configured" and writes nothing; docs/COMPANY-BRIEF.md) | bulk | 46 | 72 h | NIGHT (20 h), MORNING (14 h); only companies with new filings, followed and largest first, at most `BRIEF_MAX_WRITES_PER_NIGHT` (6) model calls a night, resumable; stores DRAFTS, a person publishes |
| discovery (`refresh-discovery --max-minutes 40 --limit 300`, task #221; docs/DISCOVERY.md) | bulk | 48 | 30 h | NIGHT (20 h), MORNING (14 h); reads each company's newest investor presentation from Documents (first 80 pages) and puts the company in the 21 Discovery themes; only companies with a new presentation, or a failed read a day old; resumable with the `discovery` probe (a run that stops with presentations left runs again a few minutes later); task #255: also keeps each presentation's page text in `document_pages` for FinLit AI (a failure to keep it is logged and never stops the run) and prunes kept texts older than 400 days, 500 at a time (task #254: FinLit AI also keeps call transcripts, annual reports and results filings there, the newest of each kind per company; a company's newest annual report is kept until the next one); task #267: after the presentations, in the minutes they left (their limits unchanged), each company's newest call transcript and results filing (400 days) with the directory's call and results buckets, kept text first, downloads only when none is kept, at most 400 documents and 600 exchange requests a run, newest first; what is left (`sourcesUnreached`) keeps the probe asking (table `discovery_documents`) |
| news-sentiment (`score-sentiment --max-minutes 30 --limit 40000`, task #365) | bulk | 44 | 30 h | NIGHT (20 h), MORNING (14 h) and every 3 h; scores every news item and exchange filing of the last two years not scored yet (or scored by an older model) with the financial-news language model in `finlit/sentiment.py` (an int8 ONNX DistilRoBERTa exported at image build, read with onnxruntime on one thread, about 300 MB), newest first, 512 at a time, up to 40,000 a run; stores the score (P(positive) − P(negative), −1 to +1), the three probabilities, the model version and the time in `feed_sentiment`. Database only; continues where it stopped; with no model in the image it does nothing |
| feed-sort (`feed-sort --max-minutes 20`, task #309) | light | 45 | 30 h | NIGHT (20 h), MORNING (14 h) and every 3 h; when the feed's sorting rules change (`finlit/feed.py` SORT_RULES), re-sorts every stored filing once into result / document / news and its FinLit topic, 5,000 rows at a time by id, continuing where the last run stopped (progress in `mf_meta['feed:sort']`, the run at `/api/mf/status` as `run:feed-sort`); when the rules are current it does nothing. New filings are sorted as they are saved (`save_announcements` upserts and re-sorts a reloaded row) |
| concalls (`refresh-concalls --max-minutes 20 --limit 160`, task #278; docs/CONCALLS.md) | light | 49 | 12 h | NIGHT (20 h), MORNING (14 h) and every 2 h; the Concall Monitor: new call filings from the stored announcements into `concall_docs`, then each schedule, recording and transcript letter read once from the exchange (call date and time, audio link, earnings call or not; a transcript's text kept in `document_pages`); resumable: what is left is read on the next run; a file the exchange does not give is tried again (three tries, the reason kept) |
| ownership-insights (`refresh-ownership`, always on; docs/OWNERSHIP.md) | light | 47 | 36 h | NIGHT (20 h), MORNING (14 h) and every 3 h; after ingest; resumable: pass 1 builds a row for every company from the stored shareholding (database only), pass 2 makes the slow premium call (3 at a time, 120 a run, none started after 20 min), visitors' companies first |
| leadership | bulk | 45 | 8 d | Saturday NIGHT |
| **mf-returns** (`fill-mf-returns`) | light | 27 | 30 h | every 30 min, NIGHT, MORNING; after `mf`; fills the 1/3/5 year returns of every fund that has none from the public mirror of AMFI's data (held funds first, newest NAV checked against AMFI's); also run at once when a fund is added (`finlit/mf_fill.py`) |
| portfolios, score-mf, backfill-mf (funds, `FUND_LOADS_ENABLED=1`) | bulk | 50, 55, 60 | 26 h, 26 h, 8 d | NIGHT, MORNING; score-mf after that night's mf, facts and portfolios (nightly inputs) |
| mf-screen (funds, `FUND_LOADS_ENABLED=1`; `refresh-mf-screen`, docs/MF-FILTERS.md) | bulk | 57 | 30 h | NIGHT, MORNING; after facts, industry and portfolios; database only |
| backfill-history | bulk | 65 | 8 d | NIGHT, MORNING |
| backtest-leadership | bulk | 70 | 100 d | first Sunday of Jan/Apr/Jul/Oct, NIGHT |
| rebuild-metrics, short-history, history-probe, dhan-check, universe (Sunday) | bulk/light | 71-85 | 8-17 d | weekly NIGHT |
| indices, coverage, integrity, logos | light | 60-80 | 30 h (logos 60 h) | NIGHT, MORNING |
| **macro-outlook** (`refresh-macro-outlook`) | light | 22 | 30 h | AFTER_CLOSE from 19:40, MORNING; also every 6 h and as soon as a probe sees changed macro, commodity or company tables; after macro, flows-nse and flows; database only, never calls a source; never switchable off (docs/MACRO-OUTLOOK.md); dataset `macro_outlook` in the status |
| macro, flows-nse, flows | light | 19-21 | 30 h | AFTER_CLOSE from 19:10; flows twice; MORNING |
| macro: Brent step | light | | | Inside the macro job: Brent crude daily from the U.S. EIA (series RBRTE) when `EIA_API_KEY` is set in `/opt/finlit/.env.aws`; without it the dashboard tile says "Brent: source key not set" (nothing is invented). No free public 10-year G-sec feed is wired in yet: that tile shows a dash and its reason. |
| instruments, mf, facts, industry, etf (funds) | light | 22-26 | 30 h (mf 26, etf 80) | MORNING / AFTER_CLOSE from 21:10 / NIGHT (facts: NIGHT too since #281, so it runs before score-mf); etf weekdays |
| drain-queue, commodities | ondemand | - | - | always on (scheduler.sh) |

`backend/tests/test_jobs_registry.py` asserts every command the old bash scheduler ran is registered, and that each of its old time slots is covered by the same job at or before that time.

## 4b. The sector job on weekend nights (owner, 18 Nov 2026)

Market data changes only on weekdays and the sector build is heavy (about 2 h 30 min of one core, 450 MB), so it runs **once a week, on the weekend nights**, on the week's data up to Friday's close:

| When (IST) | What |
|---|---|
| Monday to Friday | never: weekday nights keep their full room for the daily chain (on 17 to 18 Nov it ran 23:00 to 03:36) |
| Saturday 23:00 to Sunday 08:00 | the weekly build, first (owner, 21 Nov 2026: other long jobs wait or are paused until it has finished), in 90-minute resumable runs that follow on at once; Saturday night is the lightest night (no new trading day) |
| Sunday 23:00 to Monday 03:30 | catch-up only, when Saturday's build did not finish; the last start is 03:30 so a 90-minute run ends by 05:00, before Monday morning's jobs |

**The sector job comes first in its hours (owner's written exception, 21 Nov 2026: "Saturday night till Sunday morning the sector job is given priority; other jobs can be stopped at that time").** On 21 Nov its build (about 1 h 50 min on the server: NSE download 7 min, plan 3 min, four score parts of 25 to 28 min, merge) had 3 of 4 parts done when its 90-minute slice ended at 00:31; it then went to the back of the queue and `score` took the long-job lane for the rest of the night. Now (`Job.first_in`, `Plan.first` in `jobs/supervisor.py`), inside these hours and while the sector job is due or running: it goes first and is never sent to the back after a slice; no other bulk or audit job starts ("waiting: the sectors job has this time to itself"); one already running is paused (recorded as "paused for the sectors job", never counted as a failure; resumable jobs continue where they stopped); light jobs (alerts, results, quotes) keep running beside it. When the build has finished (or is waiting out a retry after a failure), everything runs as usual. Tests: `tests/test_jobs_sector_first.py`.

How nothing else is affected otherwise: one bulk job at a time and the memory gate stay as they are (it waits for 450 MB + the 100 MB kept for the website); every other bulk job outranks it; a run stops at 90 minutes and the next continues, so a job that falls due goes first; the hours are checked before everything else in `jobs/due.py` (`evaluate`), so a retry after a failure, the continuation of a stopped run, a freshness force or a breached SLA never start it on a weekday; if a build fails, the last good Sector Pulse and Rotation keep serving with their date. Freshness: the board's data date is fresh up to 9 days old (a Friday board until the next weekend's run), late from 10 (one weekend missed), stale after 13 (two missed). The pages say "Updated every weekend, to the close of <Friday>". **Stop rule (owner):** if in two weekends it cannot finish inside these hours, or any other job slips because of it, it is switched back off and reported. It is on by default (no server step: it switches on when this code reaches the jobs container, through the usual gated jobs move); `SECTORS_JOB=off` in `/opt/finlit/.env.aws` switches it off (the setting is read when the jobs container is next recreated). Tests: `tests/test_jobs_registry.py` (the hours, the retry and continuation, the priority), `tests/test_jobs_freshness.py` (the weekly judgement).

## 5. Data-freshness invariants (a job can "succeed" and still leave stale data)

`jobs/freshness.py` runs inside the supervisor every 10 minutes and reads the **newest data date** of each dataset, compared with what the IST clock, the trading calendar and the declaration calendar say must exist now. Result in `GET /api/jobs/status` under `data` (and `dataFresh`). Each dataset: `expected`, `actual`, `lag`, `status` fresh|late|stale|unknown, owning `jobs`.

| Dataset (key) | Expected | late / stale | Owner |
|---|---|---|---|
| Stock quotes, ticker | market open: newest quote under 60 min old; after hours: taken after the expected session's close | 180 min / 14 h after the close is final | listing, quotes |
| Daily price history | reference large caps have the expected session's bar | 1 h after 18:30 + grace / +14 h | technicals, ingest |
| Index levels | fetched on demand; if market open and a visitor is looking: under 10 min | 30 min | (on demand) |
| Technical views | at most 2% of reports behind the expected session | after 19:30 / >25% behind and 10 h | technicals |
| Sector pulse (`sectors`) | the board's data date is within 9 days (built every weekend on the week to Friday; only while the job is switched on) | 10 days / +13 days | sectors |
| Prism ratings, FinLit IQs | newest row under 30 h | 60 h | prism, score |
| Quarterly results | no company whose declaration date passed still lacks figures: waiting yesterday = late, two or more days = stale (declaration is known by DATE only; target is 6 h, flagged at 24 h) | | results, results-light |
| Results calendar | refreshed under 3 h ago and upcoming dates exist | 12 h | calendars |
| IPO calendar, news, leadership | under 30 h / 3 days / 9 days | 96 h / 6 d / 14 d | calendars, leadership |
| Ownership insights (`ownership`) | last completed run under 40 h | 96 h | ownership-insights |
| FII/DII flows, ETF prices | the expected session | +3 h / +16 h | flows, etf |
| Mutual fund NAV | the last business day after 23:30 IST | one business day behind (could be an AMFI holiday) / two | mf |
| Fund scores | run under 40 h ago | 80 h | score-mf |

Holidays are not guessed: the expected session is `expected_session()` (latest weekday whose session is complete, today from 16:00 IST), lowered to the newest session the technicals job actually found when that is older (a market holiday).

**Stale = action**: the owning job is forced due now (bypassing windows and visitors, but not the admin pause or backoff), at most **2 times** per staleness episode and 10 minutes apart; if the data is still stale after the second run the founder is alerted ("FinLit data is stale: ..."). The counter clears when the data turns fresh.

**System checks**: disk usage of `/` (alert at 85%; the `prune` job runs nightly at the top of the bulk order), database size, refused provider keys (below).

## 6. Value self-checks (wrong data, not only old data)

* Existing guards stay: Dhan index level more than 10% from the one held is refused; a Dhan quote whose previous close is more than 25% from the price held falls back to FinEdge; the technical view refuses candles with gaps or a close outside the high/low.
* **Canary** (`jobs/canary.py`, command `canary`, twice a day): re-fetches RELIANCE, TCS, HDFCBANK, INFY, one small cap (market cap 200 to 2,000 Cr, picked by a daily hash) and the most recent listing, and compares our stored **price** (0.5% closed, 3% open), **market cap** (5% / 8%), **last daily close** (0.5%, only when our newest bar is the latest session's) and **latest quarter revenue and net profit** (0.5%) with the fresh provider answer. Any difference is listed in `GET /api/jobs/status` `canary.mismatches` with both values, `healthy` becomes false, and the founder is alerted. Tolerances are returned with the result. If the provider cannot be reached, `ok` is `null` (not "fine").

## 7. Alerts without SSH

Every active admin gets an in-app notification (the bell, link `/console`), at most **once per 6 hours per problem**. **No email** (the owner, 19 Nov 2026): the mail allowance (about 100 a day, free plan) is kept for members' password-reset links, so job and data alerts are in the bell and on the Data health tab only. They are raised (Redis key `jobs:alert:<problem>`; in-process fallback if Redis is down), when:

* a job is overdue by more than 1.5 x its SLA (`overdue:<job>`);
* a job fails 3 times in a row (`failing:<job>`; after 5 it is "held" and retried every 2 h);
* a dataset is stale after two forced runs (`stale:<dataset>`);
* the supervisor heartbeat is older than 5 minutes: **checked by the web process** (a task in the API app), because a dead supervisor cannot report itself (`supervisor`);
* a provider key is refused (HTTP 401/403 from Dhan or FinEdge): "The Dhan key is not accepted: update it in /opt/finlit/.env.aws" (`cred:dhan`, `cred:finedge`);
* disk 85% full (`disk`); the canary found a mismatch (`canary`).

**Admin Console, Data health tab**: a banner (`JobsBanner`) lists everything above in plain words; green when healthy. **Public results page** (`/results`, `/results/quarter`): the neutral line "Results refresh is delayed; we are retrying." when a results job is late (`resultsDelayed`).

### Reading `GET /api/jobs/status` (public, read-only, no secrets, no addresses)

```
healthy        true only if: supervisor alive (heartbeat under 5 min), database readable, nothing overdue, no refused key, canary not failing, no stale dataset
healthNote     the reasons when false
overdue        jobs past 1.5 x SLA            failing  jobs with 3+ failures in a row
supervisor     { alive, heartbeatAgeSeconds, running: [...], dbOk, startedAt }
pause          { paused, untilIST, resumesAutomatically, setBy: "admin", legacy }
jobs[]         per job: state idle|due|waiting|running|held|disabled, reason, lastSuccessAt, ageHours, slaHours, slaKind,
               late, overdue, nextDueAt, consecutiveFailures, retryAt, held, disabledByConfig, disabledReason
disabledByConfig  jobs switched off by an env variable, with the fix (never "overdue")
data / dataFresh  the freshness table of section 5       canary  the section 6 result
resultsDelayed true when a results job is late            system  diskPercent, databaseMb
```

By hand: `docker compose exec jobs python -m finlit.worker jobs-status` (same JSON), `... supervise --dry-run` (what is due and why, starts nothing), `... supervise --once` (starts what is due now, waits for it, prints the table; refused while the daemon holds the lock).

## 8. Retry rules

| Event | Result |
|---|---|
| exit code in `ok_exit` (0; audits also accept 1) | success, failures reset to 0 |
| other exit code, killed by a signal (OOM kill = SIGKILL), could not start | `failed` / `killed`; failures + 1; retry in 30, 60, then 120 minutes |
| ran past `max_runtime` | process group stopped (TERM, KILL after 20 s), `timeout`; retry in 30 min (counts as a failure) |
| a **resumable** job reaching its time cap | `timeout`, **not** a failure; continues in 2 minutes (other bulk jobs get their turn first) |
| no output and no heartbeat for `stall_min` (25 min default) | treated as hung: stopped, `timeout`, retry in 30 min |
| 5 failures in a row | `held`: alert; still retried every 2 hours |
| supervisor restarted mid-run | stale `running` rows become `killed`, leftover processes are stopped, retry in 1 minute (no failure counted) |

Jobs print progress (log file under `/tmp/job-<name>.log`); the worker also touches `FINLIT_JOB_HEARTBEAT` every 20 s while its event loop is alive. Liveness = newest of log write and heartbeat.

## 9. Admin pause

Header lock icon > System > "Heavy data loads" switch. Switching OFF pauses for the chosen length (30 min default, 2 h, 12 h); the line "Paused until 14:35 IST, resumes automatically" shows the end. API: `POST /api/admin/system/loads {"enabled": false, "minutes": 120}`; more than 12 hours needs `"confirmLong": true` (422 `confirm_long_pause` otherwise). Switching ON resumes at once. At the expiry the supervisor (and any status read) treats the loads as running and writes `resumedAuto`. A row from before this change ("off", no expiry) is read as paused until 30 minutes after first seen, and logged.

## 10. Resource knobs (environment, all optional)

| Variable | Default | Meaning |
|---|---|---|
| `BULK_CONCURRENCY` | 1 | bulk jobs at once (2 only on a 4 GB box) |
| `LIGHT_CONCURRENCY` | 2 | light jobs beside the bulk job |
| `JOBS_TICK_S` / `JOBS_POLL_S` | 60 / 5 | decision period / process check period |
| `JOBS_RESERVE_MB` | 100 | memory left for the website when starting a bulk job |
| `JOBS_MAX_LOAD_PER_CPU` | 3.0 | a second job waits above this 1-minute load per core |
| `BOOT_LOAD_ENABLED` | 1 | ignored (kept so an old `.env.aws` line does no harm): first-start loads always run |
| `BOOT_LOAD_DELAY_S` | 240 | bulk jobs wait this long after a start |
| `FUND_LOADS_ENABLED` | 1 | ignored: the fund/ETF jobs are always on |
| `PRISM_PRECOMPUTE_ENABLED` (ignored: always on), `PRISM_WORKERS` (2) | 1 | shards per Prism run |
| `INGEST_LIMIT`, `INGEST_PARALLEL` (2), `NIGHT_INGEST_MAX_MIN` (90) | | ingest-all size, parallelism, cap per run |
| `RESULTS_NEED_VISITOR` | 0 | 1: results jobs run only while a visitor is on the site |
| `QUOTES_EVERY_MINUTES` | 1 | quotes period while a visitor is on the site |
| `JOBS_WATCH` | 1 | 0 switches off the web process's supervisor watcher |

### Memory plan and swap (2 GB t3.small)

* **Swap**: `deploy/aws/bootstrap.sh` creates a 2 GB swapfile if none exists (idempotent; swappiness 10, vfs_cache_pressure 50). On the existing server, one line (safe to repeat, does nothing if swap exists): `swapon --show | grep -q . || (sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab && echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-finlit.conf && sudo sysctl --system)`. Check with `free -m`.
* **Limits** (`docker-compose.aws.yml`): app 1200 MB, db 640 MB, redis 320 MB, caddy 128, backup 128 (runs 02:00 only). They are ceilings, not reservations (sum 2.4 GB against 2 GB RAM + 2 GB swap); do not raise the app limit on this box. A bulk job's memory weight (250 to 450 MB) is checked against what is actually free inside the app's limit.
* **OOM order**: job processes get `oom_score_adj +500` (set in the child before exec), so when memory runs out the kernel kills a job first and the API survives; db, redis and caddy get `-300` in compose. The killed job is retried within 30 minutes.
* **Optional upgrade (founder decision, costs money)**: a t3.medium (4 GB, about double the t3.small price) would allow `BULK_CONCURRENCY=2` (e.g. technicals beside ingest) and an app limit around 2.4 GB. Not needed for correctness; the sequential design is sized for 2 GB.

## 11. How to add a job

1. Make sure `python -m finlit.worker <command>` exists, exits 0 on success, prints progress lines, and is resumable if long.
2. Add a `Job(...)` in `registry.py` with class, priority, `max_runtime_min`, `weight_mb`, a schedule (`windows` / `interval_min` / `daily_at` / `probe`), an `Sla`, `prerequisites`, `resumable`, `gate` (if an env switch controls it), and `owns=(dataset keys)` if it keeps a freshness dataset current.
3. If it owns a dataset, add or adjust the check in `freshness.py`; every dataset's `jobs` must name registered jobs (tested).
4. Add the due-ness case to `tests/test_jobs_registry.py` (schedule coverage) and run `pytest tests/test_jobs_*.py`.
5. Add a row to the table in section 4.

## 12. Failure-mode table

| Failure | Detected by | Recovers by itself | The alert says | The founder does |
|---|---|---|---|---|
| Provider down or erroring (FinEdge/Dhan/NSE/AMFI) | job exit != 0 or no new data date | retry 30/60/120 min (held after 5, still every 2 h) | "job failing: X" after 3 failures; "data is stale" if the date stays old | Nothing; if it persists check the provider's status page. Pages keep showing the last good data with its "as of" date. |
| **Dhan token expired / key refused (401/403)** | `report_refused` flag from `dhan.py` | Dhan auto-renews when PIN and TOTP secret are set; otherwise no | "The Dhan key is not accepted: update it in /opt/finlit/.env.aws" | Put a new `DHAN_ACCESS_TOKEN` (or check PIN/TOTP), `docker compose up -d app` |
| **FinEdge key invalid/expired** | `report_refused` from `finedge.py` | no | "The FinEdge key is not accepted ..." | Update `FINEDGE_API_KEY` in `/opt/finlit/.env.aws`, restart the app |
| Rate limit (429) | clients retry with back-off; job failure if persistent | retried | failing/stale as above | Nothing; lower `PRISM_WORKERS`/`INGEST_PARALLEL` if frequent |
| Database storage full | job errors; `databaseMb` in status | no | job failing (disk errors) | Free space / grow the volume; run `prune` |
| **Disk full (box was 62%)** | `system.diskPercent` >= 85% | the server itself: from 78% full `auto-deploy.sh` runs `deploy.sh clean` (build cache capped at 2 GB, unused images removed; at most every 30 min; and once a day whatever the disk says: build cache, unused images, stopped containers, rotated logs older than 14 days) and every deploy does the same from 75% (the nightly `prune` job only clears old database rows, not Docker) | "FinLit server disk is almost full" | `bash /opt/finlit/src/finlit-platform/deploy/aws/deploy.sh clean`, then `docker system df` and `du -xh / --max-depth=2 \| sort -h \| tail`; clear old backups/logs, grow the EBS volume |
| Memory pressure | memory gate; OOM kill = SIGKILL | job waits (never skipped) or is killed first (+500) and retried within 30 min | none unless it repeats (then failing/overdue) | If frequent: keep `BULK_CONCURRENCY=1`; consider the 4 GB instance |
| Container restart mid-job | stale `running` rows | supervisor start marks them killed, stops leftovers, retries in 1 min | none | Nothing |
| Redis flushed/restarted | lock/heartbeat/visitor keys vanish | keys rewritten next tick; alert rate-limit falls back to in-process | none | Nothing |
| Clock / timezone error | all rules are IST via `zoneinfo` (container TZ=Asia/Kolkata); tests use a fake clock | n/a | datasets late/stale if the host clock is wrong | `timedatectl`; fix NTP |
| Supervisor crash | heartbeat age > 5 min (web-process watcher) | scheduler.sh restarts it (5 s, doubling to 5 min); Redis lock prevents two | "FinLit background jobs are not running" | `docker compose restart app` if it persists; read `/tmp/job-supervisor.log` |
| Hung job | no output/heartbeat for 25 min or past max runtime | killed, retried in 30 min | failing/overdue if it repeats | Read `/tmp/job-<name>.log` |
| **Schedule misconfiguration (FUND_LOADS_ENABLED=0)** | gate in the registry | n/a | status `disabledByConfig` + banner note (not "overdue") | Set `FUND_LOADS_ENABLED=1` in `.env.aws` |
| Admin pause left on | expiry | resumes at the end | banner note while paused | Nothing |
| Postgres down | tick fails, heartbeat says `dbOk: false` | next tick retries; running jobs keep being watched | supervisor/health false | Check the db container |
| Provider sends wrong numbers | canary (section 6) | no (it cannot know which side is right) | "canary found data that differs" | Compare with the provider's own site |

## 13. Runbook: what to do when ...

* **Open `/api/jobs/status`.** `healthy: true` and `dataFresh: true` = nothing to do.
* *`supervisor.alive` false*: `docker compose logs --tail 100 app | grep supervisor`; `docker compose restart app`.
* *A job is `overdue`*: read its `state` and `reason`. "waiting for memory" for hours: something else is using the box (check `free -m`, `docker stats`). "paused": see `pause`. "disabled": the env fix is in the reason.
* *A dataset is `stale`*: the owner job was forced twice already. Read the job's last result (`jobs[].lastStatus`, `/tmp/job-<name>.log`), then the provider status.
* *Run a job now*: `docker compose exec jobs python -m finlit.worker <command>` (the supervisor does not mind; it will see the new success).
* *Heavy loads need to be stopped for a while*: System > switch off; it resumes by itself.
* *After a deploy*: nothing; the supervisor starts with the container, reconciles, and catches up whatever is due (in priority order, one bulk job at a time).

## 14. What cannot be guaranteed

* **Third-party outages** (FinEdge, Dhan, NSE, NSDL, AMFI): when a provider is down the data cannot be fresh. The system retries, tells the founder, and the pages show the date of the data they hold.
* **Wrong data from the provider itself**: the canary and plausibility guards catch differences between our copy and the provider's fresh answer and absurd jumps, not an error the provider repeats consistently.
* **Declaration time**: results are known by date, so "figures within 6 h of the declaration" is enforced as "same day / next day", not to the hour.
* **Holidays** are inferred (the newest session actually found), not read from an exchange calendar.
* Everything here was tested with a fake clock and fake processes; the real process runner, cgroup memory reading, `oom_score_adj` and email delivery can only be proven on the server (first-deploy checklist in `deploy/aws/README.md`).


## Scheduled jobs are never switched off (founder's rule)

**Background jobs NEVER stop: every scheduled job runs every day and completes every day** (see the rule at the top of this file).

* The environment switches `FUND_LOADS_ENABLED`, `PRISM_PRECOMPUTE_ENABLED` and `BOOT_LOAD_ENABLED` can no longer disable or hold back a job (`Gate.forced` in `jobs/registry.py`). The one written exception: the sector job, switched off on 7 Nov 2026 and back on weekend nights since 18 Nov 2026 (section 4b; `SECTORS_JOB=off` switches it off). Only a missing credential (no `DHAN_CLIENT_ID`, no `GEMINI_API_KEY`) keeps a job from starting, and the status says so.
* The admin pause is ignored inside the MORNING, AFTER_CLOSE and NIGHT windows and for any job already past its promise (SLA). It can only hold daytime, not-yet-late work.
* A job that cannot start because the server lacks memory waits and says so; it is never skipped, and it does not block the other jobs.

## 7. The time-limit contract (why `coverage` can never again fail 19 times in 3 days)

**What happened (3 Nov 2026):** the nightly `coverage` audit rebuilt 80 random companies from the provider (about 30 calls each) and saved nothing until all 80 were done.
With a 20-minute limit and a slow provider it was killed at the limit every night with nothing saved, 14 times in a row; the page said "overdue". Meanwhile its
15-minute runs held one of the two light slots, so results and calendars waited behind it ("waiting for a free light slot").

**What now makes that class of failure impossible to write again (all enforced by tests, `tests/test_jobs_limits.py`):**

1. **Every job declares what happens at its time limit** (`LIMIT_POLICY` in `jobs/registry.py`, or `resumable=True`): `resume` (it continues where it stopped),
   `deadline` (it stops starting new work by itself before the limit and records what it did; the flag must be in its command and below the limit),
   `fixed` / `database` (a small fixed amount of work, or no provider calls), or `measured` (no hard bound known; watched by the early warning).
   A new job without a declaration fails the build. A `measured` note that names a limit that is no longer the job's limit fails the build.
2. **Every scheduled command is checked against the worker's real argument parser** (`worker.build_parser()`), so a renamed or mistyped flag fails in the tests, not at 3 a.m.
3. **`audit` is a lane of its own** (`AUDIT_CONCURRENCY`, default 1): slow, never-urgent checks (`coverage`, `integrity`) can never take a light slot that results, calendars or quotes need.
4. **Early warning:** `/api/jobs/status` has `nearLimit`: a non-resumable job whose last runs used 70% or more of its limit twice, or that hit its limit in one of the last
   three runs, is shown on the admin Data health banner ("coverage is using 76% of its 22-minute time limit") before it starts failing. Resumable jobs are not judged.
5. **`coverage` itself** (`audit-coverage --sample 60 --max-minutes 13 --record`): no new company is started after the deadline, what was checked is recorded, one company that
   hangs is given up after 150 s, and if not one company could be checked (the provider did not answer) it exits 2, a real failure.

**What still cannot be guaranteed:** the data providers (FinEdge, AMFI, Dhan) will sometimes be slow or down; AMFI does not answer from the AWS address range (the fund
facts job then reports "degraded" with the last good figures kept). A restart of the app (a deploy) ends the jobs in progress ("killed: the supervisor restarted", no
failure counted) and they start again. The difference is that none of this can now silently turn into "killed at the limit with nothing saved", and a job drifting towards its limit is reported first.


## 12 Nov 2026: quotes split its work; sector freshness follows the sector job

- **quotes** timed out every run from 11 Nov (held after 8 timeouts): with about 5,800 reports one run read and rewrote every company's stored summary at once. It now updates 24 companies at a time, stops starting new ones after 7 minutes (inside its 10-minute limit, which is unchanged) and the next run starts with the companies this one did not reach (`quotes:cursor` in Redis). One company failing no longer fails the run.
- **Sector pulse** is judged by the freshness check only while the sector job is switched on (`SECTORS_JOB`). While the founder's written exception keeps it off, the console shows it once, as "switched off by configuration", instead of also as a red "stale" line.

## 17 Nov 2026: quotes ends inside its limit whatever is slow

- **quotes** hit its 10-minute limit twice in a row on 17 Nov (market hours). The server log showed the main cause: the follow-up of every updated price (live FinLit IQ rows, screener numbers) ran once, after the 7-minute budget and outside it. #504 fixed that: companies are priced in slices of 240, each slice followed up before the next starts, all inside the budget.
- Two steps the budget still did not cover now have limits too (the job's 10-minute limit is unchanged): the Dhan batch calls before the first slice get 90 s (`QUOTES_DHAN_S`; each call can take up to 4 tries of 20 s, and the account's call pacing is shared with the Prism price-history lane; slower means FinEdge for that run, as for a Dhan error), and one company gets 30 s (`QUOTES_COMPANY_S`; a slower one is reached again by the cursor).
- The command takes `--max-minutes` like the other self-stopping jobs (registry: `refresh-quotes --max-minutes 7`), so `test_jobs_limits.py` checks the deadline stays at least 3 minutes inside the limit.
- Each scheduled run prints a progress line every minute (the hang check reads the log) and a last line with each phase's time, e.g. `quotes: done in 412 s: 3120 updated, 5470 of 5470 companies reached; phases dhan 6.2 s, prices 371.0 s, follow-up 34.9 s`. If it nears the limit again, that line says which phase took the time.
- Tests: `backend/tests/test_quotes_phase_limits.py` (a Dhan call that never answers, a company that hangs, the progress and phase lines, a manual run without a budget unchanged, the limits).
