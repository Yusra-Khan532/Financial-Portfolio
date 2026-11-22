"""Task #311 (developer file 21): the server-written lines the pages show. India macro: each history line says what it measures in one sentence (the
source is sent beside it); a stored payload is served with today's wording. Superinvestors: the source line keeps "via FinEdge" (Hold) without the method."""
from finlit import macro, superinvestors


def test_macro_history_lines_are_one_plain_sentence():
    assert macro.NOTES["cpi"] == "Change in consumer prices over the same month a year earlier."
    assert macro.NOTES["wpi"] == "Change in wholesale prices over the same month a year earlier."
    for k, v in macro.NOTES.items():
        if v == macro.WB_LICENCE:
            continue                          # the World Bank's CC BY 4.0 credit stays
        assert v.count(".") == 1 and v.endswith("."), k
        for word in ("base 20", "back series", "worked out", "rounded", "first read", "republished", "since April"):
            assert word not in v, (k, word)


def test_a_stored_payload_is_served_with_todays_wording():
    old = {"series": {"cpi": {"note": "MoSPI's published inflation rate, base 2024 = 100: the back series ..."}, "x": {"note": "kept"}}}
    out = macro.fresh_notes(old)
    assert out["series"]["cpi"]["note"] == macro.NOTES["cpi"] and out["series"]["x"]["note"] == "kept"
    assert macro.KEY != "macro:v1"            # an older cached body is never served again


def test_superinvestor_source_line():
    assert superinvestors.SOURCE == "From each company's shareholding filing (named public shareholders of 1% or more), via FinEdge."
