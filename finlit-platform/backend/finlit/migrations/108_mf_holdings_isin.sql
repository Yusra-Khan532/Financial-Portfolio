-- Task #183 part 2 (COMMON-RULES 9): every fund a member holds is stored and read by its ISIN, which names the exact plan and option. The AMFI scheme code
-- stays as the key for NAVs and scores (one ISIN maps to one code through AMFI's NAV file, mf_schemes.isin / isin_reinvest). New holdings are written with
-- the scheme's ISIN; this fills the ones stored before. A scheme without an ISIN in AMFI's file leaves it NULL (said on the page, never guessed).
ALTER TABLE mf_holdings ADD COLUMN IF NOT EXISTS isin text;
UPDATE mf_holdings h SET isin = s.isin FROM mf_schemes s WHERE s.code = h.code AND h.isin IS NULL AND s.isin IS NOT NULL AND s.isin <> '';
CREATE INDEX IF NOT EXISTS mf_holdings_isin_idx ON mf_holdings (isin);
