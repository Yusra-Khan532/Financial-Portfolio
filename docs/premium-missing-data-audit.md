# Benchmark policy update — 24 October 2026

This historical audit predates the provider-first benchmark policy. Reports now use valid reported FinEdge benchmarks, then valid Upstox sector benchmarks, then medians from at least five available positive FinEdge industry peer multiples. Each comparison discloses the value, provider and coverage used. Upstox sector comparisons are labelled as sector benchmarks; their statement basis, valuation date and aggregation method are unspecified. Zero/negative benchmarks are disclosed and excluded. Partial peer coverage no longer blocks the entire median. Earlier completeness-related N/A findings below are historical.

# Shared Stock Fundamentals / Premium Report sources

Updated 18 October 2026. This supersedes the earlier report-only recovery audit.

## Single production fetch path

Premium generation calls `_premium_dashboard_inputs`, which invokes the same `_fetch_stock_fundamentals` function as the Stock Fundamentals API for yearly and quarterly observations. Both consume the shared `fundamental_resolution` module. The report reuses the dashboard cache and resolved raw observations; its source selection is no longer a separate Upstox recovery implementation.

Priority: **FinEdge actual → complete calculation from available FinEdge inputs → verified Upstox fallback → N/A**. Valid zeroes and existing reported values are preserved. Missing inputs remain N/A; the scoring engine's documented group fills remain separately labelled assumptions rather than provider facts.

The dashboard's effective consolidated/standalone basis is applied consistently to the report's financial statements. Its separately disclosed standalone bank asset-quality table can supply NPA inputs, with the basis and date explicitly recorded in report provenance and review notes. CET1 never substitutes for total CRAR.

The model's metric definitions still apply to those same observations: lenders use NII, reported owner-attributable profit takes precedence for model earnings, and the report calculates ratios using the model document. Sharing sources does not replace the model's formulas with unrelated displayed ratios.

## Shared recovery and derivations

- Total tax from explicit current plus deferred tax; PAT from PBT minus total tax; owner earnings from PAT minus explicitly reported non-controlling earnings.
- Equity from explicit owner equity plus non-controlling equity, or assets minus explicitly identified liabilities; debt from current plus noncurrent borrowings, excluding leases.
- Assets and liabilities from complete current/noncurrent totals. Missing component values are not treated as zero.
- Operating revenue from explicitly identified total revenue minus other income when operating revenue is absent.
- Depreciation from identified components or the same-period cash-flow disclosure; EBITDA from complete component identities.
- Missing annual observations can use four matching, comparable quarters. FinEdge dates/duration are validated before such aggregation. Explicitly reported annual amounts win over sums.
- Missing same-basis financial periods can then use Upstox full statements, whose units and period type must be declared. Summary revenue including other income is not silently treated as operating revenue. Generic revenue cannot replace bank NII or insurer net premiums.
- WHEELS FY2025 annual operating cash flow is recovered at 400.47 crore from Upstox's yearly/consolidated disclosure after inconsistent FinEdge annual duration metadata is rejected. Both pages now use that resolution.
- CYIENTDLM FY2023 revenue/PAT can extend annual history using the same shared Upstox resolution.
- Both pages select the same complete Upstox daily exchange series when FinEdge risk-history observations are incomplete. No cross-exchange candle splicing. The quote retains its own separately disclosed source.
- A dashboard quote derived from price history is identified as calculated FinEdge history or Upstox history fallback, rather than mislabelled as a direct FinEdge quote.
- Where an Upstox balance fallback is used, the report receives those same identified assets/liabilities and reconciled equity. Missing cash or debt is not invented.

Upstox publication dates and corporate-action adjustment cannot be independently verified from these payloads. These are current assessments, not point-in-time historical backtests. Shared checks exclude future reporting periods and explicitly future filing dates where supplied. The old report-only arbitrary 120-day recovery gate has been removed.

## Industry valuation investigation

The old 100-peer P/E/P/B request cap was raised to 500 and observations are cached for 15 minutes. Requests still use the same FinEdge connector as the dashboard. Missing peer ratios are first calculated from available dated FinEdge quotes, four-quarter EPS and book equity. A current P/E observation does not imply that P/B is present.

For HEAVY/UTILITY groups with up to 100 peers, the model also attempts to calculate peer EV/EBITDA from FinEdge market cap, borrowings, cash and complete four-quarter EBITDA. Its definition matches the report's enterprise-value calculation. Larger EV universes remain unavailable within the on-demand calculation budget.

A complete universe with at least five positive observations is still required; no subset median is passed off as complete. Live checks found these remaining coverage issues:

| Check | Latest audited coverage | Outcome |
| --- | --- | --- |
| WHEELS industry | 153/182 current peer observations, including three calculated recoveries | Industry median still N/A because other peer inputs remain absent/unusable. |
| HDFCBANK industry | 40/42 current observations | Industry median still N/A; ESAFSFB and FINOPB remain missing in this run. |
| RELIANCE industry P/E/P/B | 24/24 observations | Positive P/E and P/B medians available. |
| RELIANCE industry EV/EBITDA | 10/24 fully calculable observations | Industry EV/EBITDA remains N/A; missing financial components are listed in benchmark metadata. |

Counts can vary with provider updates or transient availability. `missingSymbols`, `evMissingSymbols`, `positiveCounts` and calculation counts are retained in each report's benchmark audit. Upstox's `sector_value` is displayed by the dashboard, but its payload does not verify the same industry universe, date, statement basis or median aggregation. It therefore cannot substitute for the model's industry median.

## Remaining bank / definition gaps

- HDFCBANK NPA now follows the dashboard: audited gross NPA 1.11%, net NPA 0.37%, standalone disclosure dated September 2026, explicitly labelled alongside consolidated financials.
- Total CRAR remains N/A: the audited sources expose CET1 without enough additional capital components to calculate total CRAR. CET1 is not total capital adequacy.
- Current investments do not establish liquid investments; only explicitly identified cash/bank/liquid holdings can enter cash. All current investments are not assumed liquid.
- Provider historical P/B can use parent equity while the model uses total equity. This definition difference remains disclosed.
- Older unused history cells, metric fields outside the selected group's weights, and unavailable share-count/pledge details may remain N/A. A blank unscored field is not automatically a missing scoring input.

## Provenance and verification

`inputMeta.dashboardSources` records the exact yearly/quarterly dashboard providers, requested and effective basis, bank asset-quality basis and recovery notes. The report's source audit displays these same provider choices. Quarterly dashboard cash-flow warnings are excluded from model annual cash-conversion warnings because the model does not consume quarterly cash flow.

234 backend tests pass, including shared-cache/source parity, valid zero preservation, annual-quarter completeness, malformed periods remaining unavailable, disclosure-basis labelling, larger peer universes, peer-ratio derivation and enterprise-value completeness. Existing owner-model parity and PDF rendering tests pass. No scoring thresholds or weights were changed, and report history storage remains removed.

Live source audits covered WHEELS, CYIENTDLM, HDFCBANK and RELIANCE. In-app verification of the fresh AVANTEL report confirmed the source-priority note and matching dashboard yearly/quarterly providers, including shared Upstox price-history recovery. The browser connection initially timed out and recovered on reconnect. No PDF download was repeated.
