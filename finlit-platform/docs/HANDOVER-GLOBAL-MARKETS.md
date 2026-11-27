# Handover: Trading Lab, Global markets (27 Nov 2026, 00:30 UTC)

Read this first, then `finlit-platform/CLAUDE.md`, `docs/TASK-PROMPT.md`, `docs/GLOBAL-MARKETS.md` (research, every source's terms, the founder's
decisions), `docs/TRADING-LAB.md` and `docs/HANDOVER-TRADING-LAB.md`. Another Claude chat owns the rest of the Trading Lab (Trading journal,
OI Flow, RSI heatmap, Stock radar, Time Machine, Signals desk, F&O Academy); do not touch those.

## Founder's rules (follow verbatim)
- One task at a time start to finish: own branch, own PR, CI green on the PR head, squash-merge, verify LIVE (desktop 1440 / phone 390, light /
  dark, hover cards), then report. Never two tasks in one PR. Never merge with a failing or skipped test.
- **Parallel is wanted**: while one PR waits for CI (about 90 minutes), build the next task on its own branch. Quality first.
- Decide, don't ask; record decisions in the PR and docs. Report per task: cause, checklist table, tests, upgrades, open items, links; then the
  workspace done note: `POST https://workspace.finlitventures.com/api/tasks/397/updates`, header `x-member-id: 5`, form `body` (use
  `--form-string`): `<what changed> | <where> | <PR link> | <how to check>`.
- Describe, never advise (no buy/sell/hold/target/best/forecast words); only the Signals desk is an exception. The disclaimer stays.
- Everything free; no secrets in chat or repo. No model names in commits/code. Trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` +
  your own `Claude-Session:` link. PR body ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)" + session link.
- UI tokens only (radius, font scale, no 800 weight, color-mix not raw colours, opaque pop-up `var(--ov-surface)`, selected = aria-pressed /
  aria-current with ui-on-bg/ui-on-fg). Guards: check-ui, ChartZoomCoverage (wrap every chart in `<ChartZoom>`, add the file to the list),
  name246, headings310 (h3 font `var(--ui-fs-h3)`), orderFlowLook (new reduced-motion rules go INSIDE the last `@media (prefers-reduced-motion)`
  block of orderflow.css, never a new block). **New in CI (#947): `npm run lint:install && npm run lint` with `--max-warnings 60`; main is at
  exactly 60, so add zero warnings.**
- Founder's data decision (26 Nov): the Lab is internal and invite-only, so all data is used, copyright notes aside, FREE path only. Requests
  stay honest: User-Agent `FinLit (finlitventures.com) ...`; no browser impersonation, no bypassing bot checks (Cboe 403 → not used).

## State of every piece

LIVE: #961 access, #962 engine, #964 Market depth + Flow board, #965 Money Flow, #972 Option Pulse (India), #985 Stock zones (other chat).

| # | Task | Branch (pushed) | State |
|---|---|---|---|
| 1 | Global cues | `lab-global` | **PR #980**, merged with main at 3a2c1550; 9/10 checks green, backend running. Checked locally merged with the newer main (lint 0 errors, no Lab warnings; 5,539 frontend + 198 backend tests pass). FIRST: if #980 is not merged yet and all checks are green with no file overlap with newer main, squash-merge; verify live `/lab/flow?view=global` |
| 2 | Market mood (India) | `lab-mood` | built + tested; next PR |
| 3 | India / Global switch + Global depth, board, Money Flow (500 largest US cos, Nasdaq screener, job `global-flow` every 5 min, skips holidays) | `lab-global-flow` | built + tested (50/50 shots) |
| 4 | Global Option Pulse (Nasdaq option chain; OI change from Redis-kept previous day) | `lab-global-options` | built + tested |
| 5 | Global Market mood (US sectors + world topics) | `lab-global-mood` | built + tested |
| 6 | Global trade (UN Comtrade preview, job `global-trade`) | `lab-global-trade` | built + tested (real Aug 2026 data) |
| 7 | Emerging markets (World Bank + Yahoo, job `global-em`) | `lab-global-em` | built + tested |
| 8 | US companies (SEC XBRL, job `global-companies`) | `lab-global-companies` | **backend done** (`lab/companies.py`, real load of 39 cos OK); TODO: register router in api.py, job in jobs/registry.py (+ limits note, weekly, MORNING window), worker command `refresh-global-companies`, tests (`tests/fixtures/global/` with a trimmed real load), frontend tab `companies` (GLOBAL_TABS + GLOBAL_ONLY), screenshots |

The branches are STACKED in this order (each on top of the previous). After each merge: `git rebase --onto origin/main <previous branch's old
head> <next branch>` (or merge main in), resolve conflicts by keeping BOTH sides (OrderFlow.tsx tabs/imports/Flow routing, orderflow.css,
ChartZoomCoverage.test.tsx, api.py routers, jobs/registry.py, worker.py), re-run lint + typecheck + full vitest + the touched backend tests,
then open the PR. Re-check the migration number only if you add one (none of these add migrations).

## Page wiring (frontend/src/pages/OrderFlow.tsx)
`FLOW_TABS` (ready flags), `GLOBAL_TABS` (views the Global switch shows), `GLOBAL_ONLY` (trade, em, + companies), `Flow({view, market})` routes
each view; `?m=global` sets the market; `setFlowMarket()` in lib/flow.ts switches ₹→$, crore→US$ million, "F&O stocks"→"US companies",
hides build-up/pivots/facts. Hover cards: `useTip()` from components/lab/FlowTips.tsx.

## US companies page (task 8) — what to build
Tab "US companies" under Global: a board of the 39 companies (tiles sized by latest annual revenue, coloured by revenue growth, grouped by
sector), click/select one → header (name, sector, SEC name), KPI tiles (revenue, net income, margin, EPS, YoY), 10-year revenue bars with
net-income line, last 9 quarters, balance sheet (assets, liabilities — "derived" when `concepts.liabilities` starts with "derived", equity,
cash, long-term debt). Banks have no operating income (show "—"). `/api/lab/companies` returns `companies` (summaries) + `details`.

## Upgrades worth doing after (founder wants "more good quality")
- Global flow board: add the world's largest non-US companies (Yahoo: 7203.T, 2330.TW, 005930.KS, ASML.AS, 0700.HK, NESN.SW, SHEL.L ...).
- Global trade: a world map of partners; product-by-partner drill-down; WTO world trade totals (free key in /opt/finlit/.env.aws).
- Market mood: GDELT world tone (free); Reddit only via an official free app the team registers (no scraping).
- Global cues: GIFT Nifty if a free feed is found (NSE IX pages are script-loaded; none yet).
- Founder, 27 Nov 2026: the Lab and the Markets page are internal only and will not be made public; the licence flag is CLOSED (no action).
- Founder, 27 Nov 2026 (explicit): "we want everything ... ignore the copyright things for now". Copyright notes and "personal use"
  terms do NOT stop any data being used anywhere in the Lab or the internal Markets page (e.g. S&P 500, Dow, Nasdaq, Nikkei from FRED or
  Yahoo, any index, any company, any feed). Do not drop or hide a series for licensing reasons. The only limits that stay: no secrets in the
  repo, honest User-Agent, and no getting round a site's access controls (a 403/bot wall means find another free source).
  Paid items (X posts, GIFT Nifty live) are optional: skip them; cover everything else with the free sources.

## Test harness notes
Local: venv `/tmp/claude-0/venv-be` may be gone in a new container: create one, `pip install -e backend[dev]` style per repo docs; Postgres +
Redis per docs. Screenshots: Playwright pre-installed; mock `/api/auth/me` (admin, features ["trading_lab"]) and `/api/lab/access`, run
against `vite preview`, then against the live site after deploy (`/api/health` shows the commit). Say honestly when data is a sample.
