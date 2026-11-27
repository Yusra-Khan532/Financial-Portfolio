"""Trading Lab, the 5-minute candle store behind the Time Machine (docs/TRADING-LAB.md "Time Machine").

Table candles_5m (migration 146): every NSE F&O share's 5-minute bars of the continuous session (bar starts 09:15 to 15:25 IST), about 100
calendar days. With TimescaleDB it is a hypertable (store._candles_5m_hypertable: 7-day chunks, compressed after 7 days, chunks older than 100
days dropped by TimescaleDB); on plain PostgreSQL this job deletes rows older than 100 days at the end of every run.

Job `lab-candles` (command `refresh-lab-candles --max-minutes 6`): weekdays from 15:55 IST, again from 19:30 for the shares the first run did not
reach. The shares go in order: the fewest stored sessions first, then the oldest last bar. For each share:
  * a share whose last stored bar is the latest finished session's last bar (15:25) is up to date: no call;
  * otherwise one Dhan call, after a slot of the shared Dhan Data API pacer (intraday.slot(..., share=True): a second's slot only when no other
    call used that second, so the job makes at most one call a second and visitors keep the rest): "budget" (the 90,000-a-day cap is used) stops
    the run, "busy" skips the share (it goes first next run);
  * a first fill asks 89 calendar days in one call (Dhan answers at most 90 days per call); later runs ask from the last stored bar (asked again,
    in case it was still forming) to now;
  * the bars are written with INSERT ... ON CONFLICT (security_id, at) DO UPDATE, so a bar fetched twice is stored once.
At its deadline the run stops starting calls; what is stored stays. Budget: about 210 calls for the first fill, then about 210 a weekday (one
per share, usually in the 15:55 run), at most one a second.
"""
from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta
from datetime import time as dtime
from typing import Dict, List, Optional, Tuple

from ..dhan import IST, DhanError

log = logging.getLogger("finlit.lab.candles5m")

KEEP_DAYS = 100                          # calendar days kept (the TimescaleDB retention policy is the same)
FIRST_DAYS = 89                          # the first fill: one call, inside Dhan's 90-day limit per call
OPEN_MIN = 9 * 60 + 15                   # 09:15 IST, the first bar
CLOSE_MIN = 15 * 60 + 30                 # 15:30 IST, the session's end
LAST_BAR_MIN = CLOSE_MIN - 5             # the last bar starts at 15:25
SETTLED_MIN = CLOSE_MIN + 5              # from 15:35 the session's last bar is final

UPSERT = ("INSERT INTO candles_5m (security_id, at, open, high, low, close, volume) VALUES ($1, $2, $3, $4, $5, $6, $7) "
          "ON CONFLICT (security_id, at) DO UPDATE SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, "
          "close = EXCLUDED.close, volume = EXCLUDED.volume")
STATS = ("SELECT security_id, count(DISTINCT (at AT TIME ZONE 'Asia/Kolkata')::date) AS sessions, max(at) AS last "
         "FROM candles_5m WHERE security_id = ANY($1::text[]) GROUP BY security_id")
PRUNE = "DELETE FROM candles_5m WHERE at < $1"
HYPERTABLE = "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')"
IS_HYPER = "SELECT count(*) FROM timescaledb_information.hypertables WHERE hypertable_name = 'candles_5m'"


def in_session(at: datetime) -> bool:
    t = at.astimezone(IST)
    m = t.hour * 60 + t.minute
    return t.weekday() < 5 and OPEN_MIN <= m < CLOSE_MIN


def latest_finished_session(now: datetime) -> date:
    """The latest weekday whose session is over (from 15:35 IST): today after 15:35, else the weekday before. Holidays are not known here."""
    t = now.astimezone(IST)
    d = t.date()
    if t.weekday() >= 5 or t.hour * 60 + t.minute < SETTLED_MIN:
        d -= timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def up_to_date(last: Optional[datetime], now: datetime) -> bool:
    """True when the last stored bar is the last bar (15:25) of the latest finished session or later: asking again would bring nothing."""
    if last is None:
        return False
    t = last.astimezone(IST)
    s = latest_finished_session(now)
    return t.date() > s or (t.date() == s and t.hour * 60 + t.minute >= LAST_BAR_MIN)


def fetch_window(last: Optional[datetime], now: datetime) -> Tuple[datetime, datetime]:
    """(from, to) of the one Dhan call: from the last stored bar (asked again), never more than 89 days back; 89 days back for a first fill."""
    end = now.astimezone(IST).replace(microsecond=0)
    floor = datetime.combine(end.date() - timedelta(days=FIRST_DAYS), dtime(0, 0), tzinfo=IST)
    start = floor if last is None else max(last.astimezone(IST), floor)
    return start, end


def order(universe: Dict[str, dict], stats: Dict[str, Tuple[int, Optional[datetime]]]) -> List[str]:
    """Shares with the fewest stored sessions first, then the oldest last bar, then by symbol."""
    def key(sym: str):
        n, last = stats.get(universe[sym]["security_id"], (0, None))
        return (n, last.timestamp() if last else 0.0, sym)
    return sorted(universe, key=key)


def rows_of(security_id: str, candles: List[dict]) -> List[tuple]:
    """The session bars of one Dhan answer as table rows (bars outside 09:15 to 15:30 IST, and bars with a missing price, are left out)."""
    out = []
    for c in candles:
        at = c.get("at")
        px = [c.get(k) for k in ("open", "high", "low", "close")]
        if at is None or any(p is None or p <= 0 for p in px) or not in_session(at):
            continue
        vol = c.get("volume")
        out.append((str(security_id), at, float(px[0]), float(px[1]), float(px[2]), float(px[3]), int(vol) if vol is not None else None))
    return out


async def _stats(store, ids: List[str]) -> Dict[str, Tuple[int, Optional[datetime]]]:
    if not ids:
        return {}
    async with store.pool.acquire() as conn:
        rows = await conn.fetch(STATS, ids)
    return {r["security_id"]: (int(r["sessions"]), r["last"]) for r in rows}


async def _is_hypertable(conn) -> bool:
    try:
        if not await conn.fetchval(HYPERTABLE):
            return False
        return bool(await conn.fetchval(IS_HYPER))
    except Exception:
        return False


async def prune(store, now: datetime) -> Optional[int]:
    """Rows older than 100 days out, on plain PostgreSQL (with TimescaleDB its retention policy drops whole chunks; None is returned then)."""
    async with store.pool.acquire() as conn:
        if await _is_hypertable(conn):
            return None
        done = await conn.execute(PRUNE, now - timedelta(days=KEEP_DAYS))
    try:
        return int(str(done).split()[-1])
    except (ValueError, IndexError):
        return 0


async def refresh(store, client, now: Optional[datetime] = None, max_minutes: float = 6.0, clock=time.monotonic) -> dict:
    """One run of lab-candles: fill or extend each F&O share's 5-minute candles until the deadline, then prune what is older than 100 days."""
    from .. import intraday
    from .rsi import _universe
    fixed = now is not None                  # tests pass the time; a real run reads the clock before each call
    now = now or datetime.now(IST)
    deadline = clock() + max_minutes * 60
    universe = await _universe(store)
    if not universe:
        return {"status": "failed", "error": "no F&O shares in the instrument table (refresh-instruments has not run)"}
    stats = await _stats(store, [u["security_id"] for u in universe.values()])
    todo = order(universe, stats)
    fetched = current = busy = failed = bars = 0
    stopped = None
    for sym in todo:
        if clock() > deadline:
            stopped = "deadline"
            break
        sid = universe[sym]["security_id"]
        last = stats.get(sid, (0, None))[1]
        at = now if fixed else datetime.now(IST)
        if up_to_date(last, at):
            current += 1
            continue
        why = await intraday.slot(store.redis, share=True)
        if why == "budget":
            stopped = "budget"
            break
        if why:
            busy += 1
            continue
        start, end = fetch_window(last, at)
        try:
            got = await client.intraday(sid, "NSE_EQ", 5, start, end)
        except DhanError as e:
            log.info("lab-candles: %s: %s", sym, e)
            failed += 1
            continue
        rows = rows_of(sid, got)
        if rows:
            async with store.pool.acquire() as conn:
                await conn.executemany(UPSERT, rows)
        bars += len(rows)
        fetched += 1
    pruned = await prune(store, now if fixed else datetime.now(IST))
    attempted = fetched + failed
    return {"status": "failed" if attempted and not fetched else "ok", "stocks": len(universe), "fetched": fetched, "current": current,
            "busy": busy, "failed": failed, "left": len(todo) - fetched - current - busy - failed, "bars": bars, "stopped": stopped,
            "pruned": pruned}
