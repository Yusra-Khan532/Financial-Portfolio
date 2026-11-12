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
