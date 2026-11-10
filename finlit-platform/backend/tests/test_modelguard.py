"""The model guard: distinct-company budgets, the per-minute crawl limit, trap addresses, and stepping aside when Redis fails."""
import httpx
from fastapi import FastAPI

from finlit import modelguard
from finlit.modelguard import ModelGuardMiddleware


class FakeRedis:
    def __init__(self):
        self.sets, self.nums, self.keys = {}, {}, {}

    async def exists(self, k):
        return int(k in self.keys)

    async def set(self, k, v, ex=None):
        self.keys[k] = v

    async def srem(self, k, v):
        self.sets.get(k, set()).discard(v)

    def pipeline(self, transaction=False):
        return Pipe(self)


class Pipe:
    def __init__(self, r):
        self.r, self.ops = r, []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def sadd(self, k, v):
        self.ops.append(lambda k=k, v=v: (int(v not in self.r.sets.setdefault(k, set())), self.r.sets[k].add(v))[0])

    def scard(self, k):
        self.ops.append(lambda: len(self.r.sets.get(k, ())))

    def incr(self, k):
        def f():
            self.r.nums[k] = self.r.nums.get(k, 0) + 1
            return self.r.nums[k]
        self.ops.append(f)

    def expire(self, k, s):
        self.ops.append(lambda: 1)

    async def execute(self):
        return [op() for op in self.ops]


def make(redis, budget=None):
    if budget:
        modelguard.BUDGET.update(budget)
    app = FastAPI()
    app.state.limiter = type("L", (), {"redis": redis})()

    @app.get("/api/stocks/{symbol}")
    async def one(symbol: str):
        return {"symbol": symbol}

    @app.get("/api/stocks/{symbol}/price")
    async def price(symbol: str):
        return {"p": 1}

    @app.get("/api/stocks/_all")
    async def trap():
        return {"status": "not_found"}

    app.add_middleware(ModelGuardMiddleware, cookie="fl_session")
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")


async def test_a_visitor_opening_many_new_companies_is_slowed_but_repeats_are_free():
    saved = dict(modelguard.BUDGET)
    try:
        c = make(FakeRedis(), {"visitor": (100, 3)})
        for s in ("A", "B", "C"):
            assert (await c.get(f"/api/stocks/{s}")).status_code == 200
        slow = await c.get("/api/stocks/D")
        assert slow.status_code == 429 and int(slow.headers["retry-after"]) >= 1 and slow.json()["status"] == "rate_limited"
        assert (await c.get("/api/stocks/A")).status_code == 200            # already opened: free
        assert (await c.get("/api/stocks/D/price")).status_code == 200      # market data is not counted
    finally:
        modelguard.BUDGET.update(saved)


async def test_the_daily_budget_counts_distinct_companies_and_a_blocked_one_is_not_counted():
    saved = dict(modelguard.BUDGET)
    try:
        r = FakeRedis()
        c = make(r, {"visitor": (2, 50)})
        assert [(await c.get(f"/api/stocks/{s}")).status_code for s in ("A", "B", "C", "A")] == [200, 200, 429, 200]
        assert all("C" not in v for v in r.sets.values())
    finally:
        modelguard.BUDGET.update(saved)


async def test_a_trap_address_flags_the_client_and_lowers_its_budget():
    saved = dict(modelguard.BUDGET)
    try:
        r = FakeRedis()
        c = make(r, {"visitor": (100, 50), "flagged": (1, 50)})
        assert (await c.get("/api/stocks/_all")).status_code == 200         # the app answers; the client is now marked
        assert any(k.startswith("mg:flag:") for k in r.keys)
        assert (await c.get("/api/stocks/A")).status_code == 200
        assert (await c.get("/api/stocks/B")).status_code == 429
    finally:
        modelguard.BUDGET.update(saved)


async def test_the_guard_steps_aside_when_redis_fails():
    class Broken(FakeRedis):
        def pipeline(self, transaction=False):
            raise RuntimeError("down")

        async def exists(self, k):
            raise RuntimeError("down")

    assert (await make(Broken()).get("/api/stocks/A")).status_code == 200
