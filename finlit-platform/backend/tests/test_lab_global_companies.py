"""Trading Lab > Global > US companies (lab/companies.py): 39 large US companies' reported figures from their SEC filings (data.sec.gov XBRL):
ten years and nine quarters of revenue, operating income, net income and diluted EPS, the year-end balance sheet. A fourth quarter (filed only
inside the 10-K) and a liabilities total a company does not tag are derived and labelled; a figure a filing lacks stays missing. The weekly
`global-companies` job paces itself well under the SEC's ten requests a second and stops starting companies at its own deadline."""
import json
import re
from pathlib import Path

import httpx
import pytest

from finlit import worker
from finlit.jobs.registry import build_jobs, limit_policy
from finlit.lab import companies as C
from test_auth import app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration
FIX = Path(__file__).parent / "fixtures/global"
KEPT = json.loads((FIX / "sec_companies.json").read_text())      # a real load of 27 Nov 2026 (Apple, Intel, Walmart, JPMorgan Chase, Visa kept)
RAW = json.loads((FIX / "sec_raw_jpm_wmt.json").read_text())     # the SEC's real answers for JPMorgan Chase and Walmart, 27 Nov 2026 (one fact per period kept)
BANNED = re.compile(r"\b(buy|sell|hold|target|best|top pick|recommended|forecast|likely|will rise|will fall|bullish|bearish|signal)s?\b", re.I)


def _fact(start, end, val, form="10-K", filed="2026-02-01", fp="FY"):
    return {"start": start, "end": end, "val": val, "form": form, "filed": filed, "fp": fp}


def test_years_and_quarters_from_the_facts_the_latest_filing_for_each_period():
    facts = [_fact("2024-01-01", "2024-12-31", 100, filed="2025-02-01"), _fact("2024-01-01", "2024-12-31", 101, filed="2026-02-01"),   # restated
             _fact("2025-01-01", "2025-12-31", 120), _fact("2025-07-01", "2025-09-30", 30, form="10-Q", fp="Q3"),
             _fact("2025-01-01", "2025-06-30", 60, form="10-Q", fp="Q2"),                                    # six months: neither a year nor a quarter
             {"end": "2025-12-31", "val": 5, "form": "10-K"}]                                                # a flow without a start is not used
    years, quarters = C.series(facts, "flow")
    assert years == [["2024-12-31", 101.0], ["2025-12-31", 120.0]] and quarters == [["2025-09-30", 30.0]]
    point = [{"end": "2025-12-31", "val": 9, "form": "10-K", "fp": "FY", "filed": "2026-02-01"}, {"end": "2025-09-30", "val": 8, "form": "10-Q", "fp": "Q3"}]
    assert C.series(point, "point") == ([["2025-12-31", 9.0]], [])                                         # a balance only at the fiscal year end


def test_the_fourth_quarter_is_the_year_less_its_three_quarters_only_when_all_three_are_filed():
    years = [["2025-09-27", 400.0], ["2026-09-26", 480.0]]
    quarters = [["2024-12-28", 120.0], ["2025-03-29", 95.0], ["2025-06-28", 90.0], ["2025-12-27", 140.0], ["2026-06-27", 95.0]]   # Mar 2026 missing
    q, made = C.with_q4(years, quarters)
    assert made == ["2025-09-27"] and dict((e, v) for e, v in q)["2025-09-27"] == 95.0
    assert "2026-09-26" not in dict((e, v) for e, v in q)                                                   # two quarters filed: nothing derived
    q, made = C.with_q4([], quarters)
    assert made == [] and len(q) == 5


def test_a_change_on_the_year_before_needs_the_year_before():
    assert C._yoy([["2024-12-31", 100.0], ["2025-12-31", 110.0]]) == 10.0
    assert C._yoy([["2023-12-31", 100.0], ["2025-12-31", 110.0]]) is None                                  # a missing year gives no change
    assert C._yoy([["2025-12-31", 110.0]]) is None


def test_summaries_and_details_from_a_real_load():
    v = C.view(KEPT)
    assert v["ready"] and [s["ticker"] for s in v["companies"]] == ["AAPL", "INTC", "WMT", "JPM", "V"]      # the board's own order
    s = {x["ticker"]: x for x in v["companies"]}
    assert s["AAPL"]["year"] == "2026-09-26" and round(s["AAPL"]["revenue"] / 1e9, 1) == 478.8 and s["AAPL"]["revenueYoyPct"] == 15.1 and s["AAPL"]["margin"] == 27.6
    assert s["JPM"]["year"] == "2025-12-31" and round(s["JPM"]["revenue"] / 1e9, 1) == 182.4 and s["JPM"]["netIncomeYoyPct"] == -2.4
    assert s["INTC"]["netIncome"] < 0 and s["INTC"]["margin"] == -0.5
    jpm, wmt, visa = v["details"]["JPM"], v["details"]["WMT"], v["details"]["V"]
    assert "operatingIncome" not in jpm["annual"] and "operatingIncome" not in jpm["quarterly"]             # a bank: no operating income line, never filled in
    assert jpm["concepts"]["liabilities"] == "Liabilities" and jpm["secName"] == "JPMORGAN CHASE & CO" and jpm["cik"] == 19617
    assert wmt["concepts"]["liabilities"].startswith("derived")
    a, e, liab = (dict(map(tuple, wmt["annual"][k])) for k in ("assets", "equity", "liabilities"))
    assert all(liab[d] == a[d] - e[d] for d in liab)
    assert "eps" not in visa["annual"]                                                                       # Visa files EPS per class of share only
    for d in v["details"].values():
        assert len(d["annual"]["revenue"]) <= C.YEARS and len(d["quarterly"]["revenue"]) == C.QUARTERS
        assert set(d["derivedQuarters"].get("eps", [])) == set()                                             # per-share figures are never derived
    assert C.view(None) == {"ready": False, "reason": "The companies' SEC filings load once a week; the first load has not run yet."}


class Box:
    """The job's store: macro_meta held in memory."""
    def __init__(self, kept=None):
        self.kept = kept
        outer = self

        class Conn:
            async def fetchval(self, _sql, _key):
                return json.dumps(outer.kept) if outer.kept is not None else None

            async def execute(self, _sql, _key, body):
                outer.kept = json.loads(body)

        class Acq:
            async def __aenter__(self):
                return Conn()

            async def __aexit__(self, *a):
                return False

        class Pool:
            def acquire(self):
                return Acq()
        self.pool = Pool()


def _sec(calls):
    def h(req):
        calls.append(req)
        assert req.headers["user-agent"].startswith("FinLit (finlitventures.com)")
        hit = RAW.get(req.url.path)
        if hit is None or hit["status"] != 200:
            return httpx.Response(404, json={})
        return httpx.Response(200, json=hit["body"])
    return h


async def test_the_job_reads_the_real_answers_derives_only_what_it_says_and_paces_itself(monkeypatch):
    calls, pauses = [], []

    async def sleep(s):
        pauses.append(s)
    monkeypatch.setattr(C.asyncio, "sleep", sleep)
    box = Box()
    async with httpx.AsyncClient(transport=httpx.MockTransport(_sec(calls)), headers=C.UA) as c:
        out = await C.refresh(box, client=c, only=["JPM", "WMT"])
    assert out == {"status": "ok", "companies": 2, "skipped": []}
    per = len(calls) / 2
    assert per <= 18 and len(pauses) == len(calls) and all(p >= 0.2 for p in pauses)      # one call at a time, a 0.2 s pause after each: five a second at most
    jpm, wmt = box.kept["companies"]["JPM"], box.kept["companies"]["WMT"]
    assert "operatingIncome" not in jpm["annual"] and jpm["concepts"]["liabilities"] == "Liabilities"
    assert wmt["concepts"]["liabilities"] == "derived: assets less equity" and wmt["concepts"]["operatingIncome"] == "OperatingIncomeLoss"
    assert len(wmt["annual"]["revenue"]) == 10 and len(wmt["quarterly"]["revenue"]) == 9
    q = dict(map(tuple, wmt["quarterly"]["revenue"]))
    for end in wmt["derivedQuarters"]["revenue"][-1:]:                                     # the fourth quarter: the year less its three quarters
        year = dict(map(tuple, wmt["annual"]["revenue"]))[end]
        inside = [v for e, v in wmt["quarterly"]["revenue"] if 30 <= C._days(e, end) <= 300]
        assert len(inside) == 3 and q[end] == year - sum(inside)


async def test_a_wrong_sec_id_is_skipped_never_shown_under_the_name(monkeypatch):
    async def sleep(_s):
        return None
    monkeypatch.setattr(C.asyncio, "sleep", sleep)

    def h(req):
        if "submissions" in req.url.path:
            return httpx.Response(200, json={"name": "SOMEONE ELSE INC", "tickers": ["ELSE"]})
        return httpx.Response(404, json={})
    box = Box()
    async with httpx.AsyncClient(transport=httpx.MockTransport(h)) as c:
        out = await C.refresh(box, client=c, only=["JPM"])
    assert out == {"status": "failed", "companies": 0, "skipped": ["JPM"]} and box.kept["companies"] == {}


async def test_the_deadline_stops_new_companies_and_the_oldest_go_first_next_time(monkeypatch):
    async def sleep(_s):
        return None
    monkeypatch.setattr(C.asyncio, "sleep", sleep)
    kept = {"companies": {"JPM": {**KEPT["companies"]["JPM"], "loadedAt": "2026-11-20T05:00+00:00"}}}
    calls = []
    async with httpx.AsyncClient(transport=httpx.MockTransport(_sec(calls)), headers=C.UA) as c:
        box = Box(json.loads(json.dumps(kept)))
        out = await C.refresh(box, client=c, only=["JPM", "WMT"], max_minutes=1e-9)
        assert out["companies"] == 0 and out["left"] == ["WMT", "JPM"] and calls == []    # never read first; then the one read longest ago
        assert box.kept["companies"]["JPM"]["loadedAt"] == "2026-11-20T05:00+00:00"        # what was there is kept
        out = await C.refresh(box, client=c, only=["JPM", "WMT"], max_minutes=10)
    assert out == {"status": "ok", "companies": 2, "skipped": []} and box.kept["companies"]["JPM"]["loadedAt"] > "2026-11-20T05:00+00:00"


def test_the_weekly_job_its_limit_and_its_command():
    job = {j.name: j for j in build_jobs({})}["global-companies"]
    assert job.args == ("refresh-global-companies", "--max-minutes", "10") and job.interval_min == 7 * 24 * 60
    assert [w.window for w in job.windows] == ["MORNING"] and job.catchup
    assert limit_policy(job).startswith("deadline:") and job.max_runtime_min - 10 >= 3
    assert worker.build_parser().parse_args(list(job.args)).max_minutes == 10.0


@pg
async def test_the_worker_command_records_the_run_and_a_stop_at_the_deadline_is_partial(store, monkeypatch):  # noqa: F811
    from finlit.jobs.reasons import PARTIAL_EXIT
    from finlit.mf import _meta as get_meta
    seen = []

    async def full(_store, max_minutes=None, **kw):
        seen.append(max_minutes)
        return {"status": "ok", "companies": 39, "skipped": []}
    monkeypatch.setattr(C, "refresh", full)
    assert await worker.main(["refresh-global-companies", "--max-minutes", "10"], settings=make_settings()) == 0
    assert seen == [10.0]

    async def stopped(_store, max_minutes=None, **kw):
        return {"status": "ok", "companies": 30, "skipped": [], "left": ["CAT", "BA"]}
    monkeypatch.setattr(C, "refresh", stopped)
    assert await worker.main(["refresh-global-companies"], settings=make_settings()) == PARTIAL_EXIT
    async with store.pool.acquire() as conn:
        rec = await get_meta(conn, "run:refresh-global-companies")
    assert rec["status"] == "partial" and rec["left"] == ["CAT", "BA"] and "2 companies left" in rec["why"]


@pg
async def test_the_route_is_for_lab_members_only_and_never_cached(app):  # noqa: F811
    from finlit.macro import set_meta
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM macro_meta WHERE key = $1", C.KEY)
    async with new_client(app) as anon:
        assert (await anon.get("/api/lab/companies")).status_code == 401
    member = await signed_in(app, "usco-member@example.com", plan="gold")
    assert (await member.get("/api/lab/companies")).status_code == 403
    admin = await admin_with_mfa(app, "usco-boss@example.com")
    r = await admin.get("/api/lab/companies")
    assert r.status_code == 200 and r.json()["ready"] is False and r.headers["cache-control"] == "no-store"
    async with app.state.store.pool.acquire() as conn:
        await set_meta(conn, C.KEY, KEPT)
    r = await admin.get("/api/lab/companies")
    body = r.json()
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store" and body["ready"] and len(body["companies"]) == 5
    assert body["details"]["WMT"]["concepts"]["liabilities"].startswith("derived") and "SEC" in body["source"]
    assert not BANNED.search(json.dumps({k: body[k] for k in ("source",)})) and not BANNED.search(json.dumps(body["companies"]))
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM macro_meta WHERE key = $1", C.KEY)


def test_nothing_in_the_module_or_its_answer_reads_as_advice():
    src = Path(C.__file__).read_text()
    strings = re.findall(r'"[^"\n]*"', src) + re.findall(r'"""[\s\S]*?"""', src)
    assert [s for s in strings if BANNED.search(s)] == []
    assert not BANNED.search(json.dumps(C.view(None))) and not BANNED.search(C.view(KEPT)["source"])
