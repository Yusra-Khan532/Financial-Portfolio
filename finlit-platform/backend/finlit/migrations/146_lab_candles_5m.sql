-- Trading Lab, Time Machine (docs/TRADING-LAB.md "Time Machine"): the 5-minute candles of every NSE F&O share, about 100 calendar days.
--
-- candles_5m: one row per share (Dhan security id) and 5-minute bar of the continuous session (09:15 to 15:25 IST bar starts).
--             Filled by the job `lab-candles` (lab/candles5m.py): the first fill asks 89 days in one call, later runs from the last stored bar;
--             a bar asked again replaces the stored one (INSERT ... ON CONFLICT DO UPDATE). With TimescaleDB, store._enable_timescale makes it a
--             hypertable (7-day chunks, compressed after 7 days, dropped after 100); on plain PostgreSQL the job deletes rows older than 100 days.
CREATE TABLE IF NOT EXISTS candles_5m (
    security_id  text         NOT NULL,
    at           timestamptz  NOT NULL,
    open         real         NOT NULL,
    high         real         NOT NULL,
    low          real         NOT NULL,
    close        real         NOT NULL,
    volume       bigint,
    PRIMARY KEY (security_id, at)
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT ON candles_5m TO finlit_api;   -- the Time Machine route reads; only the job (owner role) writes and deletes
    END IF;
END
$$;
