"""Building one company's Stress Lab page from what the site already holds: the stored report sections, the premium statements (kept in Redis), the macro table, the weekly closes.
Nothing here calls a provider that the rest of the site does not already call. A company the model does not cover says so in plain words (NotCovered)."""
from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .. import macro as macro_mod
from .. import premium
from . import engine
from . import page as P

S = engine()
LAUNCH_FLOOR_CR = 10000.0          # large and mid caps (the site's size scale), decided 11 Nov 2026
FINANCIAL = "Stress Lab does not cover financial companies yet."
SHORT_HISTORY = "Stress Lab does not cover companies with under three years of results yet."
NOT_SIZE = "Stress Lab covers large and mid caps for now (a market value of Rs 10,000 Cr or more)."
PAGE_TTL = 3600


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
async def premium_json(app, sym: str, statement: str, period: str) -> dict:
    """The premium statements (the data-provider copy the site keeps in Redis), fetched once when no copy is held."""
    path, params = "/api/stocks/admin/fundamentals", {"query": sym, "statement_type": statement, "period": period}
    key = premium._key(path, params)
    raw = None
    try:
        hit = await app.state.store.redis.get(key)
        raw = json.loads(hit)["b"].encode() if hit else None
    except Exception:  # nosec B110 - Redis busy: fetch instead
        raw = None
    if raw is None:
        raw = await premium._refresh(app, key, path, params, premium.FRESH_SECONDS["fundamentals"])
    if raw is None:
        raise NotReady("The statements for this company are not available right now. Please try again in a moment.")
    return json.loads(raw)


async def build_pack(app, sym: str, statement: str = "consolidated") -> dict:
    store = app.state.store
    got = {n: await store.get_section(sym, statement, n) for n in ("summary", "financials")}
    if not all(got.values()):
        raise NotReady("This company's report is not stored yet. Open its page once (it is prepared in about a minute), then come back.")
    stock, fin = json.loads(got["summary"][0]), json.loads(got["financials"][0])
    if (stock.get("dataQuality") or {}).get("isBank"):
        raise NotCovered(FINANCIAL)
    py, pq = await premium_json(app, sym, statement, "yearly"), await premium_json(app, sym, statement, "quarterly")
    try:
        pack = S.pack_from_site(stock, fin, py, pq)
    except (ValueError, KeyError, IndexError) as exc:
        raise NotCovered(SHORT_HISTORY) from exc
    pack["symbol"] = sym
    return pack


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
async def company_and_today(app, sym: str, statement: str = "consolidated"):
    pack = await build_pack(app, sym, statement)
    try:
        co = S.company_from_pack(pack)
    except ValueError as exc:
        raise NotCovered(SHORT_HISTORY if "year" in str(exc).lower() or "cost split" in str(exc) or "missing" in str(exc) else str(exc).split(": ", 1)[-1]) from exc
    today_in, eia = await macro_today(app.state.store)
    try:
        today = S.load_today(today_in, co.base_end, as_of=today_in.get("as_of"))
    except ValueError as exc:
        raise NotReady("Today's inputs are not complete yet: " + str(exc)) from exc
    return pack, co, today, today_in, eia


async def build_payload(app, sym: str, *, size: str, statement: str = "consolidated") -> dict:
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
    return P.page_payload(pack, co, today, eia_brent_next4=eia, today_dates=dates, base_window=(start[0], start[1]), closes=closes, nifty=nifty,
                          as_of=today_in.get("as_of") or date.today().isoformat(), size=size,
                          price_as_of=str((pack.get("quote") or {}).get("asOf") or (pack.get("quote") or {}).get("date") or "")[:10], inventory_days=round(inv) if isinstance(inv, (int, float)) and inv > 0 else None, latest_quarter=lq)
