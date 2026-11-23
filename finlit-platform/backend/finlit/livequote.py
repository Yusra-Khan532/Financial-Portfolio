"""One latest price per company, shared by every page (task #338, 23 Nov 2026).

The team saw Bank of Maharashtra at 98.07 on one computer and 97.7 on another, while Google showed 97.87, all with the same previous close (99.45):
each was a real quote, from a different moment. The site kept a stock's price in two copies refreshed separately (the report summary, patched a few
hundred companies at a time by the quotes job, and the listing table behind watchlists and search, refreshed every 30 minutes), and an open company
page never asked again. Now:

- The quotes job already fetches every matched company's live quote from Dhan in a few batch calls at the start of each run (about every minute in
  market hours). That whole batch is saved here at once, in one Redis hash, before the slow per-company work: every company's latest price is at
  most one run old.
- The company header (through GET /api/search/live), the watchlist and search list (GET /api/search/quotes) and the portfolio overview read it, so
  they all show the same price for the same moment, with its trade time.
- A quote is used only when it is newer than the price it replaces and passes the same check as the job (`dhan.plausible`: previous close within
  25% of the price held), so a wrong company match never shows.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Iterable, Optional

import orjson

log = logging.getLogger(__name__)

KEY = "live:quote"
KEEP_S = 36 * 3600            # a day and a half: past a weekend's first morning the next run has written again
FIELDS = ("price", "change", "changePct", "previousClose", "open", "high", "low", "volume", "upperCircuit", "lowerCircuit", "asOf")


def _when(q: Optional[dict]) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(q["asOf"]) if q and q.get("asOf") else None
    except (TypeError, ValueError):
        return None


def newer(new: Optional[dict], old: Optional[dict]) -> bool:
    """True when `new` should replace `old`: it has a price, and it is not older by its trade time (a quote without a time never replaces one with)."""
    if not new or not new.get("price"):
        return False
    if not old or not old.get("price"):
        return True
    a, b = _when(new), _when(old)
    if b is None:
        return True
    return a is not None and a >= b


async def save(redis: Any, quotes: Dict[str, dict]) -> int:
    """Store the latest quote of each company; an older quote never replaces a newer one. Returns how many were written."""
    if not quotes:
        return 0
    syms = sorted(quotes)
    held = await redis.hmget(KEY, syms)
    out: Dict[str, bytes] = {}
    for sym, raw in zip(syms, held):
        q = {k: quotes[sym].get(k) for k in FIELDS if quotes[sym].get(k) is not None}
        try:
            old = orjson.loads(raw) if raw else None
        except orjson.JSONDecodeError:
            old = None
        if newer(q, old) and q != old:
            out[sym] = orjson.dumps(q)
    if out:
        await redis.hset(KEY, mapping=out)
        await redis.expire(KEY, KEEP_S)
    return len(out)


async def read(redis: Any, symbols: Optional[Iterable[str]] = None) -> Dict[str, dict]:
    """{symbol: latest quote} for the given symbols (all when None). An unreadable store gives {} and the caller keeps its own price."""
    try:
        if symbols is None:
            got = await redis.hgetall(KEY)
            pairs = [((k.decode() if isinstance(k, bytes) else k), v) for k, v in got.items()]
        else:
            syms = list(dict.fromkeys(symbols))
            if not syms:
                return {}
            pairs = list(zip(syms, await redis.hmget(KEY, syms)))
    except Exception:
        log.exception("latest quotes could not be read")
        return {}
    out: Dict[str, dict] = {}
    for sym, raw in pairs:
        if raw:
            try:
                out[sym] = orjson.loads(raw)
            except orjson.JSONDecodeError:
                continue
    return out


def overlay(base: Optional[dict], live: Optional[dict]) -> Optional[dict]:
    """`base` (a quote the caller holds) with the latest quote laid over it, or None when the latest one is not newer or not plausible.
    Market cap moves with the price (shares do not change intraday); the 52-week range widens to the day's high and low; a price band from an
    older quote is dropped rather than shown beside a newer price."""
    from .dhan import plausible
    base = base or {}
    if not live or not newer(live, base) or not plausible(live, base):
        return None
    q = {**base, **{k: v for k, v in live.items() if v is not None}}
    if base.get("marketCapCr") and base.get("price"):
        q["marketCapCr"] = round(base["marketCapCr"] * live["price"] / base["price"], 2)
    if base.get("high52") and live.get("high") and live["high"] > base["high52"]:
        q["high52"] = live["high"]
    if base.get("low52") and live.get("low") and live["low"] < base["low52"]:
        q["low52"] = live["low"]
    for k in ("upperCircuit", "lowerCircuit"):
        if live.get(k) is None:
            q.pop(k, None)
    return q
