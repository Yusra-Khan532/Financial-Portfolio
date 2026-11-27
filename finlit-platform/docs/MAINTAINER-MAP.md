# Maintainer map: the whole platform on one page

Written 17 Nov 2026 from a full read of the repository, the team workspace and the live site. Start here in every new session, then read
`CLAUDE.md` (rules) and `docs/TASK-PROMPT.md` (how every task is done). Update this page when something on it changes.

## 1. How we work (applies to every change)

- One task at a time, by `docs/TASK-PROMPT.md`:
  1. Copy the task and the team's notes into a checklist, word for word.
  2. Reproduce each point on the live site.
  3. Fix the root cause.
  4. Prove each point with a test or a screenshot: desktop and phone, light and dark, each plan where it applies (Free, a one-area plan, Gold, Platinum).
  5. Push only when everything passes, then check the live page.
- Standing rules (`CLAUDE.md`):
  - Background jobs never stop or get weaker. The sector job runs only on weekend nights (owner, 18 Nov 2026: Saturday 23:00 to Sunday 08:00 IST, Sunday night as a catch-up, after every other job of the night; docs/JOBS.md); `SECTORS_JOB=off` in `/opt/finlit/.env.aws` switches it off.
  - Numbers are correct and current, and every blank says why.
  - Describe, never advise, and keep the disclaimer.
  - Plans: Free, Mutual Fund + ETF, Equity Portfolio, the combined plan, Gold and Platinum (owner, 27 Nov 2026, task #410); prices only in `frontend/src/landing/goliveData.js`; payments not live yet.
  - Secrets live only in `/opt/finlit/.env.aws`.
  - No model names in commits or code.
- Design: the "FinLit final pages" pack (`docs/design/finlit-final-pages/`) is the final design for the pages it shows. The landing page follows its own tasks (#118–#121). Since task #407 (26 Nov 2026) it is the team's go-live pack: markup `landing/GoLiveMarkup.tsx`, interactive parts `landing/golive.js` (the pack's scripts, ported), data `landing/goliveData.js` (areas, tools, plans and their prices, recordings: change prices there only), styles `landing/golive.css`, media `public/landing/golive/`; the hero's company check reads the search index and `/api/search/quotes`.
- Shipping:
  - Work goes on a branch, then a PR on `Yusra-Khan532/Financial-Portfolio`, squash-merged when every check passes.
  - `main` reaches the live site by itself in about 10 minutes.
  - Give the founder the PR link and the live pages to check.
- Why tasks came back (22% of the first 209 were reopened):
  - "still not done" on the real page;
  - dark mode or phone width missed;
  - a fix broke a neighbouring button or card (global CSS);
  - a line of a large design pack missed.

  Since `TASK-PROMPT.md` (13 Nov) reopens have dropped sharply.

## 2. Repository layout (`finlit-platform/`)

| Folder | What it is |
|---|---|
| `frontend/` | Website. React 19, TypeScript 7 (strict), Vite 8, React Query 5, react-router 8 (`BrowserRouter`). |
| `backend/finlit/` | Research API (FastAPI, port 8000) and the job CLI. Postgres (TimescaleDB) is the source of truth; Redis is a cache only. |
| `backend/finlit_technicals/` | numpy/pandas engine for the sector and technicals jobs. |
| `site-api/backend/` | Site backend (FastAPI, port 8001, MongoDB via motor): blog/CMS, forms, AI chat (Gemini), FinLit Prism premium reports. Almost all in one file, `server.py` (about 4,400 lines). |
| `deploy/` | `start.sh` (app container), `jobs.sh` (jobs container), `scheduler.sh` (supervisor loops), `aws/` (Compose, Caddyfile, deploy and auto-deploy scripts, backups), `amfi-relay/` (Cloudflare Worker). |
| `extension/` | Chromium extension: select text on any page to get a glossary meaning or a company card. |
| `design/` | `tokens.json` and its builder. **Not wired in**: the live colours are hand-kept in `frontend/src/styles/design-system.css`. |
| `docs/` | One document per feature. `KNOWN-ISSUES.md` is the fault ledger; `JOBS.md` is the job supervisor. |

## 3. Backend (research API)

- **App** (`finlit/api.py`, `create_app`):
  - Middleware, outermost first: security headers, trusted host, CORS, body limit, Redis rate limit, model guard, gzip.
  - **Route order matters.** Specific stock sub-routers are mounted before `/api/stocks/{symbol}/{name}`. The `mfscore`, `mfscreen` and `mf_insights` routers come before `mf.router`. The catch-all forwarding to the site backend (`siteproxy.py`) is last; then `web.py` serves `frontend/dist`.
- **Stock reports:**
  - Served as pre-rendered sections from Redis, with ETags.
  - A miss queues the symbol (`ingest_queue`); the request answers 202 `queued` if it is not built in time.
- **Feature areas:**

  | Area | Modules |
  |---|---|
  | Screener | `screener/` (query language evaluated in Python), `presets/`, `advanced/` |
  | Prism | `prism*.py`, `premium.py` |
  | Mutual funds | `mf.py`, `mfscore/`, `mfscreen/`, `mf_insights.py`, `amfi_import.py` |
  | ETF | `etf.py`, `etf_vs_index.py` |
  | Portfolios | `myinvest/`, `mfportfolio/`, `etfportfolio/`, `portfolio_page/`, `diversification/` |
  | Sectors | `sector_*.py`, `taxonomy.py` |
  | Macro and flows | `macro*.py`, `flows*.py` |
  | Alerts | `alert*.py`, `notify.py` |
  | Accounts | `auth/` |
  | Community | `forum.py`, `page_feedback.py` |
  | MCP server | `mcp/` |
  | Other tools | `stress/`, `outlook/`, `earnings/`, `company_brief/` |
  | Trading Lab (admin-granted access, `docs/TRADING-LAB.md`) | `lab/` (access: `user_grants`, Console > Trading Lab access, `/lab`) |
- **Jobs:**
  - `finlit/worker.py`: about 59 CLI commands.
  - `finlit/jobs/`:
    - `registry.py`: 63 jobs with windows, time limits, SLAs and prerequisites.
    - `due.py`: what runs when.
    - `supervisor.py`, `runner.py`: run each job and kill it by process group.
  - Time windows (IST): night 23:00–05:00, morning 05:00–08:00, after close 18:30–21:30.
  - Nightly scores export (task #326, `docs/SCORES-EXPORT.md`): job `scores-export` after presets writes one file per market day to the `scores_export` volume; the owner's Mac reads `/internal/export/scores` with `X-Export-Key` (`EXPORT_KEY` in `/opt/finlit/.env.aws`).
  - Monitoring (owner, 24 Nov 2026, `docs/MONITORING.md`): the `gatus` container checks the public site every minute and emails on failure and recovery through Resend's SMTP (`RESEND_API_KEY`, `ALERT_EMAIL_TO` in `.env.aws`); GitHub Actions `platform-uptime.yml` (outside check, every 5 min) and `platform-load.yml` (k6, nightly and Sunday night); optional `uptime-kuma` (`COMPOSE_PROFILES=kuma`). Public `/status`, admin Console → Monitoring (`backend/finlit/monitoring.py`).
- **Database:**
  - `finlit/migrations/NNN_*.sql` are applied in filename order. The latest is `140_company_brief_writer_retry.sql` (25 Nov 2026), so the next one is `141_`: always the highest number plus one (`ls backend/finlit/migrations | tail -1`). Numbers have gaps (20, 22–26, 29–31, 36, 66–69, 75, 89); never fill one, as it would sort before migrations already applied. Each file is recorded in `schema_migrations` by its full name.
  - Migrations only go forward: a rollback does not undo them.
  - A one-time data change that needs Python runs from `Store.migrate()` after the SQL files and records its own version in `schema_migrations`
    (it never raises, so it cannot stop a deploy or a job). The first is task #283 PR D's `finlit/iq_retire.py` (`123_iq_to_prism`): members' saved
    screens, query baskets and alerts on the retired FinLit IQ converted to FinLit Prism, with one notice per member (notification kind `notice`).
- **Settings:** `finlit/config.py` (`Settings`), although many modules read `os.environ` directly.
- **Data providers:**

  | Provider | Used for |
  |---|---|
  | FinEdge | Fundamentals (`finedge.py`); FinEdge's own figures win, see `KNOWN-ISSUES.md` fault i |
  | Dhan | Prices, intraday, options, indices |
  | Upstox | Second price source |
  | AMFI and mfapi.in | Mutual funds |
  | NSE archives | Sectors, flows, transcripts |
  | RBI, MoSPI, World Bank, FBIL, NSDL, EIA | Macro data |
  | Gemini | Summaries |
  | Resend | Email (sign-up codes, alerts; Gmail "Send mail as" contact@) |
  | Amazon SES (Sydney) | Bulk mail from contact@finlitventures.com: Console > Email (`finlit/mailer.py`, task #387). Key: IAM user finlit-ses-sender (send-only) in `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`. Out of the sandbox since 24 Nov 2026: 50,000 a day, 14 a second |
- **Plans:**
  - `auth/entitlements.py` holds `RANK`, `has()`, `LIMITS` and the `redact_*` functions; since task #410 also the plan keys (`PLAN_KEYS`, `TIER_OF`: each plan opens an access tier), `is_platinum()` (Stress Lab, forecasting), `in_area(ctx, "mf" | "eq")` (the one-area plans) and `part_of()` (the plan names in a lock message). The frontend twin is `lib/auth.tsx` (`tierOf`, `keyOf`) and `lib/ui.tsx` (`Gate`, `passes`).
  - Every route checks the plan itself (24 files); there is no central dependency, so **a new route must add its own check**.
  - The session cache lasts 120 s; call `forget_cached` when a plan changes.
  - `SHOWCASE_SYMBOLS` are open to every plan.
- **Health signals:**
  - About 634 `except Exception` blocks.
  - A few f-string SQL calls without a `nosec` note: `forum.py`, `mf_compare.py`.
  - The largest files are `mf.py`, `worker.py`, `etf.py`, `prism.py` and `auth/routes.py`.

## 4. Frontend

- **UI build check (task #310, 22 Nov 2026).** `frontend/scripts/check-ui.mjs` runs inside `npm test` (`src/styles/uiCheck.test.ts`). A file may never have MORE findings than its starting point in `frontend/ui-baseline.json`: raw colours (hex/rgb/hsl outside the token files), hand-typed `border-radius` and `font-size` numbers, font weights other than 400/500/600/700, chart colours on buttons/tabs/links. New code uses the variables in `src/styles/ui-tokens.css` (`--ui-r-mark`, `--r-ctl`, `--r-card`, `--ui-r-pill`, `--fs-*`, `--ui-on-bg`/`--ui-on-fg`, `--btn-bg`) and the shared pieces in `src/components/ui/` (`Button`, `Tabs`, `Card`, `PageTitle`, `Input`, `Chip`; classes `ui-*` in `src/styles/ui.css`). After cleaning a page family, `npm run ui-check:baseline` and commit the lower numbers; never raise one. **Part F (22 Nov 2026, `src/styles/families310.test.ts`):** the eight page families (pages/01 to 08) and the shared sheets take corners, sizes and weights from the tokens (corners 1-6px -> `--ui-r-mark` under 32px, 7-15px -> `--r-ctl`, 16-28px -> `--r-card`, pills -> `--ui-r-pill`; sizes `var(--fs-*)`; weights 400-700, `b, strong` capped at 700 in typescale.css); IBM Plex is gone (fonts not loaded). Baseline 6456 -> 1429; what is left is mostly raw colours (unscoped hex that has no exact token in both themes) and print sizes. **Part G, dark theme (22 Nov 2026, `src/styles/dark310.test.ts`):** two dark-aware tokens in ui-tokens.css keep light exactly as it was and move dark only: `--ui-field-line` (the edge of an input, select or text box: `--border-strong` in light, `--border-control` in dark, 3:1 or better; every field rule draws its border with it) and `--ui-heat-scale` (1 in light, .66 in dark; heat maps and tinted cells write their share as `calc(<n>% * var(--ui-heat-scale))`, so cream figures keep 4.5:1). Other dark fixes are `:root[data-theme="dark"]` rules next to the component (my-investments score box, equity trend cell "+N more", Why we exist numerals, ratio filters, funds tinted figures, Main theme chip, SIP and account selected tabs, the home page's main buttons on `--btn-bg`, the home Prism card on dark surfaces via its `--hpz-*` variables). Literal fallbacks of tokens that :root defines in both themes are dropped (they never showed). Baseline 1429 -> 1277.

- **Equity portfolio shared pieces (task #385, developer file 33, 24 Nov 2026).** `src/portfolio/shared/` holds what the three views (Portfolio, Diversification, Risk) share: plain words (`shortCo`/`coName` short company names, `namesInText` codes to names, `betaRangeWord`, `pointsLine`, `countOf` singular counts, `corrWord`/`corrText`, the nine `trendReading`s, `RANKS`, `bannedIn`), numbers (`rupees`, `rupeesShort` L/Cr, `pctChange` with 0.0% never minus, `times`), the sorting rule (`sortRows`, `nextSort`, `useSort`, `SortHead`), long lists (`capRows`, `useCap`, `ShowAll`), `FrozenTable`, `Info` (an i labelled About “…”), `KeyFigures` (three numbered questions) and `portfolioKeyFigs` / `gainLoss`. The page's steps (one section at a time, phone folds) are `portfolio/pack/EqSteps385.tsx`; the four calm cards, six parts, Since your last visit and Data as of are `portfolio/pack/EqTop385.tsx`. Since your last visit reads `POST /api/visits/equity-portfolio`.
- **Routes:**
  - All are in `src/App.tsx`, loaded lazily through `lazyPage` (`src/lib/resilience.ts`).
  - The app pages, the company report `/stocks/:symbol` included, sit inside `AppShell` (the left menu); the public pages sit inside `Layout` only.
  - **Navigation (task #310 part D, `src/styles/nav310.test.tsx`):** one layer per job. Signed in on an `AppShell` page the top bar has no menus (logo, search, Ask FinLit AI, theme, notifications, account; `lib/shellPresence.ts` tells the header); marketing pages and visitors keep the menus. The left menu has one remembered setting (`side-collapsed`), starts as the rail under 1100px and is a sheet under 860px. Sibling pages use `components/PageTabs.tsx` (sets in `lib/nav.ts` `SIBLINGS`); section bars show only with `SECTION_BAR_MIN` (4) sections and mark the one in view with `--ui-on-bg`. The ticker strip is on the dashboard and the Markets pages only (`showsTape`). Raise a Query and Share feedback are `HelpActions` (account menu, foot of the left menu, phone Menu sheet, footer); there is no floating dock.
  - **The phone app (owner, 25 Nov 2026, `docs/MOBILE-APP.md`; `components/mobile/MobileApp.tsx`, `lib/mobileNav.ts`, `styles/mobile-app.css`, `styles/mobileApp.test.tsx`):** under 860px the site is an app: a top bar with the logo, a search box and Ask FinLit AI (the bell for a member); five bottom tabs, Home · Markets · Discover · Portfolio · Menu (`MobileTabs`, replacing the old Dashboard/Research/Search/Screener bar); the section chips of each tab under the top bar (`HubChips`, map in `HUBS`); the Menu sheet with every page of `lib/nav.ts` (`MobileMenu`); the floating Tools button with this page's tools first (`ToolsButton`, `toolsList`); a one-line footer; the questions folded into one row (`PageFaqs`); compact title cards (`page-header.css` and `mobile-app.css`). `/` is the landing page at every width (owner, 25 Nov 2026); on a phone it opens with doors (`PhoneDoors` in `pages/Home.tsx`): "Continue to your dashboard" for a member, then Markets today, Find a company and Screener. The Home tab opens `/` for everyone. Markets today (`pages/MarketsToday.tsx`) is `/markets`, the Markets tab's first chip; `/tools` lists every tool. "Desktop site" in the phone browser (about 980px) or in the Menu (`setDesktopSite`, applied by `public/theme-init.js`) shows the desktop site. Nothing of it is drawn from 861px up.
  - **Phone (task #310 part E, `src/styles/phone310.css`, `src/styles/phone310.test.tsx`):** one phone width, 860px, the same as the left-menu sheet. Under it the header holds the logo, search, the Word of the Day book, Ask FinLit AI, notifications and the account (44px each, 8px gaps; `WordOfDay`'s fit logic runs from 861px up); the Dashboard button, the theme switch and the admin's system controls are not in it (theme and system controls are `SheetTools` in the Menu sheet: the site menu, or the left-menu sheet on a tool page). The bottom bar (`MobileTabs` in `Layout.tsx`: Dashboard, Research, Search, Screener, Menu) is flat, 56px (`--ui-bar-h`); only the header, this bar and a section bar stay on screen (no floating Menu button); toasts sit above the bar and close after 6 s. `.btn` and the `ui-` controls are 44px; "i" buttons get a 44px tap area. Long pages open on tap with `components/PhoneFold.tsx` (closed row: name and one line; remembered for the session; nothing changes from 861px up): every company-report section under the header and Prism cards, the dashboard's sections after the second while "All sections" is chosen (one section picked in its filter is drawn open), Sector Pulse's sections after the second, the funds table's notes; the funds list shows 5 schemes, then Show all. A section bar that jumps into a closed section uses `revealAndScroll` / `foldAnchor`.
- **API:**
  - Use `src/lib/api.ts` (`apiGet`, `apiSend`, which add CSRF, the admin "view as" header and `ApiError`). `src/lib/siteApi.ts` covers the site backend.
  - About 54 raw `fetch(` calls still bypass it; do not add more.
- **Development proxy** (`vite.config.ts`):
  - `/api` paths go to the research API only when they match a list of prefixes; everything else goes to the site backend.
  - **A new research route must be added to that list.**
- **Plan checks:**
  - `src/lib/auth.tsx` reads `/api/auth/me`.
  - `src/components/Gate.tsx`, `src/lib/planGate.ts` and `src/lib/premium.ts` show plan locks.
  - The server is the real gate.
- **CSS:**
  - Plain global sheets (`src/styles/`, about 123 files); the import order in `main.tsx` matters.
  - Bare `.btn`, `.card` and `.chip` are styled in several sheets.
  - **Scope new CSS to the component and grep a class name before using it.**
  - Theme comes from `data-theme` on `<html>`; charts read CSS variables when they draw.
- **Tests:**
  - Vitest: about 305 files and 2,800 cases. jsdom is chosen per file with `// @vitest-environment jsdom`.
  - Browser checks are standalone Playwright scripts in `e2e/`, for example `layout_guard.mjs` (`docs/LAYOUT-GUARD.md`). CI runs none of them.
  - **ESLint, React hooks rules only (25 Nov 2026):** `npm run lint:install` once, then `npm run lint` (CI's Website workflow and `scripts/preflight.sh` run it). It lives in `frontend/lint/` with its own packages, because typescript-eslint parses with TypeScript 5.9 and cannot use the app's TypeScript 7. `react-hooks/rules-of-hooks` is an error; `react-hooks/exhaustive-deps` warnings may not grow past `--max-warnings` in `package.json` (60 on 25 Nov; lower it when you fix some, never raise it). About 160 older `eslint-disable-line react-hooks/exhaustive-deps` comments remain.
- **Large files:**
  - `src/stress/stressLab.js` (untyped).
  - Pages: `AdvancedCharts.tsx`, `ScreenerPro.tsx`, `Dcf.tsx`, `EpsCalculator.tsx`, `Funds.tsx`.
  - The stock report is split across `stock/Sections*.tsx`.

## 5. Hosting and release

**Live:** `finlitventures.com` (main), with `www` redirecting to it and `app.` serving the same site with a canonical link to the main domain.

**Cloudflare** proxies the site (orange cloud). Live responses on 24 Nov 2026 carried `server: cloudflare` and `cf-ray` in front of `via: 1.1 Caddy`; on 17 Nov the records were still DNS only. It provides:
- the proxy: edge DDoS protection and the server's address kept out of DNS;
- DNS;
- Email Routing (MX and SPF records);
- the Worker relay in `deploy/amfi-relay/` for AMFI files and NSE/BSE pages, which refuse the AWS address. If the relay breaks, fund facts, company briefs and earnings calls stop updating.

Caddy trusts `CF-Connecting-IP` only from Cloudflare's published ranges (#515) and overwrites any `X-Forwarded-For` a visitor sends, so the login lock-out and per-visitor limits count real visitors and the address cannot be faked (verified 24 Nov). Keep true:
- SSL mode must be "Full (strict)" (checked in the Cloudflare dashboard; not visible from outside).
- `/api` must not be cached at the edge. Verified 24 Nov: `/api` answers come back `cf-cache-status: DYNAMIC` with `cache-control: no-store`.
- The EC2 security group (sg-047e835589b07f531) accepts ports 80/443 **only from Cloudflare's 15 IPv4 ranges** (24 Nov 2026), so nobody can reach Caddy directly by the server's address. If Cloudflare publishes new ranges (https://www.cloudflare.com/ips-v4/), add them for 80 and 443 (and to `trusted_proxies` in the Caddyfile).
- **SSH (22) only from EC2 Instance Connect** (`13.239.158.0/29`, Sydney; 25 Nov 2026): use AWS console → EC2 → finlit → Connect → EC2 Instance Connect. To SSH from a PC, add that PC's public IPv4 as a `/32` rule on port 22; never re-open `0.0.0.0/0`. Nothing automated uses SSH (deploys are pulled by the server).

**AWS:** one EC2 t3.small in Sydney (54.253.190.17; 2 GB of memory plus 2 GB swap). Docker Compose runs:

| Service | Role | Memory |
|---|---|---|
| Caddy | Ports 80 and 443; automatic HTTPS; security headers; holds requests 90 s during restarts; also serves the workspace through `/etc/caddy/extra/*.caddy` | |
| `app` | Research API, website files, and the site backend on port 8001 | 500 MB |
| `jobs` | Job supervisor | 800 MB |
| TimescaleDB | Database, about 1.8 GB on 17 Nov | |
| Redis | Cache only | |
| `backup` | Nightly `pg_dump` at 02:00 IST | |

Memory is the recurring fault (`docs/ops/MEMORY-AND-503.md`).

**Release:**
1. A PR is merged to `main`.
2. `platform-image.yml` builds `ghcr.io/yusra-khan532/finlit-app:<sha>`. It runs only when `finlit-platform/**` changes.
3. The server's timer runs `deploy/aws/auto-deploy.sh` about every 5 minutes:
   1. It runs `git ls-remote`, then waits until the checks that the push of that commit started are green (the checks gate, 25 Nov 2026: Platform CI, Security, Website, codeql; the image build is left to `deploy.sh`; scheduled checks never block it). A red commit is held, never deployed; a re-run that turns green, or a newer green commit, is deployed. `auto-deploy.sh skip-ci` deploys without waiting (emergencies only, logged); `CI_GATE=off` in `/opt/finlit/auto-deploy.conf` turns the gate off. Then it takes a backup.
   2. `deploy.sh` pulls the prebuilt image, waiting up to 20 minutes, or builds it locally.
   3. It tags the old image `previous` and starts the new one.
   4. It waits for `/api/ping` and `/api/health`.
   5. It moves the jobs container only when job code changed and no long job is running.
4. A failed deploy rolls back to `previous`, and its SHA is never retried.

**Fragile points:**
- ~~Nothing waits for CI~~: since 25 Nov 2026 a commit is deployed only once its checks are green (above). The server picks the gate up after the first deploy that carries it (the installed `auto-deploy.sh` replaces itself after a successful deploy).
- A commit outside `finlit-platform/` gets no image, so the 2 GB server builds the image itself.
- `tsc` runs only in the frontend workflow.

**CI** (`.github/workflows/`):

| Workflow | What it runs |
|---|---|
| `platform-ci.yml` | Backend pytest with Postgres and Redis; deploy script tests; site-api pytest |
| `platform-frontend.yml` | Typecheck, Vitest, npm audit, build |
| `platform-security.yml` | pip-audit, npm audit, bandit (`backend/finlit` only), gitleaks |
| `platform-smoke.yml` | `scripts/smoke.sh` against the live site every 6 hours |
| `platform-image.yml` | Builds the server image |

Before a push: `bash scripts/preflight.sh`.

**Live checks (public):**
- `/api/health` gives `{ok, version}` and `/version.json` gives the build time; together they show which commit is live.
- `/api/jobs/status`: every job, overdue and failing lists, the canary, disk and database size.

## 6. Team workspace (https://workspace.finlitventures.com)

- The team's task tracker. Its source is not in this repository; it runs on the same server.
- Statuses: todo → in progress → done → verified, or reopened with a "rework" note.
- The API answers to this session: `GET /api/tasks`, `/api/members`, `/api/stats`. The writes are `/api/tasks/{id}/status`, `/api/tasks/{id}/updates` and `/api/tasks/{id}/checklist`. **Anything written appears as the team's account, so write only when asked.**
- People:

  | Who | Role |
  |---|---|
  | Pranshu | Lead and founder; reopens tasks as lead |
  | Chinmay | Main task writer and checker |
  | Nishant | Screener, Prism and data tasks |
  | Pranjal | Large design packs, sent as zip files whose content is the specification |
  | Claude | The member who builds and marks tasks done |

- Pace (6–17 Nov): about 17 tasks a day. Median 11.5 h from created to done, and 6.4 h from done to verified.
- Large tasks often have no text, only a zip pack. Step 0 is a word-for-word checklist from its README or CHECKLIST, attached to the task.

## 7. Open questions to settle (as of 17 Nov 2026)

- #206 asks to recolour the whole site from a photo, which conflicts with the final-pages pack and the site-green work (#161). Ask the founder before building.
- #210 (Prism CAGR ladders and PEG fallback) looks already shipped in PR #503 (Prism 3.6.19) but is still todo. Check it live, then mark it done.
- #191 (Zerodha, Upstox, Groww connection), #212 (superinvestor portfolios from FinEdge) and #211 ("claude integration check") need scoping first.
- ~~Should Cloudflare's proxy be turned on?~~ Done (on by 24 Nov 2026), and the EC2 security group is limited to Cloudflare's ranges (above).
- Cheap safety fixes worth doing between tasks:
  - ~~deploy only after CI passes~~ (done 25 Nov 2026, the checks gate in `auto-deploy.sh`);
  - one central plan-check dependency on the backend;
  - ~~ESLint for React hooks~~ (done 25 Nov 2026, `frontend/lint/`);
  - the layout guard in CI.
- Out-of-date docs:
  - `TEAM-DEPLOY.md`: misses the prebuilt image and the separate jobs container.
  - `ops/MEMORY-AND-503.md`: old memory limits.
  - `prism/DEPLOY.md`, `current-site-inventory.md`, `platform-plan.md`: Render, Neon and Vercel era.
  - `technicals/INCIDENT-2026-10.md`: status out of date.
  - The README's caching claims: stock API replies are now `private, no-cache`.
