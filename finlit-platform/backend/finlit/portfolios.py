"""Fund portfolios and the facts that come with them: holdings, sector and asset split, month-end net assets and benchmark from each fund house's
SEBI-mandated monthly portfolio file, exit load (and a second launch date) from AMFI's scheme details, benchmark and risk-o-meter from AMFI's fund
performance list when it answers. AMFI's TER, average AUM and scheme master are loaded by finlit.disclosure (refresh-facts), which also merges these
facts into what the fund pages show (disclosure.get_facts calls extra_facts here).

Read side (never raises on missing data)
    get_portfolio(pool, key)  {asOf, previousAsOf, source, sourceUrl, holdings[], exited[], summary{}} or None
    extra_facts(pool, key)    {exitLoad, benchmark, riskometer, managers, launchDate, ter} for finlit.disclosure.get_facts, each {value, asOf, source} or None
  `key` is an AMFI scheme code or an ISIN; schemes are stored by FAMILY (mf_schemes.family): the plans and options of one scheme share a portfolio.

Write side: `python -m finlit.worker refresh-portfolios` -> refresh(store, settings, only=None). Each step and fund house fails alone; a file that fails
validation is reported and never stored; a short or odd answer never replaces a good row; only the latest 3 month-ends are kept per scheme.
This is information only, never advice.
"""

from __future__ import annotations

import argparse
import html
import asyncio
import time
import json
import logging
import os
import re
import shutil
import sys
import tempfile
import unicodedata
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

import httpx

from . import taxonomy
from .config import MF_EXCLUDED_AMCS
from .disclosure_parsers import amfi
from .disclosure_parsers.amcs import ADAPTERS, BROWSER_UA, MAX_BYTES, UA, Adapter, FileRef, month_ends
from .disclosure_parsers.model import ASSET_CLASSES, Holding, Portfolio, Verdict, isin_ok, metal_class, validate
from .disclosure_parsers.sebi import NotAPortfolio, open_workbook, parse_rows

log = logging.getLogger("finlit.portfolios")

__all__ = ["Holding", "Portfolio", "Verdict", "validate", "isin_ok", "get_portfolio", "extra_facts", "refresh", "KEEP_MONTHS"]

STEP_NAMES = ("isin", "performance", "loads", "managers", "ter")
KEEP_MONTHS = 3                      # monthly disclosures kept per scheme
MIN_KEEP_RATIO = 0.9                 # a re-read file with fewer holdings than this share of the stored one is not applied
CLS = {"equity": "e", "debt": "d", "cash": "c", "other": "o"}
CLS_BACK = {v: k for k, v in CLS.items()}
SRC_PERF = "AMFI fund performance (amfiindia.com/otherdata/fund-performance)"
SRC_DETAILS = "AMFI scheme details (amfiindia.com/otherdata/scheme-details)"
URL_MF_LIST = "https://www.amfiindia.com/api/populate-mf"
URL_SCHEMES = "https://www.amfiindia.com/api/populate-scheme"
URL_DETAILS = "https://www.amfiindia.com/api/scheme-details"
LOAD_MAX_AGE_DAYS = 25               # a scheme's load text is asked again after this many days
LOAD_PAUSE_S = 1.0                   # task #281 round 6: AMFI answered 429 to three scheme-details calls at a time; now one at a time, a second apart
LOAD_MAX_CALLS = 900                 # scheme-details calls per run (about 15 minutes at the pause); the rest are asked on the next runs (resumable)
LOAD_MAX_SECONDS = 25 * 60           # task #281 (22 Nov): the whole loads step's time budget. Without it, AMFI's "too many requests" waits (up to 90 s, three tries,
                                     # on every fund-house list and scheme call) ran the portfolios job into its 120-minute limit on 22 Nov, and the job ended "timeout".
LOAD_STOP_AFTER_429 = 5              # this many schemes in a row refused with 429 stop the step for this run, keeping what was stored
# Task #281 (27 Nov): the loads step asked only ~62 funds a night. Each scheme-details call went through _retry, which on a 429 slept AMFI's Retry-After
# (capped at 90 s) twice before giving up: up to ~180 s of waiting per refused fund, so 6 refusals spent ~18 of the 25 budget minutes. Now a refused fund
# waits once, at most LOAD_429_WAIT_MAX seconds, is left for the next run (as before), and the pace between calls backs off instead: the pause doubles
# after a 429 (up to LOAD_PAUSE_MAX) and eases back by half after LOAD_EASE_AFTER answers in a row, never below LOAD_PAUSE_S. Never faster than before.
LOAD_429_WAIT_MAX = 20.0
LOAD_PAUSE_MAX = 8.0
LOAD_EASE_AFTER = 5
URL_PERF = "https://www.amfiindia.com/gateway/pollingsebi/api/amfi/fundperformance"
URL_PERF_SUB = "https://www.amfiindia.com/gateway/pollingsebi/api/amfi/getsubcategory"
URL_EQUITY_L = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"


# ------------------------------------------------------------------------------------------------------------- names

_DROP = frozenset("direct regular plan plans growth option options idcw dividend payout reinvestment reinvest bonus the and of scheme".split())
_PAREN = re.compile(r"\([^)]*\)")
_FORMERLY = re.compile(r"\(\s*(?:formerly|erstwhile|earlier|ex)\b[\s\S]*$", re.I)
_ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7", "viii": "8", "ix": "9", "x": "10"}
# Words written two ways for the same scheme (task #281): month abbreviations ('Apr 2029' / 'April 2029', 'Sept' / 'September'), plurals ('Bonds ETFs' /
# 'Bond ETFs'), SBI's shortened sheet names ('CRI IBX SDL ... Ind Fund' for 'Crisil IBX SDL ... Index Fund').
_SYN = {"jan": "january", "feb": "february", "mar": "march", "apr": "april", "jun": "june", "jul": "july", "aug": "august", "sep": "september",
        "sept": "september", "oct": "october", "nov": "november", "dec": "december", "bonds": "bond", "etfs": "etf", "cri": "crisil", "ind": "index",
        "indx": "index", "qlty": "quality", "mom": "momentum", "auto": "automotive"}


def name_key(name: str, drop_parens: bool = False, drop_fund: bool = False) -> str:
    """A scheme name reduced to a comparable key: lower case, punctuation gone, plan / option / filler words dropped, words sorted. 'X Fund - Direct Plan -
    Growth' and 'X FUND (An open ended ...)' agree. Collisions are detected by the caller (a key that maps to two families is refused, not guessed)."""
    s = unicodedata.normalize("NFKD", name or "").lower()
    if drop_parens:
        s = _PAREN.sub(" ", _FORMERLY.sub(" ", s))
    s = s.replace("&", " and ")
    s = re.sub(r"\b(mid|large|small|flexi|multi|micro)\s*-?\s*cap\b", r"\1cap", s)       # 'Mid Cap' and 'Midcap' are the same word in AMFI's own lists
    # Task #281: the same scheme written differently by the fund house's file and AMFI (each seen in the 31 Oct 2026 files):
    s = re.sub(r"\bfunds?\s+of\s+funds?\b", " fof ", s)                                 # 'Fund of Funds' / 'Fund of Fund' = 'FOF'
    s = re.sub(r"([a-z])(\d)|(\d)([a-z]{2,})", lambda m: f"{m.group(1)} {m.group(2)}" if m.group(1) else f"{m.group(3)} {m.group(4)}", s)
    #                                                                                     'IBX50:50' = 'IBX 50:50', '250Mom' = '250 Mom' ('1d' stays one word)
    s = re.sub(r"\bseries?\s*[-:]?\s*(i{1,3}|iv|vi{0,3}|ix|x)\b", lambda m: " series " + _ROMAN[m.group(1)] + " ", s)   # 'Serie-II' = 'Series 2'
    toks = {_SYN.get(t, t) for t in re.sub(r"[^a-z0-9]+", " ", s).split()}
    toks = {t for t in toks if t not in _DROP and not (drop_fund and t == "fund")}
    return " ".join(sorted(toks))


_EXCLUDED_START = re.compile(r"^\W*(ask|abakkus|iti|lakshya|nj|pgim india|samco|taurus|trust(?:mf)?|unifi|zerodha)\b", re.I)


def looks_excluded(scheme_name: str) -> bool:
    """A scheme name that starts with an excluded fund house's name (the feeds carry no fund-house column): left out of the 'unmapped' lists."""
    return bool(_EXCLUDED_START.match(scheme_name or ""))


def _house_stem(name: str) -> str:
    t = re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", name).lower().replace("&", " and "))
    t = re.sub(r"\b(?:mutual\s+fund|mf|asset\s+management|asset\s+managers|amc|company|limited|ltd|private|pvt)\b", " ", t)
    return re.sub(r"\s+", " ", t).strip()


_EXCLUDED = frozenset(_house_stem(n) for n in MF_EXCLUDED_AMCS)


def excluded_amc(amc: str) -> bool:
    return _house_stem(amc) in _EXCLUDED


def _flat_key(name: str) -> str:
    """name_key with the spaces taken out and the letters sorted, so a house name written without its space still matches."""
    return "".join(sorted(re.sub(r"[^a-z0-9]", "", name_key(name, True, True))))


def _pass_key(name: str) -> str:
    return " ".join(t for t in name_key(name, True, True).split() if t != "passive")


class Index:
    """The scheme families in mf_schemes, for matching names from other sources. Built once per run (about 14 000 rows)."""

    def __init__(self):
        self.amc: Dict[str, str] = {}                 # family -> AMC name
        self.codes: Dict[str, List[int]] = defaultdict(list)
        self.by_code: Dict[int, str] = {}
        self.keys: Dict[str, Set[str]] = defaultdict(set)         # name_key -> families
        self.keys_np: Dict[str, Set[str]] = defaultdict(set)      # parenthesis-free key -> families
        self.keys_nf: Dict[str, Set[str]] = defaultdict(set)      # parenthesis-free and without the word 'fund'
        self.keys_flat: Dict[str, Set[str]] = defaultdict(set)    # letters and digits only, sorted: 'MahindraManulife' and 'Mahindra Manulife' agree
        self.active: Set[str] = set()                              # families with a scheme still publishing NAVs
        self.keys_pass: Dict[str, Set[str]] = defaultdict(set)    # as keys_nf without the word 'passive' (task #281), tried only after the exact keys

    def add(self, code: int, name: str, amc: str, family: str, active: bool = True) -> None:
        self.amc[family] = amc
        if active:
            self.active.add(family)
        self.codes[family].append(code)
        self.by_code[code] = family
        self.keys[name_key(name)].add(family)
        self.keys_np[name_key(name, True)].add(family)
        self.keys_nf[name_key(name, True, True)].add(family)
        self.keys_flat[_flat_key(name)].add(family)
        self.keys_pass[_pass_key(name)].add(family)

    def resolve(self, names: Sequence[str], amc_re: Optional[re.Pattern] = None) -> Tuple[Optional[str], str]:
        """(family, reason). The first name that matches exactly one family wins; a name matching several families is ambiguous and refused."""
        why = "no scheme with this name in AMFI's list"
        for nm in names:
            if not nm:
                continue
            for table, drop, nof in ((self.keys, False, False), (self.keys_np, True, False), (self.keys_nf, True, True)):
                fams = table.get(name_key(nm, drop, nof), set())
                if amc_re is not None:
                    fams = {f for f in fams if amc_re.search(self.amc.get(f, ""))}
                if len(fams) == 1:
                    return next(iter(fams)), ""
                live = fams & self.active
                if len(fams) > 1 and len(live) == 1:
                    return next(iter(live)), ""      # task #281: one active scheme and old stopped ones of the same name ('JM Short Term Fund')
                if len(fams) > 1:
                    why = f"name matches {len(fams)} schemes ({', '.join(sorted(fams))[:120]}); not guessed"
        for table, keyf in ((self.keys_flat, _flat_key), (self.keys_pass, _pass_key)):
            for nm in names:                # last resorts: spacing and word order ignored (AMFI writes some fund house names without a space); then the
                fams = table.get(keyf(nm), set()) if nm else set()     # word 'passive' ignored ('Asset Allocation Passive FOF' = 'Asset Allocation FOF')
                if amc_re is not None:
                    fams = {f for f in fams if amc_re.search(self.amc.get(f, ""))}
                if len(fams) == 1:
                    return next(iter(fams)), ""
        return None, why


async def load_index(pool) -> Index:
    idx = Index()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT code, name, amc, family, active FROM mf_schemes")
    for r in rows:
        if excluded_amc(r["amc"]):
            continue
        idx.add(r["code"], r["name"], r["amc"], r["family"], bool(r["active"]))
    return idx


# ------------------------------------------------------------------------------------------------------------- writes

def pack_holdings(hs: Sequence[Holding]) -> str:
    return json.dumps([[h.name, h.isin, h.sector, CLS[h.asset_class], h.pct_nav, h.qty, h.value_lakh] for h in hs], separators=(",", ":"), ensure_ascii=False)


def unpack_holdings(raw) -> List[Holding]:
    arr = json.loads(raw) if isinstance(raw, str) else raw
    # task #276: files stored before the metal-row rule are read with it too (SILVERBEES' silver was stored as cash)
    return [Holding(a[0], a[1], a[2], metal_class(a[0], a[1], CLS_BACK.get(a[3], "other")), a[4], a[5], a[6]) for a in arr]


async def store_portfolio(pool, fkey: str, amc: str, p: Portfolio) -> str:
    """Write one validated portfolio and prune to the latest KEEP_MONTHS. Returns stored | kept_existing | too_old."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            newest = await conn.fetch("SELECT as_of, n FROM disclosure_portfolios WHERE fkey = $1 ORDER BY as_of DESC LIMIT $2", fkey, KEEP_MONTHS)
            have = {r["as_of"]: r["n"] for r in newest}
            if len(newest) >= KEEP_MONTHS and p.as_of < newest[-1]["as_of"]:
                return "too_old"
            if p.as_of in have and len(p.holdings) < MIN_KEEP_RATIO * have[p.as_of]:
                return "kept_existing"
            total = sum(h.pct_nav for h in p.holdings)
            await conn.execute(
                """INSERT INTO disclosure_portfolios (fkey, as_of, amc, scheme_name, source, source_url, net_assets_lakh, pct_total, n, benchmark, notes, holdings, fetched_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb, now())
                   ON CONFLICT (fkey, as_of) DO UPDATE SET amc = EXCLUDED.amc, scheme_name = EXCLUDED.scheme_name, source = EXCLUDED.source, source_url = EXCLUDED.source_url,
                     net_assets_lakh = EXCLUDED.net_assets_lakh, pct_total = EXCLUDED.pct_total, n = EXCLUDED.n, benchmark = EXCLUDED.benchmark, notes = EXCLUDED.notes,
                     holdings = EXCLUDED.holdings, fetched_at = now()""",
                fkey, p.as_of, amc, p.scheme_name, p.source_name, p.source_url, p.net_assets_lakh, round(total, 6), len(p.holdings), p.benchmark,
                json.dumps(p.notes), pack_holdings(p.holdings))
            await conn.execute("DELETE FROM disclosure_portfolios WHERE fkey = $1 AND as_of NOT IN (SELECT as_of FROM disclosure_portfolios WHERE fkey = $1 ORDER BY as_of DESC LIMIT $2)",
                               fkey, KEEP_MONTHS)
    return "stored"


async def put_facts(pool, rows: Sequence[Tuple[str, str, Optional[date], dict, str, Optional[str]]]) -> int:
    """Upsert (fkey, kind, as_of, value, source, url). A row older than the stored one for the same kind is ignored."""
    if not rows:
        return 0
    async with pool.acquire() as conn:
        await conn.executemany(
            """INSERT INTO disclosure_facts (fkey, kind, as_of, value, source, source_url, updated_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6, now())
               ON CONFLICT (fkey, kind) DO UPDATE SET as_of = EXCLUDED.as_of, value = EXCLUDED.value, source = EXCLUDED.source, source_url = EXCLUDED.source_url, updated_at = now()
               WHERE disclosure_facts.as_of IS NULL OR EXCLUDED.as_of IS NULL OR EXCLUDED.as_of >= disclosure_facts.as_of""",
            [(f, k, d, json.dumps(v, separators=(",", ":")), s, u) for f, k, d, v, s, u in rows])
    return len(rows)


async def _run_done(pool, source: str, period: str) -> bool:
    async with pool.acquire() as conn:
        return bool(await conn.fetchval("SELECT 1 FROM disclosure_runs WHERE source = $1 AND period = $2 AND status = 'done'", source, period))


async def _file_done(pool, source: str, period: str) -> bool:
    """A fund-house file is skipped only when it was read whole: every sheet matched a scheme and passed the checks. A file with an unmatched or rejected
    sheet is read again on the next run (task #281: files marked done while a new scheme was not in AMFI's list yet kept that scheme without holdings
    for good; Angel One's index funds, for one). Older markers wrote the run's running totals, so a nonzero count there also means 'read again'."""
    async with pool.acquire() as conn:
        return bool(await conn.fetchval(
            "SELECT 1 FROM disclosure_runs WHERE source = $1 AND period = $2 AND status = 'done' "
            "AND COALESCE((detail->>'unmapped')::int, 0) = 0 AND COALESCE((detail->>'rejected')::int, 0) = 0", source, period))


async def _run_mark(pool, source: str, period: str, status: str, detail: dict) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO disclosure_runs (source, period, status, detail, updated_at) VALUES ($1,$2,$3,$4::jsonb, now())
               ON CONFLICT (source, period) DO UPDATE SET status = EXCLUDED.status, detail = EXCLUDED.detail, updated_at = now()""",
            source, period, status, json.dumps(detail))


# ------------------------------------------------------------------------------------------------------------- reads

def _r6(x: float) -> float:
    return round(x, 6)


async def _family(conn, key) -> Optional[str]:
    k = str(key).strip()
    if not k:
        return None
    if k.isdigit():
        if len(k) > 9:
            return None
        return await conn.fetchval("SELECT family FROM mf_schemes WHERE code = $1", int(k))
    k = k.upper()
    if not re.fullmatch(r"[A-Z0-9]{12}", k):
        return None
    return await conn.fetchval("SELECT family FROM mf_schemes WHERE isin = $1 OR isin_reinvest = $1 LIMIT 1", k)


def _hkey(h: Holding) -> str:
    return h.isin or ("n:" + name_key(h.name))


def build_portfolio_json(cur: dict, prev: Optional[dict], symbols: Dict[str, str], classes: Optional[Dict[str, dict]] = None) -> dict:
    """`classes`: NSE's place of each held company, by ISIN (company_classification). Each equity line is named by NSE's industry and macro sector
    (taxonomy.holding_level; also NSE's 22-level sector: "Listed abroad" for shares listed outside India, "Not classified" with the reason); the fund house's own name stays
    in `amfiIndustry`."""
    classes = classes or {}
    hs = unpack_holdings(cur["holdings"])
    ph = unpack_holdings(prev["holdings"]) if prev else []
    pm: Dict[str, float] = {}
    for h in ph:
        pm[_hkey(h)] = pm.get(_hkey(h), 0.0) + h.pct_nav
    seen: Set[str] = set()
    out_h = []
    levels: Dict[int, Optional[dict]] = {}
    for h in hs:
        k = _hkey(h)
        seen.add(k)
        prevp = pm.get(k) if prev else None
        if not prev:
            change = None
        elif prevp is None:
            change = "new"
        elif abs(h.pct_nav - prevp) < 0.005:
            change = "unchanged"
        else:
            change = "increased" if h.pct_nav > prevp else "decreased"
        lv = taxonomy.holding_level(h.sector, h.isin, classes.get(h.isin or "")) if h.asset_class == "equity" else None
        levels[id(h)] = lv
        out_h.append({"name": h.name, "isin": h.isin, "industry": lv["industry"] if lv else None, "sector": lv["sector"] if lv else None, "macroSector": lv["macroSector"] if lv else None,
                      "industryNote": lv["note"] if lv else None, "amfiIndustry": h.sector, "assetClass": h.asset_class, "pct": h.pct_nav, "qty": h.qty, "valueLakh": h.value_lakh,
                      "stockSymbol": symbols.get(h.isin) if h.isin else None, "prevPct": _r6(prevp) if prevp is not None else None, "change": change})
    exited = []
    if prev:
        for h in ph:
            if h.asset_class != "cash" and _hkey(h) not in seen:
                exited.append({"name": h.name, "isin": h.isin, "prevPct": h.pct_nav})
    split = {c: 0.0 for c in ASSET_CLASSES}
    industries: Dict[str, float] = defaultdict(float)
    macros: Dict[str, float] = defaultdict(float)
    nse_sectors: Dict[str, float] = defaultdict(float)
    for h in hs:
        split[h.asset_class] += h.pct_nav
        lv = levels.get(id(h))
        if lv:
            industries[lv["industry"]] += h.pct_nav
            macros[lv["macroSector"]] += h.pct_nav
            nse_sectors[lv["sector"]] += h.pct_nav
    top = sorted((h.pct_nav for h in hs if h.asset_class != "cash"), reverse=True)[:10]
    notes = cur["notes"] if isinstance(cur["notes"], list) else json.loads(cur["notes"] or "[]")
    res = {"asOf": cur["as_of"].isoformat(), "previousAsOf": prev["as_of"].isoformat() if prev else None, "source": cur["source"], "sourceUrl": cur["source_url"],
           "holdings": out_h, "exited": exited,
           "summary": {"count": len(hs), "top10Pct": _r6(sum(top)), "assetSplit": {c: _r6(v) for c, v in split.items()},
                       "industries": [{"industry": k, "pct": _r6(v)} for k, v in sorted(industries.items(), key=lambda kv: -kv[1])],
                       "sectors": [{"sector": k, "pct": _r6(v)} for k, v in sorted(nse_sectors.items(), key=lambda kv: -kv[1])],   # NSE's 22
                       "macroSectors": [{"macroSector": k, "pct": _r6(v)} for k, v in sorted(macros.items(), key=lambda kv: -kv[1])]}}
    if notes:
        res["notes"] = notes
    if cur["net_assets_lakh"] is not None:
        res["netAssetsLakh"] = cur["net_assets_lakh"]
    return res


async def get_portfolio(pool, key) -> Optional[dict]:
    """The latest stored monthly portfolio for a scheme code or ISIN in the fund-page contract, or None when nothing is stored."""
    async with pool.acquire() as conn:
        fkey = await _family(conn, key)
        if not fkey:
            return None
        rows = await conn.fetch("SELECT * FROM disclosure_portfolios WHERE fkey = $1 ORDER BY as_of DESC LIMIT 2", fkey)
        if not rows:
            return None
        cur = dict(rows[0])
        prev = dict(rows[1]) if len(rows) > 1 else None
        isins = list({h[1] for h in json.loads(cur["holdings"]) if h[1]})
        symbols: Dict[str, str] = {}
        if isins:
            got = await conn.fetch("SELECT i.isin, i.symbol FROM disclosure_isin i JOIN companies c ON c.symbol = i.symbol WHERE i.isin = ANY($1::text[])", isins)
            symbols = {r["isin"]: r["symbol"] for r in got}
        classes: Dict[str, dict] = {}
        if isins:   # NSE's place of each held company: by its ISIN, else by the symbol its ISIN maps to
            placed = await conn.fetch("SELECT symbol, isin, industry, sector, macro_sector FROM company_classification WHERE isin = ANY($1::text[]) OR symbol = ANY($2::text[])",
                                    isins, list(set(symbols.values())))
            by_sym = {r["symbol"]: dict(r) for r in placed}
            classes = {r["isin"]: dict(r) for r in placed if r["isin"]}
            for i, sym in symbols.items():
                if i not in classes and sym in by_sym:
                    classes[i] = by_sym[sym]
    return build_portfolio_json(cur, prev, symbols, classes)


def _iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


async def extra_facts(pool, key) -> Optional[dict]:
    """What this module knows about a scheme beyond AMFI's TER / AUM / master (finlit.disclosure merges it into the fund page's facts):
    exitLoad, benchmark, riskometer, managers, launchDate (AMFI scheme details, a second source), monthEndAum, ter (the fund house's own
    TER page: {value: {regular, direct} in percent, asOf, source, sourceUrl}). Each is {value, asOf, source, ...}
    or None when not loaded. None when the key is not a known scheme."""
    async with pool.acquire() as conn:
        fkey = await _family(conn, key)
        if not fkey:
            return None
        facts = {r["kind"]: dict(r) for r in await conn.fetch("SELECT kind, as_of, value, source, source_url FROM disclosure_facts WHERE fkey = $1", fkey)}
        port = await conn.fetchrow("SELECT as_of, source, source_url, net_assets_lakh, benchmark FROM disclosure_portfolios WHERE fkey = $1 ORDER BY as_of DESC LIMIT 1", fkey)

    def val(kind):
        f = facts.get(kind)
        if not f:
            return None
        v = f["value"]
        return (json.loads(v) if isinstance(v, str) else v), f

    def fact(value, f, **extra) -> dict:
        return {"value": value, "asOf": _iso(f["as_of"]), "source": f["source"], **({"sourceUrl": f["source_url"]} if f.get("source_url") else {}), **extra}

    out: Dict[str, Optional[dict]] = {k: None for k in ("exitLoad", "benchmark", "riskometer", "managers", "launchDate", "monthEndAum", "ter", "minAmount")}
    tr = val("ter")
    if tr and (tr[0].get("regular") is not None or tr[0].get("direct") is not None):
        out["ter"] = fact({"regular": tr[0].get("regular"), "direct": tr[0].get("direct")}, tr[1])
    el = val("exitload")
    if el:   # task #281: a readable line, never a cut-off fragment (those are being read again from AMFI by the loads step)
        shown = exit_load_shown(el[0].get("text"))
        out["exitLoad"] = fact(shown, el[1]) if shown else {"unavailable": EXIT_LOAD_NOT_STATED}
    bm = val("benchmark")
    if bm:
        out["benchmark"] = fact(bm[0]["name"], bm[1])
    elif port and port["benchmark"]:
        out["benchmark"] = fact(port["benchmark"], dict(port))
    rk = val("risk")
    if rk and rk[0].get("scheme"):
        out["riskometer"] = fact(rk[0]["scheme"], rk[1], **({"benchmarkRisk": rk[0]["benchmark"]} if rk[0].get("benchmark") else {}))
    mg = val("managers")
    if mg and mg[0].get("names"):
        out["managers"] = fact(", ".join(mg[0]["names"]), mg[1])
    mn = val("min_amount_amfi")   # task #281 round 7: the minimum AMFI's scheme details state, shown with its date (owner's rule of 21 Nov 2026)
    if mn and mn[0].get("text"):
        out["minAmount"] = fact(mn[0]["text"], mn[1])
    ld = val("launch_details")
    if ld and ld[0].get("date"):
        out["launchDate"] = fact(ld[0]["date"], ld[1])
    if port and port["net_assets_lakh"] is not None:
        out["monthEndAum"] = {"lakh": port["net_assets_lakh"], "asOf": _iso(port["as_of"]), "source": port["source"] + " (net assets, month end)",
                              "sourceUrl": port["source_url"]}
    return out


# ------------------------------------------------------------------------------------------------------------- fetching

CF_ORIGIN_DOWN = (522, 523, 524)               # Cloudflare's own codes: the origin site did not accept or answer Cloudflare's connection
RELAY_FETCH_HOSTS = ("barodabnpparibasmf.in",)   # fund-house sites that time out from the AWS server's address; fetched through the relay's /fetch route


def _fetch_relay() -> Tuple[str, str]:
    """(base, key) of the relay's /fetch route: EXCHANGE_RELAY_URL / EXCHANGE_RELAY_KEY, else the AMFI ones (one worker serves both)."""
    base = (os.getenv("EXCHANGE_RELAY_URL") or os.getenv("AMFI_RELAY_URL") or "").strip().rstrip("/")
    key = (os.getenv("EXCHANGE_RELAY_KEY") or os.getenv("AMFI_RELAY_KEY") or "").strip()
    return base, key


def _relayed_host(host: str) -> bool:
    return any(host == h or host.endswith("." + h) for h in RELAY_FETCH_HOSTS)


class RelayTransport(httpx.AsyncBaseTransport):
    """Task #281: www.amfiindia.com and Baroda BNP Paribas's site do not answer the AWS server's address (the portfolio job's "performance", "loads" and
    "barodabnp" parts ended in ConnectTimeout every night), while the facts job reaches AMFI through the relay (deploy/amfi-relay). Every request of the
    portfolio job's client is sent here: a www.amfiindia.com request goes to the same path on the relay (method and JSON body kept, the shared key added;
    disclosure.relay_for); a Baroda BNP request goes to the relay's GET /fetch?u=<address>. With no relay configured (local, CI) nothing changes."""

    def __init__(self, inner: Optional[httpx.AsyncBaseTransport] = None):
        self.inner = inner or httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        from .disclosure import relay_for
        url = str(request.url)
        new_url, extra = relay_for(url)
        fetch_base, fetch_key = _fetch_relay()
        if new_url == url and fetch_base and request.method == "GET" and request.url.scheme == "https" and _relayed_host(request.url.host):
            new_url = str(httpx.URL(fetch_base + "/fetch", params={"u": url}))
            extra = {"X-Relay-Key": fetch_key} if fetch_key else {}
            extra["X-Fwd-User-Agent"] = request.headers.get("User-Agent", BROWSER_UA)
            if request.headers.get("Referer"):
                extra["X-Fwd-Referer"] = request.headers["Referer"]
        if new_url == url:
            return await self.inner.handle_async_request(request)
        body = await request.aread()
        headers = [(k, v) for k, v in request.headers.multi_items() if k.lower() not in ("host", "content-length")]
        headers += list(extra.items())
        relayed = httpx.Request(request.method, new_url, headers=headers, content=body or None, extensions=request.extensions)
        resp = await self.inner.handle_async_request(relayed)
        if resp.status_code in CF_ORIGIN_DOWN and new_url.startswith(fetch_base + "/fetch"):
            # task #281 round 6: the relay reached Cloudflare but the fund house's site did not accept Cloudflare's connection (522 / 523 / 524; Baroda BNP,
            # 21 Nov). Ask the site directly once; when that fails too, the error says both routes were tried.
            await resp.aread()
            await resp.aclose()
            try:
                direct = await self.inner.handle_async_request(request)
            except httpx.TransportError as exc:
                raise httpx.ConnectError(f"{request.url.host} did not answer the relay (Cloudflare {resp.status_code}: the site refused Cloudflare's connection) "
                                         f"nor the server directly ({type(exc).__name__})", request=request) from exc
            direct.headers["X-Via"] = f"direct (the relay's route answered {resp.status_code})"
            return direct
        resp.headers["X-Via"] = "relay " + httpx.URL(new_url).path
        loc = resp.headers.get("Location")
        if loc and 300 <= resp.status_code < 400:      # a redirect is followed on the original site (and relayed again), never on the relay's own address
            resp.headers["Location"] = str(request.url.join(loc))
        return resp

    async def aclose(self) -> None:
        await self.inner.aclose()


def make_client(transport: Optional[httpx.AsyncBaseTransport] = None) -> httpx.AsyncClient:
    inner = transport or httpx.AsyncHTTPTransport(limits=httpx.Limits(max_connections=2, max_keepalive_connections=1))   # a client's limits go on its transport
    return httpx.AsyncClient(headers={"User-Agent": UA}, timeout=httpx.Timeout(60.0, connect=20.0), follow_redirects=True, transport=RelayTransport(inner))


RETRY_AFTER_MAX = 90.0   # seconds: the longest Retry-After honoured


def _retry_after(resp: httpx.Response, fallback: float) -> float:
    try:
        return min(max(float(resp.headers.get("Retry-After", "")), 1.0), RETRY_AFTER_MAX)
    except ValueError:
        return fallback


async def _retry(fn, tries: int = 3, base: float = 2.0):
    for i in range(tries):
        try:
            return await fn()
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (400, 401, 403, 404):
                raise
            if i == tries - 1:
                raise
            if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (429, 503):   # task #281 round 6: "too many requests": wait as asked
                await asyncio.sleep(_retry_after(exc.response, base * 5 * (i + 1)))
            else:
                await asyncio.sleep(base * (i + 1))


def who_answered(exc: BaseException) -> str:
    """Task #281 round 6: an HTTP error says who answered and by which route, so a 404 from the relay itself is never taken for AMFI's: the status, the
    route (the relay's path, or direct), the relay's own X-Relay-Error when it was the relay's answer, and the start of the body. Never the relay key."""
    if not isinstance(exc, httpx.HTTPStatusError):
        return f"{type(exc).__name__}: {str(exc)[:200]}"
    r = exc.response
    via = r.headers.get("X-Via") or "direct"
    own = r.headers.get("X-Relay-Error")
    if own:
        who = f"the relay itself ({own})"
    elif via.startswith("relay") and r.status_code in CF_ORIGIN_DOWN:
        who = "Cloudflare: the site did not accept the relay's connection"
    else:
        who = exc.request.url.host + (" through the relay" if via.startswith("relay") else "")
    try:
        body = " ".join(r.text.split())[:200]
    except Exception:
        body = ""
    return f"HTTP {r.status_code} from {who}; {exc.request.method} {exc.request.url.copy_with(query=None)}; via {via}" + (f"; body: {body}" if body else "")


async def download(client: httpx.AsyncClient, url: str, dest: str, headers: Optional[dict] = None) -> int:
    """Stream a file to disk (never into memory), refusing more than MAX_BYTES."""
    async def go():
        n = 0
        async with client.stream("GET", url, headers=headers) as r:
            r.raise_for_status()
            with open(dest, "wb") as fh:
                async for chunk in r.aiter_bytes(1 << 16):
                    n += len(chunk)
                    if n > MAX_BYTES:
                        raise ValueError(f"file larger than {MAX_BYTES} bytes")
                    fh.write(chunk)
        return n
    return await _retry(go)


async def get_json_no_wait_on_429(client: httpx.AsyncClient, url: str, **kw):
    """Task #281 (27 Nov): one scheme-details call for the loads step. A network error or a 5xx is retried as before (_retry), but a 429 ("too many
    requests") is raised at once, without _retry's Retry-After sleeps: the loads step waits once itself (capped) and slows its own pace instead."""
    async def go():
        r = await client.request("GET", url, **kw)
        if r.status_code == 429:
            raise httpx.HTTPStatusError("429 Too Many Requests", request=r.request, response=r)
        r.raise_for_status()
        return r.json()

    async def guarded():
        try:
            return await go()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                raise _NoRetry429(exc) from None
            raise
    try:
        return await _retry(guarded)
    except _NoRetry429 as e:
        raise e.exc from None


class _NoRetry429(Exception):
    """Carries a 429 past _retry, which only retries httpx errors (so it is not retried)."""
    def __init__(self, exc: httpx.HTTPStatusError):
        super().__init__(str(exc))
        self.exc = exc


async def get_json(client: httpx.AsyncClient, url: str, method: str = "GET", **kw):
    # task #281 round 6: the method is read once. It used to be popped inside the retried call, so a retry (after a 429, a 5xx or a timeout) went out as
    # GET: through the relay that is a path its GET branch does not serve, and the relay's own "not found" (404, never retried) ended the performance step.
    async def go():
        r = await client.request(method, url, **kw)
        r.raise_for_status()
        return r.json()
    return await _retry(go)


def _today() -> date:
    return datetime.now(timezone(timedelta(hours=5, minutes=30))).date()


# ------------------------------------------------------------------------------------------------------------- steps: AMFI feeds

async def step_isin(pool, today: date) -> dict:
    async with httpx.AsyncClient(headers={"User-Agent": BROWSER_UA}, timeout=60.0, follow_redirects=True) as c:
        r = await _retry(lambda: c.get(URL_EQUITY_L))
        r.raise_for_status()
        m = amfi.parse_equity_list(r.text)
    if len(m) < 1500:
        return {"status": "refused", "why": f"NSE share list has {len(m)} usable rows (expected about 2 600)"}
    async with pool.acquire() as conn:
        await conn.executemany("INSERT INTO disclosure_isin (isin, symbol) VALUES ($1,$2) ON CONFLICT (isin) DO UPDATE SET symbol = EXCLUDED.symbol", list(m.items()))
    return {"status": "ok", "isins": len(m)}


async def _perf_date(client, today: date) -> Optional[date]:
    for back in range(1, 10):
        d = today - timedelta(days=back)
        j = await get_json(client, URL_PERF, method="POST", json={"maturityType": 1, "category": 1, "subCategory": 1, "mfid": 0, "reportDate": d.strftime("%d-%b-%Y")})
        if amfi.parse_performance(j):
            return d
    return None


async def step_performance(pool, client, idx: Index, today: date) -> dict:
    """Benchmark, risk-o-meter and AUM (rupees crore) for every scheme AMFI lists, one request per sub-category (about 50)."""
    d = await _perf_date(client, today)
    if d is None:
        return {"status": "refused", "why": "AMFI's fund-performance list was empty for each of the last 9 days"}
    rows: List[amfi.PerfRow] = []
    for mt in (1, 2):
        for cat in range(1, 7):
            subs = (await get_json(client, URL_PERF_SUB, method="POST", json={"category": cat})).get("data") or []
            for s in subs:
                j = await get_json(client, URL_PERF, method="POST",
                                   json={"maturityType": mt, "category": cat, "subCategory": s["id"], "mfid": 0, "reportDate": d.strftime("%d-%b-%Y")})
                rows.extend(amfi.parse_performance(j))
                await asyncio.sleep(0.15)
    if len(rows) < 1000:
        return {"status": "refused", "why": f"AMFI fund performance returned {len(rows)} schemes (expected about 2 100)"}
    facts, unmapped, dup = [], [], 0
    seen: Set[str] = set()
    for r in rows:
        fam, why = idx.resolve([r.name])
        if not fam:
            if not looks_excluded(r.name):
                unmapped.append(r.name)
            continue
        if fam in seen:
            dup += 1
            continue
        seen.add(fam)
        nd = r.nav_date or d
        if r.benchmark:
            facts.append((fam, "benchmark", nd, {"name": r.benchmark}, SRC_PERF, "https://www.amfiindia.com/otherdata/fund-performance"))
        if r.risk_scheme:
            facts.append((fam, "risk", nd, {"scheme": r.risk_scheme, "benchmark": r.risk_benchmark}, SRC_PERF, "https://www.amfiindia.com/otherdata/fund-performance"))
        if r.aum_crore is not None and r.aum_crore >= 0:
            facts.append((fam, "aum_daily", nd, {"crore": r.aum_crore}, SRC_PERF, "https://www.amfiindia.com/otherdata/fund-performance"))
    await put_facts(pool, facts)
    return {"status": "ok", "reportDate": d.isoformat(), "schemes": len(rows), "families": len(seen), "unmapped": len(unmapped), "unmappedSample": unmapped[:15], "duplicates": dup}


# Task #281 (24 Nov, cut-off loads): the old cleaner cut the text after the FIRST "exit load" anywhere in it, so "Exit Load of 1.00%" was stored as
# "of 1.00%" and Baroda BNP Paribas's three-rule text as its last sentence ("will be applicable on a FIFO ... basis", from "The above Exit Load will be
# ..."). Only a label is taken off now: "Exit load:" / "Exit load -" at the start or right after the entry-load part, or a leading "Exit load (of|is)"
# before the figure. "Exit load" inside a sentence is part of the rule and is kept.
_ENTRY = r"entry\s*load\s*[:\-\u2013]?\s*(?:nil|none|not\s+applicable|n\.?\s?a\.?|-|\u2013)?\s*[,;.|]?\s*"
_EXIT_HEAD = re.compile(r"^\W*(?:" + _ENTRY + r"|entry\s*(?:&|and)\s*)?exit\s*loads?\s*(?:\([^)]{0,60}\)\s*)?"
                        r"(?:[:\-\u2013\u2014]+\s*|(?:of|is)\s+(?=\d)|(?=\d|nil\b|n\.?a\b\.?|not\s+applicable))", re.I)
_EXIT_LABEL = re.compile(r"\bexit\s*loads?\s*(?:\([^)]{0,60}\)\s*)?[:\-\u2013\u2014]+\s*", re.I)
_NIL = re.compile(r"^(nil|none|not applicable|n\.?a\.?|no exit load)\W*$", re.I)
EXIT_TEXT_V = 2                      # the cleaner's version, stored with each text: rows without it were cleaned by the old cutter (see step_loads)
_FRAGMENT = re.compile(r"^(?:of|will|shall|would|is|are|be|being|applicable|charged|levied|payable|structure|period|as|which|and|or|at|on|in|the)\b")
EXIT_LOAD_NOT_STATED = ("Exit load not stated by AMFI in a readable form: the text AMFI's scheme details gave was cut, and it is being read again on the next "
                        "nightly run. The scheme's own documents state it.")


def exit_load_text(raw: str) -> Optional[str]:
    """The exit-load rule in AMFI's 'load' text ('Entry Load: Nil Exit Load: 1% if redeemed within 1 year ...'), whole and tidied: the entry-load part and
    the "Exit load:" label are taken off, bullet and line breaks become "; ". None when blank."""
    t = html.unescape(raw or "").replace("\r", "")                                                 # AMFI sends some as "Entry &amp; Exit Load: Nil"
    t = re.sub(r"\s*[\u2022\u25cf\u25aa\u00b7]\s*", "\n", t)                                         # a bullet before each rule: one rule a line
    t = re.sub(r"\s*\n\s*(?:[-\u2013]\s+)?", "\n", t).strip()                                        # and "- rule" at the start of a line
    t = re.sub(r"(?<=[^.;:,\n])\n+(?=[A-Z])", "; ", t)                                              # a new rule on a new line, after no stop
    t = t.replace("\n", " ")                                                                       # a sentence that runs on to the next line
    t = re.sub(r"\s+", " ", t).strip(" ;")
    if not t or t.upper() in ("NA", "N.A.", "-"):
        return None
    m = _EXIT_HEAD.match(t)
    if m:
        t = t[m.end():]
    else:
        lab = _EXIT_LABEL.search(t)                                                                # "Entry load: not applicable as per SEBI ... Exit load: 1% ..."
        if lab and re.search(r"entry\s*load", t[:lab.start()], re.I) and not re.search(r"exit\s*load", t[:lab.start()], re.I):
            t = t[lab.end():]
        else:
            t = re.sub(r"^\W*entry\s*load\s*[:\-\u2013]?\s*(?:nil|none|not\s+applicable|n\.?\s?a\.?)(?!\w)\s*[,;.|]?\s*", "", t, count=1, flags=re.I)
    t = t.strip(" ,;:-\u2013\u2014")
    if not t:
        return None
    if _NIL.match(t):
        return "Nil"
    if len(t) > 600:
        t = t[:600].rsplit(" ", 1)[0].rstrip(" ,;:") + " \u2026"
    return t


def exit_load_fragment(text: Optional[str]) -> bool:
    """True for a text the old cleaner cut in the middle of a sentence ("of 1.00%", "will be applicable on a FIFO ... basis"): it starts with a joining
    word in small letters, which no whole rule does."""
    return bool(text) and bool(_FRAGMENT.match(text.strip()))


def exit_load_recut(value) -> bool:
    """Task #281: a stored exit-load fact the old cleaner cut ("of 1.00%"): it has no cleaner version and its text is a fragment. step_loads treats such a
    family as not fresh, so it is asked again at the next run (the queue's never-tried lane) and stored whole; texts stored by this cleaner are never re-asked early."""
    v = json.loads(value) if isinstance(value, str) else (value or {})
    return isinstance(v, dict) and not v.get("v") and exit_load_fragment(v.get("text"))


def exit_load_shown(text: Optional[str]) -> Optional[str]:
    """The line the fund page shows for a stored text, or None (the page then says why it is not shown): a cut-off fragment is never shown, and a load
    that AMFI's scheme details give with no holding period says so."""
    from .mfscore import exitload
    t = exit_load_text(text or "")
    if not t or exit_load_fragment(t):
        return None
    p = exitload.parse(t)
    if p.rule == "a load with no holding period" and re.fullmatch(r"[\d.]+\s*%\.?", t):
        return f"{t.rstrip('.')} (AMFI's scheme details state no holding period; the scheme's own documents give the full rule)"
    return t


_RUPEES = re.compile(r"(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?")


def min_amount(raw: str) -> Tuple[Optional[str], Optional[float]]:
    """AMFI's free-text minimum ("Rs. 5,000 and in multiples of Re.1 thereafter", "5000") -> (tidied text, the first rupee amount or None)."""
    t = re.sub(r"\s+", " ", raw or "").strip()
    if not t or t.upper() in ("NA", "N.A.", "-"):
        return None, None
    m = _RUPEES.search(t)
    v = float(m.group(1).replace(",", "")) if m else None
    return t[:200], (v if v is not None and 0 < v <= 10_000_000 else None)


LOAD_RETRY_DAYS = 14                 # task #281 (24 Nov): a family AMFI answered with no exit-load text (or a hard error) is asked again only after this many days
LIST_CACHE_DAYS = 7                  # task #281 (24 Nov): a fund house's AMFI scheme list is kept this many days, so the list phase costs almost nothing most nights
KIND_TRIED = "exitload_tried"        # disclosure_facts kind: a family asked with no exit load stored, {"outcome": "blank" | "error"}
KIND_LIST = "amfi_scheme_list"       # disclosure_facts kind: fkey "amfi-house:<mfId>", {"rows": [[scheme_name, scheme_id], ...]}


def loads_queue(by_house, tried_at):
    """Task #281 (24 Nov): the order schemes are asked in. Within a fund house: families never tried first, then those tried longest ago. Across houses:
    round-robin, one family per house in turn, so one big house (or the first in AMFI's alphabetical list) cannot use a whole night's calls.
    by_house: {house: [(family, candidates), ...]}; tried_at: {family: datetime}. Returns [(house, family, candidates), ...]."""
    lanes = []
    for house, fams in by_house.items():
        never = [x for x in fams if x[0] not in tried_at]
        old = sorted((x for x in fams if x[0] in tried_at), key=lambda x: tried_at[x[0]])
        lanes.append((house, never + old))
    lanes.sort(key=lambda h: -sum(1 for f, _ in h[1] if f not in tried_at))      # houses with most never-tried families lead each round
    out = []
    i = 0
    while any(i < len(f) for _h, f in lanes):
        for house, fams in lanes:
            if i < len(fams):
                out.append((house, fams[i][0], fams[i][1]))
        i += 1
    return out


async def step_loads(pool, client, idx: Index, today: date) -> dict:
    """Exit load text from AMFI's scheme details: one list call per fund house (kept LIST_CACHE_DAYS), then one call per scheme that matches an active
    scheme family here, has no load text from the last LOAD_MAX_AGE_DAYS days and was not asked in vain in the last LOAD_RETRY_DAYS. Families are asked
    never-tried first and round-robin across fund houses (task #281, 24 Nov: the queue followed AMFI's alphabetical house list and families with a blank
    answer stored nothing, so they were asked again at the front every night and the later houses were never reached). Resumable."""
    async with pool.acquire() as conn:
        active = {r["family"] for r in await conn.fetch("SELECT DISTINCT family FROM mf_schemes WHERE active")}
        fresh_rows = await conn.fetch("SELECT fkey, value FROM disclosure_facts WHERE kind = 'exitload' AND updated_at > now() - make_interval(days => $1)", LOAD_MAX_AGE_DAYS)
        tried_rows = await conn.fetch("SELECT fkey, updated_at FROM disclosure_facts WHERE kind = $1", KIND_TRIED)
        cached = {r["fkey"]: r["value"] for r in await conn.fetch(
            "SELECT fkey, value FROM disclosure_facts WHERE kind = $1 AND updated_at > now() - make_interval(days => $2)", KIND_LIST, LIST_CACHE_DAYS)}
    fresh = {r["fkey"] for r in fresh_rows if not exit_load_recut(r["value"])}
    recut = {r["fkey"] for r in fresh_rows} - fresh   # task #281: cut by the old cleaner; asked again at this run, not after LOAD_MAX_AGE_DAYS
    now = datetime.now(timezone.utc)
    tried_at = {r["fkey"]: r["updated_at"] for r in tried_rows}
    recent = {f for f, t in tried_at.items() if t is not None and (now - t).days < LOAD_RETRY_DAYS}
    deadline = time.monotonic() + LOAD_MAX_SECONDS
    houses = await get_json(client, URL_MF_LIST)
    by_house: Dict[str, list] = {}
    seen_fam: Dict[str, List[Tuple[str, str]]] = {}
    unmapped = lists_skipped = lists_cached = 0
    for h in houses or []:
        if excluded_amc(str(h.get("mfName") or "")):
            continue
        hid = str(h["mfId"])
        c = cached.get(f"amfi-house:{hid}")
        c = json.loads(c) if isinstance(c, str) else c
        if c and isinstance(c.get("rows"), list):
            rows = [{"scheme_name": nm, "scheme_id": sid} for nm, sid in c["rows"]]
            lists_cached += 1
        else:
            if time.monotonic() > deadline:
                lists_skipped += 1
                continue
            try:
                rows = await get_json(client, URL_SCHEMES, params={"MF_ID": h["mfId"]})
            except Exception:      # one fund house's scheme list refused (e.g. 429 after the waits): skip it this run; it is asked again on the next
                lists_skipped += 1
                await asyncio.sleep(LOAD_PAUSE_S)
                continue
            await put_facts(pool, [(f"amfi-house:{hid}", KIND_LIST, today, {"rows": [[str(r.get("scheme_name") or ""), str(r.get("scheme_id"))] for r in rows or []]},
                                    SRC_DETAILS, "https://www.amfiindia.com/otherdata/scheme-details")])
            await asyncio.sleep(LOAD_PAUSE_S)
        lane = by_house.setdefault(hid, [])
        for r in rows or []:
            fam, _ = idx.resolve([str(r.get("scheme_name") or "")])
            if not fam:
                unmapped += 1
            elif fam in active and fam not in fresh and fam not in recent:
                if fam not in seen_fam:
                    seen_fam[fam] = []
                    lane.append((fam, seen_fam[fam]))
                seen_fam[fam].append((hid, str(r["scheme_id"])))
    facts: list = []
    st = {"asked": 0, "blank": 0, "stored": 0, "refused429": 0, "in_a_row": 0, "errors": 0, "wait429": 0.0, "call_s": 0.0, "calls": 0, "ok_run": 0}
    pace = {"pause": LOAD_PAUSE_S}

    async def one(fam: str, cands: List[Tuple[str, str]]) -> None:
        launch_done = min_done = False
        answered = errored = False
        for mf_id, sid in sorted(cands, key=lambda c: -int(c[1]) if c[1].isdigit() else 0)[:3]:   # the newest listing of a scheme first
            st["asked"] += 1
            t0 = time.monotonic()
            dt = None
            try:
                d = ((await get_json_no_wait_on_429(client, URL_DETAILS, params={"MF_ID": mf_id, "scheme_id": sid})).get("data") or [{}])[0]
                dt = time.monotonic() - t0
                st["in_a_row"] = 0
                answered = True
                st["ok_run"] += 1
                if st["ok_run"] >= LOAD_EASE_AFTER and pace["pause"] > LOAD_PAUSE_S:    # answers again: ease the pace back towards the normal pause
                    pace["pause"] = max(LOAD_PAUSE_S, pace["pause"] / 2)
                    st["ok_run"] = 0
            except httpx.HTTPStatusError as exc:
                dt = time.monotonic() - t0
                if exc.response.status_code == 429:      # AMFI: "too many requests": wait once (capped), slow the pace, leave this fund for a later run
                    st["refused429"] += 1
                    st["in_a_row"] += 1
                    st["ok_run"] = 0
                    pace["pause"] = min(LOAD_PAUSE_MAX, pace["pause"] * 2)
                    wait = min(_retry_after(exc.response, LOAD_429_WAIT_MAX), LOAD_429_WAIT_MAX)
                    st["wait429"] += wait
                    await asyncio.sleep(wait)
                    return
                st["errors"] += 1
                answered = errored = True                # AMFI answered with an error for this scheme: recorded below, asked again after LOAD_RETRY_DAYS
                continue
            except Exception:
                st["errors"] += 1
                continue
            finally:
                st["calls"] += 1
                st["call_s"] += dt if dt is not None else time.monotonic() - t0
                await asyncio.sleep(pace["pause"])
            ld = amfi.parse_dmy(str(d.get("Launch_Date") or ""))
            if ld and not launch_done and date(1950, 1, 1) <= ld <= today:    # a second source for schemes the scheme master gives no clean launch date
                facts.append((fam, "launch_details", today, {"date": ld.isoformat()}, SRC_DETAILS, "https://www.amfiindia.com/otherdata/scheme-details"))
                launch_done = True
            mn_text, mn = min_amount(str(d.get("Scheme_min_amt") or ""))
            if mn_text and not min_done:   # stored, not shown: AMFI's minimum is out of date for some schemes (task #281)
                facts.append((fam, "min_amount_amfi", today, {"text": mn_text, "rupees": mn}, SRC_DETAILS, "https://www.amfiindia.com/otherdata/scheme-details"))
                min_done = True
            txt_ = exit_load_text(str(d.get("Scheme_load") or ""))
            if txt_:
                facts.append((fam, "exitload", today, {"text": txt_, "v": EXIT_TEXT_V}, SRC_DETAILS, "https://www.amfiindia.com/otherdata/scheme-details"))
                st["stored"] += 1
                return
        st["blank"] += 1
        if answered:        # task #281 (24 Nov): remember the vain ask, so this family no longer sits at the front of every night's queue
            facts.append((fam, KIND_TRIED, None, {"outcome": "error" if errored else "blank", "on": today.isoformat()}, SRC_DETAILS, None))

    items = loads_queue(by_house, tried_at)
    stopped = None
    reached: set = set()
    done = 0
    for n, (house, f, c) in enumerate(items, start=1):   # one scheme at a time (task #281 round 6: AMFI answered 429 to three at a time); written every 40
        left = len(items) - n + 1
        if time.monotonic() > deadline:
            stopped = f"this run's time budget of {LOAD_MAX_SECONDS // 60} minutes was used; the next run continues with the {left} schemes left"
            break
        if st["asked"] >= LOAD_MAX_CALLS:
            stopped = f"this run's limit of {LOAD_MAX_CALLS} AMFI calls was reached; the next run continues with the {left} schemes left"
            break
        if st["in_a_row"] >= LOAD_STOP_AFTER_429:
            stopped = f"AMFI answered 'too many requests' (429) {st['in_a_row']} times in a row; stopped for this run, the next run continues with the {left} schemes left"
            break
        reached.add(house)
        await one(f, c)
        done = n
        if n % 40 == 0:
            await put_facts(pool, facts)
            facts.clear()
    await put_facts(pool, facts)
    out = {"status": "partial" if stopped else "ok", "families": len(items), "asked": st["asked"], "loadsStored": st["stored"], "blank": st["blank"],
           "refused429": st["refused429"], "errors": st["errors"], "alreadyFresh": len(fresh & active), "namesNotMatched": unmapped, "houseListsSkipped": lists_skipped,
           "houseListsCached": lists_cached, "housesReached": len(reached), "housesWithWork": sum(1 for v in by_house.values() if v),
           "familiesLeft": len(items) - done, "triedRecently": len(recent & active), "cutTextsToReread": len(recut & active),
           "secondsWaiting429": round(st["wait429"], 1), "avgCallSeconds": round(st["call_s"] / st["calls"], 2) if st["calls"] else None,
           "finalPauseSeconds": pace["pause"]}
    if stopped:
        out["why"] = stopped
    return out


async def step_managers(pool, idx: Index) -> dict:
    """Risk-o-meter, fund managers and benchmark from AMFI's tracking-error disclosure and the fund houses' own sites
    (finlit/disclosure_parsers/managers_risk.py: each source fails alone; a fund house's own statement beats AMFI's benchmark wording)."""
    from .disclosure_parsers import managers_risk
    rows, stats = await managers_risk.collect(idx)
    rows = managers_risk.merge_rows(rows)
    await put_facts(pool, rows)
    failed = sorted(k for k, v in stats.items() if "error" in v)
    kinds: Dict[str, int] = defaultdict(int)
    for r in rows:
        kinds[r[1]] += 1
    return {"status": "partial" if failed else "ok", "rows": len(rows), **kinds, "failedSources": failed,
            "matched": {k: v.get("matched") for k, v in stats.items() if "error" not in v}}


async def step_ter(pool, client, idx: Index, today: date, force: bool = False) -> dict:
    """Total expense ratio (Regular and Direct plan) from each fund house's own daily TER page, for when AMFI's TER feed is out of reach
    (finlit/disclosure_parsers/ter.py: each house fails alone, polite pacing). Resumable: a house already stored today is not asked again (`force` re-asks)."""
    from .disclosure_parsers import ter
    done = [] if force else [k for k in ter.SOURCES if await _run_done(pool, f"ter:{k}", today.isoformat())]
    rows, stats = await ter.collect(idx, today, client=client, skip=done)
    stored = await put_facts(pool, rows)
    fam_house = {r[0]: r[4] for r in rows}
    for k, st in stats.items():
        if "error" in st:
            await _run_mark(pool, f"ter:{k}", today.isoformat(), "error", {"error": st["error"]})
        else:
            await _run_mark(pool, f"ter:{k}", today.isoformat(), "done", {x: y for x, y in st.items() if x != "unmatched"})
    failed = sorted(k for k, v in stats.items() if "error" in v)
    return {"status": "partial" if failed else "ok", "families": len(fam_house), "stored": stored, "alreadyDone": done, "failedSources": failed,
            "matched": {k: v.get("matched") for k, v in stats.items() if "error" not in v},
            "refused": {k: v.get("refused") for k, v in stats.items() if v.get("refused")}}


# ------------------------------------------------------------------------------------------------------------- steps: fund houses

def _members(path: str) -> Iterable[Tuple[str, str]]:
    """(name, path) of each Excel file in a download: the file itself, or each workbook inside a zip, one extracted at a time (caller deletes)."""
    with open(path, "rb") as fh:
        magic = fh.read(4)
    if magic[:2] == b"PK" and zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as z:
            if "xl/workbook.xml" in z.namelist():
                yield os.path.basename(path), path
                return
            for info in z.infolist():
                if info.filename.lower().endswith((".xlsx", ".xls")) and not info.filename.startswith("__MACOSX") and info.file_size < MAX_BYTES * 2:
                    dest = path + "." + re.sub(r"[^A-Za-z0-9]+", "_", info.filename)[-40:]
                    with z.open(info) as src, open(dest, "wb") as out:
                        shutil.copyfileobj(src, out)
                    try:
                        yield info.filename, dest
                    finally:
                        try:
                            os.remove(dest)
                        except OSError:
                            pass
        return
    yield os.path.basename(path), path


def process_workbook(path: str, ref: FileRef, adapter: Adapter, idx: Index, stats: dict, sink: list) -> None:
    """Parse every sheet of one workbook into `sink` as (family, Portfolio) after matching and validation; failures go into stats. Synchronous: the
    workbook is read, its sheets are parsed one at a time and the parsed rows are small."""
    wb = open_workbook(path)
    try:
        for i, (sname, _) in enumerate(wb.sheets):
            try:
                p = parse_rows(wb.rows(i), f"{adapter.title}, monthly portfolio disclosure", ref.url, as_of_hint=None, name_hint=ref.name_hint)
            except NotAPortfolio as exc:
                stats["sheets_skipped"] += 1
                if "no 'as on' date" in str(exc):
                    stats["failures"].append({"sheet": sname, "scheme": ref.name_hint, "why": str(exc)})
                continue
            except Exception as exc:        # a malformed sheet must not stop the rest of the workbook
                stats["failures"].append({"sheet": sname, "scheme": ref.name_hint, "why": f"parse error: {type(exc).__name__}: {exc}"[:200]})
                continue
            stats["sheets"] += 1
            fam, why = idx.resolve([p.scheme_name, *p.aliases], adapter.amc_re)
            if not fam:
                stats["unmapped"].append({"scheme": p.scheme_name, "why": why})
                continue
            v = validate(p, _today())
            if not v.ok:
                stats["rejected"].append({"scheme": p.scheme_name, "asOf": p.as_of.isoformat(), "problems": v.problems[:3]})
                continue
            from .disclosure_parsers.model import clean_for_store
            dropped = clean_for_store(p)
            if dropped:
                p.notes.append(f"{dropped} ISIN(s) failing the ISIN check digit are not shown")
            if v.warnings:
                stats["warnings"] += len(v.warnings)
            sink.append((fam, p))
    finally:
        wb.close()


async def step_amc(pool, client, adapter: Adapter, idx: Index, today: date, months: int, force: bool) -> dict:
    stats = {"files": 0, "sheets": 0, "sheets_skipped": 0, "stored": 0, "skipped_existing": 0, "kept_existing": 0, "too_old": 0, "warnings": 0,
             "rejected": [], "unmapped": [], "failures": [], "families": set(), "errors": []}
    mends = month_ends(today, months)
    refs = await adapter.list_files(client, mends)
    stats["listed"] = len(refs)
    tmp = tempfile.mkdtemp(prefix=f"disc_{adapter.key}_")
    try:
        for ref in refs:
            per_scheme = ref.name_hint is not None
            period = f"{ref.month_end:%Y-%m}:{ref.url.rsplit('/', 1)[-1].split('?')[0][:80]}"
            if per_scheme:
                fam, _ = idx.resolve([ref.name_hint], adapter.amc_re)
                if fam and not force and ref.month_end:
                    async with pool.acquire() as conn:
                        if await conn.fetchval("SELECT 1 FROM disclosure_portfolios WHERE fkey = $1 AND as_of = $2", fam, ref.month_end):
                            stats["skipped_existing"] += 1
                            continue
            elif not force and await _file_done(pool, adapter.key, period):
                stats["skipped_existing"] += 1
                continue
            before = (stats["sheets"], len(stats["rejected"]), len(stats["unmapped"]), len(stats["errors"]))
            path = os.path.join(tmp, "f.bin")
            try:
                await download(client, ref.url, path)
            except Exception as exc:
                stats["errors"].append(f"{ref.label}: {type(exc).__name__}: {str(exc)[:120]}")
                continue
            stats["files"] += 1
            parse_file = getattr(adapter, "parse_file", None)      # a fund house that publishes PDFs only brings its own reader (houses_e.py)
            try:
                for mname, mpath in ([(os.path.basename(path), path)] if parse_file else _members(path)):
                    sink: list = []
                    try:
                        (parse_file or process_workbook)(mpath, ref, adapter, idx, stats, sink)
                    except Exception as exc:
                        stats["errors"].append(f"{ref.label} / {mname}: {type(exc).__name__}: {str(exc)[:120]}")
                    for fam, p in sink:
                        res = await store_portfolio(pool, fam, idx.amc[fam], p)
                        if res == "stored":
                            stats["stored"] += 1
                            stats["families"].add(fam)
                        else:
                            stats[res] += 1
                    del sink
            finally:
                try:
                    os.remove(path)
                except OSError:
                    pass
            if not per_scheme and len(stats["errors"]) == before[3]:
                # this file's own counts: a file with an unmatched or rejected sheet stays due (see _file_done)
                await _run_mark(pool, adapter.key, period, "done", {"sheets": stats["sheets"] - before[0], "rejected": len(stats["rejected"]) - before[1],
                                                                     "unmapped": len(stats["unmapped"]) - before[2]})
            await asyncio.sleep(0.3)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    stats["families"] = len(stats["families"])
    stats["status"] = "ok" if not stats["errors"] else "partial"
    return stats


# ------------------------------------------------------------------------------------------------------------- refresh

async def refresh(store, settings=None, only: Optional[Sequence[str]] = None, months: int = KEEP_MONTHS, force: bool = False,
                  client: Optional[httpx.AsyncClient] = None, today: Optional[date] = None) -> dict:
    """Run every step; each fails alone. Returns {status: ok|partial|failed, steps: {...}, amc: {key: counts}}. `only` limits it to named steps / fund houses
    (master, isin, performance, ter, aaum, or an adapter key like mirae)."""
    pool = store.pool
    today = today or _today()
    own = client is None
    client = client or make_client()
    want = {s.lower() for s in only} if only else None
    out: dict = {"status": "ok", "date": today.isoformat(), "steps": {}, "amc": {}}
    try:
        idx = await load_index(pool)
        if len(idx.by_code) < 1000:
            return {"status": "failed", "why": "mf_schemes is empty or short: run refresh-mf first", "steps": {}, "amc": {}}
        steps = [("isin", lambda: step_isin(pool, today)), ("performance", lambda: step_performance(pool, client, idx, today)),
                 ("loads", lambda: step_loads(pool, client, idx, today)), ("managers", lambda: step_managers(pool, idx)),
                 ("ter", lambda: step_ter(pool, client, idx, today, force))]
        for name, fn in steps:
            if want and name not in want:
                continue
            try:
                out["steps"][name] = await fn()
            except Exception as exc:
                log.warning("disclosure step %s failed", name, exc_info=True)
                out["steps"][name] = {"status": "error", "why": who_answered(exc)}
        for ad in ADAPTERS:
            if want and ad.key not in want:
                continue
            try:
                out["amc"][ad.key] = await step_amc(pool, client, ad, idx, today, months, force)
            except Exception as exc:
                log.warning("disclosure adapter %s failed", ad.key, exc_info=True)
                out["amc"][ad.key] = {"status": "error", "why": who_answered(exc)}
    finally:
        if own:
            await client.aclose()
    results = [v.get("status") for v in [*out["steps"].values(), *out["amc"].values()]]
    if not results or all(s in ("error", "refused") for s in results):
        out["status"] = "failed"
    elif any(s in ("error", "refused", "partial") for s in results):
        out["status"] = "partial"
    return out


# ------------------------------------------------------------------------------------------------------------- reports

async def coverage(pool) -> dict:
    """Real counts per fund house: active scheme codes, and how many of them have holdings / exit load / benchmark / risk-o-meter / fund managers."""
    sql = """
    SELECT s.amc,
           count(*) FILTER (WHERE s.active) AS codes,
           count(*) FILTER (WHERE s.active AND EXISTS (SELECT 1 FROM disclosure_portfolios p WHERE p.fkey = s.family)) AS holdings,
           count(*) FILTER (WHERE s.active AND EXISTS (SELECT 1 FROM disclosure_facts f WHERE f.fkey = s.family AND f.kind = 'exitload')) AS exit_load,
           count(*) FILTER (WHERE s.active AND (EXISTS (SELECT 1 FROM disclosure_facts f WHERE f.fkey = s.family AND f.kind = 'benchmark')
                                                OR EXISTS (SELECT 1 FROM disclosure_portfolios p WHERE p.fkey = s.family AND p.benchmark IS NOT NULL))) AS benchmark,
           count(*) FILTER (WHERE s.active AND EXISTS (SELECT 1 FROM disclosure_facts f WHERE f.fkey = s.family AND f.kind = 'risk')) AS risk,
           count(*) FILTER (WHERE s.active AND EXISTS (SELECT 1 FROM disclosure_facts f WHERE f.fkey = s.family AND f.kind = 'managers')) AS managers
    FROM mf_schemes s GROUP BY s.amc ORDER BY codes DESC"""
    fam_sql = """
    SELECT s.amc, count(DISTINCT s.family) AS families,
           count(DISTINCT s.family) FILTER (WHERE EXISTS (SELECT 1 FROM disclosure_portfolios p WHERE p.fkey = s.family)) AS families_with_holdings
    FROM mf_schemes s WHERE s.active GROUP BY s.amc"""
    async with pool.acquire() as conn:
        rows = [dict(r) for r in await conn.fetch(sql)]
        fam = {r["amc"]: dict(r) for r in await conn.fetch(fam_sql)}
    for r in rows:
        r.update({k: v for k, v in fam.get(r["amc"], {}).items() if k != "amc"})
    return {"perAmc": rows, "excludedHidden": [r["amc"] for r in rows if excluded_amc(r["amc"])]}


async def size_report(pool) -> dict:
    """Bytes used by the disclosure tables (heap + TOAST + indexes) and the per-scheme average."""
    out = {}
    async with pool.acquire() as conn:
        for t in ("disclosure_portfolios", "disclosure_facts", "disclosure_isin", "disclosure_runs"):
            out[t] = {"bytes": await conn.fetchval("SELECT pg_total_relation_size($1::regclass)", t), "rows": await conn.fetchval(f"SELECT count(*) FROM {t}")}  # nosec B608 - t is one of the four literal table names above
        out["holdings_json_bytes"] = await conn.fetchval("SELECT coalesce(sum(pg_column_size(holdings)),0) FROM disclosure_portfolios")
        out["holdings_text_bytes"] = await conn.fetchval("SELECT coalesce(sum(length(holdings::text)),0) FROM disclosure_portfolios")
        out["avg_holdings"] = await conn.fetchval("SELECT coalesce(avg(n),0) FROM disclosure_portfolios")
    out["total_bytes"] = sum(v["bytes"] for k, v in out.items() if isinstance(v, dict))
    return out


# ------------------------------------------------------------------------------------------------------------- local use

async def _main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser(prog="python -m finlit.portfolios")
    ap.add_argument("cmd", choices=["refresh", "coverage", "size"])
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--months", type=int, default=KEEP_MONTHS)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args(argv)
    from .config import get_settings
    from .store import Store
    settings = get_settings()
    store = await Store.connect(settings, migrate=True)
    try:
        if a.cmd == "refresh":
            res = await refresh(store, settings, a.only, a.months, a.force)
        elif a.cmd == "coverage":
            res = await coverage(store.pool)
        else:
            res = await size_report(store.pool)
        print(json.dumps(res, indent=1, default=str))
        return 0 if res.get("status", "ok") == "ok" else 1
    finally:
        await store.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    raise SystemExit(asyncio.run(_main(sys.argv[1:])))
