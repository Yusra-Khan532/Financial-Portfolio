"""Task #366 (Chinmay, 24 Nov 2026): "for each answer provided in the chatbot provide the copy option and thumbs up and down option ... where every AI
is being used provide a thumbs up and down option and store the feedback in the backend".

POST /api/ai-feedback stores one vote (+1 or -1) on one piece of AI-written text: an Ask FinLit AI answer, the FinLit Prism AI summary, a concall
summary or a company brief. A member has one vote per answer (sending again changes it, rating 0 withdraws it); a visitor's vote is stored without any
personal detail. The question and the start of the answer are kept with the vote so the team can read what was liked or not.
GET /api/admin/ai-feedback (administrators) gives the totals by feature and the latest votes, thumbs down first.

Rules enforced here, whatever the website does: our own pages only (Origin); a signed-in member also proves it with the CSRF token; text is cleaned and
cut; per-address and per-member limits."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field

from . import forum_rules as rules
from .auth.routes import NO_STORE, admin_ctx, fail, ip_of, limit, origin_allowed
from .auth.service import current

router = APIRouter(prefix="/api")
SURFACES = ("ask", "prism_summary", "concall_summary", "company_brief")


class VoteIn(BaseModel):
    surface: Literal["ask", "prism_summary", "concall_summary", "company_brief"]
    ref: str = Field(min_length=1, max_length=300)
    rating: Literal[-1, 0, 1]
    question: Optional[str] = Field(default=None, max_length=2000)
    excerpt: Optional[str] = Field(default=None, max_length=20000)


def _out(body: Any, status: int = 200) -> Response:
    return Response(content=json.dumps(body, default=str), media_type="application/json", headers=NO_STORE, status_code=status)


def _visitor(request: Request) -> str:
    """An hourly salted hash of the caller's address: enough to stop one visitor voting many times, never the address itself."""
    salt = os.environ.get("SESSION_SECRET", "finlit") + str(int(time.time() // 3600))
    return hashlib.sha256((salt + ip_of(request)).encode()).hexdigest()[:24]


@router.post("/ai-feedback", status_code=201)
async def vote(request: Request, body: VoteIn):
    if not origin_allowed(request):
        raise fail(403, "bad_origin", "This request did not come from the FinLit website.")
    ctx = await current(request)
    if ctx.authed and not hmac.compare_digest(request.headers.get("x-csrf-token", ""), ctx.csrf or ""):
        raise fail(403, "bad_csrf", "Your session needs to be refreshed. Reload the page and try again.")
    await limit(request, "aifb_ip", ip_of(request), 60, 3600)
    if ctx.authed:
        await limit(request, "aifb_user", ctx.user_id, 200, 86400)
    ref = rules.clean_text(body.ref)[:300]
    if not ref:
        raise fail(422, "bad_ref", "We could not tell which answer this is about.")
    question = rules.clean_text(body.question or "")[:500] or None if body.surface == "ask" else None
    excerpt = rules.clean_text(body.excerpt or "")[:1500] or None
    pool = request.app.state.store.pool
    async with pool.acquire() as conn:
        if ctx.authed:
            if body.rating == 0:
                await conn.execute("DELETE FROM ai_feedback WHERE user_id = $1 AND surface = $2 AND ref = $3", ctx.user_id, body.surface, ref)
                return _out({"status": "withdrawn"})
            row = await conn.fetchval(
                """INSERT INTO ai_feedback (surface, ref, rating, question, excerpt, user_id, plan) VALUES ($1, $2, $3, $4, $5, $6, $7)
                   ON CONFLICT (user_id, surface, ref) WHERE user_id IS NOT NULL
                   DO UPDATE SET rating = EXCLUDED.rating, question = coalesce(EXCLUDED.question, ai_feedback.question),
                                 excerpt = coalesce(EXCLUDED.excerpt, ai_feedback.excerpt), updated_at = now() RETURNING id""",
                body.surface, ref, body.rating, question, excerpt, ctx.user_id, ctx.plan)
            return _out({"status": "saved", "id": row}, 201)
        if body.rating == 0:
            return _out({"status": "withdrawn"})
        who = _visitor(request)
        dup = await conn.fetchval("SELECT id FROM ai_feedback WHERE visitor = $1 AND surface = $2 AND ref = $3", who, body.surface, ref)
        if dup:
            await conn.execute("UPDATE ai_feedback SET rating = $2, updated_at = now() WHERE id = $1", dup, body.rating)
            return _out({"status": "saved", "id": dup}, 201)
        row = await conn.fetchval("INSERT INTO ai_feedback (surface, ref, rating, question, excerpt, visitor) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                                  body.surface, ref, body.rating, question, excerpt, who)
    return _out({"status": "saved", "id": row}, 201)


@router.get("/admin/ai-feedback")
async def admin_list(request: Request, ctx=Depends(admin_ctx), surface: str = Query("", max_length=20), days: int = Query(30, ge=1, le=365),
                     limit_rows: int = Query(100, ge=1, le=500, alias="limit")):
    """Totals by feature (up and down) over the last `days`, and the latest votes, thumbs down first."""
    pool = request.app.state.store.pool
    where, args = ["created_at > now() - make_interval(days => $1)"], [days]
    if surface in SURFACES:
        args.append(surface)
        where.append(f"surface = ${len(args)}")
    w = " AND ".join(where)
    async with pool.acquire() as conn:
        totals = await conn.fetch(f"SELECT surface, count(*) FILTER (WHERE rating = 1) AS up, count(*) FILTER (WHERE rating = -1) AS down "   # nosec B608 - fixed fragments, bound values
                                  f"FROM ai_feedback WHERE {w} GROUP BY surface ORDER BY surface", *args)
        args.append(limit_rows)
        rows = await conn.fetch(f"SELECT id, surface, ref, rating, question, excerpt, plan, user_id IS NOT NULL AS member, created_at, updated_at "   # nosec B608 - fixed fragments, bound values
                                f"FROM ai_feedback WHERE {w} ORDER BY rating ASC, updated_at DESC LIMIT ${len(args)}", *args)
    return _out({"totals": [dict(r) for r in totals], "items": [dict(r) for r in rows]})
