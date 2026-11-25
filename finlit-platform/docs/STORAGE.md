# Server storage

The production server has one 40 GB disk for everything: the database, its backups, the app's data folders, the system, the Docker images and the swap file.

## Console > Storage (live, administrators only)

`/console?tab=storage` reads `GET /api/admin/storage` (`finlit/storage.py`) each time it opens and every five minutes while it stays open. It never changes anything.

| Section | What it shows | Where it comes from |
|---|---|---|
| Server disk | size, used (%), free, the 85% alert line | `statvfs("/")`, the same figure as the jobs status page and `df /` |
| What fills it | the database, its write-ahead log, the backups, the NSE daily files, sector pages and scores export, and the rest (system, Docker images, swap file, logs) | database functions, the `backups` volume mounted read-only at `/backups`, the mounted data folders; the rest is what is left of the used space |
| How fast it grows | disk and database change a day, days until the alert line and until full | table `storage_daily` (migration 141): one reading a day, refreshed at most hourly by the jobs watchdog and when the tab opens, kept 400 days |
| Inside the database | every table: total, data, indexes, large values (long text and JSON), rows, dead rows; grouped in plain words; TimescaleDB chunks compressed | `pg_total_relation_size`, `pg_stat_user_tables`, `hypertable_detailed_size` |
| Database backups | each dump, when taken, its size | `/backups` (read-only) |

## Backups

`deploy/aws/backup.sh` takes a backup every night at 02:00 IST and before every automatic deploy. **Today keeps its newest 3** (each deploy of the day can still be undone); **every earlier day keeps only its newest 1**; nothing older than 7 days stays; at most 14 in all; the newest is never removed. Checked by `deploy/aws/test-backup-prune.sh` (CI). The backups are copies for recovery only: nothing on the site or in the jobs reads them.

## Build cache

The app image is built on GitHub and pulled, so the server seldom builds. The daily clean keeps `BUILD_CACHE_KEEP` (512mb, was 2gb) of build cache.

## Next steps (not done yet)

1. **Compress the price history.** `price_daily` is a TimescaleDB table with no compression. TimescaleDB compression usually makes past days 80–90% smaller and they read the same. It is not switched on yet because the price writer (`store._upsert_prices`) rewrites a company's whole six-year series on every report save, since splits and bonuses change past prices. With old days compressed, every save would unpack and repack them and slow the nightly jobs. First the writer must update only the recent days, rewriting old days only when the series changed (a split or bonus). Then a compression policy for days older than 30 days can be added.
2. **Store each daily price once.** The same daily prices are in `price_daily`, in `daily_candles` (Dhan, since 22 Nov 2026), and in each company's stored price section (`snapshots`, section `price`). Once `daily_candles` covers every company, keep one table and let the price section point at it.
3. **Copy backups off the server** (Amazon S3), which keeps them safe if the server is lost; then the server itself could keep fewer.
4. **Give back the space of dead rows** in the tables rewritten every day (the "Dead rows" column) with `pg_repack`, outside market hours.
5. **Clean up run logs** older than 180 days in tables with no clean-up rule (`ingest_runs`, `macro_run_log`, `macro_audit_log`, `digest_log`, `disclosure_runs`).
