"""An administrator sees every plan's features (founder, 14 Nov 2026): served as Gold whatever the stored plan, with entitlements.sees_all() true, and
with the "view as" header served exactly as Basic, Silver or Gold to check what each plan sees. The header means nothing for anyone else."""
import pytest

from finlit.auth.entitlements import sees_all
from finlit.auth.service import ANON, VIEW_AS_HEADER, Ctx, admin_view
from test_auth import app, make_admin, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401


def test_admin_view_without_a_preview_is_gold_and_sees_all():
    a = admin_view(Ctx(user_id="1", role="admin", plan="basic"), None)
    assert a.plan == "gold" and sees_all(a)
    assert admin_view(Ctx(user_id="1", role="admin", plan="basic"), "nonsense").plan == "gold"


@pytest.mark.parametrize("plan", ["basic", "silver", "gold"])
def test_a_preview_is_served_exactly_as_that_plan(plan):
    a = admin_view(Ctx(user_id="1", role="admin", plan="gold"), plan.upper())
    assert a.plan == plan and not sees_all(a) and a.extra["view_as"] == plan
    assert a.public()["viewAs"] == plan


def test_nobody_else_sees_all():
    assert not sees_all(ANON) and not sees_all(Ctx(user_id="1", role="investor", plan="gold"))
    assert "viewAs" not in Ctx(user_id="1", role="investor", plan="gold").public()




@pytest.mark.integration
async def test_me_and_a_plan_gate_follow_the_admin_view(app):  # noqa: F811
    admin = await make_admin(app)
    me = (await admin.get("/api/auth/me")).json()
    assert me["plan"] == "gold" and me["user"]["viewAs"] is None
    assert (await admin.get("/api/me/mf-portfolio")).status_code == 200           # a Silver page: open to an administrator
    me = (await admin.get("/api/auth/me", headers={VIEW_AS_HEADER: "basic"})).json()
    assert me["plan"] == "basic" and me["user"]["viewAs"] == "basic"
    r = await admin.get("/api/me/mf-portfolio", headers={VIEW_AS_HEADER: "basic"})
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_required"   # exactly what Basic sees
    member = await signed_in(app, "m@example.com", plan="basic")
    assert (await member.get("/api/auth/me", headers={VIEW_AS_HEADER: "gold"})).json()["plan"] == "basic"
    assert (await member.get("/api/me/mf-portfolio", headers={VIEW_AS_HEADER: "gold"})).status_code == 403
