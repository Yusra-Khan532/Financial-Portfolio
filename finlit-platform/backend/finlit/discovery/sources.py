"""Discover: earnings-call transcripts and results filings (task #267: "in discovery tab we need to add call transcript as well as result filings same
way we did and use the keywords mentioned in pdf").

The keywords: Part 2 ("Earnings Call Transcript Keywords", 8 "Call: ..." buckets, 87 keywords) and Part 3 ("Results Filing Keywords", 7 "Results: ..."
buckets, 101 keywords) of the Investor Presentation Keyword Directory v3, read from the PDF's tables into sources.json by
scripts/build_discovery_sources.py; every keyword with its related terms (10 or more) and what to verify.

The documents, per company, the newest in the last 400 days (the same window as the presentations):
- calls: the newest filing the Documents page calls a "Call transcript" (frontend lib/feed.ts docType, ask/pages.doc_type) whose title or category
  says "transcript" (a "concall" or "earnings call" letter alone is the call's schedule or recording, not what was said);
- results: the newest results filing (financial results, the outcome of the board meeting that approved them, the results press release), as
  FinLit AI finds a "Results filing" (ask/docstore.KIND_RULES), not a results-date notice, newspaper copy, call letter or presentation.
The text the site already keeps is read first (document_pages: kept by the Concall Monitor, FinLit AI and this job; earnings_call_text: kept by the
earnings-call job); a file is downloaded through the shared exchange fetcher (earnings/transcripts.py) only when no text is kept, and its text is then
kept for FinLit AI.

The matching is the presentations' own engine (keywords.py): a keyword and its related terms are one concept, whole words, plurals, short capital
acronyms in capitals only; a bucket counts with 2 different concepts or 5 mentions; evidence is up to 2 sentences that name one of the bucket's
keywords AND hold a figure (a keyword alone is not evidence); the tone of the document's own words. Stages are the presentations' (they describe a
business theme, not a call's or a filing's language). Stored per (symbol, source) in discovery_documents (migration 122), read by the nightly
`refresh-discovery` job after the presentations, bounded by the run's own time, newest first, resumable."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..earnings.transcripts import DOC_PDF_BYTES, Blocked, BudgetSpent, FetchFailed, Fetcher, extract_pages
from . import keywords as K
from . import fit as F

log = logging.getLogger("finlit.discovery.sources")
LOOKBACK_DAYS = 400
RETRY_FAILED_H = 24
RULES_VERSION = 1           # bump when the matching of calls or results changes: every stored document is read again (bounded per run)
LIMIT = 400                 # documents per run, both sources together (time is the main bound: the run's own minutes)
FETCH_BUDGET = 600          # exchange requests per run for the files no text is kept for
MAX_EVIDENCE = 2
SOURCE_JSON = json.loads(Path(__file__).with_name("sources.json").read_text(encoding="utf-8"))

# Related terms that are ordinary words in any call or results filing ("about", "FY", "revenue", "guidance" ...): kept in sources.json, not matched
# alone (the presentations' TOO_BROAD rule). The keyword itself and every phrase of two or more words are matched.
TOO_BROAD = {
    "about", "around", "approximately", "approximate", "roughly", "broadly", "soon", "shortly", "hereafter", "close to", "fy", "h1", "h2", "q1", "q2",
    "q3", "q4", "9m", "yoy", "qoq", "y-o-y", "q-o-q", "cfo", "revenue", "debt", "stock", "coal", "steel", "crude", "software", "fire", "war", "flood",
    "strike", "accident", "explosion", "transcript", "freight", "rent", "repairs", "logistics", "purchases", "travelling", "advertising", "analytics",
    "automation", "innovation", "productivity", "brands", "awards", "inflation", "volumes", "launch", "launches", "guidance", "outlook", "forecast",
    "projection", "prospects", "commissioning", "appointment", "associate", "bonds", "bonus", "yield", "spread", "tariff", "tariffs", "turnover",
    "liabilities", "provisions", "leverage", "inventory", "collections", "bookings", "retention", "utilisation", "occupancy", "billing", "receivables",
    "debtors", "treasury", "variance", "leases", "licences", "licensing", "qualification", "sampling", "commitments", "conditional", "confidential",
    "attachment", "grants", "remuneration", "trademarks", "shipments", "throughput", "tonnage", "topline", "realisation", "depreciation",
    "amortisation", "amortization", "goodwill", "merger", "transformation", "diversification", "diversify", "restructuring", "refinancing",
    "repayment", "cessation", "resignation", "emissions", "digitisation", "ambition", "aspiration", "blueprint", "nascent", "exploring",
    "experimental", "tentative", "uncertain", "volatile", "pressures", "shortage", "obstacles", "roadblocks", "softness", "squeeze", "trough",
    "dilution", "offtake", "headcount", "advances", "solvency", "ageing", "stabilisation", "rollout", "simplification", "reservation", "marketplace",
    "recognitions", "accreditation", "prepayment", "surcharge", "income total",
}
# A sentence FinLit never quotes as evidence: a rating or a call on the shares (an analyst's words, not the company's business), or a disclaimer.
NOT_EVIDENCE = re.compile(r"\b(price target|target price|buy rating|sell rating|buy call|sell call|recommend\w*|outperform|underperform|overweight|"
                          r"underweight|accumulate|multibagger|top pick|offer to buy|solicitation|forward[- ]looking statements?|safe harbou?r)\b", re.I)

LABEL = {"calls": "Earnings calls", "results": "Results filings"}
DOC_WORD = {"calls": "call transcript", "results": "results filing"}
DOC_KIND = {"calls": "Call transcript", "results": "Results filing"}      # document_pages.kind, as FinLit AI and the Concall Monitor keep them
CAUTION = ("A keyword mention by itself is not proof of material business exposure: check the figures in the filing itself. Describes what the "
           "company said and filed; not a recommendation.")
METHOD = {
    "calls": ("The newest earnings-call transcript each company filed with NSE in the last 400 days, first 80 pages, matched against the 8 earnings-call "
              "buckets of FinLit's keyword directory (87 keywords, each with its related terms). A bucket counts when 2 different keywords or 5 mentions "
              "appear. Evidence: up to 2 sentences that name a keyword and hold a figure; a keyword alone is not evidence. Tone: positive minus negative "
              "finance words of the transcript."),
    "results": ("The newest results filing each company filed with NSE in the last 400 days (financial results, the outcome of the board meeting that "
                "approved them, the results press release), first 80 pages, matched against the 7 results-filing buckets of FinLit's keyword directory "
                "(101 keywords, each with its related terms). A bucket counts when 2 different keywords or 5 mentions appear. Evidence: up to 2 sentences "
                "that name a keyword and hold a figure; a table row of figures alone is not quoted. Tone: positive minus negative finance words."),
}

# Which filing (the Documents page's rule, see the module text). $5 = what the title or category must say, $6 = what it must not.
WANT = {"calls": r"transcript",
        "results": r"financial results?|outcome of (the )?board meeting|results? for the (quarter|period|half|year)|press release|unaudited|audited"}
AVOID = {"calls": r"annual report|integrated report",
         "results": r"board meeting for results|intimation|newspaper|trading window|con\.? ?call|earnings call|analyst|recording|transcript|"
                    r"presentation|annual report|integrated report|prospectus|offer document"}
KIND_SQL = {"calls": "f.kind = 'document'", "results": "(f.kind = 'result' OR (f.kind = 'document' AND (coalesce(f.category, '') || ' ' || f.title) ~* 'result'))"}

PENDING_SQL = """
WITH docs AS (
    SELECT DISTINCT ON (f.symbol) f.symbol, f.company, f.title, f.item_date, f.link
    FROM feed_items f
    WHERE {kind} AND f.symbol IS NOT NULL AND f.link LIKE 'https://%'
      AND f.item_date >= current_date - $1::int
      AND (coalesce(f.category, '') || ' ' || f.title) ~* $5
      AND (coalesce(f.category, '') || ' ' || f.title) !~* $6
      AND ($8::text[] IS NULL OR f.symbol = ANY($8::text[]))
    ORDER BY f.symbol, f.item_date DESC, f.id DESC
)
SELECT d.*, (c.symbol IS NOT NULL AND c.doc_link = d.link) AS reread FROM docs d
LEFT JOIN discovery_documents c ON c.symbol = d.symbol AND c.source = $7
WHERE c.symbol IS NULL OR c.doc_link <> d.link
   OR (c.status = 'error' AND c.read_at < now() - make_interval(hours => $2::int))
   OR c.rules < $4
ORDER BY (c.symbol IS NOT NULL AND c.doc_link = d.link), d.item_date DESC, d.symbol
LIMIT $3
"""

UPSERT_SQL = """
INSERT INTO discovery_documents (symbol, source, company, doc_title, doc_date, doc_link, status, reason, buckets, matched, tone, tone_label, pages,
                                 text_from, rules, read_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, now())
ON CONFLICT (symbol, source) DO UPDATE SET company = EXCLUDED.company, doc_title = EXCLUDED.doc_title, doc_date = EXCLUDED.doc_date,
    doc_link = EXCLUDED.doc_link, status = EXCLUDED.status, reason = EXCLUDED.reason, buckets = EXCLUDED.buckets, matched = EXCLUDED.matched,
    tone = EXCLUDED.tone, tone_label = EXCLUDED.tone_label, pages = EXCLUDED.pages, text_from = EXCLUDED.text_from, rules = EXCLUDED.rules,
    read_at = now()
"""


# ------------------------------------------------------------------------------------------------ the directory and its patterns
def aliases_of(keyword: str, related: List[str]) -> List[str]:
    """A keyword's own words and its related terms: "Profit before tax (PBT)" -> "Profit before tax", "PBT"; "Debt-free / net cash position" ->
    "Debt-free", "net cash position"; then each related term. Duplicates (any case) once."""
    out: List[str] = []
    for m in re.finditer(r"\(([^)]+)\)", keyword):
        if len(m.group(1).split()) <= 3:
            out.append(m.group(1).strip())
    main = re.sub(r"\s*\([^)]*\)", "", keyword).strip()
    out = [p.strip() for p in main.split(" / ") if p.strip()] + out + list(related)
    seen, uniq = set(), []
    for a in out:
        if a.lower() not in seen:
            seen.add(a.lower())
            uniq.append(a)
    return uniq


def directory(source: str) -> Dict[str, List[Dict[str, Any]]]:
    """bucket -> concepts {name, keyword, aliases, related, verify}, in the PDF's order (the presentations' directory.json shape)."""
    return {b: [{"name": k["keyword"], "keyword": k["keyword"], "aliases": aliases_of(k["keyword"], k["related"]), "related": k["related"],
                 "verify": k["verify"]} for k in ks] for b, ks in SOURCE_JSON[source]["buckets"].items()}


def _trie(words: List[str]) -> str:
    """One regex for many phrases, as a character trie (the engine tries one branch per character instead of every phrase in turn); a longer phrase
    is tried before a shorter one that starts it, so the longest phrase at a place counts, as in keywords.compile_buckets (longest first)."""
    root: Dict[str, Any] = {}
    for w in words:
        node = root
        for ch in w:
            node = node.setdefault(ch, {})
        node[""] = True

    def build(node: Dict[str, Any]) -> str:
        alts = [re.escape(ch) + build(node[ch]) for ch in sorted(k for k in node if k)]
        if not alts:
            return ""
        body = alts[0] if len(alts) == 1 else "(?:" + "|".join(alts) + ")"
        return "(?:" + body + ")?" if "" in node else body

    return build(root)


class Bucketed:
    """keywords.compile_buckets for a large directory, with the same rules (whole words, plural endings, short capital acronyms in capitals only, the
    ordinary words left out, each piece of text one concept), built as tries: the 1,400 phrases of the call buckets took 11 seconds per 100 KB of
    transcript as one alternation each, under a second this way. `finditer` gives (match, concept), as analyse() needs."""

    def __init__(self, concepts: List[Dict[str, Any]], broad: set):
        self.words: Dict[str, str] = {}
        self.caps: Dict[str, str] = {}
        for c in concepts:
            for a in c["aliases"]:
                if a.lower() in broad:
                    continue
                if a.isupper() and len(a) <= 5:
                    self.caps.setdefault(a, c["name"])
                else:
                    self.words.setdefault(a.lower(), c["name"])
        parts = []
        if self.words:
            parts.append("(" + _trie(sorted(self.words)) + ")")
        if self.caps:
            parts.append("(?-i:(" + _trie(sorted(self.caps)) + "))")
        self.rx = re.compile(r"(?<![A-Za-z])(?:" + "|".join(parts) + r")(?:s|es)?(?![A-Za-z])", re.IGNORECASE) if parts else None

    def concepts_in(self, text: str):
        if self.rx is None:
            return
        for m in self.rx.finditer(text):
            w, cap = (m.group(1), m.group(2)) if self.words and self.caps else ((m.group(1), None) if self.words else (None, m.group(1)))
            name = self.words.get(w.lower()) if w is not None else self.caps.get(cap)
            if name:
                yield name


def analyse(text: str, lex: "Lexicon", min_distinct: int = K.MIN_DISTINCT, min_total: int = K.MIN_TOTAL) -> Dict[str, dict]:
    """keywords.analyse with the trie patterns: bucket -> {distinct, total, score, terms (the 8 most mentioned concepts)}, highest score first."""
    scores: Dict[str, dict] = {}
    for bucket, bx in lex.bucketed.items():
        terms: Dict[str, int] = {}
        for name in bx.concepts_in(text):
            terms[name] = terms.get(name, 0) + 1
        distinct, total = len(terms), sum(terms.values())
        if terms and (distinct >= min_distinct or total >= min_total):
            scores[bucket] = {"distinct": distinct, "total": total, "score": round(distinct * 2 + min(total, 20) * 0.5, 2),
                              "terms": dict(sorted(terms.items(), key=lambda kv: -kv[1])[:8])}
    return dict(sorted(scores.items(), key=lambda kv: (-kv[1]["score"], kv[0])))


class Lexicon:
    def __init__(self, source: str):
        self.source = source
        self.directory = directory(source)
        self.buckets = list(self.directory)
        self.patterns = K.compile_patterns(self.directory, TOO_BROAD)       # per concept: the evidence sentences (keywords.evidence)
        self.bucketed = {b: Bucketed(cs, TOO_BROAD) for b, cs in self.directory.items()}
        self.verify = {(b, c["name"]): c["verify"] for b, cs in self.directory.items() for c in cs}


LEX: Dict[str, Lexicon] = {s: Lexicon(s) for s in LABEL}


def label_of(bucket: str) -> str:
    """"Call: Management Guidance & Outlook" -> "Management Guidance & Outlook" (the card's title; the view already says calls or results)."""
    return re.sub(r"^(Call|Results):\s*", "", bucket)


def evidence(text: str, terms: List[str], bucket: str, lex: Lexicon, k: int = MAX_EVIDENCE) -> List[str]:
    """Up to k sentences that name one of the bucket's keywords AND hold a figure (keywords.evidence), never a rating, a call on the shares or a
    disclaimer."""
    got = K.evidence(text, terms, bucket, pats=lex.patterns, k=k * 4)
    return [s for s in F.quotes(got, bucket) if not NOT_EVIDENCE.search(s)][:k]     # task #296: no page header, address line or tax-rate guidance


def read_text(text: str, source: str) -> Dict[str, Any]:
    """One document's text -> {status, buckets: {bucket: {distinct, total, score, terms, evidence, verify}}, tone}. status: ok (a bucket has an evidence
    sentence), keyword_only_no_figures, no_bucket_match, no_text_layer (a scan: under 200 characters of text)."""
    lex = LEX[source]
    tone = K.tone(text)
    if len(text) < 200:
        return {"status": "no_text_layer", "buckets": {}, "tone": tone}
    scores = analyse(text, lex)
    if not scores:
        return {"status": "no_bucket_match", "buckets": {}, "tone": tone}
    out: Dict[str, Any] = {}
    for b, sc in scores.items():
        terms = list(sc["terms"])
        out[b] = {**sc, "evidence": evidence(text, terms, b, lex), "verify": list(dict.fromkeys(lex.verify[(b, t)] for t in terms if lex.verify.get((b, t))))[:2]}
    return {"status": "ok" if any(v["evidence"] for v in out.values()) else "keyword_only_no_figures", "buckets": out, "tone": tone}


# ------------------------------------------------------------------------------------------------ the job
async def pending(store, source: str, limit: Optional[int] = None, symbols: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    sql = PENDING_SQL.replace("{kind}", KIND_SQL[source])  # nosec B608 - fixed fragments; every value is a bound parameter
    async with store.pool.acquire() as conn:
        rows = await conn.fetch(sql, LOOKBACK_DAYS, RETRY_FAILED_H, limit, RULES_VERSION, WANT[source], AVOID[source], source,
                                [s.upper() for s in symbols] if symbols else None)
    return [{**dict(r), "source": source} for r in rows]


async def stored_text(store, link: str) -> Optional[List[str]]:
    """The text the site already keeps for this file: document_pages (any reader), then the earnings-call job's transcript text. None when neither."""
    from ..ask import docstore
    pages = await docstore.get_pages(store, link)
    if pages and any(p.strip() for p in pages):
        return pages
    try:
        async with store.pool.acquire() as conn:
            body = await conn.fetchval("SELECT t.body FROM earnings_calls c JOIN earnings_call_text t ON t.call_id = c.id WHERE c.transcript_url = $1 "
                                       "AND length(t.body) > 0 LIMIT 1", link)
    except Exception:
        log.warning("discovery sources: earnings-call text not read for %s", link, exc_info=True)
        body = None
    return body.split("\f") if body else None


async def fetch_text(fetcher: Fetcher, link: str) -> List[str]:
    from .quotes import mend
    pdf = await fetcher.pdf(link, DOC_PDF_BYTES)
    pages = await asyncio.to_thread(extract_pages, pdf, K.MAX_PAGES)
    return [mend(p) for p in pages]


async def save(store, doc: Dict[str, Any], result: Dict[str, Any], pages: Optional[int], text_from: Optional[str]) -> None:
    buckets = result.get("buckets") or {}
    async with store.pool.acquire() as conn:
        await conn.execute(UPSERT_SQL, doc["symbol"], doc["source"], doc.get("company"), doc.get("title"), doc.get("item_date"), doc["link"],
                           result["status"], result.get("reason"), json.dumps(buckets), list(buckets), (result.get("tone") or {}).get("score"),
                           (result.get("tone") or {}).get("label"), pages, text_from, RULES_VERSION)


async def read_doc(store, doc: Dict[str, Any], fetcher: Optional[Fetcher]) -> Tuple[Dict[str, Any], Optional[int], Optional[str]]:
    """(result, pages, where the text came from: 'stored' | 'fetched'). Raises BudgetSpent when the file must be downloaded and the budget is spent
    (or there is no fetcher): the caller leaves it for the next run."""
    pages = await stored_text(store, doc["link"])
    origin = "stored"
    if pages is None:
        if fetcher is None:
            raise BudgetSpent()
        try:
            pages = await fetch_text(fetcher, doc["link"])
        except (Blocked, FetchFailed) as e:
            return {"status": "error", "reason": str(e)[:300]}, None, None
        origin = "fetched"
        from ..ask import docstore
        try:
            await docstore.put_pages(store, doc["link"], doc["symbol"], DOC_KIND[doc["source"]], doc.get("title"), doc.get("item_date"), pages)
        except Exception:
            log.warning("discovery sources: %s text not kept", doc["symbol"], exc_info=True)
    from .quotes import mend
    text = "\n".join(mend(p) for p in pages[:K.MAX_PAGES])
    return read_text(text, doc["source"]), len(pages), origin


async def run(store, max_minutes: float, limit: int = LIMIT, symbols: Optional[List[str]] = None, fetcher: Optional[Fetcher] = None) -> Dict[str, Any]:
    """Both sources in one list, newest filing first (re-reads after new ones), within the minutes the presentations left and `limit` documents.
    A file with kept text never needs the exchange; once the fetch budget is spent the run goes on with kept texts only. What is not reached is
    counted (`unreached`), so the supervisor's probe continues the job soon."""
    started = time.monotonic()
    todo: List[Dict[str, Any]] = []
    for src in LABEL:
        todo += await pending(store, src, symbols=symbols)
    todo.sort(key=lambda d: (bool(d.get("reread")), -(d["item_date"].toordinal() if d.get("item_date") else 0), d["symbol"], d["source"]))
    own = fetcher is None
    client = fetcher or Fetcher(budget=FETCH_BUDGET)
    f: Optional[Fetcher] = client
    counts: Dict[str, Dict[str, int]] = {s: {} for s in LABEL}
    origin = {"stored": 0, "fetched": 0}
    errors: List[str] = []
    done = 0
    try:
        for doc in todo:
            if done >= limit or (time.monotonic() - started) / 60 >= max_minutes:
                break
            try:
                result, n, came = await read_doc(store, doc, f)
            except BudgetSpent:
                f = None                                 # no more downloads this run; documents with kept text are still read
                continue
            except Exception as e:                       # one broken file never stops the run: recorded with the reason, tried again after a day
                log.warning("discovery sources: %s %s: %s", doc["source"], doc["symbol"], type(e).__name__)
                result, n, came = {"status": "error", "reason": type(e).__name__}, None, None
            if result["status"] == "error" and len(errors) < 20:
                errors.append(f"{doc['source']} {doc['symbol']}: {result.get('reason')}")
            await save(store, doc, result, n, came)
            if came:
                origin[came] += 1
            counts[doc["source"]][result["status"]] = counts[doc["source"]].get(result["status"], 0) + 1
            done += 1
    finally:
        if own:
            await client.aclose()
    return {"pending": len(todo), "read": done, "unreached": max(0, len(todo) - done), "statuses": counts, "text": origin, "errors": errors,
            "minutes": round((time.monotonic() - started) / 60, 1)}


# ------------------------------------------------------------------------------------------------ the page (GET /api/discovery/sources)
ROWS_SQL = ("SELECT symbol, company, doc_title, doc_date, doc_link, status, reason, buckets, tone, tone_label, pages, text_from, read_at "
            "FROM discovery_documents WHERE source = $1 ORDER BY doc_date DESC NULLS LAST, symbol")
ONE_SQL = ("SELECT symbol, company, doc_title, doc_date, doc_link, status, reason, buckets, tone, tone_label, pages, text_from, read_at "
           "FROM discovery_documents WHERE source = $1 AND symbol = $2")
STATUS_WORD = {
    "ok": "Read: a bucket's keywords with a sentence that holds a figure.",
    "keyword_only_no_figures": "Read: keywords are named, but no sentence names one with a figure, so there is no evidence to quote.",
    "no_bucket_match": "Read: no bucket's keywords are named twice (2 different keywords, or one 5 times).",
    "no_text_layer": "The file is a scan with no text to read.",
    "error": "The exchange did not give the file; it is tried again after a day.",
}


def _js(v: Any, empty: Any) -> Any:
    if v is None:
        return empty
    return json.loads(v) if isinstance(v, str) else v


def _doc(r: Dict[str, Any]) -> Dict[str, Any]:
    from .board import safe_link
    return {"title": r["doc_title"], "date": r["doc_date"].isoformat() if r["doc_date"] else None,
            "link": r["doc_link"] if safe_link(r["doc_link"]) else None, "pages": r["pages"]}


async def macros(conn, symbols: List[str]) -> Dict[str, str]:
    """Each company's NSE macro sector (company_classification), for the fit rules of task #296."""
    if not symbols:
        return {}
    return {r["symbol"]: r["macro_sector"] for r in await conn.fetch(
        "SELECT symbol, macro_sector FROM company_classification WHERE symbol = ANY($1::text[]) AND macro_sector IS NOT NULL", symbols)}


def fit(bucket: str, b: Dict[str, Any], macro: Optional[str], lex: "Lexicon") -> Optional[Dict[str, Any]]:
    """Task #296: a stored read made to fit the company (finlit/discovery/fit.py)."""
    return F.fit_entry(bucket, b, macro, lex.patterns, K.MIN_DISTINCT, K.MIN_TOTAL, MAX_EVIDENCE)


def _entry(r: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    return {"symbol": r["symbol"], "company": r["company"] or r["symbol"], "score": b.get("score"), "distinct": b.get("distinct"), "mentions": b.get("total"),
            "keywords": list((b.get("terms") or {}).keys()), "evidence": list(b.get("evidence") or [])[:MAX_EVIDENCE], "verify": list(b.get("verify") or []),
            "document": _doc(r), "tone": {"score": r["tone"], "label": r["tone_label"]}}


def bucket_verify(bucket: str, entries: List[Dict[str, Any]], lex: Lexicon, n: int = 6) -> List[str]:
    """The bucket's "What to verify": the lines of the keywords its companies name most, then the directory's own order."""
    named: Dict[str, int] = {}
    for e in entries:
        for k in e["keywords"]:
            named[k] = named.get(k, 0) + 1
    order = sorted(named, key=lambda k: -named[k]) + [c["name"] for c in lex.directory[bucket]]
    return list(dict.fromkeys(lex.verify[(bucket, k)] for k in order if lex.verify.get((bucket, k))))[:n]


def empty_reason(source: str, read: int, usable: int) -> str:
    word = DOC_WORD[source]
    if not read:
        return (f"No {word} has been read yet: the nightly job reads each company's newest {word} filed with NSE in the last {LOOKBACK_DAYS} days, "
                f"newest first.")
    if not usable:
        return f"None of the {read:,} {word}s read so far has text to match (scans, or files the exchange did not give)."
    return f"None of the {usable:,} {word}s read names 2 of this bucket's keywords, or one of them 5 times."


async def overview(store, source: str, bucket: Optional[str] = None) -> Dict[str, Any]:
    """Every bucket of the source with its company count (and how many have an evidence sentence), the first names and what to verify; with bucket=,
    that bucket's companies, highest score first, each with its keywords, evidence sentences, the document's date and link and what to verify."""
    lex = LEX[source]
    async with store.pool.acquire() as conn:
        rows = [dict(r) for r in await conn.fetch(ROWS_SQL, source)]
        macro = await macros(conn, [r["symbol"] for r in rows])
    stat: Dict[str, int] = {}
    for r in rows:
        stat[r["status"]] = stat.get(r["status"], 0) + 1
    usable = sum(n for s, n in stat.items() if s in ("ok", "keyword_only_no_figures", "no_bucket_match"))
    out_b = []
    for name in lex.buckets:
        entries = []
        for r in rows:
            b = (_js(r["buckets"], {}) or {}).get(name)
            b = fit(name, b, macro.get(r["symbol"]), lex) if b else None
            if b:
                entries.append(_entry(r, b))
        entries.sort(key=lambda e: (-(e["score"] or 0), e["company"]))
        base = {"name": name, "label": label_of(name), "keywords": [c["name"] for c in lex.directory[name]], "companies": len(entries),
                "withEvidence": sum(1 for e in entries if e["evidence"]), "verify": bucket_verify(name, entries, lex),
                "reason": None if entries else empty_reason(source, len(rows), usable)}
        if bucket == name:
            out_b.append({**base, "list": entries})
        else:
            out_b.append({**base, "preview": [e["company"] for e in entries[:3]]})
    last = max((r["read_at"] for r in rows), default=None)
    newest = max((r["doc_date"] for r in rows if r["doc_date"]), default=None)
    return {"source": source, "label": LABEL[source], "document": DOC_WORD[source], "days": LOOKBACK_DAYS, "buckets": out_b, "read": len(rows),
            "statuses": stat, "companies": len({r["symbol"] for r in rows if _js(r["buckets"], {})}), "updated": last.isoformat() if last else None,
            "newest": newest.isoformat() if newest else None, "caution": CAUTION, "method": METHOD[source]}


async def company(store, source: str, symbol: str) -> Dict[str, Any]:
    """One company's read of its newest call transcript or results filing: every bucket with its keywords, evidence and what to verify; or, with no
    bucket, the reason (none filed in the last 400 days, filed and waiting for the nightly read, a scan, the exchange did not give it ...)."""
    sym = symbol.strip().upper()
    lex = LEX[source]
    async with store.pool.acquire() as conn:
        r = await conn.fetchrow(ONE_SQL, source, sym)
        macro = (await macros(conn, [sym])).get(sym)
    waiting = await pending(store, source, limit=1, symbols=[sym])
    base: Dict[str, Any] = {"symbol": sym, "source": source, "label": LABEL[source], "caution": CAUTION}
    if r is None:
        if waiting:
            w = waiting[0]
            return {**base, "status": "waiting", "buckets": [], "reason": f"Its newest {DOC_WORD[source]} is filed; the nightly job reads it on its next run.",
                    "document": {"title": w["title"], "date": w["item_date"].isoformat() if w["item_date"] else None, "link": None, "pages": None}}
        return {**base, "status": "none", "buckets": [], "document": None,
                "reason": f"No {DOC_WORD[source]} filed with NSE in the last {LOOKBACK_DAYS} days is held for this company."}
    r = dict(r)
    bs = {b: f for b, v in (_js(r["buckets"], {}) or {}).items() if (f := fit(b, v, macro, lex))}
    items = [{"name": b, "label": label_of(b), **_entry(r, bs[b])} for b in lex.buckets if b in bs]
    items.sort(key=lambda e: -(e["score"] or 0))
    reason = None if items else STATUS_WORD.get(r["status"], r["status"]) + (f" ({r['reason']})" if r["status"] == "error" and r.get("reason") else "")
    return {**base, "status": r["status"], "buckets": items, "document": _doc(r), "reason": reason, "readAt": r["read_at"].isoformat() if r["read_at"] else None,
            "newerFiled": bool(waiting) and waiting[0]["link"] != r["doc_link"], "tone": {"score": r["tone"], "label": r["tone_label"]}}
