-- Task #365, re-check (28 Nov 2026): every exchange filing read "0.00 Neutral" because the sentiment model only ever saw the exchange's subject line
-- ("... has informed the Exchange about Credit Rating"). The filing's own words now come first (finlit/filing_text.py):
--   feed_items.lead      the opening of the filing's own text: the exchange's longer description when the stored title was cut (lead_src 'exchange'),
--                        else the first paragraphs of the filing's PDF with the letterhead, addresses and signatures taken out (lead_src 'pdf').
--                        Kept apart from `summary`, which is the administrator's own short note and is shown on the News page as it is.
--   filing_reads         one row per filing whose PDF the nightly `filing-text` job tried: what came of it and when it may be tried again, so a file
--                        the exchange does not give is not asked for every night.
--   feed_sentiment       `state` says what the row is: 'read' (the model read words; score set), 'routine' (a filing that carries no news by nature,
--                        e.g. an ESOP allotment: no score) or 'empty' (no words to read: no score). `text_hash` is the hash of the text that was scored,
--                        so an item whose text changes (its lead arrives) is scored again.
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS lead text;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS lead_src text;

CREATE TABLE IF NOT EXISTS filing_reads (
    feed_id      bigint      PRIMARY KEY REFERENCES feed_items (id) ON DELETE CASCADE,
    status       text        NOT NULL CHECK (status IN ('ok', 'no_text', 'failed', 'too_large', 'skipped')),
    tries        integer     NOT NULL DEFAULT 1,
    reason       text,
    read_at      timestamptz NOT NULL DEFAULT now(),
    retry_after  timestamptz
);
CREATE INDEX IF NOT EXISTS filing_reads_retry_idx ON filing_reads (retry_after) WHERE retry_after IS NOT NULL;

ALTER TABLE feed_sentiment ALTER COLUMN score DROP NOT NULL;
ALTER TABLE feed_sentiment ALTER COLUMN pos DROP NOT NULL;
ALTER TABLE feed_sentiment ALTER COLUMN neu DROP NOT NULL;
ALTER TABLE feed_sentiment ALTER COLUMN neg DROP NOT NULL;
ALTER TABLE feed_sentiment ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'read';
ALTER TABLE feed_sentiment ADD COLUMN IF NOT EXISTS text_hash text;
ALTER TABLE feed_sentiment DROP CONSTRAINT IF EXISTS feed_sentiment_state_check;
ALTER TABLE feed_sentiment ADD CONSTRAINT feed_sentiment_state_check CHECK (state IN ('read', 'routine', 'empty'));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT ON filing_reads TO finlit_api;
    END IF;
END $$;
