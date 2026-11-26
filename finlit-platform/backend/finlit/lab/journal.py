"""Trading Lab > Trading journal (docs/TRADING-LAB.md "Trading journal").

A Lab member's own record of their trades, by hand or from a CSV, and the numbers worked out from the closed ones. Private: every query is
filtered by the signed-in member's id; nobody else, administrators included, reads it through these routes. Records only: nothing here suggests
a trade.

Routes (Lab members only, lab.access.lab_ctx; writes need the session's CSRF token like every write on the site):
  GET    /api/lab/journal              the member's trades (newest first) and the stats
  POST   /api/lab/journal              add one trade
  PUT    /api/lab/journal/{id}         change one trade (e.g. close it)
  DELETE /api/lab/journal/{id}         remove one trade
  POST   /api/lab/journal/import       add trades from CSV text: {csv}; returns how many were added and each rejected line with its reason

P&L of a closed trade: (exit - entry) x qty for a long, (entry - exit) x qty for a short, less fees. Stats are over closed trades in exit order:
net P&L, win rate (P&L > 0 counts as a win, < 0 as a loss, 0 as neither), profit factor (gross wins / gross losses), expectancy (net / trades),
average win and loss, the deepest drawdown of cumulative P&L from its running peak, best and worst day (by exit date, Indian time), the longest
and current run of wins or losses, P&L by setup, and the daily P&L for the calendar.

Reflection (docs/TRADING-LAB.md "Journal reflection"): every closed trade in the list answer carries `reflection`, two to four plain sentences
worked out on read by reflection(trade, nifty) below: no model, no call to any provider, nothing stored. It says what happened (side, symbol,
entry and exit price, time held, net P&L after the fees entered, return on the position), how Nifty 50 moved over the same period (its daily
closes from flows_index, code NIF50, which the flows job keeps for five years; one query per request), and whether a level the member wrote in
the setup or notes after "expected", "target" or "aim" was reached by the exit price. It describes; it never judges the trade or suggests one.
"""
from __future__ import annotations

import bisect
import csv
import io
import logging
import re
from collections import OrderedDict, defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Mapping, Optional, Tuple

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

from ..auth.routes import fail
from ..auth.service import Ctx
from ..dhan import IST
from .access import lab_ctx

router = APIRouter()
log = logging.getLogger("finlit.lab.journal")

MAX_TRADES = 5000           # per member
MAX_IMPORT = 2000           # rows per CSV
MAX_CSV = 512_000           # bytes


def _f(v: Any) -> Optional[float]:
    return None if v is None else float(v)


class Trade(BaseModel):
    symbol: str = Field(min_length=1, max_length=60)
    side: str = Field(pattern="^(long|short)$")
    qty: float = Field(gt=0, le=1e9)
    entryPrice: float = Field(gt=0, le=1e9)
    exitPrice: Optional[float] = Field(default=None, gt=0, le=1e9)
    entryAt: datetime
    exitAt: Optional[datetime] = None
    fees: float = Field(default=0, ge=0, le=1e9)
    setup: Optional[str] = Field(default=None, max_length=40)
    notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("symbol")
    @classmethod
    def _sym(cls, v: str) -> str:
        v = " ".join(v.split()).upper()
        if not v:
            raise ValueError("symbol is empty")
        return v

    @field_validator("setup", "notes")
    @classmethod
    def _blank(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None

    @field_validator("entryAt", "exitAt")
    @classmethod
    def _tz(cls, v: Optional[datetime]) -> Optional[datetime]:
        return None if v is None else (v.replace(tzinfo=IST) if v.tzinfo is None else v)     # a time without a zone is Indian time

    @model_validator(mode="after")
    def _closed(self) -> "Trade":
        if (self.exitPrice is None) != (self.exitAt is None):
            raise ValueError("A closed trade needs both its exit price and exit time; an open trade has neither.")
        if self.exitAt is not None and self.exitAt < self.entryAt:
            raise ValueError("The exit time is before the entry time.")
        return self


def pnl(t: Dict[str, Any]) -> Optional[float]:
    if t.get("exitPrice") is None:
        return None
    move = (t["exitPrice"] - t["entryPrice"]) if t["side"] == "long" else (t["entryPrice"] - t["exitPrice"])
    return round(move * t["qty"] - (t.get("fees") or 0), 2)


def stats(trades: List[Dict[str, Any]]) -> Dict[str, Any]:
    closed = sorted((t for t in trades if t.get("exitPrice") is not None), key=lambda t: (t["exitAt"], t["id"]))
    ps = [pnl(t) for t in closed]
    wins, losses = [p for p in ps if p > 0], [p for p in ps if p < 0]
    gw, gl = sum(wins), -sum(losses)
    cum, peak, dd, curve = 0.0, 0.0, 0.0, []
    for t, p in zip(closed, ps):
        cum += p
        peak = max(peak, cum)
        dd = min(dd, cum - peak)
        curve.append({"at": t["exitAt"], "cum": round(cum, 2), "dd": round(cum - peak, 2)})
    days: "OrderedDict[str, float]" = OrderedDict()
    for t, p in zip(closed, ps):
        d = datetime.fromisoformat(t["exitAt"]).astimezone(IST).date().isoformat()
        days[d] = round(days.get(d, 0.0) + p, 2)
    best_run = {"win": 0, "loss": 0}
    run, kind = 0, None
    for p in ps:
        k = "win" if p > 0 else "loss" if p < 0 else None
        if k is None:
            run, kind = 0, None
            continue
        run = run + 1 if k == kind else 1
        kind = k
        best_run[k] = max(best_run[k], run)
    by_setup: Dict[str, Dict[str, float]] = defaultdict(lambda: {"trades": 0, "net": 0.0, "wins": 0})
    for t, p in zip(closed, ps):
        s = by_setup[t.get("setup") or "No setup"]
        s["trades"] += 1
        s["net"] = round(s["net"] + p, 2)
        s["wins"] += 1 if p > 0 else 0
    n = len(closed)
    best_day = max(days.items(), key=lambda kv: kv[1]) if days else None
    worst_day = min(days.items(), key=lambda kv: kv[1]) if days else None
    return {
        "closed": n, "open": len(trades) - n, "net": round(sum(ps), 2), "fees": round(sum((t.get("fees") or 0) for t in closed), 2),
        "wins": len(wins), "losses": len(losses), "winRate": round(len(wins) / n * 100, 1) if n else None,
        "profitFactor": round(gw / gl, 2) if gl > 0 else None, "expectancy": round(sum(ps) / n, 2) if n else None,
        "avgWin": round(gw / len(wins), 2) if wins else None, "avgLoss": round(-gl / len(losses), 2) if losses else None,
        "largestWin": max(wins) if wins else None, "largestLoss": min(losses) if losses else None,
        "maxDrawdown": round(dd, 2),
        "bestDay": {"day": best_day[0], "net": best_day[1]} if best_day and best_day[1] > 0 else None,
        "worstDay": {"day": worst_day[0], "net": worst_day[1]} if worst_day and worst_day[1] < 0 else None,
        "longestWinRun": best_run["win"], "longestLossRun": best_run["loss"],
        "currentRun": {"kind": kind, "count": run} if kind else None,
        "curve": curve, "days": [{"day": d, "net": v} for d, v in days.items()],
        "setups": sorted(({"setup": k, **v} for k, v in by_setup.items()), key=lambda s: -s["net"]),
    }


# ---------------------------------------------------------------------------------------------------- reflection of a closed trade
NIFTY_CODE = "NIF50"                 # flows_index: Nifty 50 daily closes kept by the flows job (finlit/flows.py step_nifty), five years back
SESSION_CLOSE = time(15, 30)         # a daily close belongs to 15:30 Indian time of its day
NIFTY_GAP = timedelta(days=7)        # the close before the entry / after the exit must be this close to it (weekends and holidays), or it is "not stored"
NIFTY_NOT_STORED = "Nifty 50 data for that window is not stored, so its move over the same period is not shown."
NIFTY_INTRADAY = ("Nifty 50 data for that window is not stored: the site keeps Nifty 50's daily closes, not its prices inside a session, "
                  "so its move during this same-day trade is not shown.")
NO_ASSUMPTION = "No assumption was noted to check."
SEVERAL_LEVELS = "The setup and notes name more than one level, so no single noted level is checked."
# A noted level: a cue word, then at most 40 characters of words (no digits), then the number. Only these simple, explicit cases are read.
_CUE = re.compile(r"\b(?:expect(?:ed|ing|s)?|expectation|target(?:ed|ing|s)?|tgt|aim(?:ed|ing|s)?|looking for|look for)\b(?P<mid>[^0-9%\n]{0,40}?)"
                  r"(?P<num>[0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)(?![0-9.,]*\s*%)", re.I)
_ABOVE = re.compile(r"\b(?:above|over|beyond|past|higher|up to|rise to|rally to)\b", re.I)
_BELOW = re.compile(r"\b(?:below|under|beneath|lower|down to|fall to|drop to)\b", re.I)
_STOP = re.compile(r"\b(?:stop|sl|stoploss|stop-loss)\b", re.I)


def _group(n: int) -> str:
    """Indian digit grouping of a whole number: 140000 -> 1,40,000."""
    s = str(abs(n))
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    return ",".join(([head] if head else []) + parts + [tail])


def num_in(v: float) -> str:
    """1420 -> "1,420"; 1420.5 -> "1,420.50" (paise only when there are any)."""
    v = round(abs(v), 2)
    whole = int(v)
    paise = int(round((v - whole) * 100))
    if paise == 100:
        whole, paise = whole + 1, 0
    return _group(whole) + (f".{paise:02d}" if paise else "")


def rupees(v: float) -> str:
    return "₹" + num_in(v)


def signed_pct(v: float) -> str:
    return ("+" if v > 0 else "−" if v < 0 else "") + f"{abs(v):.2f}%"


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def held_for(entry: datetime, exit_: datetime) -> str:
    """Time between entry and exit: "45 minutes", "1 hour 30 minutes", "2 days 3 hours", "under a minute"."""
    m = int((exit_ - entry).total_seconds() // 60)
    if m < 1:
        return "under a minute"
    if m < 60:
        return _plural(m, "minute")
    if m < 24 * 60:
        h, mm = divmod(m, 60)
        return _plural(h, "hour") + (f" {_plural(mm, 'minute')}" if mm else "")
    d, rest = divmod(m, 24 * 60)
    h = rest // 60
    return _plural(d, "day") + (f" {_plural(h, 'hour')}" if h else "")


def _day_text(d: date) -> str:
    return f"{d.day} {d.strftime('%b')} {d.year}"


def nifty_window(entry: datetime, exit_: datetime, nifty: Mapping[date, float]) -> Dict[str, Any]:
    """Nifty 50 over the trade, from its daily closes: the last close at or before the entry to the first close at or after the exit.
    {"status": "intraday"} for a trade opened and closed on the same day (no stored prices inside a session), {"status": "missing"} when either
    close is not stored within NIFTY_GAP of the trade, else {"status": "ok", "from", "to", "fromClose", "toClose", "pct"}."""
    a, b = entry.astimezone(IST), exit_.astimezone(IST)
    if a.date() == b.date():
        return {"status": "intraday"}
    days = sorted(d for d, c in nifty.items() if c and c > 0)
    # the close of day d counts as "at or before" a moment on day d only from 15:30
    i = bisect.bisect_right(days, a.date() if a.time() >= SESSION_CLOSE else a.date() - timedelta(days=1)) - 1
    j = bisect.bisect_left(days, b.date() if b.time() <= SESSION_CLOSE else b.date() + timedelta(days=1))
    if i < 0 or j >= len(days):
        return {"status": "missing"}
    d0, d1 = days[i], days[j]
    if a.date() - d0 > NIFTY_GAP or d1 - b.date() > NIFTY_GAP or d1 <= d0:
        return {"status": "missing"}
    c0, c1 = float(nifty[d0]), float(nifty[d1])
    return {"status": "ok", "from": d0.isoformat(), "to": d1.isoformat(), "fromClose": round(c0, 2), "toClose": round(c1, 2),
            "pct": round((c1 / c0 - 1) * 100, 2)}


def noted_level(t: Dict[str, Any]) -> Dict[str, Any]:
    """A price level the member wrote after a cue word ("expected a move above 1,420", "target 1450") in the setup or notes, with the direction
    they wrote (above / below), or the trade's side when they wrote none. {"status": "none"} when there is no such level (or it is far from the
    entry price, so not a price), {"status": "several"} when different levels are written. Nothing else is read into the text."""
    found: List[Tuple[float, str, str]] = []
    entry = float(t["entryPrice"])
    for field in ("setup", "notes"):
        text = t.get(field) or ""
        for m in _CUE.finditer(text):
            mid = m.group("mid")
            if _STOP.search(mid):
                continue
            level = float(m.group("num").replace(",", ""))
            if not entry * 0.5 <= level <= entry * 2:
                continue
            way = "above" if _ABOVE.search(mid) else "below" if _BELOW.search(mid) else ("above" if t["side"] == "long" else "below")
            found.append((level, way, field))
    if not found:
        return {"status": "none"}
    if len({(lv, w) for lv, w, _ in found}) > 1:
        return {"status": "several"}
    level, way, field = found[0]
    x = float(t["exitPrice"])
    reached = x >= level if way == "above" else x <= level
    return {"status": "reached" if reached else "not_reached", "level": level, "way": way, "field": field}


def reflection(t: Dict[str, Any], nifty: Mapping[date, float]) -> Optional[Dict[str, Any]]:
    """Two to four factual sentences on a closed trade (None while it is open): what happened, Nifty 50 over the same period, the noted level.
    `nifty`: Nifty 50 daily closes by date (any span; only the closes either side of the trade are used). Pure: no database, no provider."""
    if t.get("exitPrice") is None or not t.get("exitAt"):
        return None
    entry, exit_ = datetime.fromisoformat(t["entryAt"]), datetime.fromisoformat(t["exitAt"])
    p = pnl(t)
    cost = float(t["entryPrice"]) * float(t["qty"])
    ret = round(p / cost * 100, 2) if cost > 0 else None
    fees = float(t.get("fees") or 0)
    qty = num_in(float(t["qty"]))
    held = held_for(entry, exit_)
    result = f"a net gain of {rupees(p)}" if p > 0 else f"a net loss of {rupees(p)}" if p < 0 else "no net gain or loss"
    fee_text = f"after {rupees(fees)} of fees" if fees > 0 else "with no fees entered"
    s1 = (f"{'Long' if t['side'] == 'long' else 'Short'} {t['symbol']} (quantity {qty}) was entered at {rupees(t['entryPrice'])} and exited at "
          f"{rupees(t['exitPrice'])} after {held}, closing with {result} {fee_text}: {signed_pct(ret or 0)} on the {rupees(cost)} position.")
    w = nifty_window(entry, exit_, nifty)
    if w["status"] == "intraday":
        s2 = NIFTY_INTRADAY
    elif w["status"] == "missing":
        s2 = NIFTY_NOT_STORED
    else:
        span = f"(its close on {_day_text(date.fromisoformat(w['from']))} before the entry to its close on {_day_text(date.fromisoformat(w['to']))} after the exit)"
        ref = w["pct"] if t["side"] == "long" else -w["pct"]
        gap = round((ret or 0) - ref, 2)
        rel = "level with it" if gap == 0 else f"{abs(gap):.2f} percentage points {'above' if gap > 0 else 'below'} it"
        if t["side"] == "long":
            s2 = f"Nifty 50 moved {signed_pct(w['pct'])} over the same period {span}; the position's {signed_pct(ret or 0)} was {rel}."
        else:
            s2 = (f"Nifty 50 moved {signed_pct(w['pct'])} over the same period {span}; a short gains when prices fall, so against the index's move "
                  f"turned around ({signed_pct(ref)}) the position's {signed_pct(ret or 0)} was {rel}.")
        w = {**w, "against": ref, "gap": gap}
    a = noted_level(t)
    if a["status"] == "none":
        s3 = NO_ASSUMPTION
    elif a["status"] == "several":
        s3 = SEVERAL_LEVELS
    else:
        where = "setup" if a["field"] == "setup" else "notes"
        lv = num_in(a["level"])
        side = "at it" if float(t["exitPrice"]) == a["level"] else a["way"] + " it"
        if a["status"] == "reached":
            s3 = f"The level noted in the {where}, {lv} (a move {a['way']} it), was reached at the exit: the exit price of {rupees(t['exitPrice'])} is {side}."
        else:
            s3 = (f"The level noted in the {where}, {lv} (a move {a['way']} it), was not reached at the exit: the exit price of {rupees(t['exitPrice'])} "
                  f"is {'below' if a['way'] == 'above' else 'above'} it (prices between entry and exit are not checked).")
    sentences = [s1, s2, s3]
    return {"text": " ".join(sentences), "sentences": sentences, "held": held, "returnPct": ret, "nifty": w, "assumption": a}


async def nifty_closes(conn, trades: List[Dict[str, Any]]) -> Dict[date, float]:
    """Nifty 50 daily closes covering every closed trade in `trades`, in one query (the request's own copy: each trade reads from it)."""
    closed = [t for t in trades if t.get("exitAt")]
    if not closed:
        return {}
    lo = min(datetime.fromisoformat(t["entryAt"]).astimezone(IST).date() for t in closed) - NIFTY_GAP - timedelta(days=1)
    hi = max(datetime.fromisoformat(t["exitAt"]).astimezone(IST).date() for t in closed) + NIFTY_GAP + timedelta(days=1)
    try:
        rows = await conn.fetch("SELECT d, close FROM flows_index WHERE code = $1 AND d BETWEEN $2 AND $3 ORDER BY d", NIFTY_CODE, lo, hi)
    except Exception as exc:                         # noqa: BLE001 - the journal still answers; each reflection then says the data is not stored
        log.warning("journal: Nifty 50 closes not read: %s", type(exc).__name__)
        return {}
    return {r["d"]: float(r["close"]) for r in rows}


def with_reflections(trades: List[Dict[str, Any]], nifty: Mapping[date, float]) -> List[Dict[str, Any]]:
    for t in trades:
        t["reflection"] = reflection(t, nifty)
    return trades


def _row(r) -> Dict[str, Any]:
    out = {"id": r["id"], "symbol": r["symbol"], "side": r["side"], "qty": _f(r["qty"]), "entryPrice": _f(r["entry_price"]),
           "exitPrice": _f(r["exit_price"]), "entryAt": r["entry_at"].astimezone(IST).isoformat(),
           "exitAt": r["exit_at"].astimezone(IST).isoformat() if r["exit_at"] else None, "fees": _f(r["fees"]) or 0.0,
           "setup": r["setup"], "notes": r["notes"]}
    out["pnl"] = pnl(out)
    return out


COLS = "id, symbol, side, qty, entry_price, exit_price, entry_at, exit_at, fees, setup, notes"


def _vals(t: Trade) -> Tuple:
    return (t.symbol, t.side, Decimal(str(t.qty)), Decimal(str(t.entryPrice)), None if t.exitPrice is None else Decimal(str(t.exitPrice)),
            t.entryAt, t.exitAt, Decimal(str(t.fees)), t.setup, t.notes)


async def _count(conn, uid: str) -> int:
    return await conn.fetchval("SELECT count(*) FROM lab_journal WHERE user_id = $1", uid)


@router.get("/api/lab/journal")
async def my_journal(request: Request, ctx: Ctx = Depends(lab_ctx)) -> Dict[str, Any]:
    async with request.app.state.store.pool.acquire() as conn:
        rows = await conn.fetch(f"SELECT {COLS} FROM lab_journal WHERE user_id = $1 ORDER BY entry_at DESC, id DESC", ctx.user_id)  # nosec B608 - only the fixed column list COLS is placed in the text; every value is a bound parameter
        trades = [_row(r) for r in rows]
        nifty = await nifty_closes(conn, trades)
    return {"trades": with_reflections(trades, nifty), "stats": stats(trades), "limit": MAX_TRADES}


@router.post("/api/lab/journal")
async def add_trade(request: Request, body: Trade, ctx: Ctx = Depends(lab_ctx)) -> Dict[str, Any]:
    async with request.app.state.store.pool.acquire() as conn:
        if await _count(conn, ctx.user_id) >= MAX_TRADES:
            raise fail(409, "journal_full", f"The journal holds up to {MAX_TRADES:,} trades. Remove some to add more.")
        r = await conn.fetchrow(f"""INSERT INTO lab_journal (user_id, symbol, side, qty, entry_price, exit_price, entry_at, exit_at, fees, setup, notes)
                                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING {COLS}""", ctx.user_id, *_vals(body))  # nosec B608 - only the fixed column list COLS is placed in the text; every value is a bound parameter
        t = _row(r)
        with_reflections([t], await nifty_closes(conn, [t]))
    return {"trade": t}


@router.put("/api/lab/journal/{tid}")
async def change_trade(request: Request, tid: int, body: Trade, ctx: Ctx = Depends(lab_ctx)) -> Dict[str, Any]:
    async with request.app.state.store.pool.acquire() as conn:
        sql = f"UPDATE lab_journal SET symbol = $3, side = $4, qty = $5, entry_price = $6, exit_price = $7, entry_at = $8, exit_at = $9, fees = $10, setup = $11, notes = $12 WHERE id = $1 AND user_id = $2 RETURNING {COLS}"  # nosec B608 - only the fixed column list COLS is placed in the text; every value is a bound parameter
        r = await conn.fetchrow(sql, tid, ctx.user_id, *_vals(body))
        if r is None:
            raise fail(404, "not_found", "That trade is not in your journal.")
        t = _row(r)
        with_reflections([t], await nifty_closes(conn, [t]))
    return {"trade": t}


@router.delete("/api/lab/journal/{tid}")
async def remove_trade(request: Request, tid: int, ctx: Ctx = Depends(lab_ctx)) -> Dict[str, Any]:
    async with request.app.state.store.pool.acquire() as conn:
        done = await conn.execute("DELETE FROM lab_journal WHERE id = $1 AND user_id = $2", tid, ctx.user_id)
    if done.endswith(" 0"):
        raise fail(404, "not_found", "That trade is not in your journal.")
    return {"status": "removed"}


class ImportBody(BaseModel):
    csv: str = Field(max_length=MAX_CSV)


HEADERS = {"symbol": "symbol", "instrument": "symbol", "side": "side", "direction": "side", "qty": "qty", "quantity": "qty",
           "entry": "entryPrice", "entry price": "entryPrice", "entry_price": "entryPrice", "buy price": "entryPrice",
           "exit": "exitPrice", "exit price": "exitPrice", "exit_price": "exitPrice", "sell price": "exitPrice",
           "entry time": "entryAt", "entry_at": "entryAt", "entry date": "entryAt", "date": "entryAt",
           "exit time": "exitAt", "exit_at": "exitAt", "exit date": "exitAt",
           "fees": "fees", "charges": "fees", "brokerage": "fees", "setup": "setup", "strategy": "setup", "tag": "setup", "notes": "notes", "note": "notes"}
SIDES = {"long": "long", "buy": "long", "b": "long", "l": "long", "short": "short", "sell": "short", "s": "short"}


def _when(v: str) -> Optional[datetime]:
    v = (v or "").strip()
    if not v:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%d-%m-%Y %H:%M", "%d/%m/%Y %H:%M",
                "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            d = datetime.strptime(v, fmt)
            return d.replace(tzinfo=IST)
        except ValueError:
            continue
    try:
        d = datetime.fromisoformat(v)
        return d if d.tzinfo else d.replace(tzinfo=IST)
    except ValueError:
        raise _LineError(f"'{v[:30]}' is not a date like 2026-11-26 10:15") from None


FIELD_NAME = {"qty": "qty", "entryPrice": "entry price", "exitPrice": "exit price", "entryAt": "entry time", "exitAt": "exit time", "fees": "fees"}


class _LineError(Exception):
    """A CSV line we refuse, with a reason written for the member."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _reason(e: ValidationError) -> str:
    """The first validation message, as our own Trade validators word it (field names and plain limits only)."""
    err = (e.errors() or [{}])[0]
    msg = str(err.get("msg") or "This line could not be read.").replace("Value error, ", "")
    where = ".".join(FIELD_NAME.get(str(x), str(x)) for x in err.get("loc") or ())
    return (f"{where}: {msg}" if where and where not in msg else msg)[:160]



def parse_csv(text: str) -> Tuple[List[Trade], List[Dict[str, Any]]]:
    """Trades from CSV text with a header row (column names in HEADERS, any case), and each rejected line: {line, reason}."""
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        return [], [{"line": 1, "reason": "The file is empty."}]
    head = [HEADERS.get(h.strip().lower()) for h in rows[0]]
    need = {"symbol", "side", "qty", "entryPrice", "entryAt"} - set(head)
    if need:
        return [], [{"line": 1, "reason": "Missing columns: " + ", ".join(sorted(need)) + ". The first line must name the columns."}]
    good, bad = [], []
    for n, r in enumerate(rows[1:MAX_IMPORT + 1], start=2):
        rec = {k: (r[i].strip() if i < len(r) else "") for i, k in enumerate(head) if k}
        try:
            side = SIDES.get(rec.get("side", "").lower())
            if not side:
                raise _LineError(f"side '{rec.get('side', '')[:10]}' is not long, short, buy or sell")

            def num(k: str) -> Optional[float]:
                if not rec.get(k):
                    return None
                try:
                    return float(rec[k].replace(",", ""))
                except ValueError:
                    raise _LineError(f"{FIELD_NAME.get(k, k)} '{rec[k][:12]}' is not a number") from None

            good.append(Trade(symbol=rec.get("symbol", ""), side=side, qty=num("qty"), entryPrice=num("entryPrice"), exitPrice=num("exitPrice"),
                              entryAt=_when(rec.get("entryAt", "")), exitAt=_when(rec.get("exitAt", "")), fees=num("fees") or 0,
                              setup=rec.get("setup") or None, notes=rec.get("notes") or None))
        except _LineError as e:                      # one bad line never stops the rest; only our own plain reasons go back
            bad.append({"line": n, "reason": e.reason[:160]})
        except ValidationError as e:
            bad.append({"line": n, "reason": _reason(e)})
        except Exception:                            # noqa: BLE001 - nothing internal is echoed to the member
            bad.append({"line": n, "reason": "This line could not be read."})
    if len(rows) - 1 > MAX_IMPORT:
        bad.append({"line": MAX_IMPORT + 2, "reason": f"Only the first {MAX_IMPORT:,} trades of a file are read."})
    return good, bad


@router.post("/api/lab/journal/import")
async def import_trades(request: Request, body: ImportBody, ctx: Ctx = Depends(lab_ctx)) -> Dict[str, Any]:
    good, bad = parse_csv(body.csv)
    async with request.app.state.store.pool.acquire() as conn:
        room = MAX_TRADES - await _count(conn, ctx.user_id)
        if len(good) > room:
            bad.append({"line": None, "reason": f"The journal holds up to {MAX_TRADES:,} trades; {len(good) - max(room, 0)} were not added."})
            good = good[:max(room, 0)]
        if good:
            async with conn.transaction():
                await conn.executemany("""INSERT INTO lab_journal (user_id, symbol, side, qty, entry_price, exit_price, entry_at, exit_at, fees, setup, notes)
                                          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)""", [(ctx.user_id, *_vals(t)) for t in good])
    return {"added": len(good), "rejected": bad}
