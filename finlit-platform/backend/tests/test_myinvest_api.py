"""POST /api/me/all-investments (task #137) against real Postgres and Redis: plan gating (Silver and Gold; IQ for Silver, Prism for Gold; the funds' FundPulse
Gold only), the funds read from the member's own MF portfolio, the shares from the body, quantities deciding the weights, and ETFs said to be coming."""

import pytest

from test_auth import app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_mfportfolio_api import BASE, add, schemes  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("schemes")]
URL = "/api/me/all-investments"


async def test_visitors_and_basic_are_refused(app):  # noqa: F811
    assert (await new_client(app).post(URL, json={"shares": []})).status_code in (401, 403)
    basic = await signed_in(app, "b@example.com")
    r = await basic.post(URL, json={"shares": []})
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_required"


async def test_silver_reads_its_funds_with_no_health_score_and_etfs_are_coming(app):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    assert (await add(c, BASE + 1, "100")).status_code in (200, 201)
    r = await c.post(URL, json={"shares": []})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["plan"] == "silver" and b["parts"]["funds"]["count"] == 1 and b["parts"]["shares"]["count"] == 0
    assert b["parts"]["funds"]["scoreLocked"] is True and b["parts"]["funds"]["score"] is None          # the FundPulse is Gold
    assert b["parts"]["shares"]["scoreModel"] == "iq"
    assert b["parts"]["etfs"] == {"count": 0, "soon": True, "why": "The ETF portfolio is coming. Once you can keep a list of your ETFs, they are counted here too."}
    assert b["byValue"] is True and b["total"] == 15000.0                                              # 100 units x NAV 150
    assert "subject to market risks" in b["disclaimer"] and "not investment advice" in b["disclaimer"]


async def test_gold_sees_the_health_score_and_a_list_change_shows_here(app):  # noqa: F811
    c = await signed_in(app, "g@example.com", plan="gold")
    await add(c, BASE + 1, "100")
    b = (await c.post(URL, json={"shares": []})).json()
    assert b["plan"] == "gold" and b["parts"]["funds"]["score"] == 83.0 and b["parts"]["shares"]["scoreModel"] == "prism"
    await add(c, BASE + 5, "50")                                                                        # changed on the MF portfolio page ...
    b = (await c.post(URL, json={"shares": []})).json()
    assert b["parts"]["funds"]["count"] == 2 and b["total"] == 15000.0 + 3000.0                        # ... changes this page


async def test_shares_without_a_quantity_make_every_part_count_the_same(app):  # noqa: F811
    c = await signed_in(app, "s2@example.com", plan="silver")
    await add(c, BASE + 1, "100")
    b = (await c.post(URL, json={"shares": [{"symbol": "NOTALISTEDCO", "qty": None}]})).json()
    assert b["unknown"] == ["NOTALISTEDCO"]                                                            # not a company FinLit lists: said, never guessed
    r = await c.post(URL, json={"shares": [{"symbol": "bad symbol!", "qty": 1}]})
    assert r.status_code == 422
    r = await c.post(URL, json={"shares": [{"symbol": "TCS", "qty": 1, "price": 5}]})                    # nothing but symbol and quantity
    assert r.status_code == 422
