"""Trading Lab > Global > Global trade (docs/GLOBAL-MARKETS.md; founder, 26 Nov 2026: "global trade data ... the global market affects the
Indian market").

India's merchandise trade with the world from UN Comtrade's public preview API (no key; India as reported to the UN, in US dollars):
  * every month of the last 13 available: exports and imports by partner country (one call per month and flow, about 210 partners each);
  * the latest month and the same month a year before by product (the 97 chapters of the Harmonized System, one call per flow and month).
Comtrade publishes a month about two to three months after it ends; the job (`global-trade`, daily) reads only months it does not hold yet
plus the latest two again (revisions), pacing its calls so the free preview's rate limit is respected.

The founder's decision of 26 Nov 2026 (internal, invite-only Lab) covers the data; FinLit names itself in the User-Agent. Facts only.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, Request

from ..auth.service import Ctx
from .access import lab_ctx

log = logging.getLogger("finlit.lab.trade")
router = APIRouter()

PREVIEW = "https://comtradeapi.un.org/public/v1/preview/C/M/HS"
PARTNERS_URL = "https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json"
INDIA, WORLD = 699, 0
KEY = "trade:india"
MONTHS = 13
PAUSE = 4.0                  # seconds between calls: the free preview answers 429 when called faster
UA = {"User-Agent": "FinLit (finlitventures.com) trade statistics", "Accept": "application/json"}

HS: Dict[str, str] = {
    "01": "Live animals", "02": "Meat", "03": "Fish and seafood", "04": "Dairy, eggs, honey", "05": "Other animal products", "06": "Plants and flowers",
    "07": "Vegetables", "08": "Fruit and nuts", "09": "Coffee, tea, spices", "10": "Cereals (rice, wheat)", "11": "Milling products", "12": "Oil seeds",
    "13": "Gums and resins", "14": "Vegetable plaiting materials", "15": "Fats and oils", "16": "Meat and fish preparations", "17": "Sugar",
    "18": "Cocoa", "19": "Cereal preparations", "20": "Vegetable and fruit preparations", "21": "Miscellaneous food", "22": "Beverages",
    "23": "Food residues, animal feed", "24": "Tobacco", "25": "Salt, sulphur, stone, cement", "26": "Ores", "27": "Mineral fuels and oils",
    "28": "Inorganic chemicals", "29": "Organic chemicals", "30": "Pharmaceuticals", "31": "Fertilisers", "32": "Dyes, paints, inks",
    "33": "Essential oils, cosmetics", "34": "Soaps, waxes", "35": "Albumins, glues, enzymes", "36": "Explosives, matches", "37": "Photographic goods",
    "38": "Other chemical products", "39": "Plastics", "40": "Rubber", "41": "Hides and skins", "42": "Leather goods", "43": "Furskins",
    "44": "Wood", "45": "Cork", "46": "Basketware", "47": "Pulp", "48": "Paper and paperboard", "49": "Printed matter", "50": "Silk",
    "51": "Wool", "52": "Cotton", "53": "Other vegetable fibres", "54": "Man-made filaments", "55": "Man-made staple fibres",
    "56": "Wadding, felt, rope", "57": "Carpets", "58": "Special woven fabrics", "59": "Coated textile fabrics", "60": "Knitted fabrics",
    "61": "Knitted apparel", "62": "Woven apparel", "63": "Other textile articles", "64": "Footwear", "65": "Headgear", "66": "Umbrellas",
    "67": "Feathers, artificial flowers", "68": "Stone and cement articles", "69": "Ceramics", "70": "Glass", "71": "Gems, jewellery, gold",
    "72": "Iron and steel", "73": "Iron and steel articles", "74": "Copper", "75": "Nickel", "76": "Aluminium", "78": "Lead", "79": "Zinc",
    "80": "Tin", "81": "Other base metals", "82": "Tools and cutlery", "83": "Miscellaneous metal articles", "84": "Machinery and computers",
    "85": "Electrical machinery and electronics", "86": "Railway equipment", "87": "Vehicles and parts", "88": "Aircraft and spacecraft",
    "89": "Ships and boats", "90": "Optical and medical instruments", "91": "Clocks and watches", "92": "Musical instruments", "93": "Arms",
    "94": "Furniture, lighting", "95": "Toys and sports goods", "96": "Miscellaneous manufactures", "97": "Art and antiques", "99": "Other goods",
}


def period(d: date) -> str:
    return f"{d.year}{d.month:02d}"


def months_back(d: date, n: int) -> date:
    y, m = divmod(d.year * 12 + d.month - 1 - n, 12)
    return date(y, m + 1, 1)


def by_partner(rows: List[dict]) -> Dict[str, float]:
    """{partner code (str): US$} for one month and flow; code "0" is the world total."""
    out: Dict[str, float] = {}
    for r in rows:
        v = r.get("primaryValue")
        if isinstance(v, (int, float)) and r.get("partnerCode") is not None and not r.get("partner2Code"):
            out[str(r["partnerCode"])] = out.get(str(r["partnerCode"]), 0.0) + float(v)
    return out


def by_product(rows: List[dict]) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for r in rows:
        v, c = r.get("primaryValue"), str(r.get("cmdCode") or "")
        if isinstance(v, (int, float)) and len(c) == 2:
            out[c] = out.get(c, 0.0) + float(v)
    return out


async def _get(client: httpx.AsyncClient, params: dict) -> Optional[List[dict]]:
    """One preview call; a 429 waits and tries again (three times). None when it never answers; [] when the month is not published."""
    for attempt in range(4):
        try:
            r = await client.get(PREVIEW, params=params)
        except httpx.HTTPError:
            r = None
        if r is not None and r.status_code == 200:
            try:
                return (r.json() or {}).get("data") or []
            except ValueError:
                return None
        await asyncio.sleep(PAUSE * (attempt + 2))
    return None


async def refresh(store, client: Optional[httpx.AsyncClient] = None, today: Optional[date] = None, pause: float = PAUSE) -> dict:
    """The `global-trade` job. Finds the latest published month, reads the months it lacks (and the latest two again), and the products."""
    from ..macro import get_meta, set_meta
    today = today or date.today()
    own = client is None
    client = client or httpx.AsyncClient(timeout=60, headers=UA)
    calls = 0
    try:
        async with store.pool.acquire() as conn:
            kept = (await get_meta(conn, KEY)) or {"months": {}, "products": {}, "names": {}}
        if not kept.get("names"):
            try:
                r = await client.get(PARTNERS_URL)
                kept["names"] = {str(p["PartnerCode"]): [p.get("PartnerDesc", "").strip(), p.get("PartnerCodeIsoAlpha3"), bool(p.get("isGroup"))]
                                 for p in (r.json() or {}).get("results", [])} if r.status_code == 200 else {}
            except (httpx.HTTPError, ValueError):
                kept["names"] = {}
        # the latest published month: from two months ago backwards
        latest = None
        for back in range(2, 7):
            m = months_back(today, back)
            rows = await _get(client, {"reporterCode": INDIA, "period": period(m), "flowCode": "X", "partnerCode": WORLD, "cmdCode": "TOTAL"})
            calls += 1
            await asyncio.sleep(pause)
            if rows:
                latest = m
                break
        if latest is None:
            return {"status": "failed", "error": "UN Comtrade did not answer with a published month", "calls": calls}
        wanted = [period(months_back(latest, i)) for i in range(MONTHS)]
        redo = set(wanted[:2])
        got = 0
        for p in wanted:
            if p in kept["months"] and p not in redo:
                continue
            month: Dict[str, Any] = {}
            for flow, name in (("X", "exports"), ("M", "imports")):
                rows = await _get(client, {"reporterCode": INDIA, "period": p, "flowCode": flow, "cmdCode": "TOTAL"})
                calls += 1
                await asyncio.sleep(pause)
                if rows:
                    month[name] = by_partner(rows)
            if month.get("exports") and month.get("imports"):
                kept["months"][p] = month
                got += 1
        last_year = period(months_back(latest, 12))
        for p in (period(latest), last_year):
            if p in kept["products"] and p not in redo:
                continue
            prod: Dict[str, Any] = {}
            for flow, name in (("X", "exports"), ("M", "imports")):
                rows = await _get(client, {"reporterCode": INDIA, "period": p, "flowCode": flow, "partnerCode": WORLD, "cmdCode": "AG2"})
                calls += 1
                await asyncio.sleep(pause)
                if rows:
                    prod[name] = by_product(rows)
            if prod.get("exports") and prod.get("imports"):
                kept["products"][p] = prod
        keep = set(wanted) | {last_year}
        kept["months"] = {k: v for k, v in kept["months"].items() if k in keep}
        kept["products"] = {k: v for k, v in kept["products"].items() if k in {period(latest), last_year}}
        kept["latest"] = period(latest)
        kept["at"] = datetime.now(timezone.utc).isoformat(timespec="minutes")
        async with store.pool.acquire() as conn:
            await set_meta(conn, KEY, kept)
        return {"status": "ok", "latest": period(latest), "monthsRead": got, "calls": calls}
    finally:
        if own:
            await client.aclose()


def _label(p: str) -> str:
    return date(int(p[:4]), int(p[4:]), 1).strftime("%b %Y")


def _yoy(now: Optional[float], before: Optional[float]) -> Optional[float]:
    return round((now - before) / before * 100, 1) if now is not None and before else None


def view(kept: Optional[dict]) -> Optional[dict]:
    """What the page draws: the latest month with its change against the same month a year before, the trend, the partners and the products."""
    if not kept or not kept.get("months") or not kept.get("latest"):
        return None
    names = kept.get("names") or {}
    months = sorted(kept["months"])
    latest = kept["latest"]
    ly = period(months_back(date(int(latest[:4]), int(latest[4:]), 1), 12))
    cur, prev = kept["months"].get(latest, {}), kept["months"].get(ly, {})
    total = lambda m, f: (m.get(f) or {}).get("0")  # noqa: E731

    def partners(flow: str) -> List[dict]:
        rows = []
        for code, v in (cur.get(flow) or {}).items():
            nm = names.get(code) or [f"Partner {code}", None, False]
            if code == "0" or nm[2] or not nm[1] or str(nm[1]).startswith("_"):
                continue
            before = (prev.get(flow) or {}).get(code)
            rows.append({"code": code, "name": nm[0], "iso3": nm[1], "value": round(v), "yoyPct": _yoy(v, before),
                         "share": round(v / total(cur, flow) * 100, 1) if total(cur, flow) else None})
        rows.sort(key=lambda r: -r["value"])
        return rows[:15]

    def products(flow: str) -> List[dict]:
        now_p = (kept.get("products") or {}).get(latest, {}).get(flow) or {}
        ly_p = (kept.get("products") or {}).get(ly, {}).get(flow) or {}
        tot = sum(now_p.values()) or None
        rows = [{"code": c, "name": HS.get(c, f"Chapter {c}"), "value": round(v), "yoyPct": _yoy(v, ly_p.get(c)),
                 "share": round(v / tot * 100, 1) if tot else None} for c, v in now_p.items()]
        rows.sort(key=lambda r: -r["value"])
        return rows[:12]

    trend = [{"period": p, "label": _label(p), "exports": round(total(kept["months"][p], "exports") or 0), "imports": round(total(kept["months"][p], "imports") or 0)}
             for p in months]
    for t in trend:
        t["balance"] = t["exports"] - t["imports"]
    x, m = total(cur, "exports"), total(cur, "imports")
    return {"latest": latest, "label": _label(latest), "lastYear": _label(ly), "exports": round(x or 0), "imports": round(m or 0),
            "balance": round((x or 0) - (m or 0)), "exportsYoyPct": _yoy(x, total(prev, "exports")), "importsYoyPct": _yoy(m, total(prev, "imports")),
            "trend": trend, "exportPartners": partners("exports"), "importPartners": partners("imports"),
            "exportProducts": products("exports"), "importProducts": products("imports"), "at": kept.get("at"),
            "source": "UN Comtrade (India as reported to the UN), US dollars"}


@router.get("/api/lab/trade")
async def global_trade(request: Request, _ctx: Ctx = Depends(lab_ctx)) -> Dict[str, Any]:
    from ..macro import get_meta
    async with request.app.state.store.pool.acquire() as conn:
        v = view(await get_meta(conn, KEY))
    if v is None:
        return {"ready": False, "reason": "India's trade loads from UN Comtrade once a day; the first load has not run yet."}
    return {"ready": True, **v}
