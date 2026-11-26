"""Trading Lab > Stock zones (lab/zones.py): the price areas of the latest session, each by a fixed rule from 5-minute candles. Describe-only."""
import pytest

from finlit import intraday
from finlit.lab import zones as Z
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration


def series(days):
    """days: {"2026-11-25": [(o, h, l, c, v), ...]} -> the stored intraday series, 5-minute candles from 09:15."""
    t, o, h, l, c, v = [], [], [], [], [], []
    for d, bars in days.items():
        for i, (bo, bh, bl, bc, bv) in enumerate(bars):
            m = 9 * 60 + 15 + 5 * i
            t.append(f"{d}T{m // 60:02d}:{m % 60:02d}:00+05:30")
            o.append(bo); h.append(bh); l.append(bl); c.append(bc); v.append(bv)
    return {"t": t, "o": o, "h": h, "l": l, "c": c, "v": v}


FLAT = [(100, 100.5, 99.5, 100, 1000)] * 10


def test_previous_day_pivots_opening_range_and_vwap():
    prev = [(100, 104, 99, 102, 1000)] + [(102, 103, 98, 101, 1000)] * 4          # H 104, L 98, C 101
    today = [(101, 103, 100, 102, 1000), (102, 104, 101, 103, 3000), (103, 103.5, 102, 102.5, 1000), (102.5, 106, 102.5, 105.5, 1000)]
    z = Z.zones(series({"2026-11-24": prev, "2026-11-25": today}))
    by = {x["key"]: x["price"] for x in z["levels"]}
    assert (by["PDH"], by["PDL"], by["PDC"]) == (104, 98, 101)
    p = (104 + 98 + 101) / 3
    assert by["P"] == round(p, 2) and by["R1"] == round(2 * p - 98, 2) and by["S1"] == round(2 * p - 104, 2)
    assert by["R2"] == round(p + 6, 2) and by["S2"] == round(p - 6, 2)
    assert (by["ORH"], by["ORL"]) == (104, 100)                     # the first three candles only
    assert z["openingRange"] == "above the opening range" and z["last"] == 105.5
    tp = [(103 + 100 + 102) / 3, (104 + 101 + 103) / 3, (103.5 + 102 + 102.5) / 3, (106 + 102.5 + 105.5) / 3]
    want = (tp[0] * 1000 + tp[1] * 3000 + tp[2] * 1000 + tp[3] * 1000) / 6000
    assert by["VWAP"] == round(want, 2) and z["vsVwap"] == "above"
    assert z["vwap"][:5] == [None] * 5 and len(z["vwap"]) == len(z["candles"]["t"]) == 9   # both sessions drawn; VWAP only today's
    assert [x["price"] for x in z["levels"]] == sorted((x["price"] for x in z["levels"]), reverse=True)
    assert z["changePct"] == round((105.5 - 101) / 101 * 100, 2)


def test_fair_value_gaps_and_whether_price_has_come_back_into_them():
    up_gap = [(100, 101, 99, 100.8, 1), (100.8, 103, 100.8, 102.9, 1), (103, 104, 102, 103.8, 1)]     # 3rd low 102 > 1st high 101
    z = Z.fair_value_gaps(Z.candles(series({"d": up_gap})))
    assert len(z) == 1 and z[0]["side"] == "up" and (z[0]["lo"], z[0]["hi"]) == (101, 102) and z[0]["status"] == "open"
    part = up_gap + [(103.8, 104, 101.5, 103, 1)]
    assert Z.fair_value_gaps(Z.candles(series({"d": part})))[0]["status"] == "part filled"
    full = up_gap + [(103.8, 104, 100.5, 101, 1)]
    assert Z.fair_value_gaps(Z.candles(series({"d": full})))[0]["status"] == "filled"
    tiny = [(100, 100.1, 99.9, 100, 1), (100, 100.2, 100, 100.2, 1), (100.2, 100.3, 100.15, 100.3, 1)]   # 0.05% wide: noise
    assert Z.fair_value_gaps(Z.candles(series({"d": tiny}))) == []
    down_gap = [(100, 101, 99, 99.2, 1), (99.2, 99.2, 97, 97.1, 1), (97, 98, 96, 96.5, 1)]
    g = Z.fair_value_gaps(Z.candles(series({"d": down_gap})))
    assert g[0]["side"] == "down" and (g[0]["lo"], g[0]["hi"]) == (98, 99)


def test_an_order_block_is_the_last_candle_against_a_strong_move():
    bars = FLAT[:5] + [(100, 100.3, 99.2, 99.4, 1), (99.4, 101.5, 99.4, 101.4, 1), (101.4, 103, 101.3, 102.8, 1)] + [(102.8, 103, 102.5, 102.7, 1)] * 4
    obs = Z.order_blocks(Z.candles(series({"d": bars})))
    up = [b for b in obs if b["side"] == "up"]
    assert len(up) == 1 and (up[0]["lo"], up[0]["hi"]) == (99.2, 100.3) and up[0]["status"] == "untested" and up[0]["moveAvg"] >= 2
    tested = bars + [(102.7, 102.7, 100, 100.5, 1)]
    assert [b for b in Z.order_blocks(Z.candles(series({"d": tested}))) if b["side"] == "up"][0]["status"] == "tested"
    broken = bars + [(102.7, 102.7, 98, 98.5, 1)]
    assert [b for b in Z.order_blocks(Z.candles(series({"d": broken}))) if b["side"] == "up"][0]["status"] == "broken"
    assert Z.order_blocks(Z.candles(series({"d": FLAT}))) == []                   # no move, no block


def test_no_candles_reads_as_unavailable_and_bad_values_are_dropped():
    assert Z.zones({"t": [], "o": [], "h": [], "l": [], "c": [], "v": []})["available"] is False
    s = series({"2026-11-25": FLAT[:4]})
    s["c"][1] = None
    z = Z.zones(s)
    assert z["available"] and len(z["candles"]["t"]) == 3 and z["previousSession"] is None and z["changePct"] is None
    assert not any(x["group"] in ("previous", "pivot") for x in z["levels"])     # one session: no previous-day levels, no guess


def test_nothing_in_the_answer_tells_anyone_to_trade():
    bars = FLAT[:5] + [(100, 100.3, 99.2, 99.4, 1), (99.4, 101.5, 99.4, 101.4, 1), (101.4, 103, 101.3, 102.8, 1)]
    text = repr(Z.zones(series({"2026-11-24": FLAT, "2026-11-25": bars}))).lower()
    for word in ("buy", "sell", "target", "stop loss", "entry", "best", "bullish", "bearish"):
        assert word not in text


@pg
async def test_the_route_is_for_lab_members_and_reuses_the_shared_intraday_copy(app, monkeypatch):  # noqa: F811
    calls = []

    async def fake_load(_app, sym, rng):
        calls.append((sym, rng))
        if sym == "NOPE":
            return None, 404, "not_found"
        return {"status": "ok", "available": True, "exchange": "NSE", "source": "Dhan", "asOf": "2026-11-25T11:00:00+05:30",
                "series": series({"2026-11-24": FLAT, "2026-11-25": FLAT[:6]})}, 200, ""
    monkeypatch.setattr(intraday, "load", fake_load)
    member = await signed_in(app, "zones-member@example.com", plan="gold")
    assert (await member.get("/api/lab/zones/RELIANCE")).status_code == 403
    admin = await admin_with_mfa(app, "zones-boss@example.com")
    r = await admin.get("/api/lab/zones/reliance")
    body = r.json()
    assert r.status_code == 200 and body["symbol"] == "RELIANCE" and body["available"] and body["session"] == "2026-11-25"
    assert calls == [("RELIANCE", "5D")] and r.headers["cache-control"] == "no-store"
    assert (await admin.get("/api/lab/zones/NOPE")).status_code == 404
    assert (await admin.get("/api/lab/zones/bad%20sym")).status_code == 400
