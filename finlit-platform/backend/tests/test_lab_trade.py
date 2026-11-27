"""Trading Lab > Global trade (lab/trade.py): India's merchandise trade with the world from UN Comtrade's public preview: 13 months by partner,
the latest month and a year before by product; the job reads only what it lacks plus the latest two months, paced to the free limit."""
import json
from datetime import date
from pathlib import Path

import httpx
import pytest

from finlit.lab import trade as T
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration
KEPT = json.loads((Path(__file__).parent / "fixtures/global/trade_india.json").read_text())   # a real load of 27 Nov 2026, top partners kept


def test_months_back_and_periods():
    assert T.period(T.months_back(date(2026, 11, 27), 2)) == "202609"
    assert T.period(T.months_back(date(2026, 1, 5), 13)) == "202412"


def test_the_view_of_a_real_load():
    v = T.view(KEPT)
    assert v["latest"] == "202608" and v["label"] == "Aug 2026" and v["lastYear"] == "Aug 2025"
    assert round(v["exports"] / 1e9, 1) == 43.7 and round(v["imports"] / 1e9, 1) == 71.0 and v["balance"] == v["exports"] - v["imports"]
    assert v["exportsYoyPct"] == 25.2 and len(v["trend"]) == 13 and v["trend"][-1]["period"] == "202608"
    top = v["exportPartners"][0]
    assert top["iso3"] == "USA" and top["yoyPct"] == 21.2 and all(p["code"] != "0" for p in v["exportPartners"])
    assert v["importProducts"][0]["name"] == "Mineral fuels and oils" and v["importProducts"][0]["yoyPct"] == 25.3
    assert T.view(None) is None


def test_partners_and_products_from_preview_rows():
    rows = [{"partnerCode": 0, "primaryValue": 100.0, "partner2Code": 0}, {"partnerCode": 842, "primaryValue": 30.0, "partner2Code": 0},
            {"partnerCode": 842, "primaryValue": None}]
    assert T.by_partner(rows) == {"0": 100.0, "842": 30.0}
    assert T.by_product([{"cmdCode": "27", "primaryValue": 5.0}, {"cmdCode": "TOTAL", "primaryValue": 9.0}]) == {"27": 5.0}


@pg
async def test_the_job_reads_only_what_it_lacks_and_the_route_is_for_lab_members(app):  # noqa: F811
    calls = []

    def h(req):
        p = dict(req.url.params)
        if req.url.path.endswith("partnerAreas.json"):
            return httpx.Response(200, json={"results": [{"PartnerCode": 0, "PartnerDesc": "World", "PartnerCodeIsoAlpha3": "W00", "isGroup": True},
                                                         {"PartnerCode": 842, "PartnerDesc": "USA", "PartnerCodeIsoAlpha3": "USA", "isGroup": False}]})
        calls.append(p)
        if p["period"] > "202608":
            return httpx.Response(200, json={"data": []})                          # not published yet
        if p.get("cmdCode") == "AG2":
            return httpx.Response(200, json={"data": [{"cmdCode": "27", "primaryValue": 10.0}, {"cmdCode": "85", "primaryValue": 5.0}]})
        return httpx.Response(200, json={"data": [{"partnerCode": 0, "primaryValue": 100.0}, {"partnerCode": 842, "primaryValue": 20.0}]})
    store = app.state.store
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM macro_meta WHERE key = $1", T.KEY)
    async with httpx.AsyncClient(transport=httpx.MockTransport(h)) as c:
        out = await T.refresh(store, client=c, today=date(2026, 11, 27), pause=0)
        assert out == {"status": "ok", "latest": "202608", "monthsRead": 13, "calls": 2 + 26 + 4}
        calls.clear()
        again = await T.refresh(store, client=c, today=date(2026, 11, 27), pause=0)
    assert again["monthsRead"] == 2 and len(calls) == 2 + 4 + 2          # the latest two months and the latest products again, nothing else
    member = await signed_in(app, "trade-member@example.com", plan="gold")
    assert (await member.get("/api/lab/trade")).status_code == 403
    admin = await admin_with_mfa(app, "trade-boss@example.com")
    body = (await admin.get("/api/lab/trade")).json()
    assert body["ready"] and body["latest"] == "202608" and body["exportPartners"][0]["name"] == "USA" and body["exportProducts"][0]["code"] == "27"
