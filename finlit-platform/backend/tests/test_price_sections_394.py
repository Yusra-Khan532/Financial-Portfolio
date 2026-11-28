"""Task #394 (developer file 37, server half): the charts of the ready-made lists stopped on 18 or 20 Nov while daily_candles held 23 Nov, and 3Y was
weekly only. What must hold:
  F2  a report built while the market is open keeps the live quote for its header price, but no price-* chart section holds a part-day candle;
  F1  refresh-price-sections rewrites only the price sections from daily_candles: daily ranges exactly from the candles, weekly ranges keep the stored
      older weeks and add the candle weeks (5Y and MAX are never cut to the candles' three years), a split the stored chart has not absorbed is
      skipped, and a chart that ended 20 Nov ends 23 Nov after the job (the fault the founder saw);
  W1  /price?range=3Y&grain=daily answers the daily 3Y when it is stored and the weekly 3Y (no error) when it is not;
  the candles job finishes every night (150-minute time box, a run with companies left is partial, not silently done) and the new job runs after it.
"""
from datetime import date, timedelta

import httpx
import orjson
import pytest

from finlit import price_sections, snapshot
from finlit.analytics import indicators
from finlit.jobs.reasons import PARTIAL_EXIT
from finlit.jobs.registry import by_name, limit_policy
from finlit.snapshot import PRICE_SECTIONS, build, chart_sections
from test_integration import make_settings, store  # noqa: F401  (fixtures)

LAST = date(2026, 11, 23)          # the latest close (24 Nov 2026 was a market holiday)
STORED_LAST = date(2026, 11, 20)   # the day the stored report was built


def weekdays(start: date, end: date):
    d, out = start, []
    while d <= end:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def close_on(d: date) -> float:
    """One price path both the provider and the exchange agree on (so the join guard passes), rising slowly with a weekly wiggle."""
    return round(100 + (d - date(2019, 1, 1)).days * 0.05 + (d.toordinal() % 7) * 0.3, 2)


def provider_history(start=date(2020, 6, 1), end=STORED_LAST, scale=1.0):
    days = weekdays(start, end)
    c = [round(close_on(d) * scale, 2) for d in days]
    return {"t": [d.isoformat() for d in days], "o": [x - 0.5 for x in c], "h": [x + 1 for x in c], "l": [x - 1 for x in c], "c": c,
            "v": [100_000] * len(c), "removedBadTicks": []}


def candle_rows(start=date(2023, 9, 30), end=LAST, scale=1.0):
    """candles.bulk's shape: {"t", "o", "h", "l", "c", "v", "exch"} (about 1,150 days, as candles.DEFAULT_DAYS)."""
    days = weekdays(start, end)
    c = [round(close_on(d) * scale, 2) for d in days]
    return {"t": [d.isoformat() for d in days], "o": [x - 0.4 for x in c], "h": [x + 1.5 for x in c], "l": [x - 1.5 for x in c], "c": c,
            "v": [1_800_000] * len(c), "exch": "NSE"}


META = {"symbol": "ZZCHART", "statement": "consolidated", "generatedAt": "2026-11-20T14:50:00+00:00", "version": snapshot.SNAPSHOT_VERSION, "scoreModel": "v1"}


def stored_report(hist=None):
    hist = hist or provider_history()
    return chart_sections(hist, META, indicators.technical_snapshot(hist["c"]), None)


# ---------------------------------------------------------------- F2: no part-day candle in the stored chart

def test_a_report_built_with_a_newer_live_quote_keeps_it_in_the_header_but_not_in_any_chart(reliance_bundle):
    s = build(dict(reliance_bundle))               # the fixture's quote (29 Sep, 15:59) is newer than its last daily bar (28 Sep)
    quote, quality = s["summary"]["quote"], s["summary"]["dataQuality"]
    assert quality["provisionalLastBar"] is True and quality["priceAsOf"] == "2026-09-29"      # the report itself still reads the live quote ...
    assert quote["price"] == 1184.0 and s["price"]["daily"]["t"][-1] == "2026-09-29"
    for name in PRICE_SECTIONS:                     # ... no chart section holds it
        sec = s[name]
        assert sec["provisionalLastBar"] is False and sec["priceAsOf"] == "2026-09-28", name
        assert sec["series"]["t"][-1] == "2026-09-28", name
        assert sec["source"] is None, name          # the provider's own series: no exchange named
    assert s["price-1M"]["technical"]["price"] == s["price-1M"]["series"]["c"][-1]     # the chart's technical block reads the chart's own closes
    assert s["summary"]["meta"]["version"] == 6 == snapshot.SNAPSHOT_VERSION              # not bumped: no report is rebuilt for this


def test_the_exchange_is_named_when_the_report_reads_the_exchange_candles(reliance_bundle):
    s = build({**reliance_bundle, "price_source": {"exchange": "NSE", "via": "dhan", "days": 800, "to": "2026-09-28"}})
    assert {s[n]["source"] for n in PRICE_SECTIONS} == {"NSE"}


def test_a_report_stores_only_the_six_charts_and_says_on_the_weekly_3y_whether_the_candles_cover_it(reliance_bundle, reliance_sections):
    assert not [n for n in reliance_sections if n.startswith("price-") and n not in PRICE_SECTIONS]       # no 3Y (or 5Y) on daily candles is stored
    assert PRICE_SECTIONS == ("price-1M", "price-6M", "price-1Y", "price-3Y", "price-5Y", "price-MAX")
    assert reliance_sections["price-3Y"]["dailyAvailable"] is False             # the provider's series: no exchange candles held, D is not offered
    weekly_first = reliance_sections["price-3Y"]["series"]["t"][0]
    held = build({**reliance_bundle, "price_source": {"exchange": "NSE", "via": "dhan", "days": 800, "from": "2023-11-01", "to": "2026-09-28"}})
    assert held["price-3Y"]["dailyAvailable"] is True                           # candles from three years back: D on 3Y can be offered
    short = build({**reliance_bundle, "price_source": {"exchange": "NSE", "via": "dhan", "days": 60, "from": "2026-07-01", "to": "2026-09-28"}})
    assert short["price-3Y"]["dailyAvailable"] is False and weekly_first < "2026-07-01"   # candles shorter than the weekly 3Y: weekly only


# ---------------------------------------------------------------- F1: the sections from the candles

def test_daily_ranges_are_exactly_the_candles():
    rows = candle_rows()
    out = price_sections.build(stored_report(), rows, META)
    ema200 = dict(zip(rows["t"], indicators.ema(rows["c"], 200)))
    for label, days in (("1M", 31), ("6M", 183), ("1Y", 366)):
        sec = out[f"price-{label}"]
        want = [t for t in rows["t"] if t >= (LAST - timedelta(days=days)).isoformat()]
        assert sec["series"]["t"] == want and sec["grain"] == "daily", label
        assert sec["series"]["c"] == [rows["c"][rows["t"].index(t)] for t in want]
        assert sec["series"]["v"][-1] == 1_800_000                           # the exchange's volume, not the provider's
        assert sec["series"]["ema200"] == [round(ema200[t], 2) for t in want]   # a true 200-day average from the first day of 1Y
        assert sec["priceAsOf"] == "2026-11-23" and sec["provisionalLastBar"] is False and sec["source"] == "NSE" and sec["complete"]
        assert sec["meta"] == META                                           # the report's own meta is kept (its time and version)
    assert out["price-1Y"]["technical"] == indicators.technical_snapshot([round(c, 2) for c in rows["c"]])


def test_weekly_ranges_keep_the_stored_older_weeks_and_add_the_candle_weeks():
    stored = stored_report()
    rows = candle_rows()
    out = price_sections.build(stored, rows, META)
    old, new = stored["price-MAX"]["series"], out["price-MAX"]["series"]
    join = "2023-10-02"                                      # the candles start Saturday 30 Sep 2023 (first weekday 2 Oct, a Monday: a full week)
    kept = [i for i, t in enumerate(old["t"]) if t < join]
    assert kept and new["t"][:len(kept)] == [old["t"][i] for i in kept]
    for k in ("o", "h", "l", "c", "v", "ema50", "ema200", "ema9", "ema20"):    # stored weeks exactly as stored, averages included
        assert new[k][:len(kept)] == [old[k][i] for i in kept], k
    assert new["t"][0] == old["t"][0] == "2020-06-05"        # MAX keeps the whole stored history: never cut to the candles' three years
    assert new["t"][-1] == "2026-11-23" and new["v"][-1] == 1_800_000          # the week to 23 Nov from the candles
    assert len(new["t"]) == len(set(new["t"])) and new["t"] == sorted(new["t"])
    daily_ema = dict(zip(rows["t"], indicators.ema(rows["c"], 50)))
    assert new["ema50"][-1] == round(daily_ema["2026-11-23"], 2)              # a candle week reads the daily average on its last day
    assert all(v is not None for v in new["ema200"][len(kept):])             # the candles' warm-up weeks take the stored average of the same week
    five = out["price-5Y"]
    assert five["series"]["t"][0] < "2022-01-01" and five["complete"] and five["grain"] == "weekly"   # 5Y reaches back five years, not three
    three = out["price-3Y"]
    assert three["dailyAvailable"] is True and set(out) == set(PRICE_SECTIONS)      # the candles cover 3Y; nothing on daily candles is stored
    short = price_sections.build(stored, candle_rows(start=date(2026, 6, 1)), META)
    assert short["price-3Y"]["dailyAvailable"] is False                           # candles shorter than the weekly 3Y: D is not offered


def test_a_split_the_stored_chart_has_not_absorbed_is_skipped():
    rows = candle_rows(scale=0.5)                            # a 1:1 bonus: the exchange's history is restated, the stored chart is not
    with pytest.raises(price_sections.AdjustmentGap):
        price_sections.build(stored_report(), rows, META)
    assert price_sections.build(stored_report(), candle_rows(scale=1.015), META)["price-MAX"]["series"]["t"][-1] == "2026-11-23"   # within 2%: joined


def test_a_company_with_no_stored_weekly_history_gets_its_weeks_from_the_candles():
    out = price_sections.build({}, candle_rows(), META)
    assert out["price-MAX"]["series"]["t"][0] == "2023-10-06" and out["price-5Y"]["complete"] is False and out["price-MAX"]["complete"] is True


# ---------------------------------------------------------------- the job against Postgres and Redis

async def _seed(store, symbol="ZZCHART", stored=None, rows=None):
    """A stored report (summary + charts ending 20 Nov) and candles to 23 Nov, written the way the worker writes them."""
    stored = stored or stored_report()
    summary = {"meta": {**META, "symbol": symbol}, "quote": {"price": 999.0}, "profile": {"name": symbol}}
    await store.save_snapshot(symbol, "consolidated", {"summary": summary, **{n: {**b, "meta": {**META, "symbol": symbol}} for n, b in stored.items()}})
    rows = rows or candle_rows()
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles WHERE symbol = $1", symbol)
        await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                               [(symbol, date.fromisoformat(t), o, h, lo, c, v, "NSE") for t, o, h, lo, c, v in
                                zip(rows["t"], rows["o"], rows["h"], rows["l"], rows["c"], rows["v"])])
    return summary


async def _clean(store, *symbols):
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles WHERE symbol = ANY($1::text[])", list(symbols))
        await conn.execute("DELETE FROM snapshots WHERE symbol = ANY($1::text[])", list(symbols))
        await conn.execute("DELETE FROM mf_meta WHERE key IN ('run:refresh-candles', 'run:refresh-price-sections')")


async def _api(store):
    from finlit.api import create_app
    app = create_app(make_settings(), store=store)
    return app, httpx.ASGITransport(app=app)


async def test_a_chart_that_ended_20_nov_ends_23_nov_after_the_job(store):  # noqa: F811
    """The fault the founder saw: the stored chart stopped on the day its report was built although the candles held the newest close."""
    await _seed(store)
    app, transport = await _api(store)
    async with app.router.lifespan_context(app), httpx.AsyncClient(transport=transport, base_url="http://test") as api:
        before = (await api.get("/api/stocks/ZZCHART/price", params={"range": "6M"})).json()
        assert before["series"]["t"][-1] == "2026-11-20"
        res = await price_sections.refresh(store, symbols=["ZZCHART"], pause_s=0)
        assert res["written"] == 1 and res["failed"] == res["skipped_adjust"] == res["no_candles"] == 0 and res["newestSession"] == "2026-11-23"
        for rng in ("1M", "6M", "1Y", "3Y", "5Y", "MAX"):
            body = (await api.get("/api/stocks/ZZCHART/price", params={"range": rng})).json()
            assert body["series"]["t"][-1] == "2026-11-23" and body["priceAsOf"] == "2026-11-23" and body["provisionalLastBar"] is False, rng
        again = await price_sections.refresh(store, symbols=["ZZCHART"], pause_s=0)          # resumable: a chart already current is left alone
        assert again["current"] == 1 and again["written"] == 0
        assert (await price_sections.refresh(store, symbols=["ZZCHART"], pause_s=0, force=True))["written"] == 1
    await _clean(store, "ZZCHART")


async def _rows(store, symbol):
    async with store.pool.acquire() as conn:
        return {r["section"]: (r["body"], r["etag"], r["generated_at"]) for r in
                await conn.fetch("SELECT section, body, etag, generated_at FROM snapshots WHERE symbol = $1", symbol)}


async def test_save_sections_writes_only_the_price_sections_and_refreshes_a_cached_company_without_extending_it(store):  # noqa: F811
    summary = await _seed(store, "ZZONLY")              # save_snapshot cached it, as a full report build does
    key = "stock:ZZONLY:consolidated"
    before = await _rows(store, "ZZONLY")
    await store.redis.expire(key, 500)                  # an entry close to leaving: the nightly job must not keep it longer
    res = await price_sections.refresh(store, symbols=["ZZONLY"], pause_s=0)
    assert res["written"] == 1
    after = await _rows(store, "ZZONLY")
    assert after["summary"] == before["summary"]                                   # the report itself is not touched
    assert set(after) == set(before) == {"summary", *PRICE_SECTIONS}               # no other section is stored (no 3Y on daily candles)
    for name in PRICE_SECTIONS:
        assert after[name][1] != before[name][1] and after[name][2] == before[name][2], name   # new body and etag; the report's time kept
    cached = await store.redis.hgetall(key)
    for name in PRICE_SECTIONS:                                                    # the cached copies are the new ones ...
        assert cached[name.encode()].decode() == after[name][0] and cached[f"{name}:etag".encode()].decode() == after[name][1], name
    assert orjson.loads(cached[b"summary"]) == summary                              # ... the cached summary is left as it was
    assert 0 < await store.redis.ttl(key) <= 500                                    # and the entry still leaves when it would have
    assert await store.get_section("ZZONLY", "consolidated", "price-1M") == (cached[b"price-1M"], after["price-1M"][1])
    # a section given as None is removed, row and cached copy
    await store.save_sections("ZZONLY", "consolidated", {"price-5Y": None})
    assert await store.redis.hget(key, "price-5Y") is None and await store.get_section("ZZONLY", "consolidated", "price-5Y") is None
    await _clean(store, "ZZONLY")
    await store.redis.delete(key)


async def test_save_sections_leaves_redis_alone_for_a_company_nobody_has_opened(store):  # noqa: F811
    await _seed(store, "ZZCOLD")
    key = "stock:ZZCOLD:consolidated"
    await store.redis.delete(key)                       # nobody opened it: it left Redis (STOCK_TTL)
    assert (await price_sections.refresh(store, symbols=["ZZCOLD"], pause_s=0))["written"] == 1
    assert await store.redis.exists(key) == 0                                       # the nightly job does not load it into Redis
    await store.save_sections("ZZCOLD", "consolidated", {"price-5Y": None})
    assert await store.redis.exists(key) == 0                                       # a removal does not create it either
    # the next read fills it from Postgres, as before: a missing hash, then a hash that lacks the asked section
    stored = await _rows(store, "ZZCOLD")
    hit = await store.get_section("ZZCOLD", "consolidated", "price-1M")
    assert hit == (stored["price-1M"][0].encode(), stored["price-1M"][1]) and 0 < await store.redis.ttl(key)
    assert await store.redis.hget(key, "price-1Y") is None
    hit = await store.get_section("ZZCOLD", "consolidated", "price-1Y")
    assert hit == (stored["price-1Y"][0].encode(), stored["price-1Y"][1]) and await store.redis.hget(key, "price-1Y") == hit[0]
    await _clean(store, "ZZCOLD")
    await store.redis.delete(key)


async def test_the_job_skips_an_unabsorbed_split_and_counts_companies_without_candles(store):  # noqa: F811
    await _seed(store, "ZZSPLIT", rows=candle_rows(scale=0.5))
    await _seed(store, "ZZBEHIND", rows=candle_rows(end=date(2026, 11, 18)))
    await _seed(store, "ZZNONE")
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles WHERE symbol = 'ZZNONE'")
    stored_split = await store.get_section("ZZSPLIT", "consolidated", "price-MAX")
    res = await price_sections.refresh(store, symbols=["ZZSPLIT", "ZZBEHIND", "ZZNONE"], pause_s=0, chunk=2)
    assert res["companies"] == 3 and res["skipped_adjust"] == 1 and res["no_candles"] == 1 and res["written"] == 1 and res["behind"] == 1
    assert await store.get_section("ZZSPLIT", "consolidated", "price-MAX") == stored_split          # left for its next full rebuild
    assert orjson.loads((await store.get_section("ZZBEHIND", "consolidated", "price-1M"))[0])["priceAsOf"] == "2026-11-18"
    await _clean(store, "ZZSPLIT", "ZZBEHIND", "ZZNONE")


async def test_the_probe_runs_the_job_again_when_candles_were_stored_after_it(store):  # noqa: F811
    from finlit.mf import record_run
    await _clean(store)
    assert await price_sections.has_work(store) is False                  # nothing loaded yet
    await record_run(store, "refresh-candles", {"status": "ok"})
    assert await price_sections.has_work(store) is True
    await record_run(store, "refresh-price-sections", {"status": "ok"})
    assert await price_sections.has_work(store) is False
    await _clean(store)


# ---------------------------------------------------------------- W1: daily candles on 3Y when asked

async def _cache_keys(store, symbol):
    return [k async for k in store.redis.scan_iter(match=f"p3yd:{symbol}:*")]


async def test_3y_daily_is_built_on_demand_cached_answers_304_and_falls_back_to_weekly(store):  # noqa: F811
    await _seed(store, "ZZTHREE")
    await _seed(store, "ZZYOUNG", rows=candle_rows(start=date(2026, 6, 1)))      # candles shorter than its weekly 3Y
    for k in await _cache_keys(store, "ZZTHREE") + await _cache_keys(store, "ZZYOUNG"):
        await store.redis.delete(k)
    app, transport = await _api(store)
    async with app.router.lifespan_context(app), httpx.AsyncClient(transport=transport, base_url="http://test") as api:
        q = {"range": "3Y", "grain": "daily"}
        first = await api.get("/api/stocks/ZZTHREE/price", params=q)
        body = first.json()
        rows = candle_rows()
        want = [t for t in rows["t"] if t >= (LAST - timedelta(days=1096)).isoformat()]
        assert first.status_code == 200 and body["grain"] == "daily" and body["range"] == "3Y" and body["series"]["t"] == want and len(want) > 700
        assert body["series"]["c"][-1] == rows["c"][-1] and body["priceAsOf"] == "2026-11-23" and body["provisionalLastBar"] is False
        assert body["meta"] == {**META, "symbol": "ZZTHREE"} and body["source"] == "NSE" and body["complete"]   # the stored weekly 3Y's meta
        assert first.headers["etag"]
        # kept in Redis for about 30 minutes under its own key: a second request does not read the candles again
        keys = await _cache_keys(store, "ZZTHREE")
        assert len(keys) == 1 and 1700 < await store.redis.ttl(keys[0]) <= 1800
        async with store.pool.acquire() as conn:
            await conn.execute("DELETE FROM daily_candles WHERE symbol = 'ZZTHREE'")
        again = await api.get("/api/stocks/ZZTHREE/price", params=q)
        assert again.status_code == 200 and again.content == first.content and again.headers["etag"] == first.headers["etag"]
        unchanged = await api.get("/api/stocks/ZZTHREE/price", params=q, headers={"If-None-Match": first.headers["etag"]})
        assert unchanged.status_code == 304 and unchanged.content == b""
        # without grain=daily, and on 5Y, the stored weekly charts as before
        weekly = (await api.get("/api/stocks/ZZTHREE/price", params={"range": "3Y"})).json()
        assert weekly["grain"] == "weekly" and weekly["dailyAvailable"] is False        # built without the exchange candles: D not offered yet
        assert (await api.get("/api/stocks/ZZTHREE/price", params={"range": "5Y", "grain": "daily"})).json()["grain"] == "weekly"
        await _seed(store, "ZZTHREE")                                                   # candles back; the nightly job rewrites the charts
        assert (await price_sections.refresh(store, symbols=["ZZTHREE"], pause_s=0))["written"] == 1
        assert (await api.get("/api/stocks/ZZTHREE/price", params={"range": "3Y"})).json()["dailyAvailable"] is True
        fresh = await api.get("/api/stocks/ZZTHREE/price", params=q)                    # a new weekly 3Y: a new answer, its own key
        assert fresh.json()["grain"] == "daily" and len(await _cache_keys(store, "ZZTHREE")) == 2
        # candles that do not reach back as far as the weekly 3Y: the stored weekly 3Y, no error (and that answer is remembered too)
        young = await api.get("/api/stocks/ZZYOUNG/price", params=q)
        assert young.status_code == 200 and young.json()["grain"] == "weekly"
        assert len(await _cache_keys(store, "ZZYOUNG")) == 1
        assert (await api.get("/api/stocks/ZZYOUNG/price", params=q)).json()["grain"] == "weekly"
        # a company with no stored report at all answers as any missing report does (no daily answer is invented)
        assert (await api.get("/api/stocks/ZZNOREPORT/price", params=q)).status_code != 200
    async with store.pool.acquire() as conn:   # nothing on daily candles is stored anywhere
        assert await conn.fetchval("SELECT count(*) FROM snapshots WHERE section NOT IN ('summary', 'price-1M', 'price-6M', 'price-1Y', 'price-3Y', "
                                   "'price-5Y', 'price-MAX') AND section LIKE 'price-%'") == 0
    for k in await _cache_keys(store, "ZZTHREE") + await _cache_keys(store, "ZZYOUNG"):
        await store.redis.delete(k)
    await _clean(store, "ZZTHREE", "ZZYOUNG")


# ---------------------------------------------------------------- the jobs

def test_the_chart_job_runs_after_the_candles_job_and_the_candles_job_finishes_every_night():
    jobs = by_name({"FUND_LOADS_ENABLED": "1", "DHAN_CLIENT_ID": "x"})
    ps, cdl = jobs["price-sections"], jobs["candles"]
    assert ps.command.startswith("refresh-price-sections") and ps.cls == "bulk" and ps.prerequisites == ("candles",) and ps.priority > cdl.priority
    assert {w.window for w in ps.windows} == {"AFTER_CLOSE", "MORNING"} and ps.sla.kind == "session" and ps.resumable and limit_policy(ps) == "resume"
    assert ps.probe == "price-sections" and ps.owns == ("price_sections",) and ps.what
    minutes = float(ps.args[ps.args.index("--max-minutes") + 1])
    assert minutes < ps.max_runtime_min
    box = float(cdl.args[cdl.args.index("--max-minutes") + 1])
    assert box >= 150 and cdl.max_runtime_min >= box + 5 and cdl.resumable           # was 45 / 55: companies were left a night behind
    from finlit.jobs.probes import build as probes
    assert "price-sections" in probes(None)


async def test_a_candles_run_that_leaves_companies_is_partial_not_done(store, monkeypatch):  # noqa: F811
    from finlit import candles, dhan, worker
    from finlit.mf import _meta

    class FakeDhan:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    async def refresh(store, dc, **kw):
        return {"asked": 10, "loaded": 7, "rows": 7, "no_match": 0, "empty": 0, "failed": 0, "nse": 7, "bse": 0, "left": 3}
    monkeypatch.setattr(dhan, "DhanClient", FakeDhan)
    monkeypatch.setattr(candles, "refresh", refresh)
    assert await worker.main(["refresh-candles", "--max-minutes", "150"], settings=make_settings()) == PARTIAL_EXIT
    async with store.pool.acquire() as conn:
        rec = await _meta(conn, "run:refresh-candles")
    assert rec["status"] == "partial" and rec["left"] == 3 and "3 companies left" in rec["why"]

    from datetime import datetime as _dt, timezone as _tz
    from finlit.prism_candles import expected_session
    expected = expected_session(_dt.now(_tz.utc)).isoformat()

    async def done(store, dc, **kw):
        return {"asked": 10, "loaded": 10, "rows": 10, "no_match": 0, "empty": 0, "failed": 0, "nse": 10, "bse": 0, "left": 0, "newestSession": expected}
    monkeypatch.setattr(candles, "refresh", done)
    assert await worker.main(["refresh-candles"], settings=make_settings()) == 0
    async with store.pool.acquire() as conn:
        assert (await _meta(conn, "run:refresh-candles"))["status"] == "ok"

    # live, 25 Nov: the 18:30 IST run found no 25 Nov candles (the exchange's file was not out yet) and was recorded "ok", so the session counted as
    # done and every chart stayed on 23 Nov until the next evening. Now a full run that ends without the expected session is partial and tried again.
    async def behind(store, dc, **kw):
        return {"asked": 10, "loaded": 10, "rows": 10, "no_match": 0, "empty": 0, "failed": 0, "nse": 10, "bse": 0, "left": 0, "newestSession": "2000-01-03"}
    monkeypatch.setattr(candles, "refresh", behind)
    assert await worker.main(["refresh-candles"], settings=make_settings()) == PARTIAL_EXIT
    async with store.pool.acquire() as conn:
        rec = await _meta(conn, "run:refresh-candles")
    assert rec["status"] == "partial" and rec["expectedSession"] == expected and f"waiting for the exchange's {expected} candles" in rec["why"]
    # a run for named companies only is not judged on the whole market's session
    assert await worker.main(["refresh-candles", "RELIANCE"], settings=make_settings()) == 0
    await _clean(store)


async def test_the_newest_session_needs_many_companies_not_one_stray_candle(store):  # noqa: F811
    from datetime import date, timedelta
    from finlit import candles
    d1, d2 = date.today() - timedelta(days=3), date.today() - timedelta(days=2)
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles WHERE symbol LIKE 'ZZT%'")
        rows = [(f"ZZT{i:03d}", d1, 10.0, 11.0, 9.0, 10.5, 1000, "NSE") for i in range(60)] + [("ZZT000", d2, 10.0, 11.0, 9.0, 10.5, 1000, "NSE")]
        await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", rows)
    try:
        assert await candles.newest_session(store) == d1.isoformat()   # one company's candle on d2 is not a session
    finally:
        async with store.pool.acquire() as conn:
            await conn.execute("DELETE FROM daily_candles WHERE symbol LIKE 'ZZT%'")


@pytest.mark.asyncio
async def test_the_candles_job_runs_again_when_dhan_has_a_session_the_store_lacks(store):  # noqa: F811
    """25 Nov 2026: the after-close run found no 25 Nov candles; Dhan had them by 04:50 IST (the technicals run confirmed it), yet the charts waited
    for the next evening. The candles probe now says there is work once the confirmed session is newer than the store's, and only then."""
    import json
    from datetime import datetime, timezone
    from finlit import candles
    from finlit.jobs import probes
    from finlit.prism_candles import expected_session
    from finlit.prism_technical import TARGET_KEY
    assert by_name()["candles"].probe == "candles" and by_name()["candles"].min_gap_min >= 60
    expected = expected_session(datetime.now(timezone.utc))
    held = expected - timedelta(days=1)
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles WHERE day >= current_date - 15")
        await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
                               [(f"ZZP{i:03d}", held, 10.0, 11.0, 9.0, 10.5, 1000, "NSE") for i in range(60)])
    probe = probes.build(store)["candles"]
    try:
        await store.redis.delete(TARGET_KEY)
        assert await probe() is False                                  # nothing confirmed by Dhan: the weekday rule alone (a holiday) is never work
        await store.redis.set(TARGET_KEY, json.dumps({"expected": expected.isoformat(), "target": held.isoformat()}))
        assert await probe() is False                                  # Dhan's newest session is the one already stored
        await store.redis.set(TARGET_KEY, json.dumps({"expected": expected.isoformat(), "target": expected.isoformat()}))
        assert await probe() is True                                   # Dhan has the expected session; the store does not
        await store.redis.set(TARGET_KEY, json.dumps({"expected": (expected - timedelta(days=7)).isoformat(), "target": expected.isoformat()}))
        assert await probe() is False                                  # a target left from an older day is not today's word
        async with store.pool.acquire() as conn:
            await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
                                   [(f"ZZP{i:03d}", expected, 10.0, 11.0, 9.0, 10.5, 1000, "NSE") for i in range(60)])
        await store.redis.set(TARGET_KEY, json.dumps({"expected": expected.isoformat(), "target": expected.isoformat()}))
        assert await probe() is False                                  # loaded: no more work
        assert await candles.newest_session(store) == expected.isoformat()
    finally:
        await store.redis.delete(TARGET_KEY)
        async with store.pool.acquire() as conn:
            await conn.execute("DELETE FROM daily_candles WHERE symbol LIKE 'ZZP%'")


async def test_a_company_with_no_report_gets_its_chart_from_the_candles_at_once(store):  # noqa: F811
    """Task #394 re-check (28 Nov 2026): AJMERA and AGARWALEYE were on the ready-made lists (built from the exchange candles) with no report
    stored; their charts asked for a report build that the busy queue answered with 429 for minutes. Now the chart is drawn from the candles."""
    await _clean(store, "ZZNOREP")
    rows = candle_rows()
    async with store.pool.acquire() as conn:
        await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                               [("ZZNOREP", date.fromisoformat(t), o, h, lo, c, v, "NSE") for t, o, h, lo, c, v in
                                zip(rows["t"], rows["o"], rows["h"], rows["l"], rows["c"], rows["v"])])
    for k in [k async for k in store.redis.scan_iter("pfc:ZZNOREP:*")]:
        await store.redis.delete(k)
    app, transport = await _api(store)
    async with app.router.lifespan_context(app), httpx.AsyncClient(transport=transport, base_url="http://test") as api:
        one = await api.get("/api/stocks/ZZNOREP/price", params={"range": "1Y"})
        body = one.json()
        assert one.status_code == 200 and body["grain"] == "daily" and body["range"] == "1Y" and body["meta"]["fromCandles"] is True
        assert body["series"]["t"][-1] == "2026-11-23" and body["series"]["c"][-1] == rows["c"][-1] and body["source"] == "NSE"
        wk = (await api.get("/api/stocks/ZZNOREP/price", params={"range": "3Y"})).json()
        assert wk["grain"] == "weekly" and wk["dailyAvailable"] is True
        d3 = (await api.get("/api/stocks/ZZNOREP/price", params={"range": "3Y", "grain": "daily"})).json()
        assert d3["grain"] == "daily" and len(d3["series"]["t"]) > 700
        assert len([k async for k in store.redis.scan_iter("pfc:ZZNOREP:*")]) == 3          # kept for 30 minutes, one key a range
        none = await api.get("/api/stocks/ZZNONE/price", params={"range": "1Y"})
        assert none.status_code != 200 or "series" not in none.json()                        # no candles: the usual path (the report is queued)
    await _clean(store, "ZZNOREP")


def test_a_chart_from_the_providers_series_is_never_current_so_the_job_rewrites_it():
    """Task #394 re-check (28 Nov 2026): a report rebuilt on demand before the fix kept the provider's charts (source None) ending on the same
    day as the candles; the job took them for current and left them. Now only a chart written from the candles is current."""
    stored = {name: body for name, body in stored_report().items()}
    last = stored["price-1M"]["priceAsOf"]
    assert stored["price-1M"]["source"] is None
    assert price_sections.is_current(stored, last) is False
    for body in stored.values():
        body["source"] = "NSE"
    assert price_sections.is_current(stored, last) is True
