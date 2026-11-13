"""score-all ends near its own time cap instead of overrunning to the job's hard limit (13 Nov 2026: a 70-minute run still going at 86 minutes):
the cap is looked at before every company, and one slow company is cut off at a fixed time."""
import asyncio
import time

import pytest

from finlit import worker

pytestmark = pytest.mark.asyncio


@pytest.fixture
def fake_ingest(monkeypatch):
    started = []

    async def ingest_one(_client, _store, symbol, statement="consolidated", slim=False):
        started.append(symbol)
        if symbol.startswith("SLOW"):
            await asyncio.sleep(5)
        return {"symbol": symbol, "status": "ok"}
    monkeypatch.setattr(worker, "ingest_one", ingest_one)
    return started


async def test_no_new_company_starts_after_the_deadline(fake_ingest):
    out = await worker.ingest_many(None, None, [("A", "consolidated"), ("B", "consolidated")], deadline=time.monotonic() - 1)
    assert [r["status"] for r in out] == ["skipped", "skipped"] and fake_ingest == []


async def test_a_slow_company_is_cut_off_and_the_others_finish(fake_ingest):
    t0 = time.monotonic()
    out = await worker.ingest_many(None, None, [("SLOW1", "consolidated"), ("FAST", "consolidated")], parallel=2, company_timeout_s=0.2)
    assert time.monotonic() - t0 < 2
    by = {r["symbol"]: r for r in out}
    assert by["SLOW1"]["status"] == "failed" and "timed out" in by["SLOW1"]["error"] and by["FAST"]["status"] == "ok"


async def test_without_limits_nothing_changes(fake_ingest):
    out = await worker.ingest_many(None, None, [("A", "consolidated")])
    assert out == [{"symbol": "A", "status": "ok"}]


async def test_score_all_counts_skipped_companies_as_waiting(monkeypatch):
    class S:
        async def slim_pending(self, days, limit):
            return [f"C{i}" for i in range(10)]

        async def invalidate_search(self):
            pass

    calls = []

    async def many(_c, _s, items, deadline=None, company_timeout_s=None, **_kw):
        items = list(items)
        calls.append((len(items), deadline is not None, company_timeout_s))
        return [{"symbol": s, "status": "ok" if i < 3 else "skipped"} for i, (s, _) in enumerate(items)]
    monkeypatch.setattr(worker, "ingest_many", many)

    class C:
        calls = 0
    out = await worker.score_all(C(), S(), chunk=10)
    assert calls == [(10, True, worker.SCORE_COMPANY_TIMEOUT_S)]
    assert out["tried"] == 3 and out["ok"] == 3 and out["waiting"] == 7 and "skipped" not in out
