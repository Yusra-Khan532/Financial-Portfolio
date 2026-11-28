"""Task #365 re-check (28 Nov 2026), against Postgres: the exchange's longer description is stored at load time, the filing-text job reads PDFs and
remembers failures, the sentiment job stores routine filings as routine, scores an item again when its text changes, and warns when most of a kind
reads neutral; /api/feed and /api/feed/sentiment give routine filings as routine. Needs TEST_DATABASE_URL and TEST_REDIS_URL like the rest."""
from datetime import date, timedelta

import httpx
import pytest

from finlit import filing_text as F
from finlit import sentiment as S
from finlit.api import create_app
from finlit.earnings import transcripts as T
from finlit.feed import save_announcements
from tests.test_filing_text_365 import LETTER, make_pdf
from tests.test_integration import make_settings, store  # noqa: F401  (the fixture)

pytestmark = pytest.mark.integration
TODAY = date.today()
NSE = "https://nsearchives.nseindia.com/corporate/"


async def clean(conn):
    await conn.execute("DELETE FROM feed_sentiment")
    await conn.execute("DELETE FROM filing_reads")
    await conn.execute("DELETE FROM feed_items")


async def item(conn, kind, category, title, link=None, days=1, lead=None, summary=None):
    return await conn.fetchval(
        "INSERT INTO feed_items (kind, title, symbol, company, source, link, item_date, category, summary, auto, dedupe, lead) "
        "VALUES ($1, $2, 'LT', 'Larsen & Toubro', 'Exchange filing', $3, $4, $5, $6, true, md5(random()::text), $7) RETURNING id",
        kind, title, link, TODAY - timedelta(days=days), category, summary, lead)


class FakeModel:
    """Positive when the text names an order won, else neutral, as a financial-news model reads a bare subject line."""
    version = "fake-1"

    def __init__(self):
        self.seen = []

    def score(self, texts):
        self.seen.extend(texts)
        return [None if not t.strip() else S.Score(0.8, 0.85, 0.1, 0.05) if "won an order" in t else S.Score(0.0, 0.01, 0.98, 0.01) for t in texts]


class FakeFetcher:
    def __init__(self, files):
        self.files, self.asked = files, []

    async def pdf(self, url, cap=None):
        self.asked.append(url)
        f = self.files.get(url)
        if f is None:
            raise T.FetchFailed("HTTP 404")
        return f

    async def aclose(self):
        pass


async def test_a_long_description_is_kept_as_the_lead_at_load_time(store):  # noqa: F811
    long = ("This is further to the disclosure dated September 21, 2026 made by the Company. We wish to inform you that the Company executives "
            "participated in the Institutional Investors' Meeting - BofA Asia Pacific Conference 2026 and no unpublished price sensitive information was shared.")
    a = [{"date": TODAY.isoformat(), "category": "Updates", "description": long, "link": NSE + "a.pdf"},
         {"date": TODAY.isoformat(), "category": "Credit Rating", "description": "Larsen & Toubro Limited has informed the Exchange about Credit Rating", "link": NSE + "b.pdf"}]
    async with store.pool.acquire() as conn:
        await clean(conn)
        await save_announcements(conn, "LT", "Larsen & Toubro", a)
        await save_announcements(conn, "LT", "Larsen & Toubro", a)        # a reload changes nothing
        rows = {r["category"]: dict(r) for r in await conn.fetch("SELECT category, title, summary, lead, lead_src FROM feed_items")}
        assert len(rows) == 2
    assert rows["Updates"]["lead"] == long and rows["Updates"]["lead_src"] == "exchange" and rows["Updates"]["summary"] is None
    assert rows["Updates"]["title"].startswith("Updates: ") and len(rows["Updates"]["title"]) < len(long)
    assert rows["Credit Rating"]["lead"] is None                       # the subject is the whole text: the PDF is the fallback


async def test_the_job_reads_pdfs_remembers_failures_and_skips_routine_filings(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await clean(conn)
        rating = await item(conn, "news", "Credit Rating", "Larsen & Toubro Limited has informed the Exchange about Credit Rating", NSE + "rating.pdf", 1)
        broken = await item(conn, "news", "Bagging/Receiving of orders/contracts", "L&T has informed the Exchange about Bagging/Receiving of orders/contracts", NSE + "gone.pdf", 2)
        scan = await item(conn, "result", "Outcome of Board Meeting", "Outcome of Board Meeting", NSE + "scan.pdf", 3)
        esop = await item(conn, "news", "ESOP/ESOS/ESPS", "Allotment of 907815 Shares.", NSE + "esop.pdf", 1)
        report = await item(conn, "document", "Annual Report", "Annual Report 2025-26", NSE + "ar.pdf", 1)
        old = await item(conn, "news", "Credit Rating", "Credit Rating", NSE + "old.pdf", 800)          # older than the two-year lookback
        bse = await item(conn, "news", "Press Release", "Press release", "https://example.com/x.pdf", 1)  # not an exchange archive: never asked
    fetch = FakeFetcher({NSE + "rating.pdf": make_pdf(LETTER), NSE + "scan.pdf": make_pdf([" "])})
    res = await F.read_pending(store, limit=10, max_minutes=5, fetcher=fetch)
    assert sorted(fetch.asked) == sorted([NSE + "rating.pdf", NSE + "gone.pdf", NSE + "scan.pdf"])     # newest first, no routine filing, no big report
    assert fetch.asked[0] == NSE + "rating.pdf"
    assert res["read"] == 1 and res["failed"] == 1 and res["noText"] == 1 and res["skipped"] == 2 and res["status"] == "ok"
    async with store.pool.acquire() as conn:
        lead = await conn.fetchrow("SELECT lead, lead_src FROM feed_items WHERE id = $1", rating)
        reads = {r["feed_id"]: dict(r) for r in await conn.fetch("SELECT feed_id, status, tries, retry_after, reason FROM filing_reads")}
    assert lead["lead_src"] == "pdf" and lead["lead"].startswith("CRISIL Ratings Limited") and "Dalal Street" not in lead["lead"]
    assert reads[rating]["status"] == "ok" and reads[rating]["retry_after"] is None
    assert reads[broken]["status"] == "failed" and reads[broken]["tries"] == 1 and reads[broken]["reason"] == "HTTP 404" and reads[broken]["retry_after"] is not None
    assert reads[scan]["status"] == "no_text" and reads[scan]["retry_after"] is None
    assert reads[esop]["status"] == "skipped" and reads[report]["status"] == "skipped"
    assert old not in reads and bse not in reads
    fetch2 = FakeFetcher({})
    again = await F.read_pending(store, limit=10, max_minutes=5, fetcher=fetch2)
    assert fetch2.asked == [] and again["tried"] == 0                    # nothing is asked again the next night
    async with store.pool.acquire() as conn:                             # three days later the failed file is tried again, then later still
        await conn.execute("UPDATE filing_reads SET retry_after = now() - interval '1 minute' WHERE feed_id = $1", broken)
    await F.read_pending(store, limit=10, max_minutes=5, fetcher=fetch2)
    async with store.pool.acquire() as conn:
        r = await conn.fetchrow("SELECT tries, retry_after - now() AS wait FROM filing_reads WHERE feed_id = $1", broken)
    assert fetch2.asked == [NSE + "gone.pdf"] and r["tries"] == 2 and timedelta(days=8) < r["wait"] <= timedelta(days=9)


async def test_routine_filings_are_stored_as_routine_and_a_changed_text_is_scored_again(store, monkeypatch):  # noqa: F811
    m = FakeModel()
    monkeypatch.setattr(S, "model", lambda: m)
    async with store.pool.acquire() as conn:
        await clean(conn)
        order = await item(conn, "news", "Bagging/Receiving of orders/contracts", "Larsen & Toubro Limited has informed the Exchange about Bagging/Receiving of orders/contracts",
                           NSE + "o.pdf", 1)
        esop = await item(conn, "news", "Allotment of Securities", "allotment of 44116 securities pursuant to ESOP/ESPS", NSE + "e.pdf", 2)
        meet = await item(conn, "document", "Analysts/Institutional Investor Meet/Con. Call Updates", "Larsen & Toubro Limited has informed the Exchange about Schedule of meet", NSE + "m.pdf", 3)
    res = await S.score_pending(store, limit=100, max_minutes=1)
    assert res["scored"] == 3 and res["routine"] == 2 and res["left"] == 0 and res["model"] == f"fake-1+{S.TEXT_RULES}"
    assert res["byKind"] == {"news": {"read": 1, "neutral": 1, "neutralShare": 1.0}} and res["status"] == "ok"   # one item is too few to warn about
    assert res["filings"] == {"pdfRead": 0, "pdfFailed": 0, "noText": 0, "tooLarge": 0}
    async with store.pool.acquire() as conn:
        rows = {r["feed_id"]: dict(r) for r in await conn.fetch("SELECT feed_id, score, state, text_hash FROM feed_sentiment")}
    assert rows[esop]["state"] == "routine" and rows[esop]["score"] is None and rows[meet]["state"] == "routine"
    assert rows[order]["state"] == "read" and rows[order]["score"] == 0.0 and rows[order]["text_hash"]
    assert m.seen == ["Bagging/Receiving of orders/contracts"]           # the routine ones were never read by the model
    again = await S.score_pending(store, limit=100, max_minutes=1)
    assert again["scored"] == 0                                           # nothing changed: nothing scored again
    async with store.pool.acquire() as conn:                             # the filing's words arrive (the filing-text job)
        await conn.execute("UPDATE feed_items SET lead = $2, lead_src = 'pdf' WHERE id = $1", order,
                           "Two L&T verticals have jointly won an order to develop a 300 MW / 900 MWh Battery Energy Storage System at Khavda in Gujarat.")
    third = await S.score_pending(store, limit=100, max_minutes=1)
    assert third["scored"] == 1 and third["withText"] == 1
    async with store.pool.acquire() as conn:
        r = await conn.fetchrow("SELECT score, state FROM feed_sentiment WHERE feed_id = $1", order)
    assert r["state"] == "read" and r["score"] == pytest.approx(0.8)
    assert m.seen[-1].startswith("Bagging/Receiving of orders/contracts. Two L&T verticals have jointly won an order")
    monkeypatch.setattr(S, "TEXT_RULES", "lead-test")                   # a change of rules reads every item again (gradually, within the job's limits)
    assert (await S.score_pending(store, limit=2, max_minutes=1))["scored"] == 2


async def test_the_job_warns_but_never_fails_when_most_of_a_kind_reads_neutral(store, monkeypatch):  # noqa: F811
    m = FakeModel()
    monkeypatch.setattr(S, "model", lambda: m)
    async with store.pool.acquire() as conn:
        await clean(conn)
        for i in range(60):
            await item(conn, "document", "Updates", f"Larsen & Toubro Limited has informed the Exchange about Intimation {i}", NSE + f"d{i}.pdf", 1)
        for i in range(10):
            await item(conn, "news", "Updates", f"L&T has won an order number {i} worth Rs 500 crore", NSE + f"n{i}.pdf", 1)
    res = await S.score_pending(store, limit=1000, max_minutes=1)
    assert res["ok"] and res["scored"] == 70 and res["status"] == "partial"
    assert res["byKind"]["document"] == {"read": 60, "neutral": 60, "neutralShare": 1.0}
    assert "document 100% neutral of 60" in res["why"] and res["warnings"] == [res["why"]]
    from finlit.jobs.reasons import explain
    assert "document 100% neutral" in explain(res)                        # what the supervisor puts in the job's status (degraded, not failed)


async def test_the_apis_give_routine_filings_as_routine(store):  # noqa: F811
    async with store.pool.acquire() as conn:
        await clean(conn)
        esop = await item(conn, "news", "ESOP/ESOS/ESPS", "Allotment of 907815 Shares.", NSE + "e.pdf", 1)
        order = await item(conn, "news", "Bagging/Receiving of orders/contracts", "Order", NSE + "o.pdf", 2)
        empty = await item(conn, "news", "Updates", " ", NSE + "x.pdf", 3)
        await conn.execute("INSERT INTO feed_sentiment (feed_id, score, pos, neu, neg, model, state) VALUES ($1, NULL, NULL, NULL, NULL, 'm', 'routine'), "
                           "($2, 0.62, 0.7, 0.22, 0.08, 'm', 'read'), ($3, NULL, NULL, NULL, NULL, 'm', 'empty')", esop, order, empty)
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            feed = {i["id"]: i["sentiment"] for i in (await c.get("/api/feed?kind=news&symbol=LT")).json()["items"]}
            snt = (await c.get("/api/feed/sentiment?symbol=LT")).json()["items"]
    assert feed[esop] == {"score": None, "band": "routine"} and feed[order] == {"score": 0.62, "band": "clearly_positive"} and feed[empty] is None
    by_link = {i["link"]: i for i in snt}
    assert by_link[NSE + "e.pdf"]["band"] == "routine" and by_link[NSE + "e.pdf"]["score"] is None
    assert by_link[NSE + "o.pdf"]["score"] == 0.62 and NSE + "x.pdf" not in by_link      # no words to read: left out, never a made-up 0
