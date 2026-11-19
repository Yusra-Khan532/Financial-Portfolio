"""The text of company documents FinLit has already read (task #255), and where to find a company's investor presentation when the Documents list
does not name one. FinLit AI reads a document from here first, then from memory, and only then from the exchange, so a slow or throttled exchange no
longer leaves it with nothing. Written by FinLit AI after a download and by the Discovery job when it reads a presentation (migration 115).

Every function takes the app's store (Postgres pool) and is safe without one (tests, the MCP server without a database): it then returns nothing and
the caller goes on as before. A database fault is logged and never stops an answer or a job."""

from __future__ import annotations

import json
import logging
from datetime import date
from typing import Any, Dict, List, Optional

log = logging.getLogger("finlit.ask.docs")
KEEP_DAYS = 400              # the same window as Discovery's (discovery/service.py LOOKBACK_DAYS)
PRUNE_BATCH = 500            # rows removed per prune, so a prune is always short

# The newest filing the Documents page calls an investor presentation, in the last KEEP_DAYS days: Discovery's own rule (discovery/service.py PENDING_SQL).
FEED_PRESENTATION_SQL = """
SELECT f.title, f.item_date, f.link, f.category FROM feed_items f
WHERE f.kind = 'document' AND f.symbol = $1 AND f.link LIKE 'https://%'
  AND f.item_date >= current_date - $2::int
  AND (coalesce(f.category, '') || ' ' || f.title) ~* 'presentation'
  AND (coalesce(f.category, '') || ' ' || f.title) !~* 'annual report|integrated report|transcript|concall|earnings call'
ORDER BY f.item_date DESC, f.id DESC LIMIT 1
"""
HELD_SQL = """
SELECT coalesce(category, '') AS category, title, item_date FROM feed_items
WHERE kind = 'document' AND symbol = $1 AND item_date >= current_date - $2::int ORDER BY item_date DESC LIMIT 200
"""


def store_of(gw: Any) -> Any:
    """The app's store behind a gateway (the in-process website), or None."""
    st = getattr(getattr(getattr(gw, "app", None), "state", None), "store", None)
    return st if getattr(st, "pool", None) is not None else None


def _day(v: Any) -> Optional[date]:
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


async def get_pages(store: Any, link: str) -> Optional[List[str]]:
    if store is None or not link:
        return None
    try:
        async with store.pool.acquire() as conn:
            v = await conn.fetchval("SELECT pages FROM document_pages WHERE link = $1", link)
    except Exception:
        log.warning("document pages not read for %s", link, exc_info=True)
        return None
    if v is None:
        return None
    pages = json.loads(v) if isinstance(v, str) else v
    return [str(p) for p in pages] if isinstance(pages, list) and pages else None


async def put_pages(store: Any, link: str, symbol: str, kind: str, title: Optional[str], filed: Any, pages: List[str]) -> bool:
    """Keeps the text of a document read just now. False (logged) when it could not be kept; the caller goes on."""
    if store is None or not link or not pages:
        return False
    try:
        async with store.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO document_pages (link, symbol, kind, title, filed, pages, read_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,now()) "
                "ON CONFLICT (link) DO UPDATE SET symbol=$2, kind=$3, title=$4, filed=$5, pages=$6::jsonb, read_at=now()",
                link, (symbol or "").upper(), kind, title, _day(filed), json.dumps(pages))
        return True
    except Exception:
        log.warning("document pages not kept for %s", link, exc_info=True)
        return False


async def discovery_presentation(store: Any, symbol: str) -> Optional[Dict[str, Any]]:
    """The presentation Discovery read for the company (its link, title and date), when the Documents list names none."""
    if store is None:
        return None
    try:
        async with store.pool.acquire() as conn:
            r = await conn.fetchrow("SELECT doc_title, doc_date, doc_link FROM discovery_companies WHERE symbol = $1 AND doc_link LIKE 'https://%'",
                                    symbol.upper())
    except Exception:
        log.warning("discovery presentation not read for %s", symbol, exc_info=True)
        return None
    if not r:
        return None
    return {"title": r["doc_title"], "date": str(r["doc_date"]) if r["doc_date"] else None, "link": r["doc_link"], "from": "discovery"}


async def feed_presentation(store: Any, symbol: str) -> Optional[Dict[str, Any]]:
    """The newest stored filing that says "presentation" in its title or category, in the last 400 days (Discovery's rule), straight from the database
    (the Documents list the tool reads first returns the newest filings only)."""
    if store is None:
        return None
    try:
        async with store.pool.acquire() as conn:
            r = await conn.fetchrow(FEED_PRESENTATION_SQL, symbol.upper(), KEEP_DAYS)
    except Exception:
        log.warning("feed presentation not read for %s", symbol, exc_info=True)
        return None
    if not r:
        return None
    return {"title": r["title"], "date": str(r["item_date"]) if r["item_date"] else None, "link": r["link"], "from": "documents"}


async def held(store: Any, symbol: str) -> List[Dict[str, Any]]:
    """The documents FinLit holds for the company in the last 400 days ({category, title, date}), to say what there is when no presentation is."""
    if store is None:
        return []
    try:
        async with store.pool.acquire() as conn:
            rows = await conn.fetch(HELD_SQL, symbol.upper(), KEEP_DAYS)
    except Exception:
        log.warning("documents held not read for %s", symbol, exc_info=True)
        return []
    return [{"category": r["category"], "title": r["title"], "date": str(r["item_date"]) if r["item_date"] else None} for r in rows]


async def prune(store: Any, days: int = KEEP_DAYS, batch: int = PRUNE_BATCH) -> int:
    """Removes kept documents filed (or, with no date, read) more than `days` ago, at most `batch` at a time. 0 on any fault (logged)."""
    if store is None:
        return 0
    try:
        async with store.pool.acquire() as conn:
            res = await conn.execute(
                "DELETE FROM document_pages WHERE link IN (SELECT link FROM document_pages "
                "WHERE coalesce(filed, read_at::date) < current_date - $1::int LIMIT $2)", days, batch)
        return int(str(res).split()[-1]) if res else 0
    except Exception:
        log.warning("document pages not pruned", exc_info=True)
        return 0
