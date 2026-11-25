# Daily prices: how they are kept small

Daily prices (open, high, low, close, volume per company per day) are the largest data the site keeps. Step 1 (this file) keeps them small without
changing a single figure any page or job reads. Step 2, storing each daily price once, is described at the end.

## Where daily prices live

| Store | What | Kept | Who reads it |
|---|---|---|---|
| `price_daily` (TimescaleDB) | the last `PRICE_DAYS` (500) days of every stored company, from the company's report (exchange candles where Dhan has them, else FinEdge) | 500 days; companies the prune drops lose theirs | scores export, alerts, Stress Lab, Ask FinLit AI, superinvestors, presets, IPO listing price, canary, freshness, data audit |
| `daily_candles` | exchange candles (Dhan, NSE first) | **1,200 days** (`CANDLE_DAYS`, new) | chart patterns, and `candles.apply`, which merges them into each report's price series |
| `snapshots`, section `price` | the report's full price series (about six years) | as long as the report is stored | the price charts (5Y, Max), the technical views, live scores, Prism inputs |

## Step 1 (done)

1. **The writer writes only what changed** (`store._upsert_prices`). A report save used to write the company's whole six-year series into `price_daily`
   every time, rewriting every unchanged day, and the nightly prune then deleted the days older than 500 that same night. Now only the days inside the
   500-day window are written, and of those only the rows that are new or differ (a split or bonus changes past prices, so those rows differ and are
   still written). It returns how many rows it wrote: 0 for a save that changed nothing.
2. **Older days are compressed** (`store._compress_prices`, run where the TimescaleDB table is made, at every start, idempotent): TimescaleDB's own
   compression, one segment per company, newest day first, for days older than `COMPRESS_AFTER` (30) days. Usually 80 to 90% smaller. Every query reads
   them as before; a change to a compressed day (a split) still lands. TimescaleDB's background job compresses each chunk once it is old enough.
3. **The prune drops whole old chunks** (`drop_chunks`) instead of deleting rows: instant, and the only way that works on compressed chunks (a row
   delete by `ctid`, as before, is not possible on compressed data). On a plain Postgres it deletes rows as before.
4. **`daily_candles` stops growing**: days older than 1,200 are removed by the nightly prune (no reader looks back further than 1,150).

Nothing a page or job reads changes: the same rows are there, with the same values.

Note for later changes: with compression on, a new column on `price_daily` needs TimescaleDB's rules for compressed hypertables (adding a nullable
column is fine; changing a column type needs the compressed chunks decompressed first). No query may use the system columns `ctid` or `xmin` on it.

Tests: `backend/tests/test_price_storage.py` (run against TimescaleDB 2.17.2, the server's version).

## Step 2 (next): each daily price stored once

The same daily prices sit in all three stores above. The plan: `price_daily` becomes the one store of the full history (about six years, compressed),
the report's price section stops carrying its own copy and is given the series from `price_daily` when read, and the chart patterns read
`price_daily` instead of `daily_candles`, which then goes. This changes what the charts, the technical views and the scores read, so it ships on
its own, after Console > Storage shows each store's real size.
