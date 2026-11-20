"""Task #272 (Watchlists and Alerts, 20 Nov pack): "What changed at these companies", the read behind the shared block on the Watchlists page (and,
next, the portfolio pages): GET /api/discovery/changes?symbols=A,B,C.

For each asked company placed on Discover: one entry per kind of Discover's eight (board.EVENTS) it filed in the last 90 days, with the count, the newest
filing's date, subject and exchange link. Companies not placed on Discover are named apart ("Not in Discover yet"). The subjects come from every sorted
filing of the 90 days (discovery_signals), not from the company panel's newest 12, so each row can carry its subject. Describes what was filed; never a pick."""

from __future__ import annotations

from typing import Any, Dict, List

from . import board as B

MAX_SYMBOLS = 300


async def changes(store, symbols: List[str]) -> Dict[str, Any]:
    syms = list(dict.fromkeys(s for s in symbols if s))[:MAX_SYMBOLS]
    async with store.pool.acquire() as conn:
        placed = {r["symbol"]: (r["company"] or r["symbol"]) for r in await conn.fetch(
            "SELECT symbol, company FROM discovery_companies WHERE symbol = ANY($1::text[]) AND primary_bucket IS NOT NULL", syms)}
        rows = [dict(r) for r in await conn.fetch(
            "SELECT symbol, item_date, event, title, link FROM discovery_signals WHERE symbol = ANY($1::text[]) AND event = ANY($2::text[]) "
            "AND item_date >= current_date - $3::int ORDER BY item_date DESC, feed_id DESC", list(placed), list(B.EVENTS), B.NEWS_DAYS)] if placed else []
        names = {r["symbol"]: r["name"] for r in await conn.fetch("SELECT symbol, name FROM companies WHERE symbol = ANY($1::text[])", syms)}
    by: Dict[str, Dict[str, Dict[str, Any]]] = {}
    seen = set()
    for x in rows:
        key = (x["symbol"], x["item_date"], (x["title"] or "").strip().lower())
        if key in seen:        # the same filing stored as news and as a document is one filing
            continue
        seen.add(key)
        e = by.setdefault(x["symbol"], {}).get(x["event"])
        if e is None:
            by[x["symbol"]][x["event"]] = {"n": 1, "d": x["item_date"].isoformat(), "t": B.clean_title(x["title"]) or None,
                                           "l": x["link"] if B.safe_link(x["link"]) else None,
                                           "dates": [x["item_date"].isoformat()]}
        else:
            e["n"] += 1
            e["dates"].append(x["item_date"].isoformat())
    companies = []
    for s in syms:
        if s not in placed:
            continue
        companies.append({"s": s, "n": placed[s] or names.get(s) or s, "ev": by.get(s, {})})
    return {"days": B.NEWS_DAYS, "events": list(B.EVENTS), "companies": companies,
            "notPlaced": [{"s": s, "n": names.get(s) or s} for s in syms if s not in placed]}
