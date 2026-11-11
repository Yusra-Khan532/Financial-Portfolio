"""/api/stress/*: the Stress Lab page's data. Silver and Gold read the page; the engine runs on the server for Gold only (/run, /compare, /peer).
The value move is a percentage and is never applied to a share price; STRESS_SHOW_VALUE=0 removes it from every answer. Information only, not investment advice."""
from __future__ import annotations

import json
from dataclasses import replace
from typing import Any, Dict, Optional

import orjson
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from ..auth.entitlements import has
from ..auth.routes import SYMBOL, Ctx, fail, secure_ctx, user_ctx
from ..screener.data import get_table
from . import engine, service
from . import page as P

S = engine()
router = APIRouter(prefix="/api/stress")
NO_STORE = {"Cache-Control": "private, no-store", "Vary": "Cookie"}
SHARES_OK = ("pass_through", "crude_rm", "import_rm", "export_rev", "demand_beta", "floating_debt")   # the six settings a Gold reader may try with their own value
RANGES = {"crude": (-90.0, 300.0), "usdinr": (1 / 1.4 * 100 - 100, 1 / 0.67 * 100 - 100), "cpi": (-5.0, 15.0), "wpi": (-10.0, 25.0), "agri": (-10.0, 25.0), "metals": (-90.0, 300.0),
          "rate_bp": (-500.0, 1000.0), "demand": (-60.0, 30.0), "erp_bp": (-300.0, 600.0)}


async def silver_ctx(ctx: Ctx = Depends(user_ctx)) -> Ctx:
    if ctx.role != "admin" and not has(ctx.plan, "silver"):
        raise fail(403, "plan_required", "Stress Lab is part of the Silver and Gold plans.", plan="silver")
    return ctx


async def gold_ctx(ctx: Ctx = Depends(secure_ctx)) -> Ctx:
    if ctx.role != "admin" and not has(ctx.plan, "gold"):
        raise fail(403, "plan_required", "This part of Stress Lab is part of the Gold plan.", plan="gold")
    return ctx


def _json(body: Any, status: int = 200) -> Response:
    return Response(content=orjson.dumps(body), status_code=status, media_type="application/json", headers=NO_STORE)


def _sym(raw: str) -> str:
    sym = raw.strip().upper()
    if not SYMBOL.match(sym):
        raise fail(400, "invalid_symbol", "That is not a stock symbol.")
    return sym


def strip_value(obj: Any) -> Any:
    """STRESS_SHOW_VALUE off: the value move leaves every answer (the key, wherever it sits)."""
    if isinstance(obj, dict):
        return {k: strip_value(v) for k, v in obj.items() if k not in ("value", "value_move", "value_other_persistence")}
    if isinstance(obj, list):
        return [strip_value(v) for v in obj]
    return obj


def scenario_from(body: "ScenarioIn", base: Optional[S.Scenario] = None) -> S.Scenario:
    """A scenario from the reader's numbers, clipped to the sliders' ranges (spec 7.3)."""
    sc = replace(base) if base else S.Scenario()
    for k, (lo, hi) in RANGES.items():
        v = getattr(body, k)
        if v is not None:
            setattr(sc, k, min(max(float(v), lo), hi))
    if body.persistence in ("one_year", "permanent"):
        sc.persistence = body.persistence
    sc.name = "Custom"
    return sc


class ScenarioIn(BaseModel):
    preset: Optional[str] = Field(None, max_length=16)
    crude: Optional[float] = None
    usdinr: Optional[float] = None
    cpi: Optional[float] = None
    wpi: Optional[float] = None
    agri: Optional[float] = None
    metals: Optional[float] = None
    rate_bp: Optional[float] = None
    demand: Optional[float] = None
    erp_bp: Optional[float] = None
    persistence: Optional[str] = None
    settings: Optional[Dict[str, float]] = None      # "your value" boxes (Gold)


class CompareIn(ScenarioIn):
    a: str
    b: str


def with_settings(co: "S.Company", settings: Optional[Dict[str, float]]) -> "S.Company":
    """The company with the reader's own values for the six settings; a value that breaks the share rules is refused."""
    if not settings:
        return co
    ranges = {"pass_through": (0, 1), "crude_rm": (0, 1), "import_rm": (0, 1), "export_rev": (0, 1), "demand_beta": (0.2, 2.5), "floating_debt": (0, 1)}
    new = {}
    for k, v in settings.items():
        if k not in SHARES_OK:
            raise fail(422, "unknown_setting", f"{k} cannot be changed.")
        lo, hi = ranges[k]
        if not lo <= float(v) <= hi:
            raise fail(422, "out_of_range", f"{k} must be between {lo} and {hi}.")
        new[k] = float(v)
    e = replace(co.exposure, **new)
    if e.crude_rm + e.import_rm + e.metal_rm + e.agri_rm > 1 + 1e-9:
        raise fail(422, "shares_over_100", "The raw-material shares cannot add up to more than 100%.")
    if e.export_rev + e.crude_rev > 1 + 1e-9:
        raise fail(422, "shares_over_100", "Export sales and crude-linked revenue cannot add up to more than 100%.")
    return replace(co, exposure=e)


async def _page(request: Request, sym: str) -> dict:
    app = request.app
    table = await get_table(app.state.store)
    mc, bank = service.table_row(table, sym)
    reason = service.covered_by_rule(mc, bank)
    if reason:
        raise fail(404, "not_covered", reason, covered=False)
    key = f"stress:page:{sym}"
    try:
        hit = await app.state.store.redis.get(key)
    except Exception:
        hit = None
    if hit:
        return json.loads(hit)
    i = table.pos[sym]
    size = service.size_word(mc, table.cap[i])
    try:
        payload = await service.build_payload(app, sym, size=size)
    except service.NotCovered as exc:
        raise fail(404, "not_covered", str(exc), covered=False)
    except service.NotReady as exc:
        raise fail(503, "not_ready", str(exc))
    try:
        await app.state.store.redis.set(key, json.dumps(payload), ex=service.PAGE_TTL)
    except Exception:   # nosec B110 - the next request builds it again
        pass
    return payload


@router.get("/{symbol}/page")
async def page(request: Request, symbol: str, ctx: Ctx = Depends(silver_ctx)):
    sym = _sym(symbol)
    payload = await _page(request, sym)
    plan = "gold" if (ctx.role == "admin" or has(ctx.plan, "gold")) else "silver"
    out = {**P.plan_payload(payload, plan), "flags": {"showValue": request.app.state.settings.stress_show_value}}
    if not out["flags"]["showValue"]:
        out = strip_value(out)
    return _json(out)


def _result(co, sc) -> dict:
    r = S.run(co, sc)
    r["explain"] = S.explain(r)
    r.pop("assumptions", None)
    r["value_other_persistence"] = (S.run(co, replace(sc, persistence="permanent" if sc.persistence == "one_year" else "one_year")).get("value") or {}).get("move_pct")
    return r


async def _company(request: Request, sym: str, settings=None):
    payload = await _page(request, sym)          # also applies the coverage rule
    pack, co, today, _, eia = await service.company_and_today(request.app, sym)
    return with_settings(co, settings), today, eia


def _base(sc_in: ScenarioIn, today, eia) -> Optional[S.Scenario]:
    if sc_in.preset == "today":
        return today
    if sc_in.preset == "today_eia" and eia:
        return P.today_eia(today, eia)
    if sc_in.preset in S.PRESETS:
        return S.PRESETS[sc_in.preset]
    if sc_in.preset:
        raise fail(422, "unknown_preset", "That scenario does not exist.")
    return None


@router.post("/{symbol}/run")
async def run(request: Request, symbol: str, body: ScenarioIn, ctx: Ctx = Depends(gold_ctx)):
    sym = _sym(symbol)
    co, today, eia = await _company(request, sym, body.settings)
    base = _base(body, today, eia)
    sc = scenario_from(body, base) if any(getattr(body, k) is not None for k in list(RANGES) + ["persistence"]) else (base or S.Scenario())
    out = _result(co, sc)
    return _json(out if request.app.state.settings.stress_show_value else strip_value(out))


@router.post("/compare")
async def compare(request: Request, body: CompareIn, ctx: Ctx = Depends(gold_ctx)):
    a, b = _sym(body.a), _sym(body.b)
    if a == b:
        raise fail(422, "same_company", "Pick two different companies.")
    ca, today, eia = await _company(request, a, body.settings)
    cb, _, _ = await _company(request, b)
    base = _base(body, today, eia)
    sc = scenario_from(body, base) if any(getattr(body, k) is not None for k in list(RANGES) + ["persistence"]) else (base or S.Scenario())
    out = S.compare(ca, cb, sc)
    return _json(out if request.app.state.settings.stress_show_value else strip_value(out))


@router.get("/{symbol}/peer")
async def peer(request: Request, symbol: str, ctx: Ctx = Depends(gold_ctx)):
    """The compare view's second company: the first peer (in the report's peer order) that Stress Lab covers and that has results to the same quarter."""
    sym = _sym(symbol)
    store = request.app.state.store
    hit = await store.get_section(sym, "consolidated", "peers") or await store.get_section(sym, "standalone", "peers")
    peers = []
    if hit:
        try:
            peers = [str(x).upper() for x in ((json.loads(hit[0]).get("symbols")) or [])]
        except (ValueError, AttributeError):
            peers = []
    table = await get_table(store)
    cov = service.covered_quarters(table, [sym] + peers)
    return _json({"symbol": sym, "peer": P.default_peer(sym, peers, cov), "peers": [p for p in peers if p in cov]})
