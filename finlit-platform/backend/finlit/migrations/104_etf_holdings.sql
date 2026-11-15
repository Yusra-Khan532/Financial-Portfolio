-- Task #136: a member's ETFs (the ETF portfolio page, /etf-portfolio). One row per ETF the member holds or follows; `units` is NULL until the member
-- adds a quantity, and the page weighs the ETFs equally until every one has a quantity (it says so). The ETF itself (price, NAV, returns) lives in
-- etf_funds; only the member's list and quantities are stored here, as mf_holdings does for mutual funds.
CREATE TABLE IF NOT EXISTS etf_holdings (
    id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol     text          NOT NULL,                       -- NSE symbol (etf_funds.symbol)
    units      numeric(20,4) CHECK (units IS NULL OR units > 0),
    created_at timestamptz   NOT NULL DEFAULT now(),
    updated_at timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (user_id, symbol)
);
CREATE INDEX IF NOT EXISTS etf_holdings_user_idx ON etf_holdings (user_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON etf_holdings TO finlit_api;   -- the member's own data: the API writes it
    END IF;
END
$$;
