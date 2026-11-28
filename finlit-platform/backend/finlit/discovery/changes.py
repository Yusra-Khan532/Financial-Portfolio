"""Task #272 (Watchlists and Alerts, 20 Nov pack): "What changed at these companies", the read behind the shared block on the Watchlists page (and,
next, the portfolio pages): GET /api/discovery/changes?symbols=A,B,C.

For each asked company placed on Discover: one entry per kind of Discover's eight (board.EVENTS) it filed in the last 90 days, with the count, the newest
filing's date, subject and exchange link. Companies not placed on Discover are named apart ("Not in Discover yet"). The subjects come from every sorted
filing of the 90 days (discovery_signals), not from the company panel's newest 12, so each row can carry its subject. Describes what was filed; never a pick.

Task #365: each entry also carries "snt", the sentiment of its newest filing (the subject the row shows) from feed_sentiment, in /api/feed's shape
({"score", "band"}), or null while that filing is not scored: never a made-up 0. Discover's own word-count "tone" is a different measure and is not this."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from . import board as B

MAX_SYMBOLS = 300


def _sentiment(score: Any, state: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Task #365: a filing's score and band as /api/feed gives them (a routine filing: band "routine", no score), or None while it is not scored."""
    from ..sentiment import sentiment_json
    return sentiment_json(score, state)


async def changes(store, symbols: List[str]) -> Dict[str, Any]:
    syms = list(dict.fromkeys(s for s in symbols if s))[:MAX_SYMBOLS]
    async with store.pool.acquire() as conn:
        placed = {r["symbol"]: (r["company"] or r["symbol"]) for r in await conn.fetch(
            "SELECT symbol, company FROM discovery_companies WHERE symbol = ANY($1::text[]) AND primary_bucket IS NOT NULL", syms)}
        rows = [dict(r) for r in await conn.fetch(
            "SELECT d.symbol, d.item_date, d.event, d.title, d.link, fs.score AS s_score, fs.state AS s_state FROM discovery_signals d "
            "LEFT JOIN feed_sentiment fs ON fs.feed_id = d.feed_id WHERE d.symbol = ANY($1::text[]) AND d.event = ANY($2::text[]) "
            "AND d.item_date >= current_date - $3::int ORDER BY d.item_date DESC, d.feed_id DESC", list(placed), list(B.EVENTS), B.NEWS_DAYS)] if placed else []
        names = {r["symbol"]: r["name"] for r in await conn.fetch("SELECT symbol, name FROM companies WHERE symbol = ANY($1::text[])", syms)}
    by: Dict[str, Dict[str, Dict[str, Any]]] = {}
    seen: Dict[Any, Any] = {}   # each filing -> the entry it is the newest filing of (None when it is an older one)
    for x in rows:
        key = (x["symbol"], x["item_date"], (x["title"] or "").strip().lower())
        if key in seen:        # the same filing stored as news and as a document is one filing; a score on either copy counts
            if seen[key] is not None and seen[key]["snt"] is None:
                seen[key]["snt"] = _sentiment(x["s_score"], x["s_state"])
            continue
        e = by.setdefault(x["symbol"], {}).get(x["event"])
        seen[key] = None
        if e is None:
            e = by[x["symbol"]][x["event"]] = {"n": 1, "d": x["item_date"].isoformat(), "t": B.clean_title(x["title"]) or None,
                                               "l": x["link"] if B.safe_link(x["link"]) else None,
                                               "dates": [x["item_date"].isoformat()], "snt": _sentiment(x["s_score"], x["s_state"])}
            seen[key] = e
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
