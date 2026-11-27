"""Trading Lab > Order Flow > Money Flow (founder, 26 Nov 2026, from a reference video: "where the money is coming in and where it is going").

Between two snapshots, the value traded (new volume × the average of the two prices) counts as money in when the price rose and money out when it
fell; no move counts as neither. Per stock and per sector, in ₹ crore; the surge is the latest step's net per minute. The route is for Lab members."""
from datetime import datetime

import orjson
import pytest

from finlit.dhan import IST
from finlit.lab import flow
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa
from test_lab_flow import FakeDhan, seed

pg = pytest.mark.integration
CR = 1e7


def pt(t, **stocks):
    return [t, {k: v for k, v in stocks.items()}]


def test_traded_value_counts_in_on_a_rise_out_on_a_fall_and_neither_without_a_move():
    pts = [
        pt("10:00", A=[0, 0, 100.0, 1_000_000], B=[0, 0, 50.0, 0], C=[0, 0, 10.0, 0]),
        pt("10:03", A=[1, 0, 102.0, 2_000_000], B=[0, 0, 49.0, 4_000_000], C=[0, 0, 10.0, 5_000_000]),   # A up, B down, C no move
        pt("10:06", A=[2, 0, 104.0, 2_500_000], B=[0, 0, 48.0, 4_000_000], C=[0, 0, 10.5, 6_000_000]),   # B traded nothing this step
    ]
    m = money(pts)
    by = {s["symbol"]: s for s in m["stocks"]}
    assert by["A"]["in"] == round((1_000_000 * 101 + 500_000 * 103) / CR, 2) and by["A"]["out"] == 0
    assert by["B"]["out"] == round(4_000_000 * 49.5 / CR, 2) and by["B"]["in"] == 0
    assert by["C"]["in"] == round(1_000_000 * 10.25 / CR, 2)                  # the first step had no move: counted as neither
    assert m["net"] == round(m["in"] - m["out"], 2) and m["steps"] == 2 and m["stepMinutes"] == 3
    assert [s["symbol"] for s in m["stocks"]][0] == "A"                       # largest net first


def test_sectors_add_up_their_stocks_and_the_surge_is_the_latest_step_per_minute():
    pts = [pt("10:00", A=[0, 0, 100.0, 0], B=[0, 0, 100.0, 0]), pt("10:03", A=[0, 0, 101.0, 3_000_000], B=[0, 0, 99.0, 600_000])]
    m = flow.money(pts, {"A": "IT", "B": "IT"})
    it = m["sectors"][0]
    assert it["sector"] == "IT" and it["in"] == round(3_000_000 * 100.5 / CR, 2) and it["out"] == round(600_000 * 99.5 / CR, 2)
    assert it["net"] == round(it["in"] - it["out"], 2) and [s["symbol"] for s in it["stocks"]] == ["A", "B"]
    assert m["surge"]["symbol"] == "A" and m["surge"]["surge"] == round(3_000_000 * 100.5 / CR / 3, 2)


def test_points_from_before_price_and_volume_were_kept_are_skipped_never_guessed():
    m = flow.money([pt("10:00", A=[0.5, 1.0]), pt("10:03", A=[0.6, 1.0])], {})
    assert m["stocks"] == [] and m["surge"] is None


def money(pts):
    return flow.money(pts, {k: "S" for _, m in pts for k in m})


@pg
async def test_the_route_is_for_lab_members_and_reads_the_days_snapshots(app):  # noqa: F811
    member = await signed_in(app, "money-member@example.com", plan="gold")
    assert (await member.get("/api/lab/flow/money")).status_code == 403
    admin = await admin_with_mfa(app, "money-boss@example.com")
    assert (await admin.get("/api/lab/flow/money")).json()["ready"] is False
    await seed(app.state.store)
    await flow.refresh(app.state.store, FakeDhan(), now=datetime(2026, 11, 25, 11, 3, tzinfo=IST))
    body = (await admin.get("/api/lab/flow/money")).json()
    assert body["ready"] is False and "two snapshots" in body["reason"]     # one snapshot: nothing to compare yet
    # a second snapshot with more volume and a higher price for one stock
    pts = await app.state.store.redis.lrange(flow.SERIES_KEY + "2026-11-25", 0, -1)
    t, m = orjson.loads(pts[-1])
    sym = next(iter(m))
    m[sym] = [m[sym][0], m[sym][1], (m[sym][2] or 100) * 1.01, (m[sym][3] or 0) + 1_000_000]
    await app.state.store.redis.rpush(flow.SERIES_KEY + "2026-11-25", orjson.dumps(["11:06", m]))
    body = (await admin.get("/api/lab/flow/money")).json()
    assert body["ready"] is True and body["tradeDay"] == "2026-11-25" and body["in"] > 0 and body["stocks"][0]["symbol"] == sym
    assert body["sectors"] and body["surge"]["symbol"] == sym
