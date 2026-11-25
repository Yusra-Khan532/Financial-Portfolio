"""Server storage (Console > Storage, administrators only): how full the disk is, what fills it, and how fast it grows.

GET /api/admin/storage measures, live:
  * the disk the containers run on (statvfs of "/", the same figure as the jobs status page and `df /`);
  * the database: its total, its write-ahead log, every table by size (data, indexes, large values, live and dead rows), the TimescaleDB price
    history with how much of it is compressed, grouped into plain-word groups (prices, reports, funds, news and documents, members, job logs);
  * the nightly database backups (the `backups` volume, mounted read-only at /backups): how many, how big, oldest and newest;
  * the app's own data folders on the same disk (NSE daily files, sector pages, scores export);
  * the rest of the used space: the system, Docker images, the swap file and logs, which only the server's own tools can split further.
and keeps one reading a day (table storage_daily, migration 141) so the page shows the daily growth and the days left before the alert line (85%,
the same line as the jobs status) and before the disk is full. Reading the page never changes or deletes anything else; nothing here stops or slows a job.
"""
from __future__ import annotations

import logging
import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import orjson
from fastapi import APIRouter, Depends, Request, Response

from .auth.routes import NO_STORE, Ctx, admin_ctx
from .jobs.freshness import DISK_ALERT_PCT

log = logging.getLogger("finlit.storage")
admin = APIRouter(prefix="/api/admin")

BACKUPS_DIR = os.getenv("BACKUPS_DIR", "/backups")
FOLDERS: Tuple[Tuple[str, str], ...] = (("NSE daily files", "/data/nse"), ("Sector pages", "/data/sectors"), ("Scores export", "/data/exports"))
KEEP_DAYS = 400
TOP = 40
GROWTH_WINDOW = 30           # days of readings the growth is worked out from

# Plain-word groups for the tables, checked in order (the first that matches wins). Logs first, so "macro_run_log" is a log and not "Other".
GROUPS: Tuple[Tuple[str, str], ...] = (
    ("Background job logs", r"^(job_|ingest_runs|macro_run_log|macro_audit_log|digest_log|disclosure_runs|company_brief_runs|.*_runs$|.*_log$)"),
    ("Prices and charts", r"^(price_|daily_candles|intraday|index_|listing_quotes|commodit|flows_|dhan_|option_)"),
    ("Mutual funds and ETFs", r"^(mf_|etf_|disclosure_|fund_|amfi)"),
    ("News, filings and documents", r"^(feed_|document_|earnings_|calendar|ipos|announcement|corporate_|results_)"),
    ("Company reports and scores", r"^(snapshots|prism_|score|stress_|ownership_|leadership|preset|screen_|gainers|company_|outlook|discovery|segment|macro_|sector|peer|technical)"),
    ("Members and the site", r"^(users|sessions|audit_|watch|alert|basket|graph|page_|feedback|notify|ai_|forum|mail|plan_|saved|logos)"),
)


def group_of(table: str) -> str:
    for name, rx in GROUPS:
        if re.match(rx, table):
            return name
    return "Other"


def disk() -> Optional[Dict[str, int]]:
    """The disk under "/": total, used (as `df` counts it, so the percentage matches the jobs status) and free, in bytes."""
    try:
        st = os.statvfs("/")
    except OSError:
        return None
    total, free = st.f_blocks * st.f_frsize, st.f_bavail * st.f_frsize
    return {"total": total, "used": total - free, "free": free} if total else None


def backups(path: str = BACKUPS_DIR) -> Dict[str, Any]:
    """The nightly database dumps (deploy/aws/backup.sh), read-only. A missing folder is said, not guessed."""
    if not os.path.isdir(path):
        return {"available": False, "why": f"The backups folder is not visible to the app ({path}); it is mounted read-only from the next deploy on."}
    files = []
    for n in sorted(os.listdir(path)):
        if n.startswith("finlit-") and n.endswith(".dump"):
            try:
                st = os.stat(os.path.join(path, n))
            except OSError:
                continue
            files.append({"name": n, "bytes": st.st_size, "at": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat()})
    return {"available": True, "count": len(files), "bytes": sum(f["bytes"] for f in files), "files": files[::-1]}


def folder_bytes(path: str, budget_s: float = 3.0) -> Optional[int]:
    """Bytes under a folder, stopping after `budget_s` seconds (then None: the page says it could not be counted in time)."""
    if not os.path.isdir(path):
        return None
    t0, total = time.monotonic(), 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.lstat(os.path.join(root, f)).st_size
            except OSError:
                pass
        if time.monotonic() - t0 > budget_s:
            return None
    return total


def growth(rows: List[Dict[str, Any]], used: Optional[int], total: Optional[int], alert_pct: float = DISK_ALERT_PCT) -> Dict[str, Any]:
    """Daily growth from the readings of the last GROWTH_WINDOW days (first to last), and the days left before the alert line and before full.
    rows: [{day, disk_used, db_bytes}] oldest first. Needs two readings at least a day apart; otherwise it says so."""
    rows = [r for r in rows if r.get("disk_used") is not None]
    if len(rows) < 2 or (rows[-1]["day"] - rows[0]["day"]).days < 1:
        return {"known": False, "why": "The growth appears once there are readings on two different days (one is taken every hour the jobs run)."}
    a, b = rows[0], rows[-1]
    days = (b["day"] - a["day"]).days
    disk_per_day = (b["disk_used"] - a["disk_used"]) / days
    db_per_day = ((b.get("db_bytes") or 0) - (a.get("db_bytes") or 0)) / days if a.get("db_bytes") is not None and b.get("db_bytes") is not None else None
    out: Dict[str, Any] = {"known": True, "fromDay": a["day"].isoformat(), "toDay": b["day"].isoformat(), "days": days,
                           "diskPerDay": round(disk_per_day), "dbPerDay": None if db_per_day is None else round(db_per_day)}
    if used is not None and total and disk_per_day > 0:
        alert_at = total * alert_pct / 100
        out["daysToAlert"] = max(0, int((alert_at - used) / disk_per_day)) if used < alert_at else 0
        out["daysToFull"] = int((total - used) / disk_per_day)
    else:
        out["daysToAlert"] = out["daysToFull"] = None
        out["steady"] = disk_per_day <= 0
    return out


DB_SQL = "SELECT pg_database_size(current_database())"
WAL_SQL = "SELECT coalesce(sum(size), 0) FROM pg_ls_waldir()"
TABLES_SQL = """
SELECT c.relname AS name, pg_total_relation_size(c.oid) AS total, pg_relation_size(c.oid) AS data, pg_indexes_size(c.oid) AS indexes,
       coalesce(s.n_live_tup, 0) AS live, coalesce(s.n_dead_tup, 0) AS dead
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE c.relkind IN ('r', 'p') AND n.nspname = 'public'
ORDER BY pg_total_relation_size(c.oid) DESC"""
HYPER_SQL = """
SELECT h.hypertable_name AS name, d.table_bytes, d.index_bytes, d.toast_bytes, d.total_bytes,
       (SELECT count(*) FROM timescaledb_information.chunks k WHERE k.hypertable_name = h.hypertable_name) AS chunks,
       (SELECT count(*) FROM timescaledb_information.chunks k WHERE k.hypertable_name = h.hypertable_name AND k.is_compressed) AS compressed
FROM timescaledb_information.hypertables h, LATERAL hypertable_detailed_size(format('%I.%I', h.hypertable_schema, h.hypertable_name)::regclass) d"""


async def _db(conn) -> Dict[str, Any]:
    out: Dict[str, Any] = {"bytes": await conn.fetchval(DB_SQL)}
    try:
        out["walBytes"] = int(await conn.fetchval(WAL_SQL))
    except Exception:   # the role may not read the log folder: the page says so
        out["walBytes"], out["walWhy"] = None, "Not readable by the app's database role."
    tables = [dict(r) for r in await conn.fetch(TABLES_SQL)]
    hyper: Dict[str, Dict[str, Any]] = {}
    try:
        hyper = {r["name"]: dict(r) for r in await conn.fetch(HYPER_SQL)}
    except Exception:   # no TimescaleDB (a plain Postgres): price_daily is an ordinary table and is counted above
        hyper = {}
    rows = []
    for t in tables:
        h = hyper.get(t["name"])
        if h:   # a hypertable keeps its rows in chunks outside "public": take TimescaleDB's own figures
            t.update(total=h["total_bytes"], data=h["table_bytes"], indexes=h["index_bytes"], chunks=h["chunks"], compressedChunks=h["compressed"])
        t["largeValues"] = max(0, (t["total"] or 0) - (t["data"] or 0) - (t["indexes"] or 0))
        t["group"] = group_of(t["name"])
        rows.append(t)
    rows.sort(key=lambda r: -(r["total"] or 0))
    groups: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        g = groups.setdefault(r["group"], {"name": r["group"], "bytes": 0, "tables": 0})
        g["bytes"] += r["total"] or 0
        g["tables"] += 1
    counted = sum(r["total"] or 0 for r in rows)
    out.update(tables=rows[:TOP], tableCount=len(rows), otherTables=max(0, len(rows) - TOP), otherTablesBytes=sum(r["total"] or 0 for r in rows[TOP:]),
               groups=sorted(groups.values(), key=lambda g: -g["bytes"]), systemBytes=max(0, (out["bytes"] or 0) - counted),
               deadRows=sum(r["dead"] for r in rows), hypertables=[{"name": k, "chunks": v["chunks"], "compressed": v["compressed"]} for k, v in hyper.items()])
    return out


RECORD_SQL = """
INSERT INTO storage_daily (day, at, disk_total, disk_used, db_bytes, backups_bytes) VALUES ($1, now(), $2, $3, $4, $5)
ON CONFLICT (day) DO UPDATE SET at = now(), disk_total = EXCLUDED.disk_total, disk_used = EXCLUDED.disk_used, db_bytes = EXCLUDED.db_bytes,
    backups_bytes = EXCLUDED.backups_bytes
WHERE storage_daily.at < now() - interval '1 hour'"""


async def record(pool, today: Optional[date] = None) -> None:
    """Keep today's reading (at most once an hour; the newest of the day wins) and drop readings older than KEEP_DAYS. Never raises."""
    try:
        d = disk()
        b = backups()
        async with pool.acquire() as conn:
            dbb = await conn.fetchval(DB_SQL)
            day = today or datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
            await conn.execute(RECORD_SQL, day, d and d["total"], d and d["used"], dbb, b.get("bytes") if b.get("available") else None)
            await conn.execute("DELETE FROM storage_daily WHERE day < $1", day - timedelta(days=KEEP_DAYS))
    except Exception:
        log.warning("storage reading not kept", exc_info=True)


async def report(pool) -> Dict[str, Any]:
    await record(pool)
    d = disk()
    async with pool.acquire() as conn:
        db = await _db(conn)
        hist = [dict(r) for r in await conn.fetch(
            "SELECT day, disk_total, disk_used, db_bytes, backups_bytes FROM storage_daily ORDER BY day DESC LIMIT $1", GROWTH_WINDOW + 1)][::-1]
    b = backups()
    folders = [{"name": n, "path": p, "bytes": folder_bytes(p)} for n, p in FOLDERS]
    used = d["used"] if d else None
    known = (db["bytes"] or 0) + (b.get("bytes") or 0 if b.get("available") else 0) + sum(f["bytes"] or 0 for f in folders)
    parts = [{"name": "Database", "bytes": db["bytes"]}, {"name": "Database write-ahead log", "bytes": db.get("walBytes")}]
    if b.get("available"):
        parts.append({"name": "Database backups", "bytes": b["bytes"]})
    parts += [{"name": f["name"], "bytes": f["bytes"]} for f in folders if f["bytes"]]
    if used is not None:
        parts.append({"name": "System, Docker images, swap file and logs", "bytes": max(0, used - known - (db.get("walBytes") or 0)),
                      "note": "The rest of the used space. Only the server's own tools can split it further: docker system df, du -xh / --max-depth=1."})
    return {
        "at": datetime.now(timezone.utc).isoformat(),
        "disk": d, "alertPct": DISK_ALERT_PCT,
        "parts": parts, "database": db, "backups": b, "folders": folders,
        "history": [{"day": r["day"].isoformat(), "diskUsed": r["disk_used"], "diskTotal": r["disk_total"], "dbBytes": r["db_bytes"], "backupsBytes": r["backups_bytes"]} for r in hist],
        "growth": growth(hist, used, d["total"] if d else None),
    }


@admin.get("/storage")
async def storage(request: Request, ctx: Ctx = Depends(admin_ctx)):
    return Response(content=orjson.dumps(await report(request.app.state.store.pool), default=str), media_type="application/json", headers=NO_STORE)
