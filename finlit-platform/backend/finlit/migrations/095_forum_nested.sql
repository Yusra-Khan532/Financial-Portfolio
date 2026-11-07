-- Discussion forum: Reddit-style nested replies. A reply may answer another reply in the same discussion (parent_id);
-- a reply without a parent answers the discussion itself. Old replies keep parent_id NULL, so they stay top-level comments.
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES forum_posts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS forum_posts_parent_idx ON forum_posts (parent_id) WHERE parent_id IS NOT NULL;
-- the company list on the forum's front page counts discussions per company on a board
CREATE INDEX IF NOT EXISTS forum_posts_plan_symbol_idx ON forum_posts (plan, symbol) WHERE thread_id IS NULL AND status = 'visible';
