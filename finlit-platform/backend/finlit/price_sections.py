"""The charts of every stored report, brought up to the newest exchange candles once a night (task #394, developer file 37, F1 and W1).

Why: /api/stocks/<symbol>/price serves the stored `price-<range>` sections of the company's report, and those were written only when the whole
report was rebuilt (snapshot.build). A report is rebuilt for a few hundred companies a night (ingest-all) or when somebody opens it, so most
charts stopped on the day their report was last built (25 Nov 2026: 42% of the ready-made lists' charts ended on 20 Nov or earlier, while
`daily_candles` already held 23 Nov). This job rewrites ONLY the price sections, from `daily_candles`, with no provider call:

  * 1M, 6M and 1Y (daily): from the candles. They hold about three years (candles.DEFAULT_DAYS), so the 200-day average is a true one from the
    first day of 1Y.
  * 3Y on daily candles (?range=3Y&grain=daily, W1) is NOT stored (about 92 KB a report): `daily_3y` builds it per request from that one
    company's candles and keeps it in Redis for 30 minutes. This job only sets `dailyAvailable` on the stored weekly 3Y from the candles' coverage.
  * 3Y, 5Y and MAX (weekly): the candles do not reach five years, so these are never rebuilt from the candles alone (that would cut 5Y and MAX
    short). The stored weekly bars strictly before the first full week the candles cover are kept as stored (with their stored averages); the
    weeks from there on are made from the candles (market.weekly, the downsampler snapshot.build uses) with the daily averages read on each
    week's last day. A daily range the candles do not fully cover is joined the same way, at the candles' first day.
  * Adjustment guard: where the kept stored bars meet the candles, the stored close and the candle close of the same day must agree within 2%.
    When they do not (a split or bonus one side has absorbed and the other not), the company is left as it is and counted (`skipped_adjust`):
    its next full rebuild (snapshot.build, which scales the provider's older rows to the candles) puts it right.
  * The stored section's `meta` is kept (the report's own time and version: opening a chart still asks for a full rebuild of an old report,
    api.rebuild_if_old); `technical` is worked out again from the candle closes. No live quote: `provisionalLastBar` is always False (F2).

Gentle with the shared server: the candles and the stored sections are read a chunk of companies at a time (one query each, as candles.bulk),
with a short pause between chunks, and the job steps aside while a visitor waits on a report (the bulk loader's READER_FLAG). Resumable: a
report whose chart already ends on its newest candle is left alone (`current`), so a run stopped at its time box continues where it stopped.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import orjson

from . import candles
from .analytics import indicators
from .normalize import market
from .snapshot import EMA_NAMES, PRICE_RANGES, PRICE_SECTIONS, chart_body, chart_section, daily_3y_covers, ema_lines, range_start

log = logging.getLogger(__name__)

READ_DAYS = 4000          # every stored candle (they start about three years back and grow a session a night)
CHUNK = 50                # companies per read: 50 x about 800 candles plus their six stored charts (about 90 KB of JSON a report): well under 100 MB
PAUSE_S = 0.2             # between chunks: the web server keeps the CPU it needs
ADJUST_LIMIT = 0.02       # stored close against candle close at the join: more than 2% apart = an adjustment one side has not absorbed
STEP_ASIDE_S = 60.0       # at most this long per chunk waiting for a visitor's report to finish
DAILY_RANGES = tuple(label for label, (_, grain) in PRICE_RANGES.items() if grain == "daily")
WEEKLY_RANGES = tuple(label for label, (_, grain) in PRICE_RANGES.items() if grain == "weekly")


class AdjustmentGap(Exception):
    """The stored chart and the candles disagree by more than ADJUST_LIMIT on the same day where they are joined."""


def history_from(rows: Dict[str, Any]) -> Dict[str, Any]:
    """candles.bulk's arrays in snapshot.build's history shape (prices to two decimals, as normalize.market.price_history keeps them)."""
    r2 = lambda v: round(float(v), 2) if v is not None else None
    return {"t": list(rows["t"]), "o": [r2(v) for v in rows["o"]], "h": [r2(v) for v in rows["h"]], "l": [r2(v) for v in rows["l"]],
            "c": [r2(v) for v in rows["c"]], "v": [int(v) if v is not None else None for v in rows["v"]], "removedBadTicks": []}


def _week(day: str) -> Tuple[int, int]:
    return date.fromisoformat(day).isocalendar()[:2]


def _first_full_week(first: str) -> str:
    """The Monday of the first ISO week the candles cover from its start: the candles' own week when they start on a Monday, else the next."""
    d = date.fromisoformat(first)
    return (d if d.weekday() == 0 else d + timedelta(days=7 - d.weekday())).isoformat()


def _check_join(stored: dict, hist: dict) -> None:
    """The stored close and the candle close of the same day, at the earliest day both hold (the one nearest the join), must agree within 2%."""
    closes = dict(zip(hist["t"], hist["c"]))
    for t, c in zip(stored.get("t") or [], stored.get("c") or []):
        cc = closes.get(t)
        if cc is None or c is None:
            continue
        if cc <= 0 or abs(c / cc - 1) > ADJUST_LIMIT:
            raise AdjustmentGap(f"{t}: stored {c} against candle {cc}")
        return


def joined_section(stored: Optional[dict], hist: dict, emas: dict, label: str, grain: str, meta: dict, technical: dict,
                   source: Optional[str]) -> dict:
    """One chart section from the candles, with the stored bars that come before the candles kept in front of them (see the module text)."""
    fresh = chart_section(hist, emas, label, grain, meta, technical, source)
    old = (stored or {}).get("series") or {}
    if not old.get("t") or not hist["t"]:
        return fresh
    last_day = date.fromisoformat(hist["t"][-1])
    start = range_start(label, last_day, None) if PRICE_RANGES[label][0] else None
    start_iso = start.isoformat() if start else None
    cut = hist["t"][0] if grain == "daily" else _first_full_week(hist["t"][0])
    keep = [i for i, t in enumerate(old["t"]) if t < cut and (start_iso is None or t >= start_iso)]
    if not keep:
        # The candles cover the whole range (1M, 6M, 1Y and 3Y normally): the section is the candles' own, a stored average fills only the
        # candles' warm-up (the first 199 days of a 200-day average) on the same day or week, and only when the two are on one scale.
        try:
            _check_join(old, hist)
        except AdjustmentGap:
            return fresh
        return _fill_warmup(fresh, old, grain)
    _check_join(old, hist)
    part = market.slice_since(hist, cut)
    series = part if grain == "daily" else market.weekly(part)
    body = _fill_warmup({"series": chart_body(series, emas)}, old, grain)["series"]

    def column(src: dict, key: str) -> list:
        n = len(src["t"])
        if isinstance(src.get(key), list) and len(src[key]) == n:
            return src[key]
        return list(src["c"]) if key in ("o", "h", "l") else [None] * n     # a close-only stored week draws as a flat candle
    out = {key: [column(old, key)[i] for i in keep] + column(body, key)
           for key in ("t", "o", "h", "l", "c", "v", *EMA_NAMES) if key in old or key in body}
    first = date.fromisoformat(out["t"][0])
    return {**fresh, "series": out, "startsAt": out["t"][0], "complete": label == "MAX" or bool(start and first <= start + timedelta(days=7))}


def _fill_warmup(section: dict, old: dict, grain: str) -> dict:
    """An average the candles cannot give yet (fewer candles than its window before that day) takes the stored value of the same day (daily)
    or the same ISO week (weekly); one the candles give always wins."""
    series = section["series"]
    key_of = (lambda t: t) if grain == "daily" else _week
    for name in EMA_NAMES:
        vals = series.get(name) or []
        if not vals or all(v is not None for v in vals) or name not in old:
            continue
        stored = {key_of(t): v for t, v in zip(old["t"], old[name]) if v is not None}
        series[name] = [v if v is not None else stored.get(key_of(t)) for t, v in zip(series["t"], vals)]
    return section


def build(stored: Dict[str, dict], rows: Dict[str, Any], meta: dict) -> Dict[str, Optional[dict]]:
    """{section name: body} for one report: its stored price sections and its stored candles (candles.bulk's arrays).
    Raises AdjustmentGap when the stored chart and the candles cannot be joined."""
    hist = history_from(rows)
    source = rows.get("exch")
    technical = indicators.technical_snapshot(hist["c"])
    emas = ema_lines(hist)
    out: Dict[str, Optional[dict]] = {}
    for label in DAILY_RANGES:
        out[f"price-{label}"] = joined_section(stored.get(f"price-{label}"), hist, emas, label, "daily", meta, technical, source)
    for label in WEEKLY_RANGES:
        out[f"price-{label}"] = joined_section(stored.get(f"price-{label}"), hist, emas, label, "weekly", meta, technical, source)
    # D on 3Y (answered on demand, daily_3y) is offered only when the candles cover as much as the weekly 3Y does
    weekly3 = out["price-3Y"]["series"]["t"]
    out["price-3Y"]["dailyAvailable"] = daily_3y_covers(hist["t"], weekly3[0] if weekly3 else None)
    return out


def is_current(stored: Dict[str, dict], last_candle: str) -> bool:
    """The report's charts already end on its newest candle, written by this job or by a rebuild of today's code (resumable runs skip it)."""
    one = stored.get("price-1M") or {}
    return (one.get("priceAsOf") == last_candle and one.get("provisionalLastBar") is False and "dailyAvailable" in (stored.get("price-3Y") or {})
            and all(name in stored for name in PRICE_SECTIONS))


# ---------------------------------------------------------------- W1: 3Y on daily candles, on demand

DAILY_3Y_TTL = 1800       # seconds an answer is kept in Redis (the house's small caches: 30 minutes)
DAILY_3Y_NONE = b"-"      # kept in place of an answer when the candles do not cover 3Y: the weekly 3Y is served, without a query each time


def daily_3y_key(symbol: str, statement: str, weekly_etag: str) -> str:
    """Keyed by the stored weekly 3Y's etag: when the nightly job or a rebuild rewrites the charts, the next request builds a new answer."""
    return f"p3yd:{symbol.upper()}:{statement}:{weekly_etag.strip(chr(34))}"


def etag_of(body: bytes) -> str:
    return '"' + hashlib.sha1(body).hexdigest()[:20] + '"'  # nosec B324 - cache validator, not security


async def daily_3y(store, symbol: str, statement: str, weekly: Tuple[bytes, str]) -> Optional[Tuple[bytes, str]]:
    """(body, etag) of the 3Y chart on daily candles for one company, or None when its candles do not cover as much as the stored weekly 3Y
    (`weekly`: that section's stored (body, etag)); the caller then serves the weekly 3Y. Built from that one company's daily_candles (one
    indexed query) with the chart code the stored sections use, the weekly 3Y's meta, no live quote; kept in Redis for DAILY_3Y_TTL."""
    key = daily_3y_key(symbol, statement, weekly[1])
    try:
        hit = await store.redis.get(key)
    except Exception:
        hit = None
    if hit is not None:
        return None if hit == DAILY_3Y_NONE else (hit, etag_of(hit))
    rows = await candles.rows_for(store, symbol, READ_DAYS)
    body: Optional[bytes] = None
    if rows:
        hist = history_from({"t": [r["day"].isoformat() for r in rows], "o": [r["open"] for r in rows], "h": [r["high"] for r in rows],
                             "l": [r["low"] for r in rows], "c": [r["close"] for r in rows], "v": [r["volume"] for r in rows]})
        stored = orjson.loads(weekly[0])
        wt = (stored.get("series") or {}).get("t") or []
        if daily_3y_covers(hist["t"], wt[0] if wt else None):
            section = chart_section(hist, ema_lines(hist), "3Y", "daily", stored.get("meta") or {}, indicators.technical_snapshot(hist["c"]), rows[-1]["exch"])
            body = orjson.dumps(section)
    try:
        await store.redis.set(key, body if body is not None else DAILY_3Y_NONE, ex=DAILY_3Y_TTL)
    except Exception:   # nosec B110 - the answer is still served; the next request builds it again
        pass
    return (body, etag_of(body)) if body is not None else None


# ---------------------------------------------------------------- re-check 28 Nov: a chart before the company's report exists

FROM_CANDLES_TTL = 1800     # seconds an answer is kept in Redis (as DAILY_3Y_TTL)


def from_candles_key(symbol: str, statement: str, label: str, daily: bool) -> str:
    return f"pfc:{symbol.upper()}:{statement}:{label}:{'d' if daily else 'r'}"


async def from_candles(store, symbol: str, statement: str, label: str, daily: bool = False) -> Optional[Tuple[bytes, str]]:
    """(body, etag) of one chart section built only from the company's exchange candles, for a company whose report is not built yet, or None
    when it has no candles. The founder's check of 28 Nov: AJMERA and AGARWALEYE were on the ready-made lists (built from these candles) but
    their charts waited minutes on a report build the busy queue kept refusing (429). The chart code is the stored sections' (chart_section);
    `daily` answers 3Y on daily candles (the D button). 5Y and MAX hold what the candles reach (about three years; `complete` says so)."""
    if label not in PRICE_RANGES:
        return None
    key = from_candles_key(symbol, statement, label, daily)
    try:
        hit = await store.redis.get(key)
    except Exception:
        hit = None
    if hit is not None:
        return None if hit == DAILY_3Y_NONE else (hit, etag_of(hit))
    rows = await candles.rows_for(store, symbol, READ_DAYS)
    body: Optional[bytes] = None
    if rows:
        hist = history_from({"t": [r["day"].isoformat() for r in rows], "o": [r["open"] for r in rows], "h": [r["high"] for r in rows],
                             "l": [r["low"] for r in rows], "c": [r["close"] for r in rows], "v": [r["volume"] for r in rows]})
        grain = "daily" if daily and label == "3Y" else PRICE_RANGES[label][1]
        meta = {"symbol": symbol.upper(), "statement": statement, "fromCandles": True}
        section = chart_section(hist, ema_lines(hist), label, grain, meta, indicators.technical_snapshot(hist["c"]), rows[-1]["exch"])
        if label == "3Y" and grain == "weekly":
            wt = section["series"]["t"]
            section["dailyAvailable"] = daily_3y_covers(hist["t"], wt[0] if wt else None)
        body = orjson.dumps(section)
    try:
        await store.redis.set(key, body if body is not None else DAILY_3Y_NONE, ex=FROM_CANDLES_TTL)
    except Exception:   # nosec B110 - the answer is still served; the next request builds it again
        pass
    return (body, etag_of(body)) if body is not None else None


def _note(names: List[str], text: str, limit: int = 40) -> None:
    if len(names) < limit:
        names.append(text)


async def _step_aside(store) -> None:
    """Wait (at most STEP_ASIDE_S) while a visitor is waiting on a report, as the bulk loader does (worker._step_aside)."""
    waited = 0.0
    while waited < STEP_ASIDE_S:
        try:
            if not await store.redis.exists(store.READER_FLAG):
                return
        except Exception:
            return
        await asyncio.sleep(2.0)
        waited += 2.0


async def has_work(store) -> bool:
    """The job's probe: refresh-candles has stored candles since this job last ran (a candle run that was continued after its time box, a
    morning catch-up), so the charts can move again. Two rows of mf_meta: cheap."""
    async with store.pool.acquire() as conn:
        recs = {r["key"]: r["at"] for r in await conn.fetch("SELECT key, value->>'at' AS at FROM mf_meta WHERE key = ANY($1::text[])",
                                                             ["run:refresh-candles", "run:refresh-price-sections"])}
    loaded, drawn = recs.get("run:refresh-candles"), recs.get("run:refresh-price-sections")
    return bool(loaded) and (not drawn or loaded > drawn)


async def _reports(store, symbols: Optional[List[str]]) -> List[Tuple[str, str]]:
    """(symbol, statement) of every stored report (its summary is stored), symbol order."""
    async with store.pool.acquire() as conn:
        if symbols:
            recs = await conn.fetch("SELECT symbol, statement FROM snapshots WHERE section = 'summary' AND symbol = ANY($1::text[]) ORDER BY symbol, statement",
                                    [s.upper() for s in symbols])
        else:
            recs = await conn.fetch("SELECT symbol, statement FROM snapshots WHERE section = 'summary' ORDER BY symbol, statement")
    return [(r["symbol"], r["statement"]) for r in recs]


async def _stored(store, symbols: List[str]) -> Dict[Tuple[str, str], Dict[str, dict]]:
    """The stored price sections and the summary's meta of these companies, one query."""
    out: Dict[Tuple[str, str], Dict[str, dict]] = {}
    async with store.pool.acquire() as conn:
        recs = await conn.fetch("SELECT symbol, statement, section, CASE WHEN section = 'summary' THEN (body::jsonb -> 'meta')::text ELSE body END AS body "
                                "FROM snapshots WHERE symbol = ANY($1::text[]) AND section = ANY($2::text[])", symbols, [*PRICE_SECTIONS, "summary"])
    for r in recs:
        try:
            out.setdefault((r["symbol"], r["statement"]), {})[r["section"]] = orjson.loads(r["body"])
        except Exception:   # nosec B112 - an unreadable stored section is rebuilt from the candles
            continue
    return out


async def refresh(store, symbols: Optional[List[str]] = None, chunk: int = CHUNK, pause_s: float = PAUSE_S, force: bool = False,
                  max_minutes: Optional[float] = None) -> dict:
    """Rewrite the price sections of every stored report that has candles. Returns the counts for the log and the job's record:
    companies (reports looked at), written, current (already at their newest candle; with force they are written too), no_candles, behind (its
    newest candle is older than the newest session in daily_candles: a holiday for its exchange, a suspended or delisted company; written all
    the same), skipped_adjust (left for the next full rebuild, see the module text), failed, left (not reached before max_minutes)."""
    started = time.monotonic()
    pairs = await _reports(store, symbols)
    async with store.pool.acquire() as conn:
        newest = await conn.fetchval("SELECT max(day) FROM daily_candles")
    newest_iso = newest.isoformat() if newest else None
    out = {"companies": len(pairs), "written": 0, "current": 0, "no_candles": 0, "behind": 0, "skipped_adjust": 0, "failed": 0, "left": 0,
           "newestSession": newest_iso, "adjustSymbols": [], "failedSymbols": []}
    by_symbol: Dict[str, List[str]] = {}
    for sym, st in pairs:
        by_symbol.setdefault(sym, []).append(st)
    syms = list(by_symbol)
    for i in range(0, len(syms), chunk):
        if max_minutes is not None and time.monotonic() - started > max_minutes * 60:
            out["left"] = sum(len(by_symbol[s]) for s in syms[i:])
            break
        part = syms[i:i + chunk]
        await _step_aside(store)
        hist = await candles.bulk(store, part, READ_DAYS)
        stored = await _stored(store, part)
        for sym in part:
            rows = hist.get(sym)
            for st in by_symbol[sym]:
                if not rows or not rows["t"]:
                    out["no_candles"] += 1
                    continue
                if newest_iso and rows["t"][-1] < newest_iso:
                    out["behind"] += 1
                have = stored.get((sym, st)) or {}
                if not force and is_current(have, rows["t"][-1]):
                    out["current"] += 1
                    continue
                meta = next((have[n]["meta"] for n in ("price-1Y", "price-1M", "price-MAX") if isinstance((have.get(n) or {}).get("meta"), dict)), None) \
                    or have.get("summary") or {"symbol": sym, "statement": st}
                try:
                    await store.save_sections(sym, st, build(have, rows, meta))
                    out["written"] += 1
                except AdjustmentGap as gap:
                    out["skipped_adjust"] += 1
                    _note(out["adjustSymbols"], f"{sym}: {gap}")
                except Exception:   # one company never stops the others
                    log.exception("price sections not written for %s %s", sym, st)
                    out["failed"] += 1
                    _note(out["failedSymbols"], sym)
        await asyncio.sleep(pause_s)
    out["seconds"] = round(time.monotonic() - started, 1)
    log.info("refresh-price-sections: %s", {k: v for k, v in out.items() if not isinstance(v, list)})
    return out
