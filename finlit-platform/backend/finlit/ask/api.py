"""POST /api/ask: Ask FinLit AI, answered from FinLit's own data and streamed as Server-Sent Events. GET /api/ask/quota: the questions left this month.

Silver and Gold members only (Basic keeps the instant listed questions); each plan has a monthly allowance (finlit/ask/quota.py). Events, in order:
    meta    {"limit", "used", "left", "resets", "cached"}      once, first
    status  {"text"}                                         while FinLit data is being read ("Reading the ratios (TCS)")
    since   {"askedAt", "question", "match", "changes", "newItems", "said"}   before "text", only when the member asked the same or a similar
                                                             question 1 hour to 30 days ago (task #349 PR 3, docs/ASK-AI.md "Since you last asked")
    relation {"tags": [{"kind", "text", "tip"}]}               right after meta, only when the member holds, watches or has an alert on the company
                                                             (task #349 PR 4, docs/ASK-AI.md "Your holdings")
    text    {"text"}                                         pieces of the answer as they are written
    replace {"text"}                                         the answer so far is replaced (withdrawn as advice-like; "" clears a tool round's lead-in)
    ping    {}                                               a keep-alive after 10 s of quiet, while FinLit data is read or the model thinks
    done    {"disclaimer", "sources", "pages", "figures"?}   last, on success; pages: the FinLit pages the answer read, [{"to", "label"}] (task #218);
                                                             figures: what the answer read, with dates, for a follow-up to send back (task #349 PR 5)
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
from typing import Any, AsyncIterator, Awaitable, Dict, List, Literal, Optional, Tuple

import anthropic
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..auth.entitlements import sees_all
from ..auth.routes import fail, ip_of, limit, secure_ctx
from ..auth.service import VIEW_AS_HEADER, Ctx, cookie_name, current
from . import companies, pages, quota, routing, service, tools
from .gateway import MemberGateway
from . import memory   # task #349 PR 2: question memory (stores what was asked; changes no answer)
from . import mine     # task #349 PR 4: how the member is linked to the company (holdings, funds, ETFs, watchlists, alerts)
from . import whatsnew  # task #349 PR 5: "what's new for me" in the member's own companies
from . import followup  # task #349 PR 5: follow-ups keep the figures the earlier answers read
from . import blueprints, shape, variant   # the answer style v2 (blueprints), the shape check, and its console switch

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
    figures: Optional[str] = None    # task #349 PR 5: the "figures read" summary the `done` event gave this answer, sent back by the panel

    @field_validator("content")
    @classmethod
    def cut(cls, v: str) -> str:
        return v if len(v) <= TURN_CHARS else v[:TURN_CHARS - 1].rstrip() + "…"

    @field_validator("figures")
    @classmethod
    def plain(cls, v: Optional[str]) -> Optional[str]:
        return followup.clean(v)       # plain text, at most 600 characters: cut, never refused

    @model_validator(mode="after")
    def answers_only(self) -> "Turn":
        if self.role != "assistant":
            self.figures = None
        return self


class AskIn(BaseModel):
    """kind "summary" (task #228): the AI summary of the FinLit Prism card of `symbol`, counted apart from the questions; the server writes its
    question (service.summary_question), so it takes no question and no history."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["question", "summary"] = "question"
    question: str = Field(default="", max_length=500)
    history: List[Turn] = Field(default_factory=list, max_length=12)
    symbol: Optional[str] = Field(default=None, max_length=20)
    fresh: bool = False     # task #349 PR 3: the full answer, without "since you last asked"
    # The Answer check (ask/check.py), administrators only (ignored for anyone else): which answer style to use ("v1" today's, "v2" the
    # blueprints), and `check` = a test question: no allowance used, no cache, nothing kept in the question memory.
    variant: Optional[Literal["v1", "v2"]] = None
    check: bool = False

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


async def subject_of(gw, body: "AskIn", question: str, kind: str, until: float) -> Tuple[List[str], Optional[str]]:
    """The companies the question names and the page's company when the question is about it (task #279), read within the budget `until`."""
    # The company of the page, and the companies the question names: their cards first (what the page shows, as this member), so the
    # model starts with the facts whatever the wording, and answers in one round. Task #254 rework: the company list unreadable means none
    # named, never a failed answer.
    named = ((await within([companies.named_in(gw, question, 2, skip=body.symbol)], until))[0] or []) if kind == "question" else []
    # Task #279 (the team, 20 Nov 2026: "read the question clearly and not only the company report from where chatbot is opened"): the
    # page's company is read only when the question is about it: it points at it ("this company", "this stock", "here"), or names no
    # other company. A question naming another company ("why is icici low", asked on HCLTECH's page), or a word that starts several
    # companies' names, is about that company; a follow-up with no company keeps the company the conversation was about.
    page = body.symbol
    # Task #349 fix C: a question about a field (the RBI, inflation, a sector, the market, a term) asked with a company pinned is not about that
    # company unless it names it or points at it, and does not inherit the company of the conversation either.
    if page and kind == "question" and not named and routing.off_company(question):
        own = (await within([companies.named_in(gw, question, 3)], until))[0] or []
        if page not in own:
            return named, None
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
    return named, page


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
    is_admin = sees_all(ctx) or getattr(ctx, "role", None) == "admin"
    checking = bool(body.check and is_admin and kind == "question")
    v2 = (body.variant == "v2") if (body.variant and is_admin) else await variant.answer_v2_on(request.app.state.store.pool)
    if checking:
        body = body.model_copy(update={"fresh": True})          # a test question: the full answer, never "since you last asked"
    if cap <= 0 and kind == "summary":
        raise fail(403, "plan_required", "AI summaries from FinLit AI are part of every paid plan (10 a month).", plan="silver")
    if cap <= 0:      # Basic (founder, 17 Nov 2026): the listed questions only, which answer in the browser and never reach this endpoint
        raise fail(403, "plan_required", "Written answers from FinLit AI are part of every paid plan (50 a month; 100 a month on Gold and Platinum). "
                   "The listed questions answer at once on every plan.", plan="silver")
    await limit(request, "ask:min", f"u:{ctx.user_id}", 6, 60)          # at most 6 questions a minute, whatever the allowance

    # Task #349 PR 3: "since you last asked". A member with a question kept between 1 hour and 30 days ago: the question's subject is worked out
    # now, and the newest earlier answer on it is looked for. Anyone else is answered exactly as before (nothing more is read).
    started = time.monotonic()
    # Task #349 PR 5: "anything new in my holdings?" is answered from the member's own companies (at most 5), each compared with their last
    # question on it or the last 7 days. A member who keeps no company gets a plain answer at once, without the model and without using a question.
    wn = await whatsnew_lookup(store, ctx, question) if kind == "question" else None
    if wn is not None and not wn["companies"]:
        n0 = await quota.used(store.pool, ctx.user_id, month, kind)

        async def nothing() -> AsyncIterator[bytes]:
            yield sse("meta", {**quota.status(cap, n0, month), "cached": False, "subject": dict(MINE)})
            yield sse("text", {"text": whatsnew.NOTHING_KEPT})
            yield sse("done", {"disclaimer": service.disclaimer_for("mine"), "sources": [], "pages": whatsnew.NOTHING_PAGES})
        return StreamingResponse(nothing(), media_type="text/event-stream", headers={**STREAM_HEADERS})
    early = await since_lookup(request, st, store, ctx, body, question) if kind == "question" and wn is None else None
    since_on = bool(early and early.get("prev"))
    # Task #349 PR 4: how the member is linked to the companies the question is about (their shares, funds, ETFs, watchlists, alerts). Only for a
    # member who keeps any of these (one cheap read); the subject worked out here is reused for the answer. No link: answered exactly as before.
    rel = await relation_lookup(request, st, store, ctx, body, question, early) if kind == "question" and wn is None else None
    if wn is not None:                       # about the member's own companies: no company card, no page company, no since block
        early = {"named": [], "page": None, "topic": None, "prev": None}
    if rel is not None and early is None:
        early = {"named": rel["named"], "page": rel["page"], "topic": None, "prev": None}
    # Task #349 fix C: what the answer is about ({kind, id}), sent with meta; the company's tag, links and disclaimer only for a company question
    subject = answer_subject(kind, question, early, body.symbol, wn) if early is not None or kind == "summary" else None
    rel_on = bool(rel and rel["rel"]) and (subject or {}).get("kind") == "company"

    # A repeated first question (same words, same page, same plan, same day) is answered from the cache, at once and without using the allowance.
    # Not when "since you last asked" applies: that answer is the member's own (task #349 PR 3), like the answers about their own lists; nor when
    # the answer carries the member's own holdings (task #349 PR 4).
    key = cache_key(st.ask_model + (":v2" if v2 else ""), ctx, body) if not body.history and wn is None and not checking else None
    hit = None
    if key and not since_on and not rel_on:
        try:
            hit = await store.redis.get(key)
        except Exception:
            hit = None
    if hit is not None:
        n = await quota.used(store.pool, ctx.user_id, month, kind)
        cached = json.loads(hit)

        async def replay() -> AsyncIterator[bytes]:
            subj = cached.get("subject") if isinstance(cached.get("subject"), dict) else subject
            yield sse("meta", {**quota.status(cap, n, month), "cached": True, **({"subject": subj} if subj else {})})
            yield sse("text", {"text": cached["text"]})
            yield sse("done", {"disclaimer": service.disclaimer_for((subj or {}).get("kind")), "sources": cached.get("tools", []), "pages": cached.get("pages", []),
                               **({"figures": cached["figures"]} if cached.get("figures") else {})})
            mem = cached.get("memory")              # task #349 PR 3: a replay is kept too, with the figures the first answer read
            if kind == "question" and isinstance(mem, dict) and isinstance(mem.get("topic"), list):
                memory.keep(store.pool, ctx, question=question, result={"text": cached["text"], "stop": "end_turn"}, topic=mem["topic"],
                            figures=mem.get("figures") or {})
        return StreamingResponse(replay(), media_type="text/event-stream", headers={**STREAM_HEADERS})

    # Task #404: the summary's form changed (a short stance, no scores). A member who already summarised this company today in the old form gets
    # the new form without using another summary of the month.
    free_redo = False
    if kind == "summary" and key and hit is None:
        try:
            for v in service.OLD_SUMMARY_VERSIONS:
                if await store.redis.exists(key.replace(f":{service.SUMMARY_VERSION}:", f":{v}:", 1)):
                    free_redo = True
                    break
        except Exception:
            free_redo = False
    took = not (checking or free_redo)                # a summary or question was taken from the month's allowance (given back on a failure)
    n = await quota.take(store.pool, ctx.user_id, cap, month, kind) if took else await quota.used(store.pool, ctx.user_id, month, kind)
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
    if subject is None:                      # task #349 fix C: the subject is worked out once, before meta, and reused for the answer
        named0, page0 = await subject_of(gw, body, question, kind, time.monotonic() + PREREAD_SECONDS)
        early = {"named": named0, "page": page0, "topic": None, "prev": None}
        subject = answer_subject(kind, question, early, body.symbol, wn)

    async def stance_checked(result: Dict[str, Any], messages: List[Dict[str, Any]], gw, emit) -> Dict[str, Any]:
        """Task #404: the Prism summary is a 3-4 sentence stance with no score, no band word, no list and no advice (service.stance_problems).
        An answer that is not is asked again once, with the reasons; the rewrite replaces the first text on the member's screen. If the rewrite
        is still unfit the result is marked `unfit` and the member is told, and the summary is not counted."""
        if not (result.get("text") or "").strip() or result.get("stop") not in ("end_turn", "withdrawn"):
            return result
        problems = service.stance_problems(result["text"])
        if not problems:
            return result
        log.info("ask summary: the first text was not a stance (%s); asking once more", "; ".join(problems))
        await emit("status", {"text": "Putting it in a few lines"})

        async def quiet(event: str, data: Dict[str, Any]) -> None:        # the rewrite is shown whole, once it is checked
            if event == "status":
                await emit(event, data)

        again = messages + [{"role": "assistant", "content": result["text"]}, {"role": "user", "content": service.stance_retry_note(problems)}]
        r2 = await service.answer(client_for(st.anthropic_api_key), st.ask_model, gw, again, quiet, None, max_tokens=st.ask_max_tokens,
                                  effort=st.ask_effort)
        usage = {k: (result.get("usage") or {}).get(k, 0) + (r2.get("usage") or {}).get(k, 0) for k in set(result.get("usage") or {}) | set(r2.get("usage") or {})}
        merged = {**r2, "tools": list(result.get("tools") or []) + list(r2.get("tools") or []), "calls": list(result.get("calls") or []) + list(r2.get("calls") or []),
                  "usage": usage}
        left = service.stance_problems(r2.get("text") or "") if r2.get("stop") == "end_turn" else ["it was not finished"]
        if left:
            log.warning("ask summary: the rewrite was not a stance either (%s)", "; ".join(left))
            await emit("replace", {"text": ""})
            return {**merged, "text": "", "unfit": True}
        await emit("replace", {"text": r2["text"]})
        return merged

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
            until = (started if early is not None else time.monotonic()) + PREREAD_SECONDS
            if early is not None:            # task #349 PR 3: already worked out to look for an earlier answer
                named, page = early["named"], early["page"]
            else:
                named, page = await subject_of(gw, body, question, kind, until)
            want = ([page] if page else []) + named
            # Task #312 (developer file 20): a summary is written from the FinLit Prism card's own figures, not the whole company page (which
            # took 6 to 7 s to read before anything was written, and the text drifted).
            card_tool = "get_finlit_prism" if kind == "summary" else "get_company_card"
            for sym in want[:2]:
                await emit("status", {"text": "Reading the FinLit Prism card" if kind == "summary" else tools.label("get_company_card", {"symbol": sym})})
            # Task #349 PR 3: with an earlier answer to compare, the company's filings since then are read with the cards (one call).
            prev = early.get("prev") if early else None
            subj = early["topic"][2] if prev and early["topic"][1] == "company" else None
            feed_args = {"kind": "news", "symbol": subj, "limit": 12}
            if subj:
                await emit("status", {"text": tools.label("get_news_and_filings", feed_args)})
            both = await within([tools.run(gw, card_tool, {"symbol": s}) for s in want[:2]] + ([tools.run(gw, "get_news_and_filings", feed_args)] if subj else []),
                                until)
            got = [g or LATE for g in both[:len(want[:2])]]
            feed = both[len(want[:2])] if subj else None
            cards = [g["text"] for g in got if not g["error"]]
            card = "\n".join(cards) or None
            # Task #253: the kind of question (a company, the economy, a company's financials, daily news, a term, valuation, rules, funds, a
            # sector) decides which sources come first and which of the team's sites the web search keeps to (named in the note with the question).
            # The AI summary is about the page's company only.
            kinds = routing.classify(question, named_company=bool(named), on_company_page=bool(page)) if kind == "question" and wn is None else []
            # Task #255 / #254: a question about what a company's own document says reads that document now. Task #254 rework (the owner, 19 Nov
            # 2026): any question about a company reads its newest presentation, results filing and call transcript first, in that order, each
            # bounded to its best pages; a question about its issues, risks or health also reads FinLit Prism and the ownership changes. The
            # company the question names comes first, then the page's company; with no company there is nothing to read.
            doc_kinds = service.company_documents(question, kinds) if kind == "question" else []
            doc_sym = (named or ([page] if page else []) or [None])[0]
            # Task #349 PR 5: a follow-up carries the figures its earlier answers read. When they are about the same company and the follow-up
            # names no document ("and its margins?"), its documents are not read again before the model (it may still read one itself).
            carried = followup.note(body.history) if kind == "question" and body.history else ""
            if carried and doc_sym and followup.about(carried, doc_sym) and not service.document_intents(question):
                doc_kinds = []
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
            shape_kind = blueprints.kind_of(question, kinds, bank=lens != question) if kind == "question" and wn is None else None
            if v2 and shape_kind:            # answer style v2: the shape of the answer for this kind of question (ask/blueprints.py)
                note = (note + "\n" if note else "") + blueprints.blueprint(shape_kind)
            extra_reads = [("get_news_and_filings", feed_args, feed)] if feed and not feed.get("error") else []
            if prev:
                # Task #349 PR 3: what changed since the earlier answer, worked out without a model from what was read just now (the cards, the
                # documents) and the filings since then. The facts go in the note with the question, after the cached prefix.
                now_reads = [(card_tool, {"symbol": s}, g) for s, g in zip(want[:2], got)] + [(n, a, x) for (n, a), x in reads]
                now = memory.tool_results_of([], now_reads)
                facts = memory.diff(prev["figures"], memory.extract_figures(now), asked_at=prev["askedAt"], subject=subj,
                                    prev_plan=prev["plan"], now_plan=plan_key(ctx), locked=memory.locked_of(now))
                items = memory.new_items(feed["text"], prev["askedAt"]) if extra_reads else []
                await emit("since", memory.since_payload(prev, facts, items, subj))
                note = (note + "\n" if note else "") + memory.since_note(prev, facts, items)
            if rel_on:                       # task #349 PR 4: the member's own link to the company, in the note with the question
                note = (note + "\n" if note else "") + mine.note(rel["rel"])
            if carried:                      # task #349 PR 5: the figures the earlier answers of this chat read, with their dates
                note = (note + "\n" if note else "") + carried
            wn_figures = None
            if wn is not None:               # task #349 PR 5: what is new in the member's own companies, worked out without a model
                await emit("status", {"text": "Reading what is new in your companies"})
                wn_asked = whatsnew.reads(wn)
                got_wn = await within([tools.run(gw, n, a) for n, a in wn_asked], until)
                entries, wn_figures = whatsnew.build(wn, [(n, a, x) for (n, a), x in zip(wn_asked, got_wn)], plan_key(ctx))
                note = (note + "\n" if note else "") + whatsnew.note(entries)
            # task #349 PR 5: "what's new" is about all the member's companies, the page's company among them: the page is not named
            messages = service.build_messages([t.model_dump() for t in body.history], question, body.symbol if wn is None else None, plan_key(ctx), card, note,
                                              page_is_subject=bool(page) or kind != "question")
            prefetched = [r for r, _ in reads]
            if prefetched:
                service.with_prefetches(messages, [(n, a, x) for (n, a), x in reads])
            result = await service.answer(client_for(st.anthropic_api_key), st.ask_model, gw, messages, emit, prefetched, max_tokens=st.ask_max_tokens,
                                          effort=st.ask_effort_v2 if v2 else st.ask_effort)
            if kind == "summary":
                result = await stance_checked(result, messages, gw, emit)
            return {"result": result, "want": want, "named": named, "page": page, "kinds": kinds, "messages": messages, "shapeKind": shape_kind,
                    "cards": [(card_tool, {"symbol": s}, g) for s, g in zip(want[:2], got)] + extra_reads, "wnFigures": wn_figures}

        yield sse("meta", {**quota.status(cap, n, month), "cached": False, "subject": subject})
        if rel_on:                           # task #349 PR 4: the tags on the answer ("You hold this", "In 2 of your funds" ...)
            yield sse("relation", {"tags": mine.tags(rel["rel"])})
        result: Optional[Dict[str, Any]] = None
        want: List[str] = []
        done_: Dict[str, Any] = {}
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
        if err is None and result is not None and result.get("unfit"):      # task #404: twice not a short stance
            err = {"code": "unfit", "text": "FinLit AI could not put this card into a few clear lines this time. Please press Summarise again."}
        if err is None and result is not None and not (result.get("text") or "").strip():
            # Task #312: seen live, 22 Nov: a summary ended with "done" and no text at all, and was counted. Never again: say so, and log why.
            log.warning("ask: %s for %s ended with no text (stop=%s, output tokens=%s)", kind, body.symbol, result.get("stop"),
                        (result.get("usage") or {}).get("output"))
            err = {"code": "empty", "text": "FinLit AI could not write an answer this time. Please ask again."}
        if err:
            if took and (not wrote or kind == "summary"):     # a summary is counted only when its text reached the member
                try:
                    await quota.give_back(store.pool, ctx.user_id, month, kind)
                except Exception:
                    log.exception("ask: could not give the question back")
            yield sse("error", err)
            return
        assert result is not None
        shape_kind = done_.get("shapeKind")
        if v2 and result["text"] and result["stop"] == "end_turn":   # answer style v2: small slips mended without a model (ask/shape.py)
            tidied = shape.tidy(result["text"])
            if tidied != result["text"]:
                result["text"] = tidied
                yield sse("replace", {"text": tidied})
        m = shape.measure(result["text"] or "")
        log.info("ask shape: style=%s kind=%s words=%s sections=%s points=%s figures=%s cited=%s problems=%s", "v2" if v2 else "v1", shape_kind,
                 m["words"], m["sections"], m["points"], m["figures"], m["citedFigures"], "; ".join(shape.problems(m, shape_kind)) or "-")
        if checking:                         # a test question: the text and its measures, nothing kept, nothing counted
            state["delivered"] = True
            yield sse("done", {"disclaimer": service.disclaimer_for((subject or {}).get("kind")), "sources": sorted(set(result["tools"])), "pages": [],
                               "check": {"style": "v2" if v2 else "v1", "kind": shape_kind, "measures": m, "problems": shape.problems(m, shape_kind),
                                         "usage": result.get("usage"), "stop": result.get("stop")}})
            return
        await record(store, result)
        personal = any(t.startswith("get_my_") for t in result["tools"])
        # "aligned with the web pages" (task #218): the FinLit pages this answer read, as links under it; the companies read before the model started count first
        links = pages.page_links([("get_company_card", {"symbol": s}) for s in want[:2]] + list(result.get("calls") or []))
        if subject.get("kind") != "company":  # task #349 fix C: no company report or Prism link under an economy, sector or market answer
            links = [x for x in links if not x["to"].startswith(("/stocks/", "/prism/"))]
        if wn is not None:                  # task #349 PR 5: the answer is about the member's own companies
            links = (whatsnew.NOTHING_PAGES[:1] + [x for x in links if x["to"] != "/holdings"])[:4]
        # Task #349 PR 2: question memory (ask/memory.py), written in the background from what this answer already read.
        snap = memory.after_answer(store.pool, ctx, kind=kind, question=question, result=result, named=done_["named"], page=done_["page"],
                                   kinds=done_["kinds"], messages=done_["messages"], cards=done_["cards"], figures=done_.get("wnFigures"))
        # Task #349 PR 5: the figures this answer read, with their dates, for the panel to send back with a follow-up.
        figs = followup.summary(memory.tool_results_of(done_["messages"], done_["cards"])) if kind == "question" else ""
        if key and result["text"] and result["stop"] in ("end_turn",) and not personal and not since_on and not rel_on:
            try:
                await store.redis.set(key, json.dumps({"text": result["text"], "tools": result["tools"], "pages": links, "subject": subject, **({"figures": figs} if figs else {}),
                                                       **({"memory": snap} if snap else {})}, default=str),
                                      ex=SUMMARY_CACHE_SECONDS if kind == "summary" else CACHE_SECONDS)
            except Exception:
                pass
        state["delivered"] = True
        yield sse("done", {"disclaimer": service.disclaimer_for(subject.get("kind")), "sources": sorted(set(result["tools"])), "pages": links, **({"figures": figs} if figs else {})})

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
            if took and kind == "summary" and not state["delivered"] and not state["returned"]:
                asyncio.get_running_loop().create_task(_give_back(store, ctx.user_id, month, kind))

    return StreamingResponse(guarded(), media_type="text/event-stream", headers={**STREAM_HEADERS})


MINE = {"kind": "mine", "id": "-"}


def answer_subject(kind: str, question: str, early: Optional[Dict[str, Any]], symbol: Optional[str], wn: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """Task #349 fix C: {kind, id} of what the answer is about, from what was already worked out (memory.topic_of over the companies named, the
    page's company when the question is about it, and routing.classify): company | economy | sector | market | fund | etf | mine | concept | general."""
    if kind == "summary":
        return {"kind": "company", "id": symbol or ""}
    if wn is not None:
        return dict(MINE)
    named, page = list((early or {}).get("named") or []), (early or {}).get("page")
    kinds = routing.classify(question, named_company=bool(named), on_company_page=bool(page))
    _, sk, sid, _ = memory.topic_of(question, named, page, None, kinds)
    return {"kind": sk, "id": sid}


async def since_lookup(request: Request, st, store, ctx: Ctx, body: AskIn, question: str) -> Optional[Dict[str, Any]]:
    """Task #349 PR 3: the earlier answer this question repeats, or None. Only for a member with a question kept between 1 hour and 30 days ago
    (one cheap read); then the subject (the companies named, the page's company) is worked out once, here, and reused for the answer. Every miss
    is counted (`ask:memory:miss:<day>`, by reason). Never fails an answer: any error means no since block."""
    try:
        if memory._viewing_as(ctx) or quota.allowance(ctx) <= 0:
            return None
        if body.history or body.fresh:
            await memory.count_since(store.redis, "followup" if body.history else "fresh")
            return None
        if not await memory.has_recent(store.pool, ctx.user_id):
            await memory.count_since(store.redis, "no_rows")
            return None
        gw = MemberGateway(request.app, request.headers.get("host", "localhost"), ip_of(request), cookie_name=cookie_name(st),
                           cookie=request.cookies.get(cookie_name(st), ""), csrf=ctx.csrf or "",
                           origin=request.headers.get("origin") or f"{request.url.scheme}://{request.headers.get('host', 'localhost')}",
                           view_as=request.headers.get(VIEW_AS_HEADER))
        try:
            named, page = await subject_of(gw, body, question, "question", time.monotonic() + PREREAD_SECONDS)
        finally:
            await gw.aclose()
        kinds = routing.classify(question, named_company=bool(named), on_company_page=bool(page))
        topic = memory.topic_of(question, named, page, None, kinds)
        out: Dict[str, Any] = {"named": named, "page": page, "topic": topic, "prev": None}
        why = memory.since_miss_reason("question", body.history, body.fresh, topic)
        if why is None:
            out["prev"], why = await memory.match(store.pool, ctx.user_id, topic)
        await memory.count_since(store.redis, why, hit=out["prev"] is not None)
        return out
    except Exception:
        log.warning("ask: the earlier answer could not be looked for", exc_info=True)
        return None


async def whatsnew_lookup(store, ctx: Ctx, question: str) -> Optional[Dict[str, Any]]:
    """Task #349 PR 5: for "anything new in my holdings?" from a Silver or Gold member, {companies: [...]} (whatsnew.lookup; empty when they keep
    no company); None for any other question, an administrator's "view as" preview, or when it could not be read (then answered as before)."""
    if not memory.asks_whatsnew(question) or memory._viewing_as(ctx) or quota.allowance(ctx) <= 0:
        return None
    try:
        return await whatsnew.lookup(store.pool, ctx.user_id, redis=store.redis)
    except Exception:
        log.warning("ask: the member's companies could not be read for what is new", exc_info=True)
        return None


async def relation_lookup(request: Request, st, store, ctx: Ctx, body: AskIn, question: str, early: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Task #349 PR 4: {"named", "page", "rel"} for a member who keeps shares, funds, ETFs, watchlists or alerts, else None. `rel` is mine.relation
    for the companies the question is about (the page's company when it is the subject, then the companies named), {} when none is linked. The
    subject is the one since_lookup worked out when it did; otherwise it is worked out here, once, and reused for the answer. Never fails an answer."""
    try:
        if memory._viewing_as(ctx) or quota.allowance(ctx) <= 0:
            return None
        if not await mine.linked_any(store.pool, ctx.user_id):
            return None
        if early is not None:
            named, page = early["named"], early["page"]
        else:
            gw = MemberGateway(request.app, request.headers.get("host", "localhost"), ip_of(request), cookie_name=cookie_name(st),
                               cookie=request.cookies.get(cookie_name(st), ""), csrf=ctx.csrf or "",
                               origin=request.headers.get("origin") or f"{request.url.scheme}://{request.headers.get('host', 'localhost')}",
                               view_as=request.headers.get(VIEW_AS_HEADER))
            try:
                named, page = await subject_of(gw, body, question, "question", time.monotonic() + PREREAD_SECONDS)
            finally:
                await gw.aclose()
        want = (([page] if page else []) + list(named))[:2]
        rel = await mine.relation(store.pool, ctx.user_id, want, redis=store.redis) if want else {}
        return {"named": named, "page": page, "rel": rel}
    except Exception:
        log.warning("ask: the member's holdings could not be read", exc_info=True)
        return None


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
