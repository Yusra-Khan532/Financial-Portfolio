"""Building one company's Stress Lab page from what the site already holds: the stored report sections, the premium statements (kept in Redis), the macro table, the weekly closes.
Nothing here calls a provider that the rest of the site does not already call. A company the model does not cover says so in plain words (NotCovered)."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .. import macro as macro_mod
from .. import premium
from ..screener.data import get_table
from . import engine
from . import page as P

S = engine()
LAUNCH_FLOOR_CR = 10000.0          # large and mid caps (the site's size scale), decided 11 Nov 2026
FINANCIAL = "Stress Lab does not cover financial companies yet."
SHORT_HISTORY = "Stress Lab does not cover companies with under three years of results yet."
NOT_SIZE = "Stress Lab covers large and mid caps for now (a market value of Rs 10,000 Cr or more)."
PAGE_TTL = 3600
LIVE_BUILD_S = 8.0                  # a page with no stored copy yet is built live for at most this long; after that the reader gets the plain "being prepared" card
PER_COMPANY_S = 150.0               # the nightly job's own time limit for one company (the statements come from the data provider)
PLAIN_NOT_READY = "Stress Lab for this company is being prepared. Please check back later."
NOT_COVERED_PLAIN = "Stress Lab does not cover this company yet."
log = logging.getLogger("finlit.stress")
IST = timezone(timedelta(hours=5, minutes=30))


class NotCovered(Exception):
    """The company is outside what Stress Lab covers; the message is said on the page as it is."""


class NotReady(Exception):
    """The data the page needs is not stored yet (the company's report, the premium statements or the macro table)."""


# ---------------------------------------------------------------------------------------------------- coverage
def covered_by_rule(market_cap: Optional[float], is_bank: Optional[float]) -> Optional[str]:
    """None when the screener row passes the launch rule, else the reason in words."""
    if is_bank == 1.0:
        return FINANCIAL
    if market_cap is None or market_cap < LAUNCH_FLOOR_CR:
        return NOT_SIZE
    return None


def table_row(table, sym: str) -> Tuple[Optional[float], Optional[float]]:
    i = table.pos.get(sym) if table is not None else None
    if i is None:
        return None, None
    g = lambda k: (lambda v: None if v != v else v)(table.cols[k][i]) if k in table.cols else None   # noqa: E731
    return g("market_cap"), g("is_bank")


def covered_quarters(table, symbols: Sequence[str]) -> Dict[str, Optional[str]]:
    """{symbol: latest reported quarter end} for the companies that pass the launch rule: what default_peer() needs (no packs are built to answer it)."""
    out: Dict[str, Optional[str]] = {}
    for s in symbols:
        mc, bank = table_row(table, s)
        if covered_by_rule(mc, bank) is None:
            i = table.pos[s]
            q = table.q_end[i]
            out[s] = None if q != q else f"{int(q) // 10000:04d}-{int(q) // 100 % 100:02d}-{int(q) % 100:02d}"   # the table holds yyyymmdd
    return out


# ---------------------------------------------------------------------------------------------------- inputs
PREMIUM_TRIES, PREMIUM_RETRY_S = 2, 3.0      # the provider is asked twice before a company is called "not ready"
STATEMENTS_WAIT_S = 110.0                    # a background build waits this long for one statement (a member's page waits 45): the provider is slow while the night jobs run


async def _cached_premium(app, key: str) -> Optional[bytes]:
    try:
        hit = await app.state.store.redis.get(key)
        return json.loads(hit)["b"].encode() if hit else None
    except Exception:  # nosec B110 - Redis busy: fetch instead
        return None


async def premium_json(app, sym: str, statement: str, period: str) -> dict:
    """The premium statements (the data-provider copy the site keeps in Redis). A copy the Company financials page already holds is used as it is; otherwise the LEAN view is
    fetched (statements, ratios, quote and prices without the dashboard extras: the full view took longer than the 45 s the call waits, so every company was "not ready"
    on 12 Nov 2026, 38 in the night run alone), twice at most."""
    path, params = "/api/stocks/admin/fundamentals", {"query": sym, "statement_type": statement, "period": period}
    raw = await _cached_premium(app, premium._key(path, params))
    if raw is None:
        lean = {**params, "lean": "true"}
        key = premium._key(path, lean)
        raw = await _cached_premium(app, key)
        for attempt in range(PREMIUM_TRIES):
            if raw is not None:
                break
            raw = await premium._refresh(app, key, path, lean, premium.FRESH_SECONDS["fundamentals"], timeout=STATEMENTS_WAIT_S)
            if raw is None and attempt + 1 < PREMIUM_TRIES:
                await asyncio.sleep(PREMIUM_RETRY_S)
    if raw is None:
        why = None
        try:
            err = await app.state.store.redis.get(key + ":err")
            why = err.decode() if isinstance(err, bytes) else err
        except Exception:  # nosec B110 - the reason is a courtesy
            why = None
        # the reader gets PLAIN_NOT_READY; this text goes to the log and to stress_failures, where the admin status page shows it
        raise NotReady("The statements for this company are not available right now. Please try again in a moment." + (f" [{period}: {why}]" if why else f" [{period}: the provider did not answer in {STATEMENTS_WAIT_S:.0f}s]"))
    return json.loads(raw)


async def build_pack(app, sym: str, statement: str = "consolidated") -> dict:
    store = app.state.store
    got = {n: await store.get_section(sym, statement, n) for n in ("summary", "financials")}
    if not all(got.values()):
        raise NotReady("This company's report is not stored yet. Open its page once (it is prepared in about a minute), then come back.")
    stock, fin = json.loads(got["summary"][0]), json.loads(got["financials"][0])
    if (stock.get("dataQuality") or {}).get("isBank"):
        raise NotCovered(FINANCIAL)
    py, pq = await asyncio.gather(premium_json(app, sym, statement, "yearly"), premium_json(app, sym, statement, "quarterly"))      # both at once: half the waiting
    try:
        pack = S.pack_from_site(stock, fin, py, pq)
    except (ValueError, KeyError, IndexError) as exc:
        raise NotCovered(SHORT_HISTORY) from exc
    pack["symbol"] = sym
    return pack


STOPGAP_FX = Path(__file__).parent / "data" / "usdinr_monthly_stopgap.json"
STOPGAP_FX_SOURCE = "x-rates.com monthly averages"


def stopgap_usdinr() -> List[List[Any]]:
    """Monthly USD/INR averages kept only as a stop-gap (see the file's note): [[month end, rate], ...], [] when the file is gone (the proper series then has to be filled)."""
    try:
        return json.loads(STOPGAP_FX.read_text(encoding="utf-8")).get("points") or []
    except (OSError, ValueError):
        return []


async def macro_today(store) -> Tuple[dict, Optional[List[float]]]:
    """Today's inputs for the engine from the macro table, and the EIA outlook (next four quarters, US$) when the nightly step has stored one."""
    async with store.pool.acquire() as conn:
        payload = await macro_mod.get_meta(conn, "payload")
        brent = await macro_mod.load_points(conn, "brent_d")
        steo = await macro_mod.get_meta(conn, "eia_steo")
    if not payload:
        raise NotReady("Macro data has not been loaded yet. It loads nightly; check back soon.")
    pts = brent.get("brent_d") or {}
    series = payload.get("series") or {}
    today = {"as_of": payload.get("today"), "series": series, "brent": [[d.isoformat(), v] for d, v in sorted(pts.items())]}
    stop = stopgap_usdinr()
    if stop:                                  # the engine reads it only when the site's own USD/INR series has no month inside a company's base window, and says so (usdinr_source)
        today["usdinr_monthly"] = stop
    nxt = (steo or {}).get("next4")
    return today, ([float(x) for x in nxt] if isinstance(nxt, list) and len(nxt) == 4 else None)


async def weekly_closes(store, sym: str) -> Dict[str, float]:
    async with store.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT dates, closes FROM price_history_long WHERE symbol = $1", sym)
    if not row:
        return {}
    return {d.isoformat(): float(c) for d, c in zip(row["dates"], row["closes"]) if c}


async def nifty_closes(app) -> Dict[str, float]:
    """Nifty 50's daily closes for the past shocks (what the index history route holds; older episodes are simply not in it and the page says so)."""
    from .. import indices
    try:
        raw = await indices._cached(app, "idx:px:NIF50", 3600, lambda: indices._fetch_levels(app, "NIF50"))
        rows = indices.shape_levels(raw, indices.HISTORY_YEARS)["rows"]
    except Exception:   # nosec B110 - the page leaves the Nifty column blank
        return {}
    return {r["d"]: r["c"] for r in rows}


def size_word(market_cap: Optional[float], rank_bucket: Optional[str]) -> str:
    return (rank_bucket or ("Large" if (market_cap or 0) >= 60000 else "Mid")) + " cap"


# ---------------------------------------------------------------------------------------------------- the payload
async def company_and_today(app, sym: str, statement: str = "consolidated", pack: Optional[dict] = None):
    """The company (from a stored pack, or built from the statements when none is given) and today's scenario."""
    pack = pack if pack is not None else await build_pack(app, sym, statement)
    try:
        co = S.company_from_pack(pack)
    except ValueError as exc:
        log.info("stress %s not covered: %s", sym, exc)       # the engine's own words stay in the log; the reader gets plain ones
        raise NotCovered(SHORT_HISTORY if "year" in str(exc).lower() or "cost split" in str(exc) or "missing" in str(exc) else NOT_COVERED_PLAIN) from exc
    today_in, eia = await macro_today(app.state.store)
    try:
        today = S.load_today(today_in, co.base_end, as_of=today_in.get("as_of"))
    except ValueError as exc:
        raise NotReady("Today's inputs are not complete yet: " + str(exc)) from exc       # the router logs this text and sends PLAIN_NOT_READY
    return pack, co, today, today_in, eia


async def build_payload_and_pack(app, sym: str, *, size: str, statement: str = "consolidated") -> Tuple[dict, dict]:
    """The page payload and the pack it was built from (both are stored, so a Gold run can reuse the pack)."""
    pack, co, today, today_in, eia = await company_and_today(app, sym, statement)
    store = app.state.store
    closes, nifty = await weekly_closes(store, sym), await nifty_closes(app)
    start = today.inputs["base_window"]
    dates = {k: ((today_in["series"].get(k) or {}).get("points") or [[""]])[-1][0] for k in ("cpi", "gdp", "repo", "usdinr", "wpi_mfg")}
    dates["wpi"] = dates.pop("wpi_mfg")
    dates["brent"] = today_in["brent"][-1][0] if today_in["brent"] else ""
    ratios = await store.get_section(sym, statement, "ratios")
    try:
        inv = ((json.loads(ratios[0]).get("latest") or {}).get("inventory_days") or {}).get("value") if ratios else None
    except (ValueError, TypeError, AttributeError):
        inv = None
    lq = P.latest_quarter_check(pack, co, today_in["series"], today_in["brent"])
    payload = P.page_payload(pack, co, today, eia_brent_next4=eia, today_dates=dates, base_window=(start[0], start[1]), closes=closes, nifty=nifty,
                          as_of=today_in.get("as_of") or date.today().isoformat(), size=size,
                          price_as_of=str((pack.get("quote") or {}).get("asOf") or (pack.get("quote") or {}).get("date") or "")[:10], inventory_days=round(inv) if isinstance(inv, (int, float)) and inv > 0 else None, latest_quarter=lq)
    return payload, pack


async def build_payload(app, sym: str, *, size: str, statement: str = "consolidated") -> dict:
    return (await build_payload_and_pack(app, sym, size=size, statement=statement))[0]


# ---------------------------------------------------------------------------------------------------- stored pages (built at night, served as they are)
async def save_page(store, sym: str, payload: dict, pack: dict, statement: str = "consolidated") -> None:
    async with store.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO stress_pages (symbol, statement, payload, pack, as_of, built_at) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, now()) "
            "ON CONFLICT (symbol) DO UPDATE SET statement = EXCLUDED.statement, payload = EXCLUDED.payload, pack = EXCLUDED.pack, as_of = EXCLUDED.as_of, built_at = now()",
            sym, statement, json.dumps(payload), json.dumps(pack), str(payload.get("as_of") or "")[:10])
        await conn.execute("DELETE FROM stress_failures WHERE symbol = $1", sym)


async def load_page(store, sym: str) -> Optional[dict]:
    """{payload, pack, built_at} for a company with a stored page, else None."""
    try:
        async with store.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT payload, pack, built_at FROM stress_pages WHERE symbol = $1", sym)
    except Exception:   # nosec B110 - before the migration has run: nothing is stored
        return None
    if not row:
        return None
    payload, pack = row["payload"], row["pack"]
    return {"payload": json.loads(payload) if isinstance(payload, str) else payload, "pack": json.loads(pack) if isinstance(pack, str) else pack, "built_at": row["built_at"]}


async def save_failure(store, sym: str, kind: str, reason: str) -> None:
    """Why a company has no stored page: for the people who run the site, in the table and the log; never sent to a reader."""
    async with store.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO stress_failures (symbol, kind, reason, attempts, failed_at) VALUES ($1, $2, $3, 1, now()) "
            "ON CONFLICT (symbol) DO UPDATE SET kind = EXCLUDED.kind, reason = EXCLUDED.reason, attempts = stress_failures.attempts + 1, failed_at = now()",
            sym, kind, reason[:500])
        if kind == "not_covered":
            await conn.execute("DELETE FROM stress_pages WHERE symbol = $1", sym)


async def covered_symbols(store) -> List[Tuple[str, float]]:
    """The launch universe by the screener table's own rule (large and mid caps that are not banks, NBFCs or insurers), largest market value first."""
    table = await get_table(store)
    out = []
    for sym in table.pos:
        mc, bank = table_row(table, sym)
        if covered_by_rule(mc, bank) is None:
            out.append((sym, float(mc)))
    return sorted(out, key=lambda x: -x[1])


async def stored_symbols(store) -> List[str]:
    try:
        async with store.pool.acquire() as conn:
            return [r["symbol"] for r in await conn.fetch("SELECT symbol FROM stress_pages")]
    except Exception:   # nosec B110 - before the migration has run
        return []


CONCURRENCY = 3            # companies built at the same time: the slow part is the data provider's statements, so a few at once cuts the wall time several times over
RECENT_FAIL_H = 6          # a company that failed in the last few hours goes to the back of the queue: every run first spends its time on companies not tried yet


async def refresh_stress(store, settings, *, max_minutes: float = 40.0, limit: Optional[int] = None, force: bool = False, symbols: Optional[List[str]] = None,
                         per_company_s: float = PER_COMPANY_S) -> dict:
    """The nightly run (`refresh-stress`): builds the page payload and the pack of every covered company that has no copy from today yet, largest first, and stores them.
    Resumable: a company already built today is skipped, so a second run only does what is left. A company that cannot be built right now (its report or statements are not
    stored yet, the data provider is slow) is recorded with the reason (table and log) and tried again next run: that is waiting, not a fault of the job. One company never
    stops the others, and the run reports a fault only when nothing at all could be built."""
    from types import SimpleNamespace
    table = await get_table(store)
    app = SimpleNamespace(state=SimpleNamespace(store=store, settings=settings))
    wanted = [(s, mc) for s, mc in await covered_symbols(store) if not symbols or s in symbols]
    today = datetime.now(IST).date()
    done_today: set = set()
    recent_fail: set = set()
    if not force:
        async with store.pool.acquire() as conn:
            done_today = {r["symbol"] for r in await conn.fetch("SELECT symbol FROM stress_pages WHERE (built_at AT TIME ZONE 'Asia/Kolkata')::date = $1", today)}
            try:
                recent_fail = {r["symbol"] for r in await conn.fetch("SELECT symbol FROM stress_failures WHERE kind <> 'not_covered' AND failed_at > now() - make_interval(hours => $1)", RECENT_FAIL_H)}
            except Exception:   # nosec B110 - before the migration has run
                recent_fail = set()
    todo = [(s, mc) for s, mc in wanted if s not in done_today]
    todo = [x for x in todo if x[0] not in recent_fail] + [x for x in todo if x[0] in recent_fail]       # untried first, recent failures last (each group largest first)
    if limit:
        todo = todo[:limit]
    started = time.monotonic()
    out = {"built": 0, "failed": 0, "not_covered": 0, "not_ready": 0, "tried": 0}
    failures: List[Dict[str, str]] = []
    queue: asyncio.Queue = asyncio.Queue()
    for item in todo:
        queue.put_nowait(item)

    async def one(sym: str, mc: float) -> None:
        size = size_word(mc, table.cap[table.pos[sym]])
        out["tried"] += 1
        try:
            payload, pack = await asyncio.wait_for(build_payload_and_pack(app, sym, size=size), per_company_s)
            await save_page(store, sym, payload, pack)
            out["built"] += 1
        except NotCovered as exc:
            out["not_covered"] += 1
            await save_failure(store, sym, "not_covered", str(exc))
        except NotReady as exc:        # the report or the statements are not stored yet, or today's inputs are not complete: wait and try again next run
            out["not_ready"] += 1
            log.info("stress %s not ready: %s", sym, exc)
            failures.append({"symbol": sym, "reason": "not ready: " + str(exc)[:160]})
            await save_failure(store, sym, "not_ready", str(exc))
        except asyncio.TimeoutError:
            out["failed"] += 1
            reason = f"timed out after {per_company_s:.0f}s (statements from the data provider)"
            log.warning("stress %s: %s", sym, reason)
            failures.append({"symbol": sym, "reason": reason})
            await save_failure(store, sym, "failed", reason)
        except Exception as exc:      # one company failing never stops the others
            out["failed"] += 1
            reason = f"{type(exc).__name__}: {exc}"
            log.warning("stress %s failed: %s", sym, reason)
            failures.append({"symbol": sym, "reason": reason[:200]})
            await save_failure(store, sym, "failed", reason)

    async def worker() -> None:
        while time.monotonic() - started <= max_minutes * 60:
            try:
                sym, mc = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            await one(sym, mc)

    await asyncio.gather(*(worker() for _ in range(CONCURRENCY)))
    left = queue.qsize() + out["not_ready"] + out["failed"]
    reasons: Dict[str, int] = {}
    for f in failures:
        k = f["reason"].split(":")[0][:60]
        reasons[k] = reasons.get(k, 0) + 1
    log.info("stress run: covered %d, built %d, not covered %d, not ready %d, failed %d, left %d, in %.0fs; reasons %s", len(wanted), out["built"], out["not_covered"],
             out["not_ready"], out["failed"], left, time.monotonic() - started, reasons or "none")
    return {"covered": len(wanted), "built": out["built"], "skipped_built_today": len(wanted) - len(todo) if not limit else len(done_today & {s for s, _ in wanted}),
            "failed": out["failed"], "not_ready": out["not_ready"], "not_covered": out["not_covered"], "left": max(0, left), "tried": out["tried"], "reasons": reasons,
            "failures": failures[:25], "seconds": round(time.monotonic() - started, 1)}
