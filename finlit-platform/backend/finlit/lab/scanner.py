"""Trading Lab, Setup scanner (docs/TRADING-LAB.md "Setup scanner", build order item 4).

Each weekday evening, after the day's candles are stored (job `lab-scanner`, command `refresh-lab-scanner`), every NSE stock's latest daily bar
is checked against the 23 fixed rules of the Strategy backtest (lab/backtest.py, market-lab's rules, MIT): a stock is listed under a rule when
that rule's trigger fires on its latest bar, that is when the bar matches the rule's conditions. The page shows the stocks; it never says what
to do with them.

What is reused, unchanged, from lab/backtest.py: the data join (`load`'s two reads, in batches here, then `join`), the indicators (`features`),
each rule's trigger function and its lower exit level, and, for every match, that rule's past results on that stock (`trades` + `stats`, the
backtest's default exit, net of its costs): the same numbers the Strategy backtest tab shows for that stock and rule.

Universe (decided 27 Nov 2026, measured): every stock whose newest stored daily candle (`daily_candles`) is an NSE candle, F&O stocks first.
A full scan of 2,300 stocks (the size of NSE's equity list; 1,500 sessions each for half of them, 760 for the rest) measured 26 s on one core
with a peak of 229 MB (the worker command, 27 Nov 2026), so the whole list fits far inside the job's 12-minute deadline even on a slower
server; F&O stocks go first so a run that is ever stopped early still covers them. Skipped, with counts: fewer than 400 sessions
(the backtest's own minimum), no candle on the latest session (suspended, or not loaded yet), and a stock whose data could not be read.

No look-ahead: a trigger at bar i uses bars up to i only (the backtest's rule), so the latest bar's answer is the answer the backtest gives at
that bar. Nothing here calls Dhan or any paid source: stored candles and the shared Nifty 50 copy only.

Bounded memory (2 GB server): stocks are read and checked BATCH at a time and only the matches are kept; numpy and pandas load only inside
the functions that need them (the web process never imports them for this module).
"""
from __future__ import annotations

import asyncio
import logging
import math
import time
import zlib
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from ..auth.service import Ctx
from . import backtest as B
from .access import lab_ctx

log = logging.getLogger("finlit.lab.scanner")
router = APIRouter()

VERSION = 1
LATEST_KEY = "lab:scan:latest"          # the newest scan (zlib-compressed JSON)
HISTORY_KEY = "lab:scan:history"        # the matches of the last KEEP_SESSIONS sessions, newest first, for "new today"
LATEST_TTL = 45 * 86400
HISTORY_TTL = 120 * 86400
KEEP_SESSIONS = 20
BATCH = 100                             # stocks read and checked at a time
SPARK = 40                              # closes kept per match for the row's small chart
STALE_DAYS = 30                         # a stock with no candle for this long is out of the universe (delisted), not "skipped"
DEFAULT_MINUTES = 12.0
NO_STORE = {"Cache-Control": "no-store"}
NOTE = "Stocks whose latest daily bar matches each fixed rule's conditions; not a recommendation."


# ------------------------------------------------------------------------------------------------------------------ one stock (pure)
def _num(x: Any, nd: int = 2) -> Optional[float]:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return round(v, nd) if math.isfinite(v) else None


def scan_bars(bars: Dict[str, list], nifty: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    """The rules whose trigger fires on the series' LAST bar. Pure: no I/O. Returns {"bars", "day", "close", "matches": [...]}; each match has
    the rule, the lower exit level and its distance under the close, volume against its 50-session average, the rule's past results on this
    series (the backtest's default exit, net of costs) and the flags under which the backtest would skip a trade from this trigger."""
    import numpy as np
    f = B.features(bars, nifty)
    n = f["n"]
    i = n - 1
    c = float(f["c"][i])
    v = f["v"][i]
    va = f["vavg"][i]
    vol = _num(v, 0)
    avg = _num(va, 0)
    ratio = round(float(v) / float(va), 2) if vol is not None and avg and avg > 0 else None
    chg = np.nan_to_num(f["chg"][max(0, i - 5):])
    big = bool((np.abs(chg) > B.BAD_MOVE).any())
    spark = [_num(x) for x in f["c"][max(0, n - SPARK):]]
    out = []
    for r in B.RULES:
        if r.get("nifty") and not nifty:
            continue                                    # rule 23 cannot fire without Nifty 50's closes (said once, on the rule)
        sig, lower = B.SIGNALS[r["id"]](f)
        if not bool(np.asarray(sig, bool)[i]):
            continue
        lo = _num(np.asarray(lower, dtype=float)[i])
        dist = round((c - lo) / c * 100, 2) if lo is not None and c > 0 else None
        ts, running = B.trades(f, r["id"], B.DEFAULT_EXIT)
        st = B.stats(ts, "rNet")
        flags = []
        if lo is None:
            flags.append("no_lower")
        elif lo >= c:
            flags.append("lower_above")
        elif dist is not None and dist > B.MAX_RISK * 100:
            flags.append("wide_risk")
        if big:
            flags.append("big_move")
        out.append({"rule": r["id"], "lower": lo, "distPct": dist,
                    "past": {"trades": st["trades"], "few": st["few"], "winRate": st["winRate"], "avgR": st["avgR"], "running": running},
                    "flags": flags})
    return {"bars": n, "day": f["date"][i], "close": _num(c), "volume": vol, "volAvg": avg, "volRatio": ratio, "spark": spark, "matches": out}


FLAG_TEXT = {
    "no_lower": "The lower exit level cannot be worked out from the stored bars.",
    "lower_above": "The rule's lower exit level is at or above the close.",
    "wide_risk": "The lower exit level is more than 25% under the close; the backtest skips triggers that wide.",
    "big_move": "A one-day move above 35% in the last six sessions (a split or a bad print); the backtest skips triggers near such a move.",
}


# ------------------------------------------------------------------------------------------------------------------ data
async def bars_day(store) -> Optional[str]:
    """The newest session the candle store holds (candles for at least 50 companies on that day), as the job and the charts read it."""
    from .. import candles
    return await candles.newest_session(store)


async def universe(store, day: str) -> List[dict]:
    """Every stock whose newest candle in the last STALE_DAYS days is an NSE candle, with its name, sector and F&O flag; F&O stocks first, then
    by symbol. A stock with no candle for STALE_DAYS days (delisted) is not in the universe."""
    since = date.fromisoformat(day) - timedelta(days=STALE_DAYS)
    async with store.pool.acquire() as conn:
        recs = await conn.fetch(
            "SELECT DISTINCT ON (d.symbol) d.symbol, d.day, d.exch, c.name, c.sector, c.industry, c.nse_code "
            "FROM daily_candles d LEFT JOIN companies c ON c.symbol = d.symbol WHERE d.day >= $1 ORDER BY d.symbol, d.day DESC", since)
        fno = {r["symbol"] for r in await conn.fetch("SELECT DISTINCT symbol FROM dhan_instruments WHERE exch = 'NSE' AND fno")}
    out = []
    for r in recs:
        if r["exch"] != "NSE":
            continue
        code = r["nse_code"] or r["symbol"]
        out.append({"symbol": r["symbol"], "name": r["name"] or r["symbol"], "sector": r["sector"] or None, "industry": r["industry"] or None,
                    "fno": code in fno or r["symbol"] in fno, "last": r["day"].isoformat()})
    out.sort(key=lambda s: (not s["fno"], s["symbol"]))
    return out


async def load_batch(store, symbols: List[str]) -> Dict[str, Tuple[Dict[str, list], Optional[str]]]:
    """backtest.load for a batch of stocks in two queries (bound parameters only): the report's price series and the exchange candles, joined
    by backtest.join exactly as the Strategy backtest tab joins them. {symbol: (bars, first exchange candle day)}."""
    since = date.today() - timedelta(days=5000)          # backtest.load reads candles.rows_for(..., days=5000)
    async with store.pool.acquire() as conn:
        snaps = await conn.fetch("SELECT DISTINCT ON (symbol) symbol, body FROM snapshots WHERE symbol = ANY($1::text[]) AND section = 'price' "
                                 "ORDER BY symbol, (statement = 'consolidated') DESC, generated_at DESC", symbols)
        recs = await conn.fetch("SELECT symbol, day, open, high, low, close, volume, exch FROM daily_candles WHERE symbol = ANY($1::text[]) AND day >= $2 "
                                "ORDER BY symbol, day", symbols, since)
    daily: Dict[str, Any] = {}
    for r in snaps:
        try:
            daily[r["symbol"]] = (orjson.loads(r["body"]) or {}).get("daily")
        except (orjson.JSONDecodeError, AttributeError):
            daily[r["symbol"]] = None
    rows: Dict[str, List[dict]] = {}
    for r in recs:
        rows.setdefault(r["symbol"], []).append({"day": r["day"], "open": r["open"], "high": r["high"], "low": r["low"], "close": r["close"],
                                                 "volume": r["volume"], "exch": r["exch"]})
    out = {}
    for s in symbols:
        if not daily.get(s) and not rows.get(s):
            continue
        out[s] = B.join(daily.get(s), rows.get(s) or [])
    return out


async def nifty(store, settings=None) -> Optional[Dict[str, float]]:
    """Nifty 50 daily closes for rule 23: the shared index copy the site keeps in Redis (idx:px:NIF50, the copy the backtest reads); when none is
    saved, the backtest's own reader fills it (one index-provider call, never Dhan)."""
    from .. import indices
    try:
        raw = await store.redis.get("idx:px:NIF50")
        if raw:
            rows = indices.shape_levels(orjson.loads(raw).get("v"), 10)["rows"]
            got = {r["d"]: float(r["c"]) for r in rows}
            if got:
                return got
    except Exception as exc:   # noqa: BLE001 - a damaged copy: ask the reader below
        log.warning("lab scanner: Nifty copy not read (%s)", type(exc).__name__)
    if settings is None:
        return None
    from types import SimpleNamespace
    return await B.nifty_closes(SimpleNamespace(state=SimpleNamespace(store=store, settings=settings)))


# ------------------------------------------------------------------------------------------------------------------ the scan
async def scan(store, nifty_closes: Optional[Dict[str, float]], max_minutes: float = DEFAULT_MINUTES, batch: int = BATCH,
               clock: Callable[[], float] = time.monotonic, day: Optional[str] = None, progress: Optional[Callable[[str], None]] = None) -> Dict[str, Any]:
    """Every stock of the universe, BATCH at a time; no new batch is started once `max_minutes` have passed (the result then says it stopped
    early, after how many of how many stocks, and which ones were not reached)."""
    t0 = clock()
    day = day or await bars_day(store)
    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if not day:
        return {"status": "no_data", "version": VERSION, "scannedAt": started, "barsDate": None, "universe": 0}
    stocks = await universe(store, day)
    by_rule: Dict[str, List[dict]] = {r["id"]: [] for r in B.RULES}
    skipped = {"tooShort": 0, "stale": 0, "noData": 0, "failed": 0}
    stale_days: Dict[str, int] = {}
    scanned = 0
    left: List[str] = []
    for k in range(0, len(stocks), batch):
        if clock() - t0 > max_minutes * 60:
            left = [s["symbol"] for s in stocks[k:]]
            break
        chunk = stocks[k:k + batch]
        fresh = []
        for s in chunk:
            if s["last"] < day:
                skipped["stale"] += 1                           # no candle on the latest session: suspended, or not loaded yet
                stale_days[s["last"]] = stale_days.get(s["last"], 0) + 1
            else:
                fresh.append(s)
        try:
            data = await load_batch(store, [s["symbol"] for s in fresh])
        except Exception:
            log.exception("lab scanner: a batch of %d stocks could not be read", len(fresh))
            skipped["failed"] += len(fresh)
            scanned += len(chunk)
            continue
        found = await asyncio.to_thread(_check, fresh, data, nifty_closes, day, skipped)
        for rid, row in found:
            by_rule[rid].append(row)
        scanned += len(chunk)
        if progress:
            progress(f"lab scanner: {scanned} of {len(stocks)} stocks, {sum(len(v) for v in by_rule.values())} matches")
    total = len(stocks)
    stopped = bool(left)
    rules = []
    for r in B.RULES:
        unavailable = bool(r.get("nifty") and not nifty_closes)
        rows = sorted(by_rule[r["id"]], key=lambda x: x["symbol"])     # by symbol: never ranked by result
        rules.append({"id": r["id"], "name": r["name"], "kind": "mean reversion" if r["kind"] == "mr" else "trend",
                      "trigger": r["signal"] + ("" if r["id"] not in B.TREND_RULES else " " + B.TREND), "lowerRule": r["lower"],
                      "volumeRule": bool(r.get("volume")), "available": not unavailable,
                      "note": "Nifty 50's daily closes could not be read for this scan, so this rule could not be checked." if unavailable else None,
                      "count": len(rows), "matches": rows})
    secs = round(clock() - t0, 1)
    out = {"status": "partial" if stopped else "ok", "version": VERSION, "scannedAt": started, "barsDate": day, "universe": total,
           "fno": sum(1 for s in stocks if s["fno"]), "scanned": total - len(left), "checked": total - len(left) - sum(skipped.values()),
           "skipped": skipped, "staleDays": dict(sorted(stale_days.items(), reverse=True)[:5]), "notReached": len(left), "seconds": secs,
           "stoppedEarly": stopped, "exit": B.DEFAULT_EXIT, "exitName": B.EXITS[B.DEFAULT_EXIT][0], "minBars": B.MIN_BARS, "nifty": bool(nifty_closes),
           "rules": rules}
    if stopped:
        out["stoppedNote"] = (f"Stopped early after {total - len(left):,} of {total:,} stocks: the scan reached its {max_minutes:g}-minute time limit. "
                              f"The other {len(left):,} were not checked tonight, so they are missing from every list.")
        out["notReachedSymbols"] = left
    return out


def _check(stocks: List[dict], data: Dict[str, Tuple[Dict[str, list], Optional[str]]], nifty_closes, day: str, skipped: Dict[str, int]) -> List[Tuple[str, dict]]:
    """One batch, in a worker thread: (rule id, row) for every match."""
    found = []
    for s in stocks:
        got = data.get(s["symbol"])
        if not got or not got[0]["t"]:
            skipped["noData"] += 1
            continue
        bars, _first = got
        if len(bars["t"]) < B.MIN_BARS:
            skipped["tooShort"] += 1
            continue
        if bars["t"][-1] != day:
            skipped["stale"] += 1                               # the joined series ends on another day (a zero-volume last candle is dropped)
            continue
        try:
            res = scan_bars(bars, nifty_closes)
        except Exception:   # noqa: BLE001 - one stock's bad data never stops the scan; it is counted
            log.warning("lab scanner: %s not checked", s["symbol"], exc_info=True)
            skipped["failed"] += 1
            continue
        for m in res["matches"]:
            found.append((m["rule"], {"symbol": s["symbol"], "name": s["name"], "sector": s["sector"], "industry": s["industry"], "fno": s["fno"],
                                      "day": res["day"], "close": res["close"], "lower": m["lower"], "distPct": m["distPct"],
                                      "volume": res["volume"], "volAvg": res["volAvg"], "volRatio": res["volRatio"], "bars": res["bars"],
                                      "past": m["past"], "flags": m["flags"], "spark": res["spark"]}))
    return found


# ------------------------------------------------------------------------------------------------------------------ history: "new today"
def mark_new(result: Dict[str, Any], history: List[dict]) -> List[dict]:
    """Marks each match `new` (it did not match that rule on the previous stored session), `also` (it did) or unknown (no earlier session is
    stored, or the stock was not reached on it), and `streak` (sessions in a row it has matched, today included). Returns the history with this
    session in front (an earlier scan of the same session is replaced), at most KEEP_SESSIONS long."""
    day = result["barsDate"]
    older = [h for h in history if h.get("day") and h["day"] < day]
    older.sort(key=lambda h: h["day"], reverse=True)
    prev = older[0] if older else None
    for r in result["rules"]:
        for m in r["matches"]:
            if prev is None or m["symbol"] in set(prev.get("notReached") or []):
                m["new"] = None
            else:
                m["new"] = m["symbol"] not in set((prev.get("rules") or {}).get(r["id"]) or [])
            streak = 1
            for h in older:
                if m["symbol"] in set((h.get("rules") or {}).get(r["id"]) or []):
                    streak += 1
                else:
                    break
            m["streak"] = streak
    result["previousDate"] = prev["day"] if prev else None
    entry = {"day": day, "rules": {r["id"]: [m["symbol"] for m in r["matches"]] for r in result["rules"]},
             "notReached": result.get("notReachedSymbols") or []}
    return [entry] + older[:KEEP_SESSIONS - 1]


async def _get(store, key: str) -> Any:
    raw = await store.redis.get(key)
    return orjson.loads(zlib.decompress(raw)) if raw else None


async def save(store, result: Dict[str, Any]) -> Dict[str, Any]:
    """Stores the scan as the latest and adds its matches to the session history (marking "new today" from the stored previous session)."""
    try:
        history = await _get(store, HISTORY_KEY) or []
    except Exception as exc:   # noqa: BLE001 - a damaged history: "new today" is unknown tonight, never guessed
        log.warning("lab scanner: history not read (%s)", type(exc).__name__)
        history = []
    history = mark_new(result, history)
    await store.redis.set(HISTORY_KEY, zlib.compress(orjson.dumps(history), 6), ex=HISTORY_TTL)
    await store.redis.set(LATEST_KEY, zlib.compress(orjson.dumps(result), 6), ex=LATEST_TTL)
    return result


async def latest(store) -> Optional[Dict[str, Any]]:
    try:
        return await _get(store, LATEST_KEY)
    except Exception as exc:   # noqa: BLE001 - Redis down or a damaged copy: the page says it plainly
        log.warning("lab scanner: latest scan not read (%s)", type(exc).__name__)
        return None


async def has_work(store) -> bool:
    """The job's probe: the candle store holds a newer session than the latest stored scan was made on (candles that came after the evening
    run, the next morning, are scanned the same day)."""
    day = await bars_day(store)
    if not day:
        return False
    got = await latest(store)
    return not got or (got.get("barsDate") or "") < day


async def refresh(store, settings=None, max_minutes: float = DEFAULT_MINUTES, progress: Optional[Callable[[str], None]] = None) -> Dict[str, Any]:
    """The job: scan, store, and return a short summary for the run record."""
    closes = await nifty(store, settings)
    res = await scan(store, closes, max_minutes=max_minutes, progress=progress)
    if res["status"] == "no_data":
        return {"status": "failed", "error": "no session in the candle store (daily_candles is empty or older than 15 days)"}
    await save(store, res)
    summary = {"status": res["status"], "barsDate": res["barsDate"], "universe": res["universe"], "fno": res["fno"], "scanned": res["scanned"],
               "checked": res["checked"], "skipped": res["skipped"], "notReached": res["notReached"], "seconds": res["seconds"],
               "matches": sum(r["count"] for r in res["rules"]), "nifty": res["nifty"]}
    if res["stoppedEarly"]:
        summary["why"] = res["stoppedNote"]
    return summary


# ------------------------------------------------------------------------------------------------------------------ route
def _rules_only() -> List[dict]:
    return [{"id": r["id"], "name": r["name"], "kind": "mean reversion" if r["kind"] == "mr" else "trend",
             "trigger": r["signal"] + ("" if r["id"] not in B.TREND_RULES else " " + B.TREND), "lowerRule": r["lower"], "volumeRule": bool(r.get("volume")),
             "available": True, "note": None, "count": 0, "matches": []} for r in B.RULES]


def answer(got: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not got or not got.get("barsDate"):
        return {"status": "empty", "ready": False, "note": NOTE, "rules": _rules_only(), "flags": FLAG_TEXT,
                "detail": "The scanner has not run yet. It runs each weekday evening once the day's candles are stored (from 19:40 IST), "
                          "and again the next morning if that session's candles came in late."}
    body = {k: v for k, v in got.items() if k != "notReachedSymbols"}
    return {**body, "status": got.get("status", "ok"), "ready": True, "note": NOTE, "flags": FLAG_TEXT, "fewTrades": B.FEW}


@router.get("/api/lab/scanner")
async def setup_scanner(request: Request, ctx: Ctx = Depends(lab_ctx)) -> Response:
    got = await latest(request.app.state.store)
    return Response(content=orjson.dumps(answer(got)), media_type="application/json", headers=NO_STORE)


def words(x: Any) -> Iterable[str]:
    """Every string a reader can see in an answer (dictionary keys are field names, not words shown)."""
    if isinstance(x, dict):
        for v in x.values():
            yield from words(v)
    elif isinstance(x, list):
        for v in x:
            yield from words(v)
    elif isinstance(x, str):
        yield x
