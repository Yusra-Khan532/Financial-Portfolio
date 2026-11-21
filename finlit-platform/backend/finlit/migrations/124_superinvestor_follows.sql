-- Task #289 (the superinvestors developer file of 21 Nov 2026): following tracked investors and alerts on their filings.
-- si_follows: which tracked investors a member follows. si_alert_prefs: which moves a member is alerted on (all four on until changed).
-- si_seen: each tracked investor's combined stake per company in the last filing the nightly alert check read, so a new filing is compared with it.
CREATE TABLE IF NOT EXISTS si_follows (
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    investor_key text        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, investor_key)
);
CREATE INDEX IF NOT EXISTS si_follows_investor ON si_follows (investor_key);

CREATE TABLE IF NOT EXISTS si_alert_prefs (
    user_id    uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    new        boolean     NOT NULL DEFAULT true,
    added      boolean     NOT NULL DEFAULT true,
    reduced    boolean     NOT NULL DEFAULT true,
    exited     boolean     NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS si_seen (
    investor_key text        NOT NULL,
    symbol       text        NOT NULL,
    as_of        text,
    stake        numeric,
    seen_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (investor_key, symbol)
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON si_follows, si_alert_prefs, si_seen TO finlit_api;
    END IF;
END
$$;
