"""Task #64, 14 Nov file, N-25: Technical is the fifth part of the FinLit IQ, inside its band, on the Basic screens."""


def test_basic_technical_is_inside_the_finlit_iq_band_even_on_a_list_stored_before():
    from finlit.presets.api import _bands_now
    from finlit.presets.registry import STD_BASIC
    assert next(b for k, _l, _f, _a, b in STD_BASIC if k == "pillar_technical") == "FinLit IQ"
    old = [{"key": "overall", "band": "FinLit IQ"}, {"key": "pillar_technical", "band": "Technical"}, {"key": "rank"}]
    assert [c.get("band") for c in _bands_now(old)] == ["FinLit IQ", "FinLit IQ", None]
