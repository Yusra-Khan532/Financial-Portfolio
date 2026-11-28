"""Bulk, block and short-selling deals: the parsers and the duplicate rule (finlit/deals.py), the job against Postgres, and the API (finlit/dealsapi.py).
The fixtures in tests/fixtures/deals follow NSE's published layouts (bulk.csv and block.csv headers, the snapshot's BULK/BLOCK/SHORT_DEALS_DATA,
the history's BD_* and SS_* keys); the IGIL lines are the case the brief names: the same trades in both files."""
from datetime import date
from pathlib import Path

import httpx
import pytest

from finlit import deals, dealsapi

FIX = Path(__file__).parent / "fixtures" / "deals"
DAY = date(2026, 11, 27)


def text(name):
    return (FIX / name).read_text()


# ------------------------------------------------------------------------------------------------ parsing
def test_numbers_dates_and_remarks():
    assert deals.num("2,10,00,000") == 21000000 and deals.num("1,25,000") == 125000 and deals.num("-") is None and deals.num(" 371.25 ") == 371.25
    assert deals.parse_day("27-NOV-2026") == deals.parse_day("27-Nov-2026") == deals.parse_day("27-11-2026") == deals.parse_day("2026-11-27") == DAY
    assert deals.parse_day("NO RECORDS") is None and deals.remarks_of("-") is None and deals.remarks_of(" Weighted  average ") == "Weighted average"


def test_client_key_collapses_spelling():
    k = deals.client_key
    assert k("BCP ASIA II TOPCO PTE. LTD.") == k("BCP ASIA II TOPCO PTE . LTD .") == "BCP ASIA II TOPCO PTE LTD"
    assert k("NEO APEX VENTURE PRIVATE LIMITED") == k("Neo Apex Venture Pvt. Ltd.") == "NEO APEX VENTURE PVT LTD"
    assert k("ABC INDIA LIMITED") == "ABC INDIA LTD" and k("-") is None and k(None) is None


def test_bulk_csv():
    rows = deals.parse_csv(text("bulk.csv"), "bulk")
    assert len(rows) == 5                                                              # "NO RECORDS" is not a deal
    igil = rows[0]
    assert (igil["day"], igil["symbol"], igil["side"], igil["qty"], igil["price"], igil["remarks"]) == (DAY, "IGIL", "sell", 21000000, 371.25, None)
    assert igil["client"] == "BCP ASIA II TOPCO PTE. LTD." and igil["client_key"] == "BCP ASIA II TOPCO PTE LTD"   # the published name is kept
    assert igil["value_cr"] == 779.625                                                 # 2,10,00,000 x 371.25 / 1e7
    assert rows[4]["remarks"] == "Weighted average trade price" and rows[4]["source"] == "nse-archive"


def test_block_csv_without_remarks_column():
    rows = deals.parse_csv(text("block.csv"), "block")
    assert [r["client_key"] for r in rows] == ["BCP ASIA II TOPCO PTE LTD", "SBI MUTUAL FUND", "HDFC MUTUAL FUND"] and all(r["remarks"] is None for r in rows)


def test_an_html_refusal_is_not_a_file():
    assert deals.parse_csv("<html><body>Access Denied</body></html>", "bulk") == []


def test_snapshot_and_history():
    s = deals.parse_snapshot(__import__("json").loads(text("snapshot.json")))
    assert s["asOn"] == DAY and (len(s["bulk"]), len(s["block"]), len(s["short"])) == (5, 3, 2)
    assert s["short"][0] == {**s["short"][0], "symbol": "IDEA", "qty": 125000, "side": None, "client": None, "price": None, "value_cr": None}
    assert {deals.trade_key(r) for r in s["bulk"]} == {deals.trade_key(r) for r in deals.parse_csv(text("bulk.csv"), "bulk")}   # the cross-check
    h = deals.parse_historical(__import__("json").loads(text("historical_bulk.json")), "bulk")
    assert [(r["day"], r["symbol"], r["side"], r["qty"], r["source"]) for r in h] == [(date(2026, 11, 24), "KAYNES", "buy", 512000, "nse-historical"),
                                                                                    (date(2026, 11, 21), "SMLT", "sell", 98000, "nse-historical")]
    assert h[0]["value_cr"] == round(512000 * 6123.55 / 1e7, 4)
    sh = deals.parse_historical(__import__("json").loads(text("historical_short.json")), "short")
    assert (sh[0]["symbol"], sh[0]["qty"], sh[0]["day"]) == ("IDEA", 200000, date(2026, 11, 24))


def test_duplicate_rule_same_trade_and_near_misses():
    rows = deals.parse_csv(text("bulk.csv"), "bulk") + deals.parse_csv(text("block.csv"), "block")
    assert deals.mark_duplicates(rows) == 2                                            # BCP ASIA (spelled two ways) and SBI (qty one share apart)
    twins = [(r["symbol"], r["client_key"]) for r in rows if r["also_block"]]
    assert twins == [("IGIL", "BCP ASIA II TOPCO PTE LTD"), ("IGIL", "SBI MUTUAL FUND")]
    base = dict(rows[0], also_block=False)
    blk = dict(rows[5])                                                                # the BCP block line
    for change in ({"price": 371.26}, {"qty": base["qty"] + 2}, {"client_key": "OTHER LTD"}, {"side": "buy"}, {"day": date(2026, 11, 26)}):
        near = [dict(base, **change), blk]
        assert deals.mark_duplicates(near) == 0 and not near[0]["also_block"], change


# ------------------------------------------------------------------------------------------------ the job and the API, against Postgres
from test_integration import make_settings, store  # noqa: F401,E402

HIST = text("historical_bulk.json")


def nse_handler(refuse_history=False, calls=None):
    def handler(req: httpx.Request) -> httpx.Response:
        u = str(req.url)
        if calls is not None:
            calls.append(u)
        if u.endswith("bulk.csv"):
            return httpx.Response(200, text=text("bulk.csv"), headers={"content-type": "text/csv"})
        if u.endswith("block.csv"):
            return httpx.Response(200, text=text("block.csv"), headers={"content-type": "text/csv"})
        if "snapshot-capital-market-largedeal" in u:
            return httpx.Response(200, text=text("snapshot.json"))
        if "/historical/" in u:
            if refuse_history:
                return httpx.Response(403, text="<html>Access Denied</html>")
            if "bulk-deals" in u:
                return httpx.Response(200, text=HIST)
            if "short-selling" in u:
                return httpx.Response(200, text=text("historical_short.json"))
            return httpx.Response(200, text='{"data": []}')
        return httpx.Response(200, text="<html>home</html>")                           # NSE's home page (the cookie)
    return handler


async def clean(store_):
    dealsapi.reset()
    async with store_.pool.acquire() as conn:
        await conn.execute("DELETE FROM market_deals")
        await conn.execute("DELETE FROM flows_meta WHERE key LIKE 'deals:%'")
        await conn.execute("DELETE FROM deal_follows")


@pytest.mark.integration
async def test_job_stores_once_and_a_rerun_inserts_nothing(store):  # noqa: F811
    await clean(store)
    async with httpx.AsyncClient(transport=httpx.MockTransport(nse_handler())) as http:
        out = await deals.refresh(store, http=http, pause_s=0, today=DAY, use_env_relay=False)
        assert out["inserted"] == {"bulk": 7, "block": 3, "short": 3}                    # today's 5 + 3 + 2, and the history's 2 bulk + 1 short
        assert out["duplicates"] == 2 and out["crossCheck"]["bulk"]["same"] and out["crossCheck"]["block"]["same"]
        assert (out["firstDay"], out["lastDay"], out["rows"]) == ("2026-11-21", "2026-11-27", {"bulk": 7, "block": 3, "short": 3})
        assert out["http"]["200"] >= 6 and out["days"] == ["2026-11-21", "2026-11-24", "2026-11-27"]
        assert out["backfill"]["ranges"][0] == {"from": "2026-10-28", "to": "2026-11-27", "rows": {"bulk": 2, "block": 0, "short": 1}, "stored": True}
        again = await deals.refresh(store, http=http, pause_s=0, today=DAY, use_env_relay=False)
        assert again["inserted"]["bulk"] == again["inserted"]["block"] == 0 and again["rows"] == out["rows"]   # today re-read: nothing new
        assert again["backfill"]["ranges"][0]["from"] == "2026-09-27"                  # the history stepped one month further back
    async with store.pool.acquire() as conn:
        from finlit.flows import get_meta
        last = await get_meta(conn, "deals:last")
        assert last["rows"] == out["rows"] and last["firstDay"] == "2026-11-21" and last["lastDay"] == "2026-11-27" and "200" in last["http"]
        n = await conn.fetchval("SELECT count(*) FROM market_deals WHERE also_block")
        assert n == 2


@pytest.mark.integration
async def test_job_stops_after_five_refusals_and_keeps_today(store):  # noqa: F811
    await clean(store)
    calls = []
    async with httpx.AsyncClient(transport=httpx.MockTransport(nse_handler(refuse_history=True, calls=calls))) as http:
        out = await deals.refresh(store, http=http, pause_s=0, today=DAY, backfill_months=6, use_env_relay=False)
    assert out["rows"] == {"bulk": 5, "block": 3, "short": 2} and out["backfill"]["ranges"][0]["stored"] is False
    assert out["stoppedAfterRefusals"] or out["http"].get("403", 0) >= 1
    assert sum(1 for c in calls if "/historical/" in c) <= deals.MAX_REFUSALS
    assert any("asked again next run" in n for n in out["notes"])


@pytest.fixture
async def api(store):  # noqa: F811
    from finlit.api import create_app
    await clean(store)
    async with httpx.AsyncClient(transport=httpx.MockTransport(nse_handler())) as http:
        await deals.refresh(store, http=http, pause_s=0, today=DAY, use_env_relay=False)
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM listing_quotes WHERE symbol IN ('IGIL', 'SMLT')")
        # IGIL: 400 now, market cap 16,000 Cr -> 40 crore shares; SMLT closed 112 on the deal day
        await conn.execute("INSERT INTO listing_quotes (symbol, price, market_cap, traded_at) VALUES ('IGIL', 400, 16000, '2026-11-28T10:00:00Z'), ('SMLT', 120, 60, now())")
        await conn.execute("DELETE FROM price_daily WHERE symbol IN ('IGIL', 'SMLT')")
        await conn.execute("INSERT INTO price_daily (symbol, day, close) VALUES ('IGIL', '2026-11-27', 372), ('SMLT', '2026-11-27', 56)")   # SMLT: a 1:1 bonus since
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            yield c
    dealsapi.reset()


@pytest.mark.integration
async def test_list_filters_sorting_and_totals_counted_once(api, monkeypatch):
    monkeypatch.setattr(dealsapi, "today_ist", lambda: DAY)
    r = await api.get("/api/deals", params={"days": 7})
    assert r.status_code == 200 and r.headers["cache-control"] == "public, max-age=600"
    j = r.json()
    t = j["totals"]
    assert (t["deals"], t["trades"], t["alsoListedAsBulk"]) == (10, 8, 2)                # "10 deals (8 trades after removing block deals also listed as bulk)"
    assert j["total"] == 8 and not any(x["alsoBlock"] for x in j["rows"])                # All deals: the bulk twins left out
    assert [x["valueCr"] for x in j["rows"]] == sorted((x["valueCr"] for x in j["rows"]), reverse=True)
    top = j["rows"][0]
    assert (top["symbol"], top["kind"], top["alsoBulk"], top["valueCr"]) == ("IGIL", "block", True, 779.625)
    assert top["pctEquity"] == 5.25                                                    # 2.1 crore of 40 crore shares
    assert top["closeNow"] == 400 and top["sinceDealPct"] == 7.74                      # (400 - 371.25) / 371.25
    assert t["sellCr"] == pytest.approx(779.625 + 94.2861 + 1.0692, abs=0.01)            # BCP once, ACME sell, SMLT sell on 21 Nov (history)
    smlt = next(x for x in j["rows"] if x["symbol"] == "SMLT" and x["day"] == "2026-11-27")
    assert smlt["sinceDealPct"] is None and "split or bonus" in smlt["sinceNote"]      # 56 against 112.40: not compared
    b = (await api.get("/api/deals", params={"days": 7, "kind": "bulk"})).json()
    assert b["total"] == 7 and sum(1 for x in b["rows"] if x["alsoBlock"]) == 2          # the Bulk filter still lists them, tagged
    s = (await api.get("/api/deals", params={"days": 7, "side": "buy", "sort": "qty", "dir": "asc"})).json()
    assert all(x["side"] == "buy" for x in s["rows"]) and [x["qty"] for x in s["rows"]] == sorted(x["qty"] for x in s["rows"])
    q = (await api.get("/api/deals", params={"days": 30, "q": "graviton"})).json()
    assert {x["symbol"] for x in q["rows"]} == {"ACMESOLAR"} and q["total"] == 2
    c = (await api.get("/api/deals", params={"days": 30, "client": "bcp asia ii topco pte. ltd."})).json()
    assert c["total"] == 1 and c["rows"][0]["kind"] == "block"
    m = (await api.get("/api/deals", params={"days": 30, "min_cr": 100})).json()
    assert all(x["valueCr"] >= 100 for x in m["rows"])
    sh = (await api.get("/api/deals", params={"days": 7, "kind": "short"})).json()
    assert sh["total"] == 3 and sh["totals"]["byKind"]["short"] == {"deals": 3, "qty": 375000}
    p = (await api.get("/api/deals", params={"days": 7, "size": 3, "page": 2})).json()
    assert (p["page"], p["pages"], len(p["rows"])) == (2, 3, 3)
    one = (await api.get("/api/deals", params={"days": 1})).json()
    assert one["period"] == {"from": "2026-11-27", "to": "2026-11-27", "days": 1} and one["total"] == 6


@pytest.mark.integration
async def test_coverage_and_csv(api, monkeypatch):
    monkeypatch.setattr(dealsapi, "today_ist", lambda: DAY)
    j = (await api.get("/api/deals", params={"days": 365})).json()
    cov = j["coverage"]
    assert (cov["first_day"], cov["last_day"], cov["exchanges"], cov["shorterThanPeriod"]) == ("2026-11-21", "2026-11-27", ["NSE"], True)
    assert not (await api.get("/api/deals", params={"days": 7})).json()["coverage"]["shorterThanPeriod"]
    r = await api.get("/api/deals", params={"days": 7, "format": "csv"})
    assert r.headers["content-type"].startswith("text/csv") and "attachment" in r.headers["content-disposition"]
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("Date,Exchange,Kind,Symbol") and len([x for x in lines[1:] if x.startswith("2026-")]) == 8 and "not investment advice" in lines[-1]


@pytest.mark.integration
async def test_summary_stock_client_and_ipos(api, monkeypatch):
    monkeypatch.setattr(dealsapi, "today_ist", lambda: DAY)
    s = (await api.get("/api/deals/summary", params={"days": 7})).json()
    assert len(s["largest"]) == 6 and not any(x["alsoBlock"] for x in s["largest"]) and s["largest"][0]["symbol"] == "IGIL"
    assert s["activeShares"][0]["symbol"] == "IGIL" and s["activeShares"][0]["netCr"] == pytest.approx(222.75 + 278.4375 - 779.625, abs=0.01)
    assert s["activeClients"][0]["client"].startswith("BCP ASIA") and s["totals"]["trades"] == 8
    st = (await api.get("/api/deals/stock/igil")).json()
    assert st["symbol"] == "IGIL" and len(st["rows"]) == 5 and st["trades"] == 3 and st["latestClose"] == 400
    assert st["rows"][0]["dayClose"] == 372
    cl = (await api.get("/api/deals/client/GRAVITON RESEARCH CAPITAL LLP")).json()
    assert cl["bothSides"] == ["ACMESOLAR"] and cl["shares"][0]["netCr"] == pytest.approx((3512880 * 268.43 - 3510112 * 268.61) / 1e7, abs=0.01)
    assert (await api.get("/api/deals/client/NOBODY AT ALL")).status_code == 404
    ip = (await api.get("/api/deals/ipos")).json()
    assert ip["historyFrom"] == "2026-11-21" and isinstance(ip["byId"], dict) and isinstance(ip["lockinsAhead"], list)


@pytest.mark.integration
async def test_stale_copy_is_sent_and_rebuilt_behind_it(api, store, monkeypatch):  # noqa: F811
    monkeypatch.setattr(dealsapi, "today_ist", lambda: DAY)
    first = (await api.get("/api/deals/stock/KAYNES")).json()
    assert first["trades"] == 1
    async with store.pool.acquire() as conn:
        await conn.execute("UPDATE market_deals SET security_name = 'Kaynes (renamed)' WHERE symbol = 'KAYNES'")
    assert (await api.get("/api/deals/stock/KAYNES")).json()["rows"][0]["name"] != "Kaynes (renamed)"      # fresh copy: served from memory
    hit = dealsapi._cache[("stock", "KAYNES", None)]
    hit["t"] -= dealsapi.CACHE_TTL_S + 1
    assert (await api.get("/api/deals/stock/KAYNES")).json()["rows"][0]["name"] != "Kaynes (renamed)"      # stale: the old copy, rebuilt behind it
    if hit.get("task"):
        await hit["task"]
    assert (await api.get("/api/deals/stock/KAYNES")).json()["rows"][0]["name"] == "Kaynes (renamed)"


# ------------------------------------------------------------------------------------------------ follows: a notification on a new deal
@pytest.mark.integration
async def test_follow_a_share_and_a_client_and_get_one_notification_per_run(store):  # noqa: F811
    from test_auth import signed_in
    from finlit.api import create_app
    await clean(store)
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        anon = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        assert (await anon.put("/api/me/deal-follows/symbol/IGIL")).status_code in (401, 403)           # members only
        c = await signed_in(app, "deals-follow@example.com")
        assert (await c.put("/api/me/deal-follows/symbol/igil")).json()["symbols"] == ["IGIL"]
        assert (await c.put("/api/me/deal-follows/client/Graviton Research Capital LLP.")).json()["clients"] == ["GRAVITON RESEARCH CAPITAL LLP"]
        assert (await c.put("/api/me/deal-follows/symbol/<bad>")).status_code == 422
        async with store.pool.acquire() as conn:
            uid = await conn.fetchval("SELECT id FROM users WHERE email = 'deals-follow@example.com'")
            await conn.execute("DELETE FROM notifications WHERE user_id = $1", uid)
        async with httpx.AsyncClient(transport=httpx.MockTransport(nse_handler())) as http:
            out = await deals.refresh(store, http=http, pause_s=0, today=DAY, use_env_relay=False)
            assert out["notified"] == 1                                                               # one notification, not one per deal
            again = await deals.refresh(store, http=http, pause_s=0, today=DAY, use_env_relay=False)
            assert again["notified"] == 0                                                             # nothing new, nothing sent
        async with store.pool.acquire() as conn:
            n = await conn.fetch("SELECT title, body, link FROM notifications WHERE user_id = $1", uid)
        assert len(n) == 1 and n[0]["title"] == "New bulk or block deals: ACMESOLAR, IGIL"
        body = n[0]["body"]
        assert body.count("IGIL:") == 3 and body.count("ACMESOLAR:") == 2 and "(block, ₹779.62 Cr)" in body        # each trade once: the bulk twins left out
        assert (await c.delete("/api/me/deal-follows/symbol/IGIL")).json()["symbols"] == []
        await anon.aclose(); await c.aclose()
