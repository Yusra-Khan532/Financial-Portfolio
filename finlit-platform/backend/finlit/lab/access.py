"""Who may open the Trading Lab (founder, 25 Nov 2026: "only admin can give access to anybody").

Access is not part of any plan. An administrator grants it to a named member (Console > Trading Lab access), optionally until a date, and can remove
it at any time; every grant and removal is written to the audit log. Administrators always have access. Every Lab API route depends on `lab_ctx`,
so a member without an active grant gets 403 `lab_access_required` from the server, whatever the page shows.

Routes:
  GET    /api/lab/access                 the signed-in member's own access (visitors: none) and its options
  GET    /api/admin/lab/grants           every grant, newest first, with the member's email and name
  PUT    /api/admin/lab/grants           grant (or change) by email: {email, days?, note?, signals?}
  PATCH  /api/admin/lab/grants/{uid}     change one grant's options: {signals}
  DELETE /api/admin/lab/grants/{uid}     remove

Signals (founder, 25 Nov 2026): a per-grant switch, off by default, that only an administrator turns on. With it, the member's Lab shows the
trade-signal tools (Buy/Hold/Sell rating, trader's plan, trade-size debate), which do NOT follow FinLit's describe-only wording: an internal test the
founder asked for, kept to named members. Administrators always have it. Signal routes depend on `signals_ctx`; nothing else on the site changes.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..auth.routes import admin_ctx, fail, ip_of, secure_ctx
from ..auth.service import Ctx, audit, current, forget_cached

FEATURE = "trading_lab"
SIGNALS = "trading_lab_signals"   # the name /api/auth/me lists when the grant's signals switch is on
router = APIRouter()

ACTIVE = "SELECT expires_at, options FROM user_grants WHERE user_id = $1 AND feature = $2 AND (expires_at IS NULL OR expires_at > now())"


def _opts(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    try:
        import json
        v = json.loads(raw) if raw else {}
        return v if isinstance(v, dict) else {}
    except (TypeError, ValueError):
        return {}


async def grant_of(pool, user_id: Optional[str], feature: str = FEATURE) -> Optional[Dict[str, Any]]:
    """The member's active grant, or None (no grant, expired, or no account)."""
    if not user_id:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(ACTIVE, user_id, feature)
    return None if row is None else {"expiresAt": row["expires_at"].isoformat() if row["expires_at"] else None, "signals": bool(_opts(row["options"]).get("signals"))}


async def features_of(pool, ctx: Ctx) -> list:
    """The granted features named in /api/auth/me (administrators: all of them), so the website knows which menu entries to show."""
    if not ctx.authed:
        return []
    if ctx.role == "admin":
        return [FEATURE, SIGNALS]
    try:
        g = await grant_of(pool, ctx.user_id)
        return [] if g is None else [FEATURE, SIGNALS] if g["signals"] else [FEATURE]
    except Exception:   # a missing table (before the migration) or a database hiccup never breaks sign-in; the Lab routes still check
        return []


async def lab_ctx(request: Request, ctx: Ctx = Depends(secure_ctx)) -> Ctx:
    """Every Trading Lab route: an administrator, or a member with an active grant."""
    if ctx.role == "admin":
        return ctx
    if await grant_of(request.app.state.store.pool, ctx.user_id) is None:
        raise fail(403, "lab_access_required", "The Trading Lab is open by invitation. Ask the FinLit team for access.")
    return ctx


async def signals_ctx(request: Request, ctx: Ctx = Depends(secure_ctx)) -> Ctx:
    """Every trade-signal route (rating, trader's plan, trade-size debate): an administrator, or a member whose active grant has signals on."""
    if ctx.role == "admin":
        return ctx
    g = await grant_of(request.app.state.store.pool, ctx.user_id)
    if g is None:
        raise fail(403, "lab_access_required", "The Trading Lab is open by invitation. Ask the FinLit team for access.")
    if not g["signals"]:
        raise fail(403, "signals_off", "Trade signals are switched off for your account. An administrator can switch them on.")
    return ctx


@router.get("/api/lab/access")
async def my_access(request: Request) -> Dict[str, Any]:
    ctx = await current(request)
    if not ctx.authed:
        return {"access": False, "reason": "sign_in", "expiresAt": None, "signals": False}
    if ctx.role == "admin":
        return {"access": True, "reason": "admin", "expiresAt": None, "signals": True}
    g = await grant_of(request.app.state.store.pool, ctx.user_id)
    return {"access": g is not None, "reason": "granted" if g else "not_granted", "expiresAt": g["expiresAt"] if g else None, "signals": bool(g and g["signals"])}


class GrantBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    days: Optional[int] = Field(default=None, ge=1, le=3650)   # None = until removed
    note: Optional[str] = Field(default=None, max_length=200)
    signals: bool = False                                       # trade-signal tools for this member (off by default)


class OptionsBody(BaseModel):
    signals: bool


@router.get("/api/admin/lab/grants")
async def list_grants(request: Request, ctx: Ctx = Depends(admin_ctx)) -> Dict[str, Any]:
    async with request.app.state.store.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT g.user_id, u.email, u.name, u.plan, g.granted_at, g.expires_at, g.note, g.options, b.email AS by_email FROM user_grants g "
            "JOIN users u ON u.id = g.user_id LEFT JOIN users b ON b.id = g.granted_by WHERE g.feature = $1 ORDER BY g.granted_at DESC LIMIT 500", FEATURE)
    now = datetime.now(timezone.utc)
    return {"grants": [{"userId": str(r["user_id"]), "email": r["email"], "name": r["name"], "plan": r["plan"], "grantedAt": r["granted_at"].isoformat(),
                        "expiresAt": r["expires_at"].isoformat() if r["expires_at"] else None, "note": r["note"], "grantedBy": r["by_email"],
                        "active": r["expires_at"] is None or r["expires_at"] > now, "signals": bool(_opts(r["options"]).get("signals"))} for r in rows]}


@router.put("/api/admin/lab/grants")
async def put_grant(request: Request, body: GrantBody, ctx: Ctx = Depends(admin_ctx)) -> Dict[str, Any]:
    email = body.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise fail(422, "invalid_email", "Enter the member's email address.")
    until = datetime.now(timezone.utc) + timedelta(days=body.days) if body.days else None
    note = (body.note or "").strip() or None
    pool = request.app.state.store.pool
    async with pool.acquire() as conn:
        uid = await conn.fetchval("SELECT id FROM users WHERE lower(email) = $1", email)
        if uid is None:
            raise fail(404, "no_such_member", "No account uses that email. The person must sign up first, then you can give access.")
        await conn.execute(
            "INSERT INTO user_grants (user_id, feature, granted_by, expires_at, note, options) VALUES ($1, $2, $3, $4, $5, jsonb_build_object('signals', $6::boolean)) "
            "ON CONFLICT (user_id, feature) DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = now(), expires_at = EXCLUDED.expires_at, "
            "note = EXCLUDED.note, options = user_grants.options || EXCLUDED.options", uid, FEATURE, ctx.user_id, until, note, body.signals)
    await forget_cached(request.app, str(uid))
    await audit(pool, ctx.user_id, "lab_access_granted", str(uid), ip_of(request), email=email, days=body.days, note=note, signals=body.signals)
    return {"status": "saved", "userId": str(uid), "expiresAt": until.isoformat() if until else None, "signals": body.signals}


@router.patch("/api/admin/lab/grants/{uid}")
async def patch_grant(request: Request, uid: str, body: OptionsBody, ctx: Ctx = Depends(admin_ctx)) -> Dict[str, Any]:
    """Switch one member's trade signals on or off without touching the rest of the grant."""
    if not re.fullmatch(r"[0-9a-f-]{36}", uid):
        raise fail(400, "invalid_id")
    pool = request.app.state.store.pool
    async with pool.acquire() as conn:
        done = await conn.fetchval("UPDATE user_grants SET options = options || jsonb_build_object('signals', $3::boolean) "
                                   "WHERE user_id = $1 AND feature = $2 RETURNING user_id", uid, FEATURE, body.signals)
    if done is None:
        raise fail(404, "not_found", "That member has no Trading Lab access. Give access first.")
    await forget_cached(request.app, uid)
    await audit(pool, ctx.user_id, "lab_signals_on" if body.signals else "lab_signals_off", uid, ip_of(request))
    return {"status": "saved", "signals": body.signals}


@router.delete("/api/admin/lab/grants/{uid}")
async def delete_grant(request: Request, uid: str, ctx: Ctx = Depends(admin_ctx)) -> Dict[str, Any]:
    if not re.fullmatch(r"[0-9a-f-]{36}", uid):
        raise fail(400, "invalid_id")
    pool = request.app.state.store.pool
    async with pool.acquire() as conn:
        gone = await conn.fetchval("DELETE FROM user_grants WHERE user_id = $1 AND feature = $2 RETURNING user_id", uid, FEATURE)
    if gone is None:
        raise fail(404, "not_found", "That member has no Trading Lab access.")
    await forget_cached(request.app, uid)
    await audit(pool, ctx.user_id, "lab_access_removed", uid, ip_of(request))
    return {"status": "removed"}
