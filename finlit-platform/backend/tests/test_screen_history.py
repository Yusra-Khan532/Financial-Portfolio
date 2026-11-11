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
