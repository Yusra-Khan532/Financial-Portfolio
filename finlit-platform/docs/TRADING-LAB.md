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
- The signal tools (Buy/Hold/Sell rating, trader's plan, trade-size debate) are built after the research tools, as part 8.
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

### RSI heatmap (built 26 Nov 2026)

Tab `/lab/flow?view=rsi`, route `GET /api/lab/rsi` (Lab members only, `no-store`; `backend/finlit/lab/rsi.py`). RSI(14) by Wilder's method
(`analytics.indicators.rsi`, the same code as the company report's technicals) for every F&O stock on four timeframes:

* 5 minutes: Dhan's 5-minute candles. Only the closes are kept, in Redis `lab:rsi:c5:{SYMBOL}` (about 30 calendar days, TTL 3 days).
* 15 minutes and 1 hour: grouped from those candles from 09:15 IST, a bar's close being its last 5-minute close. Hourly bars are 09:15, 10:15 ...
  14:15 and a short last bar 15:15 to 15:30.
* 1 day: FinLit's daily closes (`price_daily`), with today's latest price as today's close until today's daily row is stored (never twice). No Dhan call.

A value is shown from 50 bars; with fewer it is null with the reason. Bands are names only: 30 or less "oversold band", above 30 and below 40
"weak", 40 to 60 "middle", above 60 and below 70 "strong", 70 or more "overbought band". The page says "RSI is a fixed formula on past closes; it is
not a forecast." The grid (`lab:rsi:latest`, TTL 7 days) holds per stock the four values, the value one bar before, the band, the bar count, whether
the latest bar is still forming and the bar times; per sector the average of each timeframe; per timeframe the count of stocks in each band. The
route adds `asOf` and `stale` (older than 30 minutes in market hours, or 80 hours outside them).

The page: band-count bars per timeframe (choosing a part filters the list to it), then the stocks by sector (each sector closes and opens, with its
average row), cells 5m | 15m | 1h | 1D coloured by band; sort by name or by a timeframe's value, band, sector and search filters; a hover card on every
cell (name, sector, price, the four values and bands, the value before and the change, the bar times, "includes the bar still forming"). On a
phone (560px or less): a timeframe chooser and compact tiles, no sideways scroll. "How it is worked out" gives the formula.

Job `lab-rsi` (`refresh-lab-rsi --max-minutes 6`, limit 9 minutes): every 15 minutes in market hours plus a closing pass at 15:45 on weekdays, only
when Dhan is set up. The first fill of a stock asks 30 calendar days of 5-minute candles in one call; later runs ask only from the last stored bar
and merge (no duplicates, trimmed to 30 days); a stock whose stored candles already end with the session's last bar, fetched after the close, is not
asked again before the next session opens. Stocks fetched longest ago go first. Every call takes a slot of the shared Dhan Data API pacer
(`intraday.slot(..., share=True)`: a second's slot only when no other call used that second, so the job makes at most one call a second and
visitors keep the rest of the allowance) and counts against the 90,000-a-day cap. At its deadline the run stops starting calls and builds the grid
from what is stored; stocks not reached keep their candles and go first next run. Budget: about 27 runs a weekday × 210 stocks ≈ 5,700 calls a
day, about 6% of the cap. To check live: the 60-minute grouping is ours (from 5-minute bars), so it does not depend on how Dhan aligns its own
60-minute candles; compare a stock's hourly value with a charting site that anchors hourly bars at 09:15.

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
