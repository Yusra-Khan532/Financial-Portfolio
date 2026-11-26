-- Trading Lab, Order Flow engine (docs/TRADING-LAB.md "Order Flow"): the stock futures contracts it reads and each contract's open interest
-- per trading day, so every snapshot can say how open interest changed against the previous session.
--
-- fno_futures: the current and next stock futures contract of every NSE F&O stock, from Dhan's instrument file (refresh-instruments).
--              Replaced whole on each load; an empty or short file keeps what is stored (lab.flow.save_futures).
CREATE TABLE IF NOT EXISTS fno_futures (
    security_id  text        PRIMARY KEY,
    underlying   text        NOT NULL,
    expiry       date        NOT NULL,
    lot_size     integer     NOT NULL CHECK (lot_size > 0),
    loaded_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fno_futures_underlying ON fno_futures (underlying, expiry);

-- fno_oi_daily: one row per contract and trading day (the day of the contract's last trade, never the wall clock, so a holiday adds nothing).
--               Each snapshot overwrites today's row, so the last one of the day is the closing open interest; a contract with no earlier day
--               is filled once from Dhan's daily history. Rows older than 30 days are deleted by the engine.
CREATE TABLE IF NOT EXISTS fno_oi_daily (
    security_id  text    NOT NULL,
    day          date    NOT NULL,
    oi           bigint  NOT NULL CHECK (oi >= 0),
    close        numeric(14,2),
    source       text    NOT NULL DEFAULT 'quote' CHECK (source IN ('quote', 'history')),
    PRIMARY KEY (security_id, day)
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finlit_api') THEN
        GRANT SELECT ON fno_futures, fno_oi_daily TO finlit_api;
    END IF;
END
$$;
