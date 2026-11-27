-- Task #272 (Watchlists and Alerts, 20 Nov pack).
-- 1. A list alert: "tell me when a company on this list files one of Discover's kinds". list_ref names the list (equity, equity:<account>,
--    watch:<list id>, mine = equity portfolio and every watchlist); the symbol is '' for a list. kinds: Discover's events (order, capacity, ...).
--    digest: one summary a day instead of one item per filing. A list alert is one row, so it counts as 1 of the plan's alerts.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS list_ref text;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS kinds    text[];
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS digest   boolean NOT NULL DEFAULT false;

-- 2. The member's last visit per page ("Nothing new since your last visit on 12 Nov", the filing chips, the new-order-win notice).
--    seen_at: this visit; prev_at: the visit before it, which is what the page compares with. A visit inside 30 minutes of the last one does not roll.
CREATE TABLE IF NOT EXISTS page_visits (
    user_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page    text        NOT NULL,
    seen_at timestamptz NOT NULL DEFAULT now(),
    prev_at timestamptz,
    PRIMARY KEY (user_id, page)
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON page_visits TO finlit_api;
    END IF;
END
$$;
