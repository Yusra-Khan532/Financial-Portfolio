"""News, filings, result dates and documents.

Automatic part: every exchange announcement loaded for a company becomes a feed item, sorted into `result` (financial results),
`document` (reports, presentations, transcripts, prospectuses) or `news` (everything else), and given one FinLit topic (Results,
Orders & contracts, Management & board, ...) above the exchange's own category. Manual part: administrators add curated news and
upcoming result dates. The public reads one endpoint, `/api/feed`.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import sys
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

FILING_SOURCE = "Exchange filing"


def _norm(s: Optional[str]) -> str:
    return " ".join((s or "").lower().split())


# ------------------------------------------------------------------ kind: result, document or news
# The exchange's own query to the company about its share price or volume: news, whatever words the reply quotes.
NEWS_CATEGORIES = ("spurt in volume", "price movement")
# Categories that are the results themselves (NSE files the quarterly results as "Integrated Filing- Financial" since 2025).
RESULT_CATEGORY = re.compile(r"^(results?|financial results?|integrated filing\W{0,3}financials?|clarification\W{0,3}financial results?"
                             r"|reasons for delayed.{0,30}financial results?)$")
# Categories that are documents: calls, meets, presentations, reports, newspaper copies.
DOC_CATEGORY = re.compile(r"analysts?/institutional investor|investor presentation|annual report|transcript|newspaper publication|copy of newspaper")
# Words that make a filing a document. Phrases only: a bare "investor" or "analyst" also matched the exchange's volume queries
# ("...ensure that the investors have the latest information"), the Investor Education and Protection Fund and complaints.
DOC_WORDS = re.compile(r"transcript|earnings call|conference call|\bcon\.? ?call|concall|audio recording|video recording|webcast"
                       r"|investor presentation|presentation to (?:the )?(?:analysts|investors)|analysts? meet|institutional investors?"
                       r"|analysts?(?:\(s\))?\s*(?:/|and|&)\s*(?:institutional )?investors?(?:\(s\))?|investors?(?:\(s\))? (?:meet|conference|day)"
                       r"|annual report|integrated report|esg report|sustainability report|business responsibility and sustainability|prospectus"
                       r"|offer document|newspaper")
RESULT_TEXT = re.compile(r"financial results?|\b(?:un-?)?audited\b[^.]{0,60}?\b(?:results?|financials?|financial statements?)\b"
                         r"|integrated filing\W{0,3}financial")
# A results filing in these categories stays a result even when it also mentions the presentation or the call.
RESULT_HOME = ("outcome of board meeting", "board meeting outcome", "press release", "press release (revised)", "board meeting")


def classify(category: str, description: str = "") -> str:
    """`result`, `document` or `news` for one exchange announcement.

    Order matters: the exchange's queries are news; a results category is a result; a document category is a document; then a
    filing that names the results is a result unless it is the call, the transcript, the presentation or the newspaper copy of them."""
    cat = _norm(category)
    low = f"{cat} {_norm(description)}"
    if cat.startswith(NEWS_CATEGORIES):
        return "news"
    if RESULT_CATEGORY.match(cat):
        return "result"
    if DOC_CATEGORY.search(cat):
        return "document"
    names_results = bool(RESULT_TEXT.search(low)) or ("result" in low and "unaudited" in low)
    doc_words = bool(DOC_WORDS.search(low))
    if names_results and (not doc_words or cat in RESULT_HOME):
        return "result"
    if doc_words or "presentation" in low:
        return "document"
    return "news"


# Words that make a filing news even when its stored title was cut (the Investor Education and Protection Fund is not a document).
NEWS_TEXT = re.compile(r"investor education and protection fund|\biepf\b")


def truncated_title(category: Optional[str], title: Optional[str]) -> bool:
    """A stored title is cut to 140 characters of the announcement when the announcement was long (see rows_from_announcements)."""
    c, t = (category or "General"), (title or "")
    return t.startswith(f"{c}: ") and len(t) >= len(c) + 2 + 140


def resort(kind: str, category: Optional[str], title: Optional[str]) -> str:
    """The kind an already stored automatic row should have under today's rules, read from its stored category and title.

    A cut title may have lost the words that sorted the row at load time, so a cut row is never moved to `news` on its text alone,
    and a result is never moved to `news` (the Results page counts it)."""
    new = classify(category or "", title or "")
    if new == kind:
        return kind
    sure = _norm(category).startswith(NEWS_CATEGORIES) or (kind == "document" and bool(NEWS_TEXT.search(_norm(title))))
    if new == "news" and not sure and (kind == "result" or truncated_title(category, title)):
        return kind
    return new


# ------------------------------------------------------------------ topic: FinLit's own group above the exchange's category
TOPICS: Tuple[Tuple[str, str], ...] = (
    ("results", "Results"),
    ("orders", "Orders & contracts"),
    ("people", "Management & board"),
    ("deals", "Deals & tie-ups"),
    ("capital", "Shares & fund raising"),
    ("rating", "Credit rating"),
    ("legal", "Regulatory & legal"),
    ("meetings", "Meetings & votes"),
    ("business", "Business updates"),
    ("compliance", "Compliance filings"),
    ("other", "Other updates"),
)
TOPIC_LABEL = dict(TOPICS)
TOPIC_KEYS = tuple(k for k, _ in TOPICS) + ("documents",)

# Categories that say nothing about their content: their filings are sorted by their words instead.
CATCH_ALL = ("general updates", "updates", "others", "general", "press release", "press release (revised)", "disclosure of material issue",
             "disclosure under regulation 30", "intimation under regulation 30")

_R = lambda p: re.compile(p, re.I)  # noqa: E731
CATEGORY_TOPIC = (
    (_R(r"credit rating"), "rating"),
    (_R(r"orders? passed|action\(s\)|litigation|dispute|rumou?r|clarification|spurt in volume|price movement|penalt|insolvency|default"
        r"|fraud|licen[cs]e|regulator"), "legal"),
    (_R(r"order|contract"), "orders"),
    (_R(r"takeover|insider trading|\bsast\b|pledge|encumbrance|monitoring agency|deviation|certificate|trading window|loss of share"
        r"|newspaper|registrar|transfer agent|name (and symbol )?change|corrigendum|shareholding|investor complaint|compliance report"
        r"|registered office|integrated filing|governance|open offer"), "compliance"),
    (_R(r"acquisition|amalgamation|merger|scheme of arrangement|demerger|arrangements? for|tie[ -]?up|joint venture|divest|disposal"
        r"|restructur"), "deals"),
    (_R(r"allotment|esop|esos|esps|bonus|buy ?back|split|dividend|record date|rights issue|qualified institutional|\bqip\b|preferential"
        r"|warrant|debenture|\bncds?\b|commercial paper|bonds?\b|fund rais|issue of securities|capital|corporate action|interest payment"
        r"|redemption|listing|options? to purchase|forfeiture"), "capital"),
    (_R(r"appointment|resignation|cessation|change in directors?|change in (senior )?management|company secretary|compliance officer"
        r"|auditor|\bkmp\b|\bsmp\b|director"), "people"),
    (_R(r"board meeting|committee meeting|general meeting|\bagm\b|\begm\b|postal ballot|e-?voting|shareholders? meeting|outcome of"),
     "meetings"),
    (_R(r"business update|operational update|sales update|launch|production|capacity"), "business"),
)
_ORDER_WIN = _R(r"\b(?:secur|bag|receiv|win|won|award|obtain|grant)\w*\b[^.]{0,80}?\b(?:orders?|contracts?|loa|letter of (?:award|intent)"
                r"|work orders?|purchase orders?|tenders?)\b|\b(?:orders?|contracts?)\b[^.]{0,40}?\b(?:worth|valued|amounting|aggregating"
                r"|value of|of rs\.?|of inr|crores?|cr\b|million|billion)")
_NOT_ORDER = _R(r"orders? passed|order passed by|court order|tribunal|nclt|order of the hon")
TEXT_TOPIC = (
    (_R(r"\bcredit rating"), "rating"),
    (None, "orders"),   # _ORDER_WIN without _NOT_ORDER
    (_R(r"takeover|\bsast\b|regulation 29|regulation 31|regulation 7\s?\(|insider trading|\bpit\b|structured digital database|open offer"
        r"|disclosure received from"), "compliance"),
    (_R(r"acqui(?:re|red|sition)|amalgamat|merger|demerg|scheme of arrangement|joint venture|\bjv\b"
        r"|incorporat\w* (?:of )?(?:a |an |two |three )?(?:new )?(?:wholly|subsidiar|joint|step|company)|divest|slump sale"
        r"|stake (?:sale|purchase)|tie[- ]up|strategic (?:partnership|alliance)|memorandum of understanding|\bmou\b"
        r"|investment in (?:the )?(?:equity|shares)|additional investment|dissolution|striking off|strike off|winding up|liquidation"),
     "deals"),
    (_R(r"\besops?\b|\besos\b|\besps\b|stock options?|employee stock|exercise of .{0,20}options|allot(?:ment|ted)|\bbonus\b|buy-?back"
        r"|stock split|sub-?division|dividend|record date|rights issue|\bqip\b|qualified institutional|preferential (?:issue|allotment)"
        r"|warrants|debentures|\bncds?\b|commercial paper|\bbonds?\b|\becb\b|fund ?rais|listing approval|issue proceeds"
        r"|interest payment|redemption|regulation 57|trading approval|options? to purchase|forfeiture"), "capital"),
    (_R(r"appointment|resignation|cessation|re-?designation|retirement|change in directors?|change in (?:senior )?management"
        r"|key managerial|\bkmp\b|\bsmp\b"), "people"),
    (_R(r"penalt|show cause|demand (?:order|notice)|tax demand|\bgst\b|income tax|assessment order|search and seizure|\bnclt\b|tribunal"
        r"|high court|supreme court|litigation|arbitra|insolvency|\bcirp\b|fraud|\bdefault|letter from sebi|sebi (?:order|letter)"
        r"|regulator|violation|non-?compliance|clarification|news (?:article|report|item)s?|media reports?|order[- ]in[- ]appeal|\bappeal\b"
        r"|\brbi\b|reserve bank"), "legal"),
    (_R(r"board meeting|committee meeting|general meeting|\bagm\b|\begm\b|postal ballot|e-?voting|cut-?off date|scrutini[sz]er"
        r"|outcome of"), "meetings"),
    (_R(r"press release|launch|open(?:ing|ed|s)? (?:of )?(?:a |its )?(?:new )?(?:showroom|store|outlet|branch|plant|office|facility)"
        r"|commenc|commercial production|resumption of production|capacity|expansion|bhoomi pooja|foundation stone|inaugurat"
        r"|business update|operational update|sales update|awards?\b|recogni[sz]ed|partnership|collaborat|goes live|go live"
        r"|power purchase agreement|closing of (?:manufacturing )?operation|closure of|project updates?|mclr|lending rates?"), "business"),
    (_R(r"monitoring agency|deviation|certificate|trading window|loss of share|duplicate share|registrar|share transfer agent|\brta\b"
        r"|registered office|corporate office|change in (?:the )?address|\bcin\b|change (?:in|of) (?:the )?name|corrigendum|regulation 74"
        r"|investor education|\biepf\b|shareholding pattern|compliance report|compliance under|newspaper|letterhead"
        r"|corporate identification number|reminder to (?:the )?shareholders"), "compliance"),
)


def _text_topic(low: str) -> Optional[str]:
    for rx, topic in TEXT_TOPIC:
        if rx is None:
            if _ORDER_WIN.search(low) and not _NOT_ORDER.search(low):
                return topic
        elif rx.search(low):
            return topic
    return None


def topic_of(kind: str, category: Optional[str], title: Optional[str]) -> str:
    """One FinLit topic for a feed item. Results and documents follow their kind; a news item follows its exchange category, and an
    item in a category that says nothing (General Updates, Updates, Others, Press Release) follows its words."""
    if kind == "result":
        return "results"
    if kind == "document":
        return "documents"
    cat = _norm(category)
    low = f"{cat} {_norm(title)}"
    if cat in CATCH_ALL or cat.startswith("press release"):
        return _text_topic(low) or ("business" if cat.startswith("press release") else "other")
    for rx, topic in CATEGORY_TOPIC:
        if rx.search(cat):
            return topic
    return _text_topic(low) or "other"


# ------------------------------------------------------------------ rows
def dedupe_key(symbol: str, when: str, text: str, link: Optional[str]) -> str:
    return hashlib.sha1(f"{symbol}|{when}|{link or text}".encode()).hexdigest()  # nosec B324 - de-duplication key, not security


def rows_from_announcements(symbol: str, company: str, announcements: List[Dict[str, Any]]) -> List[tuple]:
    out = []
    for a in announcements:
        description = " ".join((a.get("description") or "").split())
        if not a.get("date"):
            continue
        category = a.get("category") or "General"
        title = description if 10 <= len(description) <= 160 else f"{category}: {description[:140]}".strip(": ")
        kind = classify(category, description)
        out.append((kind, title[:300], symbol, company, FILING_SOURCE, a.get("link"), date.fromisoformat(a["date"]),
                    category[:80], None, None, True, topic_of(kind, category, description), dedupe_key(symbol, a["date"], description, a.get("link"))))
    return out


async def save_announcements(conn, symbol: str, company: str, announcements: List[Dict[str, Any]]) -> int:
    """Insert new announcements; an announcement already stored is re-sorted (kind and topic) when today's rules sort it differently,
    so a change to the rules reaches every company the next time it is loaded."""
    rows = rows_from_announcements(symbol, company, announcements)
    if not rows:
        return 0
    await conn.executemany(
        "INSERT INTO feed_items (kind, title, symbol, company, source, link, item_date, category, period, summary, auto, topic, dedupe) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) "
        "ON CONFLICT (dedupe) DO UPDATE SET kind = EXCLUDED.kind, topic = EXCLUDED.topic "
        "WHERE feed_items.auto AND (feed_items.kind, feed_items.topic) IS DISTINCT FROM (EXCLUDED.kind, EXCLUDED.topic)", rows)
    # task #365 re-check: when the stored title is a cut of a long description, the whole description is the filing's lead (its own words for the
    # sentiment model; finlit/filing_text.py). Only a row with no lead yet, so a lead read from the PDF is never replaced.
    from .filing_text import exchange_lead
    leads = [(r[-1], ld) for r, a in zip(rows, [a for a in announcements if a.get("date")]) if (ld := exchange_lead(a.get("description"), r[1]))]
    if leads:
        await conn.execute("UPDATE feed_items f SET lead = u.lead, lead_src = 'exchange' FROM unnest($1::text[], $2::text[]) AS u(dedupe, lead) "
                           "WHERE f.dedupe = u.dedupe AND f.auto AND f.lead IS NULL", [x[0] for x in leads], [x[1] for x in leads])
    return len(rows)


URL_RE = re.compile(r"^https://[^\s<>\"']+$")


# ------------------------------------------------------------------ one-off re-sort of the rows stored before a rule change
async def resort_all(conn, apply: bool = False, batch: int = 5000) -> Dict[str, Any]:
    """Re-sort every stored row under today's rules: kind (automatic exchange rows only, see `resort`) and topic (every row).
    Works in batches by id; without `apply` it only counts what would change."""
    moved: Dict[str, int] = {}
    topics: Dict[str, int] = {}
    last, seen, changed = 0, 0, 0
    while True:
        rows = await conn.fetch("SELECT id, kind, category, title, auto, source, topic FROM feed_items WHERE id > $1 ORDER BY id LIMIT $2", last, batch)
        if not rows:
            break
        last = rows[-1]["id"]
        upd = []
        for r in rows:
            seen += 1
            kind = resort(r["kind"], r["category"], r["title"]) if r["auto"] and r["source"] == FILING_SOURCE else r["kind"]
            topic = topic_of(kind, r["category"], r["title"])
            topics[topic] = topics.get(topic, 0) + 1
            if kind != r["kind"]:
                moved[f"{r['kind']} -> {kind}"] = moved.get(f"{r['kind']} -> {kind}", 0) + 1
            if kind != r["kind"] or topic != r["topic"]:
                upd.append((r["id"], kind, topic))
        changed += len(upd)
        if apply and upd:
            await conn.execute("UPDATE feed_items f SET kind = u.kind, topic = u.topic FROM unnest($1::bigint[], $2::text[], $3::text[]) AS u(id, kind, topic) "
                               "WHERE f.id = u.id", [u[0] for u in upd], [u[1] for u in upd], [u[2] for u in upd])
    return {"rows": seen, "changed": changed, "kind_moves": moved, "topics": topics, "applied": apply}


SORT_RULES = "2026-11-22"      # task #309: the sorting rules' version. Changing classify / resort / topic_of means changing this; the
                               # feed-sort job then re-sorts every stored row once (resumable, by id) without anyone running a command.
SORT_META = "feed:sort"


async def ensure_sorted(store, max_minutes: float = 20.0, batch: int = 5000, clock=None) -> Dict[str, Any]:
    """The `feed-sort` job (task #309). When the stored rules version differs from SORT_RULES, re-sort every stored row under today's
    rules (`resort_all`'s logic) in batches by id, continuing from where the last run stopped; when it is current, do nothing.
    Progress and the counts are kept in mf_meta['feed:sort']."""
    import time
    from .mf import _meta, _set_meta
    clock = clock or time.monotonic
    t0 = clock()
    async with store.pool.acquire() as conn:
        st = await _meta(conn, SORT_META) or {}
        if st.get("version") == SORT_RULES and st.get("done"):
            return {"status": "ok", "why": "rules current", "version": SORT_RULES}
        if st.get("version") != SORT_RULES:
            st = {"version": SORT_RULES, "last_id": 0, "rows": 0, "changed": 0, "kind_moves": {}, "done": False}
        while True:
            if clock() - t0 > max_minutes * 60:
                await _set_meta(conn, SORT_META, st)
                return {"status": "partial", "why": f"time budget of {max_minutes:g} min used; the next run continues after id {st['last_id']}", **st}
            rows = await conn.fetch("SELECT id, kind, category, title, auto, source, topic FROM feed_items WHERE id > $1 ORDER BY id LIMIT $2",
                                    st["last_id"], batch)
            if not rows:
                st["done"] = True
                await _set_meta(conn, SORT_META, st)
                return {"status": "ok", **st}
            upd = []
            for r in rows:
                kind = resort(r["kind"], r["category"], r["title"]) if r["auto"] and r["source"] == FILING_SOURCE else r["kind"]
                topic = topic_of(kind, r["category"], r["title"])
                if kind != r["kind"]:
                    key = f"{r['kind']} -> {kind}"
                    st["kind_moves"][key] = st["kind_moves"].get(key, 0) + 1
                if kind != r["kind"] or topic != r["topic"]:
                    upd.append((r["id"], kind, topic))
            if upd:
                await conn.execute("UPDATE feed_items f SET kind = u.kind, topic = u.topic FROM unnest($1::bigint[], $2::text[], $3::text[]) AS u(id, kind, topic) "
                                   "WHERE f.id = u.id", [u[0] for u in upd], [u[1] for u in upd], [u[2] for u in upd])
            st["rows"] += len(rows)
            st["changed"] += len(upd)
            st["last_id"] = rows[-1]["id"]
            await _set_meta(conn, SORT_META, st)


async def _main(argv: List[str]) -> int:
    """python -m finlit.feed resort [--apply]   (uses DATABASE_URL like the worker; without --apply it only reports)"""
    import argparse
    from .config import get_settings
    from .store import Store
    p = argparse.ArgumentParser(prog="finlit.feed")
    p.add_argument("cmd", choices=["resort"])
    p.add_argument("--apply", action="store_true")
    a = p.parse_args(argv)
    store = await Store.connect(get_settings(), migrate=True)
    try:
        async with store.pool.acquire() as conn:
            print(json.dumps(await resort_all(conn, apply=a.apply), indent=1))
    finally:
        await store.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_main(sys.argv[1:])))
