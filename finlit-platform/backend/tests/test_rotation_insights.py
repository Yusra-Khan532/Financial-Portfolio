"""The insight cards under the Sector Rotation charts: worked out from the real nightly output of 29 Oct 2026, descriptive only, nothing about how a corner is decided."""
import json
import re
from pathlib import Path

from finlit.rotation_insights import changed_direction, rank_insights, rotation_insights

MAP = json.loads((Path(__file__).parent / "fixtures" / "rotation" / "_map.json").read_text())
BANNED = re.compile(r"\b(buy|sell|hold|accumulate|avoid|target|best|worst|recommend|signal|weights?|cut-?offs?|threshold)\b", re.I)


def row(name, six, one, ranks=()):
    return {"name": name, "slug": name.lower(), "vs_average": {"126d": six, "21d": one}, "rank_history": [{"date": f"w{i}", "rank": r} for i, r in enumerate(ranks)]}


def test_a_change_of_direction_needs_half_a_point_the_other_way_last_month():
    assert changed_direction(row("A", 10, -0.5)) and not changed_direction(row("A", 10, -0.4))
    assert changed_direction(row("B", -3, 0.6)) and not changed_direction(row("B", -3, 0.2)) and not changed_direction(row("C", 5, 2))


def test_the_ahead_cards_name_leaders_that_slipped_and_laggards_that_gained():
    ins = rotation_insights([row("Alpha", 12, -2), row("Beta", 8, -1), row("Gamma", -5, 3), row("Delta", 4, 1)])["ahead"]
    t = {i["title"]: i for i in ins}
    assert "Alpha and Beta are still ahead" in t["Leaders that slipped last month"]["text"] and "Gamma is still behind" in t["Laggards that gained"]["text"]
    assert "Gamma moved 3.0 points ahead" in t["The biggest move last month"]["text"]


def test_the_rank_cards_use_the_whole_period():
    rows = [row("Up", 1, 1, [20, 18, 15, 12, 10, 8, 6, 4, 3, 2]), row("Steady", 1, 1, [4, 4, 5, 4, 4, 5, 4, 4, 5, 4]), row("Down", 1, 1, [2, 3, 5, 8, 11, 14, 17, 20, 22, 25])]
    t = {i["title"]: i["text"] for i in rank_insights(rows)}
    assert t["Biggest climb"] == "Up climbed 18 places over the period, from rank 20 to rank 2."
    assert t["Steadiest in the top 5"] == "Steady stayed within 1 place over the period." and t["Biggest fall"].startswith("Down fell 23 places")


def test_nothing_is_made_up_when_there_is_no_data_and_the_real_output_reads_plainly():
    assert rotation_insights([]) == {"ahead": [], "ranks": []} and rank_insights([row("X", 1, 1, [1, 2])]) == []
    out = rotation_insights(MAP["rows"])
    assert out["ahead"] and out["ranks"] and all(set(i) == {"kind", "title", "text"} and i["kind"] in ("good", "insight", "watch", "warning") for v in out.values() for i in v)
    assert not BANNED.search(" ".join(i["title"] + " " + i["text"] for v in out.values() for i in v))
