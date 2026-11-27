"""Trading Lab > Global > Global trade (docs/GLOBAL-MARKETS.md; founder, 26 Nov 2026: "global trade data ... the global market affects the
Indian market").

India's merchandise trade with the world from UN Comtrade's public preview API (no key; India as reported to the UN, in US dollars):
  * every month of the last 13 available: exports and imports by partner country (one call per month: both flows, about 400 rows);
  * the latest month and the same month a year before by product (the 97 chapters of the Harmonized System, one call per month);
  * the drill-down, for the latest month and the same month a year before: the chapters of India's trade with each of its largest partners
    (the 15 largest each way, five partners and one flow a call) and the partner countries of each of its largest chapters (the 10 largest
    each way, one chapter a call, both flows).
Plus the world's merchandise trade and India's share of it, by year, from the WTO's Timeseries API (lab/wto.py; it needs a free key).

The preview's documented limits (UN Comtrade help, checked 27 Nov 2026): no key, at most 500 records and one period per call (one product code a
call: AG2, every chapter, counts as one). Every call here asks for one period and one product code, and is sized to stay under 500 rows; a call
that comes back with 500 rows (it may be cut) is asked again in halves. No daily quota is published for the preview; calls go one at a time with
a pause between them. Comtrade publishes a month about two to three months after it ends; the job (`global-trade`) reads only months it does not
hold yet plus the latest two again (revisions), the drill-down when a month is new or its copy is a week old, and starts no new call after its own
deadline (`max_minutes`): what is left is read first on the next run.

The founder's decision of 26 Nov 2026 (internal, invite-only Lab) covers the data; FinLit names itself in the User-Agent. Facts only.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Dict, Iterable, List, Optional

import httpx
import orjson
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from ..auth.service import Ctx
from .access import lab_ctx

log = logging.getLogger("finlit.lab.trade")
router = APIRouter()

PREVIEW = "https://comtradeapi.un.org/public/v1/preview/C/M/HS"
PARTNERS_URL = "https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json"
INDIA, WORLD = 699, 0
KEY = "trade:india"
DRILL_KEY = "trade:india:drill"
MONTHS = 13
PAUSE = 3.0                  # seconds between calls: the free preview answered 429 when called back to back (26 Nov 2026); 3 s measured clean
CAP = 500                    # the preview's documented row cap a call
DRILL_PARTNERS = 15          # the largest partners each way whose chapters are read
DRILL_PRODUCTS = 10          # the largest chapters each way whose partner countries are read
PARTNERS_A_CALL = 5          # five partners x at most 98 chapters = 490 rows, under the cap
DRILL_AGE = timedelta(days=7)  # the latest month's drill-down is read again after a week (Comtrade revises recent months)
UA = {"User-Agent": "FinLit (finlitventures.com) trade statistics", "Accept": "application/json"}
FLOWS = (("X", "exports"), ("M", "imports"))

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


def _pdate(p: str) -> date:
    return date(int(p[:4]), int(p[4:]), 1)


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
        if isinstance(v, (int, float)) and len(c) == 2 and not r.get("partner2Code"):
            out[c] = out.get(c, 0.0) + float(v)
    return out


def split_flows(rows: List[dict], parse: Callable[[List[dict]], Dict[str, float]]) -> Dict[str, Dict[str, float]]:
    """Rows of a call that asked for both flows, as {"exports": ..., "imports": ...} (a flow with no rows is left out)."""
    out: Dict[str, Dict[str, float]] = {}
    for flow, name in FLOWS:
        part = [r for r in rows if r.get("flowCode") == flow]
        if part:
            out[name] = parse(part)
    return out


def by_partner_product(rows: List[dict]) -> Dict[str, Dict[str, float]]:
    """{partner code: {chapter: US$}} from a call for several partners and every chapter (one flow)."""
    groups: Dict[str, List[dict]] = {}
    for r in rows:
        if r.get("partnerCode") is not None:
            groups.setdefault(str(r["partnerCode"]), []).append(r)
    return {code: by_product(rs) for code, rs in groups.items()}


def is_country(code: str, names: Dict[str, list]) -> bool:
    """A real partner country: not the world total, not a group, with an ISO code (Comtrade's "_X" style codes are areas not elsewhere named)."""
    nm = names.get(code)
    return bool(code != "0" and nm and not nm[2] and nm[1] and not str(nm[1]).startswith("_"))


def drill_sets(kept: dict) -> Dict[str, List[str]]:
    """Which partners and chapters the drill-down reads: the largest each way in the latest month (the union, largest first)."""
    latest = kept.get("latest")
    cur = (kept.get("months") or {}).get(latest) or {}
    names = kept.get("names") or {}
    partners: List[str] = []
    for _, flow in FLOWS:
        ranked = sorted((c for c in (cur.get(flow) or {}) if is_country(c, names)), key=lambda c: -cur[flow][c])
        partners += [c for c in ranked[:DRILL_PARTNERS] if c not in partners]
    prod = (kept.get("products") or {}).get(latest) or {}
    products: List[str] = []
    for _, flow in FLOWS:
        ranked = sorted((prod.get(flow) or {}), key=lambda c: -prod[flow][c])
        products += [c for c in ranked[:DRILL_PRODUCTS] if c not in products]
    return {"partners": partners, "products": products}


def _chunks(items: List[str], n: int) -> Iterable[List[str]]:
    for i in range(0, len(items), n):
        yield items[i:i + n]


class Calls:
    """One preview call at a time, paced, counted, and stopped at the run's own deadline."""

    def __init__(self, client: httpx.AsyncClient, pause: float, stop_at: Optional[float]):
        self.client, self.pause, self.stop_at, self.n, self.failed = client, pause, stop_at, 0, 0

    def late(self) -> bool:
        return self.stop_at is not None and time.monotonic() >= self.stop_at

    async def get(self, params: dict) -> Optional[List[dict]]:
        """One preview call; a 429 or an error waits and tries again (three times). None when it never answers; [] when nothing is published."""
        self.n += 1
        try:
            for attempt in range(4):
                try:
                    r = await self.client.get(PREVIEW, params=params)
                except httpx.HTTPError:
                    r = None
                if r is not None and r.status_code == 200:
                    try:
                        return (r.json() or {}).get("data") or []
                    except ValueError:
                        break
                await asyncio.sleep(self.pause * (attempt + 2))
            self.failed += 1
            return None
        finally:
            await asyncio.sleep(self.pause)

    async def whole(self, params: dict, split: List[dict]) -> Optional[List[dict]]:
        """A call that may meet the 500-row cap: when it comes back full, each narrower call in `split` is made instead and the rows joined."""
        rows = await self.get(params)
        if rows is None or len(rows) < CAP or not split:
            return rows
        out: List[dict] = []
        for p in split:
            part = await self.get({**params, **p})
            if part is None:
                return None
            out += part
        return out


async def _drill_period(calls: Calls, p: str, sets: Dict[str, List[str]], have: dict, redo: bool, left: List[str]) -> tuple:
    """Reads the drill-down of one month: chapters by partner, then partners by chapter. Keeps what it holds and reads what is missing, or,
    with `redo`, reads everything again (each piece replaced as it comes, so a stop at the deadline keeps the older copy of the rest).
    Returns (the month's drill-down, whether every piece was read)."""
    out = {"partners": dict(have.get("partners") or {}), "products": dict(have.get("products") or {})}
    complete = True
    todo = [c for c in sets["partners"] if redo or c not in out["partners"]]
    for batch in _chunks(todo, PARTNERS_A_CALL):
        got: Dict[str, Dict[str, Dict[str, float]]] = {c: {} for c in batch}
        answered = True
        for flow, name in FLOWS:
            if calls.late():
                left.append(f"{p} chapters of partners {','.join(batch)}")
                return out, False
            rows = await calls.get({"reporterCode": INDIA, "period": p, "flowCode": flow, "partnerCode": ",".join(batch), "cmdCode": "AG2"})
            if rows is None:
                answered = False
                continue
            for code, chapters in by_partner_product(rows).items():
                if code in got:
                    got[code][name] = chapters
        if answered:
            out["partners"].update(got)        # a partner with no rows one way traded nothing that way that month
        else:
            complete = False
    for hs in [c for c in sets["products"] if redo or c not in out["products"]]:
        if calls.late():
            left.append(f"{p} partners of chapter {hs}")
            return out, False
        rows = await calls.whole({"reporterCode": INDIA, "period": p, "flowCode": "X,M", "cmdCode": hs}, [{"flowCode": "X"}, {"flowCode": "M"}])
        if rows is None:
            complete = False
        else:
            out["products"][hs] = split_flows(rows, by_partner)
    return out, complete


async def refresh(store, client: Optional[httpx.AsyncClient] = None, today: Optional[date] = None, pause: float = PAUSE,
                  max_minutes: Optional[float] = None, wto_key: str = "", wto_client: Optional[httpx.AsyncClient] = None) -> dict:
    """The `global-trade` job. Finds the latest published month, reads the months it lacks (and the latest two again), the products, the
    drill-down and the WTO's world totals. After `max_minutes` no new call starts; what was read is saved and the rest goes first next run."""
    from ..macro import get_meta, set_meta
    from . import wto
    today = today or date.today()
    stop_at = time.monotonic() + max_minutes * 60 if max_minutes else None
    own = client is None
    client = client or httpx.AsyncClient(timeout=60, headers=UA)
    calls = Calls(client, pause, stop_at)
    left: List[str] = []
    try:
        async with store.pool.acquire() as conn:
            kept = (await get_meta(conn, KEY)) or {"months": {}, "products": {}, "names": {}}
            drill = (await get_meta(conn, DRILL_KEY)) or {}
        if not kept.get("names"):
            try:
                r = await client.get(PARTNERS_URL)
                kept["names"] = {str(p["PartnerCode"]): [p.get("PartnerDesc", "").strip(), p.get("PartnerCodeIsoAlpha3"), bool(p.get("isGroup"))]
                                 for p in (r.json() or {}).get("results", [])} if r.status_code == 200 else {}
            except (httpx.HTTPError, ValueError):
                kept["names"] = {}
        # the WTO's world totals first: two calls at most, a few times a month (lab/wto.py); no key = skipped and said so
        wto_out = await wto.refresh(store, wto_key, client=wto_client, pause=min(pause, 1.5))
        # the latest published month: from two months ago backwards
        latest = None
        for back in range(2, 7):
            m = months_back(today, back)
            rows = await calls.get({"reporterCode": INDIA, "period": period(m), "flowCode": "X", "partnerCode": WORLD, "cmdCode": "TOTAL"})
            if rows:
                latest = m
                break
        if latest is None:
            return {"status": "failed", "error": "UN Comtrade did not answer with a published month", "calls": calls.n, "wto": wto_out}
        wanted = [period(months_back(latest, i)) for i in range(MONTHS)]
        redo = set(wanted[:2])
        got = 0
        for p in wanted:
            if p in kept["months"] and p not in redo:
                continue
            if calls.late():
                left.append(f"{p} partners")
                continue
            rows = await calls.whole({"reporterCode": INDIA, "period": p, "flowCode": "X,M", "cmdCode": "TOTAL"}, [{"flowCode": "X"}, {"flowCode": "M"}])
            month = split_flows(rows or [], by_partner)
            if month.get("exports") and month.get("imports"):
                kept["months"][p] = month
                got += 1
        last_year = period(months_back(latest, 12))
        for p in (period(latest), last_year):
            if p in kept["products"] and p not in redo:
                continue
            if calls.late():
                left.append(f"{p} products")
                continue
            rows = await calls.whole({"reporterCode": INDIA, "period": p, "flowCode": "X,M", "partnerCode": WORLD, "cmdCode": "AG2"},
                                     [{"flowCode": "X"}, {"flowCode": "M"}])
            prod = split_flows(rows or [], by_product)
            if prod.get("exports") and prod.get("imports"):
                kept["products"][p] = prod
        keep = set(wanted) | {last_year}
        kept["months"] = {k: v for k, v in kept["months"].items() if k in keep}
        kept["products"] = {k: v for k, v in kept["products"].items() if k in {period(latest), last_year}}
        kept["latest"] = period(latest)
        kept["at"] = datetime.now(timezone.utc).isoformat(timespec="minutes")
        async with store.pool.acquire() as conn:
            await set_meta(conn, KEY, kept)
        # the drill-down: the latest month (again after a week) and the same month a year before (once), for the same partners and chapters
        drilled = {"partners": 0, "products": 0}
        if period(latest) in kept["products"]:
            sets = drill_sets(kept)
            periods = drill.get("periods") or {}
            now = datetime.now(timezone.utc)
            for p in (period(latest), last_year):
                have = periods.get(p) or {}
                try:
                    stale = p == period(latest) and now - datetime.fromisoformat(have["at"]) > DRILL_AGE
                except (KeyError, TypeError, ValueError):
                    stale = p == period(latest)
                one, complete = await _drill_period(calls, p, sets, have, stale, left)
                one["at"] = now.isoformat(timespec="minutes") if complete and (stale or not have.get("at")) else (have.get("at") or now.isoformat(timespec="minutes"))
                periods[p] = one
                drilled["partners"] += sum(1 for c in sets["partners"] if c in one["partners"])
                drilled["products"] += sum(1 for c in sets["products"] if c in one["products"])
                drill = {"periods": {k: v for k, v in periods.items() if k in {period(latest), last_year}}, "latest": period(latest),
                         "lastYear": last_year, "sets": sets}
                async with store.pool.acquire() as conn:
                    await set_meta(conn, DRILL_KEY, drill)
        out = {"status": "ok", "latest": period(latest), "monthsRead": got, "calls": calls.n, "drill": drilled, "wto": wto_out}
        if calls.failed:
            out["failedCalls"] = calls.failed
        if left:
            out["left"] = left
        return out
    finally:
        if own:
            await client.aclose()


def _label(p: str) -> str:
    return _pdate(p).strftime("%b %Y")


def _yoy(now: Optional[float], before: Optional[float]) -> Optional[float]:
    return round((now - before) / before * 100, 1) if now is not None and before else None


def _share(v: Optional[float], tot: Optional[float]) -> Optional[float]:
    return round(v / tot * 100, 2) if v is not None and tot else None


def map_rows(kept: dict) -> List[dict]:
    """Every partner country of the latest month for the world map: both flows with the share of India's total, the change on the month
    before and on the same month a year before. ISO alpha-3 codes join the map's shapes; areas without one are listed, not drawn."""
    names = kept.get("names") or {}
    latest = kept["latest"]
    pm, ly = period(months_back(_pdate(latest), 1)), period(months_back(_pdate(latest), 12))
    ms = kept["months"]
    cur, prev, year = ms.get(latest, {}), ms.get(pm, {}), ms.get(ly, {})
    codes = {c for _, f in FLOWS for c in (cur.get(f) or {}) if is_country(c, names)}
    rows = []
    for code in codes:
        nm = names[code]
        row: Dict[str, Any] = {"code": code, "name": nm[0], "iso3": nm[1]}
        for _, f in FLOWS:
            v = (cur.get(f) or {}).get(code)
            row[f] = None if v is None else {"value": round(v), "share": _share(v, (cur.get(f) or {}).get("0")),
                                             "momPct": _yoy(v, (prev.get(f) or {}).get(code)), "yoyPct": _yoy(v, (year.get(f) or {}).get(code))}
        rows.append(row)
    rows.sort(key=lambda r: -((r["exports"] or {}).get("value", 0) + (r["imports"] or {}).get("value", 0)))
    return rows


def drill_index(kept: dict, drill: Optional[dict]) -> Optional[dict]:
    """What the drill-down offers: the partners and chapters it read, with their latest values, and how much of India's trade they cover."""
    if not drill or drill.get("latest") != kept.get("latest"):
        return None
    cur = (drill.get("periods") or {}).get(kept["latest"]) or {}
    if not cur.get("partners") and not cur.get("products"):
        return None
    names = kept.get("names") or {}
    month = kept["months"].get(kept["latest"], {})
    prod = (kept.get("products") or {}).get(kept["latest"], {})
    partners = [{"code": c, "name": (names.get(c) or [f"Partner {c}"])[0], "iso3": (names.get(c) or [None, None])[1],
                 "exports": round((month.get("exports") or {}).get(c, 0)), "imports": round((month.get("imports") or {}).get(c, 0))}
                for c in drill["sets"]["partners"] if c in cur.get("partners", {})]
    products = [{"code": c, "name": HS.get(c, f"Chapter {c}"), "exports": round((prod.get("exports") or {}).get(c, 0)),
                 "imports": round((prod.get("imports") or {}).get(c, 0))} for c in drill["sets"]["products"] if c in cur.get("products", {})]
    cover = {f: _share(sum(p[f] for p in partners), (month.get(f) or {}).get("0")) for _, f in FLOWS}
    pcover = {f: _share(sum(p[f] for p in products), sum((prod.get(f) or {}).values()) or None) for _, f in FLOWS}
    ly = (drill.get("periods") or {}).get(drill.get("lastYear")) or {}
    return {"partners": partners, "products": products, "partnerCover": cover, "productCover": pcover, "at": cur.get("at"),
            "lastYearRead": bool(ly.get("partners") or ly.get("products"))}


def view(kept: Optional[dict], drill: Optional[dict] = None) -> Optional[dict]:
    """What the page draws: the latest month with its change against the same month a year before, the trend, the partners, the products, the
    map's rows and what the drill-down offers."""
    if not kept or not kept.get("months") or not kept.get("latest"):
        return None
    names = kept.get("names") or {}
    months = sorted(kept["months"])
    latest = kept["latest"]
    ly = period(months_back(_pdate(latest), 12))
    pm = period(months_back(_pdate(latest), 1))
    cur, prev = kept["months"].get(latest, {}), kept["months"].get(ly, {})
    total = lambda m, f: (m.get(f) or {}).get("0")  # noqa: E731

    def partners(flow: str) -> List[dict]:
        rows = []
        for code, v in (cur.get(flow) or {}).items():
            if not is_country(code, names):
                continue
            nm = names[code]
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
    return {"latest": latest, "label": _label(latest), "lastYear": _label(ly), "prevMonth": _label(pm), "exports": round(x or 0), "imports": round(m or 0),
            "balance": round((x or 0) - (m or 0)), "exportsYoyPct": _yoy(x, total(prev, "exports")), "importsYoyPct": _yoy(m, total(prev, "imports")),
            "trend": trend, "exportPartners": partners("exports"), "importPartners": partners("imports"),
            "exportProducts": products("exports"), "importProducts": products("imports"), "map": map_rows(kept), "drill": drill_index(kept, drill),
            "at": kept.get("at"), "source": "UN Comtrade (India as reported to the UN), US dollars"}


def drill_view(kept: Optional[dict], drill: Optional[dict], partner: Optional[str] = None, product: Optional[str] = None) -> Optional[dict]:
    """One partner's chapters both ways, or one chapter's partner countries both ways, in the latest month with the change on a year before.
    None when that partner or chapter was not read (only the largest are)."""
    if not kept or not drill or drill.get("latest") != kept.get("latest"):
        return None
    names = kept.get("names") or {}
    latest, ly = drill["latest"], drill.get("lastYear")
    cur = (drill.get("periods") or {}).get(latest) or {}
    old = (drill.get("periods") or {}).get(ly) or {}
    base = {"latest": latest, "label": _label(latest), "lastYear": _label(ly) if ly else None, "lastYearRead": bool(old.get("partners") or old.get("products"))}
    if partner is not None:
        flows = (cur.get("partners") or {}).get(partner)
        if flows is None:
            return None
        before = (old.get("partners") or {}).get(partner) or {}
        month = kept["months"].get(latest, {})
        out: Dict[str, Any] = {**base, "kind": "partner", "code": partner, "name": (names.get(partner) or [f"Partner {partner}"])[0],
                               "iso3": (names.get(partner) or [None, None])[1]}
        for _, f in FLOWS:
            now_f, old_f = flows.get(f) or {}, before.get(f) or {}
            tot = (month.get(f) or {}).get(partner) or sum(now_f.values()) or None
            rows = [{"code": c, "name": HS.get(c, f"Chapter {c}"), "value": round(v), "share": _share(v, tot), "yoyPct": _yoy(v, old_f.get(c))}
                    for c, v in now_f.items() if v > 0]
            rows.sort(key=lambda r: -r["value"])
            out[f] = rows
            out[f + "Total"] = round(tot) if tot else None
        return out
    flows = (cur.get("products") or {}).get(product or "")
    if flows is None:
        return None
    before = (old.get("products") or {}).get(product or "") or {}
    out = {**base, "kind": "product", "code": product, "name": HS.get(product or "", f"Chapter {product}")}
    for _, f in FLOWS:
        now_f, old_f = flows.get(f) or {}, before.get(f) or {}
        tot = now_f.get("0") or None
        rows = [{"code": c, "name": names[c][0], "iso3": names[c][1], "value": round(v), "share": _share(v, tot), "yoyPct": _yoy(v, old_f.get(c))}
                for c, v in now_f.items() if is_country(c, names) and v > 0]
        rows.sort(key=lambda r: -r["value"])
        out[f] = rows
        out[f + "Total"] = round(tot) if tot else None
    return out


def _json(body: Any, status: int = 200) -> Response:
    return Response(content=orjson.dumps(body), status_code=status, media_type="application/json", headers={"Cache-Control": "no-store"})


@router.get("/api/lab/trade")
async def global_trade(request: Request, _ctx: Ctx = Depends(lab_ctx)) -> Response:
    from ..macro import get_meta
    from . import wto
    async with request.app.state.store.pool.acquire() as conn:
        kept, drill, world = await get_meta(conn, KEY), await get_meta(conn, DRILL_KEY), await get_meta(conn, wto.KEY)
    has_key = bool(getattr(getattr(request.app.state, "settings", None), "wto_api_key", ""))
    v = view(kept, drill)
    if v is None:
        return _json({"ready": False, "reason": "India's trade loads from UN Comtrade twice a day; the first load has not run yet.",
                      "world": wto.view(world, has_key)})
    return _json({"ready": True, **v, "world": wto.view(world, has_key)})


CODE = re.compile(r"^\d{1,4}$")
HS_CODE = re.compile(r"^\d{2}$")
DRILL_PER_MINUTE = 120


@router.get("/api/lab/trade/drill")
async def global_trade_drill(request: Request, partner: Optional[str] = None, product: Optional[str] = None, ctx: Ctx = Depends(lab_ctx)) -> Response:
    """One partner's chapters (`?partner=<Comtrade code>`) or one chapter's partner countries (`?product=<HS chapter>`)."""
    from ..macro import get_meta
    if (partner is None) == (product is None) or (partner is not None and not CODE.match(partner)) or (product is not None and not HS_CODE.match(product)):
        return _json({"detail": "Ask for one partner (its UN Comtrade code) or one product (a two-digit HS chapter)."}, 400)
    limiter = getattr(request.app.state, "limiter", None)
    if limiter is not None:
        allowed, _ = await limiter.hit("lab-trade-drill", ctx.user_id or "anon", DRILL_PER_MINUTE, 60, fail_open=True)
        if not allowed:
            return _json({"detail": "Too many requests. Please slow down."}, 429)
    async with request.app.state.store.pool.acquire() as conn:
        kept, drill = await get_meta(conn, KEY), await get_meta(conn, DRILL_KEY)
    v = drill_view(kept, drill, partner=partner, product=product)
    if v is None:
        what = "partner" if partner is not None else "product"
        return _json({"detail": f"This {what} is not in the detail read from UN Comtrade: only India's largest partners and products are read, "
                                "and the detail of the latest month may still be loading."}, 404)
    return _json(v)
