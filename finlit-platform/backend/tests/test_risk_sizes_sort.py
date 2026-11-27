"""Equity portfolio, Risk analytics: shares whose weeks differ (a suspension, a later listing) are lined up in date order on purpose.

`risk_sizes` joins each share's weekly returns and each index's into one table with `pd.concat(..., axis=1)`. When the dates differ, pandas 3 still sorts
the joined dates by default but warns (Pandas4Warning) that it will stop; without the sort, a date only one share has goes to the END of the table, so
the list's compounded level, its worst fall and its span in years are worked out on weeks out of order. Every join now asks for `sort=True`.
"""
import warnings

import numpy as np
import pandas as pd
import pytest
from pandas.errors import Pandas4Warning

from finlit.portfolio_page import risk_sizes as rs

FRIDAYS = pd.date_range("2023-11-03", periods=160, freq="W-FRI")
rng = np.random.default_rng(7)
NIFTY = rng.normal(0.002, 0.02, len(FRIDAYS) - 1)
MID = rng.normal(0.003, 0.03, len(FRIDAYS) - 1)


def path(rets, start=100.0):
    return [start] + list(start * np.cumprod(1 + np.asarray(rets)))


def series(closes, dates=FRIDAYS):
    return {"t": [d.date().isoformat() for d in dates[: len(closes)]], "c": list(closes)}


IDX = {code: [{"d": d.date().isoformat(), "c": c} for d, c in zip(FRIDAYS, path(r))] for code, r in (("NIF50", NIFTY), ("NIFMID150", MID))}
GAP = [40, 41, 120]     # BIG was suspended for these Fridays; MIDCO traded on them


def prices():
    big = path(1.5 * NIFTY)
    keep = [i for i in range(len(FRIDAYS)) if i not in GAP]
    return {"BIG": series([big[i] for i in keep], FRIDAYS[keep]), "MIDCO": series(path(0.8 * MID))}


def test_shares_with_different_weeks_join_in_date_order_with_no_pandas_warning():
    with warnings.catch_warnings():
        warnings.simplefilter("error", Pandas4Warning)       # the join must not lean on pandas' deprecated default
        out = rs.build(prices(), IDX, {"BIG": "Large", "MIDCO": "Mid"}, {})
    assert out["counted"] == 2
    g = out["glance"]["list"]
    # hand calculation: both shares' Friday returns joined in date order, equal amounts, the last 3 years up to the last Friday
    end = FRIDAYS[-1]
    wk = {s: rs.fridays(rs.daily(p["t"], p["c"])).pct_change() for s, p in prices().items()}
    dr = pd.concat(wk, axis=1, sort=True)
    dr = dr[(dr.index > end - pd.Timedelta(days=rs.DAYS_3Y)) & (dr.index <= end)].mean(axis=1, skipna=True).dropna()
    assert dr.index.is_monotonic_increasing
    lvl = (1 + dr).cumprod()
    assert g["worstFall"] == round(float((lvl / lvl.cummax() - 1).min() * 100), 1)
    assert g["years"] == round((dr.index[-1] - dr.index[0]).days / 365.25, 1)
    assert g["years"] >= 2.9                                  # the whole 3 years, not the span from a gap week at the end to the last Friday


def test_beta_and_capture_ignore_weeks_only_one_side_has():
    y = pd.Series([0.01, 0.02, -0.01, 0.03], index=pd.to_datetime(["2024-01-05", "2024-01-12", "2024-01-26", "2024-02-02"]))
    x = pd.Series([0.02, -0.01, 0.01, 0.02], index=pd.to_datetime(["2024-01-12", "2024-01-19", "2024-01-26", "2024-02-02"]))
    with warnings.catch_warnings():
        warnings.simplefilter("error", Pandas4Warning)
        beta, _ = rs.ols_beta(y, x)
        dn, up = rs.capture(y, x)
    assert beta is None                                        # three shared weeks are too few for a beta
    # the weeks both have: 12 Jan (.02, .02), 26 Jan (-.01, .01), 2 Feb (.03, .02); x has no down week among them
    assert dn is None and up == pytest.approx((0.02 - 0.01 + 0.03) / (0.02 + 0.01 + 0.02) * 100)
