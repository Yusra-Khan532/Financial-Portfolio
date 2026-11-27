-- Trading Lab > Trading journal (docs/TRADING-LAB.md "Trading journal"): the trades a Lab member records for themselves, by hand or from a CSV.
-- Private to the member: every read and write is filtered by user_id; deleting an account deletes its trades. exit_price NULL = still open.
CREATE TABLE IF NOT EXISTS lab_journal (
    id           bigserial     PRIMARY KEY,
    user_id      uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol       text          NOT NULL CHECK (length(symbol) BETWEEN 1 AND 60),
    side         text          NOT NULL CHECK (side IN ('long', 'short')),
    qty          numeric(16,4) NOT NULL CHECK (qty > 0),
    entry_price  numeric(14,4) NOT NULL CHECK (entry_price > 0),
    exit_price   numeric(14,4) CHECK (exit_price IS NULL OR exit_price > 0),
    entry_at     timestamptz   NOT NULL,
    exit_at      timestamptz,
    fees         numeric(14,2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
    setup        text          CHECK (setup IS NULL OR length(setup) <= 40),
    notes        text          CHECK (notes IS NULL OR length(notes) <= 1000),
    created_at   timestamptz   NOT NULL DEFAULT now(),
    CHECK ((exit_price IS NULL) = (exit_at IS NULL)),
    CHECK (exit_at IS NULL OR exit_at >= entry_at)
);
CREATE INDEX IF NOT EXISTS lab_journal_user ON lab_journal (user_id, entry_at DESC);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON lab_journal TO finlit_api;
        GRANT USAGE ON SEQUENCE lab_journal_id_seq TO finlit_api;
    END IF;
END
$$;
