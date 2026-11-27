"""Task #183 showed this week's reading in place of a held label whose 12-month gap disagreed (a Leader at minus points). Task #409 (peer label fix
pack, 27 Nov 2026) removes that: it is why the label shown broke the printed two-run rule (KOTAKBANK: "Leader since 13 Mar" beside "Leader 0 of 51").
The label shown is now the weekly record's label, as it is; the reading is shown only as "this week's reading", and only while it is pending."""
from datetime import date

import finlit.leadership_api as api
from finlit.leadership_api import overlay


def test_agreeing_is_gone():
    assert not hasattr(api, "agreeing")


def test_the_records_label_is_shown_even_when_the_12_month_gap_disagrees():
    row = {"label": "in_line", "raw_label": "in_line", "rel52": -0.18, "label_since": date(2026, 1, 2)}
    rec = {"label": "leader", "reading": "in_line", "label_since": date(2026, 10, 9), "pending_to": "in_line", "peer_list_version": "nse-industry"}
    out = overlay(row, rec)
    assert out["label"] == "leader" and out["raw_label"] == "in_line" and out["label_since"] == date(2026, 10, 9) and out["pending_to"] == "in_line"


def test_no_label_and_no_reading_are_none_not_the_word_none():
    out = overlay({"label": "laggard", "raw_label": "laggard"}, {"label": "none", "reading": "none", "label_since": date(2026, 11, 20), "pending_to": None})
    assert out["label"] is None and out["raw_label"] is None


def test_without_a_record_row_the_stored_columns_stay_as_they_are():
    row = {"label": "leader", "raw_label": "in_line", "rel52": -0.2}
    out = overlay(row, None)
    assert out["label"] == "leader" and out["raw_label"] == "in_line" and out["pending_to"] is None
