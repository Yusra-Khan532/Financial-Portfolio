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
UNKNOWN_SYMBOL = "We could not find a listed company with that symbol."
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


FINLIT_FX = "FinLit usdinr"        # the only rupee source a page may use (SL-9: the x-rates.com stop-gap is gone; a gap means "being prepared", never another source)


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
    nxt = (steo or {}).get("next4")
    return today, ([float(x) for x in nxt] if isinstance(nxt, list) and len(nxt) == 4 else None)


# ---------------------------------------------------------------------------------------------------- one close, one set of inputs (task #79, SL-9)
REFERENCE_CLOSES = ("RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK")   # large companies that trade every session: their newest stored close is the latest close


async def current_close(store, now: Optional[datetime] = None) -> Optional[date]:
    """The latest completed close every page is built on: the newest close the nightly job has stored for the large reference companies, never later than the
    latest session that is over (before 16:00 IST, and until the evening data refresh is done, that is the previous trading day). None when no close is stored
    at all (a fresh database): the page then uses today's inputs as they are."""
    from ..prism_candles import expected_session
    try:
        async with store.pool.acquire() as conn:
            return await conn.fetchval("SELECT max(day) FROM price_daily WHERE symbol = ANY($1::text[]) AND day <= $2", list(REFERENCE_CLOSES),
                                       expected_session(now or datetime.now(timezone.utc)))
    except Exception as exc:   # the page is then built as before; the reason is in the log
        log.warning("stress: the latest close is not readable: %s", type(exc).__name__)
        return None


async def close_price(store, sym: str, close: date) -> Optional[Tuple[str, float]]:
    """The company's own close on that day (or its last close before it, for a company that did not trade that day): never a mid-session price."""
    async with store.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT day, close FROM price_daily WHERE symbol = $1 AND day <= $2 AND close > 0 ORDER BY day DESC LIMIT 1", sym, close)
    return (row["day"].isoformat(), float(row["close"])) if row else None


def _cut(value: Any, close: str) -> Any:
    """A series, a list of [date, value] points, or a dict holding one under "points", with every point after the close removed."""
    if isinstance(value, list):
        return [p for p in value if not (isinstance(p, (list, tuple)) and p and isinstance(p[0], str) and p[0][:10] > close)]
    if isinstance(value, dict):
        return {k: (_cut(v, close) if k in ("points", "daily") or isinstance(v, list) else v) for k, v in value.items()}
    return value


def snapshot_for(today_in: dict, eia: Optional[List[float]], close: date) -> dict:
    """Today's inputs as they stood at the close: every series cut to points on or before it, and the close as the date."""
    c = close.isoformat()
    return {"close": c, "today": {**today_in, "as_of": c, "brent": _cut(today_in.get("brent") or [], c),
                                  "series": {k: _cut(v, c) for k, v in (today_in.get("series") or {}).items()}}, "eia": eia}


async def inputs_for_close(store, close: date) -> Tuple[dict, Optional[List[float]]]:
    """The one "Today" snapshot of this close: made once (from the macro table, cut to the close), stored, and used by every page built for that close, so no
    two pages read the inputs at different moments."""
    async with store.pool.acquire() as conn:
        body = await conn.fetchval("SELECT body FROM stress_inputs WHERE close_date = $1", close)
        if body is None:
            today_in, eia = await macro_today(store)
            snap = snapshot_for(today_in, eia, close)
            await conn.execute("INSERT INTO stress_inputs (close_date, body) VALUES ($1, $2::jsonb) ON CONFLICT (close_date) DO NOTHING", close, json.dumps(snap))
            body = await conn.fetchval("SELECT body FROM stress_inputs WHERE close_date = $1", close)       # the stored one wins when two builds raced
            await conn.execute("DELETE FROM stress_inputs WHERE close_date < $1", close - timedelta(days=30))
    snap = json.loads(body) if isinstance(body, str) else body
    return snap["today"], snap.get("eia")


def page_is_current(payload: dict, close: Optional[date]) -> bool:
    """A stored page may be served: built on this close, with this model version and the site's own rupee series. A page from an older close is never served."""
    if close is None:
        return True
    ti = payload.get("today_inputs") or {}
    return str(payload.get("as_of") or "")[:10] == close.isoformat() and payload.get("model") == S.MODEL_VERSION and ti.get("usdinr_source") == FINLIT_FX


NIFTY_YEARS = 12     # the 2018 episode starts about 8.2 years back; the site's own chart keeps five


HISTORY_FROM = "2018-01-01"      # the first past shock (2018) starts in August 2018; every close from here on is needed (task #79, SL-10)
EPISODES_START = "2018-08-28"


async def _section_closes(store, sym: str) -> Dict[str, float]:
    """The weekly closes of the price-MAX section the chart holds (through the store: Redis first, then Postgres)."""
    for statement in ("consolidated", "standalone"):
        try:
            hit = await store.get_section(sym, statement, "price-MAX")
        except Exception as exc:   # nosec B112 - the other sources still count
            log.warning("stress %s: stored price section unreadable: %s", sym, type(exc).__name__)
            continue
        if not hit:
            continue
        try:
            series = (json.loads(hit[0]) or {}).get("series") or {}
            got = {str(d)[:10]: float(c) for d, c in zip(series.get("t") or [], series.get("c") or []) if c}
        except (ValueError, TypeError, AttributeError):
            got = {}
        if got:
            return got
    return {}


async def _fetch_long(app, sym: str) -> Dict[str, float]:
    """The 2018 to today closes from the data provider (the same daily-quotes call as the long-history job), kept in price_history_long so it is asked once."""
    from .. import history as hist
    from ..indices import _client
    try:
        payload = await _client(app).get(f"/daily-quotes/{sym}", {"from": HISTORY_FROM[:4], "to": str(date.today().year)}, timeout=60, retries=1)
        dates, closes = hist.weekly_closes(payload)
    except Exception as exc:   # the table then shows what the site holds; the reason is in the log
        log.warning("stress %s: long price history not fetched: %s", sym, type(exc).__name__)
        return {}
    if True:     # an empty answer is stored too (first_date null): the company is not asked again on every build
        try:
            async with app.state.store.pool.acquire() as conn:
                await conn.execute("INSERT INTO price_history_long (symbol, dates, closes, first_date, tried_at) VALUES ($1, $2, $3, $4, now()) "
                                   "ON CONFLICT (symbol) DO UPDATE SET dates = EXCLUDED.dates, closes = EXCLUDED.closes, first_date = EXCLUDED.first_date, tried_at = now()",
                                   sym, dates, closes, dates[0] if dates else None)
        except Exception as exc:   # nosec B110 - used for this page anyway
            log.warning("stress %s: long price history not stored: %s", sym, type(exc).__name__)
    return {d.isoformat(): float(c) for d, c in zip(dates, closes) if c}


async def weekly_closes(store, sym: str, app: Any = None) -> Dict[str, float]:
    """The company's closes for the past shocks, from 2018 to the latest close: the long weekly history (price_history_long), the chart's price-MAX section and
    the daily closes the nightly job stores, put together (a later source wins on the same day). When the site holds nothing before 2022 and the company
    traded then, the 2018 onwards closes are fetched once (app given). Nothing is invented: a company listed later simply has no closes before its listing."""
    out: Dict[str, float] = {}
    async with store.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT dates, closes, first_date FROM price_history_long WHERE symbol = $1", sym)
        daily = await conn.fetch("SELECT day, close FROM price_daily WHERE symbol = $1 AND day >= $2 AND close > 0", sym, date.fromisoformat(HISTORY_FROM))
    if row:
        out.update({(d.isoformat() if hasattr(d, "isoformat") else str(d)[:10]): float(c) for d, c in zip(row["dates"] or [], row["closes"] or []) if c})
    out.update(await _section_closes(store, sym))
    if app is not None and not row and not any(d <= EPISODES_START for d in out):    # nothing from the first shock (Aug 2018) on file: asked once; the row it stores stops a second ask
        out.update(await _fetch_long(app, sym))
    out.update({r["day"].isoformat(): float(r["close"]) for r in daily})
    return {d: c for d, c in out.items() if d >= HISTORY_FROM}


NIFTY_PAST_KEY = "stress:nifty:past"      # Nifty 50 closes from 2018 to three years back: fixed history, fetched once and kept


async def nifty_closes(app) -> Dict[str, float]:
    """Nifty 50's daily closes from 2018 to the latest close: the recent years the site already holds, and the older years (which the provider gives only a
    year at a time) fetched once and kept. {} (logged) when nothing is there; a missing year leaves its episode blank with the reason in the log."""
    from .. import indices
    store, out = app.state.store, {}
    try:
        raw = await indices._cached(app, "idx:px:NIF50", 3600, lambda: indices._fetch_levels(app, "NIF50", indices.HISTORY_YEARS))
        out.update({r["d"]: r["c"] for r in indices.shape_levels(raw, indices.HISTORY_YEARS)["rows"]})
    except Exception as exc:
        log.warning("stress: Nifty 50 recent history unavailable: %s: %s", type(exc).__name__, exc)
    if not any(d <= EPISODES_START for d in out):
        past: Dict[str, float] = {}
        try:
            got = await store.redis.get(NIFTY_PAST_KEY)
            past = json.loads(got) if got else {}
        except Exception:   # nosec B110 - fetched again below
            past = {}
        if not any(d <= EPISODES_START for d in past):
            past = {}
            client = indices._client(app)
            for year in range(int(HISTORY_FROM[:4]), date.today().year - 1):
                try:
                    payload = await client.get("/index/market-price/historical", {"index_symbol": "NIF50", "from_date": f"{year}-01-01", "to_date": f"{year}-12-31"},
                                               timeout=25, retries=1)
                    rows = (payload or {}).get("rows") if isinstance(payload, dict) else payload
                    for r in rows or []:
                        d, c = str((r or {}).get("quote_date") or "")[:10], (r or {}).get("close_price")
                        if len(d) == 10 and isinstance(c, (int, float)) and c > 0:
                            past[d] = float(c)
                except Exception as exc:   # one year missing leaves that episode blank; the others still show
                    log.warning("stress: Nifty 50 closes for %s unavailable: %s", year, type(exc).__name__)
            if any(d <= EPISODES_START for d in past):
                try:
                    await store.redis.set(NIFTY_PAST_KEY, json.dumps(past))
                except Exception:   # nosec B110 - used for this page anyway
                    pass
            else:
                log.warning("stress: Nifty 50 closes before %s still missing", EPISODES_START)
        out = {**past, **out}
    if not out:
        log.warning("stress: no Nifty 50 history at all")
    return {d: c for d, c in out.items() if d >= HISTORY_FROM}


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
    close = await current_close(app.state.store)
    today_in, eia = await (inputs_for_close(app.state.store, close) if close else macro_today(app.state.store))
    try:
        today = S.load_today(today_in, co.base_end, as_of=today_in.get("as_of"))
    except ValueError as exc:
        raise NotReady("Today's inputs are not complete yet: " + str(exc)) from exc       # the router logs this text and sends PLAIN_NOT_READY
    for w in today.inputs.get("warnings") or []:
        log.info("stress %s today's inputs: %s", sym, w)          # for the people who run the site; the page payload leaves them out (page.public_inputs)
    if today.inputs.get("usdinr_source") != FINLIT_FX:            # a gap in the site's own rupee series: never another source, never named on the page
        raise NotReady(f"FinLit's USD/INR series does not cover {sym}'s base window ({today.inputs.get('usdinr_source')})")
    return pack, co, today, today_in, eia


async def build_payload_and_pack(app, sym: str, *, size: str, statement: str = "consolidated", pack: Optional[dict] = None) -> Tuple[dict, dict]:
    """The page payload and the pack it was built from (both are stored, so a Gold run can reuse the pack). Built on the latest close: the share price is that
    day's close (never a mid-session price), and "Data to", the base and every Today input belong to the same close (task #79, SL-9)."""
    store = app.state.store
    close = await current_close(store)
    pack = json.loads(json.dumps(pack)) if pack else await build_pack(app, sym, statement)      # a stored pack (no newer results): no call to the data provider
    if close:
        got = await close_price(store, sym, close)
        if got is None:
            raise NotReady(f"{sym} has no stored close on or before {close}")
        pack["quote"] = {**(pack.get("quote") or {}), "price": got[1], "asOf": got[0], "date": got[0]}
    pack, co, today, today_in, eia = await company_and_today(app, sym, statement, pack=pack)
    closes, nifty = await weekly_closes(store, sym, app), await nifty_closes(app)
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
    for note in list(co.notes or []) + list(co.exposure.notes or []):        # SL-11: notes for the team go to the build log, never into the public payload
        log.info("stress %s build note: %s", sym, note)
    payload = P.page_payload(pack, co, today, eia_brent_next4=eia, today_dates=dates, base_window=(start[0], start[1]), closes=closes, nifty=nifty,
                          as_of=close.isoformat() if close else (today_in.get("as_of") or date.today().isoformat()), size=size,
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
    rows = payload.get("history") or []
    no_history = "history" in payload and not any(v for row in rows for k, v in row.items() if k not in ("episode", "from", "to", "nifty"))
    gap = any(row.get("nifty") is None or any(v is None for k, v in row.items() if k not in ("episode", "from", "to", "nifty")) for row in rows)   # an episode still blank (task #79, SL-10)
    return age_h > PAGE_MAX_AGE_H or (age_h > RECENT_FAIL_H and (no_history or gap or bool(latest_quarter and base_end and latest_quarter > base_end)))


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


async def stored_symbols(store, close: Optional[date] = None) -> List[str]:
    """The companies with a stored page; with `close`, only those whose page is built on that close."""
    try:
        async with store.pool.acquire() as conn:
            if close is not None:
                return [r["symbol"] for r in await conn.fetch("SELECT symbol FROM stress_pages WHERE as_of = $1", close.isoformat())]
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
    close = await current_close(store)
    stored: Dict[str, Tuple[Any, Optional[str]]] = {}       # symbol: (built_at, base_end of the stored page)
    on_close: set = set()                                   # pages built on the latest close, with this model and the site's own rupee series (SL-9)
    recent_fail: set = set()
    if not force:
        async with store.pool.acquire() as conn:
            try:
                rows = await conn.fetch("SELECT symbol, built_at, payload #>> '{company,base_end}' AS base_end, as_of, payload ->> 'model' AS model, "
                                        "payload #>> '{today_inputs,usdinr_source}' AS fx FROM stress_pages")
                stored = {r["symbol"]: (r["built_at"], r["base_end"]) for r in rows}
                on_close = {r["symbol"] for r in rows if page_is_current({"as_of": r["as_of"], "model": r["model"], "today_inputs": {"usdinr_source": r["fx"]}}, close)}
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
        """Built for the latest close (with no close stored at all, built today): such a page is not built again in this run."""
        if close is not None:
            return sym in on_close
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
        group = 0 if sym not in stored or (close is not None and sym not in on_close) else 1 if new_results(sym) else 2      # older close first: it is not served
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
            reuse = None
            if sym in stored and not new_results(sym):          # a new close, nothing newer reported: rebuilt from its stored statements (no call to the data provider)
                rec = await load_page(store, sym)
                reuse = (rec or {}).get("pack")
            payload, pack = await asyncio.wait_for(build_payload_and_pack(app, sym, size=size, **({"pack": reuse} if reuse else {})), per_company_s)
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
