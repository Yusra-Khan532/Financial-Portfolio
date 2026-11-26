"""Trading Lab, Stock zones > Liquidity map (docs/TRADING-LAB.md, MarketPulse idea 4): the option walls of an F&O stock drawn on its chart.

A "wall" here is simply a strike where open interest is concentrated: the WALLS strikes with the most put OI and the WALLS with the most
call OI in the stock's nearest unexpired expiry. They come from the site's own option chain (options.cached, key oc:chain:<symbol>:<expiry>,
the same cache and Dhan pacing as Option Pulse: no new Dhan caller). Each wall carries its OI, today's change in it and its distance from
the last price. It says where open positions sit; it never says the price will stop there.
"""
from __future__ import annotations

from typing import List, Optional

import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from ..auth.service import Ctx
from .access import lab_ctx
from .zones import SYMBOL

router = APIRouter()

WALLS = 3
NO_STORE = {"Cache-Control": "no-store"}


def walls(body: dict) -> dict:
    """The largest put and call OI strikes of one summarised chain (options.summarize), largest first, with today's change and distance."""
    rows = body.get("rows") or []
    spot = body.get("spot")

    def side(s: str) -> List[dict]:
        have = [r for r in rows if (r.get(s) or {}).get("oi")]
        top = sorted(have, key=lambda r: -r[s]["oi"])[:WALLS]
        out = []
        for i, r in enumerate(top):
            x = r[s]
            out.append({"rank": i + 1, "strike": r["strike"], "oi": x["oi"], "oiChange": x.get("oiChange"), "oiChangePct": x.get("oiChangePct"),
                        "distancePct": None if not spot else round((r["strike"] - spot) / spot * 100, 2)})
        return out

    summary = body.get("summary") or {}
    return {"spot": spot, "pcrOi": summary.get("pcrOi"), "put": side("pe"), "call": side("ce"),
            "maxPain": (summary.get("maxPain") or {}).get("strike")}


@router.get("/api/lab/zones/{symbol}/walls")
async def stock_walls(request: Request, symbol: str, _ctx: Ctx = Depends(lab_ctx)):
    from .. import options
    sym = symbol.strip().upper()
    if not SYMBOL.match(sym):
        return JSONResponse({"status": "invalid_symbol"}, status_code=400, headers=NO_STORE)
    app = request.app
    try:
        und = await options.resolve(app.state.store, sym)
    except Exception:
        return JSONResponse({"status": "not_fno", "symbol": sym, "detail": f"{sym} has no listed options, so it has no option walls."}, status_code=404, headers=NO_STORE)
    today = options._ist().date().isoformat()
    try:
        exp_entry, _ = await options._expiries(app, und)
        exps = [e for e in exp_entry["body"]["expiries"] if e >= today]
        if not exps:
            return JSONResponse({"status": "no_expiry", "symbol": sym, "detail": "No unexpired option series is listed right now."}, status_code=404, headers=NO_STORE)
        expiry, seg = exps[0], exp_entry["body"]["segment"]

        async def fetch() -> dict:
            return options.summarize(await options._ask(app, "/optionchain", {"UnderlyingScrip": und["securityId"], "UnderlyingSeg": seg, "Expiry": expiry}))

        entry, state = await options.cached(app, f"oc:chain:{und['key']}:{expiry}", options.chain_fresh, fetch)
    except options.Busy as e:
        secs = max(1, int(e.retry_after) + 1)
        return JSONResponse({"status": "busy", "detail": "Many people are reading option chains right now; the walls follow in a few seconds.", "retryAfter": secs},
                            status_code=503, headers={**NO_STORE, "Retry-After": str(secs)})
    except options.DhanError:
        return JSONResponse({"status": "provider_unavailable", "detail": "Dhan did not answer for this option chain. Please try again in a moment."},
                            status_code=502, headers=NO_STORE)
    out = {"status": "ok", "symbol": sym, "expiry": expiry, "asOf": options._when(entry["t"]), "state": state, **walls(entry["body"])}
    return Response(content=orjson.dumps(out), media_type="application/json", headers=NO_STORE)
