"""Task #235 phase 3a (the 18 Nov portfolios pack, C2, C5, C6): the ETF portfolio by demat account, with each buy and sale, first in, first out, against real
Postgres and Redis. The ETF data sources are the stand-ins of test_etfportfolio_api, so the figures are known."""

from decimal import Decimal

import pytest

from finlit.etfportfolio import book
from test_auth import PW, anon, app, make_admin, new_client, signed_in  # noqa: F401
from test_etfportfolio_api import MIGRATION, URL, etf_data, fill  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401

pytestmark = pytest.mark.integration
ACCS = [{"id": "dhan", "name": "Dhan", "broker": "Dhan"}, {"id": "upstox", "name": "Upstox", "broker": "Upstox"}]


@pytest.fixture(autouse=True)
async def book_tables(app, etf_data):  # noqa: F811
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DROP TABLE IF EXISTS etf_lots, etf_books CASCADE")
        await conn.execute((MIGRATION.parent / "112_etf_book.sql").read_text())
    yield


def L(id, sym, pf, d, q, p=None, side="buy"):
    return {"id": id, "symbol": sym, "pf": pf, "side": side, "qty": q, "price": p, "date": d}


def test_open_units_first_in_first_out_within_each_account():
    D = lambda s: __import__("datetime").date.fromisoformat(s)   # noqa: E731
    lots = [L("a", "NIFTYBEES", "dhan", D("2025-01-10"), Decimal(100)), L("b", "NIFTYBEES", "dhan", D("2025-06-10"), Decimal(50)),
            L("c", "NIFTYBEES", "dhan", D("2025-08-01"), Decimal(120), side="sell"),
            L("d", "NIFTYBEES", "upstox", D("2025-02-01"), Decimal(30)), L("e", "NIFTYBEES", "upstox", D("2025-03-01"), Decimal(40), side="sell"),   # larger than held: left out
            L("f", "GOLDBEES", "upstox", None, Decimal(10)), L("g", "GOLDBEES", "upstox", None, Decimal(10), side="sell")]   # sold in full
    assert book.open_units(lots) == {"NIFTYBEES": Decimal(60), "GOLDBEES": Decimal(0)}
    assert book.open_units(lots, "dhan") == {"NIFTYBEES": Decimal(30)}
    assert book.open_units(lots, "upstox") == {"NIFTYBEES": Decimal(30), "GOLDBEES": Decimal(0)}


async def test_a_quantity_from_before_reads_as_one_buy_and_saving_the_book_keeps_the_figures(app):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    await fill(c, ("NIFTYBEES", "GOLDBEES"))
    assert (await c.put(URL + "/quantities", json={"items": [{"symbol": "NIFTYBEES", "qty": 10}]})).status_code == 200
    b = (await c.get(URL + "/book")).json()
    assert b["portfolios"] == [] and b["names"] == ["GOLDBEES"]
    assert b["lots"] == [{"id": "was-NIFTYBEES", "symbol": "NIFTYBEES", "pf": "main", "side": "buy", "qty": 10.0, "price": 0, "date": None, "legacy": True}]
    # two accounts: NIFTYBEES bought in Dhan, part sold; GOLDBEES and NIFTYBEES in Upstox
    lots = [L("n1", "NIFTYBEES", "dhan", "2025-01-10", "100", "250"), L("n2", "NIFTYBEES", "dhan", "2025-06-10", "50", "270"),
            L("n3", "NIFTYBEES", "dhan", "2025-08-01", "120", "280", "sell"), L("u1", "NIFTYBEES", "upstox", "2025-02-01", "20", "255"),
            L("g1", "GOLDBEES", "upstox", "2025-03-01", "200", "60")]
    r = await c.put(URL + "/book", json={"portfolios": ACCS, "lots": lots})
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "saved", "lots": 5, "added": [], "soldInFull": []}
    all_ = (await c.get(URL)).json()
    assert {i["symbol"]: i["qty"] for i in all_["items"]} == {"NIFTYBEES": 50.0, "GOLDBEES": 200.0} and all_["basis"] == "value"
    dhan = (await c.get(URL + "?pf=dhan")).json()
    assert [(i["symbol"], i["qty"]) for i in dhan["items"]] == [("NIFTYBEES", 30.0)] and dhan["count"] == 1
    up = (await c.get(URL + "?pf=upstox")).json()
    assert sorted((i["symbol"], i["qty"]) for i in up["items"]) == [("GOLDBEES", 200.0), ("NIFTYBEES", 20.0)]
    assert (await c.get(URL + "/inside?pf=dhan")).json()["count"] == 1
    assert (await c.get(URL + "?pf=BAD!")).status_code == 422
    b = (await c.get(URL + "/book")).json()
    assert [a["name"] for a in b["portfolios"]] == ["Dhan", "Upstox"] and len(b["lots"]) == 5 and b["lots"][2] == {
        "id": "n3", "symbol": "NIFTYBEES", "pf": "dhan", "side": "sell", "qty": 120.0, "price": 280.0, "date": "2025-08-01"}
    # a typed quantity cannot overwrite an ETF with buys
    r = await c.put(URL + "/quantities", json={"items": [{"symbol": "NIFTYBEES", "qty": 5}]})
    assert r.status_code == 409 and r.json()["detail"]["status"] == "has_buys"


async def test_sold_in_full_leaves_the_list_new_etfs_join_it_and_the_plan_limit_holds(app, monkeypatch):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    lots = [L("m1", "MON100", "dhan", "2025-01-10", "10", "300"), L("m2", "MON100", "dhan", "2025-09-10", "10", "330", "sell"), L("l1", "LIQUIDCASE", "dhan", None, "5")]
    r = await c.put(URL + "/book", json={"portfolios": ACCS[:1], "lots": lots})
    assert r.json()["added"] == ["LIQUIDCASE"] and r.json()["soldInFull"] == []
    assert [i["symbol"] for i in (await c.get(URL)).json()["items"]] == ["LIQUIDCASE"]   # MON100 was sold in full: never in the list
    assert len((await c.get(URL + "/book")).json()["lots"]) == 3                       # its buy and sale stay for the Sold list
    # every buy and sale of an ETF removed: it stays in the list as a name, with no quantity
    r = await c.put(URL + "/book", json={"portfolios": ACCS[:1], "lots": lots[:2]})
    body = (await c.get(URL)).json()
    assert [(i["symbol"], i["qty"]) for i in body["items"]] == [("LIQUIDCASE", None)]
    monkeypatch.setitem(book.__dict__, "DEFAULT_PF", "main")
    from finlit.etfportfolio import api as ep
    monkeypatch.setitem(ep.LIMITS["silver"], "etf_holdings", 1)
    r = await c.put(URL + "/book", json={"portfolios": ACCS[:1], "lots": [L("x", "NIFTYBEES", "dhan", None, "1")]})
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_limit"


async def test_the_book_is_checked_and_belongs_to_its_member(app):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    bad = [({"portfolios": ACCS + [{"id": "x", "name": "dhan"}], "lots": []}, 422),                         # the same name twice
           ({"portfolios": ACCS, "lots": [L("a", "NIFTYBEES", "zerodha", None, "1")]}, 422),                 # an account not in the list
           ({"portfolios": ACCS, "lots": [L("a", "NIFTYBEES", "dhan", None, "1"), L("a", "GOLDBEES", "dhan", None, "1")]}, 422),
           ({"portfolios": ACCS, "lots": [L("a", "NIFTYBEES", "dhan", None, "0")]}, 422),
           ({"portfolios": ACCS, "lots": [L("a", "NOPE", "dhan", None, "1")]}, 404),
           ({"portfolios": [{"id": f"p{i}", "name": f"P{i}"} for i in range(11)], "lots": []}, 422)]
    for body, code in bad:
        assert (await c.put(URL + "/book", json=body)).status_code == code, body
    assert (await c.put(URL + "/book", json={"portfolios": ACCS, "lots": [L("a", "NIFTYBEES", "dhan", None, "4")]})).status_code == 200
    other = await signed_in(app, "o@example.com", plan="silver")
    assert (await other.get(URL + "/book")).json() == {"portfolios": [], "lots": [], "names": []}
    bare = new_client(app)
    bare.cookies = c.cookies
    assert (await bare.put(URL + "/book", json={"portfolios": [], "lots": []})).status_code in (401, 403)
    assert (await (await signed_in(app, "b@example.com")).get(URL + "/book")).status_code == 403


async def test_clear_takes_the_buys_and_undo_brings_them_back_and_remove_takes_an_etfs_buys(app):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    lots = [L("n1", "NIFTYBEES", "dhan", "2025-01-10", "100", "250"), L("n2", "NIFTYBEES", "dhan", "2025-08-01", "40", "280", "sell"), L("g1", "GOLDBEES", "upstox", None, "7")]
    assert (await c.put(URL + "/book", json={"portfolios": ACCS, "lots": lots})).status_code == 200
    assert (await c.post(URL + "/clear")).json()["removed"] == 2
    b = (await c.get(URL + "/book")).json()
    assert b["lots"] == [] and [a["id"] for a in b["portfolios"]] == ["dhan", "upstox"]      # the accounts stay
    assert (await c.post(URL + "/undo-clear")).json()["restored"] == 2
    b = (await c.get(URL + "/book")).json()
    assert sorted(l["id"] for l in b["lots"]) == ["g1", "n1", "n2"]
    assert {i["symbol"]: i["qty"] for i in (await c.get(URL)).json()["items"]} == {"NIFTYBEES": 60.0, "GOLDBEES": 7.0}
    assert (await c.delete(URL + "/GOLDBEES")).status_code == 200
    assert sorted(l["id"] for l in (await c.get(URL + "/book")).json()["lots"]) == ["n1", "n2"]
