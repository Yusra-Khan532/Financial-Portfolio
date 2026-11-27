"""Task #247: finlit_technicals.young, the ST/LT v14.3 scores of a short price history exactly as stlt.compute (the chart's port) gives them, in the
site backend's keys. Fractal Analytics (186 sessions) and Vedanta Aluminium Metal (107) showed "Not available" on FinLit while the same indicator on
TradingView showed their scores (long term -20.7 and -42.4, which this reproduces from the live candles)."""
import io
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from finlit_technicals import stlt as S
from finlit_technicals import young as Y

ROOT = Path(__file__).resolve().parents[1]                 # backend/: the folder holding finlit_technicals
SITE_ST = ["ema_stack", "price_ema20", "macd", "rsi", "obv", "rs_rating", "extension", "consolidation", "squeeze", "gap", "sector", "candles", "sfp",
           "leadership", "value_migration"]
SITE_LT = ["stage", "rs_rating", "leadership", "sector", "price_ema200", "volume_persistence", "sfp", "ema200_slope", "ema50_200", "weekly_rsi",
           "weekly_macd", "structure", "obv_trend", "ema100_200"]


def synth(n, seed, start="2026-02-16", p0=800.0):
    r = np.random.default_rng(seed)
    idx = pd.bdate_range(start, periods=n)
    c = p0 * np.exp(np.cumsum(r.normal(0.0004, 0.018, n)))
    o = c * np.exp(r.normal(0, 0.006, n))
    h = np.maximum(o, c) * np.exp(np.abs(r.normal(0, 0.008, n)))
    lo = np.minimum(o, c) * np.exp(-np.abs(r.normal(0, 0.008, n)))
    v = r.lognormal(13, 0.5, n)
    return pd.DataFrame({"open": o, "high": h, "low": lo, "close": c, "volume": v}, index=idx)


def rows(df, close_only=False):
    out = []
    for t, x in df.iterrows():
        row = {"date": t.date().isoformat(), "close": float(x["close"])}
        if not close_only:
            row.update(open=float(x["open"]), high=float(x["high"]), low=float(x["low"]), volume=float(x["volume"]))
        out.append(row)
    return out


def test_the_keys_cover_both_horizons_of_the_site_model():
    assert sorted(Y.ST_KEY) == sorted(S.ST_KEYS) and sorted(Y.ST_KEY.values()) == sorted(SITE_ST)
    assert sorted(Y.LT_KEY) == sorted(S.LT_KEYS) and sorted(Y.LT_KEY.values()) == sorted(SITE_LT)
    assert set(Y.BENCH) == {"Nifty 500", "Nifty 50", "Nifty Midcap 100", "Nifty Smallcap 100"}


def test_a_young_listing_gets_exactly_the_charts_scores_rows_and_divisors():
    for n in (60, 107, 186, 300):
        stock, index = synth(n, n), synth(800, 7, start="2023-09-01", p0=20000)
        got = Y.assess({"bars": rows(stock), "benchmarks": {"Nifty 500": rows(index, close_only=True)}, "sharesCr": 17.36})
        ref = S.compute(stock, {"NSE:CNX500": index[["close"]]}, shares=17.36e7)
        assert got["bars"] == n and math.isclose(got["stScore"], ref.st_score) and math.isclose(got["ltScore"], ref.lt_score)
        assert (got["stDivisor"], got["ltDivisor"]) == (96, 92) and got["stage"] == ref.stage
        for mine, theirs in zip(got["st"] + got["lt"], ref.st_rows + ref.lt_rows):
            assert mine["label"] == theirs.name and (mine["signal"] is None or math.isclose(mine["signal"], theirs.signal))
            assert "NaN" not in mine["reading"]
        json.dumps(got, allow_nan=False)                                       # what the site backend reads: no NaN anywhere


def test_it_runs_as_a_short_lived_process_and_reports_a_failure_as_json():
    stock = synth(107, 3)
    done = subprocess.run([sys.executable, "-m", "finlit_technicals.young"], input=json.dumps({"bars": rows(stock), "benchmarks": {}}),
                          capture_output=True, text=True, cwd=ROOT, check=False, timeout=60)
    out = json.loads(done.stdout)
    assert done.returncode == 0 and out["bars"] == 107 and isinstance(out["stScore"], float)
    bad = subprocess.run([sys.executable, "-m", "finlit_technicals.young"], input="{not json", capture_output=True, text=True, cwd=ROOT, check=False, timeout=60)
    assert bad.returncode == 1 and "error" in json.loads(bad.stdout)
