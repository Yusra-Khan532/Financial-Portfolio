"""/api/concalls: the Concall Monitor page (task #278).

GET  /api/concalls                 the calls, newest first ("latest") or the scheduled ones soonest first ("upcoming"); scope all / portfolio / watchlist;
                                   search by company name or symbol. Open to everyone (the filings are public); Portfolio and Watchlist need a sign-in.
GET  /api/concalls/transcript      the full text of a call's transcript, page by page (kept by the job, else read once from the exchange).
GET  /api/concalls/file            the PDF of a call's presentation or transcript, served from this site so the page can show it in place (the exchange's
                                   archive refuses to be shown inside another site). Only files listed on the page.
POST /api/concalls/summary         the AI summary of a call, written once from its transcript (or its presentation) and kept: the first member to ask for
                                   it uses one of the plan's AI summaries (Silver and Gold, counted with the FinLit Prism summaries); after that it opens free.
                                   Task #432: headings the model chooses, points with page references (checked); one kept in the old short form is written
                                   again once in the new form without using anyone's summaries.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, Sequence

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


async def _member_lists(request: Request, ctx: Ctx) -> Dict[str, List[str]]:
    """The member's equity portfolio and watchlist companies: {"portfolio": [...], "watchlist": [...]}."""
    from ..filingalerts import lists_of
    async with request.app.state.store.pool.acquire() as conn:
        st = await conn.fetchrow("SELECT watchlist, portfolio FROM user_state WHERE user_id = $1", ctx.user_id)
    lists = lists_of(st["watchlist"] if st else None, st["portfolio"] if st else None)
    pick = lambda ref: next((x["symbols"] for x in lists if x["ref"] == ref), [])  # noqa: E731
    return {"portfolio": pick("equity"), "watchlist": pick("watch")}


def _match(card: Dict[str, Any], q: str) -> bool:
    words = [w for w in re.split(r"\s+", q.lower().strip()) if w]
    hay = f"{card['symbol']} {card['name']}".lower()
    return all(w in hay for w in words)


# Task #306: the toolbar's Has, Quarter and Type filters work over every call (not only the ones loaded), and each dropdown's counts are worked out
# with the other filters applied. "listen" means a recording link or file the company filed; "summary" means a transcript or presentation to write from.
HAS = ("listen", "transcript", "ppt", "summary")
NO_QUARTER = "none"


def has_it(card: Dict[str, Any], h: str) -> bool:
    if h == "listen":
        return not card["listen"].get("why")
    if h == "summary":
        return bool(card["summary"].get("link"))
    return bool(card[h].get("doc"))


def passes(card: Dict[str, Any], *, has: Sequence[str] = (), quarter: str = "", kind: str = "", syms: Optional[set] = None) -> bool:
    if syms is not None and card["symbol"] not in syms:
        return False
    if quarter and (card.get("quarter") or NO_QUARTER) != quarter:
        return False
    if kind and card.get("kind") != kind:
        return False
    return all(has_it(card, h) for h in has)


def _quarter_order(q: str) -> tuple:
    """The newest quarter first ("Q2 FY27", "Q1 FY27", "Q4 FY26" ...), "Not stated in the filing" last."""
    m = re.fullmatch(r"Q([1-4]) FY(\d{2})", q or "")
    return (1, 0, 0, q) if not m else (0, -int(m.group(2)), -int(m.group(1)), q)


def facets(cards: List[Dict[str, Any]], *, has: Sequence[str], quarter: str, kind: str, syms: Optional[set], lists: Optional[Dict[str, set]]) -> Dict[str, Any]:
    """Counts for every dropdown, each with the other filters applied (the dropdown's own filter left out)."""
    f = dict(has=has, quarter=quarter, kind=kind, syms=syms)
    def n(**patch) -> int:
        g = {**f, **patch}
        return sum(1 for c in cards if passes(c, **g))
    quarters = sorted({c.get("quarter") or NO_QUARTER for c in cards}, key=_quarter_order)
    kinds = sorted({c.get("kind") for c in cards if c.get("kind")})
    return {
        "scope": {"all": n(syms=None), "portfolio": n(syms=lists["portfolio"]) if lists else None, "watchlist": n(syms=lists["watchlist"]) if lists else None},
        "has": {h: n(has=sorted(set(has) | {h})) for h in HAS},
        "quarter": [{"v": q, "n": n(quarter=q)} for q in quarters],
        "kind": [{"v": k, "n": n(kind=k)} for k in kinds],
    }


def sort_cards(cards: List[Dict[str, Any]], tab: str, sort: str) -> List[Dict[str, Any]]:
    if sort == "az":
        return sorted(cards, key=lambda c: (c["name"].lower(), c["sortKey"]))
    soonest = sorted(cards, key=lambda c: c["sortKey"])                         # upcoming: soonest first; latest: oldest first
    newest = list(reversed(soonest))
    if tab == "upcoming":
        return newest if sort == "old" else soonest                            # on Upcoming "newest first" means the soonest call first
    return soonest if sort == "old" else newest


@router.get("")
async def list_calls(request: Request, scope: str = Query("all", pattern="^(all|portfolio|watchlist)$"), tab: str = Query("latest", pattern="^(latest|upcoming)$"),
                     q: str = Query("", max_length=60), offset: int = Query(0, ge=0, le=5000), limit_: int = Query(30, ge=1, le=PAGE_MAX, alias="limit"),
                     has: str = Query("", max_length=60, pattern=r"^[a-z,]*$"), quarter: str = Query("", max_length=20), kind: str = Query("", max_length=30),
                     sort: str = Query("new", pattern="^(new|old|az)$")):
    ctx = await current(request)
    data = await _cards(request)
    cards: List[Dict[str, Any]] = data["cards"]
    want = [h for h in dict.fromkeys(x.strip() for x in has.split(",")) if h in HAS]
    lists: Optional[Dict[str, set]] = None
    if ctx.authed:
        lists = {k: set(v) for k, v in (await _member_lists(request, ctx)).items()}
    scope_note = None
    if scope != "all":
        if not ctx.authed:
            return _json({"items": [], "total": 0, "counts": {"latest": 0, "upcoming": 0}, "scope": scope, "signIn": True, "readAt": data["readAt"],
                          "source": service.SOURCE, "disclaimer": DISCLAIMER, "facets": None, "have": None, "days": {},
                          "scopeNote": f"Sign in to see the calls of the companies in your {'equity portfolio' if scope == 'portfolio' else 'watchlists'}."})
        if not lists[scope]:
            scope_note = ("Your equity portfolio has no companies yet: add them on the Portfolio page." if scope == "portfolio"
                          else "Your watchlists have no companies yet: add them on the Watchlists page.")
    if q.strip():
        cards = [c for c in cards if _match(c, q)]
    syms = lists[scope] if (scope != "all" and lists) else None
    scoped = [c for c in cards if syms is None or c["symbol"] in syms]
    latest = [c for c in scoped if not c["upcoming"]]
    upcoming = [c for c in scoped if c["upcoming"]]
    in_tab = [c for c in cards if bool(c["upcoming"]) == (tab == "upcoming")]          # the tab's calls before the Companies / Has / Quarter / Type filters
    pick = sort_cards([c for c in in_tab if passes(c, has=want, quarter=quarter, kind=kind, syms=syms)], tab, sort)

    def tag(c: Dict[str, Any]) -> Optional[str]:
        if not lists:
            return None
        return "portfolio" if c["symbol"] in lists["portfolio"] else "watchlist" if c["symbol"] in lists["watchlist"] else None

    items = [{**{k: v for k, v in c.items() if k != "sortKey"}, "mine": tag(c)} for c in pick[offset:offset + limit_]]
    days: Dict[str, int] = {}
    for c in pick:
        days[c.get("date") or ""] = days.get(c.get("date") or "", 0) + 1
    have = {h: sum(1 for c in pick if has_it(c, h)) for h in HAS}
    return _json({"items": items, "total": len(pick), "offset": offset, "counts": {"latest": len(latest), "upcoming": len(upcoming)}, "scope": scope, "tab": tab,
                  "readAt": data["readAt"], "source": service.SOURCE, "disclaimer": DISCLAIMER, "scopeNote": scope_note, "signIn": False,
                  "facets": facets(in_tab, has=want, quarter=quarter, kind=kind, syms=syms, lists=lists), "have": have, "days": days,
                  "filters": {"has": want, "quarter": quarter, "kind": kind, "sort": sort}})


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


PROMPT = ("You are reading the {what} of {name} ({symbol}), filed with the exchange on {filed}. Write a detailed, well-organised summary for an "
          "investor who did not attend the call, from this document only.\n"
          "Format: Markdown lines only, no paragraphs.\n"
          "- 4 to 8 main headings, each a line starting with \"## \". Choose them yourself from what this document actually covers (for example the "
          "quarter's figures, a business segment, orders, capacity, costs, a new product or market, plans, risks, what management expects, what "
          "analysts asked); do not use a fixed list, and name each heading after its content.\n"
          "- Optional subheadings, lines starting with \"### \", when a heading has distinct parts.\n"
          "- Under each heading or subheading, 2 to 6 lines starting with \"- \": one point each.\n"
          "- Each point gives the figure exactly as the document states it, what it means or what the document compares it with (the quarter or year "
          "before, the plan, the guidance), and ends with the page in brackets, e.g. (p. 5) or (pp. 5, 7).\n"
          "Cover, where the document has them: the important financial figures, business developments, management's commentary, growth plans as "
          "management described them, risks and challenges, and the outlook as management stated it. Leave out what the document does not cover.\n"
          "Rules: describe, never advise; never say buy, sell, hold, accumulate, target price, top pick or 'best'; no opinion or forecast of your own; "
          "nothing that is not in the document, and no figure the document does not state; no repetition, no generic lines; name who said a thing "
          "when the page names the speaker. Between 350 and 900 words.")
SUMMARY_TOKENS = 2600   # task #432: 4-8 headings of points (was 900 tokens for a 220-word summary)


def is_sectioned(text: str) -> bool:
    """Task #432: a summary in the current form has "## " headings the model chose; one written before (fixed "**Heading**" lines) does not."""
    return any(ln.startswith("## ") for ln in (text or "").splitlines())


async def _write_summary(request: Request, row: Dict[str, Any], pages: List[str], name: str) -> str:
    from ..ask.api import client_for
    st = request.app.state.settings
    body, used, sent = [], 0, {}
    for i, p in enumerate(pages, start=1):
        t = (p or "").strip()
        if not t:
            continue
        if used + len(t) > SUMMARY_CHARS:
            break
        body.append(f"[page {i}]\n{t}")
        sent[i] = t
        used += len(t)
    what = "earnings-call transcript" if row["kind"] == "transcript" else "investor presentation"
    msg = await client_for(st.anthropic_api_key).messages.create(
        model=st.ask_model, max_tokens=SUMMARY_TOKENS,
        system=PROMPT.format(what=what, name=name, symbol=row["symbol"], filed=row["filed"].strftime("%d %b %Y")),
        messages=[{"role": "user", "content": "\n\n".join(body)}])
    return clean_summary("".join(getattr(b, "text", "") for b in msg.content), sent)


PAGE_REF = re.compile(r"\(pp?\.\s*([\d,\s\-–and]+)\)")
FIGURE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _refs(line: str) -> List[int]:
    """The pages a point cites: "(p. 5)", "(pp. 5, 7)", "(pp. 5-7)" -> [5], [5, 7], [5, 6, 7]."""
    out: List[int] = []
    for grp in PAGE_REF.findall(line):
        for lo, hi, one in re.findall(r"(\d+)\s*[-–]\s*(\d+)|(\d+)", grp):
            if one:
                out.append(int(one))
            else:
                out.extend(range(int(lo), min(int(hi), int(lo) + 30) + 1))
    return out


def _figures(text: str) -> List[str]:
    """The figures of a line that a reader could check: two or more digits, commas dropped ("1,234.5" -> "1234.5")."""
    return [f.replace(",", "") for f in FIGURE.findall(text) if len(f.replace(",", "").replace(".", "")) >= 2]


def _cited_ok(line: str, sent: Dict[int, str]) -> bool:
    """Task #432, citations checked: a point's page references must be pages the model was given, and when it carries figures at least one of them
    must be printed on a page it cites (commas ignored). A point that fails is dropped, never shown. A point with no reference is kept."""
    refs = _refs(line)
    if not refs:
        return True
    if any(r not in sent for r in refs):
        return False
    figs = _figures(PAGE_REF.sub("", line))
    if not figs:
        return True
    pages = " ".join(sent[r].replace(",", "") for r in refs)
    return any(f in pages for f in figs)


def _is_heading(ln: str) -> bool:
    s = ln.strip()
    return s.startswith("#") or (s.startswith("**") and s.rstrip(":").endswith("**"))


def clean_summary(text: str, sent: Optional[Dict[int, str]] = None) -> str:
    """A line that reads as advice (buy / sell / hold, a target, 'best' ...) is dropped, never shown; so is a point whose citation does not check out
    (when the pages it was written from are given), and then any heading or subheading left with no point under it. Prose lines the model wrote
    outside the headings are dropped too (task #432: points, not paragraphs)."""
    from ..ask.service import reads_like_advice
    lines = [ln.rstrip() for ln in (text or "").strip().splitlines() if ln.strip() and not reads_like_advice(ln)]
    lines = [ln for ln in lines if _is_heading(ln) or ln.lstrip().startswith(("-", "•", "*"))]
    if sent is not None:
        lines = [ln for ln in lines if _is_heading(ln) or _cited_ok(ln, sent)]
    def level(ln: str) -> int:   # 2 a heading, 3 a subheading, 9 a point
        return 3 if ln.lstrip().startswith("### ") else (2 if _is_heading(ln) else 9)
    # from the end: a heading stays only when a point, or a kept subheading for a heading, sits under it
    final: List[str] = []
    for ln in reversed(lines):
        lv = level(ln)
        if lv < 9:
            nxt = level(final[0]) if final else 0
            if not (nxt == 9 or (lv == 2 and nxt == 3)):
                continue
        final.insert(0, ln)
    return "\n".join(final).strip()


@router.post("/summary")
async def summary(request: Request, body: SummaryIn, ctx: Ctx = Depends(secure_ctx)):
    from ..ask import docstore, quota
    from ..ask.pages import _read_pages, DamagedFile, ToolError
    store, st = request.app.state.store, request.app.state.settings
    row = await _doc_row(request, body.link, ("transcript", "presentation"))
    cap = quota.allowance(ctx, "summary")
    if cap <= 0:
        raise fail(403, "plan_required", "AI summaries are part of every paid plan (10 a month, counted with the FinLit Prism summaries).", plan="silver")
    async with store.pool.acquire() as conn:
        kept = await conn.fetchrow("SELECT text, source_kind, created_at FROM concall_summaries WHERE link = $1", body.link)
        name = await conn.fetchval("SELECT name FROM companies WHERE symbol = $1", row["symbol"]) or row["symbol"]
    month = quota.month_of()
    # task #432: a summary kept in the old short form (fixed headings) is written again once in the new form, without using anyone's summaries
    upgrade = bool(kept) and not is_sectioned(kept["text"]) and bool(st.anthropic_api_key)
    if kept and not upgrade:      # written before: opens free, for everyone on the plan
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
    n = await (quota.used(store.pool, ctx.user_id, month, "summary") if upgrade else quota.take(store.pool, ctx.user_id, cap, month, "summary"))
    if n is None:
        nxt = quota.next_month(month).strftime("%d %b %Y")
        raise fail(429, "quota_used", f"You have used all {cap} AI summaries of this month. They renew on {nxt}. Summaries other members already opened "
                   "stay free.", **quota.status(cap, cap, month))
    try:
        text = await _write_summary(request, row, pages, name)
    except Exception:
        log.warning("concall summary failed for %s", body.link[-60:], exc_info=True)
        text = ""
    if not text:
        if upgrade:   # the old summary is still there: show it rather than nothing
            return _json({"text": kept["text"], "source": kept["source_kind"], "link": body.link, "written": kept["created_at"].isoformat(),
                          "cached": True, **quota.status(cap, n, month), "disclaimer": DISCLAIMER})
        await quota.give_back(store.pool, ctx.user_id, month, "summary")
        raise fail(502, "not_written", "The summary could not be written just now; none of your summaries was used. Try again in a few minutes.")
    async with store.pool.acquire() as conn:
        if upgrade:   # only over the old text, so two members asking at once keep one
            await conn.execute("UPDATE concall_summaries SET text = $2, source_kind = $3, pages = $4, model = $5, created_at = now() "
                               "WHERE link = $1 AND text = $6", body.link, text, row["kind"], len(pages), st.ask_model, kept["text"])
        else:
            await conn.execute("INSERT INTO concall_summaries (link, symbol, source_kind, text, pages, model) VALUES ($1,$2,$3,$4,$5,$6) "
                               "ON CONFLICT (link) DO NOTHING", body.link, row["symbol"], row["kind"], text, len(pages), st.ask_model)
    return _json({"text": text, "source": row["kind"], "link": body.link, "written": None, "cached": upgrade, "rewritten": upgrade,
                  **quota.status(cap, n, month), "disclaimer": DISCLAIMER})
