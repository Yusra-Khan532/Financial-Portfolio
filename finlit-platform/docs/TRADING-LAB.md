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

Each piece goes through `docs/TASK-PROMPT.md` like any task: tests, 4 views, live check.
