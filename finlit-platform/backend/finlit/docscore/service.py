"""The three filings of a company, scored (task #266): its newest investor presentation, earnings-call transcript and results filing, taken from the
report's Section 18 "News and filings" (the company's NSE announcements, as stored in its snapshot) and, when Section 18's newest 25 do not reach one,
from the stored filings of that kind (finlit/ask/docstore.py, the rules FinLit AI uses). Each file is read once: its page texts are kept in
document_pages (shared with FinLit AI and the Discovery job), downloaded in the background when they are not, and the score is kept in Redis per file,
kind and lexicon version, so a page shows "reading" for at most a minute and then the scores.

A combined "Outcome" filing (results, press release and presentation in one PDF, as Tech Mahindra files them) is split: the results filing is the pages
before the press release or presentation starts, the presentation the pages from its title page on.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional, Sequence

from ..ask import docstore
from . import lexicon as L
from .scorer import DOC_NAMES, company_score, score_document
from .segment import segment

log = logging.getLogger("finlit.docscore")

KIND = {"P": "Investor presentation", "C": "Call transcript", "R": "Results filing"}   # docstore's kind names (document_pages.kind)
CACHE_DAYS = 30
READ_TIMEOUT = 90.0
KEY_POINTS = 8
MAX_POINTS = 150
_inflight: set = set()

P_RULE = re.compile(r"investor presentation|earnings presentation|analyst presentation|investors? presentation", re.I)
C_RULE = re.compile(r"transcript", re.I)
R_WANT, R_AVOID = re.compile(docstore.KIND_RULES["Results filing"][1], re.I), re.compile(docstore.KIND_RULES["Results filing"][2], re.I)


def kind_of(category: str, description: str) -> Optional[str]:
    """Which of the three a Section 18 announcement is (or None): a transcript, a presentation, or the results (not a notice of the meeting)."""
    text = f"{category or ''} {description or ''}"
    if C_RULE.search(text):
        return "C"
    if P_RULE.search(text):
        return "P"
    if R_WANT.search(text) and not R_AVOID.search(text):
        return "R"
    return None


async def section18(store: Any, symbol: str) -> List[Dict[str, Any]]:
    """The announcements the report's Section 18 shows (its snapshot's events section), newest first."""
    for st in ("consolidated", "standalone"):
        try:
            hit = await store.get_section(symbol, st, "events")
        except Exception:
            log.warning("docscore: events not read for %s", symbol, exc_info=True)
            hit = None
        if hit:
            body = json.loads(hit[0])
            rows = [a for a in (body.get("announcements") or []) if isinstance(a, dict) and str(a.get("link") or "").startswith("https://")]
            return sorted(rows, key=lambda a: (a.get("date") or "", a.get("time") or ""), reverse=True)
    return []


async def documents(store: Any, symbol: str) -> Dict[str, Optional[Dict[str, Any]]]:
    """The newest document of each kind: from Section 18 first, then the stored filings of that kind."""
    out: Dict[str, Optional[Dict[str, Any]]] = {"P": None, "C": None, "R": None}
    for a in await section18(store, symbol):
        k = kind_of(a.get("category") or "", a.get("description") or "")
        if k and out[k] is None:
            out[k] = {"title": a.get("description"), "date": a.get("date"), "link": a["link"], "category": a.get("category"), "source": "section18"}
    if out["P"] is None:
        for f in (await docstore.feed_presentation(store, symbol), await docstore.discovery_presentation(store, symbol)):
            if f and f.get("link"):
                out["P"] = {**f, "source": "filings"}
                break
    for k in ("C", "R"):
        if out[k] is None:
            more = await docstore.feed_documents(store, symbol, KIND[k])
            if more:
                out[k] = {**more[0], "source": "filings"}
    return out


PRESS = re.compile(r"press release|copyright|media release", re.I)
DECK = re.compile(r"presentation", re.I)


def split_combined(pages: Sequence[str], k: str) -> List[str]:
    """The pages of one kind inside a combined filing. Results: up to the first page (after the first) that opens a press release or a presentation.
    Presentation: from the first page (after the first) whose opening lines name a presentation. A file that is one thing is returned whole."""
    heads = [(p or "")[:160] for p in pages]
    deck = next((i for i in range(1, len(pages)) if DECK.search(heads[i])), None)
    press = next((i for i in range(1, len(pages)) if PRESS.search(heads[i])), None)
    if k == "P" and deck is not None and deck >= 3:
        return list(pages[deck:])
    if k == "R":
        ends = [i for i in (deck, press) if i is not None and i >= 3]
        if ends:
            return list(pages[:min(ends)])
    return list(pages)


def _cache_key(link: str, k: str) -> str:
    # "k2" (task #328): the key points of a results filing leave out table rows and name lists, so views shaped before are worked out again (from the stored pages)
    return f"docscore:{L.LEXICON_VERSION}:k2:{k}:{link}"


async def _read(store: Any, doc: Dict[str, Any], symbol: str, k: str) -> Optional[List[str]]:
    """The file's page texts: kept text first, else the exchange (kept for next time). None when the file cannot be read."""
    kept = await docstore.get_pages(store, doc["link"])
    if kept:
        return kept
    from ..ask.pages import _pages_of
    try:
        pages = await asyncio.wait_for(_pages_of(doc["link"]), timeout=READ_TIMEOUT)
    except Exception as exc:
        log.info("docscore: %s not read (%s)", doc["link"][-60:], type(exc).__name__)
        return None
    if any(p.strip() for p in pages):
        await docstore.put_pages(store, doc["link"], symbol, KIND[k], doc.get("title"), doc.get("date"), pages)
        return pages
    return None


_NUM = re.compile(r"^[\(\-−₹$]*\d[\d,.]*%?\)?$")
_ENTITY = re.compile(r"\b(?:Limited|Ltd\.?|Private|Pvt\.?|Sdn\.?|Bhd\.?|LLC|LLP|Inc\.?|FZE|FZCO|GmbH|B\.V\.|Pte\.?|S\.A\.|PLC|Corporation)(?=\W|$)", re.I)


def listlike(text: str) -> bool:
    """Task #328 (developer file 27, C): a results filing's "point" that is really a table row or a list of names, not a statement. Such a point is left
    out of the key points (it stays in Every point). True for: a row of figures (at least four numbers making up 40% or more of the words, or numbers with
    hardly any ordinary words); a run of statement line labels (eight or more long words, 70% or more of them capitalised, almost no lower-case words);
    a list of names (two or more company-form words such as Limited, Sdn or FZE, or four or more ; separated parts)."""
    words = text.split()
    if not words:
        return False
    nums = sum(1 for w in words if _NUM.match(w.strip(".,;:")))
    lower = [w for w in words if w[:1].islower() and w.isalpha() and len(w) > 2]
    if nums >= 4 and (nums / len(words) >= 0.4 or len(lower) < 3):
        return True
    long_ = [w.strip(".,;:()") for w in words if len(w.strip(".,;:()")) > 3 and w.strip(".,;:()").isalpha()]
    caps = [w for w in long_ if w[:1].isupper()]
    if len(long_) >= 8 and len(caps) / len(long_) >= 0.7 and len(lower) <= 3:
        return True
    if len(_ENTITY.findall(text)) >= 2 or text.count(";") >= 3:
        return True
    return False


def shape(d: Dict[str, Any], k: Optional[str] = None) -> Dict[str, Any]:
    """The page's view of one scored document: the figures, the key points (hard triggers, then the points that carry most, red and green both) and the
    scored points in document order (at most MAX_POINTS). Point scores are shown whole, rounded as the workflow prints them."""
    names = L.THEMES
    scored = [p for p in d["points"] if p["status"] == "scored"]

    def view(p: Dict[str, Any]) -> Dict[str, Any]:
        return {"id": p["id"], "page": p["page"], "section": p["section"] or None, "speaker": p.get("speaker"), "text": p["text"][:420],
                "score": round(p["score"]), "band": p["band"], "theme": p["theme"], "themeName": names.get(p["theme"], "General"), "rules": p["rules"],
                "hard": bool(p["hard"])}
    # Key points: a hard trigger first, then the points that carry listed words (a theme), the ones that move furthest from 50 and weigh most first;
    # very long points (a table run or a whole paragraph) and points with no theme only fill what is left.
    def rank(p: Dict[str, Any]):
        return (not p["hard"], p["theme"] == "GEN" or len(p["text"]) > 400, -(p["weight"] * abs(p["score"] - 50)))
    # task #328: in a results filing, table rows and lists of names are not key points (a hard trigger always stays)
    pool = [p for p in scored if p["hard"] or not listlike(p["text"])] if k == "R" else scored
    ranked = sorted(pool, key=rank)
    key: List[Dict[str, Any]] = []
    per: Dict[str, int] = {}
    for p in ranked:                     # at most two per theme first, so the key points cover the document's range
        if len(key) < KEY_POINTS and (p["hard"] or per.get(p["theme"], 0) < 2):
            key.append(p)
            per[p["theme"]] = per.get(p["theme"], 0) + 1
    key += [p for p in ranked if p not in key][:KEY_POINTS - len(key)]
    return {k: d[k] for k in ("score", "band", "confidence", "hardTriggers", "capped", "mixed", "boundary", "counts", "share", "params", "lexicon")} | {
        "themes": [t for t in d["themes"]], "keyPoints": [view(p) for p in key], "points": [view(p) for p in scored[:MAX_POINTS]],
        "more": max(0, len(scored) - MAX_POINTS)}


async def score_one(app: Any, symbol: str, k: str, doc: Dict[str, Any]) -> Dict[str, Any]:
    """One document's score: cached, else scored now from kept pages, else read in the background ("reading")."""
    redis, store = app.state.store.redis, app.state.store
    key = _cache_key(doc["link"], k)
    try:
        hit = await redis.get(key)
    except Exception:
        hit = None
    if hit:
        return json.loads(hit)
    kept = await docstore.get_pages(store, doc["link"])
    if kept is None:
        if (doc["link"], k) not in _inflight:
            _inflight.add((doc["link"], k))
            asyncio.create_task(_background(app, symbol, k, doc))
        return {"status": "reading"}
    return await _score_and_keep(app, symbol, k, doc, kept)


async def _score_and_keep(app: Any, symbol: str, k: str, doc: Dict[str, Any], pages: List[str]) -> Dict[str, Any]:
    part = split_combined(pages, k)
    d = await asyncio.to_thread(score_document, segment(part, k), k)
    if not d["counts"]["scored"]:
        out = {"status": "unreadable", "why": "The file holds no text FinLit can read (a scanned or image-only file)."}
    else:
        out = {"status": "scored", **shape(d, k), "pages": len(part), "ofPages": len(pages)}
    try:
        await app.state.store.redis.set(_cache_key(doc["link"], k), json.dumps(out), ex=CACHE_DAYS * 86400)
    except Exception:
        log.warning("docscore: score not kept for %s", symbol, exc_info=True)
    return out


async def _background(app: Any, symbol: str, k: str, doc: Dict[str, Any]) -> None:
    try:
        pages = await _read(app.state.store, doc, symbol, k)
        if pages is None:
            try:
                await app.state.store.redis.set(_cache_key(doc["link"], k), json.dumps(
                    {"status": "unreadable", "why": "The exchange did not send a readable copy of this file. FinLit tries again tomorrow."}), ex=86400)
            except Exception:
                pass
            return
        await _score_and_keep(app, symbol, k, doc, pages)
    except Exception:
        log.warning("docscore: %s %s not scored", symbol, k, exc_info=True)
    finally:
        _inflight.discard((doc["link"], k))


async def company(app: Any, symbol: str) -> Dict[str, Any]:
    """The page's one read: the three documents, each scored (or reading / none / unreadable), and the company score from those that are scored."""
    docs = await documents(app.state.store, symbol)
    out: Dict[str, Any] = {}
    for k in ("P", "C", "R"):
        doc = docs[k]
        if doc is None:
            out[k] = {"status": "none", "name": DOC_NAMES[k]}
            continue
        res = await score_one(app, symbol, k, doc)
        out[k] = {"name": DOC_NAMES[k], "doc": {x: doc.get(x) for x in ("title", "date", "link", "source")}, **res}
    comp = company_score({k: v.get("score") for k, v in out.items() if v.get("status") == "scored"})
    return {"symbol": symbol, "lexicon": L.LEXICON_VERSION, "bands": {"green": [L.GREEN_FROM, 100], "yellow": [L.YELLOW_FROM, L.GREEN_FROM], "red": [0, L.YELLOW_FROM]},
            "docs": out, "company": comp, "reading": any(v.get("status") == "reading" for v in out.values())}
