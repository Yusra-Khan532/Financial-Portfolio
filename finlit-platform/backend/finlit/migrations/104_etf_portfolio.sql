-- ETF portfolio (finlit/etfportfolio, task #136): the ETFs a member keeps on the page, and how many units of each (optional).
--
-- etf_holdings  one row per member and NSE symbol. qty NULL means "not given yet": until every ETF has a quantity, each counts the same on the page.
-- It belongs to the member: every query filters on user_id, and deleting the account deletes it (ON DELETE CASCADE).
-- Prices, NAVs, costs, holdings and risk figures are NOT stored here: they are read from etf_funds, etf_history and the disclosure tables when the
-- page is asked for, so they are always current.
CREATE TABLE IF NOT EXISTS etf_holdings (
    user_id    uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol     text          NOT NULL CHECK (symbol ~ '^[A-Z0-9&_.\-]{1,24}$'),
    qty        numeric(20,4) CHECK (qty IS NULL OR qty > 0),
    created_at timestamptz   NOT NULL DEFAULT now(),
    updated_at timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, symbol)
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON etf_holdings TO finlit_api;   -- the member's own data: the API writes it
    END IF;
END
$$;
