# Premium report lifecycle

Reports are generated on demand. There is no report-history UI, listing endpoint, database collection, or database write/read path for premium reports.

`POST /api/premium-reports` creates temporary in-process calculation state for asynchronous generation. Status and PDF routes access only this current state. It expires after 30 minutes, is bounded to 20 jobs, and disappears on server restart. Expired links ask the user to generate a new report. PDF links remain short-lived, single-use capabilities.

The former `premium_reports` MongoDB collection and its nine records were deleted on 18 October 2026. An in-app generation check confirmed that a new report does not recreate the collection. Calculation formulas, parameters, and scoring remain unchanged by this lifecycle change.

Validation: 215 backend tests pass; frontend production build passes; fresh Reliance generation works in the in-app browser with no Saved Reports section. PDF rendering/download routes are covered by the backend tests.
