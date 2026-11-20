-- Task #278 (Concall Monitor): what each earnings-call filing says, read once by the `concalls` job from the filing's PDF (finlit/concall/service.py):
-- the call's date and time, whether it is an earnings call, the audio and other links. One row per filing (its exchange link); the page groups them
-- into one card per call. A filing that could not be read keeps its reason and is tried again on a later run.
CREATE TABLE IF NOT EXISTS concall_docs (
    link        text        PRIMARY KEY,                 -- the exchange archive link of the filing (feed_items.link)
    symbol      text        NOT NULL,
    kind        text        NOT NULL CHECK (kind IN ('schedule', 'recording', 'transcript', 'presentation')),
    title       text,
    filed       date        NOT NULL,
    call_date   date,                                    -- as the letter states it; NULL when it does not
    call_time   text,                                    -- 'HH:MM' (IST, 24 hours) as the letter states it; NULL when it does not
    earnings    boolean     NOT NULL DEFAULT false,      -- the letter is about an earnings / results call (a schedule that is not is left off the page)
    quarter     text,                                    -- 'Q2 FY27' when the letter names it
    audio       jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- direct audio file links (.mp3 ...) the letter gives
    links       jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- other links it gives (the company's recordings page, a video page)
    pages       integer,                                 -- pages in the file, when read
    status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'read', 'no_text', 'failed')),
    why         text,                                    -- why a filing could not be read
    tries       integer     NOT NULL DEFAULT 0,
    read_at     timestamptz
);
CREATE INDEX IF NOT EXISTS concall_docs_symbol ON concall_docs (symbol, filed DESC);
CREATE INDEX IF NOT EXISTS concall_docs_call ON concall_docs (call_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS concall_docs_pending ON concall_docs (status, filed DESC);

-- The AI summary of a call, written once per document (its transcript, or its presentation when there is none) and shown to every member who opens it.
CREATE TABLE IF NOT EXISTS concall_summaries (
    link        text        PRIMARY KEY,                 -- the document the summary was written from
    symbol      text        NOT NULL,
    source_kind text        NOT NULL,                    -- 'transcript' or 'presentation'
    text        text        NOT NULL,
    pages       integer,
    model       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
