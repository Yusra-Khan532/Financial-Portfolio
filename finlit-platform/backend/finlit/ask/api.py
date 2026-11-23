"""POST /api/ask: Ask FinLit AI, answered from FinLit's own data and streamed as Server-Sent Events. GET /api/ask/quota: the questions left this month.

Silver and Gold members only (Basic keeps the instant listed questions); each plan has a monthly allowance (finlit/ask/quota.py). Events, in order:
    meta    {"limit", "used", "left", "resets", "cached"}      once, first
    status  {"text"}                                         while FinLit data is being read ("Reading the ratios (TCS)")
    text    {"text"}                                         pieces of the answer as they are written
    replace {"text"}                                         the answer so far is replaced (withdrawn as advice-like; "" clears a tool round's lead-in)
    ping    {}                                               a keep-alive after 10 s of quiet, while FinLit data is read or the model thinks
    done    {"disclaimer", "sources", "pages"}               last, on success; pages: the FinLit pages the answer read, [{"to", "label"}] (task #218)
    error   {"code", "text"}                                 last, on failure (the question is given back when nothing was written)
A stream that ends with neither "done" nor "error" was cut: the panel says the answer was interrupted (task #349).
Without ANTHROPIC_API_KEY the endpoint answers 503 "not_enabled" and the panel keeps its instant listed answers."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
from datetime import datetime
from typing import Any, AsyncIterator, Awaitable, Dict, List, Literal, Optional

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
SUMMARY_CACHE_SECONDS = 26 * 3600   # task #312: a card's summary is kept for its score day; a second press that day is instant and free
PING_SECONDS = 10                   # task #312: a keep-alive every 10 s of quiet, so a quiet stream is never taken for a dead one (task #349: questions too)
PREREAD_SECONDS = 15.0              # task #349: one budget for everything read before the model starts (the companies named, cards, documents)
NO_STORE = {"Cache-Control": "no-store"}
STREAM_HEADERS = {"Cache-Control": "no-store, no-cache", "X-Accel-Buffering": "no"}
SYMBOL = re.compile(r"^[A-Z0-9&\-\.]{1,20}$")
_clients: Dict[str, anthropic.AsyncAnthropic] = {}


TURN_CHARS = 4000               # task #349: an earlier turn is cut to this, never refused (a long answer made every later follow-up a 422)


class Turn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)

    @field_validator("content")
    @classmethod
    def cut(cls, v: str) -> str:
        return v if len(v) <= TURN_CHARS else v[:TURN_CHARS - 1].rstrip() + "…"


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


LATE = {"text": "This was not read in time.", "error": True}


async def within(aws: List[Awaitable[Any]], until: float) -> List[Any]:
    """Runs the reads together until `until` (time.monotonic()); each one not finished by then, or that failed, is None (task #349: one budget
    for every read before the model starts)."""
    if not aws:
        return []
    tasks = [asyncio.ensure_future(a) for a in aws]
    done, pending = await asyncio.wait(tasks, timeout=max(0.0, until - time.monotonic()))
    for p in pending:
        p.cancel()
    out: List[Any] = []
    for t in tasks:
        if t in done and not t.cancelled() and t.exception() is None:
            out.append(t.result())
        else:
            if t in done and not t.cancelled():
                log.warning("ask: a read before the model failed: %r", t.exception())
            out.append(None)
    return out


def cache_key(model: str, ctx: Ctx, body: AskIn) -> str:
    if body.kind == "summary":   # task #312: one summary per company per score day (scores are worked out once a night), the same for every plan
        return f"ask:answer:summary:{service.SUMMARY_VERSION}:{model}:{(body.symbol or '').upper()}:{datetime.now(service.IST).date().isoformat()}"
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
        return StreamingResponse(replay(), media_type="text/event-stream", headers={**STREAM_HEADERS})

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
        wrote = False                       # words of the answer are on the member's screen now

        async def emit(event: str, data: Dict[str, Any]) -> None:
            nonlocal wrote
            if event == "text" and data.get("text"):
                wrote = True
            elif event == "replace":
                wrote = bool(data.get("text"))  # "" clears a tool round's lead-in: nothing of the answer is left on screen
            out.append(sse(event, data))

        async def prepare() -> Dict[str, Any]:
            """Everything read before the model starts, inside one budget (task #349: it used to be up to 25 s of cards and 35 s of documents,
            outside the deadline and with no keep-alive); a read not finished in time is left out and the model may read it itself."""
            until = time.monotonic() + PREREAD_SECONDS
            # The company of the page, and the companies the question names: their cards first (what the page shows, as this member), so the
            # model starts with the facts whatever the wording, and answers in one round. Task #254 rework: the company list unreadable means none
            # named, never a failed answer.
            named = ((await within([companies.named_in(gw, question, 2, skip=body.symbol)], until))[0] or []) if kind == "question" else []
            # Task #279 (the team, 20 Nov 2026: "read the question clearly and not only the company report from where chatbot is opened"): the
            # page's company is read only when the question is about it: it points at it ("this company", "this stock", "here"), or names no
            # other company. A question naming another company ("why is icici low", asked on HCLTECH's page), or a word that starts several
            # companies' names, is about that company; a follow-up with no company keeps the company the conversation was about.
            page = body.symbol
            if page and kind == "question" and not companies.points_at_page(question, strong_only=True):
                other = bool(named)
                if not other:
                    other = bool((await within([companies.other_group(gw, question, skip=page)], until))[0])
                if not other and body.history:          # "and its margins?" after "why is icici low": the company the conversation is about
                    last = next((t.content for t in reversed(body.history) if t.role == "user"), "")
                    before = (await within([companies.named_in(gw, last, 2, skip=page)], until))[0] or []
                    if before:
                        named, other = before, True
                if other:
                    page = None
            want = ([page] if page else []) + named
            # Task #312 (developer file 20): a summary is written from the FinLit Prism card's own figures, not the whole company page (which
            # took 6 to 7 s to read before anything was written, and the text drifted).
            card_tool = "get_finlit_prism" if kind == "summary" else "get_company_card"
            for sym in want[:2]:
                await emit("status", {"text": "Reading the FinLit Prism card" if kind == "summary" else tools.label("get_company_card", {"symbol": sym})})
            got = [g or LATE for g in await within([tools.run(gw, card_tool, {"symbol": s}) for s in want[:2]], until)]
            cards = [g["text"] for g in got if not g["error"]]
            card = "\n".join(cards) or None
            # Task #253: the kind of question (a company, the economy, a company's financials, daily news, a term, valuation, rules, funds, a
            # sector) decides which sources come first and which of the team's sites the web search keeps to (named in the note with the question).
            # The AI summary is about the page's company only.
            kinds = routing.classify(question, named_company=bool(named), on_company_page=bool(page)) if kind == "question" else []
            # Task #255 / #254: a question about what a company's own document says reads that document now. Task #254 rework (the owner, 19 Nov
            # 2026): any question about a company reads its newest presentation, results filing and call transcript first, in that order, each
            # bounded to its best pages; a question about its issues, risks or health also reads FinLit Prism and the ownership changes. The
            # company the question names comes first, then the page's company; with no company there is nothing to read.
            doc_kinds = service.company_documents(question, kinds) if kind == "question" else []
            doc_sym = (named or ([page] if page else []) or [None])[0]
            lens = question
            if doc_sym and service.bank_like(got[want.index(doc_sym)]["text"] if doc_sym in want[:2] and not got[want.index(doc_sym)]["error"] else None):
                lens = f"{question[:150]} {pages.BANK_TERMS}"          # a bank, an NBFC or an insurer is read for its own measures
            doc_reads = [{"symbol": doc_sym, "document": k, "question": lens[:200], "max_chars": c}
                         for k, c in zip(doc_kinds, service.document_shares(doc_kinds, lens != question))] if doc_sym else []
            extra: List[Any] = []
            if doc_sym and "company" in kinds and service.ISSUE_WORDS.search(question):
                extra = [("get_finlit_prism", {"symbol": doc_sym}), ("get_company_section", {"symbol": doc_sym, "section": "ownership_insights"})]
            for d in doc_reads:
                await emit("status", {"text": tools.label("read_company_document", d)})
            asked = [("read_company_document", d) for d in doc_reads] + extra
            res = await within([tools.run(gw, n, a) for n, a in asked], until) if asked else []
            reads = [(r, x) for r, x in zip(asked, res) if x is not None]          # a read not finished in time is left out
            if len(reads) < len(asked):
                log.warning("ask: %d of %d reads before the model were not finished in %ss", len(asked) - len(reads), len(asked), int(PREREAD_SECONDS))
            note = routing.note(kinds) + ("\n" + service.stance_note(question) if kind == "question" and service.stance_note(question) else "")   # task #270
            messages = service.build_messages([t.model_dump() for t in body.history], question, body.symbol, plan_key(ctx), card, note,
                                              page_is_subject=bool(page) or kind != "question")
            prefetched = [r for r, _ in reads]
            if prefetched:
                service.with_prefetches(messages, [(n, a, x) for (n, a), x in reads])
            result = await service.answer(client_for(st.anthropic_api_key), st.ask_model, gw, messages, emit, prefetched, max_tokens=st.ask_max_tokens)
            return {"result": result, "want": want}

        yield sse("meta", {**quota.status(cap, n, month), "cached": False})
        result: Optional[Dict[str, Any]] = None
        want: List[str] = []
        err: Optional[Dict[str, str]] = None
        task = asyncio.create_task(prepare())
        try:
            quiet = time.monotonic()
            while not task.done() or out:
                while out:
                    quiet = time.monotonic()
                    yield out.pop(0)
                if not task.done():
                    await asyncio.wait({task}, timeout=0.05)
                    if time.monotonic() - quiet >= PING_SECONDS:   # task #349: questions too, while the data is read and the model thinks
                        quiet = time.monotonic()
                        yield sse("ping", {})
            done_ = task.result()
            result, want = done_["result"], done_["want"]
        except anthropic.RateLimitError:
            err = {"code": "busy", "text": "FinLit AI is answering many questions right now. Please try again in a minute."}
        except anthropic.AuthenticationError:
            log.error("ask: the Anthropic API key was refused")
            err = {"code": "not_configured", "text": "FinLit AI is not set up correctly right now. The team has been told."}
        except (anthropic.APIConnectionError, anthropic.APITimeoutError):
            err = {"code": "unavailable", "text": "FinLit AI could not be reached just now. Please try again."}
        except anthropic.BadRequestError as e:          # task #349 H: logged with the provider's words, and said plainly
            log.warning("ask: the provider refused the request (400): %s", str(getattr(e, "message", e))[:300])
            err = {"code": "refused", "text": "FinLit AI could not take this question just now. Please ask it again, or in other words."}
        except anthropic.APIStatusError as e:
            log.warning("ask: API status %s", e.status_code)
            err = {"code": "unavailable", "text": "FinLit AI could not answer just now. Please try again."}
        except Exception:
            log.exception("ask: failed")
            err = {"code": "failed", "text": "This answer could not be put together just now. Please try again."}
        finally:
            if not task.done():                 # the member left (Stop, a closed panel): the work stops too, no more tokens are spent
                task.cancel()
            await gw.aclose()
        while out:
            yield out.pop(0)
        if result is not None and result["stop"] == "refusal" and not result["text"]:
            err = {"code": "declined", "text": "FinLit AI cannot answer that question. Try asking about a company's figures, a fund or the market."}
        if result is not None and result["stop"] == "deadline" and not result["text"]:
            err = {"code": "slow", "text": "This answer took too long. Please ask again, or ask about one thing at a time."}
        if err is None and result is not None and not (result.get("text") or "").strip():
            # Task #312: seen live, 22 Nov: a summary ended with "done" and no text at all, and was counted. Never again: say so, and log why.
            log.warning("ask: %s for %s ended with no text (stop=%s, output tokens=%s)", kind, body.symbol, result.get("stop"),
                        (result.get("usage") or {}).get("output"))
            err = {"code": "empty", "text": "FinLit AI could not write an answer this time. Please ask again."}
        if err:
            if not wrote or kind == "summary":     # a summary is counted only when its text reached the member
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
                await store.redis.set(key, json.dumps({"text": result["text"], "tools": result["tools"], "pages": links}),
                                      ex=SUMMARY_CACHE_SECONDS if kind == "summary" else CACHE_SECONDS)
            except Exception:
                pass
        state["delivered"] = True
        yield sse("done", {"disclaimer": service.DISCLAIMER, "sources": sorted(set(result["tools"])), "pages": links})

    state = {"delivered": False, "returned": False}

    async def guarded() -> AsyncIterator[bytes]:
        """Task #312: a summary the member did not receive is given back: the client left (Stop, a closed page) or the stream was cut (a deploy)
        before "done". Errors give it back inside run(); this covers the rest."""
        try:
            async for chunk in run():
                if chunk.startswith(b"event: error"):
                    state["returned"] = True
                yield chunk
        finally:
            if kind == "summary" and not state["delivered"] and not state["returned"]:
                asyncio.get_running_loop().create_task(_give_back(store, ctx.user_id, month, kind))

    return StreamingResponse(guarded(), media_type="text/event-stream", headers={**STREAM_HEADERS})


async def _give_back(store, user_id: str, month, kind: str) -> None:
    try:
        await quota.give_back(store.pool, user_id, month, kind)
    except Exception:
        log.exception("ask: could not give the summary back")


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
