"""Trading Lab, Order Flow engine (finlit/lab/flow.py, migration 144; docs/TRADING-LAB.md "Order Flow", step 1).

What must hold: each figure follows its stated formula and nothing else (build-up, OI change summed over the current and next contract against
the previous session's close, VWAP only inside the day's range, classic pivots only when the stored day really is the previous session, the zone,
the five-fact agreement); a missing input gives null with its reason, never a guess; the snapshot keeps the day's path for the lines, today's
open interest becomes tomorrow's baseline, a contract with no baseline is filled from Dhan's daily history; the route is for Lab members only."""
from datetime import date, datetime

import orjson
import pytest

from finlit.dhan import IST
from finlit.lab import flow
from test_auth import ORIGIN, app, new_client, signed_in, signup  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration


def quote(price, prev, low, high, vwap=None, oi=None, at="25/11/2026 11:02:10", open_=None, volume=1000):
    q = {"last_price": price, "net_change": round(price - prev, 2), "ohlc": {"open": open_ or prev, "high": high, "low": low, "close": prev},
         "volume": volume, "last_trade_time": at}
    if vwap is not None:
        q["average_price"] = vwap
    if oi is not None:
        q["oi"] = oi
    return q


# ------------------------------------------------------------------------------------------------------------------ pure figures

def test_pivots_follow_the_classic_formula_and_refuse_impossible_sessions():
    pv = flow.pivots(110, 90, 100)
    assert pv == {"p": 100.0, "r1": 110.0, "s1": 90.0, "r2": 120.0, "s2": 80.0}
    assert flow.pivots(110, 90, 120) is None        # a close outside the day's range is not a session
    assert flow.pivots(90, 110, 100) is None
    assert flow.pivots(None, 90, 100) is None


def test_zone_names_where_the_price_sits_a_level_counts_as_above():
    pv = flow.pivots(110, 90, 100)
    assert [flow.zone(p, pv) for p in (125, 120, 115, 105, 95, 85, 79)] == ["above_r2", "above_r2", "r1_r2", "p_r1", "s1_p", "s2_s1", "below_s2"]
    assert flow.zone(100, None) is None


def test_distribution_counts_every_stock_once_zero_in_the_band_above():
    d = flow.distribution([-6, -4, -0.2, 0, 0.3, 7])
    assert sum(b["count"] for b in d) == 6
    assert d[0] == {"from": None, "to": -5, "count": 1} and d[-1] == {"from": 5, "to": None, "count": 1}
    assert next(b for b in d if b["from"] == 0)["count"] == 2


def test_long_build_up_with_every_fact_lined_up():
    eq = quote(1089.1, 1023.0, 1020.0, 1092.0, vwap=1070.0)
    near, nxt = quote(1093.0, 1027.0, 1024, 1096, oi=1_100_000), quote(1098.0, 1032.0, 1030, 1100, oi=100_000)
    r = flow.stock_row("POLICYBZR", eq, [(near, 1_000_000), (nxt, 50_000)], {"day": "2026-11-24", "high": 1030.0, "low": 1010.0, "close": 1023.0},
                       {"name": "PB Fintech", "sector": "Financial Services", "lot": 350})
    assert r["changePct"] == round((1089.1 - 1023.0) / 1023.0 * 100, 2)
    assert r["oi"] == 1_200_000 and r["oiChange"] == 150_000 and r["oiChangePct"] == round(150_000 / 1_050_000 * 100, 2)
    assert r["buildup"] == "long_buildup" and r["direction"] == 1
    assert r["pivots"] == flow.pivots(1030.0, 1010.0, 1023.0) and r["zone"] == "above_r2" and r["pivotsFrom"] == "2026-11-24"
    assert r["vwap"] == 1070.0 and r["vwapGapPct"] == round((1089.1 - 1070) / 1070 * 100, 2)
    assert r["agreement"]["score"] == 5 and all(r["agreement"]["facts"].values())
    assert r["notes"] == []


@pytest.mark.parametrize("fut_price,oi_now,expected", [
    (95.0, 1_100_000, "short_buildup"), (105.0, 900_000, "short_covering"), (95.0, 900_000, "long_unwinding"), (105.0, 1_000_000, None)])
def test_the_four_build_ups_from_the_futures_price_and_oi(fut_price, oi_now, expected):
    r = flow.stock_row("X", quote(fut_price, 100.0, 90, 110), [(quote(fut_price, 100.0, 90, 110, oi=oi_now), 1_000_000)], None, {})
    assert r["buildup"] == expected


def test_missing_inputs_give_null_with_the_reason_never_a_guess():
    eq = quote(500.0, 490.0, 480.0, 505.0, vwap=520.0)               # an average price outside the day's range is not used
    r = flow.stock_row("Y", eq, [(quote(501.0, 491.0, 480, 506, oi=10), None)], {"day": "2026-11-10", "high": 300, "low": 280, "close": 290}, {})
    assert r["vwap"] is None and any(n.startswith("vwap:") for n in r["notes"])
    assert r["oi"] is None and r["oiChange"] is None and r["buildup"] is None
    assert any("previous session's open interest" in n for n in r["notes"])
    assert r["pivots"] is None and r["zone"] is None and any("is not the previous session" in n for n in r["notes"])   # 290 vs 490: an old day
    none = flow.stock_row("Z", quote(500.0, 490.0, 480, 505), [], None, {})
    assert any("no futures contract" in n for n in none["notes"]) and any("no previous session" in n for n in none["notes"])
    assert flow.stock_row("Q", {"last_price": 0}, [], None, {}) is None   # no trade: no row at all


def test_rank_puts_more_facts_first_then_bigger_oi_change():
    rows = [{"symbol": s, "agreement": {"score": a}, "oiChangePct": o, "changePct": 1.0} for s, a, o in (("A", 2, 9), ("B", 4, 1), ("C", 4, -8))]
    assert [r["symbol"] for r in flow.rank(rows)] == ["C", "B", "A"]


def test_summary_counts_breadth_build_ups_and_sectors():
    rows = [flow.stock_row(s, quote(p, 100.0, 90, 110), [(quote(p, 100.0, 90, 110, oi=o), 1000)], None, {"sector": sec})
            for s, p, o, sec in (("A", 104, 1200, "Metal"), ("B", 97, 1300, "Metal"), ("C", 101, 900, "IT"), ("D", 100, 1000, None))]
    s = flow.summarize(rows)
    assert (s["stocks"], s["up"], s["down"], s["flat"]) == (4, 2, 1, 0)   # D: an unchanged price reads as an unknown change (dhan.to_quote), not as flat
    assert s["buildups"] == {"long_buildup": 1, "short_buildup": 1, "short_covering": 1, "long_unwinding": 0}
    metal = next(x for x in s["sectors"] if x["sector"] == "Metal")
    assert metal["stocks"] == 2 and metal["up"] == 1 and metal["down"] == 1 and metal["avgChangePct"] == 0.5 and metal["oiChange"] == 500
    assert any(x["sector"] == "Other" for x in s["sectors"])


def test_future_collector_keeps_the_current_and_next_contract():
    c = flow.FutureCollector()
    base = {"EXCH_ID": "NSE", "SEGMENT": "D", "INSTRUMENT": "FUTSTK", "UNDERLYING_SYMBOL": "TCS", "LOT_SIZE": "175"}
    for sid, exp in (("1", "2026-10-27"), ("2", "2026-11-25"), ("3", "2026-12-30"), ("4", "2027-01-27")):
        c.add({**base, "SECURITY_ID": sid, "SM_EXPIRY_DATE": exp + " 14:30:00"})
    c.add({**base, "UNDERLYING_SYMBOL": "123NSETEST", "SECURITY_ID": "9", "SM_EXPIRY_DATE": "2026-11-25"})   # exchange test scrip
    c.add({**base, "INSTRUMENT": "OPTSTK", "SECURITY_ID": "8", "SM_EXPIRY_DATE": "2026-11-25"})
    assert [(r["security_id"], r["expiry"].isoformat(), r["lot_size"]) for r in c.rows(date(2026, 11, 25))] == [("2", "2026-11-25", 175), ("3", "2026-12-30", 175)]


def test_lines_are_thinned_evenly_keeping_the_first_and_last():
    pts = [[f"{9 + i // 60:02d}:{i % 60:02d}", {"A": [i / 10, None]}] for i in range(300)]
    out = flow.lines(pts, limit=50)
    assert len(out["times"]) == 50 and out["times"][0] == pts[0][0] and out["times"][-1] == pts[-1][0]
    assert out["change"]["A"][0] == 0.0 and out["change"]["A"][-1] == 29.9


# ------------------------------------------------------------------------------------------------------------------ the snapshot (database)

class FakeDhan:
    """Two F&O shares, each with two contracts; the history call answers only for contract 103."""

    def __init__(self, at="25/11/2026 11:02:10"):
        self.at, self.history_calls = at, []

    async def quotes(self, ids):
        q = {("NSE_EQ", "11"): quote(1089.1, 1023.0, 1020.0, 1092.0, vwap=1070.0, at=self.at),
             ("NSE_EQ", "12"): quote(163.0, 178.0, 162.0, 179.0, vwap=170.0, at=self.at),
             ("NSE_FNO", "101"): quote(1093.0, 1027.0, 1024, 1096, oi=1_100_000, at=self.at), ("NSE_FNO", "102"): quote(1098.0, 1032.0, 1030, 1100, oi=100_000, at=self.at),
             ("NSE_FNO", "103"): quote(163.5, 178.5, 162, 179, oi=5_000_000, at=self.at), ("NSE_FNO", "104"): quote(164.0, 179.0, 163, 180, oi=200_000, at=self.at)}
        return {k: v for k, v in q.items() if k in set(ids)}

    async def daily(self, sid, segment, start, end, instrument="EQUITY", oi=False):
        self.history_calls.append((sid, segment, instrument, oi))
        return [{"day": date(2026, 11, 24), "close": 178.4, "oi": 4_000_000}] if sid == "103" else []


async def seed(store):
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM dhan_instruments; DELETE FROM fno_futures; DELETE FROM fno_oi_daily")
        await conn.execute("INSERT INTO dhan_instruments (exch, security_id, symbol, name, fno, lot_size) VALUES "
                           "('NSE','11','POLICYBZR','PB FINTECH',true,350), ('NSE','12','TATASTEEL','TATA STEEL',true,5500), ('NSE','13','NOTFNO','X',false,null)")
        await conn.execute("INSERT INTO companies (symbol, name, nse_code, sector, industry) VALUES ('PBF','PB Fintech Ltd','POLICYBZR','Financial Services','Insurance'), "
                           "('TSL','Tata Steel Ltd','TATASTEEL','Metals & Mining','Iron & Steel') ON CONFLICT (symbol) DO NOTHING")
        await conn.execute("INSERT INTO fno_futures (security_id, underlying, expiry, lot_size) VALUES ('101','POLICYBZR','2099-11-25',350), "
                           "('102','POLICYBZR','2099-12-30',350), ('103','TATASTEEL','2099-11-25',5500), ('104','TATASTEEL','2099-12-30',5500), ('100','POLICYBZR','2020-01-30',350)")
        await conn.execute("INSERT INTO fno_oi_daily (security_id, day, oi) VALUES ('101','2026-11-24',1000000), ('102','2026-11-24',50000), "
                           "('104','2026-11-24',150000), ('101','2026-11-20',1)")
        await conn.execute("INSERT INTO price_daily (symbol, day, open, high, low, close) VALUES ('PBF','2026-11-24',1015,1030,1010,1023), ('TSL','2026-11-24',180,182,176,178) "
                           "ON CONFLICT DO NOTHING")


@pg
async def test_a_snapshot_end_to_end(store):  # noqa: F811
    await seed(store)
    dh = FakeDhan()
    res = await flow.refresh(store, dh, now=datetime(2026, 11, 25, 11, 3, tzinfo=IST))
    assert res == {"status": "ok", "tradeDay": "2026-11-25", "stocks": 2, "withOi": 2, "withPivots": 2, "historyFilled": 1, "historyStillMissing": 0}
    assert dh.history_calls == [("103", "NSE_FNO", "FUTSTK", True)]          # only the contract with no earlier day stored
    snap = orjson.loads(await store.redis.get(flow.LATEST_KEY))
    by = {r["symbol"]: r for r in snap["stocks"]}
    assert by["POLICYBZR"]["buildup"] == "long_buildup" and by["POLICYBZR"]["oiChange"] == 150_000 and by["POLICYBZR"]["sector"] == "Financial Services"
    assert by["TATASTEEL"]["buildup"] == "short_buildup" and by["TATASTEEL"]["oiChange"] == 1_050_000 and by["TATASTEEL"]["zone"] == "below_s2"
    assert "NOTFNO" not in by and snap["summary"]["up"] == 1 and snap["summary"]["down"] == 1
    async with store.pool.acquire() as conn:
        today = {r["security_id"]: r["oi"] for r in await conn.fetch("SELECT security_id, oi FROM fno_oi_daily WHERE day = '2026-11-25'")}
        hist = await conn.fetchrow("SELECT oi, source FROM fno_oi_daily WHERE security_id = '103' AND day = '2026-11-24'")
    assert today == {"101": 1_100_000, "102": 100_000, "103": 5_000_000, "104": 200_000}    # tomorrow's baseline
    assert (hist["oi"], hist["source"]) == (4_000_000, "history")
    # a second snapshot a few minutes later adds a point to the day's path; the same minute twice adds nothing
    await flow.refresh(store, dh, now=datetime(2026, 11, 25, 11, 6, tzinfo=IST))
    await flow.refresh(store, dh, now=datetime(2026, 11, 25, 11, 6, tzinfo=IST))
    pts = [orjson.loads(p) for p in await store.redis.lrange(flow.SERIES_KEY + "2026-11-25", 0, -1)]
    assert [p[0] for p in pts] == ["11:03", "11:06"] and pts[0][1]["POLICYBZR"][0] == by["POLICYBZR"]["changePct"]
    assert len(dh.history_calls) == 1                                          # the filled baseline is stored, never asked again


@pg
async def test_a_holiday_snapshot_belongs_to_the_last_session_and_writes_no_new_day(store):  # noqa: F811
    await seed(store)
    res = await flow.refresh(store, FakeDhan(at="24/11/2026 15:29:59"), now=datetime(2026, 11, 25, 10, 0, tzinfo=IST))
    assert res["tradeDay"] == "2026-11-24"
    async with store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM fno_oi_daily WHERE day = '2026-11-25'") == 0


@pg
async def test_the_route_is_for_lab_members_and_says_why_before_the_first_snapshot(app):  # noqa: F811
    member = await signed_in(app, "flow-member@example.com", plan="gold")
    assert (await member.get("/api/lab/flow")).status_code == 403
    admin = await admin_with_mfa(app, "flow-boss@example.com")
    body = (await admin.get("/api/lab/flow")).json()
    assert body["ready"] is False and "next market session" in body["reason"]
    await seed(app.state.store)
    await flow.refresh(app.state.store, FakeDhan(), now=datetime(2026, 11, 25, 11, 3, tzinfo=IST))
    body = (await admin.get("/api/lab/flow")).json()
    assert body["ready"] is True and body["tradeDay"] == "2026-11-25" and len(body["stocks"]) == 2
    assert body["lines"]["times"] == ["11:03"] and set(body["lines"]["change"]) == {"POLICYBZR", "TATASTEEL"}
