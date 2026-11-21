"""The all-IPOs table and the IPO report, served from ipo_gmp (finlit/ipogmp.py, finlit/iporecord.py, finlit/iponse.py) and our own daily prices.

    GET /api/ipos/history          every IPO on record, current and past, one light row each (the table filters, sorts and searches in the browser)
    GET /api/ipos/record/{id}      one IPO in full: the row above plus issue terms, reservation, timetable, offer documents, subscription by category,
                                   bids at each price, GMP log, key figures, restated financials, objects of the issue, issue expenses and the anchor book

Arithmetic only: listing gain = (listing price - issue price) / issue price; listing-day close and the latest close come from our own daily prices (the
exchange's closes), return since IPO = (latest close - issue price) / issue price. Each source is named in the response. Describes; never advises.
"""

from __future__ import annotations

import json
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Path, Request
from fastapi.responses import Response

from .ipogmp import SOURCE_NAME, SOURCE_URL, verdict

router = APIRouter()
IST = timezone(timedelta(hours=5, minutes=30))
QUOTE_FALLBACK_DAYS = 365   # the nightly quote stands in for our daily closes only this long after listing (it is not split-adjusted)
NOT_LISTED_AFTER = 45     # days after the bidding closed with no listing: the issue is shown as "did not list"

SOURCES = {
    "issue": {"name": SOURCE_NAME, "url": SOURCE_URL, "what": "Issue details, reservation, timetable, offer documents, overall subscription, GMP and figures from the offer document"},
    "nse": {"name": "NSE", "url": "https://www.nseindia.com/market-data/all-upcoming-issues-ipo", "what": "Subscription by investor category and bids at each price (consolidated book)"},
    "prices": {"name": "FinLit daily prices", "url": None, "what": "Listing-day close and latest close"},
}

ROWS_SQL = """SELECT g.ig_id, g.url, g.name, g.nse, g.bse, g.isin, g.board, g.sector, g.issue_price, g.listing_price, g.listing_date, g.subscription,
    g.issue_size_cr, g.gmp, g.gmp_pct, g.listing_pct, g.listed, g.open_date, g.close_date, g.fetched_at,
    g.detail -> 'issue' AS issue, g.day1_open, g.day1_high, g.day1_low, g.day1_close, g.day1_src, g.last_px, g.last_px_date, g.last_px_src, g.detail -> 'timetable' AS tt, g.nse_book -> 'categories' AS cats,
    lc.open AS listing_open, lc.close AS listing_close, cur.close AS last_close, cur.day AS last_day,
    EXISTS (SELECT 1 FROM companies c WHERE c.symbol = g.nse) AS has_page, q.price AS quote_price, q.traded_at AS quote_at
    FROM ipo_gmp g
    LEFT JOIN LATERAL (SELECT open, close FROM price_daily p WHERE p.symbol = g.nse AND p.day = g.listing_date) lc ON g.nse IS NOT NULL AND g.listed
    LEFT JOIN LATERAL (SELECT close, day FROM price_daily p WHERE p.symbol = g.nse AND p.day >= g.listing_date ORDER BY p.day DESC LIMIT 1) cur
        ON g.nse IS NOT NULL AND g.listed
    LEFT JOIN listing_quotes q ON q.symbol = g.nse AND g.listed
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


def adjustment(our_open: Optional[float], listing_price: Optional[float]) -> Optional[float]:
    """Our daily prices are adjusted for later splits and bonuses; the issue and listing prices are not. The listing-day open in our prices against the
    listing price the exchange set gives the factor (1.0 when nothing has been adjusted; 0.5 after a 1:1 bonus or a 2-for-1 split). Within 2% it is 1.0
    (rounding and the odd revised open); None when either figure is missing, and then our closes are used against the issue price as they are."""
    if not our_open or not listing_price:
        return None
    k = our_open / listing_price
    if abs(k - 1) <= 0.02:
        return 1.0
    return k if k < 1 else None        # adjustments only ever lower past prices: a higher open is a data mismatch, not an adjustment


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
    issue = _f(r["issue_price"])
    # The listing price: the exchange's own open on the listing date when we have its file (InvestorGain's figure is the fallback: it is occasionally
    # wrong, e.g. Waterways Leisure Tourism, ₹500 there against NSE's ₹681 open)
    lp = _f(r.get("day1_open")) or _f(r["listing_price"])
    lpct = pct(lp, issue) if r.get("day1_open") else _f(r["listing_pct"])
    last, lclose = _f(r["last_close"]), _f(r["listing_close"])
    last_day = r["last_day"]
    k = adjustment(_f(r["listing_open"]), lp)
    base = issue * k if issue and k else issue          # the issue price in the same terms as our (split- and bonus-adjusted) daily prices
    since_base = base
    # The first-day close: the exchange's own file for the listing date (as traded, so it compares directly with the issue price); else our daily closes
    d1 = _f(r.get("day1_close"))
    lclose_pct = pct(d1, issue) if d1 else pct(lclose, base)
    lclose = d1 or lclose
    # No daily closes of our own: the newest close in the exchange's file, else the nightly quote, but only for an issue that listed within the last
    # year (neither is adjusted for splits and bonuses, which are rare in a share's first year; older issues need our adjusted daily history)
    recent = bool(r["listing_date"]) and (today - r["listing_date"]).days <= QUOTE_FALLBACK_DAYS
    if last is None and recent and r.get("last_px"):
        last, last_day, since_base = _f(r["last_px"]), r.get("last_px_date"), issue
    elif last is None and recent and r.get("quote_price"):
        last, since_base = _f(r["quote_price"]), issue
        qa = r.get("quote_at")
        last_day = qa.astimezone(IST).date() if qa else None
    day1 = {"open": _f(r.get("day1_open")), "high": _f(r.get("day1_high")), "low": _f(r.get("day1_low")), "close": d1, "source": r.get("day1_src")} if d1 else None
    st = status(bool(r["listed"]), bool(iss.get("withdrawn")), r["open_date"], r["close_date"], today)
    return {
        "id": r["ig_id"], "name": r["name"], "symbol": r["nse"] or r["bse"], "nse": r["nse"], "bse": r["bse"], "board": r["board"], "sector": r["sector"],
        "exchanges": iss.get("exchanges") or [], "kind": iss.get("kind"), "status": st,
        "openDate": r["open_date"].isoformat() if r["open_date"] else None, "closeDate": r["close_date"].isoformat() if r["close_date"] else None,
        "listingDate": r["listing_date"].isoformat() if r["listing_date"] else (tt.get("listing") if st in ("upcoming", "open", "closed") else None),
        "priceLow": iss.get("priceLow"), "priceHigh": iss.get("priceHigh"), "issuePrice": issue, "lotSize": iss.get("lotSize"), "minAmount": iss.get("minAmount"),
        "issueSizeCr": _f(r["issue_size_cr"]) if not iss.get("totalCr") else iss.get("totalCr"), "freshCr": iss.get("freshCr"), "ofsCr": iss.get("ofsCr"),
        "subscription": _f(r["subscription"]), "subQib": cats.get("qib"), "subNii": cats.get("nii"), "subRetail": cats.get("retail"),
        "gmp": _f(r["gmp"]), "gmpPct": _f(r["gmp_pct"]), "listingPrice": lp if r["listed"] else None, "listingPct": lpct if r["listed"] else None,
        "listingClose": lclose, "listingClosePct": lclose_pct, "day1": day1, "lastClose": last, "lastDay": last_day.isoformat() if last_day else None,
        "companyPage": bool(r.get("has_page")), "sinceIpoPct": pct(last, since_base), "adjustedBy": round(k, 4) if k and k != 1.0 else None, "verdict": verdict(_f(r["gmp_pct"]), lpct) if r["listed"] else None,
    }


def _today() -> date:
    return datetime.now(IST).date()


HISTORY_TTL_S = 300
_history: Dict[str, Any] = {"t": 0.0, "body": None}


@router.get("/api/ipos/history")
async def history(request: Request) -> Response:
    """Public. Every IPO on record as a light row, newest first. Built at most once every five minutes per process (about 1,600 rows, two lookups each)."""
    if _history["body"] is not None and time.monotonic() - _history["t"] < HISTORY_TTL_S:
        return Response(_history["body"], media_type="application/json", headers={"Cache-Control": "public, max-age=600"})
    async with request.app.state.store.pool.acquire() as conn:
        rs = [dict(x) for x in await conn.fetch(ROWS_SQL, None)]
        newest = await conn.fetchval("SELECT max(fetched_at) FROM ipo_gmp")
    today = _today()
    body = {"items": [row(x, today) for x in rs], "asOf": today.isoformat(), "updatedAt": newest.isoformat() if newest else None, "sources": SOURCES,
            "note": "GMP (grey market premium) is an informal, unofficial grey-market price, as InvestorGain recorded it; it is not an exchange figure."}
    text = json.dumps(body, default=str)
    _history.update(t=time.monotonic(), body=text)
    return Response(text, media_type="application/json", headers={"Cache-Control": "public, max-age=600"})


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


# ------------------------------------------------------------------------------------------------ the IPO calendar, completed from the IPO record
# The calendar's rows come from FinEdge, whose feed leaves out lot size, sector, listing date and listing price (so a listed issue read "Closed") and most
# details. Each calendar row is matched to its IPO record (NSE symbol or BSE code, else the same name with bidding opening within a week), and only what the
# calendar row lacks is filled in. The record id is added, so the calendar can open the IPO report.
CAL_RECORDS_SQL = """SELECT ig_id, name, nse, bse, board, sector, issue_price, listing_price, listing_date, subscription, issue_size_cr, gmp, gmp_pct, listed,
    open_date, close_date, day1_open, day1_close, detail, nse_book FROM ipo_gmp WHERE open_date IS NULL OR open_date > current_date - 400"""


def _norm(name: Optional[str]) -> str:
    n = re.sub(r"[^a-z0-9 ]", " ", (name or "").lower())
    n = re.sub(r"\b(limited|ltd|ipo|india|the|pvt|private|co|company)\b", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def match(cal: Dict[str, Any], recs: List[Dict[str, Any]], by_sym: Dict[str, Dict[str, Any]], by_name: Dict[str, List[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    sym = (cal.get("symbol") or "").upper()
    if sym and sym in by_sym:
        return by_sym[sym]
    cands = by_name.get(_norm(cal.get("name")), [])
    od = cal.get("openDate")
    for r in cands:
        if not od or not r.get("open_date") or abs((r["open_date"] - date.fromisoformat(od)).days) <= 7:
            return r
    return None


def complete(cal: Dict[str, Any], r: Dict[str, Any], today: date) -> Dict[str, Any]:
    """One calendar row with the gaps filled from its IPO record."""
    det = _j(r.get("detail")) or {}
    iss, tt, ppl, docs = det.get("issue") or {}, det.get("timetable") or {}, det.get("people") or {}, det.get("documents") or {}
    book = _j(r.get("nse_book")) or {}
    f = _f
    out = dict(cal)
    out["recordId"] = r["ig_id"]
    out["sector"] = cal.get("sector") or r.get("sector") or (det.get("company") or {}).get("sector")
    out["lotSize"] = cal.get("lotSize") or (int(iss["lotSize"]) if iss.get("lotSize") else None)
    out["issueSizeCr"] = cal.get("issueSizeCr") or iss.get("totalCr") or f(r.get("issue_size_cr"))
    out["priceLow"] = cal.get("priceLow") or iss.get("priceLow")
    out["priceHigh"] = cal.get("priceHigh") or iss.get("priceHigh")
    if r.get("listed"):
        ld = r.get("listing_date")
        out["listingDate"] = cal.get("listingDate") or (ld.isoformat() if ld else None)
        out["listingPrice"] = cal.get("listingPrice") or f(r.get("day1_open")) or f(r.get("listing_price"))
        if out["listingDate"] and out.get("status") == "closed" and date.fromisoformat(out["listingDate"]) <= today:
            out["status"] = "listed"
    elif not cal.get("listingDate") and tt.get("listing"):
        out["listingDate"] = tt["listing"]
    d = dict(cal.get("details") or {})
    sub = dict(d.get("subscription") or {})
    if sub.get("overall") is None and r.get("subscription") is not None:
        sub["overall"] = f(r["subscription"])
    for c in book.get("categories") or []:
        k = {"qib": "qib", "nii": "nii", "retail": "retail", "employee": "employees", "shareholder": "shareholders"}.get(c.get("key"))
        if k and sub.get(k) is None:
            sub[k] = c.get("times")
    if sub:
        d["subscription"] = sub
    fill = {"issueType": iss.get("kind"), "exchange": iss.get("exchanges") or None, "registrar": ppl.get("registrar"), "leadManagers": ppl.get("leadManagers") or None,
            "allotmentDate": tt.get("allotment"), "refundDate": tt.get("refunds"), "creditDate": tt.get("credit"), "faceValue": iss.get("faceValue"),
            "issuePrice": iss.get("issuePrice") if r.get("listed") or (cal.get("status") == "closed") else None, "freshIssueCr": iss.get("freshCr"), "ofsCr": iss.get("ofsCr"),
            "promoterPrePct": iss.get("promoterPre"), "promoterPostPct": iss.get("promoterPost")}
    for k, v in fill.items():
        if d.get(k) in (None, "", []) and v not in (None, "", []):
            d[k] = v
    dd = {k: v for k, v in (d.get("docs") or {}).items() if v}
    for k in ("drhp", "rhp", "prospectus"):
        if not dd.get(k) and docs.get(k):
            dd[k] = docs[k]
    if dd:
        d["docs"] = dd
    if r.get("gmp") is not None and r.get("gmp_pct") is not None:
        d["gmp"] = {"rupees": f(r["gmp"]), "pct": f(r["gmp_pct"]), "source": SOURCE_NAME}
    out["details"] = d
    return out


async def complete_calendar(conn, items: List[Dict[str, Any]], today: date) -> List[Dict[str, Any]]:
    recs = [dict(x) for x in await conn.fetch(CAL_RECORDS_SQL)]
    by_sym: Dict[str, Dict[str, Any]] = {}
    by_name: Dict[str, List[Dict[str, Any]]] = {}
    for r in recs:
        for s in (r.get("nse"), r.get("bse")):
            if s:
                by_sym.setdefault(s.upper(), r)
        by_name.setdefault(_norm(r["name"]), []).append(r)
    out = []
    for c in items:
        r = match(c, recs, by_sym, by_name)
        out.append(complete(c, r, today) if r else c)
    return out
