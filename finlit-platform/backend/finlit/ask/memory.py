"""Task #349 PR 2: question memory for Ask FinLit AI (table ai_question_memory, migration 135; docs/ASK-AI.md "Question memory").

What a Silver or Gold member asked, the key lines of the answer and the figures it cited (each with its as-of date), kept for 180 days (at most 200
rows per member), so a later answer can say what changed "since you last asked". This module only stores, lists and deletes: nothing here changes
an answer, and nothing here runs a model.

  topic_of(...)        "<kind>:<id>:<intent>" from what ask/api.py already worked out (the companies named, the page's company, routing.classify)
  extract_points(...)  the answer's key lines (at most 8 of at most 160 characters)
  extract_figures(...) the figures the answer read from FinLit's tools: price, 52-week range, FinLit Prism, P/E, market cap, sector state, results,
                       the newest news or filing; each with its date. Only what the tools returned for this answer: nothing is looked up again.
  record(...)          one row, or nothing for: an AI summary, an error or withdrawn answer, an admin's "view as" preview, a member with
                       prefs.aiMemory false, a plan without written answers. Prunes the member's rows on every write.
  list / clear / delete  the member's own rows; every query is scoped to user_id.
  after_answer(...)    the hook ask/api.py calls once an answer is complete: it gathers the tool results and writes in the background, so the
                       answer is never held up and a failure here never reaches the member."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from . import quota, routing, service

log = logging.getLogger("finlit.ask.memory")
_List = list      # the builtin: this module defines its own list() (the member's rows) further down

RETENTION_DAYS = 180
MAX_ROWS = 200
MAX_POINTS = 8
POINT_CHARS = 160
QUESTION_CHARS = 500
INTENTS = ("overview", "results", "valuation", "prism", "news", "documents", "price", "risks", "ownership", "concept")
KINDS = ("company", "fund", "etf", "sector", "economy", "market", "concept", "general")

# ------------------------------------------------------------------------------------------------ 1. the topic, without a model
_PRISM = re.compile(r"\b(prism|finlit score|finlit rating|rating|g&p|score)\b", re.I)
_VALUE = re.compile(r"(\bp\s?/\s?e\b|\bpe\b|\bpe ratio\b|price[- ]to[- ](?:earnings|book|sales)|\bp\s?/\s?b\b|\bev\s?/\s?ebitda\b|\bvaluations?\b|\bvalued\b"
                    r"|\bover ?valued\b|\bunder ?valued\b|\bexpensive\b|\bcheap\b|\bmehenga\b|\bmahanga\b|\bmehnga\b|\bsasta\b|\bmarket cap\b|\bmcap\b"
                    r"|\bintrinsic\b|\bfair value\b|\bdcf\b|\bmultiples?\b)", re.I)
_RESULTS = re.compile(r"\b(results?|quarter(?:ly)?|q[1-4]|profit|profits|revenue|sales|turnover|earnings|ebitda|margins?|eps|nateeje|natija|munafa|kamai"
                      r"|roe|roce|roa|guidance)\b", re.I)
_OWNERSHIP = re.compile(r"\b(shareholding|share holding|promoters?|pledge[ds]?|stake|ownership|holding pattern|fii holding|dii holding|who owns"
                        r"|hissedari|superinvestors?|mutual fund holding|institutional holding)\b", re.I)
_PRICE = re.compile(r"\b(price|share price|stock price|ltp|52[- ]?week|trading at|quote|bhav|bhaav|daam|chart|price trend|all[- ]time high|kitne ka"
                    r"|high|low)\b", re.I)
_RISKS = re.compile(r"\b(risks?|red ?flags?|issues?|problems?|concerns?|worr(?:y|ies)|challenges?|headwinds?|weak(?:ness)?|negatives?|cons"
                    r"|dikkat|khatra|jokhim|pareshani|debt|borrowings?|npas?|gnpa|nnpa|asset quality)\b", re.I)
_NEWS = re.compile(r"\b(news|today|aaj|latest|announced|announcement|khabar|kya hua|what happened|why did|why is|kyu|kyun|kyon)\b", re.I)
_MARKET = re.compile(r"\b(nifty|sensex|market|markets|bazaar|bazar|indices|index|bank nifty|midcap|smallcap|fii|dii|flows?)\b", re.I)
_ETF = re.compile(r"\betfs?\b", re.I)
_CONCEPT_STOP = set("""what whats is are was the a an of does do did mean means meaning define definition explain explained how work works working
kya hai hain hota hoti hote matlab samjhao samjha samjhaiye kaise kaam ka ki ke in for to and me mein please tell about difference between
term terms concept by with on it this that why when which who can i we you meant called ratio ratios rule rules""".split())
_WORDS = re.compile(r"[a-z0-9&/]+")


def _slug(text: str, n: int = 3) -> str:
    words = [w.replace("/", "") for w in _WORDS.findall((text or "").lower())]
    words = [w for w in words if len(w) > 1 and w not in _CONCEPT_STOP]
    return "-".join(words[:n])[:60] or "general"


def intent_of(question: str, kinds: Sequence[str] = ()) -> str:
    """The intent of a question, from the same words the classifiers read (routing.classify's kinds, service's document patterns). Deterministic,
    in a fixed order."""
    q = question or ""
    if _PRISM.search(q):
        return "prism"
    if service._TRANSCRIPT.search(q) or service._ANNUAL.search(q) or service._PRESENTATION.search(q) or service._IP.search(q):
        return "documents"
    if _VALUE.search(q) or "valuation" in kinds:
        return "valuation"
    if _RESULTS.search(q):
        return "results"
    if _OWNERSHIP.search(q):
        return "ownership"
    if _PRICE.search(q):
        return "price"
    if _RISKS.search(q):
        return "risks"
    if "news" in kinds or _NEWS.search(q):
        return "news"
    if "concept" in kinds:
        return "concept"
    return "overview"


def _clean_id(v: Any) -> str:
    return re.sub(r"[^A-Za-z0-9&_.\-]", "", str(v or ""))[:80]


def topic_of(question: str, named_companies: Sequence[str] = (), page_company: Optional[str] = None, fund_ctx: Optional[Dict[str, Any]] = None,
             kind: Sequence[str] = ()) -> Tuple[str, str, str, str]:
    """(topic_key, subject_kind, subject_id, intent). `kind` is the kinds routing.classify gave the question. The subject, in this order: the first
    company the question names, the page's company (ask/api.py passes it only when the question is about it), the fund or ETF in context, a fund
    or ETF question, a sector routing._SECTORS finds, the economy, the market, a term (a concept question), else general."""
    q = question or ""
    kinds = [*kind]
    intent = intent_of(q, kinds)
    sym = next((s for s in named_companies if s), None) or page_company
    if sym:
        sk, sid = "company", _clean_id(str(sym).upper())
    elif fund_ctx and fund_ctx.get("id"):
        sk, sid = ("etf" if fund_ctx.get("kind") == "etf" else "fund"), _clean_id(fund_ctx.get("id"))
    elif "funds" in kinds:
        sk, sid = ("etf" if _ETF.search(q) else "fund"), "all"
    elif any(k.startswith("sector:") for k in kinds):
        sk, sid = "sector", next(k for k in kinds if k.startswith("sector:")).split(":", 1)[1]
    elif "economy" in kinds:
        sk, sid = "economy", "india"
    elif _MARKET.search(q):
        sk, sid = "market", "india"
    elif "concept" in kinds or "valuation" in kinds or "regulation" in kinds:
        sk, sid, intent = "concept", _slug(q), "concept"
    else:
        sk, sid = "general", "all"
    if sid in ("all", "india") and intent == "overview" and routing._CONCEPT.search(q):
        intent = "concept"                  # "SIP kya hai", "what is the repo rate": a meaning, inside a field
    sid = sid or "all"
    return f"{sk}:{sid}:{intent}", sk, sid, intent


# ------------------------------------------------------------------------------------------------ 2. the answer's key lines
_MARK = re.compile(r"^\s*(?:[-*•·]+|\d{1,2}[.)])\s*")


def _cut(text: str, n: int = POINT_CHARS) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= n:
        return text
    cut = text[: n - 1].rsplit(" ", 1)[0] or text[: n - 1]
    return cut.rstrip(",;:") + "…"


def extract_points(answer_text: str) -> List[str]:
    """Up to 8 lines of the answer, each at most 160 characters: bullets and numbers dropped, bold marks removed, blank lines and the "Sources:" line
    left out. A single paragraph is split into its sentences."""
    text = (answer_text or "").replace("**", "").replace("__", "")
    lines = [_MARK.sub("", ln).strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln and not ln.lower().startswith("sources:") and not re.fullmatch(r"[#\-_=*\s]+", ln)]
    if len(lines) == 1:
        lines = [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9₹])", lines[0]) if s.strip()]
    out: List[str] = []
    for ln in lines:
        ln = re.sub(r"^#+\s*", "", ln)
        if ln and ln not in out:
            out.append(_cut(ln))
        if len(out) >= MAX_POINTS:
            break
    return out


# ------------------------------------------------------------------------------------------------ 3. the figures the answer read
def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _short(v: Any, n: int = 120) -> Optional[str]:
    return str(v)[:n] if v not in (None, "") else None


def _drop_none(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None and v != {} and v != []}


def _prism(p: Any, as_of: Any) -> Optional[Dict[str, Any]]:
    """FinLit Prism only when the tool returned a score (a plan without it gets {"unavailable"}: nothing is kept)."""
    if not isinstance(p, dict) or p.get("unavailable"):
        return None
    score = _num(p.get("score")) if "score" in p else _num(p.get("final"))
    if score is None:
        return None
    parts = p.get("parts") if isinstance(p.get("parts"), dict) else None
    return _drop_none({"score": score, "label": _short(p.get("label"), 40), "status": _short(p.get("status"), 20),
                       "parts": {str(k)[:24]: _num(v) for k, v in parts.items() if _num(v) is not None} if parts else None,
                       "modelVersion": _short(p.get("modelVersion") or p.get("model_version"), 40),
                       "asOf": _short(p.get("calculatedAt") or p.get("generatedAt") or as_of, 40)})


def _metric(rows: Any, key: str) -> Optional[Dict[str, Any]]:
    """keyMetrics is a list of {key, value, unit, period}; get_ratios' `latest` a map of key -> {value, unit, period}."""
    if isinstance(rows, _List):
        rows = {r.get("key"): r for r in rows if isinstance(r, dict)}
    r = (rows or {}).get(key) if isinstance(rows, dict) else None
    if not isinstance(r, dict) or _num(r.get("value")) is None:
        return None
    return _drop_none({"value": _num(r.get("value")), "unit": _short(r.get("unit"), 12), "period": _short(r.get("period"), 24)})


def _sector_state(data: Any, depth: int = 0) -> Optional[Dict[str, Any]]:
    """A sector's box or state (Sector Pulse, Sector Rotation), when a tool result carries one."""
    if not isinstance(data, dict) or depth > 3:
        return None
    for k, v in data.items():
        lk = str(k).lower()
        if "sector" in lk or "industry" in lk or "rotation" in lk:
            if isinstance(v, dict):
                got = {f: _short(v.get(f), 40) for f in ("box", "state", "corner", "quadrant") if v.get(f) not in (None, "")}
                if got:
                    return _drop_none({**got, "name": _short(v.get("name") or v.get("label") or v.get("sector"), 60), "asOf": _short(v.get("asOf"), 40)})
        if isinstance(v, dict):
            got2 = _sector_state(v, depth + 1)
            if got2:
                return got2
    return None


def _parse(text: Any) -> Optional[Dict[str, Any]]:
    if isinstance(text, dict):
        return text
    if not isinstance(text, str) or not text.startswith("{"):
        return None
    try:
        v = json.loads(text)
    except ValueError:
        return None
    return v if isinstance(v, dict) else None


def extract_figures(tool_results: Iterable[Tuple[str, Dict[str, Any], Any]]) -> Dict[str, Any]:
    """The figures in the tool results this answer read: (tool name, arguments, result text). Kept per company:
    price and its as-of, 52-week range, FinLit Prism (score, label, parts, model version and as-of, only when returned), P/E, market cap, the sector's
    box or state, the latest results (period and filing date), the newest news or filing (id and date). Nothing is looked up again."""
    cos: Dict[str, Dict[str, Any]] = {}
    feed: Optional[Dict[str, Any]] = None
    sector: Optional[Dict[str, Any]] = None
    for name, args, text in tool_results:
        env = _parse(text)
        if not env:
            continue
        data = env.get("data") if isinstance(env.get("data"), dict) else {}
        as_of = env.get("asOf")
        sym = _clean_id(str(data.get("symbol") or (args or {}).get("symbol") or "").upper())
        co = cos.setdefault(sym, {}) if sym else {}
        quote = data.get("quote") if isinstance(data.get("quote"), dict) else None
        if quote and _num(quote.get("price")) is not None and sym:
            co["price"] = _drop_none({"value": _num(quote.get("price")), "changePct": _num(quote.get("changePct")),
                                      "asOf": _short(quote.get("asOf") or as_of, 40)})
        r52 = data.get("range52") if isinstance(data.get("range52"), dict) else None
        if r52 and sym and (_num(r52.get("high")) is not None or _num(r52.get("low")) is not None):
            co["range52"] = _drop_none({"high": _num(r52.get("high")), "low": _num(r52.get("low")),
                                        "asOf": _short((quote or {}).get("asOf") or as_of, 40)})
        if sym:
            pr = _prism(data.get("finlitPrism"), as_of) or (_prism(data.get("score"), as_of) if name == "get_finlit_score" else None)
            if pr:
                co["prism"] = pr
            metrics = data.get("keyMetrics") if data.get("keyMetrics") is not None else data.get("latest")
            for key, out in (("pe", "pe"), ("market_cap", "marketCap")):
                m = _metric(metrics, key)
                if m:
                    co[out] = {**m, "asOf": _short(as_of, 40)} if as_of else m
            prof = data.get("profile") if isinstance(data.get("profile"), dict) else {}
            if "marketCap" not in co and _num(prof.get("marketCapCr")) is not None:
                co["marketCap"] = _drop_none({"value": _num(prof.get("marketCapCr")), "unit": "Cr", "asOf": _short(as_of, 40)})
        if name == "read_company_document" and data.get("filed") and sym:
            doc = _drop_none({"document": _short(data.get("document"), 40), "title": _short(data.get("title")), "filed": _short(data.get("filed"), 40),
                              "link": _short(data.get("link"), 300)})
            if str(data.get("document") or "").lower().startswith("results"):
                co["results"] = doc
            else:
                docs = co.setdefault("documents", [])
                if len(docs) < 3:
                    docs.append(doc)
        if name in ("get_quarter_results", "get_results_calendar") and isinstance(data.get("rows"), _List):
            for row in data["rows"]:
                rs = _clean_id(str((row or {}).get("symbol") or "").upper())
                if rs and rs in cos | ({sym: {}} if sym else {}) and isinstance(row, dict):
                    cos.setdefault(rs, {})["results"] = _drop_none({"period": _short(data.get("quarterLabel") or data.get("quarter"), 24),
                                                                    "periodEnd": _short(row.get("periodEnd"), 24), "filed": _short(row.get("date"), 40),
                                                                    "status": _short(row.get("status"), 20)})
        if name == "get_news_and_filings" and isinstance(data.get("items"), _List) and data["items"]:
            items = [i for i in data["items"] if isinstance(i, dict)]
            newest = max(items, key=lambda i: str(i.get("date") or ""), default=None)
            if newest:
                row = _drop_none({"id": _short(newest.get("id") or newest.get("link"), 300), "date": _short(newest.get("date"), 40),
                                  "title": _short(newest.get("title")), "kind": _short(data.get("kind"), 20)})
                isym = _clean_id(str(newest.get("symbol") or sym or "").upper())
                if isym:
                    cos.setdefault(isym, {})["newest"] = row
                else:
                    feed = row
        st = _sector_state(data)
        if st:
            if sym:
                co["sector"] = st
            else:
                sector = st
    out: Dict[str, Any] = {}
    cos = {k: v for k, v in cos.items() if v}
    if cos:
        out["companies"] = dict(sorted(cos.items())[:4])
    if feed:
        out["feed"] = feed
    if sector:
        out["sector"] = sector
    return out


def tool_results_of(messages: Sequence[Dict[str, Any]], before: Sequence[Tuple[str, Dict[str, Any], Dict[str, Any]]] = ()
                    ) -> List[Tuple[str, Dict[str, Any], Any]]:
    """The (name, arguments, result text) of every tool the answer read: `before` (the company cards read before the model started, as
    tools.run results) and each tool_use / tool_result pair in the conversation (the reads made before the model and the model's own rounds).
    Errors are left out."""
    out: List[Tuple[str, Dict[str, Any], Any]] = [(n, a or {}, r.get("text")) for n, a, r in before if isinstance(r, dict) and not r.get("error")]
    calls: Dict[str, Tuple[str, Dict[str, Any]]] = {}

    def field(b: Any, k: str) -> Any:
        return b.get(k) if isinstance(b, dict) else getattr(b, k, None)

    for m in messages:
        content = m.get("content") if isinstance(m, dict) else None
        if not isinstance(content, (_List, tuple)):
            continue
        for b in content:
            t = field(b, "type")
            if t == "tool_use":
                inp = field(b, "input")
                calls[str(field(b, "id"))] = (str(field(b, "name")), inp if isinstance(inp, dict) else {})
            elif t == "tool_result" and not field(b, "is_error"):
                hit = calls.get(str(field(b, "tool_use_id")))
                if hit:
                    out.append((hit[0], hit[1], field(b, "content")))
    return out


# ------------------------------------------------------------------------------------------------ 4. storage
def _viewing_as(ctx: Any) -> bool:
    return bool((getattr(ctx, "extra", None) or {}).get("view_as"))


async def remembers(pool, user_id: str) -> bool:
    """prefs.aiMemory, true unless the member switched it off (older saved prefs have no such field: on)."""
    async with pool.acquire() as conn:
        v = await conn.fetchval("SELECT prefs->>'aiMemory' FROM user_state WHERE user_id = $1", user_id)
    return v != "false"


async def record(pool, ctx: Any, *, kind: str, question: str, result: Optional[Dict[str, Any]], topic: Tuple[str, str, str, str],
                 figures: Optional[Dict[str, Any]] = None, error: bool = False) -> Optional[int]:
    """Writes one row for a completed written answer and prunes the member's rows; returns its id, or None when nothing is written: an AI summary,
    an error, a withdrawn or empty answer, an admin's "view as" preview, a plan without written answers, or prefs.aiMemory false."""
    if kind != "question" or error or not result or not getattr(ctx, "authed", False) or _viewing_as(ctx):
        return None
    text = (result.get("text") or "").strip()
    if not text or result.get("stop") in ("withdrawn", "refusal") or text == service.WITHDRAWN:
        return None
    if quota.allowance(ctx) <= 0:           # Silver and Gold only (written answers); Basic and visitors keep the listed questions
        return None
    if not await remembers(pool, ctx.user_id):
        return None
    key, sk, sid, intent = topic
    plan = "admin" if getattr(ctx, "role", "") == "admin" else str(getattr(ctx, "plan", ""))[:20]
    async with pool.acquire() as conn:
        async with conn.transaction():
            rid = await conn.fetchval(
                "INSERT INTO ai_question_memory (user_id, topic_key, subject_kind, subject_id, intent, question, points, figures, plan) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9) RETURNING id",
                ctx.user_id, key[:200], sk[:20], sid[:80], intent[:20], (question or "").strip()[:QUESTION_CHARS],
                json.dumps(extract_points(text), ensure_ascii=False), json.dumps(figures or {}, ensure_ascii=False, default=str), plan)
            await _prune(conn, ctx.user_id)
    return rid


async def _prune(conn, user_id: str) -> None:
    await conn.execute("DELETE FROM ai_question_memory WHERE user_id = $1 AND asked_at < now() - make_interval(days => $2)", user_id, RETENTION_DAYS)
    await conn.execute("DELETE FROM ai_question_memory WHERE user_id = $1 AND id IN (SELECT id FROM ai_question_memory WHERE user_id = $1 "
                       "ORDER BY asked_at DESC, id DESC OFFSET $2)", user_id, MAX_ROWS)


def _row(r: Any) -> Dict[str, Any]:
    return {"id": r["id"], "askedAt": r["asked_at"].isoformat(), "topic": r["topic_key"], "subjectKind": r["subject_kind"], "subjectId": r["subject_id"],
            "intent": r["intent"], "question": r["question"]}


async def count(pool, user_id: str) -> int:
    async with pool.acquire() as conn:
        return int(await conn.fetchval("SELECT count(*) FROM ai_question_memory WHERE user_id = $1 AND asked_at >= now() - make_interval(days => $2)",
                                       user_id, RETENTION_DAYS) or 0)


async def list(pool, user_id: str, limit: int = 50) -> Dict[str, Any]:  # noqa: A001 - the name the design gives it
    """The member's questions, newest first (rows past 180 days are deleted first), and how many are kept."""
    limit = max(1, min(int(limit), MAX_ROWS))
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM ai_question_memory WHERE user_id = $1 AND asked_at < now() - make_interval(days => $2)", user_id, RETENTION_DAYS)
        rows = await conn.fetch("SELECT id, asked_at, topic_key, subject_kind, subject_id, intent, question FROM ai_question_memory "
                                "WHERE user_id = $1 ORDER BY asked_at DESC, id DESC LIMIT $2", user_id, limit)
        n = await conn.fetchval("SELECT count(*) FROM ai_question_memory WHERE user_id = $1", user_id)
    return {"items": [_row(r) for r in rows], "count": int(n or 0)}


async def clear(pool, user_id: str) -> int:
    async with pool.acquire() as conn:
        res = await conn.execute("DELETE FROM ai_question_memory WHERE user_id = $1", user_id)
    return int(res.split()[-1]) if isinstance(res, str) and res.split()[-1].isdigit() else 0


async def delete(pool, user_id: str, row_id: int) -> bool:
    async with pool.acquire() as conn:
        res = await conn.execute("DELETE FROM ai_question_memory WHERE user_id = $1 AND id = $2", user_id, row_id)
    return res == "DELETE 1"


# ------------------------------------------------------------------------------------------------ 5. the hook in the answer path
_pending: Set["asyncio.Task[Any]"] = set()


def after_answer(pool, ctx: Any, *, kind: str, question: str, result: Optional[Dict[str, Any]], named: Sequence[str], page: Optional[str],
                 kinds: Sequence[str], messages: Sequence[Dict[str, Any]], cards: Sequence[Tuple[str, Dict[str, Any], Dict[str, Any]]] = (),
                 fund_ctx: Optional[Dict[str, Any]] = None) -> None:
    """Called by ask/api.py once an answer is complete. Returns at once: the row is written in the background, and any failure is logged, never
    shown. Reads only what the answer already read (the cards and the tool results in `messages`)."""
    if kind != "question" or not result or _viewing_as(ctx):
        return
    try:
        topic = topic_of(question, named, page, fund_ctx, kinds)
        figures = extract_figures(tool_results_of(messages, cards))
    except Exception:
        log.warning("ask memory: the answer's topic or figures could not be read", exc_info=True)
        return

    async def write() -> None:
        try:
            await record(pool, ctx, kind=kind, question=question, result=result, topic=topic, figures=figures)
        except Exception:
            log.warning("ask memory: the question could not be kept", exc_info=True)

    task = asyncio.get_running_loop().create_task(write())
    _pending.add(task)
    task.add_done_callback(_pending.discard)


async def drain() -> None:
    """Waits for the rows being written (tests, and a clean shutdown)."""
    while _pending:
        await asyncio.gather(*[*_pending], return_exceptions=True)
