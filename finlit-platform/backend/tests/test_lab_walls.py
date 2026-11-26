"""Trading Lab > Stock zones > Liquidity map (lab/walls.py): the strikes with the most put and call OI, from the site's own option chain."""
import pytest

from finlit import options
from finlit.lab import walls as Wm
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration


def chain(spot=1400.0):
    rows = []
    for k, ce, pe in ((1360, 100, 900), (1380, 200, 1500), (1400, 800, 1200), (1420, 1600, 300), (1440, 1100, 0), (1460, 400, None)):
        rows.append({"strike": float(k), "ce": {"oi": ce, "oiChange": ce // 10, "oiChangePct": 10.0},
                     "pe": None if pe is None else {"oi": pe, "oiChange": -(pe // 20), "oiChangePct": -5.0}})
    return {"spot": spot, "rows": rows, "summary": {"pcrOi": 0.93, "maxPain": {"strike": 1400.0}}}


def test_the_walls_are_the_largest_oi_strikes_each_side_with_distance_from_the_price():
    w = Wm.walls(chain())
    assert [x["strike"] for x in w["put"]] == [1380.0, 1400.0, 1360.0] and [x["strike"] for x in w["call"]] == [1420.0, 1440.0, 1400.0]
    assert w["put"][0] == {"rank": 1, "strike": 1380.0, "oi": 1500, "oiChange": -75, "oiChangePct": -5.0, "distancePct": -1.43}
    assert w["call"][0]["distancePct"] == 1.43 and w["pcrOi"] == 0.93 and w["maxPain"] == 1400.0 and w["spot"] == 1400.0


def test_strikes_without_oi_are_never_a_wall_and_no_price_means_no_distance():
    w = Wm.walls({"spot": None, "rows": [{"strike": 100.0, "ce": {"oi": 0}, "pe": None}], "summary": {}})
    assert w["put"] == [] and w["call"] == []
    w = Wm.walls({**chain(), "spot": None})
    assert all(x["distancePct"] is None for x in w["put"] + w["call"])


def test_nothing_in_the_answer_reads_as_a_forecast():
    text = repr(Wm.walls(chain())).lower()
    for word in ("support", "resistance", "buy", "sell", "target", "cap", "floor", "best"):
        assert word not in text


@pg
async def test_the_route_is_for_lab_members_and_reads_the_shared_chain_cache(app, monkeypatch):  # noqa: F811
    keys = []

    async def resolve(_store, u):
        if u == "NOPE":
            raise ValueError("not F&O")
        return {"key": u, "securityId": 2885, "kind": "stock", "exchange": "NSE"}

    async def expiries(_app, und):
        return {"t": 0, "body": {"expiries": ["2026-11-25", "2099-12-30"], "segment": "NSE_FNO"}}, "fresh"

    async def cached(_app, key, fresh, fetch, wait_if_stale=False):
        keys.append(key)
        return {"t": 1_800_000_000, "body": chain()}, "fresh"

    monkeypatch.setattr(options, "resolve", resolve)
    monkeypatch.setattr(options, "_expiries", expiries)
    monkeypatch.setattr(options, "cached", cached)
    member = await signed_in(app, "walls-member@example.com", plan="gold")
    assert (await member.get("/api/lab/zones/RELIANCE/walls")).status_code == 403
    admin = await admin_with_mfa(app, "walls-boss@example.com")
    r = await admin.get("/api/lab/zones/reliance/walls")
    b = r.json()
    assert r.status_code == 200 and b["symbol"] == "RELIANCE" and b["expiry"] == "2099-12-30" and b["put"][0]["strike"] == 1380.0
    assert keys == ["oc:chain:RELIANCE:2099-12-30"] and r.headers["cache-control"] == "no-store"   # the same cache key Option Pulse uses
    assert (await admin.get("/api/lab/zones/NOPE/walls")).status_code == 404
    assert (await admin.get("/api/lab/zones/bad%20sym/walls")).status_code == 400
