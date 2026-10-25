# Flagged report issues and verification

Snapshot of engine `3.6.8`. The subsequent owner-requested `3.6.9` CAGR preference can recover one/two-year growth and changes the coverage figures below; see [the current model update](premium-model-v361-update.md#owner-requested-cagr-lookback-preference-369).

Reviewed all three pages and eight screenshots in the supplied `issues (1).docx`. It lists 13 companies (its numbering skips 13) and requests three financial-sector Quality changes. Screenshots show the older 3.6.3 interface. The current fixes are local and require deployment before the live site changes.

## Company results

| Company in attachment | Resolved symbol | Current result |
|---|---|---|
| TCS | TCS | P/E benchmark available; 100% input coverage. |
| Infosys | INFY | P/E benchmark available; 100% coverage. Zero borrowings are reported by FinEdge, not a missing value converted to zero. |
| HUL | HINDUNILVR | Fixed wrong-company lookup; 100% coverage. |
| Britannia | BRITANNIA | P/E benchmark available; 100% coverage. |
| Sun Pharma | SUNPHARMA | P/E benchmark available; 100% coverage. |
| Cipla | CIPLA | P/E benchmark available; 100% coverage. |
| Zee 5 | ZEEL | P/E benchmark available. Recovered missing March 2025 comparison quarter; coverage improves from 83.6% to 100%. ZEE5 is a brand; report identifies the listed company. |
| BSE | BSE | Generation succeeds; P/E benchmark available; 100% coverage. |
| Angel One | ANGELONE | P/E benchmark available; 100% coverage. |
| Trent | TRENT | Generation succeeds; P/E benchmark available; 100% coverage. |
| Taj Hotel | INDHOTEL | Supported brand/company alias; P/E benchmark available; 100% coverage. Report identifies Indian Hotels Company. |
| Tata Motors | TMCV | Fixed UTILITY classification to MFG. Provisional with 56.8% coverage: insufficient CAGR/cash-conversion history, unavailable PEG inputs and incomplete market-risk windows remain. No history is copied from another Tata entity. |
| Voltas | VOLTAS | Generation succeeds; P/E benchmark available; 100% coverage. |

Availability percentages are model input coverage, not predictive accuracy. Existing native/Upstox benchmark policy supplies the P/E comparisons in these fresh runs; not every historical screenshot required another code change. Benchmarks remain accurately labelled sector or industry in the website and PDF. Non-applicable interest cover under the existing low-debt rule is excluded only for non-financial groups.

## Lookup corrections

- Full-directory results are ranked before taking the suggestion limit. Exact symbols, ISINs and BSE codes precede name fragments.
- Verified exact aliases support HUL → HINDUNILVR, IHCL/Taj Hotel(s) → INDHOTEL and ZEE5/ZEE 5 → ZEEL. Canonical company names and symbols remain visible. Aliases only resolve when their target exists in the provider directory.
- Ambiguous and incidental substring queries require selection of the intended symbol; the shortest or first company is no longer chosen automatically. Unknown symbols are not fabricated into report identities.
- Vehicle manufacturing takes precedence over the word “construction” in “construction vehicles.” Financial classifications retain precedence. Other utility and electrical-equipment mappings remain unchanged.

Alias references: [HUL company identity](https://www.hul.co.in/our-company/), [HUL NSE listing](https://www.nseindia.com/get-quote/equity/HINDUNILVR/Hindustan-Unilever-Limited), [IHCL investor information](https://ir.ihcltata.com/), [IHCL NSE symbol disclosure](https://investor.ihcltata.com/SHP_PublicSharehold.aspx?as_on_date=31-MAR-2025&dvrval=&value=), [ZEE5 company description](https://www.zee5.com/aboutus).

## Quarter recovery correction

ZEEL's March 2025 quarterly record was dated October 2024–March 2025 and correctly failed the quarterly-duration check. Its FinEdge annual statement and first three quarters provide a complete same-basis calculation. The shared resolver now recovers additive Q4 values as full-year totals minus those three quarters. The calculated observation has a genuine three-month period and retains the latest source publication date.

This never overwrites valid reported values, including zero. It does not infer EPS from annual EPS, convert balance-sheet stocks into flows, combine statement bases, or invent a quarter if the annual span or any required comparison amount is absent. Source notes disclose the calculation. Quarterly dashboard requests optionally fetch the matching FinEdge annual statement so the dashboard and report use the same correction.

## Owner-confirmed Quality changes

Confirmed directly in chat: **always replace** the original factor and use interest coverage scoring **0 at 2×, 100 at 8×**, retaining each original scoring slot. Engine version is **3.6.8**; the supplied owner baseline remains `3.6.1-simple` with these explicit overrides.

| Group | Removed scored factor | Replacement | Contribution within Quality |
|---|---|---|---:|
| BANK | Capital adequacy | Interest coverage | 25% |
| NBFC | Capital adequacy | Interest coverage | 25% |
| INSURANCE | Solvency | Interest coverage | 50% |

Interest coverage uses `(annual profit before tax + annual interest expense) / annual interest expense`. Missing PBT or interest expense stays unavailable; a known zero interest expense with available PBT retains the existing zero-interest scoring rule. Financial groups do not apply the non-financial low-debt exclusion. Original capital/solvency values cannot restore the removed scoring slot. BANK valuation fallbacks remain unchanged.

Follow-up source checks:

| Stock | Input coverage under 3.6.8 | Remaining missing scored factors |
|---|---:|---|
| HDFCBANK | 100% | None. |
| DHANBANK | 100% | None; explicit standalone report. |
| BAJFINANCE | 90% | Gross NPA and net NPA. Interest coverage is calculable. |
| HDFCLIFE | 75.6% | Net-premium CAGR and interest coverage. |
| LICI | 74% | Net-premium CAGR and interest coverage. |

For HDFC Life and LIC, the inspected FinEdge and Upstox responses do not supply the required annual interest expense. It is not inferred from cash interest paid or treated as zero. Replacing their available solvency factor with unavailable interest cover reduces measured coverage by ten percentage points. Their raw solvency observations are retained internally but no longer affect Quality or create a warning about a scored solvency factor.

## Verification

- **396 backend tests pass.** Coverage includes ambiguous lookups, alias precedence, exact matches beyond the suggestion limit, vehicle classifications, Q4 calculation boundaries, publication dates, reported zeros, and all three financial-group replacements.
- **28 frontend tests pass** across all six suites. A seven-page HDFCBANK PDF was rendered and every page visually inspected; the Quality section shows interest coverage and contains neither capital adequacy nor solvency as a scored factor.
- The original owner-code oracle remains a historical-baseline algorithm check using its original financial Quality slots. Separate tests validate the newly approved slots and arithmetic; the historical fixture is not rewritten to claim parity with the changed financial model.
- All 13 flagged companies completed the shared report pipeline. Twelve have 100% input coverage; TMCV remains provisional with genuine source/history gaps.
- The actual inline creation handler returned HTTP 200, ready reports and signed snapshots for HUL, BSE, TRENT and VOLTAS. HUL resolved to HINDUNILVR. No signed tokens or credentials were printed in audit logs.
- In-app checks generated Hindustan Unilever from `HUL` with 100% coverage, and Zee Entertainment from `ZEE5` with 100% coverage. The Zee report displays actual recent revenue/profit growth, margin change, and used P/E benchmarks.
- A fresh in-app HDFCBANK report shows interest cover of 1.53× in Quality, no capital-adequacy scoring factor, and 100% input coverage.
- Temporary sanitized evidence: `/private/tmp/finlit-flagged-issues/` contains before/after report JSON, model follow-up results, test logs and source-document renders. Provider responses are shared with the earlier local audit cache under `/private/tmp/finlit-model-audit/current-assessment-check-2026-10-24/requests/`.
