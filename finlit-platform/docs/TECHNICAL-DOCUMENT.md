# FinLit: Technical Document

Status: November 2026, live at https://finlitventures.com (one AWS EC2 server in Sydney, ap-southeast-2). Until early November it ran on Render with a Neon database; that setup is retired.

## 1. What it is
FinLit is an Indian retail-investor research platform: stock research reports with a FinLit IQ, screener (160+ filters), query builder, compare, charts, ETF and mutual-fund pages, watchlists, portfolio tracker, alerts, results and IPO calendars, FII/DII flows, market heatmap and sector view, commodities, option chain and DCF calculator, under three plans (Basic, Silver, Gold). Information only, not investment advice.

## 2. Architecture
One AWS EC2 server (`t3.small`: 2 vCPU, 2 GB RAM + 2 GB swap) runs everything with Docker Compose (`deploy/aws/docker-compose.aws.yml`). One application image runs as two containers, `app` (website, research API, site backend) and `jobs` (the job supervisor), beside PostgreSQL, Redis, Caddy (HTTPS) and a nightly database backup:

| Part | Technology | Role |
|---|---|---|
| Research API | Python, FastAPI, uvicorn | Serves all `/api/*` endpoints and the built website |
| Website | React, TypeScript, Vite, TanStack Query | Single-page app, served by the API |
| Site backend | Python, FastAPI, MongoDB (Atlas M0) | Blog/CMS, forms, chat, portfolio uploads (`site-api/`) |
| Background jobs | Job supervisor (`finlit/jobs/`, `deploy/jobs.sh`) in its own `jobs` container, running the worker CLI (`python -m finlit.worker`) | Data loading, refreshes, alerts (`docs/JOBS.md`; status at `/api/jobs/status`) |
| Database | PostgreSQL 16 (TimescaleDB 2.17 image) in Docker on the server, 640 MB limit | Reports, scores, quotes, users, flows, funds |
| Cache | Redis 7.4 in Docker on the server, 256 MB, cache only (rebuilt from Postgres when empty) | Section cache, quotes, rate limits, queues |
| Front door | Caddy 2 | HTTPS certificates, `www` to the bare domain, security headers, a holding page during a deploy |

Request flow: browser, API, Redis (hit) or Postgres (miss), JSON, gzip, ETag (304 on repeat visits).

## 3. Data sources
| Data | Source |
|---|---|
| Financials, ratios, peers, shareholding, company profile | FinEdge (licensed API) |
| Live prices, day change, charts (daily and intraday), option chain, index levels, MCX commodity prices, F&O lot sizes, surveillance flags, circuit limits, MTF | Dhan (DhanHQ v2) |
| FII/DII cash-market flows | NSE daily FII/DII report; NSDL FPI Monitor (history, FPI debt and hybrid) |
| Index constituents | NSE published index lists |
| Mutual fund NAV, expense ratio, fund size | AMFI |
| Macro | MoSPI, RBI |
| International commodity prices | Not live (needs a paid metals.dev or MetalpriceAPI key) |

Dhan has no fundamentals; those come only from FinEdge. Every source step is isolated: a failing source keeps the last good data and says so on the page.

## 4. Backend (`backend/finlit`)
- `api.py` app factory, middleware (security headers, CORS, rate limit, gzip), stock sections with ETag and plan gating.
- `worker.py` job CLI: `ingest`, `ingest-all`, `score-all`, `refresh-listing`, `refresh-indices`, `refresh-flows`, `refresh-etf`, `refresh-mf`, `refresh-instruments`, `rebuild-metrics`, `drain-queue`, and more.
- `finedge.py`, `dhan.py` provider clients (retries, pacing, token renewal by TOTP).
- `snapshot.py` + `normalize/` turn raw statements into the report sections and run data-quality checks (a report that fails critical checks is rejected and the last good one is kept).
- `screener/` metrics, the in-memory screener table (cached, loaded incrementally), the query language (`ql.py`, `qeval.py`, `qapi.py`) and baskets.
- `flows.py`, `etf.py`, `mf.py`, `indices.py`, `options.py`, `commodities.py`, `intraday.py`, `alertengine.py`, `dcf.py`, `premium.py`, `auth/` (sign-up, sign-in, MFA, plans).
- Migrations: `migrations/NNN_*.sql` (89 in November 2026), run at start by `Store.migrate()`.

## 5. Frontend (`frontend/src`)
React pages under `pages/` (about 49), the company report under `stock/`, shared hooks in `lib/` (`api.ts`, `basis.ts`, `markets.ts`). The company report follows one basis (consolidated, or standalone when the consolidated statements are missing or out of date); section 06 (financial statements) has its own Consolidated / Standalone switch (task #190). Unit tests with Vitest.

## 6. Data pipeline
1. First start: load calendars, company universe, price list for every listed company (about 5,800), index lists, the top companies in full (`INGEST_LIMIT`, 500), then scores for every other company (`score-all`, resumable, 1,500 a night).
2. Companies without a stored report are built on demand when first opened (queued, a few seconds).
3. Recurring: prices every minute for stored reports; listing prices after the close (15:50 IST) and nightly; flows after 18:00 IST; fund and macro data nightly.
4. Bulk jobs run at low CPU priority so visitors are served first.

## 7. Security
HTTPS with security headers, Argon2-style password hashing, MFA required for administrators, rate limits per client IP, plan checks on the server, CI scans (gitleaks secrets, bandit, pip-audit, npm audit). No secrets in the repository; they live in `/opt/finlit/.env.aws` on the server (outside the git clone) and in the GitHub settings.

## 8. Testing and delivery
Backend: pytest (about 3,300 tests, with Postgres and Redis). Site backend: pytest (about 1,080). Frontend: type check and Vitest (about 3,000). GitHub Actions run all checks on every pull request. The server checks `main` every 5 minutes and deploys a new commit by itself (`deploy/aws/auto-deploy.sh`: backup, build, restart, health check, automatic rollback if unhealthy). A smoke test checks the live site every six hours (`.github/workflows/platform-smoke.yml`).

## 9. Known limits
- One small server: 2 GB of memory shared by everything (limits: app 500 MB, jobs 800 MB, Postgres 640 MB, Redis 320 MB, Caddy 128 MB), with 2 GB of swap. Response times vary while heavy data jobs run; jobs run at low CPU priority and are killed first when memory runs out (`docs/ops/MEMORY-AND-503.md`).
- Redis is a cache (256 MB, least-recently-used entries dropped); the app tolerates it being emptied.
- Some companies have short statement history at the provider (for example LIC: 2 years).
- Showing MCX prices publicly needs written permission from Dhan/MCX; redistribution terms for FinEdge and Dhan data are still to be settled.

## 10. Environment
Key settings (in `/opt/finlit/.env.aws` on the server, never in code; `deploy/aws/.env.aws.example` lists them all): `DATABASE_URL`, `MONGO_URL`, `FINEDGE_API_KEY`, `DHAN_CLIENT_ID` with `DHAN_PIN` and `DHAN_TOTP_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `INGEST_LIMIT`, `SCORE_ALL_PER_RUN`. Optional: `RESEND_API_KEY` (email), `GEMINI_API_KEY` (AI chat), `METALS_DEV_API_KEY`.

More detail: `docs/AWS-DEPLOY.md` (server runbook), `docs/TEAM-DEPLOY.md` (team workflow), `docs/JOBS.md` (background jobs), `docs/DHAN-SETUP.md`, `docs/FLOWS.md`, `docs/KNOWN-ISSUES.md`.
