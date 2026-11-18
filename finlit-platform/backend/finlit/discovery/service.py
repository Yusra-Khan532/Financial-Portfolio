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
ORDER BY d.item_date DESC, d.symbol
LIMIT $3
"""

UPSERT_SQL = """
INSERT INTO discovery_companies (symbol, company, doc_title, doc_date, doc_link, status, primary_bucket, secondary, scores, evidence, pages, read_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, now())
ON CONFLICT (symbol) DO UPDATE SET company = EXCLUDED.company, doc_title = EXCLUDED.doc_title, doc_date = EXCLUDED.doc_date, doc_link = EXCLUDED.doc_link,
    status = EXCLUDED.status, primary_bucket = EXCLUDED.primary_bucket, secondary = EXCLUDED.secondary, scores = EXCLUDED.scores,
    evidence = EXCLUDED.evidence, pages = EXCLUDED.pages, read_at = now()
"""


async def pending(store, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    async with store.pool.acquire() as conn:
        rows = await conn.fetch(PENDING_SQL, LOOKBACK_DAYS, RETRY_FAILED_H, limit)   # LIMIT NULL = every row
    return [dict(r) for r in rows]


async def save(store, doc: Dict[str, Any], result: Dict[str, Any], pages: Optional[int]) -> None:
    async with store.pool.acquire() as conn:
        await conn.execute(UPSERT_SQL, doc["symbol"], doc.get("company"), doc.get("title"), doc.get("item_date"), doc["link"], result["status"],
                           result.get("primary"), list(result.get("secondary") or []), json.dumps(result.get("scores") or {}),
                           json.dumps(result.get("evidence") or []), pages)


async def read_one(fetcher: Fetcher, link: str) -> tuple[Dict[str, Any], Optional[int]]:
    """Download, take the text of the first pages (the notes: 80), classify. A file the exchange did not give is status "error" with the reason."""
    try:
        pdf = await fetcher.pdf(link, DOC_PDF_BYTES)
    except (Blocked, FetchFailed) as e:
        return {"status": "error", "reason": str(e)}, None
    pages = await asyncio.to_thread(extract_pages, pdf, K.MAX_PAGES)
    return K.classify("\n".join(pages)), len(pages)


async def run(store, limit: int = 300, max_minutes: float = 40.0, symbols: Optional[List[str]] = None, fetcher: Optional[Fetcher] = None) -> Dict[str, Any]:
    started = time.monotonic()
    todo = await pending(store)
    if symbols:
        want = {s.upper() for s in symbols}
        todo = [d for d in todo if d["symbol"] in want]
    own = fetcher is None
    f = fetcher or Fetcher(budget=limit * 2 + 10)
    counts: Dict[str, int] = {}
    errors: List[str] = []
    done = 0
    try:
        for doc in todo[:limit]:
            if (time.monotonic() - started) / 60 >= max_minutes:
                break
            try:
                result, n = await read_one(f, doc["link"])
            except BudgetSpent:
                break
            except Exception as e:                       # a broken file never stops the run: recorded with the reason, tried again after a day
                log.warning("discovery: %s: %s", doc["symbol"], type(e).__name__)
                result, n = {"status": "error", "reason": type(e).__name__}, None
            if result["status"] == "error" and len(errors) < 20:
                errors.append(f"{doc['symbol']}: {result.get('reason')}")
            await save(store, doc, result, n)
            counts[result["status"]] = counts.get(result["status"], 0) + 1
            done += 1
    finally:
        if own:
            await f.aclose()
    res = {"pending": len(todo), "read": done, "unreached": max(0, len(todo) - done), "statuses": counts, "errors": errors,
           "minutes": round((time.monotonic() - started) / 60, 1)}
    try:
        await store.redis.set(RUN_KEY, json.dumps(res), ex=7 * 86400)
    except Exception:   # nosec B110 - the probe then falls back to the clock
        pass
    return res


async def has_work(store) -> Optional[bool]:
    """For the job supervisor: True when the last run stopped with presentations it never reached, so the job continues soon."""
    raw = await store.redis.get(RUN_KEY)
    if not raw:
        return None
    return int(json.loads(raw).get("unreached") or 0) > 0


# ------------------------------------------------------------------------------------------------ the page
def _row(r: Dict[str, Any]) -> Dict[str, Any]:
    scores = r["scores"] if isinstance(r["scores"], dict) else json.loads(r["scores"] or "{}")
    ev = r["evidence"] if isinstance(r["evidence"], list) else json.loads(r["evidence"] or "[]")
    top = scores.get(r["primary_bucket"]) or {}
    return {"symbol": r["symbol"], "company": r["company"], "primary": r["primary_bucket"], "secondary": list(r["secondary"] or []),
            "score": top.get("score"), "keywords": list((top.get("terms") or {}).keys()), "evidence": ev, "hasFigures": r["status"] == "ok",
            "document": {"title": r["doc_title"], "date": r["doc_date"].isoformat() if r["doc_date"] else None, "link": r["doc_link"], "pages": r["pages"]},
            "readAt": r["read_at"].isoformat() if r["read_at"] else None}


async def overview(store, theme: Optional[str] = None, symbol: Optional[str] = None) -> Dict[str, Any]:
    """Every theme with its counts; with theme=, that theme's companies (primary, then those where it is a secondary theme); with symbol=, one company's themes."""
    async with store.pool.acquire() as conn:
        rows = [dict(r) for r in await conn.fetch(
            "SELECT * FROM discovery_companies WHERE primary_bucket IS NOT NULL ORDER BY doc_date DESC NULLS LAST, symbol")]
        stat = {r["status"]: r["n"] for r in await conn.fetch("SELECT status, count(*) AS n FROM discovery_companies GROUP BY status")}
        last = await conn.fetchval("SELECT max(read_at) FROM discovery_companies")
    if symbol:
        rows = [r for r in rows if r["symbol"] == symbol.upper()]
    themes = []
    for name in K.BUCKETS:
        prim = [_row(r) for r in rows if r["primary_bucket"] == name]
        sec = [_row(r) for r in rows if name in (r["secondary"] or [])]
        prim.sort(key=lambda x: -(x["score"] or 0))
        if not symbol and theme != name:      # the list of themes: counts and the first names only (the page opens one theme at a time)
            themes.append({"name": name, "primary": len(prim), "secondary": len(sec), "preview": [c["company"] or c["symbol"] for c in prim[:3]]})
            continue
        themes.append({"name": name, "primary": len(prim), "secondary": len(sec), "companies": prim, "alsoMentions": sec})
    return {"themes": themes, "companies": len(rows), "read": sum(stat.values()), "statuses": stat,
            "updated": last.isoformat() if last else None, "caution": K.CAUTION,
            "method": "The newest investor presentation each company filed with NSE, first 80 pages, matched against 21 themes and their keywords. "
                      "A theme counts when 2 different keywords or 5 mentions appear; the primary theme scores highest, a secondary one at least half of it."}
