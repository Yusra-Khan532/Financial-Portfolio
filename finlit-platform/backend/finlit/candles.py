"""Daily candles from the exchange (Dhan, NSE first), stored in `daily_candles`.

Why: the main provider's /daily-quotes names no exchange and its volumes are BSE-sized, so relative volume, value traded and every
chart pattern were reading a fifteenth of the real turnover. This module
  * loads candles nightly (`refresh`), a little more each run until a company has `days` of history, then only the new sessions;
  * puts them into a report's bundle in the provider's own shape (`apply`), so snapshot.build and every reader stay unchanged;
  * hands whole lists of companies to the pattern job in one query (`bulk`).

A company with no Dhan row, or with too few candles, keeps the provider's series exactly as before.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import date, timedelta
from statistics import median
from typing import Any, Dict, Iterable, List, Optional

log = logging.getLogger(__name__)

MIN_ROWS = 60          # fewer candles than this and the provider's series is left alone (a listing of last month is the exception: see apply)
DEFAULT_DAYS = 1150    # a little over three years, for the weekly bars of the chart patterns
CALL_GAP = 0.25        # seconds between history calls


def payload(rows: Iterable[dict]) -> Dict[str, List[dict]]:
    """Candles in the main provider's /daily-quotes shape, so normalize.market.price_history reads them unchanged."""
    out = []
    for r in rows:
        if r.get("close") is None or r["close"] <= 0:
            continue
        day = r["day"].isoformat() if hasattr(r["day"], "isoformat") else str(r["day"])
        out.append({"quote_date": day, "open_price": r.get("open"), "high_price": r.get("high"), "low_price": r.get("low"),
                    "close_price": r["close"], "volume": r.get("volume")})
    return {"price": out}


def merge(provider: Any, candles: List[dict]) -> Dict[str, List[dict]]:
    """The exchange's candles for every day they cover, the provider's rows only for the days before the first candle.

    The older provider rows are scaled to meet the candles where the two overlap (the provider adjusts for splits and bonuses on its own
    schedule), unless they already agree within half a percent."""
    new = payload(candles)["price"]
    if not new:
        return provider if isinstance(provider, dict) else {"price": list(provider or [])}
    old = [r for r in ((provider.get("price") if isinstance(provider, dict) else provider) or []) if isinstance(r, dict)]
    day_of = lambda r: str(r.get("quote_date") or r.get("date") or "")[:10]
    close_of = lambda r: r.get("close_price") if r.get("close_price") is not None else r.get("close")
    first = new[0]["quote_date"]
    by_day = {r["quote_date"]: r["close_price"] for r in new}
    ratios = [by_day[day_of(r)] / float(close_of(r)) for r in old if day_of(r) in by_day and close_of(r) not in (None, 0, "")]
    k = median(ratios) if len(ratios) >= 5 else 1.0
    if not (0.02 < k < 50) or abs(k - 1) <= 0.005:
        k = 1.0
    older = []
    for r in old:
        if not day_of(r) or day_of(r) >= first:
            continue
        if k != 1.0:
            r = dict(r)
            for f in ("open_price", "high_price", "low_price", "close_price", "close"):
                if isinstance(r.get(f), (int, float)):
                    r[f] = round(r[f] * k, 2)
        older.append(r)
    return {"price": older + new}


async def rows_for(store, symbol: str, days: int = DEFAULT_DAYS) -> List[dict]:
    async with store.pool.acquire() as conn:
        recs = await conn.fetch("SELECT day, open, high, low, close, volume, exch FROM daily_candles WHERE symbol = $1 AND day >= $2 ORDER BY day",
                                symbol.upper(), date.today() - timedelta(days=days))
    return [dict(r) for r in recs]


async def apply(store, bundle: dict, symbol: str) -> Optional[str]:
    """Swap the bundle's daily quotes for the stored exchange candles. Returns the exchange used, or None when the bundle was left alone."""
    rows = await rows_for(store, symbol)
    if not rows:
        return None
    young = len(rows) < MIN_ROWS and not ((bundle.get("daily_quotes") or {}).get("price") if isinstance(bundle.get("daily_quotes"), dict) else None)
    if len(rows) < MIN_ROWS and not young:
        return None
    bundle["daily_quotes"] = merge(bundle.get("daily_quotes"), rows)
    bundle["price_source"] = {"exchange": rows[-1]["exch"], "via": "dhan", "days": len(rows), "from": rows[0]["day"].isoformat(), "to": rows[-1]["day"].isoformat()}
    (bundle.get("errors") or {}).pop("daily_quotes", None)
    return rows[-1]["exch"]


async def bulk(store, symbols: List[str], days: int = 400) -> Dict[str, Dict[str, list]]:
    """{symbol: {"t", "o", "h", "l", "c", "v", "exch"}} for the pattern job: one query, oldest day first."""
    out: Dict[str, Dict[str, list]] = {}
    async with store.pool.acquire() as conn:
        recs = await conn.fetch("SELECT symbol, day, open, high, low, close, volume, exch FROM daily_candles WHERE symbol = ANY($1::text[]) AND day >= $2 "
                                "ORDER BY symbol, day", [s.upper() for s in symbols], date.today() - timedelta(days=days))
    for r in recs:
        o = out.setdefault(r["symbol"], {"t": [], "o": [], "h": [], "l": [], "c": [], "v": [], "exch": r["exch"]})
        o["t"].append(r["day"].isoformat()); o["o"].append(r["open"]); o["h"].append(r["high"]); o["l"].append(r["low"]); o["c"].append(r["close"]); o["v"].append(r["volume"])
    return out


async def newest_session(store, min_companies: int = 50) -> Optional[str]:
    """Task #394: the newest day the candle store holds as a real session (candles for at least `min_companies` companies, so one stray row is not a
    session), or None. The job compares it with the session it expected, so a night the exchange's candles were not out yet is not counted as done."""
    async with store.pool.acquire() as conn:
        d = await conn.fetchval("SELECT day FROM daily_candles WHERE day >= current_date - 15 GROUP BY day HAVING count(*) >= $1 ORDER BY day DESC LIMIT 1", min_companies)
    return d.isoformat() if d else None


async def refresh(store, dhan, symbols: Optional[List[str]] = None, days: int = DEFAULT_DAYS, max_minutes: float = 45.0, limit: Optional[int] = None) -> dict:
    """Bring `daily_candles` up to yesterday's close (today's, once the session is over), oldest-loaded companies first.

    A company seen for the first time gets `days` of history in one call; afterwards only the sessions since its last stored day, with five days
    of overlap so a corrected candle is picked up. Time-boxed: what does not fit tonight is first in line tomorrow."""
    from .dhan import security_map

    started = time.monotonic(); today = date.today()
    async with store.pool.acquire() as conn:
        if symbols is None:
            recs = await conn.fetch("SELECT c.symbol, max(d.day) AS last, max(d.loaded_at) AS seen FROM companies c LEFT JOIN daily_candles d ON d.symbol = c.symbol "
                                    "GROUP BY c.symbol ORDER BY max(d.loaded_at) NULLS FIRST, c.symbol")
        else:
            recs = await conn.fetch("SELECT c.symbol, max(d.day) AS last FROM companies c LEFT JOIN daily_candles d ON d.symbol = c.symbol "
                                    "WHERE c.symbol = ANY($1::text[]) GROUP BY c.symbol", [s.upper() for s in symbols])
    last = {r["symbol"]: r["last"] for r in recs}
    order = [r["symbol"] for r in recs][:limit] if limit else [r["symbol"] for r in recs]
    out = {"asked": len(order), "loaded": 0, "rows": 0, "no_match": 0, "empty": 0, "failed": 0, "nse": 0, "bse": 0, "left": 0}
    for i in range(0, len(order), 500):
        chunk = order[i:i + 500]; ids = await security_map(store, chunk)
        for n, sym in enumerate(chunk):
            if time.monotonic() - started > max_minutes * 60:
                out["left"] = len(order) - i - n
                out["newestSession"] = await newest_session(store)
                return out
            hit = ids.get(sym)
            if not hit:
                out["no_match"] += 1
                continue
            seg, sid = hit
            start = (last[sym] - timedelta(days=5)) if last.get(sym) else today - timedelta(days=days)
            try:
                rows = await dhan.daily(sid, seg, start, today + timedelta(days=1))
            except Exception:
                log.exception("daily candles failed for %s", sym); out["failed"] += 1
                await asyncio.sleep(CALL_GAP)
                continue
            rows = [r for r in rows if r.get("close") and r["close"] > 0 and (r.get("volume") or 0) >= 0]
            if not rows:
                out["empty"] += 1
            else:
                exch = "NSE" if seg == "NSE_EQ" else "BSE"
                async with store.pool.acquire() as conn:
                    await conn.executemany(
                        "INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) "
                        "ON CONFLICT (symbol, day) DO UPDATE SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close, "
                        "volume = EXCLUDED.volume, exch = EXCLUDED.exch, loaded_at = now()",
                        [(sym, r["day"], r.get("open"), r.get("high"), r.get("low"), r["close"], int(r["volume"]) if r.get("volume") is not None else None, exch) for r in rows])
                out["loaded"] += 1; out["rows"] += len(rows); out["nse" if exch == "NSE" else "bse"] += 1
            await asyncio.sleep(CALL_GAP)
    out["newestSession"] = await newest_session(store)
    return out
