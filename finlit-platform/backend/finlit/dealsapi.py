"""Bulk, block and short-selling deals, as NSE published them, served from market_deals (finlit/deals.py, the `deals` job).

    GET /api/deals                   the filtered list: rows (paged), totals counted once, the period and what history is held
    GET /api/deals/summary           the 6 largest trades (counted once), totals by kind and side, the most active shares and clients
    GET /api/deals/stock/{symbol}    every deal in one share, the close on each deal day and the latest close
    GET /api/deals/client/{key}      every deal by one client, net value per share, the shares it both bought and sold
    GET /api/deals/ipos              net deal value since listing for every listed IPO, and the anchor lock-in ends ahead (IPO pages)

Counted once: a bulk line that is the same trade as a block line (also_block) is listed under Bulk with its tag, and left out of "All deals", every
total and the largest trades. Arithmetic only: value = qty x price / 1e7 (Rs crore); % of equity = qty / shares, the shares being FinEdge's market cap
divided by its price (the market-wide list, finlit/listing); change since the deal = (latest close - deal price) / deal price, shown only when our
daily close on the deal day is in the same terms as the deal price (no split or bonus since). Describes what was traded; never advises.
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import time
from datetime import date, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from fastapi.responses import Response

from .auth.routes import Ctx, secure_ctx
from .deals import SOURCE_NAME, SOURCE_URL, client_key as norm_client, today_ist

router = APIRouter()
log = logging.getLogger("finlit.dealsapi")

CACHE_TTL_S = 300
CACHE_MAX = 300
HEADERS = {"Cache-Control": "public, max-age=600"}
PAGE_SIZE = 50
MAX_ROWS = 10000            # a CSV download of the filtered view
SORTS = {"value": "d.value_cr", "day": "d.day", "qty": "d.qty", "price": "d.price", "symbol": "d.symbol", "client": "d.client_key", "pct": "pct_equity"}
SOURCES = {"deals": {"name": SOURCE_NAME, "url": SOURCE_URL, "what": "Bulk, block and short-selling deals as the exchange published them"},
           "prices": {"name": "FinLit daily prices", "url": None, "what": "Close on the deal day, latest close, and shares (market cap / price) for % of equity"}}
NOTE = ("Bulk and block deals are trades the exchange publishes after the close. They describe what was traded, by whom, at what price; "
        "they are not a recommendation. Information only, not investment advice.")
SINCE_OK = (0.75, 1.33)     # deal price against our close that day: outside this, a split or bonus came since and the change is not worked out

_cache: Dict[Tuple, Dict[str, Any]] = {}


# ------------------------------------------------------------------------------------------------ the copy in memory (stale-while-revalidate)
async def cached(key: Tuple, build: Callable[[], Any]) -> str:
    """The JSON text for `key`: built once, then sent from memory; once older than CACHE_TTL_S it is rebuilt in the background and the current copy
    is sent meanwhile, as /api/ipos/history does. The deals change only when the job runs (every 30 minutes in the evening)."""
    hit = _cache.get(key)
    if hit is None:
        body = json.dumps(await build(), default=str)
        if len(_cache) >= CACHE_MAX:
            for k in sorted(_cache, key=lambda k: _cache[k]["t"])[: CACHE_MAX // 4]:
                _cache.pop(k, None)
        _cache[key] = {"t": time.monotonic(), "body": body, "task": None}
        return body
    if time.monotonic() - hit["t"] >= CACHE_TTL_S and not hit.get("task"):
        async def again():
            try:
                hit.update(t=time.monotonic(), body=json.dumps(await build(), default=str))
            except Exception:
                log.warning("deals copy %s not rebuilt; the previous copy is kept", key[0], exc_info=True)
            finally:
                hit["task"] = None
        hit["task"] = asyncio.create_task(again())
    return hit["body"]


def reset() -> None:
    _cache.clear()


# ------------------------------------------------------------------------------------------------ shared pieces
def _f(v: Any) -> Optional[float]:
    return float(v) if v is not None else None


def _r(v: Optional[float], n: int = 2) -> Optional[float]:
    return round(v, n) if v is not None else None


ROW_COLS = """d.id, d.exchange, d.kind, d.day, d.symbol, d.security_name, d.client, d.client_key, d.side, d.qty, d.price, d.value_cr, d.remarks, d.also_block,
    d.source, pd.close AS day_close, lq.price AS close_now, lq.traded_at AS close_at,
    CASE WHEN lq.price > 0 AND lq.market_cap > 0 THEN d.qty / (lq.market_cap * 1e7 / lq.price) * 100 END AS pct_equity,
    (d.kind = 'block' AND EXISTS (SELECT 1 FROM market_deals t WHERE t.kind = 'bulk' AND t.also_block AND t.exchange = d.exchange AND t.day = d.day
        AND t.symbol = d.symbol AND t.side = d.side AND t.client_key = d.client_key AND round(t.price, 2) = round(d.price, 2) AND abs(t.qty - d.qty) <= 1)) AS also_bulk"""
ROW_JOINS = """LEFT JOIN price_daily pd ON pd.symbol = d.symbol AND pd.day = d.day
    LEFT JOIN listing_quotes lq ON lq.symbol = d.symbol"""


def row(r: Dict[str, Any]) -> Dict[str, Any]:
    price, now, dc = _f(r["price"]), _f(r["close_now"]), _f(r["day_close"])
    since, since_note = None, None
    if price and now:
        if dc is None:
            since_note = "no stored close for the deal day to check for a split or bonus since"
        elif SINCE_OK[0] <= dc / price <= SINCE_OK[1]:
            since = round((now - price) / price * 100, 2)
        else:
            since_note = "a split or bonus since the deal: the prices are not in the same terms"
    pct = _f(r["pct_equity"])
    return {"id": r["id"], "exchange": r["exchange"], "kind": r["kind"], "day": r["day"].isoformat(), "symbol": r["symbol"], "name": r["security_name"],
            "client": r["client"], "clientKey": r["client_key"], "side": r["side"], "qty": r["qty"], "price": price, "valueCr": _r(_f(r["value_cr"]), 4),
            "remarks": r["remarks"], "alsoBlock": r["also_block"], "alsoBulk": bool(r.get("also_bulk")), "source": r["source"],
            "pctEquity": _r(pct, 3) if pct is not None and pct < 100 else None, "dayClose": dc, "closeNow": now,
            "closeAt": r["close_at"].date().isoformat() if r.get("close_at") else None, "sinceDealPct": since, "sinceNote": since_note}


class Filters:
    """The list's filters, as SQL. `kind` "all" is bulk and block counted once (the bulk twin of a block line left out)."""

    def __init__(self, a: date, b: date, kind: str = "all", side: str = "all", q: str = "", symbol: str = "", client: str = "", min_cr: Optional[float] = None):
        self.a, self.b, self.kind, self.side, self.q = a, b, kind, side, (q or "").strip()
        self.symbol, self.client, self.min_cr = (symbol or "").strip().upper(), norm_client(client) if client else None, min_cr

    def sql(self, with_kind: bool = True) -> Tuple[str, List[Any]]:
        w, p = ["d.day BETWEEN $1 AND $2"], [self.a, self.b]

        def add(cond: str, val: Any):
            p.append(val)
            w.append(cond.replace("?", f"${len(p)}"))
        if with_kind:
            if self.kind == "all":
                w.append("d.kind IN ('bulk', 'block') AND NOT d.also_block")
            else:
                add("d.kind = ?", self.kind)
        if self.side in ("buy", "sell"):
            add("d.side = ?", self.side)
        if self.q:
            add("(d.symbol ILIKE ? OR d.security_name ILIKE ? OR d.client ILIKE ?)", "%" + self.q.replace("%", "").replace("_", "\\_") + "%")
        if self.symbol:
            add("d.symbol = ?", self.symbol)
        if self.client:
            add("d.client_key = ?", self.client)
        if self.min_cr:
            add("d.value_cr >= ?", self.min_cr)
        return " AND ".join(w), p


async def coverage(conn) -> Dict[str, Any]:
    from .flows import get_meta
    r = await conn.fetchrow("""SELECT min(day) AS first, max(day) AS last, max(fetched_at) AS fetched,
        min(day) FILTER (WHERE kind = 'bulk') AS b1, max(day) FILTER (WHERE kind = 'bulk') AS b2, min(day) FILTER (WHERE kind = 'block') AS k1,
        max(day) FILTER (WHERE kind = 'block') AS k2, min(day) FILTER (WHERE kind = 'short') AS s1, max(day) FILTER (WHERE kind = 'short') AS s2,
        array_agg(DISTINCT exchange) AS ex FROM market_deals""")
    iso = lambda d: d.isoformat() if d else None       # noqa: E731
    bf = await get_meta(conn, "deals:backfill") or {}
    last = await get_meta(conn, "deals:last") or {}
    return {"first_day": iso(r["first"]), "last_day": iso(r["last"]), "exchanges": sorted(x for x in (r["ex"] or []) if x) or ["NSE"],
            "byKind": {"bulk": [iso(r["b1"]), iso(r["b2"])], "block": [iso(r["k1"]), iso(r["k2"])], "short": [iso(r["s1"]), iso(r["s2"])]},
            "lastUpdated": r["fetched"].isoformat() if r["fetched"] else None, "historyDone": bool(bf.get("done")), "historyAnswers": bf.get("historyAnswers"),
            "lastRun": {k: last.get(k) for k in ("at", "inserted", "duplicates", "http", "notes")} if last else None}


def period(days: int, frm: Optional[date], to: Optional[date]) -> Tuple[date, date]:
    """The days asked for: from/to as given, else the last `days` calendar days to today (IST); days=1 is today only."""
    b = to or today_ist()
    a = frm or b - timedelta(days=max(1, days) - 1)
    if a > b:
        a, b = b, a
    if (b - a).days > 800:
        a = b - timedelta(days=800)
    return a, b


TOTALS_SQL = """SELECT
    count(*) FILTER (WHERE d.kind IN ('bulk', 'block')) AS deals, count(*) FILTER (WHERE d.kind IN ('bulk', 'block') AND NOT d.also_block) AS trades,
    count(*) FILTER (WHERE d.also_block) AS twins,
    coalesce(sum(d.value_cr) FILTER (WHERE d.kind IN ('bulk', 'block') AND NOT d.also_block AND d.side = 'buy'), 0) AS buy,
    coalesce(sum(d.value_cr) FILTER (WHERE d.kind IN ('bulk', 'block') AND NOT d.also_block AND d.side = 'sell'), 0) AS sell,
    count(*) FILTER (WHERE d.kind = 'bulk' AND NOT d.also_block) AS bulk_n, coalesce(sum(d.value_cr) FILTER (WHERE d.kind = 'bulk' AND NOT d.also_block AND d.side = 'buy'), 0) AS bulk_buy,
    coalesce(sum(d.value_cr) FILTER (WHERE d.kind = 'bulk' AND NOT d.also_block AND d.side = 'sell'), 0) AS bulk_sell,
    count(*) FILTER (WHERE d.kind = 'block') AS block_n, coalesce(sum(d.value_cr) FILTER (WHERE d.kind = 'block' AND d.side = 'buy'), 0) AS block_buy,
    coalesce(sum(d.value_cr) FILTER (WHERE d.kind = 'block' AND d.side = 'sell'), 0) AS block_sell,
    count(*) FILTER (WHERE d.kind = 'short') AS short_n, coalesce(sum(d.qty) FILTER (WHERE d.kind = 'short'), 0) AS short_qty,
    count(DISTINCT d.day) FILTER (WHERE d.kind IN ('bulk', 'block')) AS days
    FROM market_deals d WHERE {where}"""


def totals(t: Dict[str, Any]) -> Dict[str, Any]:
    c = lambda v: round(float(v or 0), 2)       # noqa: E731
    return {"deals": t["deals"], "trades": t["trades"], "alsoListedAsBulk": t["twins"], "buyCr": c(t["buy"]), "sellCr": c(t["sell"]), "days": t["days"],
            "byKind": {"bulk": {"trades": t["bulk_n"], "buyCr": c(t["bulk_buy"]), "sellCr": c(t["bulk_sell"])},
                       "block": {"trades": t["block_n"], "buyCr": c(t["block_buy"]), "sellCr": c(t["block_sell"])},
                       "short": {"deals": t["short_n"], "qty": int(t["short_qty"] or 0)}}}


# ------------------------------------------------------------------------------------------------ routes
def _date(v: Optional[str], name: str) -> Optional[date]:
    if not v:
        return None
    try:
        return date.fromisoformat(v)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"{name} must be a date like 2026-11-27")


@router.get("/api/deals")
async def deals(request: Request, days: int = Query(7, ge=1, le=800), frm: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
                kind: str = Query("all", pattern="^(all|bulk|block|short)$"), side: str = Query("all", pattern="^(all|buy|sell)$"),
                q: str = Query("", max_length=60), symbol: str = Query("", max_length=30), client: str = Query("", max_length=160),
                min_cr: Optional[float] = Query(None, ge=0, le=1e6), sort: str = Query("value", pattern="^(value|day|qty|price|symbol|client|pct)$"),
                dir: str = Query("desc", pattern="^(asc|desc)$"), page: int = Query(1, ge=1, le=10000), size: int = Query(PAGE_SIZE, ge=1, le=MAX_ROWS),
                format: str = Query("json", pattern="^(json|csv)$")) -> Response:
    """Public. The deals in a period, filtered, sorted and paged; totals count each trade once. format=csv gives every matching row (at most 10,000)."""
    a, b = period(days, _date(frm, "from"), _date(to, "to"))
    f = Filters(a, b, kind, side, q, symbol, client, min_cr)
    store = request.app.state.store
    if format == "csv":
        size, page = MAX_ROWS, 1

    async def build():
        where, p = f.sql()
        order = f"{SORTS[sort]} {dir.upper()} NULLS LAST, d.day DESC, d.value_cr DESC NULLS LAST, d.id"
        async with store.pool.acquire() as conn:
            n = await conn.fetchval(f"SELECT count(*) FROM market_deals d WHERE {where}", *p)  # nosec B608: filters are bound parameters, the WHERE text is built from fixed strings
            rs = await conn.fetch(f"SELECT {ROW_COLS} FROM market_deals d {ROW_JOINS} WHERE {where} ORDER BY {order} LIMIT {int(size)} OFFSET {int((page - 1) * size)}", *p)  # nosec B608: filters are bound parameters; order and limits come from fixed lists and ints
            w2, p2 = f.sql(with_kind=False)
            t = dict(await conn.fetchrow(TOTALS_SQL.format(where=w2), *p2))  # nosec B608: as above
            cov = await coverage(conn)
        first = cov["first_day"]
        short_history = bool(first) and a < date.fromisoformat(first)
        return {"rows": [row(dict(x)) for x in rs], "total": n, "page": page, "size": size, "pages": max(1, -(-n // size)),
                "totals": totals(t), "period": {"from": a.isoformat(), "to": b.isoformat(), "days": (b - a).days + 1},
                "filters": {"kind": kind, "side": side, "q": f.q, "symbol": f.symbol, "client": f.client, "minCr": min_cr, "sort": sort, "dir": dir},
                "coverage": {**cov, "shorterThanPeriod": short_history}, "sources": SOURCES, "note": NOTE}

    key = ("list", a, b, kind, side, f.q.lower(), f.symbol, f.client, min_cr, sort, dir, page, size)
    body = await cached(key, build)
    if format == "csv":
        return Response(to_csv(json.loads(body)["rows"]), media_type="text/csv; charset=utf-8",
                        headers={**HEADERS, "Content-Disposition": f'attachment; filename="finlit-deals-{a}-to-{b}.csv"'})
    return Response(body, media_type="application/json", headers=HEADERS)


CSV_COLS = [("day", "Date"), ("exchange", "Exchange"), ("kind", "Kind"), ("symbol", "Symbol"), ("name", "Security name"), ("client", "Client"),
            ("side", "Action"), ("qty", "Quantity"), ("price", "Price (Rs)"), ("valueCr", "Value (Rs Cr)"), ("pctEquity", "% of equity"),
            ("alsoBlock", "Also a block deal"), ("remarks", "Remarks"), ("source", "Source")]


def to_csv(rows: List[Dict[str, Any]]) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow([h for _, h in CSV_COLS])
    for r in rows:
        w.writerow(["" if r.get(k) is None else ("yes" if r.get(k) is True else ("" if r.get(k) is False else r.get(k))) for k, _ in CSV_COLS])
    w.writerow([])
    w.writerow([f"Source: {SOURCE_NAME} ({SOURCE_URL}). {NOTE}"])
    return out.getvalue()


@router.get("/api/deals/summary")
async def summary(request: Request, days: int = Query(7, ge=1, le=800), frm: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
                  side: str = Query("all", pattern="^(all|buy|sell)$"), q: str = Query("", max_length=60)) -> Response:
    """Public. The period at a glance, each trade counted once."""
    a, b = period(days, _date(frm, "from"), _date(to, "to"))
    f = Filters(a, b, "all", side, q)
    store = request.app.state.store

    async def build():
        where, p = f.sql()
        w2, p2 = f.sql(with_kind=False)
        async with store.pool.acquire() as conn:
            largest = await conn.fetch(f"SELECT {ROW_COLS} FROM market_deals d {ROW_JOINS} WHERE {where} ORDER BY d.value_cr DESC NULLS LAST, d.id LIMIT 6", *p)  # nosec B608
            t = dict(await conn.fetchrow(TOTALS_SQL.format(where=w2), *p2))  # nosec B608
            shares = await conn.fetch(f"""SELECT d.symbol, max(d.security_name) AS name, count(*) AS n, sum(d.value_cr) AS gross,
                coalesce(sum(d.value_cr) FILTER (WHERE d.side = 'buy'), 0) - coalesce(sum(d.value_cr) FILTER (WHERE d.side = 'sell'), 0) AS net
                FROM market_deals d WHERE {where} GROUP BY d.symbol ORDER BY gross DESC NULLS LAST LIMIT 10""", *p)  # nosec B608
            clients = await conn.fetch(f"""SELECT d.client_key, mode() WITHIN GROUP (ORDER BY d.client) AS client, count(*) AS n, count(DISTINCT d.symbol) AS shares,
                sum(d.value_cr) AS gross, coalesce(sum(d.value_cr) FILTER (WHERE d.side = 'buy'), 0) AS buy, coalesce(sum(d.value_cr) FILTER (WHERE d.side = 'sell'), 0) AS sell
                FROM market_deals d WHERE {where} GROUP BY d.client_key ORDER BY gross DESC NULLS LAST LIMIT 10""", *p)  # nosec B608
            cov = await coverage(conn)
        c = lambda v: round(float(v or 0), 2)       # noqa: E731
        return {"largest": [row(dict(x)) for x in largest], "totals": totals(t), "period": {"from": a.isoformat(), "to": b.isoformat(), "days": (b - a).days + 1},
                "activeShares": [{"symbol": x["symbol"], "name": x["name"], "deals": x["n"], "grossCr": c(x["gross"]), "netCr": c(x["net"])} for x in shares],
                "activeClients": [{"clientKey": x["client_key"], "client": x["client"], "deals": x["n"], "shares": x["shares"], "grossCr": c(x["gross"]),
                                   "buyCr": c(x["buy"]), "sellCr": c(x["sell"])} for x in clients],
                "coverage": {**cov, "shorterThanPeriod": bool(cov["first_day"]) and a < date.fromisoformat(cov["first_day"])}, "sources": SOURCES, "note": NOTE}

    return Response(await cached(("summary", a, b, side, f.q.lower()), build), media_type="application/json", headers=HEADERS)


@router.get("/api/deals/stock/{symbol}")
async def stock(request: Request, symbol: str = Path(..., pattern=r"^[A-Za-z0-9&\-_.]{1,30}$"), since: Optional[str] = None) -> Response:
    """Public. Every deal held in one share (newest first; `since` = a listing date keeps the deals from that day on), the close on each deal day, the
    latest close, and the net value bought minus sold (each trade once)."""
    sym = symbol.upper()
    s = _date(since, "since")
    store = request.app.state.store

    async def build():
        async with store.pool.acquire() as conn:
            rs = await conn.fetch(f"SELECT {ROW_COLS} FROM market_deals d {ROW_JOINS} WHERE d.symbol = $1 AND ($2::date IS NULL OR d.day >= $2) "
                                  "ORDER BY d.day DESC, d.value_cr DESC NULLS LAST, d.id LIMIT 2000", sym, s)  # nosec B608: fixed column list
            last = await conn.fetchrow("SELECT price, traded_at, market_cap FROM listing_quotes WHERE symbol = $1", sym)
            cov = await coverage(conn)
        rows = [row(dict(x)) for x in rs]
        once = [r for r in rows if r["kind"] in ("bulk", "block") and not r["alsoBlock"]]
        buy = sum(r["valueCr"] or 0 for r in once if r["side"] == "buy")
        sell = sum(r["valueCr"] or 0 for r in once if r["side"] == "sell")
        return {"symbol": sym, "rows": rows, "trades": len(once), "buyCr": round(buy, 2), "sellCr": round(sell, 2), "netCr": round(buy - sell, 2),
                "latestClose": _f(last["price"]) if last else None, "latestCloseAt": last["traded_at"].date().isoformat() if last and last["traded_at"] else None,
                "since": s.isoformat() if s else None, "coverage": cov, "sources": SOURCES, "note": NOTE}

    return Response(await cached(("stock", sym, s), build), media_type="application/json", headers=HEADERS)


@router.get("/api/deals/client/{key}")
async def client(request: Request, key: str = Path(..., min_length=2, max_length=160)) -> Response:
    """Public. Every deal by one client (the name in any spelling the exchange used), net value per share, and the shares it both bought and sold."""
    ck = norm_client(key)
    if not ck:
        raise HTTPException(status_code=404, detail="No client by that name")
    store = request.app.state.store

    async def build():
        async with store.pool.acquire() as conn:
            rs = await conn.fetch(f"SELECT {ROW_COLS} FROM market_deals d {ROW_JOINS} WHERE d.client_key = $1 ORDER BY d.day DESC, d.value_cr DESC NULLS LAST, d.id LIMIT 3000", ck)  # nosec B608
            cov = await coverage(conn)
        rows = [row(dict(x)) for x in rs]
        per: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            if r["kind"] not in ("bulk", "block") or r["alsoBlock"]:
                continue
            p = per.setdefault(r["symbol"], {"symbol": r["symbol"], "name": r["name"], "deals": 0, "buyCr": 0.0, "sellCr": 0.0, "buyQty": 0, "sellQty": 0,
                                             "first": r["day"], "last": r["day"]})
            p["deals"] += 1
            p[r["side"] + "Cr"] += r["valueCr"] or 0
            p[r["side"] + "Qty"] += r["qty"]
            p["first"], p["last"] = min(p["first"], r["day"]), max(p["last"], r["day"])
        shares = []
        for p in per.values():
            p.update(buyCr=round(p["buyCr"], 2), sellCr=round(p["sellCr"], 2), netCr=round(p["buyCr"] - p["sellCr"], 2), bothSides=p["buyQty"] > 0 and p["sellQty"] > 0)
            shares.append(p)
        shares.sort(key=lambda p: -(p["buyCr"] + p["sellCr"]))
        names = sorted({r["client"] for r in rows if r["client"]})
        return {"clientKey": ck, "client": max(names, key=lambda n: sum(1 for r in rows if r["client"] == n)) if names else None, "spellings": names,
                "rows": rows, "shares": shares, "bothSides": [p["symbol"] for p in shares if p["bothSides"]],
                "buyCr": round(sum(p["buyCr"] for p in shares), 2), "sellCr": round(sum(p["sellCr"] for p in shares), 2),
                "coverage": cov, "sources": SOURCES, "note": NOTE}

    body = await cached(("client", ck), build)
    if not json.loads(body)["rows"]:
        _cache.pop(("client", ck), None)
        raise HTTPException(status_code=404, detail="No deals held for that client")
    return Response(body, media_type="application/json", headers=HEADERS)


IPO_SQL = """SELECT g.ig_id, g.nse AS symbol, g.name, g.listing_date, g.detail -> 'timetable' AS tt,
    count(d.id) FILTER (WHERE d.kind IN ('bulk', 'block') AND NOT d.also_block) AS n,
    coalesce(sum(d.value_cr) FILTER (WHERE d.kind IN ('bulk', 'block') AND NOT d.also_block AND d.side = 'buy'), 0) AS buy,
    coalesce(sum(d.value_cr) FILTER (WHERE d.kind IN ('bulk', 'block') AND NOT d.also_block AND d.side = 'sell'), 0) AS sell
    FROM ipo_gmp g LEFT JOIN market_deals d ON d.symbol = g.nse AND d.day >= g.listing_date
    WHERE g.listed AND g.nse IS NOT NULL AND g.listing_date IS NOT NULL
    GROUP BY g.ig_id, g.nse, g.name, g.listing_date, g.detail -> 'timetable'"""


@router.get("/api/deals/ipos")
async def ipos(request: Request) -> Response:
    """Public. For the IPO pages: per listed IPO (by record id) the deals since listing (count, bought, sold, net, each trade once), and the anchor
    lock-in ends in the next 45 days with the deals in those shares over the last 30 days."""
    store = request.app.state.store

    async def build():
        today = today_ist()
        async with store.pool.acquire() as conn:
            rs = [dict(x) for x in await conn.fetch(IPO_SQL)]
            cov = await coverage(conn)
            first = date.fromisoformat(cov["first_day"]) if cov["first_day"] else None
            by_id, ahead = {}, []
            for r in rs:
                if r["n"]:
                    by_id[r["ig_id"]] = {"symbol": r["symbol"], "deals": r["n"], "buyCr": round(float(r["buy"]), 2), "sellCr": round(float(r["sell"]), 2),
                                         "netCr": round(float(r["buy"]) - float(r["sell"]), 2)}
                tt = (json.loads(r["tt"]) if isinstance(r["tt"], str) else r["tt"]) or {}
                for k, label in (("anchorLockin30", "Anchor lock-in ends (50%)"), ("anchorLockin90", "Anchor lock-in ends (rest)")):
                    try:
                        d = date.fromisoformat(str(tt.get(k))[:10]) if tt.get(k) else None
                    except ValueError:
                        d = None
                    if d and today <= d <= today + timedelta(days=45):
                        ahead.append({"id": r["ig_id"], "symbol": r["symbol"], "name": r["name"], "date": d.isoformat(), "what": label})
            recent: Dict[str, Any] = {}
            syms = sorted({x["symbol"] for x in ahead})
            if syms:
                for x in await conn.fetch("""SELECT symbol, count(*) AS n, coalesce(sum(value_cr) FILTER (WHERE side = 'buy'), 0) AS buy,
                        coalesce(sum(value_cr) FILTER (WHERE side = 'sell'), 0) AS sell FROM market_deals
                        WHERE symbol = ANY($1) AND day >= $2 AND kind IN ('bulk', 'block') AND NOT also_block GROUP BY symbol""", syms, today - timedelta(days=30)):
                    recent[x["symbol"]] = {"deals": x["n"], "buyCr": round(float(x["buy"]), 2), "sellCr": round(float(x["sell"]), 2)}
        ahead.sort(key=lambda x: (x["date"], x["name"] or ""))
        for x in ahead:
            x["recent"] = recent.get(x["symbol"])
        return {"byId": by_id, "lockinsAhead": ahead, "historyFrom": first.isoformat() if first else None, "coverage": cov, "sources": SOURCES, "note": NOTE}

    return Response(await cached(("ipos",), build), media_type="application/json", headers=HEADERS)


# ------------------------------------------------------------------------------------------------ follows (a member's alerts on new deals)
async def _follows(conn, uid) -> Dict[str, Any]:
    rs = await conn.fetch("SELECT what, key FROM deal_follows WHERE user_id = $1 ORDER BY created_at", uid)
    return {"symbols": [r["key"] for r in rs if r["what"] == "symbol"], "clients": [r["key"] for r in rs if r["what"] == "client"], "max": FOLLOW_MAX}


FOLLOW_MAX = 50


def _follow_key(what: str, key: str) -> str:
    if what == "symbol":
        k = key.strip().upper()
        if not k or len(k) > 30 or not all(ch.isalnum() or ch in "&-_." for ch in k):
            raise HTTPException(status_code=422, detail="That is not a share symbol")
        return k
    k = norm_client(key)
    if not k:
        raise HTTPException(status_code=422, detail="That is not a client name")
    return k[:160]


@router.get("/api/me/deal-follows")
async def get_deal_follows(request: Request, ctx: Ctx = Depends(secure_ctx)):
    """Signed in. The shares and clients this member follows for new-deal notifications."""
    async with request.app.state.store.pool.acquire() as conn:
        return await _follows(conn, ctx.user_id)


@router.put("/api/me/deal-follows/{what}/{key}")
async def follow_deals(request: Request, what: str = Path(..., pattern="^(symbol|client)$"), key: str = Path(..., min_length=1, max_length=160), ctx: Ctx = Depends(secure_ctx)):
    """Signed in. Follow a share or a client: a notification when NSE publishes a new bulk or block deal in it (or by it)."""
    k = _follow_key(what, key)
    async with request.app.state.store.pool.acquire() as conn:
        if await conn.fetchval("SELECT count(*) FROM deal_follows WHERE user_id = $1", ctx.user_id) >= FOLLOW_MAX:
            raise HTTPException(status_code=409, detail=f"You follow {FOLLOW_MAX} shares and clients already; stop following one first.")
        await conn.execute("INSERT INTO deal_follows (user_id, what, key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", ctx.user_id, what, k)
        return await _follows(conn, ctx.user_id)


@router.delete("/api/me/deal-follows/{what}/{key}")
async def unfollow_deals(request: Request, what: str = Path(..., pattern="^(symbol|client)$"), key: str = Path(..., min_length=1, max_length=160), ctx: Ctx = Depends(secure_ctx)):
    k = _follow_key(what, key)
    async with request.app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM deal_follows WHERE user_id = $1 AND what = $2 AND key = $3", ctx.user_id, what, k)
        return await _follows(conn, ctx.user_id)
