"""Task #277 (All my investments, 20 Nov pack, change 19): "What changed at the companies you own". The companies are those held directly, or 0.1% or
more of everything through funds and ETFs; the page keeps that list (user_state.invest_list) when it is worked out for all accounts, and the list alert
"All my investments" (one alert for the whole list, 1 of the plan's alerts) reads it on the nightly run."""

import pytest

from finlit import alertengine as eng
from finlit import filingalerts as fa
from finlit.myinvest import calc
from finlit.myinvest import api as mi
from test_auth import app, signed_in  # noqa: F401
from test_etfportfolio_api import DAYS, N500, etf_data  # noqa: F401
from test_etfportfolio_api import URL as ETF_URL
from test_integration import ingested, store  # noqa: F401
from test_mfportfolio_api import schemes  # noqa: F401

URL = "/api/me/all-investments"
C = lambda s, d, a, abroad=False: {"symbol": s, "direct": d, "all": a, "abroad": abroad}   # noqa: E731


def test_the_companies_you_own_direct_or_a_tenth_of_a_percent_through_funds_and_etfs():
    rows = [C("HDFCBANK", 5.0, 9.6), C("TINY", 0.02, 0.02), C("RELIANCE", 0, 1.2), C("SMALL", 0, 0.1), C("DUST", 0, 0.09), C("GOOGL", 0, 2.0, True), C(None, 0, 3.0)]
    assert calc.changes_list(rows) == {"direct": ["HDFCBANK", "TINY"], "through": ["RELIANCE", "SMALL"]}   # abroad and unnamed rows have no NSE filings


def test_the_two_new_lists_and_every_watchlist_together():
    inv = {"at": "2026-11-20T10:00:00+00:00", "direct": ["hdfcbank", "TCS"], "through": ["RELIANCE", "TCS"]}
    w = {"lists": [{"id": "main", "name": "My watchlist", "symbols": ["WHEELS", "TCS"]}, {"id": "b2", "name": "Banks", "symbols": ["SBIN", "WHEELS"]}]}
    ls = {x["ref"]: x for x in fa.lists_of(w, {"holdings": []}, inv)}
    assert ls["invest"]["symbols"] == ["HDFCBANK", "TCS", "RELIANCE"] and ls["invest"]["label"] == "All my investments · the companies you own"
    assert ls["invest:through"]["symbols"] == ["RELIANCE", "TCS"]
    assert ls["watch"]["symbols"] == ["WHEELS", "TCS", "SBIN"] and ls["watch"]["label"] == "Watchlists · All lists"
    assert "invest" not in {x["ref"] for x in fa.lists_of(w, {}, None)}            # not offered before the page has been opened
    for ref in ("invest", "invest:through", "watch"):
        assert fa.LIST_REF.match(ref)
    assert fa.list_page("invest") == "/my-investments#what-changed" and fa.list_page("watch") == "/watchlist#what-changed"


@pytest.mark.integration
@pytest.mark.usefixtures("schemes", "etf_data")
async def test_the_page_keeps_the_list_and_the_alert_reads_it(app, monkeypatch):  # noqa: F811
    async def rows(_app):
        return [{"d": d.isoformat(), "c": v} for d, v in zip(DAYS, N500)]

    async def peers(_store):
        return {}
    monkeypatch.setattr(mi, "_bench", rows)
    monkeypatch.setattr(mi, "_peers", peers)
    c = await signed_in(app, "invest277@example.com", plan="gold")
    assert (await c.post(ETF_URL, json={"symbol": "NIFTYBEES", "qty": "10"})).status_code == 201
    r = await c.post(URL, json={"shares": [{"symbol": "RELIANCE", "qty": 5}]})
    assert r.status_code == 200, r.text
    ch = r.json()["changes"]
    assert ch["direct"] == ["RELIANCE"] and "RELIANCE" not in ch["through"]
    order = [x["ref"] for x in (await c.get("/api/alerts/lists")).json()["lists"]]
    assert {"invest", "invest:through", "watch"} <= set(order) and order[-1] == "mine"   # "mine" stays last, as task #276 keeps it
    lists = {x["ref"]: x for x in (await c.get("/api/alerts/lists")).json()["lists"]}
    assert lists["invest"]["count"] == len(ch["direct"]) + len(ch["through"]) and lists["invest:through"]["count"] == len(ch["through"])
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM discovery_signals")
        await conn.execute("INSERT INTO discovery_signals (feed_id, symbol, item_date, event, title, link) VALUES (5000, 'RELIANCE', current_date - 9, 'rating', 'Old', 'https://x/a.pdf')")
    a = await c.post("/api/alerts", json={"metric": "discover_filing", "op": "event", "list": "invest", "kinds": ["order", "capacity"], "channels": ["app"]})
    assert a.status_code == 201, a.text
    assert len((await c.get("/api/alerts")).json()["alerts"]) == 1                     # one alert for the whole list
    assert await eng.evaluate(app.state.store.pool, app.state.mailer, "http://test", "daily") == 0
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO discovery_signals (feed_id, symbol, item_date, event, title, link) VALUES (5001, 'RELIANCE', current_date, 'order', "
                           "'Receipt of order worth Rs 450 crore', 'https://x/b.pdf')")
    assert await eng.evaluate(app.state.store.pool, app.state.mailer, "http://test", "daily") == 1
    n = (await c.get("/api/notifications")).json()["notifications"]
    assert n[0]["title"].startswith("Order win · ") and n[0]["body"].startswith("At the companies you own")
    # one account picked: the kept list stays the all-accounts one
    before = lists["invest"]["count"]
    assert (await c.post(URL, json={"shares": [], "mfPf": "none", "etfPf": "none"})).status_code == 200
    assert {x["ref"]: x for x in (await c.get("/api/alerts/lists")).json()["lists"]}["invest"]["count"] == before
    await c.aclose()
