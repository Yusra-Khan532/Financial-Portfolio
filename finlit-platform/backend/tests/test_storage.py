"""Console > Storage (finlit/storage.py): the disk, the database by table, the backups, the daily readings and the growth worked out from them."""
import os
import time
from datetime import date, timedelta

import pytest

from finlit import storage as st
from finlit.auth import crypto
from test_auth import anon, app, make_admin, signed_in  # noqa: F401  (fixtures)
from test_integration import ingested, make_settings, store  # noqa: F401  (fixtures)

GB = 1024 ** 3


def test_tables_go_into_plain_word_groups():
    assert st.group_of("price_daily") == "Prices and charts" and st.group_of("daily_candles") == "Prices and charts"
    assert st.group_of("mf_history") == "Mutual funds and ETFs" and st.group_of("disclosure_portfolios") == "Mutual funds and ETFs"
    assert st.group_of("disclosure_runs") == "Background job logs" and st.group_of("macro_run_log") == "Background job logs" and st.group_of("job_runs") == "Background job logs"
    assert st.group_of("snapshots") == "Company reports and scores" and st.group_of("prism_reports") == "Company reports and scores"
    assert st.group_of("document_pages") == "News, filings and documents" and st.group_of("feed_items") == "News, filings and documents"
    assert st.group_of("users") == "Members and the site" and st.group_of("something_new") == "Other"


def test_growth_needs_two_days_then_gives_days_to_the_alert_and_to_full():
    assert st.growth([], 10 * GB, 40 * GB)["known"] is False
    one = [{"day": date(2026, 11, 20), "disk_used": 20 * GB, "db_bytes": 2 * GB}]
    assert "two different days" in st.growth(one, 20 * GB, 40 * GB)["why"]
    rows = [{"day": date(2026, 11, 20), "disk_used": 20 * GB, "db_bytes": 2 * GB}, {"day": date(2026, 11, 30), "disk_used": 21 * GB, "db_bytes": 2.5 * GB}]
    g = st.growth(rows, 21 * GB, 40 * GB, alert_pct=85)
    assert g["known"] and g["days"] == 10 and g["diskPerDay"] == round(GB / 10) and g["dbPerDay"] == round(0.05 * GB)
    assert g["daysToAlert"] == int((34 * GB - 21 * GB) / (GB / 10)) == 130 and g["daysToFull"] == 190
    flat = st.growth([{"day": date(2026, 11, 20), "disk_used": 21 * GB}, {"day": date(2026, 11, 25), "disk_used": 20 * GB}], 20 * GB, 40 * GB)
    assert flat["daysToAlert"] is None and flat["steady"] is True


def test_backups_are_listed_newest_first_and_a_missing_folder_says_why(tmp_path):
    assert st.backups(str(tmp_path / "nope"))["available"] is False and "read-only" in st.backups(str(tmp_path / "nope"))["why"]
    for name, size in (("finlit-2026-11-24_203000.dump", 300), ("finlit-2026-11-25_203000.dump", 500), ("other.txt", 999)):
        (tmp_path / name).write_bytes(b"x" * size)
    b = st.backups(str(tmp_path))
    assert b["available"] and b["count"] == 2 and b["bytes"] == 800 and [f["name"] for f in b["files"]] == ["finlit-2026-11-25_203000.dump", "finlit-2026-11-24_203000.dump"]


def test_folder_bytes_counts_files_and_a_missing_folder_is_none(tmp_path):
    (tmp_path / "a").mkdir(); (tmp_path / "a" / "f").write_bytes(b"x" * 1000); (tmp_path / "g").write_bytes(b"y" * 24)
    assert st.folder_bytes(str(tmp_path)) == 1024 and st.folder_bytes(str(tmp_path / "missing")) is None


def test_the_disk_reading_matches_df(monkeypatch):
    # One statvfs snapshot for both sides: on a shared CI runner the free space changes between two separate readings, so comparing
    # st.disk() with a second os.statvfs() call failed now and then. The arithmetic (df's "Avail" = f_bavail, used = total - avail) is
    # checked exactly against that same snapshot, taken from the real disk.
    snap = os.statvfs("/")
    monkeypatch.setattr(st.os, "statvfs", lambda path: snap)
    d = st.disk()
    assert d and d["total"] == snap.f_blocks * snap.f_frsize and d["free"] == snap.f_bavail * snap.f_frsize and d["used"] + d["free"] == d["total"]
    assert d["used"] == (snap.f_blocks - snap.f_bavail) * snap.f_frsize


@pytest.mark.integration
async def test_one_reading_a_day_at_most_hourly_and_old_ones_go(app):  # noqa: F811
    pool = app.state.store.pool
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE storage_daily")
        await conn.execute("INSERT INTO storage_daily (day, disk_used) VALUES ($1, 1)", date(2026, 11, 25) - timedelta(days=500))
    await st.record(pool, today=date(2026, 11, 25))
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT day, disk_used, db_bytes FROM storage_daily ORDER BY day")
        assert [r["day"] for r in rows] == [date(2026, 11, 25)] and rows[0]["db_bytes"] > 0 and rows[0]["disk_used"] > 1
        await conn.execute("UPDATE storage_daily SET disk_used = 7")
    await st.record(pool, today=date(2026, 11, 25))   # within the hour: kept as it is
    async with pool.acquire() as conn:
        assert await conn.fetchval("SELECT disk_used FROM storage_daily") == 7
        await conn.execute("UPDATE storage_daily SET at = now() - interval '2 hours'")
    await st.record(pool, today=date(2026, 11, 25))   # an hour later: the newer reading wins
    async with pool.acquire() as conn:
        assert await conn.fetchval("SELECT disk_used FROM storage_daily") > 7


@pytest.mark.integration
async def test_the_console_report_is_for_administrators_only_and_measures_everything(app, anon):  # noqa: F811
    # starts from no readings: an earlier test leaves one dated 2026-11-25, and from 18:30 UTC "today" in IST is the next day, so the report's own
    # reading made two days and the growth became "known" (this test failed every evening from midnight IST to midnight UTC)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM storage_daily")
    assert (await anon.get("/api/admin/storage")).status_code == 401
    member = await signed_in(app, "storage-member@example.com")
    assert (await member.get("/api/admin/storage")).status_code == 403
    boss = await make_admin(app, "storage-boss@example.com")
    secret = (await boss.post("/api/me/mfa/setup")).json()["secret"]
    await boss.post("/api/me/mfa/enable", json={"code": crypto.totp_code(secret, int(time.time()) // 30)})
    r = await boss.get("/api/admin/storage")
    assert r.status_code == 200 and r.headers["cache-control"].startswith("no-store")
    b = r.json()
    assert b["disk"]["total"] > 0 and b["alertPct"] == 85.0
    db = b["database"]
    assert db["bytes"] > 0 and db["tableCount"] > 100 and db["tables"][0]["total"] >= db["tables"][-1]["total"]
    assert {"name", "group", "total", "data", "indexes", "largeValues", "live", "dead"} <= set(db["tables"][0])
    assert sum(g["tables"] for g in db["groups"]) == db["tableCount"]
    names = [p["name"] for p in b["parts"]]
    assert names[0] == "Database" and names[-1] == "System, Docker images, swap file and logs"
    assert b["backups"]["available"] is False and b["backups"]["why"]          # no /backups in the test container: said, not guessed
    assert b["history"] and b["growth"]["known"] is False                       # one reading so far
