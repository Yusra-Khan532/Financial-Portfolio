"""Discovery (task #221): read each company's newest investor presentation from the Documents section (feed_items, the filings NSE lists) and put the
company in the founder's themes (keywords.py). Nightly job `refresh-discovery` (finlit/jobs/registry.py "discovery"); the page reads GET /api/discovery.

Which file: per company, the newest filing that the Documents page itself calls an "Investor presentation" (the rule of frontend lib/feed.ts docType and
ask/pages.doc_type), in the last 400 days. A company is read again only when a newer presentation is filed; a read that failed (the exchange did not
answer) is tried again after a day. Newest filings first, bounded per run (time and count), so a run that stops with companies left continues on the
next run (resumable: the supervisor's probe asks has_work)."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional

from ..earnings.transcripts import DOC_PDF_BYTES, Blocked, BudgetSpent, FetchFailed, Fetcher, extract_pages
from . import keywords as K
from . import signals as S

log = logging.getLogger("finlit.discovery")
RUN_KEY = "discovery:last_run"
LOOKBACK_DAYS = 400
RETRY_FAILED_H = 24

# The same rule as the Documents page: annual reports and call transcripts first, then a presentation.
PENDING_SQL = """
WITH docs AS (
    SELECT DISTINCT ON (f.symbol) f.symbol, f.company, f.title, f.item_date, f.link
    FROM feed_items f
    WHERE f.kind = 'document' AND f.symbol IS NOT NULL AND f.link LIKE 'https://%'
      AND f.item_date >= current_date - $1::int
      AND (coalesce(f.category, '') || ' ' || f.title) ~* 'presentation'
      AND (coalesce(f.category, '') || ' ' || f.title) !~* 'annual report|integrated report|transcript|concall|earnings call'
    ORDER BY f.symbol, f.item_date DESC, f.id DESC
)
SELECT d.* FROM docs d
LEFT JOIN discovery_companies c ON c.symbol = d.symbol
WHERE c.symbol IS NULL OR c.doc_link <> d.link
   OR (c.status = 'error' AND c.read_at < now() - make_interval(hours => $2::int))
   OR c.rules < $4
ORDER BY (c.symbol IS NOT NULL AND c.doc_link = d.link), d.item_date DESC, d.symbol   -- new presentations before re-reads
LIMIT $3
"""

UPSERT_SQL = """
INSERT INTO discovery_companies (symbol, company, doc_title, doc_date, doc_link, status, primary_bucket, secondary, scores, evidence, pages,
                                 stage, tone, tone_label, rules, read_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, now())
ON CONFLICT (symbol) DO UPDATE SET company = EXCLUDED.company, doc_title = EXCLUDED.doc_title, doc_date = EXCLUDED.doc_date, doc_link = EXCLUDED.doc_link,
    status = EXCLUDED.status, primary_bucket = EXCLUDED.primary_bucket, secondary = EXCLUDED.secondary, scores = EXCLUDED.scores,
    evidence = EXCLUDED.evidence, pages = EXCLUDED.pages, stage = EXCLUDED.stage, tone = EXCLUDED.tone, tone_label = EXCLUDED.tone_label, rules = EXCLUDED.rules,
    read_at = now()
"""


async def pending(store, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    async with store.pool.acquire() as conn:
        rows = await conn.fetch(PENDING_SQL, LOOKBACK_DAYS, RETRY_FAILED_H, limit, K.RULES_VERSION)   # LIMIT NULL = every row
    return [dict(r) for r in rows]


async def save(store, doc: Dict[str, Any], result: Dict[str, Any], pages: Optional[int]) -> None:
    async with store.pool.acquire() as conn:
        await conn.execute(UPSERT_SQL, doc["symbol"], doc.get("company"), doc.get("title"), doc.get("item_date"), doc["link"], result["status"],
                           result.get("primary"), list(result.get("secondary") or []), json.dumps(result.get("scores") or {}),
                           json.dumps(result.get("evidence") or []), pages, (result.get("stage") or {}).get("stage"),
                           (result.get("tone") or {}).get("score"), (result.get("tone") or {}).get("label"), K.RULES_VERSION)


async def read_one(fetcher: Fetcher, link: str, keep: Optional[List[str]] = None) -> tuple[Dict[str, Any], Optional[int]]:
    """Download, take the text of the first pages (the notes: 80), classify. A file the exchange did not give is status "error" with the reason.
    `keep` (task #255) receives the page texts, so FinLit AI can quote the presentation without asking the exchange again."""
    try:
        pdf = await fetcher.pdf(link, DOC_PDF_BYTES)
    except (Blocked, FetchFailed) as e:
        return {"status": "error", "reason": str(e)}, None
    pages = await asyncio.to_thread(extract_pages, pdf, K.MAX_PAGES)
    from .quotes import mend
    pages = [mend(p) for p in pages]          # task #273 (fix 5): split and glued words mended where the text is extracted
    if keep is not None:
        keep[:] = pages
    return K.classify("\n".join(pages)), len(pages)


async def keep_pages(store, doc: Dict[str, Any], pages: List[str]) -> bool:
    """Task #255: the presentation's text for FinLit AI (ask/docstore). Never stops or slows the run: a fault is logged and the run goes on."""
    if not pages or not any(p.strip() for p in pages):
        return False
    try:
        from ..ask import docstore
        return await docstore.put_pages(store, doc["link"], doc["symbol"], "Investor presentation", doc.get("title"), doc.get("item_date"), pages)
    except Exception:
        log.warning("discovery: %s: the presentation's text was not kept", doc.get("symbol"), exc_info=True)
        return False


async def run(store, limit: int = 300, max_minutes: float = 40.0, symbols: Optional[List[str]] = None, fetcher: Optional[Fetcher] = None) -> Dict[str, Any]:
    started = time.monotonic()
    try:                                  # every filing's event, themes and tone first: database only, seconds, and never stopped by a slow exchange
        tagged = await S.tag_new(store)
    except Exception as e:                # a tagging fault is logged and reported, and the presentations are still read
        log.exception("discovery: tagging the filings failed")
        tagged = {"error": type(e).__name__}
    todo = await pending(store)
    if symbols:
        want = {s.upper() for s in symbols}
        todo = [d for d in todo if d["symbol"] in want]
    own = fetcher is None
    f = fetcher or Fetcher(budget=limit * 2 + 10)
    counts: Dict[str, int] = {}
    errors: List[str] = []
    done = kept = 0
    try:
        for doc in todo[:limit]:
            if (time.monotonic() - started) / 60 >= max_minutes:
                break
            texts: List[str] = []
            try:
                result, n = await read_one(f, doc["link"], texts)
            except BudgetSpent:
                break
            except Exception as e:                       # a broken file never stops the run: recorded with the reason, tried again after a day
                log.warning("discovery: %s: %s", doc["symbol"], type(e).__name__)
                result, n = {"status": "error", "reason": type(e).__name__}, None
            if result["status"] == "error" and len(errors) < 20:
                errors.append(f"{doc['symbol']}: {result.get('reason')}")
            await save(store, doc, result, n)
            if await keep_pages(store, doc, texts):
                kept += 1
            counts[result["status"]] = counts.get(result["status"], 0) + 1
            done += 1
    finally:
        if own:
            await f.aclose()
    try:                                   # task #267: then the calls and results, in the minutes the presentations left (their limits unchanged)
        from . import sources as SRC
        left = max(0.0, max_minutes - (time.monotonic() - started) / 60)
        docs = await SRC.run(store, max_minutes=left, symbols=symbols, fetcher=fetcher)
    except Exception as e:                 # a fault here never stops the run or the presentations' result
        log.exception("discovery: calls and results not read")
        docs = {"error": type(e).__name__, "unreached": 0}
    try:                                   # kept texts older than 400 days go, a bounded batch per run; a fault never stops the run
        from ..ask import docstore
        pruned = await docstore.prune(store)
    except Exception:
        log.warning("discovery: kept texts not pruned", exc_info=True)
        pruned = 0
    res = {"filings": tagged, "pending": len(todo), "read": done, "textsKept": kept, "textsPruned": pruned, "unreached": max(0, len(todo) - done), "statuses": counts, "errors": errors,
           "callsAndResults": docs, "sourcesUnreached": int(docs.get("unreached") or 0), "minutes": round((time.monotonic() - started) / 60, 1)}
    try:
        await store.redis.set(RUN_KEY, json.dumps(res), ex=7 * 86400)
    except Exception:   # nosec B110 - the probe then falls back to the clock
        pass
    return res


async def has_work(store) -> Optional[bool]:
    """For the job supervisor: True when the last run stopped with presentations (or, task #267, call transcripts and results filings) it never
    reached, so the job continues soon, or when the stored
    filings were sorted under an older rule (task #273: a deploy that changes the sorting re-sorts them on the next probe, minutes after the deploy,
    not at the next night window; database only, seconds)."""
    try:
        ver = await store.redis.get(S.VERSION_KEY)
    except Exception:   # nosec B110 - without Redis the clock decides, as before
        ver = None
    if ver is not None and (ver.decode() if isinstance(ver, bytes) else str(ver)) != S.TAG_VERSION:
        return True
    raw = await store.redis.get(RUN_KEY)
    if not raw:
        return None
    last = json.loads(raw)
    return int(last.get("unreached") or 0) > 0 or int(last.get("sourcesUnreached") or 0) > 0     # task #267: calls and results left too


# ------------------------------------------------------------------------------------------------ the page
SECTOR_SQL = "SELECT symbol, macro_sector, sector, industry FROM company_classification WHERE symbol = ANY($1::text[])"
NEWS_DAYS = 90


def _row(r: Dict[str, Any], sec: Dict[str, Dict[str, Any]], news: Dict[str, Dict[str, Any]], bucket: Optional[str] = None) -> Dict[str, Any]:
    scores = r["scores"] if isinstance(r["scores"], dict) else json.loads(r["scores"] or "{}")
    ev = r["evidence"] if isinstance(r["evidence"], list) else json.loads(r["evidence"] or "[]")
    b = bucket or r["primary_bucket"]
    top = scores.get(b) or {}
    st = top.get("stage") or {}
    c = sec.get(r["symbol"]) or {}
    return {"symbol": r["symbol"], "company": r["company"], "primary": r["primary_bucket"], "secondary": list(r["secondary"] or []),
            "score": top.get("score"), "keywords": list((top.get("terms") or {}).keys()), "verify": top.get("verify") or [],
            "evidence": ev if b == r["primary_bucket"] else [], "hasFigures": r["status"] == "ok",
            "stage": st.get("stage"), "stageLabel": st.get("label") or K.STAGE_LABEL.get(r.get("stage") or "", "Not stated"),
            "tone": {"score": r.get("tone"), "label": r.get("tone_label")},
            "sector": {"macro": c.get("macro_sector"), "sector": c.get("sector"), "industry": c.get("industry")},
            "filings": news.get(r["symbol"]) or {"count": 0, "positive": 0, "negative": 0, "events": {}},
            "document": {"title": r["doc_title"], "date": r["doc_date"].isoformat() if r["doc_date"] else None, "link": r["doc_link"], "pages": r["pages"]},
            "readAt": r["read_at"].isoformat() if r["read_at"] else None}


def _label(name: str) -> str:
    """Task #273: the theme's one label (the card's), from board.label_of."""
    from .board import label_of
    return label_of(name) or name


def theme_tone(companies: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Task #245: a theme's tone from its companies' own presentations. Positive when at least 9 in 10 of the rated ones read Positive, Negative when
    the negative ones outnumber the positive, else Mixed (every theme's average sits above the company Positive line, so an average would mark them
    all Positive). None when no presentation was rated (too few words)."""
    labels = [(c.get("tone") or {}).get("label") for c in companies]
    pos, neg, mix = labels.count("Positive"), labels.count("Negative"), labels.count("Mixed")
    rated = pos + neg + mix
    label = None if not rated else "Negative" if neg > pos else "Positive" if pos * 10 >= rated * 9 else "Mixed"
    return {"label": label, "positive": pos, "mixed": mix, "negative": neg, "rated": rated}


def _signal(r: Dict[str, Any]) -> Dict[str, Any]:
    return {"symbol": r["symbol"], "date": r["item_date"].isoformat(), "event": r["event"], "eventLabel": S.EVENT_LABEL.get(r["event"], "Other filing"),
            "tone": r["tone"], "themes": list(r["themes"] or []), "stage": K.STAGE_LABEL.get(r["stage"] or ""), "title": r["title"], "link": r["link"]}


async def overview(store, theme: Optional[str] = None, symbol: Optional[str] = None, sector: Optional[str] = None) -> Dict[str, Any]:
    """Every theme with its counts, its macro sectors and the filings that name it; with theme=, that theme's companies (primary, then those where
    it is a secondary theme) and its recent filings; with symbol=, one company's themes; sector= narrows to one NSE macro sector."""
    async with store.pool.acquire() as conn:
        rows = [dict(r) for r in await conn.fetch(
            "SELECT * FROM discovery_companies WHERE primary_bucket IS NOT NULL ORDER BY doc_date DESC NULLS LAST, symbol")]
        stat = {r["status"]: r["n"] for r in await conn.fetch("SELECT status, count(*) AS n FROM discovery_companies GROUP BY status")}
        last = await conn.fetchval("SELECT max(read_at) FROM discovery_companies")
        syms = sorted({r["symbol"] for r in rows} | ({symbol.upper()} if symbol else set()))
        sec = {r["symbol"]: dict(r) for r in await conn.fetch(SECTOR_SQL, syms)}
        news = {r["symbol"]: {"count": r["n"], "positive": r["pos"], "negative": r["neg"], "events": dict(zip(r["ev"], r["evn"]))}
                for r in await conn.fetch(
                    "SELECT symbol, sum(n)::int AS n, sum(pos)::int AS pos, sum(neg)::int AS neg, array_agg(event) AS ev, array_agg(n) AS evn FROM ("
                    "  SELECT symbol, event, count(*) AS n, count(*) FILTER (WHERE tone > 0) AS pos, count(*) FILTER (WHERE tone < 0) AS neg"
                    "  FROM discovery_signals WHERE symbol = ANY($1::text[]) AND item_date >= current_date - $2::int GROUP BY symbol, event) x GROUP BY symbol",
                    syms, NEWS_DAYS)}
        theme_news = {r["t"]: {"filings": r["n"], "positive": r["pos"], "negative": r["neg"]} for r in await conn.fetch(
            "SELECT t, count(*)::int AS n, count(*) FILTER (WHERE tone > 0)::int AS pos, count(*) FILTER (WHERE tone < 0)::int AS neg "
            "FROM discovery_signals, unnest(themes) AS t WHERE item_date >= current_date - $1::int GROUP BY t", NEWS_DAYS)}
        # task #250: with sector=, only filings of that sector's companies (it used to list every company's filings under a sector's view of a theme)
        recent = [dict(r) for r in await conn.fetch(
            "SELECT s.* FROM discovery_signals s LEFT JOIN company_classification c ON c.symbol = s.symbol "
            "WHERE $1::text = ANY(s.themes) AND s.item_date >= current_date - $2::int AND ($3::text IS NULL OR c.macro_sector = $3::text) "
            "ORDER BY s.item_date DESC, s.feed_id DESC LIMIT 25",
            theme, NEWS_DAYS, sector)] if theme else []
        mine = [dict(r) for r in await conn.fetch(
            "SELECT * FROM discovery_signals WHERE symbol = $1 AND item_date >= current_date - $2::int ORDER BY item_date DESC, feed_id DESC LIMIT 25",
            symbol.upper(), NEWS_DAYS)] if symbol else []
    # task #273: the same main theme as the Discover page (keywords.seat: a lender's technology theme is only a mention without business sentences)
    seated = []
    for r in rows:
        sc = r["scores"] if isinstance(r["scores"], dict) else json.loads(r["scores"] or "{}")
        ev = r["evidence"] if isinstance(r["evidence"], list) else json.loads(r["evidence"] or "[]")
        prim, second, moved = K.seat(r["primary_bucket"], list(r["secondary"] or []), sc, [str(x) for x in ev], (sec.get(r["symbol"]) or {}).get("industry"))
        if prim:
            seated.append({**r, "primary_bucket": prim, "secondary": second, **({"evidence": [], "status": "keyword_only_no_figures"} if moved else {})})
    rows = seated
    if symbol:
        rows = [r for r in rows if r["symbol"] == symbol.upper()]
    if sector:
        rows = [r for r in rows if (sec.get(r["symbol"]) or {}).get("macro_sector") == sector]
    names = {s: (r.get("company") or s) for r in rows for s in [r["symbol"]]}
    themes = []
    for name in K.BUCKETS:
        prim = [_row(r, sec, news) for r in rows if r["primary_bucket"] == name]
        also = [_row(r, sec, news, bucket=name) for r in rows if name in (r["secondary"] or [])]
        prim.sort(key=lambda x: -(x["score"] or 0))
        sectors: Dict[str, int] = {}
        for c in prim:
            k = c["sector"]["macro"] or "Not classified"
            sectors[k] = sectors.get(k, 0) + 1
        stages: Dict[str, int] = {}
        for c in prim:
            stages[c["stageLabel"]] = stages.get(c["stageLabel"], 0) + 1
        base = {"name": name, "label": _label(name), "primary": len(prim), "secondary": len(also), "sectors": dict(sorted(sectors.items(), key=lambda kv: -kv[1])),
                "stages": stages, "news": theme_news.get(name) or {"filings": 0, "positive": 0, "negative": 0}, "tone": theme_tone(prim)}
        if not symbol and theme != name:      # the list of themes: counts and the first names only (the page opens one theme at a time)
            themes.append({**base, "preview": [c["company"] or c["symbol"] for c in prim[:3]]})
            continue
        themes.append({**base, "companies": prim, "alsoMentions": also,
                       "verify": DIRECTORY_VERIFY.get(name, [])[:6],
                       "recentFilings": [{**_signal(x), "company": names.get(x["symbol"])} for x in recent] if theme == name else []})
    by_sector: Dict[str, Dict[str, int]] = {}
    for r in rows:
        k = (sec.get(r["symbol"]) or {}).get("macro_sector") or "Not classified"
        by_sector.setdefault(k, {})
        by_sector[k][r["primary_bucket"]] = by_sector[k].get(r["primary_bucket"], 0) + 1
    out = {"themes": themes, "companies": len(rows), "read": sum(stat.values()), "statuses": stat,
           "updated": last.isoformat() if last else None, "caution": K.CAUTION, "sector": sector,
           "bySector": {k: dict(sorted(v.items(), key=lambda kv: -kv[1])) for k, v in sorted(by_sector.items(), key=lambda kv: -sum(kv[1].values()))},
           "method": METHOD}
    if symbol:
        out["filings"] = [_signal(x) for x in mine]
        c = sec.get(symbol.upper()) or {}
        out["sectorOf"] = {"macro": c.get("macro_sector"), "sector": c.get("sector"), "industry": c.get("industry")}
    return out


GENERIC_VERIFY = "Look for quantified revenue contribution"
# the directory's "what to verify" per theme: the specific checks first, the generic one ("Look for quantified revenue ...") last
DIRECTORY_VERIFY = {b: sorted({c["verify"] for c in cs if c.get("verify")}, key=lambda v: (v.startswith(GENERIC_VERIFY), v)) for b, cs in K.DIRECTORY.items()}
METHOD = ("The newest investor presentation each company filed with NSE, first 80 pages, matched against the 21 themes of FinLit's keyword directory "
          "(each keyword with its related terms). A theme counts when 2 different keywords or 5 mentions appear; the primary theme scores highest, a "
          "secondary one at least half of it. Stage: the most advanced the company's own sentences on the theme show (operating, under execution, "
          "planned, MoU / pilot). Tone: positive minus negative finance words. Filings: every exchange filing of the last 90 days, by event type, "
          "theme and tone. Sectors: NSE's own classification.")
