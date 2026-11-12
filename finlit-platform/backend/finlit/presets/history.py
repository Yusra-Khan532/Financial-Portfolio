"""Screen history and Top gainers (task #64, screen-history-spec.md).

Every night, after the screens are built, each screen's list is written down: the session's list, the spells (when a company joined and when it left, and why, in words
without numbers) and, for each page, the Top gainers of Today, This week and This month. The page reads these stored rows; it never works them out. A stored day is
never edited: a run for a session is replaced only by the same night's own re-run."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

from . import engine

log = logging.getLogger("finlit.history")
WINDOWS = {"day": 1, "week": 5, "month": 21}
SHOW_DAYS = 62                  # about two months: what the page can reach
KEEP_DAYS = 400                 # what the database keeps (the page shows two months; the rest costs little and lets the picker reach further later)
GAINERS_MAX = 20
MIN_RISE = 0.1
SPLIT_DOWN, SPLIT_UP = -40.0, 60.0     # a one-session move beyond this is not trusted unless it is an adjusted split: that company's figures stop and are logged

# the reason a company left a screen, in the screen's own words; never a number. The first rule (in the screen's order) the company no longer meets decides.
REASONS: Tuple[Tuple[str, str], ...] = (
    ("market cap", "its market cap fell below the screen's size"), ("full year", "it no longer has a full year of prices"), ("1-year return", "its one-year run went past the screen's limit"),
    ("finlit iq", "its FinLit IQ weakened"), ("prism score", "its Prism rating weakened"), ("technical", "its trend weakened"), ("trend", "its trend weakened"),
    ("quality", "its Quality score weakened"), ("growth", "its Growth score weakened"), ("profitab", "its Profitability score weakened"), ("balance", "its Balance sheet score weakened"),
    ("risk", "its Risk score weakened"), ("valuation", "its Valuation score moved out of range"), ("52-week high", "it fell further below its 52-week high"),
    ("below the high", "it fell further below its 52-week high"), ("breakout", "the breakout is no longer recent"), ("9-day", "it moved away from its 9-day average"),
    ("20-day", "it moved away from its 20-day average"), ("rsi", "its momentum moved out of range"), ("uptrend", "its uptrend ended"), ("rating", "its rating changed"),
)
RULES_UPDATED = "screen rules updated"
GENERIC = "it no longer meets the screen's rules"


def reason_words(label: str) -> str:
    low = label.lower()
    return next((w for k, w in REASONS if k in low), GENERIC)


def list_hash(symbols: Sequence[str]) -> str:
    return hashlib.sha256("|".join(symbols).encode()).hexdigest()[:16]


def _pct(a: Optional[float], b: Optional[float]) -> Optional[float]:
    return None if not a or not b else round((b / a - 1.0) * 100.0, 2)


async def ensure_bench(store, settings) -> bool:
    """NIFTY 500 levels in the saved index copy the site keeps (`idx:px:NIF500`). That copy is only made while a visitor looks at the index, so the night's job makes it when it is
    missing; without it the NIFTY 500 columns were blank on every row. True when the copy is there."""
    try:
        if await store.redis.get("idx:px:NIF500"):
            return True
    except Exception:
        return False
    if settings is None:
        return False
    try:
        import time
        from types import SimpleNamespace
        from .. import indices
        app = SimpleNamespace(state=SimpleNamespace(settings=settings))
        raw = await indices._fetch_levels(app, "NIF500")
        if raw is None:
            return False
        await store.redis.set("idx:px:NIF500", json.dumps({"t": time.time(), "v": raw}), ex=indices.KEEP)
        return True
    except Exception:
        log.warning("NIFTY 500 history could not be fetched for the screen history", exc_info=True)
        return False


async def baseline_session(store) -> Optional[date]:
    """The first session any screen was stored for (11 Nov 2026): the companies already on a list that day were not seen joining it, so they are marked as the start of the history."""
    async with store.pool.acquire() as conn:
        return await conn.fetchval("SELECT min(session) FROM screen_runs")


async def _bench(store, as_of: date) -> Dict[str, float]:
    """NIFTY 500 closes kept night by night in preset_meta('bench'), topped up from the saved index history when it is there."""
    try:
        async with store.pool.acquire() as conn:
            row = await conn.fetchval("SELECT value FROM preset_meta WHERE key = 'bench'")
        have: Dict[str, float] = (json.loads(row) if isinstance(row, str) else row) or {}
    except Exception:
        have = {}
    try:
        raw = await store.redis.get("idx:px:NIF500")
        rows = (((json.loads(raw)["v"] if raw else None) or {}).get("rows")) or []
        for r in rows[-90:]:
            d, c = str((r or {}).get("quote_date") or "")[:10], (r or {}).get("close_price")
            if len(d) == 10 and c not in (None, ""):
                have[d] = float(c)
    except Exception:
        log.warning("NIFTY 500 history not read for the screen history", exc_info=True)
    cut = (as_of - timedelta(days=KEEP_DAYS)).isoformat()
    have = {d: c for d, c in have.items() if d >= cut}
    try:
        async with store.pool.acquire() as conn:
            await conn.execute("INSERT INTO preset_meta (key, value) VALUES ('bench', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value=$1::jsonb, updated_at=now()", json.dumps(have))
    except Exception:
        pass
    return have


def _bench_at(bench: Dict[str, float], day: str) -> Optional[float]:
    """The closest close on or before the day (a holiday uses the last close)."""
    ds = [d for d in bench if d <= day]
    return bench[max(ds)] if ds else None


async def record(store, fr, results: Sequence[Tuple[Any, List[str], dict]]) -> dict:
    """Write tonight's lists and spells for every screen (`results`: preset, active chips, the engine's answer). Returns counts for the job's summary."""
    session = fr.as_of
    sessions_done = spells_opened = spells_closed = 0
    price = {s: fr.get(i, "price") for i, s in enumerate(fr.symbols)}
    for preset, active, body in results:
        rows = body.get("exportRows") or body.get("rows") or []
        if not rows and preset.kind in ("blocked", "quickview"):
            continue
        ckey = engine.chip_key(active)
        syms = [r["symbol"] for r in rows]
        async with store.pool.acquire() as conn:
            async with conn.transaction():
                prev = await conn.fetchrow("SELECT session, registry FROM screen_runs WHERE preset_id=$1 AND chips=$2 AND session < $3 ORDER BY session DESC LIMIT 1", preset.id, ckey, session)
                await conn.execute("DELETE FROM screen_snapshots WHERE preset_id=$1 AND chips=$2 AND session=$3", preset.id, ckey, session)
                await conn.execute("DELETE FROM screen_runs WHERE preset_id=$1 AND chips=$2 AND session=$3", preset.id, ckey, session)
                await conn.execute("INSERT INTO screen_runs (preset_id, chips, session, registry, n, list_hash) VALUES ($1,$2,$3,$4,$5,$6)", preset.id, ckey, session, body.get("version") or 0, len(rows), list_hash(syms))
                await conn.executemany("INSERT INTO screen_snapshots (preset_id, chips, session, symbol, rank, close, row) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",
                                       [(preset.id, ckey, session, r["symbol"], int(r.get("rank") or r.get("position") or i), price.get(r["symbol"]), json.dumps(r, default=str)) for i, r in enumerate(rows, 1)])
                open_rows = await conn.fetch("SELECT id, symbol, added_on FROM screen_spells WHERE preset_id=$1 AND chips=$2 AND left_on IS NULL", preset.id, ckey)
                is_open = {r["symbol"]: r for r in open_rows}
                now = set(syms)
                new = [s for s in syms if s not in is_open]
                gone = [r for r in open_rows if r["symbol"] not in now]
                if new:
                    await conn.executemany("INSERT INTO screen_spells (preset_id, chips, symbol, added_on, close_added, registry_added) VALUES ($1,$2,$3,$4,$5,$6)",
                                           [(preset.id, ckey, s, session, price.get(s), body.get("version") or 0) for s in new])
                    spells_opened += len(new)
                if gone:
                    changed = prev is not None and int(prev["registry"]) != int(body.get("version") or 0)
                    why = await _reasons(fr, preset, active, [g["symbol"] for g in gone]) if not changed else {}
                    for g in gone:
                        n_on = await conn.fetchval("SELECT count(*) FROM screen_runs WHERE preset_id=$1 AND chips=$2 AND session >= $3 AND session < $4", preset.id, ckey, g["added_on"], session)
                        await conn.execute("UPDATE screen_spells SET left_on=$1, left_reason=$2, close_left=$3, sessions_on=$4, registry_left=$5 WHERE id=$6",
                                           session, RULES_UPDATED if changed else why.get(g["symbol"], GENERIC), price.get(g["symbol"]), int(n_on or 0), body.get("version") or 0, g["id"])
                    spells_closed += len(gone)
        sessions_done += 1
    async with store.pool.acquire() as conn:
        cut = session - timedelta(days=KEEP_DAYS)
        await conn.execute("DELETE FROM screen_snapshots WHERE session < $1", cut)
        await conn.execute("DELETE FROM screen_runs WHERE session < $1", cut)
        await conn.execute("DELETE FROM gainers WHERE session < $1", cut)
    return {"historyScreens": sessions_done, "spellsOpened": spells_opened, "spellsClosed": spells_closed}


async def _reasons(fr, preset, active, symbols: Sequence[str]) -> Dict[str, str]:
    """For each company that left: the first rule of the screen, in the screen's own order, that it no longer meets, in words."""
    out: Dict[str, str] = {}
    try:
        if preset.kind == "pattern":
            return {s: "the pattern ended" for s in symbols}
        if preset.kind == "themes":
            return {s: "its group is no longer in play" for s in symbols}
        cfg = engine.Config(preset, active)
        rules = engine.build_rules(fr, cfg)
        pos = fr.t.pos
        for s in symbols:
            i = pos.get(s)
            if i is None:
                out[s] = "it is no longer listed in the screener universe"
                continue
            miss = next((r for r in rules if not r.ok[i]), None)
            out[s] = reason_words(miss.label) if miss else "it dropped out of the ranked list"
    except Exception:
        log.warning("leave reasons not worked out for %s", preset.id, exc_info=True)
    return out


async def gainers(store, fr, bench: Dict[str, float]) -> dict:
    """Top gainers for both pages and the three windows at tonight's session, stored in `gainers`."""
    from .registry import ALL as PRESETS      # every screen, the Prism basics too
    session = fr.as_of
    price = {s: fr.get(i, "price") for i, s in enumerate(fr.symbols)}
    order = {p.id: n for n, p in enumerate(PRESETS)}
    names = {p.id: p.name for p in PRESETS}
    stored = 0
    async with store.pool.acquire() as conn:
        for page in ("basic", "advanced"):
            ids = [p.id for p in PRESETS if p.tab == page and p.kind not in ("blocked", "quickview", "gainers")]
            days = [r["session"] for r in await conn.fetch("SELECT DISTINCT session FROM screen_runs WHERE preset_id = ANY($1::text[]) AND session < $2 ORDER BY session DESC LIMIT 21", ids, session)]
            base = await conn.fetchval("SELECT min(session) FROM screen_runs")
            days = [d for d in days if base is None or d > base]          # the baseline session's companies were already on a list: only companies that joined after it count
            for win, k in WINDOWS.items():
                take = days[:k]
                await conn.execute("DELETE FROM gainers WHERE page=$1 AND win=$2 AND session=$3", page, win, session)
                if not take:
                    continue
                spells = await conn.fetch("SELECT preset_id, chips, symbol, added_on, close_added, left_on FROM screen_spells WHERE preset_id = ANY($1::text[]) AND added_on = ANY($2::date[]) ORDER BY added_on, symbol", ids, take)
                first: Dict[str, dict] = {}
                for sp in sorted(spells, key=lambda r: (r["added_on"], order.get(r["preset_id"], 9999))):
                    sym = sp["symbol"]
                    if sym not in first:
                        first[sym] = {"sp": sp, "other": []}
                    elif names.get(sp["preset_id"]) not in [names.get(first[sym]["sp"]["preset_id"])] + first[sym]["other"]:
                        first[sym]["other"].append(names.get(sp["preset_id"]))
                rows = []
                for sym, d in first.items():
                    sp = d["sp"]
                    c0, c1 = sp["close_added"], price.get(sym)
                    since = _pct(c0, c1)
                    if since is None or since < MIN_RISE or since > SPLIT_UP * 10:
                        continue
                    best = await conn.fetchval("SELECT max(close) FROM screen_snapshots WHERE symbol=$1 AND session > $2 AND session <= $3", sym, sp["added_on"], session)
                    on = await conn.fetchval("SELECT count(*) FROM screen_spells WHERE preset_id=$1 AND chips=$2 AND symbol=$3 AND left_on IS NULL", sp["preset_id"], sp["chips"], sym)
                    left = await conn.fetchval("SELECT max(left_on) FROM screen_spells WHERE preset_id=$1 AND chips=$2 AND symbol=$3 AND added_on=$4", sp["preset_id"], sp["chips"], sym, sp["added_on"])
                    i = fr.t.pos.get(sym)
                    b0, b1 = _bench_at(bench, sp["added_on"].isoformat()), _bench_at(bench, session.isoformat())
                    rows.append({"symbol": sym, "name": fr.t.name[i] if i is not None else sym, "joined": sp["added_on"].isoformat(), "screen": names.get(sp["preset_id"]), "screenId": sp["preset_id"],
                                 "others": d["other"], "closeJoined": round(c0, 2) if c0 else None, "since": since, "bench": _pct(b0, b1),
                                 "highest": _pct(c0, max(best, c1) if best else c1), "stillOn": bool(on), "leftOn": None if on else (left.isoformat() if left else None),
                                 "sector": fr.t.sector_label[i] if i is not None else None, "market_cap": fr.get(i, "market_cap") if i is not None else None})
                rows.sort(key=lambda r: (-r["since"], r["symbol"]))
                rows = rows[:GAINERS_MAX]
                await conn.executemany("INSERT INTO gainers (page, win, session, rank, row) VALUES ($1,$2,$3,$4,$5::jsonb)", [(page, win, session, n, json.dumps(r, default=str)) for n, r in enumerate(rows, 1)])
                stored += len(rows)
    return {"gainersStored": stored}


# ---------------------------------------------------------------------------------------------------------------- reading
def _iso(d: Any) -> Optional[str]:
    return d.isoformat() if hasattr(d, "isoformat") else (str(d) if d else None)


async def sessions(store, preset_id: str, chips: str) -> List[dict]:
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT session, n, registry FROM screen_runs WHERE preset_id=$1 AND chips=$2 AND session >= CURRENT_DATE - $3::int ORDER BY session DESC", preset_id, chips, SHOW_DAYS)
    out, prev = [], None
    for r in reversed(rows):
        out.append({"date": _iso(r["session"]), "count": r["n"], "rulesUpdated": prev is not None and prev != r["registry"]})
        prev = r["registry"]
    return list(reversed(out))


async def gainer_sessions(store, page: str, win: str) -> List[dict]:
    """The closes Top gainers can be shown as of (the last 2 months, latest first), for the As on picker."""
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT session, count(*) AS n FROM gainers WHERE page=$1 AND win=$2 AND session >= CURRENT_DATE - $3::int GROUP BY session ORDER BY session DESC", page, win, SHOW_DAYS)
    return [{"date": _iso(r["session"]), "count": r["n"], "rulesUpdated": False} for r in rows]


async def enrich(store, preset_id: str, chips: str, rows: List[dict], latest: Dict[str, float], bench: Dict[str, float], session: date) -> None:
    """Added and Since added on every row (in place)."""
    if not rows:
        return
    base = await baseline_session(store)
    async with store.pool.acquire() as conn:
        sp = {r["symbol"]: r for r in await conn.fetch("SELECT symbol, added_on, close_added FROM screen_spells WHERE preset_id=$1 AND chips=$2 AND left_on IS NULL", preset_id, chips)}
    b1 = _bench_at(bench, session.isoformat())
    for r in rows:
        s = sp.get(r["symbol"])
        if not s:
            continue
        r["added_on"] = _iso(s["added_on"])
        if base is not None and s["added_on"] == base:
            r["added_baseline"] = True      # "11 Nov (start)": already on the list when FinLit began storing lists
        r["since_added_pct"] = _pct(s["close_added"], latest.get(r["symbol"]))
        r["bench_since_added_pct"] = _pct(_bench_at(bench, s["added_on"].isoformat()), b1)


async def snapshot(store, preset_id: str, chips: str, as_on: date) -> Optional[dict]:
    async with store.pool.acquire() as conn:
        run = await conn.fetchrow("SELECT session, n, registry FROM screen_runs WHERE preset_id=$1 AND chips=$2 AND session=$3", preset_id, chips, as_on)
        if not run:
            return None
        rows = await conn.fetch("SELECT symbol, rank, close, row FROM screen_snapshots WHERE preset_id=$1 AND chips=$2 AND session=$3 ORDER BY rank", preset_id, chips, as_on)
        left = {r["symbol"]: r["left_on"] for r in await conn.fetch("SELECT symbol, max(left_on) AS left_on FROM screen_spells WHERE preset_id=$1 AND chips=$2 AND left_on > $3 GROUP BY symbol", preset_id, chips, as_on)}
    out = []
    for r in rows:
        d = json.loads(r["row"]) if isinstance(r["row"], str) else dict(r["row"])
        d["_close"] = r["close"]
        if r["symbol"] in left:
            d["left_on"] = _iso(left[r["symbol"]])
        out.append(d)
    return {"session": _iso(run["session"]), "count": run["n"], "rows": out}


async def left_list(store, preset_id: str, chips: str) -> List[dict]:
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT symbol, added_on, left_on, left_reason, close_added, close_left, sessions_on FROM screen_spells WHERE preset_id=$1 AND chips=$2 AND left_on IS NOT NULL AND left_on >= CURRENT_DATE - $3::int ORDER BY left_on DESC, symbol", preset_id, chips, SHOW_DAYS)
    return [{"symbol": r["symbol"], "added_on": _iso(r["added_on"]), "left_on": _iso(r["left_on"]), "sessions": r["sessions_on"], "change_pct": _pct(r["close_added"], r["close_left"]), "reason": r["left_reason"]} for r in rows]


async def gainers_for(store, page: str, win: str, as_on: Optional[date]) -> Optional[dict]:
    async with store.pool.acquire() as conn:
        day = as_on or await conn.fetchval("SELECT max(session) FROM gainers WHERE page=$1 AND win=$2", page, win)
        if day is None:
            return None
        rows = await conn.fetch("SELECT rank, row FROM gainers WHERE page=$1 AND win=$2 AND session=$3 ORDER BY rank", page, win, day)
    if not rows and as_on is not None:
        return None
    return {"session": _iso(day), "rows": [dict(json.loads(r["row"]) if isinstance(r["row"], str) else r["row"], rank=r["rank"]) for r in rows]}
