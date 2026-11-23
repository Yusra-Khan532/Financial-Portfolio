"""Task #338 (23 Nov 2026): Bank of Maharashtra showed 98.07 on one computer and 97.7 on another (Google: 97.87), all with the same previous close: each
page showed a quote from a different moment. Every company's latest quote is now kept once (finlit/livequote.py) and the company page, the watchlist,
the search list and the portfolio read it; an older or implausible quote never replaces a price."""
import os

import pytest

from finlit import livequote
from finlit.search import with_latest

Q = {"price": 97.71, "change": -1.74, "changePct": -1.75, "previousClose": 99.45, "asOf": "2026-11-23T10:47:29+05:30"}


def test_a_newer_quote_replaces_and_an_older_one_never_does():
    old = {**Q, "price": 98.07, "asOf": "2026-11-23T10:05:00+05:30"}
    assert livequote.newer(Q, old) and not livequote.newer(old, Q)
    assert livequote.newer(Q, None) and livequote.newer(Q, {"price": 98.0})          # nothing held, or a price with no time
    assert not livequote.newer({**Q, "asOf": None}, old)                              # no time never beats a timed quote
    assert not livequote.newer({"price": None}, old)


def test_overlay_moves_market_cap_with_the_price_and_rejects_a_wrong_match():
    base = {"price": 98.07, "previousClose": 99.45, "marketCapCr": 75431.0, "high52": 100.0, "low52": 55.5, "upperCircuit": 109.4, "asOf": "2026-11-23T10:05:00+05:30"}
    q = livequote.overlay(base, {**Q, "high": 100.7})
    assert q["price"] == 97.71 and q["asOf"] == Q["asOf"] and q["marketCapCr"] == round(75431.0 * 97.71 / 98.07, 2)
    assert q["high52"] == 100.7 and "upperCircuit" not in q                          # 52-week high widens; an older price band is not kept
    assert livequote.overlay(base, {**Q, "price": 40.0, "previousClose": 41.0}) is None   # another company's quote (previous close 59% away)
    assert livequote.overlay({**base, "asOf": "2026-11-23T11:00:00+05:30"}, Q) is None   # the held price is newer


def test_the_search_list_rows_take_the_latest_price_of_the_same_day_or_later():
    rows = [["MAHABANK", 97.77, -1.69, "2026-11-23", None, None, None], ["TCS", 3000.0, 0.5, "2026-11-23", None, None, None],
            ["OLD", 50.0, 1.0, "2026-11-24", None, None, None], ["WRONG", 10.0, 0.0, "2026-11-23", None, None, None], ["NEW", None, None, None, None, None, None]]
    latest = {"MAHABANK": Q, "OLD": {**Q, "price": 49.0, "previousClose": 49.5}, "WRONG": {**Q}, "NEW": {**Q, "price": 12.0, "previousClose": 12.1}}
    out = with_latest(rows, latest)
    assert out[0][1:4] == [97.71, -1.75, "2026-11-23"]          # the same price the company page shows
    assert out[1][1] == 3000.0                                   # no latest quote: unchanged
    assert out[2][1] == 50.0                                     # the row is from a later day than the quote
    assert out[3][1] == 10.0                                     # 97.71 for a 10-rupee share: not this company's quote
    assert out[4][1:4] == [12.0, -1.75, "2026-11-23"]           # a company with no listed price gets the latest one


async def _store():
    from finlit.config import Settings
    from finlit.store import Store
    s = Settings(finedge_api_key="t", finedge_mode="fixtures", database_url=os.getenv("TEST_DATABASE_URL", "postgresql://finlit:finlit@localhost:5432/finlit_test"),
                 redis_url=os.getenv("TEST_REDIS_URL", "redis://localhost:6379/15"))
    try:
        return s, await Store.connect(s)
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"postgres/redis not available: {exc}")


async def test_save_keeps_the_newest_and_read_gives_it_back():
    _, st = await _store()
    try:
        await st.redis.delete(livequote.KEY)
        assert await livequote.save(st.redis, {"MAHABANK": {**Q, "price": 98.07, "asOf": "2026-11-23T10:05:00+05:30", "extra": 1}}) == 1
        assert await livequote.save(st.redis, {"MAHABANK": Q}) == 1
        assert await livequote.save(st.redis, {"MAHABANK": {**Q, "price": 98.5, "asOf": "2026-11-23T09:30:00+05:30"}}) == 0   # older: kept out
        got = await livequote.read(st.redis, ["MAHABANK", "NOPE"])
        assert got == {"MAHABANK": Q}                                    # only the quote fields are kept
        assert (await livequote.read(st.redis))["MAHABANK"]["price"] == 97.71
        assert await st.redis.ttl(livequote.KEY) > 0
    finally:
        await st.redis.delete(livequote.KEY)
        await st.close()


async def test_live_endpoint_and_the_watchlist_rows_give_the_same_price():
    import gzip
    import json

    import httpx
    from finlit.api import create_app
    from finlit.store import dumps, etag_for
    s, st = await _store()
    try:
        await st.redis.delete(livequote.KEY)
        await livequote.save(st.redis, {"MAHABANK": Q})
        body = dumps({"fields": ["symbol", "price", "changePct", "priceDate"], "rows": [["MAHABANK", 98.07, -1.39, "2026-11-23", None, None, None]], "amcLogos": {}, "level": "basic", "builtAt": 1})
        await st.redis.hset("search-quotes:basic", mapping={"body": body, "gzip": gzip.compress(body), "etag": etag_for(body).encode()})
        app = create_app(s)
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as api:
                live = await api.get("/api/search/live?symbols=mahabank,NOPE")
                some = await api.get("/api/search/quotes?symbols=MAHABANK", headers={"Accept-Encoding": "identity"})
                none = await api.get("/api/search/live")
        assert live.status_code == 200 and live.headers["cache-control"] == "public, max-age=15"
        assert live.json() == {"quotes": {"MAHABANK": Q}} and none.json() == {"quotes": {}}
        assert json.loads(some.content)["rows"][0][1] == 97.71 == live.json()["quotes"]["MAHABANK"]["price"]
    finally:
        await st.redis.delete(livequote.KEY, "search-quotes:basic")
        await st.close()
