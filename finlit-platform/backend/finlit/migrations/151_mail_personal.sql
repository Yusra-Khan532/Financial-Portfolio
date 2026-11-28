-- Console > Email, "Personal note" (founder, 28 Nov 2026: a plain-text test still landed in Gmail's Promotions tab).
-- format 'personal': reads like a mail from a person: no List-Unsubscribe headers, no HTML part, a short two-line footer ("reply 'stop'"),
-- for small sends only (at most 500 people a mail; the Console asks for Plain email above that). New mails are personal unless the form says otherwise;
-- mails that exist keep their format.
-- from_address: the address the mail is sent from, on the finlitventures.com domain (e.g. pranshu@finlitventures.com); NULL means contact@.
ALTER TABLE mail_campaigns ADD COLUMN IF NOT EXISTS from_address text;
ALTER TABLE mail_campaigns DROP CONSTRAINT IF EXISTS mail_campaigns_format_check;
ALTER TABLE mail_campaigns ADD CONSTRAINT mail_campaigns_format_check CHECK (format IN ('personal', 'plain', 'html'));
ALTER TABLE mail_campaigns ALTER COLUMN format SET DEFAULT 'personal';
