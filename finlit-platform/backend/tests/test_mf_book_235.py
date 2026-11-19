"""Task #235 phase 3b (the 18 Nov portfolios pack, C1, C5, C6): the MF portfolio by platform, with each buy and sale, first in, first out within each fund and
platform, against real Postgres and Redis. Schemes and NAVs are the stand-ins of test_mfportfolio_api (Alpha Bluechip at 150, Delta Small Cap at 60)."""

from datetime import date
from decimal import Decimal

import pytest

from finlit.mfportfolio import book
from test_auth import PW, anon, app, make_admin, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_mfportfolio_api import BASE, URL, schemes  # noqa: F401

pytestmark = pytest.mark.integration
PLATS = [{"id": "groww", "name": "Groww", "broker": "Groww"}, {"id": "coin", "name": "Coin by Zerodha", "broker": "Coin by Zerodha"}]


def test_open_lots_first_in_first_out_with_the_cost_cut_in_proportion():
    D = date.fromisoformat
    lots = [{"id": "a", "units": Decimal(100), "invested": Decimal(1000), "bought_on": D("2025-01-01"), "pf": "groww", "side": "buy"},
            {"id": "b", "units": Decimal(50), "invested": Decimal(600), "bought_on": D("2025-02-01"), "pf": "groww", "side": "buy"},
            {"id": "c", "units": Decimal(120), "invested": Decimal(1800), "bought_on": D("2025-03-01"), "pf": "groww", "side": "sell"},
            {"id": "d", "units": Decimal(10), "invested": Decimal(100), "bought_on": D("2025-01-05"), "pf": "coin", "side": "buy"},
            {"id": "e", "units": Decimal(99), "invested": Decimal(9), "bought_on": D("2025-01-06"), "pf": "coin", "side": "sell"}]   # larger than held: left out
    left = {l["id"]: (l["units"], l["invested"]) for l in book.open_lots(lots)}
    assert left == {"b": (Decimal(30), Decimal("360.00")), "d": (Decimal(10), Decimal(100))}
    assert [l["id"] for l in book.open_lots(lots, "coin")] == ["d"]
    assert {l["id"] for l in book.open_lots(lots, "coin,groww")} == {"b", "d"} and book.pf_set("all") is None   # task #248: several platforms


async def test_platforms_sales_and_one_platform_at_a_time(app):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    assert (await c.get(URL + "/book")).json() == {"portfolios": []}
    assert (await c.put(URL + "/book", json={"portfolios": [{"id": "main", "name": "My funds"}] + PLATS})).status_code == 200
    r = await c.post(URL, json={"code": BASE + 1, "units": "100", "invested": "10000", "boughtOn": "2025-01-10", "pf": "groww"})
    hid = r.json()["id"]
    lines = [{"units": "100", "invested": "10000", "boughtOn": "2025-01-10", "pf": "groww"}, {"units": "50", "avgCost": "120", "boughtOn": "2025-03-10", "pf": "groww"},
             {"units": "120", "avgCost": "140", "boughtOn": "2025-06-10", "pf": "groww", "side": "sell"}, {"units": "20", "invested": "2000", "boughtOn": "2025-02-01", "pf": "coin"}]
    assert (await c.put(f"{URL}/{hid}", json={"lots": lines})).status_code == 200
    await c.post(URL, json={"code": BASE + 5, "units": "10", "invested": "500", "pf": "coin"})
    all_ = (await c.get(URL)).json()
    alpha = next(h for h in all_["holdings"] if h["code"] == BASE + 1)
    assert alpha["units"] == 50.0 and alpha["invested"] == pytest.approx(3600 + 2000)        # 30 left of the 120 buy (30 × 120) and the Coin buy
    assert [(l["pf"], l["side"], l["units"]) for l in alpha["lines"]] == [("groww", "buy", 100.0), ("groww", "buy", 50.0), ("groww", "sell", 120.0), ("coin", "buy", 20.0)]
    g = (await c.get(URL + "?pf=groww")).json()
    assert [(h["code"], h["units"]) for h in g["holdings"]] == [(BASE + 1, 30.0)]
    coin = (await c.get(URL + "?pf=coin")).json()
    assert sorted((h["code"], h["units"]) for h in coin["holdings"]) == [(BASE + 1, 20.0), (BASE + 5, 10.0)]
    assert (await c.get(URL + "/diversification?pf=coin")).status_code == 200
    assert (await c.get(URL + "?pf=Bad")).status_code == 422
    # task #248: the dashboard's Showing picker asks for several platforms at once: each first in, first out on its own, then added
    both = (await c.get(URL + "?pf=groww,coin")).json()
    assert sorted((h["code"], h["units"]) for h in both["holdings"]) == [(BASE + 1, 50.0), (BASE + 5, 10.0)]
    assert (await c.get(URL + "/diversification?pf=groww,coin")).status_code == 200
    assert (await c.get(URL + "/risk?pf=coin,groww")).status_code != 422        # accepted (the stand-in schemes have no NAV history, so risk answers 503 here)
    assert (await c.get(URL + "?pf=groww,")).status_code == 422 and (await c.get(URL + "?pf=" + ",".join(["a"] * 11))).status_code == 422


async def test_a_fund_sold_in_full_leaves_the_figures_and_stays_for_the_sold_list(app):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    hid = (await c.post(URL, json={"code": BASE + 5, "units": "10", "invested": "500", "boughtOn": "2025-01-01"})).json()["id"]
    await c.post(URL, json={"code": BASE + 1, "units": "1", "invested": "100"})
    assert (await c.put(f"{URL}/{hid}", json={"lots": [{"units": "10", "invested": "500", "boughtOn": "2025-01-01"},
                                                       {"units": "10", "avgCost": "70", "boughtOn": "2025-05-01", "side": "sell"}]})).status_code == 200
    body = (await c.get(URL)).json()
    assert [h["code"] for h in body["holdings"]] == [BASE + 1] and body["count"] == 1
    assert body["sold"] == [{"id": hid, "code": BASE + 5, "folio": "", "name": "Delta Small Cap Fund - Direct Plan - Growth",
                             "lines": [{"id": body["sold"][0]["lines"][0]["id"], "units": 10.0, "invested": 500.0, "boughtOn": "2025-01-01", "pf": "main", "side": "buy"},
                                       {"id": body["sold"][0]["lines"][1]["id"], "units": 10.0, "invested": 700.0, "boughtOn": "2025-05-01", "pf": "main", "side": "sell"}]}]


async def test_platforms_are_checked_a_removed_one_takes_its_lines_and_clear_keeps_them_for_undo(app):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    assert (await c.put(URL + "/book", json={"portfolios": PLATS + [{"id": "x", "name": "groww"}]})).status_code == 422
    assert (await c.put(URL + "/book", json={"portfolios": [{"id": "Bad!", "name": "B"}]})).status_code == 422
    assert (await c.put(URL + "/book", json={"portfolios": PLATS})).status_code == 200
    hid = (await c.post(URL, json={"code": BASE + 1, "units": "5", "invested": "500", "pf": "groww"})).json()["id"]
    await c.put(f"{URL}/{hid}", json={"lots": [{"units": "5", "invested": "500", "pf": "groww"}, {"units": "2", "invested": "250", "pf": "coin"}]})
    assert (await c.post(URL + "/clear")).status_code == 200 and (await c.post(URL + "/undo-clear")).status_code == 200
    h = (await c.get(URL)).json()["holdings"][0]
    assert sorted((l["pf"], l["units"]) for l in h["lines"]) == [("coin", 2.0), ("groww", 5.0)]
    r = await c.put(URL + "/book", json={"portfolios": PLATS[:1]})
    assert r.json()["removedLines"] == 1
    assert [(l["pf"], l["units"]) for l in (await c.get(URL)).json()["holdings"][0]["lines"]] == [("groww", 5.0)]
    other = await signed_in(app, "o@example.com", plan="silver")
    assert (await other.get(URL + "/book")).json() == {"portfolios": []}
