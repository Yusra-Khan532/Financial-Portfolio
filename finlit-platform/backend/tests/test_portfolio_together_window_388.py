"""Task #388 part B, item 6 (developer file 36): which window each "moving together" figure of the Equity portfolio page is worked out on.

The live page said "the past two years" in Data as of and in "Do your macro sectors move together?", but "From a year of weekly prices" under
"How independently they move" and "over the past year" in the "Which shares move as one?" i. This proves, on the code path the site runs
(inputs.run -> metrics.build_page, and the score endpoint's spread by value), that every one of those figures comes from ONE correlation matrix of the
same weekly returns: the last metrics.WEEKS (104) complete weeks, page["weeks"] / ["from"] / ["to"], each pair over the weeks both shares have
(a share needs metrics.MIN_WEEKS = 52). The page now says that one window everywhere (frontend shared/divFigs togetherWindow). Made-up prices only.
"""
from datetime import date, timedelta

import numpy as np
import pandas as pd

from finlit.portfolio_page import inputs, metrics as pm

END = date(2026, 11, 20)            # a Friday; the unfinished week is the next one
WEEK = "2026-W48"


def _days(n_weeks):
    start = END - timedelta(weeks=n_weeks) + timedelta(days=3)
    out, d = [], start
    while d <= END:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def _sample(seed=388):
    rng = np.random.default_rng(seed)
    days = _days(160)                                   # three years of daily closes
    market = rng.normal(0, 0.008, len(days))
    index_rows = [{"d": d.isoformat(), "c": float(c)} for d, c in zip(days, 20000 * np.cumprod(1 + market))]
    prices, meta = {}, {}
    sectors = ["Financial Services", "Financial Services", "Industrials", "Industrials", "Information Technology", "Healthcare", "Industrials", "Energy"]
    for k in range(8):
        r = 0.0002 + rng.uniform(0.3, 1.2) * market + rng.normal(0, 0.012, len(days))
        c = 100 * np.cumprod(1 + r)
        keep = len(days) if k < 6 else (70 * 5 if k == 6 else 30 * 5)   # S6 listed 70 weeks ago (counted), S7 30 weeks ago (too short)
        sym = f"S{k}"
        prices[sym] = {"t": [d.isoformat() for d in days[-keep:]], "c": [float(x) for x in c[-keep:]]}
        meta[sym] = {"name": f"Sample {k}", "sector": sectors[k], "size": "L", "mcap_cr": 1000.0 * (k + 1)}
    return prices, index_rows, meta


def test_every_moving_together_figure_comes_from_one_window():
    prices, index_rows, meta = _sample()
    page = inputs.run(prices, index_rows, meta, WEEK)
    frame, nifty = inputs.build_frame(prices, index_rows, list(meta), WEEK)
    r, _rn, short = pm.weekly_returns(frame, nifty)

    # the window: the last 104 complete weekly returns, to the last complete Friday
    assert pm.WEEKS == 104 and page["weeks"] == pm.WEEKS == len(r)
    assert page["to"] == str(r.index[-1].date()) == "2026-11-20"
    assert page["from"] == str(r.index[0].date()) == str((pd.Timestamp("2026-11-20") - pd.Timedelta(weeks=103)).date())
    assert short == ["S7"] and page["short_history"] == ["S7"]          # under a year: left out of every moving-together figure

    C = r.corr()                                                          # the one matrix
    order = page["order"]
    # Share by share (the grid) and the macro-sector grid built from it in the page (frontend heatOf reads page.corr)
    assert np.allclose(np.array(page["corr"]), C.loc[order, order].round(2).values)
    # Each share against the rest / Moves with rest
    for s in order:
        assert page["avg_with_rest"][s] == round(float((C.loc[s].sum() - 1) / (len(order) - 1)), 2)
    # How independently they move (effective stocks -> the co-movement part of the score)
    assert page["score"]["effective_stocks"] == round(pm.effective_stocks(C.values), 1)
    # Which shares move as one? (groups) and the same-sector / cross-sector figures
    assert page["groups"] == pm.groups_and_order(C)[1]
    sector = {s: meta[s]["sector"] for s in meta}
    assert page["segments"] == pm.pair_segments(C, sector) and page["within"] == pm.sector_within(C, sector)

    # a share listed 70 weeks ago is counted, over the weeks it has (pairwise): the same matrix, its own weeks inside the window
    assert "S6" in order and r["S6"].notna().sum() < pm.WEEKS
    assert abs(C.loc["S6", "S0"] - r[["S6", "S0"]].dropna().corr().iloc[0, 1]) < 1e-12


def test_the_score_endpoints_spread_by_value_reads_the_same_window():
    """The Spread card's "by what you own now" figure (api._score_compute -> metrics.spread_by_value) runs on weekly_returns of the same frame: same weeks."""
    prices, index_rows, meta = _sample()
    frame, nifty = inputs.build_frame(prices, index_rows, list(meta), WEEK)
    r, _rn, _ = pm.weekly_returns(frame, nifty)
    page = inputs.run(prices, index_rows, meta, WEEK)
    assert len(r) == page["weeks"] and str(r.index[0].date()) == page["from"]
    w = {s: 1 / len(meta) for s in meta}
    by_value = pm.spread_by_value(r, {s: meta[s]["sector"] for s in meta}, w)
    # equal amounts by value give back the page's own figure: one window, one matrix
    assert by_value["effective_stocks"] == page["score"]["effective_stocks"]
