"""The Chart patterns group (task #64): the nightly run of the eleven scans (finlit/pattern_scans.py) on each company's daily candles, what the page says about a hit
(worded facts and the drawing, never a rule), and the freshness rule (a company whose candles end before the latest close is left out and the page says so).

pandas and numpy are imported only inside the nightly run, so the website process never loads them. The result is kept in preset_meta('patterns'); the screens
read it from there, so a screen answers at once and never waits for a scan."""
from __future__ import annotations

import json
import logging
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from . import candles as candles_mod

log = logging.getLogger("finlit.patterns")
LIQUID_FLOOR_CR = 1000.0         # market value: below this the scans are not run at all (thinly traded)
META_KEY = "patterns"
MIN_COVERAGE = 0.98             # the share of the scanned companies whose candles reach the close: below it the run stops instead of publishing thin lists
SUSPENDED_DAYS = 45             # candles that end this many days before the close belong to a suspended or delisted company: it leaves the scan universe

SCAN_IDS = ["daily_base", "weekly_base", "near_pivot", "vcp", "tight_range", "flag", "ema50_pullback", "rs_before_price", "ipo_base", "big_reversal", "shakeout"]
NAMES = {"daily_base": "Daily base", "weekly_base": "Weekly base", "near_pivot": "Near pivot", "vcp": "Volatility contraction (VCP)", "tight_range": "Tight range", "flag": "Flag",
         "ema50_pullback": "50-day EMA pullback", "rs_before_price": "New RS high before price", "ipo_base": "IPO base", "big_reversal": "Big reversal", "shakeout": "Shakeout"}
TEXTS = {
    "daily_base": "A young base on the daily chart. The price is back near the top of the base and has not closed above it.",
    "weekly_base": "The same on the weekly chart: a longer base, with the price back near its top.",
    "near_pivot": "In an uptrend, the price sits just under a recent high that has held. How close counts depends on how much the stock usually moves in a day.",
    "vcp": "In a strong uptrend, each pullback is smaller than the one before, tightening under a high, while trading volume dries up.",
    "tight_range": "In an uptrend, the price is moving in a very narrow band: a few closes very close together, or a narrow high-to-low range.",
    "flag": "A sharp run up, then a short, orderly pause that gives back only part of it, on lighter volume.",
    "ema50_pullback": "A stock in a strong uptrend resting on its 50-day EMA after a quiet spell.",
    "rs_before_price": "The stock's strength line against the market made a new high while the price is still under its own high.",
    "ipo_base": "A recent listing, still inside its first base and sitting near the top of it.",
    "big_reversal": "After a clear fall, one strong up day on heavy volume that closed near its high.",
    "shakeout": "In an uptrend, a quick drop below the 50-day average that was bought back soon after. The trend is still in place.",
}
# the three facts each scan shows as its own columns (label, value) in this order
FACT_LABELS = {
    "daily_base": ("Base age", "Depth", "Below the pivot"), "weekly_base": ("Base age", "Depth", "Below the pivot"), "near_pivot": ("Pivot set", "Below the pivot", "Away, in usual daily moves"),
    "vcp": ("Pullbacks", "Below the pivot", "Pattern age"), "tight_range": ("Kind", "Range", ""), "flag": ("Run-up", "Gave back", "Below the pivot"),
    "ema50_pullback": ("From the 50-day EMA", "Below its 3-month high", "Volume"), "rs_before_price": ("Strength line", "Price below its high", "Gap to the high"),
    "ipo_base": ("Listed", "Base depth", "Below the pivot"), "big_reversal": ("When", "Day's gain", "Volume"), "shakeout": ("Low was", "Drop below", "Up from the low"),
}


def _pct(v: Optional[float], sign: bool = False) -> Optional[str]:
    return None if v is None else f"{v:+.1f}%" if sign else f"{v:.1f}%"


def _sessions(n: Optional[int]) -> Optional[str]:
    return None if n is None else f"{n} session{'' if n == 1 else 's'}"


def facts_of(scan: str, h: Dict[str, Any]) -> List[List[Optional[str]]]:
    """[[label, worded value], ...] for one hit (a hit is the dict stored by the nightly run). A fact with no value is left out, never guessed."""
    d = h.get("detail") or {}
    to, depth, ln = h.get("to_pivot_pct"), h.get("depth_pct"), h.get("length")
    vals: Dict[str, Tuple[Optional[str], ...]] = {
        "daily_base": (_sessions(ln), _pct(depth), _pct(to)),
        "weekly_base": (None if ln is None else f"{ln} weeks", _pct(depth), _pct(to)),
        "near_pivot": (_sessions(ln), _pct(to), None if d.get("atr_away") is None else f"{d['atr_away']:.1f}x"),
        "vcp": (None if not d.get("pullbacks") else " · ".join(f"{x:.0f}%" for x in d["pullbacks"]), _pct(to), _sessions(ln)),
        "tight_range": ({"closes": "Tight closes", "range": "Narrow range"}.get(str(d.get("kind")), str(d.get("kind") or "") or None), _pct(depth), None),
        "flag": (_pct(d.get("pole_rise")), None if d.get("gave_back") is None else f"{d['gave_back']:.0f}%", _pct(to)),
        "ema50_pullback": (_pct(d.get("vs_ema50"), True), _pct(depth), None),
        "rs_before_price": ("New high", _pct(d.get("price_below_high")), _pct(to)),
        "ipo_base": (None if d.get("days_listed") is None else f"{d['days_listed']} days ago", _pct(depth), _pct(to)),
        "big_reversal": (None if ln is None else ("Today" if ln == 0 else f"{ln} session{'' if ln == 1 else 's'} ago"), _pct(d.get("day_change"), True), None if d.get("volume_x") is None else f"{d['volume_x']:.1f}x usual"),
        "shakeout": (None if ln is None else ("Today" if ln == 0 else f"{ln} session{'' if ln == 1 else 's'} ago"), _pct(depth), _pct(d.get("recovered_from_low"), True)),
    }[scan]
    labels = FACT_LABELS[scan]
    out = [[labels[i], vals[i]] for i in range(3) if labels[i] and vals[i] is not None]
    return out


def _dated(draw: Dict[str, Any], dates: List[str]) -> Dict[str, Any]:
    """The drawing with candle numbers turned into dates, so the chart panel can place it on any range."""
    def d(i: Any) -> Optional[str]:
        return dates[int(i)] if isinstance(i, (int, float)) and 0 <= int(i) < len(dates) else None
    out: Dict[str, Any] = {}
    for k, v in draw.items():
        if k == "box" and len(v) == 4:
            out[k] = {"from": d(v[0]), "to": d(v[1]), "low": v[2], "high": v[3]}
        elif k == "pole" and len(v) == 4:
            out[k] = {"from": d(v[0]), "low": v[1], "to": d(v[2]), "high": v[3]}
        elif k == "swings":
            out[k] = [{"date": d(i), "price": p, "kind": kind} for i, p, kind in v]
        elif k == "from":
            out[k] = d(v)
        elif k == "bar":
            out[k] = d(v)
        else:
            out[k] = v
    return out


def _bench(raw: Any):
    """NIFTY 500 closes as a pandas Series from the saved index history (the rows the index route keeps), or None."""
    import pandas as pd
    rows = (raw or {}).get("rows") if isinstance(raw, dict) else raw
    pts = [(str((r or {}).get("quote_date") or "")[:10], (r or {}).get("close_price")) for r in rows or []]
    pts = [(pd.Timestamp(a), float(b)) for a, b in pts if len(a) == 10 and b not in (None, "")]
    return pd.Series({a: b for a, b in sorted(pts)}) if len(pts) > 60 else None


async def candle_coverage(store, table, expected_day: date) -> Dict[str, Any]:
    """How many of the companies the scans cover already have the close's candle. Suspended and delisted companies (candles ending long before) are not counted: they have left the
    universe. {"fresh", "universe", "suspended", "ratio"}."""
    mc = table.cols["market_cap"]
    fresh = universe = suspended = 0
    for i, sym in enumerate(table.symbols):
        if not table.full[i] or mc[i] != mc[i] or mc[i] < LIQUID_FLOOR_CR:
            continue
        try:
            t = (await candles_mod.series(store, sym)).get("t") or []      # the stored one-year prices, or the fresher Dhan candles the technicals job keeps
            if len(t) < 25:
                continue
            last = date.fromisoformat(str(t[-1])[:10])
        except Exception:
            continue
        if (expected_day - last).days > SUSPENDED_DAYS:
            suspended += 1
            continue
        universe += 1
        fresh += 1 if last >= expected_day else 0
    return {"fresh": fresh, "universe": universe, "suspended": suspended, "ratio": (fresh / universe) if universe else 1.0}      # no company to scan: nothing is thin, the run just finds nothing


async def wait_for_candles(store, table, expected_day: date, max_wait_s: int = 1800, step_s: int = 120, sleep=None) -> Dict[str, Any]:
    """The pattern run waits for the candle refresh of the whole universe: it looks again every `step_s` seconds, up to `max_wait_s`, until at least 98% of the companies have the close's
    candle. Returns the last coverage seen (the caller stops and alerts when it is still below 98%)."""
    import asyncio
    sleep = sleep or asyncio.sleep
    waited = 0
    while True:
        cov = await candle_coverage(store, table, expected_day)
        if cov["ratio"] >= MIN_COVERAGE or waited >= max_wait_s:
            return {**cov, "waited": waited}
        log.info("pattern scans waiting for candles: %s of %s have the %s close", cov["fresh"], cov["universe"], expected_day)
        await sleep(step_s)
        waited += step_s


async def scan_all(store, table, expected_day: date) -> Dict[str, Any]:
    """Run the scans for every company of Rs 1,000 Cr or more that has a stored report. Returns {as_of, scans: {scan: {symbol: hit}}, left_out: {scan: [[symbol, reason]]}, checked}."""
    import pandas as pd
    from ..pattern_scans import scan_stock
    mc = table.cols["market_cap"]
    bench = None
    try:
        raw = await store.redis.get("idx:px:NIF500")
        bench = _bench(json.loads(raw)["v"]) if raw else None
    except Exception:
        log.warning("NIFTY 500 history not read: the relative-strength scan is skipped tonight", exc_info=True)
    scans: Dict[str, Dict[str, Any]] = {k: {} for k in SCAN_IDS}
    stale: List[List[str]] = []
    checked = suspended = 0
    for i, sym in enumerate(table.symbols):
        if not table.full[i] or mc[i] != mc[i] or mc[i] < LIQUID_FLOOR_CR:
            continue
        try:
            s = await candles_mod.series(store, sym)                         # the same series the coverage gate counted
            t, c = s.get("t") or [], s.get("c") or []
            if len(t) < 25 or len(c) != len(t):
                continue
            o, h, l, v = (s.get(k) or c for k in ("o", "h", "l", "v"))
            df = pd.DataFrame({"date": pd.to_datetime(t), "open": o, "high": h, "low": l, "close": c, "volume": [x if x is not None else 0 for x in v]}).dropna(subset=["open", "high", "low", "close"])
            if len(df) < 25:
                continue
            last = df["date"].iloc[-1].date()
            if (expected_day - last).days > SUSPENDED_DAYS:
                suspended += 1                  # suspended or delisted: out of the scan universe, not "left out"
                continue
            if last < expected_day:
                stale.append([sym, f"candles end {last.strftime('%d %b').lstrip('0')}, before the {expected_day.strftime('%d %b').lstrip('0')} close"])
                continue
            checked += 1
            listed = df["date"].iloc[0].date() if len(df) < 240 else None
            dates = [d.date().isoformat() for d in df["date"]]
            for hit_ in scan_stock(df, bench, listed):
                rec = {"pivot": hit_.pivot, "to_pivot_pct": hit_.to_pivot_pct, "depth_pct": hit_.depth_pct, "length": hit_.length, "detail": hit_.detail, "draw": _dated(hit_.draw, dates), "last": dates[-1]}
                rec["facts"] = facts_of(hit_.scan, rec)
                scans[hit_.scan][sym] = rec
        except Exception:
            log.warning("pattern scan skipped for %s", sym, exc_info=True)
    if stale:
        log.info("pattern scans: %d companies left out (candles behind the close): %s", len(stale), stale[:50])      # the list stays in the log; the page gets a count
    return {"as_of": expected_day.isoformat(), "scans": scans, "left_out": stale, "checked": checked, "suspended": suspended, "bench": bench is not None}


async def save(store, result: Dict[str, Any], previous: Optional[Dict[str, Any]]) -> None:
    """Keeps tonight's result; a company is "new today" when it was not on the same scan at the previous run."""
    prev = (previous or {}).get("scans") or {}
    for scan, by_sym in result["scans"].items():
        before = set((prev.get(scan) or {}).keys())
        for sym, rec in by_sym.items():
            rec["new"] = bool(before) and sym not in before
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO preset_meta (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value=$2::jsonb, updated_at=now()", META_KEY, json.dumps(result))


async def load(store) -> Optional[Dict[str, Any]]:
    try:
        async with store.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT value FROM preset_meta WHERE key = $1", META_KEY)
    except Exception:
        return None
    if not row:
        return None
    v = row["value"]
    return json.loads(v) if isinstance(v, str) else v
