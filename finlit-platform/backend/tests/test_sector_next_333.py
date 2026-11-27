"""Task #333 (file 30, addition 1): What happened next, by the file's counting rule."""
from datetime import date, timedelta

from finlit import sector_next as sn


def days(start: str, codes):
    """One session per weekday from `start`, with the given readings (one per session)."""
    d, out = date.fromisoformat(start), []
    while len(out) < len(codes):
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def test_weekly_close_is_the_last_session_of_each_week():
    ds = days("2026-11-02", ["washout"] * 4 + ["thrust_c"] + ["thrust_c"] * 5)
    w = sn.weekly(ds, ["washout"] * 4 + ["thrust_c"] + ["thrust_c"] * 5)
    assert w == [("2026-11-06", "thrust_c"), ("2026-11-13", "thrust_c")]


def test_counting_rule():
    # weekly readings for one group: Sold off x3 (running at the start: not entered), Bouncing x2, Sold off x1, Bouncing x2 (still running)
    weeks = ["washout"] * 3 + ["thrust_c"] * 2 + ["washout"] + ["thrust_c"] * 2
    codes = [c for c in weeks for _ in range(5)]
    page = {"history": {"dates": days("2026-09-07", codes), "state_code": codes}}
    out = sn.build([page])
    rows = {r["state"]: r for r in out["rows"]}
    assert rows["thrust_c"]["entered"] == 2 and rows["thrust_c"]["ended"] == 1 and rows["thrust_c"]["typical_weeks"] == 2 and rows["thrust_c"]["now"] == 1
    assert rows["thrust_c"]["next"] == [{"state": "washout", "n": 1}]
    assert rows["washout"]["entered"] == 1 and rows["washout"]["next"] == [{"state": "thrust_c", "n": 1}] and rows["washout"]["typical_weeks"] == 1
    assert "confirmed" not in rows                       # nobody entered it and nobody is in it
    assert out["groups"] == 1 and out["window_to"] == page["history"]["dates"][-1]


def test_window_is_the_last_12_months_and_median_can_be_a_half():
    a = ["washout"] * 2 + ["fading"] * 3 + ["washout"] + ["fading"] * 4 + ["washout"]
    b = ["neutral"] * 60 + ["fading"]                    # most of it is older than the window
    pa = {"history": {"dates": days("2026-08-03", [c for c in a for _ in range(5)]), "state_code": [c for c in a for _ in range(5)]}}
    cb = [c for c in b for _ in range(5)]
    pb = {"history": {"dates": days("2025-09-01", cb), "state_code": cb}}
    out = sn.build([pa, pb])
    rows = {r["state"]: r for r in out["rows"]}
    assert rows["fading"]["typical_weeks"] == 3.5 and rows["fading"]["now"] == 1
    assert out["window_from"] >= (date.fromisoformat(out["window_to"]) - timedelta(days=365)).isoformat()


def test_playback_one_year_of_weekly_closes():
    codes = ["washout"] * 10 + ["thrust_c"] * 5
    ds = days("2026-10-26", codes)
    page = {"slug": "power", "name": "Power", "history": {"dates": ds, "state_code": codes, "above_20": [10 + i for i in range(15)], "index_vs_52w_high": [-20.04 + i for i in range(15)]}}
    out = sn.playback([page])
    assert out["weeks"] == ["2026-10-30", "2026-11-06", "2026-11-13"]
    g = out["groups"][0]
    assert g["slug"] == "power" and g["state"] == ["washout", "washout", "thrust_c"]
    assert g["rising"] == [14.0, 19.0, 24.0] and g["below_high"] == [-16.0, -11.0, -6.0]
    assert sn.playback([]) is None
