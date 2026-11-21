"""The all-IPOs table and the IPO report, served from ipo_gmp (finlit/ipogmp.py, finlit/iporecord.py, finlit/iponse.py) and our own daily prices.

    GET /api/ipos/history          every IPO on record, current and past, one light row each (the table filters, sorts and searches in the browser)
    GET /api/ipos/record/{id}      one IPO in full: the row above plus issue terms, reservation, timetable, offer documents, subscription by category,
                                   bids at each price, GMP log, key figures, restated financials, objects of the issue, issue expenses and the anchor book

Arithmetic only: listing gain = (listing price - issue price) / issue price; listing-day close and the latest close come from our own daily prices (the
exchange's closes), return since IPO = (latest close - issue price) / issue price. Each source is named in the response. Describes; never advises.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Path, Request
from fastapi.responses import Response

from .ipogmp import SOURCE_NAME, SOURCE_URL, verdict

router = APIRouter()
IST = timezone(timedelta(hours=5, minutes=30))
NOT_LISTED_AFTER = 45     # days after the bidding closed with no listing: the issue is shown as "did not list"

SOURCES = {
    "issue": {"name": SOURCE_NAME, "url": SOURCE_URL, "what": "Issue details, reservation, timetable, offer documents, overall subscription, GMP and figures from the offer document"},
    "nse": {"name": "NSE", "url": "https://www.nseindia.com/market-data/all-upcoming-issues-ipo", "what": "Subscription by investor category and bids at each price (consolidated book)"},
    "prices": {"name": "FinLit daily prices", "url": None, "what": "Listing-day close and latest close"},
}

ROWS_SQL = """SELECT g.ig_id, g.url, g.name, g.nse, g.bse, g.isin, g.board, g.sector, g.issue_price, g.listing_price, g.listing_date, g.subscription,
    g.issue_size_cr, g.gmp, g.gmp_pct, g.listing_pct, g.listed, g.open_date, g.close_date, g.fetched_at,
    g.detail -> 'issue' AS issue, g.detail -> 'timetable' AS tt, g.nse_book -> 'categories' AS cats,
    lc.close AS listing_close, cur.close AS last_close, cur.day AS last_day
    FROM ipo_gmp g
    LEFT JOIN LATERAL (SELECT close FROM price_daily p WHERE p.symbol = g.nse AND p.day = g.listing_date) lc ON g.nse IS NOT NULL AND g.listed
    LEFT JOIN LATERAL (SELECT close, day FROM price_daily p WHERE p.symbol = g.nse AND p.day >= g.listing_date ORDER BY p.day DESC LIMIT 1) cur
        ON g.nse IS NOT NULL AND g.listed
    WHERE ($1::int IS NULL OR g.ig_id = $1)
    ORDER BY COALESCE(g.open_date, g.listing_date) DESC NULLS LAST, g.ig_id DESC"""
FULL_SQL = "SELECT detail, nse_book, history FROM ipo_gmp WHERE ig_id = $1"


def _f(v: Any) -> Optional[float]:
    return float(v) if v is not None else None


def _j(v: Any) -> Any:
    return json.loads(v) if isinstance(v, str) else v


def pct(a: Optional[float], b: Optional[float]) -> Optional[float]:
    """(a - b) / b in percent, rounded to 0.01."""
    return round((a - b) / b * 100, 2) if a is not None and b else None


def status(listed: bool, withdrawn: bool, open_d: Optional[date], close_d: Optional[date], today: date) -> str:
    if withdrawn:
        return "withdrawn"
    if listed:
        return "listed"
    if open_d and today < open_d:
        return "upcoming"
    if open_d and close_d and open_d <= today <= close_d:
        return "open"
    if close_d and today > close_d:
        return "not_listed" if (today - close_d).days > NOT_LISTED_AFTER else "closed"
    return "upcoming"


def row(r: Dict[str, Any], today: date) -> Dict[str, Any]:
    """One IPO as a table row."""
    iss, tt = _j(r["issue"]) or {}, _j(r["tt"]) or {}
    cats = {c["key"]: c["times"] for c in (_j(r["cats"]) or []) if isinstance(c, dict) and c.get("key")}
    issue, lp = _f(r["issue_price"]), _f(r["listing_price"])
    last, lclose = _f(r["last_close"]), _f(r["listing_close"])
    st = status(bool(r["listed"]), bool(iss.get("withdrawn")), r["open_date"], r["close_date"], today)
    return {
        "id": r["ig_id"], "name": r["name"], "symbol": r["nse"] or r["bse"], "nse": r["nse"], "bse": r["bse"], "board": r["board"], "sector": r["sector"],
        "exchanges": iss.get("exchanges") or [], "kind": iss.get("kind"), "status": st,
        "openDate": r["open_date"].isoformat() if r["open_date"] else None, "closeDate": r["close_date"].isoformat() if r["close_date"] else None,
        "listingDate": r["listing_date"].isoformat() if r["listing_date"] else (tt.get("listing") if st in ("upcoming", "open", "closed") else None),
        "priceLow": iss.get("priceLow"), "priceHigh": iss.get("priceHigh"), "issuePrice": issue, "lotSize": iss.get("lotSize"), "minAmount": iss.get("minAmount"),
        "issueSizeCr": _f(r["issue_size_cr"]) if not iss.get("totalCr") else iss.get("totalCr"), "freshCr": iss.get("freshCr"), "ofsCr": iss.get("ofsCr"),
        "subscription": _f(r["subscription"]), "subQib": cats.get("qib"), "subNii": cats.get("nii"), "subRetail": cats.get("retail"),
        "gmp": _f(r["gmp"]), "gmpPct": _f(r["gmp_pct"]), "listingPrice": lp if r["listed"] else None, "listingPct": _f(r["listing_pct"]) if r["listed"] else None,
        "listingClose": lclose, "listingClosePct": pct(lclose, issue), "lastClose": last, "lastDay": r["last_day"].isoformat() if r["last_day"] else None,
        "sinceIpoPct": pct(last, issue), "verdict": verdict(_f(r["gmp_pct"]), _f(r["listing_pct"])) if r["listed"] else None,
    }


def _today() -> date:
    return datetime.now(IST).date()


@router.get("/api/ipos/history")
async def history(request: Request) -> Response:
    """Public. Every IPO on record as a light row, newest first."""
    async with request.app.state.store.pool.acquire() as conn:
        rs = [dict(x) for x in await conn.fetch(ROWS_SQL, None)]
        newest = await conn.fetchval("SELECT max(fetched_at) FROM ipo_gmp")
    today = _today()
    body = {"items": [row(x, today) for x in rs], "asOf": today.isoformat(), "updatedAt": newest.isoformat() if newest else None, "sources": SOURCES,
            "note": "GMP (grey market premium) is an informal, unofficial grey-market price, as InvestorGain recorded it; it is not an exchange figure."}
    return Response(json.dumps(body, default=str), media_type="application/json", headers={"Cache-Control": "public, max-age=600"})


@router.get("/api/ipos/record/{ig_id}")
async def record(request: Request, ig_id: int = Path(..., ge=1, le=10_000_000)) -> Response:
    """Public. One IPO in full."""
    async with request.app.state.store.pool.acquire() as conn:
        r = await conn.fetchrow(ROWS_SQL, ig_id)
        full = await conn.fetchrow(FULL_SQL, ig_id)
    if not r or not full:
        raise HTTPException(status_code=404, detail="No IPO with that id")
    base = row(dict(r), _today())
    det = _j(full["detail"]) or {}
    body = {**base, "url": r["url"], "isin": r["isin"], "detail": det or None, "nseBook": _j(full["nse_book"]), "gmpHistory": _j(full["history"]) or [],
            "updatedAt": r["fetched_at"].isoformat() if r["fetched_at"] else None, "sources": SOURCES,
            "note": "GMP (grey market premium) is an informal, unofficial grey-market price, as InvestorGain recorded it; it is not an exchange figure."}
    return Response(json.dumps(body, default=str), media_type="application/json", headers={"Cache-Control": "public, max-age=600"})
