"""Task #269 (20 Nov 2026, the team: "the scores are different when we open it why is it happening"): APOLLOHOSP showed 8,738.00 -0.9% on a screen
and 9,141.00 +4.61% on its company page at 10:25. A screen's list is built from last night's frame, so its price and day change stayed at last night's
close all day. A screen now shows the latest price and day change, the same as the company page, the search box and the dashboard."""
import json

import orjson
import pytest

from finlit.presets import api as papi
from finlit.screener import data
from finlit.screener.data import Table
from test_auth import app, signed_in  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: F401  (fixtures)


def test_overlay_puts_the_latest_price_on_each_row_and_never_an_older_one():
    rows = [{"symbol": "APOLLOHOSP", "price": 8738.0, "ret_1d": -0.9}, {"symbol": "OLD", "price": 100.0, "ret_1d": 1.0}, {"symbol": "NONE", "price": 5.0, "ret_1d": 0.0}]
    latest = {"APOLLOHOSP": (9141.0, 4.61, "2026-11-20"), "OLD": (90.0, -2.0, "2026-11-18")}
    assert papi.overlay_prices(rows, latest, "2026-11-19T00:00:00") == 1
    assert rows[0] == {"symbol": "APOLLOHOSP", "price": 9141.0, "ret_1d": 4.61, "price_day": "2026-11-20"}        # the company page's figure
    assert rows[1] == {"symbol": "OLD", "price": 100.0, "ret_1d": 1.0}            # a price older than the list is never put over the list's close
    assert rows[2] == {"symbol": "NONE", "price": 5.0, "ret_1d": 0.0}             # no latest price: the list's own stays
    same = [{"symbol": "A", "price": 1.0, "ret_1d": 0.0}]
    assert papi.overlay_prices(same, {"A": (2.0, 1.0, "2026-11-19")}, "2026-11-19") == 1 and same[0]["price"] == 2.0   # the list's own day: the newer figure


async def test_latest_prices_reads_the_saved_search_quotes():
    doc = {"fields": ["symbol", "price", "changePct", "priceDate", "score", "band", "logo"],
           "rows": [["APOLLOHOSP", 9141.0, 4.61, "2026-11-20", None, "locked", None], ["NOPRICE", None, None, None, 70, "strong", None]]}

    class R:
        async def hget(self, key, field):
            assert (key, field) == ("search-quotes:silver", "body")
            return orjson.dumps(doc)

    class A:
        class state:
            class store:
                redis = R()

    assert await papi.latest_prices(A) == {"APOLLOHOSP": (9141.0, 4.61, "2026-11-20")}


@pytest.mark.integration
async def test_a_screen_shows_the_latest_price_and_its_day(app, store):  # noqa: F811
    from test_presets_api import row, wipe

    data._table = Table([row(f"S{i:02d}", market_cap=5000 + i, flag_count=1.0, sales_cagr_3y=20, profit_cagr_3y=20, q_sales_yoy=15, q_profit_yoy=15, q_sales_up=4,
                             q_revenue=100, roce=20, debt_to_equity=0.2, is_bank=0, price=100.0, ret_1d=-0.9) for i in range(30)], {}, {})
    try:
        await wipe(store)
        gold = await signed_in(app, "g269@example.com", plan="gold")
        first = (await gold.get("/api/screener/presets/emerging-tech?chip=none")).json()
        day = str(first["asOf"])[:10]
        sym, other = first["rows"][0]["symbol"], first["rows"][1]["symbol"]
        later = "9999-12-31"        # a trading day after the list's
        await store.redis.hset("search-quotes:silver", mapping={"body": json.dumps({"rows": [[sym, 123.45, 4.61, later, None, "locked", None]]}), "gzip": b"x", "etag": b"e"})
        b = (await gold.get("/api/screener/presets/emerging-tech?chip=none")).json()
        got = {r["symbol"]: r for r in b["rows"]}
        assert got[sym]["price"] == 123.45 and got[sym]["ret_1d"] == 4.61 and got[sym]["price_day"] == later
        assert "price_day" not in got[other] and got[other].get("price") == first["rows"][1].get("price")     # no latest price: the list's own
        assert b["priceDay"] == later and b["asOf"][:10] == day      # the list's own date stays; the prices say theirs
        e = await gold.get("/api/screener/presets/emerging-tech/export?chip=none")
        assert e.status_code == 200
        await gold.aclose()
    finally:
        await store.redis.delete("search-quotes:silver")
        data.reset()
