# Premium report lifecycle

Reports are generated on demand. There is no report-history UI, listing endpoint, report database collection, or report database read/write path.

## Production / serverless delivery

The client requests `POST /api/premium-reports` with `delivery: "inline"`. The calculation completes within that request and returns the ready report with a signed snapshot receipt. Generation no longer requires a later request to find a job in a particular server process's memory.

Only the current report is retained in that browser tab's session storage and module memory, replacing the previous current report. It can be restored after a page reload for 30 minutes. Expired snapshots are rejected and removed when read. This is temporary current-page state, not saved report history. Closing the tab clears its session state; the PDF is the durable user copy.

`POST /api/premium-reports/pdf` accepts the exact returned snapshot and receipt with administrator authentication. The server verifies purpose, administrator subject, expiry and a canonical content digest before rendering. This works even if generation and download reach different Vercel instances. Changing a value, reusing another administrator's receipt, or using an expired/wrong-purpose receipt is rejected. Integral JSON numbers are normalised to survive an unchanged browser JSON round-trip. Neither the administrator token nor the snapshot is placed in a URL. The PDF is rendered from that exact calculation without fetching providers or rescoring.

`backend/vercel.json` configures a 300-second budget for the FastAPI `server.py` function. The Vercel backend project must use `backend` as its project root for that configuration; verify the deployed entrypoint/settings if the project root differs. Deploy both backend and frontend. Earlier frontend versions keep using the compatibility flow until their bundle is updated.

## Compatibility flow

Clients without `delivery: "inline"` retain the former temporary in-process background job flow. Those IDs expire after 30 minutes/server restart and are not guaranteed to survive serverless instance changes. The updated frontend uses this only for earlier API responses/legacy links, not new production report generation. Existing short-lived one-use legacy PDF links remain supported for those current in-process reports.

## Production failure reproduced

On 18 October 2026, the live Avantel request opened `/blog/admin/premium-reports/ed47b5ef98f74d3b8cc083ff98e4f44b`, then returned “Report not found or expired” while the page still displayed “Preparing Avantel Ltd.” The deployed backend is on Vercel and used process-local job state. Frontend polling retries alone cannot recover a missing cross-instance job.

Vercel explicitly documents keeping shared state outside instance memory because any instance can handle a connection: https://vercel.com/kb/guide/vercel-services-fluid-compute . This implementation avoids needing shared report storage by returning a signed current snapshot within the request.

The old `premium_reports` MongoDB collection and its nine records were removed on 18 October 2026. This fix does not recreate it or add saved report history. Model formulas, parameters and data sourcing remain unchanged.

## Reader-facing report

The page and PDF show category scores, factor-level pros and cons, financial history and key ratios. They omit scoring weights, raw equations, engine/version identifiers, calculation IDs, input hashes and provider-request diagnostics. The PDF ends after the key-ratio section; the former calculation, methodology and source-audit appendix is removed.

`premium_presentation.py` adds deterministic commentary to the existing result. It neither fetches inputs nor changes scoring. Pros use the existing green range (70 or above), cons the red range (below 40); intermediate factors are shown separately. Filled, unavailable and inapplicable factors are never presented as company strengths or weaknesses. An industry substitute for missing company valuation history is explicitly labelled. All categories show an honest empty state when no pro or con qualifies. Higher Risk scores indicate lower assessed risk.

The full calculation trace remains available internally for validation and signed snapshot consistency. PDF rendering derives commentary from the supplied snapshot; new page snapshots include the same reader-facing review. Older current-tab snapshots remain readable, with a prompt to regenerate for full commentary. The final model scores and source-priority rules are unchanged.
