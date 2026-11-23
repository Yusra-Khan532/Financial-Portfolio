"""Task #333 (file 30, addition 5): Sector Pulse "Alert me": the three alerts are worked out from the release files, each alerted group counts as one alert."""
import json

from finlit import sector_alerts as sa


def test_entries_are_parsed_and_each_group_counts_once():
    prefs = {"sectorAlerts": ["state:sectors:power", "box:sectors:power", "top5:industries:banks", "bad:sectors:x", 3, "state:sectors:Bad Slug"]}
    assert sa.parse(prefs["sectorAlerts"]) == [("state", "sectors", "power"), ("box", "sectors", "power"), ("top5", "industries", "banks")]
    assert sa.groups_alerted(prefs) == 2
    assert sa.groups_alerted(json.dumps(prefs)) == 2          # prefs may arrive as JSON text
    assert sa.groups_alerted(None) == 0


def test_state_change_is_this_weeks_close_against_last_weeks():
    dates = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]
    codes = ["washout"] * 5 + ["washout", "washout", "thrust_c", "thrust_c", "thrust_c"]
    day, now, prev = sa.week_before(dates, codes)
    assert (day, now, prev) == ("2026-11-20", "thrust_c", "washout")
    assert sa.week_before([], []) == (None, None, None)


def test_top5_enters_and_leaves():
    row = {"ranked": 19, "rank_history": [{"date": "2026-11-13", "rank": 7}, {"date": "2026-11-20", "rank": 4}]}
    assert sa.top5_event(row) == {"kind": "top5", "period": "2026-11-20", "in": True, "rank": 4, "ranked": 19}
    row["rank_history"] = [{"date": "2026-11-13", "rank": 3}, {"date": "2026-11-20", "rank": 6}]
    assert sa.top5_event(row)["in"] is False
    row["rank_history"] = [{"date": "2026-11-13", "rank": 3}, {"date": "2026-11-20", "rank": 5}]
    assert sa.top5_event(row) is None


def test_events_from_a_release_folder(tmp_path):
    base = tmp_path / "by-sector"
    (base / "sectors").mkdir(parents=True); (base / "rotation").mkdir(parents=True)
    (base / "sectors" / "_board.json").write_text(json.dumps({"rows": [{"slug": "power", "name": "Power"}]}))
    (base / "sectors" / "power.json").write_text(json.dumps({"history": {"dates": ["2026-11-13", "2026-11-20"], "state_code": ["washout", "thrust_c"]}}))
    (base / "rotation" / "_map.json").write_text(json.dumps({"week_closed": True, "rows": [{"slug": "power", "ranked": 19, "weeks_in_corner": 1, "previous_corner_name": "Behind but gaining",
        "corner_name": "Ahead and gaining", "corner_since": "2026-11-20", "rank_history": [{"date": "2026-11-13", "rank": 8}, {"date": "2026-11-20", "rank": 2}]}]}))
    ev = {e["kind"]: e for e in sa.events(tmp_path, "sectors", "power")}
    assert set(ev) == {"box", "top5", "state"}
    assert ev["state"]["from"] == "Sold off" and ev["state"]["to"] == "Bouncing back"
    title, body = sa.message("Power", "sectors", ev["top5"])
    assert title == "Power entered the top 5 sectors by rank" and "rank 2 of 19" in body and "not investment advice" in body
    title, _ = sa.message("Power", "sectors", ev["state"])
    assert title == "Power is now Bouncing back on Sector Pulse"
    for e in ev.values():
        t, b = sa.message("Power", "sectors", e)
        assert not any(w in (t + b).lower() for w in ("buy", "sell ", "target"))
    # until the week has closed nothing is sent
    (base / "rotation" / "_map.json").write_text(json.dumps({"week_closed": False, "rows": []}))
    assert sa.events(tmp_path, "sectors", "power") == []
