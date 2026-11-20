"""Task #276 (the ETF portfolio pack of 20 Nov 2026), the number fixes behind the page (reference/live-number-fixes.md):

2. SILVERBEES' silver was read as cash (its file lists the silver as one row, "Nippon India Silver ETF", under the cash heading): What your money is in
   showed "Overnight lending and debt 26%" and no silver.
3. The list swing (25.3%) was above every ETF mix of its parts: the list line ran only over the days every ETF had a price, so SMALL250 (listed Nov
   2025) cut it to its last year while each ETF's swing covered three. It is built from returns, re-weighted, and checked against the weighted average.
4/5. One beta with its window, and every index figure with its window; the 3-year daily list beta is renamed so no page reads it as the page's beta."""

import logging
import random

from finlit.disclosure_parsers.model import metal_class
from finlit.etfportfolio import calc
from finlit.mfportfolio import risk

D0 = 738000


# ------------------------------------------------------------------------------------------------ fix 2
def test_a_bullion_row_under_a_cash_heading_is_the_metal_not_cash():
    assert metal_class("Nippon India Silver ETF", "INF204KC1402", "cash") == "other"       # SILVERBEES' own row, as the file lists it
    assert metal_class("GOLD 995 1KG BAR", None, "cash") == "other"
    assert metal_class("Triparty Repo", None, "cash") == "cash"                             # real cash stays cash
    assert metal_class("Muthoot Gold Loans NCD", "INE414G07EK3", "cash") == "cash"          # an Indian company's paper is not bullion
    assert metal_class("Hindustan Zinc (silver)", "INE267A01025", "equity") == "equity"       # only cash-classed rows move


def test_the_etf_mix_shows_silver_as_silver_with_the_guard_for_files_read_before_the_fix(caplog):
    etfs = [{"symbol": "GOLDBEES", "w": .25, "assetClass": "gold", "split": {"equity": 0, "debt": 0, "cash": 1.75, "other": 98.25}},
            {"symbol": "SILVERBEES", "w": .25, "assetClass": "silver", "split": {"equity": 0, "debt": 0, "cash": 100, "other": 0}},   # as stored on 20 Nov
            {"symbol": "MID150BEES", "w": .25, "assetClass": "equity", "split": {"equity": 99.6, "debt": 0, "cash": .4, "other": 0}},
            {"symbol": "SMALL250", "w": .25, "assetClass": "equity", "split": {"equity": 100, "debt": 0, "cash": 0, "other": 0}}]
    with caplog.at_level(logging.WARNING):
        m = calc.asset_mix(etfs)
    sh = {k: round(v * 100, 1) for k, v in m["shares"].items()}
    assert sh == {"indian": 49.9, "abroad": 0.0, "gold": 24.6, "silver": 25.0, "debt": 0.5}          # the pack's "after": Indian 50, gold 24.6, silver 25, debt < 1
    assert "metal ETF read without its metal" in caplog.text                                         # the guard (task #277 merged the same rule)
    etfs[1]["split"] = {"equity": 0, "debt": 0, "cash": 0, "other": 100}                              # read with the rule: no fallback needed
    assert round(calc.asset_mix(etfs)["shares"]["silver"] * 100, 1) == 25.0


# ------------------------------------------------------------------------------------------------ fix 3
def _walk(n, sd, seed, start=0):
    rnd = random.Random(seed)
    v, out = 100.0, []
    for _ in range(n):
        v *= 1 + rnd.gauss(0, sd)
        out.append(v)
    return list(range(D0 + start, D0 + start + n)), out


def test_a_young_etf_no_longer_cuts_the_list_to_its_own_short_history():
    a = _walk(750, 0.010, 1)               # three years
    b = _walk(750, 0.025, 2)               # three years, a bumpy metal
    c = _walk(250, 0.012, 3, start=500)    # listed a year ago
    end = D0 + 749
    d, v = risk.list_series([(*a, 1.0), (*b, 1.0), (*c, 1.0)], end)
    assert d[0] < D0 + 10 and len(d) >= 740                       # the full three years, not the young ETF's last year
    swings = [risk.swing(risk.returns(x[1]), risk.per_year(x[0])) for x in (a, b, c)]
    ls = risk.swing(risk.returns(v), risk.per_year(d))
    assert ls <= sum(swings) / 3                                   # a mix never swings more than the average of its parts
    assert risk.list_swing_ok(ls, [(s, 1.0) for s in swings])


def test_a_list_swing_above_its_parts_is_logged(caplog):
    with caplog.at_level(logging.ERROR):
        assert not risk.list_swing_ok(25.3, [(21.8, 1), (38.6, 1), (16.4, 1), (18.4, 1)], "ETF list")     # the live page's numbers (average 23.8)
    assert "ETF list swing 25.3 is above the weighted average of its parts 23.8" in caplog.text
    assert risk.list_swing_ok(17.0, [(21.8, 1), (38.6, 1), (16.4, 1), (18.4, 1)]) and risk.list_swing_ok(None, [])
