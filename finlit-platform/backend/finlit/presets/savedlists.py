"""The figures of a screen's past lists, worked out only from its SAVED lists (task #243, screeners update pack v4, section L, "How the figures are worked out").

Before, "Added", "Left the list" and the joined / left counts came from the stored spells, which also hold runs that were never saved as a list (a rerun on a
rules-change day): a company could read "left on 13 Nov" with 0 sessions on the list, or "Added 13 Nov" while it was on every saved list (pack L15). "Left the list"
also ignored the date picked (L9), and the past-date columns differed from the latest (L3). Here every figure comes from the saved lists themselves:

  Saved lists          the dates with a saved list (screen_runs), oldest first, each with its companies and the price saved with them (screen_snapshots).
  Joined / left on D   compare the list of D with the previous saved list.
  Added (as on D)      the earliest saved date d <= D such that the company is on every saved list from d to D; "Lists it was on" counts them.
  Since added          price on D / price on the Added day - 1: the price ratio, so each day's move compounds (pack v3, request 1); NIFTY 500 over the same days.
  Since then           (a past date) latest price / price on D - 1, with NIFTY 500 over the same days.
  Not saved            a trading day (NIFTY 500 has a close) between the first and the latest saved list with no list of its own (pack L7: shown, not filled).

Nothing is guessed: a company with no saved price on a day has no return for it (None), and the page says why.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional, Sequence, Tuple


@dataclass
class SavedLists:
    days: List[date] = field(default_factory=list)                      # oldest first
    members: Dict[date, Dict[str, Optional[float]]] = field(default_factory=dict)   # day -> symbol -> price saved with the list
    rules_changed: Dict[date, bool] = field(default_factory=dict)       # the registry version moved on this day
    counts: Dict[date, int] = field(default_factory=dict)               # the screen's full pass count that day (screen_runs.n)

    def prev(self, d: date) -> Optional[date]:
        i = self.days.index(d)
        return self.days[i - 1] if i > 0 else None

    def on(self, d: date) -> Dict[str, Optional[float]]:
        return self.members.get(d, {})


async def load(store, preset_id: str, chips: str) -> SavedLists:
    async with store.pool.acquire() as conn:
        runs = await conn.fetch("SELECT session, n, registry FROM screen_runs WHERE preset_id=$1 AND chips=$2 ORDER BY session", preset_id, chips)
        snaps = await conn.fetch("SELECT session, symbol, close FROM screen_snapshots WHERE preset_id=$1 AND chips=$2", preset_id, chips)
    return build([(r["session"], r["n"], r["registry"]) for r in runs], [(s["session"], s["symbol"], s["close"]) for s in snaps])


def build(runs: Sequence[Tuple[date, int, object]], snaps: Sequence[Tuple[date, str, Optional[float]]]) -> SavedLists:
    """Pure: the saved lists from rows of screen_runs (session, n, registry) and screen_snapshots (session, symbol, close)."""
    sl = SavedLists()
    prev_reg = object()
    for i, (d, n, reg) in enumerate(sorted(runs, key=lambda r: r[0])):
        sl.days.append(d)
        sl.counts[d] = n
        sl.rules_changed[d] = i > 0 and reg != prev_reg
        sl.members[d] = {}
        prev_reg = reg
    for d, sym, close in snaps:
        if d in sl.members:
            sl.members[d][sym] = float(close) if close is not None else None
    return sl


def joined_left(sl: SavedLists, d: date) -> Tuple[List[str], List[str], Optional[date]]:
    """Who joined and who left on D, against the previous saved list (none on the first)."""
    p = sl.prev(d)
    if p is None:
        return [], [], None
    now, before = set(sl.on(d)), set(sl.on(p))
    return sorted(now - before), sorted(before - now), p


def run_start(sl: SavedLists, sym: str, d: date) -> Tuple[Optional[date], int]:
    """Added as on D and the number of saved lists in that run (0 and None when the company is not on D's list)."""
    if sym not in sl.on(d):
        return None, 0
    i = sl.days.index(d)
    start = i
    while start > 0 and sym in sl.on(sl.days[start - 1]):
        start -= 1
    return sl.days[start], i - start + 1


def pct(a: Optional[float], b: Optional[float]) -> Optional[float]:
    """b / a - 1 in percent, 3 decimals (the page rounds once, to 1 decimal: -3.1485 reads -3.1%, never -3.15 then -3.2%); None when either price is missing or a
    is not positive."""
    if a is None or b is None or a <= 0:
        return None
    return round((b / a - 1) * 100, 3)


def trading_days(bench: Dict[str, float]) -> List[date]:
    return sorted(date.fromisoformat(k) for k in bench)


def not_saved(sl: SavedLists, bench: Dict[str, float]) -> List[date]:
    """Trading days between the first and the latest saved list with no list of their own (pack L7: the gap is shown, never filled)."""
    if not sl.days:
        return []
    lo, hi, have = sl.days[0], sl.days[-1], set(sl.days)
    return [d for d in trading_days(bench) if lo < d < hi and d not in have]


def sessions_view(sl: SavedLists, bench: Dict[str, float]) -> List[dict]:
    """The date menu (pack P3): every saved list, latest first, with its count, joined and left against the previous list and a status; the trading days with no
    saved list sit in between as "not saved"."""
    out: List[dict] = []
    for i, d in enumerate(sl.days):
        j, l, p = joined_left(sl, d)
        status = ("latest" if i == len(sl.days) - 1 else "rules" if sl.rules_changed.get(d) else "first" if i == 0 else "saved")
        out.append({"date": d.isoformat(), "count": sl.counts.get(d, len(sl.on(d))), "joined": len(j) if p else None, "left": len(l) if p else None,
                    "prev": p.isoformat() if p else None, "rulesUpdated": bool(sl.rules_changed.get(d)), "status": status, "saved": True})
    for d in not_saved(sl, bench):
        out.append({"date": d.isoformat(), "count": None, "joined": None, "left": None, "prev": None, "rulesUpdated": False, "status": "not_saved", "saved": False})
    return sorted(out, key=lambda r: r["date"], reverse=True)


def _bench_at(bench: Dict[str, float], day: str) -> Optional[float]:
    """The closest NIFTY 500 close on or before the day."""
    best = None
    for k in sorted(bench):
        if k <= day:
            best = bench[k]
    return best


def row_figures(sl: SavedLists, sym: str, d: date, latest_price: Optional[float], bench: Dict[str, float]) -> dict:
    """Added, lists it was on, Since added (and Since then on a past date) for one company on D's list, with NIFTY 500 over the same days and the prices behind
    each figure (for the hover sum, pack P5.4)."""
    added, n = run_start(sl, sym, d)
    out: dict = {"added_on": added.isoformat() if added else None, "lists_on": n, "added_baseline": bool(added and sl.days and added == sl.days[0])}
    p_d = sl.on(d).get(sym)
    if added is not None:
        p_a = sl.on(added).get(sym)
        out.update({"since_added_pct": pct(p_a, p_d), "price_added": p_a, "price_on": p_d,
                    "bench_since_added_pct": pct(_bench_at(bench, added.isoformat()), _bench_at(bench, d.isoformat()))})
    latest = sl.days[-1] if sl.days else None
    if latest is not None and d != latest:
        out.update({"since_then_pct": pct(p_d, latest_price), "price_latest": latest_price,
                    "bench_since_then_pct": pct(_bench_at(bench, d.isoformat()), _bench_at(bench, latest.isoformat()))})
    return out


def left_rows(sl: SavedLists, d: date, mode: str, reasons: Optional[Dict[Tuple[str, str], str]] = None) -> List[dict]:
    """Left the list (pack P8), only from saved lists:
      on      the companies on the previous saved list and not on D's;
      upto    every company that left on a saved date up to D (since the first saved list);
      after   the companies on D's list that left on a later saved date.
    Each row: company, joined (the start of its run), left (the first saved date it was missing), lists it was on, the price change from joining to leaving (the
    price on its last saved list over the price on its first), and why it left when the nightly run said so."""
    reasons = reasons or {}
    out: List[dict] = []
    if d not in sl.days:
        return out
    i = sl.days.index(d)
    lo, hi = (i, i) if mode == "on" else (1, i) if mode == "upto" else (i + 1, len(sl.days) - 1)
    after_ids = set(sl.on(d)) if mode == "after" else None
    for k in range(max(1, lo), hi + 1):
        day, prev = sl.days[k], sl.days[k - 1]
        for sym in sorted(set(sl.on(prev)) - set(sl.on(day))):
            if after_ids is not None and sym not in after_ids:
                continue
            start, n = run_start(sl, sym, prev)
            out.append({"symbol": sym, "added_on": start.isoformat() if start else None, "left_on": day.isoformat(), "lists_on": n,
                        "change_pct": pct(sl.on(start).get(sym) if start else None, sl.on(prev).get(sym)), "reason": reasons.get((sym, day.isoformat()))})
    return sorted(out, key=lambda r: (r["left_on"], r["symbol"]), reverse=False if mode == "on" else True)


async def reasons_for(store, preset_id: str, chips: str) -> Dict[Tuple[str, str], str]:
    """The nightly run's own words for why a company left, keyed by (symbol, day it left)."""
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT symbol, left_on, left_reason FROM screen_spells WHERE preset_id=$1 AND chips=$2 AND left_on IS NOT NULL", preset_id, chips)
    return {(r["symbol"], r["left_on"].isoformat()): r["left_reason"] for r in rows if r["left_reason"]}

