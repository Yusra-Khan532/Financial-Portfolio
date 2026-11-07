"""The public view of a FinLit Prism report: readings, never the method (weights, points, cut-offs, versions)."""

import copy
import json
from pathlib import Path

from finlit.prism_public import PRIVATE_KEYS, direction_of, leaks, public_report, public_summary, reading_of

SNAPSHOT = json.loads((Path(__file__).parent / "fixtures" / "prism" / "snapshot_example.json").read_text())


def test_five_readings_at_their_edges():
    assert [reading_of(p) for p in (100, 90, 89.99, 70, 69.9, 40, 39.9, 20, 19.9, 0, -5)] == [
        "very_strong", "very_strong", "strong", "strong", "middle", "middle", "weak", "weak", "very_weak", "very_weak", "very_weak"]
    assert reading_of(None) is None and reading_of("70") is None and reading_of(True) is None


def test_directions():
    assert [direction_of(s) for s in (1, 0.2, 0, -0.01, None, False)] == ["supporting", "supporting", "neutral", "adverse", None, None]


def test_the_snapshot_keeps_its_readings_and_loses_its_method():
    source = copy.deepcopy(SNAPSHOT)
    pub = public_report(source)
    assert source == SNAPSHOT                                   # the argument is not changed
    assert leaks(pub) == []
    r, s = pub["rating"], SNAPSHOT["rating"]
    assert r["final"] == s["final"] and r["parts"] == s["parts"] and r["label"] == s["label"]
    for shown, orig in zip(r["metrics"], s["metrics"]):
        assert shown["reading"] == reading_of(orig.get("points"))
        assert shown.get("value") == orig.get("value") and shown.get("label") == orig.get("label")
        assert not {"credibility", "base", "ownPoints", "fillPoints", "magnitudePoints"} & set(shown.get("details") or {})
        kept = {k: v for k, v in (orig.get("details") or {}).items() if k not in ("credibility", "base", "ownPoints", "fillPoints", "magnitudePoints")}
        assert shown.get("details", {}) == kept                  # the facts the notes are written from stay
        assert "redBoundary" not in shown and "greenBoundary" not in shown
    for h in ("shortTerm", "longTerm"):
        for f, orig in zip(pub["technicalAssessment"][h]["factors"], SNAPSHOT["technicalAssessment"][h]["factors"]):
            assert "signal" not in f and f["direction"] == (direction_of(orig.get("signal")) if orig.get("status") == "available" else None)
        assert "stageCapped" not in pub["technicalAssessment"][h]
    assert "options" not in pub["technicalAssessment"]
    assert all(set(a) <= {"metric", "part"} for a in r.get("adjustments") or [])


def test_a_new_method_field_is_dropped_wherever_it_appears():
    report = {"rating": {"final": 60, "metrics": [{"key": "x", "points": 75, "weight": 3, "nested": {"cutoff": 5, "ok": 1}}]},
              "anything": [{"thresholds": [1, 2], "keep": True}]}
    pub = public_report(report)
    assert leaks(pub) == [] and pub["rating"]["metrics"][0] == {"key": "x", "reading": "strong", "nested": {"ok": 1}}
    assert pub["anything"] == [{"keep": True}]
    assert public_summary({"final": 1, "partWeights": {"a": 1}, "modelVersion": "3"}) == {"final": 1}


def test_every_private_name_is_caught():
    assert leaks({k: 1 for k in PRIVATE_KEYS}) and len(leaks({k: 1 for k in PRIVATE_KEYS})) == len(PRIVATE_KEYS)


def test_look_back_lengths_read_as_weeks():
    pub = public_report({"technicalAssessment": {"longTerm": {"factors": [
        {"key": "structure", "label": "Structure", "status": "available", "signal": 1, "detail": "252-session closing high / low: 1611.20 / 1152.30."},
        {"key": "leadership", "label": "Leadership", "status": "unavailable", "detail": "A complete aligned 252-session stock/index window is unavailable."}]}}})
    f = pub["technicalAssessment"]["longTerm"]["factors"]
    assert f[0]["detail"] == "Closing high / low over 52 weeks: 1611.20 / 1152.30." and f[0]["direction"] == "supporting"
    assert f[1]["detail"] == "A complete aligned 52-week stock/index window is unavailable." and f[1]["direction"] is None
