-- Discovery (task #221): the version of the scoring rules each stored presentation was read with. When the rules change (keywords.RULES_VERSION),
-- the nightly job reads the older ones again, bounded per night like any new presentation. Rows read before this column existed are version 1.
ALTER TABLE discovery_companies ADD COLUMN IF NOT EXISTS rules integer NOT NULL DEFAULT 1;
