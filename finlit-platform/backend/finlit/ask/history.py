"""Task #349 PR 2: the member's FinLit AI history (ask/memory.py, table ai_question_memory).

    GET    /api/ask/history?limit=50   the member's questions, newest first: {"items": [{id, askedAt, topic, subjectKind, subjectId, intent, question}],
                                       "count", "remember", "retentionDays", "maxRows"}
    DELETE /api/ask/history            clears all of them: {"status": "cleared", "deleted"}
    DELETE /api/ask/history/{id}       deletes one: {"status": "deleted"}, 404 when it is not this member's

Signed in only (secure_ctx: a DELETE also needs the Origin and CSRF checks of every other change). Every query is scoped to the member's user_id."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from ..auth.routes import fail, limit, secure_ctx
from ..auth.service import Ctx
from . import memory

router = APIRouter(prefix="/api/ask", tags=["ask"])
NO_STORE = {"Cache-Control": "no-store"}


@router.get("/history")
async def get_history(request: Request, limit_: int = Query(50, alias="limit", ge=1, le=memory.MAX_ROWS), ctx: Ctx = Depends(secure_ctx)):
    pool = request.app.state.store.pool
    body = await memory.list(pool, ctx.user_id, limit_)
    return JSONResponse({**body, "remember": await memory.remembers(pool, ctx.user_id), "retentionDays": memory.RETENTION_DAYS,
                         "maxRows": memory.MAX_ROWS}, headers=NO_STORE)


@router.delete("/history")
async def clear_history(request: Request, ctx: Ctx = Depends(secure_ctx)):
    await limit(request, "ask:hist", f"u:{ctx.user_id}", 30, 60)
    n = await memory.clear(request.app.state.store.pool, ctx.user_id)
    return JSONResponse({"status": "cleared", "deleted": n}, headers=NO_STORE)


@router.delete("/history/{row_id}")
async def delete_one(request: Request, row_id: int, ctx: Ctx = Depends(secure_ctx)):
    await limit(request, "ask:hist", f"u:{ctx.user_id}", 30, 60)
    if not 1 <= row_id < 2 ** 63 or not await memory.delete(request.app.state.store.pool, ctx.user_id, row_id):
        raise fail(404, "not_found", "That question is not in your FinLit AI history.")
    return JSONResponse({"status": "deleted"}, headers=NO_STORE)
