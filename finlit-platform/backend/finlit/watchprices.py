"""Task #408 (Watchlists, 03-data change 1): the price a stock had when it was added to a watchlist.

The page stores `meta[SYM].addedPrice` (the last traded price) when a member adds a stock. Entries saved before that have only `added` (a time in
milliseconds). This fills them once, from the daily closes the site already stores: the close of the trading day the stock was added on, or, when it
was added after the close (15:30 IST) or on a day with no trading, the next close. Daily candles first (finlit/candles.py), then price_daily.

Idempotent: an entry that has an added price is never touched, so running it again changes nothing. A stock with no close on or after its day yet is
left as it is (the page says why) and is filled on a later run. Run by the probe-driven job "watchlist-prices" (jobs/registry.py) only while there is
an entry it can fill (has_work), so it never runs for nothing."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

log = logging.getLogger("finlit.watchprices")

IST = ZoneInfo("Asia/Kolkata")
CLOSE = time(15, 30)          # NSE's close: a stock added later that day takes the next close


def first_day(added_ms: int) -> Optional[date]:
    """The trading day whose close counts for a stock added at this time: the IST day, or the next day when it was added after the close."""
    if not added_ms or added_ms <= 0:
        return None
    t = datetime.fromtimestamp(added_ms / 1000, tz=timezone.utc).astimezone(IST)
    return t.date() + timedelta(days=1) if t.time() >= CLOSE else t.date()


def pick_close(day: date, closes: Iterable[Tuple[date, float]]) -> Optional[Tuple[date, float]]:
    """The first stored close on or after `day` (a weekend or holiday takes the next session). None when there is none yet."""
    best: Optional[Tuple[date, float]] = None
    for d, c in closes:
        if d >= day and c is not None and c > 0 and (best is None or d < best[0]):
            best = (d, float(c))
    return best


def _parse(raw: Any) -> Dict[str, Any]:
    try:
        v = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except ValueError:
        return {}
    return v if isinstance(v, dict) else {}


def missing(watchlist: Any) -> List[Tuple[str, date]]:
    """(symbol, first day) of every entry on a member's lists that has a time added but no added price."""
    w = _parse(watchlist)
    meta = w.get("meta") if isinstance(w.get("meta"), dict) else {}
    on = {str(s).upper() for lst in (w.get("lists") or []) if isinstance(lst, dict) for s in (lst.get("symbols") or []) if isinstance(s, str)}
    out: List[Tuple[str, date]] = []
    for sym, m in meta.items():
        if not isinstance(m, dict) or m.get("addedPrice") or str(sym).upper() not in on:
            continue
        try:
            d = first_day(int(m.get("added") or 0))
        except (TypeError, ValueError, OverflowError, OSError):
            d = None
        if d is not None:
            out.append((str(sym).upper(), d))
    return out


async def _closes(conn, wanted: Dict[str, date]) -> Dict[str, List[Tuple[date, float]]]:
    """Stored daily closes from the earliest day asked for, per symbol: daily candles first, price_daily for the days the candles do not hold."""
    if not wanted:
        return {}
    syms, lo = sorted(wanted), min(wanted.values())
    out: Dict[str, Dict[date, float]] = {}
    for table in ("daily_candles", "price_daily"):   # fixed table names, never request values
        try:
            rows = await conn.fetch(f"SELECT symbol, day, close FROM {table} WHERE symbol = ANY($1::text[]) AND day >= $2 ORDER BY symbol, day", syms, lo)  # nosec B608
        except Exception:      # an older database without daily_candles: price_daily alone
            log.warning("added prices: %s not read", table)
            continue
        for r in rows:
            if r["close"] is not None:
                out.setdefault(r["symbol"], {}).setdefault(r["day"], float(r["close"]))
    return {s: sorted(v.items()) for s, v in out.items()}


async def has_work(store) -> bool:
    """The probe: is there a watchlist entry without an added price whose close is already stored?"""
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT watchlist FROM user_state WHERE watchlist::text LIKE '%\"added\"%'")
        wanted: Dict[str, date] = {}
        for r in rows:
            for sym, d in missing(r["watchlist"]):
                wanted[sym] = min(d, wanted.get(sym, d))
        if not wanted:
            return False
        closes = await _closes(conn, wanted)
    return any(pick_close(d, closes.get(s, [])) for s, d in wanted.items())


async def backfill(store) -> Dict[str, int]:
    """Fill the added price of every entry that has none and whose close is stored. Each member's row is updated in its own statement, and only
    the entries filled change (`jsonb_set` on meta.SYM.addedPrice), so a list saved by the member at the same moment is not overwritten."""
    filled = members = waiting = 0
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT user_id, watchlist FROM user_state WHERE watchlist::text LIKE '%\"added\"%'")
        todo = {r["user_id"]: missing(r["watchlist"]) for r in rows}
        wanted: Dict[str, date] = {}
        for items in todo.values():
            for sym, d in items:
                wanted[sym] = min(d, wanted.get(sym, d))
        closes = await _closes(conn, wanted)
        for uid, items in todo.items():
            done = 0
            for sym, d in items:
                got = pick_close(d, closes.get(sym, []))
                if got is None:
                    waiting += 1
                    continue
                # only an entry that still has no added price is written: the member's own price, saved meanwhile, wins
                n = await conn.fetchval(
                    "UPDATE user_state SET watchlist = jsonb_set(watchlist, ARRAY['meta', $2::text, 'addedPrice'], to_jsonb($3::float8)) "
                    "WHERE user_id = $1 AND jsonb_typeof(watchlist -> 'meta' -> $2::text) = 'object' AND (watchlist -> 'meta' -> $2::text -> 'addedPrice') IS NULL "
                    "RETURNING 1", uid, sym, round(got[1], 2))
                if n:
                    done += 1
            if done:
                members += 1
                filled += done
    log.info("added prices: %d filled for %d members, %d waiting for a close", filled, members, waiting)
    return {"filled": filled, "members": members, "waiting": waiting}
