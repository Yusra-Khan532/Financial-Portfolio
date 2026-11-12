"""GET /api/screener/selfcheck: the 12 Nov acceptance checks of the screens (live_check.py C1 to C7), run inside the server on the lists it serves, so they can be
checked on the live site without a Gold account. Only pass or fail, how many screens fail and their ids come out: never a company, a price or a score.
The answer is kept five minutes."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List

from fastapi import APIRouter, Request, Response

from ..auth.routes import NO_STORE
from . import engine, service
from .registry import ALL

router = APIRouter(prefix="/api/screener/selfcheck")
KEY = "presets:selfcheck:v1"
TTL = 300
# the same words live_check.py treats as model detail in a screen's texts
LEAK = re.compile(r"cut-?off|percentile|weighted|\bfrom \d+ to \d+\b|view is -?\d+ or more|\b\d+ or more\b(?! ?(Cr|crore|%|companies|years|quarters|sessions|days))", re.I)


def _check(cid: str, name: str, failing: List[str]) -> Dict[str, Any]:
    return {"id": cid, "name": name, "ok": not failing, "failing": len(failing), "examples": failing[:6]}


async def run(request: Request) -> Dict[str, Any]:
    """C1 to C7 over every live screen of both pages, with its default options."""
    from .api import _body          # the very function the screen pages are served by
    served = [p for p in ALL if p.status == "live" and p.kind != "gainers"]
    store = request.app.state.store
    not_server = [p.id for p in served if p.kind == "quickview"]
    n_uni = 0
    try:
        from ..screener.data import get_table
        n_uni = (await get_table(store)).n
    except Exception:
        pass
    cnt_bad: List[str] = []; no_add: List[str] = []; no_bench: List[str] = []; leftout: List[str] = []; leaks: List[str] = []
    asofs = set()
    for p in served:
        if p.kind == "quickview":
            continue
        active = [c.id for c in p.chips if c.default]
        try:
            card = await service.read_cached(store, p.id, engine.chip_key(active))
            body = await _body(request, p, active)
        except Exception as exc:
            cnt_bad.append(f"{p.id}: {type(exc).__name__}")
            continue
        rows = body.get("exportRows") or body.get("rows") or []
        asofs.add(body.get("asOf"))
        if card is not None and card.get("count") != body.get("count"):
            cnt_bad.append(f"{p.id}: card {card.get('count')} vs served {body.get('count')}")
        if p.kind not in ("themes",):
            miss = sum(1 for r in rows if not r.get("added_on"))
            if miss:
                no_add.append(f"{p.id}: {miss}/{len(rows)}")
        nb = sum(1 for r in rows if r.get("since_added_pct") is not None and r.get("bench_since_added_pct") is None)
        if nb:
            no_bench.append(f"{p.id}: {nb}")
        lo = body.get("leftOutCount") or 0
        if n_uni and lo > 0.02 * n_uni:
            leftout.append(f"{p.id}: {lo}")
        texts = [body.get("rankScoreNote") or ""] + list(body.get("howItWorks") or []) + [c.description for c in p.chips]
        hit = sorted({m.group(0) for t in texts for m in [LEAK.search(t or "")] if m})
        if p.tab == "basic" and any("Growth & Profitability" in t for t in texts):
            hit.append("Growth & Profitability")
        if hit:
            leaks.append(f"{p.id}: {hit}")
    checks = [
        _check("C1", "Every live screen is served by the API", not_server),
        _check("C2", "Served list = stored list (card count equals served count)", cnt_bad),
        _check("C3", "Every served row has Added", no_add),
        _check("C4", "NIFTY 500 change filled wherever Since added is", no_bench),
        _check("C5", "One build: every screen carries the same asOf", [] if len({a for a in asofs if a}) <= 1 else sorted(a for a in asofs if a)),
        _check("C6", "Pattern scans covered the whole market (left out under 2%)", leftout),
        _check("C7", "No model detail in screen texts", leaks),
    ]
    return {"screens": len(served), "asOf": sorted(a for a in asofs if a), "checks": checks, "passed": sum(1 for c in checks if c["ok"]), "of": len(checks)}


@router.get("")
async def selfcheck(request: Request):
    store = request.app.state.store
    try:
        hit = await store.redis.get(KEY)
        if hit:
            return Response(content=hit, media_type="application/json", headers=NO_STORE)
    except Exception:
        pass
    out = json.dumps(await run(request), default=str)
    try:
        await store.redis.set(KEY, out, ex=TTL)
    except Exception:
        pass
    return Response(content=out, media_type="application/json", headers=NO_STORE)
