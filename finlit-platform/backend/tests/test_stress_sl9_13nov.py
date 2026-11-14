"""Task #79, the team's 13 Nov fix list: SL-9 (every page on the same close, with the same inputs) and SL-11 (no internal notes in the public payload)."""
import json
from datetime import date, datetime, timezone

import pytest

from finlit.screener import data
from finlit.screener.data import Table
from finlit.stress import page as P
from finlit.stress import router as R
from finlit.stress import service
from test_auth import ORIGIN, anon, app, new_client, signed_in  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: F401  (fixtures)

S = service.S
FIX = __import__("pathlib").Path(__file__).parent.parent / "finlit_technicals" / "tests" / "fixtures"
IST = service.IST
pytestmark = pytest.mark.integration


def _row(sym, mcap, bank=0, q=20260930):
    from test_stress_api import _row as r
    return r(sym, mcap, bank, q)


@pytest.fixture(autouse=True)
def fake_table():
    data._table = Table([_row("ASIANPAINT", 233000), _row("TITAN", 300000)], {}, {})
    R._failed_at.clear()
    yield
    data.reset()
    R._failed_at.clear()


async def _closes(store, rows):
    async with store.pool.acquire() as conn:
        await conn.executemany("DELETE FROM price_daily WHERE symbol = $1 AND day = $2", [(s, d) for s, d, _ in rows])
        await conn.executemany("INSERT INTO price_daily (symbol, day, open, high, low, close, volume) VALUES ($1, $2, $3, $3, $3, $3, 1) ON CONFLICT DO NOTHING",
                               [(s, d, c) for s, d, c in rows])


async def _clean(store):
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM stress_pages"); await conn.execute("DELETE FROM stress_failures"); await conn.execute("DELETE FROM stress_inputs")
        await conn.execute("DELETE FROM price_daily WHERE symbol = ANY($1::text[])", list(service.REFERENCE_CLOSES) + ["ASIANPAINT", "TITAN"])


async def test_the_latest_close_is_the_previous_session_until_the_evening_and_never_a_mid_session_day(store):  # noqa: F811
    await _clean(store)
    await _closes(store, [("RELIANCE", date(2026, 11, 11), 1290.0), ("RELIANCE", date(2026, 11, 12), 1300.0)])
    morning = datetime(2026, 11, 13, 5, 0, tzinfo=timezone.utc)              # 10:30 IST on 13 Nov: the 12 Nov close
    assert await service.current_close(store, morning) == date(2026, 11, 12)
    await _closes(store, [("RELIANCE", date(2026, 11, 13), 1310.0)])          # a row for 13 Nov already there (a mid-session copy) is still not used before 16:00 IST
    assert await service.current_close(store, morning) == date(2026, 11, 12)
    evening = datetime(2026, 11, 13, 14, 0, tzinfo=timezone.utc)              # 19:30 IST, after the evening refresh stored 13 Nov
    assert await service.current_close(store, evening) == date(2026, 11, 13)
    await _closes(store, [("ASIANPAINT", date(2026, 11, 12), 2410.5)])
    assert await service.close_price(store, "ASIANPAINT", date(2026, 11, 12)) == ("2026-11-12", 2410.5)
    await _clean(store)


def test_the_inputs_snapshot_is_cut_to_the_close():
    today_in = {"as_of": "2026-11-14", "brent": [["2026-11-03", 107.03], ["2026-11-11", 92.14], ["2026-11-13", 95.0]],
                "series": {"cpi": {"points": [["2026-09-30", 5.54], ["2026-10-31", 6.09]]}, "usdinr": {"points": [["2026-11-12", 88.4], ["2026-11-13", 88.6]]}}}
    snap = service.snapshot_for(today_in, [80.0, 79.0, 78.0, 77.0], date(2026, 11, 12))
    assert snap["today"]["as_of"] == "2026-11-12" and snap["today"]["brent"][-1] == ["2026-11-11", 92.14]
    assert snap["today"]["series"]["usdinr"]["points"] == [["2026-11-12", 88.4]] and snap["today"]["series"]["cpi"]["points"][-1] == ["2026-10-31", 6.09]
    assert snap["eia"] == [80.0, 79.0, 78.0, 77.0]


async def test_every_page_for_a_close_uses_one_stored_snapshot_even_when_the_macro_table_moves_on(store, monkeypatch):  # noqa: F811
    await _clean(store)
    calls = []
    async def macro(store_):
        calls.append(1)
        return ({"as_of": "x", "brent": [["2026-11-11", 92.14 + len(calls)]], "series": {}}, None)
    monkeypatch.setattr(service, "macro_today", macro)
    a, _ = await service.inputs_for_close(store, date(2026, 11, 12))
    b, _ = await service.inputs_for_close(store, date(2026, 11, 12))
    assert a == b and len(calls) == 1 and a["brent"] == [["2026-11-11", 93.14]]          # the second page reads the same stored snapshot
    c, _ = await service.inputs_for_close(store, date(2026, 11, 13))
    assert len(calls) == 2 and c["as_of"] == "2026-11-13"                                 # a new close: a new snapshot
    await _clean(store)


def test_a_page_is_current_only_on_this_close_with_this_model_and_the_sites_own_rupee_series():
    ok = {"as_of": "2026-11-12", "model": S.MODEL_VERSION, "today_inputs": {"usdinr_source": "FinLit usdinr"}}
    assert service.page_is_current(ok, date(2026, 11, 12))
    assert not service.page_is_current({**ok, "as_of": "2026-11-11"}, date(2026, 11, 12))                          # an older close
    assert not service.page_is_current({**ok, "today_inputs": {"usdinr_source": "usdinr argument"}}, date(2026, 11, 12))   # the stop-gap
    assert not service.page_is_current({**ok, "model": "0.0.0"}, date(2026, 11, 12))
    assert service.page_is_current({"as_of": "old"}, None)                               # no close stored at all (a fresh database): served as before


def test_the_stop_gap_rupee_source_is_gone():
    assert not hasattr(service, "stopgap_usdinr") and not (service.Path(service.__file__).parent / "data" / "usdinr_monthly_stopgap.json").exists()


async def test_a_gap_in_the_rupee_series_is_being_prepared_never_another_source(store, monkeypatch):  # noqa: F811
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    m = json.loads((FIX / "macro_2026-11-04.json").read_text(encoding="utf-8"))
    holed = {**m, "series": {**m["series"], "usdinr": {"points": [["2026-11-02", 94.9]]}}}
    async def macro(store_):
        return holed, None
    async def no_close(store_, now=None):
        return None
    monkeypatch.setattr(service, "macro_today", macro)
    monkeypatch.setattr(service, "current_close", no_close)
    with pytest.raises(service.NotReady) as e:
        await service.company_and_today(__import__("types").SimpleNamespace(state=__import__("types").SimpleNamespace(store=store)), "ASIANPAINT", pack=pack)
    assert "USD/INR" in str(e.value)


def test_sl11_the_payload_carries_no_notes_for_the_team():
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    m = json.loads((FIX / "macro_2026-11-04.json").read_text(encoding="utf-8"))
    co = S.company_from_pack(pack)
    co.notes = ["Beta not supplied: 1.0 used (compute it from two years of weekly returns vs Nifty 50)."]
    today = S.load_today(m, co.base_end)
    p = P.page_payload(pack, co, today, eia_brent_next4=None, today_dates={}, base_window=tuple(today.inputs["base_window"]), closes={}, nifty={}, as_of="2026-11-04",
                       size="Large cap", price_as_of="2026-11-04", inventory_days=None)
    assert "notes" not in p["company"] and "exposure_notes" not in p["company"] and "warnings" not in p["today_inputs"]
    assert "not supplied" not in json.dumps(p) and "x-rates" not in json.dumps(p)


async def test_a_page_from_an_older_close_is_not_served_and_is_rebuilt_on_this_close_from_its_stored_statements(app, store, monkeypatch):  # noqa: F811
    from test_stress_api import _payload
    await _clean(store)
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    old = {**_payload(), "as_of": "2026-11-11"}
    await service.save_page(store, "ASIANPAINT", old, pack)
    async def close(store_, now=None):
        return date(2026, 11, 12)
    monkeypatch.setattr(service, "current_close", close)
    got = []
    async def build(app_, sym, size, statement="consolidated", pack=None):
        got.append(pack is not None)
        new = {**_payload(), "as_of": "2026-11-12"}
        new["today_inputs"] = {**new["today_inputs"], "usdinr_source": "FinLit usdinr"}
        return new, pack or {}
    monkeypatch.setattr(service, "build_payload_and_pack", build)
    silver = await signed_in(app, "sl9@example.com", plan="silver")
    r = await silver.get("/api/stress/ASIANPAINT/page")
    assert r.status_code == 200 and r.json()["as_of"] == "2026-11-12"            # never the 11 Nov page
    assert got == [True]                                                           # rebuilt from its stored statements: no call to the data provider
    await silver.aclose()
    await _clean(store)


async def test_the_nightly_run_rebuilds_pages_not_on_the_latest_close_first(store, monkeypatch):  # noqa: F811
    from test_stress_api import _payload
    await _clean(store)
    pack = json.loads((FIX / "ASIANPAINT.json").read_text(encoding="utf-8"))
    cur = {**_payload(), "as_of": "2026-11-12"}
    cur["today_inputs"] = {**cur["today_inputs"], "usdinr_source": "FinLit usdinr"}
    await service.save_page(store, "TITAN", cur, pack)                                       # already on the close
    await service.save_page(store, "ASIANPAINT", {**_payload(), "as_of": "2026-11-11"}, pack)   # an older close and the stop-gap rupee
    async def close(store_, now=None):
        return date(2026, 11, 12)
    monkeypatch.setattr(service, "current_close", close)
    calls = []
    async def build(app_, sym, size, statement="consolidated", pack=None):
        calls.append((sym, pack is not None))
        return cur, pack or {}
    monkeypatch.setattr(service, "build_payload_and_pack", build)
    res = await service.refresh_stress(store, object(), max_minutes=5)
    assert calls == [("ASIANPAINT", True)] and res["skipped_built_today"] == 1
    await _clean(store)
