"""Task 64, the fixes of 12 Nov 2026: the lender cut-off, the plain order notes, the themes on NSE industries, the candle-coverage rule of the pattern job."""
import asyncio
import json
from datetime import date

from finlit.presets import engine, patterns, themes
from finlit.presets.registry import BY_ID


def test_lender_on_the_cut_off_passes_and_the_rule_matches_the_equivalent_value():
    others = sorted(list(range(20, 80)) * 1)           # 60 other companies, Quality 20 to 79
    lend = sorted([30, 35, 38, 40, 42, 45, 50, 52, 55, 58, 60, 62])
    for minimum in (20, 33.5, 50, 58, 71, 79, 80):
        cut = engine.lender_cut(others, lend, minimum)
        for v in lend:
            assert (engine.lender_equivalent(others, lend, v) >= minimum) == (v >= cut), (minimum, v, cut)
    cut = engine.lender_cut(others, lend, 50)
    assert cut in lend and engine.lender_equivalent(others, lend, cut) >= 50       # at or above: a lender exactly on the cut-off is in


def test_order_notes_are_plain_and_name_no_model_detail():
    assert engine.rank_order_note(BY_ID["basic-top-large"]) == "The 10 highest FinLit IQs first."
    assert engine.rank_order_note(BY_ID["highest-rated-large"]) == "Ordered by the FinLit Prism rating."
    assert engine.rank_order_note(BY_ID["setup-pre-breakout"]) is None and engine.rank_order_note(BY_ID["emerging-tech"]) is None


def test_chip_texts_carry_no_cut_offs_or_counts():
    chips = {c.id: c.description for p in BY_ID.values() for c in p.chips}
    assert chips["fast-growers"] == "Asks for stronger growth and profitability."
    assert chips["turning-up"].startswith("Keeps only names where the short-term technical view is no longer negative")
    assert "5 to 7" not in chips["small-groups"] and chips["small-groups"].startswith("Also lists smaller groups")


def test_themes_group_by_the_nse_industry_and_keep_their_own_history_key():
    class T:
        symbols = ["A", "B", "C"]
    f = themes.by_nse_industry(T(), {"A": "Banks", "B": "Banks"})
    assert [f(0), f(1), f(2)] == ["Banks", "Banks", None]           # a company with no NSE industry stays out of theme status
    assert themes.KEY_PREFIX == "nse:"


class _Store:
    def __init__(self, ends):
        self.ends = ends

    async def get_section(self, sym, basis, section):
        t = [f"2026-09-{d:02d}" for d in range(1, 26)] + [self.ends[sym]]
        return json.dumps({"series": {"t": t}}), None


class _Table:
    def __init__(self, syms):
        self.symbols = syms
        self.cols = {"market_cap": [5000.0] * len(syms)}
        self.full = [True] * len(syms)


def test_candle_coverage_counts_fresh_companies_and_drops_suspended_ones():
    day = date(2026, 11, 11)
    ends = {f"S{i}": "2026-11-11" for i in range(98)}
    ends.update({"OLD1": "2026-11-09", "OLD2": "2026-11-09", "GONE": "2026-05-12"})        # two are behind, one is suspended since May
    cov = asyncio.run(patterns.candle_coverage(_Store(ends), _Table(list(ends)), day))
    assert cov["fresh"] == 98 and cov["universe"] == 100 and cov["suspended"] == 1 and cov["ratio"] == 0.98


def test_the_pattern_job_waits_for_candles_then_gives_up_with_the_last_coverage():
    day = date(2026, 11, 11)
    ends = {f"S{i}": "2026-11-09" for i in range(50)}
    slept = []

    async def nap(s):
        slept.append(s)

    got = asyncio.run(patterns.wait_for_candles(_Store(ends), _Table(list(ends)), day, max_wait_s=360, step_s=120, sleep=nap))
    assert got["ratio"] == 0.0 and slept == [120, 120, 120] and got["waited"] == 360
    ends = {f"S{i}": "2026-11-11" for i in range(50)}
    ok = asyncio.run(patterns.wait_for_candles(_Store(ends), _Table(list(ends)), day, sleep=nap))
    assert ok["ratio"] == 1.0 and ok["waited"] == 0


class _Redis:
    def __init__(self):
        self.kv = {}

    async def set(self, k, v, ex=None):
        self.kv[k] = v

    async def get(self, k):
        return self.kv.get(k)


class _StoreDhan(_Store):
    def __init__(self, ends):
        super().__init__(ends)
        self.redis = _Redis()


def _rows(last_day: str, n: int = 40):
    from datetime import timedelta
    end = date.fromisoformat(last_day)
    days = sorted((end - timedelta(days=i)).isoformat() for i in range(n))
    return [[d, 100.0 + i, 101.0 + i, 99.0 + i, 100.5 + i, 1000 + i] for i, d in enumerate(days)]


def test_the_technicals_candles_are_kept_whole_and_only_when_usable():
    from finlit.presets import candles
    raw = candles.pack(_rows("2026-11-11", 400))
    back = candles.unpack(raw)
    assert len(back["t"]) == candles.KEEP_SESSIONS and back["t"][-1] == "2026-11-11" and set(back) == {"t", "o", "h", "l", "c", "v"}
    assert candles.pack(_rows("2026-11-11", 10)) is None                                        # too short to scan
    assert candles.pack(list(reversed(_rows("2026-11-11", 40)))) is None                       # out of order: never stored
    st = _StoreDhan({"AAA": "2026-11-09"})
    assert asyncio.run(candles.save(st.redis, "AAA", _rows("2026-11-11"))) is True


def test_the_scans_use_the_fresher_dhan_candles_so_a_lagging_report_is_not_left_out():
    """Task #64, C6: on the live site three in four scanned companies had stored prices two sessions behind, the 98% gate held every night and the screens kept an
    old run with 976 companies left out. The technicals job's fresh candles now count."""
    from finlit.presets import candles
    day = date(2026, 11, 11)
    ends = {f"S{i}": "2026-11-09" for i in range(10)}
    st = _StoreDhan(ends)
    assert asyncio.run(patterns.candle_coverage(st, _Table(list(ends)), day))["ratio"] == 0.0      # the stored prices alone: all behind
    for s in ends:
        asyncio.run(candles.save(st.redis, s, _rows("2026-11-11")))
    assert asyncio.run(patterns.candle_coverage(st, _Table(list(ends)), day))["ratio"] == 1.0      # the Dhan candles reach the close
    asyncio.run(candles.save(st.redis, "S0", _rows("2026-11-05")))                              # an older Dhan copy never replaces a newer stored series
    assert asyncio.run(candles.series(st, "S0"))["t"][-1] == "2026-11-09"
    assert asyncio.run(candles.series(_Store({"X": "2026-11-11"}), "X"))["t"][-1] == "2026-11-11"   # no Redis at all: the stored prices
