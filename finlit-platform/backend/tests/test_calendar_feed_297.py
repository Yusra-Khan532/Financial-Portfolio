"""Task #297: each member's private calendar address (IPO opening, closing and listing days, and the results dates of their own companies) and the
"Add to Google Calendar" link in their sign-up account (finlit/calendar_feed.py)."""
import json
from datetime import date, datetime, timedelta, timezone

from finlit import calendar_feed as cf
from finlit.calendars import today_ist
from test_auth import anon, app, signed_in  # noqa: F401  (fixtures and the sign-in helper)
from test_integration import ingested, make_settings, store  # noqa: F401  (fixtures)

STAMP = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)


def test_text_is_escaped_and_long_lines_fold_without_splitting_a_character():
    assert cf.esc("Price band ₹100, lot 10; a\\b\nnext") == "Price band ₹100\\, lot 10\\; a\\\\b\\nnext"
    line = "DESCRIPTION:" + "₹" * 60
    folded = cf.fold(line)
    parts = folded.split("\r\n ")
    assert "".join(parts) == line and all(len(p.encode("utf-8")) <= 75 for p in parts)


def test_ipo_days_and_results_become_all_day_events_with_stable_ids():
    ipo = {"id": 7, "name": "Acme Solar", "kind": "sme", "open_date": date(2026, 11, 24), "close_date": date(2026, 11, 26), "listing_date": date(2026, 12, 1),
           "price_low": 95, "price_high": 100, "lot_size": 1200, "issue_size_cr": 52.5}
    evs = cf.ipo_events([ipo], "https://finlitventures.com", STAMP)
    summaries = [next(x for x in e if x.startswith("SUMMARY:")) for e in evs]
    assert summaries == ["SUMMARY:IPO opens: Acme Solar (SME)", "SUMMARY:IPO closes: Acme Solar (SME)", "SUMMARY:Listing: Acme Solar (SME)"]
    assert "DTSTART;VALUE=DATE:20261124" in evs[0] and "DTEND;VALUE=DATE:20261125" in evs[0] and "UID:ipo-7-open@finlit" in evs[0]
    desc = next(x for x in evs[0] if x.startswith("DESCRIPTION:"))
    assert "Price band ₹95 to ₹100" in desc and "Lot 1200 shares" in desc and "Issue size ₹52 cr" in desc and "not investment advice" in desc
    assert "URL:https://finlitventures.com/ipo/7" in evs[0]
    res = cf.result_events([{"symbol": "INFY", "company": "Infosys Ltd", "item_date": date(2026, 12, 10)}] * 2, "https://finlitventures.com", STAMP)
    assert len(res) == 1 and "SUMMARY:Results: Infosys" in res[0] and "UID:result-INFY-20261210@finlit" in res[0]
    cal = cf.calendar(evs + res)
    assert cal.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") and cal.endswith("END:VCALENDAR\r\n") and cal.count("BEGIN:VEVENT") == 4
    assert "X-WR-CALNAME:FinLit: IPOs and your results" in cal


def test_the_google_link_subscribes_in_the_sign_up_account():
    got = cf.links("https://finlitventures.com", "tok_123", "member@gmail.com")
    assert got["url"] == "https://finlitventures.com/api/calendar/tok_123.ics" and got["webcal"] == "webcal://finlitventures.com/api/calendar/tok_123.ics"
    assert got["google"] == ("https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Ffinlitventures.com%2Fapi%2Fcalendar%2Ftok_123.ics"
                             "&authuser=member%40gmail.com")


async def test_a_member_gets_an_address_google_can_read_and_can_replace_it(app, anon):  # noqa: F811
    store = app.state.store
    today = today_ist()
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM ipos WHERE name LIKE 'Cal297 %'")
        await conn.execute("INSERT INTO ipos (name, kind, open_date, close_date, listing_date, price_low, price_high, lot_size) VALUES "
                           "('Cal297 Soon Ltd', 'mainboard', $1, $2, $3, 100, 110, 130), ('Cal297 Long Ago Ltd', 'mainboard', $4, $5, $6, 10, 11, 1000)",
                           today + timedelta(days=3), today + timedelta(days=5), today + timedelta(days=10),
                           today - timedelta(days=200), today - timedelta(days=198), today - timedelta(days=190))
        await conn.execute("DELETE FROM feed_items WHERE dedupe LIKE 'cal297%'")
        await conn.execute("INSERT INTO feed_items (kind, title, symbol, company, item_date, auto, dedupe) VALUES "
                           "('result', 'Board meeting for results', 'CALA', 'Cal A Industries Ltd', $1, true, 'cal297a'), "
                           "('result', 'Board meeting for results', 'CALB', 'Cal B Ltd', $1, true, 'cal297b')", today + timedelta(days=7))
    assert (await anon.get("/api/me/calendar")).status_code == 401
    m = await signed_in(app, "cal297@gmail.com", plan="basic")
    a = (await m.get("/api/me/calendar")).json()
    assert a["email"] == "cal297@gmail.com" and a["url"].endswith(".ics") and "authuser=cal297%40gmail.com" in a["google"]
    assert (await m.get("/api/me/calendar")).json()["url"] == a["url"]                     # the same address each time
    async with store.pool.acquire() as conn:                                                   # the member follows CALA (portfolio), not CALB
        uid = await conn.fetchval("SELECT id FROM users WHERE email = 'cal297@gmail.com'")
        await conn.execute("INSERT INTO user_state (user_id, portfolio, watchlist) VALUES ($1, $2::jsonb, $3::jsonb) ON CONFLICT (user_id) DO UPDATE SET portfolio = $2::jsonb, watchlist = $3::jsonb",
                           uid, json.dumps({"holdings": [{"id": "1", "symbol": "CALA", "qty": 1, "price": 1}]}), json.dumps({"lists": []}))
    path = "/api/calendar/" + a["url"].rsplit("/", 1)[1]
    r = await anon.get(path)                                                                   # Google reads it without a sign-in
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    body = r.text
    assert "SUMMARY:IPO opens: Cal297 Soon Ltd" in body and "SUMMARY:Listing: Cal297 Soon Ltd" in body
    assert "Cal297 Long Ago" not in body                                                      # outside the window
    assert "SUMMARY:Results: Cal A Industries" in body and "Cal B" not in body                 # only the member's own companies
    async with store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT last_read_at FROM calendar_feeds WHERE user_id = $1", uid) is not None
    b = (await m.post("/api/me/calendar/reset")).json()
    assert b["url"] != a["url"]
    assert (await anon.get(path)).status_code == 404                                           # the old address stops working
    assert (await anon.get("/api/calendar/" + b["url"].rsplit("/", 1)[1])).status_code == 200
    assert (await anon.get("/api/calendar/bad.ics")).status_code == 404
