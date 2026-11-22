-- Daily candles from the exchange a company trades on most (see finlit/candles.py). Until now the price series came only from the main provider's
-- /daily-quotes, which names no exchange and carries volumes about a fifteenth of NSE's (22 Nov 2026 check: ICICI Bank 3.6 lakh shares against
-- 1.8 crore on NSE). Prices here are Dhan's daily candles, NSE first, so the charts, relative volume, value traded and the chart patterns
-- all read one series and say which exchange it is.
--
-- exch    NSE or BSE: the segment the candles were asked for (NSE whenever the company has an NSE row in dhan_instruments)
-- volume  shares traded on that exchange that day
CREATE TABLE IF NOT EXISTS daily_candles (
    symbol     text NOT NULL,
    day        date NOT NULL,
    open       double precision,
    high       double precision,
    low        double precision,
    close      double precision NOT NULL,
    volume     bigint,
    exch       text NOT NULL,
    loaded_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (symbol, day)
);
CREATE INDEX IF NOT EXISTS daily_candles_day ON daily_candles (day);
