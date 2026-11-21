-- Task #267: Discover reads each company's newest earnings-call transcript and newest results filing with the keyword directory's Part 2 (8 call
-- buckets) and Part 3 (7 results buckets) (finlit/discovery/sources.py). One row per company and source ('calls' | 'results'): the document read
-- (title, date, exchange link), every bucket it qualifies for with its keywords, up to 2 evidence sentences with a figure and what to verify, the tone,
-- where the text came from (kept by the site, or downloaded), and the status of the read (ok, keyword_only_no_figures, no_bucket_match,
-- no_text_layer, error with its reason). Read again only when a newer document is filed or the rules change; a failed read after a day.
CREATE TABLE IF NOT EXISTS discovery_documents (
    symbol      text        NOT NULL,
    source      text        NOT NULL CHECK (source IN ('calls', 'results')),
    company     text,
    doc_title   text,
    doc_date    date,
    doc_link    text        NOT NULL,
    status      text        NOT NULL,
    reason      text,
    buckets     jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- bucket -> {distinct, total, score, terms, evidence, verify}
    matched     text[]      NOT NULL DEFAULT '{}',          -- the buckets, for the per-bucket lists
    tone        real,
    tone_label  text,
    pages       integer,
    text_from   text,                                       -- 'stored' (document_pages / earnings_call_text) | 'fetched' (the exchange)
    rules       integer     NOT NULL DEFAULT 1,
    read_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (symbol, source)
);
CREATE INDEX IF NOT EXISTS discovery_documents_matched ON discovery_documents USING gin (matched);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT ON discovery_documents TO finlit_api;
    END IF;
END
$$;
