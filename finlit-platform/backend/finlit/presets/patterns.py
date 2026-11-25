"""The Chart patterns group (task #64): the nightly run of the twelve scans (engine 2, finlit/pattern_engine.py; task #325) on each company's daily candles, what the page says about a hit
(worded facts and the drawing, never a rule), and the freshness rule (a company whose candles end before the latest close is left out and the page says so).

pandas and numpy are imported only inside the nightly run, so the website process never loads them. The result is kept in preset_meta('patterns'); the screens
read it from there, so a screen answers at once and never waits for a scan."""
from __future__ import annotations

import json
import re
import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from . import candles as candles_mod

log = logging.getLogger("finlit.patterns")
LIQUID_FLOOR_CR = 1000.0         # market value: below this the scans are not run at all (thinly traded)
META_KEY = "patterns"
MIN_COVERAGE = 0.98             # the share of the scanned companies whose candles reach the close: below it the run stops instead of publishing thin lists
SUSPENDED_DAYS = 45             # candles that end this many days before the close belong to a suspended or delisted company: it leaves the scan universe
YEAR_DAYS = 366                 # the daily bars the scans read: one year, as the stored one-year prices (snapshot.PRICE_RANGES["1Y"])

# Task #325 (developer file 26, 22 Nov 2026): engine 2 (finlit/pattern_engine.py). Twelve scans (Fresh close above a base is new; the pack called it "Fresh breakout", renamed because "breakout" stays out of what readers see, task #64); names, card lines and
# "How this screen works" are the pack's pattern-text.json, word for word.
SCAN_IDS = ["daily_base", "weekly_base", "near_pivot", "vcp", "tight_range", "flag", "ema50_pullback", "rs_before_price", "ipo_base", "big_reversal", "shakeout", "fresh_breakout"]
NAMES = {
 "daily_base": "Daily base",
 "weekly_base": "Weekly base",
 "near_pivot": "Near pivot",
 "vcp": "Volatility contraction (VCP)",
 "tight_range": "Tight range",
 "flag": "Flag",
 "ema50_pullback": "50-day EMA pullback",
 "rs_before_price": "New RS high before price",
 "ipo_base": "IPO base",
 "big_reversal": "Big reversal",
 "shakeout": "Shakeout",
 "fresh_breakout": "Fresh close above a base"
}
TEXTS = {
 "daily_base": "Back under a level that stopped a rally one to four months ago, and not yet through it.",
 "weekly_base": "The same on the weekly chart: a level four to eighteen months old that is the top of the last two years, with the price back under it.",
 "near_pivot": "Right under a level that has held: no more than one usual daily range below it.",
 "vcp": "In an uptrend, each pullback under a high is clearly smaller than the one before, on higher lows, while volume dries up.",
 "tight_range": "After a 3-month gain, the last few sessions fit inside about one usual daily range.",
 "flag": "A sharp run (the pole), then a short pause that drifts sideways or down on lighter volume and gives back little.",
 "ema50_pullback": "An established uptrend that has drifted back to its 50-day average and gone quiet.",
 "rs_before_price": "The stock’s strength line against the market made a new high this week while the price is still under its own high.",
 "ipo_base": "A listing of the last few months, still inside its first base and within 8% of its top.",
 "big_reversal": "After a clear fall, one very large up day on heavy volume that closed near its high, in the last five sessions.",
 "shakeout": "In an uptrend, a sharp drop that was taken straight back: the close is above where the drop began.",
 "fresh_breakout": "Closed above a base level in the last five sessions on heavy volume, and is still close to it."
}
HOW = {
 "daily_base": [
  "A swing high 20 to 90 sessions old that ended a rally of 20% or more. The price has not closed above it since and has tested it no more than three times.",
  "The price is now within three of its usual daily ranges of that level. The base under it is no deeper than 35%, and shallower for a quiet stock.",
  "Status reads \"At the level\" inside one daily range, \"Forming\" outside it."
 ],
 "weekly_base": [
  "A weekly swing high 17 to 78 weeks old that ended a rally of 20% or more, never closed above since, tested no more than three times.",
  "The level is within 8% of the highest price of the last two years, so a base under an older, higher top is left out.",
  "The price is above its 40-week average and within three daily ranges of the level; the base is no deeper than 45%."
 ],
 "near_pivot": [
  "A level 15 to 170 sessions old that ended a rally of 20% or more and has not been closed above.",
  "The price is within one of the stock’s own daily ranges of it, so a stock that moves 2% a day must be within 2%, one that moves 5% within 5%.",
  "The price is above its 50-day and 200-day averages."
 ],
 "vcp": [
  "The uptrend is read on weekly prices: above the 30-week average, that above a rising 40-week average, well off the 52-week low and within 25% of the 52-week high.",
  "Since a high made 10 to 65 sessions ago there are two or three pullbacks, each no more than three quarters of the one before and each low higher than the last. The latest is no deeper than three usual daily ranges.",
  "The price is within 8% of the high and volume over the last 10 sessions is under 80% of its 50-session average."
 ],
 "tight_range": [
  "The 20-day average is above the 50-day, which is above the 200-day; the stock is up 15% or more over three months and within 8% of its 20-day average.",
  "The last 4 to 10 sessions fit in a box about as tall as one or two usual daily ranges, or the last five closes sit within half a daily range of each other."
 ],
 "flag": [
  "A pole of 18% or more, or five usual daily ranges if that is larger, in 15 sessions or fewer, that started near the 50-day average, carried the price 3% or more above its 3-month high, and ended 4 to 15 sessions ago.",
  "Since then the price has given back no more than 40% of the pole, its highs slope flat or gently down, and volume is at least 15% lighter than on the pole. The price is above its 20-day average.",
  "The 20-day average is above the 50-day, which is above the 200-day. The pole and the two lines of the flag are drawn on the chart."
 ],
 "ema50_pullback": [
  "Within 3% of the 50-day EMA, which is rising and above the 200-day average.",
  "Up 30% or more over six months, no more than 5% over the last month, and 30% or more above the 52-week low."
 ],
 "rs_before_price": [
  "The strength line is the price divided by the Nifty MidSmallcap 400 (or the Nifty 500). It made its highest value of 60 sessions in the last three sessions.",
  "The price is at least 1% under a 60-session high made 10 or more sessions ago, and above its 50-day average."
 ],
 "ipo_base": [
  "The level is the listing-day high if the second day stayed under it; otherwise the first swing high above it.",
  "No close above the level yet, a base no deeper than 35% and no older than six months. A listing needs eight sessions of prices to be read."
 ],
 "big_reversal": [
  "Before the day the stock was under a 50-day average that is under the 200-day, and 20% or more below its 6-month high.",
  "The day closed up by 7% or more and by at least two and a half usual daily ranges, on two and a half times its 20-day volume, in the top 30% of the day’s range. The price has not gone back under that day’s low."
 ],
 "shakeout": [
  "The price fell by at least one usual daily range from the previous close, and closed back above that close the same day or within three sessions, in the last five sessions.",
  "The stock is above a rising 50-day average that is above the 200-day, and was within 15% of its 6-month high before the drop.",
  "A company leaves the list if it closes under the low of the drop. \"Went under\" says whether the low broke the 20-day or 50-day average."
 ],
 "fresh_breakout": [
  "The same kind of level as Daily base and Near pivot.",
  "The close above it came on one and a half times the 50-day volume, in the upper half of the day’s range. The price is still within two daily ranges above the level and has not closed back under it."
 ]
}
# The four figures each screen shows as its own columns, in this order; every figure of a hit (six to eight) is in the chart panel. Status and How clean
# follow them. Figures arrive as numbers (FACT_FORMAT) so they sort as numbers (file 25, 3 row 4).
FACT_LABELS = {
 "daily_base": [
  "Level (Rs)",
  "Below the level",
  "In daily ranges",
  "Level age"
 ],
 "weekly_base": [
  "Level (Rs)",
  "Below the level",
  "In daily ranges",
  "Level age"
 ],
 "near_pivot": [
  "Level (Rs)",
  "Below the level",
  "In daily ranges",
  "Level age"
 ],
 "vcp": [
  "Pullbacks",
  "Pivot (Rs)",
  "Below the pivot",
  "Volume, last 10 against 50"
 ],
 "tight_range": [
  "Sessions in the range",
  "Range",
  "Range in daily ranges",
  "3-month gain"
 ],
 "flag": [
  "Pole gain",
  "Given back",
  "Flag length",
  "To the upper line"
 ],
 "ema50_pullback": [
  "From the 50-day EMA",
  "6-month gain",
  "1-month change",
  "Volume, last 5 against 50"
 ],
 "rs_before_price": [
  "Strength line",
  "Price below its high",
  "Price high was",
  "Strength rank"
 ],
 "ipo_base": [
  "Listed",
  "Level (Rs)",
  "Below the level",
  "Base depth"
 ],
 "big_reversal": [
  "When",
  "Day's close against the day before",
  "Volume against its 20-day average",
  "Since that close"
 ],
 "shakeout": [
  "Low was",
  "Fall to the low",
  "Went under",
  "Taken back"
 ],
 "fresh_breakout": [
  "When",
  "Closed above",
  "Volume that day against 50-day",
  "Now above the level"
 ]
}
FACT_FORMAT = {
 "Level (Rs)": "num2", "Pivot (Rs)": "num2", "Closed above": "num2",
 "Below the level": "pct_down", "Below the pivot": "pct_down", "Price below its high": "pct_down",
 "In daily ranges": "num1", "Range in daily ranges": "num1", "Strength rank": "num0",
 "Level age": "num0", "Flag length": "num0", "Sessions in the range": "num0", "Price high was": "num0",
 "Range": "pctu", "Base depth": "pctu", "Pole gain": "pctu", "Given back": "pctu", "3-month gain": "pctu", "6-month gain": "pctu", "Fall to the low": "pctu", "Now above the level": "pctu", "To the upper line": "pct",
 "From the 50-day EMA": "pct", "1-month change": "pct", "Day's close against the day before": "pct", "Since that close": "pct",
 "Volume, last 10 against 50": "times", "Volume, last 5 against 50": "times", "Volume against its 20-day average": "times", "Volume that day against 50-day": "times",
 "Listed": "date",
}



_NUM = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?")


def number_of(label: str, v: Any) -> Any:
    """A figure as a number, so the column sorts as numbers (file 25, 3 row 4): "1.8%" 1.8, "89 sessions" 89, "0.50x" 0.5, "Rs 141.20" 141.2. Text figures
    (Kind, Went under, When, ...) and dates stay as they are."""
    fmt = FACT_FORMAT.get(label)
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, (int, float)):
        return float(v) if fmt else v
    if fmt in (None, "date"):
        return v
    m = _NUM.search(str(v).replace("\u2212", "-"))
    return float(m.group().replace(",", "")) if m else None


def worded(v: Any) -> Optional[str]:
    """A figure as the chart panel prints it."""
    if v is None:
        return None
    if isinstance(v, float):
        return f"{v:,.2f}" if abs(v) >= 100 else f"{v:g}"
    return str(v)


def draw_of(d: Dict[str, Any], s: Any) -> Dict[str, Any]:
    """Engine 2's drawing (level, zone, lines, marks, ma) in the shape the chart panel and the chart cards place: level + from, box, pole, swings, lines, ema.
    Dates are ISO days already."""
    out: Dict[str, Any] = {}
    if d.get("level"):
        dt, price, label = d["level"]
        out.update(level=price, **{"from": dt}, levelLabel=label)
    if d.get("zone"):
        a, b, lo, hi = d["zone"]
        out["box"] = {"from": a, "to": b, "low": lo, "high": hi}
    if d.get("marks"):
        out["swings"] = [{"date": m[0], "price": m[1], "kind": m[2]} for m in d["marks"]]
    for ln in d.get("lines") or []:
        if ln[4] == "pole":
            out["pole"] = {"from": ln[0], "low": ln[1], "to": ln[2], "high": ln[3]}
        else:
            out.setdefault("lines", []).append({"from": ln[0], "a": ln[1], "to": ln[2], "b": ln[3], "kind": ln[4]})
    if d.get("ma") == "e50":
        out["ema"] = round(float(s.e50[-1]), 2)
    elif d.get("ma") == "s50":
        out["sma50"] = round(float(s.s50[-1]), 2)
    return out


def inr(v: Any) -> Optional[str]:
    """Rupees with Indian commas and two decimals: 11353 -> "₹11,353.00", 123456.7 -> "₹1,23,456.70" (task #394, C6)."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:
        return None
    sign, f = ("-" if f < 0 else ""), abs(f)
    whole, frac = f"{f:.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups: List[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        whole = ",".join(([head] if head else []) + groups + [tail])
    return f"{sign}₹{whole}.{frac}"


def _day_words(iso: str, list_iso: str) -> str:
    """'19 Nov', with the year when it is not the list's own year."""
    d, ref = date.fromisoformat(str(iso)[:10]), date.fromisoformat(str(list_iso)[:10])
    return f"{d.day} {d.strftime('%b')}" + ("" if d.year == ref.year else f" {d.year}")


def _before_list(n: int, unit: str = "session") -> str:
    return "the list day" if n <= 0 else f"{n} {unit}{'s' if n != 1 else ''} before the list"


def _index_of(days: Any, iso: Any) -> Optional[int]:
    if not iso:
        return None
    try:
        return [str(x)[:10] for x in days].index(str(iso)[:10])
    except ValueError:
        return None


def _times(v: Any, base: str) -> Any:
    """'0.24x' -> '0.24× its 50-day average' (C6)."""
    t = str(v)
    if v is None or t.startswith("nan"):
        return None
    return f"{t[:-1] if t.endswith('x') else t}× its {base} average"


def plain_facts(pattern: Optional[str], facts: Dict[str, Any], draw: Dict[str, Any], s: Any) -> List[List[Any]]:
    """What the chart shows, in plain words (developer file 37, C6), worked out on the series the scan ran on, which ends on the list's own close (F5):
    the distance from the level from that close, the close above and the level counted in sessions to the list day, money as rupees with Indian
    commas. The list's own columns keep the engine's labels and numbers (pack section 0); only this box reads differently."""
    days = [str(x)[:10] for x in (getattr(s, "d", None) if getattr(s, "d", None) is not None else [])]
    list_iso = days[-1] if days else None
    last = float(getattr(s, "last", float("nan")))
    lv = draw.get("level")
    lvl = float(lv[1]) if isinstance(lv, (list, tuple)) and len(lv) > 1 and lv[1] is not None else None
    lvl_day = str(lv[0])[:10] if isinstance(lv, (list, tuple)) and lv and lv[0] else None
    marks = {m[2]: m for m in draw.get("marks") or [] if isinstance(m, (list, tuple)) and len(m) >= 3}
    out: List[List[Any]] = []
    for k, v in facts.items():
        if k in ("Level (Rs)", "Closed above") and (lvl is not None or k == "Level (Rs)"):
            out.append(["Level", inr(lvl if lvl is not None else number_of(k, v))])
        elif k.endswith(" (Rs)"):
            out.append([k[:-5], inr(number_of(k, v))])
        elif k == "When" and list_iso:
            mark = marks.get("Close above") or marks.get("Reversal day")
            i = _index_of(days, mark[0]) if mark else None
            label = "Closed above it on" if "Close above" in marks else "Reversal day"
            out.append([label, f"{_day_words(mark[0], list_iso)} · {_before_list(len(days) - 1 - i)}" if mark and i is not None else worded(v)])
        elif k in ("Below the level", "Now above the level") and lvl and last == last:
            pos = (last / lvl - 1) * 100
            if k == "Now above the level":
                out.append(["Now above the level" if pos >= 0 else "Now under the level", f"{abs(pos):.1f}%"])
            else:
                out.append(["Below the level" if pos <= 0 else "Above the level", f"{abs(pos):.1f}%"])
        elif k == "In daily ranges":
            out.append(["In usual daily moves", worded(v)])
        elif k == "Level age" and lvl_day and list_iso:
            if pattern == "fresh_breakout" and "Close above" in marks:
                a, b = _index_of(days, lvl_day), _index_of(days, marks["Close above"][0])
                n = (b - a) if a is not None and b is not None else int(number_of(k, v) or 0)
                out.append(["Level set on", f"{_day_words(lvl_day, list_iso)} · {n} session{'s' if n != 1 else ''} before the close above"])
            elif pattern == "weekly_base":
                out.append(["Level set on", f"the week to {_day_words(lvl_day, list_iso)} · {_before_list(int(number_of(k, v) or 0), 'week')}"])
            else:
                a = _index_of(days, lvl_day)
                out.append(["Level set on", f"{_day_words(lvl_day, list_iso)} · {_before_list(len(days) - 1 - a if a is not None else int(number_of(k, v) or 0))}"])
        elif k == "Base depth":
            out.append(["Base, top to bottom", worded(v)])
        elif k == "Rally before it":
            out.append(["Rise before the level", worded(v)])
        elif k == "Times tested":
            out.append(["Times the level was tested", worded(v)])
        elif k == "Volume that day against 50-day":
            out.append(["Volume that day", _times(v, "50-day")])
        elif k == "Volume against its 20-day average":
            out.append(["Volume that day", _times(v, "20-day")])
        elif k in ("Volume, last 10 against 50", "Volume, last 5 against 50"):
            out.append([f"Volume, last {k.split()[2]} days", _times(v, "50-day")])
        else:
            out.append([k, worded(v)])
    return out


# F4 (developer file 37): the rule a list states, checked again on the list's own close. Lists built on an older close showed Trent and Axis Bank on
# Fresh close above a base under their level, and Dr Lal PathLabs and Sudeep Pharma on Near pivot above theirs.
UNDER_LEVEL = {"near_pivot": "lt", "daily_base": "le", "weekly_base": "le", "ipo_base": "le"}
ABOVE_LEVEL = {"fresh_breakout"}


def rule_holds(pattern: Optional[str], h: Dict[str, Any], close: Optional[float]) -> bool:
    """Whether a hit still meets its list's rule at the list day's close: Near pivot under its level, the bases not above it, Fresh close above a base at
    or above it. The other lists have no level rule to check here."""
    lv = (h.get("draw") or {}).get("level")
    lvl = lv[1] if isinstance(lv, (list, tuple)) and len(lv) > 1 else None
    if lvl is None or close is None or close != close:
        return True
    if pattern in ABOVE_LEVEL:
        return close >= lvl
    rule = UNDER_LEVEL.get(pattern or "")
    return close < lvl if rule == "lt" else close <= lvl if rule == "le" else True


def record_of(h: Dict[str, Any], s: Any) -> Dict[str, Any]:
    """What the screens keep for one hit: every figure worded for the panel in plain words (C6), the figures as numbers for the columns (the engine's
    labels), the status, How clean, the order key (the quality, never shown), the strength rank, the drawing, and the list day's close the figures are
    worked out from with the close before it (F3, F5: the row shows that price and that day change)."""
    f = h.get("facts") or {}
    c = getattr(s, "c", None)
    close = float(c[-1]) if c is not None and len(c) else None
    prev = float(c[-2]) if c is not None and len(c) > 1 else None
    return {"facts": plain_facts(h.get("pattern"), f, h.get("draw") or {}, s), "nums": {k: number_of(k, v) for k, v in f.items()},
            "status": h.get("status") or None, "clean": h.get("clean"), "q": h.get("q"), "rs": h.get("rs"),
            "draw": draw_of(h.get("draw") or {}, s), "last": str(s.d[-1])[:10], "close": round(close, 2) if close is not None else None,
            "prev": round(prev, 2) if prev is not None else None, "prevDay": str(s.d[-2])[:10] if len(s.d) > 1 else None}


async def _bench_map(store, code: str) -> Optional[Dict[str, float]]:
    """{ISO day: close} of an index from the saved copy the site keeps (`idx:px:<code>`), or None."""
    try:
        raw = await store.redis.get(f"idx:px:{code}")
        rows = (json.loads(raw)["v"] or {}).get("rows") if raw else None
    except Exception:
        return None
    pts = {str((r or {}).get("quote_date") or "")[:10]: (r or {}).get("close_price") for r in rows or []}
    pts = {k: float(v) for k, v in pts.items() if len(k) == 10 and v not in (None, "")}
    return pts if len(pts) > 60 else None


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


# How long the pattern run waits for the candle refresh. It must stay well inside the presets job's time limit (registry.py): on 13 Nov 2026 a 30-minute wait
# inside a 20-minute job made every run time out before a single list was stored. After this wait the screens are built anyway and the last pattern run stays.
CANDLE_WAIT_S = 600


async def wait_for_candles(store, table, expected_day: date, max_wait_s: int = CANDLE_WAIT_S, step_s: int = 120, sleep=None) -> Dict[str, Any]:
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


TOP_UP_S = 480          # the time the presets job spends fetching the missing companies' candles from Dhan (inside its 40-minute limit, before the wait above)


async def behind(store, table, expected_day: date) -> List[str]:
    """The scanned companies whose daily series ends before the close (the same universe and series `candle_coverage` counts; suspended companies are not included)."""
    mc = table.cols["market_cap"]
    out: List[str] = []
    for i, sym in enumerate(table.symbols):
        if not table.full[i] or mc[i] != mc[i] or mc[i] < LIQUID_FLOOR_CR:
            continue
        try:
            t = (await candles_mod.series(store, sym)).get("t") or []
            if len(t) < 25:
                continue
            last = date.fromisoformat(str(t[-1])[:10])
        except Exception:
            continue
        if last < expected_day and (expected_day - last).days <= SUSPENDED_DAYS:
            out.append(sym)
    return out


async def top_up_candles(store, settings, table, expected_day: date, budget_s: float = TOP_UP_S, fetch=None, clock=None) -> Dict[str, Any]:
    """Fetch the Dhan daily candles of the scanned companies that lack the close and keep them for the scans, the way the technicals job does for companies with a
    Prism report. 14 Nov 2026: about 100 of the 1,400 scanned companies have no Prism report, so their candles moved only when the ingest job reloaded them; with ingest
    behind, the scans were held back every run (1296/1400 = 92.6% against the 98% needed). Stops at `budget_s`; what is left is counted, never guessed."""
    import time
    from types import SimpleNamespace
    clock = clock or time.monotonic
    todo = await behind(store, table, expected_day)
    got = failed = 0
    if fetch is None:
        if settings is None:
            return {"candlesBehind": len(todo), "candlesFetched": 0, "candlesNotFetched": len(todo)}
        from ..prism_candles import pattern_candles
        state = SimpleNamespace(store=store, settings=settings)

        async def fetch(sym):          # the scans' own minimum (25 sessions), not the Prism view's year: most lagging companies are recent listings
            rows = await pattern_candles(state, sym)
            return {"stock": {"candles": rows}} if rows else None
    start = clock()
    done = 0
    for sym in todo:
        if clock() - start > budget_s:
            break
        done += 1
        try:
            c = await fetch(sym)
            rows = ((c or {}).get("stock") or {}).get("candles") or []
            ok = bool(rows) and str(rows[-1][0])[:10] >= expected_day.isoformat() and await candles_mod.save(store.redis, sym, rows)
        except Exception:
            log.warning("pattern scans: Dhan candles of %s not fetched", sym, exc_info=True)
            ok = False
        got += 1 if ok else 0
        failed += 0 if ok else 1
    return {"candlesBehind": len(todo), "candlesFetched": got, "candlesNotFetched": failed + (len(todo) - done)}


async def scan_all(store, table, expected_day: date) -> Dict[str, Any]:
    """Engine 2 (task #325, developer file 26) for every company of Rs 1,000 Cr or more with a stored report. Returns {as_of, scans: {scan: {symbol: record}},
    left_out: [[symbol, reason]], checked, suspended, bench, engine}.

    Daily bars: the series the coverage gate counted (stored prices, or the fresher Dhan candles the technicals job keeps). Weekly bars for Weekly base and VCP:
    three years from `daily_candles` (task #325 A) where it holds them, else built from the daily series. Liquidity floor: Rs 5 Cr a day over 20 sessions and
    a price of Rs 20 or more; a listing with too few sessions for the averages goes to IPO base alone."""
    import numpy as np
    from .. import pattern_engine as pe
    mc = table.cols["market_cap"]
    tv = table.cols.get("turnover20_cr") if hasattr(table.cols, "get") else None      # the screens' own value traded a day (NSE-sized), when the table has it
    benches = [(name, m) for name, m in [("Nifty MidSmallcap 400", await _bench_map(store, "NIFMID400")), ("Nifty 500", await _bench_map(store, "NIF500"))] if m]
    scans: Dict[str, Dict[str, Any]] = {k: {} for k in SCAN_IDS}
    stale: List[List[str]] = []
    rule_off: List[List[str]] = []
    series: Dict[str, Any] = {}
    young: Dict[str, Any] = {}
    checked = suspended = 0
    cands = [(i, sym) for i, sym in enumerate(table.symbols) if table.full[i] and mc[i] == mc[i] and mc[i] >= LIQUID_FLOOR_CR]
    try:        # the exchange candles the charts are written from (price_sections.py), in one query; three years, for the weekly bars too
        from .. import candles as exch
        long = await exch.bulk(store, [sym for _, sym in cands], 1150)
    except Exception:
        long = {}
    exp_iso = expected_day.isoformat()
    year_ago = (expected_day - timedelta(days=YEAR_DAYS)).isoformat()
    for i, sym in cands:
        try:
            ex = long.get(sym)
            # Task #394 (developer file 37, F4, F5): the daily bars are the company's chart candles when it has them, so the list, its figures and the
            # chart read one close; else the series the coverage gate counted (stored prices, or the fresher Dhan candles the technicals job keeps).
            # Never a bar after the list's day: the figures are those of the list's own close.
            sr = ex if ex and ex.get("t") else await candles_mod.series(store, sym)
            t, c = sr.get("t") or [], sr.get("c") or []
            if len(t) < 8 or len(c) != len(t):
                continue
            o, h, lo, v = (sr.get(k) or c for k in ("o", "h", "l", "v"))
            from_ = year_ago if sr is ex else ""         # the chart candles reach three years back: the scans read one year, as the stored series
            rows = [(str(t[k])[:10], o[k], h[k], lo[k], c[k], v[k]) for k in range(len(t))
                    if from_ <= str(t[k])[:10] <= exp_iso
                    and None not in (o[k], h[k], lo[k], c[k]) and c[k] > 0 and lo[k] > 0 and v[k] not in (None, 0)]   # a zero-volume row is the Muhurat copy of the day before (file 26, 5.1 row 5)
            if len(rows) < 8:
                continue
            last = date.fromisoformat(rows[-1][0])
            if (expected_day - last).days > SUSPENDED_DAYS:
                suspended += 1                  # suspended or delisted: out of the scan universe, not "left out"
                continue
            if last < expected_day:             # F4: the company's last candle is not the list's day: left off, counted in the job's result and logged
                stale.append([sym, f"candles end {last.strftime('%d %b').lstrip('0')}, before the {expected_day.strftime('%d %b').lstrip('0')} close"])
                continue
            d_, o_, h_, l_, c_, v_ = (list(x) for x in zip(*rows))
            s = pe.S(sym, d_, o_, h_, l_, c_, v_)
            s.wd = s.wh = s.wl = s.wc = None
            if tv is not None and tv[i] == tv[i] and tv[i] is not None:
                s.turn = float(tv[i])            # a provider series can carry BSE-sized volume (file 26, 5.1): the screens' figure decides the floor
            if s.turn < pe.MIN_TURNOVER_CR or s.last < pe.MIN_PRICE or s.adr <= 0:
                continue
            checked += 1
            if s.n < 60:
                young[sym] = s                   # a recent listing: IPO base only
            else:
                series[sym] = s
        except Exception:
            log.warning("pattern series skipped for %s", sym, exc_info=True)
    for sym, s in series.items():                # three years of weekly bars from the exchange candles read above, up to the list's day
        w = long.get(sym)
        if w and w["t"] and w["t"][-1] > exp_iso:
            n = sum(1 for x in w["t"] if x <= exp_iso)
            w = {k: (v[:n] if isinstance(v, list) else v) for k, v in w.items()}
        if w and len(w["t"]) >= 300 and all(x is not None for x in w["c"]):
            s.wd, s.wh, s.wl, s.wc = pe.weekly_bars(w["t"], w["h"], w["l"], w["c"])
        else:
            s.wd, s.wh, s.wl, s.wc = pe.weekly_bars(s.d, s.h, s.l, s.c)
        s.wd = np.array([str(x) for x in s.wd])
    ranks = pe.strength_ranks(series) if series else {}
    for group, is_young in ((series, False), (young, True)):
        for sym, s in group.items():
            for h in pe.scan(s, ranks.get(sym), benches, young=is_young):
                if not rule_holds(h["pattern"], h, s.last):        # F4: the list's rule, again on the list day's close
                    rule_off.append([sym, h["pattern"]])
                    continue
                scans[h["pattern"]][sym] = record_of(h, s)
    if stale:
        log.info("pattern scans: %d companies left out (candles behind the close): %s", len(stale), stale[:50])      # the list stays in the log; the page gets a count
    if rule_off:
        log.warning("pattern scans: %d hits left out (their list's rule does not hold at the %s close): %s", len(rule_off), exp_iso, rule_off[:50])
    return {"as_of": exp_iso, "scans": scans, "left_out": stale, "rule_off": rule_off, "checked": checked, "suspended": suspended, "bench": bool(benches), "engine": 2}


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
