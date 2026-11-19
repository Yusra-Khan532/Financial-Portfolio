"""POST /api/ask: Ask FinLit AI, answered from FinLit's own data and streamed as Server-Sent Events. GET /api/ask/quota: the questions left this month.

Silver and Gold members only (Basic keeps the instant listed questions); each plan has a monthly allowance (finlit/ask/quota.py). Events, in order:
    meta    {"limit", "used", "left", "resets", "cached"}      once, first
    status  {"text"}                                         while FinLit data is being read ("Reading the ratios (TCS)")
    text    {"text"}                                         pieces of the answer as they are written
    replace {"text"}                                         the answer so far is replaced (withdrawn as advice-like)
    done    {"disclaimer", "sources", "pages"}               last, on success; pages: the FinLit pages the answer read, [{"to", "label"}] (task #218)
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
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..auth.entitlements import sees_all
from ..auth.routes import fail, ip_of, limit, secure_ctx
from ..auth.service import VIEW_AS_HEADER, Ctx, cookie_name, current
from . import companies, pages, quota, routing, service, tools
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
    """kind "summary" (task #228): the AI summary of the FinLit Prism card of `symbol`, counted apart from the questions; the server writes its
    question (service.summary_question), so it takes no question and no history."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["question", "summary"] = "question"
    question: str = Field(default="", max_length=500)
    history: List[Turn] = Field(default_factory=list, max_length=12)
    symbol: Optional[str] = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def by_kind(self) -> "AskIn":
        if self.kind == "summary":
            if not self.symbol:
                raise ValueError("a summary needs the company's symbol")
            if self.history or self.question.strip():
                raise ValueError("a summary takes no question and no history")
        elif len(self.question.strip()) < 2:
            raise ValueError("question is too short")
        return self

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
    q = re.sub(r"\s+", " ", (service.summary_question(body.symbol or "") if body.kind == "summary" else body.question).strip().lower())
    h = hashlib.sha256(f"{q}|{body.symbol or ''}".encode()).hexdigest()[:32]
    kind = "summary:" if body.kind == "summary" else ""
    return f"ask:answer:{kind}{model}:{plan_key(ctx)}:{datetime.now(service.IST).date().isoformat()}:{h}"


@router.get("/quota")
async def get_quota(request: Request):
    """Whether written answers are switched on, and, for a signed-in member, the questions left this month (a visitor learns only the first)."""
    st = request.app.state.settings
    ctx = await current(request)
    if not ctx.authed:
        return JSONResponse({"enabled": bool(st.anthropic_api_key), "signedIn": False}, headers=NO_STORE)
    m, pool = quota.month_of(), request.app.state.store.pool
    n, ns = await quota.used(pool, ctx.user_id, m), await quota.used(pool, ctx.user_id, m, "summary")
    return JSONResponse({"enabled": bool(st.anthropic_api_key), "signedIn": True, "plan": ctx.plan, **quota.status(quota.allowance(ctx), n, m),
                         "summary": quota.status(quota.allowance(ctx, "summary"), ns, m)}, headers=NO_STORE)   # task #228: AI summaries, counted apart


@router.post("")
async def ask(request: Request, body: AskIn, ctx: Ctx = Depends(secure_ctx)):   # signed in, Origin + CSRF checked
    st = request.app.state.settings
    if not st.anthropic_api_key:
        raise fail(503, "not_enabled", "FinLit AI's written answers are not switched on yet. The listed questions still answer at once.")
    store = request.app.state.store
    kind = body.kind
    month, cap = quota.month_of(), quota.allowance(ctx, kind)
    question = service.summary_question(body.symbol or "") if kind == "summary" else body.question.strip()
    if cap <= 0 and kind == "summary":
        raise fail(403, "plan_required", "AI summaries from FinLit AI are part of the Silver and Gold plans (10 a month).", plan="silver")
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
        n = await quota.used(store.pool, ctx.user_id, month, kind)
        cached = json.loads(hit)

        async def replay() -> AsyncIterator[bytes]:
            yield sse("meta", {**quota.status(cap, n, month), "cached": True})
            yield sse("text", {"text": cached["text"]})
            yield sse("done", {"disclaimer": service.DISCLAIMER, "sources": cached.get("tools", []), "pages": cached.get("pages", [])})
        return StreamingResponse(replay(), media_type="text/event-stream", headers={**NO_STORE, "X-Accel-Buffering": "no"})

    n = await quota.take(store.pool, ctx.user_id, cap, month, kind)
    if n is None and kind == "summary":
        nxt = quota.next_month(month).strftime("%d %b %Y")
        raise fail(429, "quota_used", f"You have used all {cap} AI summaries of this month. They renew on {nxt}. Your FinLit AI questions are counted "
                   "separately.", **quota.status(cap, cap, month))
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
        named = await companies.named_in(gw, question, 2, skip=body.symbol) if kind == "question" else []
        want = ([body.symbol] if body.symbol else []) + named
        cards: List[str] = []
        for sym in want[:2]:
            yield sse("status", {"text": tools.label("get_company_card", {"symbol": sym})})
        # Task #255: a question about what a company's own document says (its investor presentation, call transcript, annual report, its guidance or
        # plans) reads that document now, beside the cards, so the answer always starts from the document. The company the question names comes
        # first, then the page's company; with no company there is nothing to read.
        # Task #254: the right document for the question (a call transcript, an annual report, a results filing or the presentation), and both when
        # the question compares two of them; the period the question names goes with it.
        doc_kinds = service.document_intents(question) if kind == "question" else []
        doc_sym = (named or ([body.symbol] if body.symbol else []) or [None])[0]
        doc_reads = [{"symbol": doc_sym, "document": k, "question": question[:200]} for k in doc_kinds] if doc_sym else []
        for d in doc_reads:
            yield sse("status", {"text": tools.label("read_company_document", d)})
        jobs = [tools.run(gw, "get_company_card", {"symbol": s}) for s in want[:2]] + [tools.run(gw, "read_company_document", d) for d in doc_reads]
        got = await asyncio.gather(*jobs)
        doc_res = got[len(got) - len(doc_reads):] if doc_reads else []
        got = got[: len(got) - len(doc_reads)]
        cards = [g["text"] for g in got if not g["error"]]
        card = "\n".join(cards) or None
        # Task #253: the kind of question (the economy, a company's financials, daily news, a term, valuation, rules, funds, a sector) decides which
        # of FinLit's tools come first and which of the team's sites the web search keeps to. The AI summary is about the page's company only.
        kinds = routing.classify(question, named_company=bool(named), on_company_page=bool(body.symbol)) if kind == "question" else []
        messages = service.build_messages([t.model_dump() for t in body.history], question, body.symbol, plan_key(ctx), card, routing.note(kinds))
        prefetched = [("read_company_document", d) for d in doc_reads]
        if prefetched:
            service.with_prefetches(messages, [("read_company_document", d, r) for d, r in zip(doc_reads, doc_res)])
        result: Optional[Dict[str, Any]] = None
        err: Optional[Dict[str, str]] = None
        task = asyncio.create_task(service.answer(client_for(st.anthropic_api_key), st.ask_model, gw, messages, emit, prefetched,
                                                  routing.web_domains(kinds)))
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
                    await quota.give_back(store.pool, ctx.user_id, month, kind)
                except Exception:
                    log.exception("ask: could not give the question back")
            yield sse("error", err)
            return
        assert result is not None
        await record(store, result)
        personal = any(t.startswith("get_my_") for t in result["tools"])
        # "aligned with the web pages" (task #218): the FinLit pages this answer read, as links under it; the companies read before the model started count first
        links = pages.page_links([("get_company_card", {"symbol": s}) for s in want[:2]] + list(result.get("calls") or []))
        if key and result["text"] and result["stop"] in ("end_turn",) and not personal:
            try:
                await store.redis.set(key, json.dumps({"text": result["text"], "tools": result["tools"], "pages": links}), ex=CACHE_SECONDS)
            except Exception:
                pass
        yield sse("done", {"disclaimer": service.DISCLAIMER, "sources": sorted(set(result["tools"])), "pages": links})

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
