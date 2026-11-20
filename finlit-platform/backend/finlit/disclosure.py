"""Fund facts from AMFI's own published files: fund size (average AUM), expense ratio (TER, Regular and Direct plan) and launch date,
for mutual funds and ETFs alike (an ETF is an AMFI scheme too). Read by finlit/mf.py and finlit/etf.py; written by the
`refresh-facts` worker command.

Sources (each checked by hand against the live site, October 2026, and recorded in tests/fixtures/disclosure):
  scheme master  portal.amfiindia.com/DownloadSchemeData_Po.aspx  every scheme code: its scheme name and launch date (its minimum amount is
                                                                  stored, not shown: out of date for some schemes)
  TER            amfiindia.com/ter-of-mf-schemes (its Excel export)  one row per scheme and day: Regular and Direct plan TER, in percent a year
  average AUM    amfiindia.com average AUM, scheme-wise              every scheme code's average assets over the latest quarter, rupees lakh

Rules: each step stands alone (one failing leaves the others and the stored figures as they were); an answer that fails its checks is refused
and nothing is stored from it; a quarter of AUM figures replaces the previous quarter whole, never mixed. A fact with no verified free source
says so instead of showing a guess. Information only, never advice.
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import os
import re
import tempfile
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from typing import Dict, List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo

import httpx

from . import mf

log = logging.getLogger("finlit.disclosure")
IST = ZoneInfo("Asia/Kolkata")

URL_MASTER = "https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0"
URL_TER_MONTHS = "https://www.amfiindia.com/api/populate-ter-month"
URL_TER = "https://www.amfiindia.com/api/populate-te-rdata-revised"
URL_AUM = "https://www.amfiindia.com/api/average-aum-schemewise"
SRC_MASTER = "AMFI scheme master"
SRC_TER = "AMFI, TER of mutual fund schemes"
SRC_AUM = "AMFI, average AUM scheme-wise"
SRC_EXCHANGE = "NSE trading rules"

# Below these an answer is not the whole industry (a partial file, an error page that parsed): it is refused and nothing is stored.
MIN_MASTER_ROWS = 8000
MIN_TER_SCHEMES = 1500
MIN_AUM_CODES = 3000
TER_MAX = 5.0          # percent a year; SEBI's caps keep every real TER well under this
AUM_PERIODS = ((1, 1), (1, 2), (2, 1), (2, 2))   # (fyId, periodId), newest first: AMFI may not have filled the newest quarter yet

NO_EXIT_LOAD = ("Exit load comes from AMFI's scheme details, which has not been read for this scheme yet; the scheme's own documents state it.")
NO_MANAGERS = ("Fund managers are named in each scheme's factsheet (PDF); no free machine-readable official source was found, so none is shown.")
NO_BENCHMARK = "AMFI publishes the benchmark on its fund performance page, which has not been read for this scheme yet; see the scheme's factsheet."
NO_RISKOMETER = "AMFI publishes the risk-o-meter on its fund performance page, which has not been read for this scheme yet; see the scheme's factsheet."
NO_TRACKING = "Tracking error is published in the fund house's monthly factsheet (PDF); no free machine-readable official source was found."
NOT_LOADED = "AMFI's figures have not been loaded yet; they appear after the next nightly update."


def name_key(name: str) -> str:
    """A scheme name as a comparison key: letters and digits only, lower case ("Axis Children's Fund" and "AXIS CHILDRENS FUND" agree)."""
    return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", name or "").lower())


def parse_amfi_date(s: str) -> Optional[date]:
    s = (s or "").strip()
    for fmt in ("%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def inr(n: float) -> str:
    """Indian digit grouping: 147064 -> '1,47,064'."""
    s = str(int(round(n)))
    neg, s = s.startswith("-"), s.lstrip("-")
    head, tail = s[:-3], s[-3:]
    while len(head) > 2:
        tail, head = head[-2:] + "," + tail, head[:-2]
    return ("-" if neg else "") + (head + "," + tail if head else tail)


def aum_text(lakh: float) -> str:
    """Rupees lakh as people read fund sizes: '₹1,47,064 crore', '₹45.30 crore', '₹82.50 lakh'."""
    crore = lakh / 100
    if crore >= 100:
        return f"₹{inr(crore)} crore"
    if crore >= 1:
        return f"₹{crore:,.2f} crore"
    return f"₹{lakh:,.2f} lakh"


MIN_PLAUSIBLE = 100   # rupees: AMFI's master lists a bare "5" or "10" for some schemes (e.g. ICICI Prudential Gilt Fund); no real minimum is that low


def min_text(raw: str) -> Optional[str]:
    """AMFI's minimum amount: a plain amount ("5000", "Rs. 5000/-") as '₹5,000'; any longer wording as AMFI wrote it. None when there is none,
    or when a plain amount is below MIN_PLAUSIBLE (a figure that cannot be a real minimum is not shown)."""
    t = re.sub(r"\s+", " ", (raw or "").strip())
    if not t or t.upper() in ("NA", "N.A.", "N/A", "0"):
        return None
    m = re.fullmatch(r"(?:Rs\.?\s*|INR\s*|₹\s*)?(\d+(?:\.\d+)?)\s*(?:/-)?", t, re.I)
    if m:
        v = float(m.group(1))
        if v < MIN_PLAUSIBLE:
            return None
        return f"₹{inr(v)}" if v == int(v) else f"₹{v:,.2f}"
    return t


# ------------------------------------------------------------------------------------------------------------- parsing

@dataclass(frozen=True)
class MasterRow:
    code: int
    base_name: str
    launch: Optional[date]
    minimum: Optional[str]
    nav_name: Optional[str] = None      # task #256: the full name with plan and option ("... - Direct Growth"), when the file has the column


def parse_master(text: str) -> Dict[int, MasterRow]:
    """AMFI's scheme master CSV -> {scheme code: row}. Empty when the header is not the one checked (so a changed file is refused, not misread)."""
    rd = csv.reader(io.StringIO(text.lstrip("﻿")))
    head = [h.strip().lower() for h in next(rd, [])]
    need = {"code": "code", "scheme name": "scheme name", "launch date": "launch date", "scheme minimum amount": "scheme minimum amount"}
    if not all(k in head for k in need):
        return {}
    ci, ni, li, mi = head.index("code"), head.index("scheme name"), head.index("launch date"), head.index("scheme minimum amount")
    vi = head.index("scheme nav name") if "scheme nav name" in head else None
    out: Dict[int, MasterRow] = {}
    for r in rd:
        if len(r) <= max(ci, ni, li, mi):
            continue
        code = r[ci].strip()
        if not code.isdigit() or not r[ni].strip():
            continue
        nav_name = re.sub(r"\s+", " ", r[vi].strip()) if vi is not None and len(r) > vi and r[vi].strip() else None
        out[int(code)] = MasterRow(int(code), re.sub(r"\s+", " ", r[ni].strip()), parse_amfi_date(r[li]), min_text(r[mi]), nav_name)
    return out


@dataclass(frozen=True)
class TerRow:
    key: str
    name: str
    category: Optional[str]
    regular: Optional[float]
    direct: Optional[float]
    day: date


TER_HEAD = ("Scheme Name", "Scheme Category", "TER Date", "Regular Plan - Total TER (%)", "Direct Plan - Total TER (%)")


def _pct(v) -> Optional[float]:
    """A TER cell: a positive percent, or None. AMFI writes 0 for a plan the scheme does not offer, so 0 is 'no such plan', never 0%."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, 4) if 0 < f <= TER_MAX else None


def parse_ter_xlsx(path: str) -> Dict[str, TerRow]:
    """AMFI's TER workbook -> {scheme name key: the scheme's row for the latest day in the file}. Empty when the columns are not the checked ones."""
    import openpyxl   # parses the workbook's XML through defusedxml (installed with it, see requirements.txt)

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        rows = wb.worksheets[0].iter_rows(values_only=True)
        head = [str(h or "").strip() for h in next(rows, ())]
        if not all(h in head for h in TER_HEAD):
            return {}
        ni, ci, di, ri, xi = (head.index(h) for h in TER_HEAD)
        out: Dict[str, TerRow] = {}
        for r in rows:
            if not r or len(r) <= max(ni, ci, di, ri, xi) or not r[ni]:
                continue
            d = r[di].date() if isinstance(r[di], datetime) else (r[di] if isinstance(r[di], date) else parse_amfi_date(str(r[di] or "")))
            if d is None:
                continue
            k = name_key(str(r[ni]))
            if k and (k not in out or d >= out[k].day):
                out[k] = TerRow(k, re.sub(r"\s+", " ", str(r[ni]).strip()), str(r[ci] or "").strip() or None, _pct(r[ri]), _pct(r[xi]), d)
        return out
    finally:
        wb.close()


_PERIOD = re.compile(r"([A-Za-z]+)\s*-\s*([A-Za-z]+)\s+(\d{4})")


def period_end(label: str) -> Optional[date]:
    """'July - September 2026' -> 2026-09-30 (the last day of the period's last month)."""
    m = _PERIOD.search(label or "")
    if not m:
        return None
    try:
        last = datetime.strptime(f"1 {m.group(2)[:3]} {m.group(3)}", "%d %b %Y").date()
    except ValueError:
        return None
    nxt = date(last.year + (last.month == 12), last.month % 12 + 1, 1)
    return date.fromordinal(nxt.toordinal() - 1)


def parse_aum(payload) -> Tuple[Optional[str], Optional[date], Dict[int, float]]:
    """(period label, period end, {scheme code: average AUM in rupees lakh}). A fund of funds' domestic AUM sits in its own column; the two are added."""
    if not isinstance(payload, dict):
        return None, None, {}
    label = payload.get("selectedPeriod")
    out: Dict[int, float] = {}
    houses = payload.get("data")
    for house in houses if isinstance(houses, list) else []:
        schemes = house.get("schemes") if isinstance(house, dict) else None
        for s in schemes if isinstance(schemes, list) else []:
            if not isinstance(s, dict):
                continue
            code, a = s.get("AMFI_Code"), s.get("AverageAumForTheMonth")
            a = a if isinstance(a, dict) else {}
            vals = []
            for k in ("ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas", "FundOfFundsDomestic"):
                try:
                    vals.append(float(a.get(k)))
                except (TypeError, ValueError):
                    pass
            if isinstance(code, int) and vals and all(v >= 0 for v in vals):
                out[code] = out.get(code, 0.0) + sum(vals)
    return label, period_end(label or ""), out


def fiscal_year(d: date) -> str:
    """India's financial year containing `d`, as AMFI's TER page names it: 22 Oct 2026 -> '2026-2027', 10 Mar 2026 -> '2025-2026'."""
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{start + 1}"


# ------------------------------------------------------------------------------------------------------------- fetching

WWW_AMFI = "https://www.amfiindia.com"


def relay_for(url: str) -> Tuple[str, dict]:
    """(url, headers) to use for an AMFI address. www.amfiindia.com does not answer from the AWS server's address; when AMFI_RELAY_URL is set (a free
    Cloudflare Worker, deploy/amfi-relay/) the same request goes through it, with AMFI_RELAY_KEY as the shared secret. Only www.amfiindia.com addresses
    are relayed (the scheme master on portal.amfiindia.com answers directly)."""
    base = os.getenv("AMFI_RELAY_URL", "").strip().rstrip("/")
    if not base or not url.startswith(WWW_AMFI):
        return url, {}
    key = os.getenv("AMFI_RELAY_KEY", "").strip()
    return base + url[len(WWW_AMFI):], ({"X-Relay-Key": key} if key else {})


async def _get(client: httpx.AsyncClient, url: str, **kw) -> httpx.Response:
    url, headers = relay_for(url)

    async def go():
        r = await client.get(url, headers=headers or None, **kw)
        r.raise_for_status()
        return r
    return await mf._retry(go)


async def fetch_master(client: httpx.AsyncClient) -> str:
    return (await _get(client, URL_MASTER)).content.decode("utf-8", "replace")


async def fetch_ter(client: httpx.AsyncClient, today: date) -> Tuple[Optional[str], Dict[str, TerRow]]:
    """(month, rows) of the newest month AMFI lists. The workbook (about 3 MB) goes through a temporary file, so it is never held twice in memory."""
    months: List[dict] = []
    for fy in (fiscal_year(today), fiscal_year(date(today.year - 1, today.month, 1))):   # early April the new year may still be empty
        got = (await _get(client, URL_TER_MONTHS, params={"year": fy})).json()
        months = [m for m in (got if isinstance(got, list) else []) if isinstance(m, dict) and m.get("MonthNumber")]
        if months:
            break
    if not months:
        return None, {}
    month = months[0]["MonthNumber"]             # AMFI lists the newest month first
    with tempfile.NamedTemporaryFile(suffix=".xlsx") as fh:
        ter_url, ter_headers = relay_for(URL_TER)
        async with client.stream("GET", ter_url, headers=ter_headers or None, params={"MF_ID": "All", "Month": month, "strCat": "-1", "strType": "-1", "excel": "true"}) as r:
            r.raise_for_status()
            async for chunk in r.aiter_bytes():
                fh.write(chunk)
        fh.flush()
        rows = await asyncio.to_thread(parse_ter_xlsx, fh.name)
    return month, rows


RETRY_PAUSE = 15.0  # seconds, growing with each attempt (tests set it to 0). AMFI answers an empty quarter for minutes at a time, then the full one
AUM_TRIES = 6       # per period: about five minutes of asking for the newest quarter before an older one is tried


async def fetch_aum(client: httpx.AsyncClient, min_codes: int = MIN_AUM_CODES) -> Tuple[Optional[str], Optional[date], Dict[int, float]]:
    """The newest quarter that AMFI has filled in. AMFI sometimes answers an empty list for a moment: each period is asked up to three times."""
    for fy, per in AUM_PERIODS:
        for attempt in range(AUM_TRIES):
            label, end, codes = parse_aum((await _get(client, URL_AUM, params={"strType": "Typewise", "fyId": fy, "periodId": per})).json())
            if len(codes) >= min_codes:
                return label, end, codes
            await asyncio.sleep(RETRY_PAUSE * (attempt + 1))
    return None, None, {}


# ------------------------------------------------------------------------------------------------------------- writing

async def step_master(store, client, *, min_rows: int = MIN_MASTER_ROWS) -> dict:
    rows = parse_master(await fetch_master(client))
    if len(rows) < min_rows:
        return {"status": "refused", "why": f"AMFI's scheme master gave {len(rows)} schemes (expected at least {min_rows})"}
    async with store.pool.acquire() as conn:
        known = {r["code"] for r in await conn.fetch("SELECT code FROM mf_schemes")}
        items = [(r.code, r.base_name, name_key(r.base_name), r.launch, r.minimum, r.nav_name) for r in rows.values() if r.code in known]
        async with conn.transaction():
            await conn.executemany(
                "INSERT INTO mf_facts (code, base_name, name_key, launch_date, min_text, nav_name) VALUES ($1, $2, $3, $4, $5, $6) "
                "ON CONFLICT (code) DO UPDATE SET base_name = EXCLUDED.base_name, name_key = EXCLUDED.name_key, launch_date = EXCLUDED.launch_date, "
                "min_text = EXCLUDED.min_text, nav_name = COALESCE(EXCLUDED.nav_name, mf_facts.nav_name), updated_at = now()", items)
            fixed = await mf.apply_nav_names(conn)   # task #256: a scheme the NAV file leaves without plan or option reads them from this name now
    return {"status": "ok", "schemes": len(items), "planOptionFromMaster": fixed}


async def store_ter(store, rows: Dict[str, TerRow], month: Optional[str], *, min_schemes: int = MIN_TER_SCHEMES, newer_only: bool = False) -> dict:
    """The checks and the write of an expense-ratio file, shared by the nightly fetch and the administrators' import. `newer_only` (the import) refuses a file
    whose newest day is older than the figures already held, so an old download can never replace newer figures."""
    if len(rows) < min_schemes:
        return {"status": "refused", "why": f"AMFI's TER file for {month or 'the newest month'} gave {len(rows)} schemes (expected at least {min_schemes})"}
    newest = max(r.day for r in rows.values())
    async with store.pool.acquire() as conn:
        if newer_only:
            held = await conn.fetchval("SELECT max(ter_date) FROM mf_ter")
            if held and newest < held:
                return {"status": "refused", "why": f"This file's newest day is {newest.isoformat()}, older than the figures already held ({held.isoformat()}); nothing was replaced"}
        async with conn.transaction():
            await conn.execute("DELETE FROM mf_ter")
            await conn.executemany("INSERT INTO mf_ter (name_key, name, category, ter_regular, ter_direct, ter_date) VALUES ($1, $2, $3, $4, $5, $6)",
                                   [(r.key, r.name, r.category, r.regular, r.direct, r.day) for r in rows.values()])
    return {"status": "ok", "month": month, "schemes": len(rows), "day": newest.isoformat()}


async def step_ter(store, client, today: date, *, min_schemes: int = MIN_TER_SCHEMES) -> dict:
    month, rows = await fetch_ter(client, today)
    return await store_ter(store, rows, month, min_schemes=min_schemes)


async def store_aum(store, label: Optional[str], end: Optional[date], codes: Dict[int, float], *, min_codes: int = MIN_AUM_CODES, newer_only: bool = False) -> dict:
    """The checks and the write of one quarter of average AUM, shared by the nightly fetch and the administrators' import (see `store_ter` for `newer_only`)."""
    if len(codes) < min_codes or end is None:
        return {"status": "refused", "why": f"AMFI's average AUM gave {len(codes)} scheme codes for {label or 'no period'} (expected at least {min_codes})"}
    total_crore = sum(codes.values()) / 100
    async with store.pool.acquire() as conn:
        if newer_only:
            held = await conn.fetchval("SELECT max(aum_end) FROM mf_facts")
            if held and end < held:
                return {"status": "refused", "why": f"This file is for {label} (ends {end.isoformat()}), older than the quarter already held ({held.isoformat()}); nothing was replaced"}
        known = {r["code"] for r in await conn.fetch("SELECT code FROM mf_schemes")}
        items = [(c, v, end, label) for c, v in codes.items() if c in known]
        async with conn.transaction():   # one quarter replaces the other whole: a code AMFI no longer lists has no figure, never last quarter's
            await conn.execute("UPDATE mf_facts SET aum_lakh = NULL, aum_end = NULL, aum_label = NULL WHERE aum_lakh IS NOT NULL")
            await conn.executemany(
                "INSERT INTO mf_facts (code, aum_lakh, aum_end, aum_label) VALUES ($1, $2, $3, $4) "
                "ON CONFLICT (code) DO UPDATE SET aum_lakh = EXCLUDED.aum_lakh, aum_end = EXCLUDED.aum_end, aum_label = EXCLUDED.aum_label, updated_at = now()",
                items)
    return {"status": "ok", "period": label, "codes": len(items), "industryCrore": round(total_crore)}


async def step_aum(store, client, *, min_codes: int = MIN_AUM_CODES) -> dict:
    label, end, codes = await fetch_aum(client, min_codes)
    return await store_aum(store, label, end, codes, min_codes=min_codes)


async def after_import(store) -> None:
    """What `refresh` does once a step succeeded: the category table's fund size, expense ratio and checklist, and the cached fund pages."""
    await mf._guarded("dashboard", mf.derive_dashboard(store))
    await mf._bump(store, None)


async def refresh(store, settings=None, *, client: Optional[httpx.AsyncClient] = None, today: Optional[date] = None, **limits) -> dict:
    """Run the three steps; each one failing (network, refused answer) leaves the others and the stored figures as they were."""
    today = today or datetime.now(IST).date()
    own = client is None
    client = client or mf.make_client()
    out: Dict[str, dict] = {}
    try:
        pick = lambda *names: {k: v for k, v in limits.items() if k in names}   # noqa: E731  (tests pass smaller minimums)
        for name, run in (("master", lambda: step_master(store, client, **pick("min_rows"))),
                          ("ter", lambda: step_ter(store, client, today, **pick("min_schemes"))),
                          ("aum", lambda: step_aum(store, client, **pick("min_codes")))):
            try:
                out[name] = await run()
            except Exception as exc:
                log.warning("fund facts step %s failed: %r", name, exc)
                out[name] = {"status": "failed", "why": f"{type(exc).__name__}: {str(exc)[:160]}"}
    finally:
        if own:
            await client.aclose()
    statuses = {v.get("status") for v in out.values()}
    # 'partial' = some steps ok, some not. The essential step is the scheme master (every other figure hangs on its scheme list): the worker treats a
    # partial run with it ok as degraded, never as failed. The expense ratios and fund sizes already held are kept and keep being served, each with its
    # date (`serving` below), until a later run replaces them.
    summary = {"status": "ok" if statuses == {"ok"} else ("failed" if "ok" not in statuses else "partial"), **out}
    if any(v.get("status") != "ok" for v in out.values()):
        try:
            async with store.pool.acquire() as conn:
                held = {"ter": await conn.fetchval("SELECT max(ter_date) FROM mf_ter"), "aum": await conn.fetchval("SELECT max(aum_end) FROM mf_facts")}
            for name, day in held.items():
                if name in out and out[name].get("status") != "ok":
                    out[name]["serving"] = f"the last good figures, dated {day.isoformat()}" if day else "no earlier figures are held"
                    out[name]["servingDate"] = day.isoformat() if day else None
        except Exception:   # nosec B110 - the note is for the status page only
            pass
    await mf.record_run(store, "refresh-facts", summary)
    if "ok" in statuses:
        summary["dashboard"] = await mf._guarded("dashboard", mf.derive_dashboard(store))   # fund size, expense ratio and checklist of the category table
        await mf._bump(store, None)   # cached fund pages are rebuilt with the new facts
    return summary


# ------------------------------------------------------------------------------------------------------------- reading

async def _facts_rows(conn, code: int):
    me = await conn.fetchrow("SELECT s.code, s.family, s.plan, f.name_key, f.launch_date, f.min_text FROM mf_schemes s "
                             "LEFT JOIN mf_facts f ON f.code = s.code WHERE s.code = $1", code)
    if me is None:
        return None, None, None
    fam = await conn.fetch("SELECT s.code, f.name_key, f.aum_lakh, f.aum_end, f.aum_label FROM mf_schemes s LEFT JOIN mf_facts f ON f.code = s.code "
                           "WHERE s.family = $1", me["family"])
    keys = [me["name_key"]] + [r["name_key"] for r in fam if r["name_key"] and r["name_key"] != me["name_key"]]
    ter = None
    for k in keys:   # every plan and option of a scheme shares its TER row; a code filed under an older name uses a sibling's match
        if k:
            ter = await conn.fetchrow("SELECT name, ter_regular, ter_direct, ter_date FROM mf_ter WHERE name_key = $1", k)
            if ter:
                break
    return me, fam, ter


def _aum_fact(fam, loaded: bool) -> dict:
    have = [r for r in fam if r["aum_lakh"] is not None]
    if not have:
        if not loaded:
            return {"unavailable": NOT_LOADED}
        return {"unavailable": "Not in AMFI's latest quarterly AUM report (a scheme launched after that quarter, or one AMFI does not report)."}
    end = max(r["aum_end"] for r in have)
    lakh = sum(r["aum_lakh"] for r in have if r["aum_end"] == end)
    label = next(r["aum_label"] for r in have if r["aum_end"] == end)
    return {"value": aum_text(lakh), "asOf": end.isoformat(), "source": SRC_AUM,
            "note": f"Average over {label}, all plans of the scheme together."}


def _ter_fact(ter, plan: str) -> dict:
    if ter is None:
        return {"unavailable": "This scheme is not in AMFI's latest expense ratio (TER) file."}
    v = ter["ter_regular"] if plan == "Regular" else ter["ter_direct"]
    if v is None:
        return {"unavailable": f"AMFI's TER file shows no figure for the {plan} plan (the scheme may not offer it)."}
    return {"value": f"{v:.2f}% a year", "asOf": ter["ter_date"].isoformat(), "source": SRC_TER}


def _house_ter_fact(extra: dict, plan: str) -> Optional[dict]:
    """The fund house's own TER (portfolios.step_ter) for a plan, used only when AMFI's file has no figure for it."""
    t = extra.get("ter")
    v = (t or {}).get("value", {}).get(plan.lower()) if t else None
    if v is None:
        return None
    return {"value": f"{v:.2f}% a year", "asOf": t["asOf"], "source": t["source"], **({"sourceUrl": t["sourceUrl"]} if t.get("sourceUrl") else {}),
            "note": "From the fund house's own daily TER disclosure."}


def _etf_ter_fact(ter) -> dict:
    """An ETF has one plan. AMFI files its TER under Regular for most ETFs and under Direct for others (checked: 251 and 108 of 361, never both)."""
    if ter is None:
        return {"unavailable": "This ETF is not in AMFI's latest expense ratio (TER) file."}
    v = ter["ter_regular"] if ter["ter_regular"] is not None else ter["ter_direct"]
    if v is None:
        return {"unavailable": "AMFI's TER file shows no figure for this ETF."}
    return {"value": f"{v:.2f}% a year", "asOf": ter["ter_date"].isoformat(), "source": SRC_TER}


# The scheme master's minimum amount is stored (mf_facts.min_text) but not shown: it is out of date for some schemes (every SBI Liquid Fund plan,
# retail ones included, is listed at an old ₹5 crore institutional minimum) and no second official source tells which. A wrong minimum is worse
# than none.
NO_MINIMUM = ("The minimum amount AMFI lists is out of date for some schemes, so none is shown; the scheme's own documents and the fund house's "
              "site give the current minimum.")


# Launch date rule (task #281, checked 20 Nov 2026): AMFI's scheme master and AMFI's scheme-details page give the same date (HSBC Small Cap Fund, formerly
# L&T Emerging Businesses Fund: 22 Apr 2014 in both), which is the scheme's launch (offer opening). Some sites show the allotment date instead (12 May 2014),
# and the first NAV comes a few days after that (15 May 2014). FinLit keeps AMFI's date and calls it the launch date; the two AMFI sources agree, so neither
# overrides the other. A scheme whose AMFI code changed in a takeover keeps the original scheme's launch date (AMFI carries it over).
def _launch_fact(me) -> dict:
    if me["launch_date"]:
        return {"value": me["launch_date"].isoformat(), "source": SRC_MASTER}
    return {"unavailable": NOT_LOADED if me["name_key"] is None else "AMFI's scheme master gives no launch date for this scheme."}


DIRECT_PLANS_BEGAN = date(2013, 1, 1)   # SEBI's Direct plans began industry-wide on 1 Jan 2013


def _day(d: date) -> str:
    return f"{d.day} {d.strftime('%b %Y')}"


def launch_note(plan: Optional[str], launch: Optional[date], first_nav: Optional[date], old_name: Optional[str], new_code_from: Optional[date]) -> Optional[str]:
    """The line under the launch date (task #281). The launch date stays the SCHEME's (AMFI's); this says when this plan began and under which name the
    scheme was launched, because other sites show those instead (HDFC Small Cap Fund: scheme 11 Feb 2008, Direct plan 1 Jan 2013; HSBC Small Cap Fund:
    launched in 2014 as L&T Emerging Businesses Fund).
    - A Direct plan of a scheme launched before Direct plans existed: "Direct plan from 1 Jan 2013", or from its first NAV on file when that is later.
    - A scheme whose AMFI code changed in a takeover: the name it was launched under and the day the new code began."""
    parts = []
    if old_name and new_code_from:
        base = re.split(r"\s*-\s*(?=(?:direct|regular)\b)", old_name, flags=re.I)[0].strip(" -")
        parts.append(f"Launched as {base}; AMFI gave the scheme a new code on {_day(new_code_from)}.")
    if plan == "Direct" and launch and launch < DIRECT_PLANS_BEGAN:
        # a first NAV in January 2013 is the industry-wide start (the first working days); a later one is this plan's own start
        start = first_nav if first_nav and (first_nav - DIRECT_PLANS_BEGAN).days > 31 else DIRECT_PLANS_BEGAN
        parts.append(f"Direct plan from {_day(start)}" + (" (Direct plans began on 1 Jan 2013)." if start == DIRECT_PLANS_BEGAN else " (its first NAV)."))
    return " ".join(parts) or None


async def get_facts(pool, key) -> Optional[dict]:
    """Facts of one scheme: `key` is an AMFI scheme code (fund pages) or an ISIN (ETF pages). Each fact is {value, asOf?, source, note?} or
    {unavailable: reason}. None when the scheme is unknown."""
    async with pool.acquire() as conn:
        code = key if isinstance(key, int) else (int(key) if str(key).isdigit() else
                                                 await conn.fetchval("SELECT code FROM mf_schemes WHERE isin = $1 OR isin_reinvest = $1 ORDER BY active DESC LIMIT 1", str(key)))
        if code is None:
            return None
        me, fam, ter = await _facts_rows(conn, int(code))
        loaded = bool(await conn.fetchval("SELECT EXISTS (SELECT 1 FROM mf_facts WHERE aum_lakh IS NOT NULL)")) if me else False
        # task #281: when this plan began (its first NAV on file) and the name the scheme was launched under, for the line under the launch date
        lineage = await conn.fetchrow("SELECT (SELECT d0 FROM mf_history WHERE code = $1) AS d0, p.old_name, p.new_first FROM (SELECT 1) one "
                                      "LEFT JOIN mf_predecessors p ON p.code = $1", int(code)) if me else None
    if me is None:
        return None
    try:   # holdings-side facts (finlit.portfolios): exit load, benchmark, risk-o-meter, managers; missing ones keep their reason
        from . import portfolios
        extra = await portfolios.extra_facts(pool, key) or {}
    except Exception:
        log.warning("portfolio facts unavailable for %s", key, exc_info=True)
        extra = {}
    aum = _aum_fact(fam, loaded)
    if "unavailable" in aum and extra.get("monthEndAum"):
        m = extra["monthEndAum"]
        aum = {"value": aum_text(m["lakh"]), "asOf": m["asOf"], "source": m["source"], "note": "Net assets at the end of the month, all plans of the scheme together."}
    launch = _launch_fact(me)
    if "unavailable" in launch and extra.get("launchDate"):
        launch = extra["launchDate"]
    if "unavailable" not in launch and lineage is not None:
        # the plan's own first NAV: with a joined earlier history (a takeover), the earlier code's first NAV is the plan's start
        first = lineage["d0"]
        note = launch_note(me["plan"], date.fromisoformat(str(launch["value"])[:10]), first, lineage["old_name"], lineage["new_first"])
        if note:
            launch = {**launch, "note": " ".join(x for x in (launch.get("note"), note) if x)}
    out = {"aum": aum, "launchDate": launch, "benchmark": extra.get("benchmark") or {"unavailable": NO_BENCHMARK},
           "riskometer": extra.get("riskometer") or {"unavailable": NO_RISKOMETER}, "managers": extra.get("managers") or {"unavailable": NO_MANAGERS}}
    if isinstance(key, int) or str(key).isdigit():     # a mutual fund page: both plans' TER, the scheme's minimum, exit load unknown
        tr, td = _ter_fact(ter, "Regular"), _ter_fact(ter, "Direct")
        if "unavailable" in tr:    # AMFI's TER wins when it has the figure; else the fund house's own page
            tr = _house_ter_fact(extra, "Regular") or tr
        if "unavailable" in td:
            td = _house_ter_fact(extra, "Direct") or td
        out.update(terRegular=tr, terDirect=td, minInvestment={"unavailable": NO_MINIMUM},
                   exitLoad=extra.get("exitLoad") or {"unavailable": NO_EXIT_LOAD})
    else:                                              # an ETF page: one plan (AMFI files it as Regular), bought and sold on the exchange
        te = _etf_ter_fact(ter)
        if "unavailable" in te:
            te = _house_ter_fact(extra, "Regular") or _house_ter_fact(extra, "Direct") or te
        out.update(ter=te, trackingError={"unavailable": NO_TRACKING},
                   minInvestment={"value": "1 unit, bought on the stock exchange", "source": SRC_EXCHANGE},
                   exitLoad={"value": "None when sold on the stock exchange", "source": SRC_EXCHANGE})
    return out


async def etf_ters(pool, isins: Sequence[str]) -> Dict[str, dict]:
    """The expense ratio of many ETFs at once, for the ETF list (task #133), by the same rules as one ETF page (get_facts): AMFI's TER file
    first (the scheme's own name, then a sibling plan's), else the fund house's own TER disclosure. {isin: {value (percent a year), asOf,
    source} or {unavailable: reason}}. Four reads, whatever the number of ETFs."""
    want = sorted({i for i in isins if i})
    if not want:
        return {}
    async with pool.acquire() as conn:
        me = await conn.fetch("SELECT DISTINCT ON (k.isin) k.isin, s.code, s.family, f.name_key FROM unnest($1::text[]) AS k(isin) "
                              "JOIN mf_schemes s ON s.isin = k.isin OR s.isin_reinvest = k.isin LEFT JOIN mf_facts f ON f.code = s.code "
                              "ORDER BY k.isin, s.active DESC, s.code", want)
        fams = sorted({r["family"] for r in me})
        sib = await conn.fetch("SELECT s.family, f.name_key FROM mf_schemes s JOIN mf_facts f ON f.code = s.code "
                               "WHERE s.family = ANY($1::text[]) AND f.name_key IS NOT NULL ORDER BY s.code", fams)
        keys = sorted({r["name_key"] for r in me if r["name_key"]} | {r["name_key"] for r in sib})
        ter = {r["name_key"]: r for r in await conn.fetch("SELECT name_key, ter_regular, ter_direct, ter_date FROM mf_ter WHERE name_key = ANY($1::text[])", keys)}
        house = {r["fkey"]: r for r in await conn.fetch("SELECT fkey, as_of, value, source FROM disclosure_facts WHERE kind = 'ter' AND fkey = ANY($1::text[])", fams)}
    siblings: Dict[str, List[str]] = {}
    for r in sib:
        siblings.setdefault(r["family"], []).append(r["name_key"])
    out: Dict[str, dict] = {i: {"unavailable": "Not found in AMFI's list of schemes."} for i in want}
    for r in me:
        row = next((ter[k] for k in [r["name_key"], *siblings.get(r["family"], [])] if k and k in ter), None)
        v = None if row is None else (row["ter_regular"] if row["ter_regular"] is not None else row["ter_direct"])
        if v is not None:
            out[r["isin"]] = {"value": round(v, 2), "asOf": row["ter_date"].isoformat(), "source": SRC_TER}
            continue
        h = house.get(r["family"])
        hv = (json.loads(h["value"]) if isinstance(h["value"], str) else h["value"]) if h else None
        hv = (hv or {}).get("regular") if (hv or {}).get("regular") is not None else (hv or {}).get("direct")
        if hv is not None:
            out[r["isin"]] = {"value": round(float(hv), 2), "asOf": h["as_of"].isoformat() if h["as_of"] else None, "source": h["source"]}
        else:
            out[r["isin"]] = {"unavailable": _etf_ter_fact(row)["unavailable"]}
    return out


async def top_by_aum(pool, n: int) -> List[int]:
    """Scheme codes of the n largest schemes by the latest quarter's average AUM (all plans of a scheme added together), one code per scheme:
    its Direct Growth option, else its Regular Growth option, among active schemes with a 5-year figure (what the hot list can show)."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """WITH q AS (SELECT max(aum_end) AS e FROM mf_facts WHERE aum_lakh IS NOT NULL),
                    fam AS (SELECT s.family, sum(f.aum_lakh) AS aum FROM mf_facts f JOIN mf_schemes s ON s.code = f.code, q
                            WHERE f.aum_end = q.e GROUP BY s.family),
                    pick AS (SELECT DISTINCT ON (s.family) s.family, s.code FROM mf_schemes s
                             WHERE s.active AND s.option_class = 'Growth' AND s.nav IS NOT NULL AND s.r5y IS NOT NULL
                             ORDER BY s.family, (s.plan = 'Direct') DESC, s.code)
               SELECT pick.code FROM pick JOIN fam ON fam.family = pick.family ORDER BY fam.aum DESC, pick.code LIMIT $1""", n)
    return [r["code"] for r in rows]


async def get_portfolio(pool, key) -> Optional[dict]:
    """The latest monthly portfolio of a scheme (code) or ETF (ISIN): see finlit.portfolios."""
    from . import portfolios
    return await portfolios.get_portfolio(pool, key)
