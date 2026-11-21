-- Task #281 round 7 (21 Nov 2026): fund-house portfolio files uploaded by an administrator from a normal browser, for the fund houses whose sites
-- refuse the server (HDFC, Kotak, Edelweiss, Navi, Union; Baroda BNP refuses the relay). The raw file is kept (who, when, which house and month,
-- its SHA-256), then read by the same reader the nightly portfolios job uses for that house (finlit/fund_files.py). The holdings it gives are stored
-- in disclosure_portfolios like the nightly ones; the nightly job never deletes them (it only adds newer months).
CREATE TABLE IF NOT EXISTS fund_house_files (
    id           bigserial   PRIMARY KEY,
    house        text        NOT NULL,                -- the reader's key: hdfc, kotak, edelweiss, navi, union, barodabnp, ...
    month_end    date        NOT NULL,                -- the month the file is for, as the administrator chose it
    file_name    text        NOT NULL,
    kind         text        NOT NULL,                -- xlsx | xls | zip | pdf, from the file's own bytes
    size_bytes   integer     NOT NULL,
    sha256       text        NOT NULL,
    content      bytea       NOT NULL,
    uploaded_by  text,                                -- the administrator's email
    uploaded_at  timestamptz NOT NULL DEFAULT now(),
    status       text        NOT NULL,                -- read | partly read | stored, no reader | not read
    result       jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS fund_house_files_house ON fund_house_files (house, month_end DESC);
CREATE UNIQUE INDEX IF NOT EXISTS fund_house_files_once ON fund_house_files (house, sha256);
