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
    async def fake(settings, now=None, local=None):
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
