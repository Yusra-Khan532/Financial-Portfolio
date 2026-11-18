"""Task #235 phase 3a (the 18 Nov portfolios pack, C2, C5, C6): the ETF portfolio by demat account, with each buy and sale.

    GET  /api/me/etf-portfolio/book   the member's accounts and every buy and sale; an ETF stored before (a quantity, no buys) reads as one buy, no price,
                                      in the first account, until the member saves
    PUT  /api/me/etf-portfolio/book   the whole book: accounts (at most 10, names their own) and buys and sales; the open units of each ETF across all
                                      accounts are written back to etf_holdings, so every figure on the page keeps working

Sales are matched to buys first in, first out within each account, exactly as the page does (lib/ledger.ts): buys and sales in date order, buys first on
the same date, a row without a date last in the order it was added; a sale larger than what was held then is left out. Pure sums; charges, taxes and
dividends are not included. Every query filters on the member's id. Information only, not investment advice.
"""

from __future__ import annotations

import json
import datetime as dt
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional, Tuple

from fastapi import Depends, Request
from pydantic import BaseModel, Field, field_validator

from ..auth.routes import Ctx, fail, limit

DEFAULT_PF = "main"
MAX_LOTS = 2000
EPS = Decimal("0.00000001")


class Account(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9]{1,16}$")
    name: str = Field(min_length=1, max_length=40)
    broker: Optional[str] = Field(default=None, max_length=40)
    created: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class Lot(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,40}$")
    symbol: str = Field(min_length=1, max_length=24)
    pf: str = Field(default=DEFAULT_PF, pattern=r"^[a-z0-9]{1,16}$")
    side: Literal["buy", "sell"] = "buy"
    qty: Decimal = Field(gt=0, le=Decimal("1000000000000"))
    price: Optional[Decimal] = Field(default=None, gt=0, le=Decimal("100000000"))
    date: Optional[dt.date] = None

    @field_validator("qty", "price")
    @classmethod
    def four(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        return None if v is None else v.quantize(Decimal("0.0001"))


class BookIn(BaseModel):
    portfolios: List[Account] = Field(default_factory=list, max_length=10)
    lots: List[Lot] = Field(default_factory=list, max_length=MAX_LOTS)


def open_units(lots: List[Dict[str, Any]], pf: Optional[str] = None) -> Dict[str, Decimal]:
    """The units still held of each ETF, first in, first out within each account; pf None adds every account. A sale larger than what was held is ignored."""
    out: Dict[str, Decimal] = {}
    groups: Dict[Tuple[str, str], List[Tuple[int, Dict[str, Any]]]] = {}
    for i, l in enumerate(lots):
        if pf is not None and l["pf"] != pf:
            continue
        groups.setdefault((l["symbol"], l["pf"]), []).append((i, l))
    for (sym, _p), rows in groups.items():
        key = lambda t: (t[1]["date"] or dt.date.max, 0 if t[1]["side"] == "buy" else 1, t[0])   # noqa: E731
        held = Decimal(0)
        for _i, l in sorted(rows, key=key):
            q = Decimal(l["qty"])
            if l["side"] == "buy":
                held += q
            elif q <= held + EPS:
                held -= q
        out[sym] = out.get(sym, Decimal(0)) + max(held, Decimal(0))
    return out


def open_cost(lots: List[Dict[str, Any]], pf: Optional[str] = None) -> Dict[str, Optional[Decimal]]:
    """What the units still held of each ETF cost, first in, first out within each account (None when a buy still held has no price). Task #235, C3."""
    out: Dict[str, Optional[Decimal]] = {}
    groups: Dict[Tuple[str, str], List[Tuple[int, Dict[str, Any]]]] = {}
    for i, l in enumerate(lots):
        if pf is not None and l["pf"] != pf:
            continue
        groups.setdefault((l["symbol"], l["pf"]), []).append((i, l))
    for (sym, _p), rows in groups.items():
        key = lambda t: (t[1]["date"] or dt.date.max, 0 if t[1]["side"] == "buy" else 1, t[0])   # noqa: E731
        live: List[List[Any]] = []          # [units left, price]
        for _i, l in sorted(rows, key=key):
            q = Decimal(l["qty"])
            if l["side"] == "buy":
                live.append([q, l["price"]])
                continue
            if q > sum((b[0] for b in live), Decimal(0)) + EPS:
                continue
            while q > EPS and live:
                take = min(live[0][0], q)
                live[0][0] -= take
                q -= take
                if live[0][0] <= EPS:
                    live.pop(0)
        cost: Optional[Decimal] = Decimal(0)
        for u, p in live:
            cost = None if cost is None or p is None else cost + u * Decimal(p)
        prev = out.get(sym, Decimal(0))
        out[sym] = None if prev is None or cost is None else prev + cost
    return out


async def lots_of(conn, user_id: str) -> List[Dict[str, Any]]:
    return [dict(r) for r in await conn.fetch(
        "SELECT id, symbol, pf, side, qty, price, bought_on AS date, pos FROM etf_lots WHERE user_id = $1 ORDER BY pos, created_at, id", user_id)]


async def accounts_of(conn, user_id: str) -> List[Dict[str, Any]]:
    v = await conn.fetchval("SELECT portfolios FROM etf_books WHERE user_id = $1", user_id)
    return json.loads(v) if isinstance(v, str) else list(v or [])


async def held_in(conn, user_id: str, pf: str) -> List[Dict[str, Any]]:
    """The ETFs held in one account and their open units there. An ETF with no buys stored (followed, or a quantity from before) belongs to the first account."""
    lots = await lots_of(conn, user_id)
    units = open_units(lots, pf)
    accs = await accounts_of(conn, user_id)
    first = accs[0]["id"] if accs else DEFAULT_PF
    with_lots = {l["symbol"] for l in lots}
    rows = await conn.fetch("SELECT symbol, qty, isin FROM etf_holdings WHERE user_id = $1 ORDER BY created_at, symbol", user_id)
    out = []
    for r in rows:
        if r["symbol"] in with_lots:
            q = units.get(r["symbol"])
            if q is not None and q > 0:
                out.append({"symbol": r["symbol"], "qty": q.quantize(Decimal("0.0001")), "isin": r["isin"]})
        elif pf == first:
            out.append({"symbol": r["symbol"], "qty": r["qty"], "isin": r["isin"]})
    return out


def _out(l: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": l["id"], "symbol": l["symbol"], "pf": l["pf"], "side": l["side"], "qty": float(l["qty"]),
            "price": float(l["price"]) if l["price"] is not None else 0, "date": l["date"].isoformat() if l["date"] else None}


def register(router, member_ctx, lock_member, etf_rows, resolve, cap_for, reply) -> None:
    """Adds the two routes to the ETF portfolio's router (called from api.py, which owns the helpers)."""

    @router.get("/book")
    async def get_book(request: Request, ctx: Ctx = Depends(member_ctx)):
        async with request.app.state.store.pool.acquire() as conn:
            lots, accs = await lots_of(conn, ctx.user_id), await accounts_of(conn, ctx.user_id)
            with_lots = {l["symbol"] for l in lots}
            legacy = [r for r in await conn.fetch("SELECT symbol, qty FROM etf_holdings WHERE user_id = $1 ORDER BY created_at, symbol", ctx.user_id)
                      if r["symbol"] not in with_lots]
        first = accs[0]["id"] if accs else DEFAULT_PF
        out = [_out(l) for l in lots]
        out += [{"id": f"was-{r['symbol']}"[:40].replace("&", "_").replace(".", "_"), "symbol": r["symbol"], "pf": first, "side": "buy",
                 "qty": float(r["qty"]), "price": 0, "date": None, "legacy": True} for r in legacy if r["qty"] is not None]
        names = [r["symbol"] for r in legacy if r["qty"] is None]
        return reply({"portfolios": accs, "lots": out, "names": names})

    @router.put("/book")
    async def put_book(request: Request, body: BookIn, ctx: Ctx = Depends(member_ctx)):
        """Replace the member's book. New ETFs are added to the list (within the plan's number), an ETF sold in full in every account leaves it, and the
        open units of each ETF with buys become its quantity."""
        await limit(request, "etfpw", ctx.user_id, 120, 600)
        names = [a.name.strip().lower() for a in body.portfolios]
        if len(set(names)) != len(names):
            raise fail(422, "duplicate_portfolio", "Two accounts have the same name. Give each its own name.")
        if len({a.id for a in body.portfolios}) != len(body.portfolios):
            raise fail(422, "duplicate_portfolio", "Two accounts have the same id.")
        if len({l.id for l in body.lots}) != len(body.lots):
            raise fail(422, "duplicate_lot", "Two buys or sales have the same id.")
        ids = {a.id for a in body.portfolios} or {DEFAULT_PF}
        if any(l.pf not in ids and l.pf != DEFAULT_PF for l in body.lots):
            raise fail(422, "unknown_portfolio", "A buy or sale names an account that is not in the list.")
        by = await etf_rows(request.app)
        lots = []
        for l in body.lots:
            sym = resolve(l.symbol, by)
            if sym is None:
                raise fail(404, "unknown_etf", f"No ETF with the symbol or ISIN {l.symbol[:24]}.")
            lots.append({"id": l.id, "symbol": sym, "pf": l.pf, "side": l.side, "qty": l.qty, "price": l.price, "date": l.date})
        units = open_units(lots)
        cap = cap_for(ctx)
        async with request.app.state.store.pool.acquire() as conn:
            async with conn.transaction():
                await lock_member(conn, ctx.user_id)
                have = {r["symbol"]: r for r in await conn.fetch("SELECT symbol, qty FROM etf_holdings WHERE user_id = $1", ctx.user_id)}
                gone = [s for s, q in units.items() if q <= 0 and s in have]                     # sold in full in every account
                new = [s for s, q in units.items() if q > 0 and s not in have]
                if len(have) - len(gone) + len(new) > cap:
                    raise fail(403, "plan_limit", f"Your plan includes {cap} ETFs. Remove one to add another.")
                await conn.execute("INSERT INTO etf_books (user_id, portfolios, updated_at) VALUES ($1, $2::jsonb, now()) "
                                   "ON CONFLICT (user_id) DO UPDATE SET portfolios = EXCLUDED.portfolios, updated_at = now()",
                                   ctx.user_id, json.dumps([a.model_dump(exclude_none=True) for a in body.portfolios]))
                before = {r["symbol"] for r in await conn.fetch("SELECT DISTINCT symbol FROM etf_lots WHERE user_id = $1", ctx.user_id)}
                await conn.execute("DELETE FROM etf_lots WHERE user_id = $1", ctx.user_id)
                if lots:
                    await conn.executemany("INSERT INTO etf_lots (id, user_id, symbol, pf, side, qty, price, bought_on, pos) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                                           [(l["id"], ctx.user_id, l["symbol"], l["pf"], l["side"], l["qty"], l["price"], l["date"], i) for i, l in enumerate(lots)])
                for s in new:
                    await conn.execute("INSERT INTO etf_holdings (user_id, symbol, qty, isin) VALUES ($1, $2, $3, $4)", ctx.user_id, s, units[s].quantize(Decimal("0.0001")), by[s].get("isin") or None)
                await conn.executemany("UPDATE etf_holdings SET qty = $3, updated_at = now() WHERE user_id = $1 AND symbol = $2",
                                       [(ctx.user_id, s, q.quantize(Decimal("0.0001"))) for s, q in units.items() if q > 0 and s in have])
                bare = [s for s in before if s not in units and s in have]                         # every buy and sale removed: back to a name only
                if bare:
                    await conn.execute("UPDATE etf_holdings SET qty = NULL, updated_at = now() WHERE user_id = $1 AND symbol = ANY($2::text[])", ctx.user_id, bare)
                if gone:
                    await conn.execute("DELETE FROM etf_holdings WHERE user_id = $1 AND symbol = ANY($2::text[])", ctx.user_id, gone)
        return reply({"status": "saved", "lots": len(lots), "added": new, "soldInFull": gone})
