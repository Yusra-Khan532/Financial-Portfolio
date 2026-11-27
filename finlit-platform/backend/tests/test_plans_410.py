"""Task #410 (owner, 27 Nov 2026): the plans on sale are the landing page's (Free, Mutual Fund + ETF, Equity Portfolio, the combined plan, Gold, Platinum).
Each plan opens an access tier for the gates written before (entitlements.TIER_OF); Platinum-only tools check the plan itself; the one-area plans open
only their area. Migration 145 moved every stored plan to the new names without anyone losing access."""
import pytest

from finlit.auth.entitlements import (AREAS, KEY_RANK, LEGACY_TO_KEY, PLAN_KEYS, TIER_OF, has, in_area, is_platinum, plan_key, sees_all,
                                      tier_of)
from finlit.auth.service import VIEW_AS_HEADER, Ctx, admin_view
from test_auth import app, make_admin, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401


def ctx(key: str, role: str = "investor") -> Ctx:
    return Ctx(user_id="1", role=role, plan=tier_of(key), plan_key=key)


def test_every_plan_has_a_tier_an_area_set_and_a_rank():
    assert PLAN_KEYS == ("free", "mfetf", "equity", "combined", "gold", "platinum")
    for k in PLAN_KEYS:
        assert k in TIER_OF and k in AREAS and k in KEY_RANK
    assert [tier_of(k) for k in PLAN_KEYS] == ["basic", "silver", "silver", "silver", "gold", "gold"]


@pytest.mark.parametrize("stored,key", [("free", "free"), ("basic", "free"), ("silver", "combined"), ("gold", "gold"), ("platinum", "platinum"),
                                        ("", "free"), (None, "free"), ("nonsense", "free"), ("PLATINUM", "platinum")])
def test_a_stored_value_reads_as_a_plan(stored, key):
    assert plan_key(stored) == key


def test_no_one_loses_a_tier_gate_when_moved_by_the_migration():
    # migration 145: basic -> free, silver and gold -> platinum. Every gate an old plan passed, the new plan passes.
    moved = {"basic": "free", "silver": "platinum", "gold": "platinum"}
    for old, new in moved.items():
        for need in ("basic", "silver", "gold"):
            if has(old, need):
                assert has(tier_of(new), need), (old, new, need)
        assert in_area(ctx(new), "mf") or old == "basic"
        assert in_area(ctx(new), "eq") or old == "basic"
    assert LEGACY_TO_KEY == {"basic": "free", "silver": "combined"}       # read-time only; the migration moves real rows to platinum


def test_platinum_only_tools_open_on_platinum_and_for_an_admin_only():
    assert is_platinum(ctx("platinum"))
    for k in ("free", "mfetf", "equity", "combined", "gold"):
        assert not is_platinum(ctx(k)), k
    assert is_platinum(Ctx(user_id="1", role="admin", plan="gold", plan_key="platinum"))
    assert is_platinum(admin_view(Ctx(user_id="1", role="admin", plan="basic", plan_key="free"), None))      # an admin sees every plan's features


@pytest.mark.parametrize("key,mf,eq", [("free", False, False), ("mfetf", True, False), ("equity", False, True), ("combined", True, True),
                                       ("gold", True, True), ("platinum", True, True)])
def test_the_one_area_plans_open_only_their_area(key, mf, eq):
    assert in_area(ctx(key), "mf") is mf and in_area(ctx(key), "eq") is eq


def test_an_admin_preview_takes_the_new_plans_and_reads_old_bookmarks():
    a = admin_view(Ctx(user_id="1", role="admin", plan="gold", plan_key="platinum"), "MFETF")
    assert a.plan_key == "mfetf" and a.plan == "silver" and not sees_all(a) and a.extra["view_as"] == "mfetf"
    assert admin_view(Ctx(user_id="1", role="admin"), "basic").plan_key == "free"
    assert admin_view(Ctx(user_id="1", role="admin"), "silver").plan_key == "combined"
    b = admin_view(Ctx(user_id="1", role="admin"), None)
    assert b.plan == "gold" and b.plan_key == "platinum" and sees_all(b)
    assert Ctx(user_id="1", plan="silver", plan_key="equity").public()["plan"] == "equity"


@pytest.mark.integration
async def test_the_gates_follow_the_plan_on_the_server(app):  # noqa: F811
    eq = await signed_in(app, "eq@example.com", plan="equity")
    me = (await eq.get("/api/auth/me")).json()
    assert me["plan"] == "equity" and me["tier"] == "silver" and me["user"]["plan"] == "equity"
    assert (await eq.get("/api/me/mf-portfolio")).status_code == 403                           # funds are not in Equity Portfolio
    r = await eq.put("/api/me/watchlist", json={"lists": [{"id": "a", "name": "A", "symbols": ["TCS"]}]})
    assert r.status_code != 403, r.text                                                        # watchlists are
    mf = await signed_in(app, "mf@example.com", plan="mfetf")
    assert (await mf.get("/api/me/mf-portfolio")).status_code == 200
    r = await mf.put("/api/me/watchlist", json={"lists": [{"id": "a", "name": "A", "symbols": ["TCS"]}]})
    assert r.status_code == 403 and r.json()["detail"]["plan"] == "equity"
    gold = await signed_in(app, "g@example.com", plan="gold")
    r = await gold.get("/api/stress/TCS/page")
    assert r.status_code == 403 and r.json()["detail"]["plan"] == "platinum"                  # Stress Lab is a Platinum tool
    plat = await signed_in(app, "p@example.com", plan="platinum")
    assert (await plat.get("/api/stress/TCS/page")).status_code != 403
    assert (await plat.get("/api/me/mf-portfolio")).status_code == 200


@pytest.mark.integration
async def test_the_migration_moves_old_plans_without_loss_and_keeps_the_old_name(app):  # noqa: F811
    pool = app.state.store.pool
    async with pool.acquire() as conn:
        for e, p in (("b@example.com", "basic"), ("s@example.com", "silver"), ("o@example.com", "gold")):
            await conn.execute("INSERT INTO users (email, name, password_hash, plan) VALUES ($1, 'x', 'x', 'free')", e)
            await conn.execute("UPDATE users SET plan = $2, plan_legacy = NULL WHERE email = $1", e, p)
        sql = open(__file__.replace("tests/test_plans_410.py", "finlit/migrations/145_plans_410.sql")).read()
        await conn.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check")
        await conn.execute(sql)
        await conn.execute(sql)                                                                # safe to run twice
        got = {r["email"]: (r["plan"], r["plan_legacy"]) for r in await conn.fetch("SELECT email, plan, plan_legacy FROM users WHERE email LIKE '_@example.com'")}
    assert got["b@example.com"] == ("free", "basic")
    assert got["s@example.com"] == ("platinum", "silver")
    assert got["o@example.com"] == ("platinum", "gold")


@pytest.mark.integration
async def test_a_plan_request_names_a_new_plan(app):  # noqa: F811
    m = await signed_in(app, "r@example.com", plan="free")
    assert (await m.post("/api/me/plan-request", json={"plan": "platinum"})).status_code == 201
    assert (await m.post("/api/me/plan-request", json={"plan": "silver"})).status_code == 201       # an old page's request is read as Gold
    async with app.state.store.pool.acquire() as conn:
        plans = sorted(r["plan"] for r in await conn.fetch("SELECT r.plan FROM plan_requests r JOIN users u ON u.id = r.user_id WHERE u.email = 'r@example.com'"))
    assert plans == ["gold", "platinum"]
    c = await signed_in(app, "c@example.com", plan="combined")
    assert (await c.post("/api/me/plan-request", json={"plan": "equity"})).status_code == 409       # already included
    admin = await make_admin(app)
    me = (await admin.get("/api/auth/me", headers={VIEW_AS_HEADER: "gold"})).json()
    assert me["plan"] == "gold" and me["user"]["viewAs"] == "gold"
