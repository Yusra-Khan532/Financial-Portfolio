"""GET /api/ext/company/{symbol}: the browser extension's one lookup. Plan rules (the score is Silver), the showcase company stays open, no side effects, strict symbol check."""
import pytest

from test_auth import app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401

pytestmark = pytest.mark.integration
SYM = "EXTTEST"


@pytest.fixture(autouse=True)
async def seeded(app):  # noqa: F811
    async with app.state.store.pool.acquire() as c:
        await c.execute("INSERT INTO companies (symbol, name, sector) VALUES ($1, 'Ext Test Industries Ltd', 'Capital Goods') ON CONFLICT (symbol) DO NOTHING", SYM)
        await c.execute("DELETE FROM scores WHERE symbol = $1", SYM)
        await c.execute("INSERT INTO scores (symbol, statement, model, overall, band, pillar_quality, pillar_growth, pillar_profitability, pillar_balance, pillar_technical, price, market_cap, pe, roe, "
                        "debt_to_equity, name, sector) VALUES ($1,'consolidated','v1',82,'strong',90,80,85,81,76,100,19600,26.4,9.8,0.41,'Ext Test Industries Ltd','Capital Goods')", SYM)
    await app.state.store.redis.delete(f"ext:company:basic:{SYM}", f"ext:company:silver:{SYM}")
    yield
    async with app.state.store.pool.acquire() as c:
        await c.execute("DELETE FROM scores WHERE symbol = $1", SYM)
        await c.execute("DELETE FROM companies WHERE symbol = $1", SYM)
    await app.state.store.redis.delete(f"ext:company:basic:{SYM}", f"ext:company:silver:{SYM}")


async def test_a_silver_member_gets_the_score_two_parts_and_four_figures(app):  # noqa: F811
    silver = await signed_in(app, "es@example.com", plan="silver")
    r = await silver.get(f"/api/ext/company/{SYM.lower()}")
    assert r.status_code == 200 and r.headers["cache-control"].startswith("private") and "Cookie" in r.headers["vary"]
    j = r.json()
    assert j["locked"] is False and j["score"] == 82 and j["band"] == "Strong"
    assert j["fundamental"] == 84 and j["technical"] == 76            # the four pillars' average, and the technical pillar
    assert j["figures"] == {"pe": 26.4, "roe": 9.8, "debtToEquity": 0.41} and j["marketCapCr"] == 19600
    assert j["url"] == f"/stocks/{SYM}" and "not a recommendation" in j["disclaimer"].lower()
    assert j["take"] and not any(w in j["take"].lower() for w in ("buy", "sell", "hold", "avoid", "accumulate", "target", "upside"))
    for leak in ("pillar_quality", "pillar_growth", "weight"):
        assert leak not in r.text


async def test_a_basic_or_signed_out_visitor_gets_the_name_and_price_but_no_score(app):  # noqa: F811
    for who in (await signed_in(app, "eb@example.com", plan="basic"), new_client(app)):
        j = (await who.get(f"/api/ext/company/{SYM}")).json()
        assert j["locked"] is True and j["name"] == "Ext Test Industries Ltd" and j["marketCapCr"] == 19600 and j["lockedWhy"]
        for k in ("score", "band", "fundamental", "technical", "figures", "take"):
            assert k not in j, k


async def test_unknown_and_malformed_symbols_are_refused_without_a_database_read(app):  # noqa: F811
    c = new_client(app)
    assert (await c.get("/api/ext/company/NOSUCHCO")).status_code == 404
    for bad in ("bad%20symbol", "A" * 40, "x;drop"):
        assert (await c.get(f"/api/ext/company/{bad}")).status_code in (404, 422)
