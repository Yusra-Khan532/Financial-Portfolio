-- The on-demand queue serves the newest request first, and a company asked for again while it waits moves to the front
-- (store.enqueue: ON CONFLICT ... DO UPDATE SET requested_at = now()). The least-privilege API role needs UPDATE on that one table for it.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT UPDATE ON ingest_queue TO finlit_api;
    END IF;
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'UPDATE on ingest_queue not granted to finlit_api (insufficient privilege); enqueue then adds without moving to the front';
END
$$;

CREATE INDEX IF NOT EXISTS ingest_queue_requested_idx ON ingest_queue (requested_at DESC);
