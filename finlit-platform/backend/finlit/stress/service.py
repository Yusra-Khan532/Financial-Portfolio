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
FINANCIAL_SECTOR = "financial services"         # NSE's sector of banks, NBFCs, insurers, capital-market firms (exchanges, AMCs, brokers) and fintech
FINANCIAL_WORDS = ("financial services", "financials", "financial", "banks", "banking", "bank", "insurance", "finance", "capital markets", "nbfc",
                   "financial technology (fintech)")


def is_financial(symbol: str = "", sector: Optional[str] = None, industry: Optional[str] = None) -> bool:
    """A financial company by its labels: NSE's own sector for the symbol, the sector of its industry, or the site's sector or industry name. The screener's is_bank
    flag catches banks and NBFCs only; insurers, AMCs and exchanges used to pass the launch rule and failed only when their page was built (527 against the 471 of the
    launch list)."""
    nse = S._TABLE.get("stocks_sector")
    if nse is None:
        try:
            raw = json.loads((S.DATA / "nse_industries.json").read_text(encoding="utf-8")).get("stocks", {})
        except (OSError, ValueError):
            raw = {}
        nse = S._TABLE["stocks_sector"] = {k.upper(): str(v[1]) for k, v in raw.items() if isinstance(v, list) and len(v) >= 2}
    if (nse.get((symbol or "").upper()) or "").lower() == FINANCIAL_SECTOR:
        return True
    if industry and (S.nse_sector_of(industry) or "").lower() == FINANCIAL_SECTOR:
        return True
    return any((x or "").strip().lower() in FINANCIAL_WORDS for x in (sector, industry))


def covered_by_rule(market_cap: Optional[float], is_bank: Optional[float], financial: bool = False) -> Optional[str]:
    """None when the screener row passes the launch rule, else the reason in words."""
    if is_bank == 1.0 or financial:
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


def table_financial(table, sym: str) -> bool:
    i = table.pos.get(sym) if table is not None else None
    if i is None:
        return is_financial(sym)
    pick = lambda name: (getattr(table, name, None) or [None] * (i + 1))[i]   # noqa: E731
    return is_financial(sym, pick("sector"), pick("industry")) or is_financial(sym, pick("sector_label"))


def coverage_reason(table, sym: str) -> Optional[str]:
    """The launch rule for one screener row: None when covered, else the reason in words."""
    mc, bank = table_row(table, sym)
    return covered_by_rule(mc, bank, table_financial(table, sym))


def covered_quarters(table, symbols: Sequence[str]) -> Dict[str, Optional[str]]:
    """{symbol: latest reported quarter end} for the companies that pass the launch rule: what default_peer() needs (no packs are built to answer it)."""
    out: Dict[str, Optional[str]] = {}
    for s in symbols:
        if coverage_reason(table, s) is None:
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


async def forget_premium(app, sym: str, statement: str) -> None:
    """Remove the cached statements of a company (both views, both periods), so an unusable answer is never served again from Redis."""
    path = "/api/stocks/admin/fundamentals"
    keys = []
    for period in ("yearly", "quarterly"):
        params = {"query": sym, "statement_type": statement, "period": period}
        keys += [premium._key(path, params), premium._key(path, {**params, "lean": "true"})]
    try:
        await app.state.store.redis.delete(*keys)
    except Exception:  # nosec B110 - Redis busy: the copies expire within a day anyway
        pass


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
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        # The provider answered without the income statement (an error body or a half answer). That is the provider's fault, not the company's: it used to be called
        # "not covered" (with the stored page deleted) for a whole day, because the answer stayed in Redis. Drop the cached copies so the next try asks again.
        await forget_premium(app, sym, statement)
        raise NotReady("The statements for this company are not available right now. Please try again in a moment.") from exc
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
    if stop:                                  # the engine reads it only for a month of a company's base window that the site's own USD/INR series lacks, and says so (usdinr_source)
        today["usdinr_monthly"] = stop
    nxt = (steo or {}).get("next4")
    return today, ([float(x) for x in nxt] if isinstance(nxt, list) and len(nxt) == 4 else None)


NIFTY_YEARS = 12     # the 2018 episode starts about 8.2 years back; the site's own chart keeps five


async def weekly_closes(store, sym: str) -> Dict[str, float]:
    """The company's closes for the past shocks: the long weekly history (price_history_long) when stored, else the weekly closes of the
    price-MAX section the chart already holds. Nothing is invented: a company with neither gets {} and the page says so."""
    async with store.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT dates, closes FROM price_history_long WHERE symbol = $1", sym)
        out = {d.isoformat(): float(c) for d, c in zip(row["dates"] or [], row["closes"] or []) if c} if row else {}
        if out:
            return out
        try:
            body = await conn.fetchval("SELECT body FROM snapshots WHERE symbol = $1 AND section = 'price-MAX' ORDER BY (statement = 'consolidated') DESC LIMIT 1", sym)
        except Exception as exc:   # the page still builds, without prices
            log.warning("stress %s: stored price section unreadable: %s", sym, type(exc).__name__)
            return {}
    try:
        series = (json.loads(body) if isinstance(body, (str, bytes)) else body or {}).get("series") or {}
        return {str(d)[:10]: float(c) for d, c in zip(series.get("t") or [], series.get("c") or []) if c}
    except (ValueError, TypeError, AttributeError):
        return {}


async def nifty_closes(app) -> Dict[str, float]:
    """Nifty 50's daily closes for the past shocks: NIFTY_YEARS back (the 2018 and 2020 episodes need more than the five years of the chart route);
    when that long fetch fails, the five years the site already holds, so the later episodes still show. {} (logged) when neither is there."""
    from .. import indices
    for key, years in (("idx:px:NIF50:long", NIFTY_YEARS), ("idx:px:NIF50", indices.HISTORY_YEARS)):
        try:
            raw = await indices._cached(app, key, 3600, lambda y=years: indices._fetch_levels(app, "NIF50", y))
            rows = indices.shape_levels(raw, years)["rows"]
        except Exception as exc:   # the page leaves the Nifty column blank; the reason is in the log
            log.warning("stress: Nifty 50 history (%s years) unavailable: %s: %s", years, type(exc).__name__, exc)
            continue
        if rows:
            return {r["d"]: r["c"] for r in rows}
        log.warning("stress: Nifty 50 history (%s years) came back empty", years)
    return {}


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
    for w in today.inputs.get("warnings") or []:
        log.info("stress %s today's inputs: %s", sym, w)          # for the people who run the site; the page payload leaves them out (page.public_inputs)
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
    lq = P.latest_quarter_check(pack, co, today_in["series"], today_in["brent"], today_in.get("usdinr_monthly"))
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


PAGE_MAX_AGE_H = 30        # a stored page older than this (the nightly job's promise) is rebuilt behind the reader


def page_is_stale(rec: dict, latest_quarter: Optional[str], now: Optional[datetime] = None) -> bool:
    """A stored page to rebuild in the background (the stored copy is still served): more than PAGE_MAX_AGE_H old, or the company has reported a quarter newer
    than the page's base and the page was built more than RECENT_FAIL_H ago (so a company whose base stays on its latest full year is not rebuilt on every visit)."""
    at = rec.get("built_at")
    if not isinstance(at, datetime):
        return False
    age_h = ((now or datetime.now(timezone.utc)) - at).total_seconds() / 3600
    base_end = ((rec.get("payload") or {}).get("company") or {}).get("base_end")
    payload = rec.get("payload") or {}
    no_history = "history" in payload and not any(v for row in payload["history"] or [] for k, v in row.items() if k not in ("episode", "from", "to", "nifty"))
    return age_h > PAGE_MAX_AGE_H or (age_h > RECENT_FAIL_H and (no_history or bool(latest_quarter and base_end and latest_quarter > base_end)))


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
        if coverage_reason(table, sym) is None:
            out.append((sym, float(table_row(table, sym)[0])))
    return sorted(out, key=lambda x: -x[1])


async def stored_symbols(store) -> List[str]:
    try:
        async with store.pool.acquire() as conn:
            return [r["symbol"] for r in await conn.fetch("SELECT symbol FROM stress_pages")]
    except Exception:   # nosec B110 - before the migration has run
        return []


RUN_KEY = "stress:last_run"     # the last nightly run's counts, for the job supervisor's "is there work waiting" probe


async def note_run(store, rec: dict) -> None:
    try:
        await store.redis.set(RUN_KEY, json.dumps(rec), ex=3 * 86400)
    except Exception:   # nosec B110 - the probe then answers "unknown" and the job follows its clock
        pass


async def has_work(store) -> Optional[bool]:
    """For the job supervisor: True when the last run stopped at its time cap with covered companies it never reached (the job then continues soon instead of
    waiting for the next night, so every company gets its page every day); False when it reached them all; None when no run is on record."""
    raw = await store.redis.get(RUN_KEY)
    if not raw:
        return None
    return int(json.loads(raw).get("unreached") or 0) > 0


CONCURRENCY = 3            # companies built at the same time: the slow part is the data provider's statements, so a few at once cuts the wall time several times over
RECENT_FAIL_H = 6          # a company that failed in the last few hours goes to the back of the queue: every run first spends its time on companies not tried yet


async def refresh_stress(store, settings, *, max_minutes: float = 40.0, limit: Optional[int] = None, force: bool = False, symbols: Optional[List[str]] = None,
                         per_company_s: float = PER_COMPANY_S) -> dict:
    """The nightly run (`refresh-stress`): builds the page payload and the pack of every covered company that has no copy from today yet, and stores them: companies with
    no page first (largest first), then pages whose company has reported a newer quarter, then the oldest pages. Resumable: a company already built today is skipped, so a
    second run only does what is left, and a run that stops at its time cap with companies it never reached says so (has_work), so the supervisor runs it again soon.
    A company that cannot be built right now (its report or statements are not
    stored yet, the data provider is slow) is recorded with the reason (table and log) and tried again next run: that is waiting, not a fault of the job. One company never
    stops the others, and the run reports a fault only when nothing at all could be built."""
    from types import SimpleNamespace
    table = await get_table(store)
    app = SimpleNamespace(state=SimpleNamespace(store=store, settings=settings))
    wanted = [(s, mc) for s, mc in await covered_symbols(store) if not symbols or s in symbols]
    today = datetime.now(IST).date()
    stored: Dict[str, Tuple[Any, Optional[str]]] = {}       # symbol: (built_at, base_end of the stored page)
    recent_fail: set = set()
    if not force:
        async with store.pool.acquire() as conn:
            try:
                stored = {r["symbol"]: (r["built_at"], r["base_end"]) for r in await conn.fetch(
                    "SELECT symbol, built_at, payload #>> '{company,base_end}' AS base_end FROM stress_pages")}
            except Exception:   # nosec B110 - before the migration has run
                stored = {}
            try:
                recent_fail = {r["symbol"] for r in await conn.fetch("SELECT symbol FROM stress_failures WHERE kind <> 'not_covered' AND failed_at > now() - make_interval(hours => $1)", RECENT_FAIL_H)}
            except Exception:   # nosec B110 - before the migration has run
                recent_fail = set()
    quarters = covered_quarters(table, [s for s, _ in wanted])

    def new_results(sym: str) -> bool:
        """The screener table has a quarter newer than the one the stored page was built on (results came out since)."""
        q, have = quarters.get(sym), (stored.get(sym) or (None, None))[1]
        return bool(q and have and q > have)

    def built_today(sym: str) -> bool:
        at = (stored.get(sym) or (None, None))[0]
        return at is not None and at.astimezone(IST).date() == today

    def fresh(sym: str) -> bool:      # built in the last few hours: never rebuilt again in the same day, even when its base quarter still trails the table's
        at = (stored.get(sym) or (None, None))[0]
        return at is not None and (datetime.now(timezone.utc) - at).total_seconds() < RECENT_FAIL_H * 3600

    done_today = {s for s, _ in wanted if built_today(s) and (not new_results(s) or fresh(s))}
    todo = [(s, mc) for s, mc in wanted if s not in done_today]

    def order(item: Tuple[str, float]):
        """Companies with no page first, then pages behind new results, then the oldest pages; a company that failed in the last few hours goes after all of them.
        (Each run used to start again from the largest company, so the same few dozen were rebuilt every day and the rest never got a page.)"""
        sym, mc = item
        at = (stored.get(sym) or (None, None))[0]
        group = 0 if sym not in stored else 1 if new_results(sym) else 2
        return (sym in recent_fail, group, at.timestamp() if group == 2 and at is not None else 0.0, -mc)

    todo.sort(key=order)
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
    unreached = queue.qsize()
    left = unreached + out["not_ready"] + out["failed"]
    await note_run(store, {"at": datetime.now(timezone.utc).isoformat(), "unreached": unreached, "left": left, "built": out["built"], "tried": out["tried"]})
    reasons: Dict[str, int] = {}
    for f in failures:
        k = f["reason"].split(":")[0][:60]
        reasons[k] = reasons.get(k, 0) + 1
    log.info("stress run: covered %d, built %d, not covered %d, not ready %d, failed %d, left %d, in %.0fs; reasons %s", len(wanted), out["built"], out["not_covered"],
             out["not_ready"], out["failed"], left, time.monotonic() - started, reasons or "none")
    return {"covered": len(wanted), "built": out["built"], "skipped_built_today": len(done_today), "unreached": unreached,
            "failed": out["failed"], "not_ready": out["not_ready"], "not_covered": out["not_covered"], "left": max(0, left), "tried": out["tried"], "reasons": reasons,
            "failures": failures[:25], "seconds": round(time.monotonic() - started, 1)}
