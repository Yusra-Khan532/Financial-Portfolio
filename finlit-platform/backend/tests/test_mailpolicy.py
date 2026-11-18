"""The owner, 19 Nov 2026: the site's mail allowance (about 100 a day on the free plan) is kept for the account emails (password reset, sign-up
verification). Every alert reaches the member in the site's bell only, and the weekly digest is not sent (finlit/mailpolicy.py)."""

from datetime import date, timedelta

import pytest

from finlit import mailpolicy
from test_alerts import body, run, set_price
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, store  # noqa: F401

pytestmark = pytest.mark.integration


async def alert_mails(app, to):
    """Every email to `to` other than the account emails (sign-up verification, password reset)."""
    async with app.state.store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT subject FROM outbox WHERE to_email = $1", to)
    return [r["subject"] for r in rows if not any(w in r["subject"] for w in ("Confirm your FinLit email", "Reset your FinLit password", "already"))]


async def bell(app, to, kind):
    async with app.state.store.pool.acquire() as conn:
        return await conn.fetchval("SELECT count(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.kind = $2", to, kind)


def test_alert_emails_are_off_by_default():
    assert mailpolicy.ALERT_EMAILS is False


async def test_a_rule_alert_with_email_chosen_lands_in_the_bell_and_sends_no_email(app):
    c = await signed_in(app, "mp-rule@example.com")
    await set_price(app, 1100)
    assert (await c.post("/api/alerts", json=body(channels=["app", "email"]))).status_code == 201
    await run(app)
    await set_price(app, 1250)
    assert await run(app) == 1
    assert await bell(app, "mp-rule@example.com", "alert") == 1 and await alert_mails(app, "mp-rule@example.com") == []
    await c.aclose()


async def test_watchlist_target_and_screen_alerts_are_in_the_bell_only(app):
    from finlit.alerts import check_alerts
    from finlit.screens import check_screens
    pool, mailer = app.state.store.pool, app.state.mailer
    c = await signed_in(app, "mp-wl@example.com", plan="gold")
    wl = {"lists": [{"id": "main", "name": "x", "symbols": ["RELIANCE"]}], "meta": {"RELIANCE": {"target": 1200, "added": 1}}}
    assert (await c.put("/api/me/watchlist", json=wl)).status_code == 200
    assert (await c.put("/api/me/screens", json={"screens": [{"name": "Tell me", "state": {"ranges": {"pe": {"max": 30}}}, "notify": True}]})).status_code == 200
    async with pool.acquire() as conn:
        await conn.execute("UPDATE scores SET price = 1100, pe = 50, metrics = jsonb_set(coalesce(metrics, '{}'::jsonb), '{pe}', '50') WHERE symbol = 'RELIANCE'")
    await check_alerts(pool, mailer, "http://test"); await check_screens(pool, mailer, "http://test")
    async with pool.acquire() as conn:
        await conn.execute("UPDATE scores SET price = 1250, pe = 20, metrics = jsonb_set(coalesce(metrics, '{}'::jsonb), '{pe}', '20') WHERE symbol = 'RELIANCE'")
    assert await check_alerts(pool, mailer, "http://test") == 1            # still counted: the bell notification is the alert
    assert await check_screens(pool, mailer, "http://test") == 1
    assert await bell(app, "mp-wl@example.com", "alert") == 1 and await bell(app, "mp-wl@example.com", "screen") == 1
    assert await alert_mails(app, "mp-wl@example.com") == []
    await c.aclose()


async def test_the_weekly_digest_sends_nothing_even_when_switched_on(app):
    from finlit.digest import send_digests
    pool = app.state.store.pool
    c = await signed_in(app, "mp-dg@example.com", plan="silver")
    await c.put("/api/me/watchlist", json={"lists": [{"id": "m", "name": "x", "symbols": ["RELIANCE"]}], "meta": {}})
    async with pool.acquire() as conn:
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, item_date, period) VALUES ('result', 'Board meeting', 'RELIANCE', 'Reliance', $1, 'Q2 FY27')", date.today() + timedelta(days=2))
    await c.put("/api/me/prefs", json={"palette": "gold", "digest": True})
    assert await send_digests(pool, app.state.mailer, "http://test") == 0
    assert await alert_mails(app, "mp-dg@example.com") == []
    await c.aclose()


async def test_fund_score_alert_emails_are_not_sent():
    from finlit.mfscore.scorehist import send_mails

    class Boom:
        async def send(self, *a, **k):
            raise AssertionError("no email may be sent")
    assert await send_mails([{"to": "x@example.com", "title": "t", "body": "b", "link": "/funds/1"}], Boom(), "http://test") == 0
