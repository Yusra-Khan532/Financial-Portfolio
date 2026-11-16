"""short-history carries on where the last run stopped and ends inside its time budget (15 Nov 2026: every run reloaded the whole short-history list
in name order with no budget; the list never shrinks because many companies really have four years or fewer, so each run was killed at the job's
60-minute limit and the job had not finished since 31 Oct). The job's schedule, limit and retries are unchanged."""
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

import pytest

from finlit import worker
from finlit.jobs import registry

NOW = datetime.now(timezone.utc)


class Conn:
    """Does what the query does in the database: reports not reloaded within the window, oldest first, capped."""
    def __init__(self, rows):
        self.rows = rows

    async def fetch(self, sql, secs, cap, timeout=None):
        assert "section = 'financials'" in sql and "MATERIALIZED" in sql and timeout == worker.SHORT_HISTORY_QUERY_S
        cut = NOW - timedelta(seconds=secs)
        due = [r for r in self.rows if r["generated_at"] is not None and r["generated_at"] < cut]
        return sorted(due, key=lambda r: (r["generated_at"], r["symbol"]))[:cap]


class Pool:
    def __init__(self, rows):
        self.rows = rows

    def acquire(self):
        rows = self.rows

        class Ctx:
            async def __aenter__(self):
                return Conn(rows)

            async def __aexit__(self, *e):
                return False
        return Ctx()


class Store:
    def __init__(self, rows):
        self.pool, self.dropped = Pool(rows), 0

    async def invalidate_search(self):
        self.dropped += 1


def row(sym, days_ago):
    return {"symbol": sym, "statement": "consolidated", "generated_at": None if days_ago is None else NOW - timedelta(days=days_ago)}


def test_only_reports_not_reloaded_lately_are_taken_oldest_first(monkeypatch):
    seen = []

    async def many(client, store, items, **kw):
        seen.extend(items)
        return [{"symbol": s, "status": "ok"} for s, _ in items]

    monkeypatch.setattr(worker, "ingest_many", many)
    rows = [row("AAA", 1), row("BBB", 20), row("CCC", 8), row("EEE", 3)]
    out = asyncio.run(worker.refresh_short_history(object(), Store(rows), days=7, max_minutes=45))
    assert [s for s, _ in seen] == ["BBB", "CCC"]                  # the oldest first; AAA and EEE were reloaded this week
    assert out == {"due": 2, "ok": 2, "warnings": 0, "rejected": 0, "failed": 0, "waiting": 0}


def test_the_budget_and_the_per_company_cap_are_passed_on_and_skipped_ones_wait(monkeypatch):
    kws = []

    async def many(client, store, items, **kw):
        kws.append(kw)
        return [{"symbol": items[0][0], "status": "ok"}] + [{"symbol": s, "status": "skipped"} for s, _ in items[1:]]

    monkeypatch.setattr(worker, "ingest_many", many)
    out = asyncio.run(worker.refresh_short_history(object(), Store([row(f"S{i}", 30) for i in range(10)]), max_minutes=45))
    assert kws[0]["deadline"] is not None and kws[0]["company_timeout_s"] == worker.INGEST_COMPANY_TIMEOUT_S
    assert out["ok"] == 1 and out["waiting"] == 9


def test_nothing_due_ends_at_once(monkeypatch):
    async def many(*a, **kw):
        raise AssertionError("nothing should load")

    monkeypatch.setattr(worker, "ingest_many", many)
    st = Store([row("AAA", 1)])
    out = asyncio.run(worker.refresh_short_history(object(), st, max_minutes=45))
    assert out["due"] == 0 and out["waiting"] == 0 and st.dropped == 0


def test_the_job_asks_for_a_budget_shorter_than_its_unchanged_limit_and_schedule():
    job = next(j for j in registry.build_jobs({}) if j.name == "short-history")
    args = list(job.args)
    assert args[0] == "refresh-short-history"
    budget = float(args[args.index("--max-minutes") + 1])
    assert job.max_runtime_min == 60 and budget == 45 and job.sla.hours == 400 and job.resumable
    ns = worker.build_parser().parse_args(args)
    assert ns.max_minutes == 45 and ns.days == 7


DB = os.getenv("TEST_DATABASE_URL")


@pytest.mark.skipif(not DB, reason="needs TEST_DATABASE_URL")
def test_the_query_runs_on_postgres_and_parses_only_reports_past_the_window():
    """The real SQL on a temporary snapshots table: a report reloaded lately is never parsed (its body is not even JSON), a long history is left
    out, and the rest come oldest first, capped."""
    import asyncpg

    async def go():
        conn = await asyncpg.connect(DB)
        try:
            await conn.execute("CREATE TEMP TABLE snapshots (symbol text, statement text, section text, body text, etag text, generated_at timestamptz)")
            body = lambda n: json.dumps({"yearly": {"pl": {"periods": [str(2025 - i) for i in range(n)]}}})
            await conn.executemany("INSERT INTO snapshots VALUES ($1, 'consolidated', $2, $3, 'e', now() - make_interval(days => $4))", [
                ("OLD2", "financials", body(2), 30), ("OLD3", "financials", body(3), 10), ("LONG", "financials", body(10), 30),
                ("FRESH", "financials", "not json: never parsed", 1), ("OTHER", "summary", body(2), 30)])
            rows = await conn.fetch(worker.SHORT_HISTORY_SQL, 7 * 86400.0, 10)
            capped = await conn.fetch(worker.SHORT_HISTORY_SQL, 7 * 86400.0, 1)
        finally:
            await conn.close()
        return [r["symbol"] for r in rows], [r["symbol"] for r in capped]

    got, capped = asyncio.run(go())
    assert got == ["OLD2", "OLD3"] and capped == ["OLD2"]
