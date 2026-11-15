"""/api/me/etf-portfolio: the ETFs a member keeps (task #136), Silver and Gold like My mutual funds; Basic and visitors are refused.

    GET     ""                 the ETFs with price, returns, cost, price against NAV, value traded, tracking difference and what each tracks
    GET     "/inside"          what the money is in, company size, overlap between share ETFs and the largest stocks underneath (Prism on Gold, IQ on Silver)
    GET     "/risk"            each ETF and the whole list against the Nifty 500 (the MF portfolio's sums), moving together, and each one's share of the swings
    POST    ""                 add an ETF (optionally with a quantity)
    PUT     "/quantities"      set or clear the quantities of ETFs already in the list
    DELETE  "/{symbol}"        remove one ETF
    DELETE  ""                 remove every ETF of the member
    POST    "/import-preview"  rows read from a broker file -> each row matched on ISIN, then on symbol; nothing stored
    POST    "/import-commit"   the rows the member confirmed -> stored

Plan rules are applied here: the number of ETFs is entitlements.LIMITS[plan]["etf_holdings"]; the largest stocks carry FinLit Prism for Gold and the FinLit IQ for
Silver, never both. Writes need a signed-in session from our own pages (Origin + CSRF) and are rate limited per member. Every query filters on the member's id.
Information only, not investment advice.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from bisect import bisect_right
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Literal, Optional, Tuple, Union

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from .. import etf, etf_vs_index
from ..auth.entitlements import LIMITS, has, sees_all
from ..auth.routes import Ctx, fail, limit, secure_ctx
from ..mfportfolio import risk
from . import DISCLAIMER, calc

log = logging.getLogger("finlit.etfportfolio")
router = APIRouter(prefix="/api/me/etf-portfolio")
NO_STORE = {"Cache-Control": "private, no-store", "Vary": "Cookie"}
MAX_IMPORT_ROWS = 2000
CELL_MAX = 300
MAX_QTY = Decimal("1000000000000")
SYMBOL = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
ISIN = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")
GONE = "This ETF is no longer listed in our data."
TER_WHY = "Not published in the sources loaded for this ETF."
NO_INDEX_LEVELS = "No daily level of the price it follows is on file, so there is nothing to measure it against."


def reply(body: Dict[str, Any], status: int = 200) -> JSONResponse:
    return JSONResponse(body, status_code=status, headers=NO_STORE)


async def member_ctx(request: Request, ctx: Ctx = Depends(secure_ctx)) -> Ctx:
    if not sees_all(ctx) and not has(ctx.plan, "silver"):
        raise fail(403, "plan_required", "The ETF portfolio is part of the Silver plan.", plan="silver")
    return ctx


def is_gold(ctx: Ctx) -> bool:
    return sees_all(ctx) or has(ctx.plan, "gold")


def cap_for(ctx: Ctx) -> int:
    return LIMITS["gold" if sees_all(ctx) else ctx.plan if ctx.plan in LIMITS else "basic"]["etf_holdings"]


def qty_of(v: Any) -> Optional[Decimal]:
    """A quantity as typed or read from a file: '1,200', 50, '12.5' -> Decimal; '' / None -> None. Zero, negative or huge numbers are refused."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        q = Decimal(str(v).replace(",", "").strip())
    except InvalidOperation:
        raise ValueError("The quantity is not a number.")
    if not q.is_finite() or q <= 0:
        raise ValueError("The quantity must be more than 0.")
    if q > MAX_QTY:
        raise ValueError("The quantity is too large.")
    return q.quantize(Decimal("0.0001"))


def fnum(v: Any, dp: Optional[int] = None) -> Optional[float]:
    if v is None:
        return None
    x = float(v)
    return round(x, dp) if dp is not None else x


async def lock_member(conn, user_id: str) -> None:
    """One write at a time per member, so two requests cannot both squeeze under the plan's limit."""
    await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", f"etfp:{user_id}")


async def held_of(conn, user_id: str) -> List[Dict[str, Any]]:
    return [{"symbol": r["symbol"], "qty": r["qty"]} for r in await conn.fetch("SELECT symbol, qty FROM etf_holdings WHERE user_id = $1 ORDER BY created_at, symbol", user_id)]


# ------------------------------------------------------------------------------------------------------------------------ the data each ETF needs
# Each read is its own function so a test can stand in for it. A source that fails gives a reason, never an error page.

async def etf_rows(app) -> Dict[str, dict]:
    return (await etf._load(app))["by"]


async def facts_for(app, isin: str) -> Dict[str, Any]:
    return await etf_vs_index.facts_of(app.state.store.pool, isin)


async def index_keys(app) -> Dict[str, Tuple[str, str]]:
    """{symbol: (index key, index label)} for the ETFs whose index can be told (the ETF vs index fund page's own reading)."""
    try:
        opts = await etf_vs_index.cached_options(app, "Direct")
    except Exception:
        log.warning("etf index reading unavailable", exc_info=True)
        return {}
    return {e["symbol"]: (e["index"], etf_vs_index.INDEX_BY[e["index"]][1]) for e in opts["etfs"] if e["index"] in etf_vs_index.INDEX_BY}


async def tracking_for(request: Request, sym: str) -> Dict[str, Any]:
    """The tracking difference over one year, from the ETF page's own reading (kept in Redis by that page)."""
    from .. import mf_compare
    try:
        resp = await mf_compare._cached(request, "evi-for", sym, lambda: etf_vs_index.for_payload(request, sym), etf_vs_index.FOR_TTL)
        body = json.loads(resp.body)
    except Exception:
        log.warning("tracking unavailable for %s", sym, exc_info=True)
        return {"value": None, "why": "The tracking figure could not be worked out right now."}
    t = body.get("tracking") or {}
    d = t.get("difference") or {}
    return {"value": d.get("value"), "why": d.get("why"), "from": t.get("from"), "to": t.get("to"), "etfReturn": d.get("etfReturn"), "indexReturn": d.get("indexReturn"),
            "basis": t.get("basis")}


async def holdings_for(app, isin: str) -> Tuple[Optional[dict], Optional[str]]:
    res, why = await etf._disclosure("get_portfolio", app, isin)
    return (res if isinstance(res, dict) else None), why


async def closes_for(app, sym: str, r: dict) -> Tuple[List[int], List[float], Optional[str]]:
    """Daily NSE closes (date ordinals) after any split break the source shows."""
    h, why = await etf._history(app, sym, r)
    if not h or len(h["dates"]) < 2:
        return [], [], why or "No price history."
    brk = r.get("break_date")
    k = max(bisect_right(h["dates"], brk) - 1, 0) if brk else 0
    return [d.toordinal() for d in h["dates"][k:]], [float(c) for c in h["closes"][k:]], None


async def nifty500(app) -> Dict[int, float]:
    from .. import indices
    raw = await indices._cached(app, "idx:px:NIF500", 6 * 3600, lambda: indices._fetch_levels(app, "NIF500"))
    rows = indices.shape_levels(raw, risk.YEARS + 1)["rows"] if raw else []
    return {date.fromisoformat(x["d"]).toordinal(): float(x["c"]) for x in rows}


async def scores_for(app, symbols: List[str], gold: bool) -> Dict[str, Dict[str, Any]]:
    """Gold: FinLit Prism (score and word). Silver: the FinLit IQ (score and word). Never both."""
    if not symbols:
        return {}
    store = app.state.store
    if gold:
        from .. import prism_screen
        cards = prism_screen.cards(await store.prism_cards(symbols))
        return {s: {"model": "prism", "score": fnum(c.get("prism_final"), 0), "label": c.get("prism_label")} for s, c in cards.items() if c.get("prism_final") is not None}
    from ..portfolio_overview import BAND_WORD
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT DISTINCT ON (symbol) symbol, overall, band FROM scores WHERE symbol = ANY($1::text[]) AND model = 'v1' AND overall IS NOT NULL "
                                "ORDER BY symbol, (statement = 'consolidated') DESC, updated_at DESC", symbols)
    return {r["symbol"]: {"model": "iq", "score": fnum(r["overall"], 0), "label": BAND_WORD.get(r["band"] or "", None)} for r in rows}


async def size_of_isins(app, isins: List[str]) -> Dict[str, str]:
    from ..mfportfolio.api import size_ranks
    async with app.state.store.pool.acquire() as conn:
        return await size_ranks(conn, isins)


# ------------------------------------------------------------------------------------------------------------------------ reading

def _ter(f: Dict[str, Any]) -> Dict[str, Any]:
    t = etf_vs_index._fact(f.get("ter"), TER_WHY)
    return {"value": etf_vs_index._pct_of(t.get("value")), "asOf": t.get("asOf"), "source": t.get("source"), "why": t.get("why") if t.get("value") is None else None}


def _view(sym: str, qty: Optional[Decimal], r: Optional[dict], f: Dict[str, Any], idx: Optional[Tuple[str, str]]) -> Dict[str, Any]:
    if r is None:
        return {"symbol": sym, "name": None, "gone": True, "why": GONE, "qty": fnum(qty), "tracks": {"key": None, "label": None, "basis": None}}
    v = etf.row_view(r)
    why = v.get("why") or {}
    bm = (f.get("benchmark") or {}).get("value") if isinstance(f.get("benchmark"), dict) else None
    tracks = calc.track_of(v["category"], v["categoryLabel"], idx[0] if idx else None, idx[1] if idx else None, bm)
    return {
        "symbol": sym, "name": v["name"], "gone": False, "isin": v["isin"], "fundHouse": v["fundHouse"], "assetClass": v["assetClass"], "group": etf.GROUPS.get(v["assetClass"] or ""),
        "category": v["category"], "categoryLabel": v["categoryLabel"], "benchmark": bm, "tracks": tracks, "qty": fnum(qty),
        "price": v["price"], "previousClose": v["previousClose"], "changePct": v["changePct"], "priceDate": v["priceDate"],
        "ret1y": v["ret1y"], "ret1yWhy": why.get("ret_1y"), "ret5y": v["ret5y"], "ret5yWhy": why.get("ret_5y"),
        "nav": v["nav"], "navDate": v["navDate"], "premium": v["premium"], "premiumWhy": why.get("nav_premium") or (None if v["premium"] is not None else "No NAV for the day of the last close."),
        "avgTurnover": v["avgTurnover"], "avgTurnoverWhy": None if v["avgTurnover"] is not None else "No trades in the last 20 sessions.",
        "ter": _ter(f), "firstDate": v["firstDate"],
    }


@router.get("")
async def list_etfs(request: Request, ctx: Ctx = Depends(member_ctx)):
    app = request.app
    async with app.state.store.pool.acquire() as conn:
        held = await held_of(conn, ctx.user_id)
    base = {"plan": "gold" if is_gold(ctx) else ctx.plan, "limit": cap_for(ctx), "count": len(held), "disclaimer": DISCLAIMER}
    if not held:
        return reply({**base, "items": [], "basis": "equal", "repeats": [], "asOf": None})
    by, idx = await asyncio.gather(etf_rows(app), index_keys(app))
    rows = {h["symbol"]: by.get(h["symbol"]) for h in held}
    facts = await asyncio.gather(*[facts_for(app, r["isin"]) if r else asyncio.sleep(0, {}) for r in rows.values()])
    items = [_view(h["symbol"], h["qty"], rows[h["symbol"]], f, idx.get(h["symbol"])) for h, f in zip(held, facts)]
    tracked = [i for i in items if not i["gone"] and i["tracks"]["basis"] == "index"]
    tracks = await asyncio.gather(*[tracking_for(request, i["symbol"]) for i in tracked])
    by_sym = {i["symbol"]: t for i, t in zip(tracked, tracks)}
    live = [i for i in items if not i["gone"]]
    w, basis = calc.weights([{"symbol": i["symbol"], "qty": i["qty"], "price": i["price"]} for i in live])
    for i in items:
        if i["gone"]:
            continue
        i["tracking"] = by_sym.get(i["symbol"]) or {"value": None, "why": NO_INDEX_LEVELS if i["category"] in calc.SAME_AS_CATEGORY or i["tracks"]["basis"] == "benchmark" else etf_vs_index.NOT_TOLD}
        i["weight"] = round(w[i["symbol"]] * 100, 1) if i["symbol"] in w else None
        i["value"] = round(i["qty"] * i["price"], 2) if i["qty"] and i["price"] else None
    rep = calc.repeats({i["symbol"]: i["tracks"] for i in live})
    twice = {s for r in rep for s in r["symbols"]}
    for i in items:
        i["twice"] = i["symbol"] in twice
    dates = [i["priceDate"] for i in live if i.get("priceDate")]
    return reply({**base, "items": items, "basis": basis, "repeats": rep, "asOf": max(dates) if dates else None,
                  "missingQty": [i["symbol"] for i in live if not i["qty"]]})


async def _weighted(request: Request, ctx: Ctx) -> Tuple[List[Dict[str, Any]], Dict[str, dict], str]:
    async with request.app.state.store.pool.acquire() as conn:
        held = await held_of(conn, ctx.user_id)
    by = await etf_rows(request.app)
    live = [(h, by[h["symbol"]]) for h in held if h["symbol"] in by]
    w, basis = calc.weights([{"symbol": h["symbol"], "qty": h["qty"], "price": r.get("price")} for h, r in live])
    return [{"symbol": h["symbol"], "w": w[h["symbol"]], "qty": h["qty"], "row": r} for h, r in live], by, basis


@router.get("/inside")
async def inside(request: Request, ctx: Ctx = Depends(member_ctx)):
    """What sits inside the ETFs, from each fund house's monthly portfolio file."""
    app = request.app
    etfs, _by, basis = await _weighted(request, ctx)
    if not etfs:
        return reply({"count": 0, "why": "Add ETFs to see what sits inside them.", "disclaimer": DISCLAIMER})
    got = await asyncio.gather(*[holdings_for(app, e["row"]["isin"]) for e in etfs])
    files = []
    for e, (p, why) in zip(etfs, got):
        e.update(assetClass=e["row"].get("asset_class"), holdings=(p or {}).get("holdings") or None, split=((p or {}).get("summary") or {}).get("assetSplit"))
        files.append({"symbol": e["symbol"], "asOf": (p or {}).get("asOf"), "source": (p or {}).get("source"), "why": None if p and p.get("holdings") else why or "No monthly portfolio file found for this ETF yet."})
    isins = sorted({h["isin"] for e in etfs for h in (e["holdings"] or []) if h.get("isin") and h.get("assetClass") == "equity" and not calc.abroad(h["isin"], e["assetClass"])})
    sizes = await size_of_isins(app, isins) if isins else {}
    top = calc.top_stocks(etfs)
    syms = sorted({t["symbol"] for t in top if t["symbol"] and not t["abroad"]})
    gold = is_gold(ctx)
    scores = await scores_for(app, syms, gold)
    for t in top:
        t["w"] = round(t["w"] * 100, 2)
        t["size"] = sizes.get(t["isin"] or "") if not t["abroad"] else None
        t["score"] = scores.get(t["symbol"] or "") if not t["abroad"] else None
        t["scoreWhy"] = "Not compared: listed abroad" if t["abroad"] else None if t["score"] else "Not rated yet"
    mix = calc.asset_mix(etfs)
    size = calc.size_mix(etfs, lambda isin: sizes.get(isin or ""))
    dates = sorted({f["asOf"] for f in files if f["asOf"]})
    return reply({"count": len(etfs), "basis": basis, "files": files, "asOf": dates[-1] if dates else None, "mix": {k: round(v * 100, 1) for k, v in mix["shares"].items()},
                  "mixFromType": mix["fromType"], "size": {k: round(v * 100, 1) for k, v in size.items()} if size else None,
                  "overlap": calc.overlap(etfs), "top": top, "scoreModel": "prism" if gold else "iq", "disclaimer": DISCLAIMER})


@router.get("/risk")
async def etf_risk(request: Request, ctx: Ctx = Depends(member_ctx)):
    """Each ETF's swing, worst fall, beta and share of the Nifty 500's falls from its daily closes over three years (the MF portfolio's sums), the list's
    risk level against the Nifty 500, how alike the weekly moves were over the last year, and each ETF's share of the list's swings."""
    app = request.app
    bench = await nifty500(app)
    if len(bench) < risk.MIN_DAYS:
        raise fail(503, "bench_unavailable", "The Nifty 500 history is not available right now, so the risk figures cannot be worked out. Please try again in a moment.")
    end = max(bench)
    etfs, _by, basis = await _weighted(request, ctx)
    if not etfs:
        return reply({"count": 0, "why": "Add ETFs to see their risk figures.", "disclaimer": DISCLAIMER})
    hist = await asyncio.gather(*[closes_for(app, e["symbol"], e["row"]) for e in etfs])
    out, parts, series = [], [], {}
    for e, (days, closes, why) in zip(etfs, hist):
        cat = etf.CATEGORIES.get(e["row"].get("category") or "", {}).get("label", "")
        fig = risk.fund_figures(days, closes, bench, end) if days else {"swing": None, "worstFall": None, "beta": None, "fallsTaken": None, "from": None, "to": None, "years": None, "why": why}
        if fig.get("why"):
            fig["why"] = fig["why"].replace("The fund has less than a year of daily NAVs", "The ETF has less than a year of daily prices").replace("The fund is younger", "Its price history is shorter")
        out.append({"symbol": e["symbol"], "short": e["symbol"], "category": cat, "liquid": e["row"].get("category") == "liquid", "weight": round(e["w"] * 100, 1), **fig})
        if days:
            series[e["symbol"]] = (days, closes)
            if fig["swing"] is not None:
                parts.append((days, closes, e["w"]))
    ld, lv = risk.list_series(parts, end)
    bd, bv = risk.window(sorted(bench), [bench[d] for d in sorted(bench)], end)
    bench_swing = risk.swing(risk.returns(bv), risk.per_year(bd))
    ok = len(lv) >= risk.MIN_DAYS
    list_swing = risk.swing(risk.returns(lv), risk.per_year(ld)) if ok else None
    lf, lb = risk.paired(ld, lv, bench) if ok else ([], [])
    level = risk.list_level(list_swing, bench_swing, out)
    if level and level.get("because"):
        level["because"] = level["because"].replace("funds", "ETFs")
    elif level and level["word"] in ("Lower", "A little lower") and len(parts) >= 2:
        level["because"] = "because your ETFs do not move together"      # no one ETF swings less than the index: the list is calmer than its parts
    moving = {s: v for s, v in series.items() if not next(o for o in out if o["symbol"] == s)["liquid"]}
    left_out = [o["symbol"] for o in out if o["liquid"]]
    w = {e["symbol"]: e["w"] for e in etfs if e["symbol"] in series}
    return reply({"count": len(out), "basis": basis, "etfs": out,
                  "bench": {"name": "Nifty 500", "swing": risk.r1(bench_swing), "worstFall": risk.r1(risk.worst_fall(bv)), "from": date.fromordinal(bd[0]).isoformat(), "to": date.fromordinal(bd[-1]).isoformat()},
                  "list": {"swing": risk.r1(list_swing), "worstFall": risk.r1(risk.worst_fall(lv)) if ok else None, "fallsTaken": risk.r1(risk.falls_taken(lf, lb), 0) if ok else None,
                           "beta": risk.r1(risk.beta(lf, lb), 2) if ok else None, "level": level,
                           "why": None if ok else "Your ETFs share less than a year of trading days, so the whole list cannot be followed as one line yet."},
                  "together": {**calc.together(moving, end), "leftOut": left_out}, "adds": calc.variance_shares(series, w, end) if series else {"shares": {}, "why": "No price history."},
                  "disclaimer": DISCLAIMER})


# ------------------------------------------------------------------------------------------------------------------------ writing

Qty = Union[str, int, float, None]


class AddIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=24)
    qty: Qty = None

    @field_validator("qty")
    @classmethod
    def short(cls, v: Any) -> Any:
        if isinstance(v, str) and len(v) > 40:
            raise ValueError("too long")
        return v


class QtyItem(AddIn):
    pass


class QtyIn(BaseModel):
    items: List[QtyItem] = Field(min_length=1, max_length=100)


def sym_of(s: str) -> str:
    """'niftybees-eq', 'NSE:NIFTYBEES', 'NIFTYBEES.NS' -> 'NIFTYBEES'."""
    s = (s or "").strip().upper()
    s = re.sub(r"^(?:NSE|BSE)\s*[:\-]\s*", "", s)
    s = re.sub(r"(?:-EQ|-BE|\.NS|\.NSE|\.BO)$", "", s)
    return s


def checked_qty(v: Any) -> Optional[Decimal]:
    try:
        return qty_of(v)
    except ValueError as e:
        raise fail(422, "invalid_quantity", str(e))


@router.post("", status_code=201)
async def add_etf(request: Request, body: AddIn, ctx: Ctx = Depends(member_ctx)):
    await limit(request, "etfpw", ctx.user_id, 120, 600)
    sym, qty = sym_of(body.symbol), checked_qty(body.qty)
    if not SYMBOL.match(sym) or sym not in await etf_rows(request.app):
        raise fail(404, "unknown_etf", "No ETF with that symbol.")
    cap = cap_for(ctx)
    async with request.app.state.store.pool.acquire() as conn:
        async with conn.transaction():
            await lock_member(conn, ctx.user_id)
            have = await conn.fetchrow("SELECT qty FROM etf_holdings WHERE user_id = $1 AND symbol = $2", ctx.user_id, sym)
            if have is not None:
                if qty is not None:
                    await conn.execute("UPDATE etf_holdings SET qty = $3, updated_at = now() WHERE user_id = $1 AND symbol = $2", ctx.user_id, sym, qty)
                return reply({"status": "saved", "symbol": sym, "merged": True}, 201)
            if await conn.fetchval("SELECT count(*) FROM etf_holdings WHERE user_id = $1", ctx.user_id) >= cap:
                raise fail(403, "plan_limit", f"Your plan includes {cap} ETFs. Remove one to add another.")
            await conn.execute("INSERT INTO etf_holdings (user_id, symbol, qty) VALUES ($1, $2, $3)", ctx.user_id, sym, qty)
    return reply({"status": "saved", "symbol": sym, "merged": False}, 201)


@router.put("/quantities")
async def set_quantities(request: Request, body: QtyIn, ctx: Ctx = Depends(member_ctx)):
    """Set (or, with an empty value, clear) the quantity of ETFs already in the list. An ETF not in the list is refused, not added."""
    await limit(request, "etfpw", ctx.user_id, 120, 600)
    pairs = [(sym_of(i.symbol), checked_qty(i.qty)) for i in body.items]
    async with request.app.state.store.pool.acquire() as conn:
        async with conn.transaction():
            await lock_member(conn, ctx.user_id)
            have = {r["symbol"] for r in await conn.fetch("SELECT symbol FROM etf_holdings WHERE user_id = $1", ctx.user_id)}
            missing = [s for s, _ in pairs if s not in have]
            if missing:
                raise fail(404, "not_found", f"{missing[0]} is not in your ETF list.")
            await conn.executemany("UPDATE etf_holdings SET qty = $3, updated_at = now() WHERE user_id = $1 AND symbol = $2", [(ctx.user_id, s, q) for s, q in pairs])
    return reply({"status": "saved", "updated": len(pairs)})


@router.delete("")
async def delete_all(request: Request, ctx: Ctx = Depends(member_ctx)):
    await limit(request, "etfpw", ctx.user_id, 120, 600)
    async with request.app.state.store.pool.acquire() as conn:
        n = int((await conn.execute("DELETE FROM etf_holdings WHERE user_id = $1", ctx.user_id)).split()[-1])
    return reply({"status": "deleted", "removed": n})


@router.delete("/{symbol}")
async def delete_one(request: Request, symbol: str, ctx: Ctx = Depends(member_ctx)):
    await limit(request, "etfpw", ctx.user_id, 120, 600)
    async with request.app.state.store.pool.acquire() as conn:
        n = int((await conn.execute("DELETE FROM etf_holdings WHERE user_id = $1 AND symbol = $2", ctx.user_id, sym_of(symbol))).split()[-1])
    if not n:
        raise fail(404, "not_found", "That ETF is not in your list.")
    return reply({"status": "deleted"})


# ------------------------------------------------------------------------------------------------------------------------ import

Cell = Union[str, int, float, None]


class RawRow(BaseModel):
    """One row of the broker file as the browser read it (holdingsFile.entriesFromGrid): the cells mapped to ISIN, symbol, name and quantity."""
    row: int = Field(default=0, ge=0, le=10 ** 7)
    isin: Cell = None
    symbol: Cell = None
    name: Cell = None
    qty: Cell = None

    @field_validator("isin", "symbol", "name", "qty")
    @classmethod
    def cell(cls, v: Any) -> Any:
        if isinstance(v, str) and len(v) > CELL_MAX:
            raise ValueError("cell too long")
        return v


class PreviewIn(BaseModel):
    rows: List[RawRow] = Field(max_length=MAX_IMPORT_ROWS)


class CommitItem(BaseModel):
    symbol: str = Field(min_length=1, max_length=24)
    qty: Qty = None


class CommitIn(BaseModel):
    items: List[CommitItem] = Field(min_length=1, max_length=MAX_IMPORT_ROWS)
    existing: Literal["skip", "replace"] = "skip"


def match(raw: RawRow, by: Dict[str, dict], by_isin: Dict[str, str]) -> Tuple[str, Optional[str], str]:
    """(status, symbol, reason) of one row: the ISIN first, then the symbol. A company's shares and an unknown name are never guessed into an ETF."""
    isin = str(raw.isin or "").strip().upper()
    sym = sym_of(str(raw.symbol or ""))
    if isin and ISIN.match(isin) and isin in by_isin:
        return "matched", by_isin[isin], "Matched on ISIN."
    if sym and sym in by:
        return "matched", sym, "Matched on NSE symbol." if not isin else "The ISIN is not an ETF's we know; matched on NSE symbol."
    if isin.startswith("INE") or (isin and ISIN.match(isin) and not isin.startswith("INF")):
        return "ignored", None, "A company's shares, not an ETF: left for the Equity portfolio."
    if isin.startswith("INF"):
        return "not_found", None, "A mutual fund unit or an ETF we do not list: left for the MF portfolio."
    return "not_found", None, "No ETF with this ISIN or symbol."


@router.post("/import-preview")
async def import_preview(request: Request, body: PreviewIn, ctx: Ctx = Depends(member_ctx)):
    await limit(request, "etfpi", ctx.user_id, 30, 600)
    by = await etf_rows(request.app)
    by_isin = {r["isin"]: s for s, r in by.items() if r.get("isin")}
    async with request.app.state.store.pool.acquire() as conn:
        have = {r["symbol"] for r in await conn.fetch("SELECT symbol FROM etf_holdings WHERE user_id = $1", ctx.user_id)}
    rows, seen, counts = [], {}, {"matched": 0, "not_found": 0, "ignored": 0, "invalid": 0, "duplicate": 0}
    for i, raw in enumerate(body.rows):
        try:
            q = qty_of(raw.qty)
        except ValueError as e:
            rows.append({"i": i, "row": raw.row, "name": raw.name, "isin": raw.isin, "symbol": raw.symbol, "status": "invalid", "reason": str(e), "etf": None})
            counts["invalid"] += 1
            continue
        status, sym, reason = match(raw, by, by_isin)
        item = {"i": i, "row": raw.row, "name": raw.name, "isin": raw.isin, "symbol": raw.symbol, "qty": fnum(q), "status": status, "reason": reason, "existing": False,
                "etf": {"symbol": sym, "name": by[sym]["display_name"], "fundHouse": by[sym].get("fund_house")} if sym else None}
        if sym and sym in seen:
            first = rows[seen[sym]]
            if q is not None:
                first["qty"] = round((first["qty"] or 0) + float(q), 4)
            item.update(status="duplicate", reason=f"The same ETF as row {first['row'] or seen[sym] + 1}: its quantity is added there.")
        elif sym:
            seen[sym] = len(rows)
            item["existing"] = sym in have
        counts[item["status"]] += 1
        rows.append(item)
    cap = cap_for(ctx)
    return reply({"rows": rows, "counts": counts, "total": len(rows), "capacity": {"limit": cap, "used": len(have), "room": max(0, cap - len(have))}, "disclaimer": DISCLAIMER})


@router.post("/import-commit", status_code=201)
async def import_commit(request: Request, body: CommitIn, ctx: Ctx = Depends(member_ctx)):
    await limit(request, "etfpc", ctx.user_id, 20, 600)
    items: Dict[str, Optional[Decimal]] = {}
    for n, it in enumerate(body.items, 1):
        s = sym_of(it.symbol)
        try:
            q = qty_of(it.qty)
        except ValueError as e:
            raise fail(422, "invalid_row", f"Line {n}: {e}")
        items[s] = (items.get(s) or Decimal(0)) + q if q is not None else items.get(s)
    by = await etf_rows(request.app)
    bad = sorted(s for s in items if s not in by)
    if bad:
        raise fail(422, "unknown_etf", f"No ETF with the symbol {bad[0]}. Every row needs an ETF from the review.")
    added = replaced = skipped = 0
    cap = cap_for(ctx)
    async with request.app.state.store.pool.acquire() as conn:
        async with conn.transaction():
            await lock_member(conn, ctx.user_id)
            have = {r["symbol"] for r in await conn.fetch("SELECT symbol FROM etf_holdings WHERE user_id = $1", ctx.user_id)}
            fresh = [s for s in items if s not in have]
            if len(have) + len(fresh) > cap:
                raise fail(403, "plan_limit", f"Your plan includes {cap} ETFs. You have {len(have)} and this import adds {len(fresh)} more. Untick some rows in the review.")
            for s, q in items.items():
                if s in have:
                    if body.existing == "skip":
                        skipped += 1
                        continue
                    await conn.execute("UPDATE etf_holdings SET qty = $3, updated_at = now() WHERE user_id = $1 AND symbol = $2", ctx.user_id, s, q)
                    replaced += 1
                else:
                    await conn.execute("INSERT INTO etf_holdings (user_id, symbol, qty) VALUES ($1, $2, $3)", ctx.user_id, s, q)
                    added += 1
    return reply({"status": "saved", "added": added, "replaced": replaced, "skipped": skipped}, 201)
