# Task #183 handover: "update of the 3 portfolios page" (where the last chat stopped, 17 Nov 2026)

## Prompt to paste into a new Claude chat

> Continue workspace task #183 in `Yusra-Khan532/Financial-Portfolio`, folder `finlit-platform/`. Follow `finlit-platform/CLAUDE.md` and
> `finlit-platform/docs/TASK-PROMPT.md` exactly (checklist word for word, reproduce first, prove every point with a test or an
> after-screenshot in desktop and phone, light and dark, Silver and Gold, push only with all tests green, check live after deploy, report with the
> checklist table). Read `finlit-platform/docs/handover/task-183/README.md` first: it says what is done and what is next.
> Work on branch `claude/inspiring-bardeen-ukyww2` (it already holds W1–W5 of the Equity part, not yet merged). Do W6, W7, W8, W9 one at a
> time, then open one PR for the Equity page, merge, check live, and post to workspace #183. Then do the MF part, then the ETF part, each its own PR.
> Do the checks yourself; ask the founder only for things that need the server.

## Founder's decisions (16 Nov 2026)
- Plans stay Basic / Silver / Gold. Wherever the pack says "Mutual Fund + ETF and up", use **Silver and up**. A new plan is a separate task.
- Order: **Equity, then MF, then ETF**. Each page is its own task: its own PR, proven and shipped separately, workspace updated each time.
- ISIN codes come from the exchange lists (Dhan nightly file), the MF monthly portfolio files and the NSDL list (FinEdge gives none).

## Source material
- Design pack: the workspace attachment `finlit-portfolios-handover-15nov-v7.zip` on task #183 (folders 01-equity-portfolio, MF, ETF; README,
  CHECKLIST, COMMON-RULES). The NSE taxonomy came from task #192's pack (`taxonomy/industries.csv`).
- `equity-checklist.md`: the 106-point Equity checklist (team's words), already posted on workspace #183.
- `equity-plan.md`: before-findings and the work items W1–W9 with the proof each needs.
- `mf-etf-step1.patch.txt`: early saved changes for the MF and ETF parts (MF badge word, removing Export CSV + its FAQ line, ETF badge and the
  fixed ₹ size bands). A reference only: apply by hand in those parts, never as-is.
- `state.mjs.txt`: the Playwright script used for before/after screenshots (rename to `.mjs`, run with Vite against live, see below).

## Equity part: done on the branch (commits on `claude/inspiring-bardeen-ukyww2`)
| Item | Commit | What |
|---|---|---|
| W1 live fixes | c58e0b2 | Plan word on the badge (Gold no longer shows SILVER); leader/laggard label agrees with this week's sign (`agreeing()` in leadership_api, api.py screener, myinvest); Export CSV removed + FAQ answer; tab "Diversification analytics" |
| W2 ISIN | 770b1ec | ISIN on stock answers and screener rows, `/api/securities/{isin}`, `/api/stocks/{ISIN}`, list saved with ISIN, broker files read by ISIN, name-only lines shown to confirm, "Add all N" |
| W3 Clear portfolio | 85fa033 | `POST /me/portfolio/clear` + `/undo-clear` (Redis `pfclear:{uid}`, 10-second Undo), dialog, empty state |
| W4 top of page | 5eab9a9 | Score box (Prism for Gold, IQ for Silver, never both), one tile per tab, Key figures per tab (foldable), sticky sections bar |
| W5 Your shares table | (this commit) | Columns by plan with the server's pillar words, heading band + dividers, every heading sorts, views Overview / By sector (Macro sector · Sector · Industry, NSE) / By company size, band filters by plan, weak-row tint |

All backend tests for these pass (27 in the task's files); frontend full run 2975 tests, tsc clean.

## Equity part: still to do (see `equity-plan.md` and the checklist numbers)
- **W6** Trends, peers, group leaders (C42–C49): Gold-only cards with a Silver lock; trends matrix with axes, ⓘ and "+N more ▾"; Business and
  price lists; peers 3 per column + "Show all N ▾"; a "Group leaders" section with its own chip in the sections bar, locked on Silver.
- **W7** Diversification analytics (D50–D71, A4/A5): "Where it sits" grid moved here (totals 100%); spread score on the 12 macro sectors with the
  industry count beside it; three sub-tabs (sectors / stock groups / sizes); share-by-share grid with slider + Expand; style tilt Gold-only; Key
  figures (Concentration, Hidden packs, Moves like). Fix pack names and "but …" wording (A7/A8: `portfolio_page/metrics.py`, `lib/equityPack.ts`).
- **W8** Risk analytics (E72–E85): betas against the size benchmark index closes (NIF50, NIFMID150, NIFSML250, NIF500), R², capture, risk share;
  sections in the pack order. Never stop or weaken any background job.
- **W9** Whole page (H97–H100): insight cards closed on load, keyboard use, no sideways scroll at 390 px, ⓘ two lines, wording check, disclaimer.
- Then: full backend suite, PR whose body lists all 106 points with evidence, merge, live check, workspace #183 note (Equity done).

## Then MF portfolio, then ETF portfolio (parts 2 and 3)
Make each its own checklist from the pack's MF / ETF folders, the same way, and use `mf-etf-step1.patch.txt` as a reference.

## How to run checks
- Backend (from `finlit-platform/backend`; start Postgres/Redis with `bash finlit-platform/dev/services.sh` if `pg_isready` fails, because tests
  silently SKIP without it; never run two backend runs at once):
  `env -u ENVIRONMENT TEST_DATABASE_URL=postgresql://finlit:finlit@localhost:5432/finlit_test TEST_REDIS_URL=redis://localhost:6379/15 python -m pytest -q -p no:cacheprovider`
- Frontend (from `finlit-platform/frontend`): `npx tsc -b --noEmit`, `npx vitest run`, `NODE_OPTIONS=--max-old-space-size=4096 npx vite build`;
  backend `bandit -q -r finlit -ll`.
- Browser against live data: `RESEARCH_API=https://finlitventures.com SITE_API=https://finlitventures.com npx vite --port 5199 --host 127.0.0.1`,
  mock `/api/auth/me` for the plan, fixture `src/portfolio/__fixtures__/sample_40.json`, list in localStorage `finlit-portfolio-v1`.
- Font sizes allowed: 11,12,13,14,16,18,20,24,28,32,40. The word "Fundamental" only where `lib/noFundamentalWord.test.ts` allows it.
- Workspace: `GET https://workspace.finlitventures.com/api/tasks/183`; `POST .../status` (`-F status -F note`); `POST .../updates` (`-F body`).
