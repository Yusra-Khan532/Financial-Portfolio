"""/api/concalls: the Concall Monitor page (task #278).

GET  /api/concalls                 the calls, newest first ("latest") or the scheduled ones soonest first ("upcoming"); scope all / portfolio / watchlist;
                                   search by company name or symbol. Open to everyone (the filings are public); Portfolio and Watchlist need a sign-in.
GET  /api/concalls/transcript      the full text of a call's transcript, page by page (kept by the job, else read once from the exchange).
GET  /api/concalls/file            the PDF of a call's presentation or transcript, served from this site so the page can show it in place (the exchange's
                                   archive refuses to be shown inside another site). Only files listed on the page.
POST /api/concalls/summary         the AI summary of a call, written once from its transcript (or its presentation) and kept: the first member to ask for
                                   it uses one of the plan's AI summaries (Silver and Gold, counted with the FinLit Prism summaries); after that it opens free.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from ..auth.routes import NO_STORE, fail, ip_of, limit, secure_ctx
from ..auth.service import Ctx, current
from . import service

log = logging.getLogger("finlit.concall.api")
router = APIRouter(prefix="/api/concalls")
CACHE_KEY = "concall:cards:v1"
CACHE_SECONDS = 300
PAGE_MAX = 60
DISCLAIMER = "Describes what the company said on its call, from its own filings; not a recommendation. Information only, not investment advice."
SUMMARY_CHARS = 60000


def _json(body: Any, status: int = 200, headers: Optional[Dict[str, str]] = None) -> Response:
    return Response(content=json.dumps(body, separators=(",", ":"), default=str), status_code=status, media_type="application/json",
                    headers=headers or {**NO_STORE, "Vary": "Cookie"})


async def _cards(request: Request) -> Dict[str, Any]:
    store = request.app.state.store
    try:
        hit = await store.redis.get(CACHE_KEY)
        if hit:
            return json.loads(hit)
    except Exception:
        hit = None
    async with store.pool.acquire() as conn:
        cards, last = await service.calls(conn)
    body = {"cards": cards, "readAt": last}
    try:
        await store.redis.set(CACHE_KEY, json.dumps(body, default=str), ex=CACHE_SECONDS)
    except Exception:
        pass
    return body


async def _member_symbols(request: Request, ctx: Ctx, scope: str) -> Optional[List[str]]:
    from ..filingalerts import lists_of
    async with request.app.state.store.pool.acquire() as conn:
        st = await conn.fetchrow("SELECT watchlist, portfolio FROM user_state WHERE user_id = $1", ctx.user_id)
    lists = lists_of(st["watchlist"] if st else None, st["portfolio"] if st else None)
    ref = "equity" if scope == "portfolio" else "watch"
    return next((x["symbols"] for x in lists if x["ref"] == ref), [])


def _match(card: Dict[str, Any], q: str) -> bool:
    words = [w for w in re.split(r"\s+", q.lower().strip()) if w]
    hay = f"{card['symbol']} {card['name']}".lower()
    return all(w in hay for w in words)


@router.get("")
async def list_calls(request: Request, scope: str = Query("all", pattern="^(all|portfolio|watchlist)$"), tab: str = Query("latest", pattern="^(latest|upcoming)$"),
                     q: str = Query("", max_length=60), offset: int = Query(0, ge=0, le=5000), limit_: int = Query(30, ge=1, le=PAGE_MAX, alias="limit")):
    ctx = await current(request)
    data = await _cards(request)
    cards: List[Dict[str, Any]] = data["cards"]
    scope_note = None
    if scope != "all":
        if not ctx.authed:
            return _json({"items": [], "total": 0, "counts": {"latest": 0, "upcoming": 0}, "scope": scope, "signIn": True, "readAt": data["readAt"],
                          "source": service.SOURCE, "disclaimer": DISCLAIMER,
                          "scopeNote": f"Sign in to see the calls of the companies in your {'equity portfolio' if scope == 'portfolio' else 'watchlists'}."})
        syms = set(await _member_symbols(request, ctx, scope) or [])
        if not syms:
            scope_note = ("Your equity portfolio has no companies yet: add them on the Portfolio page." if scope == "portfolio"
                          else "Your watchlists have no companies yet: add them on the Watchlists page.")
        cards = [c for c in cards if c["symbol"] in syms]
    if q.strip():
        cards = [c for c in cards if _match(c, q)]
    latest = [c for c in cards if not c["upcoming"]]
    upcoming = sorted([c for c in cards if c["upcoming"]], key=lambda c: c["sortKey"])
    pick = upcoming if tab == "upcoming" else latest
    items = [{k: v for k, v in c.items() if k != "sortKey"} for c in pick[offset:offset + limit_]]
    return _json({"items": items, "total": len(pick), "counts": {"latest": len(latest), "upcoming": len(upcoming)}, "scope": scope, "tab": tab,
                  "readAt": data["readAt"], "source": service.SOURCE, "disclaimer": DISCLAIMER, "scopeNote": scope_note, "signIn": False})


async def _doc_row(request: Request, link: str, kinds: tuple) -> Dict[str, Any]:
    async with request.app.state.store.pool.acquire() as conn:
        r = await conn.fetchrow("SELECT link, symbol, kind, title, filed, pages FROM concall_docs WHERE link = $1", link)
    if r is None or r["kind"] not in kinds:
        raise fail(404, "not_found", "This file is not one of the call filings on the Concall Monitor.")
    return dict(r)


@router.get("/transcript")
async def transcript(request: Request, link: str = Query(..., max_length=600)):
    from ..ask import docstore
    from ..ask.pages import _read_pages, DamagedFile, ToolError
    row = await _doc_row(request, link, ("transcript",))
    store = request.app.state.store
    pages = await docstore.get_pages(store, link)
    if not pages:
        await limit(request, "concall:read", f"ip:{ip_of(request)}", 12, 600)
        try:
            pages, _ = await _read_pages(store, {"link": link, "title": row["title"], "date": row["filed"]}, row["symbol"], "Call transcript")
        except (DamagedFile, ToolError, TimeoutError) as e:
            return _json({"symbol": row["symbol"], "link": link, "filed": row["filed"].isoformat(), "pages": [],
                          "why": f"The exchange did not give the transcript just now ({str(e)[:120] or 'no answer'}). Open the original PDF instead."})
    if not any(p.strip() for p in pages or []):
        return _json({"symbol": row["symbol"], "link": link, "filed": row["filed"].isoformat(), "pages": [],
                      "why": "The transcript is a scanned file with no text to show; open the original PDF."})
    return _json({"symbol": row["symbol"], "link": link, "title": row["title"], "filed": row["filed"].isoformat(), "pages": [p.strip() for p in pages],
                  "source": "The transcript the company filed with NSE"})


@router.get("/file")
async def file(request: Request, link: str = Query(..., max_length=600)):
    from ..earnings.transcripts import DOC_PDF_BYTES, Blocked, FetchFailed, Fetcher
    await _doc_row(request, link, ("presentation", "transcript"))
    await limit(request, "concall:file", f"ip:{ip_of(request)}", 20, 600)
    f = Fetcher(budget=4, pause=0.0)
    try:
        pdf = await f.pdf(link, DOC_PDF_BYTES)
    except (Blocked, FetchFailed) as e:
        raise fail(502, "not_given", f"The exchange did not give the file just now ({e}). Open it from the exchange instead.") from None
    finally:
        await f.aclose()
    # Shown inside this site's own page only: this response may be framed by the same site (the API's default refuses every frame).
    return Response(content=pdf, media_type="application/pdf", headers={
        "Content-Disposition": "inline", "Cache-Control": "public, max-age=86400", "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"})


class SummaryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    link: str = Field(..., max_length=600)


PROMPT = ("You are reading the {what} of {name} ({symbol}), filed with the exchange on {filed}. Write a short summary for an investor who did not "
          "attend the call, from this document only. Use these headings, each followed by 2 to 4 lines starting with \"- \":\n"
          "**What the quarter looked like** (figures exactly as the document states them, with the page in brackets, e.g. (p. 3)),\n"
          "**What management said about the business** (segments, demand, costs, capacity, orders),\n"
          "**Outlook as management stated it** (only what they said; write 'Not stated in the {what}.' when they gave none),\n"
          "**What analysts asked about** (the main themes of the questions).\n"
          "Rules: describe, never advise; never say buy, sell, hold, accumulate, target, top pick or 'best'; no opinion of your own; nothing that is not "
          "in the document; name who said a thing when the page names the speaker. At most 220 words.")


async def _write_summary(request: Request, row: Dict[str, Any], pages: List[str], name: str) -> str:
    from ..ask.api import client_for
    st = request.app.state.settings
    body, used = [], 0
    for i, p in enumerate(pages, start=1):
        t = (p or "").strip()
        if not t:
            continue
        if used + len(t) > SUMMARY_CHARS:
            break
        body.append(f"[page {i}]\n{t}")
        used += len(t)
    what = "earnings-call transcript" if row["kind"] == "transcript" else "investor presentation"
    msg = await client_for(st.anthropic_api_key).messages.create(
        model=st.ask_model, max_tokens=900,
        system=PROMPT.format(what=what, name=name, symbol=row["symbol"], filed=row["filed"].strftime("%d %b %Y")),
        messages=[{"role": "user", "content": "\n\n".join(body)}])
    return clean_summary("".join(getattr(b, "text", "") for b in msg.content))


def clean_summary(text: str) -> str:
    """A line that reads as advice (buy / sell / hold, a target, 'best' ...) is dropped, never shown; so is a heading left with no line under it."""
    from ..ask.service import reads_like_advice
    lines = [ln.rstrip() for ln in (text or "").strip().splitlines() if not reads_like_advice(ln)]
    out = [ln for i, ln in enumerate(lines) if not (ln.startswith("**") and ln.endswith("**") and (i + 1 >= len(lines) or not lines[i + 1].lstrip().startswith("-")))]
    return "\n".join(out).strip()


@router.post("/summary")
async def summary(request: Request, body: SummaryIn, ctx: Ctx = Depends(secure_ctx)):
    from ..ask import docstore, quota
    from ..ask.pages import _read_pages, DamagedFile, ToolError
    store, st = request.app.state.store, request.app.state.settings
    row = await _doc_row(request, body.link, ("transcript", "presentation"))
    cap = quota.allowance(ctx, "summary")
    if cap <= 0:
        raise fail(403, "plan_required", "AI summaries are part of the Silver and Gold plans (10 a month, counted with the FinLit Prism summaries).", plan="silver")
    async with store.pool.acquire() as conn:
        kept = await conn.fetchrow("SELECT text, source_kind, created_at FROM concall_summaries WHERE link = $1", body.link)
        name = await conn.fetchval("SELECT name FROM companies WHERE symbol = $1", row["symbol"]) or row["symbol"]
    month = quota.month_of()
    if kept:      # written before: opens free, for everyone on the plan
        n = await quota.used(store.pool, ctx.user_id, month, "summary")
        return _json({"text": kept["text"], "source": kept["source_kind"], "link": body.link, "written": kept["created_at"].isoformat(), "cached": True,
                      **quota.status(cap, n, month), "disclaimer": DISCLAIMER})
    if not st.anthropic_api_key:
        raise fail(503, "not_enabled", "AI summaries are not switched on yet.")
    await limit(request, "concall:sum", f"u:{ctx.user_id}", 4, 60)
    pages = await docstore.get_pages(store, body.link)
    if not pages:
        try:
            pages, _ = await _read_pages(store, {"link": body.link, "title": row["title"], "date": row["filed"]}, row["symbol"],
                                         "Call transcript" if row["kind"] == "transcript" else "Investor presentation")
        except (DamagedFile, ToolError, TimeoutError):
            raise fail(502, "not_given", "The exchange did not give the file just now, so no summary was written and none of your summaries was used. "
                       "Try again in a few minutes.") from None
    if not any(p.strip() for p in pages or []):
        raise fail(422, "no_text", "The file is a scan with no text, so FinLit cannot summarise it; none of your summaries was used.")
    n = await quota.take(store.pool, ctx.user_id, cap, month, "summary")
    if n is None:
        nxt = quota.next_month(month).strftime("%d %b %Y")
        raise fail(429, "quota_used", f"You have used all {cap} AI summaries of this month. They renew on {nxt}. Summaries other members already opened "
                   "stay free.", **quota.status(cap, cap, month))
    try:
        text = await _write_summary(request, row, pages, name)
    except Exception:
        log.warning("concall summary failed for %s", body.link[-60:], exc_info=True)
        await quota.give_back(store.pool, ctx.user_id, month, "summary")
        raise fail(502, "not_written", "The summary could not be written just now; none of your summaries was used. Try again in a few minutes.") from None
    if not text:
        await quota.give_back(store.pool, ctx.user_id, month, "summary")
        raise fail(502, "not_written", "The summary could not be written just now; none of your summaries was used.")
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO concall_summaries (link, symbol, source_kind, text, pages, model) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (link) DO NOTHING",
                           body.link, row["symbol"], row["kind"], text, len(pages), st.ask_model)
    return _json({"text": text, "source": row["kind"], "link": body.link, "written": None, "cached": False, **quota.status(cap, n, month), "disclaimer": DISCLAIMER})
