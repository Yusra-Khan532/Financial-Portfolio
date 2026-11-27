-- Splits, consolidations and bonus issues since each IPO listed, from NSE's corporate actions (finlit/ipocorp.py, a step of job `ipo-prices`), so that
-- "since IPO" can compare the exchange's latest close with the issue price in the same terms for issues we hold no adjusted price history for.
--   ca_factor       the product of every action's factor since listing (1.0: none; 0.5 after a 2-for-1 split or a 1:1 bonus)
--   ca_actions      the actions it is made of: [{exDate, subject, factor}]
--   ca_checked_at   when NSE was last asked (once a week)
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS ca_factor numeric(16,8);
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS ca_actions jsonb;
ALTER TABLE ipo_gmp ADD COLUMN IF NOT EXISTS ca_checked_at timestamptz;
