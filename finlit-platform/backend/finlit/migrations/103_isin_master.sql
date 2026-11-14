-- Task #128: holdings files are read by ISIN, not by company name. isin_master is the depository's ISIN list (NSDL "ISIN details"), equity shares and
-- mutual fund units only, so an ISIN the exchanges' lists do not carry (an old ISIN from before a split, a partly paid share, an unlisted share, a fund unit)
-- can still be named and explained. Replaced as a whole on each load (finlit/isin.py `load_master`); the list's own date is kept in mf_meta 'isin-master'.
--
-- isin         the 12-character ISIN
-- issuer       NAME_OF_ISSUER as the depository writes it
-- description  SECURITY_DESCRIPTION ("... EQ NEW FV RE.1/-", "... PARTLY PAID", "<scheme> - DIRECT PLAN - GROWTH")
-- cfi          the ISO 10962 CFI code: E... equity (ES share, EP preference), C... collective investment (fund units)
CREATE TABLE IF NOT EXISTS isin_master (
    isin        text PRIMARY KEY,
    issuer      text NOT NULL,
    description text NOT NULL DEFAULT '',
    cfi         text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS isin_master_issuer_idx ON isin_master (issuer);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT ON isin_master TO finlit_api;   -- the API only reads; the worker loads it
    END IF;
END
$$;
