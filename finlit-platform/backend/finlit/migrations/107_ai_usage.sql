-- Ask FinLit AI (finlit/ask): questions asked per member per calendar month (IST), for the monthly allowance of each plan
-- (founder, 17 Nov 2026: Silver 50, Gold 100; Basic has none and keeps the listed questions). One row per member and month; `used` only goes up when an answer is started,
-- and goes back down when the answer could not be given.
CREATE TABLE IF NOT EXISTS ai_usage (
    user_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month     date        NOT NULL,           -- the first day of the month, IST
    used      integer     NOT NULL DEFAULT 0 CHECK (used >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, month)
);
