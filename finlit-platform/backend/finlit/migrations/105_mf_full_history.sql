-- Task #162 (15 Nov 2026, the server disk is now 40 GB): the mutual fund NAV history is kept in full, from the first day of AMFI's history file
-- (1 April 2006) or the scheme's launch, instead of five years.
--
-- mf_backfill.full_from  the first day of the window the fund house's history was loaded from. NULL = the old five-year load: the nightly
--                        backfill-mf job then loads only the missing older years for that house (resumable, one house at a time) and sets it.
ALTER TABLE mf_backfill ADD COLUMN IF NOT EXISTS full_from date;
