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
# Task #254: the newest stored filing of any other kind the Documents page shows (call transcript, annual report, results filing), straight from the
# database, for when the Documents list (newest filings only) does not reach it. An annual report is filed once a year, so its window is two years.
KIND_RULES = {
    "Call transcript": ("document", r"transcript|concall|earnings call", r"annual report|integrated report"),
    "Annual report": ("document", r"annual report|integrated report", r"intimation|notice of (agm|annual general)|book closure|record date|newspaper"),
    "Results filing": ("result", r"financial results|outcome of board meeting|results for the (quarter|period|year)",
                       r"board meeting for results|intimation|con\.? ?call|analyst|recording|transcript|press release|newspaper"),
}
KIND_DAYS = {"Annual report": 760}
FEED_KIND_SQL = """
SELECT f.title, f.item_date, f.link, f.category FROM feed_items f
WHERE f.kind = $2 AND f.symbol = $1 AND f.link LIKE 'https://%'
  AND f.item_date >= current_date - $5::int
  AND (coalesce(f.category, '') || ' ' || f.title) ~* $3
  AND (coalesce(f.category, '') || ' ' || f.title) !~* $4
ORDER BY f.item_date DESC, f.id DESC LIMIT 12
"""
HELD_SQL = """
SELECT coalesce(category, '') AS category, title, item_date FROM feed_items
WHERE kind = 'document' AND symbol = $1 AND item_date >= current_date - $2::int ORDER BY item_date DESC LIMIT 200
"""


# The same company and kind, filed before the document just kept (bounded: one company's rows of one kind).
OLDER_SQL = "DELETE FROM document_pages WHERE symbol = $1 AND kind = $2 AND filed < $3 AND link <> $4"
# Kept documents filed (or, with no date, read) more than $1 days ago, at most $2 a time, except each company's newest annual report (task #254: a
# yearly document stays until the next one arrives).
PRUNE_SQL = """
DELETE FROM document_pages WHERE link IN (
  SELECT d.link FROM document_pages d
  WHERE coalesce(d.filed, d.read_at::date) < current_date - $1::int
    AND NOT (d.kind = 'Annual report' AND NOT EXISTS (
      SELECT 1 FROM document_pages n WHERE n.symbol = d.symbol AND n.kind = 'Annual report'
        AND coalesce(n.filed, n.read_at::date) > coalesce(d.filed, d.read_at::date)))
  LIMIT $2)
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
    """Keeps the text of a document read just now, and (task #254) only the newest document of each kind per company: older ones of the same kind
    and company go once a newer one is kept. False (logged) when it could not be kept; the caller goes on."""
    if store is None or not link or not any(isinstance(p, str) and p.strip() for p in pages or []):
        return False                  # a failed or empty parse is never kept, so the next question downloads the file again
    sym, day = (symbol or "").upper(), _day(filed)
    try:
        async with store.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO document_pages (link, symbol, kind, title, filed, pages, read_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,now()) "
                "ON CONFLICT (link) DO UPDATE SET symbol=$2, kind=$3, title=$4, filed=$5, pages=$6::jsonb, read_at=now()",
                link, sym, kind, title, day, json.dumps(pages))
            if day is not None:
                await conn.execute(OLDER_SQL, sym, kind, day, link)
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


async def feed_documents(store: Any, symbol: str, kind: str) -> List[Dict[str, Any]]:
    """Task #254: the stored filings of one kind (call transcript, annual report, results filing) for the company, newest first, from the database
    (the Documents list the tool reads first returns the newest filings only). Empty without a database or on a fault (logged)."""
    rule = KIND_RULES.get(kind)
    if store is None or rule is None:
        return []
    feed_kind, want, avoid = rule
    try:
        async with store.pool.acquire() as conn:
            rows = await conn.fetch(FEED_KIND_SQL, symbol.upper(), feed_kind, want, avoid, KIND_DAYS.get(kind, KEEP_DAYS))
    except Exception:
        log.warning("%s filings not read for %s", kind.lower(), symbol, exc_info=True)
        return []
    return [{"title": r["title"], "date": str(r["item_date"]) if r["item_date"] else None, "link": r["link"], "category": r["category"],
             "from": "documents"} for r in rows]


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
    """Removes kept documents filed (or, with no date, read) more than `days` ago, at most `batch` at a time, keeping each company's newest annual report
    however old (task #254). 0 on any fault (logged)."""
    if store is None:
        return 0
    try:
        async with store.pool.acquire() as conn:
            res = await conn.execute(PRUNE_SQL, days, batch)
        return int(str(res).split()[-1]) if res else 0
    except Exception:
        log.warning("document pages not pruned", exc_info=True)
        return 0
