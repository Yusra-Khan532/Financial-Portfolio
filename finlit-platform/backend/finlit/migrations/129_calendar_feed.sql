-- Task #297 (the team, 21 Nov 2026: "integrate the IPO, listing etc. calendars of our website with Google Calendar … a button … associated with the
-- Gmail id used in sign-up"): each member's private calendar address. Google Calendar (or any calendar app) subscribes to
-- /api/calendar/<token>.ics and reads it again on its own; the token is the only key, so a member can replace it (the old address stops working).
CREATE TABLE IF NOT EXISTS calendar_feeds (
    user_id      uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token        text        NOT NULL UNIQUE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_read_at timestamptz
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_feeds TO finlit_api;
    END IF;
END
$$;
