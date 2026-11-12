"""Screen history and Top gainers: the words, the arithmetic and the registry entries (the stored tables are checked by the nightly run itself)."""
import re

from finlit.presets import history
from finlit.presets.registry import BY_ID, GROUPS


def test_leave_reasons_are_words_never_numbers():
    for label in ("FinLit IQ Healthy or Strong", "Technical out of Watch", "Quality 45 (a bank or finance company against other lenders)", "No more than 30% below the 52-week high",
                  "Market cap Rs 1,000 Cr or more", "A full year of prices", "something unknown"):
        w = history.reason_words(label)
        assert not re.search(r"\d", re.sub(r"52-week|9-day|20-day", "", w)) and w, label
    assert history.reason_words("Technical out of Watch") == "its trend weakened"
    assert history.reason_words("something unknown") == history.GENERIC


def test_changes_and_the_bench_lookup():
    assert history._pct(100, 112.345) == 12.35 and history._pct(None, 5) is None and history._pct(0, 5) is None
    bench = {"2026-11-03": 100.0, "2026-11-06": 103.0}
    assert history._bench_at(bench, "2026-11-04") == 100.0 and history._bench_at(bench, "2026-11-06") == 103.0 and history._bench_at(bench, "2026-10-01") is None
    assert history.list_hash(["A", "B"]) == history.list_hash(["A", "B"]) != history.list_hash(["B", "A"])


def test_top_gainers_screens_exist_on_both_pages_with_the_seven_columns():
    assert ("top-gainers", "Top gainers") in GROUPS
    for pid, tab in (("gainers-day", "advanced"), ("gainers-week", "advanced"), ("gainers-month", "advanced"), ("basic-gainers-day", "basic"), ("basic-gainers-week", "basic"), ("basic-gainers-month", "basic")):
        p = BY_ID[pid]
        assert p.kind == "gainers" and p.tab == tab and p.limit == 20
        keys = [c.key for c in p.columns]
        assert keys[2:9] == ["joined", "screen", "closeJoined", "since", "bench", "highest", "stillOn"], pid
    assert history.WINDOWS == {"day": 1, "week": 5, "month": 21}


def test_funnel_counts_each_rule_in_turn_and_says_how_many_had_no_figure():
    from finlit.screener.data import Table
    import json
    rows = [{"symbol": f"S{i}", "name": f"S{i}", "sector": "X", "industry": "Y", "band": "mixed", "metrics": json.dumps({"market_cap": 1000 + i, "pe": (None if i == 3 else float(i + 1))})} for i in range(10)]
    t = Table(rows, {}, {})
    f = t.funnel({"pe": {"min": None, "max": 5.0}, "market_cap": {"min": 1002.0, "max": None}}, {})
    assert [s["key"] for s in f] == ["pe", "market_cap"]
    assert (f[0]["before"], f[0]["missing"], f[0]["after"]) == (10, 1, 4) and (f[1]["before"], f[1]["after"]) == (4, 2)


def test_filter_bar_search_size_sector_and_strong_keep_the_screens_own_order():
    from finlit.presets import api

    class Req:
        def __init__(self, **q):
            self.query_params = type("Q", (), {"get": lambda s, k, d=None: q.get(k, [d])[0] if k in q else d, "getlist": lambda s, k: q.get(k, [])})()
    rows = [{"symbol": "AAA", "name": "Alpha", "sector": "IT", "market_cap": 90000, "overall": 80}, {"symbol": "BBB", "name": "Beta", "sector": "Auto", "market_cap": 20000, "overall": 50},
            {"symbol": "CCC", "name": "Gamma", "sector": "IT", "market_cap": 3000, "overall": 70}]
    assert [r["symbol"] for r in api._filtered(Req(size=["Large", "Small"]), rows)] == ["AAA", "CCC"]
    assert [r["symbol"] for r in api._filtered(Req(sector=["IT"], strong=["1"]), rows)] == ["AAA", "CCC"]
    assert [r["symbol"] for r in api._filtered(Req(q=["bet"]), rows)] == ["BBB"]
    f = api._facets(rows)
    assert f["sizes"] == {"Large": 1, "Mid": 1, "Small": 1} and f["sectors"][0] == ("IT", 2) and f["strong"] == 2


def test_gainers_as_on_picker_lists_the_stored_closes_latest_first():
    import asyncio
    from datetime import date
    from finlit.presets import history

    class Conn:
        async def fetch(self, sql, *a):
            assert "FROM gainers" in sql and a[0] == "basic" and a[1] == "week"
            return [{"session": date(2026, 11, 11), "n": 20}, {"session": date(2026, 11, 10), "n": 18}]

    class Acq:
        async def __aenter__(self): return Conn()
        async def __aexit__(self, *a): return False

    class Pool:
        def acquire(self): return Acq()

    class Store:
        pool = Pool()

    got = asyncio.run(history.gainer_sessions(Store(), "basic", "week"))
    assert got == [{"date": "2026-11-11", "count": 20, "rulesUpdated": False}, {"date": "2026-11-10", "count": 18, "rulesUpdated": False}]
