-- Task #235 phase 3a (the 18 Nov portfolios pack, C2, C5, C6): the ETF portfolio by demat account, with each buy and sale.
--
-- etf_books  one row per member: the member's accounts (portfolios) as a JSON list [{id, name, broker?, created?}], at most 10, each name its own.
-- etf_lots   one row per buy or sale of an ETF in one account: units, the price paid or received (optional), the date (optional). Sales are matched
--            to buys first in, first out within each account on the page and on the server; etf_holdings.qty keeps the open units across all
--            accounts, so every existing figure keeps working.
-- Both belong to the member: every query filters on user_id, and deleting the account deletes them (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS etf_books (
    user_id    uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    portfolios jsonb       NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS etf_lots (
    id         text          NOT NULL CHECK (id ~ '^[A-Za-z0-9_-]{1,40}$'),
    user_id    uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol     text          NOT NULL CHECK (symbol ~ '^[A-Z0-9&_.\-]{1,24}$'),
    pf         text          NOT NULL DEFAULT 'main' CHECK (pf ~ '^[a-z0-9]{1,16}$'),
    side       text          NOT NULL DEFAULT 'buy' CHECK (side IN ('buy', 'sell')),
    qty        numeric(20,4) NOT NULL CHECK (qty > 0),
    price      numeric(20,4) CHECK (price IS NULL OR price > 0),
    bought_on  date,
    pos        integer       NOT NULL DEFAULT 0,   -- the order the member added them in
    created_at timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS etf_lots_user_symbol_idx ON etf_lots (user_id, symbol);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON etf_books, etf_lots TO finlit_api;   -- the member's own data: the API writes it
    END IF;
END
$$;
