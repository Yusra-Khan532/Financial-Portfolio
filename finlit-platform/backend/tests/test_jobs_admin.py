"""The admin console's Jobs section (founder, 16 Nov 2026): progress of what runs now, per-job statistics, busy minutes per day, recent runs; admin only."""
import json
import time
from datetime import datetime, timedelta, timezone

import pytest

from finlit.jobs import admin as jobs_admin
from finlit.jobs.signals import BEAT_KEY
from test_auth import app, make_admin, new_client  # noqa: F401  (fixtures + helpers)
from test_integration import ingested, store  # noqa: F401

NOW = datetime(2026, 11, 16, 6, 30, tzinfo=timezone.utc)


def test_progress_is_read_from_the_newest_output_line():
    assert jobs_admin.progress_of("ingest-all: 120 / 2500  {'ok': 118}") == {"done": 120, "total": 2500, "pct": 5}
    assert jobs_admin.progress_of("technicals: 1,200 of 2,655 companies") == {"done": 1200, "total": 2655, "pct": 45}
    assert jobs_admin.progress_of("first 3 / 10 then 9 / 10") == {"done": 9, "total": 10, "pct": 90}          # the newest count on the line
    assert jobs_admin.progress_of("loading SBI Mutual Fund") is None and jobs_admin.progress_of("") is None
    assert jobs_admin.progress_of("12 / 0") is None and jobs_admin.progress_of("30 / 20") is None             # not a count of work


def test_running_jobs_show_their_share_of_the_time_limit_and_their_progress():
    now = NOW.timestamp()
    beat = {"running": ["ingest", "results"], "runningDetail": [
        {"name": "ingest", "startedAt": now - 45 * 60, "limitMin": 90, "peakMb": 410, "tail": "ingest-all: 600 / 2400", "attempt": 1}]}
    rows = {r["name"]: r for r in jobs_admin.running_rows(beat, now)}
    assert rows["ingest"]["elapsedMin"] == 45.0 and rows["ingest"]["limitPct"] == 50 and rows["ingest"]["progress"]["pct"] == 25
    assert rows["ingest"]["peakMb"] == 410 and rows["ingest"]["lastLine"] == "ingest-all: 600 / 2400"
    assert rows["results"]["elapsedMin"] is None          # an older supervisor sends names only: still listed
    over = jobs_admin.running_rows({"runningDetail": [{"name": "x", "startedAt": now - 200 * 60, "limitMin": 90}]}, now)
    assert over[0]["limitPct"] == 100


def test_job_statistics_count_results_durations_and_the_last_failure():
    t = NOW
    rows = [  # newest first
        {"status": "timeout", "duration_s": 5400, "peak_rss_mb": 450, "started_at": t, "reason": "ran longer than its 90-minute limit"},
        {"status": "ok", "duration_s": 3600, "peak_rss_mb": 400, "started_at": t - timedelta(hours=24), "reason": None},
        {"status": "ok", "duration_s": 1800, "peak_rss_mb": 380, "started_at": t - timedelta(hours=48), "reason": None},
        {"status": "killed", "duration_s": 600, "peak_rss_mb": None, "started_at": t - timedelta(hours=50), "reason": "the supervisor restarted"},
        {"status": "skipped", "duration_s": 0, "peak_rss_mb": None, "started_at": t - timedelta(hours=51), "reason": "waiting"},
    ]
    s = jobs_admin.job_stats(rows)
    assert (s["runs"], s["ok"], s["timeout"], s["killed"], s["skipped"]) == (4, 2, 1, 1, 1)
    assert s["successPct"] == 50 and s["typicalMin"] == 45.0 and s["longestMin"] == 60.0 and s["lastMin"] == 90.0 and s["lastStatus"] == "timeout"
    assert s["peakMb"] == 450 and s["busyMin"] == 190
    assert s["lastFailure"]["status"] == "timeout" and "90-minute" in s["lastFailure"]["reason"]
    assert jobs_admin.job_stats([])["successPct"] is None


@pytest.mark.integration
async def test_overview_and_runs_from_the_database(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM job_runs")
        for job, hours_ago, st, dur in (("ingest", 30, "ok", 3600), ("ingest", 6, "timeout", 5400), ("prism", 5, "ok", 1200), ("prism", 2, "failed", 30)):
            await conn.execute("INSERT INTO job_runs (job, status, duration_s, started_at, finished_at, reason) VALUES ($1, $2, $3, $4, $4, $5)",
                               job, st, dur, NOW - timedelta(hours=hours_ago), "boom" if st == "failed" else None)
    await store.redis.set(BEAT_KEY, json.dumps({"at": NOW.timestamp(), "running": ["ingest"], "startedAt": NOW.timestamp(),
                                                "runningDetail": [{"name": "ingest", "startedAt": NOW.timestamp() - 600, "limitMin": 90, "tail": "ingest-all: 10 / 40"}]}))
    body = await jobs_admin.overview(store, days=7, now=NOW)
    assert body["stats"]["ingest"]["runs"] == 2 and body["stats"]["ingest"]["successPct"] == 50 and body["stats"]["ingest"]["limitMin"] == 90
    assert body["stats"]["prism"]["lastFailure"]["reason"] == "boom"
    assert body["running"][0]["name"] == "ingest" and body["running"][0]["progress"]["pct"] == 25
    assert any(d["job"] == "ingest" and d["busyMin"] == 90 for d in body["daily"])
    assert {j["name"] for j in body["status"]["jobs"]} >= {"ingest", "prism"}
    runs = await jobs_admin.recent_runs(store, job="prism")
    assert [r["status"] for r in runs] == ["failed", "ok"] and runs[0]["reason"] == "boom" and runs[1]["minutes"] == 20.0
    assert [r["job"] for r in await jobs_admin.recent_runs(store, status="timeout")] == ["ingest"]
    await store.redis.delete(BEAT_KEY)
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM job_runs")


@pytest.mark.integration
async def test_the_jobs_section_is_admin_only(app):  # noqa: F811
    from test_auth import signed_in
    from finlit.auth import crypto
    anon = new_client(app)
    assert (await anon.get("/api/admin/jobs/overview")).status_code in (401, 403)
    silver = await signed_in(app, "jobsadm@example.com", plan="silver")
    assert (await silver.get("/api/admin/jobs/overview")).status_code == 403
    assert (await silver.get("/api/admin/jobs/runs")).status_code == 403
    admin = await make_admin(app)
    secret = (await admin.post("/api/me/mfa/setup")).json()["secret"]
    await admin.post("/api/me/mfa/enable", json={"code": crypto.totp_code(secret, int(time.time()) // 30)})
    r = await admin.get("/api/admin/jobs/overview?days=3")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    assert r.json()["days"] == 3 and {"status", "running", "stats", "daily"} <= set(r.json())
    assert (await admin.get("/api/admin/jobs/runs?limit=5")).status_code == 200
    for c in (anon, silver, admin):
        await c.aclose()
