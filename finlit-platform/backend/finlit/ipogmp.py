"""IPO grey market premium (GMP) against the actual listing: the record behind "What GMP said vs what actually listed" on the IPO calendar.

The GMP comes from InvestorGain (investorgain.com), the tracker most Indian IPO sites quote, so the figures here match what other platforms show. GMP is an
informal, unofficial price from the grey market: it is not an exchange figure, nobody audits it, and it is shown as InvestorGain recorded it, with their name
and a link. For each listed IPO we keep the last GMP InvestorGain recorded before listing, the issue price, the listing price (the listing-day open the
exchange set, as InvestorGain shows it) and the subscription, and work out:

    GMP said        = last GMP before listing / issue price              (in percent)
    actual listing  = (listing price - issue price) / issue price         (in percent)

Pages are read slowly (one at a time, a pause between them) and only once an IPO has listed and its record is complete, plus a nightly look at issues
still in progress. Pure parsing here; the job and the API are below. Describes the past; not a forecast and not a recommendation.
"""

from __future__ import annotations

import html as _html
import json
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import asyncio
import logging
import time

log = logging.getLogger("finlit.ipogmp")
UA = "Mozilla/5.0 (compatible; FinLitBot/1.0; +https://finlitventures.com)"

SOURCE_NAME = "InvestorGain"
SOURCE_URL = "https://www.investorgain.com/"
SITEMAP = "https://www.investorgain.com/google_sitemap_urlredirect.asp?a=22"
PAGE_RE = re.compile(r"https://www\.investorgain\.com/gmp/([a-z0-9-]+)/(\d+)/")
BAND_PTS = 5.0      # "within the band": the listing gain was within 5 percentage points of what the GMP said


def page_urls(sitemap_xml: str) -> List[Dict[str, Any]]:
    """Every IPO GMP page in InvestorGain's sitemap: [{id, slug, url}], each once, newest id first."""
    seen: Dict[int, Dict[str, Any]] = {}
    for m in PAGE_RE.finditer(sitemap_xml or ""):
        seen.setdefault(int(m.group(2)), {"id": int(m.group(2)), "slug": m.group(1), "url": m.group(0)})
    return sorted(seen.values(), key=lambda x: -x["id"])


def _payload(page: str) -> str:
    """The page's embedded data (the Next.js stream), decoded to plain text."""
    parts = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', page, re.S)
    raw = "".join(parts)
    try:
        return json.loads('"' + raw.replace('\n', '\\n') + '"')
    except Exception:
        return raw.encode("utf-8", "ignore").decode("unicode_escape", "ignore")


def _str(blob: str, key: str) -> Optional[str]:
    m = re.search(r'"%s":"((?:[^"\\]|\\.)*)"' % re.escape(key), blob)
    return _html.unescape(m.group(1)).strip() if m and m.group(1).strip() else None


def _num(s: Optional[str]) -> Optional[float]:
    if s is None:
        return None
    m = re.search(r"-?\d[\d,]*(?:\.\d+)?", s)
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", ""))
    except ValueError:
        return None


def _array(blob: str, key: str) -> Optional[list]:
    """A JSON array that follows `"key":` in the payload, read by matching brackets."""
    i = blob.find('"%s":[' % key)
    if i < 0:
        return None
    j = blob.index("[", i)
    depth, k, in_str, esc = 0, j, False, False
    while k < len(blob):
        c = blob[k]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(blob[j:k + 1])
                except Exception:
                    return None
        k += 1
    return None


def _ld_props(page: str) -> Dict[str, str]:
    """The page's FinancialProduct properties (GMP, Subscription, Issue Size, Exchange, Sector)."""
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        try:
            d = json.loads(m.group(1))
        except Exception:
            continue
        if isinstance(d, dict) and d.get("@type") == "FinancialProduct":
            return {str(p.get("name")): str(p.get("value")) for p in d.get("additionalProperty") or [] if isinstance(p, dict)}
    return {}


def parse_page(page: str, ig_id: int, url: str) -> Optional[Dict[str, Any]]:
    """One IPO's record from its InvestorGain GMP page, or None when the page is not an IPO page we can read.
    `listed` is False while the issue has not listed yet (no listing price): such a record is not on the chart."""
    blob = _payload(page)
    props = _ld_props(page)
    name = None
    m = re.search(r"<title>(.*?)</title>", page, re.S)
    if m:
        name = re.sub(r"\s+IPO GMP.*$", "", _html.unescape(m.group(1)).strip(), flags=re.I).strip() or None
    issue = _num(_str(blob, "allotment_price")) or _num(_str(blob, "max_price_to_display"))
    if not issue:
        band = _str(blob, "issue_price")
        nums = [float(x.replace(",", "")) for x in re.findall(r"\d[\d,]*(?:\.\d+)?", band or "")]
        issue = max(nums) if nums else None
    lp = _num(_str(blob, "listing_price"))
    ld = _str(blob, "ipo_listing_date")
    listing_date: Optional[date] = None
    if ld:
        try:
            listing_date = datetime.fromisoformat(ld.replace("Z", "+00:00")).date()
        except ValueError:
            listing_date = None
    cat = (_str(blob, "ipo_category_sub") or "").upper()
    board = "sme" if "SME" in cat else "mainboard"
    gd = _array(blob, "gmpData") or []
    last = gd[0] if gd and isinstance(gd[0], dict) else None
    gmp = _num(str(last.get("gmp"))) if last and last.get("gmp") not in (None, "") else None
    hist = []
    for h in _array(blob, "gmpHistoryData") or []:
        if isinstance(h, dict) and h.get("gmp_time") and h.get("gmp") not in (None, ""):
            v = _num(str(h["gmp"]))
            if v is not None:
                hist.append({"t": str(h["gmp_time"]), "gmp": v})
    if not issue or not name:
        return None
    sub = _num(props.get("Subscription"))
    size = _num(props.get("Issue Size")) or _num(_str(blob, "issue_size"))
    listed = lp is not None and lp > 0 and listing_date is not None
    rec = {
        "ig_id": ig_id, "url": url, "name": name[:160], "nse": _str(blob, "nse_cd") or _str(blob, "nse_script_symbol"), "bse": _str(blob, "bse_cd"),
        "isin": _str(blob, "isin"), "board": board, "sector": props.get("Sector") or None, "issue_price": issue, "listing_price": lp if listed else None,
        "listing_date": listing_date, "subscription": sub, "issue_size_cr": size, "gmp": gmp, "gmp_date": (last or {}).get("gmp_date"),
        "history": hist[-200:], "listed": listed,
    }
    rec.update(gains(rec))
    return rec


def gains(r: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """GMP said and the actual listing gain, in percent of the issue price, rounded to 0.01."""
    issue, gmp, lp = r.get("issue_price"), r.get("gmp"), r.get("listing_price")
    said = round(gmp / issue * 100, 2) if issue and gmp is not None else None
    actual = round((lp - issue) / issue * 100, 2) if issue and lp else None
    return {"gmp_pct": said, "listing_pct": actual}


def verdict(said: Optional[float], actual: Optional[float]) -> Optional[str]:
    """beat: listed more than BAND_PTS points above what the GMP said; short: more than BAND_PTS below; band: within BAND_PTS either way."""
    if said is None or actual is None:
        return None
    gap = actual - said
    return "beat" if gap > BAND_PTS else "short" if gap < -BAND_PTS else "band"


def fit(points: List[Dict[str, float]]) -> Optional[Dict[str, float]]:
    """Least-squares line of the actual listing gain on what the GMP said: slope and intercept (percentage points)."""
    xs = [p["x"] for p in points]
    ys = [p["y"] for p in points]
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx <= 0:
        return None
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return {"slope": round(slope, 2), "intercept": round(my - slope * mx, 2)}


def summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """The figures under the chart: how many, how many beat / fell short / were within the band, how often the direction was right, the typical gap."""
    pts = [r for r in rows if r.get("gmp_pct") is not None and r.get("listing_pct") is not None]
    n = len(pts)
    v = [verdict(r["gmp_pct"], r["listing_pct"]) for r in pts]
    gaps = sorted(abs(r["listing_pct"] - r["gmp_pct"]) for r in pts)
    right = sum(1 for r in pts if (r["gmp_pct"] > 0) == (r["listing_pct"] > 0) or (r["gmp_pct"] == 0 and abs(r["listing_pct"]) <= BAND_PTS))
    return {"count": n, "beat": v.count("beat"), "short": v.count("short"), "band": v.count("band"), "bandPts": BAND_PTS,
            "directionRight": right, "medianGap": round(gaps[n // 2] if n % 2 else (gaps[n // 2 - 1] + gaps[n // 2]) / 2, 1) if n else None,
            "fit": fit([{"x": r["gmp_pct"], "y": r["listing_pct"]} for r in pts])}


# ------------------------------------------------------------------------------------------------ the job: refresh-ipo-gmp
UPSERT = """INSERT INTO ipo_gmp (ig_id, url, name, nse, bse, isin, board, sector, issue_price, listing_price, listing_date, subscription, issue_size_cr,
    gmp, gmp_pct, listing_pct, listed, history, fetched_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb, now())
    ON CONFLICT (ig_id) DO UPDATE SET url=EXCLUDED.url, name=EXCLUDED.name, nse=EXCLUDED.nse, bse=EXCLUDED.bse, isin=EXCLUDED.isin, board=EXCLUDED.board,
    sector=EXCLUDED.sector, issue_price=EXCLUDED.issue_price, listing_price=EXCLUDED.listing_price, listing_date=EXCLUDED.listing_date,
    subscription=EXCLUDED.subscription, issue_size_cr=EXCLUDED.issue_size_cr, gmp=EXCLUDED.gmp, gmp_pct=EXCLUDED.gmp_pct, listing_pct=EXCLUDED.listing_pct,
    listed=EXCLUDED.listed, history=EXCLUDED.history, fetched_at=now()"""


def to_row(r: Dict[str, Any]) -> tuple:
    return (r["ig_id"], r["url"], r["name"], r["nse"], r["bse"], r["isin"], r["board"], r["sector"], r["issue_price"], r["listing_price"], r["listing_date"],
            r["subscription"], r["issue_size_cr"], r["gmp"], r["gmp_pct"], r["listing_pct"], r["listed"], json.dumps(r["history"]))


async def refresh(store, limit: int = 120, pause_s: float = 2.0, max_minutes: float = 8.0, http=None) -> Dict[str, Any]:
    """Read InvestorGain's IPO GMP pages we do not have yet, or whose issue had not listed when last read; newest first. One page at a time with a pause,
    at most `limit` pages and `max_minutes` per run, so the first full history fills over a few runs. A page that cannot be read is skipped and tried
    again next run; stored records are never removed."""
    import httpx
    out = {"seen": 0, "read": 0, "stored": 0, "listed": 0, "skipped": 0, "errors": 0}
    stop = time.monotonic() + max_minutes * 60
    own = http is None
    http = http or httpx.AsyncClient(timeout=40, headers={"User-Agent": UA}, follow_redirects=True)
    try:
        sm = await http.get(SITEMAP)
        sm.raise_for_status()
        pages = page_urls(sm.text)
        out["seen"] = len(pages)
        async with store.pool.acquire() as conn:
            done = {r["ig_id"] for r in await conn.fetch("SELECT ig_id FROM ipo_gmp WHERE listed")}
        todo = [p for p in pages if p["id"] not in done][:limit]
        for p in todo:
            if time.monotonic() > stop:
                break
            try:
                res = await http.get(p["url"])
                out["read"] += 1
                if res.status_code != 200:
                    out["errors"] += 1
                    continue
                rec = parse_page(res.text, p["id"], p["url"])
                if rec is None:
                    out["skipped"] += 1
                else:
                    async with store.pool.acquire() as conn:
                        await conn.execute(UPSERT, *to_row(rec))
                    out["stored"] += 1
                    out["listed"] += int(rec["listed"])
            except Exception:
                log.warning("ipo gmp page %s not read", p["url"], exc_info=True)
                out["errors"] += 1
            await asyncio.sleep(pause_s)
    finally:
        if own:
            await http.aclose()
    return out


# ------------------------------------------------------------------------------------------------ the API: /api/ipos/gmp-record
from fastapi import APIRouter, Query, Request  # noqa: E402
from fastapi.responses import Response  # noqa: E402

router = APIRouter()
RECORD_SQL = """SELECT * FROM ipo_gmp WHERE listed AND gmp_pct IS NOT NULL AND listing_pct IS NOT NULL AND ($1::text IS NULL OR board = $1)
    ORDER BY listing_date DESC"""


@router.get("/api/ipos/gmp-record")
async def gmp_record(request: Request, board: str = Query("all", pattern="^(all|mainboard|sme)$")) -> Response:
    """Public. Every listed IPO with its last GMP before listing and its actual listing gain, and the figures under the chart. GMP is InvestorGain's."""
    async with request.app.state.store.pool.acquire() as conn:
        rows = [dict(r) for r in await conn.fetch(RECORD_SQL, None if board == "all" else board)]
        newest = await conn.fetchval("SELECT max(fetched_at) FROM ipo_gmp")
    f = lambda v: float(v) if v is not None else None  # noqa: E731
    items = [{"name": r["name"], "symbol": r["nse"] or r["bse"], "board": r["board"], "issuePrice": f(r["issue_price"]), "gmp": f(r["gmp"]), "gmpPct": f(r["gmp_pct"]),
              "listingPrice": f(r["listing_price"]), "listingPct": f(r["listing_pct"]), "listingDate": r["listing_date"].isoformat() if r["listing_date"] else None,
              "subscription": f(r["subscription"]), "issueSizeCr": f(r["issue_size_cr"]), "verdict": verdict(f(r["gmp_pct"]), f(r["listing_pct"])), "url": r["url"]} for r in rows]
    body = {"board": board, "items": items, "summary": summary([{"gmp_pct": i["gmpPct"], "listing_pct": i["listingPct"]} for i in items]),
            "source": {"name": SOURCE_NAME, "url": SOURCE_URL}, "updatedAt": newest.isoformat() if newest else None,
            "note": "GMP (grey market premium) is an informal, unofficial price from the grey market, as InvestorGain recorded it. It is not an exchange figure."}
    return Response(json.dumps(body, default=str), media_type="application/json", headers={"Cache-Control": "public, max-age=600"})
