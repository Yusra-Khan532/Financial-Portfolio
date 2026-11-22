"""Splits, consolidations and bonus issues since an IPO listed, from NSE's corporate actions, so "since IPO" compares like with like.

The exchange's closing prices are as traded: after a 2-for-1 split or a 1:1 bonus a share trades at half its old price although nothing was lost. The issue
price is put in the same terms by multiplying it by the factor of every such action since listing:

    split / consolidation   "Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share"   factor 2 / 10 = 0.2
    bonus a:b               "Bonus 1:1"  (a new shares for every b held)                                       factor b / (a + b) = 0.5

Dividends, rights and meetings do not change the factor. NSE publishes this for its mainboard and SME (Emerge) shares; BSE's own service refuses
outside requests, so BSE-only issues have no factor and keep "since IPO" only within a year of listing. Describes; not advice.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import date, datetime
from typing import Any, Dict, List, Optional

log = logging.getLogger("finlit.ipocorp")

NSE_CA = "https://www.nseindia.com/api/corporates-corporateActions?index={index}&symbol={symbol}"
SPLIT_RE = re.compile(r"from\s*(?:rs\.?|re\.?|₹)?\s*(\d+(?:\.\d+)?)\s*/?-?\s*(?:per\s*share)?\s*(?:up)?\s*to\s*(?:rs\.?|re\.?|₹)?\s*(\d+(?:\.\d+)?)", re.I)
BONUS_RE = re.compile(r"bonus\s*(?:issue)?\s*(\d+)\s*:\s*(\d+)", re.I)


def _day(s: Any) -> Optional[date]:
    for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(s).strip(), fmt).date()
        except ValueError:
            continue
    return None


def action_factor(subject: str) -> Optional[float]:
    """The factor one corporate action applies to past prices, or None when it does not change them."""
    s = (subject or "").lower()
    f = 1.0
    hit = False
    if "split" in s or "sub-division" in s or "subdivision" in s or "consolidat" in s:
        m = SPLIT_RE.search(s)
        if m:
            old, new = float(m.group(1)), float(m.group(2))
            if old > 0 and new > 0 and old != new:
                f *= new / old
                hit = True
    m = BONUS_RE.search(s)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if a > 0 and b > 0:
            f *= b / (a + b)
            hit = True
    return f if hit else None


def since_listing(actions: List[Dict[str, Any]], listing: date) -> Dict[str, Any]:
    """The combined factor of every split, consolidation and bonus with an ex-date after listing, and the actions it is made of."""
    factor, used = 1.0, []
    seen = set()
    for a in actions or []:
        if not isinstance(a, dict):
            continue
        ex = _day(a.get("exDate"))
        f = action_factor(a.get("subject") or "")
        if f is None or ex is None or ex <= listing:
            continue
        key = (ex, round(f, 6))
        if key in seen:                       # NSE sometimes lists the same action twice
            continue
        seen.add(key)
        factor *= f
        used.append({"exDate": ex.isoformat(), "subject": (a.get("subject") or "").strip()[:200], "factor": round(f, 6)})
    return {"factor": round(factor, 8), "actions": sorted(used, key=lambda x: x["exDate"])}


# ------------------------------------------------------------------------------------------------ the job's step (called from finlit.ipobhav.refresh)
CA_TODO = """SELECT ig_id, nse, board, listing_date FROM ipo_gmp WHERE listed AND nse IS NOT NULL AND listing_date IS NOT NULL
    AND (ca_checked_at IS NULL OR ca_checked_at < now() - interval '7 days') ORDER BY ca_checked_at NULLS FIRST, listing_date LIMIT $1"""
CA_SAVE = "UPDATE ipo_gmp SET ca_factor = $2, ca_actions = $3::jsonb, ca_checked_at = now() WHERE ig_id = $1"


async def refresh(store, limit: int = 150, stop_at: Optional[float] = None, pause_s: float = 1.0, client=None) -> Dict[str, Any]:
    """Each listed NSE issue's factor since listing, read once a week (oldest check first), at most `limit` a run and until `stop_at` (monotonic)."""
    from .iponse import BROWSER, NSE_HOME
    import httpx
    out = {"asked": 0, "factors": 0, "errors": 0}
    async with store.pool.acquire() as conn:
        rows = [dict(r) for r in await conn.fetch(CA_TODO, limit)]
    if not rows:
        return out
    own = client is None
    http = client or httpx.AsyncClient(timeout=30, follow_redirects=True, headers=BROWSER)
    try:
        try:
            await http.get(NSE_HOME, headers=BROWSER)            # the session cookie NSE's API wants
        except Exception:
            pass
        for r in rows:
            if stop_at and time.monotonic() > stop_at:
                break
            await asyncio.sleep(pause_s)
            index = "sme" if r["board"] == "sme" else "equities"
            try:
                res = await http.get(NSE_CA.format(index=index, symbol=r["nse"].replace("&", "%26")), headers=BROWSER)
                if res.status_code != 200 or not res.text.lstrip().startswith("["):
                    out["errors"] += 1
                    if out["errors"] >= 5:
                        break                                     # NSE is refusing: try again next run
                    continue
                got = since_listing(res.json(), r["listing_date"])
            except Exception:
                log.warning("corporate actions of %s not read", r["nse"], exc_info=True)
                out["errors"] += 1
                continue
            out["asked"] += 1
            out["factors"] += int(got["factor"] != 1.0)
            async with store.pool.acquire() as conn:
                await conn.execute(CA_SAVE, r["ig_id"], got["factor"], json.dumps(got["actions"]))
    finally:
        if own:
            await http.aclose()
    return out
