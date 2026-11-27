"""Trading Lab > Emerging markets (lab/em.py): India beside sixteen emerging economies, World Bank figures (latest year with the year before) and
each country's main stock index from Yahoo (a year's change only with a year's history). Facts only."""
import json
from datetime import date
from pathlib import Path

import httpx
import pytest

from finlit.lab import em as E
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration
REAL = json.loads((Path(__file__).parent / "fixtures/global/em_real.json").read_text())   # a real load of 27 Nov 2026


def test_latest_two_years_with_a_value():
    rows = [{"countryiso3code": "IND", "date": "2025", "value": 7.5}, {"countryiso3code": "IND", "date": "2024", "value": 7.1},
            {"countryiso3code": "IND", "date": "2023", "value": 8.0}, {"countryiso3code": "CHN", "date": "2025", "value": None},
            {"countryiso3code": "CHN", "date": "2024", "value": 5.0}]
    assert E.latest_two(rows) == {"IND": [[2025, 7.5], [2024, 7.1]], "CHN": [[2024, 5.0]]}


def test_the_table_and_india_s_place_from_a_real_load():
    rows = E.table(REAL["kept"], REAL["idx"])
    india = next(r for r in rows if r["iso3"] == "IND")
    assert india["growth"]["year"] == 2025 and round(india["growth"]["value"], 1) == 7.6 and india["index"]["name"] == "Nifty 50"
    assert E.rank_of(rows, "growth") == (2, 17)
    assert len(rows) == 17 and next(r for r in rows if r["iso3"] == "CHL")["index"] == {"name": "IPSA", "symbol": None}


def test_an_index_needs_most_of_a_year_for_its_yearly_change():
    ts = [1764547200 + 86400 * i for i in range(30)]
    closes = [100.0 + i * 0.3 for i in range(30)]
    live = {"chart": {"result": [{"meta": {"regularMarketPrice": 110.0, "currency": "INR", "regularMarketTime": ts[-1] + 3600}, "timestamp": ts,
                                  "indicators": {"quote": [{"close": closes}]}}]}}
    m = E.index_move(live, date(2026, 12, 31))
    assert m["level"] == 110.0 and m["yearPct"] is None and m["ytdPct"] is None and m["dayPct"] == round((110 - closes[-2]) / closes[-2] * 100, 2)
    weekend = {"chart": {"result": [{"meta": {"regularMarketPrice": closes[-1], "regularMarketTime": ts[-1] + 3600}, "timestamp": ts,
                                     "indicators": {"quote": [{"close": closes}]}}]}}
    assert E.index_move(weekend, date(2026, 12, 31))["dayPct"] == round((closes[-1] - closes[-2]) / closes[-2] * 100, 2)   # the last session's own change
    assert E.index_move({"chart": {"result": None}}, date(2026, 1, 1)) is None


@pg
async def test_the_job_stores_every_figure_and_the_route_is_for_lab_members(app, monkeypatch):  # noqa: F811
    def h(req):
        ind = req.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json=[{"page": 1}, [{"countryiso3code": "IND", "date": "2025", "value": 1.0 if ind != "FI.RES.TOTL.MO" else None}]])
    async with httpx.AsyncClient(transport=httpx.MockTransport(h)) as c:
        out = await E.refresh(app.state.store, client=c)
    assert out == {"status": "ok", "countries": 1, "failed": []}

    async def no_index(_redis, client=None, today=None):
        return {}
    monkeypatch.setattr(E, "indices", no_index)
    member = await signed_in(app, "em-member@example.com", plan="gold")
    assert (await member.get("/api/lab/em")).status_code == 403
    admin = await admin_with_mfa(app, "em-boss@example.com")
    body = (await admin.get("/api/lab/em")).json()
    ind = next(r for r in body["countries"] if r["iso3"] == "IND")
    assert ind["growth"]["value"] == 1.0 and "reserves" not in ind and body["indicators"]["growth"]["unit"] == "%"
