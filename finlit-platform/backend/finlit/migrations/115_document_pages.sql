-- Task #255 (19 Nov 2026): "chatbot is still not taking investor presentation data". FinLit AI read every presentation from the exchange at the moment
-- of the question (four requests, 30 seconds), so a slow or throttled exchange left it with nothing. The text of each document read, by the Discovery
-- job or by FinLit AI, is kept here: FinLit AI reads it first. One row per file (its exchange link). Rows older than 400 days are pruned by the job.
CREATE TABLE IF NOT EXISTS document_pages (
    link      text        PRIMARY KEY,
    symbol    text        NOT NULL,
    kind      text        NOT NULL,                     -- Investor presentation | Annual report | Call transcript
    title     text,
    filed     date,
    pages     jsonb       NOT NULL DEFAULT '[]'::jsonb, -- the text of each page, in order
    read_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_pages_symbol ON document_pages (symbol, kind, filed DESC);
