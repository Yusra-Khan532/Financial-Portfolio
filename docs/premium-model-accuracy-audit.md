# Premium model accuracy audit — 18 October 2026

> Superseded in part by [the seven-symbol reconciliation](premium-score-reconciliation.md): model 3.6.3 corrects net-worth mapping to Total equity as specified on page 10. Earlier parent-equity P/B agreement was a provider-consistency check, not proof of document fidelity. Current coverage limits and reference-score deltas are documented in the reconciliation.

Engine: **3.6.2**, based on the supplied 3.6-simple rules. Basis: consolidated.
Market observation: 16 October 2026. Current-data inspection, not a return backtest.

## Scope and evidence

Eight stocks cover all eight model groups. Live FinEdge statements, quotes, ownership,
daily prices and daily price ratios were inspected. Incomplete initial requests were retried
at a lower request rate before drawing conclusions. Sanitized, minimized provider fixtures
are stored under `backend/tests/fixtures/premium_stock_audit_2026_10_18.json`.
The fixture is provider evidence, not independent ground truth.

P/E and P/B below are calculated from statements and share counts versus the provider's
same-date price-ratio feed. Agreement verifies internal consistency; it does not prove
investment performance or prove the provider's data is correct.

| Stock | Group | P/E calculated / feed | P/B calculated / feed | Score | Model status | Input coverage | Data quality |
|---|---|---|---|---|---|---|---|
| RELIANCE | HEAVY | 21.912 / 21.91 | 1.811 / 1.81 | 64.19 | RATED | 85% | REVIEW REQUIRED |
| TCS | LIGHT | 17.267 / 17.27 | 7.489 / 7.49 | 59.29 | PROVISIONAL | 77% | REVIEW REQUIRED |
| MARUTI | MFG | 25.185 / 25.18 | 3.369 / 3.37 | 62.23 | RATED | 83% | REVIEW REQUIRED |
| NTPC | UTILITY | 11.055 / 11.05 | 1.511 / 1.51 | 55.85 | PROVISIONAL | 70% | REVIEW REQUIRED |
| DLF | REALTY | 36.531 / 36.53 | 3.660 / 3.66 | 46.71 | PROVISIONAL | 70% | PASS |
| HDFCBANK | BANK | 14.179 / 14.18 | 1.931 / 1.93 | 65.42 | PROVISIONAL | 62% | REVIEW REQUIRED |
| BAJFINANCE | NBFC | 30.101 / 30.10 | 5.363 / 5.36 | 71.79 | PROVISIONAL | 62% | REVIEW REQUIRED |
| HDFCLIFE | INSURANCE | 58.610 / 58.61 | 6.187 / 6.15 | Withheld | NOT RATED | 44% | REVIEW REQUIRED |

Scores include the available industry benchmark observations from this audit.
Risk calculations use the full retrieved daily history. The minimized test fixture uses
251 raw observations and may contain fewer valid sessions, so risk coverage can differ.
These are diagnostic model results, not recommendations. Data-quality review is a separate flag and does not change documented model points or labels. HDFC Life is unrated because coverage is below 50%.

## Corrections implemented

1. **NBFC NII:** subtract `financeCosts` when it supplies interest expense; do not use gross revenue as NII. Bajaj Finance's latest NII is now derived from the actual interest fields.
2. **Loan balances:** support current plus noncurrent loan fields; require both components, retaining explicit zeroes.
3. **Insurance profits:** map shareholder profit after tax separately from policyholder surplus and net premium income.
4. **Bank book equity:** derive capital plus reserves only when it reconciles to reported assets less deposits, borrowings and other liabilities. Explicit equity fields retain priority. This is book equity, not a claim to calculate regulatory adjusted net worth.
5. **Share denominator:** include shares represented by depository receipts only when the complete dated ownership count reconciles to paid-up shares plus receipts and to quoted price/market cap within 2%. Reliance and HDFC Bank were affected; blindly trusting quote `shares` or domestic paid-up shares distorted valuation.
6. **Balance comparisons:** loan and insurer net-worth growth require the same month/day a year earlier. An arbitrary balance sheet from the previous calendar year is no longer accepted.
7. **Profitability formula fidelity:** retain the supplied model formula: last FY profit divided by latest book equity (ROE) or latest assets (ROA). The report also exposes annual matching balances as context; it does not replace the documented denominator with annual or average balances.
8. **CAGR fidelity:** retain the supplied trailing up-to-six year-end window and minimum three-year interval. Incomplete windows remain missing; no undocumented alternate CAGR window is selected.
9. **Publication dates:** exclude filings dated after the assessment date. This is a current-data safeguard, not a fully historical point-in-time database.
10. **Valuation checks:** flag same-date P/E/P/B discrepancies above 5% for data review. The score continues to use the documented calculated ratios; provider disagreement does not silently replace the model formula.
11. **Daily-price gaps:** zero/missing closes do not create returns across unknown sessions; incomplete drawdown windows and affected turnover windows remain missing. Recent invalid observations create a separate data-quality review flag; the documented confidence/label rules remain unchanged.
12. **Data review:** unknown company classification prevents applying a valid group model and withholds the rating. Stale/unverified market dates, old quarterly statements and unresolved share-count conflicts create review warnings, separately from numeric scoring and its documented confidence rules.
13. **Provider resilience:** a shared two-request limit and bounded retries for transient failures reduce silent data loss; entitlement failures are not retried.
14. **Presentation:** coverage is described as input coverage, not model or prediction accuracy. Existing saved snapshots are immutable; recalculation uses 3.6.2.

## Remaining data limitations

- Bank/NBFC NPA and total capital adequacy inputs are missing or zero placeholders in the inspected consolidated responses. CET1 and standalone disclosures are not silently substituted.
- TCS and DLF's FY2025 cash-flow rows report a January–March duration despite the annual request. They are excluded; this prevents treating a potentially quarterly value as a full financial year.
- Recent daily series contain zero-price rows for several stocks. Their effect is disclosed and confidence is not increased by assuming those closes.
- Only Reliance had complete eligible industry peer coverage in this run. Maruti, NTPC, HDFC Bank and HDFC Life had incomplete current peer data. TCS, DLF and Bajaj Finance exceed the current 100-peer on-demand limit. Corresponding industry metrics remain filled; partial data is not advertised as a complete industry median.
- Industry EV/EBITDA is not supplied by the inspected daily-ratio endpoint. This metric remains explicitly filled.
- HDFC Life has only seven consolidated quarterly observations and two annual observations in the response, preventing a 3-year CAGR and a mature streak score.
- Historical group fills remain the owner's October 2026 static snapshot. No fitted thresholds or weights were tuned to make these eight stocks look better.

## Independent issuer check

HDFC Bank's [June 2026 issuer filing on SEC](https://www.sec.gov/Archives/edgar/data/1144967/000119312526308398/d101962dex99.htm)
confirms consolidated interest earned of 90,575.33 crore, owner-attributable net profit
of 19,244.71 crore, and the March 2026 consolidated capital/reserves used by the adapter.
Its standalone NPA and capital adequacy disclosures demonstrate why substituting those
into the consolidated report without an explicit basis change would be misleading.
Other sample-company input ratios were reconciled against the provider, not exhaustively
audited against each issuer's original filing.

## Validation and next accuracy milestone

Regression tests cover all eight real-data fixtures, owner worked examples, missing data,
losses, accounting units, period alignment, price gaps, reliability gates and API/PDF routes.
Run from the repository root:

```sh
PYTHONPATH=backend:. backend/.venv/bin/python -m pytest backend/tests/test_premium_reports.py backend/tests/test_premium_accuracy.py -q
```

Predictive accuracy has not been measured. The next substantive milestone is a dated
historical dataset containing original publication dates, delisted firms, corporate-action
adjusted prices and industry membership as known at each assessment date, followed by
out-of-sample testing across full market cycles. Separate health-rating validation from
future-return prediction; define the outcome and horizon before optimizing thresholds.
Filling current provider gaps and generating cached, complete industry benchmarks should
precede statistical calibration. Do not report an accuracy percentage without that evidence.

## Calculation disclosure and model fidelity

The user confirmed that matching the model document takes priority over matching example scores.
The pure scoring engine was checked against 96 deterministic complete-data scenarios evaluated
by the supplied original Python engine (12 scenarios per group). Final scores, component scores,
coverage and labels match within 0.000001. Edge-case hardening for unavailable and invalid inputs
is tested separately; these cases are not claimed to have parity with crashes in the original code.

Each new report saves a calculation trace alongside its immutable rating: 14-quarter and up-to-six-year
input histories, latest raw/derived inputs, every metric's category, weight, thresholds, equation,
points, status, group fills, optional exclusions, category denominators, cap application, final equation
and weighted input coverage. Both the page and PDF read that same saved trace. Older snapshots
show a prompt to recalculate instead of fabricating a trace under newer rules.

The user's additional reference companies RGL, TDPOWERSYS, WHEELS, CYIENTDLM, MARINE and APARINDS
were inspected through their provider financial inputs, alongside Reliance already covered above.
Their screenshot scores are general examples, not target labels or calibration data. The screenshot
alone does not establish an exact common assessment date, basis or benchmark universe, so differences
are not treated as implementation errors without tracing the underlying inputs.

Validation: 202 backend tests pass, including the 96 reference-engine parity cases; frontend production
build passes. PDF input/formula pages were rendered and inspected. Initial app-browser verification hit the stopped local server and its data-URL error page. After restarting the app and user sign-in, live in-app testing passed for fresh Reliance and HDFC Bank reports, group-specific calculation trails, and the native PDF download. The downloaded Reliance PDF contains 14 pages with every calculation section and matching component/final scores. Changes remain uncommitted.
