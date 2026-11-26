"""Trading Lab > Global cues (lab/global_cues.py): public-domain FRED series stored by the global-cues job, the international ETFs on NSE and
India VIX read live, USD/INR from the macro store. Facts only; never an index level (those are licensed by the index owners)."""
from datetime import date

import httpx
import pytest

from finlit.lab import global_cues as G
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration


def test_fred_csv_skips_blank_days_and_never_fills_them():
    assert G.parse_csv("observation_date,DGS10\n2026-11-20,4.41\n2026-11-21,.\n2026-11-24,4.38\n2026-11-25,\n") == {date(2026, 11, 20): 4.41, date(2026, 11, 24): 4.38}


def test_a_rate_changes_in_points_and_a_price_also_in_per_cent():
    pts = {date(2026, 11, 20): 4.41, date(2026, 11, 24): 4.33}
    c = G.cue("us10y", "US 10y", "%", "rates", "w", "Fed", "u", pts, bp=True)
    assert (c["value"], c["prev"], c["change"], c["changePct"], c["date"], c["prevDate"]) == (4.33, 4.41, -0.08, None, "2026-11-24", "2026-11-20")
    o = G.cue("brent", "Brent", "US$/bbl", "oil", "w", "EIA", "u", {date(2026, 11, 20): 80.0, date(2026, 11, 24): 82.0})
    assert o["change"] == 2.0 and o["changePct"] == 2.5 and (o["yearLow"], o["yearHigh"]) == (80.0, 82.0)
    assert G.cue("x", "x", "%", "rates", "w", "s", "u", {}) is None


def test_no_index_level_and_no_copyrighted_series_is_read():
    ids = {v[0] for v in G.FRED.values()}
    assert not ids & {"SP500", "NASDAQCOM", "DJIA", "NIKKEI225", "VIXCLS"}      # these carry their owners' copyright on FRED
    assert all(not k.startswith(("sp", "nasdaq", "dow", "nikkei")) for k in G.FRED)


def test_live_cues_read_the_etfs_and_india_vix_from_one_quote_answer():
    ids = {s: fb for s, (_l, _w, fb) in G.ETFS.items()}
    data = {"NSE_EQ": {"22739": {"last_price": 231.5, "net_change": 2.5, "ohlc": {"open": 230, "high": 232, "low": 229, "close": 229.0}}},
            "IDX_I": {"21": {"last_price": 13.2, "net_change": -0.4, "ohlc": {"close": 13.6}}}}
    got = {c["key"]: c for c in G.live_cues(data, ids)}
    assert set(got) == {"mon100", "indiavix"}                                  # an ETF with no quote is left out, never shown as 0
    assert got["mon100"]["value"] == 231.5 and got["mon100"]["changePct"] == round(2.5 / 229 * 100, 2) and got["mon100"]["group"] == "etf"
    assert "rupees" in got["mon100"]["what"] and got["indiavix"]["change"] == -0.4


async def test_refresh_saves_each_series_and_reports_the_ones_fred_did_not_answer():
    saved = {}

    class Conn:
        async def fetchval(self, *_a):
            return 0

    class Pool:
        def acquire(self):
            class Ctx:
                async def __aenter__(self):
                    return Conn()

                async def __aexit__(self, *a):
                    return False
            return Ctx()

    class Store:
        pool = Pool()

    import finlit.macro as M

    async def fake_save(conn, series, pts):
        saved[series] = pts
        return len(pts)
    orig = M.save_points
    M.save_points = fake_save
    try:
        def h(req):
            fid = req.url.params["id"]
            if fid == "DEXCHUS":
                return httpx.Response(500)
            return httpx.Response(200, text=f"observation_date,{fid}\n2026-11-24,1.5\n2026-11-25,1.6\n")
        async with httpx.AsyncClient(transport=httpx.MockTransport(h)) as c:
            out = await G.refresh(Store(), client=c, today=date(2026, 11, 26))
    finally:
        M.save_points = orig
    assert out["status"] == "ok" and out["failed"] == ["DEXCHUS"] and len(out["series"]) == len(G.FRED) - 1
    assert saved["glob.dgs10"] == {date(2026, 11, 24): 1.5, date(2026, 11, 25): 1.6}


@pg
async def test_the_route_is_for_lab_members_and_shows_the_stored_series(app, monkeypatch):  # noqa: F811
    member = await signed_in(app, "global-member@example.com", plan="gold")
    assert (await member.get("/api/lab/global")).status_code == 403
    from finlit.macro import save_points
    async with app.state.store.pool.acquire() as conn:
        await save_points(conn, "glob.dgs10", {date(2026, 11, 20): 4.41, date(2026, 11, 24): 4.33})
        await save_points(conn, "glob.dgs2", {date(2026, 11, 20): 4.0, date(2026, 11, 24): 3.9})
        await save_points(conn, "usdinr_d", {date(2026, 11, 24): 84.1, date(2026, 11, 25): 84.3})

    async def no_dhan(*_a, **_k):
        raise RuntimeError("Dhan off")
    import finlit.options as O
    monkeypatch.setattr(O, "_ask", no_dhan)
    admin = await admin_with_mfa(app, "global-boss@example.com")
    body = (await admin.get("/api/lab/global")).json()
    groups = {g["key"]: {i["key"]: i for i in g["items"]} for g in body["groups"]}
    assert groups["rates"]["us10y"]["change"] == -0.08 and groups["rates"]["spread"]["value"] == 0.43
    assert groups["india"]["usdinr"]["value"] == 84.3
    assert "etf" not in groups and body["notes"] == ["Live ETF prices could not be read right now; they come back by themselves."]
