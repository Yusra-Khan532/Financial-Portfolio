"""Sessions and the per-request identity. A session is a random token in an HttpOnly cookie; only its SHA-256 hash is stored.

Lookups hit Redis first (about 0.2 ms) and fall back to Postgres, so identity adds almost nothing to a stock-page request.
"""

from __future__ import annotations

import json
import logging
import secrets
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from starlette.requests import Request

from ..config import Settings
from .crypto import token_hash

from .entitlements import VIEW_AS, plan_key, tier_of

log = logging.getLogger("finlit.auth")


def cookie_name(settings: Settings) -> str:
    return "__Host-fl_session" if settings.cookie_secure else "fl_session"


@dataclass
class Ctx:
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    role: str = "visitor"
    plan: str = "basic"            # the access TIER (basic, silver, gold) every gate written before task #410 checks
    plan_key: str = "free"         # task #410: the plan itself (free, mfetf, equity, combined, gold, platinum); entitlements.TIER_OF gives its tier
    verified: bool = False
    mfa_ok: bool = False
    totp: bool = False
    csrf: str = ""
    extra: Dict[str, Any] = field(default_factory=dict)

    @property
    def authed(self) -> bool:
        return self.user_id is not None

    def public(self) -> Dict[str, Any]:
        out = {"id": self.user_id, "email": self.email, "name": self.name, "role": self.role, "plan": self.plan_key, "tier": self.plan,
               "verified": self.verified, "mfa": self.totp, "mfaOk": self.mfa_ok}
        if self.role == "admin":
            out["viewAs"] = self.extra.get("view_as")     # None: every plan's features; else the plan being previewed
        return out


ANON = Ctx()


def _row_to_ctx(row: Any, token: str) -> Ctx:
    return Ctx(user_id=str(row["user_id"]), session_id=str(row["id"]), email=row["email"], name=row["name"], role=row["role"],
               plan=tier_of(plan_key(row["plan"])), plan_key=plan_key(row["plan"]), verified=row["email_verified_at"] is not None, mfa_ok=row["mfa_ok"],
               totp=row["totp_enabled_at"] is not None, csrf=row["csrf"])


def _ctx_json(c: Ctx) -> str:
    return json.dumps({"u": c.user_id, "s": c.session_id, "e": c.email, "n": c.name, "r": c.role, "p": c.plan, "k": c.plan_key, "v": c.verified,
                       "m": c.mfa_ok, "t": c.totp, "c": c.csrf})


def _ctx_from_json(raw: bytes) -> Ctx:
    d = json.loads(raw)
    key = plan_key(d.get("k") or d["p"])          # a session cached before task #410 has only the old plan name
    return Ctx(user_id=d["u"], session_id=d["s"], email=d["e"], name=d["n"], role=d["r"], plan=tier_of(key), plan_key=key, verified=d["v"],
               mfa_ok=d["m"], totp=d["t"], csrf=d["c"])


def session_limits(settings: Settings, role: str) -> tuple[timedelta, timedelta]:
    if role == "admin":
        return timedelta(hours=settings.admin_session_hours), timedelta(hours=1)
    return timedelta(days=settings.session_days), timedelta(days=settings.session_idle_days)


async def create_session(app, user: Any, ip: str, ua: str, mfa_ok: bool) -> tuple[str, str]:
    settings: Settings = app.state.settings
    raw = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    absolute, _ = session_limits(settings, user["role"])
    async with app.state.store.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sessions (user_id, token_hash, csrf, mfa_ok, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            user["id"], token_hash(raw), csrf, mfa_ok, datetime.now(timezone.utc) + absolute, ip[:64], ua[:200])
    return raw, csrf


async def lookup(app, token: str) -> Ctx:
    settings: Settings = app.state.settings
    redis, pool = app.state.store.redis, app.state.store.pool
    th = token_hash(token)
    try:
        cached = await redis.get(f"sess:{th}")
        if cached:
            return _ctx_from_json(cached)
    except Exception:  # Redis hiccup: fall through to the database
        log.warning("session cache unavailable")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT s.id, s.user_id, s.csrf, s.mfa_ok, s.expires_at, s.last_seen_at, u.email, u.name, u.role, u.email_verified_at,
                       u.totp_enabled_at, CASE WHEN u.plan_until IS NOT NULL AND u.plan_until < now() THEN 'basic' ELSE u.plan END AS plan
                FROM sessions s JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'""", th)
        if row is None:
            return ANON
        _, idle = session_limits(settings, row["role"])
        now = datetime.now(timezone.utc)
        if now - row["last_seen_at"] > idle:
            await conn.execute("DELETE FROM sessions WHERE id = $1", row["id"])
            return ANON
        if now - row["last_seen_at"] > timedelta(minutes=10):
            await conn.execute("UPDATE sessions SET last_seen_at = now() WHERE id = $1", row["id"])
    ctx = _row_to_ctx(row, token)
    try:
        async with redis.pipeline(transaction=False) as pipe:
            pipe.set(f"sess:{th}", _ctx_json(ctx), ex=120)
            pipe.sadd(f"usess:{ctx.user_id}", th)
            pipe.expire(f"usess:{ctx.user_id}", 86400)
            await pipe.execute()
    except Exception:
        log.warning("session cache write failed")
    return ctx


async def current(request: Request) -> Ctx:
    """Who is calling. Cached on the request; anonymous when there is no valid session."""
    cached = getattr(request.state, "ctx", None)
    if cached is not None:
        return cached
    settings: Settings = request.app.state.settings
    token = request.cookies.get(cookie_name(settings))
    ctx = ANON
    if token and 20 <= len(token) <= 100:
        ctx = await lookup(request.app, token)
    if ctx.role == "admin":
        ctx = admin_view(ctx, request.headers.get(VIEW_AS_HEADER))
    request.state.ctx = ctx
    return ctx


VIEW_AS_HEADER = "x-finlit-view-as"


def admin_view(ctx: Ctx, view_as: Optional[str]) -> Ctx:
    """An administrator sees every plan's features (founder, 14 Nov 2026): served as Gold, with entitlements.sees_all() true. With the "view as"
    header (basic, silver or gold) the request is served exactly as that plan instead, so the admin can check what each plan sees. Only an
    administrator's request is changed; for anyone else the header means nothing."""
    want = (view_as or "").strip().lower()
    if want in VIEW_AS:
        key = plan_key(want)                         # task #410: a new plan (free … platinum); an old "basic" / "silver" bookmark reads as Free / Combined
        return replace(ctx, plan=tier_of(key), plan_key=key, extra={**ctx.extra, "view_as": key})
    return replace(ctx, plan="gold", plan_key="platinum")


async def forget_cached(app, user_id: str, only_hash: Optional[str] = None) -> None:
    """Drop cached identities after a change (logout, plan change, password change) so it takes effect at once."""
    redis = app.state.store.redis
    try:
        if only_hash:
            await redis.delete(f"sess:{only_hash}")
            await redis.srem(f"usess:{user_id}", only_hash)
            return
        hashes = await redis.smembers(f"usess:{user_id}")
        if hashes:
            await redis.delete(*[f"sess:{h.decode() if isinstance(h, bytes) else h}" for h in hashes])
        await redis.delete(f"usess:{user_id}")
    except Exception:
        log.warning("could not clear session cache")


async def revoke_all(app, user_id: str, keep_session: Optional[str] = None) -> None:
    async with app.state.store.pool.acquire() as conn:
        if keep_session:
            await conn.execute("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", user_id, keep_session)
        else:
            await conn.execute("DELETE FROM sessions WHERE user_id = $1", user_id)
    await forget_cached(app, user_id)


async def audit(pool, actor: Optional[str], action: str, target: Optional[str] = None, ip: str = "", **meta: Any) -> None:
    async with pool.acquire() as conn:
        await conn.execute("INSERT INTO audit_events (actor_id, action, target, ip, meta) VALUES ($1, $2, $3, $4, $5::jsonb)",
                           actor, action, target, ip[:64], json.dumps(meta))


UNVERIFIED_DAYS = 7          # an account whose email was never confirmed is removed after this many days (it cannot sign in; it only holds the mobile)
UNVERIFIED_BATCH = 500       # accounts per delete statement, each its own commit


async def prune_unverified_accounts(conn, days: int = UNVERIFIED_DAYS, timeout: Optional[float] = None) -> int:
    """Delete accounts that never confirmed their email, made more than `days` days ago, with nothing else on them; returns how many went.

    One account per mobile (migration 138) means a sign-up with a made-up email and someone else's mobile would hold that number for ever: such an
    account cannot sign in (sign-in needs a confirmed email) and nobody can confirm it. Kept whatever their age: administrators, accounts an
    administrator gave a plan to or switched off, and any with a sign-in, a session, saved state, a plan request, an authenticator or a bootstrap
    password. Rows in other tables go with the account (their foreign keys are ON DELETE CASCADE or SET NULL, as when a member deletes their account).
    Run by the nightly `prune` job (Store.prune)."""
    cond = ("u.email_verified_at IS NULL AND u.created_at < now() - make_interval(days => $1::int) AND u.role = 'investor' AND u.plan IN ('basic', 'free') "
            "AND u.plan_until IS NULL AND u.status = 'active' AND u.last_login_at IS NULL AND u.totp_enabled_at IS NULL AND u.bootstrap_pw_hash IS NULL "
            "AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id) AND NOT EXISTS (SELECT 1 FROM user_state us WHERE us.user_id = u.id) "
            "AND NOT EXISTS (SELECT 1 FROM plan_requests p WHERE p.user_id = u.id)")
    total = 0
    while True:
        # the conditions are checked again on the row being deleted, so an account confirmed while this runs is kept
        n = int((await conn.execute(
            f"DELETE FROM users u WHERE u.id IN (SELECT u.id FROM users u WHERE {cond} LIMIT {UNVERIFIED_BATCH}) AND {cond}",  # nosec B608 - fixed SQL
            days, timeout=timeout)).split()[-1])
        total += n
        if n < UNVERIFIED_BATCH:
            break
    if total:
        await conn.execute("INSERT INTO audit_events (actor_id, action, target, ip, meta) VALUES (NULL, 'unverified_accounts_removed', NULL, '', $1::jsonb)",
                           json.dumps({"count": total, "days": days}), timeout=timeout)
        log.info("removed %d accounts that never confirmed their email (older than %d days)", total, days)
    return total
