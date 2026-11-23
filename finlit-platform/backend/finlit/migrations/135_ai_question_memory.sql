-- Task #349 PR 2 (question memory for Ask FinLit AI, finlit/ask/memory.py): the questions a Silver or Gold member asked, with the key lines of the
-- answer and the figures it cited (each with its as-of date), so a later PR can say what changed "since you last asked". Nothing here changes an answer.
--
-- ai_question_memory  one row per written answer that reached the member. Never written for: AI summaries, errors, withdrawn answers, an admin's
--                     "view as" preview, or a member who switched "Remember my FinLit AI questions" off (prefs.aiMemory = false).
--   topic_key     "<kind>:<id>:<intent>", worked out without any model (memory.topic_of), e.g. "company:TCS:results", "sector:pharma:overview".
--   subject_kind  company, fund, etf, sector, economy, market, concept or general;  subject_id  the symbol, slug or term.
--   intent        overview, results, valuation, prism, news, documents, price, risks, ownership or concept.
--   question      what the member typed (at most 500 characters).
--   points        the answer's key lines: at most 8, each at most 160 characters.
--   figures       the figures the answer read from FinLit's tools, each with its as-of date (price, 52-week range, FinLit Prism, P/E, market cap ...).
--   plan          the member's plan when asked (silver, gold, admin).
-- Retention: rows older than 180 days and beyond the newest 200 per member are deleted when a row is written (and old rows when the list is read).
-- It belongs to the member: every query filters on user_id, and deleting the account deletes it (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS ai_question_memory (
    id           bigserial   PRIMARY KEY,
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asked_at     timestamptz NOT NULL DEFAULT now(),
    topic_key    text        NOT NULL CHECK (char_length(topic_key) <= 200),
    subject_kind text        NOT NULL CHECK (char_length(subject_kind) <= 20),
    subject_id   text        NOT NULL CHECK (char_length(subject_id) <= 80),
    intent       text        NOT NULL CHECK (char_length(intent) <= 20),
    question     text        NOT NULL CHECK (char_length(question) <= 500),
    points       jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(points) = 'array' AND jsonb_array_length(points) <= 8),
    figures      jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(figures) = 'object'),
    plan         text        NOT NULL DEFAULT '' CHECK (char_length(plan) <= 20)
);

CREATE INDEX IF NOT EXISTS ai_question_memory_topic ON ai_question_memory (user_id, topic_key, asked_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ai_question_memory TO finlit_api;   -- the member's own data: the API writes it
        GRANT USAGE, SELECT ON SEQUENCE ai_question_memory_id_seq TO finlit_api;
    END IF;
END
$$;
