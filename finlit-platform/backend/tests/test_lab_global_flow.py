"""Trading Lab > Order Flow, Global (lab/global_flow.py): the largest US companies from Nasdaq's public screener, a snapshot every five minutes in
the US session, in the same shape as the India snapshot; Money Flow in US$ million. What the US feed lacks is null, never made up."""
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import orjson
import pytest

from finlit.lab import flow as F
from finlit.lab import global_flow as G
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration
BODY = json.loads((Path(__file__).parent / "fixtures/global/nasdaq_screener.json").read_text())   # a real answer of 26 Nov 2026, 35 rows kept


def test_the_largest_companies_with_a_price_and_a_sector_only():
    rows = G.rows_from_screener(BODY, top=10)
    assert len(rows) == 10 and rows[0]["symbol"] == "AAPL" and rows[0]["name"] == "Apple Inc."
    assert all(r["sector"] and r["price"] > 0 for r in rows)
    caps = [r["marketCap"] for r in rows]
    assert caps == sorted(caps, reverse=True)
    a = rows[0]
    assert a["previousClose"] == round(a["price"] - a["change"], 4) and a["buildup"] is None and a["pivots"] is None and a["oi"] is None
    assert len(G.rows_from_screener(BODY)) == 30                         # rows without a sector or a price are left out


def test_names_lose_the_share_class_wording():
    assert G.clean_name("Alphabet Inc. Class A Common Stock") == "Alphabet Inc."
    assert G.clean_name("Taiwan Semiconductor Manufacturing Company Ltd. American Depositary Shares") == "Taiwan Semiconductor Manufacturing Company Ltd."
    assert G.clean_name("Berkshire Hathaway Inc.") == "Berkshire Hathaway Inc."


def test_the_us_session_in_new_york_time():
    assert G.session_open(datetime(2026, 11, 26, 15, 0, tzinfo=timezone.utc)) is True        # 10:00 New York, Thursday
    assert G.session_open(datetime(2026, 11, 26, 13, 0, tzinfo=timezone.utc)) is False       # 08:00 New York
    assert G.session_open(datetime(2026, 11, 28, 15, 0, tzinfo=timezone.utc)) is False       # Saturday


def test_step_minutes_wrap_past_midnight_ist():
    assert F._minutes("23:55", "00:00") == 5 and F._minutes("10:00", "10:03") == 3


def test_money_flow_in_us_dollar_millions():
    pts = [["20:00", {"A": [0, None, 100.0, 1_000_000]}], ["20:05", {"A": [1, None, 102.0, 1_500_000]}]]
    m = F.money(pts, {"A": "Technology"}, unit=G.MILLION)
    assert m["stocks"][0]["in"] == round(500_000 * 101 / 1e6, 2) and m["sectors"][0]["sector"] == "Technology" and m["stepMinutes"] == 5


@pg
async def test_snapshots_build_the_day_and_the_routes_are_for_lab_members(app):  # noqa: F811
    store = app.state.store
    calls = []

    def h(req):
        calls.append(req)
        return httpx.Response(200, json=BODY)
    closed = datetime(2026, 11, 26, 12, 0, tzinfo=timezone.utc)
    async with httpx.AsyncClient(transport=httpx.MockTransport(h)) as c:
        assert (await G.refresh(store, client=c, now=closed))["skipped"] == "the US market is closed" and not calls
        t1 = datetime(2026, 11, 26, 15, 0, tzinfo=timezone.utc)
        out = await G.refresh(store, client=c, now=t1)
        assert out == {"status": "ok", "stocks": 30, "tradeDay": "2026-11-26", "at": "20:30"}
        same = await G.refresh(store, client=c, now=datetime(2026, 11, 26, 15, 5, tzinfo=timezone.utc))
        assert same["skipped"].startswith("no trading since the last snapshot")      # a holiday repeats the last session: no new point
        moved = json.loads(json.dumps(BODY))
        for r in moved["data"]["rows"]:
            if r["symbol"] == "AAPL":
                r["lastsale"] = "$999.00"
                r["volume"] = str(int(r["volume"]) + 1_000_000)
        later = httpx.MockTransport(lambda req: httpx.Response(200, json=moved))
    async with httpx.AsyncClient(transport=later) as c2:
        await G.refresh(store, client=c2, now=datetime(2026, 11, 26, 15, 5, tzinfo=timezone.utc))
    member = await signed_in(app, "gflow-member@example.com", plan="gold")
    assert (await member.get("/api/lab/flow/global")).status_code == 403
    admin = await admin_with_mfa(app, "gflow-boss@example.com")
    body = (await admin.get("/api/lab/flow/global")).json()
    assert body["ready"] and body["market"] == "us" and body["currency"] == "USD" and body["lines"]["times"] == ["20:30", "20:35"]
    assert body["summary"]["stocks"] == 30 and G.NOTE in body["notes"]
    m = (await admin.get("/api/lab/flow/global/money")).json()
    assert m["ready"] and m["unit"] == "US$ million" and m["stocks"][0]["symbol"] == "AAPL" and m["in"] > 0
    # the India snapshot is untouched
    assert await store.redis.get(F.LATEST_KEY) is None or orjson.loads(await store.redis.get(F.LATEST_KEY)).get("market") != "us"
