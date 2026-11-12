# Stress Lab on the site (task 79)

Engine: `backend/finlit_technicals/stress.py` (v2.1.1, vendored; the 2.1.1 patch makes a level that sets any raw-material share set the whole mix, so Reliance, IOC, Titan, MRF and 15 more build). API: `backend/finlit/stress/` (`page.py` payload and plan rules, `service.py` inputs, `router.py` routes). Tests: `tests/test_stress_api.py`, `tests/test_stress_exposure_groups.py` (all 471 launch companies get valid settings; `tests/stress_launch/launch-universe-2026-11-09.csv`).

| Route | Plan | |
| --- | --- | --- |
| `GET /api/stress/{SYM}/page` | Silver, Gold | the page payload. Silver gets Today, Crude eases, 2022 and 2020 only, plus the names of the locked ones (`locked_scenarios`) |
| `POST /api/stress/{SYM}/run` | Gold | one scenario on the server (preset and/or sliders, clipped to the spec ranges; `settings` = the six "your value" boxes) |
| `POST /api/stress/compare` | Gold | two companies, one shock |
| `GET /api/stress/{SYM}/peer` | Gold | `default_peer()`: the first covered peer with results to the same quarter |

* **Covered:** large and mid caps (market cap 10,000 Cr or more) that are not banks, NBFCs or insurers (the screener table decides, `service.covered_by_rule`), with three years of results. Others get a 404 `not_covered` whose message the page shows as it is. Rebuild `launch-universe-*.csv` on launch day.
* **Inputs** are what the site already holds: the stored report sections (summary, financials, peers), the premium statements kept in Redis, the macro table (CPI, WPI, GDP, repo, USD/INR, Brent) and `price_history_long` weekly closes. Nothing new is called except one macro step: `eia_steo` (nightly, needs `EIA_API_KEY`) stores the EIA outlook for the next four quarters; without it the "Crude eases" scenario is not offered.
* **The value move** is a percentage and never a price. `STRESS_SHOW_VALUE=0` removes it from every answer (`flags.showValue` tells the page).
* **Latest-quarter check and inventory days** (task 79): `page.latest_quarter_check()` replays the latest reported quarter against the same quarter a year earlier (crude, rupee and inflation averaged over each quarter, volume from revenue less WPI) with the company's own settings, and sets the margin it gives beside the margin reported (Asian Paints: 17.6% before, 13.9% model, 15.6% reported). Inventory days come from the stored ratios. Either one is a blank on the page when its data is missing. The company logos come from the site's shared logo list.
* **Still to do before launch** (content, not code; START-HERE): fill the exposure table (50 company rows, the 84 industries without a row, from annual reports), run the back-test gate on those 50, set `EIA_API_KEY` on the server so "Crude eases" is offered, the FinEdge answer, the adviser's view on the value move.

## Fixes after the live check of 12 Nov 2026 (task 79, SL-1 to SL-8)

- **Rupee series (SL-1).** `finlit/macro.py` step `rbi_fx_archive` reads the RBI reference-rate archive and fills every completed month that `usdinr_m` is missing, then the daily FBIL points keep it current. The page shows `FinLit usdinr` as the source only when the numbers came from that series. Until the archive step has run, `finlit/stress/data/usdinr_monthly_stopgap.json` (x-rates.com monthly averages, Apr 2025 to Oct 2026) is used and the payload says `usdinr argument`, never a source it did not use. Remove the stop-gap file once `/api/macro` shows the months.
- **Stored pages (SL-2).** Job `stress` (`finlit/jobs/registry.py`, CLI `python -m finlit.worker refresh-stress`) runs after ingest and macro, builds the page payload for every launch company and stores it in `stress_pages` (migration 099). Failures and their reasons go to `stress_failures` and the log. It is resumable and never stops other jobs. `GET /api/stress/{SYM}/page` serves the stored payload; if none exists it builds live under a time limit (`LIVE_BUILD_S`), and the nightly build has its own limit per company (`PER_COMPANY_S`). Only Gold `/run` and `/compare` with custom inputs compute live.
- **Never blank, plain errors (SL-3, SL-4).** The page shows a skeleton while loading and a plain card ("Stress Lab for this company is being prepared. Please check back later.") with a link to the company report. The 503 body carries only that sentence; the reason stays in the log and `stress_failures`.
- **Quick picks (SL-5).** `GET /api/stress/quick-picks` returns the largest covered companies that have a stored page.
- **Compare (SL-7).** `/compare` has a "Stress test" tab (Gold) that opens the Gold compare view for the two companies.
- **Look (SL-8).** The page has a dark palette (`stresslab.css`, switched by `data-theme` on the host); i buttons open on hover, focus or tap and stay inside the screen; the public payload no longer carries calibration weights or the year-by-year working.
- **Still the owner's:** the EIA key (`EIA_API_KEY` in `/opt/finlit/.env.aws`) and the 50 company rows (`docs/stress/company-rows-first-50.csv`, loader `scripts/stress_company_rows.py`).
- **After every deploy:** run the team's `live_check.py --only stress`; S1, S2 and S3 must pass, and S4 shows `FinLit usdinr` once the archive step has filled the months.

## How the nightly run behaves (12 Nov 2026 fix)

- A company whose report or statements are not stored yet, or whose statements the data provider answers slowly, is **waiting**, not a fault: it is recorded in `stress_failures` (kind `not_ready` or `failed`, with the reason) and tried again on the next run. These never fail the job.
- The run exits with an error only when it tried at least 10 companies and built none (the provider or the macro inputs are down); the supervisor then retries with its back-off. Every other run exits cleanly and the next run continues where this one stopped, so the job never stops after a few failed attempts.
- Three companies are built at the same time (`CONCURRENCY`), because the provider's statements are the slow part. Companies that failed in the last 6 hours go to the back of the queue, so each run first spends its time on companies not tried yet.
- Each run writes one log line, `stress run: covered N, built N, not covered N, not ready N, failed N, left N ...; reasons {...}`, and the reasons per company are in the table:
  `docker compose exec db psql -U finlit -d finlit -c "select kind, left(reason,90), count(*) from stress_failures group by 1,2 order by 3 desc"`.

## Pages are built on demand too (12 Nov 2026, evening)

The nightly `stress` job waits its turn behind the other bulk jobs, and every deploy restarts the app (which stops a running job), so on a busy day it may not reach every company. The pages no longer depend on it alone:

- **A visit builds the page.** When a company has no stored page, the visit starts a build (or joins the one already running; one build per company) and waits at most `LIVE_BUILD_S`. If that is not enough the reader gets the plain "being prepared" card, but the build is **not cancelled**: it carries on (limit `PER_COMPANY_S`) and stores the page. Before this, a slow data provider meant the build was cancelled at 8 seconds and the page stayed "being prepared" for ever.
- **The page checks again by itself** every 20 seconds for about five minutes, so it appears without a reload.
- **The start page warms the largest companies**: while fewer than six quick picks are ready, opening the start page starts background builds for the 12 largest covered companies that have no page (at most three at a time), and the quick picks look again every 30 seconds.
- Failures still go to `stress_failures` with the reason, and the nightly job still builds every company.
