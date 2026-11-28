"""The Watchlists page: every stock's peer label in one read (/api/leadership/list) and 'Tell me when a label changes' (finlit/labelalerts.py):
the list's choice is saved with the watchlist, Silver and Gold members are told once per stock and weekly check, and the words never advise."""

import re
from datetime import date, timedelta

import httpx
import pytest

from finlit import labelalerts as la
from finlit import leadership as L
from finlit import leadership_api
from finlit.api import create_app
from test_auth import app, signed_in  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, make_settings, store  # noqa: F401  (fixtures)
from test_leadership import END, _seed

ADVICE = re.compile(r"\b(buy|sell|hold|reduce|avoid|accumulate|target|best|multibagger|top pick)\b", re.I)


def test_choices_read_each_lists_pick_with_the_new_alerts_first_and_nothing_for_a_list_never_saved():
    """Task #408: `alerts.peer` (Alerts for this list) wins; the older `labelAlert` still counts; a list with neither gets nothing (nothing changes until
    Save, though the page shows Any change); Off adds nothing."""
    wl = {"lists": [{"id": "a", "name": "A", "symbols": ["wheels", "SSWL"], "labelAlert": "laggard"},
                    {"id": "b", "name": "B", "symbols": ["SSWL", "TCS"], "labelAlert": "leader"},
                    {"id": "c", "name": "C", "symbols": ["INFY"]},
                    {"id": "d", "name": "D", "symbols": ["ITC"], "labelAlert": "sometimes"},
                    {"id": "e", "name": "E", "symbols": ["HDFCBANK"], "labelAlert": "any", "alerts": {"target": True, "peer": "off", "filings": []}},
                    {"id": "f", "name": "F", "symbols": ["SBIN"], "labelAlert": "any", "alerts": {"target": True, "peer": "leader", "filings": []}}], "meta": {}}
    assert la.choices(wl) == {"WHEELS": {"laggard"}, "SSWL": {"laggard", "leader"}, "TCS": {"leader"}, "SBIN": {"leader"}}
    assert la.choices("not json") == {} and la.choices(None) == {} and la.choices({"lists": "x"}) == {}


def test_wanted_follows_the_three_buttons():
    assert la.wanted({"any"}, "in_line") and la.wanted({"any"}, "leader")
    assert la.wanted({"laggard"}, "laggard") and not la.wanted({"laggard"}, "leader") and not la.wanted({"laggard"}, "in_line")
    assert la.wanted({"leader"}, "leader") and not la.wanted({"leader"}, "laggard")
    assert not la.wanted(set(), "leader")


def test_message_says_what_changed_and_never_advises():
    title, body = la.message({"symbol": "WHEELS", "name": "Wheels India Ltd", "label": "laggard", "before": "leader", "rank": 18, "ranked": 20,
                              "group_short": "Auto Parts: OEM", "group_name": "Auto Parts: OEM", "as_of": date(2026, 11, 6)})
    assert title == "WHEELS is now Laggard"          # task #408, 05-alerts: the pack's words
    assert body == "After the 6 Nov weekly check, WHEELS is Laggard against its Auto Parts: OEM peers (it was Leader). This describes the price; it is not advice."
    assert not ADVICE.search(title + " " + body)


@pytest.mark.integration
async def test_list_endpoint_gives_each_stocks_label_or_the_reason_in_words(store):  # noqa: F811
    await _seed(store)
    settings = make_settings()
    app_ = create_app(settings, store=store)
    async with app_.router.lifespan_context(app_):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app_), base_url="http://test") as c:
            leadership_api._flag["at"] = 0.0
            assert (await c.get("/api/leadership/list?symbols=T00")).json() == {"available": False, "reason": "hidden"}   # switched off: hidden, as on the stock page
            async with store.pool.acquire() as conn:
                await conn.execute("UPDATE feature_flags SET enabled = true WHERE name = 'leadership'")
            leadership_api._flag["at"] = 0.0
            assert (await c.get("/api/leadership/list?symbols=T00")).json() == {"available": False, "reason": "pending"}   # before the first weekly run
            await L.run(store, settings, as_of=END)
            r = await c.get("/api/leadership/list?symbols=T00,t13,NOPE,bad%20sym,T00")
            assert r.status_code == 200 and "public" in r.headers["cache-control"]     # open to every visitor, like the stock page's label
            d = r.json()
            assert d["available"] and d["asOf"] == END.isoformat() and list(d["rows"]) == ["T00", "T13", "NOPE"]
            top, bottom, gone = d["rows"]["T00"], d["rows"]["T13"], d["rows"]["NOPE"]
            single = (await c.get("/api/stocks/T00/leadership")).json()
            assert top["available"] and top["label"] == "leader" and top["rank"] == 1 and top["ranked"] == 14
            assert top["rank"] == single["rank"] and top["rel52"] == single["rel"]["w52"] and top["sector"] == single["benchmarks"]["sector"]["name"]
            assert top["fundamentalRank"] == single["fundamentalRank"] and top["fundamentalOf"] == single["fundamentalOf"] and top["group"] == single["peerGroup"]["short"]
            assert bottom["label"] == "laggard"
            assert gone == {"available": False, "reason": "not_compared", "text": "Not in the last weekly comparison"}   # not in the run at all (task #139), never "under a year of prices"
            assert (await c.get("/api/leadership/list?symbols=")).json()["rows"] == {}
            many = ",".join(f"S{i}" for i in range(leadership_api.MAX_LIST + 1))
            assert (await c.get(f"/api/leadership/list?symbols={many}")).status_code == 400
    async with store.pool.acquire() as conn:   # leave the switch as the other leadership tests expect it: off, and not cached as on
        await conn.execute("UPDATE feature_flags SET enabled = false WHERE name = 'leadership'")
    leadership_api._flag["at"] = 0.0


async def _labels(conn, symbol: str, before: str, after: str, friday: date) -> None:
    await conn.execute("DELETE FROM leadership WHERE symbol = $1", symbol)
    await conn.execute("DELETE FROM leadership_history WHERE symbol = $1", symbol)
    await conn.execute("INSERT INTO leadership (symbol, name, as_of, group_short, group_name, ranked, rank, label, raw_label, label_since) "
                       "VALUES ($1, 'Reliance Industries Ltd', $2, 'Oil & gas', 'Oil & gas', 12, 11, $3, $3, $2)", symbol, friday, after)
    await conn.execute("INSERT INTO leadership_history (symbol, run_date, rank, ranked, label) VALUES ($1, $2, 6, 12, $3), ($1, $4, 11, 12, $5)",
                       symbol, friday - timedelta(days=7), before, friday, after)
    # task #409: the alerts read the weekly record: last week's run with the old label, this week's run (a real one) where it changed
    await conn.execute("DELETE FROM peer_label_week WHERE symbol = $1", symbol)
    for wk, lab, ch in ((friday - timedelta(days=7), before, False), (friday, after, True)):
        rid = f"run-test-{wk.isoformat()}"
        await conn.execute("INSERT INTO peer_label_run (run_id, week_end, status, source) VALUES ($1, $2, 'current', 'run') ON CONFLICT (run_id) DO NOTHING", rid, wk)
        await conn.execute("INSERT INTO peer_label_week (symbol, week_end, run_id, ranked, rank, reading, label, label_since, changed, rule_version, source) "
                           "VALUES ($1, $2, $3, 12, $4, $5, $5, $2, $6, 'two-runs-v1', 'run')", symbol, wk, rid, 6 if not ch else 11, lab, ch)


async def test_label_change_alerts_follow_each_lists_choice_once_per_week(app):  # noqa: F811
    any_ = await signed_in(app, "lbany@example.com", plan="silver")
    lead = await signed_in(app, "lblead@example.com", plan="gold")
    lag = await signed_in(app, "lblag@example.com", plan="gold")
    none = await signed_in(app, "lbnone@example.com", plan="silver")
    off = await signed_in(app, "lboff@example.com", plan="silver")
    basic = await signed_in(app, "lbbasic@example.com", plan="basic")
    for c, pick in ((any_, "any"), (lead, "leader"), (lag, "laggard"), (none, None)):
        lst = {"id": "main", "name": "Main", "symbols": ["RELIANCE"], **({"labelAlert": pick} if pick else {})}
        assert (await c.put("/api/me/watchlist", json={"lists": [lst], "meta": {}})).status_code == 200
    off_list = {"id": "main", "name": "Main", "symbols": ["RELIANCE"], "labelAlert": "any", "alerts": {"target": True, "peer": "off", "filings": ["order"]}}
    assert (await off.put("/api/me/watchlist", json={"lists": [off_list], "meta": {}})).status_code == 200
    assert (await off.get("/api/me/state")).json()["watchlist"]["lists"][0]["alerts"] == {"target": True, "peer": "off", "filings": ["order"]}
    bad_alerts = {"lists": [{**off_list, "alerts": {"target": True, "peer": "sometimes", "filings": []}}], "meta": {}}
    assert (await off.put("/api/me/watchlist", json=bad_alerts)).status_code == 422
    saved = (await any_.get("/api/me/state")).json()
    assert saved["watchlist"]["lists"][0]["labelAlert"] == "any"
    assert "labelAlert" not in (await none.get("/api/me/state")).json()["watchlist"]["lists"][0]   # no choice: nothing stored
    bad = {"lists": [{"id": "main", "name": "Main", "symbols": ["RELIANCE"], "labelAlert": "sometimes"}], "meta": {}}
    assert (await any_.put("/api/me/watchlist", json=bad)).status_code == 422
    # a Basic member's list (it cannot be saved through the API) never gets the alert
    async with app.state.store.pool.acquire() as conn:
        uid = await conn.fetchval("SELECT id FROM users WHERE email = 'lbbasic@example.com'")
        await conn.execute("INSERT INTO user_state (user_id, watchlist) VALUES ($1, $2::jsonb) ON CONFLICT (user_id) DO UPDATE SET watchlist = EXCLUDED.watchlist",
                           uid, '{"lists": [{"id": "main", "name": "Main", "symbols": ["RELIANCE"], "labelAlert": "any"}], "meta": {}}')
        await conn.execute("DELETE FROM auto_alert_sent WHERE kind = 'label_change'")
        await conn.execute("DELETE FROM leadership")
        await _labels(conn, "RELIANCE", "in_line", "laggard", date(2026, 11, 6))
    pool, mailer = app.state.store.pool, app.state.mailer
    assert await la.auto_label_alerts(pool, mailer, "http://test") == 2          # Any change and Only to Laggard; not Only to Leader, a list never saved, Off or Basic
    assert await la.auto_label_alerts(pool, mailer, "http://test") == 0          # the same change of the same week is told once
    note = [n for n in (await any_.get("/api/notifications")).json()["notifications"] if n["symbol"] == "RELIANCE"]
    assert note and note[0]["title"] == "RELIANCE is now Laggard" and note[0]["link"] == "/stocks/RELIANCE"
    for c in (lead, none, off, basic):
        assert not [n for n in (await c.get("/api/notifications")).json()["notifications"] if n["symbol"] == "RELIANCE" and n["title"].startswith("RELIANCE is now")]
    # the next week the stock becomes a Leader: Only to Leader hears about it, Only to Laggard does not
    async with app.state.store.pool.acquire() as conn:
        await _labels(conn, "RELIANCE", "laggard", "leader", date(2026, 11, 13))
    assert await la.auto_label_alerts(pool, mailer, "http://test") == 2          # Any change and Only to Leader; a list never saved still hears nothing
    # a stock seen for the first time, or one whose label stayed the same, is not a change
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM leadership_history WHERE symbol = 'RELIANCE' AND run_date < '2026-11-13'")
        await conn.execute("DELETE FROM peer_label_week WHERE symbol = 'RELIANCE' AND week_end < '2026-11-13'")   # task #409: the record is what the alerts read
        await conn.execute("DELETE FROM auto_alert_sent WHERE kind = 'label_change'")
    assert await la.auto_label_alerts(pool, mailer, "http://test") == 0
