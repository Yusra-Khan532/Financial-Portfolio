"""Task #272 (Watchlists and Alerts, 20 Nov pack): list alerts on the filings Discover sorts, the bell's two formats, the tax / customs / court guard,
the member's last visit per page and GET /api/discovery/changes."""

from datetime import date, timedelta

import pytest

from finlit import alertengine as eng
from finlit import filingalerts as fa
from test_auth import app, signed_in  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: F401  (fixtures)

pytestmark = pytest.mark.integration
LISTS = {"lists": [{"id": "main", "name": "My watchlist", "symbols": ["RELIANCE", "WHEELS"]}, {"id": "b2", "name": "Banks", "symbols": ["HDFCBANK"]}], "meta": {}}


async def run(app):
    return await eng.evaluate(app.state.store.pool, app.state.mailer, "http://test", "daily")


async def seed(app, start=1000):
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM discovery_signals")
        await conn.execute("INSERT INTO discovery_companies (symbol, company, doc_link, status, primary_bucket) VALUES ('RELIANCE', 'Reliance Industries', "
                           "'https://nsearchives.nseindia.com/x.pdf', 'ok', 'Corporate Catalysts & Growth Signals') ON CONFLICT (symbol) DO UPDATE SET primary_bucket = EXCLUDED.primary_bucket")
        await conn.execute("INSERT INTO discovery_signals (feed_id, symbol, item_date, event, title, link) VALUES ($1, 'RELIANCE', current_date - 3, 'rating', 'Credit Rating', "
                           "'https://nsearchives.nseindia.com/r.pdf')", start)


async def add_signal(app, fid, sym, event, title, days_ago=0):
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO discovery_signals (feed_id, symbol, item_date, event, title, link) VALUES ($1, $2, current_date - $3::int, $4, $5, "
                           "'https://nsearchives.nseindia.com/f.pdf')", fid, sym, days_ago, event, title)


def test_tax_customs_and_court_orders_are_never_order_wins_or_capacity():
    for t in ("Order passed by the GST authority demanding Rs 2 crore", "Receipt of order from Customs department", "Income Tax assessment order received",
              "Order of the Hon'ble High Court in a writ petition", "NCLT order on the scheme", "Penalty order under SEBI rules", "Show cause notice received"):
        assert fa.blocked("order", t) and fa.blocked("capacity", t), t
    assert not fa.blocked("order", "Receipt of order worth Rs 450 crore from NHAI for a highway project")
    assert not fa.blocked("capacity", "Commissioning of 2 GW module line at Mundra")
    assert not fa.blocked("legal", "Income Tax assessment order received")    # a legal / regulatory alert is about exactly such orders


def test_lists_resolve_equity_accounts_watchlists_and_mine():
    pf = {"holdings": [{"symbol": "TCS"}, {"symbol": "INFY", "pf": "z2"}], "portfolios": [{"id": "z1", "name": "Zerodha"}, {"id": "z2", "name": "Groww"}]}
    ls = {x["ref"]: x for x in fa.lists_of(LISTS, pf)}
    assert ls["equity"]["symbols"] == ["TCS", "INFY"] and ls["equity:z1"]["symbols"] == ["TCS"] and ls["equity:z2"]["symbols"] == ["INFY"]
    assert ls["watch:main"]["symbols"] == ["RELIANCE", "WHEELS"] and ls["watch:b2"]["label"] == "Watchlist · Banks"
    assert ls["mine"]["symbols"] == ["TCS", "INFY", "RELIANCE", "WHEELS", "HDFCBANK"]
    assert "equity:z1" not in {x["ref"] for x in fa.lists_of(LISTS, {"holdings": [{"symbol": "TCS"}]})}   # one account: no per-account line


def test_bell_words_for_one_filing_and_one_summary_a_day():
    t, b, link = fa.bell_one({"symbol": "WELCORP", "name": "Welspun Corp", "event": "order", "title": "Order worth Rs 1,200 crore", "item_date": date(2026, 11, 19)},
                             "On your watchlist · my watchlist")
    assert t == "Order win · Welspun Corp" and "Order worth Rs 1,200 crore (19 Nov)" in b and b.endswith("sent on the evening of the day it is filed")
    assert link == "/discover/changes/order?q=Welspun%20Corp"
    t, b, link = fa.bell_summary([{"symbol": "TECHM", "name": "Tech Mahindra", "event": "fundraise", "item_date": date(2026, 11, 19)},
                                  {"symbol": "ZENSARTECH", "name": "Zensar Technologies", "event": "management", "item_date": date(2026, 11, 15)}],
                                 date(2026, 11, 12), "/holdings#what-changed")
    assert t == "2 filings at your companies since 12 Nov" and b == "Tech Mahindra: fund raising (19 Nov) · Zensar Technologies: management (15 Nov)"


async def test_a_list_alert_is_one_alert_fires_per_filing_and_skips_a_tax_order(app):
    c = await signed_in(app, "lists@example.com", plan="gold")
    assert (await c.put("/api/me/watchlist", json=LISTS)).status_code == 200
    await seed(app)
    lists = (await c.get("/api/alerts/lists")).json()
    assert {"ref": "watch:main", "label": "Watchlist · My watchlist", "count": 2} in lists["lists"] and lists["kinds"]["order"] == "Order win"
    r = await c.post("/api/alerts", json={"metric": "discover_filing", "op": "event", "list": "watch:main", "kinds": ["order", "capacity"], "channels": ["app"]})
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["list"] == "watch:main" and a["kinds"] == ["order", "capacity"] and a["symbol"] == "" and a["repeat"] == "every"
    assert (await c.post("/api/alerts", json={"metric": "discover_filing", "op": "event", "list": "watch:main", "kinds": ["capacity", "order"]})).status_code == 409
    assert (await c.post("/api/alerts", json={"metric": "discover_filing", "op": "event", "list": "watch:nope", "kinds": ["order"]})).status_code == 404
    assert (await c.post("/api/alerts", json={"metric": "price", "op": "above", "value": 10, "list": "watch:main"})).status_code == 422
    assert (await c.post("/api/alerts", json={"metric": "discover_filing", "op": "event", "list": "watch:main", "kinds": []})).status_code == 422
    assert len((await c.get("/api/alerts")).json()["alerts"]) == 1                      # one alert for the whole list
    assert await run(app) == 0                                                          # the old credit rating does not count
    await add_signal(app, 1001, "RELIANCE", "order", "Receipt of order worth Rs 450 crore from NHAI")
    await add_signal(app, 1002, "RELIANCE", "order", "Order passed by the GST authority demanding Rs 2 crore")   # a tax order sorted as an order win
    await add_signal(app, 1003, "RELIANCE", "management", "Appointment of a director")                      # a kind not picked
    await add_signal(app, 1004, "HDFCBANK", "order", "Order worth Rs 10 crore")                             # a company on another list
    assert await run(app) == 1
    n = (await c.get("/api/notifications")).json()["notifications"]
    assert len(n) == 1 and n[0]["title"] == "Order win · Reliance Industries" and "NHAI" in n[0]["body"] and "GST" not in n[0]["body"]
    assert n[0]["link"] == "/discover/changes/order?q=Reliance%20Industries" and n[0]["body"].startswith("On your watchlist · my watchlist")
    assert await run(app) == 0                                                          # nothing new
    await c.aclose()


async def test_one_summary_a_day_lists_both_filings_in_one_bell_item(app):
    c = await signed_in(app, "digest@example.com", plan="gold")
    assert (await c.put("/api/me/watchlist", json=LISTS)).status_code == 200
    await seed(app, 2000)
    r = await c.post("/api/alerts", json={"metric": "discover_filing", "op": "event", "list": "mine", "kinds": ["fundraise", "management"], "digest": True})
    assert r.status_code == 201 and r.json()["digest"] is True
    await add_signal(app, 2001, "RELIANCE", "fundraise", "Allotment of shares")
    await add_signal(app, 2002, "HDFCBANK", "management", "Change in Management")
    assert await run(app) == 1
    n = (await c.get("/api/notifications")).json()["notifications"]
    assert len(n) == 1 and n[0]["title"].startswith("2 filings at your companies since ") and n[0]["link"] == "/watchlist#what-changed"
    assert ": fund raising (" in n[0]["body"] and ": management (" in n[0]["body"]
    await add_signal(app, 2003, "RELIANCE", "fundraise", "Allotment of debentures")
    assert await run(app) == 0                                                          # one summary a day: the next waits for tomorrow
    await c.aclose()


async def test_a_list_alert_counts_as_one_of_the_plan_and_needs_silver(app):
    basic = await signed_in(app, "basicl@example.com")
    await basic.put("/api/me/watchlist", json=LISTS)
    r = await basic.post("/api/alerts", json={"metric": "discover_filing", "op": "event", "list": "watch:main", "kinds": ["order"]})
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_required"
    await basic.aclose()


async def test_last_visit_per_page_rolls_only_after_30_minutes(app):
    c = await signed_in(app, "visit@example.com", plan="silver")
    assert (await c.post("/api/visits/watchlist")).json() == {"previous": None}
    assert (await c.post("/api/visits/watchlist")).json() == {"previous": None}       # a reload keeps what is new
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("UPDATE page_visits SET seen_at = now() - interval '8 days' WHERE page = 'watchlist'")
    prev = (await c.post("/api/visits/watchlist")).json()["previous"]
    assert prev and date.fromisoformat(prev[:10]) <= date.today() - timedelta(days=7)
    assert (await c.post("/api/visits/holdings")).json() == {"previous": None}         # per page
    assert (await c.post("/api/visits/Bad_Page")).status_code == 422
    await c.aclose()


async def test_changes_read_names_unplaced_companies_and_counts_each_kind(app):
    await seed(app, 3000)
    await add_signal(app, 3001, "RELIANCE", "rating", "Credit Rating revised", 10)
    await add_signal(app, 3002, "RELIANCE", "fundraise", "Allotment of NCDs", 20)
    await add_signal(app, 3003, "RELIANCE", "order", "Old order", 200)                  # outside the 90 days
    from test_auth import new_client
    c = new_client(app)
    r = await c.get("/api/discovery/changes?symbols=RELIANCE,WHEELS")
    assert r.status_code == 200 and r.headers["cache-control"] == "private, max-age=300"
    d = r.json()
    co = d["companies"][0]
    assert co["s"] == "RELIANCE" and co["n"] == "Reliance Industries" and set(co["ev"]) == {"rating", "fundraise"}
    assert co["ev"]["rating"]["n"] == 2 and co["ev"]["rating"]["t"] == "Credit Rating" and co["ev"]["rating"]["l"].startswith("https://nsearchives")
    assert d["notPlaced"] == [{"s": "WHEELS", "n": "WHEELS"}] or d["notPlaced"][0]["s"] == "WHEELS"
    assert (await c.get("/api/discovery/changes?symbols=bad sym")).status_code == 400
    await c.aclose()
