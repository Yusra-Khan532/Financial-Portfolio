"""Discover (task #251, the 19 Nov Discover pack): everything the /discovery page draws in one public read, GET /api/discovery/board.

One compact row per placed company (its main theme, the other themes it mentions, the stage, the tone, 90 days of exchange filings by event, its NSE
classification and the Sector Pulse / Sector Rotation group it belongs to), each theme's counts and checks, and the latest filings per theme and per
event (titles cleaned). The page joins it with FinLit's own readings it already reads (the screener universe, Sector Rotation, Sector Pulse), so each
plan keeps seeing exactly what its plan shows elsewhere. A company's quotes and keywords come from GET /api/discovery?symbol= when its row is opened.

Display rules of the pack (README "What a user runs into today", rows 7 and 13): "Renewable Power" is shown inside "Renewable Energy & Power"; the two
broad groups (placed by general words such as orders and capacity, not a technology) come last and are named in plain words; filing titles lose the
exchange's boilerplate ("a press release dated ..., titled", "1. To consider ..."). The stored classification is unchanged: this is how it is shown.
Describes what companies say and file; never a pick."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from . import keywords as K
from . import signals as S

log = logging.getLogger("finlit.discovery.board")

MERGE = {"Renewable Power": "Renewable Energy & Power"}
BROAD = ("Corporate Catalysts & Growth Signals", "Industrial Manufacturing & Capex")
DISPLAY = {"Corporate Catalysts & Growth Signals": "Corporate developments", "Industrial Manufacturing & Capex": "Industrial manufacturing & capex"}
SHORT = {"Industrial Manufacturing & Capex": "Manufacturing", "Corporate Catalysts & Growth Signals": "Corporate", "EV & Automotive Technology": "EV & auto",
         "Renewable Energy & Power": "Renewables", "Healthcare & Life Sciences": "Healthcare", "Solar Technology": "Solar", "Battery & Energy Storage": "Batteries",
         "Mobile & Electronics Manufacturing": "Electronics", "Financial Services & Trading": "Finance & trading", "Defence & Aerospace": "Defence"}
# The events of "What changed" (signals.py sorts every filing into one): the business ones first, as the pack lists them.
EVENTS = ("order", "capacity", "partnership", "mna", "fundraise", "rating", "management", "legal")
NEWS_DAYS = 90
FILINGS_PER_THEME = 8
FILINGS_PER_EVENT = 8
QUOTES = 2

_PRESS = re.compile(r"^a press release dated [^,]+, \d{4}, titled\s*[\"“']?", re.I)
_LEAD = re.compile(r"^[\s\-–—·:'\"]+")
_NUMBERED = re.compile(r"^\d+[.)]\s+")
_TRAIL = re.compile(r"\s*['\"’”]\s*\.?\s*$")


def theme_of(name: Optional[str]) -> Optional[str]:
    """The theme a stored bucket is shown under (Renewable Power inside Renewable Energy & Power)."""
    return MERGE.get(name or "", name) if name else name


def clean_title(t: Optional[str], cut: int = 78) -> str:
    """A filing title as a reader would write it: no "a press release dated ..., titled" prefix, no list numbering, no stray quote at the end; a title the
    exchange cut short ends with an ellipsis; the first letter is a capital."""
    raw = str(t or "").strip()
    s = _PRESS.sub("", raw)
    s = _LEAD.sub("", s)
    s = _NUMBERED.sub("", s)
    s = _TRAIL.sub("", s).strip()
    # the exchange cuts long subjects at a fixed length: a title that long with no closing mark was cut, wherever its prefix was
    if s and len(raw) >= cut and not re.search(r"[.!?)…\"'”’]$", raw) and not re.search(r"[.!?)…]$", s):
        s += "…"
    return s[:1].upper() + s[1:]


def _list(v: Any) -> List[Any]:
    if isinstance(v, list):
        return v
    if isinstance(v, str) and v:
        try:
            out = json.loads(v)
            return out if isinstance(out, list) else []
        except ValueError:
            return []
    return []


def group_slugs(symbols: List[str]) -> Dict[str, str]:
    """symbol -> the Sector Pulse / Sector Rotation group slug, by the same rule as GET /api/sectors/membership (the NSE industry, else the NSE sector).
    Empty when no sector data set is live (the page then shows "No reading" with the reason)."""
    try:
        from .. import sector_api, sector_data as sd
        rel = sd.live_release()
        board = sd.read_json(rel / "sectors" / "_board.json") if rel else None
        if not board:
            return {}
        by_ind: Dict[str, str] = {}
        by_sec: Dict[str, str] = {}
        for r in board.get("rows", []):
            if not isinstance(r, dict) or not r.get("slug"):
                continue
            if r.get("kind") == "sector":
                by_sec[str(r.get("name") or "")] = r["slug"]
            for ind in r.get("industries") or []:
                by_ind[str(ind)] = r["slug"]
        cls = sector_api._nse_classes()
        out: Dict[str, str] = {}
        for sym in symbols:
            hit = cls.get(sym)
            if not hit:
                continue
            ind, sec = hit
            slug = by_ind.get(ind) or (by_sec.get(sec) if sec else None)
            if slug:
                out[sym] = slug
        return out
    except Exception:      # a sector data set that cannot be read must not take Discover down; the group column says "No reading"
        log.warning("sector groups not read for Discover", exc_info=True)
        return {}


def _signal(r: Dict[str, Any], names: Dict[str, str]) -> Dict[str, Any]:
    return {"s": r["symbol"], "n": names.get(r["symbol"]) or r["symbol"], "d": r["item_date"].isoformat(), "e": r["event"],
            "el": S.EVENT_LABEL.get(r["event"], "Other filing"), "t": clean_title(r["title"]), "l": r["link"]}


async def board(store) -> Dict[str, Any]:
    async with store.pool.acquire() as conn:
        rows = [dict(r) for r in await conn.fetch(
            "SELECT symbol, company, primary_bucket, secondary, stage, tone, status, doc_date, pages, scores FROM discovery_companies "
            "WHERE primary_bucket IS NOT NULL ORDER BY symbol")]
        stat = {r["status"]: r["n"] for r in await conn.fetch("SELECT status, count(*) AS n FROM discovery_companies GROUP BY status")}
        last = await conn.fetchval("SELECT max(read_at) FROM discovery_companies")
        syms = [r["symbol"] for r in rows]
        sec = {r["symbol"]: dict(r) for r in await conn.fetch(
            "SELECT symbol, macro_sector, sector, industry FROM company_classification WHERE symbol = ANY($1::text[])", syms)}
        ev = {r["symbol"]: (r["n"], dict(zip(r["ev"], r["evn"]))) for r in await conn.fetch(
            "SELECT symbol, sum(n)::int AS n, array_agg(event) AS ev, array_agg(n) AS evn FROM ("
            "  SELECT symbol, event, count(*)::int AS n FROM discovery_signals WHERE symbol = ANY($1::text[]) AND item_date >= current_date - $2::int"
            "  GROUP BY symbol, event) x GROUP BY symbol", syms, NEWS_DAYS)}
        theme_news = {r["t"]: (r["n"], r["pos"], r["neg"]) for r in await conn.fetch(
            "SELECT t, count(*)::int AS n, count(*) FILTER (WHERE tone > 0)::int AS pos, count(*) FILTER (WHERE tone < 0)::int AS neg "
            "FROM discovery_signals, unnest(themes) AS t WHERE item_date >= current_date - $1::int GROUP BY t", NEWS_DAYS)}
        recent = [dict(r) for r in await conn.fetch(
            "SELECT symbol, item_date, event, title, link, themes FROM discovery_signals WHERE item_date >= current_date - $1::int "
            "ORDER BY item_date DESC, feed_id DESC LIMIT 4000", NEWS_DAYS)]
    names = {r["symbol"]: (r["company"] or r["symbol"]) for r in rows}
    groups = group_slugs(syms)

    out_rows: List[Dict[str, Any]] = []
    for r in rows:
        c = sec.get(r["symbol"]) or {}
        scores = r["scores"] if isinstance(r["scores"], dict) else (json.loads(r["scores"]) if r["scores"] else {})
        top = scores.get(r["primary_bucket"]) or {}
        st = (top.get("stage") or {}).get("label") or K.STAGE_LABEL.get(r.get("stage") or "", "Not stated")
        main = theme_of(r["primary_bucket"])
        also = [t for t in dict.fromkeys(theme_of(x) for x in _list(r["secondary"])) if t and t != main]
        n, events = ev.get(r["symbol"], (0, {}))
        out_rows.append({"s": r["symbol"], "n": names[r["symbol"]], "th": main, "sec": also, "st": st,
                         "tone": round(float(r["tone"]), 2) if r["tone"] is not None else None, "fc": n or 0,
                         "ev": {k: v for k, v in events.items() if k in EVENTS}, "mac": c.get("macro_sector"), "ind": c.get("industry"),
                         "dd": r["doc_date"].isoformat() if r["doc_date"] else None, "pg": r["pages"], "grp": groups.get(r["symbol"])})

    # themes: the stored buckets, merged as shown; counts from the rows, so a merged theme adds up
    themes: Dict[str, Dict[str, Any]] = {}
    for name in K.BUCKETS:
        t = theme_of(name)
        o = themes.setdefault(t, {"name": t, "label": DISPLAY.get(t, t), "short": SHORT.get(t, DISPLAY.get(t, t)), "broad": t in BROAD,
                                  "n": 0, "also": 0, "news": {"filings": 0, "positive": 0, "negative": 0}, "verify": [], "merged": []})
        if name != t:
            o["merged"].append(name)
        f, p, ng = theme_news.get(name, (0, 0, 0))
        o["news"]["filings"] += f
        o["news"]["positive"] += p
        o["news"]["negative"] += ng
        if not o["verify"]:
            o["verify"] = [v for v in (_directory_verify().get(name) or [])][:6]
    for r in out_rows:
        themes[r["th"]]["n"] += 1
        for t in r["sec"]:
            if t in themes:
                themes[t]["also"] += 1

    tfil: Dict[str, List[Dict[str, Any]]] = {}
    efil: Dict[str, List[Dict[str, Any]]] = {}
    seen = set()
    latest: Dict[str, Dict[str, Any]] = {}
    for x in recent:
        key = (x["symbol"], x["item_date"], x["title"])
        if key in seen:
            continue
        seen.add(key)
        sig = _signal(x, names)
        if x["symbol"] in names and x["event"] in EVENTS and x["symbol"] not in latest:
            latest[x["symbol"]] = sig
        for t in dict.fromkeys(theme_of(t) for t in (x["themes"] or [])):
            if t in themes and len(tfil.setdefault(t, [])) < FILINGS_PER_THEME:
                tfil[t].append(sig)
        if x["event"] in EVENTS and len(efil.setdefault(x["event"], [])) < FILINGS_PER_EVENT:
            efil[x["event"]].append(sig)
    for r in out_rows:
        if r["s"] in latest:
            r["lf"] = {k: latest[r["s"]][k] for k in ("d", "el", "t")}

    return {"updated": last.isoformat() if last else None, "companies": len(out_rows), "read": sum(stat.values()), "days": NEWS_DAYS,
            "rows": out_rows, "themes": list(themes.values()), "tfil": tfil, "efil": efil, "events": list(EVENTS), "eventsTracked": sorted(set(S.EVENT_LABEL) & set(EVENTS)),
            "caution": K.CAUTION, "method": _method()}


def _method() -> str:
    from .service import METHOD
    return METHOD


_VERIFY: Dict[str, List[str]] = {}


def _directory_verify() -> Dict[str, List[str]]:
    if not _VERIFY:
        from .service import DIRECTORY_VERIFY
        _VERIFY.update(DIRECTORY_VERIFY)
    return _VERIFY
