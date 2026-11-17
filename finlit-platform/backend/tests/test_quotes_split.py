"""The quote job splits its work so every run finishes inside its time limit (12 Nov 2026: with about 5,800 reports one run tried all of them at once and timed out
every time). A few companies at a time, no new company after the budget, the next run starts where this one stopped, and one company failing never stops the run."""
import asyncio

from finlit import worker


class FakeRedis:
    def __init__(self):
        self.kv = {}

    async def get(self, k):
        return self.kv.get(k)

    async def set(self, k, v, ex=None):
        self.kv[k] = v


class FakeStore:
    def __init__(self, n, delay=0.01, broken=()):
        self.items = [(f"S{i:03d}", "consolidated") for i in range(n)]
        self.redis, self.delay, self.broken = FakeRedis(), delay, set(broken)
        self.seen, self.running, self.peak = [], 0, 0

    async def quote_symbols(self):
        return list(self.items)

    async def get_section(self, symbol, statement, section):
        self.running += 1
        self.peak = max(self.peak, self.running)
        try:
            self.seen.append(symbol)
            await asyncio.sleep(self.delay)
            if symbol in self.broken:
                raise RuntimeError("bad summary")
            return None              # no stored summary: nothing to patch, nothing to write
        finally:
            self.running -= 1


def test_a_run_stops_on_time_a_few_at_a_time_and_the_next_run_carries_on():
    store = FakeStore(100, delay=0.02)
    asyncio.run(worker.refresh_quotes(object(), store, budget_s=0.05))
    first = list(store.seen)
    assert 0 < len(first) < 100                                          # stopped on time, not all of them
    assert store.peak <= worker.QUOTES_AT_ONCE                           # never more than a few at once
    assert first[0] == "S000"
    store.seen.clear()
    asyncio.run(worker.refresh_quotes(object(), store, budget_s=0.05))
    assert store.seen[0] == f"S{len(first):03d}"                         # the next run starts with the first company not reached
    seen_all = set(first)
    for _ in range(30):
        seen_all |= set(store.seen)
        if len(seen_all) == 100:
            break
        store.seen.clear()
        asyncio.run(worker.refresh_quotes(object(), store, budget_s=0.05))
    assert len(seen_all) == 100                                          # every company is reached in turn


def test_without_a_budget_every_company_is_done_and_one_failing_company_does_not_stop_the_others():
    store = FakeStore(60, delay=0.001, broken={"S010"})
    assert asyncio.run(worker.refresh_quotes(object(), store)) == 0     # nothing to patch in this fake, but no exception
    assert len(store.seen) == 60 and store.peak <= worker.QUOTES_AT_ONCE


class PricedStore(FakeStore):
    """Every company has a stored summary and gets a new price, so each one is saved and followed up (live scores, screener numbers)."""
    def __init__(self, n, delay=0.002):
        super().__init__(n, delay=delay)
        self.saved = []

    async def get_section(self, symbol, statement, section):
        await asyncio.sleep(self.delay)
        self.seen.append(symbol)
        return ('{"quote": {"price": 100}}',)

    async def save_snapshot(self, symbol, statement, sections):
        self.saved.append(symbol)


class Client:
    async def get(self, path, params=None, timeout=None):
        return {"price": 101}


def test_the_follow_up_of_each_price_is_inside_the_budget_and_none_is_lost(monkeypatch):
    """17 November 2026: the screener follow-up ran once after all ~3,000 prices and outside the 7-minute budget, so every run passed its 10-minute limit,
    was killed ("timeout") and the run's screener numbers were never stored. Now each slice is followed up before the next one starts."""
    import time
    from finlit import scorelive
    from finlit.screener import jobs as screener_jobs
    monkeypatch.setattr(worker.market, "quote", lambda payload, symbol: {"price": payload["price"]})
    async def no_score(*a, **k):
        return None
    monkeypatch.setattr(scorelive, "apply_live_price", no_score)
    followed = []
    async def slow_follow_up(store, pairs):        # about a millisecond a company, like the real per-company screener update
        await asyncio.sleep(0.001 * len(pairs))
        followed.extend(s for s, _ in pairs)
        return len(pairs)
    monkeypatch.setattr(screener_jobs, "refresh_metrics_for", slow_follow_up)
    monkeypatch.setattr(worker, "QUOTES_SLICE", 50, raising=False)
    store = PricedStore(2000, delay=0.01)
    budget = 0.3
    started = time.monotonic()
    asyncio.run(worker.refresh_quotes(Client(), store, budget_s=budget))
    took = time.monotonic() - started
    assert 0 < len(store.saved) < 2000                                    # stopped on time
    assert sorted(followed) == sorted(store.saved)                       # every saved price had its screener follow-up
    assert took < budget + 0.5                                            # ends about one slice after the budget, follow-up included
