"""Trading Lab > Global > US companies (docs/GLOBAL-MARKETS.md; founder, 26 Nov 2026: "the big companies of the global, JP Morgan, like many").

The reported numbers of 39 of the largest US companies from their own filings with the SEC (data.sec.gov XBRL, public domain; no key):
revenue, operating income, net income, diluted earnings per share each year (10-K) and each quarter (10-Q), and the balance sheet at each
year end (assets, liabilities, equity, cash, long-term debt). Every concept of each figure is read (about 17 calls a company); the years come
from the concept with the latest year and the quarters from the one with the latest quarter (the first listed on a tie), as companies change
tags.
The `global-companies` job reads them once a week, at most five calls a second
(one at a time with a 0.2 s pause; the SEC allows ten), and checks each company's SEC id against the SEC's own record first, so a wrong id is
skipped, never shown under another company's name. It starts no new company after its own deadline (`--max-minutes`), saves what it read,
and begins the next run with the companies read longest ago. Figures as reported, in US dollars; nothing estimated. A total the company does
not tag (total liabilities at some companies) is worked out as assets less equity, and a fiscal fourth quarter (filed only inside the year's
10-K) as the year less its three filed quarters; both are labelled "derived". Per-share figures are never derived.
"""
from __future__ import annotations

import asyncio
import logging
import time
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
    q = [[e, v] for e, (_f, v) in sorted(quarter.items())]
    return a, q


def with_q4(annual: List[list], quarters: List[list]) -> Tuple[List[list], List[str]]:
    """Companies file three quarters on 10-Q; the fourth is only inside the year on the 10-K. For a flow figure of the same concept, the fourth
    quarter is the year less its three filed quarters (the usual arithmetic, labelled "derived"); it is added only when exactly three quarters
    of that fiscal year are filed. Returns (the latest QUARTERS quarters, the period ends that were derived)."""
    have = {e: v for e, v in quarters}
    derived: List[str] = []
    for end, total in annual:
        if end in have:
            continue
        inside = [e for e in have if 30 <= _days(e, end) <= 300 and e not in derived]
        if len(inside) == 3:
            have[end] = total - sum(have[e] for e in inside)
            derived.append(end)
    q = [[e, have[e]] for e in sorted(have)][-QUARTERS:]
    kept = {e for e, _v in q}
    return q, [e for e in sorted(derived) if e in kept]


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


async def refresh(store, client: Optional[httpx.AsyncClient] = None, pause: float = PAUSE, only: Optional[List[str]] = None,
                  max_minutes: Optional[float] = None) -> dict:
    """The `global-companies` job: per company, the SEC record check, then each metric's first concept that has data. The companies read
    longest ago go first; after `max_minutes` no new company is started, and what was read is saved (the rest keep their last load)."""
    from ..macro import get_meta, set_meta
    own = client is None
    client = client or httpx.AsyncClient(timeout=60, headers=UA)
    async with store.pool.acquire() as conn:
        kept = (await get_meta(conn, KEY)) or {"companies": {}}
    kept.setdefault("companies", {})
    stop_at = time.monotonic() + max_minutes * 60 if max_minutes else None
    order = sorted((tk for tk in COMPANIES if not only or tk in only), key=lambda t: (kept["companies"].get(t) or {}).get("loadedAt") or "")
    done, skipped, left = 0, [], []
    try:
        for tk in order:
            cik, name, sector = COMPANIES[tk]
            if stop_at is not None and time.monotonic() >= stop_at:
                left.append(tk)                                      # read first on the next run
                continue
            sub = await _json(client, SUBMISSIONS.format(cik=cik))
            await asyncio.sleep(pause)
            tickers = [t.upper().replace(".", "-") for t in (sub or {}).get("tickers") or []]
            if not sub or (tickers and tk not in tickers):
                skipped.append(tk)                                   # a wrong id is never shown under this company's name
                continue
            rec: Dict[str, Any] = {"name": name, "sector": sector, "cik": cik, "secName": sub.get("name"), "annual": {}, "quarterly": {}, "concepts": {},
                                   "quarterConcepts": {}, "derivedQuarters": {}, "loadedAt": datetime.now(timezone.utc).isoformat(timespec="minutes")}
            recent = f"{date.today().year - 2}"
            for metric, (concepts, unit, kind) in METRICS.items():
                years: Dict[str, List[list]] = {}                    # each concept's own years, for its fourth quarters
                for tag in concepts:
                    body = await _json(client, CONCEPT.format(cik=cik, tag=tag))
                    await asyncio.sleep(pause)
                    facts = ((body or {}).get("units") or {}).get(unit) or []
                    a, q = series(facts, kind)
                    years[tag] = a
                    # a concept the company still reports, the one with the latest year (the first on a tie), so a change of tag is followed;
                    # quarters likewise, and they can sit under another concept than the years
                    if a and a[-1][0] >= recent and (metric not in rec["annual"] or a[-1][0] > rec["annual"][metric][-1][0]):
                        rec["annual"][metric] = a
                        rec["concepts"][metric] = tag
                    if kind == "flow" and q and q[-1][0] >= recent and (metric not in rec["quarterly"] or q[-1][0] > rec["quarterly"][metric][-1][0]):
                        rec["quarterly"][metric] = q
                        rec["quarterConcepts"][metric] = tag
                if kind == "flow" and metric in rec["quarterly"]:
                    own_years = [] if metric == "eps" else years.get(rec["quarterConcepts"][metric]) or []   # per-share figures do not add up
                    q, made = with_q4(own_years, rec["quarterly"][metric])
                    rec["quarterly"][metric] = q
                    if made:
                        rec["derivedQuarters"][metric] = made
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
    out: Dict[str, Any] = {"status": "ok" if done else "failed", "companies": done, "skipped": skipped}
    if left:
        out["left"] = left
    return out


def _yoy(a: List[list]) -> Optional[float]:
    """The latest year against the year before, only when the two period ends are about a year apart (a missing year gives no change)."""
    if not a or len(a) < 2 or not a[-2][1] or not 330 <= _days(a[-2][0], a[-1][0]) <= 400:
        return None
    return round((a[-1][1] - a[-2][1]) / abs(a[-2][1]) * 100, 1)


def summary(tk: str, rec: dict) -> dict:
    """One company on the board: its latest fiscal year's revenue (or net income when no revenue is filed), with net income and the margin of
    that same year, each against the year before."""
    an = rec.get("annual") or {}
    rev, ni = an.get("revenue") or [], an.get("netIncome") or []
    year = (rev or ni or [[None]])[-1][0]
    ni_to = [p for p in ni if year and p[0] <= year]
    ni_now = ni_to[-1][1] if ni_to and ni_to[-1][0] == year else None
    margin = round(ni_now / rev[-1][1] * 100, 1) if rev and ni_now is not None and rev[-1][1] else None
    return {"ticker": tk, "name": rec["name"], "sector": rec["sector"], "year": year,
            "revenue": rev[-1][1] if rev else None, "revenueYoyPct": _yoy(rev), "netIncome": ni_now,
            "netIncomeYoyPct": _yoy(ni_to) if ni_now is not None else None, "margin": margin}


DETAIL_KEYS = ("name", "sector", "cik", "secName", "annual", "quarterly", "concepts", "quarterConcepts", "derivedQuarters", "loadedAt")


def view(kept: Optional[dict]) -> Dict[str, Any]:
    """The route's answer from what the job kept: a summary per company (board order) and each company's full figures."""
    if not kept or not kept.get("companies"):
        return {"ready": False, "reason": "The companies' SEC filings load once a week; the first load has not run yet."}
    cos = kept["companies"]
    order = [tk for tk in COMPANIES if tk in cos]
    return {"ready": True, "at": kept.get("at"), "companies": [summary(tk, cos[tk]) for tk in order],
            "details": {tk: {k: cos[tk].get(k) for k in DETAIL_KEYS} for tk in order},
            "source": "Company filings with the SEC (10-K and 10-Q, XBRL), US dollars, as reported"}


@router.get("/api/lab/companies")
async def us_companies(request: Request, _ctx: Ctx = Depends(lab_ctx)):
    from ..macro import get_meta
    async with request.app.state.store.pool.acquire() as conn:
        kept = await get_meta(conn, KEY)
    return Response(content=orjson.dumps(view(kept)), media_type="application/json", headers={"Cache-Control": "no-store"})
