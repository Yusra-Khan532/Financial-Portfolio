"""Listing-day prices and the latest close of every listed IPO, from the exchanges' own daily price files (bhavcopies).

One file per exchange per trading day lists every share traded that day, mainboard and SME, with its open, high, low and close. So:

    day-1 open, high, low, close   the file of the listing date: NSE's when the share has an NSE symbol, else BSE's (by scrip code, then ISIN)
    latest close                   the newest NSE and BSE files: one close for every listed IPO

The figures are the exchange's as traded that day (not adjusted for later splits or bonuses), so the first-day close compares directly with the issue
price. Files are read one at a time with a pause; each listing date is read once, and its result kept. Describes the past; not advice.

    NSE   https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_DDMMYYYY.csv           (series EQ, BE, BZ, SM, ST ...)
    BSE   https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_YYYYMMDD_F_0000.CSV  (from 8 Jul 2024)
          https://www.bseindia.com/download/BhavCopy/Equity/EQ_ISINCODE_DDMMYY.zip                     (before)
"""

from __future__ import annotations

import asyncio
import csv
import io
import logging
import time
import zipfile
from datetime import date, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

log = logging.getLogger("finlit.ipobhav")

NSE_FILE = "https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{d:%d%m%Y}.csv"
BSE_NEW = "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_{d:%Y%m%d}_F_0000.CSV"
BSE_OLD = "https://www.bseindia.com/download/BhavCopy/Equity/EQ_ISINCODE_{d:%d%m%y}.zip"
BSE_NEW_FROM = date(2024, 7, 8)          # BSE's new file format starts here
NSE_SERIES = ("EQ", "BE", "BZ", "SM", "ST", "SZ")   # equity series, in order of preference when a symbol trades in more than one
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "*/*"}

Ohlc = Tuple[Optional[float], Optional[float], Optional[float], float]      # open, high, low, close


def _f(v: Any) -> Optional[float]:
    try:
        x = float(str(v).strip().replace(",", ""))
    except (TypeError, ValueError):
        return None
    return x if x > 0 else None


def nse_rows(text: str) -> Dict[str, Ohlc]:
    """NSE's file: {symbol: (open, high, low, close)}, the first equity series a symbol has (EQ before BE before SM ...)."""
    out: Dict[str, Tuple[int, Ohlc]] = {}
    for r in csv.reader(io.StringIO(text)):
        if len(r) < 9 or r[0].strip().upper() == "SYMBOL":
            continue
        sym, ser = r[0].strip().upper(), r[1].strip().upper()
        if ser not in NSE_SERIES:
            continue
        c = _f(r[8])
        if c is None:
            continue
        rank = NSE_SERIES.index(ser)
        if sym not in out or rank < out[sym][0]:
            out[sym] = (rank, (_f(r[4]), _f(r[5]), _f(r[6]), c))
    return {k: v[1] for k, v in out.items()}


def bse_rows(text: str) -> Dict[str, Ohlc]:
    """BSE's file in either format: {scrip code: ohlc} and {ISIN: ohlc} in one map (codes are digits, ISINs start with letters)."""
    out: Dict[str, Ohlc] = {}
    rd = csv.DictReader(io.StringIO(text))
    for r in rd:
        r = {(k or "").strip(): (v or "").strip() for k, v in r.items()}
        if "FinInstrmId" in r:                                      # the new format
            code, isin = r.get("FinInstrmId"), r.get("ISIN")
            o, h, lo, c = _f(r.get("OpnPric")), _f(r.get("HghPric")), _f(r.get("LwPric")), _f(r.get("ClsPric"))
        else:                                                       # the old format
            code, isin = r.get("SC_CODE"), r.get("ISIN_CODE")
            o, h, lo, c = _f(r.get("OPEN")), _f(r.get("HIGH")), _f(r.get("LOW")), _f(r.get("CLOSE"))
        if c is None:
            continue
        for k in (code, isin):
            if k:
                out.setdefault(k.upper(), (o, h, lo, c))
    return out


def bse_tickers(text: str) -> Dict[str, str]:
    """BSE's new file: {scrip code: ticker} (the old format has names, not tickers)."""
    out: Dict[str, str] = {}
    for r in csv.DictReader(io.StringIO(text)):
        code, tick = (r.get("FinInstrmId") or "").strip(), (r.get("TckrSymb") or "").strip().upper()
        if code and tick:
            out[code] = tick
    return out


def bse_old_text(blob: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = next(n for n in z.namelist() if n.upper().endswith(".CSV"))
        return z.read(name).decode("utf-8", "ignore")


def pick(row: Dict[str, Any], nse: Optional[Dict[str, Ohlc]], bse: Optional[Dict[str, Ohlc]]) -> Optional[Tuple[Ohlc, str]]:
    """One IPO's prices in the day's files: NSE by symbol, else BSE by scrip code, else BSE by ISIN."""
    sym, code, isin = (row.get("nse") or "").upper(), (row.get("bse") or "").upper(), (row.get("isin") or "").upper()
    if nse and sym and sym in nse:
        return nse[sym], "NSE"
    if bse:
        for k in (code, isin):
            if k and k in bse:
                return bse[k], "BSE"
    return None


class Files:
    """The day's files, fetched once each and kept for the run. None when the exchange has no file for that day (a holiday) or will not answer."""

    def __init__(self, http, pause_s: float):
        self.http, self.pause_s = http, pause_s
        self.nse: Dict[date, Optional[Dict[str, Ohlc]]] = {}
        self.bse: Dict[date, Optional[Dict[str, Ohlc]]] = {}
        self.tickers: Dict[str, str] = {}                     # BSE scrip code -> ticker, from the new-format files read this run
        self.fetched = 0

    async def _get(self, url: str) -> Optional[bytes]:
        await asyncio.sleep(self.pause_s)
        self.fetched += 1
        try:
            r = await self.http.get(url, headers=HEADERS)
        except Exception:
            log.warning("bhavcopy %s not read", url, exc_info=True)
            return None
        ct = r.headers.get("content-type", "")
        if r.status_code != 200 or "html" in ct or r.content[:15].lstrip().lower().startswith(b"<!doctype"):
            return None
        return r.content

    async def nse_day(self, d: date) -> Optional[Dict[str, Ohlc]]:
        if d not in self.nse:
            b = await self._get(NSE_FILE.format(d=d))
            self.nse[d] = nse_rows(b.decode("utf-8", "ignore")) if b else None
        return self.nse[d]

    async def bse_day(self, d: date) -> Optional[Dict[str, Ohlc]]:
        if d not in self.bse:
            if d >= BSE_NEW_FROM:
                b = await self._get(BSE_NEW.format(d=d))
                text = b.decode("utf-8", "ignore") if b else ""
                self.bse[d] = bse_rows(text) if b else None
                if b:
                    self.tickers.update(bse_tickers(text))
            else:
                b = await self._get(BSE_OLD.format(d=d))
                try:
                    self.bse[d] = bse_rows(bse_old_text(b)) if b else None
                except Exception:
                    self.bse[d] = None
        return self.bse[d]


# ------------------------------------------------------------------------------------------------ the job: refresh-ipo-prices
DAY1_TODO = """SELECT ig_id, nse, bse, isin, listing_date FROM ipo_gmp
    WHERE listed AND listing_date IS NOT NULL AND day1_close IS NULL
      AND (day1_checked_at IS NULL OR (day1_checked_at < now() - interval '1 day' AND listing_date > current_date - 10))
    ORDER BY listing_date DESC"""
DAY1_SAVE = """UPDATE ipo_gmp SET day1_open = $2, day1_high = $3, day1_low = $4, day1_close = $5, day1_src = $6, day1_checked_at = now() WHERE ig_id = $1"""
DAY1_MISS = "UPDATE ipo_gmp SET day1_checked_at = now() WHERE ig_id = $1"
LAST_ROWS = "SELECT ig_id, nse, bse, isin, last_px FROM ipo_gmp WHERE listed"
# issues with no latest close that have not been looked for in the newest day's files yet (added after it was read)
LACKING_COUNT = """SELECT count(*) FROM ipo_gmp
    WHERE listed AND last_px IS NULL AND (last_px_date IS NULL OR last_px_date < (SELECT max(last_px_date) FROM ipo_gmp))"""
LACKING_ROWS = """SELECT ig_id, nse, bse, isin, last_px FROM ipo_gmp
    WHERE listed AND last_px IS NULL AND (last_px_date IS NULL OR last_px_date < (SELECT max(last_px_date) FROM ipo_gmp))"""
LAST_TRIED = "UPDATE ipo_gmp SET last_px_date = $2 WHERE ig_id = $1 AND last_px IS NULL"
LAST_SAVE = "UPDATE ipo_gmp SET last_px = $2, last_px_date = $3, last_px_src = $4 WHERE ig_id = $1"
LOOKBACK_DAYS = 45            # calendar days looked back for a share that has not traded lately
STALE_ROWS = """SELECT ig_id, nse, bse, isin, last_px FROM ipo_gmp WHERE listed AND last_px IS NULL
    AND (px_lookback_on IS NULL OR px_lookback_on < (SELECT max(last_px_date) FROM ipo_gmp))"""
LOOKBACK_DONE = "UPDATE ipo_gmp SET px_lookback_on = $1 WHERE listed AND last_px IS NULL"
TICKER_SAVE = "UPDATE ipo_gmp SET bse_ticker = $1 WHERE bse = $2 AND bse_ticker IS DISTINCT FROM $1"


def by_date(rows: Iterable[Dict[str, Any]]) -> List[Tuple[date, List[Dict[str, Any]]]]:
    g: Dict[date, List[Dict[str, Any]]] = {}
    for r in rows:
        g.setdefault(r["listing_date"], []).append(r)
    return sorted(g.items(), key=lambda kv: kv[0], reverse=True)


async def refresh(store, max_dates: int = 60, pause_s: float = 1.0, max_minutes: float = 10.0, http=None, today: Optional[date] = None, ca_limit: int = 150,
                  ca_client=None) -> Dict[str, Any]:
    """Day-1 prices for listed IPOs that have none yet (newest listing dates first, at most `max_dates` dates a run), then the latest close of every
    listed IPO from the newest NSE and BSE files. Nothing stored is removed; a day that cannot be read is tried again next run."""
    import httpx
    out = {"dates": 0, "day1": 0, "missing": 0, "files": 0, "latest": 0, "latestDate": None}
    stop = time.monotonic() + max_minutes * 60
    own = http is None
    http = http or httpx.AsyncClient(timeout=60, follow_redirects=True)
    files = Files(http, pause_s)
    today = today or date.today()
    try:
        async with store.pool.acquire() as conn:
            todo = [dict(r) for r in await conn.fetch(DAY1_TODO)]
        for d, rows in by_date(todo)[:max_dates]:
            if time.monotonic() > stop:
                break
            nse = await files.nse_day(d) if any(r["nse"] for r in rows) else None
            need_bse = [r for r in rows if not (nse and (r["nse"] or "").upper() in nse)]
            bse = await files.bse_day(d) if need_bse else None
            if nse is None and bse is None:
                files.nse.pop(d, None), files.bse.pop(d, None)
                continue                                        # neither exchange answered for that day: try again next run
            out["dates"] += 1
            async with store.pool.acquire() as conn:
                for r in rows:
                    got = pick(r, nse, bse)
                    if got:
                        (o, h, lo, c), src = got
                        await conn.execute(DAY1_SAVE, r["ig_id"], o, h, lo, c, src)
                        out["day1"] += 1
                    else:
                        await conn.execute(DAY1_MISS, r["ig_id"])
                        out["missing"] += 1
            files.nse.pop(d, None), files.bse.pop(d, None)         # one day's files at a time in memory
        # the latest close: the newest day both files exist for, looking back up to a week
        if time.monotonic() < stop:
            async with store.pool.acquire() as conn:
                newest = await conn.fetchval("SELECT max(last_px_date) FROM ipo_gmp")
                lacking = await conn.fetchval(LACKING_COUNT)
            for back in range(0, 8):
                d = today - timedelta(days=back)
                if newest and d < newest:
                    break
                if newest and d == newest and not lacking:
                    break                                       # the newest day we could read is stored already, for every issue
                if d.weekday() >= 5:
                    continue
                nse, bse = await files.nse_day(d), await files.bse_day(d)
                if nse is None and bse is None:
                    continue
                # a newer day: every listed issue; the same day again: only the issues added since (they have no latest close yet)
                q = LAST_ROWS if not newest or d > newest else LACKING_ROWS
                async with store.pool.acquire() as conn:
                    for r in [dict(x) for x in await conn.fetch(q)]:
                        got = pick(r, nse, bse)
                        if got:
                            await conn.execute(LAST_SAVE, r["ig_id"], got[0][3], d, got[1])
                            out["latest"] += 1
                        elif r.get("last_px") is None:
                            await conn.execute(LAST_TRIED, r["ig_id"], d)    # not in that day's files: tried once for that day
                out["latestDate"] = d.isoformat()
                break
            # Shares that did not trade on the newest day (illiquid SME shares often do not) and have no latest close yet: their last close in the
            # files of up to LOOKBACK_DAYS earlier days, looked for once per newest day.
            async with store.pool.acquire() as conn:
                newest = await conn.fetchval("SELECT max(last_px_date) FROM ipo_gmp")
                stale = [dict(x) for x in await conn.fetch(STALE_ROWS)] if newest else []
            back = 1
            while stale and back <= LOOKBACK_DAYS and time.monotonic() < stop:
                d = newest - timedelta(days=back)
                back += 1
                if d.weekday() >= 5:
                    continue
                nse = await files.nse_day(d) if any(r["nse"] for r in stale) else None
                bse = await files.bse_day(d)
                files.nse.pop(d, None), files.bse.pop(d, None)
                left = []
                async with store.pool.acquire() as conn:
                    for r in stale:
                        got = pick(r, nse, bse)
                        if got:
                            await conn.execute(LAST_SAVE, r["ig_id"], got[0][3], d, got[1])
                            out["latestEarlier"] = out.get("latestEarlier", 0) + 1
                        else:
                            left.append(r)
                stale = left
            if newest and back > LOOKBACK_DAYS:
                async with store.pool.acquire() as conn:
                    await conn.execute(LOOKBACK_DONE, newest)
            if files.tickers:
                async with store.pool.acquire() as conn:
                    await conn.executemany(TICKER_SAVE, [(t, c) for c, t in files.tickers.items()])
        # splits and bonuses since listing, from NSE (weekly per issue), in the time left
        if ca_limit > 0 and time.monotonic() < stop:
            from .ipocorp import refresh as refresh_ca
            out["corporateActions"] = await refresh_ca(store, limit=ca_limit, stop_at=stop, pause_s=pause_s, client=ca_client or (None if own else http))
    finally:
        out["files"] = files.fetched
        if own:
            await http.aclose()
    return out
