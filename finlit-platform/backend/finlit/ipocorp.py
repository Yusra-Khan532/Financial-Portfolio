"""Splits, consolidations and bonus issues since an IPO listed, from NSE's corporate actions, so "since IPO" compares like with like.

The exchange's closing prices are as traded: after a 2-for-1 split or a 1:1 bonus a share trades at half its old price although nothing was lost. The issue
price is put in the same terms by multiplying it by the factor of every such action since listing:

    split / consolidation   "Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share"   factor 2 / 10 = 0.2
    bonus a:b               "Bonus 1:1"  (a new shares for every b held)                                       factor b / (a + b) = 0.5

Dividends, rights and meetings do not change the factor. NSE publishes this for its mainboard and SME (Emerge) shares. BSE's own service refuses
outside requests, so for BSE-only issues the splits and bonuses come from Yahoo Finance's price history (it records a bonus as a split: 1:1 bonus =
2:1). Checked against NSE's own record where both exist (HP Adhesives, Bombay Metrics, Oneclick Logistics, BLS E-Services, Ascom Leasing): the same
factors. Yahoo's word is taken only when its history reaches back to the listing, so "no splits" there means none. Describes; not advice.
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
YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}.BO?range=max&interval=1mo&events=split"
YAHOO_COVER_DAYS = 10         # Yahoo's history must start within this many days of the listing
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


def yahoo_since_listing(body: Dict[str, Any], listing: date) -> Optional[Dict[str, Any]]:
    """The factor since listing from Yahoo Finance's chart answer, or None when Yahoo has no history for the share or it does not reach back to the
    listing (then its silence about splits proves nothing)."""
    try:
        res = (body.get("chart") or {}).get("result") or []
        if not res:
            return None
        meta, ev = res[0].get("meta") or {}, (res[0].get("events") or {}).get("splits") or {}
        first = meta.get("firstTradeDate")
        if not isinstance(first, (int, float)) or (date.fromtimestamp(first) - listing).days > YAHOO_COVER_DAYS:
            return None
        factor, used = 1.0, []
        for v in sorted(ev.values(), key=lambda v: v.get("date", 0)):
            ex = date.fromtimestamp(v["date"])
            num, den = float(v.get("numerator") or 0), float(v.get("denominator") or 0)
            if ex <= listing or num <= 0 or den <= 0 or num == den:
                continue
            f = den / num
            factor *= f
            used.append({"exDate": ex.isoformat(), "subject": f"Split or bonus {v.get('splitRatio') or f'{num:g}:{den:g}'} (Yahoo Finance)", "factor": round(f, 6)})
        return {"factor": round(factor, 8), "actions": used}
    except Exception:
        return None


# ------------------------------------------------------------------------------------------------ the job's step (called from finlit.ipobhav.refresh)
CA_TODO = """SELECT ig_id, nse, board, listing_date FROM ipo_gmp WHERE listed AND nse IS NOT NULL AND listing_date IS NOT NULL
    AND (ca_checked_at IS NULL OR ca_checked_at < now() - interval '7 days') ORDER BY ca_checked_at NULLS FIRST, listing_date LIMIT $1"""
CA_SAVE = "UPDATE ipo_gmp SET ca_factor = $2, ca_actions = $3::jsonb, ca_checked_at = now() WHERE ig_id = $1"
CA_BSE_TODO = """SELECT ig_id, bse_ticker, listing_date FROM ipo_gmp WHERE listed AND nse IS NULL AND bse_ticker IS NOT NULL AND listing_date IS NOT NULL
    AND (ca_checked_at IS NULL OR ca_checked_at < now() - interval '7 days') ORDER BY ca_checked_at NULLS FIRST, listing_date LIMIT $1"""
CA_TRIED = "UPDATE ipo_gmp SET ca_checked_at = now() WHERE ig_id = $1"


async def refresh(store, limit: int = 150, stop_at: Optional[float] = None, pause_s: float = 1.0, client=None) -> Dict[str, Any]:
    """Each listed NSE issue's factor since listing, read once a week (oldest check first), at most `limit` a run and until `stop_at` (monotonic)."""
    from .iponse import BROWSER, NSE_HOME
    import httpx
    out = {"asked": 0, "factors": 0, "errors": 0}
    async with store.pool.acquire() as conn:
        rows = [dict(r) for r in await conn.fetch(CA_TODO, limit)]
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
        # BSE-only issues: Yahoo Finance, by the ticker BSE trades them under
        async with store.pool.acquire() as conn:
            bse_rows = [dict(r) for r in await conn.fetch(CA_BSE_TODO, limit)]
        out["yahooDue"] = len(bse_rows)
        yerr = 0
        for r in bse_rows:
            if stop_at and time.monotonic() > stop_at:
                break
            await asyncio.sleep(pause_s)
            try:
                res = await http.get(YAHOO.format(ticker=r["bse_ticker"].replace("&", "%26")), headers={"User-Agent": BROWSER["User-Agent"], "Accept": "application/json"})
                codes = out.setdefault("yahooStatus", {})
                codes[str(res.status_code)] = codes.get(str(res.status_code), 0) + 1
                got = yahoo_since_listing(res.json(), r["listing_date"]) if res.status_code in (200, 404) else None
                if res.status_code not in (200, 404):
                    yerr += 1
                    if yerr >= 5:
                        break                                     # Yahoo is refusing: try again next run
                    continue
            except Exception as exc:
                log.warning("Yahoo history of %s not read", r["bse_ticker"], exc_info=True)
                out["yahooError"] = f"{type(exc).__name__}: {str(exc)[:120]}"
                yerr += 1
                if yerr >= 5:
                    break
                continue
            out["yahooAsked"] = out.get("yahooAsked", 0) + 1
            async with store.pool.acquire() as conn:
                if got is None:
                    await conn.execute(CA_TRIED, r["ig_id"])       # no usable history there: tried again in a week
                else:
                    out["factors"] += int(got["factor"] != 1.0)
                    await conn.execute(CA_SAVE, r["ig_id"], got["factor"], json.dumps(got["actions"]))
    finally:
        if own:
            await http.aclose()
    return out
