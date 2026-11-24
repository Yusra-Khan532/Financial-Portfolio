-- Task #387 (24 Nov 2026): mail from contact@finlitventures.com through Amazon SES (finlit/mailer.py, admin page /admin/mail).
-- mail_contacts: everyone the team may mail, with where they gave their address (source) and whether they still may be mailed.
-- mail_campaigns: one mail (subject, body, the "why you get this" line). mail_sends: one row per person per mail, so nobody gets the same mail twice.
CREATE TABLE IF NOT EXISTS mail_contacts (
    id               bigserial   PRIMARY KEY,
    email            text        NOT NULL UNIQUE,                 -- stored lower-case
    name             text,
    source           text        NOT NULL,                        -- where this person gave the address, e.g. "XYZ Hackathon, Oct 2026"
    status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced', 'complained')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    unsubscribed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS mail_contacts_status ON mail_contacts (status, source);

CREATE TABLE IF NOT EXISTS mail_campaigns (
    id          bigserial   PRIMARY KEY,
    subject     text        NOT NULL,
    body        text        NOT NULL,                             -- plain text; {name} becomes the person's first name
    why         text        NOT NULL,                             -- footer: why this person gets the mail
    button_text text,                                             -- the mail's one button, e.g. "Create your free account" (optional)
    button_url  text,                                             -- where it goes (https only)
    created_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mail_sends (
    id           bigserial   PRIMARY KEY,
    campaign_id  bigint      NOT NULL REFERENCES mail_campaigns(id) ON DELETE CASCADE,
    contact_id   bigint      NOT NULL REFERENCES mail_contacts(id) ON DELETE CASCADE,
    status       text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
    message_id   text,
    error        text,
    queued_at    timestamptz NOT NULL DEFAULT now(),
    sent_at      timestamptz,
    UNIQUE (campaign_id, contact_id)
);
CREATE INDEX IF NOT EXISTS mail_sends_queue ON mail_sends (status, id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON mail_contacts, mail_campaigns, mail_sends TO finlit_api;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finlit_api;
    END IF;
END $$;
