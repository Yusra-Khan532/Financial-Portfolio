# Assessment data audit — 24 October 2026

Historical snapshot of engine `3.6.7`. The subsequent owner-confirmed `3.6.8` financial Quality replacements change bank/NBFC/insurer coverage; see [the later flagged-issues verification](premium-flagged-issues-2026-10-24.md) for current results.

Checked 16 symbols across all eight model groups through the same dashboard input resolver used by Premium Reports. Statements defaulted to consolidated; DHANBANK resolved explicitly to standalone. Provider responses were captured locally and reused for controlled before/after comparisons. These are current assessments, not point-in-time backtests or a full-universe audit.

Coverage measures model input availability, including partial streak-history credit. It does not measure investment prediction accuracy or certify provider values. Group estimates remain distinguishable from company observations. Classifications, weights and scoring ranges were not changed in this audit.

## Results

| Stock | Group | Coverage before → after | Remaining gap or review |
|---|---|---:|---|
| RELIANCE | HEAVY | 100% → 100% | Calculated P/B differs from provider P/B; review equity denominator/date. |
| TCS | LIGHT | 100% → 100% | No missing scored factors. |
| MARUTI | MFG | 100% → 100% | No missing scored factors. |
| NTPC | UTILITY | 100% → 100% | No missing scored factors. |
| DLF | REALTY | 100% → 100% | No missing scored factors. |
| HDFCBANK | BANK | 100% → 100% | No missing scored factors after configured BANK fallbacks. |
| BAJFINANCE | NBFC | 85% → 85% | Gross NPA, net NPA and capital adequacy unavailable in inspected responses. |
| HDFCLIFE | INSURANCE | 78.4% → 85.6% | Net premium income CAGR lacks sufficient consecutive annual history; short quarterly record remains provisional. |
| LICI | INSURANCE | 77.6% → 84.0% | Net premium income CAGR lacks history; solvency units require review. |
| ABB | MFG | 47.3% → 61.9% | Consolidated streaks, both CAGRs, margin change and cash conversion lack history. Explicit standalone report has 100% coverage. |
| CYIENTDLM | MFG | 95.2% → 95.2% | No entirely missing factors; streaks retain partial history credit. |
| JIOFIN | Unverified; MFG default | 93.6% → 93.6% | Sales CAGR missing; classification blocks rating. Model team review pending. |
| DHANBANK | BANK | 100% → 100% | Standalone; no missing scored factors after configured BANK fallbacks. |
| TDPOWERSYS | MFG | 100% → 100% | No missing scored factors. |
| WHEELS | MFG | 100% → 100% | Calculated P/B differs from provider P/B; review equity denominator/date. |
| SOLARINDS | MFG | 100% → 100% | No missing scored factors in the fresh capture. |

Ten symbols have 100% input coverage. Eleven have no entirely missing scored factors; CYIENTDLM has partial streak credit. Full coverage can coexist with a data-integrity caution.

## Fixed in the shared dashboard/report path

- Upstox quarterly recovery now reads the grouped quarterly income series. Its `full_statement` is always annual, even on quarterly requests; those annual figures are no longer inserted into quarterly histories. Only clearly identified revenue and net profit categories are mapped; generic operating profit is not assumed to be EBITDA, and annual EPS is not copied into quarters. [Official Upstox documentation](https://upstox.com/developer/api-documentation/get-income-statement/).
- Recovery checks inspect individual required values and calendar continuity, rather than accepting a sufficient raw row count. Existing reported values, including zero, retain precedence.
- Recent growth checks recognize each factor's actual start of reporting and apply the owner's existing short-history fallback. Only leading absent periods are removed; interior gaps stay missing. This recovers recent growth for ABB and the two insurers without creating missing quarters or long-term CAGR history. Engine version is `3.6.7`.
- Shared FinEdge requests retry transient failures within a bounded budget. Authentication/request errors are not retried, and report wrappers do not multiply the retry budget. Exhausted transport errors are sanitized.
- Invalid sentinel quote dates are rejected so the existing dated-price/Upstox fallback can run. A captured SOLARINDS response dated year 0001 reproduced a dividend-date overflow; regression tests cover it. The fresh cohort capture already had a valid quote date.
- Very small positive insurer solvency ratios are flagged for unit verification in both the assessment status and category explanation. Raw values are retained; no company-specific scaling is invented.

## Remaining source work

1. **BAJFINANCE regulatory ratios:** obtain gross NPA, net NPA and capital adequacy from a verified provider endpoint or a dated issuer regulatory disclosure on the selected basis. The inspected FinEdge financial/ratio responses and generic Upstox ratios do not provide them or enough inputs to calculate them safely. Stage-3 assets and CET1 are not assumed to be identical replacements.
2. **Insurer premium history:** request at least four consecutive annual net-premium observations for CAGR. The inspected consolidated feeds supplied only two recent annual premium years. Generic company revenue cannot replace insurance net premium income.
3. **ABB basis:** a separately generated standalone report is fully covered. Consolidated history remains sparse; do not patch it with standalone figures. Select standalone explicitly when that is the intended assessment basis, or obtain longer consolidated filings.
4. **LICI units:** FinEdge returned annual March 2026 solvency `0.0235` and quarterly June 2026 `0.0242`. LIC's official March 2026 release reports **2.35 times**, confirming an annual unit discrepancy. The June figure's intended units still need dated primary-source confirmation. The report flags review and preserves the provider value. [LIC FY2026 release](https://www.licindia.in/documents/d/guest/press_release_final_32_21052026).
5. **P/B reconciliation:** RELIANCE calculated P/B 1.483 versus reported 1.78; WHEELS calculated P/B 5.490 versus reported 5.06. These exceed the 5% consistency tolerance and are data-consistency cautions, not missing inputs. The model retains its documented calculated ratio; issuer equity attribution and provider book-value methodology need reconciliation before changing it.
6. **JIOFIN classification:** classification must be verified with the model team. Available inputs alone cannot remove this rating blocker.

## Validation and reproduction

- All 346 backend tests pass, including quarterly-versus-annual payload handling, per-metric history starts, interior gaps, valid zeros, bounded retries, invalid dates and solvency warnings.
- The controlled final run completed for all 16 symbols; ABB standalone was checked separately through the same report generator.
- Fresh HDFCLIFE and LICI reports generated successfully in the local in-app browser, showing 86% and 84% coverage, respectively. HDFCLIFE displayed recovered recent premium/profit growth; LICI displayed the solvency-unit caution. Both retained unavailable premium CAGR. An internally rendered LIC PDF has seven pages and includes the unit caution in the category review and review notes. The browser download-event check timed out, so that interaction was not confirmed.
- Sanitized response captures and before/after report JSON are stored locally under `/private/tmp/finlit-model-audit/current-assessment-check-2026-10-24/` (`baseline`, `verified`, `requests`, `ABB-standalone.json`). They contain public provider financial data, not credentials, and are temporary development evidence rather than a production archive.
- These fixes are local until committed and deployed. Existing generated reports keep their original inputs; generate a new report to use the corrected resolver.
