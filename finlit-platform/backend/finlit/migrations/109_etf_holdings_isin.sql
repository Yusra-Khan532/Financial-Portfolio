-- Task #183 part 3 (COMMON-RULES 9): every ETF a member keeps is stored and read by its ISIN as well as its NSE symbol. The symbol stays the key for
-- prices (etf_funds, etf_history); the ISIN joins holdings files, the AMFI expense ratio and the stocks inside. New rows are written with the ETF's
-- ISIN; this fills the ones stored before. An ETF without an ISIN in etf_funds leaves it NULL (said on the page, never guessed).
ALTER TABLE etf_holdings ADD COLUMN IF NOT EXISTS isin text;
DO $$
BEGIN
    IF to_regclass('etf_funds') IS NOT NULL THEN
        UPDATE etf_holdings h SET isin = f.isin FROM etf_funds f WHERE f.symbol = h.symbol AND h.isin IS NULL AND f.isin IS NOT NULL AND f.isin <> '';
    END IF;
END
$$;
CREATE INDEX IF NOT EXISTS etf_holdings_isin_idx ON etf_holdings (isin);
