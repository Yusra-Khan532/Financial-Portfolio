"""Subscription by investor category for an IPO, as the exchange published it: NSE's IPO detail (the consolidated book, NSE and BSE bids together), and
the bids at each price in the band.

NSE publishes this for mainboard issues, also after listing; for SME issues its figures are blank, so those keep the overall subscription only. The
figures are the exchange's own and are shown with NSE named as the source. Read once per issue, after it has listed (the final book), slowly.

Pure parsing plus one fetch helper. Describes the issue; not a recommendation.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, List, Optional

NSE_HOME = "https://www.nseindia.com/"
NSE_IPO = "https://www.nseindia.com/api/ipo-detail?symbol={symbol}&series=EQ"
BROWSER = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
           "Accept": "application/json, text/plain, */*", "Referer": "https://www.nseindia.com/market-data/all-upcoming-issues-ipo"}

# (key, label, pattern on NSE's category name). Order is the order shown. Sub-rows ("1(a)" FIIs and the like) are not categories of the book.
CATEGORIES = [
    ("qib", "Qualified institutions", r"qualified institutional"),
    ("nii", "Non-institutional investors", r"^non institutional investors$|^non institutional investors\s*\(?\s*nii"),
    ("bnii", "Big non-institutional (above ₹10 lakh)", r"more than (rs\.?|₹)?\s*10"),
    ("snii", "Small non-institutional (₹2–10 lakh)", r"more than (rs\.?|₹)?\s*2\s*lakhs? up to|between|up to (rs\.?|₹)?\s*10"),
    ("retail", "Retail investors", r"retail individual"),
    ("employee", "Employees", r"employee"),
    ("shareholder", "Shareholders", r"shareholder"),
    ("policyholder", "Policyholders", r"policy ?holder"),
    ("other", "Others", r"^others?$"),
]


def _f(v: Any) -> Optional[float]:
    try:
        x = float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return x


def _key(category: str, sr: str) -> Optional[str]:
    c = re.sub(r"\s+", " ", (category or "").strip()).lower()
    if sr in ("2.1",):
        return "bnii"
    if sr in ("2.2",):
        return "snii"
    for k, _, pat in CATEGORIES:
        if re.search(pat, c):
            return k
    return None


def parse(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """{total, categories: [{key, label, offered, bid, times}], demand: [{price, lakhShares}]} from NSE's IPO detail, or None when the exchange gave no
    book (an SME issue, an unknown symbol, or all zeros)."""
    if not isinstance(body, dict):
        return None
    rows = ((body.get("activeCat") or {}).get("dataList") or [])[1:]       # the first row is the header
    cats: List[Dict[str, Any]] = []
    total = None
    for r in rows:
        if not isinstance(r, dict):
            continue
        sr = str(r.get("srNo") or "").strip()
        name = str(r.get("category") or "")
        times, offered, bid = _f(r.get("noOfTotalMeant")), _f(r.get("noOfShareOffered")), _f(r.get("noOfSharesBid"))
        if name.strip().lower() == "total":
            total = times
            continue
        if not re.fullmatch(r"\d+(\.\d+)?", sr):                                # 1(a), 2.1(b) ... are breakdowns of the bids, not categories
            continue
        k = _key(name, sr)
        if k is None or times is None or not offered:
            continue
        label = next(lab for kk, lab, _ in CATEGORIES if kk == k)
        cats.append({"key": k, "label": label, "offered": offered, "bid": bid, "times": round(times, 2)})
    if not cats or not total or total <= 0 or all(c["times"] == 0 for c in cats):
        return None
    demand = []
    for g in ((body.get("demandGraphALL") or {}).get("graphData") or []):
        if isinstance(g, dict):
            price, lakh = str(g.get("type") or "").strip(), _f(g.get("value"))
            if price and lakh is not None:
                demand.append({"price": price, "lakhShares": round(lakh, 3)})
    meta = body.get("metaInfo") or {}
    return {"total": round(total, 2), "categories": cats, "demand": demand, "symbol": meta.get("symbol"), "listingDate": meta.get("listingDate")}


class Nse:
    """NSE's API wants the cookie its home page sets and a browser-style agent. One client, the cookie taken once and again when refused."""

    def __init__(self, http=None, pause_s: float = 2.0):
        import httpx
        self.own = http is None
        self.http = http or httpx.AsyncClient(timeout=30, follow_redirects=True, headers=BROWSER)
        self.pause_s, self.warm = pause_s, False

    async def aclose(self):
        if self.own:
            await self.http.aclose()

    async def _warm(self):
        try:
            await self.http.get(NSE_HOME, headers=BROWSER)                    # the page itself may be refused: the cookie is still set
        except Exception:
            pass
        self.warm = True

    async def ipo(self, symbol: str) -> Optional[Dict[str, Any]]:
        """The parsed book for one symbol, None when NSE has none. Raises when NSE keeps refusing (so the caller tries again another run)."""
        if not re.fullmatch(r"[A-Z0-9&\-]{1,20}", symbol or ""):
            return None
        for attempt in range(2):
            if not self.warm:
                await self._warm()
            await asyncio.sleep(self.pause_s)
            r = await self.http.get(NSE_IPO.format(symbol=symbol.replace("&", "%26")), headers=BROWSER)
            if r.status_code == 200 and r.text.lstrip().startswith("{"):
                return parse(r.json())
            if r.status_code in (401, 403):
                self.warm = False
                continue
            if r.status_code == 404:
                return None
        raise RuntimeError(f"NSE did not answer for {symbol}")
