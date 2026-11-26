"""Task #394 PR B (developer file 37, ready-made lists): F3 one price a day, F4 lists built only on fresh candles, F5 the figures from the list's own
close, F8 no company without a trade in five sessions, C6 plain labels, C10 the price column, F9 "Left the list" from real closes.

The live check of 25 Nov 2026 (signed in as Gold) found: every list "after the 24 Nov close" (24 Nov was an NSE holiday); row prices from another day
than the chart and the figures (MILKYMIST 345.00 over its 342.40 level, the box "Below the level 0.9%"); Dr Lal PathLabs on Fresh close above a base
under its level with "When: Today" on a chart that ended 20 Nov; day changes missing or not matching the prices (LEMONTREE -2.4%); companies with no
trade for months on a list. Each test below would have caught one of them."""
import asyncio
import json
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import numpy as np
import pytest

from finlit import pattern_engine as pe
from finlit.jobs.registry import by_name
from finlit.presets import api as papi
from finlit.presets import engine, history, listday, patterns as P, savedlists, service
from finlit.presets.registry import BY_ID
from finlit.screener.data import Table
from test_auth import app, signed_in  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: F401  (fixtures)
from test_presets import frame, mrow, pz, syms

HOLIDAY = date(2026, 11, 24)            # Guru Nanak Jayanti: no NSE session
LIST_DAY = date(2026, 11, 23)


def _weekdays(end: date, n: int, skip=(HOLIDAY,)):
    out, d = [], end
    while len(out) < n:
        if d.weekday() < 5 and d not in skip:
            out.append(d)
        d -= timedelta(days=1)
    return out[::-1]


# ---------------------------------------------------------------------------------------------------------------- the list's day (F3)
def test_the_list_day_is_the_last_session_in_the_candles_never_a_holiday_or_a_stray_candle():
    days = _weekdays(LIST_DAY, 12)
    counts = {d: 1800 for d in days}
    counts[HOLIDAY] = 3                      # three companies with a candle on the holiday (a BSE-only row, a late correction): not a session
    counts[date(2026, 11, 22)] = 1500        # a Sunday: never a session for the lists
    sess = listday.sessions_from_counts(counts, HOLIDAY)
    assert sess[0] == LIST_DAY and HOLIDAY not in sess and date(2026, 11, 22) not in sess and len(sess) == 12
    assert listday.list_day(sess, HOLIDAY) == LIST_DAY                 # the weekday rule says 24 Nov; the candles say 23 Nov
    half = {**counts, LIST_DAY: 600}                              # a load still running for the newest day: the day before is the list's
    assert listday.sessions_from_counts(half, LIST_DAY)[0] == date(2026, 11, 20)
    assert listday.list_day([date(2026, 11, 2)], HOLIDAY) is None       # candles three weeks behind: the weekday rule's day is kept, nothing guessed


def test_a_row_price_and_its_day_change_come_from_one_day_of_candles():
    rows = [{"symbol": "LEMONTREE", "day": d, "close": c, "volume": 10_000} for d, c in ((date(2026, 11, 19), 130.0), (date(2026, 11, 20), 128.4), (LIST_DAY, 131.25))]
    rows.append({"symbol": "LEMONTREE", "day": HOLIDAY, "close": 140.0, "volume": 5})        # a candle after the list's day is not the list's
    dc = listday.closes_from_rows(rows, LIST_DAY)["LEMONTREE"]
    assert (dc.day, dc.close, dc.prev, dc.prev_day) == ("2026-11-23", 131.25, 128.4, "2026-11-20")
    row = {"symbol": "LEMONTREE", "price": 125.0, "ret_1d": -2.4}       # the table's live quote of the holiday
    listday.row_price(row, dc, "2026-11-23")
    assert row["price"] == row["price_on"] == 131.25 and row["price_day"] == "2026-11-23"
    assert row["ret_1d"] == round((131.25 / 128.4 - 1) * 100, 2) == 2.22 and "ret_1d_note" not in row       # matches the two prices
    first = {"symbol": "NEW", "price": 1.0, "ret_1d": 0.5}
    listday.row_price(first, listday.DayClose(day="2026-11-23", close=50.0), "2026-11-23")
    assert first["ret_1d"] is None and first["ret_1d_note"] == "No earlier close on file to compare with"        # a blank says why
    late = {"symbol": "GRWRHITECH", "price": 1.0, "ret_1d": 1.0}
    listday.row_price(late, listday.DayClose(day="2026-11-20", close=880.0, prev=870.0), "2026-11-23")
    assert late["price"] == 880.0 and late["price_day"] == "2026-11-20" and late["price_on"] is None and late["ret_1d"] is None
    assert late["ret_1d_note"] == "No trade on 23 Nov; the price is the 20 Nov close"
    untouched = {"symbol": "X", "price": 9.0, "ret_1d": 1.0}
    listday.row_price(untouched, None, "2026-11-23")
    assert untouched == {"symbol": "X", "price": 9.0, "ret_1d": 1.0}       # no candles at all: the table's price as before


def test_no_trade_in_five_sessions_is_judged_on_the_market_sessions():
    sess = [d.isoformat() for d in reversed(_weekdays(LIST_DAY, 8))]
    closes = {"OK": listday.DayClose(day="2026-11-23", close=1.0, traded="2026-11-23"),
              "QUIET": listday.DayClose(day="2026-11-23", close=1.0, traded=sess[4]),        # traded on the fifth session: still on
              "GONE": listday.DayClose(day="2026-11-23", close=1.0, traded=sess[5])}         # not in the last five: off
    off = listday.untraded_of(closes, {"CIGNITI": "2026-05-14", "SANGHI": None}, sess)
    assert off == {"GONE": sess[5], "CIGNITI": "2026-05-14", "SANGHI": None}
    assert listday.untraded_of(closes, {}, sess[:4]) == {}             # fewer than five sessions known: nothing is judged


@pytest.mark.integration
async def test_the_candle_store_dates_the_lists_and_prices_every_row(store):  # noqa: F811
    days = _weekdays(LIST_DAY, 10)
    rows = []
    for k in range(60):
        for j, d in enumerate(days):
            rows.append((f"C{k:02d}", d, 100.0 + j, 101.0 + j, 99.0 + j, 100.0 + j + k / 100, 1000, "NSE"))
    rows.append(("C00", HOLIDAY, 200.0, 200.0, 200.0, 200.0, 7, "BSE"))      # a stray candle on the holiday
    rows += [("CIGNITI", date(2026, 5, 14) - timedelta(days=i), 1500.0, 1500.0, 1500.0, 1500.0, 100, "NSE") for i in range(3)]
    rows += [("ZEROVOL", d, 50.0, 50.0, 50.0, 50.0, 0, "NSE") for d in days[-7:]]
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles")
        await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", rows)
    try:
        m = await listday.load(store, ["C00", "C01", "CIGNITI", "ZEROVOL", "NOCANDLES"], HOLIDAY)
        assert m.day == LIST_DAY and m.sessions[0] == "2026-11-23" and "2026-11-24" not in m.sessions
        assert m.closes["C01"].day == "2026-11-23" and m.closes["C01"].close == 109.01 and m.closes["C01"].prev == 108.01
        assert m.closes["C00"].day == "2026-11-23"                                     # the holiday candle is after the list's day
        assert set(m.untraded) == {"CIGNITI", "ZEROVOL"} and m.untraded["CIGNITI"] == "2026-05-14"
        assert "NOCANDLES" not in m.untraded                                           # no candles is not "no trade"
        # the whole frame is dated by the candles: 25 Nov 06:30 IST, the weekday rule says 24 Nov (the holiday)
        from finlit.screener import data
        data._table = Table([mrow(s) for s in ("C01", "C02")], {}, {})
        try:
            fr = await service.build_frame(store, now=datetime(2026, 11, 25, 1, 0, tzinfo=timezone.utc))
        finally:
            data.reset()
        assert fr.as_of == LIST_DAY and fr.market.day == LIST_DAY
    finally:
        async with store.pool.acquire() as conn:
            await conn.execute("DELETE FROM daily_candles")


# ---------------------------------------------------------------------------------------------------------------- rule lists (F3, F8)
def _momentum_frame():
    rows = [mrow("OK"), mrow("QUIET"), mrow("NOCDL")] + [mrow(f"F{i}", ret_3m=i, ret_6m=i, ret_1y=i) for i in range(1, 5)]
    for r in rows:
        r["metrics"] = json.dumps({**json.loads(r["metrics"]), "price": 345.0, "ret_1d": -2.4})       # the table's quote: another day's
    prism = {s: pz(final=60, st=0, lt=20) for s in ("OK", "QUIET", "NOCDL")}
    fr = frame(rows, prism)
    fr.as_of = LIST_DAY
    fr.market = listday.Market(day=LIST_DAY, sessions=[d.isoformat() for d in reversed(_weekdays(LIST_DAY, 8))],
                               closes={"OK": listday.DayClose(day="2026-11-23", close=342.4, prev=340.0, traded="2026-11-23", volume=10.0),
                                       "QUIET": listday.DayClose(day="2026-11-23", close=10.0, prev=10.0, traded="2026-05-14", volume=0.0)},
                               untraded={"QUIET": "2026-05-14"})
    return fr


def test_a_rule_list_row_shows_the_list_days_close_and_a_company_without_trades_is_left_off():
    fr = _momentum_frame()
    body = engine.run(fr, BY_ID["momentum-leaders"])
    by = {r["symbol"]: r for r in body["rows"]}
    assert "OK" in by and "QUIET" not in syms(body) and body["notTradedCount"] == 1 and fr.not_traded_off == {"QUIET"}
    ok = by["OK"]
    assert ok["price"] == ok["price_on"] == 342.4 and ok["price_day"] == "2026-11-23" and ok["ret_1d"] == round((342.4 / 340 - 1) * 100, 2)
    assert by["NOCDL"]["price"] == 345.0 and "price_day" not in by["NOCDL"]       # no candles at all: the table's price, as before
    assert body["asOf"] == "2026-11-23"


# ---------------------------------------------------------------------------------------------------------------- pattern lists (F3, F4, F5)
def _pattern_frame(run):
    rows = [mrow(s, market_cap=3000) for s in ("MILKYMIST", "LALPATHLAB", "IREDA")]
    fr = frame(rows, {s: pz(55) for s in ("MILKYMIST", "LALPATHLAB", "IREDA")})
    fr.as_of = HOLIDAY                       # the weekday rule's day, as the live lists had it
    fr.patterns = run
    return fr


def test_a_pattern_list_is_dated_by_its_scan_and_rows_read_the_close_its_figures_are_from():
    rec = lambda last, close, prev: {"facts": [["Level", "₹342.40"], ["Above the level", "0.8%"]], "nums": {"Level (Rs)": 342.4, "Below the level": -0.8},   # noqa: E731
                                     "draw": {"level": 342.4, "levelLabel": "Level"}, "q": 70, "status": "At the level", "last": last, "close": close, "prev": prev,
                                     "prevDay": "2026-11-20"}
    run = {"as_of": "2026-11-23", "left_out": [], "scans": {"daily_base": {"MILKYMIST": rec("2026-11-23", 345.0, 340.0), "LALPATHLAB": rec("2026-11-20", 2039.0, 2030.0)}}}
    fr = _pattern_frame(run)
    body = engine.run(fr, BY_ID["pattern-daily_base"])
    assert body["asOf"] == "2026-11-23" and body["factsAsOf"] == "2026-11-23"          # never the holiday
    assert syms(body) == ["MILKYMIST"] and body["staleCount"] == 1                      # its candles end 20 Nov: left off (F4)
    r = body["rows"][0]
    assert r["price"] == r["price_on"] == 345.0 and r["price_day"] == "2026-11-23" and r["factsAsOf"] == "2026-11-23"
    assert r["ret_1d"] == round((345 / 340 - 1) * 100, 2)
    assert r["draw"]["levelLabel"] == "Level"


def test_the_list_rule_is_checked_on_the_list_days_close():
    above = {"draw": {"level": ["2026-10-21", 3244.5, "Level"]}}
    assert P.rule_holds("fresh_breakout", above, 3244.5) and not P.rule_holds("fresh_breakout", above, 3208.0)        # Trent at the 23 Nov close: off
    pivot = {"draw": {"level": ["2026-08-01", 2038.6, "Pivot"]}}
    assert P.rule_holds("near_pivot", pivot, 2030.0) and not P.rule_holds("near_pivot", pivot, 2039.0)                # Dr Lal PathLabs: off
    assert not P.rule_holds("near_pivot", pivot, 2038.6) and P.rule_holds("daily_base", pivot, 2038.6)                 # a base "not above"; a pivot "under"
    assert P.rule_holds("flag", {"draw": {}}, 1.0)


def _scan_store():
    class Redis:
        async def get(self, k):
            return None
    return SimpleNamespace(redis=Redis(), pool=None)


def _bars(days, closes, vol=50_00_000):
    c = list(map(float, closes))
    return {"t": [d.isoformat() for d in days], "o": c, "h": [x * 1.01 for x in c], "l": [x * 0.99 for x in c], "c": c, "v": [vol] * len(c), "exch": "NSE"}


def test_scan_uses_the_chart_candles_up_to_the_list_day_and_leaves_off_a_stale_chart(monkeypatch):
    days = _weekdays(LIST_DAY, 260)
    good = np.linspace(100, 220, 260)
    after = days + [date(2026, 11, 25)]
    chart = {"FRESH": _bars(after, list(good) + [999.0]),                  # a candle after the list's day: never read
             "STALE": _bars(days[:-1], good[:-1])}                         # the chart's candles end 20 Nov
    fallback = {"STALE": _bars(days, good)}                                # ... though the older series reaches 23 Nov

    async def bulk(store, symbols, days_):
        return {s: chart[s] for s in symbols if s in chart}

    async def series(store, sym):
        return fallback[sym]
    from finlit import candles as exch
    monkeypatch.setattr(exch, "bulk", bulk)
    monkeypatch.setattr(P.candles_mod, "series", series)
    seen = {}

    def scan(s, rank, benches, young=False):
        seen[s.sym] = (s.d[-1], s.last)
        return [{"pattern": "fresh_breakout", "facts": {"When": pe.when(1)}, "draw": {"level": [s.d[-30], s.last - 1, "Level"], "marks": [[s.d[-1], s.last, "Close above"]]}, "q": 60},
                {"pattern": "near_pivot", "facts": {}, "draw": {"level": [s.d[-30], s.last - 1, "Pivot"]}, "q": 50}]      # close above a pivot: off
    monkeypatch.setattr(pe, "scan", scan)
    table = SimpleNamespace(symbols=["FRESH", "STALE"], full=[True, True], cols={"market_cap": [5000.0, 5000.0]})
    out = asyncio.run(P.scan_all(_scan_store(), table, LIST_DAY))
    assert seen == {"FRESH": ("2026-11-23", 220.0)}                          # the list's own close, not 25 Nov's
    assert out["left_out"] == [["STALE", "candles end 20 Nov, before the 23 Nov close"]]
    assert out["rule_off"] == [["FRESH", "near_pivot"]] and "FRESH" not in out["scans"]["near_pivot"]
    rec = out["scans"]["fresh_breakout"]["FRESH"]
    assert rec["last"] == "2026-11-23" and rec["close"] == 220.0 and rec["prev"] == round(good[-2], 2)
    assert dict(map(tuple, rec["facts"]))["Closed above it on"] == "23 Nov · the list day"     # never "Today"


# ---------------------------------------------------------------------------------------------------------------- the figures box (F5, C6)
def _s(days, closes):
    return SimpleNamespace(d=[d.isoformat() for d in days], c=np.array(closes, dtype=float), last=float(closes[-1]))


def test_fresh_close_above_a_base_figures_in_plain_words_from_the_list_days_close():
    days = _weekdays(LIST_DAY, 60)
    closes = [11000.0] * 59 + [11649.0]
    s = _s(days, closes)
    level_day, close_day = days[-23], days[-3]                    # 21 Oct ... 19 Nov
    facts = {"Closed above": "Rs 11353.00", "When": pe.when(3), "Volume that day against 50-day": "1.9x", "Now above the level": "3.3%",
             "In daily ranges": 0.6, "Level age": "20 sessions", "Base depth": "11.3%"}
    draw = {"level": [level_day.isoformat(), 11353.0, "Level"], "marks": [[close_day.isoformat(), 11723.0, "Close above"]]}
    got = P.plain_facts("fresh_breakout", facts, draw, s)
    assert got == [["Level", "₹11,353.00"], ["Closed above it on", f"{close_day.day} Nov · 2 sessions before the list"], ["Volume that day", "1.9× its 50-day average"],
                   ["Now above the level", "2.6%"], ["In usual daily moves", "0.6"], ["Level set on", f"{level_day.day} {level_day.strftime('%b')} · 20 sessions before the close above"],
                   ["Base, top to bottom", "11.3%"]]
    under = P.plain_facts("fresh_breakout", {"Now above the level": "1.0%"}, draw, _s(days, closes[:-1] + [11300.0]))
    assert under == [["Now under the level", "0.5%"]]
    assert pe.when(1) == "The list day" and pe.when(2) == "1 session before the list" and "Today" not in pe.when(1)


def test_base_figures_are_worked_out_on_the_list_days_close():
    days = _weekdays(LIST_DAY, 40)
    s = _s(days, [120.0] * 39 + [124.75])                          # IREDA: 124.75 at the 23 Nov close
    facts = {"Level (Rs)": 133.19, "Below the level": "0.7%", "In daily ranges": 2.1, "Level age": "20 sessions", "Base depth": "18.0%", "Rally before it": "28%",
             "Times tested": 1, "Volume, last 10 against 50": "0.24x"}
    draw = {"level": [days[-21].isoformat(), 133.19, "Level"]}
    got = dict(map(tuple, P.plain_facts("near_pivot", facts, draw, s)))
    assert got["Below the level"] == f"{(1 - 124.75 / 133.19) * 100:.1f}%" == "6.3%"      # from the row's own close, not another day's
    assert got["Level"] == "₹133.19" and got["In usual daily moves"] == "2.1" and got["Rise before the level"] == "28%" and got["Times the level was tested"] == "1"
    assert got["Level set on"].endswith("· 20 sessions before the list") and got["Base, top to bottom"] == "18.0%"
    assert got["Volume, last 10 days"] == "0.24× its 50-day average"
    above = dict(map(tuple, P.plain_facts("daily_base", {"Below the level": "0.9%"}, {"level": [days[-21].isoformat(), 342.4, "Level"]}, _s(days, [340.0] * 39 + [345.0]))))
    assert above == {"Above the level": "0.8%"}                                             # MILKYMIST 345.00 over 342.40
    assert P.inr(1234567.8) == "₹12,34,567.80" and P.inr(248.85) == "₹248.85" and P.inr(None) is None


# ---------------------------------------------------------------------------------------------------------------- the job (F4), the table (C10)
def test_the_lists_are_built_after_the_charts_reach_the_newest_candles():
    j = by_name({})["presets"]
    assert "price-sections" in j.prerequisites and "prism" in j.prerequisites and j.max_runtime_min == 40 and j.windows       # nothing weakened


def test_after_the_close_the_table_says_close_and_no_live_price_is_put_over_it():
    cols = [{"key": "price", "label": "LTP (Rs)"}, {"key": "ret_1d", "label": "Day change"}]
    assert papi.price_label(cols, None)[0]["label"] == "Close (₹)" and cols[1]["label"] == "Day change"
    assert papi.price_label(cols, "11:40")[0]["label"] == "Live (₹) · 11:40"
    assert papi.market_open(datetime(2026, 11, 25, 6, 10, tzinfo=timezone.utc)) and not papi.market_open(datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc))


# ---------------------------------------------------------------------------------------------------------------- F9
@pytest.mark.integration
async def test_left_the_list_reads_real_closes_from_joining_to_leaving(store):  # noqa: F811
    p = BY_ID["pattern-daily_base"]
    ckey = engine.chip_key([engine.NO_CHIPS])
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM screen_spells WHERE preset_id = $1", p.id)
        await conn.execute("DELETE FROM screen_snapshots WHERE preset_id = $1", p.id)
        await conn.execute("DELETE FROM screen_runs WHERE preset_id = $1", p.id)

    def fr_on(day, closes):
        # the table's price never moves (a report not rebuilt): before, every saved close was it and "from joining to leaving" read 0.0%
        return SimpleNamespace(as_of=day, symbols=["A", "B"], get=lambda i, n: 100.0, t=SimpleNamespace(pos={"A": 0, "B": 1}, name=["A", "B"], sector_label=[None, None]),
                               market=listday.Market(day=day, closes={s: listday.DayClose(day=day.isoformat(), close=c) for s, c in closes.items()}))

    def body(day, members, closes):
        return {"asOf": day.isoformat(), "version": 1, "rows": [{"symbol": s, "price_on": closes[s]} for s in members]}

    d1, d2, d3 = date(2026, 11, 19), date(2026, 11, 20), LIST_DAY
    try:
        await history.record(store, fr_on(d1, {"A": 100.0, "B": 50.0}), [(p, [engine.NO_CHIPS], body(d1, ["A", "B"], {"A": 100.0, "B": 50.0}))])
        await history.record(store, fr_on(d2, {"A": 104.0, "B": 51.0}), [(p, [engine.NO_CHIPS], body(d2, ["A", "B"], {"A": 104.0, "B": 51.0}))])
        await history.record(store, fr_on(d3, {"A": 101.0, "B": 52.0}), [(p, [engine.NO_CHIPS], body(d3, ["B"], {"B": 52.0}))])
        sl = await savedlists.load(store, p.id, ckey)
        left = savedlists.left_rows(sl, d3, "on")
        assert [(r["symbol"], r["added_on"], r["left_on"], r["change_pct"]) for r in left] == [("A", "2026-11-19", "2026-11-23", 4.0)]
        spells = {r["symbol"]: r for r in await history.left_list(store, p.id, ckey)}
        assert spells["A"]["change_pct"] == 1.0                     # 100 when it joined, 101 at the close it left on
    finally:
        async with store.pool.acquire() as conn:
            await conn.execute("DELETE FROM screen_spells WHERE preset_id = $1", p.id)
            await conn.execute("DELETE FROM screen_snapshots WHERE preset_id = $1", p.id)
            await conn.execute("DELETE FROM screen_runs WHERE preset_id = $1", p.id)


@pytest.mark.integration
async def test_after_the_close_a_screen_keeps_the_list_days_close_not_the_live_quote(app, store, monkeypatch):  # noqa: F811
    from finlit.screener import data
    from test_presets_api import row, wipe
    monkeypatch.setattr(papi, "_now", lambda: datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc))        # 17:30 IST, after the close
    data._table = Table([row(f"S{i:02d}", market_cap=5000 + i, flag_count=1.0, sales_cagr_3y=20, profit_cagr_3y=20, q_sales_yoy=15, q_profit_yoy=15, q_sales_up=4,
                             q_revenue=100, roce=20, debt_to_equity=0.2, is_bank=0, price=100.0, ret_1d=-0.9) for i in range(30)], {}, {})
    try:
        await wipe(store)
        gold = await signed_in(app, "g394@example.com", plan="gold")
        first = (await gold.get("/api/screener/presets/emerging-tech?chip=none")).json()
        sym = first["rows"][0]["symbol"]
        await store.redis.hset("search-quotes:silver", mapping={"body": json.dumps({"rows": [[sym, 123.45, 4.61, "9999-12-31", None, "locked", None]]}), "gzip": b"x", "etag": b"e"})
        b = (await gold.get("/api/screener/presets/emerging-tech?chip=none")).json()
        got = {r["symbol"]: r for r in b["rows"]}
        assert got[sym]["price"] == first["rows"][0]["price"] != 123.45 and "price_live" not in got[sym] and "priceLive" not in b
        assert next(c for c in b["columns"] if c["key"] == "price")["label"] == "Close (₹)"
        await gold.aclose()
    finally:
        await store.redis.delete("search-quotes:silver")
        data.reset()


@pytest.mark.asyncio
async def test_the_lists_are_rebuilt_once_the_candles_hold_a_newer_list_day(store):  # noqa: F811
    """26 Nov 2026: the 25 Nov candles came in the morning, the charts moved to 25 Nov, the lists (built at 01:57 IST) still said 23 Nov until the
    next night. The presets probe says there is work when the candles' list day is newer than the lists', found the way the job finds it."""
    import json
    from datetime import datetime, timezone
    from finlit.jobs import probes
    from finlit.jobs.registry import by_name
    from finlit.prism_candles import expected_session
    assert by_name()["presets"].probe == "presets" and by_name()["presets"].min_gap_min >= 60
    now = datetime.now(timezone.utc)
    expected = expected_session(now)
    older = expected - timedelta(days=1)
    while older.weekday() >= 5:
        older -= timedelta(days=1)

    async def put(day, n):
        async with store.pool.acquire() as conn:
            await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
                                   [(f"ZZL{i:03d}", day, 10.0, 11.0, 9.0, 10.5, 1000, "NSE") for i in range(n)])

    async def built(day):
        async with store.pool.acquire() as conn:
            await conn.execute("INSERT INTO preset_meta (key, value) VALUES ('last_run', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value=$1::jsonb",
                               json.dumps({"asOf": day.isoformat()}))

    probe = probes.build(store)["presets"]
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM daily_candles WHERE day > current_date - 30")
        await conn.execute("DELETE FROM preset_meta WHERE key = 'last_run'")
    try:
        await put(older, 80)
        await built(older)
        assert await probe() is False                 # the lists are on the candles' newest session
        await put(expected, 20)
        assert await probe() is False                 # a day still loading (20 of 80 companies) is not a session yet
        await put(expected, 80)
        assert await probe() is True                  # the new session is in: the lists must move with the charts
        await built(expected)
        assert await probe() is False                 # rebuilt
    finally:
        async with store.pool.acquire() as conn:
            await conn.execute("DELETE FROM daily_candles WHERE symbol LIKE 'ZZL%'")
            await conn.execute("DELETE FROM preset_meta WHERE key = 'last_run'")
