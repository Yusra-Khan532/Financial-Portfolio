"""Global markets (task #294, 21 Nov 2026: "we need to make this on dashboard"; the team's pictures: a Global Markets Tracker with a world view and the
overnight context Indian markets open against, and the free sources to use: Twelve Data, Finnhub, Alpha Vantage and FRED).

What it shows: US, Europe and Asia indices, gold, crude, the rupee and the US 10-year yield, each with its latest value, the 1-day, 1-week and 1-month
moves and a 1-month line, plus where each market is in its trading day (open or closed now) for the world view on the dashboard.

Sources, read when asked and kept for an hour (no background job is added):
  * FRED (St. Louis Fed), open and without a key: S&P 500, Nasdaq Composite, Dow Jones, Nikkei 225, Brent crude, the US 10-year Treasury yield and the
    rupee per US dollar. Daily closes: the latest is usually the last US trading day.
  * Twelve Data, with the key TWELVEDATA_API_KEY in the server's environment, or else EODHD with EODHD_API_KEY: FTSE 100 (on EODHD's free plan through
    a fund that tracks it, labelled so), DAX, CAC 40, Hang Seng, Shanghai Composite and spot gold. Without
    the key those rows are listed and say why they are empty; nothing is guessed. The free plan allows 8 requests a minute, so the hour's cache and one
    request per series keep well inside it; a series the plan does not include says so.
Describes; never advises. Information only, not investment advice.
"""
from __future__ import annotations

import asyncio
import csv
import io
import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import httpx
import orjson
from fastapi import APIRouter, Request, Response

log = logging.getLogger("finlit.global_markets")
router = APIRouter()

CACHE_KEY = "global-markets:v3"   # v3: the FTSE 100 row through a tracker fund (a fresh answer on deploy, not the hour-old one)
CACHE_SECONDS = 3600
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"
TWELVE_URL = "https://api.twelvedata.com/time_series"
DISCLAIMER = "Information only, not investment advice. Prices are the providers' daily closes; a market's latest close can be a day or more old."
NO_KEY = "Not connected yet: this series needs a market-data key on the server (EODHD or Twelve Data)."
# Task #298 follow-up (the founder, 21 Nov: "we have not this [Twelve Data key]; how can we get this, or other ways"): EODHD's free plan (20 calls a
# day, a year of daily closes) gives the Europe, Hong Kong and Shanghai indices and gold with EODHD_API_KEY. Daily closes change once a day, so each
# series is read from EODHD at most twice a day (kept in Redis for 12 hours): 6 series, 12 calls, inside the free 20. Twelve Data, when its key is set,
# still comes first.
EODHD_URL = "https://eodhd.com/api/eod/{sym}"
EODHD_KEEP = 12 * 3600

# key, label, group, unit, source, source id, city, lat, lon, time zone, session (local open, close)
SERIES: List[Dict[str, Any]] = [
    {"key": "sp500", "label": "S&P 500", "group": "US", "unit": "pts", "src": "fred", "id": "SP500", "city": "New York", "lat": 40.71, "lon": -74.01, "tz": "America/New_York", "session": ("09:30", "16:00")},
    {"key": "nasdaq", "label": "Nasdaq Composite", "group": "US", "unit": "pts", "src": "fred", "id": "NASDAQCOM", "city": "New York", "lat": 40.71, "lon": -74.01, "tz": "America/New_York", "session": ("09:30", "16:00")},
    {"key": "dow", "label": "Dow Jones", "group": "US", "unit": "pts", "src": "fred", "id": "DJIA", "city": "New York", "lat": 40.71, "lon": -74.01, "tz": "America/New_York", "session": ("09:30", "16:00")},
    # The FTSE 100 index is not in EODHD's free plan (UKX.INDX and FTSE.INDX answer with no closes), so the row shows a fund that tracks it, said as such
    # (the founder, 22 Nov 2026: "use the labelled tracker fund for FTSE 100"). Its 1D / 1W / 1M moves follow the index; its price is the fund's, not
    # the index level. Twelve Data (when its key is set) still gives the index itself first.
    {"key": "ftse", "label": "FTSE 100", "group": "Europe", "unit": "pts", "src": "twelve", "id": "FTSE", "city": "London", "lat": 51.51, "lon": -0.13, "tz": "Europe/London", "session": ("08:00", "16:30"),
     "trackers": (("ISF.LSE", "iShares Core FTSE 100 UCITS ETF (ISF)", "GBX"), ("VUKE.LSE", "Vanguard FTSE 100 UCITS ETF (VUKE)", "GBP"))},
    {"key": "dax", "label": "DAX", "group": "Europe", "unit": "pts", "src": "twelve", "id": "DAX", "eod": "GDAXI.INDX", "city": "Frankfurt", "lat": 50.11, "lon": 8.68, "tz": "Europe/Berlin", "session": ("09:00", "17:30")},
    {"key": "cac", "label": "CAC 40", "group": "Europe", "unit": "pts", "src": "twelve", "id": "CAC", "eod": "FCHI.INDX", "city": "Paris", "lat": 48.86, "lon": 2.35, "tz": "Europe/Paris", "session": ("09:00", "17:30")},
    {"key": "nikkei", "label": "Nikkei 225", "group": "Asia", "unit": "pts", "src": "fred", "id": "NIKKEI225", "city": "Tokyo", "lat": 35.68, "lon": 139.69, "tz": "Asia/Tokyo", "session": ("09:00", "15:30")},
    {"key": "hangseng", "label": "Hang Seng", "group": "Asia", "unit": "pts", "src": "twelve", "id": "HSI", "eod": "HSI.INDX", "city": "Hong Kong", "lat": 22.32, "lon": 114.17, "tz": "Asia/Hong_Kong", "session": ("09:30", "16:00")},
    {"key": "shanghai", "label": "Shanghai Composite", "group": "Asia", "unit": "pts", "src": "twelve", "id": "SSEC", "eod": "SSEC.INDX", "city": "Shanghai", "lat": 31.23, "lon": 121.47, "tz": "Asia/Shanghai", "session": ("09:30", "15:00")},
    {"key": "gold", "label": "Gold", "group": "Commodities", "unit": "US$/oz", "src": "twelve", "id": "XAU/USD", "eod": "XAUUSD.FOREX"},
    {"key": "brent", "label": "Brent crude", "group": "Commodities", "unit": "US$/bbl", "src": "fred", "id": "DCOILBRENTEU"},
    {"key": "usdinr", "label": "Rupee per US dollar", "group": "Currency and yields", "unit": "₹", "src": "fred", "id": "DEXINUS"},   # the site's FBIL daily rate first
    {"key": "us10y", "label": "US 10-year yield", "group": "Currency and yields", "unit": "%", "src": "fred", "id": "DGS10"},
]
HOME = {"city": "Mumbai", "lat": 19.08, "lon": 72.88, "tz": "Asia/Kolkata", "session": ("09:15", "15:30")}


# ------------------------------------------------------------------------------------------------------------------ pure parts
def parse_fred(text: str) -> List[Tuple[date, float]]:
    """FRED's csv (DATE or observation_date, then the series): a blank day is '.', skipped and never filled in. Oldest first."""
    out: List[Tuple[date, float]] = []
    rows = csv.reader(io.StringIO(text))
    next(rows, None)
    for r in rows:
        if len(r) < 2 or not r[1] or r[1].strip() == ".":
            continue
        try:
            out.append((date.fromisoformat(r[0].strip()), float(r[1])))
        except ValueError:
            continue
    out.sort()
    return out


def parse_twelve(body: Dict[str, Any]) -> Tuple[List[Tuple[date, float]], Optional[str]]:
    """Twelve Data's time_series ({values: [{datetime, close}], status}); newest first there, oldest first here. A refusal comes back as its message."""
    if not isinstance(body, dict) or body.get("status") == "error":
        msg = (body or {}).get("message") if isinstance(body, dict) else None
        return [], ("Twelve Data did not return this series" + (f": {msg}" if msg else "."))
    out: List[Tuple[date, float]] = []
    for v in body.get("values") or []:
        try:
            out.append((date.fromisoformat(str(v["datetime"])[:10]), float(v["close"])))
        except (KeyError, TypeError, ValueError):
            continue
    out.sort()
    return out, None if out else "Twelve Data returned no closes for this series."


def parse_eodhd(body: Any) -> Tuple[List[Tuple[date, float]], Optional[str]]:
    """EODHD's end-of-day list ([{date, close, ...}], oldest first); an error comes back as a dict or text and is said, never guessed."""
    if not isinstance(body, list):
        msg = body.get("message") or body.get("error") if isinstance(body, dict) else None
        return [], "EODHD did not return this series" + (f": {msg}" if msg else ".")
    out: List[Tuple[date, float]] = []
    for v in body:
        try:
            c = v.get("close")
            if c is None:
                continue
            out.append((date.fromisoformat(str(v["date"])[:10]), float(c)))
        except (AttributeError, KeyError, TypeError, ValueError):
            continue
    out.sort()
    return out, None if out else "EODHD returned no closes for this series."


def _on_or_before(points: List[Tuple[date, float]], day: date) -> Optional[Tuple[date, float]]:
    best = None
    for d, v in points:
        if d <= day:
            best = (d, v)
        else:
            break
    return best


def moves(points: List[Tuple[date, float]], unit: str) -> Dict[str, Any]:
    """Latest close, its date, the 1-day / 1-week / 1-month moves and the last month's closes. A yield moves in percentage points, the rest in %."""
    if not points:
        return {"last": None, "asOf": None, "d1": None, "w1": None, "m1": None, "line": []}
    last_d, last = points[-1]

    def change(ref: Optional[Tuple[date, float]]) -> Optional[float]:
        if not ref or ref[0] >= last_d or not ref[1]:
            return None
        return round(last - ref[1], 2) if unit == "%" else round((last / ref[1] - 1) * 100, 2)
    prev = points[-2] if len(points) > 1 else None
    month = [(d.isoformat(), round(v, 4)) for d, v in points if d >= last_d - timedelta(days=31)]
    return {"last": round(last, 4), "asOf": last_d.isoformat(), "d1": change(prev), "w1": change(_on_or_before(points, last_d - timedelta(days=7))),
            "m1": change(_on_or_before(points, last_d - timedelta(days=30))), "line": month}


def session_now(s: Dict[str, Any], now: datetime) -> Optional[Dict[str, Any]]:
    """Whether the market is in its regular session now (weekdays, local hours; exchange holidays are not known here) and its local time."""
    if not s.get("tz"):
        return None
    local = now.astimezone(ZoneInfo(s["tz"]))
    o, c = s["session"]
    oh, om = map(int, o.split(":"))
    ch, cm = map(int, c.split(":"))
    mins = local.hour * 60 + local.minute
    is_open = local.weekday() < 5 and oh * 60 + om <= mins < ch * 60 + cm
    return {"open": is_open, "local": local.strftime("%H:%M"), "hours": f"{o}-{c} local"}


def build(series: Dict[str, Tuple[List[Tuple[date, float]], Optional[str]]], now: datetime) -> Dict[str, Any]:
    """series: {key: (points, why_empty)}. The answer the dashboard reads."""
    rows = []
    for s in SERIES:
        got = series.get(s["key"], ([], None))
        pts, why = got[0], got[1]
        src = got[2] if len(got) > 2 else ("FRED" if s["src"] == "fred" else "Twelve Data")
        tracker = got[3] if len(got) > 3 else None
        unit = tracker["unit"] if tracker else s["unit"]
        m = moves(pts, unit)
        rows.append({"key": s["key"], "label": s["label"], "group": s["group"], "unit": unit, "source": src,
                     "tracker": {**tracker, "note": f"Shown through {tracker['name']}, a fund that tracks the {s['label']}: the moves follow the index; the price "
                                                    f"is the fund's ({'pence' if unit == 'GBX' else 'pounds'}), not the index level."} if tracker else None,
                     **m, "why": None if m["last"] is not None else (why or "No close from the source yet."),
                     "place": {"city": s["city"], "lat": s["lat"], "lon": s["lon"], **(session_now(s, now) or {})} if s.get("city") else None})
    overseas = [r for r in rows if r["place"] and r["group"] in ("US", "Europe", "Asia")]
    valued = [r for r in overseas if r["d1"] is not None]
    return {"rows": rows, "home": {**HOME, **(session_now(HOME, now) or {})}, "asOfIst": now.astimezone(ZoneInfo("Asia/Kolkata")).strftime("%H:%M"),
            "summary": {"open": sum(1 for r in overseas if r["place"].get("open")), "markets": len({r["place"]["city"] for r in overseas}),
                        "indices": len(valued), "down": sum(1 for r in valued if r["d1"] < 0), "up": sum(1 for r in valued if r["d1"] > 0)},
            "disclaimer": DISCLAIMER, "sources": sources_line(rows), "builtAt": now.isoformat(timespec="seconds")}


# ------------------------------------------------------------------------------------------------------------------ fetching
async def _fred(client: httpx.AsyncClient, sid: str, start: date) -> Tuple[List[Tuple[date, float]], Optional[str]]:
    try:
        r = await client.get(FRED_URL, params={"id": sid, "cosd": start.isoformat()})
        r.raise_for_status()
        pts = parse_fred(r.text)
        return pts, None if pts else "FRED returned no closes for this series."
    except Exception as exc:   # a source down never takes the card down: the row says why
        log.warning("global markets: FRED %s failed: %s", sid, type(exc).__name__)
        return [], "FRED could not be reached just now; the card tries again within the hour."


async def _twelve(client: httpx.AsyncClient, key: str, sym: str) -> Tuple[List[Tuple[date, float]], Optional[str]]:
    if not key:
        return [], NO_KEY
    try:
        r = await client.get(TWELVE_URL, params={"symbol": sym, "interval": "1day", "outputsize": 40, "apikey": key})
        return parse_twelve(r.json())
    except Exception as exc:
        log.warning("global markets: Twelve Data %s failed: %s", sym, type(exc).__name__)
        return [], "Twelve Data could not be reached just now; the card tries again within the hour."


def sources_line(rows: List[Dict[str, Any]]) -> str:
    used = [x for x in ("FRED", "FBIL", "EODHD", "Twelve Data") if any(r.get("source") == x and r.get("last") is not None for r in rows)]
    words = {"FRED": "FRED (St. Louis Fed)", "FBIL": "FBIL reference rate", "EODHD": "EODHD", "Twelve Data": "Twelve Data"}
    return "; ".join(words[x] for x in used) or "FRED (St. Louis Fed)"


async def _eodhd(client: httpx.AsyncClient, key: str, sym: str, start: date, redis=None) -> Tuple[List[Tuple[date, float]], Optional[str]]:
    """One series' daily closes from EODHD, kept in Redis for 12 hours so the free plan's 20 calls a day are never spent."""
    ck = f"global-markets:eod:{sym}:{start.isoformat()}"
    try:
        raw = await redis.get(ck) if redis is not None else None
        if raw:
            kept = [(date.fromisoformat(d), float(v)) for d, v in orjson.loads(raw)]
            return kept, None if kept else "EODHD returned no closes for this series."
    except Exception:
        pass
    try:
        r = await client.get(EODHD_URL.format(sym=sym), params={"api_token": key, "fmt": "json", "from": start.isoformat()})
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"message": f"HTTP {r.status_code}"}
        pts, why = parse_eodhd(body)
    except Exception as exc:
        log.warning("global markets: EODHD %s failed: %s", sym, type(exc).__name__)
        return [], "EODHD could not be reached just now; the card tries again within the hour."
    if redis is not None and (pts or why):   # an empty answer is kept too, so a code the plan does not carry is not asked again every hour (20 calls a day)
        try:
            await redis.set(ck, orjson.dumps([(d.isoformat(), v) for d, v in pts]), ex=EODHD_KEEP)
        except Exception:
            pass
    return pts, why


async def _market(client: httpx.AsyncClient, s: Dict[str, Any], twelve: str, eod: str, start: date, redis=None):
    """A series FRED does not carry: Twelve Data when its key is set and it answers, then EODHD when its key is set; else why it is empty."""
    why = None
    if twelve:
        pts, why = await _twelve(client, twelve, s["id"])
        if pts:
            return pts, None, "Twelve Data"
    codes = s.get("eod")
    for code in ((codes,) if isinstance(codes, str) else (codes or ())) if eod else ():   # a series can have more than one EODHD code
        pts, why2 = await _eodhd(client, eod, code, start, redis)
        if pts:
            return pts, None, "EODHD"
        why = why2 or why
    for code, name, unit in s.get("trackers", ()) if eod else ():                        # a fund that tracks the index, labelled as such
        pts, why2 = await _eodhd(client, eod, code, start, redis)
        if pts:
            return pts, None, "EODHD", {"name": name, "code": code.split(".")[0], "unit": unit}
        why = why2 or why
    return [], why or NO_KEY, "EODHD" if eod else "Twelve Data"


async def collect(settings, now: Optional[datetime] = None, local: Optional[Dict[str, List[Tuple[date, float]]]] = None, redis=None) -> Dict[str, Any]:
    """local: series the site already keeps fresher than FRED (the rupee: FBIL's daily reference rate, macro_points usdinr_d), used when newer."""
    now = now or datetime.now(timezone.utc)
    start = now.date() - timedelta(days=45)
    key = getattr(settings, "twelvedata_api_key", "") or ""
    eod = getattr(settings, "eodhd_api_key", "") or ""
    # the client's own User-Agent: FRED holds a request with an unfamiliar one until it times out (checked 21 Nov 2026), as macro.py's Brent read does
    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=8.0)) as client:
        jobs = [(_fred(client, s["id"], start) if s["src"] == "fred" else _market(client, s, key, eod, start, redis)) for s in SERIES]
        got = await asyncio.gather(*jobs)
    series = {s["key"]: g for s, g in zip(SERIES, got)}
    for k, pts in (local or {}).items():
        theirs = series.get(k, ([], None))[0]
        if pts and (not theirs or pts[-1][0] >= theirs[-1][0]):
            series[k] = (splice(theirs, pts), None, "FBIL")
    return build(series, now)


def splice(theirs: List[Tuple[date, float]], ours: List[Tuple[date, float]]) -> List[Tuple[date, float]]:
    """The site's own closes from their first day, with the provider's older closes before it, so a short site series still has its 1-week and
    1-month moves and its month line (task #294, live check: the FBIL rupee held under a month, and 1M showed a dash)."""
    if not ours:
        return list(theirs)
    first = ours[0][0]
    return [p for p in theirs if p[0] < first] + list(ours)


async def site_series(app) -> Dict[str, List[Tuple[date, float]]]:
    """The rupee from the site's own daily FBIL reference rate (fresher than FRED's weekly-lagged copy). Empty when it cannot be read."""
    try:
        async with app.state.store.pool.acquire() as conn:
            rows = await conn.fetch("SELECT d, v FROM macro_points WHERE series = 'usdinr_d' AND d >= current_date - 45 ORDER BY d")
        return {"usdinr": [(r["d"], float(r["v"])) for r in rows if r["v"] is not None]}
    except Exception:   # a convenience: FRED's copy stands in
        log.warning("global markets: the site's rupee series is unavailable", exc_info=True)
        return {}


_mem: Tuple[float, Optional[dict]] = (0.0, None)
_lock = asyncio.Lock()


def built_at(out: dict) -> float:
    """When the answer was built (its builtAt), so a copy read back from Redis after a restart keeps its age and is not kept another full hour
    (seen live, 21 Nov: a 21:11 answer was still served at 22:18). Now when the time is missing."""
    try:
        return min(time.time(), datetime.fromisoformat(out["builtAt"]).timestamp())
    except (KeyError, TypeError, ValueError):
        return time.time()


async def data(app) -> dict:
    global _mem
    if _mem[1] is not None and time.time() - _mem[0] < CACHE_SECONDS:
        return _mem[1]
    async with _lock:
        if _mem[1] is not None and time.time() - _mem[0] < CACHE_SECONDS:
            return _mem[1]
        redis = getattr(app.state.store, "redis", None)
        raw = None
        try:
            raw = await redis.get(CACHE_KEY) if redis is not None else None
        except Exception:   # the cache is a convenience
            raw = None
        out = orjson.loads(raw) if raw else await collect(app.state.settings, local=await site_series(app), redis=redis)
        if not raw:
            try:
                if redis is not None:
                    await redis.set(CACHE_KEY, orjson.dumps(out), ex=CACHE_SECONDS)
            except Exception:
                log.warning("global markets: cache write failed", exc_info=True)
        _mem = (built_at(out), out)
        return out


@router.get("/api/global-markets")
async def global_markets(request: Request) -> Response:
    """Every plan, signed in or not: public index levels and rates from public sources. The open/closed state is worked out again on each answer."""
    out = dict(await data(request.app))
    now = datetime.now(timezone.utc)
    rows = []
    for r, s in zip(out["rows"], SERIES):
        rows.append({**r, "place": {**r["place"], **(session_now(s, now) or {})}} if r.get("place") else r)
    out = {**out, "rows": rows, "home": {**HOME, **(session_now(HOME, now) or {})}, "asOfIst": now.astimezone(ZoneInfo("Asia/Kolkata")).strftime("%H:%M")}
    overseas = [r for r in rows if r.get("place") and r["group"] in ("US", "Europe", "Asia")]
    out["summary"] = {**out["summary"], "open": sum(1 for r in overseas if r["place"].get("open"))}
    return Response(content=orjson.dumps(out), media_type="application/json", headers={"Cache-Control": "public, max-age=300"})
