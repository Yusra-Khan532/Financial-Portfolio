"""Task #349 PR 2: question memory for Ask FinLit AI (table ai_question_memory, migration 135; docs/ASK-AI.md "Question memory").

What a Silver or Gold member asked, the key lines of the answer and the figures it cited (each with its as-of date), kept for 180 days (at most 200
rows per member), so a later answer can say what changed "since you last asked" (section 6, task #349 PR 3). Nothing here runs a model.

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
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from . import quota, routing, service

log = logging.getLogger("finlit.ask.memory")
_List = list      # the builtin: this module defines its own list() (the member's rows) further down

RETENTION_DAYS = 180
MAX_ROWS = 200
MAX_POINTS = 8
POINT_CHARS = 160
QUESTION_CHARS = 500
INTENTS = ("overview", "results", "valuation", "prism", "news", "documents", "price", "risks", "ownership", "concept", "whatsnew")
KINDS = ("company", "fund", "etf", "sector", "economy", "market", "concept", "general", "mine")
WHATSNEW_TOPIC = ("mine:-:whatsnew", "mine", "-", "whatsnew")     # task #349 PR 5: "what's new for me" (ask/whatsnew.py)

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
# Task #349 PR 5: "anything new in my holdings?", "what changed in my portfolio this week", "kya naya hai mere stocks mein": what is new in the
# companies the member holds or watches. Both a word for new or changed and a word for their own companies; "how do I add a new share to my
# portfolio" is a how-to, not this.
_WN_NEW = re.compile(r"\b(new|news|changed?|changes|happened|happening|updates?|moved|naya|nayi|naye|badla|badli|badle|badlav|kya hua|hua kya)\b", re.I)
_WN_MINE = re.compile(r"\b(my|mere|meri|mera|apne|apni|apna)\s+(?:own\s+)?(holdings?|portfolio|stocks?|shares?|watch ?lists?|companies|investments?"
                      r"|positions?)\b", re.I)
_WN_FOR_ME = re.compile(r"\b(what'?s|whats|anything|kuch) new for me\b|\bwhat'?s new with me\b", re.I)
_WN_NOT = re.compile(r"\b(how (?:do|can|to)|add|adding|import|upload|delete|remove|create|edit|rename|sort)\b", re.I)


def asks_whatsnew(question: str) -> bool:
    """Task #349 PR 5: the question asks what is new in the member's own companies (their holdings and watchlists)."""
    q = question or ""
    if _WN_NOT.search(q):
        return False
    return bool(_WN_FOR_ME.search(q) or (_WN_NEW.search(q) and _WN_MINE.search(q)))


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
    if asks_whatsnew(q):
        return WHATSNEW_TOPIC
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
    elif "sectors" in kinds:                # task #349 fix D: "how is the banking sector doing?", "which sectors are leading?"
        sk, sid = "sector", "all"
    elif "economy" in kinds or routing._ECONOMY_WORDS.search(q):       # task #349 fix D: "what did RBI do on rates?"
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


def shown_subject(question: str, subject_kind: str, subject_id: str) -> Tuple[str, str]:
    """Task #349 fix D: the subject a history row is labelled with. Rows kept before fix C took the pinned company as the subject of an RBI or
    a sector question ("· BSE"); such a row (a field question that does not name its company) is labelled by its field instead. Nothing stored
    is changed."""
    if subject_kind != "company" or not routing.off_company(question):
        return subject_kind, subject_id
    q = re.sub(r"\s+", "", (question or "").lower())
    if subject_id and subject_id.lower() in q:
        return subject_kind, subject_id
    _, sk, sid, _ = topic_of(question, (), None, None, routing.classify(question))
    return sk, sid


def _row(r: Any) -> Dict[str, Any]:
    sk, sid = shown_subject(r["question"], r["subject_kind"], r["subject_id"])
    return {"id": r["id"], "askedAt": r["asked_at"].isoformat(), "topic": r["topic_key"], "subjectKind": sk, "subjectId": sid,
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
                 fund_ctx: Optional[Dict[str, Any]] = None, figures: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Called by ask/api.py once an answer is complete. Returns at once: the row is written in the background, and any failure is logged, never
    shown. Reads only what the answer already read (the cards and the tool results in `messages`); `figures` (task #349 PR 5, "what's new for
    me") replaces them with the figures that answer compared, so the next "what's new" starts from them. Returns {"topic", "figures"} (task #349 PR 3:
    kept with the cached answer, so a replay from the cache is kept too), or None when nothing is written."""
    if kind != "question" or not result or _viewing_as(ctx):
        return None
    try:
        topic = topic_of(question, named, page, fund_ctx, kinds)
        figures = figures if figures is not None else extract_figures(tool_results_of(messages, cards))
    except Exception:
        log.warning("ask memory: the answer's topic or figures could not be read", exc_info=True)
        return None
    keep(pool, ctx, question=question, result=result, topic=topic, figures=figures)
    return {"topic": [*topic], "figures": figures}


def keep(pool, ctx: Any, *, question: str, result: Dict[str, Any], topic: Sequence[str], figures: Dict[str, Any]) -> None:
    """Writes the row in the background (record's rules apply); a failure is logged, never shown."""
    if _viewing_as(ctx) or len(topic) != 4:
        return
    t = (str(topic[0]), str(topic[1]), str(topic[2]), str(topic[3]))

    async def write() -> None:
        try:
            await record(pool, ctx, kind="question", question=question, result=result, topic=t, figures=figures)
        except Exception:
            log.warning("ask memory: the question could not be kept", exc_info=True)

    task = asyncio.get_running_loop().create_task(write())
    _pending.add(task)
    task.add_done_callback(_pending.discard)


async def drain() -> None:
    """Waits for the rows being written (tests, and a clean shutdown)."""
    while _pending:
        await asyncio.gather(*[*_pending], return_exceptions=True)


# ------------------------------------------------------------------------------------------------ 6. "since you last asked" (task #349 PR 3)
# A repeat of a question after a while is answered with what changed and what is new, not the same answer again. Everything here is deterministic:
# which earlier row matches (match), what changed between its figures and today's (diff), and the note placed with the question (since_note). The
# model only writes the words, from these facts.
SINCE_AFTER = timedelta(hours=1)       # a repeat sooner than this is the same reading: no since block
SINCE_WITHIN = timedelta(days=30)      # an older question is a new question
SINCE_NEWS = 3                         # at most this many new filings are named
_PLAN_RANK = {"basic": 0, "silver": 1, "gold": 2, "admin": 3}


def since_miss_reason(question_kind: str, history: Sequence[Any], fresh: bool, topic: Tuple[str, str, str, str]) -> Optional[str]:
    """Why no earlier answer is looked for (a follow-up, the member asked for the full answer, a concept question, no subject), else None."""
    _, sk, _, intent = topic
    if question_kind != "question":
        return "summary"
    if history:
        return "followup"
    if fresh:
        return "fresh"
    if sk == "mine":
        return "whatsnew"                   # task #349 PR 5: answered from the member's own companies instead
    if sk == "concept" or intent == "concept":
        return "concept"
    if sk == "general":
        return "no_subject"
    return None


async def has_recent(pool, user_id: str) -> bool:
    """One cheap read before anything else: the member remembers (prefs.aiMemory) and has a question kept between 1 hour and 30 days ago. False
    means no earlier answer can match, so nothing else is read and the answer is made exactly as before."""
    async with pool.acquire() as conn:
        return bool(await conn.fetchval(
            "SELECT COALESCE((SELECT prefs->>'aiMemory' FROM user_state WHERE user_id = $1), '') <> 'false' AND EXISTS ("
            "SELECT 1 FROM ai_question_memory WHERE user_id = $1 AND asked_at <= now() - make_interval(secs => $2) "
            "AND asked_at >= now() - make_interval(secs => $3))", user_id, SINCE_AFTER.total_seconds(), SINCE_WITHIN.total_seconds()))


async def match(pool, user_id: str, topic: Tuple[str, str, str, str]) -> Tuple[Optional[Dict[str, Any]], str]:
    """The earlier answer this question repeats, and how: "strong" the same topic key; "weak" the same subject with another intent (a specific
    subject only: a company, a fund, an ETF, a sector; not "all funds" or "the market"). Only when the newest row of the subject was asked at least
    1 hour ago (asked 10 minutes ago, the member has just read it) and the matched row at most 30 days ago. Returns (row or None, the reason)."""
    key, sk, sid, _ = topic
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT ON (topic_key = $4) id, asked_at, topic_key, question, points, figures, plan, (topic_key = $4) AS strong, "
            "asked_at > now() - make_interval(secs => $5) AS recent FROM ai_question_memory "
            "WHERE user_id = $1 AND subject_kind = $2 AND subject_id = $3 AND asked_at >= now() - make_interval(secs => $6) "
            "ORDER BY (topic_key = $4), asked_at DESC, id DESC", user_id, sk, sid, key, SINCE_AFTER.total_seconds(), SINCE_WITHIN.total_seconds())
    by = {bool(r["strong"]): r for r in rows}
    newest = max(rows, key=lambda r: r["asked_at"], default=None)
    if newest is None:
        return None, "none"
    if newest["recent"]:
        return None, "recent"
    strong = by.get(True)
    if strong is not None:
        return _match_row(strong, "strong"), "strong"
    if sid in ("all", "india"):
        return None, "weak_general"
    return _match_row(by[False], "weak"), "weak"


def _match_row(r: Any, how: str) -> Dict[str, Any]:
    def js(v: Any, empty: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except ValueError:
                return empty
        return v if v is not None else empty
    return {"id": r["id"], "askedAt": r["asked_at"], "topic": r["topic_key"], "question": r["question"], "points": js(r["points"], []),
            "figures": js(r["figures"], {}), "plan": r["plan"], "match": how}


async def count_since(redis, field: str, hit: bool = False) -> None:
    """Daily counters: `ask:memory:miss:<day>` (why no earlier answer was used) and `ask:memory:hit:<day>` (strong, weak). Never breaks an answer."""
    try:
        day = datetime.now(service.IST).date().isoformat()
        k = f"ask:memory:{'hit' if hit else 'miss'}:{day}"
        async with redis.pipeline(transaction=False) as p:
            p.hincrby(k, field, 1)
            p.expire(k, 120 * 86400)
            await p.execute()
    except Exception:   # nosec B110 - a counter must never break an answer
        pass


# --- dates and numbers, written the way the answer writes them
def _when(v: Any) -> Optional[datetime]:
    if isinstance(v, datetime):
        return v
    if not isinstance(v, str) or not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.combine(date.fromisoformat(v[:10]), datetime.min.time())
        except ValueError:
            return None


def _ist_day(d: datetime) -> date:
    return (d.astimezone(service.IST) if d.tzinfo is not None else d).date()


def day_of(v: Any) -> Optional[str]:
    """"20 Nov 2026" (India time when the moment carries a zone)."""
    d = _when(v)
    if d is None:
        return None
    d2 = _ist_day(d)
    return f"{d2.day} {d2.strftime('%b %Y')}"


def moment_of(v: Any) -> str:
    """"20 Nov 2026, 3:52 pm IST": when the member asked."""
    d = _when(v)
    if d is None:
        return ""
    d = d.astimezone(service.IST) if d.tzinfo is not None else d
    h = d.hour % 12 or 12
    return f"{d.day} {d.strftime('%b %Y')}, {h}:{d.minute:02d} {'am' if d.hour < 12 else 'pm'} IST"


def _group(n: int) -> str:
    s = str(n)
    if len(s) <= 3:
        return s
    head, parts = s[:-3], [s[-3:]]
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    return ",".join(([head] if head else []) + parts)


def inr(v: float) -> str:
    """₹2,880 or ₹2,880.50, in Indian grouping (₹1,23,456)."""
    paise = int(round(abs(v) * 100))
    return ("-" if v < 0 else "") + "₹" + _group(paise // 100) + (f".{paise % 100:02d}" if paise % 100 else "")


def _num_text(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else f"{v:.1f}"


def _signed(v: float) -> str:
    v = round(v, 1)
    return ("+" if v > 0 else "−" if v < 0 else "±") + _num_text(abs(v))


def _dates(a: Any, b: Any) -> str:
    da, db = day_of(a), day_of(b)
    if da and db:
        return f" ({da} → {db})"
    return f" ({db})" if db else ""


_PART_NAMES = {"fundamental": "fundamental and growth", "valuation": "valuation", "quality": "quality", "risk": "risk"}


def locked_of(tool_results: Iterable[Tuple[str, Dict[str, Any], Any]]) -> Dict[str, Set[str]]:
    """The figures a tool said are not included in the member's plan, per company (today only FinLit Prism carries such a marker)."""
    out: Dict[str, Set[str]] = {}
    for _name, args, text in tool_results:
        env = _parse(text) or {}
        data = env.get("data") if isinstance(env.get("data"), dict) else None
        if not data:
            continue
        sym = _clean_id(str(data.get("symbol") or (args or {}).get("symbol") or "").upper())
        p = data.get("finlitPrism")
        if sym and isinstance(p, dict) and isinstance(p.get("unavailable"), str) and "plan" in p["unavailable"].lower():
            out.setdefault(sym, set()).add("prism")
    return out


def new_items(feed_text: Any, asked_at: Any, limit: int = SINCE_NEWS) -> List[Dict[str, Any]]:
    """The filings FinLit stored with a date after the day of the earlier question (India time), newest first, at most `limit`. The feed gives a
    day, not a time: a filing of that same day may have come before the question, so it is never called new."""
    env = _parse(feed_text) or {}
    data = env.get("data") if isinstance(env.get("data"), dict) else {}
    asked = _when(asked_at)
    if asked is None:
        return []
    asked_day = _ist_day(asked)
    rows: List[Dict[str, Any]] = []
    for i in data.get("items") or []:
        if not isinstance(i, dict):
            continue
        d = _when(i.get("date"))
        if d is None or _ist_day(d) <= asked_day:
            continue
        title = re.sub(r"[<>\s]+", " ", str(i.get("title") or "")).strip()
        if title:
            rows.append({"title": _cut(title, 120), "date": _ist_day(d).isoformat(), "symbol": _clean_id(str(i.get("symbol") or "").upper()) or None})
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows[:limit]


def _fact(kind: str, text: str) -> Dict[str, Any]:
    return {"kind": kind, "text": text}


def _diff_sector(p: Dict[str, Any], n: Dict[str, Any], name: str = "") -> List[Dict[str, Any]]:
    if not p or not n:
        return []
    moved = [f"{f} {p[f]} → {n[f]}" for f in ("box", "state", "corner", "quadrant") if p.get(f) and n.get(f) and p[f] != n[f]]
    if not moved:
        return []
    on = day_of(n.get("asOf"))
    return [_fact("sector", f"{name}{n.get('name') or p.get('name') or 'Sector'}: " + "; ".join(moved) + (f" ({on})" if on else ""))]


def _diff_company(p: Dict[str, Any], n: Dict[str, Any], locked: Set[str], downgraded: bool, asked_at: Any, name: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    pp, np_ = p.get("price") or {}, n.get("price") or {}
    pa, na = _when(pp.get("asOf")), _when(np_.get("asOf"))
    older = pa is not None and na is not None and _ist_day(na) < _ist_day(pa)     # a price older than the one compared with is no change "since"
    if _num(pp.get("value")) and _num(np_.get("value")) is not None and not older:
        a, b = float(pp["value"]), float(np_["value"])
        when = _dates(pp.get("asOf"), np_.get("asOf"))
        if a != b:
            out.append(_fact("price", f"{name}Price {inr(a)} → {inr(b)}, {'+' if b > a else '−'}{inr(abs(b - a))} ({_signed((b - a) / a * 100)}%){when}"))
        else:
            out.append(_fact("price", f"{name}Price unchanged at {inr(b)}{when}"))
    pr, nr = p.get("prism") or {}, n.get("prism") or {}
    if pr and not nr and ("prism" in locked or downgraded):
        out.append(_fact("plan", f"{name}FinLit Prism: not included in your plan now"))
    elif pr and nr and _num(pr.get("score")) is not None and _num(nr.get("score")) is not None:
        when = _dates(pr.get("asOf"), nr.get("asOf"))
        pv, nv = pr.get("modelVersion"), nr.get("modelVersion")
        if pv and nv and pv != nv:
            on = day_of(nr.get("asOf"))
            out.append(_fact("formula", f"FinLit updated the Prism formula{' on ' + on if on else ' since then'}, so the score is not like for like"))
        d = float(nr["score"]) - float(pr["score"])
        if abs(d) >= 1:
            out.append(_fact("prism", f"{name}FinLit Prism {_num_text(float(pr['score']))} → {_num_text(float(nr['score']))} ({_signed(d)}){when}"))
        if pr.get("label") and nr.get("label") and pr["label"] != nr["label"]:
            out.append(_fact("prism", f"{name}FinLit Prism label {pr['label']} → {nr['label']}{when}"))
        moved = []
        for k, v in (nr.get("parts") or {}).items():
            was = (pr.get("parts") or {}).get(k)
            if _num(was) is not None and _num(v) is not None and abs(float(v) - float(was)) >= 1:
                moved.append(f"{_PART_NAMES.get(k, k)} {_num_text(float(was))} → {_num_text(float(v))} ({_signed(float(v) - float(was))})")
        if moved:
            out.append(_fact("prism", f"{name}Prism parts: " + "; ".join(moved) + when))
    pres, nres = p.get("results") or {}, n.get("results") or {}
    if nres:
        nf, pf_, asked = _when(nres.get("filed")), _when(pres.get("filed")), _when(asked_at)
        newer = (nf is not None and pf_ is not None and _ist_day(nf) > _ist_day(pf_)) or \
                (not pres and nf is not None and asked is not None and _ist_day(nf) > _ist_day(asked))
        if newer:
            filed = day_of(nres.get("filed"))
            out.append(_fact("results", f"{name}New results filed: {nres.get('period') or nres.get('title') or 'results'}" + (f", filed {filed}" if filed else "")))
    elif pres and downgraded:
        out.append(_fact("plan", f"{name}Results figures: not included in your plan now"))
    out += _diff_sector(p.get("sector") or {}, n.get("sector") or {}, name)
    if downgraded:
        for f, label in (("pe", "P/E"), ("marketCap", "Market cap")):
            if p.get(f) and not n.get(f):
                out.append(_fact("plan", f"{name}{label}: not included in your plan now"))
    return out


def diff(prev_figures: Optional[Dict[str, Any]], now_figures: Optional[Dict[str, Any]], *, asked_at: Any = None, subject: Optional[str] = None,
         prev_plan: str = "", now_plan: str = "", locked: Optional[Dict[str, Set[str]]] = None) -> List[Dict[str, Any]]:
    """What changed between the figures of the earlier answer and today's, as a list of facts ({"kind", "text"}), with no model: the price (₹ and %
    change, both dates), FinLit Prism (a move of 1 point or more, a new label, each part that moved 1 point or more; "FinLit updated the Prism
    formula" when both model versions are known and differ), new results filed, a sector's box or state. A figure missing now because of the
    member's plan is said plainly ("not included in your plan now"), never shown as a change; a figure missing for any other reason is left out.
    `subject`: the company the question is about (only it is compared); else every company both answers read (at most 2)."""
    prev_figures, now_figures, locked = prev_figures or {}, now_figures or {}, locked or {}
    downgraded = bool(prev_plan and now_plan) and _PLAN_RANK.get(now_plan, 0) < _PLAN_RANK.get(prev_plan, 0)
    pc, nc = prev_figures.get("companies") or {}, now_figures.get("companies") or {}
    syms = [subject] if subject and subject in pc else [s for s in pc if s in nc or s in locked or downgraded][:2]
    out: List[Dict[str, Any]] = []
    for s in syms:
        out += _diff_company(pc.get(s) or {}, nc.get(s) or {}, locked.get(s, set()), downgraded, asked_at, f"{s}: " if len(syms) > 1 else "")
    return out + _diff_sector(prev_figures.get("sector") or {}, now_figures.get("sector") or {})


NO_CHANGE = "No change in the figures FinLit compared (price, FinLit Prism, results, sector)"


def since_payload(prev: Dict[str, Any], facts: List[Dict[str, Any]], items: List[Dict[str, Any]], subject: Optional[str]) -> Dict[str, Any]:
    """The `since` event for the panel: when and what was asked, one line per change, the new filings as links to FinLit's own pages (the company's
    News and filings section, never the exchange's site), and the key lines said then (a strong match only)."""
    links = [{"title": i["title"], "date": i["date"], "to": f"/stocks/{i.get('symbol') or subject}#news" if (i.get("symbol") or subject) else "/news"}
             for i in items]
    at = prev["askedAt"]
    return {"askedAt": at.isoformat() if hasattr(at, "isoformat") else str(at), "question": prev["question"], "match": prev["match"],
            "changes": [f["text"] for f in facts] or ([NO_CHANGE] if not items else []), "newItems": links,
            "said": [*(prev.get("points") or [])] if prev["match"] == "strong" else []}


def since_note(prev: Dict[str, Any], facts: List[Dict[str, Any]], items: List[Dict[str, Any]]) -> str:
    """The per-question note (after the cached prefix, so the system prompt and the tool list stay byte for byte the same): <since_last_asked>
    with the facts and the new filings, <said_before> with the key lines of the earlier answer (a strong match only), and the instruction."""
    when = moment_of(prev["askedAt"])
    lines = [f"- {f['text']}" for f in facts] + [f"- New filing: {i['title']} ({day_of(i['date'])})" for i in items]
    block = f"<since_last_asked asked=\"{when}\">\n" + "\n".join(lines or [f"- {NO_CHANGE}"]) + "\n</since_last_asked>"
    strong = prev["match"] == "strong" and bool(prev.get("points"))
    said = ("\n<said_before>\n" + "\n".join(f"- {p}" for p in prev["points"]) + "\n</said_before>") if strong else ""
    how = "The member asked this before" if prev["match"] == "strong" else "The member asked another question on this subject before"
    return (f"{block}{said}\n[{how}, on {when}. First, one line \"Since you last asked ({when}): ...\" using only the facts in <since_last_asked>, "
            "each with its date. Then the new points and other important current items on the same subject."
            + (" Do not repeat a <said_before> point unless its figure changed." if strong else "") + "]")
