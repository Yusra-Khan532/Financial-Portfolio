"""POST /api/me/all-investments (task #137, 15 Nov 2026 pack): the figures behind the "All my investments" page.

The body carries the member's Equity portfolio shares (symbol and quantity: that list lives in the browser and the account, as the Equity portfolio page
sends it); the member's mutual funds and ETFs are read here from their MF portfolio and ETF portfolio. No new store: the three lists stay where they are,
so a change on a portfolio page shows here after a refresh.

Plans: Silver and Gold, as the three portfolio pages. Shares are read with FinLit Prism on Gold and with no company score on Silver (task #283 PR C: FinLit
Prism is FinLit's only company score; the retired FinLit IQ is not sent); the funds' Health Score is Gold only, as everywhere on the site. Basic is refused (403 plan_required).

Every figure follows "How the numbers are worked out" in the pack (see calc.py). The shares' beta is the Equity portfolio's own sum
(portfolio_page.metrics.market_measures on weekly prices) against the Nifty 500; each fund's and ETF's beta is its portfolio page's own figure
(mfportfolio.risk.fund_figures on daily NAVs or closes, three years). Information only, not investment advice.
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections import Counter
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import orjson
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..auth.entitlements import in_area
from ..auth.routes import Ctx, fail, ip_of, secure_ctx
from ..mfportfolio import risk as mfrisk
from ..mfportfolio.api import SCHEME_COLS, holdings_of, is_gold, nav_history, scores_for
from . import calc


async def member_ctx(request: Request, ctx: Ctx = Depends(secure_ctx)) -> Ctx:
    """Task #410: All my investments puts shares, funds and ETFs together, so it opens where both areas do: the combined plan, Gold and Platinum
    (goliveData; not the one-area plans on their own)."""
    if not (in_area(ctx, "mf") and in_area(ctx, "eq")):
        raise fail(403, "plan_required", "All my investments is part of the combined, Gold and Platinum plans.", plan="combined")
    return ctx

log = logging.getLogger("finlit.myinvest")
router = APIRouter(prefix="/api/me")
SYMBOL = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
NO_STORE = {"Cache-Control": "private, no-store", "Vary": "Cookie"}
DISCLAIMER = ("Describes your shares, mutual funds and ETFs from their published prices, NAVs and the fund houses' monthly portfolio files; holdings inside a "
              "fund or ETF can have changed since the fund house published its file. Past figures do not guarantee future returns. Mutual fund investments "
              "are subject to market risks; read all scheme-related documents carefully. Information only, not investment advice.")
PRISM_BANDS = ("Strong", "Healthy", "Average", "Weak", "Poor")
FUND_BANDS = PRISM_BANDS
NO_BENCH = "The Nifty 500 history is not available right now, so the beta and swing figures cannot be worked out."


class ShareIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    symbol: str = Field(min_length=1, max_length=24)
    qty: Optional[float] = Field(default=None, ge=0, le=1e12)

    @field_validator("symbol")
    @classmethod
    def _sym(cls, v: str) -> str:
        v = v.strip().upper()
        if not SYMBOL.match(v):
            raise ValueError("not a share symbol")
        return v


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")
    shares: List[ShareIn] = Field(default_factory=list, max_length=500)
    # task #235 (pack C3): one account across the three pages: its MF platform and its ETF account ("none": the account has no funds or ETFs; omitted: all)
    mfPf: Optional[str] = Field(default=None, pattern=r"^(all|none|[a-z0-9]{1,16})$")
    etfPf: Optional[str] = Field(default=None, pattern=r"^(all|none|[a-z0-9]{1,16})$")


def _ord(t: str) -> Optional[int]:
    try:
        return date.fromisoformat(str(t)[:10]).toordinal()
    except (TypeError, ValueError):
        return None


def _year_change(days: List[int], values: List[float]) -> Optional[float]:
    """% change over the last year: the last value against the last one on or before a year earlier (within 10 days). None with under a year of prices."""
    if not days or days[-1] - days[0] < 360:
        return None
    target, best = days[-1] - 365, None
    for d, v in zip(days, values):
        if d > target:
            break
        best = (d, v)
    if best is None or target - best[0] > 10 or not best[1]:
        return None
    return (values[-1] / best[1] - 1) * 100


def _shares_market(prices: Dict[str, Any], bench_rows: List[dict], symbols: List[str], weights: Dict[str, float], week: str) -> Optional[Dict[str, Any]]:
    """The Equity portfolio's own market figures (weekly prices, its window), against the Nifty 500, for the weights given, plus each share's own beta."""
    import numpy as np
    from ..portfolio_page import inputs, metrics
    frame, bench = inputs.build_frame(prices, bench_rows, symbols, week)
    r, rn, short = metrics.weekly_returns(frame, bench)
    if len(r.columns) < 1 or len(r) < 20:
        return None
    w = np.array([max(weights.get(s, 0.0), 0.0) for s in r.columns], dtype=float)
    w = w / w.sum() if w.sum() > 0 else np.ones(len(r.columns)) / len(r.columns)
    m = metrics.market_measures(r, rn, w)
    var = float(np.var(rn, ddof=1))
    each = {}
    for s in r.columns:
        pair = r[s].notna() & rn.notna()
        each[s] = round(float(np.cov(r[s][pair], rn[pair])[0, 1] / np.var(rn[pair], ddof=1)), 2) if pair.sum() >= metrics.MIN_WEEKS and var > 0 else None
    return {**{k: float(v) for k, v in m.items()}, "each": each, "short": list(short), "weeks": int(len(r)), "years": round(len(r) / 52, 1)}


def beta500_weekly(series: List[Tuple[List[int], List[float]]], weights: List[float], bench: Dict[int, float], end: int,
                   names: Optional[List[str]] = None) -> Dict[str, Any]:
    """Task #277 (live number fix 4): one "beta against the Nifty 500" for every kind on this page, the one each portfolio page already headlines: weekly
    closes over the past year (the MF and ETF pages' `beta500`, mfportfolio.bench.build). Each item's own beta, and the list's from its weighted weekly
    changes. As on the Equity portfolio's Risk analytics, an item with under most of a year of weekly prices (fewer than MIN_WEEKS changes) is left out of
    the list's beta and the others' weights are scaled up; the window says how many were counted and names the ones left out (QA of 21 Nov: one share
    with a few months of prices had blanked the whole list's beta). The window goes with it, so the page can print it under the number."""
    from ..mfportfolio import bench as mfb
    weeks_at = mfb.fridays(end)
    bd = sorted(bench)
    n500 = mfb.changes(mfb.weekly(bd, [bench[d] for d in bd], weeks_at))
    chs = [mfb.changes(mfb.weekly(d, v, weeks_at)) for d, v in series]
    each = [mfb.r2(mfb.ols(c, n500)[0]) for c in chs]
    # task #391 (file 35, fault 1): a holding that weighs 0 in the split (no quantity) is not part of the list's line
    long_enough = [sum(1 for x in c if x is not None) >= mfb.MIN_WEEKS for c in chs]
    weighed = [weights[k] > 0 or not any(w > 0 for w in weights) for k in range(len(chs))]
    keep = [k for k in range(len(chs)) if long_enough[k] and weighed[k]]
    tw = sum(weights[k] for k in keep) or 1.0
    lw = {k: weights[k] / tw for k in keep}
    rows = [i for i in range(len(n500)) if keep and all(chs[k][i] is not None for k in keep)]
    port: List[Optional[float]] = [None] * len(n500)
    for i in rows:
        port[i] = sum(lw[k] * chs[k][i] for k in keep)   # type: ignore[operator]
    b = mfb.ols(port, n500)[0] if len(rows) >= mfb.MIN_WEEKS else None
    # task #391 (developer file 41 v4, A4): each one left out says its own reason. A holding without a quantity weighs 0, so it is left out for that
    # ("noQty": "no quantity yet"), whatever its history; "short" is only the ones with under most of a year of weekly prices. Both lists used to be one
    # ("short"), so an ETF with three years of prices but no quantity read "under a year of prices".
    no_qty = [names[k] for k in range(len(chs)) if not weighed[k]] if names else []
    short = [names[k] for k in range(len(chs)) if weighed[k] and not long_enough[k]] if names else []
    return {"beta": mfb.r2(b), "each": each, "window": {"index": "Nifty 500", "grain": "weekly", "window": "past year", "weeks": len(rows),
            "from": date.fromordinal(weeks_at[0]).isoformat(), "to": date.fromordinal(weeks_at[-1]).isoformat(),
            "counted": len(keep), "of": len(chs), "short": short, "noQty": no_qty}}


def fund_units(held: List[Dict[str, Any]]) -> Tuple[Dict[int, Dict[str, Any]], set]:
    """Task #391 (developer file 35, fault 2): each fund's open lots, added up across every account it is held in (My funds, an imported account, ...):
    {code: {units, lots, priced, unitsPriced, paid}}, and the codes with a lot of unknown units. `paid` adds the cost of the lots that have a buy amount
    only, so one account's lot without an amount never wipes the buy price of the fund's other lots (it used to set the whole fund's cost to None, and
    Invested and Gain dropped every fund held in two accounts)."""
    out: Dict[int, Dict[str, Any]] = {}
    unknown = set()
    for h in held:
        x = out.setdefault(h["code"], {"units": Decimal(0), "lots": 0, "priced": 0, "unitsPriced": Decimal(0), "paid": Decimal(0)})
        for lot in h["lots"]:
            if lot["units"] is None:
                unknown.add(h["code"])
                continue
            u = Decimal(str(lot["units"]))
            x["units"] += u
            x["lots"] += 1
            if lot["invested"] is not None:
                x["priced"] += 1
                x["unitsPriced"] += u
                x["paid"] += Decimal(str(lot["invested"]))
    return out, unknown


def fund_cost(x: Optional[Dict[str, Any]], nav: Optional[float], unknown: bool) -> Dict[str, Any]:
    """A fund's units and what they cost. `invested`: what ALL the units still held cost (None while a lot has no buy amount, so Gain = value now -
    invested stays like for like). Task #391 (fault 2), optional: `investedPriced` what the lots with a buy amount cost, `unitsPriced` their units,
    `valuePriced` their value now (units x NAV, so a gain on them is like for like), `lotsPriced` of `lots` ("1 of 2 with a buy price")."""
    if not x or unknown or x["units"] <= 0:
        return {"units": None, "invested": None, "investedPriced": None, "unitsPriced": None, "valuePriced": None,
                "lots": x["lots"] if x else 0, "lotsPriced": x["priced"] if x else 0}
    priced = x["priced"] > 0
    return {"units": float(x["units"]), "invested": float(x["paid"]) if x["priced"] == x["lots"] else None,
            "investedPriced": float(x["paid"]) if priced else None, "unitsPriced": float(x["unitsPriced"]) if priced else None,
            "valuePriced": calc.r(float(x["unitsPriced"]) * nav) if priced and nav else None, "lots": x["lots"], "lotsPriced": x["priced"]}


def name_of(kind: str, item: Dict[str, Any]) -> Dict[str, Any]:
    """A holding named for a list: a share by its symbol and name, a fund by its code and short name, an ETF by its symbol and name."""
    if kind == "funds":
        return {"code": item.get("code"), "name": item.get("short") or item.get("name")}
    return {"symbol": item.get("symbol"), "name": item.get("name") or item.get("symbol")}


SWING_GRAIN = {"weekly": "weekly prices", "daily": "daily NAVs and prices"}
KIND_WORD = {"shares": "Shares", "funds": "Mutual funds", "etfs": "ETFs"}


def swing_window(grain: str, years: Optional[float]) -> Optional[Dict[str, Any]]:
    """Task #391 (developer file 35, fault 12; decision: keep each kind's window, as on its portfolio page, and say it): the window of a kind's swing
    and worst fall, {grain, years, label}: "weekly prices, 2 years" for shares (the Equity portfolio's), "daily NAVs and prices, 3 years" for funds and ETFs."""
    if years is None:
        return None
    y = round(years) if abs(years - round(years)) < 0.05 else years
    return {"grain": grain, "years": years, "label": f"{SWING_GRAIN[grain]}, {y:g} {'year' if y == 1 else 'years'}"}


def swing_windows(kinds: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Whether the kinds' swing windows differ, and one line that says each ("Shares: weekly prices, 2 years. Mutual funds and ETFs: daily NAVs and
    prices, 3 years."), for the risk table's column header."""
    by: Dict[str, List[str]] = {}
    for k in calc.KINDS:
        w = (kinds.get(k) or {}).get("swingWindow")
        if w:
            by.setdefault(w["label"], []).append(k)
    line = " ".join(f"{calc.and_list([KIND_WORD[k] if i == 0 else calc.PART_WORD[k] for i, k in enumerate(ks)])}: {label}." for label, ks in by.items())
    return {"differ": len(by) > 1, "line": line or None}


def price_at(v: Any) -> Optional[str]:
    """A quote's time as an ISO string ("2026-11-26T10:16:05+05:30"); a value without a time of day (a date) or one that does not parse is None."""
    if not v or len(str(v)) <= 10:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).isoformat()
    except ValueError:
        return None


def prices_of(shares: List[Dict[str, Any]], etfs: List[Dict[str, Any]]) -> Dict[str, Optional[str]]:
    """Task #391 (developer file 41 v4, A1): which prices each kind uses. `sharesAt`: the latest share quote time (None when no share has a timed
    quote); `sharesTo`: the latest share price date; `etfsTo`: the latest ETF close date."""
    def when(x: str) -> datetime:
        d = datetime.fromisoformat(x)
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    ats = [s["priceAt"] for s in shares if s.get("priceAt")]
    return {"sharesAt": max(ats, key=when) if ats else None, "sharesTo": max((s["priceDate"] for s in shares if s.get("priceDate")), default=None),
            "etfsTo": max((e["priceDate"] for e in etfs if e.get("priceDate")), default=None)}


def _days_closes(p: Optional[Dict[str, Any]]) -> Tuple[List[int], List[float]]:
    """A share's stored daily prices ({t: ISO dates, c: closes}) as day ordinals and closes."""
    if not p or not p.get("t"):
        return [], []
    pairs = sorted((date.fromisoformat(str(t)[:10]).toordinal(), float(c)) for t, c in zip(p["t"], p["c"]) if c is not None and float(c) > 0)
    return [d for d, _ in pairs], [c for _, c in pairs]


def _list_risk(parts: List[Tuple[List[int], List[float], float]], end: int) -> Dict[str, Any]:
    """A fund or ETF list's swing a year and worst fall from a high, as its portfolio page works them out (daily, three years)."""
    ld, lv = mfrisk.list_series(parts, end) if parts else ([], [])
    if len(lv) < mfrisk.MIN_DAYS:
        return {"swing": None, "worstFall": None, "years": None, "why": "They share less than a year of daily prices, so they cannot be followed as one line yet." if parts else None}
    return {"swing": mfrisk.r1(mfrisk.swing(mfrisk.returns(lv), mfrisk.per_year(ld))), "worstFall": mfrisk.r1(mfrisk.worst_fall(lv)),
            "years": round((ld[-1] - ld[0]) / 365.25, 1), "why": None}


async def _quotes(store, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
    """Each company's quote from its stored summary (price, changePct, asOf), consolidated first: the price the Equity portfolio shows (portfolio_overview)."""
    from ..portfolio_overview import _num
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT DISTINCT ON (symbol) symbol, body::jsonb #> '{quote}' AS q FROM snapshots WHERE symbol = ANY($1::text[]) AND section = 'summary' "
                                "ORDER BY symbol, (statement = 'consolidated') DESC", symbols)
    out: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        q = orjson.loads(r["q"]) if isinstance(r["q"], (str, bytes)) else (r["q"] or {})
        if isinstance(q, dict) and _num(q.get("price")):
            out[r["symbol"]] = {"price": _num(q.get("price")), "changePct": _num(q.get("changePct")), "asOf": q.get("asOf")}
    return out


async def _bench(app) -> List[dict]:
    from .. import indices
    try:
        raw = await indices._cached(app, "idx:px:NIF500", 6 * 3600, lambda: indices._fetch_levels(app, "NIF500"))
        return indices.shape_levels(raw, 5)["rows"] if raw else []
    except Exception as exc:          # the index provider is down: the page shows everything else and says why the risk figures are empty
        log.warning("all-investments: Nifty 500 levels not read: %s", type(exc).__name__)
        return []


async def _peers(store) -> Dict[str, str]:
    """The stored Leader / In line / Laggard code of each company, only while the label is switched on for everyone (as on the Advanced screener)."""
    from .. import leadership_api
    try:
        if await leadership_api.public_now(store):
            async with store.pool.acquire() as conn:
                return {r["symbol"]: leadership_api.agreeing(r["label"], r["raw_label"], r["rel52"]) for r in await conn.fetch("SELECT symbol, label, raw_label, rel52 FROM leadership WHERE label IS NOT NULL")}   # task #183: never Leader at minus points
    except Exception as exc:
        log.warning("all-investments: peer labels not read: %s", type(exc).__name__)
    return {}


async def _etfs(app, user_id: str, pf: Optional[str] = None) -> Tuple[List[Dict[str, Any]], List[str]]:
    """The member's ETFs as the ETF portfolio reads them: [{symbol, name, qty, price, chg1y, premium, ter, tracks, holdings, asOf, days, closes}], and the
    symbols no longer listed."""
    from ..etfportfolio import api as ep
    from ..etfportfolio import book as eb
    if pf == "none":
        return [], []
    async with app.state.store.pool.acquire() as conn:
        held = await ep.held_of(conn, user_id, pf)
        cost = eb.open_cost(await eb.lots_of(conn, user_id), None if not pf or pf == "all" else pf)   # task #235: what the units still held cost
    if not held:
        return [], []
    by, idx = await asyncio.gather(ep.etf_rows(app), ep.index_keys(app))
    live = [h for h in held if h["symbol"] in by]
    gone = [h["symbol"] for h in held if h["symbol"] not in by]
    facts = await asyncio.gather(*[ep.facts_for(app, by[h["symbol"]]["isin"]) for h in live])
    files = await asyncio.gather(*[ep.holdings_for(app, by[h["symbol"]]["isin"]) for h in live])
    hist = await asyncio.gather(*[ep.closes_for(app, h["symbol"], by[h["symbol"]]) for h in live])
    out = []
    for h, f, (port, why), (days, closes, hwhy) in zip(live, facts, files, hist):
        r = by[h["symbol"]]
        v = ep._view(h["symbol"], h["qty"], r, f, idx.get(h["symbol"]))
        out.append({"symbol": h["symbol"], "short": h["symbol"], "name": v["name"], "isin": v["isin"], "qty": v["qty"], "price": v["price"], "priceDate": v["priceDate"],
                    "chg1d": v["changePct"], "chg1y": v["ret1y"], "premium": v["premium"], "ter": v["ter"]["value"], "assetClass": r.get("asset_class"),
                    "category": r.get("category"), "categoryLabel": v["categoryLabel"], "tracks": v["tracks"], "holdings": (port or {}).get("holdings") or [],
                    "assetSplit": ((port or {}).get("summary") or {}).get("assetSplit"), "asOf": (port or {}).get("asOf"),
                    "fileWhy": None if port and port.get("holdings") else why or "No monthly portfolio file found for this ETF yet.", "days": days, "closes": closes, "historyWhy": hwhy,
                    "invested": float(cost[h["symbol"]]) if cost.get(h["symbol"]) is not None and h["qty"] else None})
    return out, gone


@router.post("/all-investments")
async def all_investments(request: Request, body: Body, ctx: Ctx = Depends(member_ctx)) -> Response:
    app = request.app
    allowed, retry = await app.state.limiter.hit("all_investments", ip_of(request), 30, 60, fail_open=False)
    if not allowed:
        return Response(orjson.dumps({"status": "rate_limited", "detail": "Too many requests. Please wait and try again.", "retryAfter": retry}), status_code=429,
                        media_type="application/json", headers={"Retry-After": str(retry), "Cache-Control": "no-store"})
    from .. import mf, portfolios
    from ..diversification import api as div
    from ..etfportfolio import api as ep
    from ..etfportfolio import calc as ecalc
    from ..mfportfolio.calc import label_of
    gold = is_gold(ctx)
    store = app.state.store

    # ---- shares: one row per company, quantities added up (a row without a quantity makes the company's quantity unknown)
    qty: Dict[str, Optional[float]] = {}
    for s in body.shares:
        if s.symbol in qty and qty[s.symbol] is None:
            continue
        qty[s.symbol] = None if not s.qty else (qty.get(s.symbol) or 0) + s.qty
    symbols = list(qty)
    facts = {f["symbol"]: f for f in await store.diversification_facts(symbols)} if symbols else {}
    known = [s for s in symbols if s in facts]
    prices = await div._prices(app, known) if known else {}
    async with store.pool.acquire() as conn:
        held = [] if body.mfPf == "none" else await holdings_of(conn, ctx.user_id, body.mfPf)
        codes = sorted({h["code"] for h in held})
        schemes = {r["code"]: dict(r) for r in await conn.fetch(f"SELECT {SCHEME_COLS} FROM mf_schemes WHERE code = ANY($1::int[])", codes)} if codes else {}  # nosec B608 - fixed column list; codes are bound
        navs = {c: await nav_history(conn, schemes[c]) for c in codes if c in schemes}
        fscores = await scores_for(conn, codes) if gold and codes else {}
    etfs, etf_gone = await _etfs(app, ctx.user_id, body.etfPf)
    peer_raw, bench_rows = await asyncio.gather(_peers(store), _bench(app))
    bench = {date.fromisoformat(r["d"]).toordinal(): float(r["c"]) for r in bench_rows}
    end = max(bench) if bench else None

    quotes = await _quotes(store, known) if known else {}
    shares: List[Dict[str, Any]] = []
    for s in known:
        f = facts[s]
        p = prices.get(s) or {}
        pairs = [(_ord(t), c) for t, c in zip(p.get("t") or [], p.get("c") or [])]
        pairs = [(d, c) for d, c in pairs if d is not None]
        days, vals = [d for d, _ in pairs], [c for _, c in pairs]
        last = vals[-1] if vals else None
        prev = vals[-2] if len(vals) > 1 else None
        q = quotes.get(s) or {}
        # QA of 21 Nov (item 5): the price and the day's change are the company's quote, as the Equity portfolio shows them (the stored price series is
        # weekly, so its last point can be an older close); the series stays the fallback and still gives the 1-year change
        price = q.get("price") or last
        # task #391 (developer file 41 v4, A1): the quote's own time goes with it (`priceAt`, as the Equity portfolio's priceAsOf), so a price from inside
        # the session reads "at 10:16", not "close"; the date alone (priceDate) stays for the lists
        at = price_at(q.get("asOf")) if q.get("price") else None
        shares.append({"symbol": s, "name": f.get("name") or s, "qty": qty[s], "price": price, "priceAt": at,
                       "priceDate": (str(q["asOf"])[:10] if q.get("price") and q.get("asOf") else date.fromordinal(days[-1]).isoformat() if days else None),
                       "chg1d": q["changePct"] if q.get("price") and q.get("changePct") is not None else (last / prev - 1) * 100 if last and prev else None,
                       "chg1y": _year_change(days, vals), "mcap": calc._num(f.get("mcap"))})

    units, unknown_units = fund_units(held)
    funds: List[Dict[str, Any]] = []
    for c in codes:
        s = schemes.get(c)
        if s is None:
            continue
        port = await portfolios.get_portfolio(store.pool, c)
        days, vals = navs.get(c, ([], []))
        nav = float(s["nav"]) if s.get("nav") is not None else (vals[-1] if vals else None)
        sc = fscores.get(c) or {}
        funds.append({"code": c, "name": s["name"], "short": mfrisk.short_name(s["name"]), "type": mf.classify(s["category"])[2] if s.get("category") else None,
                      "nav": nav, "navDate": s["nav_date"].isoformat() if s.get("nav_date") else None,
                      "chg1y": _year_change(days, vals), "ter": calc._num(float(s["ter"])) if s.get("ter") is not None else None,
                      "holdings": (port or {}).get("holdings") or [], "assetSplit": ((port or {}).get("summary") or {}).get("assetSplit"), "asOf": (port or {}).get("asOf"),
                      "score": sc.get("final"), "label": sc.get("label"), "parts": sc.get("parts"), "scoreWhy": None if not gold or sc.get("final") is not None else sc.get("reason"),
                      "days": days, "closes": vals, **fund_cost(units.get(c), nav, c in unknown_units)})

    # task #391 (file 35, fault 10): every fund and ETF line with an ISIN the listed-company master knows takes the master's name (the fund file's text
    # stays as fileName), as the MF and ETF portfolio pages (#389, #390), before the look-through, so every list on this page carries the same name
    isins = sorted({str(h["isin"]).upper() for x in funds + etfs for h in x.get("holdings") or [] if h.get("isin")})
    if isins:
        try:
            from ..mfportfolio.api import company_names
            from ..mfportfolio.spread import master_names
            async with store.pool.acquire() as conn:
                master_names(funds + etfs, await company_names(conn, isins))
        except Exception as exc:     # the names are a nicety: the page keeps the files' names when the master cannot be read
            log.warning("all-investments: master names not read: %s", type(exc).__name__)

    split = calc.split_parts(shares, funds, etfs)
    companies = calc.look_through(shares, funds, etfs, split)
    fund_name = {f["code"]: f["short"] for f in funds}

    # ---- every listed company underneath: name, macro sector, market value, score
    listed = sorted({c["symbol"] for c in companies if c["symbol"] and not c["abroad"]})
    more = [x for x in listed if x not in facts]
    for f in (await store.diversification_facts(more) if more else []):
        facts[f["symbol"]] = f
    classes = await store.classifications(listed) if listed else {}
    scores = await ep.scores_for(app, listed, gold) if listed else {}
    for c in companies:
        f = facts.get(c["symbol"] or "")
        if f and f.get("name"):
            c["name"] = f["name"]
    sectors = calc.macro_sectors(companies, {s: (classes.get(s) or {}).get("macro_sector") for s in listed})
    sizes = calc.company_sizes(companies, lambda c: calc._num((facts.get(c["symbol"] or "") or {}).get("mcap")))
    made = calc.made_of(shares, funds, etfs, split)

    # ---- risk: each kind's beta against the Nifty 500, then together
    week = div.unfinished_week(div.now_ist())
    s_market = None
    if shares and bench_rows:
        sw = {s["symbol"]: w for s, w in zip(shares, split["shares"]["w"])}
        try:
            s_market = await asyncio.to_thread(_shares_market, prices, bench_rows, [s["symbol"] for s in shares], sw, week)
        except Exception as exc:
            log.warning("all-investments: share market figures failed: %s", type(exc).__name__)
    # task #277 (fix 4): every beta here is the one each kind's own page headlines (weekly, past year, against the Nifty 500), with its window
    b500 = {k: beta500_weekly([_days_closes(prices.get(x["symbol"])) for x in items] if k == "shares" else [(x["days"], x["closes"]) for x in items],
                              list(split[k]["w"]), bench, end, [x.get("symbol") or x.get("short") or x.get("name") or "" for x in items]) if bench and end and items else None
            for k, items in (("shares", shares), ("funds", funds), ("etfs", etfs))}
    for i, s in enumerate(shares):
        s["beta"] = b500["shares"]["each"][i] if b500["shares"] else None
    for kind, items in (("funds", funds), ("etfs", etfs)):
        for i, f in enumerate(items):
            fig = mfrisk.fund_figures(f["days"], f["closes"], bench, end) if bench and f["days"] else {"beta": None, "swing": None, "worstFall": None, "why": None}
            f.update(beta=b500[kind]["each"][i] if b500[kind] else None, swing=fig["swing"], worstFall=fig["worstFall"], riskWhy=fig.get("why"))
    kind_risk: Dict[str, Dict[str, Any]] = {}
    if shares:
        kind_risk["shares"] = {"beta": (b500["shares"] or {}).get("beta"), "betaWindow": (b500["shares"] or {}).get("window"),
                               "swing": (s_market or {}).get("vol"), "worstFall": (s_market or {}).get("max_fall"),
                               "years": (s_market or {}).get("years"), "swingWindow": swing_window("weekly", (s_market or {}).get("years")),
                               "benchSwing": (s_market or {}).get("vol_nifty"), "benchWorstFall": (s_market or {}).get("max_fall_nifty"),
                               "why": NO_BENCH if not bench_rows else None if s_market else "Needs about a year of weekly prices for your shares."}
    for kind, items in (("funds", funds), ("etfs", etfs)):
        if not items:
            continue
        b = (b500[kind] or {}).get("beta")
        cover = round(sum(w for f, w in zip(items, split[kind]["w"]) if f["beta"] is not None) / (sum(split[kind]["w"]) or 1) * 100, 1)
        parts = [(f["days"], f["closes"], w) for f, w in zip(items, split[kind]["w"]) if f["swing"] is not None and w > 0]   # task #391: weight 0 is not in the list
        lr = _list_risk(parts, end) if end else {"swing": None, "worstFall": None, "years": None}
        kind_risk[kind] = {"beta": b, "betaWindow": (b500[kind] or {}).get("window"), "cover": cover, **lr, "swingWindow": swing_window("daily", lr.get("years")), "why": NO_BENCH if not bench else None if b is not None else
                           f"Your {calc.PART_WORD[kind]} do not share most of a year of weekly prices yet."}
    for v in kind_risk.values():
        v["bandKey"] = calc.beta_band_key(v.get("beta"))
    together = calc.risk_together({k: {"share": split["part"][k], "beta": v["beta"]} for k, v in kind_risk.items()}, split["total"])
    together["swingWindows"] = swing_windows(kind_risk)
    bench_fig = None
    if bench:
        bd, bv = mfrisk.window(sorted(bench), [bench[d] for d in sorted(bench)], end)
        bench_fig = {"name": "Nifty 500", "swing": mfrisk.r1(mfrisk.swing(mfrisk.returns(bv), mfrisk.per_year(bd))), "worstFall": mfrisk.r1(mfrisk.worst_fall(bv)),
                     "from": date.fromordinal(bd[0]).isoformat(), "to": date.fromordinal(bd[-1]).isoformat()}

    # ---- health
    s_scores = [scores.get(s["symbol"], {}) for s in shares] if shares else []
    for s, sc in zip(shares, s_scores):
        s["score"], s["label"] = sc.get("score"), calc.word_case(sc.get("label"))
    s_bands = PRISM_BANDS
    s_avg = calc.weighted_mean([s["score"] for s in shares], split["shares"]["w"])
    f_avg = calc.weighted_mean([f["score"] for f in funds], split["funds"]["w"])
    health = {
        "shares": {"model": "prism", "score": calc.r(s_avg, 0), "label": label_of(s_avg) or None if s_avg is not None else None,
                   **calc.band_counts([s["label"] for s in shares], split["shares"]["w"], s_bands)} if shares and gold else None,
        "funds": ({"locked": True} if not gold else {"locked": False, "score": calc.r(f_avg, 0), "label": label_of(f_avg) or None if f_avg is not None else None,
                  **calc.band_counts([f["label"] for f in funds], split["funds"]["w"], FUND_BANDS),
                  "lowest": min(({"name": f["short"], "score": f["score"], "label": f["label"]} for f in funds if f["score"] is not None), key=lambda x: x["score"], default=None)}) if funds else None,
        "etfs": {"ter": calc.r(calc.weighted_mean([e["ter"] for e in etfs], split["etfs"]["w"]), 3),
                 "costPerLakh": calc.r((calc.weighted_mean([e["ter"] for e in etfs], split["etfs"]["w"]) or 0) * 1000, 0) if any(e["ter"] is not None for e in etfs) else None,
                 "widestGap": max(({"symbol": e["symbol"], "premium": e["premium"]} for e in etfs if e["premium"] is not None), key=lambda x: abs(x["premium"]), default=None)} if etfs else None,
    }
    under = [c for c in companies if c["symbol"] and not c["abroad"]]
    health["underneath"] = {"model": "prism", **calc.band_counts([(scores.get(c["symbol"]) or {}).get("label") for c in under], [c["all"] for c in under], s_bands)} if under and gold else None

    # ---- each kind's card
    def card(kind: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        sp = split[kind]
        chg = calc.weighted_mean([i.get("chg1y") for i in items], sp["w"])
        order = sorted(zip(items, sp["w"]), key=lambda x: -x[1]) if sp["valued"] else list(zip(items, sp["w"]))
        return {"count": len(items), "valued": sp["valued"], "value": calc.r(sp["value"]) if split["byValue"] else None, "share": calc.r(split["part"][kind] * 100),
                "chg1y": calc.r(chg), "beta": (kind_risk.get(kind) or {}).get("beta"), "betaBand": calc.beta_band((kind_risk.get(kind) or {}).get("beta")),
                "betaBandKey": calc.beta_band_key((kind_risk.get(kind) or {}).get("beta")), "counted": sp["counted"], "of": sp["of"],
                "noQuantity": [name_of(kind, items[x["i"]]) for x in split["noQuantity"] if x["kind"] == kind],
                "first": [{"name": i.get("short") or i.get("name"), "symbol": i.get("symbol"), "code": i.get("code"), "w": calc.r(w * 100, 1)} for i, w in order[:3] if w > 0 or not sp["valued"]],
                "firstIs": "largest" if sp["valued"] else "list"}

    cards = {"shares": card("shares", shares), "funds": card("funds", funds), "etfs": card("etfs", etfs)}
    cards["shares"].update(score=(health["shares"] or {}).get("score"), scoreModel="prism" if gold else None, scoreLocked=not gold,
                           peers={w: sum(1 for s in shares if calc.peer_word(peer_raw.get(s["symbol"]), True) == w) for w in ("Leader", "In line", "Laggard", calc.NOT_COMPARED)},
                           bands=(health["shares"] or {}).get("bands"))
    cards["funds"].update(score=(health["funds"] or {}).get("score"), scoreLocked=not gold, bands=(health["funds"] or {}).get("bands"),
                          scoreWord=label_of((health["funds"] or {}).get("score")) or None if (health["funds"] or {}).get("score") is not None else None,
                          overlap=calc.fund_overlap(funds), sharedCompanies=sum(1 for c in companies if len(c["viaFunds"]) > 1))
    rep = ecalc.repeats({e["symbol"]: e["tracks"] for e in etfs})
    cards["etfs"].update(ter=(health["etfs"] or {}).get("ter"), repeats=rep,
                         types=[{"label": k, "count": n} for k, n in Counter(e["categoryLabel"] or "Other" for e in etfs).items()])

    twice = {s for x in rep for s in x["symbols"]}
    out_shares = [{**{k: s[k] for k in ("symbol", "name", "qty", "price", "priceDate", "priceAt", "chg1d", "chg1y", "beta", "score", "label")},
                   "macro": (classes.get(s["symbol"]) or {}).get("macro_sector") or calc.NOT_CLASSIFIED, "size": calc.size_of(s["mcap"]), "peer": calc.peer_word(peer_raw.get(s["symbol"]), True),
                   "value": calc.r(s["qty"] * s["price"]) if s["qty"] and s["price"] else None, "of": calc.r(split["part"]["shares"] * w * 100),
                   "alsoIn": next(({"funds": calc.r(c["funds"]), "etfs": calc.r(c["etfs"]), "all": calc.r(c["all"]), "via": [fund_name.get(x, str(x)) for x in c["viaFunds"]] + c["viaEtfs"]}
                                   for c in companies if c["symbol"] == s["symbol"] and c["ways"] > 1), None)} for s, w in zip(shares, split["shares"]["w"])]
    out_funds = [{**{k: f[k] for k in ("code", "name", "short", "type", "units", "nav", "navDate", "ter", "asOf", "score", "label", "parts", "scoreWhy", "beta", "swing", "worstFall", "riskWhy", "invested",
                                       "investedPriced", "unitsPriced", "valuePriced", "lots", "lotsPriced")},
                  "chg1y": calc.r(f["chg1y"]), "value": calc.r(f["units"] * f["nav"]) if f["units"] and f["nav"] else None, "of": calc.r(split["part"]["funds"] * w * 100),
                  "file": bool(f["holdings"]), "equityLines": sum(1 for h in f["holdings"] if (h.get("assetClass") or "equity") == "equity")}
                 for f, w in zip(funds, split["funds"]["w"])]
    out_etfs = [{**{k: e[k] for k in ("symbol", "name", "isin", "qty", "price", "priceDate", "chg1d", "chg1y", "premium", "ter", "categoryLabel", "asOf", "fileWhy", "beta", "swing", "worstFall", "riskWhy", "invested")},
                 "tracks": e["tracks"].get("label"), "twice": e["symbol"] in twice, "value": calc.r(e["qty"] * e["price"]) if e["qty"] and e["price"] else None,
                 "of": calc.r(split["part"]["etfs"] * w * 100), "file": bool(e["holdings"])} for e, w in zip(etfs, split["etfs"]["w"])]
    out_companies = [{"symbol": c["symbol"], "name": c["name"], "abroad": c["abroad"], "macro": calc.LISTED_ABROAD if c["abroad"] else ((classes.get(c["symbol"] or "") or {}).get("macro_sector") or c["macro"] or calc.NOT_CLASSIFIED),
                      "size": c.get("size"), "all": calc.r(c["all"], 3), "direct": calc.r(c["direct"], 3), "funds": calc.r(c["funds"], 3), "etfs": calc.r(c["etfs"], 3), "held": c["held"],
                      "via": [fund_name.get(x, str(x)) for x in c["viaFunds"]] + list(c["viaEtfs"]),
                      "score": None if c["abroad"] or not c["symbol"] else (scores.get(c["symbol"]) or {}).get("score"),
                      "label": None if c["abroad"] or not c["symbol"] else calc.word_case((scores.get(c["symbol"]) or {}).get("label")),
                      "peer": calc.peer_word(peer_raw.get(c["symbol"] or ""), calc.direct_held(c)), **({"noQuantity": True} if c["onList"] and c["direct"] <= 0 else {})} for c in companies]
    changes = calc.changes_list(companies)
    if body.mfPf in (None, "all") and body.etfPf in (None, "all"):   # task #277 (change 19): all accounts: keep the list for the "All my investments" alert
        try:
            async with store.pool.acquire() as conn:
                await conn.execute("INSERT INTO user_state (user_id, invest_list) VALUES ($1, $2::jsonb) ON CONFLICT (user_id) DO UPDATE SET invest_list = EXCLUDED.invest_list", ctx.user_id,
                                   orjson.dumps({"at": datetime.now(timezone.utc).isoformat(), **changes}).decode())
        except Exception:   # the page never fails because the alert list could not be kept
            log.warning("myinvest: could not keep the What changed list", exc_info=True)
    have = sum(1 for s in shares if s["qty"]) + sum(1 for f in funds if f["units"]) + sum(1 for e in etfs if e["qty"])
    files = [f["asOf"] for f in funds + etfs if f.get("asOf")]
    body_out = {
        "plan": "gold" if gold else "silver", "byValue": split["byValue"], "total": calc.r(split["total"]), "missing": split["missing"],
        # task #391 (file 35, fault 1): the holdings the money split leaves out (no quantity or no price, in a kind that has values), named; how many it counts
        "noQuantity": [{"kind": x["kind"], **name_of(x["kind"], {"shares": shares, "funds": funds, "etfs": etfs}[x["kind"]][x["i"]])} for x in split["noQuantity"]],
        "counted": {"byValue": sum(split[k]["counted"] for k in calc.KINDS), "equal": sum(split[k]["of"] for k in split["missing"]),
                    "notCounted": len(split["noQuantity"]), "of": len(shares) + len(funds) + len(etfs)},
        "counts": {"shares": len(shares), "funds": len(funds), "etfs": len(etfs)}, "quantities": {"have": have, "of": len(shares) + len(funds) + len(etfs)},
        "chg1y": calc.r(calc.weighted_mean([cards[k]["chg1y"] for k in calc.KINDS], [split["part"][k] for k in calc.KINDS])),
        "cards": cards, "madeOf": made, "sectors": sectors, "sizes": sizes, "companies": out_companies, "filters": calc.filter_counts(companies), "changes": changes,
        "health": health, "risk": {**together, "kinds": kind_risk, "bench": bench_fig},
        "shares": out_shares, "funds": out_funds, "etfs": out_etfs,
        "sources": {"pricesTo": max((s["priceDate"] for s in shares + etfs if s.get("priceDate")), default=None),
                    # task #391 (developer file 41 v4, A1): each kind's own prices, so the page says when they differ: the shares' latest quote time (an
                    # ISO time in India time, or a date when no quote carries one), the ETFs' last NSE close (the ETF portfolio's own price, etf.row_view)
                    **prices_of(shares, etfs),
                    "navsTo": max((f["navDate"] for f in funds if f.get("navDate")), default=None), "filesFrom": min(files, default=None), "filesTo": max(files, default=None)},
        "unknown": [s for s in symbols if s not in known], "gone": etf_gone, "disclaimer": DISCLAIMER,
    }
    return Response(orjson.dumps(body_out, option=orjson.OPT_SERIALIZE_NUMPY), media_type="application/json", headers=NO_STORE)
