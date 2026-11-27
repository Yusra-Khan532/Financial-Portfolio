-- Task #409 (peer label fix pack, 27 Nov 2026): ONE weekly record of every stock's peer label (Leader / In line / Laggard).
-- Each weekly run writes one row per stock, once; rows are never re-ranked or updated afterwards (a bad run is replaced by a
-- correcting run for the same week, and the old run is marked superseded in peer_label_run). Every page, endpoint, screen and
-- alert reads this table; nothing works a label, a past reading or a "since" date out on read.
-- Keyed by symbol like every other leadership table (leadership, leadership_history); `isin` is kept for when the site stores ISINs for shares.
CREATE TABLE IF NOT EXISTS peer_label_week (
    symbol             text NOT NULL,
    isin               text,
    week_end           date NOT NULL,                 -- the trading day the run is for (the Friday close)
    run_id             text NOT NULL,                 -- one id per weekly run; every row of a run shares it
    run_at             timestamptz NOT NULL DEFAULT now(),
    peer_group_id      text,
    peer_list_version  text,                          -- the peer list the run used (a list's date, or 'nse-industry')
    ranked             integer,                       -- stocks ranked in the group this run
    rank               integer,                       -- null when not ranked
    not_ranked_reason  text,                          -- history | stale | liquidity | group | corporate_action | not_compared
    rel52              real,
    rel13              real,
    rel52_market       real,
    direction          text,
    reading            text NOT NULL,                 -- leader | in_line | laggard | none: what this run's ranking says
    label              text NOT NULL,                 -- leader | in_line | laggard | none: what members see after the rule
    label_since        date NOT NULL,                 -- first week_end of the current label
    pending_to         text,                          -- the new reading waiting for a second run; null when none
    changed            boolean NOT NULL DEFAULT false,-- true only in the run where `label` changed
    weeks_not_ranked   integer NOT NULL DEFAULT 0,    -- runs in a row without a rank
    rule_version       text NOT NULL,                 -- two-runs-v1
    source             text NOT NULL,                 -- run | rebuilt-2026-11 (the one-time migration)
    PRIMARY KEY (symbol, week_end, run_id)
);
CREATE INDEX IF NOT EXISTS peer_label_week_week ON peer_label_week (week_end);
CREATE INDEX IF NOT EXISTS peer_label_week_group ON peer_label_week (peer_group_id, week_end);

-- One row per run: a run is 'current' until a correcting run for the same week supersedes it.
CREATE TABLE IF NOT EXISTS peer_label_run (
    run_id      text PRIMARY KEY,
    week_end    date NOT NULL,
    status      text NOT NULL DEFAULT 'current',     -- current | superseded
    reason      text,
    source      text NOT NULL DEFAULT 'run',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS peer_label_run_week ON peer_label_run (week_end);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT ON peer_label_week, peer_label_run TO finlit_api;
    END IF;
END
$$;
