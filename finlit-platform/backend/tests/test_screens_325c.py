"""Task #325 C (developer file 25, 2.1, 2.2, 4c and 6): the fixes to the ready-made screens."""
import asyncio
from datetime import date
from types import SimpleNamespace

from finlit.presets import api, history, theme_map
from finlit.presets.registry import BY_ID, PRESETS

EMPTY_BEFORE = ["rating-upgrades", "momentum-leaders", "at-52-week-high", "both-views-positive", "strongsafe", "fairvalue", "weakvalue", "bothtech",
                "setup-pre-breakout", "setup-breakout-pullback", "setup-ema9-consolidation", "gainers-day", "gainers-week", "gainers-month", "low-volatility", "higher-risk-list"]


def test_no_live_screen_opens_an_empty_how_this_screen_works():
    for k in EMPTY_BEFORE:
        assert len(BY_ID[k].how_it_works) >= 2, k
    live = [p for p in PRESETS if p.status == "live" and p.kind != "pattern"]      # the pattern screens get engine 2's words in part B (its own test)
    assert all(p.how_it_works for p in live), [p.id for p in live if not p.how_it_works]


def test_renames_and_wording():
    assert BY_ID["fairvalue"].name == "Growth at a reasonable valuation" and BY_ID["weakvalue"].name == "Growth with a stretched valuation"
    assert BY_ID["both-views-positive"].name == "Uptrend on both views: large and mid caps"
    assert "heaper" not in BY_ID["value-with-quality"].card_text + " ".join(BY_ID["value-with-quality"].how_it_works)
    for k in ("highest-rated-large", "highest-rated-mid", "highest-rated-small"):
        assert "of ₹1,000 Cr or more" not in BY_ID[k].card_text + " ".join(BY_ID[k].how_it_works), k
    assert "of ₹1,000 Cr or more" in BY_ID["highest-rated-micro"].how_it_works[0]     # the micro caps' lower limit is not noise


def test_the_13_emerging_tech_tags():
    new = ["TONBO", "SIGMAADV", "KMEW", "CENTUM", "VINYAS", "EPACK", "BBOX", "EXIDEIND", "TMPV", "UNOMINDA", "EMMVEE", "BORORENEW", "WAAREERTL"]
    tags = theme_map.tags_for(new, [None] * len(new))
    assert set(tags) == set(new)
    assert tags["BBOX"] == ["Data centres, cloud and telecom tech"] and tags["EXIDEIND"] == ["EV and batteries"] and tags["EMMVEE"] == ["Clean-energy manufacturing"]


def test_consolidating_above_the_9_day_average_needs_a_long_term_view_that_is_not_a_downtrend():
    assert any("prism_lt_score > -20" in r[0] for r in BY_ID["setup-ema9-consolidation"].derived)


class _Conn:
    def __init__(self, rows): self.rows = rows
    async def fetch(self, q, *a): return self.rows
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False


def _store(rows):
    return SimpleNamespace(pool=SimpleNamespace(acquire=lambda: _Conn(rows)))


def test_cards_count_joined_from_the_saved_lists_and_say_rules_updated_on_a_rule_day(monkeypatch):
    async def base(store): return date(2026, 11, 11)
    monkeypatch.setattr(history, "baseline_session", base)
    d1, d2 = date(2026, 11, 19), date(2026, 11, 20)
    r = lambda pid, s, rn, reg, sym: {"preset_id": pid, "chips": "", "session": s, "rn": rn, "reg": reg, "symbol": sym}   # noqa: E731
    rows = [r("a", d2, 1, "v1", "X"), r("a", d2, 1, "v1", "Y"), r("a", d2, 1, "v1", "Z"), r("a", d1, 2, "v1", "X"),      # joined Y, Z
            r("b", d2, 1, "v2", "X"), r("b", d1, 2, "v1", "Q"),                                                             # rules changed
            r("c", date(2026, 11, 11), 1, "v1", "X")]                                                                        # the first stored close
    out = asyncio.run(api._joined_counts(_store(rows), [("a", ""), ("b", ""), ("c", "")]))
    assert out == {("a", "", "2026-11-20"): 2, ("b", "", "2026-11-20"): "rules", ("c", "", "2026-11-11"): 0}
