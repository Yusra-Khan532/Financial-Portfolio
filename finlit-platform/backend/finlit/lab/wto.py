"""Trading Lab > Global > Global trade: the world's merchandise trade and India's share of it, by year, from the WTO's Timeseries API
(api.wto.org/timeseries/v1, docs/GLOBAL-MARKETS.md).

The API needs a free subscription key from the WTO's API portal (apiportal.wto.org), sent in the `Ocp-Apim-Subscription-Key` header. FinLit reads
it from the environment variable `WTO_API_KEY` (config.Settings.wto_api_key; set only in the server's /opt/finlit/.env.aws, never in the repo).
Without a key the step is skipped and the page says so plainly; nothing is filled in.

Two calls a read, one per flow: indicator ITS_MTV_AX (merchandise exports, annual) and ITS_MTV_AM (imports), reporters 000 (World) and 356
(India), partner 000 (World), product TO (total merchandise), the last twelve years, in million US dollars. The WTO publishes these totals a few
times a year (April, September and November), so the job reads them again only when its copy is three days old. Responses are decoded as
cp1252 (the WTO's answers declare no character set) and a 429 waits and tries again. Facts only.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("finlit.lab.wto")

DATA = "https://api.wto.org/timeseries/v1/data"
KEY = "trade:wto"
WORLD, INDIA = "000", "356"
INDICATORS = (("ITS_MTV_AX", "exports"), ("ITS_MTV_AM", "imports"))
YEARS = 12
AGE = timedelta(days=3)
UA = {"User-Agent": "FinLit (finlitventures.com) trade statistics", "Accept": "application/json"}
NO_KEY = ("The WTO's world trade totals need a free WTO API key on the server (the setting WTO_API_KEY). It is not set here, so this part "
          "is skipped; India's trade above is unaffected.")
SOURCE = "WTO Timeseries API: merchandise trade values, annual (ITS_MTV_AX, ITS_MTV_AM), million US dollars"


def _decode(body: bytes) -> Any:
    try:
        return json.loads(body.decode("cp1252"))
    except (UnicodeDecodeError, ValueError):
        return json.loads(body.decode("utf-8", errors="replace"))


def parse(body: Any) -> Dict[str, Dict[str, float]]:
    """{reporter code: {year: million US$}} from a /data answer ({"Dataset": [...]}): total merchandise with the world only."""
    rows = body.get("Dataset") if isinstance(body, dict) else body
    out: Dict[str, Dict[str, float]] = {}
    for r in rows or []:
        if not isinstance(r, dict):
            continue
        code, year, v = str(r.get("ReportingEconomyCode") or ""), r.get("Year"), r.get("Value")
        if r.get("PartnerEconomyCode") not in (None, WORLD) or r.get("ProductOrSectorCode") not in (None, "TO"):
            continue
        if code and isinstance(year, int) and isinstance(v, (int, float)):
            out.setdefault(code, {})[str(year)] = float(v)
    return out


async def refresh(store, key: str, client: Optional[httpx.AsyncClient] = None, today: Optional[date] = None, pause: float = 1.5) -> str:
    """Reads the world and India totals when the stored copy is older than AGE. Returns what happened in a word or two."""
    from ..macro import get_meta, set_meta
    if not key:
        return "skipped: no WTO_API_KEY"
    async with store.pool.acquire() as conn:
        kept = await get_meta(conn, KEY)
    try:
        if kept and datetime.now(timezone.utc) - datetime.fromisoformat(kept["at"]) < AGE:
            return "fresh"
    except (KeyError, TypeError, ValueError):
        pass
    today = today or date.today()
    own = client is None
    client = client or httpx.AsyncClient(timeout=60, headers=UA)
    out: Dict[str, Any] = {}
    try:
        for ind, flow in INDICATORS:
            params = {"i": ind, "r": f"{WORLD},{INDIA}", "p": WORLD, "pc": "TO", "ps": f"{today.year - YEARS}-{today.year}", "fmt": "json",
                      "mode": "full", "lang": "1", "max": "500"}
            got = None
            for attempt in range(3):
                try:
                    r = await client.get(DATA, params=params, headers={**UA, "Ocp-Apim-Subscription-Key": key})
                except httpx.HTTPError:
                    r = None
                if r is not None and r.status_code in (401, 403):
                    return f"failed: the WTO refused the key ({r.status_code})"
                if r is not None and r.status_code == 200:
                    try:
                        got = parse(_decode(r.content))
                    except ValueError:
                        got = None
                    break
                await asyncio.sleep(pause * (attempt + 1))
            await asyncio.sleep(pause)
            if not got or WORLD not in got:
                return f"failed: no {flow} totals from the WTO"
            out[flow] = got
    finally:
        if own:
            await client.aclose()
    out["at"] = datetime.now(timezone.utc).isoformat(timespec="minutes")
    async with store.pool.acquire() as conn:
        await set_meta(conn, KEY, out)
    return "ok"


def view(kept: Optional[dict], has_key: bool) -> dict:
    """The page's world panel: each year's world exports and imports, India's, and India's share of each; or a plain reason."""
    if not kept or not kept.get("exports"):
        if not has_key:
            return {"ready": False, "reason": NO_KEY}
        return {"ready": False, "reason": "The WTO's world trade totals load with the next run of the trade job."}
    years: List[dict] = []
    ys = sorted({y for f in ("exports", "imports") for y in ((kept.get(f) or {}).get(WORLD) or {})})
    for y in ys:
        row: Dict[str, Any] = {"year": int(y)}
        for f in ("exports", "imports"):
            w = ((kept.get(f) or {}).get(WORLD) or {}).get(y)
            i = ((kept.get(f) or {}).get(INDIA) or {}).get(y)
            row[f] = {"world": w, "india": i, "share": round(i / w * 100, 2) if w and i is not None else None}
        years.append(row)
    for a, b in zip(years, years[1:]):
        for f in ("exports", "imports"):
            w0, w1 = a[f]["world"], b[f]["world"]
            b[f]["worldYoyPct"] = round((w1 - w0) / w0 * 100, 1) if w0 and w1 is not None else None
    if years:
        years[0]["exports"]["worldYoyPct"] = years[0]["imports"]["worldYoyPct"] = None
    return {"ready": True, "years": years, "unit": "million US dollars", "at": kept.get("at"), "source": SOURCE}
