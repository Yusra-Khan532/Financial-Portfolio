"""Task #365: GET /api/discovery/changes (the "What changed" block on Holdings, the MF and ETF portfolios, Watchlists and All my investments) carries
each row's sentiment, from feed_sentiment, in /api/feed's shape; a filing that is not scored gives null, never a made-up 0."""

import pytest

from test_auth import app, new_client  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: F401  (fixtures)

pytestmark = pytest.mark.integration
PDF = "https://nsearchives.nseindia.com/s365.pdf"


async def feed(conn, kind, title, days_ago, dedupe):
    return await conn.fetchval("INSERT INTO feed_items (kind, title, symbol, company, link, item_date, auto, dedupe) VALUES ($1, $2, 'RELIANCE', "
                               "'Reliance Industries', $3, current_date - $4::int, true, $5) RETURNING id", kind, title, PDF, days_ago, dedupe)


async def signal(conn, fid, event, title, days_ago):
    await conn.execute("INSERT INTO discovery_signals (feed_id, symbol, item_date, event, title, link) VALUES ($1, 'RELIANCE', current_date - $2::int, $3, $4, $5)",
                       fid, days_ago, event, title, PDF)


async def score(conn, fid, s):
    await conn.execute("INSERT INTO feed_sentiment (feed_id, score, pos, neu, neg, model) VALUES ($1, $2, 0, 0, 0, 'test') "
                       "ON CONFLICT (feed_id) DO UPDATE SET score = EXCLUDED.score", fid, s)


async def test_changes_carry_the_newest_filings_sentiment_or_null(app):
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM discovery_signals")
        await conn.execute("DELETE FROM feed_items WHERE dedupe LIKE 's365-%'")
        await conn.execute("DELETE FROM feed_sentiment WHERE feed_id NOT IN (SELECT id FROM feed_items)")   # rows other tests left behind
        await conn.execute("INSERT INTO discovery_companies (symbol, company, doc_link, status, primary_bucket) VALUES ('RELIANCE', 'Reliance Industries', $1, 'ok', "
                           "'Corporate Catalysts & Growth Signals') ON CONFLICT (symbol) DO UPDATE SET primary_bucket = EXCLUDED.primary_bucket", PDF)
        order = await feed(conn, "news", "Receipt of order worth Rs 450 crore from NHAI", 2, "s365-o")
        old_order = await feed(conn, "news", "Order worth Rs 90 crore", 30, "s365-o2")
        rating = await feed(conn, "news", "Credit rating downgraded to AA-", 5, "s365-r")
        fund = await feed(conn, "news", "Allotment of NCDs", 8, "s365-f")
        fund_doc = await feed(conn, "document", "Allotment of NCDs", 8, "s365-fd")   # the same filing stored as a document; only this copy is scored
        for fid, ev, t, d in ((order, "order", "Receipt of order worth Rs 450 crore from NHAI", 2), (old_order, "order", "Order worth Rs 90 crore", 30),
                              (rating, "rating", "Credit rating downgraded to AA-", 5), (fund, "fundraise", "Allotment of NCDs", 8),
                              (fund_doc, "fundraise", "Allotment of NCDs", 8)):
            await signal(conn, fid, ev, t, d)
        await score(conn, order, 0.734)
        await score(conn, old_order, -0.9)       # an older filing of the row: the row shows the newest one's score
        await score(conn, fund_doc, 0.04)
        await conn.execute("DELETE FROM feed_sentiment WHERE feed_id = $1", rating)   # the rating filing is not scored yet
    c = new_client(app)
    r = await c.get("/api/discovery/changes?symbols=RELIANCE")
    assert r.status_code == 200
    ev = r.json()["companies"][0]["ev"]
    assert ev["order"]["n"] == 2 and ev["order"]["snt"] == {"score": 0.73, "band": "clearly_positive"}
    assert ev["rating"]["snt"] is None                                         # not scored: null, and the page shows no chip
    assert ev["fundraise"]["n"] == 1 and ev["fundraise"]["snt"] == {"score": 0.04, "band": "neutral"}
    await c.aclose()
