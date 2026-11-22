"""Nightly scores export (task #326, the owner's SPEC of 22 Nov 2026): one small file per market day with every scored company and every ready-made screen of
the Advanced stock screener, for the program on the owner's Mac that keeps the archive. An internal data feed: no page, no member feature, no download for any plan.

What it reads (stored results only; nothing is recomputed, no screen rule is run here):
  the screens        screen_snapshots / screen_runs / screen_spells, which the `presets` job writes for every screen at its default chips each night (the same
                     lists the screener page serves, with their order and "Added" day), and the `gainers` table for the three Top gainers screens.
  the companies      the day the presets job has just finished ("live"): the screener's in-memory table (close, day change as the site shows it, market cap,
                     returns, 52-week high, F&O) and the newest stored Prism card of each company (score, four parts, label, both technical views), exactly
                     what the Advanced screener shows. An earlier day (back-fill, or a day exported after the next session has opened): prism_history (the
                     rating and the technical views in force that day), price_daily (the close, and the day change against the previous close), and that day's
                     screen rows (market cap, returns, F&O for the companies on a screen). Fields that are not kept per day are null, never today's figure.
  every day          ISIN, NSE / BSE code and the three NSE classification levels (company_classification), the company name (companies), the Leader / In line /
                     Laggard tag of the weekly leadership run in force that day (leadership_history).

Files: <SCORES_EXPORT_DIR>/scores_YYYY-MM-DD.json.gz, written under a temporary name and linked into place (a half-written file is never served, and an existing
day is never replaced: link() refuses). Every file is checked with the owner's own checker (scores_export_check.validate) first; a file it refuses is not written.
The newest KEEP_DAYS files are kept. The two links (scores_export_api.py) only list and serve these files.
"""
from __future__ import annotations

import gzip
import json
import logging
import math
import os
import re
import time as _time
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from . import sizes
from .scores_export_check import validate

log = logging.getLogger("finlit.scores_export")

SCHEMA = 1
KEEP_DAYS = 120                                  # SPEC 1: at least the last 120 days stay on the server
BACKFILL_FROM = date(2026, 11, 3)                # SPEC 1: Prism scores are on file from 3 Nov 2026
BACKFILL_PER_RUN = 3                             # SPEC 1: "a few days per run", and only in the night shift (outside busy hours)
REFERENCE = ("RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN")      # jobs/freshness.py: the large companies that print a bar every session
REFERENCE_MIN = 3                                # a day with closes for at least this many of them is a market day (a holiday has none)
OPEN_AT = time(9, 15)                            # a day's "live" figures are its own only until the next session opens
IST = timezone(timedelta(hours=5, minutes=30))
NAME = re.compile(r"^scores_(\d{4}-\d{2}-\d{2})\.json\.gz$")
DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
GAINER_WINDOWS = {"gainers-day": "day", "gainers-week": "week", "gainers-month": "month"}
SPLIT_GUARD_PCT = 20.0                           # a stored-close day change this large on a split or bonus day is the action, not a move: null, never -50%
# keys every screen row carries that are not the screen's own columns (they are in `companies`, or are the identity of the row)
ROW_BASE = {"rank", "position", "symbol", "name", "exchange", "sector", "market_cap", "prism_status", "prism_final", "prism_st_score", "prism_lt_score",
            "badges", "fno", "turnover20_cr", "facts", "draw", "new", "added_on", "added_baseline", "since_added_pct", "bench_since_added_pct", "_close"}
LEADER = {"leader": "Leader", "in_line": "In line", "laggard": "Laggard"}


def export_dir() -> Path:
    return Path(os.getenv("SCORES_EXPORT_DIR", "/data/exports/scores"))


def file_for(day: date, folder: Optional[Path] = None) -> Path:
    return (folder or export_dir()) / f"scores_{day.isoformat()}.json.gz"


def dates(folder: Optional[Path] = None) -> List[str]:
    """Every day a file exists for, oldest first (what GET .../dates returns). Reads the folder only."""
    d = folder or export_dir()
    try:
        names = os.listdir(d)
    except FileNotFoundError:
        return []
    return sorted(m.group(1) for m in (NAME.match(n) for n in names) if m)


# ------------------------------------------------------------------------------------------------------------------------------ numbers
def _num(v: Any, nd: Optional[int] = None) -> Optional[float]:
    if v is None or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, nd) if nd is not None else f


def _json_value(v: Any) -> Any:
    if isinstance(v, float):
        return _num(v)
    if isinstance(v, (int, str, bool)) or v is None:
        return v
    if isinstance(v, (list, tuple)):
        return [_json_value(x) for x in v]
    if isinstance(v, dict):
        return {k: _json_value(x) for k, x in v.items()}
    return str(v)


def _label(v: Any) -> Optional[str]:
    """The Prism rating word as the site writes it (STRONG -> Strong, NOT RATED -> Not rated)."""
    return str(v).strip().capitalize() if v else None


# ------------------------------------------------------------------------------------------------------------------------------ market days
def next_weekday(d: date) -> date:
    d += timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def live_until(day: date) -> datetime:
    """The moment the session after `day` opens: until then the screener's figures are `day`'s close."""
    return datetime.combine(next_weekday(day), OPEN_AT, IST)


async def market_days(conn, since: date, until: date) -> List[date]:
    """Days from `since` to `until` (both included) on which the market printed a bar: closes stored for REFERENCE_MIN of the reference companies."""
    rows = await conn.fetch("SELECT day FROM price_daily WHERE symbol = ANY($1::text[]) AND day BETWEEN $2 AND $3 AND close > 0 GROUP BY day HAVING count(*) >= $4 ORDER BY day",
                            list(REFERENCE), since, until, REFERENCE_MIN)
    return [r["day"] for r in rows]


async def prev_market_day(conn, day: date) -> date:
    got = await conn.fetchval("SELECT max(day) FROM (SELECT day FROM price_daily WHERE symbol = ANY($1::text[]) AND day < $2 AND day >= $3 AND close > 0 "
                              "GROUP BY day HAVING count(*) >= $4) t", list(REFERENCE), day, day - timedelta(days=15), REFERENCE_MIN)
    if got:
        return got
    d = day - timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


async def is_market_day(store, day: date, now: datetime) -> bool:
    """A weekday with reference closes stored, or the session the technicals job found to be the newest (Dhan's Nifty 50 candles: it knows holidays)."""
    if day.weekday() >= 5:
        return False
    async with store.pool.acquire() as conn:
        if await market_days(conn, day, day):
            return True
    try:
        from .prism_technical import current_target
        return await current_target(store.redis, now) == day
    except Exception:
        return False


# ------------------------------------------------------------------------------------------------------------------------------ the screens
def screen_list() -> list:
    """Every ready-made screen of the Advanced stock screener, in the page's order (blocked and quick-view entries are not lists)."""
    from .presets.service import live_presets
    return [p for p in live_presets() if p.kind not in ("blocked", "quickview")]


def default_chips(p) -> str:
    from .presets import engine
    return engine.chip_key([c.id for c in p.chips if c.default])


def _extra(p, row: Dict[str, Any]) -> Dict[str, Any]:
    keys = [c.key for c in p.columns if c.key not in ROW_BASE]
    out = {k: _json_value(row.get(k)) for k in keys if k in row}
    return out


async def load_screens(conn, day: date) -> Tuple[List[dict], Dict[str, dict], Dict[str, Any]]:
    """(screens with rows by SYMBOL, the per-symbol figures the rows carry, notes). Only a screen the presets job stored for `day` is listed; a stored run
    with no companies is listed with rows []. A screen with no stored run that day is left out and named in the notes, never shown as empty."""
    screens: List[dict] = []
    seen: Dict[str, dict] = {}
    missing: List[str] = []
    gain_rows = await conn.fetch("SELECT win, rank, row FROM gainers WHERE page = 'advanced' AND session = $1 ORDER BY win, rank", day)
    gainers_ran = bool(gain_rows) or bool(await conn.fetchval("SELECT EXISTS (SELECT 1 FROM screen_runs WHERE session = $1)", day))
    for p in screen_list():
        if p.kind == "gainers":
            if not gainers_ran:
                missing.append(p.id)
                continue
            win = GAINER_WINDOWS.get(p.id)
            raw = [(r["rank"], json.loads(r["row"]) if isinstance(r["row"], str) else dict(r["row"])) for r in gain_rows if r["win"] == win]
            rows = []
            for pos, (_rank, row) in enumerate(raw, 1):
                rows.append({"symbol": row.get("symbol"), "pos": pos, "extra": _extra(p, row)})
                _keep(seen, row)
            screens.append({"id": p.id, "name": p.name, "rows": rows})
            continue
        ckey = default_chips(p)
        run = await conn.fetchrow("SELECT n FROM screen_runs WHERE preset_id = $1 AND chips = $2 AND session = $3", p.id, ckey, day)
        if run is None:
            missing.append(p.id)
            continue
        snap = await conn.fetch("SELECT symbol, rank, row FROM screen_snapshots WHERE preset_id = $1 AND chips = $2 AND session = $3 ORDER BY rank, symbol", p.id, ckey, day)
        added = {r["symbol"]: r["added_on"] for r in await conn.fetch(
            "SELECT symbol, max(added_on) AS added_on FROM screen_spells WHERE preset_id = $1 AND chips = $2 AND added_on <= $3 AND (left_on IS NULL OR left_on > $3) GROUP BY symbol",
            p.id, ckey, day)}
        rows = []
        for pos, r in enumerate(snap, 1):
            row = json.loads(r["row"]) if isinstance(r["row"], str) else dict(r["row"])
            out = {"symbol": r["symbol"], "pos": pos}
            if added.get(r["symbol"]):
                out["added"] = added[r["symbol"]].isoformat()
            ex = _extra(p, row)
            if ex:
                out["extra"] = ex
            rows.append(out)
            _keep(seen, row)
        screens.append({"id": p.id, "name": p.name, "rows": rows})
    return screens, seen, {"screensNotStored": missing}


def _keep(seen: Dict[str, dict], row: Dict[str, Any]) -> None:
    s = row.get("symbol")
    if not s:
        return
    have = seen.setdefault(s, {})
    for k in ("market_cap", "fno", "ret_3m", "ret_6m", "ret_1y", "pct_from_high"):
        if have.get(k) is None and _num(row.get(k)) is not None:
            have[k] = _num(row.get(k))


# ------------------------------------------------------------------------------------------------------------------------------ the companies
async def identities(conn, symbols: Sequence[str]) -> Dict[str, dict]:
    rows = await conn.fetch(
        """SELECT c.symbol, c.name, NULLIF(c.nse_code, '') AS nse, NULLIF(c.bse_code, '') AS bse,
                  COALESCE(NULLIF(cc.isin, ''), (SELECT min(d.isin) FROM disclosure_isin d WHERE d.symbol = c.symbol)) AS isin,
                  cc.macro_sector, cc.sector, cc.industry
           FROM companies c LEFT JOIN company_classification cc ON cc.symbol = c.symbol WHERE c.symbol = ANY($1::text[])""", list(symbols))
    return {r["symbol"]: dict(r) for r in rows}


async def leader_tags(conn, symbols: Sequence[str], day: date) -> Dict[str, str]:
    rows = await conn.fetch("SELECT DISTINCT ON (symbol) symbol, label FROM leadership_history WHERE symbol = ANY($1::text[]) AND run_date <= $2 ORDER BY symbol, run_date DESC",
                            list(symbols), day)
    return {r["symbol"]: LEADER[r["label"]] for r in rows if r["label"] in LEADER}


async def live_figures(store) -> Tuple[Dict[str, dict], List[str]]:
    """symbol -> figures, from the screener's table and the newest stored Prism cards (what the Advanced screener shows now); and the scored symbols."""
    from . import prism_screen
    from .screener.data import get_table
    t = await get_table(store)
    cards = prism_screen.cards(await store.prism_cards(None))
    col = t.cols
    out: Dict[str, dict] = {}
    for i, s in enumerate(t.symbols):
        c = cards.get(s) or {}
        fno = _num(col["fno"][i])
        out[s] = {"close": _num(col["price"][i], 2), "chg_1d_pct": _num(col["ret_1d"][i], 2), "mcap_cr": _num(col["market_cap"][i], 2),
                  "ret": {"m3": _num(col["ret_3m"][i], 2), "m6": _num(col["ret_6m"][i], 2), "y1": _num(col["ret_1y"][i], 2)},
                  "below_52w_high_pct": _num(col["pct_from_high"][i], 2), "fo": None if fno is None else int(fno),
                  "prism": {"final": _num(c.get("prism_final"), 1), "fundamental": _num(c.get("prism_fundamental"), 1), "valuation": _num(c.get("prism_valuation"), 1),
                            "quality": _num(c.get("prism_quality"), 1), "risk": _num(c.get("prism_risk"), 1), "label": _label(c.get("prism_label"))},
                  "tech": {"st": _num(c.get("prism_st_score"), 1), "lt": _num(c.get("prism_lt_score"), 1)}}
    scored = [s for s in t.symbols if s in cards]
    return out, scored


async def history_figures(conn, day: date, prev: date, extra_symbols: Iterable[str], seen: Dict[str, dict]) -> Tuple[Dict[str, dict], List[str], Dict[str, Any]]:
    """symbol -> figures as they stood on `day`, from the stored history only. The rating and technical views: the newest prism_history row recorded before the
    next session opened (consolidated first, as the screener's card). The close: price_daily. Market cap, returns, 52-week high and F&O: only what that day's
    screen rows carry (they are not kept per day for other companies), else null."""
    cutoff = live_until(day)
    prism = await conn.fetch(
        """SELECT DISTINCT ON (symbol) symbol, final, label, p_fundamental, p_valuation, p_quality, p_risk, st_score, lt_score FROM prism_history
           WHERE recorded_at < $1 ORDER BY symbol, (statement = 'consolidated') DESC, day DESC""", cutoff)
    scored = [r["symbol"] for r in prism]
    symbols = sorted(set(scored) | set(extra_symbols))
    px = {}
    for r in await conn.fetch("SELECT symbol, day, close FROM price_daily WHERE symbol = ANY($1::text[]) AND day IN ($2, $3) AND close > 0", symbols, day, prev):
        px.setdefault(r["symbol"], {})[r["day"]] = float(r["close"])
    chg: Dict[str, Optional[float]] = {}
    for s, by in px.items():
        a, b = by.get(prev), by.get(day)
        chg[s] = round((b / a - 1) * 100, 2) if a and b else None
    big = [s for s, v in chg.items() if v is not None and abs(v) >= SPLIT_GUARD_PCT]
    nulled = await _split_days(conn, big, prev, day)
    for s in nulled:
        chg[s] = None
    out: Dict[str, dict] = {}
    pr = {r["symbol"]: r for r in prism}
    for s in symbols:
        r = pr.get(s)
        x = seen.get(s, {})
        fno = x.get("fno")
        mcap = x.get("market_cap")
        out[s] = {"close": _num((px.get(s) or {}).get(day), 2), "chg_1d_pct": chg.get(s), "mcap_cr": _num(mcap, 2),
                  "ret": {"m3": _num(x.get("ret_3m"), 2), "m6": _num(x.get("ret_6m"), 2), "y1": _num(x.get("ret_1y"), 2)},
                  "below_52w_high_pct": _num(x.get("pct_from_high"), 2), "fo": None if fno is None else int(fno),
                  "prism": {"final": _num(r and r["final"], 1), "fundamental": _num(r and r["p_fundamental"], 1), "valuation": _num(r and r["p_valuation"], 1),
                            "quality": _num(r and r["p_quality"], 1), "risk": _num(r and r["p_risk"], 1), "label": _label(r and r["label"])},
                  "tech": {"st": _num(r and r["st_score"], 1), "lt": _num(r and r["lt_score"], 1)}}
    return out, scored, {"splitDayChangesNulled": sorted(nulled)}


async def _split_days(conn, symbols: Sequence[str], prev: date, day: date) -> List[str]:
    """Of `symbols`, those with a stored split or bonus dated after `prev` up to `day` (the company's stored corporate actions)."""
    if not symbols:
        return []
    rows = await conn.fetch("SELECT symbol, body FROM snapshots WHERE section = 'events' AND symbol = ANY($1::text[])", list(symbols))
    hit = set()
    for r in rows:
        try:
            body = json.loads(r["body"])
        except Exception:
            continue
        for a in (body.get("actions") or []) if isinstance(body, dict) else []:
            kind = str((a or {}).get("type", "")).lower()
            d = str((a or {}).get("date", ""))[:10]
            if ("split" in kind or "bonus" in kind) and DAY.match(d) and prev < date.fromisoformat(d) <= day:
                hit.add(r["symbol"])
    return sorted(hit)


# ------------------------------------------------------------------------------------------------------------------------------ one day
async def build_day(store, day: date, live: bool, now: Optional[datetime] = None) -> Tuple[dict, Dict[str, Any]]:
    """The file for `day` (not yet checked) and notes on what was left out."""
    now = now or datetime.now(timezone.utc)
    async with store.pool.acquire() as conn:
        prev = await prev_market_day(conn, day)
        screens, seen, notes = await load_screens(conn, day)
        on_screens = {r["symbol"] for s in screens for r in s["rows"] if r.get("symbol")}
        if live:
            figs, scored = await live_figures(store)
        else:
            figs, scored, more = await history_figures(conn, day, prev, on_screens, seen)
            notes.update(more)
        universe = sorted(set(scored) | on_screens)
        ids = await identities(conn, universe)
        tags = await leader_tags(conn, universe, day)
    companies: List[dict] = []
    isin_of: Dict[str, str] = {}
    no_isin: List[str] = []
    dup: List[str] = []
    used: Dict[str, str] = {}
    # a company with a Prism score first, so a repeated ISIN keeps the scored line
    for s in sorted(universe, key=lambda x: (((figs.get(x) or {}).get("prism") or {}).get("final") is None, x)):
        meta = ids.get(s)
        isin = (meta or {}).get("isin")
        if not meta or not isinstance(isin, str) or len(isin) != 12:
            no_isin.append(s)
            continue
        if isin in used:
            dup.append(s)
            continue
        used[isin] = s
        f = figs.get(s) or {}
        nse, bse = meta.get("nse"), meta.get("bse")
        mcap = f.get("mcap_cr")
        companies.append({"isin": isin, "symbol": nse or bse or s, "exchange": "NSE" if nse else "BSE", "name": meta.get("name") or s,
                          "close": f.get("close"), "chg_1d_pct": f.get("chg_1d_pct"),
                          "prism": f.get("prism") or {"final": None, "fundamental": None, "valuation": None, "quality": None, "risk": None, "label": None},
                          "tech": f.get("tech") or {"st": None, "lt": None},
                          "size": sizes.size_of(mcap), "mcap_cr": mcap,
                          "macro_sector": meta.get("macro_sector"), "sector": meta.get("sector"), "industry": meta.get("industry"),
                          "ret": f.get("ret") or {"m3": None, "m6": None, "y1": None}, "below_52w_high_pct": f.get("below_52w_high_pct"),
                          "leader_tag": tags.get(s), "fo": f.get("fo")})
        isin_of[s] = isin
    companies.sort(key=lambda c: c["isin"])
    dropped_rows = 0
    for sc in screens:
        rows = []
        for r in sc["rows"]:
            sym = r.pop("symbol", None)
            if sym not in isin_of:
                dropped_rows += 1      # no ISIN known for it: the row cannot be keyed (its place stays a gap, the others keep theirs)
                continue
            rows.append({"isin": isin_of[sym], **r})
        sc["rows"] = rows
    doc = {"schema": SCHEMA, "date": day.isoformat(), "prev_date": prev.isoformat(), "generated_at": now.astimezone(IST).isoformat(timespec="seconds"),
           "companies": companies, "screens": screens}
    notes.update({"mode": "live" if live else "history", "companiesNoIsin": len(no_isin), "noIsinSample": no_isin[:10], "isinRepeated": len(dup),
                  "screenRowsWithoutIsin": dropped_rows})
    return doc, notes


def write_day(doc: dict, folder: Optional[Path] = None) -> Path:
    """Check, then write under a temporary name and link it into place. Never replaces a published day (FileExistsError)."""
    bad = validate(doc)
    if bad:
        raise ValueError("export not written: " + "; ".join(bad))
    folder = folder or export_dir()
    folder.mkdir(parents=True, exist_ok=True)
    out = folder / f"scores_{doc['date']}.json.gz"
    if out.exists():
        raise FileExistsError(f"{out.name} already exists: a published day is never rewritten")
    tmp = folder / f".scores_{doc['date']}.{os.getpid()}.tmp"
    tmp.write_bytes(gzip.compress(json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), mtime=0))
    try:
        os.link(tmp, out)            # atomic, and refuses an existing name (a rename would silently replace it)
    finally:
        tmp.unlink(missing_ok=True)
    return out


SKIPPED = ".not_reconstructable.json"     # back-fill days the stored history cannot honestly make (the checker refused them): not tried again


def not_reconstructable(folder: Optional[Path] = None) -> Dict[str, str]:
    try:
        return json.loads(((folder or export_dir()) / SKIPPED).read_text())
    except (FileNotFoundError, ValueError):
        return {}


def _mark_not_reconstructable(folder: Path, day: date, why: str) -> None:
    got = not_reconstructable(folder)
    got[day.isoformat()] = why[:300]
    tmp = folder / (SKIPPED + ".tmp")
    tmp.write_text(json.dumps(got, indent=1, sort_keys=True))
    tmp.replace(folder / SKIPPED)


def prune(folder: Optional[Path] = None, keep: int = KEEP_DAYS) -> List[str]:
    folder = folder or export_dir()
    days = dates(folder)
    gone = days[:-keep] if len(days) > keep else []
    for d in gone:
        (folder / f"scores_{d}.json.gz").unlink(missing_ok=True)
    return gone


# ------------------------------------------------------------------------------------------------------------------------------ the job
async def last_presets_run(conn) -> Optional[dict]:
    v = await conn.fetchval("SELECT value FROM preset_meta WHERE key = 'last_run'")
    if v is None:
        return None
    return json.loads(v) if isinstance(v, str) else dict(v)


async def pending(store, now: Optional[datetime] = None, folder: Optional[Path] = None) -> Dict[str, Any]:
    """What the job would do now: the day the presets job finished (when it has no file yet) and the back-fill days (in the night shift only)."""
    from .jobs.schedule import night_shift
    now = now or datetime.now(timezone.utc)
    have = set(dates(folder))
    skip = set(not_reconstructable(folder))
    async with store.pool.acquire() as conn:
        run = await last_presets_run(conn)
        newest: Optional[date] = None
        if run and run.get("asOf") and DAY.match(str(run["asOf"])):
            d = date.fromisoformat(str(run["asOf"]))
            stored = await conn.fetchval("SELECT count(*) FROM screen_runs WHERE session = $1", d)
            if stored and d.isoformat() not in have:
                newest = d
        back: List[date] = []
        if night_shift(now):
            top = (date.fromisoformat(run["asOf"]) if run and run.get("asOf") and DAY.match(str(run["asOf"])) else ist_today(now)) - timedelta(days=1)
            kept_from = date.fromisoformat(sorted(have)[-KEEP_DAYS]) if len(have) >= KEEP_DAYS else BACKFILL_FROM
            stored_days = {r["session"] for r in await conn.fetch("SELECT DISTINCT session FROM screen_runs WHERE session BETWEEN $1 AND $2", max(BACKFILL_FROM, kept_from), top)}
            for d in await market_days(conn, max(BACKFILL_FROM, kept_from), top):
                if d.isoformat() not in have and d.isoformat() not in skip and d in stored_days:
                    back.append(d)
    return {"newest": newest, "backfill": back}


def ist_today(now: datetime) -> date:
    return now.astimezone(IST).date()


async def has_work(store, now: Optional[datetime] = None) -> bool:
    """The job's probe: true when the presets job has finished a day that has no file yet, or (in the night shift) a back-fill day is waiting."""
    p = await pending(store, now)
    return bool(p["newest"] or p["backfill"])


async def run(store, now: Optional[datetime] = None, folder: Optional[Path] = None, backfill: int = BACKFILL_PER_RUN) -> Dict[str, Any]:
    """The job: export the day the presets job has just finished (live figures while that day's close is still current, else stored history), then up to
    `backfill` earlier days from stored history (night shift only), then keep the newest KEEP_DAYS. Returns a summary; `failed` lists days refused by the checker."""
    started = _time.monotonic()
    now = now or datetime.now(timezone.utc)
    folder = folder or export_dir()
    todo = await pending(store, now, folder)
    out: Dict[str, Any] = {"written": [], "skipped": [], "failed": [], "notes": {}}
    days: List[Tuple[date, bool]] = []
    if todo["newest"]:
        d = todo["newest"]
        if await is_market_day(store, d, now):
            days.append((d, now < live_until(d)))
        else:
            out["skipped"].append({"date": d.isoformat(), "why": "not a market day (no session printed)"})
    days += [(d, False) for d in todo["backfill"][:max(0, backfill)]]
    for d, live in days:
        try:
            doc, notes = await build_day(store, d, live, now)
            path = write_day(doc, folder)
            out["written"].append({"date": d.isoformat(), "mode": notes["mode"], "companies": len(doc["companies"]), "screens": len(doc["screens"]),
                                   "kb": path.stat().st_size // 1024})
            out["notes"][d.isoformat()] = notes
        except FileExistsError:
            out["skipped"].append({"date": d.isoformat(), "why": "already published"})
        except ValueError as exc:
            if live or d == todo["newest"]:
                log.error("scores export for %s refused by the checker: %s", d, exc)
                out["failed"].append({"date": d.isoformat(), "why": str(exc)[:500]})      # the day just finished: a real fault, the job reports it and is retried
            else:       # an earlier day the stored history cannot make honestly: recorded once, never written with guessed figures, not tried again
                log.warning("back-fill of %s not possible from stored history: %s", d, exc)
                folder.mkdir(parents=True, exist_ok=True)
                _mark_not_reconstructable(folder, d, str(exc))
                out["notReconstructable"] = out.get("notReconstructable", []) + [{"date": d.isoformat(), "why": str(exc)[:300]}]
    out["pruned"] = prune(folder)
    out["backfillLeft"] = max(0, len(todo["backfill"]) - max(0, backfill))
    out["files"] = len(dates(folder))
    out["seconds"] = round(_time.monotonic() - started, 1)
    return out
