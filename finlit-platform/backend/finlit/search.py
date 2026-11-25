"""Data for the site-wide search box beyond names: today's price and change and the logo of every company, plus the fund-house logos for fund
and ETF results.

The name list itself stays `/api/stocks/search-index` (public, cached for long, read by several tools). This payload is separate because
it changes every minute in market hours. It is built once per access level and kept in Redis (private, varies by cookie).

Rows: [symbol, price, change %, price date (YYYY-MM-DD, India), score, band, logo path or null]. Task #283 PR C (21 Nov 2026): the score and band
were the retired FinLit IQ's; they are always null now (the positions stay so older readers of the rows keep working). FinLit Prism, FinLit's only
company score, is read by the search box from /api/prism/scores on a plan that has it.
Price and change come from the company's stored report when that is fresher (updated every minute in market hours), otherwise from the
nightly market-wide listing; the date always travels with the price, so an old close is never shown as today's move.
"""
from __future__ import annotations

import gzip
import time
import zlib
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

import orjson

from fastapi import APIRouter, Request
from fastapi.responses import Response

from .auth.entitlements import has
from .auth.service import current
from .background import etag_matches
from . import livequote
from .dhan import plausible
from .logos import AMC_SITES, amc_logos, logo_path
from .store import dumps, etag_for

router = APIRouter(prefix="/api/search")
IST = timezone(timedelta(hours=5, minutes=30))
TTL = 60     # task #338: the latest prices (livequote) change every minute in market hours; was 120
CACHE = "private, no-cache"

QUOTES_SQL = """
SELECT c.symbol, s.price AS sp, s.change_pct AS sc, s.updated_at AS su,
       q.price AS qp, q.change_pct AS qc, coalesce(q.traded_at, q.updated_at) AS qt, g.sha8, g.width AS lw, g.height AS lh, g.status AS ls
FROM companies c
LEFT JOIN LATERAL (SELECT price, change_pct, updated_at FROM scores
                   WHERE symbol = c.symbol AND model = 'v1' ORDER BY (statement = 'consolidated') DESC, updated_at DESC LIMIT 1) s ON true
LEFT JOIN listing_quotes q ON q.symbol = c.symbol
LEFT JOIN logos g ON g.owner_kind = 'stock' AND g.owner_key = c.symbol AND g.status IN ('ok', 'manual') AND g.sha8 IS NOT NULL
"""
# The rows behind both levels, kept in Redis: a rebuild reads only the companies whose score or listing row changed since the last one (about 5,800 rows
# of ~80 bytes is half a megabyte, and the minute-by-minute prices would otherwise make every two-minute rebuild read all of it).
RAW_KEY = "search-quotes:raw:v2"   # v2 (25 Nov 2026): rows carry the logo's size and status
FULL_EVERY = 6 * 3600     # all rows again (also catches companies that left or joined and a changed logo)
MARGIN = 120
PROBE_SQL = ("SELECT (SELECT count(*) FROM scores WHERE model = 'v1') AS sn, (SELECT max(changed_at) FROM scores WHERE model = 'v1') AS sa, "
             "(SELECT count(*) FROM listing_quotes) AS ln, (SELECT max(updated_at) FROM listing_quotes) AS la, (SELECT count(*) FROM companies) AS cn")


def _num(v):
    return None if v is None else round(float(v), 2)


def session_of(at: datetime) -> date:
    """The trading day a price saved at `at` belongs to: a row written before 15:30 IST or on a weekend carries the previous weekday's close
    (exchange holidays are not known here, so a holiday is labelled as the day before it)."""
    t = at.astimezone(IST)
    d = t.date() if (t.hour, t.minute) >= (15, 30) else t.date() - timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


SHARP_PX = 96   # owner, 25 Nov 2026: logos looked blurry. A company header draws a logo at about 56px (112 real pixels on a phone); a 16-48px favicon
               # blown up to that is a blur. With a Logo.dev key set, such a small icon is left out and the page draws Logo.dev's 128px image instead.


def sharp_logo(r) -> Optional[str]:
    """Our own logo's path, unless a Logo.dev key is on and it is a small favicon (a hand-set logo is always kept)."""
    path = logo_path(r.get("sha8"))
    if path and r.get("_cdn") and r.get("ls") != "manual" and r.get("lw") and r.get("lh") and min(r["lw"], r["lh"]) < SHARP_PX:
        return None
    return path


def quote_rows(rows, level: str, showcase: set, cdn: bool = False) -> list:
    """The compact rows above. The score and band positions are always null: they held the retired FinLit IQ (task #283 PR C)."""
    out = []
    for r in rows:
        # The report's price is a snapshot from whenever it was loaded; the listing row is refreshed after each close. The report wins only when it is from a LATER
        # trading day than the listing row (its write time is not comparable with a trade time: a Saturday write must not beat Friday's closing quote).
        use_report = r["sp"] is not None and (r["qp"] is None or r["qt"] is None or (r["su"] is not None and session_of(r["su"]) > r["qt"].astimezone(IST).date()))
        price, chg, at = (r["sp"], r["sc"], r["su"]) if use_report else (r["qp"], r["qc"], r["qt"])
        score, band = None, None
        logo = sharp_logo({**r, "_cdn": cdn}) if cdn else logo_path(r["sha8"])
        if price is None and logo is None:
            continue                                   # nothing to add to the name list
        when = None if not at or price is None else (session_of(at) if use_report else at.astimezone(IST).date())   # a score row's time is when it was written, not when it traded
        row = [r["symbol"], _num(price), _num(chg), when.isoformat() if when else None, score, band, logo]
        if cdn and logo is None and r.get("sha8"):
            row.append(logo_path(r["sha8"]))   # the small own logo, kept as the page's backup when Logo.dev has no image for this company
        out.append(row)
    return out


def _rec(r) -> dict:
    return {k: (float(v) if isinstance(v, Decimal) else v.isoformat() if isinstance(v, datetime) else v) for k, v in dict(r).items()}


def _hydrate(rec: dict) -> dict:
    return {k: (datetime.fromisoformat(v) if k in ("su", "qt") and v else v) for k, v in rec.items()}


async def _raw_rows(store) -> list:
    """QUOTES_SQL's rows, in company order, from Redis plus whatever changed since (see RAW_KEY). Falls back to reading everything."""
    state, now = None, time.time()
    try:
        raw = await store.redis.get(RAW_KEY)
        state = orjson.loads(zlib.decompress(raw)) if raw else None
    except Exception:
        state = None
    async with store.pool.acquire() as conn:
        try:
            p = await conn.fetchrow(PROBE_SQL)
        except Exception:   # a column the probe needs is missing (migrations not applied yet): read everything, as before
            p = None
        sig = None if p is None else {"sn": p["sn"], "sa": p["sa"].isoformat() if p["sa"] else None, "ln": p["ln"], "la": p["la"].isoformat() if p["la"] else None, "cn": p["cn"]}
        old = state and state.get("sig")
        if sig and old and now - state["full_at"] < FULL_EVERY and sig["cn"] == old["cn"] and sig["sn"] >= old["sn"] and sig["ln"] >= old["ln"]:
            if sig == old:
                return state["rows"]
            def since(k):
                return datetime.fromisoformat(old[k]) - timedelta(seconds=MARGIN) if old[k] else datetime.fromtimestamp(0, timezone.utc)
            changed = await conn.fetch(
                "SELECT * FROM (" + QUOTES_SQL + ") q WHERE q.symbol IN (SELECT symbol FROM scores WHERE model = 'v1' AND changed_at > $1 "  # nosec B608 - fixed text
                "UNION SELECT symbol FROM listing_quotes WHERE updated_at > $2)", since("sa"), since("la"))
            by = {r["symbol"]: i for i, r in enumerate(state["rows"])}
            rows = list(state["rows"])
            for r in changed:
                rec = _rec(r)
                if r["symbol"] in by:
                    rows[by[r["symbol"]]] = rec
                else:
                    rows.append(rec)
            state = {"sig": sig, "full_at": state["full_at"], "rows": rows}
        else:
            state = {"sig": sig, "full_at": now, "rows": [_rec(r) for r in await conn.fetch(QUOTES_SQL)]}
    try:
        await store.redis.set(RAW_KEY, zlib.compress(orjson.dumps(state), 6), ex=2 * FULL_EVERY)
    except Exception:   # nosec B110 - Redis down: the rows just read are used once
        pass
    return state["rows"]


def with_latest(rows: list, latest: dict) -> list:
    """Task #338: each row's price replaced by the company's latest quote (livequote) when that is from the same trading day or later and
    passes the plausibility check, so the watchlist, the search list and the company page show one price for the same moment."""
    for r in rows:
        q = latest.get(r[0])
        if not q or not q.get("price") or not q.get("asOf"):
            continue
        try:
            day = datetime.fromisoformat(q["asOf"]).astimezone(IST).date()
        except (TypeError, ValueError):
            continue
        if r[3] and day.isoformat() < r[3]:
            continue
        if r[1] and not plausible(q, {"price": r[1]}):   # a wrong company match: the row keeps its own price
            continue
        r[1], r[2], r[3] = _num(q["price"]), _num(q.get("changePct")), day.isoformat()
    return rows


# Companies whose Logo.dev image is wrong or poor, from a by-eye review of the 400 largest companies (owner, 25 Nov 2026: "the TCS logo is the
# Tata logo"). Logo.dev maps them to a parent or group brand, or serves a blurred or cropped image. They keep their own logo, else the initials
# tile, until a correct official logo is set by hand (Console > Data health), which always wins. Add a symbol here when a review finds another.
LOGO_CDN_SKIP = (
    "TCS", "TATATECH", "TATAINVEST", "LTTS", "M&M", "M&MFIN", "JIOFIN", "GILLETTE",            # a parent or group brand, not the company's own
    "EICHERMOT", "ADANIGREEN", "ATGL", "MAHABANK", "BEL", "CHOLAHLDNG", "EIHOTEL", "INOXINDIA", "CRAFTSMAN", "LODHA",   # blurred, cropped or unclear
    # One identical image served for unrelated companies (scan of all 5,760, 25 Nov 2026): a placeholder, not their logo. Shared images within one
    # group (JSW, Adani, Tata Motors, Kirloskar, Godrej, Welspun, Rane, Ujjivan, SKF, Sanofi...) are that group's real brand and are kept.
    "BFINVEST", "IWEL", "KCK", "STEELCITY", "EROSMEDIA", "ESSENTIA", "FOCUS", "HEXATRADEX", "LORDSCHLO", "MCCHRLS-B", "MEGAFLEX",
    "AHLWEST", "JAICORPLTD", "SILINV", "SAB", "STLSTRINF", "AHLEAST", "SPLIL", "BIOFILCHEM", "NARMADA", "CRESTO",
)


def logo_cdn_key(key: str) -> Optional[str]:
    """Only a Logo.dev PUBLISHABLE key goes to the page; a secret key (sk_...) or anything else is never sent."""
    key = (key or "").strip()
    return key if key.startswith("pk_") and key[3:].replace("_", "").replace("-", "").isalnum() and len(key) <= 80 else None


async def build(app, level: str):
    store = app.state.store
    rows = [_hydrate(r) for r in await _raw_rows(store)]
    amc = await amc_logos(store)
    body = dumps({"fields": ["symbol", "price", "changePct", "priceDate", "score", "band", "logo", "logoBackup"],
                  "rows": with_latest(quote_rows(rows, level, set(app.state.settings.showcase_symbols), cdn=bool(logo_cdn_key(app.state.settings.logo_dev_key))), await livequote.read(store.redis)),
                  "amcLogos": {k: logo_path(v) for k, v in amc.items() if k in AMC_SITES},
                  "logoCdn": logo_cdn_key(app.state.settings.logo_dev_key),
                  "logoCdnSkip": list(LOGO_CDN_SKIP),
                  "level": level, "builtAt": int(time.time())})
    packed = gzip.compress(body, compresslevel=6, mtime=0)
    etag = etag_for(body)
    try:
        key = f"search-quotes:{level}"
        await store.redis.hset(key, mapping={"body": body, "gzip": packed, "etag": etag.encode()})
        await store.redis.expire(key, TTL)
    except Exception:   # nosec B110 - Redis down: serve what was just built
        pass
    return body, packed, etag


MAX_SYMBOLS = 200


def wanted_symbols(raw: Optional[str]) -> Optional[set]:
    """The symbols of ?symbols=A,B,C (upper-cased, at most MAX_SYMBOLS); None when the parameter is absent, so the whole list is served. An empty value means no company."""
    if raw is None:
        return None
    return set(list(dict.fromkeys(p.strip().upper() for p in raw.split(",") if p.strip() and len(p.strip()) <= 40))[:MAX_SYMBOLS])


def _only(doc: dict, wanted: set) -> dict:
    """The saved quotes document cut down to the wanted symbols (the other fields, including the AMC logos, stay as they are)."""
    return {**doc, "rows": [r for r in doc.get("rows", []) if r[0] in wanted]}


@router.get("/quotes")
async def quotes(request: Request):
    level = "silver" if has((await current(request)).plan, "silver") else "basic"
    store = request.app.state.store
    try:
        hit = await store.redis.hmget(f"search-quotes:{level}", ["body", "gzip", "etag"])
    except Exception:
        hit = [None, None, None]
    if hit[0] is None or hit[1] is None or hit[2] is None:
        body, packed, etag = await build(request.app, level)
    else:
        body, packed, etag = hit[0], hit[1], hit[2].decode()
    wanted = wanted_symbols(request.query_params.get("symbols"))
    if wanted is not None:   # ?symbols=A,B: only those rows (the dashboard follows a handful of stocks, not 5,000); a filtered copy is built per request from the saved one
        doc = _only(orjson.loads(body), wanted)
        doc["rows"] = with_latest(doc["rows"], await livequote.read(store.redis, sorted(wanted)))   # a handful of rows: the latest prices of this moment
        body = dumps(doc)
        packed, etag = gzip.compress(body, compresslevel=6, mtime=0), etag_for(body)
    headers = {"ETag": etag, "Cache-Control": CACHE, "Vary": "Cookie, Accept-Encoding"}
    if etag_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)
    if "gzip" in (request.headers.get("accept-encoding") or ""):
        return Response(content=packed, media_type="application/json", headers={**headers, "Content-Encoding": "gzip"})
    return Response(content=body, media_type="application/json", headers=headers)


LIVE_CACHE = "public, max-age=15"


@router.get("/live")
async def live(request: Request):
    """Task #338: the latest quote of each company in ?symbols=A,B (at most MAX_SYMBOLS), the same prices the watchlist and search list show.
    The company page asks again every 30 seconds in market hours and lays the quote over its report's price when it is newer; the trade time
    (asOf) is shown beside the price. {"quotes": {symbol: {price, change, changePct, previousClose, open, high, low, volume, upperCircuit,
    lowerCircuit, asOf}}}; a company with no latest quote is left out (the page keeps the report's price)."""
    wanted = wanted_symbols(request.query_params.get("symbols")) or set()
    body = dumps({"quotes": await livequote.read(request.app.state.store.redis, sorted(wanted)) if wanted else {}})
    return Response(content=body, media_type="application/json", headers={"Cache-Control": LIVE_CACHE})
