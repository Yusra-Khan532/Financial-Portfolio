# Seven-symbol score reconciliation — 18 October 2026

Current implementation: **3.6.3**, supplied **3.6-simple** scoring rules; **consolidated** statements. Market price date: **16 October 2026**. Each run used the normal report-generation pipeline with fresh provider requests, selected-period financials and its industry-benchmark policy. No score targets, weights, limits or label thresholds were fitted to the reference table.

## Reference table versus current runs

The first two score columns were transcribed from the user’s comparison image. Delta means current minus reference FinLit, in score points.

| Symbol | TradingView reference | FinLit reference | Current | Delta vs FinLit | Model status | Input coverage |
|---|---:|---:|---:|---:|---|---:|
| RGL | 53.2 | 52.0 | 49.4 | -2.6 | RATED | 83.0% |
| TDPOWERSYS | 60.0 | 59.7 | 61.9 | +2.2 | RATED | 85.0% |
| WHEELS | 60.8 | 68.6 | 56.9 | -11.7 | PROVISIONAL | 79.0% |
| RELIANCE | 57.5 | 63.3 | 65.2 | +1.9 | RATED | 85.0% |
| CYIENTDLM | 40.2 | 27.8 | 36.0 | +8.2 | PROVISIONAL | 67.4% |
| MARINE | 52.9 | 51.7 | 54.5 | +2.8 | RATED | 83.0% |
| APARINDS | 57.2 | 59.0 | 61.8 | +2.8 | RATED | 83.0% |

**Five of seven are within 3 points of the reference FinLit scores.** WHEELS and CYIENTDLM remain material differences. This measures agreement with the supplied examples, not predictive accuracy.

## Confirmed implementation defect and correction

The supplied model PDF, section 2 / page 10, explicitly identifies net worth as balance-sheet **Total equity**. The adapter preferred parent-attributable equity, which is a different value when non-controlling interests exist. Version 3.6.3 prioritizes `totalEquity`; if necessary it derives total from explicitly supplied parent equity plus non-controlling interest. It does not assume an absent minority-interest amount is zero. The bank balance-identity derivation remains separately disclosed.

This corrects data mapping, not the scoring engine. Owner-attributable profit remains owner-attributable profit as the document requires.

| Symbol | Score before mapping correction | Corrected score | Mapping effect |
|---|---:|---:|---:|
| RGL | 49.3598 | 49.3904 | +0.0306 |
| TDPOWERSYS | 61.9306 | 61.9306 | +0.0000 |
| WHEELS | 56.9821 | 56.9343 | -0.0478 |
| RELIANCE | 64.1861 | 65.1955 | +1.0094 |
| CYIENTDLM | 35.9869 | 35.9869 | +0.0000 |
| MARINE | 54.6055 | 54.5169 | -0.0887 |
| APARINDS | 61.8063 | 61.8063 | +0.0000 |

The P/B feed may itself use parent equity. The report now explicitly warns about this definition mismatch; a provider ratio does not override the document’s total-equity formula. This remains a benchmark-comparability limitation, especially for companies with significant minority interests.

## Exact replay of the detailed Reliance screenshot

Transcribing the visible input tables and latest inputs into the engine yields **56.5942407**, displayed as **56.6**. Components reproduce the screenshot: Fundamental **53.4**, Valuation **42.9**, Quality **69.4**, Risk **84.9**, and coverage **98%**. This is a direct evidence check of the formulas using the same visible inputs.

The detailed screenshot’s 56.6 is different from both 57.5 and 63.3 in the summary table. Those references therefore cannot all be assumed to describe an identical input snapshot.

Current Reliance is **65.1955364**. The following bridge exactly reconciles the detailed screenshot replay to the current run:

| Category | Detailed screenshot replay | Current | Weighted change in final score |
|---|---:|---:|---:|
| Fundamental (40%) | 53.3602820 | 54.7093833 | +0.5396405 |
| Valuation (30%) | 42.9318113 | 63.5387531 | +6.1820825 |
| Quality (20%) | 69.4064941 | 79.4064256 | +1.9999863 |
| Risk (10%) | 84.8928571 | 83.6887200 | −0.1204137 |
| Final | 56.5942407 | 65.1955364 | +8.6012956 |

Confirmed input causes:

- **EV/EBITDA benchmark:** screenshot supplies 5.29, yielding zero relative-EV points. The API run has no verified industry EV/EBITDA median, so the documented HEAVY fill of 47.2 points applies. That alone contributes **+5.664 final-score points** versus the screenshot. It is an explicit assumption, not new evidence of better valuation.
- **Interest cost:** screenshot 40,364 crore versus API annual finance cost 27,061 crore, with identical PBT 123,162 crore. Interest cover changes from about 4.05x to 5.55x; this explains essentially the full **+2.0 final-score Quality effect**.
- **Growth inputs:** screenshot revenue series differs from the API’s `revenueFromOperations` series; quarterly and annual growth/margin calculations change. Net-profit series agrees in the transcribed screenshot. The exact net Fundamental effect is +0.5396405.
- **Valuation medians:** screenshot own P/E 24.2 and industry P/B 1.75 versus API-run 24.95 and 1.81. These explain the remainder of the Valuation difference alongside the EV fill.
- **Risk:** screenshot supplies a complete drawdown of 27.2% and unknown pledge; the current history contains an invalid close, so drawdown is filled, while a dated no-pledge declaration supplies zero pledge. Volatility also changes with the valid-return window. Their net weighted effect is −0.1204137.
- **Book equity:** corrected latest equity is 1,085,866 crore, matching the screenshot. The former parent-equity mapping used 904,030 crore and has been fixed.

## Per-symbol investigations

**RGL — 49.4 versus 52.0 (−2.6).** MFG group; June 2026 latest results. Low ROE (below the 8% zero-point threshold), cash conversion below 0.4x and high volatility reduce the score. Industry P/E, drawdown and turnover are filled. Equity mapping changes the total by only +0.0306, so it does not explain the reference gap.

**TDPOWERSYS — 61.9 versus 59.7 (+2.2).** Strong Fundamental score (89.9). Debt/equity below 0.1 makes interest cover N/A as the document requires, renormalizing Quality weights. Own-history valuation scores poorly; industry P/E and drawdown are filled. Total and parent equity agree, so the equity correction has no effect.

**WHEELS — 56.9 versus 68.6 (−11.7), provisional.** Fundamental is strong (81.4), but Quality 45.4 and Valuation 35.3 hold the total down. Current P/E relative to own history is about 1.894x, above the MFG zero-point boundary of 1.6x. Interest cover is about 2.675x, earning only 11.24 points; volatility about 52.57% earns 6.95 points. FY2025 cash-flow metadata reports a January–March duration, so it is excluded from the three-year annual cash-conversion calculation. Cash conversion, industry P/E, drawdown and turnover are filled. These four filled rows contribute 7.896 points at present; holding all other inputs and active weights fixed, moving them to 100-point values could add at most 13.104 points. That sensitivity is large enough to contain the reference gap, but it is **not proof** of the reference’s actual values. The exact 11.7-point attribution cannot be recovered from a total score alone.

**CYIENTDLM — 36.0 versus 27.8 (+8.2), provisional.** The API supplies only 11 quarters and three annual year-ends (FY2024–FY2026), so a three-year CAGR cannot be calculated. The documented 50-point fills for Sales CAGR and Profit CAGR contribute **5.4 final-score points** in total. Streaks also use the documented short-record blend (7/10 comparable quarters). Profit growth is about 2.87%, PEG scores zero, ROE below 8% scores zero, and cash conversion is negative. Industry P/E and two risk metrics are also filled. Filling both CAGRs with zero instead would lower 36.0 to about 30.6, but that would violate the supplied fill rule and still would not establish the source of 27.8. Longer/different histories, peer medians or a different missing-data treatment in the reference are plausible; they are not verified causes.

**MARINE — 54.5 versus 51.7 (+2.8).** Strong Fundamental score (93.8) contrasts with low Valuation (11.32): own-history P/E and PEG both score zero; industry P/E is filled. Weak cash conversion and modest ROE also reduce Quality. Equity correction is −0.0887 points.

**APARINDS — 61.8 versus 59.0 (+2.8).** Strong Fundamental (87.1), own-history P/E above its zero-point boundary, moderate PEG and high volatility. Industry P/E, drawdown and turnover are filled. Total and parent equity agree, so no equity-mapping effect.

## Shared provider limits and what remains unresolved

- All 13 primary provider requests succeeded for each fresh run. Successful responses can still omit fields or contain unusable periods/prices; these are separately flagged.
- Six MFG peer universes exceed the current 100-peer on-demand limit (RGL 309, TDPOWERSYS 137, WHEELS 182, CYIENTDLM 205, MARINE 205, APARINDS 137). Their industry-P/E metric uses the documented MFG fill of 28.3 points, not a computed industry median. This is an application data-coverage limitation, not evidence that the API has no such peers.
- Reliance has full current peer coverage (24/24), but no verified industry EV/EBITDA median is available from the inspected ratio feed.
- Current histories contain invalid zero closes, so complete-window drawdown and affected turnover windows are not invented. Split/bonus adjustment history also needs independent validation before interpreting risk differences as business differences.
- The summary image supplies only final reference scores. Without the same per-symbol input/parameter breakdown for the other six, their deltas are measured and the current calculation is explained, but exact source-by-source numerical attribution remains unverified.

## Verification and reproducibility

- 96 complete-data scenarios still match the supplied original Python scoring engine, including all eight groups.
- The detailed user Reliance screenshot now has its own replay regression, including all four components and coverage.
- All seven fresh canonical input sets have score/component regression fixtures under `backend/tests/fixtures/premium_reconciliation_2026_10_18.json`.
- Total-equity precedence, parent-plus-minority fallback and unknown-minority handling have regression coverage.
- Full backend suite: **211 passed**. No threshold/weight tuning or reference-score fitting was performed.
- Prior saved reports remain unchanged; generate a new **3.6.3** report to use the corrected mapping.

Sources: user-provided model document `/Users/kingsman/Downloads/Final_fundamental_model.pdf` (section 2, page 10); the two user screenshots; fresh FinEdge API responses with endpoint/parameter/retrieval metadata saved in each report snapshot. Snapshot artifacts and raw responses for this audit are retained locally under `/private/tmp/finlit-model-audit/reconciliation/` (no credentials).

## Subsequent lifecycle change

Saved-report history and database persistence have since been removed at the user’s request. The old application collection was deleted; these reconciliation inputs remain development audit fixtures, not browsable application history. Current generation uses temporary in-process state; see `premium-report-lifecycle.md`.
