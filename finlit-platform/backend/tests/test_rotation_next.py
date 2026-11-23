"""Task #332 (developer file 31, addition 1): "What happened next" on Sector Rotation, counted by the pack's rule and sent with the page feed."""
import json
import re
from pathlib import Path

from finlit import sector_api as api

pub = api._pub
FX = Path(__file__).parent / "fixtures" / "sectors_public"
AG, AS, BG, BS = "ahead_gaining", "ahead_slowing", "behind_gaining", "behind_slipping"
FORECAST = re.compile(r"\b(chance|likely|probab\w*|will move|expect\w*|forecast(?!s? )|predict\w*|buy|sell|hold)\b", re.I)


def _dates(n):
    return [f"2026-{1 + i // 4:02d}-{1 + (i % 4) * 7:02d}" for i in range(n)]


def card(out, box):
    return next(c for c in out["cards"] if c["box"] == box)


def test_counting_rule_word_for_word():
    s = {
        "a": [AG, AG, AS, AS, AS, BS],     # AG already running at week 1: not entered; AS entered and ended (3 weeks) into BS; BS is now
        "b": [BG, AG, AG, BG, BG, BG],     # AG entered, ended after 2 weeks into BG; BG entered at week 4 and still running
        "c": [BS, BS, BS, BS, BS, BS],     # never moved: in BS now, entered nothing
    }
    out = pub.count_what_next(s, _dates(6))
    ag, as_, bs, bg = card(out, AG), card(out, AS), card(out, BS), card(out, BG)
    assert (ag["entered"], ag["ended"], ag["typical_weeks"], ag["now"]) == (1, 1, 2, 0)
    assert ag["next"] == [{"box": BG, "box_name": "Behind but gaining", "n": 1}]
    assert (as_["entered"], as_["ended"], as_["typical_weeks"], as_["now"]) == (1, 1, 3, 0)
    assert (bs["entered"], bs["ended"], bs["now"]) == (1, 0, 2) and bs["typical_weeks"] is None
    assert (bg["entered"], bg["ended"], bg["now"]) == (1, 0, 1)      # the first BG stay of "b" ran from week 1: not entered, not counted as ended
    assert out["groups"] == 3 and out["weeks"] == 6


def test_typical_stay_is_the_median_and_halves_show():
    s = {"x": [BS, AG, AG, BS, AG, AG, AG, BS, AG, AG, AG, AG, AG, BS]}   # AG stays that ended: 2, 3, 5 weeks -> median 3
    assert card(pub.count_what_next(s, _dates(14)), AG)["typical_weeks"] == 3
    s = {"x": [BS, AG, AG, BS, AG, AG, AG, BS], "y": [BS, AG, AG, AG, AG, AG, AG, BS]}   # 2, 3, 6 -> 3; with 2, 3 only -> 2.5
    assert card(pub.count_what_next({"x": s["x"]}, _dates(8)), AG)["typical_weeks"] == 2.5


def test_boxes_nobody_entered_and_nobody_is_in_are_left_out_and_gaps_are_skipped():
    out = pub.count_what_next({"x": [BS, None, AG, AS], "y": [BS, AG, "", AS]}, _dates(4))
    assert [c["box"] for c in out["cards"]] == [AG, AS]      # BS ran from the first week and nobody is in it now; nobody touched BG
    assert card(out, AG)["next"][0]["n"] == 2 and card(out, AG)["typical_weeks"] == 1 and card(out, AS)["now"] == 2
    assert "1 week" in pub.count_what_next({"x": [AG]}, _dates(1))["caption"] and "1 weeks" not in pub.count_what_next({"x": [AG]}, _dates(1))["caption"]


def test_the_pack_figures_come_out_of_the_live_feed_of_20_nov():
    """The pack's table (Sectors view, 29 May to 20 Nov 2026, 19 sectors) from the feed's own rank_history: the fallback the website uses until the
    weekly job sends its year-long count."""
    feed = json.loads((FX / "rotation_sectors_20nov.json").read_text())
    out = pub.what_next_from_history(feed["rows"])
    assert (out["from"], out["to"], out["groups"], out["weeks"]) == ("2026-05-29", "2026-11-20", 19, 26)
    want = {BG: (19, {BS: 9, AG: 6}, 3, 4), AG: (21, {AS: 9, BS: 6, BG: 1}, 5.5, 5), AS: (14, {AG: 7, BS: 2, BG: 1}, 5, 4), BS: (19, {BG: 9, AG: 4}, 5, 6)}
    for box, (ent, nxt, typ, now) in want.items():
        c = card(out, box)
        assert (c["entered"], {x["box"]: x["n"] for x in c["next"]}, c["typical_weeks"], c["now"]) == (ent, nxt, typ, now)
    assert [c["box"] for c in out["cards"]] == [BG, AG, AS, BS]


def test_feed_carries_it_with_window_and_wording_and_no_private_field():
    feed = json.loads((FX / "_map.json").read_text())
    body = api.public_rotation(feed)
    wn = body["what_next"]
    assert wn and wn["caption"].endswith("It shows what did happen, not what will.")
    assert wn["from_label"] in wn["caption"] and wn["to_label"] in wn["caption"]
    assert not FORECAST.search(json.dumps(wn)), FORECAST.findall(json.dumps(wn))
    assert "%" not in json.dumps(wn)
    assert pub.check_public(body) == []
    sent = {**feed, "what_next": {"from": "2025-11-21", "to": "2026-11-20", "weeks": 52, "groups": 2, "cards": [], "caption": "x"}}
    assert api.public_rotation(sent)["what_next"]["weeks"] == 52           # the weekly job's year-long count wins over the 26-week fallback


def test_playback_has_the_same_eight_weekly_closes_as_the_paths():
    """Addition 4: playback reads rows[].tail (8 weekly closes, strength, change, box then) — the same weeks as the 8-week paths."""
    feed = json.loads((FX / "rotation_sectors_20nov.json").read_text())
    body = api.public_rotation(feed)
    weeks = [p["date"] for p in body["rows"][0]["tail"]]
    assert len(weeks) == 8 and weeks[-1] == body["date"]
    for r in body["rows"]:
        assert all({"date", "strength", "change", "corner", "date_label"} <= set(p) for p in r["tail"])
        assert [p["date"] for p in r["tail"]] == weeks[-len(r["tail"]):]
