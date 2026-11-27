"""Task #289: following tracked investors, the alert on each new filing's moves, and "Your stocks they hold"."""
import json

import pytest

from finlit import superinvestors as si
from finlit import superinvestors_follow as sf
from test_auth import anon, app, signed_in  # noqa: F401  (fixtures and the sign-in helper)
from test_integration import ingested, make_settings, store  # noqa: F401  (fixtures)

KACH = {"key": "ashish-kacholia", "name": "Ashish Kacholia", "filed_names": [{"key": "ashish-kacholia", "as_filed": "Ashish Kacholia"},
                                                                             {"key": "bengal-finance-and-investment-pvt-ltd", "as_filed": "Bengal Finance"}]}


def test_combined_stakes_add_the_filed_names_and_mark_a_source_error():
    stakes = {"ashish-kacholia": {"AAA": {"now": 2.0, "asOf": "Sep 2026"}, "BAD": {"now": 114, "asOf": "Sep 2026"}},
              "bengal-finance-and-investment-pvt-ltd": {"AAA": {"now": 1.5, "asOf": "Sep 2026"}}}
    c = sf.combined(KACH, stakes)
    assert c["AAA"] == {"now": 3.5, "asOf": "Sep 2026", "bad": False}
    assert c["BAD"]["bad"]


def test_the_first_look_only_records_then_each_new_filing_gives_its_moves():
    now = {"AAA": {"now": 2.0, "asOf": "Jun 2026", "bad": False}}
    evs, keep, forget = sf.events(now, {}, {"AAA": "Jun 2026"})
    assert evs == [] and keep == {"AAA": {"stake": 2.0, "asOf": "Jun 2026"}} and forget == []        # no flood of old moves
    seen = keep
    # the same filing read again: nothing
    assert sf.events(now, seen, {"AAA": "Jun 2026"})[0] == []
    # a new filing: stake up; a new company: new stake; a company that filed again without the investor: no longer named
    seen = {**seen, "OLD": {"stake": 1.4, "asOf": "Jun 2026"}, "WAIT": {"stake": 1.1, "asOf": "Jun 2026"}}
    now2 = {"AAA": {"now": 2.5, "asOf": "Sep 2026", "bad": False}, "NEW": {"now": 1.2, "asOf": "Sep 2026", "bad": False}, "ERR": {"now": 0, "asOf": "Sep 2026", "bad": True}}
    evs, keep, forget = sf.events(now2, seen, {"AAA": "Sep 2026", "NEW": "Sep 2026", "OLD": "Sep 2026", "WAIT": "Jun 2026"})
    assert {(e["symbol"], e["move"]) for e in evs} == {("AAA", "added"), ("NEW", "new"), ("OLD", "exited")}     # never the source error, never WAIT
    assert forget == ["OLD"] and keep["WAIT"] == {"stake": 1.1, "asOf": "Jun 2026"}                             # WAIT has not filed again yet
    # a 0.01-point cut is a cut
    evs = sf.events({"AAA": {"now": 5.31, "asOf": "Dec 2026", "bad": False}}, {"AAA": {"stake": 5.32, "asOf": "Sep 2026"}}, {"AAA": "Dec 2026"})[0]
    assert [e["move"] for e in evs] == ["reduced"]


def test_alert_wording():
    t, b = sf.message("Ashish Kacholia", "ESDS Software Solution", {"move": "new", "now": 2.05, "then": None, "asOf": "Sep 2026"})
    assert t == "Ashish Kacholia: new stake in ESDS Software Solution, 2.05% (filing Sep 2026)"
    assert "not investment advice" in b
    t, b = sf.message("Ashish Kacholia", "Radico Khaitan", {"move": "exited", "now": None, "then": 1.05, "asOf": "Sep 2026"})
    assert t == "Ashish Kacholia: no longer named in Radico Khaitan (filing Sep 2026)" and "under 1% or gone" in b
    t, _ = sf.message("X", "Y", {"move": "reduced", "now": 1.0, "then": 1.5, "asOf": "Sep 2026"})
    assert t == "X: stake cut in Y, 1.50% → 1.00% (filing Sep 2026)"
    for w in ("buy", "sell", "target", "signal", "smart money"):
        assert w not in (t + b).lower()


def test_your_stocks_they_hold_by_isin_then_symbol_portfolio_first():
    mine = sf.member_stocks(json.dumps({"holdings": [{"symbol": "titan", "isin": "INE280A01028"}, {"symbol": "INFY"}, {"symbol": "SOLD", "side": "sell"}]}),
                            {"lists": [{"symbols": ["CANBK", "TITAN"]}]})
    assert mine == [("TITAN", "INE280A01028", "Portfolio"), ("INFY", None, "Portfolio"), ("CANBK", None, "Watchlist"), ("TITAN", None, "Watchlist")]
    t = {"investors": {"rekha-jhunjhunwala": {"name": "Rekha Jhunjhunwala", "holdings": [
        {"symbol": "TITAN", "isin": "INE280A01028", "move": "reduced", "moveText": "Stake cut", "sourceError": False},
        {"symbol": "CANBK", "isin": None, "move": "new", "moveText": "New stake", "sourceError": False}]}}}
    rows = sf.overlap(mine, t, {"TITAN": "Titan Company", "INFY": "Infosys", "CANBK": "Canara Bank"})
    assert [(r["symbol"], r["in"], [i["moveText"] for i in r["investors"]]) for r in rows] == [
        ("TITAN", ["Portfolio", "Watchlist"], ["Stake cut"]), ("INFY", ["Portfolio"], []), ("CANBK", ["Watchlist"], ["New stake"])]


ROWS = [{"symbol": "AAA", "as_of": "Jun 2026", "holders": [["Ashish Kacholia", "public", 2.0, 1.0], ["Rekha Jhunjhunwala", "public", 3.0, 3.0]]},
        {"symbol": "BBB", "as_of": "Jun 2026", "holders": [["Ashish Kacholia", "public", 1.5, 1.5], ["Rekha Jhunjhunwala", "public", 1.2, 1.0]]}]


async def _filings(store, rows):
    async with store.pool.acquire() as conn:
        await conn.execute("TRUNCATE ownership_insights")
        for r in rows:
            await conn.execute("INSERT INTO companies (symbol, name) VALUES ($1, $2) ON CONFLICT (symbol) DO NOTHING", r["symbol"], r["symbol"] + " Industries")
            await conn.execute("INSERT INTO ownership_insights (symbol, statement, as_of, rules_version, body, extra, premium_state, premium_at) "
                               "VALUES ($1, 'consolidated', $2, 't', '{}'::jsonb, $3::jsonb, 'ok', now())", r["symbol"], r["as_of"], json.dumps({"holders": r["holders"]}))
    await store.redis.delete(si.CACHE_KEY)
    si._mem = (0.0, None)


@pytest.mark.asyncio
async def test_follow_prefs_alerts_and_overlap_end_to_end(app, anon):  # noqa: F811
    store = app.state.store
    async with store.pool.acquire() as conn:     # the test database outlives a run: start from no follows, nothing seen, nothing sent
        await conn.execute("DELETE FROM si_seen; DELETE FROM si_follows; DELETE FROM auto_alert_sent WHERE kind LIKE 'si:%'")
    await _filings(store, ROWS)
    # Gold only; a visitor is asked to sign in, Silver to move to Gold
    assert (await anon.get("/api/me/superinvestors/follows")).status_code == 401
    silver = await signed_in(app, "silver289f@example.com", plan="silver")
    r = await silver.put("/api/me/superinvestors/follows/ashish-kacholia")
    assert r.status_code == 403 and r.json()["detail"]["plan"] == "gold"
    gold = await signed_in(app, "gold289f@example.com", plan="gold")
    s = (await gold.get("/api/me/superinvestors/follows")).json()
    assert s["follows"] == [] and s["prefs"] == {"new": True, "added": True, "reduced": True, "exited": True} and s["feed"] == []
    assert (await gold.put("/api/me/superinvestors/follows/not-a-tracked-investor")).status_code == 404
    s = (await gold.put("/api/me/superinvestors/follows/ashish-kacholia")).json()
    assert s["follows"] == ["ashish-kacholia"]
    s = (await gold.put("/api/me/superinvestors/alert-prefs", json={"new": True, "added": True, "reduced": False, "exited": True})).json()
    assert s["prefs"]["reduced"] is False
    # the first check only records; then a new quarter with a new stake and a cut: the cut is switched off, so one alert
    pool, mailer = store.pool, app.state.mailer
    assert await sf.follow_alerts(pool, mailer, "http://test") == 0
    await _filings(store, [{"symbol": "AAA", "as_of": "Sep 2026", "holders": [["Ashish Kacholia", "public", 1.5, 1.0]]},
                           {"symbol": "BBB", "as_of": "Jun 2026", "holders": [["Ashish Kacholia", "public", 1.5, 1.5]]},
                           {"symbol": "CCC", "as_of": "Sep 2026", "holders": [["Bengal Finance & Investment Pvt Ltd", "public", 2.05, 0.0]]}])
    assert await sf.follow_alerts(pool, mailer, "http://test") == 1
    assert await sf.follow_alerts(pool, mailer, "http://test") == 0                     # once per investor, company and quarter
    s = (await gold.get("/api/me/superinvestors/follows")).json()
    assert [f["title"] for f in s["feed"]] == ["Ashish Kacholia: new stake in CCC Industries, 2.05% (filing Sep 2026)"]
    assert s["feed"][0]["link"] == "/superinvestors/ashish-kacholia"
    # stop following
    assert (await gold.delete("/api/me/superinvestors/follows/ashish-kacholia")).json()["follows"] == []
    # your stocks they hold: nothing added yet, then a portfolio and a watchlist
    o = (await gold.get("/api/me/superinvestors/overlap")).json()
    assert o["empty"] and "Add stocks to your portfolio or a watchlist" in o["emptyWhy"]
    async with store.pool.acquire() as conn:
        uid = await conn.fetchval("SELECT id FROM users WHERE email = 'gold289f@example.com'")
        await conn.execute("INSERT INTO user_state (user_id, portfolio, watchlist) VALUES ($1, $2::jsonb, $3::jsonb) ON CONFLICT (user_id) DO UPDATE SET portfolio = $2::jsonb, watchlist = $3::jsonb",
                           uid, json.dumps({"holdings": [{"id": "1", "symbol": "AAA", "qty": 1, "price": 1}]}), json.dumps({"lists": [{"id": "w", "name": "W", "symbols": ["ZZZ"]}]}))
    o = (await gold.get("/api/me/superinvestors/overlap")).json()
    rows = {r["symbol"]: r for r in o["rows"]}
    assert rows["AAA"]["in"] == ["Portfolio"] and [i["name"] for i in rows["AAA"]["investors"]] == ["Ashish Kacholia"]
    assert rows["ZZZ"]["in"] == ["Watchlist"] and rows["ZZZ"]["investors"] == []
    si._mem = (0.0, None)
