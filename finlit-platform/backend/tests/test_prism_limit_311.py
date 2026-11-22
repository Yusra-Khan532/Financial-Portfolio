"""Task #311 (developer file 21, Prism page row 1): the Prism page shows the member's own daily allowance of reports, from the same table the report
feed enforces (prism.PLAN_REPORTS: 10 on Gold and Equity Portfolio, 20 on Platinum), never a fixed "20 a day" for everyone."""
import pytest

from finlit.auth.routes import prism_reports_per_day
from finlit.auth.service import ANON, VIEW_AS_HEADER, Ctx
from finlit.prism import PLAN_REPORTS
from test_auth import app, make_admin, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401


@pytest.mark.parametrize("plan,n", [("gold", 10), ("equity_portfolio", 10), ("platinum", 20), ("silver", None), ("basic", None)])
def test_each_plan_gets_its_own_number(plan, n):
    assert prism_reports_per_day(Ctx(user_id="1", role="investor", plan=plan)) == n == PLAN_REPORTS.get(plan)


def test_visitor_and_admin_have_no_number():
    assert prism_reports_per_day(ANON) is None
    assert prism_reports_per_day(Ctx(user_id="1", role="admin", plan="gold")) is None
    assert prism_reports_per_day(Ctx(user_id="1", role="admin", plan="gold", extra={"view_as": "gold"})) == 10


@pytest.mark.integration
async def test_auth_me_carries_the_number(app):  # noqa: F811
    gold = await signed_in(app, "g311@example.com", plan="gold")
    assert (await gold.get("/api/auth/me")).json()["prismReportsPerDay"] == 10
    silver = await signed_in(app, "s311@example.com", plan="silver")
    assert (await silver.get("/api/auth/me")).json()["prismReportsPerDay"] is None
    admin = await make_admin(app)
    assert (await admin.get("/api/auth/me")).json()["prismReportsPerDay"] is None
    assert (await admin.get("/api/auth/me", headers={VIEW_AS_HEADER: "gold"})).json()["prismReportsPerDay"] == 10
