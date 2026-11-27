"""The feed's re-sorting against Postgres: a reload re-sorts a stored row, the one-off re-sort fixes old rows, and the News page's query
(news and results filings together, continued by date and id) returns what it should. Needs DATABASE_URL and REDIS_URL like the rest."""
from datetime import date

import httpx
import pytest

from finlit.api import create_app
from finlit.feed import dedupe_key, resort_all, save_announcements
from tests.test_integration import make_settings, store  # noqa: F401  (the fixture)

pytestmark = pytest.mark.integration

SPURT = ("Spurt in Volume: Significant increase in volume has been observed in Ghcl Textiles Limited. The Exchange, in order to ensure that "
         "the investors have latest relevant information about the company")


async def _rows(conn):
    return {r["category"]: dict(r) for r in await conn.fetch("SELECT kind, topic, category, title FROM feed_items ORDER BY id")}


async def test_a_reload_re_sorts_rows_stored_under_the_old_rules(store):  # noqa: F811
    a = [{"date": "2026-11-19", "category": "Spurt in Volume", "description": SPURT, "link": "https://x.example/s.pdf"}]
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, source, link, item_date, category, auto, dedupe) "
                           "VALUES ('document', $1, 'GHCLTEXTIL', 'GHCL Textiles Ltd', 'Exchange filing', $2, $3, 'Spurt in Volume', true, $4)",
                           SPURT[:160], a[0]["link"], date(2026, 11, 19), dedupe_key("GHCLTEXTIL", "2026-11-19", " ".join(SPURT.split()), a[0]["link"]))
        await save_announcements(conn, "GHCLTEXTIL", "GHCL Textiles Ltd", a)
        rows = await conn.fetch("SELECT kind, topic FROM feed_items")
    assert [(r["kind"], r["topic"]) for r in rows] == [("news", "legal")]   # updated in place, not added twice


async def test_the_one_off_re_sort_counts_first_and_then_fixes_old_rows(store):  # noqa: F811
    old = [("document", "Spurt in Volume", SPURT[:150]),
           ("result", "Analysts/Institutional Investor Meet/Con. Call Updates", "Senco Gold Limited has informed the Exchange about Earnings Call Transcript of Q2 & H1 FY 27- Financial Results."),
           ("news", "Integrated Filing- Financial", "Integrated Filing - Financials"),
           ("result", "Press Release", "Press Release: " + "x" * 140),            # a cut title: stays a result
           ("news", "General Updates", "Jupiter Wagons Limited secures repeat order worth over INR 128 crore from JSW (South) Rail Logistics")]
    async with store.pool.acquire() as conn:
        for i, (kind, cat, title) in enumerate(old):
            await conn.execute("INSERT INTO feed_items (kind, title, symbol, source, item_date, category, auto, dedupe) VALUES ($1,$2,'X','Exchange filing',$3,$4,true,$5)",
                               kind, title, date(2026, 11, 14), cat, f"k{i}")
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, source, item_date, category, auto) VALUES "
                           "('result', 'X Ltd: board meeting for results', 'X', 'FinEdge results calendar', '2026-11-25', 'Results date', true)")
        dry = await resort_all(conn, apply=False, batch=2)
        assert dry["kind_moves"] == {"document -> news": 1, "result -> document": 1, "news -> result": 1} and not dry["applied"]
        assert (await conn.fetchval("SELECT count(*) FROM feed_items WHERE topic IS NOT NULL")) == 0
        done = await resort_all(conn, apply=True, batch=2)
        assert done["changed"] == 6
        rows = await _rows(conn)
    assert rows["Spurt in Volume"]["kind"] == "news" and rows["Spurt in Volume"]["topic"] == "legal"
    assert rows["Analysts/Institutional Investor Meet/Con. Call Updates"]["kind"] == "document"
    assert rows["Integrated Filing- Financial"]["kind"] == "result" and rows["Integrated Filing- Financial"]["topic"] == "results"
    assert rows["Press Release"]["kind"] == "result"
    assert rows["General Updates"]["topic"] == "orders"
    assert rows["Results date"]["kind"] == "result" and rows["Results date"]["topic"] == "results"   # calendar rows keep their kind


async def test_news_page_query_reads_filings_of_both_kinds_and_continues_by_date_and_id(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        for i in range(5):   # five filings on one busy day, then one older
            await conn.execute("INSERT INTO feed_items (kind, title, symbol, source, item_date, category, auto, topic) VALUES ($1,$2,'X','Exchange filing',$3,$4,true,$5)",
                               "result" if i == 2 else "news", f"filing {i}", date(2026, 11, 14), "Outcome of Board Meeting" if i == 2 else "General Updates",
                               "results" if i == 2 else "other")
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, source, item_date, category, auto, topic) VALUES "
                           "('news', 'older', 'X', 'Exchange filing', '2026-11-13', 'Credit Rating', true, 'rating'), "
                           "('result', 'X Ltd: board meeting for results', 'X', 'FinEdge results calendar', '2026-11-14', 'Results date', true, 'results')")
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as api:
            first = (await api.get("/api/feed?kind=news,result&filed=true&limit=3")).json()["items"]
            last = first[-1]
            rest = (await api.get(f"/api/feed?kind=news,result&filed=true&limit=10&before={last['date']}&before_id={last['id']}")).json()["items"]
            only = (await api.get("/api/feed?kind=news,result&filed=true&topic=results&limit=10")).json()["items"]
    titles = [i["title"] for i in first + rest]
    assert titles == ["filing 4", "filing 3", "filing 2", "filing 1", "filing 0", "older"]   # nothing skipped, the calendar date left out
    assert [i["title"] for i in only] == ["filing 2"] and only[0]["topic"] == "results"


async def test_counts_give_each_topic_category_and_day_for_the_window(store):  # noqa: F811
    rows = [("news", "Bagging/Receiving of orders/contracts", "Receiving of orders.", "2026-11-20", "orders"),
            ("news", "General Updates", "Jupiter Wagons Limited secures repeat order worth over INR 128 crore", "2026-11-20", "orders"),
            ("news", "General Updates", "Deepak Nitrite Limited has informed the Exchange about General Updates", "2026-11-19", "other"),
            ("result", "Outcome of Board Meeting", "Financial results for the quarter", "2026-11-19", None),   # not re-sorted yet: no topic
            ("news", "Credit Rating", "Credit Rating", "2026-10-01", "rating")]                              # outside the window
    async with store.pool.acquire() as conn:
        for kind, cat, title, d, topic in rows:
            await conn.execute("INSERT INTO feed_items (kind, title, symbol, source, item_date, category, auto, topic) VALUES ($1,$2,'X','Exchange filing',$3,$4,true,$5)",
                               kind, title, date.fromisoformat(d), cat, topic)
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as api:
            c = (await api.get("/api/feed/counts?kind=news,result&filed=true&from_date=2026-11-14&to_date=2026-11-21")).json()
            o = (await api.get("/api/feed/counts?kind=news,result&filed=true&from_date=2026-11-14&to_date=2026-11-21&topic=orders")).json()
            g = (await api.get("/api/feed?kind=news,result&filed=true&category=General%20Updates&from_date=2026-11-14&to_date=2026-11-21")).json()["items"]
            bad = await api.get("/api/feed/counts?from_date=2026-01-01&to_date=2026-11-21")
    assert c["total"] == 4 and c["topics"] == [["results", "Results", 1], ["orders", "Orders & contracts", 2], ["other", "Other updates", 1]]
    assert c["days"] == [["2026-11-20", 2], ["2026-11-19", 2]]
    assert o["total"] == 2 and o["categories"] == [["Bagging/Receiving of orders/contracts", 1], ["General Updates", 1]]
    assert len(o["topics"]) == 3   # the topic chips still show every topic while one is picked
    assert sorted(i["title"][:7] for i in g) == ["Deepak ", "Jupiter"] and bad.status_code == 400


async def test_the_feed_sort_job_runs_the_re_sort_once_by_itself_and_resumes(store, monkeypatch):  # noqa: F811
    """Task #309: no one runs a command on the server. The feed-sort job re-sorts every stored row when the rules version changed,
    continues from the last id after its time budget, and does nothing once the rules are current."""
    from finlit import feed as F
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM mf_meta WHERE key = $1", F.SORT_META)
        for i in range(6):
            await conn.execute("INSERT INTO feed_items (kind, title, symbol, source, item_date, category, auto, dedupe) VALUES "
                               "('document', $1, 'X', 'Exchange filing', '2026-11-19', 'Spurt in Volume', true, $2)", SPURT[:150], f"fs{i}")
    ticks = {"n": 0}

    def clock():   # the start, the first batch's check, then past the budget
        ticks["n"] += 1
        return 0.0 if ticks["n"] <= 2 else 10_000.0
    first = await F.ensure_sorted(store, max_minutes=1, batch=2, clock=clock)
    assert first["status"] == "partial" and first["rows"] == 2 and "continues after id" in first["why"]
    second = await F.ensure_sorted(store, max_minutes=1, batch=2, clock=lambda: 0.0)
    assert second["status"] == "ok" and second["done"] and second["rows"] == 6 and second["kind_moves"] == {"document -> news": 6}
    async with store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM feed_items WHERE kind = 'news' AND topic = 'legal'") == 6
    third = await F.ensure_sorted(store, max_minutes=1, batch=2)
    assert third == {"status": "ok", "why": "rules current", "version": F.SORT_RULES}
