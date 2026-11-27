"""Trading Lab > Setup scanner (finlit/lab/scanner.py; docs/TRADING-LAB.md "Setup scanner").

What must hold: a stock is listed under a rule exactly when that rule's trigger (the backtest's own function) fires on the stock's latest bar,
using no bar after it; each match carries the rule's lower exit level, its distance, volume against the average and the rule's past results on
the stock, equal to what the Strategy backtest shows; stocks with too little history or no bar on the latest session are skipped and counted;
the scan reads the stocks in batches; a scan that reaches its own deadline keeps what it checked and says "stopped early after N of M"; "new
today" comes from the stored previous session; the route is for Lab members only and never cached; the job is registered after the candle jobs
with its own deadline under its limit; nothing shown tells anyone to trade."""
import ast
import math
import re
from datetime import date, datetime, timedelta, timezone

import numpy as np
import orjson
import pytest

from finlit.jobs import probes
from finlit.jobs.due import Ctx, JobState, evaluate
from finlit.jobs.registry import LIMIT_POLICY, by_name, limit_policy
from finlit.lab import backtest as B
from finlit.lab import scanner as S
from jobs_fakes import ist
from test_auth import app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa
from test_lab_backtest import BANNED, F, _random, bar, base, days

pg = pytest.mark.integration
RULE_IDS = [r["id"] for r in B.RULES]


def ids(res):
    return {m["rule"] for m in res["matches"]}


def cut(b, k):
    return {key: v[:k + 1] for key, v in b.items()}


def long_series(n=1500, seed=7):
    """The backtest's own long random series on which every one of the 23 rules fires somewhere."""
    rng = np.random.default_rng(seed)
    c = 1000 * np.exp(np.cumsum(rng.normal(0.0009, 0.02, n)))
    o = c * (1 + rng.normal(0, 0.01, n))
    v = rng.integers(100_000, 1_000_000, n).astype(float)
    v[rng.integers(0, n, 60)] *= 4
    for k in range(300, n, 97):
        o[k], c[k], v[k] = c[k - 1] * 1.05, c[k - 1] * 1.06, 4e6
    return {"t": days(n), "o": list(o), "h": list(np.maximum(o, c) * (1 + abs(rng.normal(0, 0.01, n)))),
            "l": list(np.minimum(o, c) * (1 - abs(rng.normal(0, 0.01, n)))), "c": list(c), "v": list(v)}


# ------------------------------------------------------------------------------------------------------------------ one stock
def test_each_rule_is_listed_exactly_when_its_trigger_fires_on_the_latest_bar():
    b = long_series()
    nifty = {t: 20000.0 for t in b["t"]}
    f = F(b, nifty)
    for rid in RULE_IDS:
        sig = np.asarray(B.SIGNALS[rid](f)[0], bool)
        on = [int(i) for i in np.nonzero(sig)[0] if i >= 300][:3]
        off = [int(i) for i in np.nonzero(~sig)[0] if i >= 300][:3]
        assert on, rid
        for k in on:
            assert rid in ids(S.scan_bars(cut(b, k), nifty)), (rid, k)
        for k in off:
            assert rid not in ids(S.scan_bars(cut(b, k), nifty)), (rid, k)


def test_the_backtests_pattern_series_match_on_their_latest_bar_and_not_without_the_pattern():
    b = base()
    bar(b, -1, c=max(b["h"][-60:-1]) * 1.03)
    assert {"breakout20", "breakout55"} <= ids(S.scan_bars(b))
    b = base()
    bar(b, -1, c=max(b["h"][-260:-1]) * 1.03, v=3e6)
    assert "high52" in ids(S.scan_bars(b))
    b["v"][-1] = 1.2e6
    assert "high52" not in ids(S.scan_bars(b))                   # the volume part of the rule
    b = base()
    for k in (-3, -2, -1):
        bar(b, k, o=b["c"][k - 1], c=b["c"][k - 1] * 0.985)
    assert {"rsi2", "down3"} <= ids(S.scan_bars(b))
    calm = S.scan_bars(base())
    assert not {"high52", "rsi2", "down3", "bblow", "gapgo"} & ids(calm)


def test_no_look_ahead_the_latest_bar_answer_is_the_backtests_answer_at_that_bar():
    b = _random(n=900)
    nifty = {t: 20000 + i for i, t in enumerate(b["t"])}
    full = F(b, nifty)
    for k in (420, 600, 750, 899):
        res = S.scan_bars(cut(b, k), nifty)
        assert res["day"] == b["t"][k] and res["bars"] == k + 1 and res["close"] == round(b["c"][k], 2)
        for rid in RULE_IDS:
            s, lo = (np.asarray(x) for x in B.SIGNALS[rid](full))
            assert (rid in ids(res)) == bool(s[k]), (rid, k)                 # later bars never change the answer at k
            m = next((x for x in res["matches"] if x["rule"] == rid), None)
            if m and math.isfinite(float(lo[k])):
                assert m["lower"] == round(float(lo[k]), 2)


def test_a_match_carries_its_lower_exit_level_distance_volume_and_the_backtests_past_results():
    b = long_series()
    nifty = {t: 20000.0 for t in b["t"]}
    f = F(b, nifty)
    rid = "rsi2"
    k = int([i for i in np.nonzero(np.asarray(B.SIGNALS[rid](f)[0], bool))[0] if i > 1000][0])
    part = cut(b, k)
    res = S.scan_bars(part, nifty)
    m = next(x for x in res["matches"] if x["rule"] == rid)
    lo = float(np.asarray(B.SIGNALS[rid](f)[1])[k])
    assert m["lower"] == round(lo, 2) and m["distPct"] == round((part["c"][-1] - round(lo, 2)) / part["c"][-1] * 100, 2)
    pf = F(part, nifty)
    assert res["volRatio"] == round(part["v"][-1] / pf["vavg"][-1], 2) and res["volAvg"] == round(pf["vavg"][-1])
    full = B.backtest(part, nifty)                                          # the Strategy backtest on the same bars, its default exit, net
    want = next(r for r in full["rules"] if r["id"] == rid)["exits"][B.DEFAULT_EXIT]
    assert m["past"]["trades"] == want["net"]["trades"] and m["past"]["winRate"] == want["net"]["winRate"]
    assert m["past"]["avgR"] == want["net"]["avgR"] and m["past"]["few"] == want["net"]["few"] and m["past"]["running"] == want["running"]
    assert len(res["spark"]) == S.SPARK and res["spark"][-1] == round(part["c"][-1], 2)


def test_rule_23_is_never_listed_without_nifty_and_a_split_is_flagged():
    b = base(n=420, g=1.006, wiggle=0.0)
    fe = F(b)
    bar(b, -2, o=b["c"][-3], c=fe["ema10"][-3] * 0.99)
    bar(b, -1, o=b["c"][-2], c=b["c"][-3] * 1.01)
    assert "rsleader" in ids(S.scan_bars(b, {t: 20000.0 for t in b["t"]}))
    assert "rsleader" not in ids(S.scan_bars(b, None))
    j = base()
    for k in range(-4, 0):                                                  # a 40% one-day move three sessions ago
        for key in "ohlc":
            j[key][k] *= 1.4
    bar(j, -1, c=max(j["h"][-60:-1]) * 1.03)
    res = S.scan_bars(j)
    assert res["matches"] and all("big_move" in m["flags"] for m in res["matches"])
    assert all(m["flags"] == [] for m in S.scan_bars(base())["matches"])


# ------------------------------------------------------------------------------------------------------------------ "new today"
def _result(day, by_rule, not_reached=()):
    return {"barsDate": day, "notReachedSymbols": list(not_reached),
            "rules": [{"id": rid, "matches": [{"symbol": s} for s in by_rule.get(rid, [])]} for rid in RULE_IDS]}


def _flag(res, rid, sym):
    return next(m for r in res["rules"] if r["id"] == rid for m in r["matches"] if m["symbol"] == sym)


def test_new_today_comes_from_the_stored_previous_session_and_unknown_is_said_as_unknown():
    first = _result("2026-11-24", {"rsi2": ["AAA", "BBB"]}, not_reached=["ZZZ"])
    hist = S.mark_new(first, [])
    assert _flag(first, "rsi2", "AAA")["new"] is None and first["previousDate"] is None     # nothing stored before: not guessed
    second = _result("2026-11-25", {"rsi2": ["AAA", "CCC", "ZZZ"], "down3": ["BBB"]})
    hist = S.mark_new(second, hist)
    assert _flag(second, "rsi2", "AAA")["new"] is False and _flag(second, "rsi2", "AAA")["streak"] == 2
    assert _flag(second, "rsi2", "CCC")["new"] is True and _flag(second, "rsi2", "CCC")["streak"] == 1
    assert _flag(second, "down3", "BBB")["new"] is True                    # matched another rule yesterday: new for this one
    assert _flag(second, "rsi2", "ZZZ")["new"] is None                     # not reached by the previous scan: unknown
    assert second["previousDate"] == "2026-11-24" and [h["day"] for h in hist] == ["2026-11-25", "2026-11-24"]
    again = _result("2026-11-25", {"rsi2": ["AAA"]})                       # a second scan of the same session replaces it
    hist = S.mark_new(again, hist)
    assert [h["day"] for h in hist] == ["2026-11-25", "2026-11-24"] and _flag(again, "rsi2", "AAA")["new"] is False
    third = _result("2026-11-26", {"rsi2": ["AAA"]})
    S.mark_new(third, hist)
    assert _flag(third, "rsi2", "AAA")["streak"] == 3


def test_the_history_keeps_the_last_20_sessions():
    hist = []
    for k in range(30):
        hist = S.mark_new(_result((date(2026, 10, 1) + timedelta(days=k)).isoformat(), {"rsi2": ["AAA"]}), hist)
    assert len(hist) == S.KEEP_SESSIONS == 20 and hist[0]["day"] == "2026-10-30"


# ------------------------------------------------------------------------------------------------------------------ wording
def test_nothing_shown_or_written_in_the_module_tells_anyone_to_trade():
    b = long_series()
    res = S.scan_bars(b, {t: 20000.0 for t in b["t"]})
    shown = list(S.words(S.answer(None))) + list(S.words(S.FLAG_TEXT)) + list(S.words(res)) + [S.NOTE]
    assert S.NOTE == "Stocks whose latest daily bar matches each fixed rule's conditions; not a recommendation."
    text = " | ".join(x for x in shown if x != S.NOTE)
    assert not BANNED.search(text), BANNED.search(text)
    src = open(S.__file__).read()
    strings = [n.value for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Constant) and isinstance(n.value, str)]
    hits = [s for s in strings if s != S.NOTE and not re.fullmatch(r"\w+", s) and BANNED.search(s)]   # a bare word is a field name, not text
    assert not hits, [BANNED.search(h).group(0) for h in hits]


def test_the_api_process_does_not_load_numpy_or_pandas_for_this_module():
    import subprocess
    import sys
    code = "import sys, finlit.lab.scanner; print('numpy' in sys.modules or 'pandas' in sys.modules)"
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)   # nosec B603 - fixed arguments
    assert out.stdout.strip() == "False"


# ------------------------------------------------------------------------------------------------------------------ the job
ENV = {"FUND_LOADS_ENABLED": "1", "DHAN_CLIENT_ID": "x"}
WED = (2026, 11, 25)


def test_the_job_runs_after_the_candle_jobs_inside_its_own_deadline():
    j = by_name(ENV)["lab-scanner"]
    assert j.command == "refresh-lab-scanner --max-minutes 12" and j.cls == "bulk" and j.prerequisites == ("eod-candles", "candles")
    minutes = float(j.args[j.args.index("--max-minutes") + 1])
    assert j.max_runtime_min - minutes >= 3 and limit_policy(j).startswith("deadline: ") and "lab-scanner" in LIMIT_POLICY
    jobs = by_name(ENV)
    assert jobs["candles"].priority < jobs["price-sections"].priority < j.priority < jobs["ingest"].priority    # right after the candles and charts
    assert j.weight_mb <= 300 and j.probe == "lab-scanner" and j.day_rule(date(*WED)) and not j.day_rule(date(2026, 11, 28))
    assert [(w.window, w.not_before) for w in j.windows] == [("AFTER_CLOSE", (19, 40)), ("MORNING", None)] and j.sla.kind == "session"
    from finlit import worker
    worker.build_parser().parse_args(list(j.args))


def test_the_job_is_due_on_a_weekday_evening_and_not_before_the_candles_are_stored():
    j = by_name(ENV)["lab-scanner"]
    st = JobState(job="lab-scanner", first_seen_at=ist(2026, 11, 1), last_success_at=ist(2026, 11, 24, 19, 45), last_attempt_at=ist(2026, 11, 24, 19, 45))
    assert not evaluate(j, st, Ctx(now=ist(*WED, 19, 30), env=ENV, probes={"lab-scanner": False})).due          # before 19:40
    assert evaluate(j, st, Ctx(now=ist(*WED, 19, 45), env=ENV, probes={})).due                                 # the evening run
    done = JobState(job="lab-scanner", first_seen_at=ist(2026, 11, 1), last_success_at=ist(*WED, 19, 50), last_attempt_at=ist(*WED, 19, 50))
    assert not evaluate(j, done, Ctx(now=ist(*WED, 20, 30), env=ENV, probes={"lab-scanner": False})).due        # once a session
    assert evaluate(j, done, Ctx(now=ist(2026, 11, 26, 6, 0), env=ENV, probes={"lab-scanner": True})).due       # late candles, next morning
    sat = JobState(job="lab-scanner", first_seen_at=ist(2026, 11, 1), last_success_at=ist(2026, 11, 27, 19, 50), last_attempt_at=ist(2026, 11, 27, 19, 50))
    assert not evaluate(j, sat, Ctx(now=ist(2026, 11, 28, 19, 45), env=ENV, probes={"lab-scanner": True})).due   # weekdays only


@pg
def test_the_probe_is_registered(store):  # noqa: F811
    assert "lab-scanner" in probes.build(store)


# ------------------------------------------------------------------------------------------------------------------ with the database
def _walk(n, seed):
    rng = np.random.default_rng(seed)
    c = 400 * np.exp(np.cumsum(rng.normal(0.0008, 0.019, n)))
    o = c * (1 + rng.normal(0, 0.006, n))
    return o, np.maximum(o, c) * 1.008, np.minimum(o, c) * 0.992, c, rng.integers(80_000, 900_000, n)


def days_to(n, end=None):
    """n weekdays ending on the latest weekday up to today (the candle store counts sessions of the last 15 days only)."""
    out, d = [], end or date.today()
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d -= timedelta(days=1)
    return out[::-1]


T = days_to(520)
DAY = T[-1]


async def _seed(app, n_stocks=60):  # noqa: F811
    """60 NSE stocks (the candle store counts a session from 50 companies): SC000-SC004 F&O; every 10th stock 300 sessions only; SC007 with no
    candle on the latest session; SC013 a BSE-only stock (not in the universe); SC020 with the report's older series as well."""
    recs, comps = [], []
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles")
        await conn.execute("DELETE FROM dhan_instruments WHERE symbol LIKE 'SC0%'")
        for k in range(n_stocks):
            sym = f"SC{k:03d}"
            o, h, l, c, v = _walk(len(T), k)  # noqa: E741
            start = len(T) - 300 if k % 10 == 9 else 0
            end = len(T) - 2 if k == 7 else len(T)
            for i in range(start, end):
                recs.append((sym, date.fromisoformat(T[i]), float(o[i]), float(h[i]), float(l[i]), float(c[i]), int(v[i]), "BSE" if k == 13 else "NSE"))
            comps.append((sym, f"{sym} Ltd", sym, ["Financial Services", "Metals & Mining", None][k % 3], "Industry"))
        await conn.copy_records_to_table("daily_candles", records=recs, columns=["symbol", "day", "open", "high", "low", "close", "volume", "exch"])
        await conn.executemany("INSERT INTO companies (symbol, name, nse_code, sector, industry) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (symbol) DO NOTHING", comps)
        await conn.executemany("INSERT INTO dhan_instruments (exch, security_id, symbol, fno, lot_size) VALUES ('NSE', $1, $2, true, 100) ON CONFLICT DO NOTHING",
                               [(str(900 + k), f"SC{k:03d}") for k in range(5)])
        old = days_to(300, end=date.fromisoformat(T[0]) - timedelta(days=40))
        oo, hh, ll, cc, _ = _walk(300, 99)
        daily = {"t": old, "o": [round(float(x), 2) for x in oo], "h": [round(float(x), 2) for x in hh], "l": [round(float(x), 2) for x in ll],
                 "c": [round(float(x), 2) for x in cc], "v": [5000] * 300}
        await conn.execute("INSERT INTO snapshots (symbol, statement, section, body, etag, generated_at) VALUES ('SC020', 'consolidated', 'price', $1, 'x', $2) "
                           "ON CONFLICT (symbol, statement, section) DO UPDATE SET body = EXCLUDED.body", orjson.dumps({"daily": daily}).decode(), datetime.now(timezone.utc))
    await app.state.store.redis.delete(S.LATEST_KEY, S.HISTORY_KEY)


@pg
async def test_the_scan_reads_in_batches_skips_and_counts_and_matches_the_backtest(app, monkeypatch):  # noqa: F811
    await _seed(app)
    store = app.state.store
    sizes = []
    real = S.load_batch

    async def counted(st, symbols):
        sizes.append(len(symbols))
        return await real(st, symbols)
    monkeypatch.setattr(S, "load_batch", counted)
    nifty = {t: 20000.0 + i for i, t in enumerate(days_to(900))}
    res = await S.scan(store, nifty, batch=7)
    assert res["status"] == "ok" and res["barsDate"] == DAY and res["universe"] == 59 and res["fno"] == 5    # SC013 trades on BSE only
    assert res["skipped"] == {"tooShort": 6, "stale": 1, "noData": 0, "failed": 0}                          # SC009, SC019 ... SC059; SC007
    assert res["checked"] == 59 - 7 and res["scanned"] == 59 and not res["stoppedEarly"]
    assert max(sizes) <= 7 and len(sizes) == math.ceil(59 / 7)
    assert [r["id"] for r in res["rules"]] == RULE_IDS and all(r["count"] == len(r["matches"]) for r in res["rules"])
    whole = await S.scan(store, nifty, batch=100)
    assert [[m["symbol"] for m in r["matches"]] for r in whole["rules"]] == [[m["symbol"] for m in r["matches"]] for r in res["rules"]]
    # every match is the backtest's answer on the same joined series, and its past results are the Strategy backtest's
    data = await real(store, ["SC020"])
    bars, _ = data["SC020"]
    assert len(bars["t"]) == 520 + 300 and bars["t"][0] < T[0]                    # the report's older series joined before the candles
    want = S.scan_bars(bars, nifty)
    got = sorted((r["id"], m["symbol"]) for r in res["rules"] for m in r["matches"] if m["symbol"] == "SC020")
    assert got == sorted((m["rule"], "SC020") for m in want["matches"])
    for r in res["rules"]:
        for m in r["matches"]:
            assert m["day"] == DAY and m["symbol"] not in ("SC007", "SC013", "SC009")
            assert m["sector"] in ("Financial Services", "Metals & Mining", None) and m["fno"] == (m["symbol"] < "SC005")
    total = sum(r["count"] for r in res["rules"])
    assert total > 0


@pg
async def test_a_scan_that_reaches_its_deadline_keeps_what_it_checked_and_says_so(app):  # noqa: F811
    await _seed(app)
    ticks = iter(range(0, 10_000, 60))                                       # each look at the clock: one more minute
    res = await S.scan(app.state.store, None, max_minutes=2.5, batch=10, clock=lambda: next(ticks))
    assert res["stoppedEarly"] and res["status"] == "partial"
    n = res["scanned"]
    assert 0 < n < 59 and res["notReached"] == 59 - n and len(res["notReachedSymbols"]) == 59 - n
    assert res["stoppedNote"].startswith(f"Stopped early after {n:,} of 59 stocks")
    assert {f"SC{k:03d}" for k in range(5)}.isdisjoint(res["notReachedSymbols"])     # F&O stocks first
    assert res["rules"][-1]["available"] is False and "Nifty 50" in res["rules"][-1]["note"]


@pg
async def test_the_route_is_for_lab_members_and_serves_the_stored_scan_with_new_today(app):  # noqa: F811
    await _seed(app)
    store = app.state.store
    async with new_client(app) as anon:
        assert (await anon.get("/api/lab/scanner")).status_code == 401
    member = await signed_in(app, "scan-member@example.com", plan="gold")
    assert (await member.get("/api/lab/scanner")).status_code == 403
    admin = await admin_with_mfa(app, "scan-boss@example.com")
    r = await admin.get("/api/lab/scanner")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    empty = r.json()
    assert empty["ready"] is False and empty["status"] == "empty" and len(empty["rules"]) == 23 and "has not run yet" in empty["detail"]
    assert await S.has_work(store) is True                                    # nothing stored yet: the probe says there is work
    # yesterday's scan (the latest session's candles not stored yet), then today's
    async with store.pool.acquire() as conn:
        saved = await conn.fetch("SELECT * FROM daily_candles WHERE day = $1", date.fromisoformat(DAY))
        await conn.execute("DELETE FROM daily_candles WHERE day = $1", date.fromisoformat(DAY))
    first = await S.refresh(store, None)
    assert first["barsDate"] == T[-2]
    async with store.pool.acquire() as conn:
        await conn.copy_records_to_table("daily_candles", records=[tuple(x) for x in saved], columns=list(saved[0].keys()))
    assert await S.has_work(store) is True                                    # a newer session reached the candle store
    second = await S.refresh(store, None)
    assert second["barsDate"] == DAY and second["status"] == "ok" and await S.has_work(store) is False
    body = (await admin.get("/api/lab/scanner")).json()
    assert body["ready"] and body["barsDate"] == DAY and body["previousDate"] == T[-2] and body["universe"] == 59
    assert body["note"] == S.NOTE and set(body["flags"]) == set(S.FLAG_TEXT) and "notReachedSymbols" not in body
    rows = [m for r in body["rules"] for m in r["matches"]]
    assert rows and all(m["new"] in (True, False) for m in rows)
    hist = orjson.loads(__import__("zlib").decompress(await store.redis.get(S.HISTORY_KEY)))
    assert [h["day"] for h in hist] == [DAY, T[-2]]
    for r in body["rules"]:
        before = set(hist[1]["rules"][r["id"]])
        for m in r["matches"]:
            assert m["new"] == (m["symbol"] not in before)
            assert set(m["past"]) >= {"trades", "few", "winRate", "avgR"} and re.match(r"^\d{4}-\d\d-\d\d$", m["day"])
