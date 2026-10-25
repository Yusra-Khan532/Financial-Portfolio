# Owner model update — 24 October 2026

Reference: `New_code_python_fundamental.txt`, owner baseline `3.6.1-simple`.
Application implementation: `3.6.9`, including the subsequent owner-confirmed financial Quality replacements and CAGR lookback preference. Earlier implementation stages are recorded below.

## Changes from our previous implementation

1. Profit streaks require a positive quarter as well as year-on-year improvement. Shrinking losses are failures; a return to profit keeps the existing 70-point magnitude rule. This also affects the optional PEG eligibility gate.
2. Recent profit growth scores zero when the current comparison figure is non-positive. Profit CAGR scores zero when the latest annual profit is non-positive, even with fewer than three CAGR years. Both retain their contribution and use the loss-rule status.
3. Margin change scores zero if the current operating margin is non-positive, provided a valid margin comparison exists. This applies to non-financial groups; lenders and insurers keep their existing Fundamental factors.
4. A loss-making company's short profit streak blends with zero instead of the group fill. With no comparable quarters, the profit streak is a known zero under the loss rule. Sales streaks retain their existing treatment.
5. Fundamental receives a loss-severity ceiling before the existing weak-business Valuation ceiling. The ceiling never raises a lower score.

## Fundamental ceilings

| Group family | Recovering | Current loss | Persistent loss | Chronic loss |
|---|---:|---:|---:|---:|
| LIGHT, MFG, UTILITY | 55 | 40 | 30 | 20 |
| HEAVY, REALTY | 60 | 45 | 30 | 20 |
| BANK, NBFC, INSURANCE | 50 | 35 | 25 | 15 |

- Recovering: current trailing profit is positive, but the latest annual result was non-positive or at least two of the last three annual results were non-positive.
- Current loss: trailing profit is zero or negative.
- Persistent: current loss and at least two non-positive annual results in the last three years.
- Chronic: current loss and at least four non-positive annual results in the last five years, or every available year is non-positive with at least three years present.
- Deep loss: a net loss of at least 10% of trailing revenue lowers the ceiling by another 10 points, with a floor of 10.
- Current profit uses the latest four quarterly results, falling back to the latest annual result only when fewer than four quarters exist. Missing quarterly entries are not zero and do not trigger an annual substitution across an incomplete four-quarter window.

The website and PDF explain zero-profit factors, loss-making operating margins, and an applied Fundamental ceiling in the category review. Internal traces retain raw scores, the loss profile, and separate adjustments so the final score reconciles. No weights or technical appendices are added to the reader-facing report.

## Preserved behavior

For the initial loss-rule update, weights, ordinary scaling ranges, group fills, missing-data gates, financial periods, and dashboard-aligned data sourcing were unchanged. BANK conditionally used P/E history for missing industry P/E, ROE for missing industry P/B, and interest coverage for missing capital adequacy. The subsequent unconditional Quality changes are recorded below. Missing inputs remain distinct from observed losses. Existing signed reports retain their original results; newly generated reports use the updated implementation.

The earlier universe audit captured the previous model baseline. Its stored results are not evidence of a universe-wide run under this update.

## Validation

Targeted regression cases cover all group-family ceilings, zero and shrinking losses, loss-to-profit quarters, short histories, incomplete periods, deep-loss boundaries, optional PEG eligibility, chained caps, and exact final-score reconciliation. Existing owner parity and seven-symbol reconciled-score cases remain unchanged. Website rendering and PDF tests check reader-facing explanations without exposing weights.

## Subsequent benchmark sourcing change

The same-day provider-first benchmark policy changes valuation inputs, not the L1-L5 equations or weights. The dashboard captures Upstox sector benchmarks even when company ratios already exist; reports share that captured response. Positive reported benchmarks precede peer calculations. Calculated industry medians accept at least five positive available peer values and disclose partial coverage. Benchmark policy version `2026-10-24-provider-first` is stored separately from engine version. Reader-facing comparisons show company multiples, benchmark values, source and peer counts. Missing factors disclose the exact group estimate used.

## Subsequent history recovery correction (`3.6.7`)

Upstox quarterly recovery uses its grouped quarterly series, never the always-annual `full_statement`. Recent growth removes only leading unreported slots per metric before choosing the owner's existing short-history fallback; interior gaps remain unavailable. Shared recovery checks inspect missing fields and calendar continuity. See [the 16-stock coverage audit](premium-data-coverage-audit-2026-10-24.md) for measured results and unresolved source gaps.

## Subsequent owner-confirmed financial Quality changes (`3.6.8`)

Interest coverage always replaces capital adequacy for BANK and NBFC and solvency for INSURANCE, including when the original factor is available. The owner explicitly approved the existing 2×–8× scoring range and preservation of each original contribution. Missing PBT/interest expense remains missing. Financial groups do not apply the non-financial low-debt exclusion. BANK's valuation fallbacks remain conditional and unchanged. See [the flagged-issues verification](premium-flagged-issues-2026-10-24.md) for source limitations and observed coverage.

The same update corrects vehicle classification precedence and recovers additive Q4 amounts only where a full-year FinEdge statement and the three matching quarters provide a complete same-basis identity. EPS is not inferred from annual EPS.

## Owner-requested CAGR lookback preference (`3.6.9`)

Sales and profit CAGR each use their own latest consecutive annual history. Prefer a five-year period (six annual observations), then three years (four observations), then the longest available period. With the five-year maximum, that remaining fallback is two years or one year. Four years of available history uses the requested three-year preference. At least two annual observations are required; a lone annual amount cannot produce a growth rate.

Missing calendar years are not skipped, and the calculation does not move its endpoint back from the latest financial year. The formula is `(latest / starting amount) ** (1 / years) - 1`, multiplied by 100. Existing zero/negative-base, turnaround and latest-loss rules remain in force. PEG retains its existing preference for available profit CAGR over recent profit growth, so recovered CAGR can also change PEG.

Website and PDF factors display the selected period in their labels and the reporting-year endpoints when available. A one-year observation is described as one-year growth rather than longer-term growth. Traces store selected years, available years and selected endpoints. The historical seven-symbol reconciliation explicitly retains its original minimum-history rule as a baseline test; separate tests verify the new lookback policy and current arithmetic.

Validation: 415 backend tests and 29 frontend tests pass. A fresh in-app HDFC Life report displays net premium income CAGR of 11.35% over 2025–2026 and profit CAGR of 11.81% over 2023–2026. The same labels and year ranges were verified in a seven-page PDF rendered from the captured HDFC Life inputs; every page was visually inspected.
