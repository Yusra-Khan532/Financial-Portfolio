-- Console > Email made easy (28 Nov 2026). Each mail gets its format and an optional "From name".
-- format: 'plain' (text only, like a personal mail: the best chance of Gmail's Primary tab) or 'html' (the designed mail with a button).
-- Mails that already exist keep 'html', the format they were written and tested in (Mail 2 on the live site keeps working as it is);
-- the founder switches an unsent one to Plain in the Console. New mails are plain unless the form says otherwise.
-- from_name: shown in the inbox before the subject, e.g. "Pranshu from FinLit Ventures"; the address is always contact@finlitventures.com.
ALTER TABLE mail_campaigns ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'html';
ALTER TABLE mail_campaigns ALTER COLUMN format SET DEFAULT 'plain';
ALTER TABLE mail_campaigns ADD COLUMN IF NOT EXISTS from_name text;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mail_campaigns_format_check') THEN
        ALTER TABLE mail_campaigns ADD CONSTRAINT mail_campaigns_format_check CHECK (format IN ('plain', 'html'));
    END IF;
END $$;
