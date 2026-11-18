"""Task #235 phase 3b (the 18 Nov portfolios pack, C1, C5, C6): the MF portfolio by platform, with each buy and sale.

    GET  /api/me/mf-portfolio/book   the member's platforms (an app, a broker or the fund house)
    PUT  /api/me/mf-portfolio/book   the platforms: at most 10, each name its own; a platform removed takes its buys and sales with it

Each purchase line names its platform and whether it is a buy or a sale (PUT /{id} and POST ""). Sales are matched to buys first in, first out within each
fund and platform, exactly as the page does (lib/ledger.ts): lines in date order, buys first on the same date, a line without a date last in the order it
was added; a sale larger than what was held then is left out. The figures of the page (value, weights, mix, risk) use what is left of each buy, its cost
cut in the same proportion. Pure sums; charges, taxes and dividends are not included. Information only, not investment advice.
"""

from __future__ import annotations

import datetime as dt
import json
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import Depends, Request
from pydantic import BaseModel, Field

from ..auth.routes import Ctx, fail, limit

DEFAULT_PF = "main"
EPS = Decimal("0.00000001")


class Platform(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9]{1,16}$")
    name: str = Field(min_length=1, max_length=40)
    broker: Optional[str] = Field(default=None, max_length=40)
    created: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class BookIn(BaseModel):
    portfolios: List[Platform] = Field(default_factory=list, max_length=10)


def open_lots(lots: List[Dict[str, Any]], pf: Optional[str] = None) -> List[Dict[str, Any]]:
    """What is left of each buy, first in, first out within each platform; pf None keeps every platform. A buy's cost is cut in proportion to what is left."""
    groups: Dict[str, List[Any]] = {}
    for i, l in enumerate(lots):
        p = l.get("pf") or DEFAULT_PF
        if pf is not None and p != pf:
            continue
        groups.setdefault(p, []).append((i, l))
    out: List[Dict[str, Any]] = []
    for _p, rows in groups.items():
        key = lambda t: (t[1].get("bought_on") or dt.date.max, 0 if (t[1].get("side") or "buy") == "buy" else 1, t[1].get("pos") or 0, t[0])   # noqa: E731
        live: List[Dict[str, Any]] = []
        for _i, l in sorted(rows, key=key):
            u = Decimal(str(l["units"]))
            if (l.get("side") or "buy") == "buy":
                live.append({**l, "units": u, "_u0": u})
                continue
            if u > sum((b["units"] for b in live), Decimal(0)) + EPS:
                continue                                          # larger than what was held then: left out
            while u > EPS and live:
                b = live[0]
                take = min(b["units"], u)
                b["units"] -= take
                u -= take
                if b["units"] <= EPS:
                    live.pop(0)
        for b in live:
            u0 = b.pop("_u0")
            if b["invested"] is not None and u0 > 0:
                b["invested"] = (Decimal(str(b["invested"])) * b["units"] / u0).quantize(Decimal("0.01"))
            out.append(b)
    return out


async def platforms_of(conn, user_id: str) -> List[Dict[str, Any]]:
    v = await conn.fetchval("SELECT portfolios FROM mf_books WHERE user_id = $1", user_id)
    return json.loads(v) if isinstance(v, str) else list(v or [])


def register(router, member_ctx, lock_member, reply) -> None:
    """Adds the two routes to the MF portfolio's router (called from api.py)."""

    @router.get("/book")
    async def get_book(request: Request, ctx: Ctx = Depends(member_ctx)):
        async with request.app.state.store.pool.acquire() as conn:
            return reply({"portfolios": await platforms_of(conn, ctx.user_id)})

    @router.put("/book")
    async def put_book(request: Request, body: BookIn, ctx: Ctx = Depends(member_ctx)):
        await limit(request, "mfpw", ctx.user_id, 120, 600)
        names = [a.name.strip().lower() for a in body.portfolios]
        if len(set(names)) != len(names) or len({a.id for a in body.portfolios}) != len(body.portfolios):
            raise fail(422, "duplicate_portfolio", "Two platforms have the same name. Give each its own name.")
        keep = [a.id for a in body.portfolios] or [DEFAULT_PF]
        async with request.app.state.store.pool.acquire() as conn:
            async with conn.transaction():
                await lock_member(conn, ctx.user_id)
                await conn.execute("INSERT INTO mf_books (user_id, portfolios, updated_at) VALUES ($1, $2::jsonb, now()) "
                                   "ON CONFLICT (user_id) DO UPDATE SET portfolios = EXCLUDED.portfolios, updated_at = now()",
                                   ctx.user_id, json.dumps([a.model_dump(exclude_none=True) for a in body.portfolios]))
                gone = await conn.execute("DELETE FROM mf_holding_lots l USING mf_holdings h WHERE l.holding_id = h.id AND h.user_id = $1 AND NOT (l.pf = ANY($2::text[]))",
                                          ctx.user_id, keep)
        return reply({"status": "saved", "removedLines": int(gone.split()[-1])})
