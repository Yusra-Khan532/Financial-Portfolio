"""Task #408 (Watchlists pack, 03-data and 05-alerts): the added price (saved by the page, filled once on the server from stored closes), "Price near
your target" on the server with the list's and the stock's own switches, and the screens a list of stocks is on (/api/screener/membership, Gold)."""

import re
from datetime import date, datetime

from finlit import targetalerts as ta
from finlit import watchprices as wp
from finlit.jobs.registry import LIMIT_POLICY, by_name
from finlit.presets import engine, service
from finlit.presets.registry import BY_ID
from test_auth import app, new_client, signed_in  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: F401  (fixtures)

JOBS = by_name({"FUND_LOADS_ENABLED": "1", "DHAN_CLIENT_ID": "x"})
ADVICE = re.compile(r"\b(buy|sell|hold|reduce|avoid|accumulate|best|multibagger|top pick)\b", re.I)


def ms(y, m, d, hh, mm):   # an IST wall-clock time as the page's `added` (milliseconds)
    return int(datetime(y, m, d, hh, mm, tzinfo=wp.IST).timestamp() * 1000)


# ------------------------------------------------------------------------------------------------ change 1: the added price
def test_the_day_whose_close_counts_is_the_day_added_or_the_next_after_the_close():
    assert wp.first_day(ms(2026, 11, 23, 11, 0)) == date(2026, 11, 23)        # during the session: that day's close
    assert wp.first_day(ms(2026, 11, 23, 15, 30)) == date(2026, 11, 24)       # at or after the close: the next close
    assert wp.first_day(ms(2026, 11, 23, 23, 0)) == date(2026, 11, 24)
    assert wp.first_day(0) is None
    closes = [(date(2026, 11, 20), 100.0), (date(2026, 11, 24), 110.0), (date(2026, 11, 25), 111.0)]
    assert wp.pick_close(date(2026, 11, 22), closes) == (date(2026, 11, 24), 110.0)   # a weekend takes the next session
    assert wp.pick_close(date(2026, 11, 26), closes) is None                           # no close yet: left for a later run
    wl = {"lists": [{"id": "a", "name": "A", "symbols": ["SBIN", "TCS"]}],
          "meta": {"SBIN": {"added": ms(2026, 11, 23, 11, 0)}, "TCS": {"added": ms(2026, 11, 23, 11, 0), "addedPrice": 3000}, "OLD": {"added": 5}}}
    assert wp.missing(wl) == [("SBIN", date(2026, 11, 23))]                  # one with a price, or no longer on a list, is left alone


async def test_backfill_fills_once_from_the_stored_closes_and_a_later_save_keeps_it(app):  # noqa: F811
    pool = app.state.store.pool
    c = await signed_in(app, "wp408@example.com", plan="silver")
    added = ms(2026, 11, 20, 16, 0)        # Friday after the close: Monday 23 Nov's close counts
    wl = {"lists": [{"id": "main", "name": "My watchlist", "symbols": ["WP408A", "WP408B"]}],
          "meta": {"WP408A": {"added": added}, "WP408B": {"added": added, "addedPrice": 50.5}}}
    assert (await c.put("/api/me/watchlist", json=wl)).status_code == 200
    bad = {**wl, "meta": {"WP408A": {"added": added, "addedPrice": -1}}}
    assert (await c.put("/api/me/watchlist", json=bad)).status_code == 422          # validated on the server
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM price_daily WHERE symbol LIKE 'WP408%'")
        await conn.execute("DELETE FROM daily_candles WHERE symbol LIKE 'WP408%'")
        await conn.execute("INSERT INTO price_daily (symbol, day, close) VALUES ('WP408A', '2026-11-20', 99), ('WP408A', '2026-11-23', 101.25), ('WP408A', '2026-11-24', 105)")
    assert await wp.has_work(app.state.store) is True
    got = await wp.backfill(app.state.store)
    assert got["filled"] >= 1
    meta = (await c.get("/api/me/state")).json()["watchlist"]["meta"]
    assert meta["WP408A"]["addedPrice"] == 101.25 and meta["WP408B"]["addedPrice"] == 50.5
    assert (await wp.backfill(app.state.store))["filled"] == 0                      # idempotent
    # a browser that still holds the older copy (no added price) saves it: the filled price is kept
    assert (await c.put("/api/me/watchlist", json={**wl, "meta": {"WP408A": {"added": added, "note": "Waiting for Q3"}}})).status_code == 200
    meta = (await c.get("/api/me/state")).json()["watchlist"]["meta"]
    assert meta["WP408A"] == {"added": added, "note": "Waiting for Q3", "addedPrice": 101.25}
    async with pool.acquire() as conn:        # daily candles win over price_daily for the same day
        await conn.execute("INSERT INTO daily_candles (symbol, day, close, exch) VALUES ('WP408C', '2026-11-23', 77.7, 'NSE')")
        await conn.execute("INSERT INTO price_daily (symbol, day, close) VALUES ('WP408C', '2026-11-23', 70)")
    wl2 = {"lists": [{"id": "main", "name": "My watchlist", "symbols": ["WP408A", "WP408C"]}], "meta": {"WP408A": {"added": added}, "WP408C": {"added": added}}}
    assert (await c.put("/api/me/watchlist", json=wl2)).status_code == 200
    await wp.backfill(app.state.store)
    meta = (await c.get("/api/me/state")).json()["watchlist"]["meta"]
    assert meta["WP408C"]["addedPrice"] == 77.7 and meta["WP408A"]["addedPrice"] == 101.25
    await c.aclose()


def test_the_back_fill_is_a_probe_driven_job_that_never_weakens_another():
    j = JOBS["watchlist-prices"]
    assert j.args == ("backfill-watchlist-prices",) and j.probe == "watchlist-prices" and "watchlist-prices" in LIMIT_POLICY
    assert JOBS["alerts-live"].interval_min == 15 and JOBS["alerts-daily"].daily_at == (19, 10)     # the alert jobs keep their cadence


# ------------------------------------------------------------------------------------------------ change 2: target alerts on the server
def test_target_words_numbers_and_switches():
    assert ta.inr(1396.2) == "1,396.20" and ta.inr(1049215) == "10,49,215.00" and ta.inr(980) == "980.00"
    t, b = ta.message("RELIANCE", 1396.2, 1440, "My watchlist")
    assert t == "RELIANCE is near your target" and b == "RELIANCE at ₹1,396.20 is 3.1% below your target of ₹1,440.00 (My watchlist)."
    assert ta.message("SBIN", 1200, 1180, "Banks")[1] == "SBIN at ₹1,200.00 is 1.7% above your target of ₹1,180.00 (Banks)."
    assert not ADVICE.search(t + " " + b)
    wl = {"lists": [{"id": "a", "name": "Off list", "symbols": ["TCS"], "alerts": {"target": False, "peer": "any", "filings": []}},
                    {"id": "b", "name": "On list", "symbols": ["SBIN", "TCS", "INFY", "ITC"]}],
          "meta": {"SBIN": {"target": 1180, "added": 1}, "TCS": {"target": 4000, "added": 1}, "INFY": {"target": 1500, "added": 1, "nearAlert": False}, "ITC": {"added": 1}}}
    assert ta.targets(wl) == {"TCS": (4000.0, "On list"), "SBIN": (1180.0, "On list")}   # the off list's stock counts through the other list; the box unticked and no target do not
    # once per crossing: fires when it comes near, not again while near, re-arms only more than 5% away, and a new target re-arms it
    assert ta.step(None, None, 100, 96) == (True, ta.SIDE_NEAR)
    assert ta.step(ta.SIDE_NEAR, 100, 100, 97) == (False, ta.SIDE_NEAR)
    assert ta.step(ta.SIDE_NEAR, 100, 100, 96) == (False, ta.SIDE_NEAR)
    assert ta.step(ta.SIDE_NEAR, 100, 100, 94) == (False, ta.SIDE_AWAY)      # 6.4% away (measured on the price, as the page): re-armed
    assert ta.step(ta.SIDE_NEAR, 100, 100, 90) == (False, ta.SIDE_AWAY)
    assert ta.step(ta.SIDE_AWAY, 100, 100, 99) == (True, ta.SIDE_NEAR)
    assert ta.step(ta.SIDE_NEAR, 100, 120, 118) == (True, ta.SIDE_NEAR)
    assert ta.step(1, 100, 100, 99) == (True, ta.SIDE_NEAR)                   # a side stored by the older check is not known: armed


async def test_list_and_stock_switches_decide_who_is_told(app):  # noqa: F811
    from finlit.alerts import check_alerts
    pool, mailer = app.state.store.pool, app.state.mailer
    on = await signed_in(app, "ta408on@example.com", plan="gold")
    off = await signed_in(app, "ta408off@example.com", plan="gold")
    box = await signed_in(app, "ta408box@example.com", plan="silver")
    base = {"id": "main", "name": "Energy", "symbols": ["RELIANCE"]}
    assert (await on.put("/api/me/watchlist", json={"lists": [base], "meta": {"RELIANCE": {"target": 1440, "added": 1}}})).status_code == 200
    assert (await off.put("/api/me/watchlist", json={"lists": [{**base, "alerts": {"target": False, "peer": "any", "filings": []}}],
                                                       "meta": {"RELIANCE": {"target": 1440, "added": 1}}})).status_code == 200
    assert (await box.put("/api/me/watchlist", json={"lists": [base], "meta": {"RELIANCE": {"target": 1440, "added": 1, "nearAlert": False}}})).status_code == 200
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM alert_state WHERE symbol = 'RELIANCE'")
        await conn.execute("DELETE FROM auto_alert_sent WHERE kind = 'target_near'")
        await conn.execute("UPDATE scores SET price = 1396.2 WHERE symbol = 'RELIANCE'")
    assert await check_alerts(pool, mailer, "http://test") == 1
    note = [n for n in (await on.get("/api/notifications")).json()["notifications"] if n["symbol"] == "RELIANCE"]
    assert note[0]["title"] == "RELIANCE is near your target" and note[0]["body"] == "RELIANCE at ₹1,396.20 is 3.1% below your target of ₹1,440.00 (Energy)."
    for c in (off, box):
        assert not [n for n in (await c.get("/api/notifications")).json()["notifications"] if n["title"].endswith("near your target")]
    for c in (on, off, box):
        await c.aclose()


# ------------------------------------------------------------------------------------------------ change 3: screens for a list of stocks
async def test_membership_names_each_stocks_screens_with_place_count_and_join_day(app, store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await conn.execute("TRUNCATE preset_results, screen_runs, screen_snapshots")
    await store.redis.flushdb()
    gold = await signed_in(app, "mem408@example.com", plan="gold")
    silver = await signed_in(app, "mem408s@example.com", plan="silver")
    for pid, syms in (("emerging-tech", ["AAA", "SBIN", "BBB"]), ("highest-rated-large", ["SBIN"])):
        p = BY_ID[pid]
        chips = [c.id for c in p.chips if c.default]
        rows = [{"symbol": x, "position": i} for i, x in enumerate(syms, 1)]
        await service.store_result(store, p, {"chips": chips, "asOf": "2026-11-23", "rows": rows[:1], "exportRows": rows, "count": len(rows)})
    et = BY_ID["emerging-tech"]
    ck = engine.chip_key([c.id for c in et.chips if c.default])
    async with store.pool.acquire() as conn:   # saved lists: SBIN joined emerging-tech on 20 Nov; AAA has been on it since the first list (11 Nov)
        for d, on in (("2026-11-11", ["AAA"]), ("2026-11-19", ["AAA"]), ("2026-11-20", ["AAA", "SBIN"]), ("2026-11-23", ["AAA", "SBIN", "BBB"])):
            await conn.execute("INSERT INTO screen_runs (preset_id, chips, session, registry, n, list_hash) VALUES ($1, $2, $3, 1, $4, 'x')", et.id, ck, date.fromisoformat(d), len(on))
            for i, s in enumerate(on, 1):
                await conn.execute("INSERT INTO screen_snapshots (preset_id, chips, session, symbol, rank, close, row) VALUES ($1, $2, $3, $4, $5, 10, '{}'::jsonb)",
                                   et.id, ck, date.fromisoformat(d), s, i)
    r = await gold.get("/api/screener/membership?symbols=SBIN,aaa,NOPE,SBIN")
    d = r.json()
    assert r.status_code == 200 and d["asOf"] == "2026-11-23" and list(d["symbols"]) == ["SBIN", "AAA", "NOPE"] and d["screens"] >= 50
    sbin = {x["id"]: x for x in d["symbols"]["SBIN"]}
    assert sbin["emerging-tech"] == {"id": "emerging-tech", "name": et.name, "group": "Themes", "added_on": "2026-11-20", "baseline": False, "position": 2, "count": 3}
    assert sbin["highest-rated-large"]["position"] == 1 and sbin["highest-rated-large"]["added_on"] is None   # no saved list for that screen: no join day, never guessed
    aaa = d["symbols"]["AAA"][0]
    assert aaa["added_on"] == "2026-11-11" and aaa["baseline"] is True and d["symbols"]["NOPE"] == []
    assert (await silver.get("/api/screener/membership?symbols=SBIN")).status_code == 403        # Gold, as the screens
    assert (await new_client(app).get("/api/screener/membership?symbols=SBIN")).status_code in (401, 403)
    assert (await gold.get("/api/screener/membership?symbols=bad%20one")).status_code == 422
    for c in (gold, silver):
        await c.aclose()
