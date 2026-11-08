"""POST /api/portfolio/page: the figures behind the new Equity portfolio page (docs/PORTFOLIO-PAGE.md).

The body carries share names only (extra='forbid': quantity, amount, price, date or any other field gives a 422). The answer is the handover pack's
page object (metrics.build_page: score, co-movement grid, groups, share of risk, NIFTY 50 measures, readings and summary) worked out from the stored
adjusted weekly closes of the last 105 complete weeks and the NIFTY 50 closes on the same weeks, plus each share's name, sector, size band and market
value. It is kept in Redis by sorted names + the unfinished week, so it is recomputed when the list changes or a new week completes.

Plans: Silver and Gold (Basic is refused with 403 plan_required, as the other Equity portfolio tools). The style tilt is built from FinLit Prism ratings and
goes to Gold only, exactly as on the Diversification card; Silver gets a locked block with the reason. Price, today's change and the score columns come
from POST /api/portfolio/overview (they are live and plan specific), not from here.
Information only, not investment advice.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from typing import Any, Dict, List, Literal, Optional

import orjson
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..auth.entitlements import has
from ..auth.routes import Ctx, fail, ip_of, secure_ctx
from ..diversification import api as div
from . import inputs

log = logging.getLogger("finlit.portfolio_page")
router = APIRouter(prefix="/api/portfolio")

SYMBOL = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
MAX_SYMBOLS = 500
CACHE_SECONDS = 6 * 3600
CACHE_VERSION = "v1"
TILT_LOCKED = div.TILT_LOCKED
NO_STORE = {"Cache-Control": "private, no-store", "Vary": "Cookie"}


class PageIn(BaseModel):
    """Share names only. Any other field is a 422."""
    model_config = ConfigDict(extra="forbid")
    symbols: List[str] = Field(min_length=1, max_length=MAX_SYMBOLS)

    @field_validator("symbols")
    @classmethod
    def clean(cls, v: List[str]) -> List[str]:
        out: List[str] = []
        for s in v:
            s = s.strip().upper()
            if not SYMBOL.match(s):
                raise ValueError("bad symbol")
            if s not in out:
                out.append(s)
        return out


async def member_ctx(request: Request, ctx: Ctx = Depends(secure_ctx)) -> Ctx:
    if ctx.role != "admin" and not has(ctx.plan, "silver"):
        raise fail(403, "plan_required", "Equity portfolio is part of the Silver plan.", plan="silver")
    return ctx


async def _sector_spellings(app) -> Dict[str, str]:
    """Raw Sector label -> the one spelling the site shows (variant spellings merged, as the screener does)."""
    from ..presets.industry import sector_map
    redis = app.state.store.redis
    try:
        raw = await redis.get("pfpage:sectors:v1")
    except Exception:
        raw = None
    if raw:
        return orjson.loads(raw)
    async with app.state.store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT sector, count(*) AS n FROM companies WHERE sector IS NOT NULL AND sector <> '' GROUP BY sector")
    mapping = sector_map({r["sector"]: int(r["n"]) for r in rows})
    try:
        await redis.set("pfpage:sectors:v1", orjson.dumps(mapping), ex=3600)
    except Exception:
        pass
    return mapping


def _compute(prices: Dict[str, Any], index_rows: List[dict], meta: Dict[str, dict], week: str) -> dict:
    return inputs.run(prices, index_rows, meta, week)      # pandas + scipy: runs in a worker thread


@router.post("/page")
async def page(request: Request, body: PageIn, ctx: Ctx = Depends(member_ctx)) -> Response:
    app = request.app
    allowed, retry = await app.state.limiter.hit("portfolio_page", ip_of(request), 30, 60, fail_open=False)
    if not allowed:
        return Response(orjson.dumps({"status": "rate_limited", "detail": "Too many requests. Please wait and try again.", "retryAfter": retry}), status_code=429,
                        media_type="application/json", headers={"Retry-After": str(retry), "Cache-Control": "no-store"})
    symbols = body.symbols
    week = div.unfinished_week(div.now_ist())
    key = "pfpage:" + ":".join([CACHE_VERSION, week, hashlib.sha1(",".join(sorted(symbols)).encode()).hexdigest()[:24]])   # nosec B324 - cache key
    redis = app.state.store.redis
    try:
        cached = await redis.get(key)
    except Exception:
        cached = None
    if cached:
        result = orjson.loads(cached)
    else:
        facts = div._facts(await app.state.store.diversification_facts(symbols))
        known = [s for s in symbols if s in facts]
        unknown = [s for s in symbols if s not in facts]
        result: Dict[str, Any] = {"week": week, "symbols": known, "unknown": unknown, "page": None, "meta": {}, "noPrices": []}
        if known:
            prices = await div._prices(app, known)
            index_rows = await div._index(app)
            if not index_rows:
                raise fail(502, "provider_unavailable", "NIFTY 50 prices are not available right now, so the comparison cannot be worked out. Please try again in a moment.")
            meta = inputs.build_meta(known, facts, await _sector_spellings(app))
            try:
                page_obj = await asyncio.to_thread(_compute, prices, index_rows, meta, week)
            except AssertionError:
                log.exception("a reading failed the wording check")
                raise fail(500, "wording_check", "The readings could not be written for this list. This has been logged.")
            result.update({"page": page_obj, "meta": meta, "noPrices": [s for s in known if s not in prices]})
        try:
            await redis.set(key, orjson.dumps(result, option=orjson.OPT_SERIALIZE_NUMPY), ex=CACHE_SECONDS)
        except Exception:
            pass
    if result.get("page"):
        if ctx.role == "admin" or has(ctx.plan, div.STYLE_TILT_TIER):
            from ..diversification import calc
            tilt = calc.style_tilt(await div._prism_universe(app), result["symbols"])
            tilt["sentence"] = calc.tilt_sentence(tilt["parts"])
            result = {**result, "styleTilt": tilt}
        else:
            result = {**result, "styleTilt": TILT_LOCKED}
    return Response(orjson.dumps(result, option=orjson.OPT_SERIALIZE_NUMPY), media_type="application/json", headers=NO_STORE)


@router.post("/trend")
async def trend_page(request: Request, body: PageIn, ctx: Ctx = Depends(member_ctx)) -> Response:
    """Short- and long-term trend of the listed shares (FinLit Prism technical scores). Names only; every share counts the same. Gold only (Prism), as the style
    tilt: Silver gets a locked answer. Words, shares and counts: the bands and the gap figure stay here."""
    if not (ctx.role == "admin" or has(ctx.plan, div.STYLE_TILT_TIER)):
        return Response(orjson.dumps({"locked": True, "why": "The short- and long-term trend of your shares is part of the Gold plan."}), media_type="application/json", headers=NO_STORE)
    from .. import prism_screen
    from ..mfportfolio import trend
    cards = prism_screen.cards(await request.app.state.store.prism_cards(body.symbols))
    items = [{"symbol": s, "weight": 1.0, "st": cards.get(s, {}).get("prism_st_score"), "lt": cards.get(s, {}).get("prism_lt_score"), "prismLabel": cards.get(s, {}).get("prism_label")} for s in body.symbols]
    per = {s: {"st": cards[s].get("prism_st"), "lt": cards[s].get("prism_lt")} for s in body.symbols if s in cards}
    return Response(orjson.dumps({"locked": False, "trend": trend.public(trend.portfolio_trend(items)), "perShare": per}), media_type="application/json", headers=NO_STORE)


class ScoreItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    symbol: str
    qty: Optional[float] = Field(default=None, gt=0, le=1_000_000_000)

    @field_validator("symbol")
    @classmethod
    def sym(cls, v: str) -> str:
        v = v.strip().upper()
        if not SYMBOL.match(v):
            raise ValueError("bad symbol")
        return v


class ScoreIn(BaseModel):
    """The shares with the quantity of each (optional) and the five choices. Anything else is a 422. Quantities are used for this answer only: never stored or logged."""
    model_config = ConfigDict(extra="forbid")
    items: List[ScoreItem] = Field(min_length=1, max_length=MAX_SYMBOLS)
    horizon: Literal["lt1", "1-3", "3-5", "gt5"] = "3-5"
    risk: Literal["low", "medium", "high"] = "medium"
    goal: Literal["grow", "income", "protect"] = "grow"
    benchmark: Literal["NIF50", "NIF500", "NIFMID150", "NIFSMA250"] = "NIF50"

    @field_validator("items")
    @classmethod
    def unique(cls, v: List[ScoreItem]) -> List[ScoreItem]:
        if len({i.symbol for i in v}) != len(v):
            raise ValueError("a share is listed twice")
        return v


def _score_compute(prices, nifty_rows, bench_rows, meta, symbols, values, cards, week, horizon, risk, goal, benchmark):
    """pandas part (worker thread): the diversification page score and the market measures for the value weights against the chosen index."""
    import numpy as np
    from . import metrics, score
    from ..mfportfolio import trend
    page_score = None
    market = None
    known = [s for s in symbols if s in meta]
    if known:
        page = inputs.run(prices, nifty_rows, {s: meta[s] for s in known}, week)
        page_score = inputs.card_score(page) and page["score"]
        frame, bench = inputs.build_frame(prices, bench_rows, known, week)
        r, rn, _short = metrics.weekly_returns(frame, bench)
        if len(r.columns) >= 1 and len(r) >= 20:
            w = np.array([max(values.get(s, 0.0), 0.0) for s in r.columns], dtype=float)
            w = w / w.sum() if w.sum() > 0 else np.ones(len(r.columns)) / len(r.columns)
            market = metrics.market_measures(r, rn, w)
    return score.build(symbols, values, cards, page_score, market, horizon, risk, goal, benchmark, trend.portfolio_trend)


@router.post("/score")
async def score_page(request: Request, body: ScoreIn, ctx: Ctx = Depends(member_ctx)) -> Response:
    """Your portfolio score (Gold: it reads FinLit Prism). The total and the readings come back as words and plain figures; the blend and its points stay here."""
    if not (ctx.role == "admin" or has(ctx.plan, div.STYLE_TILT_TIER)):
        return Response(orjson.dumps({"locked": True, "why": "Your portfolio score is part of the Gold plan."}), media_type="application/json", headers=NO_STORE)
    app = request.app
    allowed, retry = await app.state.limiter.hit("portfolio_score", ip_of(request), 30, 60, fail_open=False)
    if not allowed:
        return Response(orjson.dumps({"status": "rate_limited", "detail": "Too many requests. Please wait and try again.", "retryAfter": retry}), status_code=429,
                        media_type="application/json", headers={"Retry-After": str(retry), "Cache-Control": "no-store"})
    from .. import prism_screen
    symbols = [i.symbol for i in body.items]
    qty = {i.symbol: i.qty for i in body.items if i.qty}
    week = div.unfinished_week(div.now_ist())
    facts = div._facts(await app.state.store.diversification_facts(symbols))
    known = [s for s in symbols if s in facts]
    unknown = [s for s in symbols if s not in facts]
    cards = prism_screen.cards(await app.state.store.prism_cards(known)) if known else {}
    prices = await div._prices(app, known) if known else {}
    nifty_rows = await div._index(app)
    if known and not nifty_rows:
        raise fail(502, "provider_unavailable", "NIFTY 50 prices are not available right now. Please try again in a moment.")
    bench_rows = nifty_rows
    if body.benchmark != "NIF50" and known:
        from ..indices import _cached, _fetch_levels, shape_levels
        raw = await _cached(app, f"idx:px:{body.benchmark}", 6 * 3600, lambda: _fetch_levels(app, body.benchmark))
        bench_rows = shape_levels(raw, 5)["rows"] if raw else None
        if not bench_rows:
            raise fail(502, "provider_unavailable", "The chosen index is not available right now. Please try again in a moment.")
    values = {}
    for s in known:
        p = prices.get(s)
        last = p["c"][-1] if p and p.get("c") else None
        if s in qty and last:
            values[s] = float(qty[s]) * float(last)
    meta = inputs.build_meta(known, facts, await _sector_spellings(app)) if known else {}
    try:
        out = await asyncio.to_thread(_score_compute, prices, nifty_rows, bench_rows, meta, known, values, cards, week, body.horizon, body.risk, body.goal, body.benchmark)
    except AssertionError:
        log.exception("a reading failed the wording check")
        raise fail(500, "wording_check", "The score could not be worked out for this list. This has been logged.")
    out.update(locked=False, unknown=unknown, noQuantity=[s for s in known if s not in values])
    return Response(orjson.dumps(out, option=orjson.OPT_SERIALIZE_NUMPY), media_type="application/json", headers=NO_STORE)
