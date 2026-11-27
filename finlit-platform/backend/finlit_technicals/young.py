"""The ST/LT v14.3 scores of a stock with a short price history, exactly as the indicator computes them on the chart (task #247).

WHY. The Prism technical view (site-api/backend/premium_technical.py) is a strict port: a horizon is withheld when any one signal is missing. A company
listed in the last two years (Fractal Analytics since 16 Feb 2026, the Vedanta demerged companies since 15 Jun 2026, every recent IPO) misses the
signals that read 200, 252 or 505 sessions, so it showed "Not available", while the same indicator on TradingView shows its scores: it seeds EMA 50
and the 50-day average volume from the bars there are (young-listing mode, `ipo_on`), reads a row that has no value yet as its formula does
(a comparison with no value is false, a percentile with no value scores -1) and keeps the full divisor (96 and 92). This module runs that very
calculation (stlt.compute, the port that matches the chart) and returns it in the site backend's keys.

HOW. The site backend runs it as a short-lived process (pandas and numpy are not loaded into the website), only for a history shorter than the
model's full window:
    python -m finlit_technicals.young  < {"bars": [{date, open, high, low, close, volume}], "benchmarks": {"Nifty 50": [bars], ...}, "sharesCr": 17.3}
    -> {"bars", "stScore", "ltScore", "stage", "gated", "benchmark", "st": [rows], "lt": [rows], "notes"}
Each row: {"key" (the site backend's), "label", "weight", "signal", "reading", "on"}.
"""
from __future__ import annotations

import json
import math
import sys
from typing import Any, Dict, List

# the site backend's benchmark names -> the indicator's TradingView symbols
BENCH = {"Nifty 500": "NSE:CNX500", "Nifty 50": "NSE:NIFTY", "Nifty Midcap 100": "NSE:CNXMIDCAP", "Nifty Smallcap 100": "NSE:CNXSMALLCAP"}
# the indicator's row keys -> the site backend's (premium_technical.ST / LT)
ST_KEY = {"ema_stack": "ema_stack", "price_vs_ema20": "price_ema20", "macd": "macd", "rsi": "rsi", "obv": "obv", "rs_rating_short": "rs_rating",
          "extension": "extension", "ema9_consolidation": "consolidation", "squeeze": "squeeze", "gap": "gap", "sector_rs": "sector",
          "price_action": "candles", "sfp": "sfp", "rs_leadership": "leadership", "value_area_migration": "value_migration"}
LT_KEY = {"price_vs_ema200": "price_ema200", "ema200_slope": "ema200_slope", "ema50_vs_ema200": "ema50_200", "ema100_vs_ema200": "ema100_200",
          "weekly_rsi": "weekly_rsi", "weekly_macd": "weekly_macd", "rs_rating_long": "rs_rating", "structure_52w": "structure",
          "obv_trend": "obv_trend", "stage": "stage", "sector_rs": "sector", "volume_persistence": "volume_persistence", "major_sfp": "sfp",
          "rs_leadership": "leadership"}


def _frame(bars: List[Dict[str, Any]]):
    import pandas as pd
    df = pd.DataFrame(bars)
    df.index = pd.to_datetime(df.pop("date"))
    return df[[k for k in ("open", "high", "low", "close", "volume") if k in df]].astype(float)   # an index may have closes only (stlt.clean)


def _num(x: Any) -> Any:
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else x


def assess(payload: Dict[str, Any]) -> Dict[str, Any]:
    from . import stlt as S
    df = _frame(payload["bars"])
    benches = {BENCH[name]: _frame(rows) for name, rows in (payload.get("benchmarks") or {}).items() if name in BENCH and rows}
    shares_cr = payload.get("sharesCr")
    shares = shares_cr * 1e7 if isinstance(shares_cr, (int, float)) and shares_cr > 0 else None
    res = S.compute(df, benches, symbol=str(payload.get("symbol") or ""), shares=shares)

    def rows(items, keys):
        return [{"key": keys[r.key], "label": r.name, "weight": r.weight if r.on else 0, "signal": _num(r.signal) if r.on else None,
                 "reading": r.reading.replace("NaN", "n/a"), "on": r.on} for r in items]
    return {"bars": res.bars, "stScore": _num(res.st_score), "ltScore": _num(res.lt_score), "stage": res.stage, "gated": res.gated,
            "uncappedLt": _num(res.lt_norm), "benchmark": res.bench_name, "st": rows(res.st_rows, ST_KEY), "lt": rows(res.lt_rows, LT_KEY),
            "stDivisor": res.st_div, "ltDivisor": res.lt_div, "notes": list(res.notes)}


def main() -> int:
    try:
        out = assess(json.load(sys.stdin))
    except Exception as exc:          # the caller falls back to the strict view; the reason goes to its log
        json.dump({"error": f"{type(exc).__name__}: {exc}"[:300]}, sys.stdout)
        return 1
    json.dump(out, sys.stdout, allow_nan=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
