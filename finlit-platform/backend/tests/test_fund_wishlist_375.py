"""Task #375: the Mutual Funds page's wishlist (mutual funds and ETFs by AMFI scheme code), saved beside the stock watchlists, and the rows route that
draws it with the list's own table."""
import pytest

from test_auth import app, signed_in  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: F401  (fixtures the app needs)

LARGE, LIQUID = 120465, 120389   # two schemes of the MF sample (test_mf)

pytestmark = pytest.mark.integration


async def test_any_member_keeps_a_fund_wishlist_beside_the_stock_lists(app):  # noqa: F811
    visitor_put = await (await _visitor(app)).put("/api/me/fund-wishlist", json={"codes": [LARGE]})
    assert visitor_put.status_code in (401, 403)                                   # a visitor is asked to sign in
    basic = await signed_in(app, "w1@example.com")                                 # everything stays free: the Basic plan keeps one too
    r = await basic.put("/api/me/fund-wishlist", json={"codes": [LIQUID, LARGE, LIQUID]})
    assert r.status_code == 200 and r.json() == {"status": "saved", "count": 2}
    assert (await basic.get("/api/me/state")).json()["watchlist"]["funds"] == [LIQUID, LARGE]   # newest first, each once
    assert (await basic.put("/api/me/fund-wishlist", json={"codes": list(range(1, 102))})).status_code == 422   # at most 100
    assert (await basic.put("/api/me/fund-wishlist", json={"codes": [0]})).status_code == 422
    assert (await basic.put("/api/me/fund-wishlist", json={"codes": ["1; DROP TABLE"]})).status_code == 422

    silver = await signed_in(app, "w2@example.com", plan="silver")
    assert (await silver.put("/api/me/fund-wishlist", json={"codes": [LARGE]})).status_code == 200
    lists = {"lists": [{"id": "main", "name": "Core", "symbols": ["TCS"]}], "meta": {}}
    assert (await silver.put("/api/me/watchlist", json=lists)).status_code == 200      # saving the stock lists keeps the funds
    w = (await silver.get("/api/me/state")).json()["watchlist"]
    assert w["funds"] == [LARGE] and w["lists"][0]["symbols"] == ["TCS"]
    assert (await silver.put("/api/me/fund-wishlist", json={"codes": []})).status_code == 200   # and saving the funds keeps the stock lists
    w = (await silver.get("/api/me/state")).json()["watchlist"]
    assert w["funds"] == [] and w["lists"][0]["symbols"] == ["TCS"]


async def _visitor(app):  # noqa: F811
    import httpx
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers={"Origin": "http://test"})
