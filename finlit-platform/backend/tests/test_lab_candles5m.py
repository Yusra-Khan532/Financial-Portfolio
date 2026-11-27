"""Trading Lab > the 5-minute candle store behind the Time Machine (lab/candles5m.py, table candles_5m, job lab-candles): one paced Dhan call per F&O
share, a first fill of 89 days, later runs from the last stored bar, stored once per bar, rows older than 100 days deleted on plain PostgreSQL."""
from datetime import date, datetime, timedelta

import pytest

from finlit import intraday
from finlit.dhan import IST, DhanError
from finlit.jobs.registry import LIMIT_POLICY, build_jobs
from finlit.lab import candles5m as C
from test_integration import make_settings, store  # noqa: F401

pg = pytest.mark.integration
NOW = datetime(2026, 11, 26, 16, 0, tzinfo=IST)            # a Thursday, after the close


def bar(d: date, i: int, px=100.0):
    return {"at": datetime(d.year, d.month, d.day, 9, 15, tzinfo=IST) + timedelta(minutes=5 * i), "open": px, "high": px + 1, "low": px - 1,
            "close": px + 0.5, "volume": 10}


class FakeClient:
    def __init__(self, answer=None, fail=()):
        self.calls, self.answer, self.fail = [], answer, set(fail)

    async def intraday(self, sid, segment, interval, start, end):
        self.calls.append((sid, segment, interval, start, end))
        if sid in self.fail:
            raise DhanError("no answer")
        if self.answer is not None:
            return self.answer(sid, start, end)
        return [bar(NOW.date(), i) for i in range(75)]


def slots(*answers):
    seq = list(answers)

    async def slot(_r, now=None, share=False):
        assert share is True
        return seq.pop(0) if seq else None
    return slot


async def setup(store, n=3):  # noqa: F811
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM dhan_instruments")
        await conn.execute("DELETE FROM candles_5m")
        await conn.executemany("INSERT INTO dhan_instruments (exch, security_id, symbol, name, fno) VALUES ('NSE', $1, $2, $2, true)",
                               [(str(500 + i), f"CS{i:02d}") for i in range(n)])


async def count(store, sid=None):  # noqa: F811
    async with store.pool.acquire() as conn:
        if sid:
            return await conn.fetchval("SELECT count(*) FROM candles_5m WHERE security_id = $1", sid)
        return await conn.fetchval("SELECT count(*) FROM candles_5m")


# ------------------------------------------------------------------------------------------------------------------ pure parts

def test_the_window_order_and_the_up_to_date_rule():
    s, e = C.fetch_window(None, NOW)
    assert e == NOW and s == datetime(2026, 8, 29, 0, 0, tzinfo=IST) and (e - s) <= timedelta(days=90)     # one call inside Dhan's 90 days
    last = datetime(2026, 11, 25, 15, 25, tzinfo=IST)
    assert C.fetch_window(last, NOW) == (last, NOW)                                     # from the last stored bar
    assert C.fetch_window(datetime(2026, 6, 1, 15, 25, tzinfo=IST), NOW)[0] == s       # never more than 89 days back
    assert C.latest_finished_session(NOW) == date(2026, 11, 26)
    assert C.latest_finished_session(datetime(2026, 11, 26, 15, 30, tzinfo=IST)) == date(2026, 11, 25)
    assert C.latest_finished_session(datetime(2026, 11, 29, 12, 0, tzinfo=IST)) == date(2026, 11, 27)     # Sunday: Friday's session
    assert C.up_to_date(datetime(2026, 11, 26, 15, 25, tzinfo=IST), NOW)
    assert not C.up_to_date(datetime(2026, 11, 26, 15, 20, tzinfo=IST), NOW)
    assert not C.up_to_date(last, NOW) and not C.up_to_date(None, NOW)
    uni = {s: {"security_id": i} for s, i in (("AAA", "1"), ("BBB", "2"), ("CCC", "3"), ("DDD", "4"))}
    stats = {"1": (60, datetime(2026, 11, 25, 15, 25, tzinfo=IST)), "2": (10, NOW), "3": (60, datetime(2026, 11, 20, 15, 25, tzinfo=IST))}
    assert C.order(uni, stats) == ["DDD", "BBB", "CCC", "AAA"]                          # fewest sessions, then the oldest last bar


def test_only_session_bars_with_prices_become_rows():
    d = NOW.date()
    got = [bar(d, 0), {**bar(d, 1), "close": None}, {"at": datetime(2026, 11, 26, 9, 10, tzinfo=IST), "open": 1, "high": 1, "low": 1, "close": 1},
           {"at": datetime(2026, 11, 26, 15, 30, tzinfo=IST), "open": 1, "high": 1, "low": 1, "close": 1}, {**bar(d, 74), "volume": None}]
    rows = C.rows_of("7", got)
    assert [r[1].strftime("%H:%M") for r in rows] == ["09:15", "15:25"] and rows[0][0] == "7" and rows[1][6] is None


def test_the_job_is_scheduled_paced_and_declares_its_limit():
    job = {j.name: j for j in build_jobs({"DHAN_CLIENT_ID": "x"})}["lab-candles"]
    assert job.args == ("refresh-lab-candles", "--max-minutes", "6") and job.max_runtime_min == 10
    assert job.daily_at == (15, 55) and job.windows[0].window == "AFTER_CLOSE" and job.windows[0].not_before == (19, 30)
    assert job.day_rule(date(2026, 11, 27)) and not job.day_rule(date(2026, 11, 28)) and job.catchup and job.gate.var == "DHAN_CLIENT_ID"
    assert "lab-candles" not in {j.name for j in build_jobs({}) if j.gate and j.gate.disabled_reason({}) is None}
    p = LIMIT_POLICY["lab-candles"]
    assert p.startswith("deadline: ") and "210" in p and "1 a second" in p and "90,000" in p


# ------------------------------------------------------------------------------------------------------------------ the job

@pg
async def test_a_first_fill_is_one_call_of_89_days_and_the_next_run_starts_at_the_last_bar(store, monkeypatch):  # noqa: F811
    await setup(store, 2)
    monkeypatch.setattr(intraday, "slot", slots())
    d1 = date(2026, 11, 25)
    first = FakeClient(answer=lambda sid, s, e: [bar(d1, i) for i in range(75)])
    out = await C.refresh(store, first, now=NOW, clock=lambda: 0)
    assert out["status"] == "ok" and out["fetched"] == 2 and out["bars"] == 150 and out["stopped"] is None
    assert len(first.calls) == 2 and all(c[1:3] == ("NSE_EQ", 5) and c[4] - c[3] <= timedelta(days=89, hours=16) and c[3] == datetime(2026, 8, 29, tzinfo=IST)
                                         for c in first.calls)
    nxt = FakeClient()                                                                  # today's session, asked from yesterday's last bar
    out = await C.refresh(store, nxt, now=NOW, clock=lambda: 0)
    assert [c[3] for c in nxt.calls] == [datetime(2026, 11, 25, 15, 25, tzinfo=IST)] * 2 and await count(store) == 300
    again = FakeClient()                                                                # the 19:30 run: every share is up to date, no call
    out = await C.refresh(store, again, now=NOW.replace(hour=19, minute=30), clock=lambda: 0)
    assert again.calls == [] and out["current"] == 2 and out["fetched"] == 0 and out["status"] == "ok"


@pg
async def test_a_bar_fetched_twice_is_stored_once_with_the_new_values(store, monkeypatch):  # noqa: F811
    await setup(store, 1)
    monkeypatch.setattr(intraday, "slot", slots())
    d = NOW.date()
    await C.refresh(store, FakeClient(answer=lambda *a: [bar(d, i) for i in range(10)]), now=NOW, clock=lambda: 0)
    await C.refresh(store, FakeClient(answer=lambda *a: [bar(d, i, 120.0) for i in range(5, 75)]), now=NOW, clock=lambda: 0)
    assert await count(store) == 75
    async with store.pool.acquire() as conn:
        close = await conn.fetchval("SELECT close FROM candles_5m WHERE at = $1", bar(d, 5)["at"])
        first = await conn.fetchval("SELECT close FROM candles_5m WHERE at = $1", bar(d, 0)["at"])
    assert close == 120.5 and first == 100.5


@pg
async def test_budget_stops_the_run_and_busy_skips_the_share(store, monkeypatch):  # noqa: F811
    await setup(store, 3)
    monkeypatch.setattr(intraday, "slot", slots("busy", None, "budget"))
    client = FakeClient()
    out = await C.refresh(store, client, now=NOW, clock=lambda: 0)
    assert [c[0] for c in client.calls] == ["501"] and out["busy"] == 1 and out["fetched"] == 1 and out["stopped"] == "budget" and out["left"] == 1
    monkeypatch.setattr(intraday, "slot", slots())
    client = FakeClient(fail={"502"})                                                   # the skipped ones go first next run (fewest sessions)
    out = await C.refresh(store, client, now=NOW, clock=lambda: 0)
    assert [c[0] for c in client.calls] == ["500", "502"] and out["failed"] == 1 and out["fetched"] == 1 and out["current"] == 1


@pg
async def test_the_run_stops_starting_calls_at_its_deadline(store, monkeypatch):  # noqa: F811
    await setup(store, 3)
    monkeypatch.setattr(intraday, "slot", slots())
    ticks = iter([0, 0, 0, 1000, 1000])
    client = FakeClient()
    out = await C.refresh(store, client, now=NOW, max_minutes=6, clock=lambda: next(ticks))
    assert len(client.calls) == 2 and out["stopped"] == "deadline" and out["left"] == 1 and await count(store) == 150


@pg
async def test_rows_older_than_100_days_are_deleted_on_plain_postgres(store, monkeypatch):  # noqa: F811
    await setup(store, 1)
    old, keep = NOW - timedelta(days=101), NOW - timedelta(days=99)
    async with store.pool.acquire() as conn:
        assert not await C._is_hypertable(conn)                                         # TimescaleDB is not installed here
        await conn.executemany("INSERT INTO candles_5m (security_id, at, open, high, low, close) VALUES ('500', $1, 1, 1, 1, 1)", [(old,), (keep,)])
    monkeypatch.setattr(intraday, "slot", slots("budget"))
    out = await C.refresh(store, FakeClient(), now=NOW, clock=lambda: 0)
    assert out["pruned"] == 1 and out["stopped"] == "budget"
    async with store.pool.acquire() as conn:
        assert [r["at"] for r in await conn.fetch("SELECT at FROM candles_5m")] == [keep]


@pg
async def test_no_fno_share_is_a_failed_run(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM dhan_instruments")
    out = await C.refresh(store, FakeClient(), now=NOW, clock=lambda: 0)
    assert out["status"] == "failed" and "refresh-instruments" in out["error"]
