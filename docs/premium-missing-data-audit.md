# Missing model data audit — 18 October 2026

Compared the premium adapter with the Stock Fundamentals dashboard and live Upstox responses. Scoring engine, owner thresholds, weights, PEG rules and group fills are unchanged. Reports remain temporary; no report history or database collection was introduced.

## Verified recovery

| Stock | Previous input coverage | Recovered input coverage | Recovered inputs |
| --- | ---: | ---: | --- |
| RELIANCE | 85.0% | 88.0% | Complete daily risk series / maximum drawdown |
| WHEELS | 79.0% | 88.0% | FY2025 annual operating cash flow, maximum drawdown, trading value |
| CYIENTDLM | 67.4% | 83.2% | FY2023 revenue and PAT extending CAGR history; maximum drawdown, trading value |
| RGL | 83.0% | 88.0% | Maximum drawdown, trading value |
| TDPOWERSYS | 85.0% | 88.0% | Maximum drawdown |
| MARINE | 83.0% | 88.0% | Maximum drawdown, trading value |
| APARINDS | 83.0% | 88.0% | Maximum drawdown, trading value |

These are weighted input coverage percentages, not predictive accuracy. The comparison holds the previous FinEdge inputs and industry benchmarks constant and applies newly fetched Upstox data. The next live generation can differ if providers update observations. CYIENTDLM also retains partial quarterly-history credibility; additional annual observations do not fabricate missing quarters.

## Why the dashboard could display data the model rejected

- WHEELS: FinEdge's annual cash-flow endpoint returned FY2025 with January–March duration metadata. The dashboard displayed it without annual-duration validation. The model correctly rejected that duration; Upstox independently labels the same 400.47 crore observation yearly/consolidated, allowing a disclosed replacement.
- CYIENTDLM: FinEdge annual history starts March 2024. Upstox supplies March 2023 as well. Full-statement `Revenue` excludes other income; the summary `revenue` includes it. Only the full-statement operating revenue is imported. PAT remains explicitly reported PAT; existing owner-attributable profit always takes precedence.
- Prices: FinEdge's daily series contains zero closes. The dashboard chart currently accepts these zeros. Upstox supplies a complete NSE series. The premium report switches its entire risk series to that one exchange; it never mixes NSE candles/volumes with FinEdge candles. Current quote, financial statements and valuation ratios keep their original sources. Exchange volumes can differ substantially.

## Still missing or needing definition reconciliation

| Input / issue | Finding | Appropriate resolution |
| --- | --- | --- |
| Industry P/E for six manufacturing examples | FinEdge returns 137–309 peers, exceeding the current report request cap of 100. This is our bounded-fetch limitation, not proof the API lacks data. | Build a complete, cached industry benchmark refresh separately from report generation, with coverage and dates; preserve the full-universe median definition. |
| Industry EV/EBITDA for Reliance | Existing FinEdge daily-price-ratio feed supplies P/E and P/B, not an industry EV/EBITDA median. | Obtain dated peer enterprise values and EBITDA or a provider benchmark explicitly documented as the correct industry median. |
| Upstox `sector_value` | Dashboard uses it as a displayed sector comparison; response does not establish that it is a same-date industry median or specify its universe/aggregation. | Verify classification, membership, timestamp and aggregation before using it in model industry comparisons. It is not silently substituted. |
| HDFCBANK gross/net NPA | Consolidated FinEdge disclosure fields are all-zero placeholders; dashboard switches its asset-quality table to separately labelled standalone disclosures. Upstox key ratios also show Net NPA without statement basis/date. | Fetch or verify actual consolidated disclosures, or intentionally generate a fully standalone model. Do not mix unlabelled standalone ratios into consolidated scores. |
| Total CRAR | Dashboard's CET1 is a component of regulatory capital, not total CRAR; neither audited Upstox key-ratio payload nor the consolidated FinEdge fields supplies verified total CRAR. | Add a verified total-capital adequacy disclosure, with basis and date. CET1 cannot replace it. |
| Cash / liquid investments | Dashboard balance-sheet cash and current investments are separate items. A current-investment total does not establish that every holding is liquid. | Add only explicitly identified liquid investments or a verified cash-and-liquid-investment aggregate, avoiding bank-balance double counting. |
| Own P/B / equity definition | Model uses total equity; provider P/B may use parent equity. Coverage does not resolve this difference. | Reconstruct comparable historical P/B from dated total equity and action-aligned shares, or verify provider book-value definition. |
| Older quarterly data, insurers' solvency, missing pledges in other symbols | Existing verified fields remain the source. Dashboard or Upstox availability alone does not prove matching definitions or dates. | Recover only explicit same-basis disclosures; retain fills/exclusions where none is verified. No zero is invented. |

Not every dash in the full input tables is a missing scoring input. For example, manufacturing groups do not score industry P/B or industry EV/EBITDA, and cash conversion needs only the latest three matching annual observations. Older WHEELS cash-flow/equity cells remain unavailable where neither audited source supplies them. These cells stay blank; they are not fabricated to make the table look complete.

## Recovery controls and trace

- Exact resolved symbol and, when supplied, ISIN must match before using the existing Upstox dashboard connectors.
- Financial payload must explicitly state requested consolidated/standalone basis, yearly duration and crore units. Monetary values are converted to the adapter's INR raw units once.
- Existing valid periods and nonmissing values, including zero and aliases, are preserved. Malformed-duration rows can be replaced by independently labelled annual observations.
- Upstox financial publication dates are absent. Recovery is limited to mature periods (at least 120 days after period end), and reports explicitly state that this is not point-in-time backtest data. This buffer is not proof of publication availability.
- Risk recovery requires 251 unique positive closes, 60 valid volume observations and a recent end date. Corporate-action adjustment is not independently verified and is disclosed.
- Recovery notes identify input section, dates, statement basis, units and exchange in `inputMeta.dataRecovery`, the source audit and existing report/PDF data-quality notes.
- Connector failure leaves missing inputs visible and does not prevent generation.

Verified against Upstox's official daily-candle response definition and retrieval limits: https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/ .

## Validation

223 backend tests pass, including eight new recovery tests. Fresh WHEELS generation was verified in the signed-in app: 60.6 score, 88% input coverage, FY2025 CFO 400.47 crore, risk coverage 100%, and recovery notes visible. The initial browser polling request needed one retry; the completed report loaded successfully. PDF download was not repeated; existing PDF rendering tests pass.
