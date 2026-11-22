# Nightly scores export (task #326)

An internal data feed for the owner's archive (SPEC of 22 Nov 2026, Pranjal): one small file per market day with every scored company and every ready-made
screen of the Advanced stock screener. No page, no member feature, no download for any plan.

## The two links (HTTPS only)

| Link | Returns |
|---|---|
| `GET https://finlitventures.com/internal/export/scores/dates` | `{"dates": ["2026-11-19", ...]}`: every day a file exists for, oldest first |
| `GET https://finlitventures.com/internal/export/scores?date=YYYY-MM-DD` | that day's file, `application/json` (gzip-encoded when the client sends `Accept-Encoding: gzip`); `404` when there is none |

Both need the header `X-Export-Key: <key>`. Missing or wrong key, or no key set on the server: `401`. A request that did not reach the site over HTTPS
(`X-Forwarded-Proto` from Caddy, or Cloudflare's `CF-Visitor`) is refused with `403`, so the key is never accepted on the plain `http://` address.
Neither link touches the database: `/dates` lists the folder and the other returns one file. Code: `backend/finlit/scores_export_api.py`.

### Setting the key (once, on the server)

1. In the server window (`ubuntu@ip-...`): `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`. Copy the line it prints.
2. `sudo nano /opt/finlit/.env.aws`, add `EXPORT_KEY=<that line>`, save.
3. `bash /opt/finlit/src/finlit-platform/deploy/aws/deploy.sh compose up -d app` (recreates the website container with the new setting; only the app reads the key, so the jobs container and its running jobs are left alone).
4. Put the same key into the Mac program. Never in a ticket, chat, the repository or the workspace.

## The job

`scores-export` (`python -m finlit.worker export-scores`, `backend/finlit/scores_export.py`):

- **When:** started by the `presets` job finishing (its probe sees that presets has stored a day with no file yet; presets is its prerequisite, so it never reads
  while the lists are rewritten). No clock time. Presets runs in the night shift after the Prism batch; on 22 Nov 2026 it finished at 03:36 IST, so a day's
  file normally appears between about 23:30 and 04:30 IST of the night after that day. The Mac's evening download picks up the previous market day.
- **Which day:** `date` is the session the presets job built its lists for. No file for a weekend or a market holiday (a day with no closes for the reference
  companies, or that the technicals job found the market did not print).
- **What it reads, stored results only** (nothing recomputed, no screen rule run):
  - screens: `screen_runs` / `screen_snapshots` / `screen_spells` (the lists, order and Added day the screener page serves, default chips), `gainers` (Top gainers);
  - the finished day, while its close is current (until the next session opens at 09:15 IST): the screener's own table (close, day change as the site shows
    it, market cap, returns, 52-week high, F&O) and the newest stored Prism card of each company;
  - an earlier day (back-fill, or a late run): `prism_history` (the rating and technical views recorded before the next session opened), `price_daily` (close,
    day change against the previous close; on a split or bonus day a change of 20% or more is null, never -50%), and that day's screen rows (market cap,
    returns, F&O of the companies on a screen). Fields not kept per day are **null**, never today's figure: market cap, size, returns, 52-week high and F&O of
    companies not on any screen that day.
  - every day: ISIN, NSE symbol (BSE code for BSE-only companies) and the three NSE classification levels (`company_classification`), the name (`companies`),
    the leadership tag of the weekly run in force (`leadership_history`).
- **Files:** `/data/exports/scores/scores_YYYY-MM-DD.json.gz` in the `scores_export` Docker volume (shared by the app and jobs containers, kept across deploys).
  Written under a temporary name and linked into place; an existing day is never replaced. Each file is checked with the owner's own checker
  (`finlit/scores_export_check.py`, the pack's `check_export.py` unchanged) before it is written. The newest 120 files are kept.
- **Back-fill** from 3 Nov 2026: three days a run, only in the night shift (23:00 to 08:00 IST), oldest first, only days whose screen lists were stored. The
  screen history starts on 11 Nov 2026, so 3 to 10 Nov cannot be made (no stored lists); a day the checker refuses is recorded in
  `.not_reconstructable.json` in the folder and not tried again.
- **Screen ids** are the site's own (`momentum-leaders`, `highest-rated-large`, `strong-results`, `sector-leaders-leading`, ...); they do not change from day to day.
  A screen the presets job did not store for that day is left out (named in the job's notes), never listed as empty; a stored screen with no company is `"rows": []`.

Check a file by hand: `python -m finlit.scores_export_check scores_2026-11-24.json.gz` prints `OK`.
