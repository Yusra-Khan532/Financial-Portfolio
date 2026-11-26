"""Trading Lab access (founder, 25 Nov 2026: "only admin can give access to anybody"): finlit/lab/access.py and migration 143.

What must hold: a member has no access until an administrator grants it, whatever the plan (Gold too); only an administrator (with the authenticator
code) can grant, list or remove; a grant can end on a date and an ended grant gives no access; /api/auth/me names the feature only when granted, so
the website shows the menu entry only then; a grant by an email with no account says so; every change is in the audit log; administrators always
have access."""
import time

import pytest

from finlit.auth import crypto
from test_auth import ORIGIN, app, login, new_client, signed_in, signup  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401

pg = pytest.mark.integration


async def admin_with_mfa(app, email):
    c = new_client(app)
    await signup(app, c, email)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("UPDATE users SET role = 'admin', plan = 'gold' WHERE lower(email) = $1", email)
    r = await login(c, email)
    c.headers.update({**ORIGIN, "X-CSRF-Token": r.json()["csrf"]})
    secret = (await c.post("/api/me/mfa/setup")).json()["secret"]
    assert (await c.post("/api/me/mfa/enable", json={"code": crypto.totp_code(secret, int(time.time()) // 30)})).status_code == 200
    return c


@pg
async def test_no_access_until_an_admin_grants_it_whatever_the_plan(app):
    gold = await signed_in(app, "gold-member@example.com", plan="gold")
    assert (await gold.get("/api/lab/access")).json() == {"access": False, "reason": "not_granted", "expiresAt": None, "signals": False}
    assert (await gold.get("/api/auth/me")).json()["features"] == []
    async with new_client(app) as anon:
        assert (await anon.get("/api/lab/access")).json()["reason"] == "sign_in"
        assert (await anon.get("/api/auth/me")).json()["features"] == []
    admin = await admin_with_mfa(app, "boss@example.com")
    assert (await admin.get("/api/lab/access")).json()["reason"] == "admin"           # administrators always have access
    assert (await admin.get("/api/auth/me")).json()["features"] == ["trading_lab", "trading_lab_signals"]
    r = await admin.put("/api/admin/lab/grants", json={"email": "Gold-Member@example.com", "note": "beta tester"})
    assert r.status_code == 200 and r.json()["expiresAt"] is None
    assert (await gold.get("/api/lab/access")).json() == {"access": True, "reason": "granted", "expiresAt": None, "signals": False}
    assert (await gold.get("/api/auth/me")).json()["features"] == ["trading_lab"]
    listed = (await admin.get("/api/admin/lab/grants")).json()["grants"]
    assert [(g["email"], g["note"], g["active"], g["grantedBy"]) for g in listed] == [("gold-member@example.com", "beta tester", True, "boss@example.com")]
    uid = listed[0]["userId"]
    assert (await admin.delete(f"/api/admin/lab/grants/{uid}")).json() == {"status": "removed"}
    assert (await gold.get("/api/lab/access")).json()["access"] is False
    assert (await admin.delete(f"/api/admin/lab/grants/{uid}")).status_code == 404
    async with app.state.store.pool.acquire() as conn:
        acts = [r["action"] for r in await conn.fetch("SELECT action FROM audit_events WHERE action LIKE 'lab_access_%' ORDER BY at, id")]
    assert acts == ["lab_access_granted", "lab_access_removed"]


@pg
async def test_only_an_administrator_can_grant_list_or_remove(app):
    member = await signed_in(app, "curious@example.com", plan="gold")
    assert (await member.put("/api/admin/lab/grants", json={"email": "curious@example.com"})).status_code == 403
    assert (await member.get("/api/admin/lab/grants")).status_code == 403
    assert (await member.get("/api/lab/access")).json()["access"] is False
    # an administrator without the authenticator code cannot use admin tools either
    plain = await signed_in(app, "half-admin@example.com")
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("UPDATE users SET role = 'admin' WHERE lower(email) = 'half-admin@example.com'")
    r = await login(plain, "half-admin@example.com")
    plain.headers.update({**ORIGIN, "X-CSRF-Token": r.json()["csrf"]})
    assert (await plain.put("/api/admin/lab/grants", json={"email": "curious@example.com"})).json()["detail"]["status"] == "mfa_required"


@pg
async def test_a_grant_can_end_and_an_unknown_email_says_so(app):
    admin = await admin_with_mfa(app, "chief@example.com")
    member = await signed_in(app, "trial@example.com")
    r = await admin.put("/api/admin/lab/grants", json={"email": "trial@example.com", "days": 30})
    assert r.status_code == 200 and r.json()["expiresAt"]
    assert (await member.get("/api/lab/access")).json()["expiresAt"] == r.json()["expiresAt"]
    async with app.state.store.pool.acquire() as conn:   # the month has passed
        await conn.execute("UPDATE user_grants SET expires_at = now() - interval '1 minute'")
    assert (await member.get("/api/lab/access")).json()["access"] is False
    assert (await member.get("/api/auth/me")).json()["features"] == []
    assert (await admin.get("/api/admin/lab/grants")).json()["grants"][0]["active"] is False
    nobody = await admin.put("/api/admin/lab/grants", json={"email": "nobody@example.com"})
    assert nobody.status_code == 404 and "sign up first" in nobody.json()["detail"]["detail"]
    assert (await admin.put("/api/admin/lab/grants", json={"email": "not-an-email"})).status_code == 422


@pg
async def test_signals_are_off_by_default_switched_per_member_by_an_administrator_and_enforced(app):
    """Founder, 25 Nov 2026: a switch on the grant shows the trade-signal tools (Buy/Hold/Sell rating, trader's plan, trade-size debate), an
    internal test outside FinLit's describe-only wording; off by default, only an administrator turns it on, and the server enforces it."""
    from fastapi import Depends
    from finlit.lab.access import signals_ctx
    probe = app.router  # a throwaway signal route stands in for the signal tools still to come
    @app.get("/api/lab/_probe_signals")
    async def _probe(ctx=Depends(signals_ctx)):
        return {"ok": True}
    del probe
    admin = await admin_with_mfa(app, "lead@example.com")
    member = await signed_in(app, "tester@example.com")
    assert (await member.get("/api/lab/_probe_signals")).json()["detail"]["status"] == "lab_access_required"
    await admin.put("/api/admin/lab/grants", json={"email": "tester@example.com"})
    assert (await member.get("/api/lab/access")).json()["signals"] is False
    assert (await member.get("/api/auth/me")).json()["features"] == ["trading_lab"]
    assert (await member.get("/api/lab/_probe_signals")).json()["detail"]["status"] == "signals_off"
    uid = (await admin.get("/api/admin/lab/grants")).json()["grants"][0]["userId"]
    assert (await admin.patch(f"/api/admin/lab/grants/{uid}", json={"signals": True})).json() == {"status": "saved", "signals": True}
    assert (await member.get("/api/lab/access")).json()["signals"] is True
    assert (await member.get("/api/auth/me")).json()["features"] == ["trading_lab", "trading_lab_signals"]
    assert (await member.get("/api/lab/_probe_signals")).json() == {"ok": True}
    assert (await admin.get("/api/admin/lab/grants")).json()["grants"][0]["signals"] is True
    assert (await admin.get("/api/lab/_probe_signals")).json() == {"ok": True}          # administrators always have signals
    # a member cannot switch it on for themselves
    assert (await member.patch(f"/api/admin/lab/grants/{uid}", json={"signals": True})).status_code == 403
    assert (await admin.patch(f"/api/admin/lab/grants/{uid}", json={"signals": False})).json()["signals"] is False
    assert (await member.get("/api/lab/_probe_signals")).json()["detail"]["status"] == "signals_off"
    # granted with signals on in one go
    other = await signed_in(app, "second@example.com")
    assert (await admin.put("/api/admin/lab/grants", json={"email": "second@example.com", "signals": True})).json()["signals"] is True
    assert (await other.get("/api/lab/access")).json()["signals"] is True
    assert (await admin.patch("/api/admin/lab/grants/00000000-0000-0000-0000-000000000000", json={"signals": True})).status_code == 404
    async with app.state.store.pool.acquire() as conn:
        acts = [r["action"] for r in await conn.fetch("SELECT action FROM audit_events WHERE action LIKE 'lab_signals_%' ORDER BY at, id")]
    assert acts == ["lab_signals_on", "lab_signals_off"]


def test_the_lab_is_never_in_the_search_index():
    """The Trading Lab is open by invitation only: /lab and every page under it are private (no index), so search engines never list them."""
    from finlit import seo
    for path in ("lab", "lab/flow", "lab/flow/anything"):
        assert seo.is_known(path) and seo.is_private(path), path
