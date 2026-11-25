#!/usr/bin/env bash
# FinLit storage check: READ-ONLY. It changes nothing, deletes nothing, stops nothing.
# It only measures the disk, Docker and the database, and writes everything to ~/finlit-storage-report.txt.
# Run on the server:  bash storage-check.sh
set -u
OUT="$HOME/finlit-storage-report.txt"
exec > >(tee "$OUT") 2>&1
h() { echo; echo "=================== $* ==================="; }
DB=$(docker ps --format '{{.Names}}' | grep -E -- '-db-1$' | head -1)
BK=$(docker ps --format '{{.Names}}' | grep -E -- '-backup-1$' | head -1)
q() { docker exec -i "$DB" psql -U finlit -d finlit -X -q -P pager=off -c "$1" 2>&1; }

h "1. When and where"; date -u; hostname; uptime
h "2. Whole disk"; df -h / ; df -i / | tail -1
h "3. Biggest folders on the disk (top level)"; sudo du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -15
h "4. Swap"; swapon --show; ls -lh /swapfile 2>/dev/null
h "5. Docker: images, containers, volumes, build cache"; docker system df -v 2>/dev/null | head -80
h "6. Docker volumes on disk"; sudo du -sh /var/lib/docker/volumes/* 2>/dev/null | sort -rh
h "7. Volumes no container uses"; docker volume ls -f dangling=true
h "8. Database backups kept on this disk"; docker exec "$BK" sh -c 'ls -la /backups; du -sh /backups' 2>&1
h "9. Logs"; sudo journalctl --disk-usage 2>/dev/null; sudo du -sh /var/log /opt/finlit/logs /opt/finlit/state 2>/dev/null; sudo du -sh /var/lib/docker/containers 2>/dev/null
h "10. App folder"; sudo du -sh /opt/finlit /opt/finlit/* 2>/dev/null | sort -rh | head -12

h "11. Database total, and its write-ahead log"
q "SELECT pg_size_pretty(pg_database_size(current_database())) AS database, (SELECT pg_size_pretty(sum(size)) FROM pg_ls_waldir()) AS wal_files, now() - pg_postmaster_start_time() AS db_uptime;"
q "SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();"

h "12. The 50 biggest tables (table + indexes + large-value storage), with rows and dead rows"
q "SELECT c.relname AS table_name, pg_size_pretty(pg_total_relation_size(c.oid)) AS total, pg_size_pretty(pg_relation_size(c.oid)) AS data,
          pg_size_pretty(pg_indexes_size(c.oid)) AS indexes,
          pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid)) AS large_values,
          s.n_live_tup AS live_rows, s.n_dead_tup AS dead_rows, s.last_autovacuum::date AS last_autovacuum
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
   WHERE c.relkind IN ('r','p') AND n.nspname = 'public'
   ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 50;"

h "13. Daily prices (TimescaleDB): size and compression"
q "SELECT * FROM hypertable_detailed_size('price_daily');"
q "SELECT count(*) AS chunks, count(*) FILTER (WHERE is_compressed) AS compressed FROM timescaledb_information.chunks WHERE hypertable_name = 'price_daily';"
q "SELECT min(day), max(day), count(*), count(DISTINCT symbol) FROM price_daily;"
q "SELECT min(day), max(day), count(*), count(DISTINCT symbol) FROM daily_candles;"
q "SELECT pg_size_pretty(sum(pg_column_size(body))) AS price_section_text, count(*) FROM snapshots WHERE section = 'price';"

h "14. Space held by dead rows (reclaimable by VACUUM FULL / pg_repack), biggest first"
q "SELECT relname, n_live_tup, n_dead_tup, round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
          pg_size_pretty(pg_total_relation_size(relid)) AS total
   FROM pg_stat_user_tables WHERE n_dead_tup > 10000 ORDER BY n_dead_tup DESC LIMIT 25;"

h "15. Indexes never used since the statistics began (over 1 MB, not primary or unique)"
q "SELECT s.relname AS table_name, s.indexrelname AS index_name, pg_size_pretty(pg_relation_size(s.indexrelid)) AS size, s.idx_scan
   FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
   WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary AND pg_relation_size(s.indexrelid) > 1048576
   ORDER BY pg_relation_size(s.indexrelid) DESC LIMIT 30;"

h "16. Tables that only grow (no clean-up rule in the code): size and oldest row where a date column exists"
for t in audit_events calendar_feeds commodity_snapshots daily_candles digest_log disclosure_runs earnings_calls feed_sentiment feedback ingest_runs logos macro_audit_log macro_indicator_history macro_run_log notify_signups page_feedback page_visits price_history_long prism_history score_history feed_items document_pages snapshots prism_reports; do
  q "SELECT '$t' AS table_name, pg_size_pretty(pg_total_relation_size('$t')) AS total, (SELECT count(*) FROM $t) AS rows;" | sed -n 3p
done

h "17. Redis (cache only, nothing on disk)"
R=$(docker ps --format '{{.Names}}' | grep -E -- '-redis-1$' | head -1)
docker exec "$R" redis-cli info memory 2>/dev/null | grep -E "used_memory_human|maxmemory_human"
docker exec "$R" redis-cli dbsize 2>/dev/null

h "Done"; echo "Saved to $OUT"
