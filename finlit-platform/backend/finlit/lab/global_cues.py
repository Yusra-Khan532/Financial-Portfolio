"""Trading Lab > Global cues (docs/GLOBAL-MARKETS.md, step 1; founder, 26 Nov 2026: "the global market actually affects the Indian market").

One screen of what moved outside India that Indian markets react to, from sources whose terms let FinLit show the numbers:

  * International ETFs on NSE (Dhan quotes, the same feed as every price on the site): Nasdaq 100, NYSE FANG+, S&P 500 Top 50, Nasdaq Quality 50,
    Hang Seng, Hang Seng Tech. Shown as the ETF's own price in rupees, never as the index (index levels are licensed by their owners).
  * India VIX (Dhan).
  * From FRED's public download (no key; the same way the macro page reads Brent): US 10-year and 2-year Treasury yields and the effective Fed
    funds rate (Federal Reserve H.15), the broad US dollar index and EUR, JPY and CNY against the dollar (Federal Reserve H.10), WTI and Brent
    crude (U.S. EIA). All are US government series without a copyright note, so FRED's terms let them be shown.
  * USD/INR: the FBIL reference rate the macro job already stores.

Facts only: "US 10-year yield up 0.08 points", never what it means for a share. The daily series are loaded by the `global-cues` job
(command refresh-global-cues) after the US close and again in the evening; the ETF quotes are read when the page asks, one shared Dhan call
kept for a minute.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from ..auth.service import Ctx
from ..dhan import IST, to_quote
from .access import lab_ctx

log = logging.getLogger("finlit.lab.global")
router = APIRouter()

FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv"
FRED_PAGE = "https://fred.stlouisfed.org/series/"
H15, H10, EIA = "Federal Reserve (H.15)", "Federal Reserve (H.10)", "U.S. EIA"
# key -> (FRED id, label, unit, group, what, source). Every id was checked on FRED for a copyright note: none has one.
FRED: Dict[str, Tuple[str, str, str, str, str, str]] = {
    "us10y": ("DGS10", "US 10-year Treasury yield", "%", "rates", "The yield on US government bonds due in 10 years; the main US long-term rate.", H15),
    "us2y": ("DGS2", "US 2-year Treasury yield", "%", "rates", "The yield on US government bonds due in 2 years; it follows expectations for the Fed's rate.", H15),
    "fedfunds": ("DFF", "Fed funds rate (effective)", "%", "rates", "The overnight rate US banks lend to each other at; the Federal Reserve's policy rate in practice.", H15),
    "dxy": ("DTWEXBGS", "US dollar index (broad)", "index", "fx", "The dollar against the currencies of the United States' main trading partners (Federal Reserve's broad index, Jan 2006 = 100).", H10),
    "eurusd": ("DEXUSEU", "Euro", "US$ per €", "fx", "US dollars for one euro (noon buying rate in New York).", H10),
    "usdjpy": ("DEXJPUS", "Japanese yen", "¥ per US$", "fx", "Yen for one US dollar (noon buying rate in New York).", H10),
    "usdcny": ("DEXCHUS", "Chinese yuan", "¥ per US$", "fx", "Yuan for one US dollar (noon buying rate in New York).", H10),
    "wti": ("DCOILWTICO", "WTI crude", "US$/bbl", "oil", "US crude oil, West Texas Intermediate, spot price at Cushing, Oklahoma, US dollars a barrel.", EIA),
    "brent": ("DCOILBRENTEU", "Brent crude", "US$/bbl", "oil", "Europe Brent crude, spot price, US dollars a barrel: the benchmark for most of India's oil imports.", EIA),
}
SERIES = {k: "glob." + v[0].lower() for k, v in FRED.items()}   # "glob." not "g_": an underscore is a LIKE wildcard
# International ETFs listed on NSE: symbol -> (label, what it holds, fallback Dhan id from the instrument file of 26 Nov 2026)
ETFS: Dict[str, Tuple[str, str, str]] = {
    "MON100": ("Nasdaq 100 ETF", "Holds the 100 largest non-financial companies on the US Nasdaq exchange (Motilal Oswal).", "22739"),
    "MAFANG": ("NYSE FANG+ ETF", "Holds ten large US technology and internet companies (Mirae Asset).", "3507"),
    "MASPTOP50": ("S&P 500 Top 50 ETF", "Holds the 50 largest companies of the US S&P 500 (Mirae Asset).", "5782"),
    "MONQ50": ("Nasdaq Quality 50 ETF", "Holds 50 Nasdaq-listed US companies chosen by profitability and balance sheet (Motilal Oswal).", "7422"),
    "HNGSNGBEES": ("Hang Seng ETF", "Holds the companies of Hong Kong's Hang Seng index (Nippon India).", "18284"),
    "MAHKTECH": ("Hang Seng Tech ETF", "Holds the 30 largest technology companies listed in Hong Kong (Mirae Asset).", "7074"),
}
VIX_ID = "21"
LIVE_KEY, LIVE_TTL = "lab:global:live", 60
GROUPS = [("etf", "Global markets on NSE"), ("rates", "US interest rates"), ("fx", "Dollar and currencies"), ("oil", "Crude oil"), ("india", "India")]
SPARK_DAYS = 120


def parse_csv(text: str) -> Dict[date, float]:
    """FRED's csv (observation_date,ID): a blank day is '.' or empty, skipped and never filled in."""
    pts: Dict[date, float] = {}
    for line in text.splitlines()[1:]:
        d, _, v = line.partition(",")
        try:
            pts[date.fromisoformat(d.strip())] = round(float(v), 4)
        except ValueError:
            continue
    return pts


async def refresh(store, client: Optional[httpx.AsyncClient] = None, today: Optional[date] = None) -> dict:
    """The `global-cues` job: each FRED series, about 14 months the first time and the last 45 days after; saved in macro_points."""
    from ..macro import save_points
    today = today or date.today()
    own = client is None
    client = client or httpx.AsyncClient(timeout=60, follow_redirects=True, headers={"User-Agent": "FinLit (finlitventures.com) market data"})
    out: Dict[str, Any] = {"series": {}, "failed": []}
    try:
        async with store.pool.acquire() as conn:
            for key, (fid, *_rest) in FRED.items():
                have = await conn.fetchval("SELECT count(*) FROM macro_points WHERE series = $1", SERIES[key])
                start = today - timedelta(days=45 if have else 430)
                try:
                    r = await client.get(FRED_CSV, params={"id": fid, "cosd": start.isoformat()})
                    pts = parse_csv(r.text) if r.status_code == 200 else {}
                except httpx.HTTPError:
                    pts = {}
                if not pts:
                    out["failed"].append(fid)
                    continue
                out["series"][key] = await save_points(conn, SERIES[key], pts)
    finally:
        if own:
            await client.aclose()
    out["status"] = "ok" if out["series"] else "failed"
    if not out["series"]:
        out["error"] = "FRED did not answer for any series"
    return out


def cue(key: str, label: str, unit: str, group: str, what: str, source: str, url: str, pts: Dict[date, float], bp: bool = False) -> Optional[dict]:
    """The latest value with its previous one and the change; `bp`: the change of a rate in points (0.08), else also in per cent."""
    if not pts:
        return None
    days = sorted(pts)
    last, prev = days[-1], (days[-2] if len(days) > 1 else None)
    v, p = pts[last], (pts[prev] if prev else None)
    ch = None if p is None else round(v - p, 4)
    year = [pts[d] for d in days if d > last - timedelta(days=365)]
    return {"key": key, "label": label, "unit": unit, "group": group, "what": what, "source": source, "sourceUrl": url,
            "date": last.isoformat(), "value": v, "prev": p, "prevDate": prev.isoformat() if prev else None,
            "change": ch, "changePct": None if bp or not p else round(ch / p * 100, 2),
            "yearLow": min(year), "yearHigh": max(year),
            "spark": [[d.isoformat(), pts[d]] for d in days if d > last - timedelta(days=SPARK_DAYS)]}


async def daily_cues(conn) -> List[dict]:
    from ..macro import load_points
    got = await load_points(conn, "glob.")
    out = []
    for key, (fid, label, unit, group, what, source) in FRED.items():
        c = cue(key, label, unit, group, what, source, FRED_PAGE + fid, got.get(SERIES[key], {}), bp=unit == "%")
        if c:
            out.append(c)
    a, b = got.get(SERIES["us10y"], {}), got.get(SERIES["us2y"], {})
    spread = {d: round(a[d] - b[d], 4) for d in a if d in b}
    c = cue("spread", "US 10-year minus 2-year", "% points", "rates",
            "The 10-year yield less the 2-year yield. Below zero, short-term US rates are higher than long-term ones (an inverted curve).",
            "Derived from Federal Reserve (H.15)", FRED_PAGE + "T10Y2Y", spread, bp=True)
    if c:
        out.append(c)
    fx = (await load_points(conn, "usdinr_d")).get("usdinr_d", {})
    c = cue("usdinr", "Rupee per US dollar", "₹ per US$", "india", "The FBIL reference rate: rupees for one US dollar, set each working day.",
            "RBI / FBIL", "https://www.fbil.org.in", fx)
    if c:
        out.append(c)
    return out


async def _etf_ids(conn) -> Dict[str, str]:
    rows = await conn.fetch("SELECT symbol, security_id FROM dhan_instruments WHERE exch = 'NSE' AND symbol = ANY($1::text[])", list(ETFS))
    got = {r["symbol"]: r["security_id"] for r in rows}
    return {s: got.get(s, fallback) for s, (_l, _w, fallback) in ETFS.items()}


def live_cues(data: Dict[str, Dict[str, dict]], ids: Dict[str, str]) -> List[dict]:
    """The ETFs and India VIX from one /marketfeed/quote answer: {segment: {security id: raw}}."""
    out = []
    eq = data.get("NSE_EQ") or {}
    for sym, (label, what, _f) in ETFS.items():
        q = to_quote(eq.get(ids[sym]) or eq.get(int(ids[sym])) or {}) if ids.get(sym) else {}
        if not q:
            continue
        out.append({"key": sym.lower(), "symbol": sym, "label": label, "unit": "₹", "group": "etf", "what": what + " Traded on NSE in rupees, so it moves with its market and the rupee, and can trade above or below the value of what it holds.",
                    "source": "NSE via Dhan", "sourceUrl": f"https://www.nseindia.com/get-quotes/equity?symbol={sym}",
                    "value": q["price"], "prev": q.get("previousClose"), "change": q.get("change"), "changePct": q.get("changePct"),
                    "dayLow": q.get("low"), "dayHigh": q.get("high"), "asOf": q.get("asOf"), "live": True})
    vix = to_quote((data.get("IDX_I") or {}).get(VIX_ID) or (data.get("IDX_I") or {}).get(int(VIX_ID)) or {})
    if vix:
        out.append({"key": "indiavix", "label": "India VIX", "unit": "index", "group": "india", "live": True,
                    "what": "NSE's measure of how much the Nifty 50 is expected to move over the next 30 days, worked out from Nifty option prices.",
                    "source": "NSE via Dhan", "sourceUrl": "https://www.nseindia.com/reports-indices-historical-vix",
                    "value": vix["price"], "prev": vix.get("previousClose"), "change": vix.get("change"), "changePct": vix.get("changePct"), "asOf": vix.get("asOf")})
    return out


async def _live(app, conn) -> Tuple[List[dict], Optional[str]]:
    redis = app.state.store.redis
    try:
        raw = await redis.get(LIVE_KEY)
        if raw:
            body = orjson.loads(raw)
            return body["items"], body.get("note")
    except Exception:
        pass
    from ..options import _ask
    ids = await _etf_ids(conn)
    note = None
    try:
        data = await _ask(app, "/marketfeed/quote", {"NSE_EQ": [int(v) for v in ids.values()], "IDX_I": [int(VIX_ID)]}) or {}
        items = live_cues(data, ids)
    except Exception as e:                  # Dhan not configured or not answering: the daily cues still show
        log.info("global cues: quotes unavailable (%s)", type(e).__name__)
        items, note = [], "Live ETF prices could not be read right now; they come back by themselves."
    try:
        await redis.set(LIVE_KEY, orjson.dumps({"items": items, "note": note}), ex=LIVE_TTL if items else 15)
    except Exception:
        pass
    return items, note


@router.get("/api/lab/global")
async def global_cues(request: Request, _ctx: Ctx = Depends(lab_ctx)):
    async with request.app.state.store.pool.acquire() as conn:
        daily = await daily_cues(conn)
        live, note = await _live(request.app, conn)
    items = live + daily
    body = {"groups": [{"key": k, "name": n, "items": [i for i in items if i["group"] == k]} for k, n in GROUPS],
            "asOf": datetime.now(timezone.utc).astimezone(IST).isoformat(timespec="seconds"), "notes": [note] if note else []}
    if not daily:
        body["notes"].append("The daily global series load after the US close each day; none is stored yet.")
    body["groups"] = [g for g in body["groups"] if g["items"]]
    return Response(content=orjson.dumps(body), media_type="application/json", headers={"Cache-Control": "no-store"})
