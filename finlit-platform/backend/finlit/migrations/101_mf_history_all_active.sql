-- Five years of daily NAVs for EVERY active scheme, every plan and option (founder, 13 Nov 2026), not only the 100 hot ones (see mf.HIST_KEEP).
-- The fund houses marked "done" were loaded for Growth options only, so the markers are cleared once: the next backfill-mf run loads every house again,
-- best-known first (config.MF_FEATURED_AMCS). AMFI's yearly file for a house already holds all its schemes, so this downloads nothing extra.
DELETE FROM mf_backfill;
