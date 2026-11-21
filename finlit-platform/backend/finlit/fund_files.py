"""Administrators' upload of fund-house portfolio files (task #281 round 7), for the fund houses whose sites refuse the server.

The nightly portfolios job (finlit/portfolios.py) downloads each fund house's monthly portfolio file itself. Some sites refuse the server: HDFC (403 to any
script), Kotak (a captcha), Edelweiss (403), Navi (Cloudflare's browser check), Union (no answer), and Baroda BNP refuses the relay. The owner's rule (21 Nov
2026): the job never disguises itself or goes around a block; a person's real browser downloads the SAME public file and uploads it here.

Nothing is trusted more because a person sent it: the file's type is checked from its bytes, the raw file is kept (who, when, house, month, SHA-256), and it is
read by the very reader the nightly job uses for that house: the house's own reader when it has one (HDFC: its monthly factsheet PDF, houses_e.py), else the
standard SEBI monthly-portfolio workbook reader every Excel house goes through (portfolios.process_workbook). Each portfolio is matched to AMFI's list and
validated exactly as at night, then stored with store_portfolio; the nightly job never deletes it (it only adds newer months). When nothing in a file can be
read, the file is kept and the page says so: it never claims a file was read when it was not. Admin only; every upload is listed on Console > Data health."""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import json
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .auth.routes import NO_STORE, Ctx, admin_ctx, fail

log = logging.getLogger("finlit.fund_files")
router = APIRouter(prefix="/api/admin/fund-files")

MAX_FILE = 25 * 1024 * 1024                 # one fund house's monthly file (HDFC's factsheet is about 10 MB, Kotak's zip a few MB)
MAX_BODY = MAX_FILE * 4 // 3 + 64 * 1024    # the same file as base64 inside the JSON body
KINDS = ("xlsx", "xls", "zip", "pdf")


@dataclass(frozen=True)
class House:
    key: str             # the reader's key (an adapter key of the nightly job where there is one)
    title: str           # the fund house as AMFI names it
    amc: str             # matches the house's schemes in AMFI's list (portfolios.Index.resolve)
    site: str            # where the person downloads the file
    page: str            # the page that links the monthly portfolio files
    why: str             # why the server cannot fetch it itself
    pdf: bool = False    # the house publishes its full portfolio only in its factsheet PDF


# The houses whose sites refuse the server (checked 20-21 Nov 2026). Listed first on the page, with the file each one needs.
BLOCKED: List[House] = [
    House("hdfc", "HDFC Mutual Fund", r"^hdfc\b", "hdfcfund.com", "https://www.hdfcfund.com/statutory-disclosure/factsheets",
          "HDFC's site and file store answer the server with 403 Access Denied. Upload the monthly factsheet PDF (it prints every scheme's full portfolio).", pdf=True),
    House("kotak", "Kotak Mahindra Mutual Fund", r"^kotak\b", "kotakmf.com", "https://www.kotakmf.com/Information/portfolios",
          "Kotak's pages ask for a captcha. Upload the monthly portfolio file (Excel or zip)."),
    House("edelweiss", "Edelweiss Mutual Fund", r"^edelweiss\b", "edelweissmf.com", "https://www.edelweissmf.com/statutory-disclosures/portfolio-disclosure",
          "Edelweiss answers the server with 403. Upload the monthly portfolio file (Excel or zip)."),
    House("navi", "Navi Mutual Fund", r"^navi\b", "navi.com", "https://navi.com/mutual-fund/downloads/portfolio",
          "Navi's page is behind a Cloudflare browser check. Upload the monthly portfolio file (Excel or zip)."),
    House("union", "Union Mutual Fund", r"^union\b", "unionmf.com", "https://unionmf.com/downloads/portfolio",
          "Union's site does not answer the server. Upload the monthly portfolio file (Excel or zip)."),
    House("barodabnp", "Baroda BNP Paribas Mutual Fund", r"baroda", "barodabnpparibasmf.in", "https://www.barodabnpparibasmf.in/downloads/monthly-portfolio-scheme",
          "Baroda BNP refuses the relay (Cloudflare 522) and timed out from the server. Upload the monthly portfolio file (Excel or zip)."),
]


def houses() -> List[House]:
    """The blocked houses first, then every other house the nightly job reads (an upload is a second way in for any of them)."""
    from .disclosure_parsers.amcs import ADAPTERS
    keys = {h.key for h in BLOCKED}
    rest = [House(a.key, a.title, a.amc_re.pattern, a.site, f"https://{a.site}", "Read by the nightly job; an upload here is a second way in.")
            for a in ADAPTERS if a.key not in keys]
    return BLOCKED + sorted(rest, key=lambda h: h.title)


def house_of(key: str) -> Optional[House]:
    return next((h for h in houses() if h.key == key), None)


def kind_of(data: bytes) -> Optional[str]:
    """The file's type from its own bytes, never its name: an Excel workbook (xlsx is a zip holding xl/workbook.xml), an old Excel file, a zip, a PDF."""
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "xls"
    if data.startswith(b"PK\x03\x04"):
        import io
        import zipfile
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                return "xlsx" if "xl/workbook.xml" in z.namelist() else "zip"
        except zipfile.BadZipFile:
            return None
    return None


def month_end(ym: str) -> Optional[date]:
    """'2026-10' -> 2026-10-31."""
    try:
        y, m = (int(x) for x in ym.split("-"))
        if not (2000 <= y <= 2100 and 1 <= m <= 12):
            return None
    except ValueError:
        return None
    return date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)


def month_due(today: date) -> date:
    """The newest month whose portfolio should be out: SEBI has fund houses publish a month's portfolio within 10 days of its end."""
    first = today.replace(day=1)
    last = first - timedelta(days=1)
    return last if today.day > 10 else (last.replace(day=1) - timedelta(days=1))


MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def month_label(d: date) -> str:
    return f"{MONTHS[d.month - 1]} {d.year}"


class UploadIn(BaseModel):
    house: str = Field(min_length=2, max_length=40, description="the fund house's key, from GET /api/admin/fund-files")
    month: str = Field(pattern=r"^\d{4}-\d{2}$", description="the month the file is for, YYYY-MM")
    name: str = Field(min_length=1, max_length=200, description="the file's name as downloaded")
    file: str = Field(min_length=8, max_length=MAX_BODY, description="the file, as base64")


def read_file(path: str, house: House, month: date, file_name: str, idx) -> dict:
    """Read one uploaded file with the nightly job's reader for this house. Returns the job's own stats plus the parsed (family, Portfolio) list."""
    from . import portfolios as P
    from .disclosure_parsers.amcs import ADAPTERS, Adapter, FileRef

    adapter = next((a for a in ADAPTERS if a.key == house.key), None)
    if adapter is None and house.key == "hdfc":
        from .disclosure_parsers.houses_e import HDFC as adapter          # defined, tested, not run nightly (HDFC refuses the server): uploads use it
    if adapter is None:
        adapter = Adapter(house.key, house.title, house.amc, None, house.site)
    ref = FileRef(house.key, f"https://{house.site}", month, None, f"{file_name} (uploaded)")
    stats = {"files": 1, "sheets": 0, "sheets_skipped": 0, "warnings": 0, "rejected": [], "unmapped": [], "failures": [], "errors": []}
    sink: list = []
    parse_file = getattr(adapter, "parse_file", None)
    members = [(os.path.basename(path), path)] if parse_file else P._members(path)
    for mname, mpath in members:
        try:
            (parse_file or P.process_workbook)(mpath, ref, adapter, idx, stats, sink)
        except Exception as exc:     # a damaged or unexpected file: say so; nothing is stored from it
            stats["errors"].append(f"{mname}: {type(exc).__name__}: {str(exc)[:160]}")
    stats["parsed"] = sink
    stats["reader"] = "factsheet PDF reader" if parse_file else "monthly portfolio workbook reader"
    return stats


async def store_file(pool, house: House, month: date, file_name: str, data: bytes, kind: str, who: Optional[str]) -> dict:
    """Keep the raw file, read it, store what passed, record the result. Returns the result shown on the page."""
    from . import portfolios as P

    sha = hashlib.sha256(data).hexdigest()
    async with pool.acquire() as conn:
        same = await conn.fetchrow("SELECT id, uploaded_at, status, result FROM fund_house_files WHERE house = $1 AND sha256 = $2", house.key, sha)
    tmp = tempfile.mkdtemp(prefix=f"upload_{house.key}_")
    path = os.path.join(tmp, "f." + kind)
    try:
        with open(path, "wb") as fh:
            fh.write(data)
        idx = await P.load_index(pool)
        if kind == "pdf" and house.key != "hdfc":
            stats = {"sheets": 0, "rejected": [], "unmapped": [], "failures": [], "errors": [], "parsed": [], "reader": None}
        else:
            stats = await asyncio.to_thread(read_file, path, house, month, file_name, idx)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    stored, kept, too_old, schemes = 0, 0, 0, []
    for fam, p in stats.pop("parsed"):
        res = await P.store_portfolio(pool, fam, idx.amc[fam], p)
        stored += res == "stored"
        kept += res == "kept_existing"
        too_old += res == "too_old"
        schemes.append({"scheme": p.scheme_name, "asOf": p.as_of.isoformat(), "holdings": len(p.holdings), "result": res})
    read = stored + kept + too_old
    if stats.get("reader") is None:
        status, why = "stored, no reader", ("This fund house's full portfolio comes as an Excel file; a PDF from it cannot be read yet. The file is kept. "
                                            "Upload the monthly portfolio Excel or zip if the site offers one.")
    elif read == 0 and stats["sheets"] == 0:
        status, why = "stored, no reader", ("The file is kept, but no portfolio in it could be read: a reader for this fund house's layout is being built. "
                                            "Nothing from it is shown until then.")
    elif read == 0:
        status, why = "not read", "Portfolios were found but none matched AMFI's list or passed the checks; see the lists below. Nothing was stored."
    elif stats["unmapped"] or stats["rejected"] or stats["errors"]:
        status, why = "partly read", "Some portfolios were stored; the ones listed below were not."
    else:
        status, why = "read", "Every portfolio in the file was matched to AMFI's list, checked and stored."
    result = {"status": status, "why": why, "reader": stats.get("reader"), "portfolios": stats["sheets"], "stored": stored, "keptExisting": kept,
              "olderThanKept": too_old, "schemes": schemes[:200], "unmatched": [u["scheme"] for u in stats["unmapped"]][:200],
              "rejected": stats["rejected"][:50], "errors": (stats["errors"] + [f["why"] for f in stats.get("failures", [])])[:50]}
    async with pool.acquire() as conn:
        if same:
            await conn.execute("UPDATE fund_house_files SET month_end = $2, file_name = $3, uploaded_by = $4, uploaded_at = now(), status = $5, result = $6::jsonb "
                               "WHERE id = $1", same["id"], month, file_name[:200], who, status, json.dumps(result, default=str))
            fid = same["id"]
        else:
            fid = await conn.fetchval("INSERT INTO fund_house_files (house, month_end, file_name, kind, size_bytes, sha256, content, uploaded_by, status, result) "
                                      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING id",
                                      house.key, month, file_name[:200], kind, len(data), sha, data, who, status, json.dumps(result, default=str))
    return {"id": fid, "house": house.key, "houseTitle": house.title, "month": month.isoformat()[:7], "monthLabel": month_label(month), "file": file_name,
            "kind": kind, "sizeBytes": len(data), "sha256": sha, "again": bool(same), **result}


async def overview(pool, today: Optional[date] = None) -> dict:
    """Each house with the latest month of holdings stored for its schemes, the month due now, and the recent uploads."""
    from . import portfolios as P
    today = today or P._today()
    due = month_due(today)
    async with pool.acquire() as conn:
        latest = {r["amc"]: r["latest"] for r in await conn.fetch("SELECT amc, max(as_of) AS latest FROM disclosure_portfolios GROUP BY amc")}
        ups = await conn.fetch("SELECT id, house, month_end, file_name, kind, size_bytes, uploaded_by, uploaded_at, status, result->>'stored' AS stored "
                               "FROM fund_house_files ORDER BY uploaded_at DESC LIMIT 40")
    import re
    rows = []
    for h in houses():
        rx = re.compile(h.amc, re.I)
        have = max((d for amc, d in latest.items() if rx.search(amc or "")), default=None)
        blocked = h in BLOCKED
        needs = None if have and have >= due else month_label(due)
        rows.append({"key": h.key, "title": h.title, "blocked": blocked, "site": h.site, "page": h.page, "why": h.why, "pdf": h.pdf,
                     "latest": have.isoformat() if have else None, "latestLabel": month_label(have) if have else None,
                     "needs": needs if blocked else None})
    return {"due": due.isoformat()[:7], "dueLabel": month_label(due), "houses": rows,
            "uploads": [{"id": u["id"], "house": u["house"], "month": u["month_end"].isoformat()[:7], "file": u["file_name"], "kind": u["kind"],
                         "sizeBytes": u["size_bytes"], "by": u["uploaded_by"], "at": u["uploaded_at"].isoformat(), "status": u["status"],
                         "stored": int(u["stored"] or 0)} for u in ups]}


@router.get("")
async def list_files(request: Request, ctx: Ctx = Depends(admin_ctx)) -> JSONResponse:
    return JSONResponse(await overview(request.app.state.store.pool), headers=NO_STORE)


@router.post("")
async def upload(request: Request, body: UploadIn, ctx: Ctx = Depends(admin_ctx)) -> JSONResponse:
    house = house_of(body.house)
    if house is None:
        raise fail(422, "bad_house", "Unknown fund house.")
    month = month_end(body.month)
    if month is None or month > date.today() + timedelta(days=31):
        raise fail(422, "bad_month", "Choose the month the file is for (YYYY-MM).")
    try:
        data = base64.b64decode(body.file, validate=True)
    except (binascii.Error, ValueError):
        raise fail(422, "bad_file", "The file could not be read. Send it as base64.")
    if len(data) > MAX_FILE:
        raise fail(413, "too_large", f"This file is larger than {MAX_FILE // (1024 * 1024)} MB.")
    kind = kind_of(data)
    if kind is None:
        raise fail(422, "bad_file", "This is not an Excel workbook (.xlsx or .xls), a zip of workbooks or a PDF.")
    result = await store_file(request.app.state.store.pool, house, month, body.name, data, kind, getattr(ctx, "email", None))
    log.info("fund-house file %s %s %s: %s, %s stored", house.key, body.month, body.name, result["status"], result["stored"])
    return JSONResponse(result, status_code=201, headers=NO_STORE)

