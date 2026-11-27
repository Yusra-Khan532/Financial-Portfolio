"""The Answer check (Console > FinLit AI): a fixed set of real questions answered in one answer style ("v1" today's, "v2" the blueprints), scored,
and kept, so two styles are compared on the same questions before the switch is turned (the founder, 25 Nov 2026: "at the end we need perfect").

How a run works: an administrator starts it from the console. Each question is sent to the real /api/ask as that administrator (every read, note
and blueprint exactly as a member gets them), with `check` on: no allowance is used, nothing is cached or kept in the question memory. Questions go
one at a time, at most five a minute (the endpoint allows six). Each answer is scored out of 100:
  * 60 from fixed checks: an answer came; no advice (service.ADVICE); what the question must touch (MUST); the shape for its kind (ask/shape.py:
    a lead line, 2 to 4 sections, a source on every figure, short points, the length);
  * 40 from a grade by the same model FinLit AI uses (Haiku, about Rs 0.03 a question): does the first line answer the question, are the figures
    specific and dated, is it clear and plain. A grade that cannot be had leaves the fixed score alone (scaled to 100).
A run of the 48 questions costs about what 48 member questions cost, plus the grades (roughly Rs 20 to 30 in all).
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import anthropic
import httpx
import orjson
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from ..auth.routes import NO_STORE, Ctx, admin_ctx
from ..background import spawn
from . import shape
from .service import ADVICE

log = logging.getLogger("finlit.ask.check")
admin = APIRouter(prefix="/api/admin/ask-check")

GAP_SECONDS = 12.5            # five questions a minute: under the endpoint's six
QUESTION_SECONDS = 75.0       # one answer's time limit (the model's own deadline is 40 s)

# (id, question, expected blueprint kind, MUST: words the answer has to touch (any one of each group), AVOID: words it must not use)
QUESTIONS: List[Tuple[str, str, Optional[str], List[str], List[str]]] = [
    # a company
    ("co-health-reliance", "How is Reliance Industries doing?", "company", [r"revenue|profit|ebitda|margin"], []),
    ("co-health-tcs", "Analyse TCS's fundamentals", "company", [r"revenue|profit|margin", r"roe|roce|return"], []),
    ("co-health-asianpaints", "How is Asian Paints placed right now?", "company", [r"revenue|profit|volume|margin"], []),
    ("co-health-hal", "Give me an overview of Hindustan Aeronautics", "company", [r"order|revenue|profit"], []),
    ("co-health-hindi", "Reliance ka profit kaisa hai?", "company", [r"profit|मुनाफ|लाभ"], []),
    # banks
    ("bank-hdfc", "How is HDFC Bank's asset quality?", "bank_risk", [r"gnpa|gross npa|nnpa|net npa"], [r"\bsales\b"]),
    ("bank-sbi", "How is SBI doing?", "bank", [r"npa|nim|net interest|advances|deposit"], [r"\bsales\b"]),
    ("bank-icici-results", "ICICI Bank latest quarter results", "bank_results", [r"net interest income|nii|profit"], [r"\bsales\b"]),
    ("nbfc-bajaj", "What are the risks in Bajaj Finance?", "risks", [r"credit cost|stage|npa|aum|asset quality|unsecured"], []),
    # results, risks, valuation, comparison
    ("res-infy", "How were Infosys's latest results?", "results", [r"revenue|profit", r"q[1-4]|quarter"], []),
    ("res-itc", "ITC quarterly results", "results", [r"revenue|profit"], []),
    ("risk-adani", "Red flags in Adani Enterprises", "risks", [r"debt|borrow|pledge|cash flow|interest"], []),
    ("risk-paytm", "What are the concerns with Paytm?", "risks", [r"loss|revenue|regulat|rbi"], []),
    ("val-dmart", "Is Avenue Supermarts expensive?", "valuation", [r"p/?e|price to earnings|multiple"], [r"\bundervalued\b|\bovervalued\b"]),
    ("val-tcs", "What is TCS's valuation compared to its history?", "valuation", [r"p/?e", r"median|average|history|range|years"], []),
    ("cmp-tcs-infy", "Compare TCS and Infosys", "compare", [r"tcs", r"infosys"], []),
    ("cmp-hdfc-icici", "HDFC Bank vs ICICI Bank", "compare", [r"hdfc", r"icici"], []),
    # lookups
    ("look-tcs-pe", "What is TCS's P/E?", "lookup", [r"p/?e"], []),
    ("look-reliance-price", "Share price of Reliance", "lookup", [r"₹|rs\.?|price"], []),
    ("look-infy-results-date", "When are Infosys results?", "lookup", [r"\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|date|calendar"], []),
    # moves and news
    ("move-hdfc", "Why did HDFC Bank fall today?", "move", [r"%|fell|down|drop"], []),
    ("news-adani", "Latest news on Adani Ports", "news", [r"\d{4}|news|announce|filing"], []),
    # funds
    ("fund-ppfas", "How is Parag Parikh Flexi Cap Fund doing?", "fund", [r"return|cagr|%"], []),
    ("fund-sbi-small", "Tell me about SBI Small Cap Fund", "fund", [r"return|expense|aum|small"], []),
    ("fund-nav", "What is the NAV of HDFC Index Fund Nifty 50 Plan?", "lookup", [r"nav|₹"], []),
    # sectors and economy
    ("sec-banks", "How is the banking sector doing?", "sector", [r"bank"], []),
    ("sec-it", "Outlook for the IT sector", "sector", [r"it|technology|software"], []),
    ("eco-inflation", "What is the current inflation rate in India?", "lookup", [r"%", r"cpi|inflation"], []),
    ("eco-repo", "What is RBI's repo rate?", "lookup", [r"%", r"repo"], []),
    ("eco-gdp", "How is India's economy doing?", "economy", [r"gdp|growth|inflation"], []),
    ("eco-fii", "What are FIIs doing this month?", None, [r"fii|foreign", r"₹|crore|cr\b"], []),
    # concepts and how-to
    ("con-pe", "What is P/E ratio?", "concept", [r"price|earnings"], []),
    ("con-roce", "What does ROCE mean?", "concept", [r"capital|return"], []),
    ("con-sip", "How does a SIP work?", "concept", [r"monthly|regular|instal"], []),
    ("con-prism", "What is FinLit Prism?", "concept", [r"prism", r"0 to 100|100|score|rating"], [r"\biq\b score of"]),
    ("con-iq", "What is FinLit IQ?", "concept", [r"retired|prism"], []),
    ("how-watchlist", "How do I add a stock to my watchlist?", "howto", [r"watchlist"], []),
    ("how-screener", "How do I find companies with low debt?", "howto", [r"screen|filter|debt"], []),
    # advice traps: must describe, never advise
    ("adv-buy-itc", "Should I buy ITC?", None, [r"advice|not (?:give|tell)|describ|figures"], []),
    ("adv-best-fund", "Which is the best small cap fund to buy?", None, [r"advice|not (?:give|say)|describ|figures|returns"], []),
    ("adv-target", "What is the target price of Tata Motors?", None, [r"target|advice|not (?:give|pass)"], []),
    ("adv-sell", "My Yes Bank shares are down, should I sell?", None, [r"advice|not (?:give|tell)|describ|figures"], []),
    # documents and holdings
    ("doc-call-infy", "What did Infosys management say on the last earnings call?", "results", [r"guidance|demand|deal|said|management"], []),
    ("doc-capex-lt", "What is L&T's order book?", "company", [r"order|₹|crore|lakh"], []),
    ("mine-new", "What's new in my holdings?", "mine", [], []),
    # outside markets and follow-ups in one line
    ("gen-hello", "Hello", "greeting", [], []),
    ("gen-tax", "How is long-term capital gains on shares taxed in India?", "concept", [r"12\.5%|%|ltcg|long[- ]term"], []),
    ("gen-ipo", "Which IPOs are open this week?", None, [r"ipo|issue|open|close"], []),
]


def fixed_score(text: str, error: Optional[str], qid: str, kind_expected: Optional[str], kind_got: Optional[str], must: List[str], avoid: List[str]) -> Dict[str, Any]:
    """The fixed part of the score, out of 100, with what was found."""
    if error or not (text or "").strip():
        return {"score": 0.0, "notes": [f"no answer: {error or 'empty'}"], "advice": False, "measures": {}, "problems": []}
    notes: List[str] = []
    score = 100.0
    advice = bool(ADVICE.search(text))
    if advice:
        score -= 50; notes.append("reads like advice")
    low = text.lower()
    missed = [m for m in must if not re.search(m, low, re.I)]
    if missed:
        score -= 12 * len(missed); notes.append(f"does not touch: {', '.join(missed)}")
    used = [a for a in avoid if re.search(a, low, re.I)]
    if used:
        score -= 10 * len(used); notes.append(f"uses words it should not: {', '.join(used)}")
    m = shape.measure(text)
    probs = shape.problems(m, kind_got or kind_expected)
    score -= min(40.0, 8.0 * len(probs))
    return {"score": max(0.0, score), "notes": notes, "advice": advice, "measures": m, "problems": probs}


GRADE_PROMPT = """You grade one answer from FinLit AI, an assistant for Indian retail investors. Grade only what is on the page.
Question: {q}
Answer:
<answer>
{a}
</answer>
Give three grades from 1 (poor) to 5 (excellent):
- direct: does the first line answer the question that was asked?
- specific: are the figures specific, each with its period or date and a source?
- clear: is it easy for a retail investor to read, in short points, without filler?
Reply with only JSON: {{"direct": n, "specific": n, "clear": n, "why": "one short sentence"}}"""


async def grade(client: anthropic.AsyncAnthropic, model: str, question: str, answer: str) -> Optional[Dict[str, Any]]:
    try:
        msg = await asyncio.wait_for(client.messages.create(model=model, max_tokens=400, output_config={"effort": "low"},
                                                            messages=[{"role": "user", "content": GRADE_PROMPT.format(q=question, a=answer[:4000])}]), 40)
        if msg.stop_reason == "refusal":
            return None
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        j = json.loads(re.search(r"\{.*\}", text, re.S).group(0))  # type: ignore[union-attr]
        vals = [max(1, min(5, int(j[k]))) for k in ("direct", "specific", "clear")]
        return {"direct": vals[0], "specific": vals[1], "clear": vals[2], "why": str(j.get("why", ""))[:200]}
    except Exception:   # a grade that cannot be had leaves the fixed score alone
        log.warning("ask check: a grade could not be had", exc_info=True)
        return None


def total(fixed: float, g: Optional[Dict[str, Any]]) -> float:
    if not g:
        return round(fixed, 1)
    graded = (g["direct"] + g["specific"] + g["clear"] - 3) / 12 * 100      # 1..5 three times -> 0..100
    return round(0.6 * fixed + 0.4 * graded, 1)


async def read_stream(resp: httpx.Response) -> Dict[str, Any]:
    """The events of one /api/ask answer: the text as the member finally sees it, the "done" payload, or the error."""
    text, done, error, event = "", None, None, None
    async for line in resp.aiter_lines():
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            try:
                data = json.loads(line[5:].strip() or "{}")
            except ValueError:
                continue
            if event == "text":
                text += data.get("text", "")
            elif event == "replace":
                text = data.get("text", "")
            elif event == "done":
                done = data
            elif event == "error":
                error = data.get("text") or data.get("code") or "error"
    return {"text": text, "done": done, "error": error}


async def run(app, run_id: int, style: str, cookie: Tuple[str, str], csrf: str, origin: str, host: str, only: Optional[List[str]] = None) -> None:
    """One run, question by question, kept as it goes (a run that stops half-way keeps what it answered)."""
    st, pool = app.state.settings, app.state.store.pool
    client = anthropic.AsyncAnthropic(api_key=st.anthropic_api_key) if st.anthropic_api_key else None
    qs = [q for q in QUESTIONS if not only or q[0] in only]
    scores: List[float] = []
    transport = httpx.ASGITransport(app=app, client=("ask-check", 0))
    try:
        async with httpx.AsyncClient(transport=transport, base_url=f"http://{host}", cookies={cookie[0]: cookie[1]},
                                     headers={"origin": origin, "x-csrf-token": csrf, "accept": "text/event-stream"}, timeout=QUESTION_SECONDS) as http:
            for i, (qid, question, kind_expected, must, avoid) in enumerate(qs):
                started = time.monotonic()
                try:
                    async with http.stream("POST", "/api/ask", json={"question": question, "variant": style, "check": True}) as resp:
                        got = await read_stream(resp) if resp.status_code == 200 else {"text": "", "done": None, "error": f"HTTP {resp.status_code}"}
                except Exception as e:   # one question that fails is kept as failed; the run goes on
                    got = {"text": "", "done": None, "error": type(e).__name__}
                seconds = round(time.monotonic() - started, 1)
                info = ((got.get("done") or {}).get("check") or {})
                fixed = fixed_score(got["text"], got["error"], qid, kind_expected, info.get("kind"), must, avoid)
                g = await grade(client, st.ask_model, question, got["text"]) if client and got["text"] else None
                score = total(fixed["score"], g) if got["text"] else 0.0
                scores.append(score)
                usage = info.get("usage") or {}
                async with pool.acquire() as conn:
                    await conn.execute(
                        "INSERT INTO ask_check_answers (run_id, qid, question, kind, answer, score, checks, seconds, tokens_in, tokens_out, error) "
                        "VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11) ON CONFLICT (run_id, qid) DO NOTHING",
                        run_id, qid, question, info.get("kind") or kind_expected, got["text"], score,
                        json.dumps({"fixed": fixed, "grade": g, "expectedKind": kind_expected, "stop": info.get("stop")}),
                        seconds, usage.get("input"), usage.get("output"), got["error"])
                    await conn.execute("UPDATE ask_check_runs SET done = done + 1 WHERE id = $1", run_id)
                    if await conn.fetchval("SELECT status FROM ask_check_runs WHERE id = $1", run_id) == "stopped":
                        break
                if i < len(qs) - 1:
                    await asyncio.sleep(max(0.0, GAP_SECONDS - (time.monotonic() - started)))
        async with pool.acquire() as conn:
            await conn.execute("UPDATE ask_check_runs SET status = CASE WHEN status = 'stopped' THEN 'stopped' ELSE 'done' END, finished_at = now(), "
                               "score = $2 WHERE id = $1", run_id, round(sum(scores) / len(scores), 1) if scores else None)
    except Exception as e:
        log.exception("ask check: run %s failed", run_id)
        async with pool.acquire() as conn:
            await conn.execute("UPDATE ask_check_runs SET status = 'failed', finished_at = now(), note = $2, "
                               "score = $3 WHERE id = $1", run_id, type(e).__name__, round(sum(scores) / len(scores), 1) if scores else None)


class StartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    style: str = Field(pattern="^(v1|v2)$")
    only: Optional[List[str]] = Field(default=None, max_length=60)


def _reply(body: Any, status: int = 200) -> Response:
    return Response(content=orjson.dumps(body, default=str), status_code=status, media_type="application/json", headers=NO_STORE)


@admin.get("")
async def runs(request: Request, ctx: Ctx = Depends(admin_ctx)) -> Response:
    async with request.app.state.store.pool.acquire() as conn:
        rows = [dict(r) for r in await conn.fetch("SELECT id, style, started_at, finished_at, started_by, questions, done, score, status, note "
                                                  "FROM ask_check_runs ORDER BY id DESC LIMIT 20")]
    from .variant import answer_v2_on
    return _reply({"runs": rows, "questions": len(QUESTIONS), "styleOn": "v2" if await answer_v2_on(request.app.state.store.pool) else "v1",
                   "gapSeconds": GAP_SECONDS})


@admin.get("/{run_id}")
async def one(request: Request, run_id: int, ctx: Ctx = Depends(admin_ctx)) -> Response:
    async with request.app.state.store.pool.acquire() as conn:
        r = await conn.fetchrow("SELECT * FROM ask_check_runs WHERE id = $1", run_id)
        if not r:
            return _reply({"status": "not_found", "detail": "No such run."}, 404)
        answers = [dict(a) for a in await conn.fetch("SELECT qid, question, kind, answer, score, checks, seconds, tokens_in, tokens_out, error "
                                                     "FROM ask_check_answers WHERE run_id = $1 ORDER BY at", run_id)]
    for a in answers:
        a["checks"] = json.loads(a["checks"]) if isinstance(a["checks"], str) else a["checks"]
    return _reply({"run": dict(r), "answers": answers})


@admin.post("")
async def start(request: Request, body: StartIn, ctx: Ctx = Depends(admin_ctx)) -> Response:
    app, st = request.app, request.app.state.settings
    if not st.anthropic_api_key:
        return _reply({"status": "not_enabled", "detail": "FinLit AI's key is not set on this server."}, 503)
    async with app.state.store.pool.acquire() as conn:
        if await conn.fetchval("SELECT count(*) FROM ask_check_runs WHERE status = 'running' AND started_at > now() - interval '2 hours'"):
            return _reply({"status": "busy", "detail": "A check is already running. Wait for it, or stop it."}, 409)
        n = len([q for q in QUESTIONS if not body.only or q[0] in body.only])
        run_id = await conn.fetchval("INSERT INTO ask_check_runs (style, started_by, questions) VALUES ($1, $2, $3) RETURNING id", body.style, ctx.email, n)
    from ..auth.service import cookie_name
    name = cookie_name(st)
    cookie = request.cookies.get(name, "")
    spawn(run(app, run_id, body.style, (name, cookie), request.headers.get("x-csrf-token", ""), request.headers.get("origin", ""),
              request.headers.get("host", "localhost"), body.only))
    return _reply({"id": run_id, "questions": n, "minutes": round(n * GAP_SECONDS / 60, 1)}, 202)


@admin.post("/{run_id}/stop")
async def stop(request: Request, run_id: int, ctx: Ctx = Depends(admin_ctx)) -> Response:
    async with request.app.state.store.pool.acquire() as conn:
        await conn.execute("UPDATE ask_check_runs SET status = 'stopped' WHERE id = $1 AND status = 'running'", run_id)
    return _reply({"id": run_id, "status": "stopped"})
