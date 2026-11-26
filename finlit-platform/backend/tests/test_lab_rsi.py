"""Trading Lab > RSI heatmap (lab/rsi.py): Wilder's RSI(14) on 5m, 15m, hourly (both grouped from 5-minute candles from 09:15 IST) and daily bars
for every F&O stock, refreshed by the paced job `lab-rsi`. Describe-only: bands are names for where a value sits, never a call."""
import math
from datetime import date, datetime, timedelta

import orjson
import pytest

from finlit import intraday
from finlit.analytics.indicators import rsi as wilder
from finlit.dhan import IST, DhanError
from finlit.jobs.registry import LIMIT_POLICY, build_jobs
from finlit.lab import rsi as R
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration


def at(d: date, h: int, m: int) -> int:
    return int(datetime(d.year, d.month, d.day, h, m, tzinfo=IST).timestamp())


def session(d: date, closes):
    """5-minute [start, close] pairs from 09:15 for one day."""
    return [[at(d, 9, 15) + 300 * i, c] for i, c in enumerate(closes)]


D1 = date(2026, 11, 25)
D2 = date(2026, 11, 26)


# ------------------------------------------------------------------------------------------------------------------ the formula

def test_wilder_value_matches_the_shared_indicator_on_a_known_series():
    closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64]
    closes = closes + [45.64 + math.sin(i / 3) for i in range(40)]
    v, prev, why = R.value(closes)
    ref = wilder(closes, 14)
    assert why is None and v == round(ref[-1], 1) and prev == round(ref[-2], 1)
    assert round(wilder(closes[:15], 14)[14], 2) == 70.46            # the classic worked example (70.53 there, from averages rounded to 4 places)
    gains = [max(b - a, 0) for a, b in zip(closes, closes[1:])]       # Wilder by hand: plain mean of the first 14, then (prev * 13 + x) / 14
    losses = [max(a - b, 0) for a, b in zip(closes, closes[1:])]
    ag, al = sum(gains[:14]) / 14, sum(losses[:14]) / 14
    for g, l in zip(gains[14:], losses[14:]):
        ag, al = (ag * 13 + g) / 14, (al * 13 + l) / 14
    assert v == round(100 - 100 / (1 + ag / al), 1)


def test_no_loss_reads_100_and_too_few_bars_are_null_with_the_reason():
    v, prev, why = R.value([float(i) for i in range(1, 61)])          # only gains: AL = 0
    assert v == 100.0 and prev == 100.0 and why is None
    v, prev, why = R.value([1.0] * 49)
    assert v is None and prev is None and "49 bars" in why and "50" in why


def test_band_edges():
    assert [R.band(x) for x in (0, 30, 30.1, 39.9, 40, 60, 60.1, 69.9, 70, 100)] == \
        ["oversold", "oversold", "weak", "weak", "middle", "middle", "strong", "strong", "overbought", "overbought"]
    assert R.band(None) is None
    assert R.BAND_LABEL["oversold"] == "oversold band" and R.BAND_LABEL["overbought"] == "overbought band"


# ------------------------------------------------------------------------------------------------------------------ grouping

def test_15_minute_and_hourly_bars_start_at_0915_and_the_last_hourly_bar_is_1515_to_1530():
    c5 = session(D1, list(range(75)))                                  # 09:15 ... 15:25: a full session, close = index
    b15 = R.resample(c5, 15)
    assert len(b15) == 25 and b15[0][0] == at(D1, 9, 15) and b15[0][1] == 2 and b15[0][2] == at(D1, 9, 30)
    assert b15[-1][0] == at(D1, 15, 15) and b15[-1][1] == 74 and b15[-1][2] == at(D1, 15, 30)
    b60 = R.resample(c5, 60)
    assert [datetime.fromtimestamp(b[0], IST).strftime("%H:%M") for b in b60] == ["09:15", "10:15", "11:15", "12:15", "13:15", "14:15", "15:15"]
    assert b60[0][1] == 11 and b60[-1][1] == 74 and b60[-1][2] == at(D1, 15, 30)       # the 15:15 bar: three 5-minute bars, ends at 15:30
    outside = [[at(D1, 9, 10), 1.0], [at(D1, 15, 30), 2.0]]
    assert R.resample(outside, 5) == []                                # pre-open and after the close are not session bars


def test_merge_has_no_duplicates_takes_the_new_bar_and_keeps_30_days():
    now = at(D2, 12, 0)
    old = [[now - 31 * 86400, 1.0], [now - 600, 2.0], [now - 300, 3.0]]
    new = [[now - 300, 3.5], [now, 4.0]]
    assert R.merge(old, new, now) == [[now - 600, 2.0], [now - 300, 3.5], [now, 4.0]]


def test_daily_closes_add_todays_price_once():
    rows = [(D1 - timedelta(days=i), 100.0 + i) for i in range(60, 0, -1)] + [(D1, 101.0)]
    closes, added, day = R.daily_closes(rows, D2, 105.0)
    assert added and len(closes) == 62 and closes[-1] == 105.0 and day == D2
    rows_today = rows + [(D2, 104.0)]                                  # the daily row for today is stored: it is used, not the price on top of it
    closes, added, day = R.daily_closes(rows_today, D2, 105.0)
    assert not added and len(closes) == 62 and closes[-1] == 104.0 and day == D2


# ------------------------------------------------------------------------------------------------------------------ the grid

def _stored(closes_by_day):
    c = []
    for d, cl in closes_by_day.items():
        c += session(d, cl)
    return {"f": c[-1][0] + 60, "c": c}


def test_stock_row_and_grid_sector_averages_and_band_counts():
    now = datetime(2026, 11, 26, 15, 40, tzinfo=IST)
    up = _stored({D1: [100 + i for i in range(75)], D2: [175 + i for i in range(75)]})
    down = _stored({D1: [500 - i for i in range(75)], D2: [425 - i for i in range(75)]})
    daily = [(D1 - timedelta(days=i), 100.0 + (i % 3)) for i in range(80, 0, -1)]
    a = R.stock_row({"sym": "AAA", "name": "Aaa Ltd", "sector": "Banks"}, up, daily, now)
    b = R.stock_row({"sym": "BBB", "name": "Bbb Ltd", "sector": "Banks"}, down, [], now)
    c = R.stock_row({"sym": "CCC", "name": "Ccc Ltd", "sector": None}, None, [], now)
    assert a["rsi"]["5m"] == 100.0 and a["band"]["5m"] == "overbought" and a["price"] == 249
    assert a["bars"] == {"5m": 150, "15m": 50, "1h": 14, "1D": 81}
    assert a["rsi"]["1h"] is None and "14 bars" in a["reason"]["1h"]
    assert a["rsi"]["1D"] is not None and a["barAt"]["1D"] == "2026-11-26" and not a["forming"]["1D"]     # after 15:30 the day is over
    assert a["lastBar"] == "2026-11-26T15:25:00+05:30" and not a["forming"]["5m"]
    assert b["rsi"]["5m"] == 0.0 and b["band"]["5m"] == "oversold" and b["rsi"]["1D"] is None
    assert c["sector"] == "Other" and c["price"] is None and "No 5-minute candles" in c["reason"]["5m"] and "No daily closes" in c["reason"]["1D"]
    g = R.grid([c, b, a], now)
    assert [r["sym"] for r in g["stocks"]] == ["AAA", "BBB", "CCC"]
    banks = next(s for s in g["sectors"] if s["sector"] == "Banks")
    assert banks["stocks"] == 2 and banks["avg"]["5m"] == 50.0 and banks["counted"]["5m"] == 2 and banks["band"]["5m"] == "middle"
    assert banks["avg"]["1h"] is None and banks["counted"]["1h"] == 0
    assert [s["sector"] for s in g["sectors"]] == ["Banks", "Other"]
    assert g["counts"]["5m"] == {"oversold": 1, "weak": 0, "middle": 0, "strong": 0, "overbought": 1, "none": 1}
    assert g["counts"]["1h"]["none"] == 3 and g["note"] == R.NOTE


def test_the_bar_still_forming_is_flagged():
    now = datetime(2026, 11, 26, 10, 2, tzinfo=IST)
    st = {"f": at(D2, 10, 2), "c": session(D1, [100.0] * 75) + session(D2, [100.0] * 10)}    # last bar 10:00, not over until 10:05
    r = R.stock_row({"sym": "X"}, st, [(D1 - timedelta(days=i), 100.0) for i in range(60, 0, -1)], now)
    assert r["forming"] == {"5m": True, "15m": True, "1h": True, "1D": True}
    assert r["barAt"]["1h"] == "2026-11-26T09:15:00+05:30"


def test_a_settled_session_makes_no_new_call_until_the_next_session():
    st = {"f": at(D2, 15, 46), "c": session(D2, [1.0] * 75)}
    assert R.settled(st, datetime(2026, 11, 26, 18, 0, tzinfo=IST))
    assert R.settled(st, datetime(2026, 11, 27, 9, 0, tzinfo=IST))                  # the 09:00 run of the next day
    assert not R.settled(st, datetime(2026, 11, 27, 9, 30, tzinfo=IST))
    assert not R.settled({**st, "f": at(D2, 15, 31)}, datetime(2026, 11, 26, 15, 45, tzinfo=IST))   # fetched just at the close: once more
    fri = date(2026, 11, 27)
    assert R.settled({"f": at(fri, 16, 0), "c": session(fri, [1.0] * 75)}, datetime(2026, 11, 30, 9, 0, tzinfo=IST))   # over the weekend
    assert R.fetch_from(st, datetime(2026, 11, 27, 10, 0, tzinfo=IST)) == datetime(2026, 11, 26, 15, 25, tzinfo=IST)
    assert R.fetch_from(None, datetime(2026, 11, 27, 10, 0, tzinfo=IST)) == datetime(2026, 10, 28, 0, 0, tzinfo=IST)


def test_nothing_in_the_answer_tells_anyone_to_trade():
    now = datetime(2026, 11, 26, 15, 40, tzinfo=IST)
    rows = [R.stock_row({"sym": "AAA", "name": "A", "sector": "Banks"}, _stored({D1: [100 + i for i in range(75)]}), [], now),
            R.stock_row({"sym": "BBB"}, None, [], now)]
    text = repr(R.grid(rows, now)).replace(R.NOTE, "").lower() + " ".join(R.BAND_LABEL.values())
    for word in ("buy ", "sell", "hold", "target", "best", "pick", "forecast", "signal", "reversal", "buy zone", "entry"):
        assert word not in text, word


# ------------------------------------------------------------------------------------------------------------------ the shared pacer

class FakeRedis:
    def __init__(self):
        self.kv = {}

    async def incr(self, k):
        self.kv[k] = int(self.kv.get(k, 0)) + 1
        return self.kv[k]

    async def expire(self, k, s):
        return True

    async def set(self, k, v, ex=None, nx=False):
        if nx and k in self.kv:
            return None
        self.kv[k] = v
        return True

    async def get(self, k):
        return self.kv.get(k)

    async def mget(self, ks):
        return [self.kv.get(k) for k in ks]


async def test_a_shared_slot_is_taken_only_when_the_second_is_unused():
    r = FakeRedis()
    assert await intraday.slot(r, now=1000.0) is None                  # a visitor's call
    assert await intraday.slot(r, now=1000.0, share=True) == "busy"    # the job steps aside in that second
    assert await intraday.slot(r, now=1000.0) is None                  # the visitor's second call still fits (2 a second)
    assert await intraday.slot(r, now=1001.0, share=True) is None      # an unused second: the job takes it
    assert await intraday.slot(r, now=1001.0, share=True) == "busy"    # and only once
    assert await intraday.slot(r, now=1001.0) is None                  # a visitor still has a call in it


# ------------------------------------------------------------------------------------------------------------------ the job

class FakeStore:
    def __init__(self, redis):
        self.redis = redis


class FakeClient:
    def __init__(self, fail=()):
        self.calls, self.fail = [], set(fail)

    async def intraday(self, sid, segment, interval, start, end):
        self.calls.append((sid, segment, interval, start, end))
        if sid in self.fail:
            raise DhanError("no answer")
        return [{"at": datetime(2026, 11, 26, 9, 15, tzinfo=IST) + timedelta(minutes=5 * i), "close": 200.0 + i} for i in range(3)]


def _universe(n):
    return {f"S{i:02d}": {"sym": f"S{i:02d}", "security_id": str(100 + i), "company": None, "name": f"S{i}", "sector": None} for i in range(n)}


async def test_the_job_paces_fetches_merges_and_stops_at_its_deadline_keeping_old_candles(monkeypatch):
    redis = FakeRedis()
    old = {"f": at(D1, 15, 40), "c": session(D1, [100.0] * 75)}
    for s in ("S00", "S01", "S02"):
        redis.kv[R.C5_KEY + s] = orjson.dumps({**old, "f": old["f"] + int(s[1:])})
    redis.kv[R.C5_KEY + "S02"] = orjson.dumps({"f": at(D1, 15, 42), "c": session(D1, [100.0] * 75) + session(D2, [150.0] * 3)})
    uni = _universe(3)

    async def universe(_s):
        return uni

    async def daily(_s, _c, _t):
        return {}
    shares = []

    async def slot(_r, now=None, share=False):
        shares.append(share)
        return None
    monkeypatch.setattr(R, "_universe", universe)
    monkeypatch.setattr(R, "_daily", daily)
    monkeypatch.setattr(intraday, "slot", slot)
    ticks = iter([0, 0, 1000, 1000])                                  # the deadline passes after the first stock
    client = FakeClient()
    now = datetime(2026, 11, 26, 9, 31, tzinfo=IST)
    out = await R.refresh(FakeStore(redis), client, now=now, max_minutes=6, clock=lambda: next(ticks))
    assert out["status"] == "ok" and out["fetched"] == 1 and out["stopped"] == "deadline" and out["left"] == 2
    assert shares == [True] and client.calls[0][:3] == ("100", "NSE_EQ", 5)                 # least recently fetched first, a shared slot
    assert client.calls[0][3] == datetime(2026, 11, 25, 15, 25, tzinfo=IST)               # from the last stored bar
    s0 = orjson.loads(redis.kv[R.C5_KEY + "S00"])
    assert len(s0["c"]) == 78 and [c[0] for c in s0["c"]] == sorted({c[0] for c in s0["c"]})   # 75 old + 3 new, no duplicate
    s1 = orjson.loads(redis.kv[R.C5_KEY + "S01"])
    assert s1["f"] == old["f"] + 1 and len(s1["c"]) == 75                                   # not reached: kept as it was
    snap = orjson.loads(redis.kv[R.LATEST_KEY])
    assert {r["sym"]: r["bars"]["5m"] for r in snap["stocks"]} == {"S00": 78, "S01": 75, "S02": 78}
    # the next run starts with the stocks fetched longest ago; one failing stock is skipped, the others go on
    client2 = FakeClient(fail={"101"})
    out = await R.refresh(FakeStore(redis), client2, now=now, max_minutes=6, clock=lambda: 0)
    assert [c[0] for c in client2.calls] == ["101", "102", "100"] and out["fetched"] == 2 and out["failed"] == 1


async def test_the_job_stops_when_the_days_allowance_is_used(monkeypatch):
    redis = FakeRedis()

    async def universe(_s):
        return _universe(2)

    async def daily(_s, _c, _t):
        return {}

    async def slot(_r, now=None, share=False):
        return "budget"
    monkeypatch.setattr(R, "_universe", universe)
    monkeypatch.setattr(R, "_daily", daily)
    monkeypatch.setattr(intraday, "slot", slot)
    client = FakeClient()
    out = await R.refresh(FakeStore(redis), client, now=datetime(2026, 11, 26, 10, 0, tzinfo=IST))
    assert client.calls == [] and out["stopped"] == "budget" and R.LATEST_KEY in redis.kv


def test_the_job_is_scheduled_paced_and_declares_its_limit():
    job = {j.name: j for j in build_jobs({"DHAN_CLIENT_ID": "x"})}["lab-rsi"]
    assert job.args == ("refresh-lab-rsi", "--max-minutes", "6") and job.max_runtime_min == 9
    assert job.interval_min == 15 and job.interval_market and job.daily_at == (15, 45) and job.gate.var == "DHAN_CLIENT_ID"
    assert LIMIT_POLICY["lab-rsi"].startswith("deadline: ") and "90,000" in LIMIT_POLICY["lab-rsi"]


# ------------------------------------------------------------------------------------------------------------------ the database and the route

@pg
async def test_daily_closes_come_from_price_daily(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO companies (symbol, name, nse_code) VALUES ('RSITEST', 'Rsi Test Ltd', 'RSITEST') ON CONFLICT DO NOTHING")
        await conn.executemany("INSERT INTO price_daily (symbol, day, close) VALUES ($1, $2, $3)",
                               [("RSITEST", D2 - timedelta(days=i), 100 + i) for i in range(70, -1, -1)])
        await conn.execute("DELETE FROM dhan_instruments")
        await conn.execute("INSERT INTO dhan_instruments (exch, security_id, symbol, name, fno) VALUES ('NSE', '901', 'RSITEST', 'RSI TEST', true), "
                           "('NSE', '902', 'NOSECTOR', 'No Sector', true), ('NSE', '903', 'CASHONLY', 'Cash', false), ('NSE', '904', '123NSETEST', 'T', true)")
    uni = await R._universe(store)
    assert sorted(uni) == ["NOSECTOR", "RSITEST"] and uni["RSITEST"]["company"] == "RSITEST" and uni["RSITEST"]["name"] == "Rsi Test Ltd"
    assert uni["NOSECTOR"]["company"] is None
    got = await R._daily(store, ["RSITEST"], D2)
    assert len(got["RSITEST"]) == 71 and got["RSITEST"][-1] == (D2, 100.0) and got["RSITEST"][0][0] == D2 - timedelta(days=70)
    row = R.stock_row({"sym": "RSITEST"}, {"f": at(D2, 15, 40), "c": session(D2, [99.0] * 75)}, got["RSITEST"], datetime(2026, 11, 26, 16, 0, tzinfo=IST))
    assert row["bars"]["1D"] == 71 and row["rsi"]["1D"] is not None                        # today's stored close, not today's price on top of it


@pg
async def test_the_route_is_for_lab_members_only(app):  # noqa: F811
    from test_auth import new_client
    async with new_client(app) as anon:
        assert (await anon.get("/api/lab/rsi")).status_code == 401
    member = await signed_in(app, "rsi-member@example.com", plan="gold")
    assert (await member.get("/api/lab/rsi")).status_code == 403
    admin = await admin_with_mfa(app, "rsi-boss@example.com")
    r = await admin.get("/api/lab/rsi")
    assert r.status_code == 200 and r.json()["ready"] is False and r.headers["cache-control"] == "no-store"
    now = datetime.now(IST)
    snap = R.grid([R.stock_row({"sym": "AAA", "sector": "Banks"}, _stored({D1: [100 + i for i in range(75)]}), [], now)], now)
    await app.state.store.redis.set(R.LATEST_KEY, orjson.dumps(snap))
    body = (await admin.get("/api/lab/rsi")).json()
    assert body["ready"] and body["asOf"] == snap["takenAt"] and body["stale"] is False and body["stocks"][0]["sym"] == "AAA"
    old = {**snap, "takenAt": (now - timedelta(days=5)).isoformat()}
    await app.state.store.redis.set(R.LATEST_KEY, orjson.dumps(old))
    assert (await admin.get("/api/lab/rsi")).json()["stale"] is True
