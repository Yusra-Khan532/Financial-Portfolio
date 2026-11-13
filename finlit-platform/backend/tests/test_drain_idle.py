import asyncio

from finlit import worker


class StubRedis:
    def __init__(self):
        self.flag = False

    async def exists(self, key):
        return 1 if self.flag else 0

    async def delete(self, key):
        self.flag = False


class StubStore:
    QUEUE_FLAG = "ingest:queue:pending"

    def __init__(self):
        self.redis, self.claims = StubRedis(), 0

    async def claim(self, limit):
        self.claims += 1
        return []


async def test_idle_drain_loop_does_not_poll_postgres():
    store = StubStore()
    task = asyncio.create_task(worker.drain_queue(None, store, loop=True, idle_seconds=0.01))
    await asyncio.sleep(0.3)
    assert store.claims == 0  # no look at start-up either (a restart must not wake the database): it only watches Redis
    store.redis.flag = True   # a visitor opens a company that is not loaded yet
    await asyncio.sleep(0.1)
    assert store.claims == 1 and store.redis.flag is False
    await asyncio.sleep(0.2)
    assert store.claims == 1
    task.cancel()


class QueueStore(StubStore):
    """A queue of companies (newest last). claim() takes the newest first, as store.claim does."""
    READER_FLAG = "ingest:reader:waiting"

    def __init__(self, items):
        super().__init__()
        self.queue = list(items)

    async def claim(self, limit):
        self.claims += 1
        taken, self.queue = self.queue[-limit:][::-1], self.queue[:-limit] if limit else self.queue
        return [(sym, "consolidated") for sym in taken]


async def test_one_flag_drains_the_whole_backlog(monkeypatch):
    """The bug seen live on 13 Nov: after one flag the loop took two companies and then waited for the next visitor's flag, so 184 companies sat in
    the queue for a day and a company a visitor opened (Avantel) was never reached. Now one flag drains everything."""
    built = []

    async def serve_one(client, store, sym, st, extras, background):
        built.append(sym)
        await asyncio.sleep(0.01)
        return {"symbol": sym, "status": "ok"}
    async def nothing(*a, **k): return None
    monkeypatch.setattr(worker, "serve_one", serve_one)
    monkeypatch.setattr(worker, "_retry_dropped", nothing)

    class Redis(StubRedis):
        async def set(self, *a, **k): return True
    store = QueueStore([f"OLD{i}" for i in range(9)] + ["AVANTEL"])
    store.redis = Redis()
    store.invalidate_search = nothing
    task = asyncio.create_task(worker.drain_queue(None, store, loop=True, idle_seconds=0.01, lanes=2))
    store.redis.flag = True                  # one visitor opens one company
    for _ in range(200):
        if not store.queue and len(built) == 10:
            break
        await asyncio.sleep(0.01)
    task.cancel()
    assert built[0] == "AVANTEL"             # the newest request (the visitor's) first
    assert sorted(built) == sorted([f"OLD{i}" for i in range(9)] + ["AVANTEL"]) and not store.queue


async def test_a_lost_flag_never_strands_the_queue(monkeypatch):
    built = []

    async def serve_one(client, store, sym, st, extras, background):
        built.append(sym); return {"symbol": sym, "status": "ok"}
    async def nothing(*a, **k): return None
    monkeypatch.setattr(worker, "serve_one", serve_one)
    monkeypatch.setattr(worker, "_retry_dropped", nothing)

    class Redis(StubRedis):
        async def set(self, *a, **k): return True
    store = QueueStore(["LEFTOVER"]); store.redis = Redis(); store.invalidate_search = nothing
    task = asyncio.create_task(worker.drain_queue(None, store, loop=True, idle_seconds=0.01, recheck_seconds=0.2))
    await asyncio.sleep(0.5)                 # no flag at all: the recheck finds it
    task.cancel()
    assert built == ["LEFTOVER"]


async def test_a_hung_load_frees_its_lane(monkeypatch):
    built = []

    async def serve_one(client, store, sym, st, extras, background):
        if sym == "HANGS":
            await asyncio.sleep(60)
        built.append(sym); return {"symbol": sym, "status": "ok"}
    async def nothing(*a, **k): return None
    monkeypatch.setattr(worker, "serve_one", serve_one)
    monkeypatch.setattr(worker, "_retry_dropped", nothing)
    monkeypatch.setattr(worker, "_after_load", nothing)
    monkeypatch.setattr(worker, "LANE_TIMEOUT_S", 0.1)

    class Redis(StubRedis):
        async def set(self, *a, **k): return True
    store = QueueStore(["NEXT", "HANGS"]); store.redis = Redis(); store.invalidate_search = nothing
    task = asyncio.create_task(worker.drain_queue(None, store, loop=True, idle_seconds=0.01, lanes=1))
    store.redis.flag = True
    await asyncio.sleep(0.5)
    task.cancel()
    assert built == ["NEXT"]                 # the one lane was freed after the hung load and took the next company
