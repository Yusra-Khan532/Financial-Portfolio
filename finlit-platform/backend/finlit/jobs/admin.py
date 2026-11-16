"""The admin console's Jobs section (founder, 16 Nov 2026): every background job, what runs now and how far it is, how long jobs take, how often they
fail and why, and how much of each day they keep the server busy. Admin only, read-only.

    GET /api/admin/jobs/overview?days=7    the current state of every job (the same rows as /api/jobs/status), what runs now with its progress,
                                           per-job statistics over `days`, and the busy minutes per job and day
    GET /api/admin/jobs/runs?job=&status=&limit=100    the newest runs, newest first

Progress of a running job: its share of the time limit always; and "% done" when its newest output line says "N / M" or "N of M" (ingest-all,
score-all, technicals and others print that), so no job has to be changed to show it.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from statistics import median
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response

from ..auth.routes import NO_STORE, Ctx, admin_ctx
from .registry import build_jobs
from .signals import BEAT_KEY

router = APIRouter(prefix="/api/admin/jobs")

FINISHED = ("ok", "failed", "killed", "timeout", "partial")
BAD = ("failed", "killed", "timeout")
_PROGRESS = re.compile(r"(\d[\d,]*)\s*(?:/|of)\s*(\d[\d,]*)")


def progress_of(line: Optional[str]) -> Optional[Dict[str, Any]]:
    """The last "N / M" or "N of M" in a job's newest output line, as {done, total, pct}; None when the line has none (or it is not a count)."""
    if not line:
        return None
    found = _PROGRESS.findall(line)
    if not found:
        return None
    done, total = (int(x.replace(",", "")) for x in found[-1])
    if total <= 0 or done > total:
        return None
    return {"done": done, "total": total, "pct": int(round(100.0 * done / total))}


def running_rows(beat: Dict[str, Any], now: float) -> List[Dict[str, Any]]:
    """What runs now, from the supervisor's heartbeat (it lists each running job's start, time limit, memory and newest output line)."""
    out = []
    for r in beat.get("runningDetail") or []:
        started = float(r.get("startedAt") or now)
        elapsed = max(0.0, (now - started) / 60.0)
        limit = float(r.get("limitMin") or 0)
        out.append({"name": r.get("name"), "startedAt": datetime.fromtimestamp(started, timezone.utc).isoformat(timespec="seconds"),
                    "elapsedMin": round(elapsed, 1), "limitMin": limit or None,
                    "limitPct": int(round(min(elapsed / limit, 1.0) * 100)) if limit else None,
                    "progress": progress_of(r.get("tail")), "lastLine": r.get("tail") or None, "peakMb": r.get("peakMb"), "attempt": r.get("attempt")})
    known = {r["name"] for r in out}
    for name in beat.get("running") or []:          # an older supervisor sends names only
        if name not in known:
            out.append({"name": name, "startedAt": None, "elapsedMin": None, "limitMin": None, "limitPct": None, "progress": None,
                        "lastLine": None, "peakMb": None, "attempt": None})
    return out


def job_stats(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Statistics of ONE job's runs (dicts with status, duration_s, peak_rss_mb, started_at, reason), newest first."""
    finished = [r for r in rows if r["status"] in FINISHED]
    ok = [r for r in finished if r["status"] == "ok"]
    mins = [float(r["duration_s"]) / 60.0 for r in ok if r.get("duration_s") is not None]
    bad = [r for r in finished if r["status"] in BAD]
    peaks = [int(r["peak_rss_mb"]) for r in rows if r.get("peak_rss_mb")]
    last = finished[0] if finished else None
    return {
        "runs": len(finished), "ok": len(ok), "failed": sum(r["status"] == "failed" for r in finished),
        "killed": sum(r["status"] == "killed" for r in finished), "timeout": sum(r["status"] == "timeout" for r in finished),
        "partial": sum(r["status"] == "partial" for r in finished), "skipped": sum(r["status"] == "skipped" for r in rows),
        "successPct": int(round(100.0 * len(ok) / len(finished))) if finished else None,
        "typicalMin": round(median(mins), 1) if mins else None, "longestMin": round(max(mins), 1) if mins else None,
        "lastMin": round(float(last["duration_s"]) / 60.0, 1) if last and last.get("duration_s") is not None else None,
        "lastStatus": last["status"] if last else None,
        "busyMin": round(sum(float(r["duration_s"] or 0) for r in finished) / 60.0),
        "peakMb": max(peaks) if peaks else None,
        "lastFailure": ({"at": _iso(bad[0]["started_at"]), "status": bad[0]["status"], "reason": (bad[0].get("reason") or "")[:300]} if bad else None),
    }


def _iso(t: Any) -> Optional[str]:
    return t.isoformat(timespec="seconds") if isinstance(t, datetime) else (str(t) if t else None)


async def _beat(redis: Any) -> Dict[str, Any]:
    try:
        raw = await redis.get(BEAT_KEY)
        return json.loads(raw) if raw else {}
    except Exception:
        return {}


async def overview(store: Any, days: int = 7, now: Optional[datetime] = None) -> Dict[str, Any]:
    from . import status as jobs_status
    now = now or datetime.now(timezone.utc)
    days = max(1, min(int(days), 30))
    body = await jobs_status.build(store, store.redis, now, admin=True)
    beat = await _beat(store.redis)
    async with store.pool.acquire() as conn:
        runs = await conn.fetch("SELECT job, started_at, status, duration_s, peak_rss_mb, reason FROM job_runs "
                                "WHERE started_at > $1::timestamptz - make_interval(days => $2) ORDER BY started_at DESC", now, days)
        daily = await conn.fetch("SELECT to_char(started_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, job, count(*) AS runs, "
                                 "count(*) FILTER (WHERE status IN ('failed', 'killed', 'timeout')) AS bad, round(coalesce(sum(duration_s), 0) / 60.0) AS busy_min "
                                 "FROM job_runs WHERE started_at > $1::timestamptz - make_interval(days => $2) AND status <> 'skipped' GROUP BY 1, 2 ORDER BY 1, 2", now, days)
    by_job: Dict[str, List[Dict[str, Any]]] = {}
    for r in runs:
        by_job.setdefault(r["job"], []).append(dict(r))
    jobs = {j.name: j for j in build_jobs()}
    stats = {}
    for row in body.get("jobs", []):
        name = row["name"]
        j = jobs.get(name)
        stats[name] = {**job_stats(by_job.get(name, [])), "limitMin": j.max_runtime_min if j else None, "resumable": bool(j and j.resumable)}
    return {"asOf": now.isoformat(timespec="seconds"), "days": days, "status": body, "running": running_rows(beat, now.timestamp()), "stats": stats,
            "daily": [{"day": r["day"], "job": r["job"], "runs": r["runs"], "bad": r["bad"], "busyMin": int(r["busy_min"])} for r in daily]}


async def recent_runs(store: Any, job: Optional[str] = None, status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    limit = max(1, min(int(limit), 500))
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, job, started_at, finished_at, status, reason, attempt, duration_s, peak_rss_mb FROM job_runs "
                                "WHERE ($1::text IS NULL OR job = $1) AND ($2::text IS NULL OR status = $2) ORDER BY started_at DESC LIMIT $3",
                                job or None, status or None, limit)
    return [{"id": r["id"], "job": r["job"], "startedAt": _iso(r["started_at"]), "finishedAt": _iso(r["finished_at"]), "status": r["status"],
             "reason": (r["reason"] or "")[:400] or None, "attempt": r["attempt"],
             "minutes": round(float(r["duration_s"]) / 60.0, 1) if r["duration_s"] is not None else None, "peakMb": r["peak_rss_mb"]} for r in rows]


def _json(body: Any) -> Response:
    return Response(content=json.dumps(body, default=str), media_type="application/json", headers=NO_STORE)


@router.get("/overview")
async def get_overview(request: Request, days: int = Query(7, ge=1, le=30), ctx: Ctx = Depends(admin_ctx)):
    return _json(await overview(request.app.state.store, days))


@router.get("/runs")
async def get_runs(request: Request, job: Optional[str] = Query(None, max_length=60), status: Optional[str] = Query(None, max_length=20),
                   limit: int = Query(100, ge=1, le=500), ctx: Ctx = Depends(admin_ctx)):
    return _json({"runs": await recent_runs(request.app.state.store, job, status, limit)})
