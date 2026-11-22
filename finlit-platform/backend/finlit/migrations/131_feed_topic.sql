-- FinLit's own topic for each feed item (results, orders, people, deals, capital, rating, legal, meetings, business, compliance, other,
-- documents), above the exchange's category (task #309). Set when an item is saved (finlit/feed.py topic_of); the feed-sort job
-- (finlit/feed.py ensure_sorted) fills the rows stored before this change, once, and re-sorts their kind under the corrected rules.
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS topic text;
CREATE INDEX IF NOT EXISTS feed_topic_date_idx ON feed_items (topic, item_date DESC, id DESC);
