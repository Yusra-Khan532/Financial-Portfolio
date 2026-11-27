"""Trading Lab > Global trade (lab/trade.py, lab/wto.py): India's merchandise trade with the world from UN Comtrade's public preview: 13 months by
partner, the latest month and a year before by product, the world map's rows, the partner-by-product drill-down, and the WTO's world totals with
India's share; the job reads only what it lacks, stays inside the preview's documented limits (500 rows, one period, one product code a call),
stops at its own deadline, and the routes are for Lab members only."""
import dataclasses
import json
import re
from datetime import date
from pathlib import Path

import httpx
import pytest

from finlit import worker
from finlit.jobs.registry import build_jobs, limit_policy
from finlit.lab import trade as T
from finlit.lab import wto as W
from test_auth import app, signed_in, new_client  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration
FIX = Path(__file__).parent / "fixtures/global"
KEPT = json.loads((FIX / "trade_india.json").read_text())   # a real load of 27 Nov 2026, top partners kept
REAL = json.loads((FIX / "trade_india_drill.json").read_text())   # a real load of 27 Nov 2026: three months in full and a trimmed drill-down
WTO = json.loads((FIX / "wto_merch_totals.json").read_text())   # WTO-shaped answers (values: the WTO's totals as the World Bank republishes them)
ADVICE = re.compile(r"\b(buy|sell|hold|target|best|top pick|recommend\w*|forecast\w*|likely|will (rise|fall)|bullish|bearish|signals?)\b", re.I)


def test_months_back_and_periods():
    assert T.period(T.months_back(date(2026, 11, 27), 2)) == "202609"
    assert T.period(T.months_back(date(2026, 1, 5), 13)) == "202412"


def test_the_view_of_a_real_load():
    v = T.view(KEPT)
    assert v["latest"] == "202608" and v["label"] == "Aug 2026" and v["lastYear"] == "Aug 2025" and v["prevMonth"] == "Jul 2026"
    assert round(v["exports"] / 1e9, 1) == 43.7 and round(v["imports"] / 1e9, 1) == 71.0 and v["balance"] == v["exports"] - v["imports"]
    assert v["exportsYoyPct"] == 25.2 and len(v["trend"]) == 13 and v["trend"][-1]["period"] == "202608"
    top = v["exportPartners"][0]
    assert top["iso3"] == "USA" and top["yoyPct"] == 21.2 and all(p["code"] != "0" for p in v["exportPartners"])
    assert v["importProducts"][0]["name"] == "Mineral fuels and oils" and v["importProducts"][0]["yoyPct"] == 25.3
    assert v["drill"] is None                                   # no drill-down stored: the page says so
    assert T.view(None) is None


def test_partners_and_products_from_preview_rows():
    rows = [{"partnerCode": 0, "primaryValue": 100.0, "partner2Code": 0}, {"partnerCode": 842, "primaryValue": 30.0, "partner2Code": 0},
            {"partnerCode": 842, "primaryValue": None}]
    assert T.by_partner(rows) == {"0": 100.0, "842": 30.0}
    assert T.by_product([{"cmdCode": "27", "primaryValue": 5.0}, {"cmdCode": "TOTAL", "primaryValue": 9.0}]) == {"27": 5.0}
    both = [{"flowCode": "X", "partnerCode": 842, "primaryValue": 3.0}, {"flowCode": "M", "partnerCode": 842, "primaryValue": 2.0},
            {"flowCode": "M", "partnerCode": 0, "primaryValue": 9.0}]
    assert T.split_flows(both, T.by_partner) == {"exports": {"842": 3.0}, "imports": {"842": 2.0, "0": 9.0}}
    many = [{"partnerCode": 842, "cmdCode": "85", "primaryValue": 4.0}, {"partnerCode": 784, "cmdCode": "71", "primaryValue": 6.0},
            {"partnerCode": 842, "cmdCode": "30", "primaryValue": 1.0}]
    assert T.by_partner_product(many) == {"842": {"85": 4.0, "30": 1.0}, "784": {"71": 6.0}}


def test_the_map_rows_of_a_real_month():
    v = T.view(REAL["kept"], REAL["drill"])
    rows = v["map"]
    assert len(rows) == 212                                     # every partner country of Aug 2026, not only the largest
    assert all(r["code"] != "0" and r["iso3"] and not r["iso3"].startswith("_") for r in rows)
    usa = next(r for r in rows if r["iso3"] == "USA")
    assert usa["exports"] == {"value": 8335894559, "share": 19.07, "momPct": -7.7, "yoyPct": 21.2}
    assert usa["imports"]["share"] == 7.75 and usa["imports"]["yoyPct"] == 61.5
    china = next(r for r in rows if r["iso3"] == "CHN")
    assert china["imports"]["share"] == 20.59 and china["exports"]["momPct"] == -17.0
    assert set(rows[0]) == {"code", "name", "iso3", "exports", "imports"}
    # a country that traded one way only has the other flow empty, never zero-filled
    assert any(r["exports"] is None or r["imports"] is None for r in rows)
    # the countries hold 98.6% of India's exports; the rest went to areas Comtrade names no country for ("Areas, nes", bunkers), left off the map
    assert sum((r["exports"] or {}).get("share") or 0 for r in rows) == pytest.approx(98.57, abs=0.01)


def test_the_drill_down_of_a_real_month():
    kept, drill = REAL["kept"], REAL["drill"]
    ix = T.view(kept, drill)["drill"]
    assert [p["code"] for p in ix["partners"]] == ["842", "784", "156"] and [p["code"] for p in ix["products"]] == ["27", "71"]
    assert ix["lastYearRead"] and ix["partnerCover"]["exports"] == 28.63          # USA, UAE and China: 28.6% of India's exports
    usa = T.drill_view(kept, drill, partner="842")
    assert usa["kind"] == "partner" and usa["name"] == "USA" and usa["label"] == "Aug 2026" and usa["lastYear"] == "Aug 2025"
    assert usa["exportsTotal"] == 8335894559
    first = usa["exports"][0]
    assert first == {"code": "85", "name": "Electrical machinery and electronics", "value": 1938615039, "share": 23.26, "yoyPct": 27.8}
    assert [r["value"] for r in usa["exports"]] == sorted((r["value"] for r in usa["exports"]), reverse=True)
    assert sum(r["share"] for r in usa["exports"]) == pytest.approx(100, abs=0.5)
    gems = T.drill_view(kept, drill, product="71")
    assert gems["kind"] == "product" and gems["name"] == "Gems, jewellery, gold" and gems["exportsTotal"] == 2343855306
    assert [r["iso3"] for r in gems["exports"][:3]] == ["ARE", "HKG", "USA"] and gems["exports"][0]["yoyPct"] == -18.1
    assert all(r["code"] != "0" for r in gems["exports"] + gems["imports"])
    assert T.drill_view(kept, drill, partner="999") is None and T.drill_view(kept, drill, product="01") is None
    # a drill-down of an older month is not shown against a newer one
    assert T.view(kept, {**drill, "latest": "202607"})["drill"] is None


def test_which_partners_and_chapters_are_drilled():
    sets = T.drill_sets(REAL["kept"])
    assert sets["partners"][:3] == ["842", "784", "702"] and len(sets["partners"]) <= 2 * T.DRILL_PARTNERS
    assert sets["products"][:2] == ["27", "85"] and len(sets["products"]) <= 2 * T.DRILL_PRODUCTS
    assert "0" not in sets["partners"] and "490" in sets["partners"]           # "Other Asia, nes" is a real partner area with a code


def _comtrade(calls: list, cap_on: str = ""):
    """A fake preview: Aug 2026 is the latest month; answers sized like the real ones; every call checked against the documented limits."""
    def h(req):
        p = dict(req.url.params)
        if req.url.path.endswith("partnerAreas.json"):
            return httpx.Response(200, json={"results": [{"PartnerCode": 0, "PartnerDesc": "World", "PartnerCodeIsoAlpha3": "W00", "isGroup": True},
                                                         {"PartnerCode": 842, "PartnerDesc": "USA", "PartnerCodeIsoAlpha3": "USA", "isGroup": False},
                                                         {"PartnerCode": 784, "PartnerDesc": "United Arab Emirates", "PartnerCodeIsoAlpha3": "ARE", "isGroup": False}]})
        calls.append(p)
        assert "," not in p["period"] and "," not in p["cmdCode"], p                 # one period and one product code a call
        if p["period"] > "202608":
            return httpx.Response(200, json={"data": []})                          # not published yet
        flows = p["flowCode"].split(",")
        if p.get("cmdCode") == "AG2" and p.get("partnerCode") not in (None, "0"):
            split = {"842": (("27", 12.0), ("85", 8.0)), "784": (("27", 10.0), ("85", 5.0))}      # each partner's chapters add up to its total
            rows = [{"flowCode": f, "partnerCode": int(c), "cmdCode": hs, "primaryValue": v} for f in flows for c in p["partnerCode"].split(",") for hs, v in split[c]]
        elif p.get("cmdCode") == "AG2":
            rows = [{"flowCode": f, "partnerCode": 0, "cmdCode": hs, "primaryValue": v} for f in flows for hs, v in (("27", 10.0), ("85", 5.0))]
        elif p.get("cmdCode") in ("27", "85"):
            if cap_on == p["cmdCode"] and len(flows) == 2:
                return httpx.Response(200, json={"data": [{"flowCode": "X", "partnerCode": 842, "cmdCode": p["cmdCode"], "primaryValue": 1.0}] * T.CAP})
            rows = [{"flowCode": f, "partnerCode": c, "cmdCode": p["cmdCode"], "primaryValue": v} for f in flows for c, v in ((0, 50.0), (842, 20.0), (784, 9.0))]
        else:
            rows = [{"flowCode": f, "partnerCode": c, "primaryValue": v} for f in flows for c, v in ((0, 100.0), (842, 20.0), (784, 15.0))]
        assert len(rows) <= T.CAP
        return httpx.Response(200, json={"data": rows})
    return h


@pg
async def test_the_job_reads_only_what_it_lacks_and_the_routes_are_for_lab_members(app):  # noqa: F811
    calls: list = []
    db = app.state.store
    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM macro_meta WHERE key = ANY($1)", [T.KEY, T.DRILL_KEY, W.KEY])
    async with httpx.AsyncClient(transport=httpx.MockTransport(_comtrade(calls, cap_on="85"))) as c:
        out = await T.refresh(db, client=c, today=date(2026, 11, 27), pause=0)
        # 2 to find Aug 2026 (Sep 2026 is not published), 13 months (both flows a call), 2 product months; drill-down per month: 2 partners = 1 batch x 2 flows,
        # 2 chapters (85 comes back full at the cap, so it is asked again one flow at a time: 3 calls) = 2 + 1 + 3, for two months
        assert out["status"] == "ok" and out["latest"] == "202608" and out["monthsRead"] == 13
        assert out["calls"] == 2 + 13 + 2 + 2 * (2 + 1 + 3) and out["wto"] == "skipped: no WTO_API_KEY" and "left" not in out
        assert out["drill"] == {"partners": 4, "products": 4}
        assert all(p.get("partnerCode", "").count(",") < T.PARTNERS_A_CALL for p in calls)
        calls.clear()
        again = await T.refresh(db, client=c, today=date(2026, 11, 27), pause=0)
    # the latest two months and the latest products again; the drill-down is a day old, so it is not read again
    assert again["monthsRead"] == 2 and len(calls) == 2 + 2 + 1 and again["calls"] == 5
    member = await signed_in(app, "trade-member@example.com", plan="gold")
    assert (await member.get("/api/lab/trade")).status_code == 403
    assert (await member.get("/api/lab/trade/drill?partner=842")).status_code == 403
    async with new_client(app) as visitor:
        assert (await visitor.get("/api/lab/trade")).status_code == 401
        assert (await visitor.get("/api/lab/trade/drill?product=27")).status_code == 401
    admin = await admin_with_mfa(app, "trade-boss@example.com")
    r = await admin.get("/api/lab/trade")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    body = r.json()
    assert body["ready"] and body["latest"] == "202608" and body["exportPartners"][0]["name"] == "USA" and body["exportProducts"][0]["code"] == "27"
    assert {m["iso3"] for m in body["map"]} == {"USA", "ARE"} and body["map"][0]["exports"]["share"] == 20.0
    assert [p["code"] for p in body["drill"]["partners"]] == ["842", "784"] and body["drill"]["lastYearRead"]
    assert body["world"] == {"ready": False, "reason": W.NO_KEY}             # no key here: said plainly
    d = await admin.get("/api/lab/trade/drill?partner=842")
    assert d.status_code == 200 and d.headers["cache-control"] == "no-store"
    assert d.json()["exports"][0] == {"code": "27", "name": "Mineral fuels and oils", "value": 12, "share": 60.0, "yoyPct": 0.0}
    p = (await admin.get("/api/lab/trade/drill?product=27")).json()
    assert p["kind"] == "product" and [r["code"] for r in p["imports"]] == ["842", "784"] and p["importsTotal"] == 50
    assert (await admin.get("/api/lab/trade/drill?product=01")).status_code == 404
    for bad in ("", "?partner=842&product=27", "?partner=abc", "?product=7", "?product=271"):
        assert (await admin.get(f"/api/lab/trade/drill{bad}")).status_code == 400, bad
    for text in (json.dumps(body), json.dumps(d.json()), W.NO_KEY):
        assert not ADVICE.search(text), ADVICE.search(text)
    # with the key set on the server: "loads with the next run" until the job has read it, then the totals and India's share
    app.state.settings = dataclasses.replace(app.state.settings, wto_api_key="test-key")
    assert (await admin.get("/api/lab/trade")).json()["world"]["reason"].startswith("The WTO's world trade totals load with the next run")
    async with db.pool.acquire() as conn:
        from finlit.macro import set_meta
        await set_meta(conn, W.KEY, {"exports": W.parse(WTO["ITS_MTV_AX"]), "imports": W.parse(WTO["ITS_MTV_AM"]), "at": "2026-11-27T02:30+00:00"})
    world = (await admin.get("/api/lab/trade")).json()["world"]
    assert world["ready"] and world["years"][-1]["year"] == 2025 and world["years"][-1]["imports"]["share"] == 2.82


@pg
async def test_the_job_stops_at_its_own_deadline_and_continues_next_run(app):  # noqa: F811
    calls: list = []
    db = app.state.store
    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM macro_meta WHERE key = ANY($1)", [T.KEY, T.DRILL_KEY])
    async with httpx.AsyncClient(transport=httpx.MockTransport(_comtrade(calls))) as c:
        out = await T.refresh(db, client=c, today=date(2026, 11, 27), pause=0, max_minutes=1e-9)
        assert out["status"] == "ok" and out["left"] and out["calls"] == 2      # it finds the month, then starts nothing new
        out = await T.refresh(db, client=c, today=date(2026, 11, 27), pause=0)
    assert out["monthsRead"] == 13 and "left" not in out and out["drill"] == {"partners": 4, "products": 4}


async def test_the_wto_totals_with_and_without_a_key():
    class Store:                       # a store that keeps meta in memory
        def __init__(self):
            self.meta = {}
            self.pool = self

        def acquire(self):
            return self

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def fetchval(self, _sql, key):
            return self.meta.get(key)

        async def execute(self, _sql, key, body):
            self.meta[key] = json.loads(body)

    seen = []

    def h(req):
        seen.append(req)
        if req.headers.get("Ocp-Apim-Subscription-Key") != "test-key":
            return httpx.Response(401, json={"statusCode": 401, "message": "Access denied due to invalid subscription key."})
        body = WTO[dict(req.url.params)["i"]]
        return httpx.Response(200, content=json.dumps(body).encode("cp1252"))
    s = Store()
    assert await W.refresh(s, "") == "skipped: no WTO_API_KEY" and not seen      # no key: no call at all
    async with httpx.AsyncClient(transport=httpx.MockTransport(h)) as c:
        assert await W.refresh(s, "wrong", client=c, pause=0) == "failed: the WTO refused the key (401)"
        seen.clear()
        assert await W.refresh(s, "test-key", client=c, pause=0, today=date(2026, 11, 27)) == "ok"
        assert len(seen) == 2 and {dict(r.url.params)["i"] for r in seen} == {"ITS_MTV_AX", "ITS_MTV_AM"}
        q = dict(seen[0].url.params)
        assert q["r"] == "000,356" and q["p"] == "000" and q["pc"] == "TO" and q["ps"] == "2014-2026"
        assert "FinLit" in seen[0].headers["User-Agent"] and "test-key" not in str(seen[0].url)     # the key travels in the header only
        assert await W.refresh(s, "test-key", client=c, pause=0) == "fresh" and len(seen) == 2   # read again only after three days
    v = W.view(s.meta[W.KEY], True)
    last = v["years"][-1]
    assert v["ready"] and last["year"] == 2025 and v["unit"] == "million US dollars"
    assert last["exports"]["world"] == pytest.approx(26386782.4) and last["exports"]["india"] == pytest.approx(445278.0)
    assert last["exports"]["share"] == 1.69 and last["imports"]["share"] == 2.82 and last["exports"]["worldYoyPct"] == 7.2
    assert v["years"][0]["exports"]["worldYoyPct"] is None
    assert W.view(None, False) == {"ready": False, "reason": W.NO_KEY}
    assert W.view(None, True)["reason"].startswith("The WTO's world trade totals load with the next run")
    assert W.parse({"Dataset": [{"ReportingEconomyCode": "000", "PartnerEconomyCode": "000", "ProductOrSectorCode": "AG", "Year": 2025, "Value": 1.0}]}) == {}
    assert not ADVICE.search(json.dumps(v)) and not ADVICE.search(W.NO_KEY)


def test_the_key_is_read_by_its_setting_name(monkeypatch):
    from finlit.config import Settings
    monkeypatch.setenv("WTO_API_KEY", " placeholder ")
    assert Settings().wto_api_key == "placeholder"
    monkeypatch.delenv("WTO_API_KEY")
    assert Settings().wto_api_key == ""


def test_the_job_is_registered_with_a_deadline_under_its_limit():
    job = next(j for j in build_jobs({}) if j.name == "global-trade")
    assert job.args == ("refresh-global-trade", "--max-minutes", "10") and job.max_runtime_min == 15
    assert limit_policy(job).startswith("deadline:") and "500-row" in limit_policy(job)
    assert worker.build_parser().parse_args(list(job.args)).max_minutes == 10.0


def test_no_advice_words_in_the_source_strings():
    for mod in (T, W):
        text = Path(mod.__file__).read_text()
        strings = " ".join(re.findall(r'"([^"\n]{12,})"', text))
        assert not ADVICE.search(strings), (mod.__name__, ADVICE.search(strings))
