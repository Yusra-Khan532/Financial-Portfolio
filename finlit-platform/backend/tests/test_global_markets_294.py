"""Task #294: the dashboard's global markets card: overseas indices, gold, crude, the rupee and the US 10-year yield, with 1-day, 1-week and 1-month moves."""
from datetime import date, datetime, timedelta, timezone

import pytest

from finlit import global_markets as gm
from test_auth import anon, app  # noqa: F401  (fixtures)
from test_integration import ingested, make_settings, store  # noqa: F401  (fixtures)

CSV = "observation_date,SP500\n2026-10-19,7700.0\n2026-10-20,.\n2026-11-12,7600.0\n2026-11-18,7323.8\n2026-11-19,7175.83\n"


def test_fred_csv_skips_blank_days_and_reads_oldest_first():
    pts = gm.parse_fred(CSV)
    assert pts[0] == (date(2026, 10, 19), 7700.0) and pts[-1] == (date(2026, 11, 19), 7175.83) and len(pts) == 4


def test_moves_are_percent_for_prices_and_points_for_a_yield():
    m = gm.moves(gm.parse_fred(CSV), "pts")
    assert m["last"] == 7175.83 and m["asOf"] == "2026-11-19"
    assert m["d1"] == round((7175.83 / 7323.8 - 1) * 100, 2)                 # against the previous close
    assert m["w1"] == round((7175.83 / 7600.0 - 1) * 100, 2)                 # the close on or before a week earlier (12 Nov)
    assert m["m1"] == round((7175.83 / 7700.0 - 1) * 100, 2)                 # on or before 30 days earlier (19 Oct)
    y = gm.moves([(date(2026, 11, 18), 5.07), (date(2026, 11, 19), 5.04)], "%")
    assert y["d1"] == -0.03                                                   # a yield moves in percentage points
    assert gm.moves([], "pts") == {"last": None, "asOf": None, "d1": None, "w1": None, "m1": None, "line": []}


def test_twelve_data_refusal_and_closes():
    pts, why = gm.parse_twelve({"status": "ok", "values": [{"datetime": "2026-11-20", "close": "8100.5"}, {"datetime": "2026-11-19", "close": "8000"}]})
    assert pts == [(date(2026, 11, 19), 8000.0), (date(2026, 11, 20), 8100.5)] and why is None
    pts, why = gm.parse_twelve({"status": "error", "message": "This symbol is available on the Grow plan"})
    assert pts == [] and why == "Twelve Data did not return this series: This symbol is available on the Grow plan"


def test_sessions_follow_each_markets_local_hours():
    ny = next(s for s in gm.SERIES if s["key"] == "sp500")
    assert gm.session_now(ny, datetime(2026, 11, 20, 15, 0, tzinfo=timezone.utc))["open"] is True       # 10:00 in New York, a Friday
    assert gm.session_now(ny, datetime(2026, 11, 21, 15, 0, tzinfo=timezone.utc))["open"] is False      # Saturday
    assert gm.session_now(gm.HOME, datetime(2026, 11, 20, 5, 0, tzinfo=timezone.utc))["open"] is True   # 10:30 IST


def test_rows_without_a_key_say_why_and_the_site_rupee_wins_when_newer():
    now = datetime(2026, 11, 21, 9, 0, tzinfo=timezone.utc)
    out = gm.build({"sp500": (gm.parse_fred(CSV), None), "ftse": ([], gm.NO_KEY)}, now)
    rows = {r["key"]: r for r in out["rows"]}
    assert rows["ftse"]["last"] is None and rows["ftse"]["why"] == gm.NO_KEY and rows["ftse"]["source"] == "Twelve Data"
    assert rows["sp500"]["why"] is None and rows["sp500"]["place"]["city"] == "New York"
    assert out["summary"]["indices"] == 1 and out["summary"]["down"] == 1 and out["summary"]["markets"] == 7
    assert rows["gold"]["place"] is None and "not investment advice" in out["disclaimer"]


@pytest.mark.asyncio
async def test_collect_prefers_the_sites_fresher_rupee(monkeypatch):
    async def fred(client, sid, start):
        return ([(date(2026, 11, 13), 94.24)], None) if sid == "DEXINUS" else ([], "x")
    monkeypatch.setattr(gm, "_fred", fred)
    out = await gm.collect(type("S", (), {"twelvedata_api_key": ""})(), datetime(2026, 11, 21, 9, 0, tzinfo=timezone.utc),
                           local={"usdinr": [(date(2026, 11, 20), 94.6), (date(2026, 11, 21), 94.7)]})
    r = next(x for x in out["rows"] if x["key"] == "usdinr")
    assert r["last"] == 94.7 and r["asOf"] == "2026-11-21"


@pytest.mark.asyncio
async def test_the_endpoint_answers_everyone_from_the_cache(app, anon):  # noqa: F811
    gm._mem = (0.0, None)
    async def fake(settings, now=None, local=None, redis=None):
        return gm.build({"sp500": (gm.parse_fred(CSV), None)}, datetime.now(timezone.utc))
    import finlit.global_markets as mod
    orig = mod.collect
    mod.collect = fake
    try:
        await app.state.store.redis.delete(gm.CACHE_KEY)
        r = await anon.get("/api/global-markets")
        assert r.status_code == 200
        b = r.json()
        assert next(x for x in b["rows"] if x["key"] == "sp500")["last"] == 7175.83 and "open" in b["home"] and b["summary"]["markets"] == 7
    finally:
        mod.collect = orig
        gm._mem = (0.0, None)


def test_a_short_site_series_keeps_the_providers_older_closes_for_its_month():
    from datetime import date as D
    fred = [(D(2026, 10, 15), 93.5), (D(2026, 10, 20), 93.8), (D(2026, 11, 7), 94.0), (D(2026, 11, 14), 94.2)]
    site = [(D(2026, 11, 10), 94.1), (D(2026, 11, 20), 92.97)]
    got = gm.splice(fred, site)
    assert got == [(D(2026, 10, 15), 93.5), (D(2026, 10, 20), 93.8), (D(2026, 11, 7), 94.0), (D(2026, 11, 10), 94.1), (D(2026, 11, 20), 92.97)]
    m = gm.moves(got, "₹")
    assert m["last"] == 92.97 and m["m1"] == round((92.97 / 93.8 - 1) * 100, 2) and m["w1"] == round((92.97 / 94.1 - 1) * 100, 2)
    assert gm.splice([], site) == site and gm.splice(fred, []) == fred


# ------------------------------------------------------------------------------------------------ task #298 follow-up: EODHD's free plan
def test_eodhd_closes_are_read_and_an_error_is_said():
    from datetime import date as D
    pts, why = gm.parse_eodhd([{"date": "2026-11-19", "close": 24802.78}, {"date": "2026-11-18", "close": 25463.81}, {"date": "2026-11-17", "close": None}])
    assert pts == [(D(2026, 11, 18), 25463.81), (D(2026, 11, 19), 24802.78)] and why is None
    assert gm.parse_eodhd({"message": "Forbidden"}) == ([], "EODHD did not return this series: Forbidden")


class _Redis:
    def __init__(self):
        self.d = {}

    async def get(self, k):
        return self.d.get(k)

    async def set(self, k, v, ex=None):
        self.d[k] = v


async def test_eodhd_fills_a_row_once_a_day_and_twelve_data_comes_first():
    import httpx
    from datetime import date as D
    calls = []

    def handler(req):
        calls.append(req.url.host + req.url.path)
        if req.url.host == "eodhd.com":
            return httpx.Response(200, json=[{"date": "2026-11-18", "close": 100.0}, {"date": "2026-11-19", "close": 102.0}])
        return httpx.Response(200, json={"status": "ok", "values": [{"datetime": "2026-11-19", "close": "7"}]})
    dax = next(s for s in gm.SERIES if s["key"] == "dax")
    assert dax["eod"] == "GDAXI.INDX"
    redis = _Redis()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        pts, why, src = await gm._market(c, dax, "", "eodkey", D(2026, 10, 7), redis)
        assert src == "EODHD" and pts[-1] == (D(2026, 11, 19), 102.0) and why is None
        await gm._market(c, dax, "", "eodkey", D(2026, 10, 7), redis)                       # the second read in the day comes from the cache
        assert calls == ["eodhd.com/api/eod/GDAXI.INDX"]
        pts, _, src = await gm._market(c, dax, "tdkey", "eodkey", D(2026, 10, 7), redis)     # with a Twelve Data key, Twelve Data first
        assert src == "Twelve Data" and pts == [(D(2026, 11, 19), 7.0)]
        assert await gm._market(c, dax, "", "", D(2026, 10, 7)) == ([], gm.NO_KEY, "Twelve Data")
    assert "EODHD or Twelve Data" in gm.NO_KEY


async def test_the_ftse_100_comes_through_a_labelled_tracker_fund_and_an_empty_answer_is_not_asked_again():
    """The founder, 22 Nov 2026: "use the labelled tracker fund for FTSE 100" (EODHD's free plan has no FTSE 100 index: UKX.INDX and FTSE.INDX
    answered with no closes, 21 Nov). The row keeps its name, says which fund it is shown through, and prices the fund in pence."""
    import httpx
    from datetime import date as D, datetime as DT, timezone as TZ
    seen = []

    def handler(req):
        seen.append(req.url.path)
        if req.url.path.endswith("/ISF.LSE"):
            return httpx.Response(200, json=[])                    # the first fund gives nothing: the next one is tried
        return httpx.Response(200, json=[{"date": "2026-11-13", "close": 44.10}, {"date": "2026-11-19", "close": 44.50}, {"date": "2026-11-20", "close": 44.95}])
    ftse = next(s for s in gm.SERIES if s["key"] == "ftse")
    assert "eod" not in ftse and [t[0] for t in ftse["trackers"]] == ["ISF.LSE", "VUKE.LSE"]
    redis = _Redis()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        got = await gm._market(c, ftse, "", "k", D(2026, 10, 7), redis)
        assert got[:3] == ([(D(2026, 11, 13), 44.10), (D(2026, 11, 19), 44.50), (D(2026, 11, 20), 44.95)], None, "EODHD")
        assert got[3] == {"name": "Vanguard FTSE 100 UCITS ETF (VUKE)", "code": "VUKE", "unit": "GBP"}
        await gm._market(c, ftse, "", "k", D(2026, 10, 7), redis)              # both answers kept 12 hours, the empty one too: no second call
    assert seen == ["/api/eod/ISF.LSE", "/api/eod/VUKE.LSE"]
    row = next(r for r in gm.build({"ftse": got}, DT(2026, 11, 22, 6, tzinfo=TZ.utc))["rows"] if r["key"] == "ftse")
    assert row["label"] == "FTSE 100" and row["unit"] == "GBP" and row["last"] == 44.95 and row["d1"] == 1.01
    assert row["tracker"]["name"] == "Vanguard FTSE 100 UCITS ETF (VUKE)"
    assert "a fund that tracks the FTSE 100" in row["tracker"]["note"] and "not the index level" in row["tracker"]["note"]
    plain = next(r for r in gm.build({"dax": ([(D(2026, 11, 20), 1.0)], None, "EODHD")}, DT(2026, 11, 22, tzinfo=TZ.utc))["rows"] if r["key"] == "dax")
    assert plain["tracker"] is None and plain["unit"] == "pts"


def test_a_cached_answer_keeps_its_age_after_a_restart():
    import time
    from datetime import datetime, timedelta, timezone
    old = (datetime.now(timezone.utc) - timedelta(minutes=50)).isoformat(timespec="seconds")
    age = time.time() - gm.built_at({"builtAt": old})
    assert 2990 <= age <= 3010                                   # 50 minutes old, not new: it is rebuilt in 10 minutes, not in an hour
    assert abs(gm.built_at({}) - time.time()) < 2
