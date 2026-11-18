-- Discovery (task #221): the themes each company's newest investor presentation talks about, from the keyword directory of the founder's notes
-- (finlit/discovery). One row per company: the presentation read (title, date, link), the primary and secondary themes with their scores,
-- keywords and evidence sentences, and the status of the read (ok, keyword_only_no_figures, no_bucket_match, no_text_layer, error ...).
CREATE TABLE IF NOT EXISTS discovery_companies (
    symbol       text        PRIMARY KEY,
    company      text,
    doc_title    text,
    doc_date     date,
    doc_link     text        NOT NULL,
    status       text        NOT NULL,
    primary_bucket text,
    secondary    text[]      NOT NULL DEFAULT '{}',
    scores       jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- bucket -> {distinct, total, score, terms}
    evidence     jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- up to 2 sentences with a figure, for the primary theme
    pages        integer,
    read_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discovery_companies_primary ON discovery_companies (primary_bucket);
-- The directory's screening discipline and the tone of the presentation (owner, 18 Nov 2026: "sentiment kind of analysis")
ALTER TABLE discovery_companies ADD COLUMN IF NOT EXISTS stage text;           -- operating | execution | planned | mou_pilot, for the primary theme
ALTER TABLE discovery_companies ADD COLUMN IF NOT EXISTS tone real;            -- -1 .. 1, positive minus negative finance words over both
ALTER TABLE discovery_companies ADD COLUMN IF NOT EXISTS tone_label text;

-- Every stored exchange filing of the last 180 days (news, results filings, documents) with its event type, the Discovery themes its headline names
-- and its tone (+1 / 0 / -1) (finlit/discovery/signals.py): "the same bucketing for all the companies' news in our documents section".
CREATE TABLE IF NOT EXISTS discovery_signals (
    feed_id    bigint      PRIMARY KEY,
    symbol     text        NOT NULL,
    item_date  date        NOT NULL,
    kind       text,
    event      text        NOT NULL,
    tone       smallint    NOT NULL DEFAULT 0,
    themes     text[]      NOT NULL DEFAULT '{}',
    stage      text,
    title      text,
    link       text,
    tagged_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discovery_signals_symbol ON discovery_signals (symbol, item_date DESC);
CREATE INDEX IF NOT EXISTS discovery_signals_themes ON discovery_signals USING gin (themes);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT ON discovery_companies, discovery_signals TO finlit_api;
    END IF;
END
$$;
