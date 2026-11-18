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
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT ON discovery_companies TO finlit_api;
    END IF;
END
$$;
