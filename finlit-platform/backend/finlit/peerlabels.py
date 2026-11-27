"""Task #409 (peer label fix pack, 27 Nov 2026): one weekly record of every stock's peer label, one rule, applied once, when a run writes its rows.

Before this, the site kept three copies that disagreed: the stored label with a "since" date (`leadership`), a weekly history that the job re-ranked
every Saturday against today's peer lists (`leadership_history`, so old weeks moved), and a label the sector build made on its own (the industry pages
and the Advanced screener). On 27 Nov 2026, of the 139 labelled stocks among the 150 largest: 116 had a "since" date the history contradicted,
18 had two agreeing readings and an unchanged label ("if next week agrees" for weeks), and the history broke the printed rule for 134.

Now:
  * `peer_label_week` holds one row per stock per weekly run, written once (migration 147). A bad run is replaced by a correcting run for the same
    week; the old one is marked superseded in `peer_label_run`. Reads take the latest current run of each week.
  * `next_label` is the only place a reading becomes a label ("Labels change only when two weekly runs agree"), with `HOLD_UNRANKED` runs kept
    without a rank (decided: 2), then no label.
  * Every reader (the leadership endpoints, the label alerts, the industry pages, the screener) reads the record. Nothing works a label, a past
    reading or a "since" date out on read.
  * `rebuild` (one time, option A, decided by Pranjal) walks the readings already stored in `leadership_history` with `next_label`, oldest first,
    and writes them with source `rebuilt-2026-11`. No alerts come from those rows.
The label describes past relative share-price performance only; it is never a buy, sell or hold signal.
"""
from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

log = logging.getLogger("finlit.peerlabels")

RULE_VERSION = "two-runs-v1"
HOLD_UNRANKED = 2                     # decided (27 Nov 2026): a label is kept for up to 2 runs without a rank, then there is no label
SOURCE_RUN = "run"
SOURCE_REBUILT = "rebuilt-2026-11"
READINGS = ("leader", "in_line", "laggard", "none")
WORDS = {"leader": "Leader", "in_line": "In line", "laggard": "Laggard"}
GROUP_JUMP = 2.0                      # the migration report lists a week whose peer group is this many times larger or smaller than both neighbours


@dataclass
class Prev:
    """The fields of a stock's previous stored row that the rule reads."""
    label: str
    reading: str
    label_since: date
    weeks_not_ranked: int = 0


def next_label(prev: Optional[Prev], reading: str, week_end: date, hold_unranked: int = HOLD_UNRANKED) -> Tuple[str, date, Optional[str], bool]:
    """(label, label_since, pending_to, changed) for this run, from the stock's last STORED row (never a recomputed one) and this run's reading.

    * first run for a stock: its reading is the label at once; not a change (no alert)
    * no rank this run: the label is kept for up to `hold_unranked` runs, then it is 'none'
    * the reading confirms the label: nothing changes
    * the same new reading two runs in a row: the label changes in that run
    * a new reading for the first time: the label stays and the reading is pending
    A label can never be pending after two agreeing readings."""
    if reading not in READINGS:
        raise ValueError(f"unknown reading {reading!r}")
    if prev is None:
        return reading, week_end, None, False
    if reading == "none":
        if prev.weeks_not_ranked + 1 <= hold_unranked:
            return prev.label, prev.label_since, None, False
        changed = prev.label != "none"
        return "none", (week_end if changed else prev.label_since), None, changed
    if reading == prev.label:
        return prev.label, prev.label_since, None, False
    if reading == prev.reading:
        return reading, week_end, None, True
    return prev.label, prev.label_since, reading, False


@dataclass
class Reading:
    """One stock's reading in one weekly run, with the figures stored beside it."""
    symbol: str
    reading: str                                  # leader | in_line | laggard | none
    peer_group_id: Optional[str] = None
    peer_list_version: Optional[str] = None
    ranked: Optional[int] = None
    rank: Optional[int] = None
    not_ranked_reason: Optional[str] = None
    rel52: Optional[float] = None
    rel13: Optional[float] = None
    rel52_market: Optional[float] = None
    direction: Optional[str] = None


def row_for(prev: Optional[Prev], r: Reading, week_end: date, hold_unranked: int = HOLD_UNRANKED) -> Dict[str, Any]:
    """The full stored row for one stock and one run (the caller adds run_id and source)."""
    label, since, pending, changed = next_label(prev, r.reading, week_end, hold_unranked)
    return {"symbol": r.symbol, "week_end": week_end, "peer_group_id": r.peer_group_id, "peer_list_version": r.peer_list_version, "ranked": r.ranked,
            "rank": r.rank if r.reading != "none" else None, "not_ranked_reason": r.not_ranked_reason if r.reading == "none" else None,
            "rel52": r.rel52, "rel13": r.rel13, "rel52_market": r.rel52_market, "direction": r.direction, "reading": r.reading, "label": label,
            "label_since": since, "pending_to": pending, "changed": changed,
            "weeks_not_ranked": (prev.weeks_not_ranked + 1 if prev else 1) if r.reading == "none" else 0}


def walk(readings: Sequence[Reading], weeks: Sequence[date], hold_unranked: int = HOLD_UNRANKED) -> List[Dict[str, Any]]:
    """One stock's rows over its weeks, oldest first, from its readings alone (the migration). The weeks before its first real reading are skipped:
    the first row with a reading starts the label, as a first run does."""
    out: List[Dict[str, Any]] = []
    prev: Optional[Prev] = None
    started = False
    for r, w in zip(readings, weeks):
        if not started and r.reading == "none":
            continue
        started = True
        row = row_for(prev, r, w, hold_unranked)
        out.append(row)
        prev = Prev(row["label"], row["reading"], row["label_since"], row["weeks_not_ranked"])
    return out


def group_jumps(weeks: Sequence[date], ranked: Sequence[Optional[int]], factor: float = GROUP_JUMP) -> List[Tuple[date, int]]:
    """Weeks whose peer-group size is far from BOTH neighbours (HINDUNILVR 8 -> 35 -> 8): kept, and listed in the migration report."""
    out: List[Tuple[date, int]] = []
    for i in range(1, len(ranked) - 1):
        a, b, c = ranked[i - 1], ranked[i], ranked[i + 1]
        if not a or not b or not c:
            continue
        if (b >= factor * a and b >= factor * c) or (b * factor <= a and b * factor <= c):
            out.append((weeks[i], b))
    return out


# ------------------------------------------------------------------------------------------------------------------------- database
COLUMNS = ("symbol", "week_end", "run_id", "peer_group_id", "peer_list_version", "ranked", "rank", "not_ranked_reason", "rel52", "rel13", "rel52_market",
           "direction", "reading", "label", "label_since", "pending_to", "changed", "weeks_not_ranked", "rule_version", "source")

# The latest current run of each week, then each stock's newest week: the one place reads choose rows.
CURRENT = ("SELECT w.* FROM peer_label_week w JOIN peer_label_run r ON r.run_id = w.run_id AND r.status = 'current'")
LATEST = (f"SELECT DISTINCT ON (w.symbol) w.* FROM ({CURRENT}) w {{where}} ORDER BY w.symbol, w.week_end DESC")   # nosec B608 - fixed SQL pieces only; every value is a bound parameter


async def has_rows(conn) -> bool:
    return bool(await conn.fetchval("SELECT EXISTS (SELECT 1 FROM peer_label_week)"))


async def latest(conn, symbols: Optional[Iterable[str]] = None) -> Dict[str, Dict[str, Any]]:
    """symbol -> its newest stored row (the latest current run). Every reader of the label calls this."""
    if symbols is None:
        rows = await conn.fetch(LATEST.format(where=""))
    else:
        syms = sorted({s.upper() for s in symbols if s})
        if not syms:
            return {}
        rows = await conn.fetch(LATEST.format(where="WHERE w.symbol = ANY($1::text[])"), syms)
    return {r["symbol"]: dict(r) for r in rows}


async def history(conn, symbol: str) -> List[Dict[str, Any]]:
    """A stock's stored rows, oldest first (one per week: the latest current run of that week)."""
    rows = await conn.fetch(f"SELECT DISTINCT ON (w.week_end) w.* FROM ({CURRENT}) w WHERE w.symbol = $1 ORDER BY w.week_end, w.run_at DESC", symbol.upper())   # nosec B608 - fixed SQL pieces only; every value is a bound parameter
    return [dict(r) for r in rows]


async def counts52(conn, symbol: str) -> Optional[Dict[str, int]]:
    """runs52: counts of the stored LABEL over the stock's last 52 rows; `total` = rows counted. None when the stock has none."""
    rows = await history(conn, symbol)
    last = [r["label"] for r in rows[-52:]]
    if not last:
        return None
    return {"leader": last.count("leader"), "in_line": last.count("in_line"), "laggard": last.count("laggard"), "total": len(last)}


async def latest_week(conn) -> Optional[date]:
    return await conn.fetchval("SELECT max(week_end) FROM peer_label_run WHERE status = 'current'")


def words(label: Optional[str]) -> Optional[str]:
    """The label as the sector pages and the screener print it; None for 'none' or no row."""
    return WORDS.get(label or "")


async def label_words(conn, symbols: Iterable[str]) -> Dict[str, Optional[str]]:
    """symbol -> 'Leader' | 'In line' | 'Laggard' | None, from the latest stored row (the industry pages and the screener)."""
    return {s: words(r["label"]) for s, r in (await latest(conn, symbols)).items()}


def _run_id(week_end: date, source: str) -> str:
    return f"{source}-{week_end.isoformat()}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}-{secrets.token_hex(3)}"


async def _insert(conn, rows: Sequence[Dict[str, Any]]) -> None:
    if rows:
        await conn.executemany(f"INSERT INTO peer_label_week ({', '.join(COLUMNS)}) VALUES ({', '.join(f'${i}' for i in range(1, len(COLUMNS) + 1))})",   # nosec B608 - fixed SQL pieces only; every value is a bound parameter
                               [tuple(r[c] for c in COLUMNS) for r in rows])


async def write_run(conn, week_end: date, readings: Sequence[Reading], *, hold_unranked: int = HOLD_UNRANKED, correction: Optional[str] = None) -> Dict[str, Any]:
    """Write one weekly run in ONE transaction: each stock's previous STORED row (an earlier week), `next_label`, one new row each. A stock with an
    earlier row but no reading this run gets a 'none' reading (held for HOLD_UNRANKED runs). A week that already has a current run is not written again
    unless `correction` gives the reason (the earlier run is then marked superseded). Returns the counts; the changed rows are what the alerts read."""
    async with conn.transaction():
        have = await conn.fetchval("SELECT run_id FROM peer_label_run WHERE week_end = $1 AND status = 'current' ORDER BY created_at DESC LIMIT 1", week_end)
        if have and not correction:
            return {"weekEnd": week_end.isoformat(), "written": 0, "skipped": "this week already has a run", "runId": have}
        prev_rows = {r["symbol"]: dict(r) for r in await conn.fetch(
            f"SELECT DISTINCT ON (w.symbol) w.* FROM ({CURRENT}) w WHERE w.week_end < $1 ORDER BY w.symbol, w.week_end DESC", week_end)}   # nosec B608 - fixed SQL pieces only; every value is a bound parameter
        by_sym = {r.symbol: r for r in readings}
        for sym in prev_rows:                                  # stocks that had a row and are not in this run: no rank this week
            if sym not in by_sym:
                by_sym[sym] = Reading(symbol=sym, reading="none", not_ranked_reason="not_compared", peer_group_id=prev_rows[sym]["peer_group_id"])
        run_id = _run_id(week_end, SOURCE_RUN)
        out_rows: List[Dict[str, Any]] = []
        for sym, r in by_sym.items():
            p = prev_rows.get(sym)
            if p is None and r.reading == "none":
                continue                                       # a stock that has never had a reading gets no row
            prev = Prev(p["label"], p["reading"], p["label_since"], p["weeks_not_ranked"]) if p else None
            row = row_for(prev, r, week_end, hold_unranked)
            out_rows.append({**row, "run_id": run_id, "rule_version": RULE_VERSION, "source": SOURCE_RUN})
        if have:
            await conn.execute("UPDATE peer_label_run SET status = 'superseded', reason = $2 WHERE run_id = $1", have, correction)
        await conn.execute("INSERT INTO peer_label_run (run_id, week_end, status, reason, source) VALUES ($1, $2, 'current', $3, $4)", run_id, week_end, correction, SOURCE_RUN)
        await _insert(conn, out_rows)
    changed = [r["symbol"] for r in out_rows if r["changed"]]
    return {"weekEnd": week_end.isoformat(), "runId": run_id, "written": len(out_rows), "changed": len(changed), "changedSymbols": sorted(changed)[:50],
            "pending": sum(1 for r in out_rows if r["pending_to"]), "noLabel": sum(1 for r in out_rows if r["label"] == "none")}


async def sync_leadership(conn) -> int:
    """Copy each stock's latest stored label, reading and since into `leadership`, the table the rest of the site's readers join on (dashboard,
    portfolios, FinLit AI, exports), so they show the record's label too. `held` = a reading is pending."""
    res = await conn.execute(
        f"UPDATE leadership l SET label = NULLIF(x.label, 'none'), raw_label = NULLIF(x.reading, 'none'), label_since = x.label_since, held = (x.pending_to IS NOT NULL) "   # nosec B608 - fixed SQL pieces only; every value is a bound parameter
        f"FROM ({LATEST.format(where='')}) x WHERE x.symbol = l.symbol")
    try:
        return int(str(res).split()[-1])
    except (ValueError, IndexError):
        return 0


async def rebuild(store, *, hold_unranked: int = HOLD_UNRANKED) -> Dict[str, Any]:
    """The one-time migration (option A, decided): every stock's stored weekly readings (leadership_history.raw_label, oldest first) walked with
    `next_label`, written as one run per week with source 'rebuilt-2026-11'. Weeks before a stock's first reading are skipped; a week whose peer group
    is far from its neighbours is kept and listed in the report. Does nothing when the record already has rows. No alerts: the alerts read
    source = 'run' rows only."""
    async with store.pool.acquire() as conn:
        if await has_rows(conn):
            return {"status": "skipped", "reason": "the record already has rows"}
        hist = await conn.fetch("SELECT h.symbol, h.run_date, h.rank, h.ranked, h.raw_label, h.direction, h.rel13, h.rel52, h.rel52_market, l.group_id "
                                "FROM leadership_history h LEFT JOIN leadership l ON l.symbol = h.symbol ORDER BY h.symbol, h.run_date")
    by_sym: Dict[str, List[Any]] = {}
    for r in hist:
        by_sym.setdefault(r["symbol"], []).append(r)
    rows: List[Dict[str, Any]] = []
    jumps: Dict[str, List[str]] = {}
    for sym, rs in by_sym.items():
        weeks = [r["run_date"] for r in rs]
        readings = [Reading(symbol=sym, reading=(r["raw_label"] if r["raw_label"] in WORDS else "none"), peer_group_id=r["group_id"], peer_list_version=None,
                            ranked=r["ranked"], rank=r["rank"], not_ranked_reason=None if r["raw_label"] in WORDS else "not_compared",
                            rel52=r["rel52"], rel13=r["rel13"], rel52_market=r["rel52_market"], direction=r["direction"]) for r in rs]
        rows.extend(walk(readings, weeks, hold_unranked))
        j = group_jumps(weeks, [r["ranked"] for r in rs])
        if j:
            jumps[sym] = [f"{d.isoformat()}: {n}" for d, n in j]
    weeks_all = sorted({r["week_end"] for r in rows})
    run_ids = {w: f"{SOURCE_REBUILT}-{w.isoformat()}" for w in weeks_all}
    for r in rows:
        r.update(run_id=run_ids[r["week_end"]], rule_version=RULE_VERSION, source=SOURCE_REBUILT)
    async with store.pool.acquire() as conn:
        async with conn.transaction():
            if await has_rows(conn):
                return {"status": "skipped", "reason": "the record already has rows"}
            await conn.executemany("INSERT INTO peer_label_run (run_id, week_end, status, reason, source) VALUES ($1, $2, 'current', $3, $4)",
                                   [(run_ids[w], w, "one-time rebuild with the two-run rule (task #409)", SOURCE_REBUILT) for w in weeks_all])
            await _insert(conn, rows)
            synced = await sync_leadership(conn)
    latest_rows: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        latest_rows[r["symbol"]] = r
    out = {"status": "ok", "stocks": len(by_sym), "rows": len(rows), "weeks": len(weeks_all), "labelled": sum(1 for r in latest_rows.values() if r["label"] != "none"),
           "pendingNow": sum(1 for r in latest_rows.values() if r["pending_to"]), "leadershipSynced": synced,
           "groupJumps": len(jumps), "groupJumpExamples": dict(list(sorted(jumps.items()))[:20])}
    log.warning("peer labels rebuilt from the stored weekly readings: %s", {k: v for k, v in out.items() if k != "groupJumpExamples"})
    if jumps:
        log.warning("peer labels rebuild: weeks whose peer group is far from its neighbours (kept, not changed): %s", dict(list(sorted(jumps.items()))[:50]))
    return out


async def needs_rebuild(store) -> bool:
    """The rebuild job's probe: the record is empty and there are stored weekly readings to build it from."""
    async with store.pool.acquire() as conn:
        if await has_rows(conn):
            return False
        return bool(await conn.fetchval("SELECT EXISTS (SELECT 1 FROM leadership_history WHERE raw_label IS NOT NULL)"))


def pending_text(pending_to: Optional[str]) -> Optional[str]:
    """The pack's wording, shown only when a reading is pending."""
    if not pending_to or pending_to not in WORDS:
        return None
    return f"This week's reading says {WORDS[pending_to]}. The label changes if next week's reading agrees."
