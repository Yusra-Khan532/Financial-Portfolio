"""The day's official closes for every listed company, from the exchanges' own end-of-day files, as soon as they are published (26 Nov 2026).

Why: the screens (ready-made lists, the advanced score screener's prices, charts and patterns) read `daily_candles`, which the candles job fills from Dhan
one company at a time. Dhan publishes a day's candles late (none for 25 Nov at 18:30 IST; on 26 Nov still none at 19:58 IST) and a full pass is about
5,800 calls, so the lists stayed on an older close for most of the evening. The founder (26 Nov 2026): after the 15:30 close the screens must move to
that day's data as fast as possible, using whatever is loaded.

The exchanges publish ONE file each with every company's official open, high, low, close and volume (the UDiFF bhavcopy):
    NSE  https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_<YYYYMMDD>_F_0000.csv.zip     usually out by 17:00-18:30 IST
    BSE  https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_<YYYYMMDD>_F_0000.CSV    usually out by 17:00-19:00 IST
Both are read the moment they appear (the job asks every 10 minutes from 16:30 IST) and written into `daily_candles` in one statement each, the same
rule as the candles job: a company with an NSE code takes its NSE row (series EQ first, then BE, BZ, SM, ST); a company with only a BSE code takes its
BSE row. Official closes only: never a last traded price taken for a close. The Dhan job still runs and fills what a file did not have.

A file the exchange has not published yet is "not out yet" (404), not a failure: the job is tried again 10 minutes later. Both exchanges answer the AWS
address with 403 at times, so a refused request is asked again through FinLit's relay (deploy/amfi-relay), as the company brief does."""
from __future__ import annotations

import csv
import io
import logging
import zipfile
from datetime import date, datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlsplit

import httpx

log = logging.getLogger("finlit.eod")

NSE_URL = "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{d:%Y%m%d}_F_0000.csv.zip"
BSE_URL = "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_{d:%Y%m%d}_F_0000.CSV"
REFERER = {"NSE": "https://www.nseindia.com/", "BSE": "https://www.bseindia.com/"}
NSE_SERIES = ("EQ", "BE", "BZ", "SM", "ST")        # the share's own series, best first; never a bond, warrant or rights line
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
DONE_KEY = "eod:done:{day}:{exch}"                   # Redis: the exchange's file for that day is loaded (the probe's answer)
DONE_TTL = 6 * 24 * 3600
START_IST, STOP_IST = (16, 30), (23, 30)             # the hours the job looks for the day's files (the close is final by 16:00)
IST = timezone(timedelta(hours=5, minutes=30))

Getter = Callable[[str, str], Awaitable[Tuple[int, bytes]]]


def urls(day: date) -> Dict[str, str]:
    return {"NSE": NSE_URL.format(d=day), "BSE": BSE_URL.format(d=day)}


def _f(x: Any) -> Optional[float]:
    try:
        v = float(str(x).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return v if v == v else None


def parse(body: bytes, exch: str, day: date) -> Dict[str, dict]:
    """The file's share rows: {NSE symbol | BSE scrip code: {"open", "high", "low", "close", "volume", "series"}}. Only rows dated `day` with a close
    above zero; for NSE the best series of each symbol. A file of another day raises ValueError (an exchange sometimes serves yesterday's file)."""
    if body[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
            body = z.read(name)
    text = body.decode("utf-8-sig", errors="replace")
    out: Dict[str, dict] = {}
    rank = {s: i for i, s in enumerate(NSE_SERIES)}
    seen_day = None
    for r in csv.DictReader(io.StringIO(text)):
        r = {(k or "").strip(): (v or "").strip() for k, v in r.items()}
        d = (r.get("TradDt") or "")[:10]
        seen_day = seen_day or d
        if d != day.isoformat():
            continue
        if (r.get("FinInstrmTp") or "STK").upper() not in ("STK", ""):
            continue
        close = _f(r.get("ClsPric"))
        if not close or close <= 0:
            continue
        series = (r.get("SctySrs") or "").upper()
        if exch == "NSE":
            key = (r.get("TckrSymb") or "").upper()
            if series not in rank:
                continue
            if key in out and rank[out[key]["series"]] <= rank[series]:
                continue
        else:
            key = r.get("FinInstrmId") or ""
        if not key:
            continue
        vol = _f(r.get("TtlTradgVol"))
        out[key] = {"open": _f(r.get("OpnPric")), "high": _f(r.get("HghPric")), "low": _f(r.get("LwPric")), "close": close,
                    "volume": int(vol) if vol is not None and vol >= 0 else None, "series": series}
    if not out and seen_day and seen_day != day.isoformat():
        raise ValueError(f"the {exch} file is for {seen_day}, not {day.isoformat()}")
    return out


def make_getter(relay: Optional[Tuple[str, str]] = None, transport: Optional[httpx.AsyncBaseTransport] = None) -> Tuple[Getter, Callable[[], Awaitable[None]]]:
    """An async GET (status, body): straight to the exchange first, through the relay when the exchange refuses this server (403 or a dropped connection),
    as earnings/transcripts.Fetcher does. A relay that could not reach the exchange never stands in for the exchange's own answer."""
    from .earnings.transcripts import HOST_OK, relay_settings
    relay = relay if relay is not None else relay_settings()
    client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0), transport=transport, follow_redirects=True, headers={"User-Agent": UA})

    async def via_relay(url: str, referer: str) -> Optional[Tuple[int, bytes]]:
        if not relay or not HOST_OK.match(urlsplit(url).hostname or ""):
            return None
        base, key = relay
        try:
            r = await client.get(base + "/fetch", params={"u": url}, headers={"X-Relay-Key": key, "X-Fwd-User-Agent": UA, "X-Fwd-Referer": referer})
        except httpx.TransportError:
            return None
        if r.headers.get("x-relay-error") or not r.headers.get("x-relay"):
            return None
        return r.status_code, r.content

    async def get(url: str, referer: str) -> Tuple[int, bytes]:
        try:
            r = await client.get(url, headers={"Referer": referer, "Accept": "*/*"})
        except httpx.TransportError:
            got = await via_relay(url, referer)
            return got if got is not None else (-1, b"")
        if r.status_code in (401, 403):
            got = await via_relay(url, referer)
            if got is not None:
                return got
        return r.status_code, r.content

    return get, client.aclose


async def load(store, day: date, get: Optional[Getter] = None, only: Optional[List[str]] = None) -> Dict[str, Any]:
    """Fetch and store one day's files. {"day", "NSE": {...}, "BSE": {...}, "written": n}; each exchange's part says loaded (with counts), "not out yet",
    or what failed. Never raises for an exchange's answer."""
    closer = None
    if get is None:
        get, closer = make_getter()
    out: Dict[str, Any] = {"day": day.isoformat(), "written": 0}
    try:
        async with store.pool.acquire() as conn:
            comps = [dict(r) for r in await conn.fetch("SELECT symbol, nse_code, bse_code FROM companies WHERE nse_code <> '' OR bse_code <> ''")]
        for exch, url in urls(day).items():
            if only and exch not in only:
                continue
            try:
                code, body = await get(url, REFERER[exch])
            except Exception as exc:      # noqa: BLE001 - one exchange's trouble never stops the other's file
                out[exch] = {"status": "failed", "why": type(exc).__name__}
                continue
            if code == 404 or (code == 200 and not body):
                out[exch] = {"status": "not out yet"}
                continue
            if code != 200:
                out[exch] = {"status": "failed", "why": f"HTTP {code}"}
                continue
            try:
                rows = parse(body, exch, day)
            except Exception as exc:      # noqa: BLE001
                out[exch] = {"status": "not out yet" if isinstance(exc, ValueError) else "failed", "why": str(exc)[:200]}
                continue
            if exch == "NSE":
                pick = [(c["symbol"], rows[c["nse_code"].upper()]) for c in comps if c["nse_code"] and c["nse_code"].upper() in rows]
            else:   # BSE only for a company with no NSE code (the candles job's rule: NSE first, BSE only where there is no NSE row)
                pick = [(c["symbol"], rows[c["bse_code"]]) for c in comps if not c["nse_code"] and c["bse_code"] and c["bse_code"] in rows]
            async with store.pool.acquire() as conn:
                await conn.executemany(
                    "INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) "
                    "ON CONFLICT (symbol, day) DO UPDATE SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close, "
                    "volume = EXCLUDED.volume, exch = EXCLUDED.exch, loaded_at = now()",
                    [(sym, day, r["open"], r["high"], r["low"], r["close"], r["volume"], exch) for sym, r in pick])
            out[exch] = {"status": "loaded", "rows": len(rows), "companies": len(pick)}
            out["written"] += len(pick)
            try:
                await store.redis.set(DONE_KEY.format(day=day.isoformat(), exch=exch), len(pick), ex=DONE_TTL)
            except Exception:             # noqa: BLE001 - the probe then asks once more; the closes are stored all the same
                log.warning("end-of-day %s %s loaded but not marked done", exch, day)
    finally:
        if closer is not None:
            await closer()
    return out


def looking(now: datetime) -> Optional[date]:
    """The day whose files the job looks for now: today (IST) on a weekday between 16:30 and 23:30, else None."""
    t = now.astimezone(IST)
    if t.weekday() >= 5 or not (START_IST <= (t.hour, t.minute) < STOP_IST):
        return None
    return t.date()


def previous_weekday(now: datetime) -> date:
    """The last weekday before today (IST): the session a missed evening would have loaded."""
    d = now.astimezone(IST).date() - timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def days_to_look(now: datetime) -> List[date]:
    """27 Nov 2026: the previous weekday too, at any hour, so an evening the job missed (a deploy, a restart, a file out after 23:30) is loaded the next
    morning instead of never; then today's, in its hours."""
    days = [previous_weekday(now)]
    today = looking(now)
    if today is not None:
        days.append(today)
    return days


async def missing(store, day: date) -> List[str]:
    """The exchanges whose file for `day` is not loaded (nor known to be absent: a holiday)."""
    out = []
    for exch in ("NSE", "BSE"):
        if not await store.redis.get(DONE_KEY.format(day=day.isoformat(), exch=exch)):
            out.append(exch)
    return out


async def has_work(store, now: Optional[datetime] = None) -> Optional[bool]:
    """The probe: True while a file of the previous weekday, or of today in the hours the files appear, is not loaded yet."""
    for day in days_to_look(now or datetime.now(timezone.utc)):
        if await missing(store, day):
            return True
    return False


async def catch_up(store, now: Optional[datetime] = None, get: Optional[Getter] = None) -> List[Dict[str, Any]]:
    """What the job does without --date: every day of days_to_look with a file missing. A past day that both exchanges still answer 404 for had no
    session (a holiday): it is marked so, and not asked again."""
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(IST).date()
    out = []
    for day in days_to_look(now):
        need = await missing(store, day)
        if not need:
            continue
        res = await load(store, day, get=get, only=need)
        if day < today:
            for exch in need:
                if (res.get(exch) or {}).get("status") == "not out yet":
                    await store.redis.set(DONE_KEY.format(day=day.isoformat(), exch=exch), "no session", ex=DONE_TTL)
                    res[exch] = {"status": "no session (a holiday: the exchange has no file for this day)"}
        out.append(res)
    return out
