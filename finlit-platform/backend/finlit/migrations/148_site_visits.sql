-- Visitor counting without cookies (the owner's choice of 27 Nov 2026: "both, in two steps"; this is step 1, FinLit's own counter;
-- docs/search-growth/PROGRESS.md, Phase 0). One row per day, page, source and screen size, with two counts. Nothing that identifies a
-- person is stored: no IP address, no cookie, no identifier, no user id; only the page address (public pages in full, member pages by their
-- first part), the NAME of the site a visit came from (google, bing, chatgpt, ...), and phone- or desktop-sized.
CREATE TABLE IF NOT EXISTS site_visits (
    day       date    NOT NULL,                 -- India date (Asia/Kolkata)
    path      text    NOT NULL,                 -- e.g. /stocks/TCS, /glossary/return-on-equity-roe, /dashboard
    source    text    NOT NULL,                 -- where the visit came from (finlit/visits.py SOURCES); 'internal' for a click inside the site
    device    text    NOT NULL CHECK (device IN ('mobile', 'desktop')),
    views     integer NOT NULL DEFAULT 0,       -- pages opened
    landings  integer NOT NULL DEFAULT 0,       -- of them, the first page of a visit (arrived from outside the site, or typed in)
    PRIMARY KEY (day, path, source, device)
);
CREATE INDEX IF NOT EXISTS site_visits_day_idx ON site_visits (day);
