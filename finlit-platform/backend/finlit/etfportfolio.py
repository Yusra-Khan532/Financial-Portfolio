"""/api/me/etf-portfolio: a member's ETFs (task #136, the team's pack 07). Built like /api/me/mf-portfolio and reusing its risk sums.

    GET     ""                 the ETFs, each with the ETF list's own figures (price, returns, NAV premium, expense ratio, traded value), its tracked index,
                               value and weight (equal weights until every ETF has a quantity: `basis` says which)
    GET     "/risk"            each ETF's swing, worst fall, beta and falls taken against the NIFTY 500 (3 years of daily closes); the list's level in the
                               MF portfolio's words; how alike the ETFs' weekly moves were over a year (liquid ETFs left out, and said so); what each one adds
    POST    ""                 add an ETF (optionally with units)
    PUT     "/{id}"            set or clear an ETF's units
    DELETE  "/{id}"            remove one ETF
    DELETE  ""                 remove every ETF of the member
    POST    "/import-preview"  rows of a broker file -> each matched on ISIN, then symbol; nothing stored
    POST    "/import-commit"   the matched rows the member confirmed -> stored (units added to an ETF already in the list replace its units)

Plan: the same gate and size as My mutual funds (Silver and up; LIMITS[plan]["etf_holdings"]). A "Mutual Fund + ETF" plan is proposed in the pack but not
confirmed, so no such gate is built (the task's own checklist: "Plan gate held until you confirm"). Writes need a signed-in session from our own pages
(Origin + CSRF) and are rate limited per member; every query filters on the member's id. Information only, not investment advice.
"""

from __future__ import annotations

import json
import math
import re
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import etf
from .auth.entitlements import LIMITS, has, sees_all
from .auth.routes import Ctx, fail, limit, secure_ctx

router = APIRouter(prefix="/api/me/etf-portfolio")
NO_STORE = {"Cache-Control": "private, no-store", "Vary": "Cookie"}
DISCLAIMER = ("Information only. Not investment advice. Returns are price returns: dividends and other payouts are not included. "
              "Sources: NSE closing prices, AMFI NAV and expense ratios, and each fund house's monthly portfolio file.")
MAX_IMPORT_ROWS = 500
ISIN_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")
LIQUID = {"liquid"}
SAME_PRICE = {"gold": "Gold price", "silver": "Silver price", "liquid": "Overnight rate"}   # categories whose ETFs all follow one price                        # categories that earn through payouts: their price barely moves (left out of the "move together" matrix)


def reply(body: Dict[str, Any], status: int = 200) -> Response:
    """Private, never cached; dates written as ISO text (the ETF list's own encoder)."""
    return Response(content=json.dumps(body, separators=(",", ":"), default=etf._default), status_code=status, media_type="application/json", headers=NO_STORE)


async def member_ctx(request: Request, ctx: Ctx = Depends(secure_ctx)) -> Ctx:
    if not sees_all(ctx) and not has(ctx.plan, "silver"):
        raise fail(403, "plan_required", "The ETF portfolio is part of the Silver plan.", plan="silver")
    return ctx


def cap_for(ctx: Ctx) -> int:
    return LIMITS["gold" if sees_all(ctx) else ctx.plan if ctx.plan in LIMITS else "basic"]["etf_holdings"]


def uid_of(s: str) -> uuid.UUID:
    try:
        return uuid.UUID(s)
    except ValueError:
        raise fail(404, "not_found", "No such ETF in your list.")


def units_of(v: Union[str, int, float, None]) -> Optional[Decimal]:
    """A quantity as the member typed it: blank means none; otherwise a positive number of units (commas allowed)."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        d = Decimal(str(v).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        raise fail(422, "invalid_units", "Enter the number of units as a number, or leave it empty.")
    if not d.is_finite() or d <= 0 or d > Decimal("1e12"):
        raise fail(422, "invalid_units", "The number of units must be above zero.")
    return d.quantize(Decimal("0.0001"))


async def lock_member(conn, user_id: str) -> None:
    await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", f"etfp:{user_id}")


async def index_map(app) -> Dict[str, Dict[str, str]]:
    """{symbol: {key, label}}: the index each ETF follows, by the ETF vs Index Fund page's rule (an ETF it cannot tell is left out)."""
    try:
        from . import etf_vs_index as evi
        opts = await evi.cached_options(app, "Direct")
        out = {e["symbol"]: {"key": e["index"], "label": evi.INDEX_BY[e["index"]][1]} for e in opts["etfs"] if e.get("index") in evi.INDEX_BY}
    except Exception:                                                     # the index list failing must not break the portfolio
        out = {}
    # the index list covers share indexes; gold, silver and liquid ETFs each follow one price (gold, silver, the overnight rate), so their category is what
    # they track. Not international or sector ones: a Nasdaq 100 and an S&P 500 ETF share a category but follow different indexes.
    for r in (await etf._load(app))["rows"]:
        if r["symbol"] not in out and r.get("category") in SAME_PRICE:
            out[r["symbol"]] = {"key": "cat:" + r["category"], "label": SAME_PRICE[r["category"]]}
    return out


# ------------------------------------------------------------------------------------------------------------------------ reading

async def rows_of(conn, user_id: str) -> List[Dict[str, Any]]:
    return [dict(r) for r in await conn.fetch("SELECT id, symbol, units FROM etf_holdings WHERE user_id = $1 ORDER BY created_at, id", user_id)]


def weigh(items: List[Dict[str, Any]]) -> str:
    """Weights in percent: by value when every ETF has units and a price, else equal (the page says which)."""
    valued = bool(items) and all(i["value"] is not None and i["value"] > 0 for i in items)
    total = sum(i["value"] for i in items) if valued else 0
    for i in items:
        i["weight"] = round(i["value"] / total * 100, 2) if valued else round(100 / len(items), 2)
    return "value" if valued else "equal"


@router.get("")
async def portfolio(request: Request, ctx: Ctx = Depends(member_ctx)):
    app = request.app
    async with app.state.store.pool.acquire() as conn:
        held = await rows_of(conn, ctx.user_id)
    cache = await etf._load(app)
    ters = await etf._ters(app, cache["rows"])
    idx = await index_map(app)
    items: List[Dict[str, Any]] = []
    for h in held:
        r = cache["by"].get(h["symbol"])
        units = float(h["units"]) if h["units"] is not None else None
        if r is None:                                                     # left the exchange's list: kept, with its reason
            items.append({"id": str(h["id"]), "symbol": h["symbol"], "units": units, "missing": "No longer listed on the NSE, or not in our ETF list.",
                          "value": None, "index": None})
            continue
        v = etf._with_ter(etf.row_view(r), ters)
        price = v.get("price")
        items.append({**v, "id": str(h["id"]), "units": units, "value": round(units * price, 2) if units is not None and price else None,
                      "index": idx.get(h["symbol"]), "missing": None})
    listed = [i for i in items if not i["missing"]]
    basis = weigh(listed) if listed else "equal"
    counts: Dict[str, int] = {}
    for i in listed:
        if i["index"]:
            counts[i["index"]["key"]] = counts.get(i["index"]["key"], 0) + 1
    for i in listed:
        i["twice"] = bool(i["index"] and counts[i["index"]["key"]] > 1)
    return reply({"plan": "gold" if sees_all(ctx) else ctx.plan, "limit": cap_for(ctx), "count": len(items), "basis": basis, "asOf": cache.get("asOf"),
                  "updatedAt": cache.get("updatedAt"), "holdings": items, "disclaimer": DISCLAIMER})


def _weekly(days: Sequence[int], closes: Sequence[float], end: int, weeks: int = 52) -> Dict[int, float]:
    """The last close of each week (weeks counted back from `end`), the last `weeks` + 1 weeks: {week number: close}."""
    out: Dict[int, float] = {}
    for d, c in zip(days, closes):
        if end - 7 * (weeks + 1) < d <= end:
            out[(end - d) // 7] = c
    return out


def _corr(a: Sequence[float], b: Sequence[float]) -> Optional[float]:
    n = len(a)
    if n < 20:
        return None
    ma, mb = sum(a) / n, sum(b) / n
    sa = math.sqrt(sum((x - ma) ** 2 for x in a)); sb = math.sqrt(sum((y - mb) ** 2 for y in b))
    if sa == 0 or sb == 0:
        return None
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb)


def together(series: Dict[str, Tuple[List[int], List[float]]], weights: Dict[str, float], end: int) -> Dict[str, Any]:
    """How alike the ETFs' weekly price moves were over the last year (correlation), and what each one adds: its share of the list's variance,
    weight x covariance with the list / the list's variance, from the same weekly moves. Weeks every ETF has a close for."""
    wk = {s: _weekly(d, c, end) for s, (d, c) in series.items()}
    common = sorted(set.intersection(*[set(w) for w in wk.values()]), reverse=True) if wk else []
    syms = list(series)
    if len(common) < 21 or len(syms) < 2:
        return {"symbols": syms, "C": None, "weeks": max(0, len(common) - 1), "adds": None,
                "why": "The ETFs share fewer than 20 weeks of prices, so how they move together cannot be worked out yet."}
    rets = {s: [wk[s][common[i + 1]] / wk[s][common[i]] - 1 for i in range(len(common) - 1)] for s in syms}   # common: oldest week first
    C = [[1.0 if a == b else (lambda c: round(c, 2) if c is not None else None)(_corr(rets[a], rets[b])) for b in syms] for a in syms]
    tw = sum(weights.get(s, 0) for s in syms) or 1
    w = {s: weights.get(s, 0) / tw for s in syms}
    n = len(common) - 1
    lst = [sum(w[s] * rets[s][t] for s in syms) for t in range(n)]
    ml = sum(lst) / n
    var = sum((x - ml) ** 2 for x in lst) / n
    adds = None
    if var > 0:
        adds = {}
        for s in syms:
            ms = sum(rets[s]) / n
            cov = sum((rets[s][t] - ms) * (lst[t] - ml) for t in range(n)) / n
            adds[s] = round(w[s] * cov / var * 100, 1)
    return {"symbols": syms, "C": C, "weeks": n, "adds": adds, "why": None}


@router.get("/risk")
async def risk(request: Request, ctx: Ctx = Depends(member_ctx)):
    """Each ETF's swing, worst fall, beta and falls taken against the NIFTY 500 from three years of daily closes (the MF portfolio's sums), the list's
    risk level in its words, how alike the ETFs move, and what each adds."""
    from . import indices
    from .mfportfolio import risk as R
    app = request.app
    raw = await indices._cached(app, "idx:px:NIF500", 6 * 3600, lambda: indices._fetch_levels(app, "NIF500"))
    lv_rows = indices.shape_levels(raw, R.YEARS + 1)["rows"] if raw else []
    if len(lv_rows) < R.MIN_DAYS:
        raise fail(503, "bench_unavailable", "The NIFTY 500 history is not available right now, so the risk figures cannot be worked out. Please try again in a moment.")
    bench = {date.fromisoformat(r["d"]).toordinal(): float(r["c"]) for r in lv_rows}
    end = max(bench)
    async with app.state.store.pool.acquire() as conn:
        held = await rows_of(conn, ctx.user_id)
    if not held:
        return reply({"count": 0, "why": "Add ETFs to see their risk figures."})
    cache = await etf._load(app)
    etfs, parts, series, weights, liquid = [], [], {}, {}, []
    valued = all(h["units"] is not None and (cache["by"].get(h["symbol"]) or {}).get("price") for h in held)
    for h in held:
        r = cache["by"].get(h["symbol"])
        if not r:
            continue
        hist, why = await etf._history(app, h["symbol"], r)
        name = r["display_name"]
        if not hist or len(hist["dates"]) < 2:
            etfs.append({"symbol": h["symbol"], "name": name, "swing": None, "worstFall": None, "beta": None, "fallsTaken": None, "why": why or "No price history"})
            continue
        days = [d.toordinal() for d in hist["dates"]]
        closes = [float(c) for c in hist["closes"]]
        brk = r.get("break_date")
        if brk:                                                       # prices before a suspected split or bad price are left out of every figure
            k = next((i for i, d in enumerate(hist["dates"]) if d >= brk), 0)
            days, closes = days[k:], closes[k:]
        fig = R.fund_figures(days, closes, bench, end)
        etfs.append({"symbol": h["symbol"], "name": name, "short": h["symbol"], "category": (etf.CATEGORIES.get(r.get("category")) or {}).get("label") or "", **fig})
        wgt = float(h["units"]) * float(r["price"]) if valued else 1.0
        if fig["swing"] is not None:
            parts.append((days, closes, wgt))
        if r.get("category") in LIQUID:
            liquid.append(h["symbol"])
        else:
            series[h["symbol"]] = (days, closes)
            weights[h["symbol"]] = wgt
    ld, lv = R.list_series(parts, end)
    bd, bv = R.window(sorted(bench), [bench[d] for d in sorted(bench)], end)
    bench_swing = R.swing(R.returns(bv), R.per_year(bd))
    list_swing = R.swing(R.returns(lv), R.per_year(ld)) if len(lv) >= R.MIN_DAYS else None
    lf = R.paired(ld, lv, bench) if len(lv) >= R.MIN_DAYS else ([], [])
    tog = together(series, weights, end)
    return reply({
        "count": len(etfs), "basis": "value" if valued else "equal", "etfs": etfs,
        "bench": {"name": "NIFTY 500", "swing": R.r1(bench_swing), "worstFall": R.r1(R.worst_fall(bv)), "from": date.fromordinal(bd[0]).isoformat(), "to": date.fromordinal(bd[-1]).isoformat()},
        "list": {"swing": R.r1(list_swing), "worstFall": R.r1(R.worst_fall(lv)) if len(lv) >= R.MIN_DAYS else None,
                 "fallsTaken": R.r1(R.falls_taken(*lf), 0) if lf[0] else None, "level": R.list_level(list_swing, bench_swing, etfs),
                 "why": None if list_swing is not None else "Your ETFs share less than a year of trading days, so the whole list cannot be followed as one line yet."},
        "together": {**tog, "leftOut": liquid, "leftOutWhy": "Liquid ETFs are left out: their price barely moves, because they pay out what they earn." if liquid else None},
        "disclaimer": DISCLAIMER})


# ------------------------------------------------------------------------------------------------------------------------ writing

class AddIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=24)
    units: Union[str, int, float, None] = None


class UnitsIn(BaseModel):
    units: Union[str, int, float, None] = None


async def _known(app, symbol: str) -> str:
    sym = symbol.strip().upper()
    cache = await etf._load(app)
    if not etf.SYMBOL_RE.match(sym) or sym not in cache["by"]:
        raise fail(404, "unknown_etf", "No ETF on the NSE has this symbol.")
    return sym


@router.post("", status_code=201)
async def add(request: Request, body: AddIn, ctx: Ctx = Depends(member_ctx)):
    await limit(request, "etfpw", ctx.user_id, 120, 600)
    sym = await _known(request.app, body.symbol)
    units = units_of(body.units)
    async with request.app.state.store.pool.acquire() as conn:
        async with conn.transaction():
            await lock_member(conn, ctx.user_id)
            hid = await conn.fetchval("SELECT id FROM etf_holdings WHERE user_id = $1 AND symbol = $2", ctx.user_id, sym)
            if hid is not None:
                if units is not None:
                    await conn.execute("UPDATE etf_holdings SET units = $2, updated_at = now() WHERE id = $1", hid, units)
                return reply({"status": "saved", "id": str(hid), "merged": True}, 201)
            used = await conn.fetchval("SELECT count(*) FROM etf_holdings WHERE user_id = $1", ctx.user_id)
            if used >= cap_for(ctx):
                raise fail(403, "plan_limit", f"Your plan includes {cap_for(ctx)} ETFs.", plan="gold")
            hid = await conn.fetchval("INSERT INTO etf_holdings (user_id, symbol, units) VALUES ($1, $2, $3) RETURNING id", ctx.user_id, sym, units)
    return reply({"status": "saved", "id": str(hid), "merged": False}, 201)


@router.put("/{hid}")
async def set_units(request: Request, hid: str, body: UnitsIn, ctx: Ctx = Depends(member_ctx)):
    await limit(request, "etfpw", ctx.user_id, 120, 600)
    h, units = uid_of(hid), units_of(body.units)
    async with request.app.state.store.pool.acquire() as conn:
        n = int((await conn.execute("UPDATE etf_holdings SET units = $3, updated_at = now() WHERE id = $1 AND user_id = $2", h, ctx.user_id, units)).split()[-1])
    if not n:
        raise fail(404, "not_found", "No such ETF in your list.")
    return reply({"status": "saved", "id": str(h)})


@router.delete("")
async def delete_all(request: Request, ctx: Ctx = Depends(member_ctx)):
    await limit(request, "etfpw", ctx.user_id, 120, 600)
    async with request.app.state.store.pool.acquire() as conn:
        n = int((await conn.execute("DELETE FROM etf_holdings WHERE user_id = $1", ctx.user_id)).split()[-1])
    return reply({"status": "deleted", "removed": n})


@router.delete("/{hid}")
async def delete_one(request: Request, hid: str, ctx: Ctx = Depends(member_ctx)):
    await limit(request, "etfpw", ctx.user_id, 120, 600)
    h = uid_of(hid)
    async with request.app.state.store.pool.acquire() as conn:
        n = int((await conn.execute("DELETE FROM etf_holdings WHERE id = $1 AND user_id = $2", h, ctx.user_id)).split()[-1])
    if not n:
        raise fail(404, "not_found", "No such ETF in your list.")
    return reply({"status": "deleted", "id": str(h)})


class RowIn(BaseModel):
    isin: Optional[str] = Field(default=None, max_length=40)
    symbol: Optional[str] = Field(default=None, max_length=40)
    name: Optional[str] = Field(default=None, max_length=200)
    units: Union[str, int, float, None] = None


class PreviewIn(BaseModel):
    rows: List[RowIn] = Field(max_length=MAX_IMPORT_ROWS)


class CommitItem(BaseModel):
    symbol: str = Field(min_length=1, max_length=24)
    units: Union[str, int, float, None] = None


class CommitIn(BaseModel):
    items: List[CommitItem] = Field(min_length=1, max_length=MAX_IMPORT_ROWS)


@router.post("/import-preview")
async def import_preview(request: Request, body: PreviewIn, ctx: Ctx = Depends(member_ctx)):
    """Each row of a broker file matched to an NSE ETF: by ISIN first, then by symbol (as the MF portfolio matches on ISIN first). A row that is not an
    ETF (a share, a fund bought from the fund house) is listed as not found with its reason; nothing is stored."""
    await limit(request, "etfpi", ctx.user_id, 30, 600)
    cache = await etf._load(request.app)
    by_isin = {r["isin"]: r for r in cache["rows"] if r.get("isin")}
    async with request.app.state.store.pool.acquire() as conn:
        have = {r["symbol"] for r in await conn.fetch("SELECT symbol FROM etf_holdings WHERE user_id = $1", ctx.user_id)}
    out, seen, counts = [], set(), {"matched": 0, "not_found": 0, "invalid": 0, "duplicate": 0}
    for i, raw in enumerate(body.rows):
        isin = (raw.isin or "").strip().upper()
        sym = (raw.symbol or "").strip().upper()
        try:
            units = units_of(raw.units)
        except Exception:
            out.append({"i": i, "isin": isin or None, "symbol": sym or None, "name": raw.name, "status": "invalid", "reason": "The quantity is not a number.", "etf": None})
            counts["invalid"] += 1
            continue
        r = by_isin.get(isin) if ISIN_RE.match(isin) else None
        via = "isin" if r else None
        if r is None and sym and etf.SYMBOL_RE.match(sym):
            r, via = cache["by"].get(sym), "symbol"
        if r is None:
            why = "Not an ETF listed on the NSE (a share, or a fund bought from the fund house, goes in its own portfolio)." if (isin or sym) else "The row has no ISIN or symbol."
            out.append({"i": i, "isin": isin or None, "symbol": sym or None, "name": raw.name, "status": "not_found", "reason": why, "etf": None})
            counts["not_found"] += 1
            continue
        status = "duplicate" if r["symbol"] in seen else "matched"
        seen.add(r["symbol"])
        counts[status] += 1
        out.append({"i": i, "isin": isin or None, "symbol": r["symbol"], "name": raw.name, "status": status, "via": via, "units": float(units) if units is not None else None,
                    "reason": "The same ETF as an earlier row: counted once." if status == "duplicate" else None,
                    "etf": {"symbol": r["symbol"], "name": r["display_name"]}, "existing": r["symbol"] in have})
    room = max(0, cap_for(ctx) - len(have))
    return reply({"rows": out, "counts": counts, "total": len(out), "capacity": {"limit": cap_for(ctx), "used": len(have), "room": room}, "disclaimer": DISCLAIMER})


@router.post("/import-commit")
async def import_commit(request: Request, body: CommitIn, ctx: Ctx = Depends(member_ctx)):
    await limit(request, "etfpc", ctx.user_id, 20, 600)
    cache = await etf._load(request.app)
    want: Dict[str, Optional[Decimal]] = {}
    for n, it in enumerate(body.items, 1):
        sym = it.symbol.strip().upper()
        if sym not in cache["by"]:
            raise fail(422, "invalid_row", f"Line {n}: no ETF on the NSE has the symbol {sym}.")
        want[sym] = units_of(it.units)
    added = updated = 0
    async with request.app.state.store.pool.acquire() as conn:
        async with conn.transaction():
            await lock_member(conn, ctx.user_id)
            have = {r["symbol"] for r in await conn.fetch("SELECT symbol FROM etf_holdings WHERE user_id = $1", ctx.user_id)}
            new = [s for s in want if s not in have]
            if len(have) + len(new) > cap_for(ctx):
                raise fail(403, "plan_limit", f"Your plan includes {cap_for(ctx)} ETFs; this file would make {len(have) + len(new)}.", plan="gold")
            for s, u in want.items():
                if s in have:
                    if u is not None:
                        await conn.execute("UPDATE etf_holdings SET units = $3, updated_at = now() WHERE user_id = $1 AND symbol = $2", ctx.user_id, s, u)
                        updated += 1
                else:
                    await conn.execute("INSERT INTO etf_holdings (user_id, symbol, units) VALUES ($1, $2, $3)", ctx.user_id, s, u)
                    added += 1
    return reply({"status": "saved", "added": added, "updated": updated})
