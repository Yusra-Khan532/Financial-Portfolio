"""ingest-all ends by itself inside its time budget (14 Nov 2026: every run tried all ~5,800 stale companies, was killed at the job's hard limit
and never recorded a success, so the job showed overdue). The job's own limit is unchanged; the run simply stops a little before it."""
import asyncio

from finlit import worker
from finlit.jobs import registry


class Store:
    def __init__(self, n):
        self.n = n

    async def pending_symbols(self, statement, hours, limit):
        return [f"S{i}" for i in range(self.n)]

    async def invalidate_search(self):
        pass


class Client:
    calls = 0


def test_a_spent_budget_stops_before_the_next_chunk_and_reports_what_waits(monkeypatch):
    seen = []

    async def many(client, store, items, **kw):
        seen.append((len(items), kw.get("deadline") is not None, kw.get("company_timeout_s")))
        return [{"status": "ok"} for _ in items]

    monkeypatch.setattr(worker, "ingest_many", many)
    out = asyncio.run(worker.ingest_all(Client(), Store(95), chunk=30, max_minutes=0))       # budget already used: nothing starts
    assert out["tried"] == 0 and out["waiting"] == 95 and not seen
    out = asyncio.run(worker.ingest_all(Client(), Store(95), chunk=30, max_minutes=60))
    assert out["tried"] == 95 and out["waiting"] == 0 and out["ok"] == 95
    assert seen and all(d and t == worker.INGEST_COMPANY_TIMEOUT_S for _, d, t in seen)   # every company is capped and the deadline is passed on


def test_skipped_companies_are_left_for_the_next_run(monkeypatch):
    async def many(client, store, items, **kw):
        return [{"status": "ok"}] + [{"status": "skipped"} for _ in items[1:]]

    monkeypatch.setattr(worker, "ingest_many", many)
    out = asyncio.run(worker.ingest_all(Client(), Store(10), chunk=10, max_minutes=60))
    assert out["tried"] == 1 and out["waiting"] == 9


def test_without_a_budget_it_behaves_as_before(monkeypatch):
    async def many(client, store, items, **kw):
        assert "deadline" not in kw
        return [{"status": "ok"} for _ in items]

    monkeypatch.setattr(worker, "ingest_many", many)
    assert asyncio.run(worker.ingest_all(Client(), Store(5)))["tried"] == 5


def test_the_job_asks_for_a_budget_shorter_than_its_unchanged_hard_limit():
    job = next(j for j in registry.build_jobs({}) if j.name == "ingest")
    args = list(job.args)
    budget = float(args[args.index("--max-minutes") + 1])
    assert job.max_runtime_min == 90 and budget == 75 and budget < job.max_runtime_min
