"""POST /api/me/all-investments (task #137): the figures behind the "All my investments" page.

The body carries the member's Equity portfolio shares (symbol and quantity: that list lives in the browser and the account, as the Equity portfolio page
sends it); the member's mutual funds are read from their MF portfolio here. No new store: both lists stay where they are, so changing a list on its own
page changes this page. ETFs are not read: the ETF portfolio does not exist yet, and the answer says so.

Plans (founder, 15 Nov 2026): Silver and Gold, as the two portfolio pages. Shares are read with the FinLit IQ on Silver and FinLit Prism on Gold, never
both; the funds' FundPulse is Gold only, as everywhere on the site. Basic is refused (403 plan_required).
Information only, not investment advice.
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional

import orjson
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..auth.routes import Ctx, fail, ip_of
from ..mfportfolio import risk as mfrisk
from ..mfportfolio.api import SCHEME_COLS, holdings_of, is_gold, member_ctx, nav_history, scores_for
from . import calc

log = logging.getLogger("finlit.myinvest")
router = APIRouter(prefix="/api/me")
SYMBOL = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
NO_STORE = {"Cache-Control": "private, no-store", "Vary": "Cookie"}
BENCH_KEY = "myinv:nifty500:sectors:v1"
DISCLAIMER = ("Describes your shares and mutual funds from their published prices, NAVs and the fund houses' monthly portfolio files; holdings inside a fund can "
              "have changed since the fund house published its file. Past figures do not guarantee future returns. Mutual fund investments are subject to market "
              "risks; read all scheme-related documents carefully. Information only, not investment advice.")
ETF_SOON = "The ETF portfolio is coming. Once you can keep a list of your ETFs, they are counted here too."


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


def _ord(t: str) -> Optional[int]:
    try:
        return date.fromisoformat(t[:10]).toordinal()
    except (TypeError, ValueError):
        return None


def _year_ago(days: List[int], values: List[float]) -> Optional[float]:
    """The value about one year before the last one (the last value on or before that day, within 10 days)."""
    if not days:
        return None
    got = calc.on_grid(days, values, [days[-1] - 365])
    return got[0]


async def _bench_sectors(app, spell: Dict[str, str]) -> Dict[str, float]:
    redis = app.state.store.redis
    try:
        raw = await redis.get(BENCH_KEY)
    except Exception:
        raw = None
    if raw:
        return orjson.loads(raw)
    async with app.state.store.pool.acquire() as conn:
        members = [r["symbol"] for r in await conn.fetch("SELECT symbol FROM index_members WHERE index_code = 'NIFTY500'")]
    facts = await app.state.store.diversification_facts(members) if members else []
    out = calc.bench_sectors([{"sector": spell.get(f.get("sector") or "", f.get("sector")), "mcap": f.get("mcap")} for f in facts])
    try:
        await redis.set(BENCH_KEY, orjson.dumps(out), ex=6 * 3600)
    except Exception:
        pass
    return out


async def _iq(conn, symbols: List[str]) -> Dict[str, float]:
    rows = await conn.fetch("SELECT DISTINCT ON (symbol) symbol, overall FROM scores WHERE symbol = ANY($1::text[]) AND model = 'v1' AND overall IS NOT NULL "
                            "ORDER BY symbol, (statement = 'consolidated') DESC, updated_at DESC", symbols)
    return {r["symbol"]: float(r["overall"]) for r in rows}


@router.post("/all-investments")
async def all_investments(request: Request, body: Body, ctx: Ctx = Depends(member_ctx)) -> Response:
    app = request.app
    allowed, retry = await app.state.limiter.hit("all_investments", ip_of(request), 30, 60, fail_open=False)
    if not allowed:
        return Response(orjson.dumps({"status": "rate_limited", "detail": "Too many requests. Please wait and try again.", "retryAfter": retry}), status_code=429,
                        media_type="application/json", headers={"Retry-After": str(retry), "Cache-Control": "no-store"})
    from .. import indices, portfolios
    from ..diversification import api as div
    from ..portfolio_page.api import _sector_spellings
    gold = is_gold(ctx)
    store = app.state.store
    spell = await _sector_spellings(app)

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
        held = await holdings_of(conn, ctx.user_id)
        codes = sorted({h["code"] for h in held})
        schemes = {r["code"]: dict(r) for r in await conn.fetch(f"SELECT {SCHEME_COLS} FROM mf_schemes WHERE code = ANY($1::int[])", codes)} if codes else {}  # nosec B608 - fixed column list; codes are bound
        navs = {c: await nav_history(conn, schemes[c]) for c in codes if c in schemes}
        fscores = await scores_for(conn, codes) if gold and codes else {}
        iq = await _iq(conn, known) if known and not gold else {}
    prism = {r["symbol"]: r for r in await store.prism_cards(known)} if known and gold else {}
    from .. import leadership_api
    peer: Dict[str, str] = {}
    try:      # Leader / In line / Laggard against its peers, only while the label is switched on for everyone (as on the Advanced screener)
        if await leadership_api.public_now(store):
            async with store.pool.acquire() as conn:
                peer = {r["symbol"]: r["label"] for r in await conn.fetch("SELECT symbol, label FROM leadership WHERE label IS NOT NULL")}
    except Exception as exc:
        log.warning("all-investments: peer labels not read: %s", type(exc).__name__)

    shares: List[Dict[str, Any]] = []
    sday: Dict[str, List[int]] = {}
    sval: Dict[str, List[float]] = {}
    for s in known:
        f = facts[s]
        p = prices.get(s) or {}
        pairs = [(_ord(t), c) for t, c in zip(p.get("t") or [], p.get("c") or [])]
        pairs = [(d, c) for d, c in pairs if d is not None]
        sday[s], sval[s] = [d for d, _ in pairs], [c for _, c in pairs]
        last = sval[s][-1] if sval[s] else None
        ago = _year_ago(sday[s], sval[s])
        score = (calc._num(prism[s].get("final")) if s in prism else None) if gold else iq.get(s)
        shares.append({"symbol": s, "name": f.get("name") or s, "sector": spell.get(f.get("sector") or "", f.get("sector")), "qty": qty[s], "price": last, "price1y": ago,
                       "chg1y": (last / ago - 1) * 100 if last and ago else None, "score": score})

    units: Dict[int, Decimal] = defaultdict(Decimal)
    unknown_units = set()
    for h in held:
        for l in h["lots"]:
            if l["units"] is None:
                unknown_units.add(h["code"])
            else:
                units[h["code"]] += Decimal(str(l["units"]))
    funds: List[Dict[str, Any]] = []
    for c in codes:
        s = schemes.get(c)
        if s is None:
            continue
        port = await portfolios.get_portfolio(store.pool, c)
        days, vals = navs.get(c, ([], []))
        nav = float(s["nav"]) if s.get("nav") is not None else (vals[-1] if vals else None)
        ago = _year_ago(days, vals)
        sc = fscores.get(c) or {}
        funds.append({"code": c, "name": s["name"], "short": mfrisk.short_name(s["name"]), "units": float(units[c]) if units.get(c) and c not in unknown_units else None,
                      "nav": nav, "chg1y": (vals[-1] / ago - 1) * 100 if vals and ago else None, "holdings": (port or {}).get("holdings") or [],
                      "assetSplit": ((port or {}).get("summary") or {}).get("assetSplit"), "asOf": (port or {}).get("asOf"), "score": sc.get("final"), "scoreLabel": sc.get("label")})

    split = calc.split_parts(shares, funds)
    companies = calc.look_through(shares, funds, split)
    sector_of = {s["symbol"]: s["sector"] for s in shares}
    missing = [r["symbol"] for r in companies if r["symbol"] not in sector_of]
    if missing:
        more = await store.diversification_facts(missing)
        sector_of.update({f["symbol"]: spell.get(f.get("sector") or "", f.get("sector")) for f in more})
        names = {f["symbol"]: f.get("name") for f in more}
        for r in companies:
            if names.get(r["symbol"]):
                r["name"] = names[r["symbol"]]
    bench_sec = await _bench_sectors(app, spell)
    sector_rows = calc.sectors(companies, sector_of, bench_sec)
    mix = calc.asset_mix(shares, funds, split)

    # ---- risk against the NIFTY 500: weekly, three years
    risk_out: Optional[Dict[str, Any]] = None
    why_risk = None
    try:
        raw = await indices._cached(app, "idx:px:NIF500", 6 * 3600, lambda: indices._fetch_levels(app, "NIF500"))
        rows = indices.shape_levels(raw, calc.YEARS + 1)["rows"] if raw else []
    except Exception as exc:          # the index provider is down: the page shows everything else and says why the risk tab is empty
        log.warning("all-investments: NIFTY 500 levels not read: %s", type(exc).__name__)
        rows = []
    bench = {date.fromisoformat(r["d"]).toordinal(): float(r["c"]) for r in rows}
    if not bench:
        why_risk = "The Nifty 500 history is not available right now, so the risk figures cannot be worked out."
    elif shares or funds:
        grid = calc.weekly_grid(bench, max(bench))
        b_r = calc.rets(calc.on_grid(sorted(bench), [bench[d] for d in sorted(bench)], grid))
        s_r = [calc.rets(calc.on_grid(sday[s["symbol"]], sval[s["symbol"]], grid)) for s in shares]
        f_r = [calc.rets(calc.on_grid(*navs.get(f["code"], ([], [])), grid)) for f in funds]
        parts = {"shares": calc.blend(s_r, split["shares"]["w"]), "funds": calc.blend(f_r, split["funds"]["w"])}
        port = calc.blend([parts[k] for k in parts if split["part"][k]], [split["part"][k] for k in parts if split["part"][k]])
        figs = calc.risk_figures(port, b_r)
        if figs is None:
            why_risk = "Needs about a year of weekly prices for your holdings before the risk figures can be worked out."
        else:
            ratio = figs["swing"] / figs["benchSwing"] if figs["benchSwing"] else None
            shares_sw = calc.swing_shares(parts, split["part"], port)
            lines = [f"{calc.PART_WORD[x['part']].capitalize()} are {x['money']:.0f}% of your money but {x['swings']:.0f}% of the ups and downs."
                     for x in shares_sw if x["swings"] is not None and x["swings"] > x["money"] * 1.5 and x["swings"] - x["money"] >= 10]
            risk_out = {**{k: (round(v, 2) if isinstance(v, float) else v) for k, v in figs.items()}, "level": mfrisk.level_word(ratio) if ratio else None,
                        "vs": "the Nifty 500", "parts": shares_sw, "lines": lines, "grain": "weekly", "years": calc.YEARS}

    # ---- the answer
    def part_card(kind: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        sp = split[kind]
        chg = calc.weighted_mean([i.get("chg1y") for i in items], sp["w"])
        top = max(zip(items, sp["w"]), key=lambda x: x[1])[0] if items else None
        return {"count": len(items), "valued": sp["valued"], "value": round(sp["value"], 2) if sp["value"] else None, "share": round(split["part"][kind] * 100, 2),
                "chg1y": round(chg, 2) if chg is not None else None, "largest": ({"name": top.get("short") or top.get("name"), "symbol": top.get("symbol"), "code": top.get("code")} if top else None)}

    s_card = part_card("shares", shares)
    f_card = part_card("funds", funds)
    s_card["score"] = round(calc.weighted_mean([s["score"] for s in shares], split["shares"]["w"]), 1) if any(s["score"] is not None for s in shares) else None
    s_card["scoreModel"] = "prism" if gold else "iq"
    f_card["score"] = round(calc.weighted_mean([f["score"] for f in funds], split["funds"]["w"]), 1) if gold and any(f["score"] is not None for f in funds) else None
    f_card["scoreLocked"] = not gold
    if f_card["score"] is not None:
        from ..mfportfolio.calc import label_of
        f_card["scoreWord"] = label_of(f_card["score"]) or None
    overlap = max((len(c["via"]) for c in companies if c["funds"] > 0), default=0)
    f_card["overlap"] = calc.fund_overlap(funds)
    s_card["peers"] = {"lead": sum(1 for s in shares if peer.get(s["symbol"]) == "Leader"), "lag": sum(1 for s in shares if peer.get(s["symbol"]) == "Laggard"), "shown": bool(peer)}
    f_card["sharedCompanies"] = sum(1 for c in companies if len(c["via"]) > 1)
    f_card["mostShared"] = overlap
    body_out = {
        "plan": "gold" if gold else "silver", "byValue": split["byValue"], "total": round(split["total"], 2) if split["total"] else None,
        "chg1y": round(calc.weighted_mean([s_card["chg1y"], f_card["chg1y"]], [split["part"]["shares"], split["part"]["funds"]]), 2)
                 if s_card["chg1y"] is not None or f_card["chg1y"] is not None else None,
        "parts": {"shares": s_card, "funds": f_card, "etfs": {"count": 0, "soon": True, "why": ETF_SOON}},
        "mix": mix, "companies": [{**{k: (round(v, 4) if isinstance(v, float) else v) for k, v in c.items()}, "sector": sector_of.get(c["symbol"]), "peer": peer.get(c["symbol"])} for c in companies],
        "peersShown": bool(peer),
        "heldTwice": sum(1 for c in companies if c["twice"]), "sectors": sector_rows, "risk": risk_out, "riskWhy": why_risk,
        "insights": calc.insights(sector_rows, companies, mix, risk_out),
        "holdingsAsOf": max((f["asOf"] for f in funds if f.get("asOf")), default=None),
        "unknown": [s for s in symbols if s not in facts],
        "noHoldings": [f["short"] for f in funds if not f["holdings"]],
        "disclaimer": DISCLAIMER,
    }
    return Response(orjson.dumps(body_out), media_type="application/json", headers=NO_STORE)
