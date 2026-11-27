# FinLit Trading Lab

Research tools for NSE traders, open only to members an administrator names (founder, 25 Nov 2026: "in the website, put an option that only admin
can give access to anybody ... make a full setup of this"). Not part of any plan; administrators always have it.

## Sources studied (MIT and Apache-2.0 licensed; credited on the page)

| Source | What it is | What we take |
|---|---|---|
| [Day Trader skill](https://github.com/Jakeschincariol/day-trader-skill) (the reel the founder shared) | 11 Claude skills (Python, US market: Yahoo, Nasdaq lists, SEC, US House disclosures): scanner, news, entry timer, exit planner, Time Machine, risk, budget, order executor, alerts, earnings analyst, Congress trade tracker | The **Time Machine** method (10,000 bootstrapped replays of the rest of the session from the stock's own 5-minute bars, plus a replay of the same rule on every past session) and the **paper journal** idea |
| [market-lab](https://github.com/heysanjeevv/market-lab) | A local NSE dashboard (Python, numpy/pandas): 23 swing strategies with a 5-year backtest, smart-money structure (BOS, order blocks, FVG, VWAP), sector map, research note | The **23 swing rules and their backtest**, the **price-structure layer**, the **scanner** rules |
| [TradingAgents](https://github.com/TauricResearch/TradingAgents) (Apache-2.0; founder's "trading agent" repo) | Multi-agent LLM research: analysts (technical, news, sentiment, fundamentals), a bull and a bear researcher who debate, a manager who rates Buy to Sell, a trader and risk debaters. v1.0 (24-25 Nov 2026) became a research-only agent with numbered sources and step/token budgets | The **case for / case against** debate as a described panel (no rating), **a source after every figure** and **hard budgets** for LLM answers, a computed **risk read-out**, and a factual **reflection** on closed paper-journal entries |

## What is left out, and why

- **Placing orders** (Day Trader's broker skill) and **"get in now" calls** (its entry timer): FinLit describes, never advises; intraday trade signals are
  regulated research in India (SEBI research-analyst rules). Simulations run only on plans the member types in.
- **US-only skills** (Congress trades, SEC earnings reader, the US scanner universe): FinLit already covers Indian filings and results.
- TradingAgents' **Buy/Overweight/Hold/Underweight/Sell rating**, its trader plan and its risk debate on position size (advice), its memory that
  feeds past outcomes into new calls on a stock (a learning signal generator), and its paid or US-first data feeds (FinLit uses its own NSE stores).
  LLM work runs on demand and is cached, never as a nightly run over every stock.
- **Duplicates** of FinLit pages (market-lab's sector map and research note): Sector Pulse and the company report already do this.
- Wording follows CLAUDE.md: the banned word "target" becomes "upper exit level", "stop" becomes "lower exit level"; every page carries the
  disclaimer that intraday trading loses most people money.

## Signals switch (founder's decision, 25 Nov 2026)

The founder asked that the parts left out above can be switched on per member for an internal end-to-end test: "put those also options: buy, hold,
sell, rating, the traders plan, and trade size, debate ... ignore FinLit rules for them ... make the proper backend setting of this thing".

- A per-grant switch, `options.signals` on `user_grants`, **off by default**. Only an administrator turns it on (Console > Trading Lab access: the
  "Signals" box when giving access, or the On/Off switch on a grant). Every change is audited (`lab_signals_on` / `lab_signals_off`).
- Administrators always have signals. `/api/auth/me` lists `trading_lab_signals`; `/api/lab/access` returns `signals`.
- Every signal route depends on `signals_ctx` (403 `signals_off` for a member without the switch). Only the **Signals desk** on `/lab` follows
  these rules; it carries the label "Signals on · internal test", and every other page of the site keeps the describe-only wording.
- The signal tools (Buy/Hold/Sell rating, trader's plan, trade-size debate) are built after the research tools, as part 8 (built 27 Nov 2026:
  "Signals desk" below).
- Note for later: giving buy/sell calls to the public in India falls under SEBI's research-analyst rules; keep the switch to the team while testing.

## Access (built: PR 1)

- Table `user_grants` (migration 143): member, feature `trading_lab`, granted by, granted at, optional end, note. Deleting an account deletes it.
- `finlit/lab/access.py`: `lab_ctx` (administrator, or an active grant) guards every Lab route; `GET /api/lab/access`;
  `GET/PUT/DELETE /api/admin/lab/grants` (administrators with the authenticator code). Every grant and removal is in the audit log.
- `/api/auth/me` lists `features: ["trading_lab"]` for a granted member (and administrators), so the menu shows the entry only then
  (side menu > Account > Trading Lab; top-bar account menu).
- Console > **Trading Lab access**: give access by email (until removed, 7, 30, 90 days or a year) with a note; list; remove.
- `/lab`: an invitation message without access; the tools with it.

## Build order (one PR each)

1. Access (this document's first section). **Done.**
2. **Time Machine (NSE):** a plan (stock, date, start price, lower and upper exit levels, flat-by time) replayed 10,000 times from 60 days of
   Dhan 5-minute candles, plus every past session the same rule applied; odds of each level first, close distribution, fan chart, sample size.
3. **Strategy backtest per stock:** market-lab's 23 rules on 5 years of FinLit daily prices: win rate, average result in R, worst run, past signals on
   the chart.
4. **Setup scanner:** each evening, the NSE stocks whose chart matches each rule (a new job, inside its own time limit; it never weakens another job).
5. **Price-structure layer and paper journal** (with a factual 2-4 sentence reflection when an entry closes: what happened, return against Nifty 50,
   which noted assumption held; no "lesson" or next-trade advice).
6. **Risk read-out** (computed, no LLM): 20-session against one-year volatility, deepest fall with dates and recovery, one-day VaR and expected
   shortfall, Sortino, Calmar, beta against Nifty 50, each with its window.
7. **Case for / case against** (FinLit AI, on demand, cached until new filings or prices): "What the figures support", "What the figures challenge",
   "What the data cannot settle"; a numbered source after every figure; no verdict or rating; banned-word filter after generation; step and token caps.
8. **Signals desk** (only with the signals switch): the TradingAgents flow on FinLit's own NSE data: analysts, a bull/bear debate, a five-step
   Buy-to-Sell rating with its reasons, a trader's plan, and a cautious/balanced/aggressive trade-size debate; on demand, cached, with step and
   token caps.

Each piece goes through `docs/TASK-PROMPT.md` like any task: tests, 4 views, live check.

## Order Flow (founder, 26 Nov 2026)

The founder shared order-block.com (a paid site: Home, Order Block, Trading Journal) and a reel ("POLICY_BAZAR Stock Options Trade with Order
Block and Liquidity. Intraday Stock Selection Process") and asked for "same kind of page ... build that end to end ... distribute your steps ...
every step should have a major work". What that site shows, read from the screenshots and the reel:

- **Home:** a market-depth curve (how far every F&O stock has moved, bullish against bearish), the strongest bullish and bearish stocks as cards with
  a small chart, money moving by sector, a community feed.
- **Order Block:** every F&O stock's line for the day, gathered into a bullish and a bearish count (37 and 175 in the reel), then into sector boxes,
  then into stock cards: long or short build-up, OI change, zone, S1/S2/R1/R2, VWAP side, risk, R:R, a conviction mark and "PICK BULLISH #1". The
  reel then takes an option trade on the top card (1 lot, about 25,000 of capital).
- **Trading Journal:** net P&L, cumulative P&L with drawdown, win rate, profit factor, expectancy, average win and loss, deepest drawdown, best and
  worst day, streak, a daily P&L calendar.

Method behind it: the futures OI build-up reading every Indian F&O desk uses (price and OI against the previous session), VWAP, classic floor
pivots, and the smart-money "order block" (the last opposite candle before a move that broke structure) with liquidity at the previous day's high
and low. These are public methods; market-lab (MIT, studied above) already has the order-block and FVG code (`sm/smc.py`). We build our own page on
FinLit's own data and look; nothing of order-block.com's design, name or text is copied.

What we keep to the Lab's rules: every Lab member sees the facts (build-up, OI, VWAP, zones, levels, a count of how many facts agree). The
pick ranking label, the trade plan (entry, exits, R:R, size) and the "conviction" wording appear only with the **signals switch** (Signals desk rules).

Steps (one PR each):

1. **Engine** (this PR): `lab/flow.py`, job `lab-flow` every 3 minutes in market hours plus the closing snapshot, migration 144
   (`fno_futures`, `fno_oi_daily`), `GET /api/lab/flow`. One Dhan quote call per snapshot covers every F&O share and its current and next futures
   contract; OI change is against the previous close of the same contracts (stored by the engine; a missing day is filled once from Dhan's daily
   history); pivots only when FinLit's stored previous day matches the quote's previous close. Formulas in the module's docstring.
2. **Market depth page** (`/lab/flow`, first tab; `pages/OrderFlow.tsx`): rising and falling counts with a breadth bar, the depth curve (every
   stock's change, lowest to highest, hover for the stock), stocks by band of change, the four build-ups with their meaning, sectors by average change
   (choose one to filter), and "Most facts lined up" cards each way (day's sparkline, build-up, the five facts as dots with their names, OI change,
   VWAP gap, zone). Refreshes every minute in market hours; "Last session" otherwise. Reached from a card at the top of `/lab`.
3. **Flow board** (`/lab/flow?view=board`; layout in `lib/flowboard.ts`): every stock's line of the day flows into Rising or Falling, then its
   sector, then its futures build-up (long build-up, short covering, none, short build-up, long unwinding). Each column holds the same stocks and
   each stock is one unit of height, so every ribbon is exactly as wide as its stocks. Pointing at a direction, sector or build-up lights its path;
   choosing one lists its stocks as cards (most facts first). On a phone: the lines, direction buttons, a row per sector with its build-up mix, and
   build-up buttons.
4. **Stock zone view:** 5-minute chart with order blocks, fair value gaps, liquidity (previous day high and low, opening range), VWAP and pivots
   (market-lab's method on Dhan candles). With signals on: the pick label, entry and exits, R:R and lot-based size.
5. **Trading journal:** members log trades (by hand or CSV); net P&L, cumulative P&L and drawdown, win rate, profit factor, expectancy, average win
   and loss, best and worst day, streak, daily heatmap; private to the member.


### Stock zones (built 26 Nov 2026)

Tab `/lab/flow?view=zones`, route `GET /api/lab/zones/{symbol}` (Lab members only; `backend/finlit/lab/zones.py`). It reads the stock's 5-minute
candles of the last five sessions through `intraday.load(..., "5D")`, so it shares the stock page's Redis copy, Dhan pacing and daily cap: no new
Dhan calls for a stock someone already looked at in the last minute. The chart shows the latest two sessions. Every area is a fixed rule:

* Order block: the last candle against the move when, within three candles, price closes beyond it by at least twice the average range of the 20
  candles up to it. Untested, tested (price came back into it) or broken (a close through its far side).
* Fair-value gap: three candles where the third's low is above the first's high (or its high below the first's low), at least 0.1% wide. Open,
  part filled or filled.
* Previous day high, low and close; opening range (first 15 minutes); VWAP; floor pivots.

Describe-only: the tab says where prices traded and whether price came back, never what to do.

### Case for / case against (built 27 Nov 2026, build order item 7)

Tab `/lab/flow?view=case` ("Case for / against"), routes `GET` and `POST /api/lab/case/{symbol}` (Lab members only, `lab_ctx`, `no-store`;
`backend/finlit/lab/case.py`, `frontend/src/components/lab/CaseForAgainst.tsx`). For any company with a stored report, FinLit AI writes three
sections: **What the figures support**, **What the figures challenge**, **What the data cannot settle**. TradingAgents' bull/bear debate as a
described panel: no verdict, rating, recommendation, price level or prediction.

* **Fact sheet** (no model): numbered facts from FinLit's own stores, each with its table, basis and date: the ratios table (P/E, P/B, EV/EBITDA,
  dividend yield, market cap, ROE, ROCE, margins, debt/equity, interest coverage, current ratio, cash conversion, 5Y and 3Y growth, latest-year
  growth), the latest quarter's revenue and net profit against the same quarter a year before, the year-end P/E range of the last five years, the
  daily closes (last close; change over 1 month, 3 months, 1 year; 52-week closing high and low; the 200-day average), and for an F&O stock the
  Lab's own Order Flow snapshot (change, futures OI change, build-up). Prices come from the exchange daily candles, else FinLit's price table. A
  figure that is not stored is left out. The Lab is outside the plans, so the sheet reads the full stored report for every Lab member.
* **Model**: Ask FinLit AI's own client, key, model and effort (`ask/api.client_for`, `ANTHROPIC_API_KEY`, `ASK_MODEL`, `ASK_EFFORT`); no tools;
  at most 2,500 output tokens a call (never above `ASK_MAX_TOKENS`), 40 s a call, 3 calls at once per process, two calls a case (one retry).
* **Check** (`case.check`): the three headings in order; every `[n]` on the sheet; every figure in a sentence matches a fact it cites (to the
  places written); a sentence with a figure and no `[n]` is removed, and a section left empty fails; no word of the case's banned list
  (`BANNED_WORDS` in `lab/case.py`: the describe-only words of CLAUDE.md and of the Lab rules, plus valuation and advice words) and Ask FinLit
  AI's own advice check. A failing answer is asked again once with its
  failures listed; if it fails again the page says "The case could not be written within the rules this time" and lists the figures. A failing
  text is never shown or cached.
* **Limits and cache**: 20 written cases a member a day (India time, Redis counter, given back when the AI service did not answer), 6 presses a
  minute; one case per (symbol, latest filing period end, latest price date, method `case-1`) kept 8 days with the exact sheet it cites, so it is
  "cached until new filings or prices"; a cached case is free. On demand only (the button); no background job.
* **Page**: company chips and search over every listed company, the "Write the case" button (writing, limit, switched-off and fallback states),
  the three sections side by side (stacked below 1,000 px), every `[n]` a link to its source with the fact in a hover card (pointer or keyboard
  focus), the numbered Sources list grouped by table (15 shown, then "Show N more"), the dates the case was written from, and the note "Written
  from FinLit's stored figures by FinLit AI; it gives no verdict and is not a recommendation."

### Signals desk (built 27 Nov 2026, build order item 8; only with the signals switch)

Tab `/lab/flow?view=signals` ("Signals desk"), routes `GET` and `POST /api/lab/signals/{symbol}` (`signals_ctx`, `no-store`;
`backend/finlit/lab/signals.py`, `frontend/src/components/lab/SignalsDesk.tsx`, `frontend/src/lib/labSignals.ts`). TradingAgents' flow
(Apache-2.0) on FinLit's own stored data. **This is the only page that gives ratings and plans**, under the founder's decision of 25 Nov 2026.

* **Access:** the switch already existed (PR 1): `options.signals` on the grant, off by default, set only by an administrator in Console >
  Trading Lab access (audited `lab_signals_on` / `lab_signals_off`); administrators always have it. Without it the routes return 403
  `signals_off` and the tab is not listed at all (`FLOW_TABS` entry with `signals: true`, shown only when `/api/lab/access` returns
  `signals: true`; `?view=signals` then opens Market depth). The label "Signals on · internal test", the note that it is an internal test and
  not investment advice, and that public buy/sell calls fall under SEBI's research-analyst rules, are always on screen; the page disclaimer on
  this tab is the desk's own. Every other tab keeps describe-only wording (tested: `pages/orderFlowSignals.test.tsx` scans each other tab
  for a member with the switch).
* **Sheet:** the Case for / against sheet (`case.inputs`), then, numbered after it: 20- and 50-session averages, RSI 14 (Wilder), 14-session
  average true range (or the average close-to-close move when no highs and lows are stored, said so), the 20-session high and low, all from the
  stored daily candles (exchange candles, else the price table); for an F&O stock the Order Flow snapshot's floor pivots and VWAP; and the news
  FinLit stores for the stock (`feed_items` kind `news`, last 30 days, with `feed_sentiment` scores): the count, the average sentiment and the
  three newest headlines. No news stored: the news note says so and no AI call is spent on it; not in the Order Flow snapshot: the same.
* **Steps (one press, in order, progress streamed as `text/event-stream`):** 1 analyst notes (technical, financials, news and sentiment,
  Order Flow) in one call; 2 bull and bear researchers, 2 rounds (cap 2), one call a round; 3 the research manager's rating on Buy /
  Overweight / Hold / Underweight / Sell with 3 to 5 reasons, each citing [n]; 4 the trader's plan: entry zone (last close to half an ATR
  below it), stop (a quarter ATR beyond the 20-session low when that low is 0.25 to 3 ATR from the zone, else 1.5 ATR), two targets (the nearest
  stored levels at least 1R away: 20-session high, pivots R1/R2, 52-week closing high; else 1.5R and 3R), time frame up to 20 sessions;
  short plans (Sell, Underweight) only for F&O stocks, otherwise no new trade; Hold: no trade, the levels to watch. These numbers are
  computed by `trade_plan` from the stored levels, added to the sheet as numbered facts, and FinLit AI only explains them; 5 the cautious /
  balanced / aggressive size debate: risk per trade 0.5% / 1% / 2% of capital, position = risk / stop distance, held to 15% / 30% / 50% of
  capital (computed by `trade_sizes`); skipped when there is no trade.
* **Check:** each step goes through `case.check` with its own headings: every [n] on the sheet, every figure matching a fact it cites; on the
  desk a figure without [n] fails the step; the rating must be exactly one of the five words and every reason must cite a fact; no promise
  words ("guaranteed", "risk-free", ...). A failing step is asked again once, only if the calls the later steps need are still left; otherwise
  the desk stops there with a plain message (the steps before it shown, the failing text never shown) and the run is not cached.
* **Caps:** Ask FinLit AI's client, key, model and effort; no tools; at most 2,000 output tokens a call (never above `ASK_MAX_TOKENS`), 8 AI
  calls a run (6 without a retry), 60,000 tokens a run (input and output, checked before each call), 40 s a call, the case's 3 calls at once
  per process; 10 runs a member a day (IST, given back when the AI service did not answer), 3 presses a minute. A finished run is cached 8 days
  per (symbol, latest filing, latest price day, latest stored news day, method `signals-1`); a cached run is free. On demand only; no job.
* **Page:** stock chips and search; "Run the desk" with the five steps' progress; the rating as a large badge on the five-step scale with its
  reasons; the trader's plan as a chart of the last 60 closes with the entry zone, stop and targets (inside ChartZoom, a hover card on every
  level and session) and its numbers; the three size cards; the four analyst notes; the debate rounds side by side; the numbered Sources with
  hover cards (15, then "Show N more"); the calls and tokens used.

## Ideas from the MarketPulse video (founder, 26 Nov 2026)

The founder shared a second reference video (a "MarketPulse" dashboard). What fits FinLit, built one at a time after the Order Flow pages,
describe-only (calls such as "likely cap", "what's next" or strangle picks stay out, or go to the Signals desk only):
1. **Money Flow**: ₹ crore flowing into and out of each sector and its stocks, with the surge in ₹ crore a minute, from the engine's
   3-minute snapshots (turnover change by direction).
2. **Option Pulse and OI Flow**: put and call open interest strike by strike, and how fast it changes, from the site's option chain.
3. **RSI heatmap**: stocks oversold or overbought on 5-minute, 15-minute, hourly and daily bars.
4. **Liquidity map**: price with option walls, inside Stock zones (Order Flow step 4).
5. **Stock radar**: the five facts drawn as a radar.
6. **F&O Academy**: lessons with quizzes, inside Learn.
