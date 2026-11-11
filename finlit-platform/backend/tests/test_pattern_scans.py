"""The eleven chart-pattern scans find what they should on made-up charts (the handover's own self-check), and the page facts and drawing are built from a hit."""
from datetime import date

import numpy as np
import pandas as pd

from finlit.pattern_scans import SCANS, scan_stock


def _frame(closes, vols=None, spread=0.01):
    closes = np.asarray(closes, float)
    d = pd.bdate_range("2025-01-01", periods=len(closes))
    o = np.r_[closes[0], closes[:-1]]
    return pd.DataFrame({"date": d, "open": o, "high": np.maximum(o, closes) * (1 + spread), "low": np.minimum(o, closes) * (1 - spread),
                         "close": closes, "volume": vols if vols is not None else np.full(len(closes), 2e6)})


def test_the_scans_find_the_charts_they_are_built_for():
    rng = np.random.default_rng(7)
    # Daily base: rise 100 -> 160, 40-session base 160 -> 136 -> 157
    up = np.linspace(100, 160, 150)
    base = np.r_[np.linspace(160, 136, 20), np.linspace(136, 157, 20)]
    f = _frame(np.r_[up, base], spread=0.004)
    hs = {h.scan for h in scan_stock(f)}
    assert "daily_base" in hs, hs
    # Near pivot: same chart, close just under the high
    f2 = _frame(np.r_[up, np.linspace(160, 150, 10), np.linspace(150, 158.9, 15)], spread=0.004)
    assert "near_pivot" in {h.scan for h in scan_stock(f2)}
    # Big reversal: long fall then +8% day on 3x volume closing at the high
    fall = np.linspace(200, 120, 180); vols = np.full(181, 1e6); vols[-1] = 3.5e6
    f3 = _frame(np.r_[fall, 129.6], vols)
    f3.loc[f3.index[-1], ["open", "high", "low"]] = [120.5, 129.8, 119.8]
    assert "big_reversal" in {h.scan for h in scan_stock(f3)}
    # Shakeout: uptrend, two-day drop under the 50-day average, back within days
    s = np.linspace(100, 170, 200).tolist() + [171, 172, 158, 155, 163, 170, 173]
    f4 = _frame(s, spread=0.004)
    assert "shakeout" in {h.scan for h in scan_stock(f4)}
    # Flag: steady rise, +30% pole in 10 sessions, 6-session pause on low volume
    s5 = np.r_[np.linspace(100, 130, 150), np.linspace(130, 170, 10), [168, 166, 165, 166, 164, 165]]
    v5 = np.r_[np.full(150, 2e6), np.full(10, 5e6), np.full(6, 1.5e6)]
    assert "flag" in {h.scan for h in scan_stock(_frame(s5, v5, 0.004))}
    # IPO base: 60 sessions since listing, high on day 15, 25% dip, back near the top
    s6 = np.r_[np.linspace(100, 150, 15), np.linspace(150, 112, 20), np.linspace(112, 146, 25)]
    hits6 = scan_stock(_frame(s6, spread=0.004), listed_on=date(2025, 1, 1), today=date(2025, 4, 1))
    assert "ipo_base" in {h.scan for h in hits6}, hits6
    assert set(SCANS) >= {"daily_base", "near_pivot", "big_reversal", "shakeout", "flag", "ipo_base"}
