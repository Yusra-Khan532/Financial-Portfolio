-- The full record of each IPO, for the all-IPOs table and the IPO report (finlit/iporecord.py, finlit/iponse.py). Added to ipo_gmp, which already holds
-- one row per IPO read from InvestorGain's IPO page:
--   detail          issue terms, reservation, timetable, offer documents, registrar and lead managers, key figures and restated financials from the offer
--                   document, objects of the issue, issue expenses and the anchor book (facts only; InvestorGain named as the source)
--   open_date, close_date   the bidding window (also used to stop re-reading issues that closed long ago and never listed)
--   nse_book        subscription by investor category and the bids at each price, as NSE published the consolidated book (mainboard issues; SME issues
--                   have none); nse_checked_at says when NSE was last asked, so an issue is asked once
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS detail jsonb;
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS open_date date;
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS close_date date;
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS nse_book jsonb;
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS nse_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS ipo_gmp_open_idx ON ipo_gmp (open_date DESC);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ipo_gmp TO finlit_api;
    END IF;
END
$$;
