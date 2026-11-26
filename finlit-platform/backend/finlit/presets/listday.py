"""The day a ready-made list belongs to, and each company's close of that day (task #394, developer file 37: F3, F4, F8, F9).

Live check of 25 Nov 2026 (signed in as Gold): every list said "after the 24 Nov close" while 24 Nov was an NSE holiday (Guru Nanak Jayanti); the row
price was the live quote of the holiday, not the chart's close; the day change was missing on some rows and did not match the prices on others; and
companies with no trade for months sat on lists. The lists were dated by the weekday rule (prism_candles.expected_session), which does not know holidays.

Here everything comes from ONE store, the exchange candles (`daily_candles`, the same candles the charts are written from, price_sections.py):

  List day        the newest weekday on or before the weekday rule's day on which at least MIN_COMPANIES companies have a candle (a holiday has none,
                  a stray candle of one company does not make a session). When the candles hold no such day in MAX_LAG_DAYS, the weekday rule's day
                  is kept (nothing better is known) and the lists say so through their own date.
  Sessions        the market's sessions, newest first, the same way (the days most companies traded).
  Close           each company's last candle on or before the list day: its close, the close of the candle before it (the day change is
                  close / previous close - 1, so it always matches the two prices) and the last day it traded (volume above zero).
  Not traded      a company with candles whose last trade is older than the fifth session before the list (F8): it is left off every list.

A company with no candles at all is not judged here (unknown is not "no trade"): its row keeps the screener table's price as before.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence

log = logging.getLogger("finlit.presets.listday")
MIN_COMPANIES = 50          # a day with candles for fewer companies than this is not a market session (a stray row, a special listing day)
SHARE_OF_BUSIEST = 0.25     # ... nor a day with candles for under a quarter as many companies as the busiest day of the window. Was 0.5 until 26 Nov 2026:
                            # the founder's rule is that the lists use whatever closes are loaded as soon as they are loaded ("even if it is not fetched
                            # completely, whatever has been fetched, work with that"); a row still waiting says so (row_price), and the lists are rebuilt
                            # as more closes arrive (service.has_work)
COMPLETE_SHARE = 0.9        # a day with candles for at least this share of the busiest day is complete; below it, the day's closes are still loading
WINDOW_DAYS = 21            # calendar days of candles read for the closes and the sessions (about 14 sessions)
MAX_LAG_DAYS = 10           # no session in this many days before the weekday rule's day: the candles are behind; keep the weekday rule's day
NO_TRADE_SESSIONS = 5       # F8: no trade in this many sessions up to the list day and the company is left off the lists


@dataclass
class DayClose:
    day: str                        # the company's last candle on or before the list day (ISO)
    close: float
    prev: Optional[float] = None    # the close of the candle before it
    prev_day: Optional[str] = None
    traded: Optional[str] = None    # the last day on or before the list day with volume above zero (or no volume figure)
    volume: Optional[float] = None  # the volume of the `day` candle


@dataclass
class Market:
    day: Optional[date] = None                                      # the list day from the candles, None when they do not tell
    sessions: List[str] = field(default_factory=list)              # the market's sessions, newest first (ISO)
    closes: Dict[str, DayClose] = field(default_factory=dict)      # symbol -> its close of the list day (or its last before it)
    untraded: Dict[str, Optional[str]] = field(default_factory=dict)   # F8: symbol -> the last day it traded (None: never in the candles read)
    loaded: int = 0                                                 # companies with a candle on the list day
    busiest: int = 0                                                # companies on the busiest day of the window

    @property
    def complete(self) -> bool:
        """The list day's closes are all in (or nothing is known): rows without a candle of that day did not trade, they are not still loading."""
        return not self.busiest or self.loaded >= COMPLETE_SHARE * self.busiest

    def not_traded(self, symbol: str) -> bool:
        return symbol in self.untraded


def dm(iso: Optional[str]) -> str:
    """'2026-11-23' -> '23 Nov'."""
    if not iso:
        return ""
    d = date.fromisoformat(str(iso)[:10])
    return f"{d.day} {d.strftime('%b')}"


def day_change(close: Optional[float], prev: Optional[float]) -> Optional[float]:
    """The day change in percent (2 decimals), close / previous close - 1; None when either is missing or the previous close is not positive."""
    if close is None or prev is None or prev <= 0:
        return None
    return round((close / prev - 1) * 100, 2)


def sessions_from_counts(counts: Dict[date, int], upto: date) -> List[date]:
    """The market's sessions (newest first) among the days on or before `upto`: weekdays with candles for at least MIN_COMPANIES companies and at least
    half as many as the busiest day."""
    days = {d: n for d, n in counts.items() if d <= upto}
    if not days:
        return []
    top = max(days.values())
    return sorted((d for d, n in days.items() if d.weekday() < 5 and n >= MIN_COMPANIES and n >= SHARE_OF_BUSIEST * top), reverse=True)


def list_day(sessions: Sequence[date], expected: date) -> Optional[date]:
    """The newest session on or before the weekday rule's day, when it is within MAX_LAG_DAYS of it; else None (keep the weekday rule's day)."""
    for d in sessions:
        if d <= expected:
            return d if (expected - d).days <= MAX_LAG_DAYS else None
    return None


def closes_from_rows(rows: Iterable[Any], day: date) -> Dict[str, DayClose]:
    """{symbol: DayClose} from candle rows (symbol, day, close, volume) ordered by symbol then day; only candles on or before `day` count."""
    out: Dict[str, DayClose] = {}
    by: Dict[str, List[Any]] = {}
    for r in rows:
        if r["day"] <= day and r["close"] is not None and r["close"] > 0:
            by.setdefault(r["symbol"], []).append(r)
    for sym, rs in by.items():
        rs.sort(key=lambda r: r["day"])
        last = rs[-1]
        prev = rs[-2] if len(rs) > 1 else None
        traded = next((r["day"].isoformat() for r in reversed(rs) if r["volume"] is None or r["volume"] > 0), None)
        out[sym] = DayClose(day=last["day"].isoformat(), close=float(last["close"]), prev=float(prev["close"]) if prev else None,
                            prev_day=prev["day"].isoformat() if prev else None, traded=traded,
                            volume=float(last["volume"]) if last["volume"] is not None else None)
    return out


def untraded_of(closes: Dict[str, DayClose], older: Dict[str, Optional[str]], sessions: Sequence[str]) -> Dict[str, Optional[str]]:
    """F8: the companies whose last trade is before the NO_TRADE_SESSIONS-th session up to the list day. `older`: the last trade day of companies with
    candles but none traded in the window. Nothing is judged when the candles hold fewer sessions than that."""
    if len(sessions) < NO_TRADE_SESSIONS:
        return {}
    cut = sessions[NO_TRADE_SESSIONS - 1]
    out: Dict[str, Optional[str]] = {}
    for sym, dc in closes.items():
        if dc.traded is None or dc.traded < cut:
            out[sym] = dc.traded if dc.traded is not None else older.get(sym)
    for sym, t in older.items():
        if sym not in closes and (t is None or t < cut):
            out[sym] = t
    return out


async def newest_day(conn, expected: date) -> Optional[date]:
    """The list day the candles support now (the same rule as load): the newest session on or before `expected`, or None."""
    return (await newest(conn, expected))[0]


async def newest(conn, expected: date) -> tuple:
    """(the list day the candles support now, how many companies have a candle on it); (None, 0) when they support none."""
    lo = expected - timedelta(days=WINDOW_DAYS)
    counts = {r["day"]: r["n"] for r in await conn.fetch("SELECT day, count(*) AS n FROM daily_candles WHERE day > $1 AND day <= $2 GROUP BY day", lo, expected)}
    day = list_day(sessions_from_counts(counts, expected), expected)
    return day, (counts.get(day, 0) if day else 0)


async def load(store, symbols: Sequence[str], expected: date) -> Market:
    """The list day, the sessions, every company's close of the list day and the companies not traded in the last five sessions, in two queries.
    An empty Market when the candles cannot be read (the lists are then dated and priced as before; the reason is logged)."""
    pool = getattr(store, "pool", None)
    if pool is None:
        return Market()
    lo = expected - timedelta(days=WINDOW_DAYS)
    try:
        async with pool.acquire() as conn:
            counts = {r["day"]: r["n"] for r in await conn.fetch("SELECT day, count(*) AS n FROM daily_candles WHERE day > $1 AND day <= $2 GROUP BY day", lo, expected)}
            sess = sessions_from_counts(counts, expected)
            day = list_day(sess, expected)
            if day is None:
                return Market()
            rows = await conn.fetch("SELECT symbol, day, close, volume FROM daily_candles WHERE day > $1 AND day <= $2 ORDER BY symbol, day", lo, day)
            closes = closes_from_rows(rows, day)
            wanted = {s.upper() for s in symbols}
            closes = {s: v for s, v in closes.items() if s in wanted}
            stale = [s for s in wanted if s not in closes or closes[s].traded is None]
            older: Dict[str, Optional[str]] = {}
            if stale:      # companies with candles but no trade in the window: their last trade (primary key index, newest first)
                for r in await conn.fetch("SELECT symbol, max(day) FILTER (WHERE volume IS NULL OR volume > 0) AS traded FROM daily_candles "
                                          "WHERE symbol = ANY($1::text[]) AND day <= $2 GROUP BY symbol", stale, day):
                    older[r["symbol"]] = r["traded"].isoformat() if r["traded"] else None
    except Exception:
        log.warning("the exchange candles were not read for the lists' day and closes; the weekday rule's day and the table's prices are used", exc_info=True)
        return Market()
    sessions = [d.isoformat() for d in sess if d <= day]
    untraded = untraded_of(closes, older, sessions)
    if untraded:
        log.info("ready-made lists: %d companies with no trade in the last %d sessions to %s are left off: %s", len(untraded), NO_TRADE_SESSIONS, day,
                 sorted(untraded.items())[:50])
    return Market(day=day, sessions=sessions, closes=closes, untraded=untraded, loaded=counts.get(day, 0), busiest=max(counts.values(), default=0))


def row_price(row: dict, dc: Optional[DayClose], day: str, loading: bool = False) -> None:
    """F3: a row's price, day change and price day from the official close of the list day (in place). The day change is worked out from the same two
    candles, so it always matches the prices; when it cannot be, it is None and `ret_1d_note` says why. A company with no candle on the list day shows
    its last close, dated, with no day change. Nothing changes for a company with no candles (dc None)."""
    if dc is None:
        return
    row["price"] = round(dc.close, 2)
    row["price_day"] = dc.day
    row.pop("ret_1d_note", None)
    if dc.day == day[:10] and dc.volume != 0:
        row["price_on"] = round(dc.close, 2)
        chg = day_change(dc.close, dc.prev)
        row["ret_1d"] = chg
        if chg is None:
            row["ret_1d_note"] = "No earlier close on file to compare with"
    else:
        row["price_on"] = None
        row["ret_1d"] = None
        if loading and dc.day != day[:10]:     # 26 Nov 2026: the day's closes are still arriving; this company's is not in yet (not "no trade")
            row["ret_1d_note"] = f"The {dm(day)} close is still loading; the price is the {dm(dc.day)} close"
        else:
            row["ret_1d_note"] = f"No trade on {dm(day)}; the price is the {dm(dc.day)} close" if dc.day != day[:10] else f"No trade on {dm(day)}"
