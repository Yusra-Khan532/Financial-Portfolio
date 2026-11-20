-- Task #281 round 2: a scheme whose AMFI code changed when its fund house was taken over keeps its whole NAV history.
-- Example: HSBC Small Cap Fund (151130) was L&T Emerging Businesses Fund until November 2022; AMFI gave it a new code, so FinLit's history of 151130
-- started on 28 Nov 2022 and its 5-year return, largest fall and the score's long-window measures were blank. The old code's NAVs (2014-2022) are still
-- published by AMFI's mirror (api.mfapi.in) and join the new code at the same NAV.
--
-- mf_predecessors   one row per linked successor: which old code its history continues from, and the evidence (the old code's last NAV and the new
--                   code's first NAV, the gap between them). A link is written only when the NAVs join (finlit.mf_lineage.continuity).
-- mf_lineage_cands  every old code that was looked at (name, plan, its last NAV), so a stopped code is asked for once, not every night.
CREATE TABLE IF NOT EXISTS mf_predecessors (
    code          integer PRIMARY KEY REFERENCES mf_schemes(code) ON DELETE CASCADE,
    old_code      integer NOT NULL,
    old_name      text NOT NULL,
    old_house     text,
    old_last      date NOT NULL,
    old_last_nav  double precision NOT NULL,
    new_first     date NOT NULL,
    new_first_nav double precision NOT NULL,
    gap_pct       double precision NOT NULL,
    source        text NOT NULL,
    note          text NOT NULL,
    linked_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mf_lineage_cands (
    old_code   integer PRIMARY KEY,
    name       text NOT NULL,
    house      text,
    category   text,
    plan       text,
    option     text,
    last_day   date,
    last_nav   double precision,
    checked_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT ON mf_predecessors TO finlit_api;   -- the fund page names the earlier code; the worker writes
    END IF;
END
$$;
