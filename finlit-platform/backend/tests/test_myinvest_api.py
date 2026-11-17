"""POST /api/me/all-investments (task #137, 15 Nov 2026 pack) against real Postgres and Redis: plan gating (Silver and Gold; IQ for Silver, Prism for Gold;
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
    assert b["cards"]["shares"]["scoreModel"] == "iq" and b["cards"]["etfs"]["count"] == 2 and "soon" not in b["cards"]["etfs"]
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
