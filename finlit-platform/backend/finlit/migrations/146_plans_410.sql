-- Task #410 (owner, 27 Nov 2026): the plans on sale are the landing page's: Free, Mutual Fund + ETF (mfetf), Equity Portfolio (equity), the combined
-- plan (combined: both one-area plans together), Gold and Platinum (frontend/src/landing/goliveData.js). Every stored plan moves to the new names, and
-- no member loses anything: basic -> free; silver -> platinum; gold -> platinum (Platinum includes everything either had, and the access tier every
-- older gate checks stays gold, so an old Gold account keeps its old limits; entitlements.TIER_OF). The old name is kept in plan_legacy, never deleted.
-- Safe to run twice: only rows still on an old name are changed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_legacy text;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
UPDATE users SET plan_legacy = plan, plan = CASE plan WHEN 'basic' THEN 'free' ELSE 'platinum' END WHERE plan IN ('basic', 'silver', 'gold') AND plan_legacy IS NULL;
ALTER TABLE users ALTER COLUMN plan SET DEFAULT 'free';
-- 'basic' and 'silver' stay allowed (no row holds them after this; a script or test that still writes them is read as Free and the combined plan,
-- entitlements.LEGACY_TO_KEY), so nothing that writes an old name fails.
ALTER TABLE users ADD CONSTRAINT users_plan_check CHECK (plan IN ('free', 'mfetf', 'equity', 'combined', 'gold', 'platinum', 'basic', 'silver'));

-- Plan requests name the plan asked for. Open requests for an old plan are kept and read as the new plan that includes it (silver and gold -> gold
-- for an open request: the smallest full plan; granted or declined requests keep their old name as a record).
ALTER TABLE plan_requests DROP CONSTRAINT IF EXISTS plan_requests_plan_check;
UPDATE plan_requests SET plan = 'gold' WHERE status = 'open' AND plan IN ('silver', 'gold');
ALTER TABLE plan_requests ADD CONSTRAINT plan_requests_plan_check CHECK (plan IN ('silver', 'gold', 'mfetf', 'equity', 'combined', 'platinum'));
