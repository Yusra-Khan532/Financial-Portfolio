"""Trading Lab > Time Machine (lab/timemachine.py): a plan replayed 10,000 times by a stratified block bootstrap of the stock's own past 5-minute
bars, plus the same rule on every past session. Pure and seeded (the same plan on the same candles gives the same answer), no look-ahead, and
describe-only wording."""
import math
import random
import time
from datetime import date, datetime, timedelta

import pytest

from finlit.dhan import IST
from finlit.lab import timemachine as T
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration


def weekdays_before(d: date, n: int):
    out, x = [], d - timedelta(days=1)
    while len(out) < n:
        if x.weekday() < 5:
            out.append(x)
        x -= timedelta(days=1)
    return sorted(out)


def bars(day: date, step=lambda i, p: p, start=100.0, wide=0.0, skip=()):
    """75 bars of one session: each close is step(i, previous close); high and low `wide` (a share) around the open and close."""
    rows, p = [], start
    for i in range(75):
        c = step(i, p)
        if i not in skip:
            at = datetime(day.year, day.month, day.day, 9, 15, tzinfo=IST) + timedelta(minutes=5 * i)
            rows.append((at, p, max(p, c) * (1 + wide), min(p, c) * (1 - wide), c))
        p = c
    return rows


def store_of(days, **kw):
    rows = []
    for d in days:
        rows += bars(d, **kw)
    return T.sessions_of(rows)


D = date(2026, 11, 26)
PLAN = T.Plan("TEST", D, 9 * 60 + 15, 15 * 60 + 15, 100.0, 99.0, 101.0)


def noisy(days, seed=7):
    rnd = random.Random(seed)
    rows, p = [], 100.0
    for d in days:
        for i in range(75):
            at = datetime(d.year, d.month, d.day, 9, 15, tzinfo=IST) + timedelta(minutes=5 * i)
            c = p * math.exp(rnd.gauss(0, 0.003))
            rows.append((at, p, max(p, c) * (1 + abs(rnd.gauss(0, 0.001))), min(p, c) * (1 - abs(rnd.gauss(0, 0.001))), c))
            p = c
    return rows


# ------------------------------------------------------------------------------------------------------------------ the method

def test_the_same_seed_gives_the_same_answer_and_another_seed_another():
    S = T.sessions_of(noisy(weekdays_before(D, 40)))
    sample, dropped = T.history(S, D)
    a, b = T.run(PLAN, sample, dropped, 42), T.run(PLAN, sample, dropped, 42)
    assert a == b
    assert T.run(PLAN, sample, dropped, 43)["outcomes"] != a["outcomes"]
    s1, h1 = T.seed_of(PLAN, sample[-1].last_at)
    s2, h2 = T.seed_of(PLAN, sample[-1].last_at)
    assert s1 == s2 and h1 == h2 and 0 <= s1 < 2 ** 64
    assert T.seed_of(PLAN, sample[-1].last_at + 300)[0] != s1                       # a newer stored bar: a new seed
    assert T.seed_of(T.Plan("TEST", D, 555, 915, 100.0, 99.0, 101.05), sample[-1].last_at)[0] != s1


def test_a_flat_stock_reaches_neither_level_in_all_10000_replays():
    S = store_of(weekdays_before(D, 30))
    sample, _ = T.history(S, D)
    out = T.run(PLAN, sample, 0, 1)
    assert out["outcomes"] == {"upper": 0, "lower": 0, "both": 0, "neither": 10_000}
    assert out["past"]["totals"] == {"upper": 0, "lower": 0, "both": 0, "neither": 30, "sessions": 30}
    assert out["medianBars"]["any"] is None and out["histogram"]["median"] == 100.0
    assert sum(out["histogram"]["counts"]) == 10_000 and len(out["histogram"]["counts"]) == 40 and len(out["histogram"]["edges"]) == 41


def test_a_stock_that_rises_every_bar_reaches_the_upper_level_first():
    S = store_of(weekdays_before(D, 25), step=lambda i, p: p * 1.001)
    sample, _ = T.history(S, D)
    out = T.run(PLAN, sample, 0, 5)
    assert out["outcomes"]["upper"] == 10_000
    assert out["medianBars"]["any"] == 10.0 and out["medianBars"]["upper"] == 10.0        # 1.001^10 > 1.01 > 1.001^9
    past = out["past"]
    assert past["totals"]["upper"] == 25 and all(r["outcome"] == "upper" and r["touchAt"] == "10:00" for r in past["rows"])
    assert out["fan"]["p50"][0] == 100.0 and out["fan"]["p50"][-1] > 100.0 and out["fan"]["times"][0] == "09:15" and out["fan"]["times"][-1] == "15:15"


def test_a_bar_that_reaches_both_levels_is_both_in_one_bar():
    S = store_of(weekdays_before(D, 25), wide=0.02)                                   # every bar's high and low are 2% away
    sample, _ = T.history(S, D)
    out = T.run(PLAN, sample, 0, 5)
    assert out["outcomes"]["both"] == 10_000 and out["medianBars"]["any"] == 1.0
    assert out["past"]["totals"]["both"] == 25 and out["past"]["rows"][0]["touchAt"] == "09:15"
    assert out["text"]["labels"]["both"] == "Both in one bar (order unknown)" and out["text"]["labels"]["neither"] == "Neither by 15:15"


def test_the_fan_percentiles_are_ordered_and_start_at_the_start_price():
    S = T.sessions_of(noisy(weekdays_before(D, 50)))
    sample, _ = T.history(S, D)
    plan = T.Plan("TEST", D, 10 * 60, 14 * 60 + 30, 250.0, 245.0, 255.0)
    fan = T.run(plan, sample, 0, 9)["fan"]
    assert len(fan["times"]) == 54 + 1 and fan["times"][0] == "10:00" and fan["times"][-1] == "14:30"
    for i in range(len(fan["times"])):
        assert fan["p5"][i] <= fan["p25"][i] <= fan["p50"][i] <= fan["p75"][i] <= fan["p95"][i]
    assert fan["p5"][0] == fan["p95"][0] == 250.0 and fan["p95"][-1] > fan["p5"][-1]


def test_blocks_of_30_minutes_come_from_one_session_at_the_same_time_of_day():
    days = weekdays_before(D, 20)
    rows = []
    for k, d in enumerate(days):                                                       # each session rises by its own step all day
        rows += bars(d, step=lambda i, p, k=k: p * (1 + 0.0001 * (k + 1)))
    sample, _ = T.history(T.sessions_of(rows), D)
    plan = T.Plan("TEST", D, 555, 555 + 30, 100.0, 90.0, 110.0)                         # one block of 6 bars
    out = T.run(plan, sample, 0, 3, n=2000)
    ends = {round(v, 4) for v in [100 * (1 + 0.0001 * (k + 1)) ** 6 for k in range(20)]}
    lo, hi = out["histogram"]["edges"][0], out["histogram"]["edges"][-1]
    assert min(ends) == pytest.approx(lo, abs=0.01) and max(ends) == pytest.approx(hi, abs=0.01)   # only whole-session blocks: no mixing inside a block


def test_no_look_ahead_candles_on_or_after_the_date_change_nothing():
    before = noisy(weekdays_before(D, 40))
    after = []
    for d in (D, D + timedelta(days=1), D + timedelta(days=4)):
        after += bars(d, step=lambda i, p: p * 1.01)
    a_sample, a_drop = T.history(T.sessions_of(before), D)
    b_sample, b_drop = T.history(T.sessions_of(before + after), D)
    assert [s.day for s in a_sample] == [s.day for s in b_sample] and a_sample[-1].day < D
    sa, sb = T.seed_of(PLAN, a_sample[-1].last_at)[0], T.seed_of(PLAN, b_sample[-1].last_at)[0]
    assert sa == sb
    assert T.run(PLAN, a_sample, a_drop, sa) == T.run(PLAN, b_sample, b_drop, sb)


def test_the_sample_short_sessions_corporate_actions_and_the_60_cap():
    days = weekdays_before(D, 70)
    rows = []
    for k, d in enumerate(days):
        start = 50.0 if k >= 30 else 100.0                                             # a 1:2 split before session 30
        rows += bars(d, start=start, skip=range(6) if k == 10 else ())                  # session 10 has only 69 bars
    S = T.sessions_of(rows)
    assert S[10].bars == 69 and S[10].o[0] == S[10].c[0] == 100.0                      # a missing bar is flat at the close before it
    sample, dropped = T.history(S, D)
    assert dropped == 1 and len(sample) == 60 and days[30] not in [s.day for s in sample] and days[10] not in [s.day for s in sample]
    assert sample[-1].day == days[-1]


def test_10000_replays_finish_in_under_300_ms():
    S = T.sessions_of(noisy(weekdays_before(D, 60)))
    sample, dropped = T.history(S, D)
    T.run(PLAN, sample, dropped, 1)                                                    # numpy loaded
    plan = T.Plan("TEST", D, 555, 930, 100.0, 98.0, 102.0)                              # the whole session: 75 bars
    best = min(_timed(lambda: T.run(plan, sample, dropped, 11)) for _ in range(3))
    print(f"10,000 replays of 75 bars on 60 sessions: {best * 1000:.0f} ms")
    assert best < 0.3


def _timed(f):
    t = time.perf_counter()
    f()
    return time.perf_counter() - t


# ------------------------------------------------------------------------------------------------------------------ the checks

def body(**kw):
    b = {"symbol": "TEST", "date": "2026-11-27", "start": "09:15", "flatBy": "15:15", "price": 100, "lower": 99, "upper": 101}
    b.update(kw)
    return T.PlanIn.model_validate(b)


TODAY = date(2026, 11, 26)


def test_a_good_plan_is_rounded_to_the_price_step():
    p = T.parse(body(price=100.02, lower=99.03, upper=101.08, start=None), TODAY)
    assert (p.price, p.lower, p.upper, p.t0, p.flat) == (100.0, 99.05, 101.1, 555, 915)


@pytest.mark.parametrize("kw, field", [
    ({"symbol": "a b"}, "symbol"),
    ({"date": "2026-13-01"}, "date"),
    ({"date": "2026-11-28"}, "date"),                       # a Saturday
    ({"date": "2026-12-07"}, "date"),                       # more than 7 days ahead
    ({"start": "09:10"}, "start"),
    ({"start": "09:17"}, "start"),
    ({"start": "9:15"}, "start"),
    ({"flatBy": "15:17"}, "flatBy"),
    ({"flatBy": "09:15"}, "flatBy"),                        # not after the start
    ({"flatBy": "15:35"}, "flatBy"),
    ({"price": 0}, "price"),
    ({"price": float("nan")}, "price"),
    ({"lower": 100.5}, "lower"),                            # above the start price
    ({"upper": 99.5}, "upper"),
    ({"lower": 99.95}, "lower"),                            # 0.05% away: closer than 0.1%
    ({"upper": 121}, "upper"),                              # 21% away
])
def test_a_faulty_plan_names_its_field(kw, field):
    with pytest.raises(T.Invalid) as e:
        T.parse(body(**kw), TODAY)
    assert e.value.field == field and e.value.detail


def test_the_edges_are_allowed():
    assert T.parse(body(date="2026-12-03", start="15:20", flatBy="15:30", lower=80, upper=120), TODAY).flat == 930
    assert T.parse(body(lower=99.9, upper=100.1), TODAY).lower == 99.9


BANNED = ("likely", "probable", "probability", "best", "target", "buy", "sell", "should", "forecast", "signal", "recommend", "odds", "chance")


def test_nothing_in_the_answer_tells_anyone_what_to_do():
    S = T.sessions_of(noisy(weekdays_before(D, 30)))
    sample, dropped = T.history(S, D)
    out = T.run(PLAN, sample, dropped, 3)
    text = (repr(out) + T.FILL_NOTE + T.METHOD).replace(T.NOTE, "").lower()
    for w in BANNED:
        assert w not in text, w
    assert out["text"]["note"] == "Describes how the stock moved in the past; not a forecast or a recommendation."
    for e in ("Choose an NSE F&O stock.",):
        assert not any(w in e.lower() for w in BANNED)


def test_numpy_is_not_loaded_by_importing_the_module():
    import subprocess
    import sys
    code = "import sys, finlit.api, finlit.lab.timemachine; print('numpy' in sys.modules)"
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)   # nosec B603 - fixed arguments
    assert out.stdout.strip() == "False"


# ------------------------------------------------------------------------------------------------------------------ the route

SID = "990011"


async def _seed_db(app, days, sym="TMTEST", step=None):  # noqa: F811
    rows = []
    for d in days:
        rows += bars(d, step=step or (lambda i, p: p * (1.0005 if i % 2 else 0.9996)))
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM dhan_instruments")
        await conn.execute("DELETE FROM candles_5m")
        await conn.execute("INSERT INTO dhan_instruments (exch, security_id, symbol, name, fno) VALUES ('NSE', $1, $2, 'Tm Test', true), "
                           "('NSE', '990012', 'TMEMPTY', 'Empty', true)", SID, sym)
        await conn.executemany("INSERT INTO candles_5m (security_id, at, open, high, low, close, volume) VALUES ($1, $2, $3, $4, $5, $6, 100)",
                               [(SID, *r) for r in rows])


def next_weekday(d: date) -> date:
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def plan_json(**kw):
    today = datetime.now(IST).date()
    b = {"symbol": "TMTEST", "date": next_weekday(today).isoformat(), "start": "09:15", "flatBy": "15:15", "price": 100, "lower": 99, "upper": 101}
    b.update(kw)
    return b


@pg
async def test_the_route_replays_caches_and_never_looks_ahead(app):  # noqa: F811
    from test_auth import new_client
    today = datetime.now(IST).date()
    D0 = next_weekday(today)
    days = weekdays_before(D0, 30)
    await _seed_db(app, days)
    async with new_client(app) as anon:
        assert (await anon.post("/api/lab/timemachine", json=plan_json(), headers={"Origin": "http://test"})).status_code == 401
    member = await signed_in(app, "tm-member@example.com", plan="gold")
    assert (await member.post("/api/lab/timemachine", json=plan_json())).status_code == 403
    admin = await admin_with_mfa(app, "tm-boss@example.com")
    r = await admin.post("/api/lab/timemachine", json=plan_json())
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    a = r.json()
    assert a["status"] == "ok" and a["cached"] is False and a["version"] == T.VERSION and a["seed"].isdigit()
    assert a["sample"] == {"sessions": 30, "from": days[0].isoformat(), "to": days[-1].isoformat(), "dropped": 0, "replays": 10_000,
                           "blockMinutes": 30, "barMinutes": 5}
    assert sum(a["outcomes"].values()) == 10_000 and a["past"]["totals"]["sessions"] == 30 and len(a["past"]["rows"]) == 30
    assert a["plan"]["lowerPct"] == -1.0 and a["plan"]["upperPct"] == 1.0 and a["name"] == "Tm Test"
    again = (await admin.post("/api/lab/timemachine", json=plan_json())).json()
    assert again["cached"] is True and again["seed"] == a["seed"] and again["outcomes"] == a["outcomes"]
    # candles on and after the date change nothing (a later session is stored: same seed, same counts)
    async with app.state.store.pool.acquire() as conn:
        await conn.executemany("INSERT INTO candles_5m (security_id, at, open, high, low, close) VALUES ($1, $2, $3, $4, $5, $6)",
                               [(SID, *x) for x in bars(D0, step=lambda i, p: p * 1.01)])
    await app.state.store.redis.flushdb()
    admin = await admin_with_mfa(app, "tm-boss2@example.com")
    fresh = (await admin.post("/api/lab/timemachine", json=plan_json())).json()
    assert fresh["cached"] is False and fresh["seed"] == a["seed"] and fresh["outcomes"] == a["outcomes"] and fresh["past"] == a["past"]


@pg
async def test_the_route_states_invalid_not_listed_and_no_history(app):  # noqa: F811
    today = datetime.now(IST).date()
    D0 = next_weekday(today)
    days = weekdays_before(D0, 25)
    await _seed_db(app, days)
    admin = await admin_with_mfa(app, "tm-check@example.com")
    post = lambda **kw: admin.post("/api/lab/timemachine", json=plan_json(**kw))   # noqa: E731
    r = await post(lower=100.5)
    assert r.status_code == 422 and r.json() == {"status": "invalid", "field": "lower", "detail": "The lower level is below the start price."}
    r = await post(price="abc")
    assert r.status_code == 422 and r.json()["field"] == "price"
    r = await post(date=days[10].isoformat())
    assert r.status_code == 422 and r.json()["field"] == "date" and days[19].isoformat() in r.json()["detail"]
    r = await post(symbol="NOTFNO")
    assert r.status_code == 404 and r.json()["status"] == "not_listed"
    r = await post(symbol="TMEMPTY")
    assert r.status_code == 200 and r.json()["status"] == "no_history" and r.json()["sessions"] == 0
    assert "The 60-session store fills after the close each weekday." in r.json()["detail"]
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM candles_5m WHERE security_id = $1 AND at >= $2", SID,
                           datetime(days[19].year, days[19].month, days[19].day, tzinfo=IST))
    r = await post()
    assert r.status_code == 200 and r.json()["status"] == "no_history" and r.json()["sessions"] == 19 and r.json()["needed"] == 20


@pg
async def test_the_route_limits_new_replays_and_waits_for_a_busy_machine(app, monkeypatch):  # noqa: F811
    today = datetime.now(IST).date()
    await _seed_db(app, weekdays_before(next_weekday(today), 22))
    admin = await admin_with_mfa(app, "tm-limit@example.com")
    monkeypatch.setattr(T, "PER_MINUTE", 3)
    for k in range(3):
        assert (await admin.post("/api/lab/timemachine", json=plan_json(upper=101 + k / 10))).status_code == 200
    assert (await admin.post("/api/lab/timemachine", json=plan_json(upper=101))).json()["cached"] is True       # a cached plan is not counted
    r = await admin.post("/api/lab/timemachine", json=plan_json(upper=102))
    assert r.status_code == 429 and r.json()["status"] == "rate_limited" and int(r.headers["retry-after"]) >= 1
    await app.state.store.redis.flushdb()
    admin = await admin_with_mfa(app, "tm-busy@example.com")
    monkeypatch.setattr(T, "WAIT_S", 0.1)
    monkeypatch.setattr(T, "_lock", None)                                              # a semaphore of this test's event loop
    sem = T._sem()
    await sem.acquire()
    try:
        r = await admin.post("/api/lab/timemachine", json=plan_json(upper=103))
    finally:
        sem.release()
    assert r.status_code == 429 and r.json()["status"] == "busy" and r.headers["retry-after"] == "5"
    assert (await admin.post("/api/lab/timemachine", json=plan_json(upper=103))).status_code == 200
