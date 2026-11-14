"""Fresh daily candles for the chart-pattern scans (task #64, C6).

The scans read each company's stored one-year prices (the `price-1Y` section), which change only when the company's whole report is rebuilt. On the live site
three in four of the scanned companies were two or more sessions behind the close, the 98% coverage gate held the run night after night, and the screens kept
showing an old run with 976 companies left out.

The technicals job already fetches every rated company's split-adjusted daily candles from Dhan after each close (prism_technical.refresh_symbol). It now keeps the
last sessions of them here (compressed, in Redis, a fortnight), and the scans use them whenever they reach a later session than the stored report. Nothing is
mixed: a series is either the stored one or the Dhan one, whole.
"""
from __future__ import annotations

import json
from datetime import date
import logging
import zlib
from typing import Any, Dict, List, Optional, Sequence

log = logging.getLogger("finlit.presets.candles")
PREFIX = "cdl:d:"
KEEP_SESSIONS = 300        # a little over one year of sessions: the scans look back one year
TTL_S = 14 * 86400


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and f not in (float("inf"), float("-inf")) else None


def pack(rows: Sequence[Sequence[Any]]) -> Optional[bytes]:
    """[[YYYY-MM-DD, open, high, low, close, volume], ...] (oldest first) -> compressed bytes of {t, o, h, l, c, v} for the last KEEP_SESSIONS; None when unusable."""
    t: List[str] = []
    cols: Dict[str, List[Optional[float]]] = {k: [] for k in "ohlcv"}
    for r in list(rows or [])[-KEEP_SESSIONS:]:
        if not isinstance(r, (list, tuple)) or len(r) < 6 or not isinstance(r[0], str) or len(r[0]) < 10:
            continue
        c = _num(r[4])
        if c is None:
            continue
        t.append(r[0][:10])
        for k, v in zip("ohlcv", r[1:6]):
            cols[k].append(_num(v))
    if len(t) < 25 or t != sorted(t):
        return None
    return zlib.compress(json.dumps({"t": t, **cols}, separators=(",", ":")).encode())


def unpack(raw: Optional[bytes]) -> Optional[Dict[str, list]]:
    if not raw:
        return None
    try:
        return json.loads(zlib.decompress(raw if isinstance(raw, bytes) else raw.encode("latin-1")))
    except Exception:
        return None


async def save(redis, symbol: str, rows: Sequence[Sequence[Any]]) -> bool:
    data = pack(rows)
    if data is None:
        return False
    try:
        await redis.set(PREFIX + symbol, data, ex=TTL_S)
        return True
    except Exception:
        log.warning("daily candles of %s not kept for the pattern scans", symbol)
        return False


async def load(redis, symbol: str) -> Optional[Dict[str, list]]:
    try:
        return unpack(await redis.get(PREFIX + symbol))
    except Exception:
        return None


async def series(store, symbol: str) -> Dict[str, list]:
    """The daily series the scans use for one company: the stored one-year prices, or the Dhan candles when those reach a later session. {} when there is none."""
    stored: Dict[str, list] = {}
    try:
        hit = await store.get_section(symbol, "consolidated", "price-1Y")
        stored = ((json.loads(hit[0]) if hit else None) or {}).get("series") or {}
    except Exception:
        stored = {}
    redis = getattr(store, "redis", None)
    fresh = await load(redis, symbol) if redis is not None else None
    last = lambda s: str((s.get("t") or [""])[-1])[:10]          # noqa: E731
    out = fresh if fresh and fresh.get("t") and (not stored.get("t") or last(fresh) > last(stored)) else stored
    return await with_daily_closes(store, symbol, out)


DAILY_TAIL = 30      # at most this many sessions are added from the nightly closes


async def with_daily_closes(store, symbol: str, s: Dict[str, list]) -> Dict[str, list]:
    """The series with the sessions the nightly job has stored since its last bar (price_daily) added at the end. 14 Nov 2026: companies without a Prism report
    have no Dhan candles, and their stored one-year prices only move when the report is rebuilt, so 8% to 37% of the scanned companies lacked the latest close
    and the chart-pattern scans were held back every run. Nothing changes when the series already reaches the latest stored close, or has no bars to extend."""
    pool = getattr(store, "pool", None)
    if pool is None or not s.get("t"):
        return s
    try:
        after = date.fromisoformat(str(s["t"][-1])[:10])
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT day, open, high, low, close, volume FROM price_daily WHERE symbol = $1 AND day > $2 AND close > 0 ORDER BY day LIMIT $3",
                                    symbol, after, DAILY_TAIL)
    except Exception:   # the series as it was; the scans then see the company as behind
        return s
    if not rows:
        return s
    out = {k: list(v) for k, v in s.items() if isinstance(v, list)}
    for r in rows:
        bar = {"t": r["day"].isoformat(), "o": r["open"], "h": r["high"], "l": r["low"], "c": r["close"], "v": r["volume"]}
        for k in ("t", "o", "h", "l", "c", "v"):
            if k in out:
                v = bar[k]
                out[k].append(float(v) if k != "t" and v is not None else v)
    return out
