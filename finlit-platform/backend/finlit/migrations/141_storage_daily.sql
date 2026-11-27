-- Server storage history (Console > Storage, finlit/storage.py): one reading a day of the disk, the database and the backups, so the console can show
-- how fast the disk fills and how many days are left before the alert line and before it is full. Written at most once an hour (the newest reading of the
-- day wins) by the jobs watchdog and whenever an administrator opens the tab; rows older than 400 days are removed by the same writer. Idempotent.
CREATE TABLE IF NOT EXISTS storage_daily (
    day            date        PRIMARY KEY,
    at             timestamptz NOT NULL DEFAULT now(),
    disk_total     bigint,
    disk_used      bigint,
    db_bytes       bigint,
    backups_bytes  bigint
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON storage_daily TO finlit_api;
    END IF;
END
$$;
