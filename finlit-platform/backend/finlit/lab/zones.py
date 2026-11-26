"""Trading Lab, Stock zones (docs/TRADING-LAB.md "Stock zones").

For one stock, from its 5-minute candles of the last five sessions (intraday.load "5D": the same Dhan call, Redis copy and pacing as the
stock page's 5D chart), the price areas the latest session is trading around. Every area is a fact of past prices, worked out by a fixed rule:

  * Previous day      the previous session's high, low and close.
  * Opening range     the high and low of the latest session's first 15 minutes (09:15 to 09:30, three 5-minute candles).
  * VWAP              the latest session's volume-weighted average of each candle's typical price (high + low + close) / 3.
  * Pivots            classic floor pivots from the previous session: P = (H + L + C) / 3, R1 = 2P - L, S1 = 2P - H, R2 = P + (H - L),
                      S2 = P - (H - L).
  * Fair-value gap    three candles where the third's low is above the first's high (a gap left by a rise) or its high below the first's
                      low (left by a fall), at least 0.1% of the price wide. "open" until a later candle trades into it, "part filled" once
                      one does, "filled" once price has crossed it.
  * Order block       the last candle against the move (a falling candle before a rise, a rising one before a fall) when, within the next
                      three candles, price closes beyond that candle by at least twice the average range of the 20 candles up to it. Its high to low is the
                      block. "untested" until a later candle trades back into it, then "tested", and "broken" once a candle closes
                      through its far side.

Nothing here says what to do: the areas are drawn and described, never called good or bad. A value the candles cannot give is null.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Dict, List, Optional

import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from ..auth.service import Ctx
from .access import lab_ctx

router = APIRouter()

SYMBOL = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
NO_STORE = {"Cache-Control": "no-store"}
GAP_MIN = 0.001          # a fair-value gap narrower than 0.1% of the price is noise
IMPULSE = 2.0            # an order block's move: a close at least this many average candle ranges beyond the block
LOOKAHEAD = 3            # ... within this many candles
AVG_OVER = 20            # the average candle range: the 20 candles up to the block (from the fifth candle on)
KEEP_ZONES = 6           # per kind and side: the latest ones
SHOW_SESSIONS = 2        # the chart: the latest two sessions


def _r(v: Optional[float]) -> Optional[float]:
    return None if v is None else round(v, 2)


def candles(series: Dict[str, list]) -> List[dict]:
    """The stored intraday series (intraday.shape) as candles, oldest first; candles with a missing price are dropped."""
    out = []
    for i, t in enumerate(series.get("t") or []):
        try:
            o, h, l, c = (float(series[k][i]) for k in "ohlc")
        except (TypeError, ValueError, IndexError, KeyError):
            continue
        v = series.get("v") or []
        out.append({"t": t, "day": t[:10], "o": o, "h": max(h, o, c), "l": min(l, o, c), "c": c, "v": float(v[i] or 0) if i < len(v) else 0.0})
    return out


def pivots(h: float, l: float, c: float) -> Dict[str, float]:
    p = (h + l + c) / 3
    return {"P": p, "R1": 2 * p - l, "S1": 2 * p - h, "R2": p + (h - l), "S2": p - (h - l)}


def vwap(day: List[dict]) -> List[Optional[float]]:
    """The running VWAP after each candle of one session (None until volume has traded)."""
    out, pv, vol = [], 0.0, 0.0
    for k in day:
        pv += (k["h"] + k["l"] + k["c"]) / 3 * k["v"]
        vol += k["v"]
        out.append(pv / vol if vol > 0 else None)
    return out


def fair_value_gaps(cs: List[dict]) -> List[dict]:
    gaps = []
    for i in range(2, len(cs)):
        a, c = cs[i - 2], cs[i]
        if c["l"] > a["h"] and (c["l"] - a["h"]) >= GAP_MIN * c["c"]:
            gaps.append({"kind": "fvg", "side": "up", "lo": a["h"], "hi": c["l"], "i": i - 1})
        elif c["h"] < a["l"] and (a["l"] - c["h"]) >= GAP_MIN * c["c"]:
            gaps.append({"kind": "fvg", "side": "down", "lo": c["h"], "hi": a["l"], "i": i - 1})
    for g in gaps:
        later = cs[g["i"] + 2:]
        if g["side"] == "up":
            touched = [k for k in later if k["l"] < g["hi"]]
            g["status"] = "filled" if any(k["l"] <= g["lo"] for k in later) else "part filled" if touched else "open"
        else:
            touched = [k for k in later if k["h"] > g["lo"]]
            g["status"] = "filled" if any(k["h"] >= g["hi"] for k in later) else "part filled" if touched else "open"
        g["touches"] = len(touched)
    return gaps


def order_blocks(cs: List[dict]) -> List[dict]:
    if len(cs) < 5:
        return []
    blocks = []
    for i in range(4, len(cs) - 1):
        k, nxt = cs[i], cs[i + 1:i + 1 + LOOKAHEAD]
        before = cs[max(0, i - AVG_OVER):i + 1]                      # the average range up to the block, so later candles never change it
        avg = sum(c["h"] - c["l"] for c in before) / len(before) or 1e-9
        if k["c"] < k["o"] and nxt[0]["c"] > nxt[0]["o"] and max(n["c"] for n in nxt) - k["h"] >= IMPULSE * avg:
            blocks.append({"kind": "ob", "side": "up", "lo": k["l"], "hi": k["h"], "i": i,
                           "move": max(n["c"] for n in nxt) - k["h"], "avg": avg})
        elif k["c"] > k["o"] and nxt[0]["c"] < nxt[0]["o"] and k["l"] - min(n["c"] for n in nxt) >= IMPULSE * avg:
            blocks.append({"kind": "ob", "side": "down", "lo": k["l"], "hi": k["h"], "i": i,
                           "move": k["l"] - min(n["c"] for n in nxt), "avg": avg})
    for b in blocks:
        later = cs[b["i"] + 1 + LOOKAHEAD:]
        if b["side"] == "up":
            touched = [k for k in later if k["l"] <= b["hi"]]
            broken = any(k["c"] < b["lo"] for k in later)
        else:
            touched = [k for k in later if k["h"] >= b["lo"]]
            broken = any(k["c"] > b["hi"] for k in later)
        b["status"] = "broken" if broken else "tested" if touched else "untested"
        b["touches"] = len(touched)
        b["moveAvg"] = round(b.pop("move") / b.pop("avg"), 1)
    return blocks


def _latest(items: List[dict]) -> List[dict]:
    out = []
    for side in ("up", "down"):
        out += sorted((z for z in items if z["side"] == side), key=lambda z: -z["i"])[:KEEP_ZONES]
    return sorted(out, key=lambda z: z["i"])


def zones(series: Dict[str, list]) -> dict:
    """Everything the Stock zones tab draws, from one stored 5D intraday answer's series."""
    cs = candles(series)
    days = sorted({k["day"] for k in cs})
    if not days:
        return {"available": False, "detail": "No candles in the last five sessions."}
    today = [k for k in cs if k["day"] == days[-1]]
    prev = [k for k in cs if k["day"] == days[-2]] if len(days) > 1 else []
    show_days = set(days[-SHOW_SESSIONS:])
    first = next(i for i, k in enumerate(cs) if k["day"] in show_days)
    shown = cs[first:]
    vw = vwap(today)
    last = today[-1]["c"]

    levels: List[dict] = []
    def lvl(key: str, label: str, price: Optional[float], group: str, note: str) -> None:
        if price is not None:
            levels.append({"key": key, "label": label, "price": _r(price), "group": group, "note": note})

    pv = None
    if prev:
        ph, pl, pc = max(k["h"] for k in prev), min(k["l"] for k in prev), prev[-1]["c"]
        lvl("PDH", "Previous day high", ph, "previous", f"The highest price of {days[-2]}.")
        lvl("PDL", "Previous day low", pl, "previous", f"The lowest price of {days[-2]}.")
        lvl("PDC", "Previous close", pc, "previous", f"The last 5-minute close of {days[-2]}.")
        pv = pivots(ph, pl, pc)
        for k, name in (("R2", "Pivot R2"), ("R1", "Pivot R1"), ("P", "Pivot P"), ("S1", "Pivot S1"), ("S2", "Pivot S2")):
            lvl(k, name, pv[k], "pivot", "A floor pivot from the previous session's high, low and close.")
    opening = today[:3]
    orh = orl = None
    if len(opening) == 3:
        orh, orl = max(k["h"] for k in opening), min(k["l"] for k in opening)
        lvl("ORH", "Opening range high", orh, "opening", "The highest price of the first 15 minutes.")
        lvl("ORL", "Opening range low", orl, "opening", "The lowest price of the first 15 minutes.")
    if vw[-1] is not None:
        lvl("VWAP", "VWAP", vw[-1], "vwap", "The session's volume-weighted average price so far.")

    found = [z for z in fair_value_gaps(cs) + order_blocks(cs) if z["i"] >= first]
    out_zones = []
    for z in _latest([z for z in found if z["kind"] == "ob"]) + _latest([z for z in found if z["kind"] == "fvg"]):
        k = cs[z["i"]]
        out_zones.append({"kind": z["kind"], "side": z["side"], "lo": _r(z["lo"]), "hi": _r(z["hi"]), "at": k["t"], "index": z["i"] - first,
                          "status": z["status"], "touches": z["touches"], "moveAvg": z.get("moveAvg"),
                          "distancePct": _r((((z["lo"] + z["hi"]) / 2) - last) / last * 100)})

    where = None
    if orh is not None and orl is not None:
        where = "above the opening range" if last > orh else "below the opening range" if last < orl else "inside the opening range"
    return {
        "available": True, "session": days[-1], "previousSession": days[-2] if prev else None, "interval": 5,
        "last": _r(last), "dayHigh": _r(max(k["h"] for k in today)), "dayLow": _r(min(k["l"] for k in today)),
        "changePct": _r((last - prev[-1]["c"]) / prev[-1]["c"] * 100) if prev else None,
        "vsVwap": None if vw[-1] is None else ("above" if last > vw[-1] else "below" if last < vw[-1] else "at"),
        "openingRange": where,
        "candles": {"t": [k["t"] for k in shown], "o": [k["o"] for k in shown], "h": [k["h"] for k in shown],
                    "l": [k["l"] for k in shown], "c": [k["c"] for k in shown], "v": [k["v"] for k in shown]},
        "vwap": [None] * (len(shown) - len(today)) + [_r(v) for v in vw],
        "levels": sorted(levels, key=lambda x: -x["price"]),
        "zones": out_zones,
    }


@router.get("/api/lab/zones/{symbol}")
async def stock_zones(request: Request, symbol: str, _ctx: Ctx = Depends(lab_ctx)):
    from .. import intraday
    sym = symbol.strip().upper()
    if not SYMBOL.match(sym):
        return JSONResponse({"status": "invalid_symbol"}, status_code=400, headers=NO_STORE)
    body, status, why = await intraday.load(request.app, sym, "5D")
    if body is None or status != 200 or not body.get("available"):
        detail = intraday.WHY.get(why, "Intraday prices are unavailable right now.") if body is None or status != 200 else body.get("detail")
        headers = {**NO_STORE, "Retry-After": "2"} if status in (202, 503) else NO_STORE
        return JSONResponse({"status": why or body.get("status") or "error", "symbol": sym, "detail": detail},
                            status_code=status if status != 200 else 404, headers=headers)
    z = zones(body.get("series") or {})
    out = {"status": "ok", "symbol": sym, "exchange": body.get("exchange"), "source": body.get("source"), "asOf": body.get("asOf"),
           "stale": bool(body.get("stale")), "phase": intraday.phase(intraday._now()), **z}
    if body.get("stale"):
        out["detail"] = intraday.STALE_NOTE.get(why, intraday.STALE_NOTE["source_down"])
    return Response(content=orjson.dumps(out), media_type="application/json", headers=NO_STORE)
