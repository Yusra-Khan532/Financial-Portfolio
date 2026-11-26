"""POST /api/me/all-investments (task #137, 15 Nov 2026 pack) against real Postgres and Redis: plan gating (Silver and Gold; no company score for Silver (task #283 PR C retired the FinLit IQ), Prism for Gold;
the funds' Health Score Gold only), the funds read from the member's MF portfolio, the ETFs from the ETF portfolio (a change on either page shows here),
quantities deciding the weights, each kind counting the same without them, the look-through through ETFs, the peer words, the named missing files and the
risk figures per kind. The ETF and index sources are stood in for (the ETF portfolio tests' own data), so the figures are known."""

import pytest

from finlit.myinvest import api as mi
from test_auth import app, new_client, signed_in  # noqa: F401
from test_etfportfolio_api import DAYS, N500, ROWS, etf_data  # noqa: F401
from test_etfportfolio_api import URL as ETF_URL
from test_integration import ingested, make_settings, store  # noqa: F401
from test_mfportfolio_api import BASE, add, schemes  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("schemes", "etf_data")]
URL = "/api/me/all-investments"


@pytest.fixture(autouse=True)
def bench(monkeypatch):
    async def rows(_app):
        return [{"d": d.isoformat(), "c": v} for d, v in zip(DAYS, N500)]

    async def peers(_store):
        return {"HDFCBANK": "leader"}

    monkeypatch.setattr(mi, "_bench", rows)
    monkeypatch.setattr(mi, "_peers", peers)


async def etf(c, sym, qty=None):
    r = await c.post(ETF_URL, json={"symbol": sym, **({"qty": qty} if qty else {})})
    assert r.status_code == 201, r.text


async def test_visitors_and_basic_are_refused(app):  # noqa: F811
    assert (await new_client(app).post(URL, json={"shares": []})).status_code in (401, 403)
    basic = await signed_in(app, "b@example.com")
    r = await basic.post(URL, json={"shares": []})
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_required"


async def test_funds_and_etfs_with_quantities_weigh_by_money(app):  # noqa: F811
    """D1: the three lists are read here; with quantities the money decides; B6: ETFs are counted, not "coming"; B3/D18: each kind has its own measure."""
    c = await signed_in(app, "s@example.com", plan="silver")
    assert (await add(c, BASE + 1, "100")).status_code in (200, 201)                                   # 100 units x NAV 150 = 15,000
    await etf(c, "NIFTYBEES", "10")                                                                     # 10 x 286.64
    await etf(c, "MON100", "5")                                                                         # 5 x 302.35
    r = await c.post(URL, json={"shares": []})
    assert r.status_code == 200, r.text
    b = r.json()
    etfs = 2866.4 + 1511.75
    assert b["plan"] == "silver" and b["byValue"] is True and b["total"] == pytest.approx(15000 + etfs, abs=0.01) and b["missing"] == []
    assert b["counts"] == {"shares": 0, "funds": 1, "etfs": 2} and b["quantities"] == {"have": 3, "of": 3}
    assert b["cards"]["funds"]["share"] == pytest.approx(15000 / (15000 + etfs) * 100, abs=0.01) and b["cards"]["funds"]["value"] == 15000
    assert b["cards"]["funds"]["scoreLocked"] is True and b["cards"]["funds"]["score"] is None                 # the Health Score is Gold
    assert b["cards"]["shares"]["scoreModel"] is None and b["cards"]["shares"]["scoreLocked"] is True and b["health"]["shares"] is None and b["cards"]["etfs"]["count"] == 2   # task #283 PR C and "soon" not in b["cards"]["etfs"]
    assert "subject to market risks" in b["disclaimer"] and "not investment advice" in b["disclaimer"]
    await etf(c, "GOLDBEES", "1")                                                                       # changed on the ETF portfolio page ...
    assert (await c.post(URL, json={"shares": []})).json()["counts"]["etfs"] == 3                     # ... changes this page


async def test_without_quantities_each_kind_counts_the_same_and_no_rupee_value(app):  # noqa: F811
    """B1, B2, D8, D9: an ETF without a quantity: each kind counts the same (1/2 with two kinds), no total and no value anywhere."""
    c = await signed_in(app, "s2@example.com", plan="silver")
    await add(c, BASE + 1, "100")
    await etf(c, "NIFTYBEES")
    b = (await c.post(URL, json={"shares": []})).json()
    assert b["byValue"] is False and b["total"] is None and b["missing"] == ["etfs"]
    assert b["cards"]["funds"]["share"] == 50.0 and b["cards"]["etfs"]["share"] == 50.0
    assert b["cards"]["funds"]["value"] is None and b["cards"]["etfs"]["firstIs"] == "list"
    assert b["risk"].get("fall10", {"value": None})["value"] is None


async def test_look_through_names_missing_files_and_uses_peer_words(app):  # noqa: F811
    """D14, D15, B4/D12, D10, D11: every line of each ETF file; a fund without a file is named; Leader / Not on your list; held markers; filter counts."""
    c = await signed_in(app, "g@example.com", plan="gold")
    await add(c, BASE + 1, "100")
    await etf(c, "NIFTYBEES", "10")
    await etf(c, "MON100", "5")
    b = (await c.post(URL, json={"shares": []})).json()
    comp = {x["symbol"] or x["name"]: x for x in b["companies"]}
    assert comp["HDFCBANK"]["held"] == ["E"] and comp["HDFCBANK"]["via"] == ["NIFTYBEES"]
    assert comp["HDFCBANK"]["peer"] == "Not on your list"                                      # held only through an ETF
    assert comp["NVIDIA Corp"]["abroad"] and comp["NVIDIA Corp"]["macro"] == "Listed abroad"            # a share listed abroad still counts
    assert b["filters"] == {"all": 3, "twice": 0, "through": 3, "direct": 0}
    assert {"kind": "funds", "name": b["funds"][0]["short"]} in b["madeOf"]["notLoaded"]                # the fund's file is not loaded: named
    assert b["cards"]["shares"]["scoreModel"] == "prism"
    assert all(p not in str(b) for p in ("'leader'", "'in_line'", "'laggard'"))


async def test_risk_per_kind_and_together(app):  # noqa: F811
    """D16: beta together = sum of share x beta when every kind has one; otherwise no figure, and the reason names the kind."""
    c = await signed_in(app, "r@example.com", plan="silver")
    await etf(c, "NIFTYBEES", "10")
    await etf(c, "SBINIFTY50", "10")
    b = (await c.post(URL, json={"shares": []})).json()
    k = b["risk"]["kinds"]["etfs"]
    assert k["beta"] == pytest.approx(1.0, abs=0.05) and k["swing"] is not None and k["worstFall"] is not None   # both follow the index closely
    assert b["risk"]["beta"] == k["beta"] and b["risk"]["band"] == "Similar" and b["risk"]["parts"][0]["riskShare"] == 100.0
    assert b["risk"]["bench"]["name"] == "Nifty 500"
    await add(c, BASE + 1, "100")                                                                       # a fund with no NAV history: no beta
    b = (await c.post(URL, json={"shares": []})).json()
    assert b["risk"]["beta"] is None and "mutual funds" in b["risk"]["why"]


async def test_bad_bodies_are_refused(app):  # noqa: F811
    c = await signed_in(app, "s3@example.com", plan="silver")
    b = (await c.post(URL, json={"shares": [{"symbol": "NOTALISTEDCO", "qty": None}]})).json()
    assert b["unknown"] == ["NOTALISTEDCO"]                                                            # not a company FinLit lists: said, never guessed
    assert (await c.post(URL, json={"shares": [{"symbol": "bad symbol!", "qty": 1}]})).status_code == 422
    assert (await c.post(URL, json={"shares": [{"symbol": "TCS", "qty": 1, "price": 5}]})).status_code == 422


async def test_235_one_account_across_the_three_pages_and_what_was_invested(app):  # noqa: F811
    """Task #235 (pack C3): the accounts filter: the MF platform and the ETF account of one account; what the units still held cost, first in, first out."""
    from test_etf_book_235 import book_tables  # noqa: F401  (the ETF book tables)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DROP TABLE IF EXISTS etf_lots, etf_books CASCADE")
        from pathlib import Path
        await conn.execute((Path(mi.__file__).parent.parent / "migrations" / "112_etf_book.sql").read_text())
    c = await signed_in(app, "s@example.com", plan="silver")
    hid = (await add(c, BASE + 1, "100", invested="10000", boughtOn="2025-01-10", pf="upstox")).json()["id"]
    await c.put(f"/api/me/mf-portfolio/{hid}", json={"lots": [{"units": "100", "invested": "10000", "boughtOn": "2025-01-10", "pf": "upstox"},
                                                            {"units": "40", "avgCost": "120", "boughtOn": "2025-05-10", "pf": "upstox", "side": "sell"}]})
    accs = [{"id": "upstox", "name": "Upstox"}, {"id": "dhan", "name": "Dhan"}]
    lots = [{"id": "n1", "symbol": "NIFTYBEES", "pf": "dhan", "side": "buy", "qty": "10", "price": "250", "date": "2025-01-01"},
            {"id": "m1", "symbol": "MON100", "pf": "upstox", "side": "buy", "qty": "5", "price": "300", "date": "2025-01-01"},
            {"id": "m2", "symbol": "MON100", "pf": "upstox", "side": "buy", "qty": "5", "date": "2025-02-01"}]
    assert (await c.put(ETF_URL + "/book", json={"portfolios": accs, "lots": lots})).status_code == 200
    b = (await c.post(URL, json={"shares": []})).json()
    assert [(f["units"], f["invested"]) for f in b["funds"]] == [(60.0, 6000.0)]                      # 60 left of the 100 bought for 10,000
    assert {e["symbol"]: e["invested"] for e in b["etfs"]} == {"NIFTYBEES": 2500.0, "MON100": None}    # a buy with no price: not known
    up = (await c.post(URL, json={"shares": [], "mfPf": "upstox", "etfPf": "upstox"})).json()
    assert up["counts"] == {"shares": 0, "funds": 1, "etfs": 1} and up["etfs"][0]["symbol"] == "MON100"
    dhan = (await c.post(URL, json={"shares": [], "mfPf": "none", "etfPf": "dhan"})).json()
    assert dhan["counts"] == {"shares": 0, "funds": 0, "etfs": 1} and dhan["etfs"][0]["invested"] == 2500.0
    assert (await c.post(URL, json={"shares": [], "mfPf": "Bad!"})).status_code == 422


async def test_391_f1_f2_a_fund_in_two_accounts_and_an_etf_without_a_quantity(app):  # noqa: F811
    """Task #391 (developer file 35), made-up list. F2: a fund held in two accounts, one lot with a buy amount and one without: its units add up and the
    priced lot keeps its buy price (before: invested None, and Invested and Gain dropped the fund). F1: one ETF without a quantity (before: every kind
    1/2, byValue false, "Add quantities"): now the fund and the priced ETF weigh by value, the ETF without a quantity weighs 0 and is named."""
    c = await signed_in(app, "f391@example.com", plan="silver")
    hid = (await add(c, BASE + 1, "100", invested="10000", boughtOn="2025-01-10", pf="upstox")).json()["id"]
    r = await c.put(f"/api/me/mf-portfolio/{hid}", json={"lots": [{"units": "100", "invested": "10000", "boughtOn": "2025-01-10", "pf": "upstox"},
                                                                {"units": "200", "boughtOn": "2025-03-10", "pf": "dhan"}]})
    assert r.status_code == 200, r.text
    await etf(c, "NIFTYBEES", "10")                                                                     # 10 x 286.64
    await etf(c, "MON100")                                                                              # no quantity
    b = (await c.post(URL, json={"shares": []})).json()
    f = b["funds"][0]
    assert f["units"] == 300.0 and f["invested"] is None                                                # all 300 units: cost not known for 200 of them
    assert f["investedPriced"] == 10000.0 and f["unitsPriced"] == 100.0 and f["valuePriced"] == 15000.0 and (f["lotsPriced"], f["lots"]) == (1, 2)
    assert b["byValue"] is True and b["missing"] == [] and b["total"] == pytest.approx(45000 + 2866.4, abs=0.01)
    assert b["cards"]["funds"]["share"] == pytest.approx(45000 / 47866.4 * 100, abs=0.01)
    assert b["noQuantity"] == [{"kind": "etfs", "symbol": "MON100", "name": b["etfs"][1]["name"]}]
    assert (b["cards"]["etfs"]["counted"], b["cards"]["etfs"]["of"]) == (1, 2) and b["cards"]["etfs"]["noQuantity"][0]["symbol"] == "MON100"
    assert b["counted"] == {"byValue": 2, "equal": 0, "notCounted": 1, "of": 3}
    assert {e["symbol"]: e["of"] for e in b["etfs"]}["MON100"] == 0
    assert not any("MON100" in x["via"] for x in b["companies"])                                       # weight 0: nothing is held through it
    k = b["risk"]["kinds"]
    assert all("bandKey" in v and "swingWindow" in v for v in k.values()) and "swingWindows" in b["risk"]
    # developer file 41 v4, A4: MON100 is left out of the ETFs' beta for having no quantity, not for its history (it has the same years as NIFTYBEES)
    assert k["etfs"]["betaWindow"]["noQty"] == ["MON100"] and k["etfs"]["betaWindow"]["short"] == []
    assert b["etfs"][1]["beta"] is not None                                                            # its own beta: a full year of prices
    # A1: each kind's prices; the ETFs' close is the ETF portfolio's own (the same row and date it shows)
    etf_page = (await c.get("/api/me/etf-portfolio")).json()
    assert b["sources"]["etfsTo"] == max(e["priceDate"] for e in etf_page["items"] if e.get("priceDate")) and b["sources"]["sharesAt"] is None and b["sources"]["sharesTo"] is None
