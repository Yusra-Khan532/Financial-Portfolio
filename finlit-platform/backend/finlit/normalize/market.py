"""Company profile, live quote and daily price history."""

from __future__ import annotations

import re
from statistics import median
from typing import Any, Dict, List, Optional

from .common import iso, parse_date, rnd, to_number


# ---------------------------------------------------------------- profile

def profile(payload: Any, symbol_row: Optional[dict] = None) -> dict:
    p = payload if isinstance(payload, dict) else {}
    s = symbol_row or {}
    description = (p.get("description") or "").strip()
    employees = None
    match = re.search(r"employs\s+([\d,]+)", description)
    if match:
        employees = int(match[1].replace(",", ""))
    return {
        "symbol": p.get("symbol") or s.get("symbol"),
        "name": p.get("name") or s.get("name"),
        "nse": p.get("nse_code") or s.get("nse_code"),
        "bse": p.get("bse_code") or s.get("bse_code"),
        "sector": p.get("sector"),
        "industry": p.get("industry"),
        "subIndustry": p.get("sub_industry"),
        "macroSector": p.get("macro_sector"),
        "website": p.get("website"),
        "description": description or None,
        "employees": employees,
        "marketCapCr": rnd(p.get("market_cap")),
        "hasConsolidated": bool(s.get("consolidated_ind", True)),
    }


# ---------------------------------------------------------------- quote

def ist_timestamp(value: Any) -> Optional[str]:
    """FinEdge sends Indian local time with a misleading 'Z' (e.g. '2026-09-29T15:59:02Z' for a trade at
    15:59 IST, just after the NSE close; read as UTC it would be 21:29 IST, when the market is shut).
    Re-label it with the real +05:30 offset so every client shows the right time."""
    if not value:
        return None
    text = str(value).strip().replace(" ", "T")
    match = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$", text)
    if not match:
        return None
    stamp, zone = match.groups()
    if zone and zone != "Z":
        return stamp + zone  # an explicit offset is trusted as sent
    return stamp + "+05:30"


def quote(payload: Any, symbol: str) -> dict:
    data = payload.get(symbol) if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return {}
    price = to_number(data.get("current_price"))
    change_pct = to_number(data.get("change"))
    previous = round(price / (1 + change_pct / 100), 2) if price and change_pct is not None else None
    return {
        "price": rnd(price),
        "changePct": rnd(change_pct),
        "change": rnd(price - previous) if price and previous else None,
        "previousClose": previous,
        "open": rnd(data.get("open_price")),
        "high": rnd(data.get("high_price")),
        "low": rnd(data.get("low_price")),
        "high52": rnd(data.get("high52")),
        "low52": rnd(data.get("low52")),
        "volume": int(to_number(data.get("volume")) or 0) or None,
        "marketCapCr": rnd(data.get("market_cap")),
        "asOf": ist_timestamp(data.get("tradetime")),
    }


# ---------------------------------------------------------------- price history

def price_history(payload: Any, outlier_threshold: float = 0.35, window: int = 5) -> dict:
    """Daily OHLCV, oldest first, as compact parallel arrays. Removes bad ticks:
    closes <= 0, and isolated closes more than `outlier_threshold` away from the median
    of their neighbours (the live site showed BPCL dropping to ₹0 in Aug 2026)."""
    rows = payload.get("price") if isinstance(payload, dict) else payload
    clean = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        day = parse_date(row.get("quote_date") or row.get("date"))
        close = to_number(row.get("close_price") if row.get("close_price") is not None else row.get("close"))
        if day is None or close is None:
            continue
        clean.append({
            "d": day, "o": to_number(row.get("open_price")), "h": to_number(row.get("high_price")),
            "l": to_number(row.get("low_price")), "c": close, "v": to_number(row.get("volume")),
        })
    by_day = {r["d"]: r for r in clean}  # de-duplicate dates, keep last
    ordered = [by_day[d] for d in sorted(by_day)]

    removed = []
    kept = []
    for i, row in enumerate(ordered):
        if row["c"] <= 0:
            removed.append(row["d"].isoformat())
            continue
        neighbours = [r["c"] for r in ordered[max(0, i - window):i] + ordered[i + 1:i + 1 + window] if r["c"] > 0]
        if len(neighbours) >= 4:
            mid = median(neighbours)
            if mid > 0 and abs(row["c"] - mid) / mid > outlier_threshold:
                removed.append(row["d"].isoformat())
                continue
        kept.append(row)

    return {
        "t": [r["d"].isoformat() for r in kept],
        "o": [rnd(r["o"]) for r in kept],
        "h": [rnd(r["h"]) for r in kept],
        "l": [rnd(r["l"]) for r in kept],
        "c": [rnd(r["c"]) for r in kept],
        "v": [int(r["v"]) if r["v"] is not None else None for r in kept],
        "removedBadTicks": removed,
    }


def weekly(history: dict) -> dict:
    """Downsample daily arrays to weekly candles (for 3Y/5Y/MAX charts), each dated on the last trading day of its ISO week: open is the first
    day's open, high the highest high, low the lowest low, close the last close and volume the week's total. Open, high and low are sent only when
    the daily history has them (a close-only history stays close-only, so the chart draws a line, not dots)."""
    t, c, v = history.get("t", []), history.get("c", []), history.get("v", [])
    o, h, lo = history.get("o"), history.get("h"), history.get("l")
    ohlc = bool(o and h and lo and len(o) == len(h) == len(lo) == len(t))
    out_t, out_c, out_v, out_o, out_h, out_l = [], [], [], [], [], []
    current_key, volume = None, 0
    for i, day in enumerate(t):
        key = parse_date(day).isocalendar()[:2]
        if key != current_key and current_key is not None:
            out_v.append(volume)
            volume = 0
        if key != current_key:
            out_t.append(day)
            out_c.append(c[i])
            if ohlc:
                out_o.append(o[i] if o[i] is not None else c[i])
                out_h.append(h[i] if h[i] is not None else c[i])
                out_l.append(lo[i] if lo[i] is not None else c[i])
            current_key = key
        else:
            out_t[-1], out_c[-1] = day, c[i]
            if ohlc:
                if out_o[-1] is None:
                    out_o[-1] = o[i]
                if h[i] is not None and (out_h[-1] is None or h[i] > out_h[-1]):
                    out_h[-1] = h[i]
                if lo[i] is not None and (out_l[-1] is None or lo[i] < out_l[-1]):
                    out_l[-1] = lo[i]
        volume += v[i] or 0
    if current_key is not None:
        out_v.append(volume)
    out = {"t": out_t, "c": out_c, "v": out_v}
    if ohlc:
        out.update({"o": out_o, "h": out_h, "l": out_l})
    return out


def slice_since(history: dict, start_iso: str) -> dict:
    t = history.get("t", [])
    index = next((i for i, day in enumerate(t) if day >= start_iso), len(t))
    return {k: (v[index:] if isinstance(v, list) and len(v) == len(t) else v) for k, v in history.items()}


def latest_close(history: dict) -> Optional[float]:
    closes = history.get("c") or []
    return closes[-1] if closes else None
