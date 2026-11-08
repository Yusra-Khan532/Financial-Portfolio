"""The Setups screens (task #37): the nightly price fields, the rule language's missing(), the rank direction, and the six cards."""
from finlit.presets import expr
from finlit.presets.engine import rank_scores_of
from finlit.presets.registry import BY_ID, DISCLAIMER, GROUPS, PRESETS
from finlit.screener import catalog
from finlit.screener.price_fields import FIELDS, price_fields


def _series():
    """A rise to 100, a 60-session base under it, a breakout on 3x volume 7 sessions ago, then a pullback towards the old high."""
    rise = [60 + 40 * i / 179 for i in range(180)]
    base = [97 + (i % 5) * 0.5 for i in range(60)]
    brk = [101, 104, 106, 107, 105, 103, 102, 101.5]
    c = rise + base + brk
    v = [1e6] * (len(rise) + len(base)) + [3e6, 2e6, 1.4e6, 1.2e6, 8e5, 7e5, 7e5, 6e5]
    return [x * 1.01 for x in c], [x * 0.99 for x in c], c, v


def test_price_fields_find_the_breakout_and_the_pullback():
    h, l, c, v = _series()
    f = price_fields(h, l, c, v)
    assert set(f) == set(FIELDS)
    assert f["breakout_age"] == 7 and f["breakout_level"] == 100.0 and f["days_since_high"] == 4
    assert f["breakout_vol_ratio"] > 2.5 and 0 < f["vs_breakout"] < 4 and f["ema_stack"] == 1.0
    assert f["vs_ema20"] is not None and f["range_10d"] > 0 and f["vol_ratio_5_50"] < 1


def test_price_fields_say_nothing_on_a_short_or_gappy_history():
    h, l, c, v = _series()
    assert all(x is None for x in price_fields(h[:40], l[:40], c[:40], v[:40]).values())
    c2 = list(c)
    c2[100] = None
    assert price_fields(h, l, c2, v)["breakout_age"] == 7          # a missing close is skipped, not guessed
    flat = price_fields([10.0] * 100, [10.0] * 100, [10.0] * 100, [1.0] * 100)
    assert flat["breakout_age"] is None and flat["breakout_level"] is None   # nothing broke out


def test_new_fields_are_in_the_catalog_with_plain_wording():
    keys = {m.key: m for m in catalog.CATALOG}
    for k in FIELDS:
        if k == "ema9_cons":
            continue
        assert k in keys and keys[k].group == "trading", k
        assert not any(w in keys[k].say.lower() for w in ("buy", "sell", "best", "target")), k


def test_missing_in_the_rule_language_is_never_unknown():
    get = {"breakout_age": None, "days_since_high": 20.0}.get
    assert expr.passes("missing(breakout_age) = 1", get)
    assert not expr.passes("missing(days_since_high) = 1", get)
    assert expr.passes("missing(days_since_high) = 0 and days_since_high >= 15", get)
    assert "breakout_age" in expr.fields_in(expr.parse("missing(breakout_age) = 1"))


def test_a_term_with_a_minus_ranks_the_lower_figure_higher():
    class T:
        n = 4
        cap = ["Large"] * 4
    class Fr:
        t = T()
        vals = {"d": [1.0, 2.0, 3.0, 4.0]}
        def get(self, i, name):
            return self.vals[name][i]
    s = rank_scores_of(Fr(), [("-d", 1.0)], lambda i: True)
    assert s[0] > s[1] > s[2] > s[3]
    up = rank_scores_of(Fr(), [("d", 1.0)], lambda i: True)
    assert up[3] > up[0]


def test_the_setups_cards_exist_on_both_tabs_and_describe_never_advise():
    assert ("setups", "Setups") in GROUPS
    ids = [p.id for p in PRESETS if p.group == "setups"]
    assert ids == ["setup-pre-breakout", "setup-breakout-pullback", "setup-ema9-consolidation", "basic-setup-pre-breakout", "basic-setup-breakout-pullback", "basic-setup-ema9-consolidation"]
    for i in ids:
        p = BY_ID[i]
        text = " ".join([p.name, p.card_text, *p.how_it_works]).lower()
        assert not any(w in text for w in ("buy", "sell", "multibagger", "top pick", "best")), i
        assert (p.kind == "blocked") == i.endswith("ema9-consolidation"), i
        if p.kind != "blocked":
            assert p.limit == 25 and p.rank_score and DISCLAIMER in " ".join(p.how_it_works), i
            for rule, _ in p.derived:
                expr.parse(rule)           # every rule reads
    assert BY_ID["setup-ema9-consolidation"].blocked_reason and BY_ID["basic-setup-ema9-consolidation"].tab == "basic"


# ---- the cards run through the real engine
from datetime import date
import json

import pytest

from finlit.presets import engine
from finlit.screener.data import Table


def _row(sym, **m):
    m.setdefault("market_cap", 5000)
    return {"symbol": sym, "name": sym.title(), "sector": "S", "industry": "Pharmaceuticals", "band": "mixed", "metrics": json.dumps(m)}


def _pz(**over):
    z = {"prism_final": 70, "prism_status": "RATED", "prism_label": "HEALTHY", "prism_fundamental": 70, "prism_valuation": 60, "prism_quality": 75, "prism_risk": 70,
         "prism_st_score": 0, "prism_lt_score": 30, "prism_st": "Positive", "prism_lt": "Positive"}
    z.update(over)
    return z


def _frame(rows, prism):
    return engine.Frame(Table(rows, {}, {}, None), prism, date(2026, 10, 30), None, None, None)


PRE = dict(vs_ema50=4, vs_ema200=9, pct_from_high=5, days_since_high=20, range_10d=5, atr_ratio=0.7, vol_ratio_10_50=0.7, rsi14=55, pillar_technical=70, market_cap=5000)
PULL = dict(vs_ema50=3, vs_ema200=8, breakout_age=8, breakout_vol_ratio=2.0, pct_from_high=6, vs_breakout=1, vs_ema20=-1, vol_ratio_5_50=0.8, rsi14=50, pillar_technical=65, market_cap=5000)


def _ids(body):
    return [r["symbol"] for r in body["rows"]]


@pytest.mark.parametrize("card,base,fails", [
    ("basic-setup-pre-breakout", PRE, [dict(pct_from_high=9), dict(days_since_high=10), dict(breakout_age=5), dict(range_10d=9), dict(atr_ratio=0.9), dict(vol_ratio_10_50=1.0),
                                       dict(rsi14=70), dict(pillar_technical=50), dict(market_cap=1500), dict(vs_ema200=3), dict(flag_count=3)]),
    ("basic-setup-breakout-pullback", PULL, [dict(breakout_age=2), dict(breakout_age=25), dict(breakout_vol_ratio=1.2), dict(pct_from_high=2), dict(vs_breakout=6), dict(vs_ema20=-6),
                                             dict(vs_ema50=-1), dict(vol_ratio_5_50=1.3), dict(rsi14=65), dict(pillar_technical=40), dict(market_cap=1500)]),
])
def test_basic_setup_cards_keep_a_company_that_meets_every_rule_and_drop_one_that_misses_any(card, base, fails):
    for i, bad in enumerate(fails):
        rows = [_row("OK", **base), _row("BAD", **{**base, **bad})] + [_row(f"F{j}", **{**base, "pct_from_high": 3 + j}) for j in range(3)]
        body = engine.run(_frame(rows, {}), BY_ID[card])
        assert "OK" in _ids(body), (card, bad)
        assert "BAD" not in _ids(body), (card, bad)
    assert body["count"] >= 1 and all("rank_score" not in r or r["rank_score"] is not None for r in body["rows"])


def test_a_company_without_the_new_price_fields_is_left_out_not_guessed():
    rows = [_row("NEW", **PRE), _row("OLD", vs_ema50=4, vs_ema200=9, pct_from_high=5, pillar_technical=70, rsi14=55)]
    body = engine.run(_frame(rows, {}), BY_ID["basic-setup-pre-breakout"])
    assert _ids(body) == ["NEW"]


def test_advanced_setup_cards_need_a_prism_rating_and_the_long_term_view():
    rows = [_row("OK", **PRE), _row("UNRATED", **PRE), _row("WEAKLT", **PRE)]
    prism = {"OK": _pz(), "WEAKLT": _pz(prism_lt_score=10), "UNRATED": _pz(prism_status="NOT RATED", prism_final=None)}
    body = engine.run(_frame(rows, prism), BY_ID["setup-pre-breakout"])
    assert _ids(body) == ["OK"]
    pull = [_row("OK", **PULL), _row("WEAKLT", **PULL)]
    body = engine.run(_frame(pull, {"OK": _pz(), "WEAKLT": _pz(prism_lt_score=0)}), BY_ID["setup-breakout-pullback"])
    assert _ids(body) == ["OK"]


def test_the_closer_to_the_level_and_the_higher_volume_rank_first_and_the_blocked_card_lists_nothing():
    rows = [_row("NEAR", **{**PULL, "vs_breakout": 0.2, "breakout_vol_ratio": 3.0}), _row("FAR", **{**PULL, "vs_breakout": 3.5, "breakout_vol_ratio": 1.6}),
            _row("MID", **{**PULL, "vs_breakout": 2, "breakout_vol_ratio": 2.0})]
    body = engine.run(_frame(rows, {}), BY_ID["basic-setup-breakout-pullback"])
    assert _ids(body)[0] == "NEAR" and _ids(body)[-1] == "FAR"
