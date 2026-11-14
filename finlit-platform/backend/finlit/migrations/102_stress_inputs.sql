-- Stress Lab (task #79, SL-9): one set of "Today" inputs per close. Every page built for a close uses the same snapshot (Brent, the FBIL rupee series,
-- inflation, the repo rate, GDP growth and the EIA crude outlook, each cut to on or before the close), so two companies never show a different Today.
CREATE TABLE IF NOT EXISTS stress_inputs (
    close_date  date        PRIMARY KEY,
    body        jsonb       NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON stress_inputs TO finlit_api;
    END IF;
END
$$;
