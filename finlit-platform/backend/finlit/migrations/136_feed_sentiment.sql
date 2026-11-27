-- Task #365 (Chinmay, 24 Nov 2026): a sentiment score for every news item and exchange filing (finlit/sentiment.py). One row per feed item:
-- the score (-1 .. +1, P(positive) - P(negative)), the three probabilities, the model version and when it was scored, so items can be
-- re-banded or re-scored by a newer model later. A deleted feed item takes its score with it.
CREATE TABLE IF NOT EXISTS feed_sentiment (
    feed_id    bigint      PRIMARY KEY REFERENCES feed_items (id) ON DELETE CASCADE,
    score      real        NOT NULL,
    pos        real        NOT NULL,
    neu        real        NOT NULL,
    neg        real        NOT NULL,
    model      text        NOT NULL,
    scored_at  timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT ON feed_sentiment TO finlit_api;
    END IF;
END $$;
