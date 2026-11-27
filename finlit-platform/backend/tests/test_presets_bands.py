"""Task #64, 14 Nov file, N-25, and task #283: the bands of a screen's columns. FinLit Prism is the only company score: a list stored before the retired FinLit IQ
went still names its columns, and they are never served."""


def test_a_list_stored_before_the_finlit_iq_was_retired_is_served_without_its_columns():
    from finlit.presets.api import _bands_now
    from finlit.presets.registry import STD_ADVANCED
    assert not any(k == "overall" or k.startswith("pillar_") or b == "FinLit IQ" for k, _l, _f, _a, b in STD_ADVANCED)
    old = [{"key": "overall", "band": "FinLit IQ"}, {"key": "pillar_technical", "band": "Technical"}, {"key": "prism_final", "band": "FinLit Prism"}, {"key": "rank"}]
    assert [c["key"] for c in _bands_now(old)] == ["prism_final", "rank"]
