-- Task #366 (Chinmay, 24 Nov 2026): thumbs up / down on every piece of AI-written text (Ask FinLit AI answers, the FinLit Prism AI summary, concall
-- summaries, the company brief), stored for the team (finlit/ai_feedback.py). A member's vote on one answer is one row they can change or withdraw;
-- a visitor's vote is kept without any personal detail (only an hourly hash of the address, to stop repeats).
CREATE TABLE IF NOT EXISTS ai_feedback (
    id          bigserial   PRIMARY KEY,
    surface     text        NOT NULL CHECK (surface IN ('ask', 'prism_summary', 'concall_summary', 'company_brief')),
    ref         text        NOT NULL,                      -- which answer: e.g. ask "RELIANCE|how is icici performing", a summary's symbol and day, a concall link
    rating      smallint    NOT NULL CHECK (rating IN (-1, 1)),
    question    text,                                      -- the question asked (Ask FinLit AI only), up to 500 letters
    excerpt     text,                                      -- the start of the answer the vote is about, up to 1,500 letters
    user_id     uuid        REFERENCES users(id) ON DELETE CASCADE,
    visitor     text,                                      -- visitors only: an hourly salted hash of the address, never the address
    plan        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_feedback_member_one ON ai_feedback (user_id, surface, ref) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_feedback_recent ON ai_feedback (created_at DESC);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ai_feedback TO finlit_api;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finlit_api;
    END IF;
END $$;
