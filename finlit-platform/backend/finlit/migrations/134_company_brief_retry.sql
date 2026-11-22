-- Task #328 (22 Nov 2026): the company brief's annual-report downloads.
--   last_fetch  the last attempts at the annual report: address host, HTTP status, bytes received, relay or direct, outcome (refused, not_found, network,
--               too_large, not_pdf, unreadable). last_state now tells "failed_download" (nothing usable came back) from "failed_unreadable" (a PDF without text).
--   One-off: every company left as failed_unreadable before this change was recorded that way whatever happened (a refused download included), and was then
--   never tried again. Their tries are reset once, so the next run reads them by the new route (stored announcements, the Console address, the listing
--   address through the relay). From now on a given-up company is tried again once a week.
ALTER TABLE company_brief_sources ADD COLUMN IF NOT EXISTS last_fetch jsonb;
UPDATE company_brief_sources SET attempts = 0, last_tried_at = NULL WHERE last_state = 'failed_unreadable';
