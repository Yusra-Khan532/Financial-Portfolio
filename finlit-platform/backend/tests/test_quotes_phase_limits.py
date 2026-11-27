"""The quote job's two steps that its budget did not cover (17 Nov 2026, after the slices of #504): the Dhan batch calls before the first slice and a
company that never answers inside a slice. Each case hangs one of them and checks that the run still ends on time and says how long each phase took.
Fake store and clients only: no network, no database."""
import asyncio
import time

import orjson
import pytest

from finlit import dhan, scorelive, worker
from finlit.screener import jobs as screener_jobs


class FakeRedis:
    def __init__(self):
        self.kv = {}

    async def get(self, k):
        return self.kv.get(k)

    async def set(self, k, v, ex=None, **kw):
        self.kv[k] = v
        return True


class FakeStore:
    """Every company has a stored summary at price 100, so any new price is a change to write."""

    def __init__(self, n, hang=(), delay=0.0):
        self.items = [(f"S{i:03d}", "consolidated") for i in range(n)]
        self.redis, self.hang, self.delay = FakeRedis(), set(hang), delay
        self.saved = []

    async def quote_symbols(self):
        return list(self.items)

    async def get_section(self, symbol, statement, section):
        if symbol in self.hang:
            await asyncio.sleep(3600)
        if self.delay:
            await asyncio.sleep(self.delay)
        return (orjson.dumps({"quote": {"price": 100.0}}), None)

    async def save_snapshot(self, symbol, statement, sections):
        self.saved.append(symbol)

    async def update_live_scores(self, rows):
        return len(rows)


class FinEdge:
    async def get(self, path, params, timeout=None):
        return {"symbol": params["symbol"]}


class HangingDhan:
    configured = True

    async def quotes(self, ids):
        await asyncio.sleep(3600)


@pytest.fixture(autouse=True)
def quick(monkeypatch):
    monkeypatch.setattr(worker.market, "quote", lambda raw, symbol: {"price": 101.0})
    monkeypatch.setattr(scorelive, "cohort_max", lambda: 0)
    monkeypatch.setattr(worker, "QUOTES_COMPANY_S", 0.2)
    monkeypatch.setattr(worker, "QUOTES_DHAN_S", 0.2)
    monkeypatch.setattr(worker, "QUOTES_PROGRESS_S", 0.05)

    async def ids(store, symbols):
        return {s: ("NSE_EQ", s) for s in symbols}
    monkeypatch.setattr(dhan, "security_map", ids)

    async def follow_up(store, pairs):
        return len(list(pairs))
    monkeypatch.setattr(screener_jobs, "refresh_metrics_for", follow_up)


def run(store, dhan_client=None, budget_s=2.0):
    t = time.monotonic()
    n = asyncio.run(worker.refresh_quotes(FinEdge(), store, dhan_client=dhan_client, budget_s=budget_s))
    return n, time.monotonic() - t


def test_a_dhan_call_that_never_answers_does_not_hold_the_run_and_finedge_takes_over(capsys):
    store = FakeStore(10)
    n, took = run(store, dhan_client=HangingDhan())
    assert took < 1.5                     # before: the run waited on Dhan for as long as Dhan took (up to ~90 s a batch on the server)
    assert n == 10 and len(store.saved) == 10   # every company still got its price, from FinEdge
    assert "Dhan did not answer" in capsys.readouterr().out


def test_a_company_that_hangs_is_left_for_a_later_run_and_the_others_are_done(capsys):
    store = FakeStore(30, hang={"S005"})
    n, took = run(store)
    assert took < 1.5                     # before: the whole slice waited for the hung company until the supervisor killed the run
    assert n == 29 and "S005" not in store.saved
    assert "1 too slow" in capsys.readouterr().out


def test_the_run_prints_progress_and_the_time_of_each_phase(capsys):
    store = FakeStore(40, delay=0.02)
    run(store)
    out = capsys.readouterr().out
    assert "companies reached" in out                                   # the hang check sees the log move
    assert "quotes: done in" in out and "phases dhan" in out and "prices" in out and "follow-up" in out


def test_without_a_budget_nothing_is_printed_and_nothing_is_cut_short(monkeypatch, capsys):
    store = FakeStore(10, delay=0.3)                                     # each company slower than the (test) 0.2 s company limit
    n = asyncio.run(worker.refresh_quotes(FinEdge(), store))
    assert n == 10 and capsys.readouterr().out == ""                    # a manual run (no budget) keeps the old behaviour


def test_the_scheduled_run_keeps_its_limits_inside_the_jobs_ten_minutes():
    from finlit.jobs.registry import by_name
    job = by_name({})["quotes"]
    minutes = float(job.args[job.args.index("--max-minutes") + 1])
    assert minutes * 60 == worker.QUOTES_BUDGET_S
    assert worker.QUOTES_DHAN_S < worker.QUOTES_BUDGET_S and worker.QUOTES_COMPANY_S < 60
    assert job.max_runtime_min - minutes >= 3                            # room for the last slice and its follow-up
