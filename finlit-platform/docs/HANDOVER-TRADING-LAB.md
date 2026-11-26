# Handover: Trading Lab and Order Flow (26 Nov 2026)

Written for the next Claude session. Read this whole file, then `CLAUDE.md`, `docs/MAINTAINER-MAP.md`, `docs/TASK-PROMPT.md` and
`docs/TRADING-LAB.md` before touching anything.


> **Status, 26 Nov 2026, 02:30 UTC (the session the founder named as owner of the Trading Lab work):**
> PR 1 (`lab-access`) is open as #961 (full backend suite passed; CodeQL fix for the email check added). The engine (`lab-flow-engine`) passed
> its full suite (4,866) and opens as its own PR once #961 merges. The Market depth and Flow board pages (`lab-flow-board`) were redesigned
> after the founder's two reference videos: boxes sized by the move, the three largest rises and falls as big cards with candles and levels,
> the day's path in every box, hover cards everywhere (rank, OI, VWAP, S1/S2, R1/R2, zone, facts, candles); the founder approved the look.
> Sections 3 to 5 below describe the state before that and are kept for history. Next ideas from the founder's second video are in
> docs/TRADING-LAB.md ("Ideas from the MarketPulse video").

---

## 1. The founder's rules (they never change)

Everything below is from `CLAUDE.md` and from the founder's own messages in chat. Follow them word for word.

**How to work**
- **One task at a time, start to finish.** Each task gets its own branch from the latest `main`, its own PR, its own live check, its own report.
  Never mix two tasks in one PR.
- **Every task follows `docs/TASK-PROMPT.md` in full:** Step 0 checklist word for word, Step 1 reproduce live with before-screenshots, Step 2 plan,
  Step 3 implement, Step 4 prove every point (tests, typecheck, build, bandit; screenshots desktop + phone, light + dark), Step 5 upgrade, then ship
  and verify live. A point without evidence is not done.
- **The founder's five steps:** Analyze (real root cause and nearby problems), Plan the best fix (upgraded, not a patch), Implement (touch only what
  is needed), Test (tests + real browser in 4 views), Upgrade (improve further, say what was added).
- **Decide, do not ask.** Choose what you recommend, write the choice and the reason in the PR and the task note, and carry on.
- **The team verifies; Claude finishes.** Do not hold a task because a point needs a sign-in; say in the note what only a signed-in member can see.
- **Several Claude sessions work on this repo.** Before a task: check the workspace status and notes, `git branch -r | grep <n>`, open PRs. If
  someone holds it, do not touch it. Claim a task on the workspace (status in progress plus a note) before branching. The user said: "as multiple
  claude are running so please get confirmation so it will not collide on same task."
- **Waiting is not idling:** while CI, a deploy or a long test run is going, start the next single task on its own branch.
- **Order of tasks:** tasks created by Pranjal Jain on the workspace (https://workspace.finlitventures.com) first, then the others. The Trading Lab
  is the founder's (Pranshu's) direct request in chat.
- **Deliver as you go:** once every test passes, push, open the PR on `Yusra-Khan532/Financial-Portfolio`, squash-merge when all checks are green,
  check the live site, report. **Never push to main or open a PR with a failing or skipped test.**
- **Always give the direct clickable link** to the PR and to the live pages in every report. Never make the founder ask for a link.
- **Report each task in one message:** cause, checklist table with evidence, tests, upgrades, what is still open, links. Then update the workspace:
  a done note `<what changed> | <where> | <PR link> | <how to check>`, status done, plus a note with next ideas (`ws done`, `ws note`).
- Server or browser steps for the founder: ONE at a time, say exactly where each runs (PowerShell on the PC, Git Bash on the PC, or the server
  window whose prompt starts `ubuntu@ip-`), and ask for a screenshot.

**Content rules**
- **Background jobs NEVER stop.** Never switch off, pause, skip or weaken any job, its schedule, time limit or retries. A new job must run and
  complete every day. (Only exception the founder wrote: the sector job, weekend nights.)
- **Accuracy first:** numbers correct and current, never missing when data exists, every blank shows its reason, never guess.
- **Wording: describe, never advise.** Never buy / sell / hold / reduce / avoid / accumulate / target / "best" / multibagger / top pick.
  Keep the disclaimer. **One exception, decided by the founder on 25 Nov 2026:** the Trading Lab's **Signals desk**, shown only to members whose
  per-grant "signals" switch an administrator turned on, may give Buy/Hold/Sell ratings, a trader's plan and a trade-size debate ("avoid FinLit
  rules for them ... make the proper backend setting"). Everywhere else, including the normal Order Flow pages, stays describe-only.
- **Everything stays free.** No secrets in chat or in the repo (only the server's `/opt/finlit/.env.aws` or GitHub/host dashboards).
- **No model names in commits or code.** Commit messages end with the attribution lines the session gives you.
- **UI checks the build enforces** (`frontend/scripts/check-ui.mjs`, `src/styles/*.test.ts`): `border-radius` only `var(--ui-r-mark | --r-ctl |
  --r-card | --ui-r-pill)`, `50%` or `0`; font sizes only from the scale `var(--fs-12 ... --fs-40)` (no `11px`, `28px` literals); h2/h3 via
  `--ui-fs-h2` / `--ui-fs-h3`; no literal colour fallbacks like `var(--text, #000)`; a selected tab/pill/toggle is marked with `aria-current` /
  `aria-pressed` and styled `background: var(--ui-on-bg); color: var(--ui-on-fg)` (never gold or a chart colour, never a class like `.on`).
- **Do not copy order-block.com.** Build our own design on FinLit's tokens and data; use only public methods.

---

## 2. What the founder asked for (this project)

1. **Trading Lab** (25 Nov): a section of the website, built from three open repos (Day Trader skill, market-lab, TradingAgents), that **only an
   administrator can open for named members** ("only admin can give access to anybody ... make a full setup ... first think, evaluate, plan,
   then implement ... make this perfect").
2. **Signals switch** (25 Nov): per member, an admin On/Off switch that shows Buy/Hold/Sell rating, trader's plan and trade-size debate, ignoring
   the FinLit wording rules for those members only, with a proper backend setting.
3. **"More focus on UI and graphics, so it is easy to use and understandable."**
4. **Order Flow pages like order-block.com** (26 Nov), with the founder's screenshots (Home: market-depth curve, top bullish/bearish cards,
   sectors; Order Block: all F&O stocks flowing into sector columns into Long/Short build-up cards with OI, zone, S1/S2/R1/R2, VWAP, R:R,
   conviction; Trading Journal: net P&L, cumulative P&L and drawdown, win rate, profit factor, expectancy, best/worst day, streak, daily heatmap)
   and a reel (POLICYBZR options trade with order block and liquidity). "Distribute your steps ... every step should have a major work."
5. **"Good 3D way: wherever I point the mouse, a pop-up appears with more detail."** (26 Nov)
6. **"Our graphics look too bad. Work with more upgrades, in a much better way."** (26 Nov, after seeing the first screenshots.) **This is the most
   important open point:** the founder was NOT satisfied with the look of the Order Flow pages as of commit `5eface8`.

---

## 3. What exists now (all on GitHub, company repo `Yusra-Khan532/financial-portfolio`, NOT merged, NO PRs yet)

Each branch builds on the one before it:

| Branch | Commit | What it contains | State |
|---|---|---|---|
| `lab-access` | `80aec65`, `5c1e35c` | **PR 1 – Lab access + Signals switch.** Migration `143_user_grants.sql`; `backend/finlit/lab/access.py` (`lab_ctx`, `signals_ctx`, `GET /api/lab/access`, admin `GET/PUT/PATCH/DELETE /api/admin/lab/grants`, audit events); `features` in `/api/auth/me`; `backend/tests/test_lab_access.py` (4 pass). Frontend: `src/lib/lab.ts`, `components/admin/LabAccess.tsx` (Console tab "Trading Lab access"), `pages/TradingLab.tsx` (`/lab`), `styles/tradinglab.css`, menu entries in `AppShell.tsx`/`Layout.tsx`, `pages/tradingLabAccess.test.tsx`. Docs `docs/TRADING-LAB.md`, MAINTAINER-MAP row. | Frontend full suite passed (5361), tsc, build OK, 4 views checked. **Full backend suite never finished cleanly** (see §4). |
| `lab-flow-engine` | `a4e76bc` | **Order Flow step 1 – engine.** Migration `144_lab_flow.sql` (`fno_futures`, `fno_oi_daily`); `backend/finlit/lab/flow.py` (formulas in its docstring); `FutureCollector` added to `refresh-instruments` in `worker.py`; new command `refresh-lab-flow`; new job `lab-flow` in `jobs/registry.py` (every 3 min in market hours + 15:40 close snapshot, gated on `DHAN_CLIENT_ID`, entry in `LIMIT_POLICY`); `dhan.daily(oi=True)`; route `GET /api/lab/flow` in `api.py`; `backend/tests/test_lab_flow.py`; plan in `docs/TRADING-LAB.md` "Order Flow". | 13 pure tests pass, job tests pass, bandit clean. **3 database tests in `test_lab_flow.py` not yet run** (they share the test DB with the full suite). |
| `lab-flow-depth` | `823d9d6` | **Step 2 – Market depth page** `/lab/flow`: `src/lib/flow.ts`, `src/pages/OrderFlow.tsx`, `src/styles/orderflow.css`, route in `App.tsx`, feature card on `/lab`, `LabGate` exported from `TradingLab.tsx`, `src/pages/orderFlow.test.tsx`. | Tests + tsc + build pass, screenshots taken. **Founder says the graphics look bad: redo the look (§5).** |
| `lab-flow-board` | `5eface8`, `e3ba2cb` | **Step 3 – Flow board** `/lab/flow?view=board` (Sankey: lines → Rising/Falling → sectors → build-ups): `src/lib/flowboard.ts` (+ `flowboard.test.ts`), board in `OrderFlow.tsx`, CSS. Plus `src/components/lab/FlowTips.tsx` (hover detail cards `TipLayer`, `useTip`, `StockPop`, `SectorPop`, `BucketPop`, `DirectionPop`, `tiltHandlers`); **written but not wired into the page yet**. | 384 frontend tests pass at `5eface8`. Same look complaint. |

Local scratch (lost when the container resets): worktree `scratchpad/wt-flow`, screenshot scripts `scratchpad/flow-shots/shot.js` and `board.js`
(Playwright with mocked `/api/*`, a realistic 212-stock snapshot), static server `scratchpad/perf/static.js`. Recreate them if needed: they serve
`frontend/dist` and answer `/api/auth/me`, `/api/lab/access`, `/api/lab/flow` with mock JSON.

---

## 4. Exact next steps, in order

1. **Finish PR 1 (`lab-access`).** Run the full backend suite alone (nothing else touching the test DB):
   `cd finlit-platform/backend && TEST_DATABASE_URL=postgresql://finlit:finlit@localhost:5432/finlit_test TEST_REDIS_URL=redis://localhost:6379/15 python -m pytest -q -p no:cacheprovider -W ignore -rfE`
   (about 35 minutes; run it in the background with a 2-hour limit). Earlier runs showed a few failures/errors around 77-95% that happened when
   another test run used the same database at the same time; they must be re-checked alone. If a failure is real, fix it. When green: open the PR
   (title "Trading Lab, part 1: access only an administrator can give, with a per-member Signals switch"), squash-merge when checks are green
   (Vercel rate-limit statuses can be ignored with one comment), verify live: `/lab` as a visitor shows "Sign in to open the Trading Lab";
   `https://finlitventures.com/api/lab/access` returns `{"access":false,"reason":"sign_in",...}`. Report with links; workspace done note.
2. **Step 1 engine PR (`lab-flow-engine`)**: rebase onto the new main after PR 1 merges (`git rebase --onto origin/main lab-access lab-flow-engine`),
   run `tests/test_lab_flow.py` including the DB tests and the full suite, then PR, merge, live check: `/api/jobs/status` lists job `lab-flow`, and
   after the next market session it shows a success; `/api/lab/flow` for an admin returns `ready: true`.
3. **Redo the look of steps 2 and 3 before shipping them** (§5), then ship step 2 and step 3 as their own PRs (rebased the same way).
4. Then steps 4 and 5 of the Order Flow plan, then the Lab's remaining parts (§6).

---

## 5. The visual redesign the founder wants (most important open point)

The founder saw screenshots of the Market depth page and the Flow board and said the graphics look "too much bad". The pages were flat and washed
out: pale pastel ribbons, thin faint lines, plain boxes, a lot of empty space. Target: rich, bold, "3D" feel like order-block.com (but our own
design), with hover pop-ups everywhere. A full rewrite of `OrderFlow.tsx` with all of this was drafted in the last session but not saved; redo it:

- **Hover pop-ups everywhere:** wrap the page in `<TipLayer>` from `components/lab/FlowTips.tsx`; on `onPointerMove` call `useTip().show(e, <StockPop .../>)`
  for: every line on the board, the depth curve (the stock under the pointer), every stock card, sector bars and boxes (`SectorPop`), build-up tiles
  and boxes (`BucketPop`), rising/falling nodes (`DirectionPop`), band bars (list of stocks in the band). `StockPop` shows price, change, a larger
  path chart, build-up and its meaning, OI and OI change, VWAP and gap, day range, zone, lot, a pivot ladder S2–R2 with price and VWAP marked, and
  the five facts with ✓ / ✕ / ?. The CSS for `.oflow-pop*`, `.oflow-ladder*` is NOT written yet.
- **3D cards:** `tiltHandlers()` sets `--rx/--ry`; CSS `transform: perspective(900px) rotateX(var(--rx,0)) rotateY(var(--ry,0))`, layered shadows,
  a glossy gradient surface, a coloured top accent (rising/falling), and the sparkline with an area fill. Turn tilt and animation off under
  `prefers-reduced-motion`.
- **Flow board:** saturated ribbons with horizontal gradients (opacity 0.6 → 0.3), lines at higher opacity with a glow filter on hover, lines that
  draw in on load (`pathLength={1}`, stroke-dasharray animation), a % grid with axis labels and time grid lines in the lines area, thick rounded
  glowing Rising/Falling bars with big count badges ("61 rising"), sector boxes as raised cards (gradient, drop shadow, a 5-px rising/falling split
  bar on the left, name plus average % on the right, ↑/↓ counts), build-up boxes as solid gradient blocks with a big number and the name in
  contrasting text. Keep `.oflow-lines path` holding exactly one path per stock (tests count them), and keep every aria-label the tests use.
- **Market depth:** a thicker glowing curve that draws in, a y-axis with % labels and grid lines, a "← N falling | N rising →" label at the zero
  crossing, raised 3D bars (gradient, highlight, shadow), build-up tiles with a ring gauge of their share and an icon, thicker gradient sector bars,
  a breadth bar with % labels.
- Check all of it in 4 views (desktop 1440 and phone 390, light and dark) with the Playwright script and real-looking data; send the founder the
  screenshots and ask whether this is the look he wants before shipping (he asked for this explicitly: he was not satisfied with the earlier look).

---

## 6. The rest of the plan

**Order Flow** (docs/TRADING-LAB.md "Order Flow"):
4. **Stock zones:** 5-minute chart (Dhan intraday candles, `backend/finlit/intraday.py`) with order blocks, fair value gaps, liquidity (previous day
   high/low, opening range), VWAP and pivots, using market-lab's method (`sm/smc.py`, MIT: `order_blocks`, `fvgs`, `vwap`). With signals on only:
   the pick label, entry/exits, R:R and lot-based size.
5. **Trading journal:** members log trades (by hand or CSV, private); net P&L, cumulative P&L and drawdown chart, win rate, profit factor,
   expectancy, average win/loss, max drawdown, best/worst day, streak, daily P&L heatmap.

**Trading Lab build order** (docs/TRADING-LAB.md): 2 Time Machine (10,000 bootstrapped replays from 60 days of Dhan 5-minute candles plus every past
session), 3 Strategy backtest (market-lab's 23 rules on 5 years of daily prices), 4 Setup scanner (evening job, own time limit), 5 Price-structure
layer + paper journal, 6 Risk read-out, 7 Case for / case against (on-demand AI, sources, no verdict), 8 Signals desk (TradingAgents flow; only with
the signals switch).

**Other open items from before:** task #160 (team verifies the Gold check), task #199 (shared with the Prism session). Shipped earlier in this
session: PRs #477, #482, #496, #511 on `Yusra-Khan532/Financial-Portfolio`.

---

## 7. Useful facts

- Local test setup: Postgres role `finlit` / password `finlit` (superuser), database `finlit_test`; Redis DB 15. Python venv:
  `python3 -m venv venv && venv/bin/pip install -r finlit-platform/backend/requirements-dev.txt`. Frontend: `cd finlit-platform/frontend && npm ci`.
- Frontend checks: `npx vitest run`, `npx tsc -b --noEmit`, `npx vite build`. Backend: `pytest`, `bandit -r finlit-platform/backend/finlit -ll`.
- Dhan quote feed: `POST /marketfeed/quote`, at most 1,000 instruments a call, one call a second (shared Redis pacer); fields `last_price`, `ohlc`
  (its `close` is the previous close), `average_price` (the day's VWAP), `oi`, `volume`, `last_trade_time`. Daily history with `oi: true` returns
  `open_interest`.
- Order Flow formulas (also in `lab/flow.py`): build-up from the current futures contract's price change and the OI change (sum of current and
  next contract against their previous close); classic pivots P=(H+L+C)/3, R1=2P−L, S1=2P−H, R2=P+(H−L), S2=P−(H−L), used only when the stored
  previous close matches the quote's within 1%; five facts = new positions (OI up), VWAP side, beyond R1/S1, |OI change| ≥ 5%, price in the top or
  bottom quarter of the day's range.
- The live site deploys `main` of the company repo automatically about every 5 minutes.
