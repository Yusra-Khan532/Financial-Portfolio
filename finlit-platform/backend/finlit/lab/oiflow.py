"""Trading Lab, OI Flow (docs/TRADING-LAB.md "Ideas from the MarketPulse video", item 2): how fast put and call open interest is changing,
strike by strike, through the session.

One option chain answer gives each strike's OI now and at the previous close, so it cannot say how fast OI is moving. This module keeps a
snapshot of every index's nearest-expiry chain through the day:

  * The job `lab-oi-flow` runs every 3 minutes in market hours. For each of NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY and SENSEX it takes the
    nearest unexpired expiry and the chain through the site's own cached fetch (options.cached, key oc:chain:<u>:<expiry>): a copy younger
    than options.FRESH_SECONDS is reused without a Dhan call, a new one is asked in the site-wide option-chain turn (options.take_turn, one
    request in 3.1 s for the whole site), so the pages and the job never exceed Dhan's limit together. An underlying whose turn is too far
    away is skipped for this run (it is in the next one); nothing waits.
  * Each snapshot keeps call and put OI of the WINDOW strikes either side of the ATM strike, in a Redis list per underlying and trade day,
    kept SERIES_TTL (a few hundred kilobytes a day in all).

What the page shows, each a plain difference of stored OI (nothing estimated):
  * Change over 15 minutes and 1 hour: OI now minus OI in the latest snapshot at or before that long ago (the real gap in minutes is given).
  * Change today: OI now minus OI at the previous close (the chain's own previous_oi).
  * Fastest building and unwinding strikes each side: the largest rises and falls of the 15-minute change.
  * The heat map: the change between consecutive snapshots, strike by time, for the last HEAT_POINTS snapshots.
A rise in OI means new positions were opened at that strike, a fall that positions were closed; the numbers do not say who opened them or why,
and nothing here says what to do.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Dict, List, Optional, Tuple

import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from ..auth.service import Ctx
from .access import lab_ctx

router = APIRouter()

UNDERLYINGS = ("NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX")
SERIES_KEY = "lab:oi:series:"         # + underlying + ":" + trade day (ISO): one JSON entry per snapshot
SERIES_TTL = 4 * 86400
WINDOW = 20                            # strikes kept either side of ATM
SHOW = 10                              # strikes shown either side of ATM
HEAT_POINTS = 40                       # snapshots in the heat map (about two hours at 3 minutes)
WINDOWS = (("m15", 15), ("m60", 60))
TOP = 3
NO_STORE = {"Cache-Control": "no-store"}
U_RE = re.compile(r"^[A-Z0-9&_\-]{1,24}$")


# ------------------------------------------------------------------------------------------------------------------ pure parts

def snapshot(body: dict, at: str, expiry: str) -> Optional[dict]:
    """One stored point from a summarised chain (options.summarize): time, expiry, spot, ATM and {strike: [call OI, put OI]} near ATM."""
    rows = body.get("rows") or []
    atm = body.get("atm")
    if not rows or atm is None:
        return None
    strikes = [r["strike"] for r in rows]
    i = min(range(len(strikes)), key=lambda j: abs(strikes[j] - atm))
    keep = rows[max(0, i - WINDOW): i + WINDOW + 1]
    oi = {}
    for r in keep:
        ce, pe = r.get("ce") or {}, r.get("pe") or {}
        oi[_k(r["strike"])] = [ce.get("oi"), pe.get("oi"), ce.get("prevOi"), pe.get("prevOi")]
    return {"t": at, "expiry": expiry, "spot": body.get("spot"), "atm": atm, "oi": oi}


def _k(strike: float) -> str:
    return f"{strike:.2f}".rstrip("0").rstrip(".")


def _mins(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _diff(a: Optional[int], b: Optional[int]) -> Optional[int]:
    return None if a is None or b is None else a - b


def _before(points: List[dict], minutes: int) -> Optional[dict]:
    """The latest snapshot at or before `minutes` before the last one, from the same expiry."""
    last = points[-1]
    cut = _mins(last["t"]) - minutes
    for p in reversed(points[:-1]):
        if p["expiry"] == last["expiry"] and _mins(p["t"]) <= cut:
            return p
    return None


def flow(points: List[dict]) -> dict:
    """Everything the OI Flow view draws, from one underlying's snapshots of a day (oldest first)."""
    if not points:
        return {"available": False, "detail": "No snapshot yet today: the first is taken at 09:15 and then every 3 minutes."}
    last = points[-1]
    same = [p for p in points if p["expiry"] == last["expiry"]]
    ref = {name: _before(same, m) for name, m in WINDOWS}
    gap = {name: (None if p is None else _mins(last["t"]) - _mins(p["t"])) for name, p in ref.items()}
    keys = sorted(last["oi"], key=float)
    atm = last["atm"]
    i = min(range(len(keys)), key=lambda j: abs(float(keys[j]) - atm)) if keys else 0
    shown = keys[max(0, i - SHOW): i + SHOW + 1]

    def side(k: str, s: int) -> dict:
        now = last["oi"][k]
        out = {"oi": now[s], "day": _diff(now[s], now[s + 2])}
        for name, p in ref.items():
            out[name] = _diff(now[s], (p["oi"].get(k) or [None] * 4)[s]) if p else None
        return out

    strikes = [{"strike": float(k), "atm": float(k) == atm, "ce": side(k, 0), "pe": side(k, 1)} for k in shown]

    def movers(s: str) -> dict:
        vals = [(r["strike"], r[s]["m15"]) for r in strikes if r[s]["m15"] is not None]
        return {"build": [{"strike": k, "change": v} for k, v in sorted(vals, key=lambda x: -x[1])[:TOP] if v > 0],
                "unwind": [{"strike": k, "change": v} for k, v in sorted(vals, key=lambda x: x[1])[:TOP] if v < 0]}

    def total(s: str, f: str) -> Optional[int]:
        vals = [r[s][f] for r in strikes if r[s][f] is not None]
        return sum(vals) if vals else None

    heat_pts = same[-(HEAT_POINTS + 1):]
    heat = {"times": [p["t"] for p in heat_pts[1:]], "strikes": [float(k) for k in shown], "ce": [], "pe": []}
    for s, name in ((0, "ce"), (1, "pe")):
        for k in shown:
            row = []
            for a, b in zip(heat_pts[:-1], heat_pts[1:]):
                row.append(_diff((b["oi"].get(k) or [None] * 4)[s], (a["oi"].get(k) or [None] * 4)[s]))
            heat[name].append(row)
    return {
        "available": True, "expiry": last["expiry"], "spot": last["spot"], "atm": atm, "asOf": last["t"],
        "firstAt": same[0]["t"], "snapshots": len(same), "gapMinutes": gap,
        "strikes": strikes, "movers": {"ce": movers("ce"), "pe": movers("pe")},
        "totals": {s: {f: total(s, f) for f in ("m15", "m60", "day")} for s in ("ce", "pe")},
        "heat": heat,
    }


# ------------------------------------------------------------------------------------------------------------------ job

async def refresh(store, settings, now: Optional[datetime] = None) -> dict:
    """The lab-oi-flow job: one snapshot of each index's nearest-expiry chain, through the site's cached and paced chain fetch."""
    from .. import options
    now = options._ist(now)
    if not options.live_window(now):
        return {"status": "ok", "skipped": "market closed", "taken": 0}
    app = SimpleNamespace(state=SimpleNamespace(settings=settings, store=store))
    day, at = now.date().isoformat(), now.strftime("%H:%M")
    taken, skipped, failed = [], [], []
    for u in UNDERLYINGS:
        try:
            und = await options.resolve(store, u)
            exp_entry, _ = await options._expiries(app, und)
            exps = [e for e in exp_entry["body"]["expiries"] if e >= day]
            if not exps:
                skipped.append(u)
                continue
            expiry, seg = exps[0], exp_entry["body"]["segment"]

            async def fetch(und=und, expiry=expiry, seg=seg) -> dict:
                return options.summarize(await options._ask(app, "/optionchain", {"UnderlyingScrip": und["securityId"], "UnderlyingSeg": seg, "Expiry": expiry}))

            entry, _ = await options.cached(app, f"oc:chain:{und['key']}:{expiry}", options.chain_fresh, fetch)
            snap = snapshot(entry["body"], at, expiry)
            if snap is None:
                skipped.append(u)
                continue
            key = f"{SERIES_KEY}{u}:{day}"
            last = await store.redis.lindex(key, -1)
            if last is not None and orjson.loads(last).get("t") == at:
                skipped.append(u)          # this minute is already stored (a re-run inside the same minute)
                continue
            await store.redis.rpush(key, orjson.dumps(snap))
            await store.redis.expire(key, SERIES_TTL)
            taken.append(u)
        except options.Busy:
            skipped.append(u)              # the site's chain turns are taken: next run
        except Exception as e:             # one index failing never stops the others
            failed.append(f"{u}: {type(e).__name__}")
    status = "ok" if taken or not failed else "failed"
    return {"status": status, "taken": len(taken), "skipped": skipped, "failed": failed, "at": at}


# ------------------------------------------------------------------------------------------------------------------ route

async def points_for(redis, u: str, day: str) -> List[dict]:
    return [orjson.loads(p) for p in await redis.lrange(f"{SERIES_KEY}{u}:{day}", 0, -1)]


@router.get("/api/lab/oiflow/{u}")
async def oi_flow(request: Request, u: str, _ctx: Ctx = Depends(lab_ctx)):
    from .. import options
    key = u.strip().upper()
    if not U_RE.match(key) or key not in UNDERLYINGS:
        return JSONResponse({"status": "unknown_underlying", "detail": f"OI Flow covers {', '.join(UNDERLYINGS)}."}, status_code=404, headers=NO_STORE)
    redis = request.app.state.store.redis
    today = options._ist()
    pts: List[dict] = []
    day = today.date()
    for _ in range(6):                      # today, else the latest earlier session still kept
        pts = await points_for(redis, key, day.isoformat())
        if pts:
            break
        day -= timedelta(days=1)
    out = {"status": "ok", "underlying": key, "session": day.isoformat() if pts else None,
           "today": bool(pts) and day == today.date(), "marketOpen": options.market_open(today), **flow(pts)}
    return Response(content=orjson.dumps(out), media_type="application/json", headers=NO_STORE)
