"""ISIN -> company (task #128): holdings files are read by ISIN, the one code that is unique to each security, and by name only when a line has no ISIN.

A company's name differs from file to file ("DR. LAL PATHLABS LIMITED", "Dr Lal PathLabs", "LALPATHLAB"), and two companies can share most of a name
("ATLANTA LIMITED" and "Atlanta Electricals Ltd"), so a name is a guess and an ISIN is not. Where each answer comes from, first that answers wins:

  1. exchange   the exchanges' instrument lists (Dhan's file, `dhan_instruments`, loaded every night): the ISIN of the NSE share (matched to our company by
                its NSE code) or the BSE share (by its BSE code). This is the company's current ISIN.
  2. disclosure the mutual funds' monthly portfolio files (`disclosure_isin`): they also carry ISINs the exchanges no longer list (an ISIN from before a
                face-value split, for example).
  3. same issuer the depository's ISIN list (NSDL "ISIN details", `isin_master`): an equity ISIN that 1 and 2 do not know, whose issuer has another equity
                ISIN that 1 or 2 does know, and only one company has those (an old or partly paid ISIN of a listed company). Marked "please check".
  4. issuer name the depository names the issuer exactly as one company in our list is named (after Ltd / Limited / punctuation are taken out), and no other.
                Marked "please check".
  Otherwise the ISIN is explained, never guessed: a mutual fund unit (with its scheme, from AMFI's list), an ETF, a bond or other security, a share that is
  not listed, an ISIN no list knows, or not a valid ISIN at all (its check digit is wrong).

The depository list ships with the code (`data/nsdl_isin_<date>.csv.gz`, equity shares and fund units only) and is loaded at `worker migrate` when the
shipped file is newer than the stored one; a newer list from NSDL is loaded with `python -m finlit.worker load-isin-list --file <zip or csv>`.
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import logging
import re
import time
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

log = logging.getLogger("finlit.isin")
router = APIRouter(prefix="/api/isin")

ISIN = re.compile(r"^IN[A-Z0-9]{9}\d$")
DATA = Path(__file__).parent / "data"
META_KEY = "isin-master"
MAX_ISINS = 2000
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
_NORM_DROP = re.compile(r"\b(LIMITED|LTD|THE|CO|COMPANY|CORPORATION|CORP|INC|PVT|PRIVATE)\b\.?")


def valid(isin: str) -> bool:
    """ISO 6166 check digit: letters become numbers (A=10 ... Z=35), then the Luhn sum of all digits must end in 0."""
    if not ISIN.match(isin or ""):
        return False
    digits = "".join(str(int(c, 36)) for c in isin)
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def norm(name: str) -> str:
    """A company name without Ltd / Limited / The / punctuation, upper case: the same rule as the browser's matcher (holdingsMatch.ts `norm`)."""
    s = (name or "").upper().replace("&", " AND ")
    s = _NORM_DROP.sub(" ", s)
    return " ".join(re.sub(r"[^A-Z0-9]+", " ", s).split())


def kind_of(isin: str, cfi: str = "") -> str:
    """share | preference | fund | govt | other, from the CFI code when the depository list has it, else from the ISIN itself (INF = fund units; IN0-IN4 = central and
    state government securities; for an INE ISIN, characters 8-9 are the security type and 01 is an equity share)."""
    c = (cfi or "").upper()
    if c.startswith("EP"):
        return "preference"            # a preference share is not the company's ordinary share
    if c.startswith("E"):
        return "share"
    if c.startswith("C") or isin.startswith("INF"):
        return "fund"
    if c:
        return "other"
    if re.match(r"^IN[0-4]", isin):
        return "govt"
    if isin[2] in "E9" and isin[7:9] == "01":
        return "share"
    return "other"


# ------------------------------------------------------------------------------------------------------------------ the depository list

def list_date(name: str) -> Optional[date]:
    """The date in the list's file name: ISIN_DETAILS_12-Nov-2026.csv (NSDL's own name) or nsdl_isin_2026-11-12.csv.gz (the shipped copy)."""
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", name)
    if m:
        return date(int(m[1]), int(m[2]), int(m[3]))
    m = re.search(r"(\d{1,2})-([A-Za-z]{3})-(\d{4})", name)
    if m and m[2].lower() in MONTHS:
        return date(int(m[3]), MONTHS[m[2].lower()], int(m[1]))
    return None


def read_master(fh: Iterable[str]) -> Iterator[Tuple[str, str, str, str]]:
    """(isin, issuer, description, cfi) for every equity share and fund unit in either layout: NSDL's (ISIN, NAME_OF_ISSUER, SECURITY_DESCRIPTION, ..., CFI)
    or the shipped one (isin, issuer, description, cfi). Bonds, commercial paper and the like are left out: a holdings file names them, it does not score them."""
    rd = csv.DictReader(fh)
    cols = {k.strip().lower(): k for k in (rd.fieldnames or []) if k}
    pick = lambda *names: next((cols[n] for n in names if n in cols), None)   # noqa: E731
    ci, cn, cd, cc = pick("isin"), pick("issuer", "name_of_issuer"), pick("description", "security_description"), pick("cfi")
    if not ci or not cn:
        raise ValueError("not an ISIN list: it needs an ISIN column and an issuer name column (NAME_OF_ISSUER)")
    seen = set()
    for r in rd:
        isin = (r.get(ci) or "").strip().upper()
        cfi = (r.get(cc) or "").strip().upper() if cc else ""
        if not ISIN.match(isin) or isin in seen or not (cfi.startswith("E") or isin.startswith("INF")):
            continue
        seen.add(isin)
        yield isin, " ".join((r.get(cn) or "").split()), " ".join((r.get(cd) or "").split()) if cd else "", cfi


def open_master(path: Path) -> io.TextIOBase:
    """A text stream over the list, whether it is a .zip (as NSDL sends it), a .csv.gz or a plain .csv."""
    raw = path.read_bytes()
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            inner = next((n for n in z.namelist() if n.lower().endswith(".csv")), None)
            if inner is None:
                raise ValueError("the zip holds no .csv file")
            raw = z.read(inner)
    elif raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return io.StringIO(raw.decode("utf-8-sig", errors="replace"), newline="")


def shipped() -> Optional[Path]:
    files = sorted(DATA.glob("nsdl_isin_*.csv.gz"), key=lambda p: list_date(p.name) or date.min)
    return files[-1] if files else None


async def load_master(store, path: Path, when: Optional[date] = None) -> dict:
    """Replace `isin_master` with the list in `path`, in one transaction. Refuses a list that is clearly cut short (a broken file must not empty the table)."""
    when = when or list_date(path.name)
    is_zip = path.read_bytes()[:2] == b"PK"
    if is_zip and when is None:
        with zipfile.ZipFile(path) as z:
            when = next((list_date(n) for n in z.namelist() if list_date(n)), None)
    rows = list(read_master(open_master(path)))
    if len(rows) < 10_000:
        raise ValueError(f"the ISIN list looks incomplete ({len(rows)} equity and fund rows); the stored list is kept")
    meta = {"source": "NSDL ISIN list", "file": path.name, "date": when.isoformat() if when else None, "rows": len(rows),
            "shares": sum(1 for r in rows if r[3].startswith("E")), "loadedAt": datetime.now().astimezone().isoformat(timespec="seconds")}
    async with store.pool.acquire() as conn, conn.transaction():
        await conn.execute("DELETE FROM isin_master")
        await conn.copy_records_to_table("isin_master", records=rows, columns=["isin", "issuer", "description", "cfi"])
        await conn.execute("INSERT INTO mf_meta (key, value, updated_at) VALUES ($1, $2::jsonb, now()) "
                           "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", META_KEY, json.dumps(meta))
    _CACHE.clear()
    log.info("isin list loaded: %s rows from %s (%s)", len(rows), path.name, meta["date"])
    return meta


async def stored_meta(conn) -> Optional[dict]:
    raw = await conn.fetchval("SELECT value FROM mf_meta WHERE key = $1", META_KEY)
    return json.loads(raw) if isinstance(raw, str) else raw


async def ensure_shipped(store) -> Optional[dict]:
    """At `worker migrate`: load the shipped list when nothing is stored, or when the shipped list is newer than the stored one. Never fails the start:
    the exchange and disclosure ISINs answer without it, and the next start tries again."""
    path = shipped()
    if path is None:
        return None
    try:
        async with store.pool.acquire() as conn:
            meta = await stored_meta(conn)
            have = await conn.fetchval("SELECT EXISTS (SELECT 1 FROM isin_master)")
        new = list_date(path.name)
        if have and meta and meta.get("date") and new and meta["date"] >= new.isoformat():
            return meta
        return await load_master(store, path)
    except Exception as exc:          # noqa: BLE001 - the start must go on; the reason is logged and the next start retries
        log.warning("isin list not loaded (%s: %s); the exchange and disclosure ISINs still answer", type(exc).__name__, exc)
        return None


# ------------------------------------------------------------------------------------------------------------------ resolving

RESOLVE_SQL = """
WITH q AS (SELECT DISTINCT unnest($1::text[]) AS isin)
SELECT q.isin, hit.symbol, hit.name, hit.src,
       m.issuer, m.description, m.cfi,
       (SELECT jsonb_build_object('code', s.code, 'name', s.name) FROM mf_schemes s WHERE s.isin = q.isin OR s.isin_reinvest = q.isin
         ORDER BY s.active DESC, s.code LIMIT 1) AS scheme,
       (SELECT jsonb_build_object('symbol', e.symbol, 'name', e.display_name) FROM etf_funds e WHERE e.isin = q.isin LIMIT 1) AS etf,
       (SELECT jsonb_build_object('type', d.inst_type, 'symbol', d.symbol, 'exch', d.exch, 'name', d.name) FROM dhan_instruments d WHERE d.isin = q.isin
         ORDER BY (d.exch = 'NSE') DESC LIMIT 1) AS listed
FROM q
LEFT JOIN isin_master m ON m.isin = q.isin
LEFT JOIN LATERAL (
    SELECT * FROM (
        SELECT c.symbol, c.name, 'exchange' AS src, 1 AS pri FROM dhan_instruments n JOIN companies c ON c.nse_code = n.symbol AND c.nse_code <> ''
         WHERE n.exch = 'NSE' AND n.isin = q.isin
        UNION ALL
        SELECT c.symbol, c.name, 'exchange', 2 FROM dhan_instruments b JOIN companies c ON c.bse_code = b.security_id AND c.bse_code <> ''
         WHERE b.exch = 'BSE' AND b.isin = q.isin
        UNION ALL
        SELECT c.symbol, c.name, 'disclosure', 3 FROM disclosure_isin d JOIN companies c ON c.symbol = d.symbol WHERE d.isin = q.isin
    ) x ORDER BY pri, symbol LIMIT 1) hit ON true
"""

# The other equity ISINs of the same issuer that the exchanges or the disclosure files tie to a company.
SIBLING_SQL = """
SELECT m.isin, array_agg(DISTINCT c.symbol) AS symbols, min(c.name) AS name
FROM isin_master m
JOIN isin_master s ON s.issuer = m.issuer AND s.isin <> m.isin AND s.cfi LIKE 'E%' AND s.cfi NOT LIKE 'EP%'
LEFT JOIN dhan_instruments n ON n.isin = s.isin
JOIN companies c ON (n.exch = 'NSE' AND c.nse_code = n.symbol AND c.nse_code <> '') OR (n.exch = 'BSE' AND c.bse_code = n.security_id AND c.bse_code <> '')
                 OR c.symbol IN (SELECT d.symbol FROM disclosure_isin d WHERE d.isin = s.isin)
WHERE m.isin = ANY($1::text[]) AND m.cfi LIKE 'E%' AND m.cfi NOT LIKE 'EP%'
GROUP BY m.isin
"""

_CACHE: Dict[str, Any] = {}
NAMES_TTL = 600


async def _names(conn) -> Dict[str, List[Tuple[str, str]]]:
    """Our company list by normalised name (several companies can share one), kept for 10 minutes."""
    hit = _CACHE.get("names")
    if hit and hit[0] > time.monotonic():
        return hit[1]
    out: Dict[str, List[Tuple[str, str]]] = {}
    for r in await conn.fetch("SELECT symbol, name FROM companies"):
        out.setdefault(norm(r["name"]), []).append((r["symbol"], r["name"]))
    _CACHE["names"] = (time.monotonic() + NAMES_TTL, out)
    return out


# The exchanges' instrument types (Dhan's file) that are not a company's ordinary share, in plain words.
LISTED_KIND = {"ETF": "An exchange-traded fund", "MF": "A mutual fund unit traded on the exchange", "REIT": "A REIT unit (real estate investment trust)",
               "InvITU": "An InvIT unit (infrastructure investment trust)", "DBT": "A bond", "DEB": "A debenture", "CB": "A bond", "GB": "A government bond",
               "TB": "A treasury bill", "PTC": "A pass-through certificate", "PS": "A preference share", "PN": "A preference share"}


def _explain(isin: str, kind: str, issuer: Optional[str], desc: Optional[str], scheme: Optional[dict], etf: Optional[dict],
             listed: Optional[dict] = None) -> Tuple[str, str]:
    """(status, plain-words reason) for an ISIN that is not a share of a company in our list."""
    if etf or (listed and listed.get("type") == "ETF"):
        name = (etf or {}).get("name") or (listed or {}).get("name") or desc
        return "not_share", f"An exchange-traded fund{f' ({name})' if name else ''}, not a company's share. Its own page is under ETFs."
    if listed and listed.get("type") in LISTED_KIND:
        name = listed.get("name") or desc or issuer
        return "not_share", f"{LISTED_KIND[listed['type']]}{f' ({name})' if name else ''}, not a company's ordinary share."
    if listed and kind == "share":
        return "not_found", (f"A share listed on {listed.get('exch')} as {listed.get('symbol')}, that is not in FinLit's company list yet.")
    if kind == "fund":
        what = (scheme or {}).get("name") or desc or issuer
        return "not_share", f"A mutual fund unit{f' ({what})' if what else ''}, not a share: add it on the MF portfolio page."
    if kind == "preference":
        return "not_share", f"A preference share{f' ({desc})' if desc else ''}, not the company's ordinary share."
    if kind == "govt":
        return "not_share", "A government security, not a company's share."
    if kind == "other":
        return "not_share", f"Not an ordinary share{f': {desc}' if desc else ''} (a bond, debenture, rights entitlement or another security)."
    if issuer:
        return "not_found", f"A share of {issuer} that is not traded on NSE or BSE, or not in FinLit's company list yet."
    return "not_found", "No list FinLit reads knows this ISIN (not the exchanges', the funds' or the depository's): please check it against your statement."


async def resolve(conn, isins: List[str]) -> Dict[str, dict]:
    """Every asked ISIN -> {status, symbol, name, how, note, kind, issuer, description, scheme}. status: matched | check | not_share | not_found | invalid."""
    out: Dict[str, dict] = {}
    good = []
    for i in isins:
        if valid(i):
            good.append(i)
        else:
            out[i] = {"isin": i, "status": "invalid", "symbol": None, "name": None, "how": None, "kind": None,
                      "note": "Not a valid ISIN: its last (check) digit does not match the other eleven characters. Please check it against your statement."}
    if not good:
        return out
    rows = await conn.fetch(RESOLVE_SQL, good)
    pending = [r for r in rows if not r["symbol"] and kind_of(r["isin"], r["cfi"] or "") == "share"]
    siblings = {r["isin"]: r for r in await conn.fetch(SIBLING_SQL, [r["isin"] for r in pending])} if pending else {}
    names = await _names(conn) if pending else {}
    for r in rows:
        isin, cfi = r["isin"], r["cfi"] or ""
        kind = kind_of(isin, cfi)
        scheme = json.loads(r["scheme"]) if isinstance(r["scheme"], str) else r["scheme"]
        etf = json.loads(r["etf"]) if isinstance(r["etf"], str) else r["etf"]
        listed = json.loads(r["listed"]) if isinstance(r["listed"], str) else r["listed"]
        base = {"isin": isin, "kind": kind, "issuer": r["issuer"], "description": r["description"] or None, "scheme": scheme}
        if r["symbol"]:
            note = None if r["src"] == "exchange" else "An older ISIN of this company (from the funds' monthly portfolio files); the company is the same."
            out[isin] = {**base, "status": "matched", "symbol": r["symbol"], "name": r["name"], "how": "isin" if r["src"] == "exchange" else "old_isin", "note": note}
            continue
        if kind == "share":
            sib = siblings.get(isin)
            if sib and len(sib["symbols"]) == 1:
                out[isin] = {**base, "status": "check", "symbol": sib["symbols"][0], "name": sib["name"], "how": "issuer",
                             "note": f"The exchanges do not list this ISIN; another share ISIN of the same issuer ({r['issuer']}) belongs to this company "
                                     f"({r['description'] or 'an older or partly paid share'}). Please check"}
                continue
            same = names.get(norm(r["issuer"] or ""), []) if r["issuer"] else []
            if len(same) == 1:
                out[isin] = {**base, "status": "check", "symbol": same[0][0], "name": same[0][1], "how": "issuer_name",
                             "note": f"The exchanges do not list this ISIN; the depository names its issuer {r['issuer']}, as this company is named. Please check"}
                continue
        status, note = _explain(isin, kind, r["issuer"], r["description"], scheme, etf, listed)
        out[isin] = {**base, "status": status, "symbol": None, "name": None, "how": None, "note": note}
    return out


class ResolveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    isins: List[str] = Field(min_length=1, max_length=MAX_ISINS)


@router.post("/resolve")
async def resolve_route(body: ResolveIn, request: Request):
    """POST {isins: [...]} -> {items: {ISIN: answer}, sources}. Open to every visitor: it says which listed company an ISIN is, public facts only. Nothing is
    stored; the ISINs of a file are not kept or logged."""
    wanted = list(dict.fromkeys(i.strip().upper() for i in body.isins if i and i.strip()))[:MAX_ISINS]
    store = request.app.state.store
    async with store.pool.acquire() as conn:
        items = await resolve(conn, wanted)
        meta = await stored_meta(conn)
        loaded = await conn.fetchval("SELECT max(loaded_at) FROM dhan_instruments")
    sources = {"exchanges": {"source": "NSE and BSE instrument lists (Dhan)", "loadedAt": loaded.isoformat() if loaded else None},
               "depository": {"source": "NSDL ISIN list", "date": (meta or {}).get("date")} if meta else None}
    return {"items": items, "sources": sources}
