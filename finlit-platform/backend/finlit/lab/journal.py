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
"""
from __future__ import annotations

import csv
import io
from collections import OrderedDict, defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator, model_validator

from ..auth.routes import fail
from ..auth.service import Ctx
from ..dhan import IST
from .access import lab_ctx

router = APIRouter()

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
        rows = await conn.fetch(f"SELECT {COLS} FROM lab_journal WHERE user_id = $1 ORDER BY entry_at DESC, id DESC", ctx.user_id)
    trades = [_row(r) for r in rows]
    return {"trades": trades, "stats": stats(trades), "limit": MAX_TRADES}


@router.post("/api/lab/journal")
async def add_trade(request: Request, body: Trade, ctx: Ctx = Depends(lab_ctx)) -> Dict[str, Any]:
    async with request.app.state.store.pool.acquire() as conn:
        if await _count(conn, ctx.user_id) >= MAX_TRADES:
            raise fail(409, "journal_full", f"The journal holds up to {MAX_TRADES:,} trades. Remove some to add more.")
        r = await conn.fetchrow(f"""INSERT INTO lab_journal (user_id, symbol, side, qty, entry_price, exit_price, entry_at, exit_at, fees, setup, notes)
                                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING {COLS}""", ctx.user_id, *_vals(body))
    return {"trade": _row(r)}


@router.put("/api/lab/journal/{tid}")
async def change_trade(request: Request, tid: int, body: Trade, ctx: Ctx = Depends(lab_ctx)) -> Dict[str, Any]:
    async with request.app.state.store.pool.acquire() as conn:
        r = await conn.fetchrow(f"""UPDATE lab_journal SET symbol = $3, side = $4, qty = $5, entry_price = $6, exit_price = $7, entry_at = $8,
                                    exit_at = $9, fees = $10, setup = $11, notes = $12 WHERE id = $1 AND user_id = $2 RETURNING {COLS}""",
                                tid, ctx.user_id, *_vals(body))
    if r is None:
        raise fail(404, "not_found", "That trade is not in your journal.")
    return {"trade": _row(r)}


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
        raise ValueError(f"'{v[:30]}' is not a date like 2026-11-26 10:15")


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
                raise ValueError(f"side '{rec.get('side', '')[:10]}' is not long, short, buy or sell")
            num = lambda k: float(rec[k].replace(",", "")) if rec.get(k) else None   # noqa: E731
            good.append(Trade(symbol=rec.get("symbol", ""), side=side, qty=num("qty"), entryPrice=num("entryPrice"), exitPrice=num("exitPrice"),
                              entryAt=_when(rec.get("entryAt", "")), exitAt=_when(rec.get("exitAt", "")), fees=num("fees") or 0,
                              setup=rec.get("setup") or None, notes=rec.get("notes") or None))
        except Exception as e:                       # one bad line never stops the rest
            msg = e.errors()[0]["msg"] if hasattr(e, "errors") else str(e)
            bad.append({"line": n, "reason": msg.replace("Value error, ", "")[:160]})
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
