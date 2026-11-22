"""Task #329, "Found while checking" (developer file 29, 23 Nov 2026): an issue 15 or more days past its close with no listing date leaves "Closed,
listing soon" and shows as "Not listed". One rule for the IPO calendar (/api/ipos, ipoapi.settle) and the list of every IPO (/api/ipos/history,
ipoapi.status). Four issues closed in September had read "listing soon" for two months."""
from datetime import date, timedelta

import pytest

from test_integration import make_settings, store  # noqa: F401  (fixtures)

from finlit import ipoapi

TODAY = date(2026, 11, 23)


def cal(name, close, status="closed", listing=None):
    return {"id": len(name), "name": name, "status": status, "openDate": str(close - timedelta(days=4)), "closeDate": str(close), "listingDate": listing}


def test_fifteen_days_past_the_close_with_no_listing_date_is_not_listed():
    items = [cal("Acme Universal Safezone9", date(2026, 9, 30)), cal("Crystal Crop Protection", date(2026, 11, 20), listing="2026-11-26"),
             cal("Fourteen Days", TODAY - timedelta(days=14)), cal("Fifteen Days", TODAY - timedelta(days=15)),
             cal("Late But Dated", date(2026, 9, 1), listing="2026-12-01"), cal("Listed Co", date(2026, 9, 1), status="listed", listing="2026-09-05"),
             cal("Open Co", TODAY + timedelta(days=1), status="open")]
    out = {i["name"]: i["status"] for i in ipoapi.settle(items, TODAY)}
    assert out == {"Acme Universal Safezone9": "not_listed", "Crystal Crop Protection": "closed", "Fourteen Days": "closed", "Fifteen Days": "not_listed",
                   "Late But Dated": "closed", "Listed Co": "listed", "Open Co": "open"}


def test_the_list_of_every_ipo_uses_the_same_rule():
    assert ipoapi.NOT_LISTED_AFTER == 15
    assert ipoapi.status(False, False, date(2026, 11, 3), date(2026, 11, 8), TODAY) == "not_listed"                 # 15 days
    assert ipoapi.status(False, False, date(2026, 11, 4), date(2026, 11, 9), TODAY) == "closed"                     # 14 days
    assert ipoapi.status(False, False, date(2026, 9, 1), date(2026, 9, 3), TODAY, "2026-12-01") == "closed"         # a listing date is set
    assert ipoapi.status(True, False, date(2026, 9, 1), date(2026, 9, 3), TODAY) == "listed"


@pytest.mark.integration
async def test_the_calendar_moves_a_stale_closed_issue_out_of_listing_soon(store):  # noqa: F811
    from test_auth import new_client
    from finlit.api import create_app
    app = create_app(make_settings(), store=store)
    d = date.today()
    async with app.router.lifespan_context(app):
        async with app.state.store.pool.acquire() as conn:
            await conn.execute("DELETE FROM ipos")
            for name, close, listing in [("Stale Closed Ltd", d - timedelta(days=40), None), ("Fresh Closed Ltd", d - timedelta(days=2), None),
                                         ("Dated Closed Ltd", d - timedelta(days=20), d + timedelta(days=2))]:
                await conn.execute("INSERT INTO ipos (name, kind, open_date, close_date, listing_date) VALUES ($1, 'sme', $2, $3, $4)", name, close - timedelta(days=3), close, listing)
        async with new_client(app) as anon:
            rows = {r["name"]: r["status"] for r in (await anon.get("/api/ipos")).json()["ipos"]}
        async with app.state.store.pool.acquire() as conn:
            await conn.execute("DELETE FROM ipos")
    assert rows == {"Stale Closed Ltd": "not_listed", "Fresh Closed Ltd": "closed", "Dated Closed Ltd": "closed"}
