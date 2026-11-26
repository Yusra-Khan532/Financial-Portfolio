"""Trading Lab > OI Flow (lab/oiflow.py): how fast call and put open interest changes by strike, from snapshots of each index's chain."""
from datetime import datetime

import orjson
import pytest

from finlit import options
from finlit.lab import oiflow as F
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration


def body(spot, atm, oi):
    """A summarised chain: oi = {strike: (call OI, put OI, call prev OI, put prev OI)}."""
    return {"spot": spot, "atm": atm, "rows": [{"strike": float(k), "ce": {"oi": v[0], "prevOi": v[2]}, "pe": {"oi": v[1], "prevOi": v[3]}}
                                              for k, v in sorted(oi.items())]}


def point(t, oi, atm=25000, expiry="2026-12-01"):
    return F.snapshot(body(atm + 3, atm, oi), t, expiry)


def test_a_snapshot_keeps_the_strikes_near_atm_with_both_sides_and_the_previous_close():
    oi = {k: (k // 10, k // 20, 1, 2) for k in range(24000, 26050, 50)}       # 41 strikes, ATM 25000
    s = point("10:00", oi)
    assert s["t"] == "10:00" and s["expiry"] == "2026-12-01" and s["atm"] == 25000 and s["spot"] == 25003
    assert len(s["oi"]) == 2 * F.WINDOW + 1 and s["oi"]["25000"] == [2500, 1250, 1, 2]
    assert F.snapshot({"rows": [], "atm": None}, "10:00", "x") is None


def test_changes_over_15_minutes_an_hour_and_the_day_are_plain_differences():
    base = {k: (1000, 2000, 900, 2100) for k in range(24500, 25550, 50)}
    pts = [point("09:15", base)]
    later = dict(base); later[25000] = (1500, 1800, 900, 2100); later[25100] = (800, 2600, 900, 2100)
    pts += [point("10:00", base), point("10:12", later), point("10:15", later)]
    f = F.flow(pts)
    assert f["available"] and f["asOf"] == "10:15" and f["snapshots"] == 4 and f["firstAt"] == "09:15"
    assert f["gapMinutes"] == {"m15": 15, "m60": 60}                         # 10:00 and 09:15 are the snapshots at or before 15 and 60 minutes
    row = next(r for r in f["strikes"] if r["strike"] == 25000)
    assert row["atm"] and row["ce"] == {"oi": 1500, "day": 600, "m15": 500, "m60": 500}
    assert row["pe"] == {"oi": 1800, "day": -300, "m15": -200, "m60": -200}
    assert f["movers"]["ce"]["build"][0] == {"strike": 25000.0, "change": 500}
    assert f["movers"]["ce"]["unwind"][0] == {"strike": 25100.0, "change": -200}
    assert f["movers"]["pe"]["build"][0] == {"strike": 25100.0, "change": 600}
    assert len(f["strikes"]) == 2 * F.SHOW + 1


def test_a_window_with_no_snapshot_far_enough_back_is_null_not_guessed():
    base = {k: (1000, 2000, 900, 2100) for k in range(24900, 25150, 50)}
    f = F.flow([point("09:15", base), point("09:18", base)])
    assert f["gapMinutes"] == {"m15": None, "m60": None}
    assert all(r["ce"]["m15"] is None and r["pe"]["m60"] is None for r in f["strikes"])
    assert f["movers"] == {"ce": {"build": [], "unwind": []}, "pe": {"build": [], "unwind": []}}


def test_the_heat_map_holds_the_change_between_consecutive_snapshots():
    a = {k: (1000, 1000, 1000, 1000) for k in range(24950, 25100, 50)}
    b = dict(a); b[25000] = (1300, 900, 1000, 1000)
    f = F.flow([point("09:15", a), point("09:18", b), point("09:21", b)])
    h = f["heat"]
    assert h["times"] == ["09:18", "09:21"] and 25000.0 in h["strikes"]
    i = h["strikes"].index(25000.0)
    assert h["ce"][i] == [300, 0] and h["pe"][i] == [-100, 0]


def test_a_new_expiry_starts_its_own_series():
    a = {k: (1000, 1000, 1000, 1000) for k in range(24950, 25100, 50)}
    f = F.flow([point("09:15", a, expiry="2026-11-24"), point("10:30", a, expiry="2026-12-01")])
    assert f["expiry"] == "2026-12-01" and f["snapshots"] == 1 and f["gapMinutes"]["m60"] is None


def test_no_snapshot_reads_as_unavailable_and_nothing_tells_anyone_to_trade():
    assert F.flow([])["available"] is False
    base = {k: (1000, 2000, 900, 2100) for k in range(24500, 25550, 50)}
    text = repr(F.flow([point("09:15", base), point("10:15", base)])).lower()
    for word in ("buy", "sell", "target", "stop loss", "entry", "best", "bullish", "bearish"):
        assert word not in text


class FakeRedis:
    def __init__(self):
        self.lists = {}

    async def rpush(self, k, v):
        self.lists.setdefault(k, []).append(v)

    async def lindex(self, k, i):
        v = self.lists.get(k) or []
        return v[i] if v else None

    async def expire(self, k, s):
        return True

    async def lrange(self, k, a, b):
        return list(self.lists.get(k) or [])


async def test_the_job_uses_the_sites_cached_and_paced_chain_and_skips_a_busy_index(monkeypatch):
    redis = FakeRedis()
    store = type("S", (), {"redis": redis})()
    now = datetime(2026, 11, 26, 10, 0, tzinfo=options.IST)
    asked = []

    async def resolve(_store, u):
        return {"key": u, "securityId": 13}

    async def expiries(_app, und):
        return {"t": 0, "body": {"expiries": ["2026-11-24", "2026-12-01", "2026-12-08"], "segment": "IDX_I"}}, "fresh"

    async def cached(_app, key, fresh, fetch, wait_if_stale=False):
        asked.append(key)
        if "SENSEX" in key:
            raise options.Busy(9)
        return {"t": 0, "body": body(25003, 25000, {25000: (10, 20, 5, 25), 25050: (7, 9, 7, 9)})}, "fresh"

    monkeypatch.setattr(options, "resolve", resolve)
    monkeypatch.setattr(options, "_expiries", expiries)
    monkeypatch.setattr(options, "cached", cached)
    r = await F.refresh(store, None, now=now)
    assert r["status"] == "ok" and r["taken"] == 4 and r["skipped"] == ["SENSEX"] and not r["failed"]
    assert asked[0] == "oc:chain:NIFTY:2026-12-01"                            # the nearest unexpired expiry, the pages' own cache key
    saved = orjson.loads(redis.lists["lab:oi:series:NIFTY:2026-11-26"][0])
    assert saved["t"] == "10:00" and saved["oi"]["25000"] == [10, 20, 5, 25]
    again = await F.refresh(store, None, now=now)                             # the same minute: not stored twice
    assert again["taken"] == 0 and len(redis.lists["lab:oi:series:NIFTY:2026-11-26"]) == 1
    closed = await F.refresh(store, None, now=datetime(2026, 11, 26, 18, 0, tzinfo=options.IST))
    assert closed["skipped"] == "market closed"


@pg
async def test_the_route_is_for_lab_members_and_reads_the_stored_snapshots(app):  # noqa: F811
    member = await signed_in(app, "oiflow-member@example.com", plan="gold")
    assert (await member.get("/api/lab/oiflow/NIFTY")).status_code == 403
    admin = await admin_with_mfa(app, "oiflow-boss@example.com")
    day = options._ist().date().isoformat()
    base = {k: (1000, 2000, 900, 2100) for k in range(24900, 25150, 50)}
    for t in ("09:15", "09:30"):
        await app.state.store.redis.rpush(f"lab:oi:series:NIFTY:{day}", orjson.dumps(point(t, base)))
    r = await admin.get("/api/lab/oiflow/nifty")
    b = r.json()
    assert r.status_code == 200 and b["underlying"] == "NIFTY" and b["available"] and b["snapshots"] == 2 and b["today"]
    assert r.headers["cache-control"] == "no-store"
    assert (await admin.get("/api/lab/oiflow/RELIANCE")).status_code == 404
    await app.state.store.redis.delete(f"lab:oi:series:NIFTY:{day}")
