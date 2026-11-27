-- Bulk, block and short-selling deals as the exchange published them (finlit/deals.py, the `deals` job; page /ipo?view=deals).
-- One row per published line. A bulk line that is the same trade as a block line (same day, share, side, client, price to the paisa,
-- quantity within one share) is kept, with also_block = true, so the Bulk filter still lists it; every total counts it once.
-- NULLS NOT DISTINCT: a short-selling line has no client and no side, and re-reading a day must still insert nothing new.
CREATE TABLE IF NOT EXISTS market_deals (
    id            bigserial PRIMARY KEY,
    exchange      text NOT NULL,                     -- 'NSE' | 'BSE'
    kind          text NOT NULL,                     -- 'bulk' | 'block' | 'short'
    day           date NOT NULL,
    symbol        text NOT NULL,
    security_name text,
    client        text,                              -- as published
    client_key    text,                              -- normalised (finlit/deals.py client_key)
    side          text,                              -- 'buy' | 'sell' | NULL for short selling
    qty           bigint NOT NULL,
    price         numeric(14,4),                     -- trade price / weighted average price
    value_cr      numeric(14,4),                     -- qty * price / 1e7
    remarks       text,
    also_block    boolean NOT NULL DEFAULT false,    -- a bulk row that is the same trade as a block row
    source        text NOT NULL,                     -- 'nse-archive' | 'nse-snapshot' | 'nse-historical' | 'bse'
    fetched_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT market_deals_one UNIQUE NULLS NOT DISTINCT (exchange, kind, day, symbol, client, side, qty, price)
);
CREATE INDEX IF NOT EXISTS market_deals_day ON market_deals (day DESC);
CREATE INDEX IF NOT EXISTS market_deals_symbol ON market_deals (symbol, day DESC);
CREATE INDEX IF NOT EXISTS market_deals_client ON market_deals (client_key, day DESC);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON market_deals TO finlit_api;
        GRANT USAGE ON SEQUENCE market_deals_id_seq TO finlit_api;
    END IF;
END
$$;

-- A member's follows: a share (what = 'symbol', key = the NSE symbol) or a client (what = 'client', key = the normalised client_key). After each run the
-- deals job adds one notification per member for the day's new deals in what they follow (finlit/deals.py notify_follows). Never the backfill.
CREATE TABLE IF NOT EXISTS deal_follows (
    user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    what       text        NOT NULL CHECK (what IN ('symbol', 'client')),
    key        text        NOT NULL CHECK (length(key) BETWEEN 1 AND 160),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, what, key)
);
CREATE INDEX IF NOT EXISTS deal_follows_key ON deal_follows (what, key);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON deal_follows TO finlit_api;
    END IF;
END
$$;
