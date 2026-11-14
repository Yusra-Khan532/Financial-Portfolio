"""GET /api/ext/company/{symbol}: the one small answer the FinLit browser extension asks for, only when a person has selected a company name on a web page and pressed the
FinLit button (the glossary and the company list live inside the extension, so no other request is made).

Cheap on purpose: two indexed single-row reads, no on-demand report build, no view counting, no side effects, and the answer is kept in Redis for five minutes per
symbol and access level. One score per plan, as on the site (founder, 13 Nov 2026, tasks #100 and #112): Silver gets the FinLit IQ (score, rating word, its two parts) and the key
figures; Gold and administrators get FinLit Prism instead (the stored report's score, label and four parts, one more single-row read) with the key figures, and never the FinLit IQ.
`model` says which one the card shows ("iq", "prism", or null when locked). A Basic or signed-out visitor gets name, sector, price and market value and `locked: true` (the free
showcase company stays open). The wording describes; it never advises.
Information only, not investment advice.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Dict, Optional

import orjson
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .auth.entitlements import has, sees_all
from .auth.service import current
from .portfolio_overview import BAND_WORD
from .prism import PRISM_NAME, _PARTS, _num
from .search import QUOTES_SQL, _hydrate, _rec, quote_rows

router = APIRouter(prefix="/api/ext")
SYMBOL = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
TTL = 300
DISCLAIMER = "Describes the company's financial health from its filings and prices; not a recommendation. Information only, not investment advice."
WHAT_IT_IS = ("The FinLit IQ runs from 0 to 100 and describes a company's financial health from its filings and prices. The Growth & Profitability score reads the business "
              "(quality, growth, profitability and balance sheet); the Technical score reads the price trend.")
DETAIL_SQL = """SELECT name, sector, market_cap, pe, roe, debt_to_equity, pillar_quality, pillar_growth, pillar_profitability, pillar_balance, pillar_technical
                FROM scores WHERE symbol = $1 AND model = 'v1' ORDER BY (statement = 'consolidated') DESC, updated_at DESC LIMIT 1"""
NAME_SQL = "SELECT name, sector FROM companies WHERE symbol = $1"
PRISM_SQL = ("SELECT final, label, status, " + ", ".join(f"{_num('rating,parts,' + k)} AS p_{k}" for k in _PARTS)   # nosec B608: constant names only, the symbol is a bound value
             + " FROM prism_reports WHERE symbol = $1 ORDER BY (statement = 'consolidated') DESC LIMIT 1")
PRISM_PARTS = {"fundamental": "Growth & Profitability", "valuation": "Valuation", "quality": "Quality", "risk": "Risk"}


def _n(v: Any, nd: int = 1) -> Optional[float]:
    return None if v is None else round(float(v), nd)


def _word(score: Optional[float], hi: float = 70, mid: float = 50) -> str:
    return "strong" if score is not None and score >= hi else "fair" if score is not None and score >= mid else "weak"


def take(fund: Optional[float], tech: Optional[float], band_word: Optional[str]) -> Optional[str]:
    """One plain sentence from the two parts. It describes the reading; it never says to buy, sell or hold."""
    if fund is None and tech is None:
        return None
    parts = []
    if fund is not None:
        parts.append(f"business scores are {_word(fund)} ({round(fund)}/100)")
    if tech is not None:
        parts.append(f"the price trend reads {_word(tech)} ({round(tech)}/100)")
    lead = f"The overall reading is {band_word}: " if band_word else ""
    return lead + " and ".join(parts) + "."


def prism_block(r: Any) -> Dict[str, Any]:
    """FinLit Prism for the card: its score, label and four parts from the stored report, or the reason there is none. A company the model did not rate shows no parts."""
    base: Dict[str, Any] = {"name": PRISM_NAME}
    if r is None:
        return {**base, "rated": False, "why": f"{PRISM_NAME} has not rated this company yet."}
    if r["status"] == "NOT RATED" or r["final"] is None:
        return {**base, "rated": False, "why": f"{PRISM_NAME} could not rate this company: the evidence is too thin."}
    return {**base, "rated": True, "score": _n(r["final"], 0), "label": (r["label"] or "").capitalize(), "provisional": r["status"] == "PROVISIONAL",
            "parts": [{"key": k, "label": PRISM_PARTS[k], "score": None if r[f"p_{k}"] is None else round(r[f"p_{k}"])} for k in _PARTS]}


async def build(request: Request, sym: str, level: str) -> Optional[Dict[str, Any]]:
    store = request.app.state.store
    showcase = set(request.app.state.settings.showcase_symbols)
    async with store.pool.acquire() as conn:
        q = await conn.fetchrow(QUOTES_SQL + " WHERE c.symbol = $1", sym)
        base = await conn.fetchrow(NAME_SQL, sym)
        d = await conn.fetchrow(DETAIL_SQL, sym)
        pz = await conn.fetchrow(PRISM_SQL, sym) if level == "gold" else None
    if base is None:
        return None
    gold = level == "gold"
    rows = quote_rows([_hydrate(_rec(q))], "silver" if gold else level, showcase) if q is not None else []
    price = rows[0][1] if rows else None
    change = rows[0][2] if rows else None
    when = rows[0][3] if rows else None
    score, band = (rows[0][4], rows[0][5]) if rows else (None, None)
    locked = band == "locked"
    out: Dict[str, Any] = {"symbol": sym, "name": (d and d["name"]) or base["name"], "sector": (d and d["sector"]) or base["sector"], "url": f"/stocks/{sym}",
                           "price": price, "changePct": change, "priceDate": when, "marketCapCr": _n(d["market_cap"], 0) if d else None, "locked": locked,
                           "disclaimer": DISCLAIMER}
    out["model"] = None if locked else "prism" if gold else "iq"
    if locked:
        out["lockedWhy"] = "The FinLit IQ comes with the Silver plan and FinLit Prism with Gold. Sign in or see plans on FinLit."
        return out
    if d is not None:
        out["figures"] = {"pe": _n(d["pe"]), "roe": _n(d["roe"]), "debtToEquity": _n(d["debt_to_equity"], 2)}
    if gold:                                   # Gold: FinLit Prism only, never the FinLit IQ
        out["prism"] = prism_block(pz)
    elif score is not None and d is not None:  # Silver: the FinLit IQ
        pillars = [d[k] for k in ("pillar_quality", "pillar_growth", "pillar_profitability", "pillar_balance") if d[k] is not None]
        fund = sum(float(p) for p in pillars) / len(pillars) if pillars else None
        tech = _n(d["pillar_technical"])
        bw = BAND_WORD.get(band or "")
        out.update(score=_n(score, 0), band=bw, bandKey=band, fundamental=_n(fund, 0), technical=None if tech is None else round(tech), take=take(fund, tech, bw), what=WHAT_IT_IS)
    else:
        out["why"] = "This company has no FinLit IQ yet."
    return out


@router.get("/company/{symbol}")
async def company(request: Request, symbol: str):
    sym = symbol.strip().upper()
    if not SYMBOL.match(sym):
        return JSONResponse({"status": "not_found", "detail": "No such company."}, status_code=404)
    who = await current(request)
    level = "gold" if sees_all(who) or has(who.plan, "gold") else "silver" if has(who.plan, "silver") else "basic"
    store = request.app.state.store
    key = f"ext:company:{level}:{sym}"
    try:
        hit = await store.redis.get(key)
    except Exception:
        hit = None
    if hit:
        body = orjson.loads(hit)
    else:
        body = await build(request, sym, level)
        if body is None:
            return JSONResponse({"status": "not_found", "detail": "No such company."}, status_code=404, headers={"Cache-Control": "public, max-age=300"})
        try:
            await store.redis.set(key, orjson.dumps(body), ex=TTL)
        except Exception:   # nosec B110 - Redis down: answered from the database, just not kept
            pass
    body = {**body, "signedIn": bool(who.user_id)}      # never cached: it lets the card say "sign in" or "see plans", whichever is true for this person
    return JSONResponse(body, headers={"Cache-Control": "private, no-cache", "Vary": "Cookie"})
