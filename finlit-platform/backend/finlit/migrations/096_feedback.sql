-- "Help us build a smarter FinLit": the answers people send from the feedback page. One row per submission; the answers are kept as they were sent.
CREATE TABLE IF NOT EXISTS feedback (
    id           bigserial   PRIMARY KEY,
    created_at   timestamptz NOT NULL DEFAULT now(),
    user_id      uuid,
    rating       smallint    NOT NULL,
    nps          smallint    NOT NULL,
    contact_ok   boolean     NOT NULL DEFAULT false,
    early_access boolean     NOT NULL DEFAULT false,
    email        text,
    answers      jsonb       NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);
