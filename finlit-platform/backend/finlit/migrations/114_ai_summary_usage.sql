-- Task #228 (team note, 19 Nov 2026): "give limit for this AI summarize limit to 10 keeping it seperate from chatbot question limit".
-- The AI summaries under the FinLit Prism cards of the company page, counted per member per calendar month (IST), apart from the FinLit AI
-- questions (ai_usage). Silver and Gold: 10 a month. Same rules as ai_usage: `used` goes up when a summary starts, back down when none could be written.
CREATE TABLE IF NOT EXISTS ai_summary_usage (
    user_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month     date        NOT NULL,           -- the first day of the month, IST
    used      integer     NOT NULL DEFAULT 0 CHECK (used >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, month)
);
