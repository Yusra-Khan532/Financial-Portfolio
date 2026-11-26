# Strategy Lab — analysis and plan (agreed for later; NOT started)

Status: **analysis complete, waiting for the owner's "go"** (owner, 26 Nov 2026: "put this all strategy in memory … after few days I will be calling you … then you have to start").
Nothing is built. This branch (`plan/strategy-lab`) holds only this plan. When the owner says "go": read this file in full, re-check the facts in section 3 against the then-current `main` (things move fast), get the section 7 answers, then start **Phase 0** on a fresh branch from the latest `main`.

## 0. What the owner asked for
A new section for F&O traders (focus: futures and options), beside the Trading Lab (`/lab`), that studies trading strategies and is "more than perfect" compared with StrykeX (strykex.in, Stockwiz Technologies LLP, SEBI RA INH000013925, NSE/BSE empanelled algo vendor). Inputs the owner supplied (not in this repo; ask the owner to re-attach when starting):
- `StrykeX_Research_Prompt.md` / `StrykeX_Research_Report.pdf` (180-page teardown of 71 individual algos, 19 bundles, 16 algofolios; made with a browser agent from a logged-in account, read-only),
- `strykex_algos.json` (106 records = 71 + 19 + 16; segment names spelled inconsistently), `strykex_marketplace_71_algos.csv`,
- a build prompt ("Strategy Lab: F&O Strategy Research Section"): sections 0–9 — principles, modules 3.1–3.9, data/backend, frontend, compliance, phases, six house strategies. Its content is summarised and amended below; this plan supersedes it where they differ.
The raw competitor data is deliberately **not** committed here (it came from a logged-in account; legal use undecided — question 7).

## 1. Lessons from the teardown (verified ones only)
1. Logic hidden: not even the structure (legs, strikes, wings, entry window, stops) is disclosed.
2. Headline figures gross by default; "returns" = simple P&L ÷ minimum capital (≈ one lot's margin), not compounded.
3. "Max Drawdown" is a round risk band (10/15/20/25/35/50%), not measured.
4. Backtest and live blended into one curve; live periods often clearly weaker.
5. Bundles/algofolios are plain sums of components (reconciled exactly for 18 of them); no correlation, margin netting or rebalancing.
6. ~71 "algos" come from about six engines (R1 weekly Nifty 400-pt credit spreads; R2 monthly premium structures; R3 Monday/weekday straddles; R4 one multi-index trend engine behind futures, option-buying, combo and Momentum-Blast products; R5 one equity momentum pool; R6 stock F&O momentum). 1.0/2.0 copies.
7. Discontinued products vanish (survivorship): "Block Burst" seen only in order history.
8. No Greeks, margin, gap-day, expiry-day, event-day or regime analytics.
9. Name-only search; numbers contradict between pages; two price lists.
10. Done well (keep and do better): per-trade logs with timestamps, live/backtest tags and "live since", charges toggle + slippage what-if, browse by segment/capital/risk, a "what could go wrong / is it right for you" research PDF, account-level loss limits, forward-test (paper) mode.

**Correction (checked 26 Nov 2026 against our own index history, `/api/indices/NIF50|NIFBAN/history`):** the report's "data-integrity red flag" (strikes implying Nifty ≈22,850 on 29 Oct and ≈25,800 on 25 Nov 2026, "back-filled data?") is **false**. Our closes: Nifty 22,936.75 (29 Oct) → 23,440.80 (2 Nov) → 25,044.65 (9 Nov) → 25,819.25 (25 Nov); Nifty Bank 54,909.65 → 55,002.20 → 59,741.25 → 63,703.25. A real ~12.6% rally. Never repeat that claim; check every competitor claim against our own data.

## 2. Hard constraints found (facts, 26 Nov 2026 — re-verify)
### 2.1 Our data (repo audit)
| Needed | Have? |
|---|---|
| Historical option chains (bid/ask, IV, OI) | **No.** Live only: `backend/finlit/options.py` → Dhan `/optionchain`, 1 request / 3 s, Redis 45 s. Option-chain page switched off (task #213), API Gold-only. |
| Intraday bars: index, futures, options | **No.** Stock intraday on demand only (`intraday.py`, Redis ≤ 7 days). Lab keeps the day's F&O-stock path in Redis (`lab:flow:series:<day>`, 4 days). |
| Lot-size history, expiry calendar, strikes history | **No.** `dhan_instruments`, `dhan_option_lots` (053) replaced whole each load; expiries only from the live Dhan list. `fno_futures` (144), `fno_oi_daily` (30 days). |
| SPAN/exposure margin | **No.** |
| NSE holiday calendar; RBI/budget event calendar | **No** (only `mcx_holidays`; past repo decisions; FinEdge board-meeting dates). |
| Daily OHLCV stocks/indices | **Yes:** `price_daily` (500 days, Timescale), `daily_candles` (Dhan, ~3 yrs), FinEdge ~6 yrs in `snapshots`, `price_history_long` weekly to 2004, NSE bhavcopy files from 2016 at `/data/nse/bhav_<year>.csv.gz`, NSE index files `idx_<year>.csv.gz`. Index history via FinEdge (Redis only). |
| India VIX | Live (INDVIX) + FinEdge history on demand; **no stored table.** |
| Corporate actions | FinEdge + NSE files. |
Licences: Dhan (~₹499/month; ask Dhan in writing about public display — `docs/DHAN-SETUP.md`), FinEdge (unverified — `docs/AUTHENTICITY-AUDIT.md`); redistribution of derived backtests not settled (`docs/TECHNICAL-DOCUMENT.md`).
### 2.2 Infrastructure
One EC2 **t3.small** (2 vCPU, 2 GB RAM + 2 GB swap), app container 500 MB, jobs container 800 MB, TimescaleDB 640 MB, Redis 256 MB, 40 GB disk, **no S3**, 63 jobs, recurring memory faults (`docs/ops/MEMORY-AND-503.md`). Stack: React 19 + Vite 8 + TS, lightweight-charts; FastAPI (research API) + site-api (FastAPI + MongoDB); job supervisor (`docs/JOBS.md`, jobs never stop). → Heavy backtests/Monte Carlo/walk-forward must run **off the server** (owner's Mac or a short-lived cloud box); only results go to Postgres.
### 2.3 Trading Lab (existing)
`docs/TRADING-LAB.md`, `docs/HANDOVER-TRADING-LAB.md`. `/lab` (admin grant only, `lab/access.py`, migration 143 `user_grants`, per-member Signals switch unused so far), `/lab/flow` (Market depth) and `?view=board` (Flow board), job `lab-flow` every 3 min in market hours (Dhan quote, ~630 instruments → Redis `lab:flow:latest`). Money Flow on unmerged branch `lab-money-flow`. Planned but not built: zones, journal, Time Machine, 23-rule backtest, setup scanner, paper journal. → Strategy Lab should be a section **inside** the Lab, not a second "lab".
### 2.4 Regulation (primary sources; not legal advice — get a lawyer's written opinion)
- Retail algo framework: SEBI circular SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/0000013 (4 Feb 2025); glide path SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/132 (30 Sep 2025), all brokers from 1 Apr 2026; NSE/INVG/67858 (5 May 2025). Empanelment is triggered by "providing the facility to place algo orders … through API". Black-box algos need RA registration + a research report per algo. White box = logic disclosed and replicable. Publishing rules/backtests without execution is not covered by the algo framework (interpretation) — but other rules apply:
- Intermediaries Regs 16A (29 Aug 2024) + circular 29 Jan 2025 (updated 8 May 2026): regulated entities may not associate with anyone who gives unregistered advice or "makes any claim, of returns or performance expressly or impliedly". Education-only lag on market price data: **30 days** from 1 Jul 2026 (was 3 months).
- RA regs (Dec 2024): "research services" include trading calls, price targets/stop-losses, model portfolios. PaRRVA (circular 4 Apr 2025; CARE Ratings + NSE, live 4 May 2026): past performance may be advertised only if PaRRVA-verified; no route for hypothetical backtests.
- TradeTron adjudication (25 Mar 2026, ₹2 lakh on ATS Share Brokers): SEBI treated "success rate > 52% … avg monthly profit per lot", "win rate > 70%, max drawdown 20%, monthly return > 40%" as misleading/assured-return content.
- IA regs: risk profiling and suitability are IA duties → "suitability gate", "may suit you if", "recommended lots", Kelly sizing = personalised-advice risk.
- Enforcement examples (press reports): Avadhut Sathe (₹546 cr impounded, Dec 2025), Asmita Patel (~₹53.7 cr, Feb 2025), Baap of Chart (₹17.2 cr, Oct 2023).
**Safe while unregistered (interpretation):** fully disclosed strategy rules; payoff/Greeks/margin calculators; user-run backtests on data ≥ 30 days old, framed as method (no headline returns, rankings or win-rate marketing); paper trading of the user's own rules; no broker referrals. **Needs RA (+PaRRVA):** current signals, "trade this now" strategies, live/forward records of our strategies, model portfolios, any paid strategy service. **Needs IA:** personalised sizing/suitability. **Needs exchange empanelment via a broker:** any order placement.

## 3. Our principles (build prompt + CLAUDE.md; both apply)
Net of all Indian F&O costs + modelled slippage by default (gross opt-in) · measured, never labelled (DD, recovery, risk band from the equity curve) · in-sample ≠ out-of-sample ≠ forward ≠ live, never blended · one source of truth per metric, versioned; a test fails if two pages disagree · auditable trades (underlying price at entry/exit; nightly data-quality job) · full structure disclosed for every strategy · no survivorship (retired strategies stay, with reason) · Research & Education mode, `EXECUTION_ENABLED=false` · describe, never advise · everything stays free unless the owner decides · never invent data (dev mocks clearly marked) · jobs never stop · no copying StrykeX names/text/layouts/colours · runs on our stack.

## 4. The recommended product: an honest structure lab (not a black-box catalogue)
Ranked by value ÷ effort:
1. **Dated cost & contract-spec tables** (with tests): STT on option sell-side premium and the much higher STT on exercised ITM intrinsic value; futures STT; NSE/BSE transaction charges; SEBI fee ₹10/crore; stamp duty (buy side; options 0.003%, futures 0.002%); 18% GST on brokerage + exchange + SEBI fee; brokerage per order after freeze-quantity splits; lot sizes; expiry weekday; freeze quantity; margin rules — each with its effective date. **Verify every rate/date against its circular before coding.** Results net by default; show costs as a % of gross edge.
2. **Break-even slippage** per strategy + sensitivity curve; slippage model widening for far-OTM, last days to expiry, 09:15–09:20 and after 15:20, and size vs visible depth. Start a light bid/ask snapshot recorder (within Dhan limits) early to calibrate later.
3. **Market-rule change markers on every chart:** e.g. Nifty lot 25 → 75 (Nov 2024) → 65; Bank Nifty lot changes; end of non-benchmark weeklies (Nov 2024); NSE expiry day to Tuesday (Sep 2025); STT changes; expiry-day extra ELM. (All to be verified.)
4. **Publish the whole parameter grid, not the best variant:** trial registry, number of variants tried, deflated Sharpe, PBO (CSCV) for parametric families.
5. **Measured, dated drawdowns:** underwater chart, time under water, longest DD, recovery; **named stress-day replays** (23 Mar 2020, 4 Jun 2024 election result, budget days, big gaps) instead of VaR from ~250 trades.
6. **Strict labels:** "Simulated (in-sample)", "Simulated (out-of-sample, split fixed in advance)", "Forward since <date>" — never "live" while execution is off. Rule sets hashed and dated before their forward period. Graveyard of retired strategies.
7. **Regime tables using only information known at entry:** India VIX bucket at entry, prior trend state, gap days, expiry days, event days; sample size + confidence shown; buckets under 30 trades hidden.
8. Later: margin timeline from NSE SPAN files (incl. expiry-day ELM, returns on peak margin); Greeks and P&L attribution (theta/delta/vega/costs); portfolio view with real correlation and margin offsets; sequential decay test (CUSUM/SPRT) once forward data exists; paper trading of user-built rules; no-code backtester.

### Changes to the build prompt
| Build prompt | Change |
|---|---|
| House strategies 1–6 | Mirror StrykeX R1–R6. Use 3–4 textbook structures named by structure: monthly iron condor; monthly defined-risk credit spread; short strangle with wings (tail risk disclosed); daily index-futures trend. |
| Suitability gate, "may suit you if / not for you if", "recommended lots", capped Kelly, "which suits ₹X", "graduate to live" | Remove (personalised advice). Keep a neutral calculator: user enters capital, stop, margin → arithmetic only. |
| Headline CAGR / win-rate cards | Lead with structure, measured risk, costs, break-even slippage. CAGR hidden under 3 years; return base = peak margin + stated buffer. |
| Live Tracking tab | No "live" while execution is off: "Forward since <date>". |
| Monte Carlo trade reshuffle, VaR/CVaR 95%, "OOS Sharpe −50% → Experimental", decay alert at 95% band | Weak for short-vol with clustered losses: stress-day replays, deflated Sharpe/PBO, sequential test later. |
| Semantic search, AI assistant, PDF report, duplicate detection, `competitor_benchmark` table | Defer; competitor data not loaded at all without legal clearance. |
| `/strategy-lab` routes, Next.js/tRPC/Tailwind | A section inside `/lab`; our React + Vite + FastAPI stack. |
| "Premium" | CLAUDE.md: everything stays free — owner decides. |
| 6-week MVP | Honest estimate: Phase 0 ~2 weeks, MVP ~10–12 weeks. |

## 5. Phases
- **Phase 0 (~2 weeks, no feature code):** real data inventory incl. anything the backend team holds outside the repo; dated cost & contract-spec tables + unit tests; bid/ask snapshot recorder; NSE F&O bhavcopy loader design (index contracts: OHLC, settle, OI; ~10k rows/day, ~12M over 5 years; via the existing Cloudflare relay); written questions for a lawyer; metric formula spec with hand-computed fixtures.
- **MVP (~10–12 weeks, admin-gated inside `/lab`):** 3–4 white-box Nifty structures on daily F&O data; library by structure; detail page (Rules · Performance · Trades); methodology page with the cost table; graveyard; nightly data-quality check; cross-page metric consistency test; SEBI's "9 in 10 individual F&O traders lose money" finding + our disclaimer. Daily data cannot test intraday stops → a stated conservative fill rule (short-option stop fills at the worse of stop price and the day's high). Intraday 5-minute families wait for intraday options history.
- **Later:** SPAN margin, Greeks/scenarios, portfolio view, paper trading of user-built rules, no-code backtester; execution only after legal sign-off.

## 6. Working method when started
Per CLAUDE.md: one task at a time, each with its own branch from the latest `main`, its own PR, tests, live check, report and workspace notes; describe never advise; never fabricate numbers; every regulatory/rate fact verified against its source before use.

## 7. Decisions only the owner can make (ask before Phase 0)
1. Registration: is FinLit or a related entity SEBI RA/IA registered? If not, a written legal opinion before anything goes public?
2. Data: does the backend team hold historical intraday options, dated lot sizes or bid/ask data outside the repo? Budget for historical options data?
3. Compute: may backtests run off the server (owner's Mac or a short-lived cloud box), publishing only results?
4. Free or plan-gated (CLAUDE.md says everything stays free)?
5. Placement: a section inside the Trading Lab, admin-only at launch?
6. Honesty in practice: publish every variant and every failure, even when results look poor?
7. Competitor data: may the StrykeX data be used even internally?
8. Audience: experienced F&O traders first; show naked-tail structures at all?
