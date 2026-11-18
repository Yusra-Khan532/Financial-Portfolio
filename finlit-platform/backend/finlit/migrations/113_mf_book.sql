-- Task #235 phase 3b (the 18 Nov portfolios pack, C1, C5, C6): the MF portfolio by platform (an app, a broker or the fund house), with each buy and sale.
--
-- mf_books         one row per member: the member's platforms (portfolios) as a JSON list [{id, name, broker?, created?}], at most 10, each name its own.
-- mf_holding_lots  each purchase now names its platform (pf) and whether it is a buy or a sale (side); a sale's `invested` is the money received
--                  (units × the sell NAV). Sales are matched to buys first in, first out within each fund and platform; the page's figures use what is left.
--                  Lines stored before stay buys in the first platform ('main').
CREATE TABLE IF NOT EXISTS mf_books (
    user_id    uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    portfolios jsonb       NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mf_holding_lots ADD COLUMN IF NOT EXISTS pf text NOT NULL DEFAULT 'main';
ALTER TABLE mf_holding_lots ADD COLUMN IF NOT EXISTS side text NOT NULL DEFAULT 'buy';
ALTER TABLE mf_holding_lots ADD COLUMN IF NOT EXISTS pos integer NOT NULL DEFAULT 0;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mf_holding_lots_pf_check') THEN
        ALTER TABLE mf_holding_lots ADD CONSTRAINT mf_holding_lots_pf_check CHECK (pf ~ '^[a-z0-9]{1,16}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mf_holding_lots_side_check') THEN
        ALTER TABLE mf_holding_lots ADD CONSTRAINT mf_holding_lots_side_check CHECK (side IN ('buy', 'sell'));
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON mf_books TO finlit_api;   -- the member's own data: the API writes it
    END IF;
END
$$;
