"""POST /api/ask: Ask FinLit AI, answered from FinLit's own data and streamed as Server-Sent Events. GET /api/ask/quota: the questions left this month.

Silver and Gold members only (Basic keeps the instant listed questions); each plan has a monthly allowance (finlit/ask/quota.py). Events, in order:
    meta    {"limit", "used", "left", "resets", "cached"}      once, first
    status  {"text"}                                         while FinLit data is being read ("Reading the ratios (TCS)")
    text    {"text"}                                         pieces of the answer as they are written
    replace {"text"}                                         the answer so far is replaced (withdrawn as advice-like)
    done    {"disclaimer", "sources"}                        last, on success
    error   {"code", "text"}                                 last, on failure (the question is given back when nothing was written)
Without ANTHROPIC_API_KEY the endpoint answers 503 "not_enabled" and the panel keeps its instant listed answers."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from datetime import datetime
from typing import Any, AsyncIterator, Dict, List, Literal, Optional

import anthropic
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..auth.entitlements import sees_all
from ..auth.routes import fail, ip_of, limit, secure_ctx
from ..auth.service import VIEW_AS_HEADER, Ctx, cookie_name, current
from . import companies, quota, service, tools
from .gateway import MemberGateway

log = logging.getLogger("finlit.ask")
router = APIRouter(prefix="/api/ask", tags=["ask"])
CACHE_SECONDS = 30 * 60          # the same first question on the same page and plan is answered from Redis within 30 minutes
NO_STORE = {"Cache-Control": "no-store"}
SYMBOL = re.compile(r"^[A-Z0-9&\-\.]{1,20}$")
_clients: Dict[str, anthropic.AsyncAnthropic] = {}


class Turn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AskIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=2, max_length=500)
    history: List[Turn] = Field(default_factory=list, max_length=12)
    symbol: Optional[str] = Field(default=None, max_length=20)

    @field_validator("symbol")
    @classmethod
    def sym(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        v = v.strip().upper()
        if not SYMBOL.fullmatch(v):
            raise ValueError("bad symbol")
        return v

    @field_validator("history")
    @classmethod
    def alternate(cls, v: List[Turn]) -> List[Turn]:
        v = v[-6:]                                   # the last three exchanges are enough context, and keep each question fast
        while v and v[0].role != "user":
            v = v[1:]
        for a, b in zip(v, v[1:]):
            if a.role == b.role:
                raise ValueError("history must alternate user and assistant")
        if v and v[-1].role != "assistant":
            raise ValueError("history must end with an answer")
        return v


def client_for(key: str) -> anthropic.AsyncAnthropic:
    """One client per key (it keeps its connections open: the next question starts faster)."""
    c = _clients.get(key)
    if c is None:
        c = _clients[key] = anthropic.AsyncAnthropic(api_key=key, max_retries=1, timeout=35.0)
    return c


def plan_key(ctx: Ctx) -> str:
    return "admin" if sees_all(ctx) else ctx.plan


def sse(event: str, data: Dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


def cache_key(model: str, ctx: Ctx, body: AskIn) -> str:
    q = re.sub(r"\s+", " ", body.question.strip().lower())
    h = hashlib.sha256(f"{q}|{body.symbol or ''}".encode()).hexdigest()[:32]
    return f"ask:answer:{model}:{plan_key(ctx)}:{datetime.now(service.IST).date().isoformat()}:{h}"


@router.get("/quota")
async def get_quota(request: Request):
    """Whether written answers are switched on, and, for a signed-in member, the questions left this month (a visitor learns only the first)."""
    st = request.app.state.settings
    ctx = await current(request)
    if not ctx.authed:
        return JSONResponse({"enabled": bool(st.anthropic_api_key), "signedIn": False}, headers=NO_STORE)
    m = quota.month_of()
    n = await quota.used(request.app.state.store.pool, ctx.user_id, m)
    return JSONResponse({"enabled": bool(st.anthropic_api_key), "signedIn": True, "plan": ctx.plan, **quota.status(quota.allowance(ctx), n, m)}, headers=NO_STORE)


@router.post("")
async def ask(request: Request, body: AskIn, ctx: Ctx = Depends(secure_ctx)):   # signed in, Origin + CSRF checked
    st = request.app.state.settings
    if not st.anthropic_api_key:
        raise fail(503, "not_enabled", "FinLit AI's written answers are not switched on yet. The listed questions still answer at once.")
    store = request.app.state.store
    month, cap = quota.month_of(), quota.allowance(ctx)
    if cap <= 0:      # Basic (founder, 17 Nov 2026): the listed questions only, which answer in the browser and never reach this endpoint
        raise fail(403, "plan_required", "Written answers from FinLit AI are part of the Silver plan (50 a month) and the Gold plan (100 a month). "
                   "The listed questions answer at once on every plan.", plan="silver")
    await limit(request, "ask:min", f"u:{ctx.user_id}", 6, 60)          # at most 6 questions a minute, whatever the allowance

    # A repeated first question (same words, same page, same plan, same day) is answered from the cache, at once and without using the allowance.
    key = cache_key(st.ask_model, ctx, body) if not body.history else None
    hit = None
    if key:
        try:
            hit = await store.redis.get(key)
        except Exception:
            hit = None
    if hit is not None:
        n = await quota.used(store.pool, ctx.user_id, month)
        cached = json.loads(hit)

        async def replay() -> AsyncIterator[bytes]:
            yield sse("meta", {**quota.status(cap, n, month), "cached": True})
            yield sse("text", {"text": cached["text"]})
            yield sse("done", {"disclaimer": service.DISCLAIMER, "sources": cached.get("tools", [])})
        return StreamingResponse(replay(), media_type="text/event-stream", headers={**NO_STORE, "X-Accel-Buffering": "no"})

    n = await quota.take(store.pool, ctx.user_id, cap, month)
    if n is None:
        nxt = quota.next_month(month).strftime("%d %b %Y")
        more = " Gold includes 100 a month." if ctx.plan == "silver" else ""
        raise fail(429, "quota_used", f"You have used all {cap} FinLit AI questions of your plan this month. They renew on {nxt}.{more}",
                   **quota.status(cap, cap, month))

    gw = MemberGateway(request.app, request.headers.get("host", "localhost"), ip_of(request), cookie_name=cookie_name(st),
                       cookie=request.cookies.get(cookie_name(st), ""), csrf=ctx.csrf or "",
                       origin=request.headers.get("origin") or f"{request.url.scheme}://{request.headers.get('host', 'localhost')}",
                       view_as=request.headers.get(VIEW_AS_HEADER))

    async def run() -> AsyncIterator[bytes]:
        out: List[bytes] = []
        wrote = False

        async def emit(event: str, data: Dict[str, Any]) -> None:
            nonlocal wrote
            if event in ("text", "replace"):
                wrote = True
            out.append(sse(event, data))

        yield sse("meta", {**quota.status(cap, n, month), "cached": False})
        # The company of the page, and the companies the question names: their cards first (what the page shows, as this member), so the model
        # starts with the facts whatever the wording, and answers in one round.
        want = ([body.symbol] if body.symbol else []) + await companies.named_in(gw, body.question, 2, skip=body.symbol)
        cards: List[str] = []
        for sym in want[:2]:
            yield sse("status", {"text": tools.label("get_company_card", {"symbol": sym})})
        got = await asyncio.gather(*(tools.run(gw, "get_company_card", {"symbol": s}) for s in want[:2]))
        cards = [g["text"] for g in got if not g["error"]]
        card = "\n".join(cards) or None
        messages = service.build_messages([t.model_dump() for t in body.history], body.question.strip(), body.symbol, plan_key(ctx), card)
        result: Optional[Dict[str, Any]] = None
        err: Optional[Dict[str, str]] = None
        task = asyncio.create_task(service.answer(client_for(st.anthropic_api_key), st.ask_model, gw, messages, emit))
        try:
            while not task.done() or out:
                while out:
                    yield out.pop(0)
                if not task.done():
                    await asyncio.wait({task}, timeout=0.05)
            result = task.result()
        except anthropic.RateLimitError:
            err = {"code": "busy", "text": "FinLit AI is answering many questions right now. Please try again in a minute."}
        except anthropic.AuthenticationError:
            log.error("ask: the Anthropic API key was refused")
            err = {"code": "not_configured", "text": "FinLit AI is not set up correctly right now. The team has been told."}
        except (anthropic.APIConnectionError, anthropic.APITimeoutError):
            err = {"code": "unavailable", "text": "FinLit AI could not be reached just now. Please try again."}
        except anthropic.APIStatusError as e:
            log.warning("ask: API status %s", e.status_code)
            err = {"code": "unavailable", "text": "FinLit AI could not answer just now. Please try again."}
        except Exception:
            log.exception("ask: failed")
            err = {"code": "failed", "text": "This answer could not be put together just now. Please try again."}
        finally:
            await gw.aclose()
        while out:
            yield out.pop(0)
        if result is not None and result["stop"] == "refusal" and not result["text"]:
            err = {"code": "declined", "text": "FinLit AI cannot answer that question. Try asking about a company's figures, a fund or the market."}
        if result is not None and result["stop"] == "deadline" and not result["text"]:
            err = {"code": "slow", "text": "This answer took too long. Please ask again, or ask about one thing at a time."}
        if err:
            if not wrote:
                try:
                    await quota.give_back(store.pool, ctx.user_id, month)
                except Exception:
                    log.exception("ask: could not give the question back")
            yield sse("error", err)
            return
        assert result is not None
        await record(store, result)
        personal = any(t.startswith("get_my_") for t in result["tools"])
        if key and result["text"] and result["stop"] in ("end_turn",) and not personal:
            try:
                await store.redis.set(key, json.dumps({"text": result["text"], "tools": result["tools"]}), ex=CACHE_SECONDS)
            except Exception:
                pass
        yield sse("done", {"disclaimer": service.DISCLAIMER, "sources": sorted(set(result["tools"]))})

    return StreamingResponse(run(), media_type="text/event-stream", headers={**NO_STORE, "X-Accel-Buffering": "no"})


async def record(store, result: Dict[str, Any]) -> None:
    """Daily totals for the Console (questions, tokens): the cost of FinLit AI can be watched without the provider's dashboard."""
    try:
        day = datetime.now(service.IST).date().isoformat()
        k = f"ask:usage:{day}"
        u = result["usage"]
        async with store.redis.pipeline(transaction=False) as p:
            p.hincrby(k, "questions", 1)
            for f in ("input", "output", "cache_read", "cache_write", "web_searches"):
                p.hincrby(k, f, int(u.get(f, 0)))
            p.expire(k, 120 * 86400)
            await p.execute()
    except Exception:   # nosec B110 - a counter must never break an answer
        pass
