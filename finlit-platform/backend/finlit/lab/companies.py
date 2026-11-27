"""Trading Lab > Global > US companies (docs/GLOBAL-MARKETS.md; founder, 26 Nov 2026: "the big companies of the global, JP Morgan, like many").

The reported numbers of 39 of the largest US companies from their own filings with the SEC (data.sec.gov XBRL, public domain; no key):
revenue, operating income, net income, diluted earnings per share each year (10-K) and each quarter (10-Q), and the balance sheet at each
year end (assets, liabilities, equity, cash, long-term debt). The `global-companies` job reads them once a week, a few calls a second (the
SEC allows ten), and checks each company's SEC id against the SEC's own record first, so a wrong id is skipped, never shown under another
company's name. Figures as reported, in US dollars; nothing estimated.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from ..auth.service import Ctx
from .access import lab_ctx

log = logging.getLogger("finlit.lab.companies")
router = APIRouter()

CONCEPT = "https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/us-gaap/{tag}.json"
SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
KEY = "sec:companies"
PAUSE = 0.2
UA = {"User-Agent": "FinLit (finlitventures.com) market data", "Accept": "application/json"}
# ticker -> (SEC id, short name, sector)
COMPANIES: Dict[str, Tuple[int, str, str]] = {
    "AAPL": (320193, "Apple", "Technology"), "MSFT": (789019, "Microsoft", "Technology"), "NVDA": (1045810, "Nvidia", "Technology"),
    "AVGO": (1730168, "Broadcom", "Technology"), "ORCL": (1341439, "Oracle", "Technology"), "CRM": (1108524, "Salesforce", "Technology"),
    "ADBE": (796343, "Adobe", "Technology"), "AMD": (2488, "AMD", "Technology"), "INTC": (50863, "Intel", "Technology"), "CSCO": (858877, "Cisco", "Technology"),
    "GOOGL": (1652044, "Alphabet", "Communication"), "META": (1326801, "Meta Platforms", "Communication"), "NFLX": (1065280, "Netflix", "Communication"),
    "DIS": (1744489, "Disney", "Communication"),
    "AMZN": (1018724, "Amazon", "Consumer"), "TSLA": (1318605, "Tesla", "Consumer"), "HD": (354950, "Home Depot", "Consumer"),
    "WMT": (104169, "Walmart", "Consumer staples"), "COST": (909832, "Costco", "Consumer staples"), "PG": (80424, "Procter & Gamble", "Consumer staples"),
    "KO": (21344, "Coca-Cola", "Consumer staples"), "PEP": (77476, "PepsiCo", "Consumer staples"),
    "JPM": (19617, "JPMorgan Chase", "Financials"), "BAC": (70858, "Bank of America", "Financials"), "GS": (886982, "Goldman Sachs", "Financials"),
    "MS": (895421, "Morgan Stanley", "Financials"), "V": (1403161, "Visa", "Financials"), "MA": (1141391, "Mastercard", "Financials"),
    "BRK-B": (1067983, "Berkshire Hathaway", "Financials"),
    "LLY": (59478, "Eli Lilly", "Healthcare"), "UNH": (731766, "UnitedHealth", "Healthcare"), "JNJ": (200406, "Johnson & Johnson", "Healthcare"),
    "ABBV": (1551152, "AbbVie", "Healthcare"), "MRK": (310158, "Merck", "Healthcare"), "PFE": (78003, "Pfizer", "Healthcare"),
    "XOM": (34088, "Exxon Mobil", "Energy"), "CVX": (93410, "Chevron", "Energy"), "BA": (12927, "Boeing", "Industrials"), "CAT": (18230, "Caterpillar", "Industrials"),
}
# metric -> (concepts to try in order, unit, kind: "flow" over a period or "point" at a date)
METRICS: Dict[str, Tuple[Tuple[str, ...], str, str]] = {
    "revenue": (("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenuesNetOfInterestExpense"), "USD", "flow"),
    "operatingIncome": (("OperatingIncomeLoss",), "USD", "flow"),
    "netIncome": (("NetIncomeLoss", "ProfitLoss"), "USD", "flow"),
    "eps": (("EarningsPerShareDiluted",), "USD/shares", "flow"),
    "assets": (("Assets",), "USD", "point"),
    "liabilities": (("Liabilities",), "USD", "point"),
    "equity": (("StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"), "USD", "point"),
    "cash": (("CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"), "USD", "point"),
    "longTermDebt": (("LongTermDebtNoncurrent", "LongTermDebt"), "USD", "point"),
}
YEARS, QUARTERS = 10, 9


def _days(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def series(facts: List[dict], kind: str) -> Tuple[List[list], List[list]]:
    """SEC facts of one concept -> (annual [[end, value]], quarterly [[end, value]]), oldest first, the latest filing for each period end."""
    annual: Dict[str, Tuple[str, float]] = {}
    quarter: Dict[str, Tuple[str, float]] = {}
    for f in facts or []:
        end, val, filed, form = f.get("end"), f.get("val"), f.get("filed") or "", f.get("form") or ""
        if not end or not isinstance(val, (int, float)):
            continue
        if kind == "point":
            if form.startswith("10-K") and f.get("fp") == "FY" and (end not in annual or filed > annual[end][0]):
                annual[end] = (filed, float(val))
            continue
        start = f.get("start")
        if not start:
            continue
        d = _days(start, end)
        if 330 <= d <= 400 and form.startswith("10-K"):
            if end not in annual or filed > annual[end][0]:
                annual[end] = (filed, float(val))
        elif 80 <= d <= 100 and (form.startswith("10-Q") or form.startswith("10-K")):
            if end not in quarter or filed > quarter[end][0]:
                quarter[end] = (filed, float(val))
    a = [[e, v] for e, (_f, v) in sorted(annual.items())][-YEARS:]
    q = [[e, v] for e, (_f, v) in sorted(quarter.items())][-QUARTERS:]
    return a, q


async def _json(client: httpx.AsyncClient, url: str) -> Optional[dict]:
    for attempt in range(3):
        try:
            r = await client.get(url)
        except httpx.HTTPError:
            r = None
        if r is not None and r.status_code == 200:
            try:
                return r.json()
            except ValueError:
                return None
        if r is not None and r.status_code == 404:
            return None
        await asyncio.sleep(1.0 + attempt)
    return None


async def refresh(store, client: Optional[httpx.AsyncClient] = None, pause: float = PAUSE, only: Optional[List[str]] = None) -> dict:
    """The `global-companies` job: per company, the SEC record check, then each metric's first concept that has data."""
    from ..macro import get_meta, set_meta
    own = client is None
    client = client or httpx.AsyncClient(timeout=60, headers=UA)
    async with store.pool.acquire() as conn:
        kept = (await get_meta(conn, KEY)) or {"companies": {}}
    done, skipped = 0, []
    try:
        for tk, (cik, name, sector) in COMPANIES.items():
            if only and tk not in only:
                continue
            sub = await _json(client, SUBMISSIONS.format(cik=cik))
            await asyncio.sleep(pause)
            tickers = [t.upper().replace(".", "-") for t in (sub or {}).get("tickers") or []]
            if not sub or (tickers and tk not in tickers):
                skipped.append(tk)                                   # a wrong id is never shown under this company's name
                continue
            rec: Dict[str, Any] = {"name": name, "sector": sector, "cik": cik, "secName": sub.get("name"), "annual": {}, "quarterly": {}, "concepts": {}}
            recent = f"{date.today().year - 2}"
            for metric, (concepts, unit, kind) in METRICS.items():
                for tag in concepts:
                    if metric in rec["annual"] and (kind == "point" or metric in rec["quarterly"]):
                        break
                    body = await _json(client, CONCEPT.format(cik=cik, tag=tag))
                    await asyncio.sleep(pause)
                    facts = ((body or {}).get("units") or {}).get(unit) or []
                    a, q = series(facts, kind)
                    if metric not in rec["annual"] and a and a[-1][0] >= recent:     # a concept the company still reports
                        rec["annual"][metric] = a
                        rec["concepts"][metric] = tag
                    if kind == "flow" and metric not in rec["quarterly"] and q and q[-1][0] >= recent:   # quarters can sit under another concept
                        rec["quarterly"][metric] = q
            an = rec["annual"]
            if "liabilities" not in an and an.get("assets") and an.get("equity"):   # not tagged as a total: assets less equity, said so
                eq = dict(an["equity"])
                an["liabilities"] = [[e, v - eq[e]] for e, v in an["assets"] if e in eq]
                rec["concepts"]["liabilities"] = "derived: assets less equity"
            if rec["annual"].get("revenue") or rec["annual"].get("netIncome"):
                kept["companies"][tk] = rec
                done += 1
            else:
                skipped.append(tk)
    finally:
        if own:
            await client.aclose()
    kept["at"] = datetime.now(timezone.utc).isoformat(timespec="minutes")
    async with store.pool.acquire() as conn:
        await set_meta(conn, KEY, kept)
    return {"status": "ok" if done else "failed", "companies": done, "skipped": skipped}


def _yoy(a: List[list]) -> Optional[float]:
    return round((a[-1][1] - a[-2][1]) / abs(a[-2][1]) * 100, 1) if a and len(a) >= 2 and a[-2][1] else None


def summary(tk: str, rec: dict) -> dict:
    an = rec.get("annual") or {}
    rev, ni = an.get("revenue") or [], an.get("netIncome") or []
    margin = round(ni[-1][1] / rev[-1][1] * 100, 1) if rev and ni and rev[-1][0] == ni[-1][0] and rev[-1][1] else None
    return {"ticker": tk, "name": rec["name"], "sector": rec["sector"], "year": (rev or ni or [[None]])[-1][0],
            "revenue": rev[-1][1] if rev else None, "revenueYoyPct": _yoy(rev), "netIncome": ni[-1][1] if ni else None, "netIncomeYoyPct": _yoy(ni),
            "margin": margin}


@router.get("/api/lab/companies")
async def us_companies(request: Request, _ctx: Ctx = Depends(lab_ctx)):
    from ..macro import get_meta
    async with request.app.state.store.pool.acquire() as conn:
        kept = await get_meta(conn, KEY)
    if not kept or not kept.get("companies"):
        body: Dict[str, Any] = {"ready": False, "reason": "The companies' SEC filings load once a week; the first load has not run yet."}
    else:
        cos = kept["companies"]
        body = {"ready": True, "at": kept.get("at"), "companies": [summary(tk, cos[tk]) for tk in COMPANIES if tk in cos],
                "details": {tk: {k: cos[tk].get(k) for k in ("name", "sector", "secName", "annual", "quarterly")} for tk in COMPANIES if tk in cos},
                "source": "Company filings with the SEC (10-K and 10-Q, XBRL), US dollars, as reported"}
    return Response(content=orjson.dumps(body), media_type="application/json", headers={"Cache-Control": "no-store"})
