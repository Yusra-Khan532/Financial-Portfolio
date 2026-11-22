-- BSE-only IPOs: the ticker BSE trades them under (from its daily price file; Yahoo Finance knows them by it), and the day the latest close of a share
-- that had not traded on the newest day was last looked for in earlier days' files (finlit/ipobhav.py, finlit/ipocorp.py).
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS bse_ticker text;
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS px_lookback_on date;
