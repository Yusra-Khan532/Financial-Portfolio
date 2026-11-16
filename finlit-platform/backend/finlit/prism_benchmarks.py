"""FinLit's own industry valuation medians for the FinLit Prism report (task #160).

The Prism model (site-api) compares a company's P/E and P/B with its industry. It takes the benchmark from FinEdge first, then Upstox, then a median
over FinEdge's industry peer list. For many companies (NBFCs among them) all three come back empty, and the report showed "P/E vs industry: Not
available". The research API already holds every listed company's P/E and P/B with its industry in the screener table, so it sends the median of
the company's own industry with each report request. The model uses it ONLY when the providers gave nothing, and the report names it as FinLit's.

Rules (accuracy first, never guess):
  * the narrowest group with at least MIN_COUNT other companies that have a positive multiple: industry, then the company's sector label, then
    the broad sector;
  * the company itself is left out of its own benchmark;
  * zero, negative and missing multiples are left out (a loss-maker has no meaningful P/E);
  * no group with enough companies: nothing is sent, and the report keeps saying why the comparison is not available.
"""
from __future__ import annotations

import asyncio
import logging
import statistics
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("finlit.prism")

MIN_COUNT = 5
TABLE_SECONDS = 8.0
KEYS = ("pe", "pb")
_loading: Optional["asyncio.Future[Any]"] = None


def _positive(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and 0 < f < 10_000 else None


def industry_benchmarks(table: Any, symbol: str) -> List[Dict[str, Any]]:
    """The medians for `symbol` from a screener Table, in the shape site-api's `sectorBenchmarks` expects."""
    sym = (symbol or "").upper()
    i = getattr(table, "pos", {}).get(sym)
    if i is None:
        return []
    asof = datetime.fromtimestamp(getattr(table, "loaded", 0) or 0, timezone.utc).date().isoformat()
    levels = (("industry", table.industry), ("sector", table.sector_label), ("sector", table.sector))
    out: List[Dict[str, Any]] = []
    for key in KEYS:
        col = table.cols.get(key)
        if col is None:
            continue
        for scope, groups in levels:
            name = groups[i] if i < len(groups) else None
            if not name:
                continue
            vals = [v for j, g in enumerate(groups) if g == name and j != i and (v := _positive(col[j])) is not None]
            if len(vals) >= MIN_COUNT:
                out.append({"key": key, "value": round(statistics.median(vals), 4), "count": len(vals), "scope": scope, "group": str(name), "asOf": asof})
                break
    return out


async def for_report(store: Any, symbol: str) -> List[Dict[str, Any]]:
    """Never stops or slows a calculation for long: any failure or a slow table just means nothing extra is sent."""
    try:
        from .screener.data import get_table
        global _loading
        if _loading is None or _loading.done():
            _loading = asyncio.ensure_future(get_table(store))
        # shield: a slow first load keeps going in the background (the next report finds the table ready) instead of being cancelled
        table = await asyncio.wait_for(asyncio.shield(_loading), TABLE_SECONDS)
        return industry_benchmarks(table, symbol)
    except Exception as exc:
        log.warning("prism industry medians for %s not sent: %s", symbol, type(exc).__name__)
        return []
