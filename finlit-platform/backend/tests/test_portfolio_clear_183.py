"""Task #183 (COMMON-RULES 10): Clear portfolio. The member's equity list is emptied; the server holds what was there (rows with their ISIN and
quantities) for the Undo window; Undo puts it back exactly; after the window the clear is final. Watchlists and other members are not touched."""
import pytest

from finlit.auth import routes as R
from test_auth import ORIGIN, app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401

pytestmark = pytest.mark.integration
K = ("id", "symbol", "qty", "owned", "isin")
pick = lambda hs: [{k: h.get(k) for k in K} for h in hs]  # noqa: E731
H = [{"id": "a1", "symbol": "ETERNAL", "qty": 40, "price": 0, "owned": True, "isin": "INE758T01015"},
     {"id": "a2", "symbol": "HDFCBANK", "qty": 1, "price": 0, "isin": "INE040A01034"}]


async def test_clear_holds_the_list_for_undo_and_undo_restores_it_exactly(app):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    assert (await c.put("/api/me/portfolio", json={"holdings": H})).status_code == 200
    assert (await c.put("/api/me/watchlist", json={"lists": [{"id": "w1", "name": "Mine", "symbols": ["TCS"]}], "meta": {}})).status_code == 200
    other = await signed_in(app, "o@example.com", plan="silver")
    assert (await other.put("/api/me/portfolio", json={"holdings": H[:1]})).status_code == 200
    r = await c.post("/api/me/portfolio/clear")
    assert r.status_code == 200 and r.json() == {"status": "cleared", "removed": 2, "undoSeconds": 10}
    st = (await c.get("/api/me/state")).json()
    assert st["portfolio"] == {"holdings": []} and st["watchlist"]["lists"][0]["symbols"] == ["TCS"]          # the watchlist is not touched
    assert len((await other.get("/api/me/state")).json()["portfolio"]["holdings"]) == 1                       # another member's list is not touched
    r = await c.post("/api/me/portfolio/undo-clear")
    saved = (await c.get("/api/me/state")).json()["portfolio"]["holdings"]
    assert r.status_code == 200 and pick(r.json()["holdings"]) == pick(H) and pick(saved) == pick(H)            # exactly: ids, quantities, ISINs
    r = await c.post("/api/me/portfolio/undo-clear")                                                           # used once: the clear is final
    assert r.status_code == 410 and r.json()["detail"]["status"] == "undo_expired"


async def test_after_the_window_the_clear_is_final(app, monkeypatch):  # noqa: F811
    c = await signed_in(app, "s2@example.com", plan="gold")
    await c.put("/api/me/portfolio", json={"holdings": H})
    await c.post("/api/me/portfolio/clear")
    await app.state.store.redis.delete(R._clear_key((await c.get("/api/auth/me")).json()["user"]["id"]))     # the hold has run out
    assert (await c.post("/api/me/portfolio/undo-clear")).status_code == 410
    assert (await c.get("/api/me/state")).json()["portfolio"] == {"holdings": []}


async def test_clear_needs_the_session_csrf_and_a_portfolio_plan(app):  # noqa: F811
    assert (await new_client(app).post("/api/me/portfolio/clear", headers=ORIGIN)).status_code == 401
    c = await signed_in(app, "s3@example.com", plan="silver")
    c.headers.pop("X-CSRF-Token")
    assert (await c.post("/api/me/portfolio/clear")).status_code == 403
    basic = await signed_in(app, "b3@example.com")
    assert (await basic.post("/api/me/portfolio/clear")).status_code == 403


async def test_a_saved_share_keeps_its_isin(app):  # noqa: F811
    c = await signed_in(app, "s4@example.com", plan="silver")
    assert (await c.put("/api/me/portfolio", json={"holdings": H})).status_code == 200
    assert [h["isin"] for h in (await c.get("/api/me/state")).json()["portfolio"]["holdings"]] == ["INE758T01015", "INE040A01034"]
    bad = [{**H[0], "isin": "not-an-isin"}]
    assert (await c.put("/api/me/portfolio", json={"holdings": bad})).status_code == 422


async def test_235_clear_keeps_the_portfolios_and_undo_brings_back_buys_and_sales(app):  # noqa: F811
    c = await signed_in(app, "s235@example.com", plan="silver")
    body = {"portfolios": [{"id": "dhan", "name": "Dhan"}, {"id": "upstox", "name": "Upstox"}],
            "holdings": [{"id": "b1", "symbol": "ITC", "qty": 40, "price": 412.3, "date": "2025-06-12", "owned": True, "pf": "upstox"},
                         {"id": "s1", "symbol": "ITC", "qty": 30, "price": 455, "date": "2026-01-20", "owned": True, "pf": "upstox", "side": "sell"}]}
    assert (await c.put("/api/me/portfolio", json=body)).status_code == 200
    assert (await c.post("/api/me/portfolio/clear")).json()["removed"] == 2
    st = (await c.get("/api/me/state")).json()["portfolio"]
    assert st["holdings"] == [] and [p["name"] for p in st["portfolios"]] == ["Dhan", "Upstox"]               # the portfolios stay, empty
    await c.post("/api/me/portfolio/undo-clear")
    back = (await c.get("/api/me/state")).json()["portfolio"]
    assert [(h["id"], h.get("side"), h["pf"]) for h in back["holdings"]] == [("b1", None, "upstox"), ("s1", "sell", "upstox")]
