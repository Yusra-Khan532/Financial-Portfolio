-- Screen history and Top gainers (task #64, screen-history-spec.md): what every screen listed each session, when a company joined and left, and the stored Top gainers.
CREATE TABLE IF NOT EXISTS screen_runs (
    preset_id  text    NOT NULL,
    chips      text    NOT NULL,
    session    date    NOT NULL,
    registry   integer NOT NULL,
    n          integer NOT NULL,
    list_hash  text    NOT NULL,
    built_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (preset_id, chips, session)
);
CREATE TABLE IF NOT EXISTS screen_snapshots (
    preset_id text NOT NULL,
    chips     text NOT NULL,
    session   date NOT NULL,
    symbol    text NOT NULL,
    rank      integer NOT NULL,
    close     double precision,
    row       jsonb NOT NULL,
    PRIMARY KEY (preset_id, chips, session, symbol)
);
CREATE INDEX IF NOT EXISTS screen_snapshots_symbol ON screen_snapshots (symbol, session);
CREATE TABLE IF NOT EXISTS screen_spells (
    id           bigserial PRIMARY KEY,
    preset_id    text NOT NULL,
    chips        text NOT NULL,
    symbol       text NOT NULL,
    added_on     date NOT NULL,
    close_added  double precision,
    left_on      date,
    left_reason  text,
    close_left   double precision,
    sessions_on  integer,
    registry_added integer NOT NULL,
    registry_left  integer
);
CREATE INDEX IF NOT EXISTS screen_spells_open ON screen_spells (preset_id, chips, symbol) WHERE left_on IS NULL;
CREATE INDEX IF NOT EXISTS screen_spells_added ON screen_spells (added_on);
CREATE TABLE IF NOT EXISTS gainers (
    page    text NOT NULL,
    win     text NOT NULL,
    session date NOT NULL,
    rank    integer NOT NULL,
    row     jsonb NOT NULL,
    PRIMARY KEY (page, win, session, rank)
);
