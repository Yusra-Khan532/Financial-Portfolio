"""Trading Lab, Order Flow engine (docs/TRADING-LAB.md "Order Flow", step 1).

Every few minutes in market hours (job `lab-flow`, command `refresh-lab-flow`) one Dhan quote call reads every NSE F&O stock and its current
and next futures contract (about 630 instruments, inside Dhan's 1,000 per call). From those numbers alone, and FinLit's stored daily prices,
it works out for each stock what the Order Flow page shows, and keeps the day's path of every stock so the page can draw the lines:

  * Change            the share's last price against its previous close (Dhan's quote), in per cent.
  * Open interest     the sum over the current and next futures contract, so the monthly roll does not read as positions closing.
    OI change         against the same contracts' open interest at the previous session's close (stored by this engine every snapshot, the
                      last one of a day being the close; a contract with no earlier day is filled once from Dhan's daily history).
  * Build-up          options.buildup on the current contract's price change and the OI change: price up + OI up = long build-up,
                      price down + OI up = short build-up, price up + OI down = short covering, price down + OI down = long unwinding.
  * VWAP              the day's average traded price of the share (Dhan's average_price), kept only inside the day's low and high.
  * Pivots            classic floor pivots from the previous session's high, low and close in FinLit's daily prices:
                      P = (H + L + C) / 3, R1 = 2P - L, S1 = 2P - H, R2 = P + (H - L), S2 = P - (H - L). Used only when that close matches the
                      quote's previous close within 1% (otherwise the stored day is not the previous session and the levels would be wrong).
  * Zone              where the price sits among S2, S1, P, R1, R2.
  * Agreement         how many of five facts point the same way as the build-up: new positions behind the move (OI up), price on the move's
                      side of VWAP, price beyond R1 (up) or S1 (down), OI change of 5% or more, price in the top (up) or bottom (down) quarter
                      of the day's range. A count of facts, never a call.

A value the inputs cannot give is null with its reason in `notes`, never a guess. Nothing here tells anyone to trade; the signal tools that do
are separate and only for members whose signals switch is on (lab.access.signals_ctx).
"""
from __future__ import annotations

import logging
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

import orjson
from fastapi import APIRouter, Depends, Request

from ..auth.service import Ctx
from ..dhan import IST, DhanError, _f, to_quote
from ..options import TEST_SYMBOL, buildup
from .access import lab_ctx

log = logging.getLogger("finlit.lab.flow")
router = APIRouter()

LATEST_KEY = "lab:flow:latest"
SERIES_KEY = "lab:flow:series:"          # + trade day (ISO): one entry per snapshot, [HH:MM, {symbol: [change %, OI change %]}]
SERIES_TTL = 4 * 86400
KEEP_CONTRACTS = 2                       # current and next month
OI_KEEP_DAYS = 30
STRONG_OI_PCT = 5.0
PIVOT_MATCH = 0.01
BUILDUPS = ("long_buildup", "short_buildup", "short_covering", "long_unwinding")
UP = {"long_buildup", "short_covering"}
DOWN = {"short_buildup", "long_unwinding"}


# ------------------------------------------------------------------------------------------------------------------ contracts

class FutureCollector:
    """Keeps every NSE stock futures contract (FUTSTK) while dhan.parse_instruments streams the instrument file (its `on_row`)."""

    def __init__(self) -> None:
        self._by: Dict[str, Dict[str, Tuple[str, int]]] = defaultdict(dict)   # underlying -> expiry -> (security id, lot)

    def add(self, r: dict) -> None:
        if r.get("EXCH_ID") != "NSE" or r.get("SEGMENT") != "D" or r.get("INSTRUMENT") != "FUTSTK":
            return
        sym, sid, exp, lot = (r.get("UNDERLYING_SYMBOL") or "").strip(), (r.get("SECURITY_ID") or "").strip(), (r.get("SM_EXPIRY_DATE") or "").strip()[:10], _f(r.get("LOT_SIZE"))
        if not sym or TEST_SYMBOL.match(sym) or not sid.isdigit() or len(exp) != 10 or not lot or lot <= 0:
            return
        self._by[sym][exp] = (sid, int(lot))

    def rows(self, today: Optional[date] = None) -> List[dict]:
        today = today or datetime.now(IST).date()
        out = []
        for sym, by_exp in self._by.items():
            live = sorted(e for e in by_exp if e >= today.isoformat())[:KEEP_CONTRACTS]
            for e in live:
                sid, lot = by_exp[e]
                out.append({"security_id": sid, "underlying": sym, "expiry": date.fromisoformat(e), "lot_size": lot})
        return out


async def save_futures(store, rows: List[dict]) -> int:
    """Replace the table in one transaction; a short list (a broken download) keeps what is stored."""
    if len(rows) < 100:
        raise DhanError(f"stock futures look incomplete ({len(rows)}); kept what was stored")
    async with store.pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM fno_futures")
            await conn.executemany("INSERT INTO fno_futures (security_id, underlying, expiry, lot_size) VALUES ($1, $2, $3, $4)",
                                   [(r["security_id"], r["underlying"], r["expiry"], r["lot_size"]) for r in rows])
    return len(rows)


# ------------------------------------------------------------------------------------------------------------------ pure calculations

def pivots(high: Optional[float], low: Optional[float], close: Optional[float]) -> Optional[dict]:
    """Classic floor pivots from one session's high, low and close; None when any is missing or they do not make a session."""
    if not high or not low or not close or high < low or not (low <= close <= high):
        return None
    p = (high + low + close) / 3
    rng = high - low
    return {"p": round(p, 2), "r1": round(2 * p - low, 2), "s1": round(2 * p - high, 2), "r2": round(p + rng, 2), "s2": round(p - rng, 2)}


def zone(price: Optional[float], pv: Optional[dict]) -> Optional[str]:
    """above_r2 | r1_r2 | p_r1 | s1_p | s2_s1 | below_s2 (a price exactly on a level counts as above it)."""
    if price is None or not pv:
        return None
    if price >= pv["r2"]:
        return "above_r2"
    if price >= pv["r1"]:
        return "r1_r2"
    if price >= pv["p"]:
        return "p_r1"
    if price >= pv["s1"]:
        return "s1_p"
    if price >= pv["s2"]:
        return "s2_s1"
    return "below_s2"


def direction(build: Optional[str], change: Optional[float]) -> int:
    """+1 up, -1 down, 0 flat or unknown: the build-up when there is one, otherwise the sign of the price change."""
    if build in UP:
        return 1
    if build in DOWN:
        return -1
    if change:
        return 1 if change > 0 else -1
    return 0


def agreement(d: int, build: Optional[str], price: Optional[float], vwap: Optional[float], pv: Optional[dict], oi_pct: Optional[float],
              low: Optional[float], high: Optional[float]) -> dict:
    """The five facts, each True, False or None (unknown), and how many are True. Unknown facts count as not met and are named."""
    if d == 0 or price is None:
        return {"score": 0, "of": 5, "facts": {}}
    facts: Dict[str, Optional[bool]] = {
        "newPositions": None if build is None else build in ("long_buildup", "short_buildup"),
        "vwapSide": None if vwap is None else (price > vwap if d > 0 else price < vwap),
        "pastLevel": None if not pv else (price > pv["r1"] if d > 0 else price < pv["s1"]),
        "strongOi": None if oi_pct is None else abs(oi_pct) >= STRONG_OI_PCT,
        "rangeEnd": None if not low or not high or high <= low else ((price - low) / (high - low) >= 0.75 if d > 0 else (price - low) / (high - low) <= 0.25),
    }
    return {"score": sum(1 for v in facts.values() if v), "of": 5, "facts": facts}


def stock_row(symbol: str, eq: dict, futs: List[Tuple[dict, Optional[int]]], hlc: Optional[dict], meta: dict) -> Optional[dict]:
    """One stock's figures. `eq` is the share's raw quote; `futs` the (raw quote, previous close OI) of its contracts, current first;
    `hlc` the previous session {day, high, low, close} from FinLit's daily prices; `meta` {name, sector, industry, lot}."""
    q = to_quote(eq)
    if not q:
        return None
    notes: List[str] = []
    price, change_pct = q["price"], q.get("changePct")
    vwap = _f(eq.get("average_price"))
    if vwap is not None and not (q.get("low") and q.get("high") and q["low"] <= vwap <= q["high"]):
        vwap = None
    if vwap is None:
        notes.append("vwap: Dhan sent no average price inside the day's range")

    oi = prev = 0
    oi_known = False
    fut_change = None
    for i, (raw, prev_oi) in enumerate(futs):
        now = raw.get("oi")
        now = int(now) if isinstance(now, (int, float)) and now >= 0 else None
        if i == 0:
            fq = to_quote(raw)
            fut_change = fq.get("change") if fq else None
        if now is None or prev_oi is None:
            continue
        oi, prev, oi_known = oi + now, prev + prev_oi, True
    if not futs:
        notes.append("oi: no futures contract in the instrument file")
    elif not oi_known:
        notes.append("oi: the previous session's open interest is not stored yet")
    oi_change = oi - prev if oi_known else None
    oi_pct = round(oi_change / prev * 100, 2) if oi_known and prev > 0 else None
    build = buildup(fut_change if fut_change is not None else q.get("change"), oi_change)

    pv = None
    if hlc and hlc.get("close") and q.get("previousClose"):
        if abs(float(hlc["close"]) / q["previousClose"] - 1) <= PIVOT_MATCH:
            pv = pivots(_f(hlc.get("high")), _f(hlc.get("low")), _f(hlc.get("close")))
        else:
            notes.append(f"pivots: the stored day {hlc.get('day')} is not the previous session yet")
    elif not hlc:
        notes.append("pivots: no previous session in FinLit's daily prices")
    d = direction(build, q.get("change"))
    agree = agreement(d, build, price, vwap, pv, oi_pct, q.get("low"), q.get("high"))
    return {
        "symbol": symbol, "name": meta.get("name") or symbol, "sector": meta.get("sector") or None, "industry": meta.get("industry") or None,
        "lot": meta.get("lot"), "price": price, "previousClose": q.get("previousClose"), "change": q.get("change"), "changePct": change_pct,
        "open": q.get("open"), "high": q.get("high"), "low": q.get("low"), "volume": q.get("volume"),
        "vwap": round(vwap, 2) if vwap is not None else None,
        "vwapGapPct": round((price - vwap) / vwap * 100, 2) if vwap else None,
        "oi": oi if oi_known else None, "oiChange": oi_change, "oiChangePct": oi_pct, "buildup": build, "direction": d,
        "pivots": pv, "pivotsFrom": (hlc or {}).get("day") if pv else None, "zone": zone(price, pv),
        "agreement": agree, "asOf": q.get("asOf"), "notes": notes,
    }


def rank(rows: List[dict]) -> List[dict]:
    """Ordered by agreement (most facts first), then by the size of the OI change, then by the size of the move: the order the page lists them in."""
    return sorted(rows, key=lambda r: (-r["agreement"]["score"], -abs(r["oiChangePct"] or 0), -abs(r["changePct"] or 0), r["symbol"]))


def distribution(changes: Iterable[float], edges: Tuple[float, ...] = (-5, -3, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 5)) -> List[dict]:
    """How many stocks fall in each band of the day's change: below -5%, -5 to -3, ..., above 5%. A change of exactly 0 counts in 0 to 0.5."""
    bands = [(None, edges[0])] + list(zip(edges, edges[1:])) + [(edges[-1], None)]
    counts = [0] * len(bands)
    for c in changes:
        for i, (lo, hi) in enumerate(bands):
            if (lo is None or c >= lo) and (hi is None or c < hi):
                counts[i] += 1
                break
    return [{"from": lo, "to": hi, "count": n} for (lo, hi), n in zip(bands, counts)]


def summarize(rows: List[dict]) -> dict:
    """Market breadth over the F&O stocks, the build-up counts, and each sector's roll-up (stocks, average change, up/down, build-ups, OI change)."""
    ch = [r["changePct"] for r in rows if r["changePct"] is not None]
    builds = Counter(r["buildup"] for r in rows if r["buildup"])
    sectors: Dict[str, dict] = {}
    for r in rows:
        s = sectors.setdefault(r["sector"] or "Other", {"sector": r["sector"] or "Other", "stocks": 0, "up": 0, "down": 0, "changes": [], "oiChange": 0,
                                                       "oiKnown": 0, "buildups": Counter(), "symbols": []})
        s["stocks"] += 1
        s["symbols"].append(r["symbol"])
        if r["changePct"] is not None:
            s["changes"].append(r["changePct"])
            if r["changePct"] > 0:
                s["up"] += 1
            elif r["changePct"] < 0:
                s["down"] += 1
        if r["oiChange"] is not None:
            s["oiChange"] += r["oiChange"]
            s["oiKnown"] += 1
        if r["buildup"]:
            s["buildups"][r["buildup"]] += 1
    out = []
    for s in sectors.values():
        avg = round(sum(s["changes"]) / len(s["changes"]), 2) if s["changes"] else None
        out.append({"sector": s["sector"], "stocks": s["stocks"], "up": s["up"], "down": s["down"], "avgChangePct": avg,
                    "buildups": {b: s["buildups"].get(b, 0) for b in BUILDUPS},
                    "oiChange": s["oiChange"] if s["oiKnown"] else None, "symbols": s["symbols"]})
    out.sort(key=lambda s: (-(s["avgChangePct"] or 0), s["sector"]))
    up, down = sum(1 for c in ch if c > 0), sum(1 for c in ch if c < 0)
    return {"stocks": len(rows), "up": up, "down": down, "flat": len(ch) - up - down,
            "medianChangePct": round(sorted(ch)[len(ch) // 2], 2) if ch else None,
            "buildups": {b: builds.get(b, 0) for b in BUILDUPS}, "distribution": distribution(ch), "sectors": out}


def trade_day(rows: List[dict], fallback: date) -> date:
    """The session the quotes belong to: the most common date of the shares' last trade (a holiday or the weekend shows the last session)."""
    days = Counter(r["asOf"][:10] for r in rows if r.get("asOf"))
    return date.fromisoformat(days.most_common(1)[0][0]) if days else fallback


# ------------------------------------------------------------------------------------------------------------------ the job

async def _universe(store) -> Tuple[Dict[str, dict], Dict[str, List[dict]]]:
    """Every F&O share with its Dhan id, name, sector and lot; and its futures contracts, current first."""
    async with store.pool.acquire() as conn:
        eq = await conn.fetch(
            "SELECT DISTINCT ON (d.symbol) d.symbol, d.security_id, d.lot_size, COALESCE(c.name, d.name) AS name, c.sector, c.industry "
            "FROM dhan_instruments d LEFT JOIN companies c ON c.nse_code = d.symbol AND c.nse_code <> '' "
            "WHERE d.exch = 'NSE' AND d.fno ORDER BY d.symbol, c.symbol")
        fut = await conn.fetch("SELECT security_id, underlying, expiry, lot_size FROM fno_futures WHERE expiry >= (now() AT TIME ZONE 'Asia/Kolkata')::date "
                               "ORDER BY underlying, expiry")
    shares = {r["symbol"]: dict(r) for r in eq if r["security_id"].isdigit() and not TEST_SYMBOL.match(r["symbol"])}
    futures: Dict[str, List[dict]] = defaultdict(list)
    for r in fut:
        if r["underlying"] in shares:
            futures[r["underlying"]].append(dict(r))
    return shares, futures


async def _previous_oi(store, ids: List[str], day: date) -> Dict[str, int]:
    async with store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT DISTINCT ON (security_id) security_id, oi FROM fno_oi_daily WHERE security_id = ANY($1) AND day < $2 "
                                "ORDER BY security_id, day DESC", ids, day)
    return {r["security_id"]: int(r["oi"]) for r in rows}


async def _previous_hlc(store, symbols: List[str], day: date) -> Dict[str, dict]:
    async with store.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT ON (c.nse_code) c.nse_code, p.day, p.high, p.low, p.close FROM companies c JOIN price_daily p ON p.symbol = c.symbol "
            "WHERE c.nse_code = ANY($1) AND p.day < $2 AND p.day > $2 - 10 ORDER BY c.nse_code, p.day DESC", symbols, day)
    return {r["nse_code"]: {"day": r["day"].isoformat(), "high": float(r["high"]) if r["high"] is not None else None,
                            "low": float(r["low"]) if r["low"] is not None else None, "close": float(r["close"])} for r in rows}


async def _fill_history(client, missing: List[str], day: date, deadline: float) -> Dict[str, Tuple[date, int, Optional[float]]]:
    """The last daily open interest before `day` of each contract that has none stored, from Dhan's daily history, until the deadline."""
    out: Dict[str, Tuple[date, int, Optional[float]]] = {}
    for sid in missing:
        if time.monotonic() > deadline:
            break
        try:
            bars = await client.daily(sid, "NSE_FNO", day - timedelta(days=12), day, instrument="FUTSTK", oi=True)
        except DhanError as e:
            log.info("lab-flow: history for %s: %s", sid, e)
            continue
        past = [b for b in bars if b["day"] < day and isinstance(b.get("oi"), (int, float)) and b["oi"] >= 0]
        if past:
            b = past[-1]
            out[sid] = (b["day"], int(b["oi"]), _f(b.get("close")))
    return out


async def refresh(store, client, now: Optional[datetime] = None, history_seconds: float = 90.0) -> dict:
    """One snapshot: quotes, previous OI (filled from history where missing), figures, then Redis (latest + the day's series) and today's OI rows."""
    now = now or datetime.now(IST)
    shares, futures = await _universe(store)
    if not shares:
        return {"status": "failed", "error": "no F&O shares in the instrument table (refresh-instruments has not run)"}
    ids = [("NSE_EQ", s["security_id"]) for s in shares.values()] + [("NSE_FNO", f["security_id"]) for fs in futures.values() for f in fs[:KEEP_CONTRACTS]]
    raw = await client.quotes(ids)
    eq_rows = {sym: raw.get(("NSE_EQ", s["security_id"])) or {} for sym, s in shares.items()}
    day = trade_day([{"asOf": to_quote(r).get("asOf")} for r in eq_rows.values() if r], now.date())

    fut_ids = [f["security_id"] for fs in futures.values() for f in fs[:KEEP_CONTRACTS]]
    prev = await _previous_oi(store, fut_ids, day)
    missing = [sid for sid in fut_ids if sid not in prev]
    filled = await _fill_history(client, missing, day, time.monotonic() + history_seconds) if missing else {}
    hlc = await _previous_hlc(store, list(shares), day)

    rows: List[dict] = []
    for sym, s in shares.items():
        futs = [(raw.get(("NSE_FNO", f["security_id"])) or {}, prev.get(f["security_id"], filled.get(f["security_id"], (None, None))[1]))
                for f in futures.get(sym, [])[:KEEP_CONTRACTS]]
        row = stock_row(sym, eq_rows[sym], futs, hlc.get(sym), {"name": s["name"], "sector": s["sector"], "industry": s["industry"], "lot": s["lot_size"]})
        if row:
            rows.append(row)
    rows = rank(rows)

    today_oi = []
    for sid in fut_ids:
        r = raw.get(("NSE_FNO", sid)) or {}
        o, at = r.get("oi"), to_quote(r).get("asOf")
        if isinstance(o, (int, float)) and o >= 0 and at and at[:10] == day.isoformat():
            today_oi.append((sid, day, int(o), _f(r.get("last_price")), "quote"))
    hist_rows = [(sid, d, o, c, "history") for sid, (d, o, c) in filled.items()]
    async with store.pool.acquire() as conn:
        async with conn.transaction():
            if hist_rows:
                await conn.executemany("INSERT INTO fno_oi_daily (security_id, day, oi, close, source) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING", hist_rows)
            if today_oi:
                await conn.executemany("INSERT INTO fno_oi_daily (security_id, day, oi, close, source) VALUES ($1, $2, $3, $4, $5) "
                                       "ON CONFLICT (security_id, day) DO UPDATE SET oi = EXCLUDED.oi, close = EXCLUDED.close, source = 'quote'", today_oi)
            await conn.execute("DELETE FROM fno_oi_daily WHERE day < $1", day - timedelta(days=OI_KEEP_DAYS))

    still = len(missing) - len(filled)
    snap = {"tradeDay": day.isoformat(), "takenAt": now.isoformat(), "summary": summarize(rows), "stocks": rows,
            "notes": ([f"Open interest change is still loading for {still} futures contracts; it fills in over the next few snapshots."] if still > 0 else [])}
    stamp = (to_quote(next(iter(r for r in eq_rows.values() if r), {})).get("asOf") or now.isoformat())[11:16] or now.strftime("%H:%M")
    point = [now.strftime("%H:%M") if day == now.date() else stamp, {r["symbol"]: [r["changePct"], r["oiChangePct"]] for r in rows}]
    key = SERIES_KEY + day.isoformat()
    last = await store.redis.lindex(key, -1)
    if last is None or orjson.loads(last)[0] != point[0]:
        await store.redis.rpush(key, orjson.dumps(point))
    await store.redis.expire(key, SERIES_TTL)
    await store.redis.set(LATEST_KEY, orjson.dumps(snap))
    return {"status": "ok", "tradeDay": day.isoformat(), "stocks": len(rows), "withOi": sum(1 for r in rows if r["oi"] is not None),
            "withPivots": sum(1 for r in rows if r["pivots"]), "historyFilled": len(filled), "historyStillMissing": max(still, 0)}


# ------------------------------------------------------------------------------------------------------------------ API

def lines(points: List[list], limit: int = 130) -> dict:
    """The day's path of every stock for the page's lines: the snapshot times, and per stock its change % at each (null where it was not
    quoted), thinned evenly to at most `limit` times (the first and the last always kept)."""
    if len(points) > limit:
        step = (len(points) - 1) / (limit - 1)
        points = [points[round(i * step)] for i in range(limit)]
    times = [p[0] for p in points]
    syms = sorted({s for _, m in points for s in m})
    return {"times": times, "change": {s: [(m.get(s) or [None])[0] for _, m in points] for s in syms}}


@router.get("/api/lab/flow")
async def flow(request: Request, ctx: Ctx = Depends(lab_ctx)) -> Dict[str, Any]:
    """The latest Order Flow snapshot and the day's lines; `ready: false` with the reason before the first snapshot."""
    redis = request.app.state.store.redis
    raw = await redis.get(LATEST_KEY)
    if not raw:
        return {"ready": False, "reason": "The first snapshot is taken in the next market session (every few minutes, 09:15 to 15:30 IST, weekdays)."}
    snap = orjson.loads(raw)
    pts = [orjson.loads(p) for p in await redis.lrange(SERIES_KEY + snap["tradeDay"], 0, -1)]
    return {"ready": True, **snap, "lines": lines(pts)}
