-- Listing-day prices and the latest close of every listed IPO, from the exchanges' daily price files (finlit/ipobhav.py, job `ipo-prices`).
--   day1_open .. day1_close   the listing date's open, high, low and close as the exchange traded them (NSE by symbol, else BSE by scrip code or ISIN)
--   day1_src                  'NSE' or 'BSE'; day1_checked_at: when the listing date's file was last read (an issue is read once, and again for ten
--                             days if the share was not in the file)
--   last_px, last_px_date     the newest close in the exchange's file, and its day; last_px_src 'NSE' or 'BSE'
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS day1_open numeric(12,2);
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS day1_high numeric(12,2);
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS day1_low numeric(12,2);
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS day1_close numeric(12,2);
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS day1_src text;
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS day1_checked_at timestamptz;
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS last_px numeric(12,2);
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS last_px_date date;
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS last_px_src text;
