-- NSE's four classification levels per company (task #192, finlit/taxonomy.py): macro sector (12) > sector (22) > industry (59) > basic industry (197),
-- from NSE's own lists. One row per listed company, with its ISIN (from disclosure_isin) so fund and ETF holdings, read by ISIN, join here.
-- `source` is the rule that placed the company; `note` says why any level is blank ("Not classified: ..."). Filled by `worker classify-companies`
-- (run at every start; only rows placed by an older rule version, or never placed, are worked out again) and kept current when a report is saved.
CREATE TABLE IF NOT EXISTS company_classification (
    symbol          text PRIMARY KEY,
    isin            text,
    macro_sector    text,
    sector          text,
    industry        text,
    basic_industry  text,
    source          text,
    note            text,
    rule_version    int  NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_classification_isin_idx ON company_classification (isin);
CREATE INDEX IF NOT EXISTS company_classification_industry_idx ON company_classification (industry);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT ON company_classification TO finlit_api;   -- the API only reads; the worker places the companies
    END IF;
END
$$;
