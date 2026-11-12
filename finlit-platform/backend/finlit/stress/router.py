"""/api/stress/*: the Stress Lab page's data. Silver and Gold read the page; the engine runs on the server for Gold only (/run, /compare, /peer).
The value move is a percentage and is never applied to a share price; STRESS_SHOW_VALUE=0 removes it from every answer. Information only, not investment advice."""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import replace
from typing import Any, Dict, Optional

import orjson
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from ..auth.entitlements import has
from ..auth.routes import SYMBOL, Ctx, admin_ctx, fail, secure_ctx, user_ctx
from ..background import spawn
from ..screener.data import get_table
from . import engine, service
from . import page as P

S = engine()
log = logging.getLogger("finlit.stress")
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


async def _covered(request: Request, sym: str):
    """The launch rule (404 with its plain words when the company is outside it) and the screener row's size word."""
    store = request.app.state.store
    table = await get_table(store)
    mc, bank = service.table_row(table, sym)
    reason = service.covered_by_rule(mc, bank)
    if reason:
        raise fail(404, "not_covered", reason, covered=False)
    return table, service.size_word(mc, table.cap[table.pos[sym]])


_building: Dict[str, "asyncio.Task[Any]"] = {}     # one build per company at a time, however many readers open it together


async def _build_and_store(app, sym: str, size: str):
    """Build a company's page and store it. Runs in the background, so a slow data provider finishes the job even after the reader was told the page is being prepared;
    the reason of a failure goes to stress_failures and the log, never to a reader."""
    try:
        payload, pack = await asyncio.wait_for(service.build_payload_and_pack(app, sym, size=size), service.PER_COMPANY_S)
        await service.save_page(app.state.store, sym, payload, pack)
        return payload, pack
    except service.NotCovered as exc:
        await _note_failure(app, sym, "not_covered", str(exc))
        raise
    except service.NotReady as exc:
        log.warning("stress %s not ready: %s", sym, exc)
        await _note_failure(app, sym, "not_ready", str(exc))
        raise
    except asyncio.TimeoutError:
        log.warning("stress %s: the build took more than %.0fs", sym, service.PER_COMPANY_S)
        await _note_failure(app, sym, "failed", f"the build took more than {service.PER_COMPANY_S:.0f}s (statements from the data provider)")
        raise
    except Exception as exc:     # any other fault: the real one in the log and the table
        log.warning("stress %s failed: %s: %s", sym, type(exc).__name__, exc)
        await _note_failure(app, sym, "failed", f"{type(exc).__name__}: {exc}")
        raise
    finally:
        _building.pop(sym, None)


async def _stored_or_live(request: Request, sym: str) -> dict:
    """{payload, pack}: the copy built at night when there is one. Otherwise a build starts (or the one already running is joined) and the reader waits at most LIVE_BUILD_S
    seconds; when it takes longer the reader gets the plain "being prepared" card (status 503) while the build carries on and stores the page, so the next visit (the page checks
    again by itself) shows it. A build is never cancelled half way, so a slow provider no longer means "being prepared" for ever."""
    app = request.app
    _, size = await _covered(request, sym)
    rec = await service.load_page(app.state.store, sym)
    if rec:
        return rec
    task = _building.get(sym)
    if task is None or task.done():
        task = spawn(_build_and_store(app, sym, size))
        _building[sym] = task
    try:
        payload, pack = await asyncio.wait_for(asyncio.shield(task), service.LIVE_BUILD_S)
    except service.NotCovered as exc:
        raise fail(404, "not_covered", str(exc), covered=False)
    except asyncio.TimeoutError:
        raise fail(503, "not_ready", service.PLAIN_NOT_READY)     # still building (or it ran out of time; the reason is in stress_failures)
    except Exception:            # not ready or any other fault: plain words out, the real reason already logged by the build
        raise fail(503, "not_ready", service.PLAIN_NOT_READY)
    return {"payload": payload, "pack": pack}


async def _note_failure(app, sym: str, kind: str, reason: str) -> None:
    try:
        await service.save_failure(app.state.store, sym, kind, reason)
    except Exception:   # nosec B110 - the log has it
        pass


async def _page(request: Request, sym: str) -> dict:
    return (await _stored_or_live(request, sym))["payload"]


@router.get("/quick-picks")
async def quick_picks(request: Request, ctx: Ctx = Depends(silver_ctx)):
    """The start page's quick picks: the six largest covered companies that have a stored page (so each one opens), never a bank or a company outside the launch list."""
    store = request.app.state.store
    have = set(await service.stored_symbols(store))
    picks = []
    for sym, mc in await service.covered_symbols(store):
        if sym in have:
            rec = await service.load_page(store, sym)
            co = (rec or {}).get("payload", {}).get("company") or {}
            picks.append({"symbol": sym, "name": co.get("name") or sym, "sector": co.get("industry") or co.get("sector") or "", "market_cap_cr": round(mc)})
        if len(picks) == 6:
            break
    if len(picks) < 6:
        await _warm(request, have)
    return _json({"picks": picks})


WARM_TOP = 12          # the largest covered companies the start page gets ready in the background when they have no stored page yet
WARM_AT_ONCE = 3       # never more than this many background builds at a time, so the web server stays quick for everyone else


async def _warm(request: Request, have: set) -> None:
    """Start building the largest covered companies that have no stored page yet (a few at a time, one build per company, never one that is already running).
    The nightly job does every company; this makes the biggest names ready even on a day the job has not reached them, without anyone waiting on it."""
    app = request.app
    table = await get_table(app.state.store)
    for sym, mc in (await service.covered_symbols(app.state.store))[:WARM_TOP]:
        if sum(1 for t in _building.values() if not t.done()) >= WARM_AT_ONCE:
            return
        if sym in have or (sym in _building and not _building[sym].done()):
            continue
        _building[sym] = spawn(_build_and_store(app, sym, service.size_word(mc, table.cap[table.pos[sym]])))


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
    rec = await _stored_or_live(request, sym)    # also applies the coverage rule; the stored pack means no call to the data provider
    try:
        pack, co, today, _, eia = await service.company_and_today(request.app, sym, pack=rec["pack"])
    except service.NotCovered as exc:
        raise fail(404, "not_covered", str(exc), covered=False)
    except service.NotReady as exc:
        log.warning("stress %s not ready: %s", sym, exc)
        raise fail(503, "not_ready", service.PLAIN_NOT_READY)
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


@router.get("/admin/status")
async def admin_status(request: Request, ctx: Ctx = Depends(admin_ctx)):
    """For the people who run the site (admin accounts only), in a browser: how many covered companies have a stored page, which are being built right now, and why the
    others have none yet (the reasons from stress_failures). Readers never see these reasons."""
    store = request.app.state.store
    covered = await service.covered_symbols(store)
    out: Dict[str, Any] = {"covered": len(covered), "building": sorted(k for k, t in _building.items() if not t.done())}
    async with store.pool.acquire() as conn:
        out["stored"] = await conn.fetchval("SELECT count(*) FROM stress_pages")
        out["stored_today"] = await conn.fetchval("SELECT count(*) FROM stress_pages WHERE (built_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date")
        out["newest_build"] = str(await conn.fetchval("SELECT max(built_at) FROM stress_pages") or "") or None
        out["reasons"] = [{"kind": r["kind"], "reason": r["reason"], "companies": r["n"]} for r in await conn.fetch(
            "SELECT kind, left(reason, 160) AS reason, count(*) AS n FROM stress_failures GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15")]
        out["latest_failures"] = [{"symbol": r["symbol"], "kind": r["kind"], "reason": r["reason"][:200], "attempts": r["attempts"], "at": str(r["failed_at"])} for r in await conn.fetch(
            "SELECT symbol, kind, reason, attempts, failed_at FROM stress_failures ORDER BY failed_at DESC LIMIT 20")]
    out["largest_without_page"] = [s for s, _ in covered if s not in set(await service.stored_symbols(store))][:20]
    return _json(out)
