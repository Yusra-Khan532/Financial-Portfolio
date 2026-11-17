"""Ask FinLit AI: each member's monthly allowance of questions (founder, 17 Nov 2026: Silver 50 and Gold 100 a month; Basic has none:
Basic members keep the instant listed questions only).

A question is taken from the allowance when its answer starts (`take`), atomically, so two tabs cannot both use the last one. If the answer could not be
given at all (the AI service failed before writing anything), it is given back (`give_back`). The month is the calendar month in India (IST)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from ..auth.entitlements import LIMITS, sees_all

IST = ZoneInfo("Asia/Kolkata")


def month_of(now: Optional[datetime] = None) -> date:
    d = (now or datetime.now(IST)).astimezone(IST).date()
    return d.replace(day=1)


def next_month(m: date) -> date:
    return date(m.year + (m.month == 12), m.month % 12 + 1, 1)


def allowance(ctx) -> int:
    """Questions a month for this member's plan. An administrator counts as Gold (or as the plan being previewed with "view as")."""
    plan = "gold" if sees_all(ctx) else ctx.plan
    return int(LIMITS.get(plan, LIMITS["basic"])["ai_questions_per_month"])


async def used(pool, user_id: str, month: date) -> int:
    async with pool.acquire() as conn:
        n = await conn.fetchval("SELECT used FROM ai_usage WHERE user_id = $1 AND month = $2", user_id, month)
    return int(n or 0)


async def take(pool, user_id: str, limit: int, month: date) -> Optional[int]:
    """Uses one question and returns how many are now used, or None when the allowance is already used up (nothing changes then)."""
    if limit <= 0:
        return None
    async with pool.acquire() as conn:
        n = await conn.fetchval(
            "INSERT INTO ai_usage (user_id, month, used) VALUES ($1, $2, 1) "
            "ON CONFLICT (user_id, month) DO UPDATE SET used = ai_usage.used + 1, updated_at = now() WHERE ai_usage.used < $3 "
            "RETURNING used", user_id, month, limit)
    return int(n) if n is not None else None


async def give_back(pool, user_id: str, month: date) -> None:
    async with pool.acquire() as conn:
        await conn.execute("UPDATE ai_usage SET used = GREATEST(used - 1, 0), updated_at = now() WHERE user_id = $1 AND month = $2", user_id, month)


def status(limit: int, n: int, month: date) -> Dict[str, Any]:
    return {"limit": limit, "used": min(n, limit), "left": max(limit - n, 0), "resets": next_month(month).isoformat()}
