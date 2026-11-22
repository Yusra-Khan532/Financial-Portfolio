"""Task #326: the nightly scores export (finlit/scores_export.py) and its two links (finlit/scores_export_api.py), against the owner's SPEC of 22 Nov 2026.

Covered: the key (401 when missing, wrong, too short or not set on the server), HTTPS only on the live site, 404 for a day with no file, the dates oldest first,
a published day never rewritten, the newest 120 kept, weekends and holidays skipped, every file passing the owner's own checker, the day change on a split day,
the screens' own order / Added day / extra columns, history mode reading only that day's stored figures, back-fill only at night and a few days a run, and the
job being started by the presets job's completion (its probe and prerequisite)."""
import gzip
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from finlit import scores_export as X
from finlit.config import Settings
from finlit.scores_export_check import validate
from finlit.store import Store

TEST_DB = os.getenv("TEST_DATABASE_URL", "postgresql://finlit:finlit@localhost:5432/finlit_test")
TEST_REDIS = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/15")
IST = timezone(timedelta(hours=5, minutes=30))
KEY = "k" * 48
WIPE = ("companies", "company_classification", "disclosure_isin", "price_daily", "prism_history", "screen_runs", "screen_snapshots", "screen_spells", "gainers",
        "preset_meta", "leadership_history", "snapshots")
N = 240                      # the checker wants "hundreds" of companies
D1, D2, HOL, D3 = date(2026, 11, 18), date(2026, 11, 19), date(2026, 11, 20), date(2026, 11, 23)     # Wed, Thu, a (made-up) holiday Fri, Mon
SYMS = list(X.REFERENCE) + [f"CO{i:03d}" for i in range(N - len(X.REFERENCE))]


def settings():
    return Settings(finedge_api_key="test", finedge_mode="fixtures", database_url=TEST_DB, redis_url=TEST_REDIS)


def isin(i: int) -> str:
    return f"INE{i:06d}A01X"[:12]


def doc_ok(n: int = 220) -> dict:
    comp = [{"isin": isin(i), "symbol": f"S{i}", "close": 10.0, "chg_1d_pct": 0.5, "prism": {"final": 50.0}, "tech": {"st": 1.0, "lt": 2.0}} for i in range(n)]
    return {"schema": 1, "date": "2026-11-19", "prev_date": "2026-11-18", "companies": comp, "screens": [{"id": "x", "name": "X", "rows": [{"isin": isin(0), "pos": 1}]}]}


# ------------------------------------------------------------------------------------------------------------------------------ the checker and the files
def test_the_vendored_checker_is_the_owners_and_refuses_what_it_should():
    assert validate(doc_ok()) == []
    bad = doc_ok(150)
    assert any("hundreds" in b for b in validate(bad))
    d = doc_ok()
    d["screens"][0]["rows"].append({"isin": isin(1), "pos": 1})
    assert any("pos must be" in b for b in validate(d))
    d = doc_ok()
    d["screens"] = []
    assert "screens is empty" in validate(d)
    src = Path(X.__file__).with_name("scores_export_check.py").read_text()
    assert "def validate(doc) -> List[str]:" in src and 'for k, limit in (("chg_1d_pct", 0.05), ("prism.final", 0.6), ("tech.st", 0.3), ("tech.lt", 0.3))' in src


def test_a_published_day_is_never_rewritten_and_no_temporary_file_is_left(tmp_path):
    doc = doc_ok()
    p = X.write_day(doc, tmp_path)
    assert p.name == "scores_2026-11-19.json.gz" and json.loads(gzip.decompress(p.read_bytes()))["date"] == "2026-11-19"
    before = p.read_bytes()
    doc2 = doc_ok()
    doc2["companies"][0]["close"] = 999.0
    with pytest.raises(FileExistsError):
        X.write_day(doc2, tmp_path)
    assert p.read_bytes() == before
    assert [x.name for x in tmp_path.iterdir()] == ["scores_2026-11-19.json.gz"]


def test_a_file_the_checker_refuses_is_not_written(tmp_path):
    with pytest.raises(ValueError):
        X.write_day(doc_ok(100), tmp_path)
    assert not list(tmp_path.iterdir())


def test_the_newest_120_days_are_kept_and_dates_are_listed_oldest_first(tmp_path):
    start = date(2026, 1, 1)
    for k in range(125):
        (tmp_path / f"scores_{(start + timedelta(days=k)).isoformat()}.json.gz").write_bytes(b"x")
    (tmp_path / "notes.txt").write_text("not a day")
    (tmp_path / ".scores_2026-06-01.1.tmp").write_bytes(b"x")
    gone = X.prune(tmp_path)
    assert len(gone) == 5 and gone[0] == "2026-01-01"
    ds = X.dates(tmp_path)
    assert len(ds) == 120 and ds == sorted(ds) and ds[0] == "2026-01-06"
    assert X.dates(tmp_path / "missing") == []


def test_the_day_after_and_the_live_window():
    assert X.next_weekday(date(2026, 11, 20)) == date(2026, 11, 23)
    assert X.live_until(D2) == datetime(2026, 11, 20, 9, 15, tzinfo=IST)


# ------------------------------------------------------------------------------------------------------------------------------ the links
@pytest.fixture
async def client(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from finlit import scores_export_api
    monkeypatch.setenv("SCORES_EXPORT_DIR", str(tmp_path))
    app = FastAPI()
    app.state.settings = type("S", (), {"public_site_url": "https://finlitventures.com"})()
    app.include_router(scores_export_api.router)
    X.write_day(doc_ok(), tmp_path)
    d = doc_ok()
    d["date"], d["prev_date"] = "2026-11-18", "2026-11-17"
    X.write_day(d, tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://finlitventures.com") as c:
        yield c


HTTPS = {"x-forwarded-proto": "https"}


async def test_both_links_need_the_key(client, monkeypatch):
    monkeypatch.delenv("EXPORT_KEY", raising=False)
    for path in ("/internal/export/scores/dates", "/internal/export/scores?date=2026-11-19"):
        assert (await client.get(path, headers={**HTTPS, "x-export-key": "anything"})).status_code == 401       # no key on the server: nobody gets in
    monkeypatch.setenv("EXPORT_KEY", "short")
    assert (await client.get("/internal/export/scores/dates", headers={**HTTPS, "x-export-key": "short"})).status_code == 401     # too short to count as a key
    monkeypatch.setenv("EXPORT_KEY", KEY)
    for path in ("/internal/export/scores/dates", "/internal/export/scores?date=2026-11-19"):
        assert (await client.get(path, headers=HTTPS)).status_code == 401
        r = await client.get(path, headers={**HTTPS, "x-export-key": KEY[:-1] + "x"})
        assert r.status_code == 401 and r.headers["cache-control"] == "no-store"
        assert (await client.get(path, headers={**HTTPS, "x-export-key": KEY})).status_code == 200


async def test_dates_oldest_first_a_day_its_file_and_404_for_none(client, monkeypatch):
    monkeypatch.setenv("EXPORT_KEY", KEY)
    h = {**HTTPS, "x-export-key": KEY}
    r = await client.get("/internal/export/scores/dates", headers=h)
    assert r.json() == {"dates": ["2026-11-18", "2026-11-19"]} and "noindex" in r.headers["x-robots-tag"]
    r = await client.get("/internal/export/scores", params={"date": "2026-11-19"}, headers={**h, "accept-encoding": "identity"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json") and r.json()["date"] == "2026-11-19"
    r = await client.get("/internal/export/scores", params={"date": "2026-11-19"}, headers={**h, "accept-encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip" and r.json()["date"] == "2026-11-19"      # httpx undoes the gzip: the same file
    for bad in ("2026-11-20", "2026-1-1", "../etc/passwd", ""):
        assert (await client.get("/internal/export/scores", params={"date": bad}, headers=h)).status_code == 404


async def test_the_key_is_refused_over_plain_http_on_the_live_site(client, monkeypatch):
    monkeypatch.setenv("EXPORT_KEY", KEY)
    r = await client.get("/internal/export/scores/dates", headers={"x-forwarded-proto": "http", "x-export-key": KEY})
    assert r.status_code == 403 and "HTTPS" in r.json()["detail"]
    r = await client.get("/internal/export/scores/dates", headers={"x-forwarded-proto": "http", "cf-visitor": '{"scheme":"https"}', "x-export-key": KEY})
    assert r.status_code == 200       # Cloudflare took it over HTTPS


def test_the_links_are_registered_before_the_website_and_read_no_database():
    from finlit import scores_export_api
    src = Path(scores_export_api.__file__).read_text()
    assert "pool" not in src and "fetch" not in src
    api_src = Path(X.__file__).with_name("api.py").read_text()
    assert api_src.index("finlit.scores_export_api") < api_src.index("mount_frontend(app, Path(settings.frontend_dist))")


# ------------------------------------------------------------------------------------------------------------------------------ the job
def test_the_job_is_started_by_the_presets_job_finishing():
    from finlit.jobs import probes
    from finlit.jobs.registry import LIMIT_POLICY, build_jobs
    j = {x.name: x for x in build_jobs({})}["scores-export"]
    assert j.probe == "scores-export" and j.prerequisites == ("presets",) and not j.windows and not j.daily_at and j.interval_min is None    # no clock time
    assert j.args == ("export-scores",) and "scores-export" in LIMIT_POLICY
    assert "scores-export" in probes.build(object())


@pytest.fixture
async def store(tmp_path, monkeypatch):
    try:
        s = await Store.connect(settings())
        await s.redis.ping()
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"postgres/redis not available: {exc}")
    await s.migrate()
    async with s.pool.acquire() as conn:
        await conn.execute("TRUNCATE " + ", ".join(WIPE) + " CASCADE")  # nosec B608 - fixed table list
    await s.redis.flushdb()
    monkeypatch.setenv("SCORES_EXPORT_DIR", str(tmp_path))
    yield s
    await s.close()


MOM = "momentum-leaders"


async def seed(s):
    from finlit.presets.registry import BY_ID
    mom_cols = [c.key for c in BY_ID[MOM].columns]
    assert "momentum_score" in mom_cols
    async with s.pool.acquire() as conn:
        await conn.executemany("INSERT INTO companies (symbol, name, nse_code, bse_code) VALUES ($1, $2, $3, $4)",
                               [(x, f"{x} Ltd", x if i % 10 else None, str(500000 + i)) for i, x in enumerate(SYMS)])
        await conn.executemany("INSERT INTO company_classification (symbol, isin, macro_sector, sector, industry, rule_version) VALUES ($1,$2,'Financial Services','Banks','Private Sector Bank',1)",
                               [(x, isin(i)) for i, x in enumerate(SYMS[:-1])])          # the last company has no ISIN anywhere
        rows = []
        for i, x in enumerate(SYMS):
            for d, c in ((date(2026, 11, 17), 100.0), (D1, 100.0), (D2, 102.0), (D3, 103.0)):
                if x == "CO005" and d == D2:
                    c = 50.0         # a 1:2 split on D2: the stored close halves
                rows.append((x, d, c))
        await conn.executemany("INSERT INTO price_daily (symbol, day, close) VALUES ($1, $2, $3)", rows)
        # Prism: the D2 row recorded that night; a later re-rating recorded after the next session opened must not be used for D2
        await conn.executemany("INSERT INTO prism_history (symbol, statement, day, final, label, status, p_fundamental, p_valuation, p_quality, p_risk, st_score, lt_score, recorded_at) "
                               "VALUES ($1,'consolidated',$2,$3,'HEALTHY','RATED',70,40,80,60,$4,$5,$6)",
                               [(x, D2, 66.0 + (i % 5), 10.0, 20.0, datetime(2026, 11, 19, 23, 30, tzinfo=IST)) for i, x in enumerate(SYMS)]
                               + [("CO001", HOL, 12.0, -5.0, -5.0, datetime(2026, 11, 20, 11, 0, tzinfo=IST))])
        await conn.execute("INSERT INTO screen_runs (preset_id, chips, session, registry, n, list_hash) VALUES ($1, 'none', $2, 17, 3, 'h')", MOM, D2)
        await conn.execute("INSERT INTO screen_runs (preset_id, chips, session, registry, n, list_hash) VALUES ('strong-results', 'none', $1, 17, 0, 'h')", D2)
        snap = [("CO003", 2, {"symbol": "CO003", "rank": 2, "momentum_score": 91.5, "market_cap": 30000.0, "fno": 1, "ret_3m": 12.0}),
                ("CO002", 1, {"symbol": "CO002", "rank": 1, "momentum_score": 98.5, "market_cap": 90000.0, "fno": 0}),
                (SYMS[-1], 3, {"symbol": SYMS[-1], "rank": 3, "momentum_score": 80.0})]
        await conn.executemany("INSERT INTO screen_snapshots (preset_id, chips, session, symbol, rank, close, row) VALUES ($1, 'none', $2, $3, $4, 1, $5::jsonb)",
                               [(MOM, D2, sy, rk, json.dumps(r)) for sy, rk, r in snap])
        await conn.execute("INSERT INTO screen_spells (preset_id, chips, symbol, added_on, registry_added) VALUES ($1, 'none', 'CO002', $2, 17)", MOM, date(2026, 11, 13))
        await conn.execute("INSERT INTO gainers (page, win, session, rank, row) VALUES ('advanced', 'day', $1, 1, $2::jsonb)", D2, json.dumps({"symbol": "CO006", "since": 9.1}))
        await conn.execute("INSERT INTO leadership_history (symbol, run_date, label) VALUES ('CO002', $1, 'leader')", date(2026, 11, 15))
        await conn.execute("INSERT INTO snapshots (symbol, statement, section, body, etag, generated_at) VALUES ('CO005', 'consolidated', 'events', $1, 'e', now())",
                           json.dumps({"actions": [{"date": "2026-11-19", "type": "split"}]}))


async def test_a_day_from_stored_history_passes_the_owners_checker(store, tmp_path):
    await seed(store)
    doc, notes = await X.build_day(store, D2, live=False, now=datetime(2026, 11, 23, 1, 0, tzinfo=IST))
    assert validate(doc) == [] and doc["date"] == "2026-11-19" and doc["prev_date"] == "2026-11-18" and notes["mode"] == "history"
    by = {c["symbol"]: c for c in doc["companies"]}
    assert len(doc["companies"]) == N - 1 and notes["companiesNoIsin"] == 1           # no ISIN anywhere: left out and counted
    c2 = by["CO002"]
    assert c2["close"] == 102.0 and c2["chg_1d_pct"] == 2.0 and c2["mcap_cr"] == 90000.0 and c2["size"] == "Large" and c2["fo"] == 0
    assert c2["prism"]["label"] == "Healthy" and c2["tech"] == {"st": 10.0, "lt": 20.0} and c2["leader_tag"] == "Leader" and c2["exchange"] == "NSE"
    assert by["CO001"]["prism"]["final"] != 12.0                       # the re-rating recorded after the next session opened belongs to a later day
    assert by["CO005"]["chg_1d_pct"] is None and notes["splitDayChangesNulled"] == ["CO005"]       # never -50% on a split day
    assert by["CO010"]["mcap_cr"] is None and by["CO010"]["size"] is None and by["CO010"]["ret"] == {"m3": None, "m6": None, "y1": None}   # not kept per day: null
    bse = [c for c in doc["companies"] if c["exchange"] == "BSE"]
    assert bse and all(c["symbol"].isdigit() for c in bse)
    sc = {s["id"]: s for s in doc["screens"]}
    m = sc[MOM]["rows"]
    assert [r["pos"] for r in m] == [1, 2] and m[0]["isin"] == by["CO002"]["isin"] and m[0]["added"] == "2026-11-13" and m[0]["extra"]["momentum_score"] == 98.5
    assert notes["screenRowsWithoutIsin"] == 1
    assert sc["strong-results"]["rows"] == []                            # stored, with no company that day
    assert sc["gainers-day"]["rows"][0]["isin"] == by["CO006"]["isin"] and sc["gainers-day"]["rows"][0]["extra"].get("since") == 9.1 and sc["gainers-week"]["rows"] == []
    assert "rating-upgrades" in notes["screensNotStored"] and "rating-upgrades" not in sc    # not stored that day: named, never shown as empty


async def test_the_job_writes_the_finished_day_once_and_back_fills_only_at_night(store, tmp_path):
    await seed(store)
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO preset_meta (key, value) VALUES ('last_run', $1::jsonb)", json.dumps({"asOf": D2.isoformat()}))
        await conn.execute("INSERT INTO screen_runs (preset_id, chips, session, registry, n, list_hash) VALUES ($1, 'none', $2, 17, 0, 'h')", MOM, D1)
        await conn.execute("INSERT INTO prism_history (symbol, statement, day, final, st_score, lt_score, recorded_at) SELECT symbol, 'consolidated', $1, final, st_score, lt_score, $2 "
                           "FROM prism_history WHERE day = $3", D1, datetime(2026, 11, 18, 23, 0, tzinfo=IST), D2)
        await conn.execute("INSERT INTO screen_runs (preset_id, chips, session, registry, n, list_hash) VALUES ($1, 'none', $2, 17, 0, 'h')", MOM, date(2026, 11, 17))
    day = datetime(2026, 11, 20, 12, 0, tzinfo=IST)                     # after the next session opened: stored history, not the screener's current figures
    assert await X.has_work(store, day)
    res = await X.run(store, now=day, folder=tmp_path)
    assert [w["date"] for w in res["written"]] == ["2026-11-19"] and res["written"][0]["mode"] == "history" and not res["failed"]
    assert res["seconds"] < 30
    assert X.dates(tmp_path) == ["2026-11-19"]                           # D1 waits for the night shift
    first = (tmp_path / "scores_2026-11-19.json.gz").read_bytes()
    night = datetime(2026, 11, 21, 1, 0, tzinfo=IST)
    assert await X.has_work(store, night)
    res = await X.run(store, now=night, folder=tmp_path)
    assert [w["date"] for w in res["written"]] == ["2026-11-18"] and res["backfillLeft"] == 0
    # 17 Nov had stored screens but no stored Prism figures: refused by the checker, recorded once, never written, not a job failure, not tried again
    assert [x["date"] for x in res["notReconstructable"]] == ["2026-11-17"] and res["failed"] == []
    assert "2026-11-17" in X.not_reconstructable(tmp_path)
    assert (tmp_path / "scores_2026-11-19.json.gz").read_bytes() == first     # yesterday's file unchanged
    assert X.dates(tmp_path) == ["2026-11-18", "2026-11-19"]
    assert not await X.has_work(store, night)
    res = await X.run(store, now=night, folder=tmp_path)
    assert res["written"] == [] and res["failed"] == []


async def test_a_holiday_and_a_weekend_get_no_file(store, tmp_path):
    await seed(store)
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO preset_meta (key, value) VALUES ('last_run', $1::jsonb)", json.dumps({"asOf": HOL.isoformat()}))
        await conn.execute("INSERT INTO screen_runs (preset_id, chips, session, registry, n, list_hash) VALUES ($1, 'none', $2, 17, 0, 'h')", MOM, HOL)
    from finlit import prism_technical      # the technicals job found 19 Nov to be the newest session on the 20th: a holiday
    await store.redis.set(prism_technical.TARGET_KEY, json.dumps({"expected": HOL.isoformat(), "target": D2.isoformat()}))
    res = await X.run(store, now=datetime(2026, 11, 20, 23, 30, tzinfo=IST), folder=tmp_path, backfill=0)
    assert res["written"] == [] and res["skipped"][0]["why"].startswith("not a market day")
    assert not await X.is_market_day(store, date(2026, 11, 21), datetime(2026, 11, 21, 23, 30, tzinfo=IST))      # Saturday


async def test_the_live_figures_are_the_screeners_own(monkeypatch):
    """The finished day's figures come from the screener's table and the stored Prism cards, field for field (no recomputation)."""
    from finlit.screener import data
    rows = [{"symbol": "AAA", "name": "Alpha", "sector": "IT", "industry": "Software", "band": None,
             "metrics": json.dumps({"price": 1544.2, "ret_1d": -0.84, "market_cap": 90000.0, "ret_3m": 5.5, "ret_6m": 9.1, "ret_1y": 20.25, "pct_from_high": 3.2, "fno": 1})},
            {"symbol": "BBB", "name": "Beta", "sector": "IT", "industry": "Software", "band": None, "metrics": json.dumps({"price": 10.0})}]
    t = data.Table(rows, {}, {}, fno={"AAA": True})

    async def table(_store, force=False):
        return t

    class S:
        async def prism_cards(self, _symbols=None):
            return [{"symbol": "AAA", "final": 68.1, "label": "HEALTHY", "status": "RATED", "generated_at": None,
                     "card": {"parts": {"fundamental": 80.3, "valuation": 40.0, "quality": 90.4, "risk": 58.8}, "st": {"score": 14.6}, "lt": {"score": 65.2}}}]
    monkeypatch.setattr(data, "get_table", table)
    figs, scored = await X.live_figures(S())
    a = figs["AAA"]
    assert scored == ["AAA"] and a["close"] == 1544.2 and a["chg_1d_pct"] == -0.84 and a["mcap_cr"] == 90000.0 and a["fo"] == 1
    assert a["ret"] == {"m3": 5.5, "m6": 9.1, "y1": 20.25} and a["below_52w_high_pct"] == 3.2
    assert a["prism"] == {"final": 68.1, "fundamental": 80.3, "valuation": 40.0, "quality": 90.4, "risk": 58.8, "label": "Healthy"} and a["tech"] == {"st": 14.6, "lt": 65.2}
    assert figs["BBB"]["prism"]["final"] is None and figs["BBB"]["chg_1d_pct"] is None


async def test_the_finished_day_uses_the_screeners_figures_while_its_close_is_current(store, tmp_path, monkeypatch):
    await seed(store)
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO preset_meta (key, value) VALUES ('last_run', $1::jsonb)", json.dumps({"asOf": D2.isoformat()}))

    async def figures(_store):
        out = {s: {"close": 200.0, "chg_1d_pct": -1.25, "mcap_cr": 12000.0, "ret": {"m3": 1.0, "m6": 2.0, "y1": 3.0}, "below_52w_high_pct": 4.0, "fo": 1,
                   "prism": {"final": 70.0, "fundamental": 1.0, "valuation": 2.0, "quality": 3.0, "risk": 4.0, "label": "Healthy"}, "tech": {"st": 5.0, "lt": 6.0}} for s in SYMS}
        return out, list(SYMS)
    monkeypatch.setattr(X, "live_figures", figures)
    res = await X.run(store, now=datetime(2026, 11, 19, 23, 45, tzinfo=IST), folder=tmp_path, backfill=0)
    assert res["written"][0]["mode"] == "live"
    doc = json.loads(gzip.decompress((tmp_path / "scores_2026-11-19.json.gz").read_bytes()))
    c = next(x for x in doc["companies"] if x["symbol"] == "CO002")
    assert c["close"] == 200.0 and c["chg_1d_pct"] == -1.25 and c["size"] == "Small" and c["below_52w_high_pct"] == 4.0 and c["fo"] == 1
