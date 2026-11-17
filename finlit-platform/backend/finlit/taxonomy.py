"""NSE's four classification levels for every listed company (task #192, 15 Nov sector pack, TAXONOMY.md).

The site used "sector" for several different groupings (FinEdge's mixed `sector` field holds an NSE sector for some companies and a basic industry
for others; its `macro_sector` is sometimes an industry). This module gives each company the four NSE levels, each from NSE's own lists:

    Macro sector (12)  >  Sector (22)  >  Industry (59)  >  Basic industry (197)

The lists come from NSE Indices' Industry Classification Structure (data/nse_classification.json, built by scripts/build_nse_classification.py),
never typed by hand. A company is placed by the first rule that applies, and the rule is recorded with it:

1. `basic_industry`: its basic industry (FinEdge's `sub_industry`) is one of NSE's 197, so all four levels follow; when NSE's own quote page
   puts the company in a different industry, NSE's quote page wins (rule 2) and the basic industry is left out with the reason.
2. `nse_quote_page`: NSE's quote page names its industry (finlit_technicals/data/nse_industries.json, 29 Oct 2026); three levels follow.
3. `industry`: the industry FinEdge gives is one of NSE's 59; three levels follow.
4. `sector` / `macro_sector`: only a higher level is known (FinEdge's sector or macro sector field holds one of NSE's 22 or 12 names).
5. none: "Not classified", with the reason.

Every level left blank carries a note that says why. Names keep NSE's spelling with its commas; matching ignores case, spaces, commas and
"and" / "&", so the screener's and NSE's quote pages' spellings ("Oil Gas & Consumable Fuels") find the same name.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA = Path(__file__).resolve().parent / "data" / "nse_classification.json"
QUOTE_PAGES = Path(__file__).resolve().parents[1] / "finlit_technicals" / "data" / "nse_industries.json"
LEVELS = ("macro_sector", "sector", "industry", "basic_industry")
LABELS = {"macro_sector": "Macro sector", "sector": "Sector", "industry": "Industry", "basic_industry": "Basic industry"}
VERSION = 1   # bump when the rules or the lists change: every company is placed again at the next start


def key(name: Any) -> str:
    """One spelling for matching: lower case, "and" as "&", only letters, digits and "&"."""
    s = str(name or "").lower().replace(" and ", " & ")
    return re.sub(r"[^a-z0-9&]", "", s)


@lru_cache(maxsize=1)
def tree() -> dict:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    rows: List[dict] = data["basic_industries"]
    by: Dict[str, Dict[str, dict]] = {level: {} for level in LEVELS}
    for r in rows:
        by["basic_industry"][key(r["basic_industry"])] = r
        by["industry"].setdefault(key(r["industry"]), {k: r[k] for k in ("industry", "industry_code", "sector", "sector_code", "macro_sector", "macro_sector_code")})
        by["sector"].setdefault(key(r["sector"]), {k: r[k] for k in ("sector", "sector_code", "macro_sector", "macro_sector_code")})
        by["macro_sector"].setdefault(key(r["macro_sector"]), {k: r[k] for k in ("macro_sector", "macro_sector_code")})
    return {"source": data["source"], "edition": data["edition"], "rows": rows, "by": by}


@lru_cache(maxsize=1)
def quote_pages() -> Dict[str, str]:
    """symbol -> NSE industry, from NSE's quote pages (29 Oct 2026)."""
    try:
        stocks = json.loads(QUOTE_PAGES.read_text(encoding="utf-8")).get("stocks") or {}
    except (OSError, ValueError):
        return {}
    return {s.upper(): v[0] for s, v in stocks.items() if isinstance(v, list) and v and v[0]}


def _levels(entry: Optional[dict], down_to: str) -> Dict[str, Optional[str]]:
    out = {level: None for level in LEVELS}
    if entry:
        for level in LEVELS[: LEVELS.index(down_to) + 1]:
            out[level] = entry.get(level)
    return out


def classify(symbol: str, basic: Any = None, industry: Any = None, sector: Any = None, macro: Any = None) -> dict:
    """The four NSE levels of one company, from what FinEdge sends (`basic` = its sub_industry, and its industry, sector and macro sector
    fields, any of them possibly at the wrong level) and NSE's quote page. Returns the levels, the rule used (`source`) and, when a level is
    blank, a `note` saying why."""
    t = tree()["by"]
    sym = (symbol or "").upper()
    nse_industry = t["industry"].get(key(quote_pages().get(sym)))
    b = t["basic_industry"].get(key(basic))
    if b and (not nse_industry or key(b["industry"]) == key(nse_industry["industry"])):
        return {**_levels(b, "basic_industry"), "source": "basic_industry", "note": None}
    if nse_industry:
        why = (f"FinEdge's basic industry \"{basic}\" sits in {b['industry']}, but NSE's quote page puts the company in {nse_industry['industry']}"
               if b else f"\"{basic}\" is not one of NSE's 197 basic industries" if basic else "no basic industry is given for this company")
        return {**_levels(nse_industry, "industry"), "source": "nse_quote_page", "note": f"Basic industry not shown: {why}."}
    for raw in (industry, sector, basic):   # FinEdge's mixed fields: whichever holds one of NSE's 59 industries
        i = t["industry"].get(key(raw))
        if i:
            why = f"\"{basic}\" is not one of NSE's 197 basic industries" if basic and key(basic) != key(raw) else "no basic industry is given for this company"
            return {**_levels(i, "industry"), "source": "industry", "note": f"Basic industry not shown: {why}."}
    for raw in (sector, industry, macro):
        s = t["sector"].get(key(raw))
        if s:
            return {**_levels(s, "sector"), "source": "sector", "note": "Industry and basic industry not shown: only the sector is known for this company."}
    m = t["macro_sector"].get(key(macro))
    if m:
        return {**_levels(m, "macro_sector"), "source": "macro_sector", "note": "Only the macro sector is known for this company."}
    given = ", ".join(f'"{v}"' for v in (basic, industry, sector, macro) if v)
    why = f"its classification ({given}) is not one of NSE's names" if given else "no classification is given for this company"
    return {**_levels(None, "macro_sector"), "source": None, "note": f"Not classified: {why}."}


def levels_index() -> dict:
    """The four lists with their parents and NSE codes, for /api/taxonomy (counts are added from the database)."""
    t = tree()
    rows = t["rows"]
    uniq = lambda level, keys: list({r[level]: {k: r[k] for k in keys} for r in rows}.values())   # noqa: E731 - first seen order
    return {
        "source": t["source"], "edition": t["edition"],
        "macro_sectors": uniq("macro_sector", ("macro_sector", "macro_sector_code")),
        "sectors": uniq("sector", ("sector", "sector_code", "macro_sector")),
        "industries": uniq("industry", ("industry", "industry_code", "sector", "macro_sector")),
        "basic_industries": [{k: r[k] for k in ("basic_industry", "basic_industry_code", "industry", "sector", "macro_sector")} for r in rows],
        "labels": LABELS,
    }
