"""Database and Redis side of the screens: building the nightly frame, storing the derived tables, the result cache (Postgres + Redis) and usage counts."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import orjson

from .. import prism_screen
from ..prism_candles import expected_session
from ..screener.data import get_table
from . import derive, engine, history as hist_mod, industry as ind_mod, patterns as pat_mod, theme_map, themes
from .registry import ALL, REGISTRY_VERSION, Preset

log = logging.getLogger("finlit.presets")
REDIS_TTL = 36 * 3600
LOCK_TTL = 60
COMPUTE_TIMEOUT = 45
WAIT_S = 10


_NSE: Optional[Dict[str, str]] = None


def nse_industries() -> Dict[str, str]:
    """symbol -> NSE industry (58 names, one level each: the list Sector Pulse uses, finlit_technicals/data/nse_industries.json). A company not in it has no industry."""
    global _NSE
    if _NSE is None:
        path = Path(__file__).resolve().parents[2] / "finlit_technicals" / "data" / "nse_industries.json"
        raw = json.loads(path.read_text(encoding="utf-8")).get("stocks") or {}
        _NSE = {str(k).upper(): v[0] for k, v in raw.items() if v and v[0]}
    return _NSE


async def build_frame(store, persist: bool = False, now: Optional[datetime] = None) -> engine.Frame:
    now = now or datetime.now(timezone.utc)
    as_of = expected_session(now)
    table = await get_table(store)
    prism = prism_screen.cards(await store.prism_cards(None))
    async with store.pool.acquire() as conn:
        overrides = {r["symbol"]: r["industry"] for r in await conn.fetch("SELECT symbol, industry FROM industry_override")}
        listed = {r["symbol"]: ("NSE" if r["nse_code"] else "BSE") for r in await conn.fetch("SELECT symbol, nse_code FROM companies WHERE nse_code <> '' OR bse_code <> ''")}
        hist_rows = [dict(r) for r in await conn.fetch(
            "SELECT as_of, industry, b50, b200, rs3, in_play FROM industry_breadth_daily WHERE as_of < $1 AND as_of IN "
            "(SELECT DISTINCT as_of FROM industry_breadth_daily WHERE as_of < $1 ORDER BY as_of DESC LIMIT $2)", as_of, themes.KEEP_SESSIONS)]
    history_days = await _rating_changes(store, prism, as_of)
    clean = ind_mod.derive(zip(table.symbols, table.industry), overrides)
    nse = nse_industries()
    industry = {s: nse[s] for s in table.symbols if s in nse}      # NSE industry, one level (task 64, fix 6); the site's own cleaned label is still stored in industry_clean
    tags = theme_map.tags_for(table.symbols, table.sector_label)      # found from the Sector LABEL (not the broad macro sector) and the research team's named lists, shown as a column
    pos = table.pos
    ev = themes.evaluate(table, themes.by_nse_industry(table, industry), themes.history_from_rows(hist_rows))      # grouped by the 58 NSE industries (fix 6)
    fr = engine.Frame(table, prism, as_of, tags, industry, ev, listed=listed)
    fr.history_days = history_days
    fr.patterns = await pat_mod.load(store)          # the nightly chart-pattern run (None until the first one has been made)
    if persist:
        await _persist(store, fr, clean, ev, pos)
    return fr


BANDS = ((80, 4), (65, 3), (50, 2), (35, 1))     # Strong, Healthy, Average, Weak; under 35 is Poor (0)


def band_of(score: float) -> int:
    return next((b for lo, b in BANDS if score >= lo), 0)


async def _rating_changes(store, prism: Dict[str, dict], as_of: date) -> int:
    """Puts prism_rise_30d (score change) and prism_band_up (1 or 0) on each company's Prism fields, from the oldest and newest daily Prism history rows of the last
    30 days (consolidated first). A company with fewer than two days keeps both blank. Returns how many days the history used spans (0 when none)."""
    try:
        async with store.pool.acquire() as conn:
            rows = await conn.fetch(
                """WITH d AS (SELECT DISTINCT ON (symbol, day) symbol, day, final FROM prism_history WHERE final IS NOT NULL AND day >= $1::date - 30
                              ORDER BY symbol, day, (statement = 'consolidated') DESC),
                        a AS (SELECT DISTINCT ON (symbol) symbol, day, final FROM d ORDER BY symbol, day ASC),
                        b AS (SELECT DISTINCT ON (symbol) symbol, day, final FROM d ORDER BY symbol, day DESC)
                   SELECT a.symbol, a.final AS f0, b.final AS f1, (b.day - a.day) AS span FROM a JOIN b USING (symbol) WHERE b.day > a.day""", as_of)
    except Exception:
        log.warning("prism history not read: the rating-change fields stay blank", exc_info=True)
        return 0
    span = 0
    for r in rows:
        z = prism.get(r["symbol"])
        if z is None:
            continue
        z["prism_rise_30d"] = round(float(r["f1"]) - float(r["f0"]), 1)
        z["prism_band_up"] = 1 if band_of(float(r["f1"])) > band_of(float(r["f0"])) else 0
        span = max(span, int(r["span"]))
    return span


async def _persist(store, fr, clean, ev, pos) -> None:
    as_of = fr.as_of
    async with store.pool.acquire() as conn:
        async with conn.transaction():
            await conn.executemany("INSERT INTO industry_clean (symbol, raw, clean, rule, updated_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (symbol) DO UPDATE SET raw=$2, clean=$3, rule=$4, updated_at=now()",
                                   [(s, v[0], v[1], v[2]) for s, v in clean.items()])
            syms = sorted(set(fr.momentum) | set(fr.growth))
            await conn.executemany("INSERT INTO preset_scores (symbol, as_of, momentum_score, growth_score, updated_at) VALUES ($1,$2,$3,$4,now()) "
                                   "ON CONFLICT (symbol) DO UPDATE SET as_of=$2, momentum_score=$3, growth_score=$4, updated_at=now()",
                                   [(s, as_of, fr.momentum.get(s), fr.growth.get(s)) for s in syms])
            await conn.execute("DELETE FROM preset_scores WHERE as_of < $1", as_of)
            await conn.execute("DELETE FROM industry_breadth_daily WHERE as_of = $1", as_of)
            await conn.executemany("INSERT INTO industry_breadth_daily (as_of, industry, members, b50, b200, r3, nh, rs3, in_play, state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
                                   themes.stored_rows(as_of, ev))
            await conn.execute("DELETE FROM industry_breadth_daily WHERE as_of NOT IN (SELECT DISTINCT as_of FROM industry_breadth_daily ORDER BY as_of DESC LIMIT $1)", themes.KEEP_SESSIONS)
            await conn.execute("INSERT INTO preset_meta (key, value) VALUES ('caps', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value=$1::jsonb, updated_at=now()",
                               json.dumps({"as_of": as_of.isoformat(), "caps": fr.caps}))


# ------------------------------------------------------------------------------------------------------------------------------ cache
def _rkey(pid: str, ckey: str) -> str:
    return f"presets:v{REGISTRY_VERSION}:{pid}:{ckey}"


async def store_result(store, preset: Preset, body: dict) -> None:
    ckey = engine.chip_key(body["chips"])
    raw = orjson.dumps(body, default=str)
    async with store.pool.acquire() as conn:
        await conn.execute("INSERT INTO preset_results (preset_id, chips, registry, as_of, body, computed_at) VALUES ($1,$2,$3,$4,$5::jsonb,now()) "
                           "ON CONFLICT (preset_id, chips, registry) DO UPDATE SET as_of=$4, body=$5::jsonb, computed_at=now()",
                           preset.id, ckey, REGISTRY_VERSION, date.fromisoformat(body["asOf"]), raw.decode())
    try:
        await store.redis.set(_rkey(preset.id, ckey), raw, ex=REDIS_TTL)
    except Exception:
        log.warning("preset result not cached in Redis")


async def read_cached(store, pid: str, ckey: str) -> Optional[dict]:
    try:
        hit = await store.redis.get(_rkey(pid, ckey))
        if hit:
            return orjson.loads(hit)
    except Exception:
        pass
    async with store.pool.acquire() as conn:
        v = await conn.fetchval("SELECT body FROM preset_results WHERE preset_id=$1 AND chips=$2 AND registry=$3", pid, ckey, REGISTRY_VERSION)
    if v is None:
        return None
    body = json.loads(v) if isinstance(v, str) else v
    try:
        await store.redis.set(_rkey(pid, ckey), orjson.dumps(body), ex=REDIS_TTL)
    except Exception:
        pass
    return body


def same_snapshot(body: dict, snapshot: str) -> bool:
    """A saved list answers only when it was built from the table the universe is serving now; an older one is rebuilt first (a list saved before this stamp existed counts as the same)."""
    have = body.get("snapshot")
    return have is None or have == snapshot


async def get_result(store, preset: Preset, active: List[str]) -> Optional[dict]:
    """The cached answer; on a miss compute it once (a Redis lock keeps concurrent first requests to one computation, bounded by COMPUTE_TIMEOUT).
    None when another worker is computing and did not finish within WAIT_S (the API answers 503 'computing')."""
    ckey = engine.chip_key(active)
    body = await read_cached(store, preset.id, ckey)
    if body is not None:
        return body           # the list built after the close and written to the screen history: served as stored, so the card count, the rows and Added always agree
    lock = f"presets:lock:{preset.id}:{ckey}"
    got = False
    try:
        got = bool(await store.redis.set(lock, "1", nx=True, ex=LOCK_TTL))
    except Exception:
        got = True
    if got:
        try:
            fr = await asyncio.wait_for(build_frame(store), COMPUTE_TIMEOUT)
            body = engine.run(fr, preset, active or [engine.NO_CHIPS])
            await store_result(store, preset, body)
            return body
        finally:
            try:
                await store.redis.delete(lock)
            except Exception:
                pass
    for _ in range(WAIT_S * 2):
        await asyncio.sleep(0.5)
        body = await read_cached(store, preset.id, ckey)
        if body is not None:
            return body
    return None


def nightly_combos(p: Preset) -> List[List[str]]:
    """Chip sets computed every night: the defaults and each single chip on its own (the rest are computed on first use and cached)."""
    base = [c.id for c in p.chips if c.default]
    out = [base]
    for c in p.chips:
        one = sorted(set(base) | {c.id}) if not c.default else [x for x in base if x != c.id]
        if one not in out:
            out.append(one)
    return out


async def log_usage(store, preset_id: str, event: str, plan: str = "gold") -> None:
    try:
        async with store.pool.acquire() as conn:
            await conn.execute("INSERT INTO preset_usage (day, preset_id, event, plan, n) VALUES (CURRENT_DATE,$1,$2,$3,1) ON CONFLICT (day, preset_id, event, plan) DO UPDATE SET n = preset_usage.n + 1",
                               preset_id, event, plan)
    except Exception:
        log.warning("preset usage not logged")


def live_presets() -> List[Preset]:
    return [p for p in ALL if p.status == "live"]


async def refresh_presets(store, settings=None) -> dict:
    """The nightly job: seed top-up, derived tables, every live screen for its common chip sets into the cache."""
    fr = await build_frame(store, persist=True)
    bench_ready = await hist_mod.ensure_bench(store, settings)
    pattern_note: dict = {}
    pattern_failed = ""
    try:       # its own guard: a scan problem never stops the screens below (the founder's rule: one step stopping never stops another)
        previous = fr.patterns
        cov = await pat_mod.wait_for_candles(store, fr.t, fr.as_of)
        if cov["ratio"] < pat_mod.MIN_COVERAGE:       # thin candles would publish thin lists: stop, keep the last saved run, and raise the alarm (the job reports failed)
            log.error("chart-pattern scans NOT published: only %s of %s companies have the %s candle (%.1f%%, needs 98%%)", cov["fresh"], cov["universe"], fr.as_of, 100 * cov["ratio"])
            pattern_failed = f"patterns:candles {cov['fresh']}/{cov['universe']} below 98%"
            pattern_note = {"patternsHeld": True, "patternCoverage": round(cov["ratio"], 4), "patternsSuspended": cov["suspended"]}
        else:
            found = await pat_mod.scan_all(store, fr.t, fr.as_of)
            await pat_mod.save(store, found, previous)
            fr.patterns = found
            pattern_note = {"patternsChecked": found["checked"], "patternHits": {k: len(v) for k, v in found["scans"].items()}, "patternsLeftOut": len(found["left_out"]),
                            "patternsSuspended": found.get("suspended", 0), "patternCoverage": round(cov["ratio"], 4)}
    except Exception as exc:
        log.exception("chart-pattern scans failed; the last saved run stays in use")
        pattern_note = {"patternsError": type(exc).__name__}
    done, failed = 0, ([pattern_failed] if pattern_failed else [])
    kept: list = []
    for p in live_presets():
        if p.kind == "gainers":
            continue            # read from the gainers table the history step fills
        for combo in nightly_combos(p):
            try:
                body = engine.run(fr, p, combo or [engine.NO_CHIPS])
                await store_result(store, p, body)
                kept.append((p, combo or [engine.NO_CHIPS], body))
                done += 1
            except Exception as exc:
                log.exception("preset %s %s failed", p.id, combo)
                failed.append(f"{p.id}:{type(exc).__name__}")
    history_note: dict = {}
    try:        # its own guard again: the history of the lists never stops the lists
        history_note = await hist_mod.record(store, fr, kept)
        history_note.update(await hist_mod.repair_closes(store))
        bench = await hist_mod._bench(store, fr.as_of)
        history_note.update(await hist_mod.gainers(store, fr, bench))
    except Exception as exc:
        log.exception("screen history failed; tonight's lists are still served")
        history_note = {"historyError": type(exc).__name__}
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM preset_results WHERE registry <> $1", REGISTRY_VERSION)
    return {"asOf": fr.as_of.isoformat(), "results": done, "failed": failed, "themeTagged": len(fr.tags), "themeLabelsUnmatched": theme_map.unmatched_labels(fr.t.sector_label),
            "benchReady": bench_ready, "momentum": len(fr.momentum), "growth": len(fr.growth), "inPlay": len(fr.theme_eval.in_play) if fr.theme_eval else 0, **pattern_note, **history_note}
