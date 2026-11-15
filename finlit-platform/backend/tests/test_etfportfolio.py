"""/api/me/etf-portfolio (task #136) against real Postgres and Redis, with the ETF list loaded from the recorded provider answers of test_etf: plan gating
(Silver and up, as My mutual funds), per-member ownership, the plan's limit, add / quantities / remove / remove all, equal weights until every ETF has a
quantity, the "Twice" tag for two ETFs on one index (two silver ETFs here), the broker-file import (ISIN first, then symbol; shares and unknown rows not found; repeats counted once),
and the "move together" and "what each adds" sums."""

from pathlib import Path

import httpx
import pytest

from finlit import etf, etfportfolio as ep
from test_auth import anon, app, new_client, signed_in  # noqa: F401
from test_etf import NOW, Provider, S
from test_integration import ingested, make_settings, store  # noqa: F401

pytestmark = pytest.mark.integration
URL = "/api/me/etf-portfolio"
MIGRATION = Path(ep.__file__).parent / "migrations" / "104_etf_holdings.sql"


@pytest.fixture(autouse=True)
async def etfs(app, monkeypatch):  # noqa: F811
    monkeypatch.setattr(etf, "MIN_INSTRUMENTS", 10)
    st = app.state.store
    async with st.pool.acquire() as conn:
        await conn.execute("DROP TABLE IF EXISTS etf_holdings CASCADE")       # the shared fixture drops `users`: make the table again from the migration
        await conn.execute(MIGRATION.read_text())
    await etf.refresh(st, S(), transport=httpx.MockTransport(Provider()), now=NOW)
    for k in ("etf_cache", "etf_hot", "etf_ters"):
        if hasattr(app.state, k):
            delattr(app.state, k)
    async def idx(_app):                                                      # the index list needs the fund data: two ETFs on the Nifty 50 here
        return {"NIFTYBEES": {"key": "nifty50", "label": "Nifty 50"}, "SILVERBEES": {"key": "silver", "label": "Silver"}, "SILVER001": {"key": "silver", "label": "Silver"},
                "GOLDBEES": {"key": "gold", "label": "Gold"}}
    monkeypatch.setattr(ep, "index_map", idx)
    yield


async def add(c, sym, units=None):
    return await c.post(URL, json={"symbol": sym, **({"units": units} if units is not None else {})})


async def test_visitors_and_basic_are_refused_silver_and_up_are_not(app):  # noqa: F811
    assert (await new_client(app).get(URL)).status_code == 401
    basic = await signed_in(app, "b@example.com")
    r = await basic.get(URL)
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_required"
    assert (await add(basic, "NIFTYBEES")).status_code == 403
    s = await signed_in(app, "s@example.com", plan="silver")
    r = await s.get(URL)
    assert r.status_code == 200 and r.headers["cache-control"] == "private, no-store" and r.json()["count"] == 0


async def test_add_quantities_remove_and_equal_weights_until_every_etf_has_a_quantity(app):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    assert (await add(c, "niftybees")).status_code == 201                   # any case
    assert (await add(c, "GOLDBEES")).status_code == 201
    assert (await add(c, "NOPE")).status_code == 404
    b = (await c.get(URL)).json()
    assert b["basis"] == "equal" and [h["weight"] for h in b["holdings"]] == [50.0, 50.0]
    nb = next(h for h in b["holdings"] if h["symbol"] == "NIFTYBEES")
    assert nb["price"] == 259.57 and nb["index"] == {"key": "nifty50", "label": "Nifty 50"} and nb["twice"] is False and "ter" in nb and "avgTurnover" in nb
    assert (await c.put(f"{URL}/{nb['id']}", json={"units": "100"})).status_code == 200
    assert (await c.get(URL)).json()["basis"] == "equal"                     # one ETF still has no quantity
    gb = next(h for h in b["holdings"] if h["symbol"] == "GOLDBEES")
    assert (await c.put(f"{URL}/{gb['id']}", json={"units": "1,000"})).status_code == 200
    v = (await c.get(URL)).json()
    assert v["basis"] == "value" and round(sum(h["weight"] for h in v["holdings"])) == 100
    assert next(h for h in v["holdings"] if h["symbol"] == "NIFTYBEES")["value"] == 25957.0
    assert (await c.put(f"{URL}/{gb['id']}", json={"units": "-5"})).status_code == 422
    assert (await add(c, "GOLDBEES", "5")).json()["merged"] is True            # adding again sets the quantity, no second row
    assert (await c.delete(f"{URL}/{gb['id']}")).status_code == 200
    assert [h["symbol"] for h in (await c.get(URL)).json()["holdings"]] == ["NIFTYBEES"]
    other = await signed_in(app, "o@example.com", plan="gold")
    assert (await other.delete(f"{URL}/{nb['id']}")).status_code == 404      # another member's ETF cannot be touched
    assert (await other.get(URL)).json()["count"] == 0
    assert (await c.delete(URL)).json() == {"status": "deleted", "removed": 1}


async def test_two_etfs_on_one_index_are_tagged_twice(app):  # noqa: F811
    c = await signed_in(app, "g@example.com", plan="gold")
    for s in ("SILVERBEES", "SILVER001", "GOLDBEES"):
        assert (await add(c, s)).status_code == 201
    h = {x["symbol"]: x for x in (await c.get(URL)).json()["holdings"]}
    assert h["SILVERBEES"]["twice"] is True and h["SILVER001"]["twice"] is True and h["GOLDBEES"]["twice"] is False


async def test_the_plan_limit_holds(app, monkeypatch):  # noqa: F811
    monkeypatch.setitem(ep.LIMITS["silver"], "etf_holdings", 2)
    c = await signed_in(app, "s@example.com", plan="silver")
    assert (await add(c, "NIFTYBEES")).status_code == 201 and (await add(c, "GOLDBEES")).status_code == 201
    r = await add(c, "BANKBEES")
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_limit"
    r = await c.post(URL + "/import-commit", json={"items": [{"symbol": "BANKBEES"}, {"symbol": "ITBEES"}]})
    assert r.status_code == 403


async def test_a_broker_file_is_matched_on_isin_then_symbol(app):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    await add(c, "GOLDBEES")
    rows = [{"isin": "INF204KB14I2", "name": "NIPPON NIFTY BEES", "units": "10"}, {"symbol": "goldbees", "units": "4"}, {"isin": "INE002A01018", "name": "RELIANCE INDUSTRIES"},
            {"isin": "INF204KB14I2", "units": "2"}, {"symbol": "BANKBEES", "units": "abc"}, {"name": "no codes"}]
    p = (await c.post(URL + "/import-preview", json={"rows": rows})).json()
    st = [(r["status"], r.get("via"), r["symbol"]) for r in p["rows"]]
    assert st[0] == ("matched", "isin", "NIFTYBEES") and st[1] == ("matched", "symbol", "GOLDBEES") and p["rows"][1]["existing"] is True
    assert st[2][0] == "not_found" and "Not an ETF" in p["rows"][2]["reason"]                # a share goes in its own portfolio
    assert st[3][0] == "duplicate" and st[4][0] == "invalid" and st[5][0] == "not_found"
    assert p["counts"] == {"matched": 2, "not_found": 2, "invalid": 1, "duplicate": 1}
    assert (await c.get(URL)).json()["count"] == 1                           # a preview stores nothing
    r = (await c.post(URL + "/import-commit", json={"items": [{"symbol": "NIFTYBEES", "units": 10}, {"symbol": "GOLDBEES", "units": 4}]})).json()
    assert r == {"status": "saved", "added": 1, "updated": 1}
    assert {h["symbol"]: h["units"] for h in (await c.get(URL)).json()["holdings"]} == {"GOLDBEES": 4.0, "NIFTYBEES": 10.0}


async def test_gold_silver_and_liquid_etfs_track_their_price(app, monkeypatch):  # noqa: F811
    monkeypatch.undo()                                                        # the real index list (none in the test data) with the category fallback
    monkeypatch.setattr(etf, "MIN_INSTRUMENTS", 10)
    m = await ep.index_map(app)
    assert m["GOLDBEES"] == {"key": "cat:gold", "label": "Gold price"} and m["SILVERBEES"]["key"] == m["SILVER001"]["key"] == "cat:silver"
    assert m["LIQUIDBEES"]["label"] == "Overnight rate" and "MON100" not in m                # international: the category does not say which index


def test_move_together_and_what_each_adds():
    end = 800_000
    days = list(range(end - 400, end + 1))
    a = [100 * (1 + 0.001 * ((d // 7) % 5)) for d in days]                    # weekly wiggle
    b = [x * 1.0 for x in a]                                                  # moves exactly as a
    c = [100 * (1 + 0.001 * ((d // 7) % 3)) for d in days]                    # a different rhythm
    t = ep.together({"A": (days, a), "B": (days, b), "C": (days, c)}, {"A": 1, "B": 1, "C": 2}, end)
    assert t["C"][0][1] == 1.0 and t["C"][0][0] == 1.0 and t["weeks"] >= 50
    assert abs(sum(t["adds"].values()) - 100) < 0.5                           # the shares of the list's ups and downs add up to the whole
    assert ep.together({"A": (days, a)}, {"A": 1}, end)["C"] is None          # one ETF: nothing to compare
