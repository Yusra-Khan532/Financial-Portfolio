-- Stress Lab (task #79, 12 Nov live check): the page payload and the company pack are built at night and served from here, so opening a page is one read and
-- Gold /run and /compare reuse the stored pack instead of calling the data provider on every request.
CREATE TABLE IF NOT EXISTS stress_pages (
    symbol    text PRIMARY KEY,
    statement text NOT NULL DEFAULT 'consolidated',
    payload   jsonb NOT NULL,
    pack      jsonb NOT NULL,
    as_of     text,
    built_at  timestamptz NOT NULL DEFAULT now()
);
-- Why a company has no stored page (kept for the people who run the site; never sent to a reader).
CREATE TABLE IF NOT EXISTS stress_failures (
    symbol    text PRIMARY KEY,
    kind      text NOT NULL,
    reason    text NOT NULL,
    attempts  integer NOT NULL DEFAULT 1,
    failed_at timestamptz NOT NULL DEFAULT now()
);
