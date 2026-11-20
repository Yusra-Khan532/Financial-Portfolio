"""Task #258 (20 Nov handoff, Advanced screener SPEC §2 and §3): an open Advanced screen filters on NSE's macro sector, sector and industry, the Prism rating
words, five score ranges and the two technical views in five words, and its facets give each option's count with the other filters on."""
import asyncio
from types import SimpleNamespace

from starlette.datastructures import QueryParams

from finlit.presets import api


def _req(qs):
    return SimpleNamespace(query_params=QueryParams(qs))


ROWS = [
    {"symbol": "BANK1", "cls_macro": "Financial Services", "cls_sector": "Financial Services", "cls_industry": "Banks", "prism_final": 85, "prism_valuation": 55, "prism_risk": 70, "prism_st_score": 60, "prism_lt_score": 10},
    {"symbol": "BANK2", "cls_macro": "Financial Services", "cls_sector": "Financial Services", "cls_industry": "Banks", "prism_final": 66, "prism_valuation": 40, "prism_risk": 50, "prism_st_score": 25, "prism_lt_score": -30},
    {"symbol": "STEEL", "cls_macro": "Commodities", "cls_sector": "Metals & Mining", "cls_industry": "Ferrous Metals", "prism_final": 40, "prism_valuation": 60, "prism_risk": 30, "prism_st_score": -25, "prism_lt_score": -70},
    {"symbol": "CHEM", "cls_macro": "Commodities", "cls_sector": "Chemicals", "cls_industry": "Chemicals & Petrochemicals", "prism_final": 20, "prism_st_score": 0},
    {"symbol": "BSEONLY", "cls_macro": None, "cls_sector": None, "cls_industry": None, "prism_final": None},
]
pick = lambda qs: [r["symbol"] for r in api._filtered(_req(qs), ROWS)]       # noqa: E731


def test_three_levels_and_across_or_inside():
    assert pick("macro=Commodities") == ["STEEL", "CHEM"]
    assert pick("macro=Commodities&macro=Financial+Services") == ["BANK1", "BANK2", "STEEL", "CHEM"]
    assert pick("macro=Commodities&nsec=Chemicals") == ["CHEM"]
    assert pick("indu=Banks&nsec=Metals+%26+Mining") == []             # AND across levels
    assert pick("indu=Banks&indu=Ferrous+Metals") == ["BANK1", "BANK2", "STEEL"]


def test_rating_words_follow_the_score_and_not_rated_is_no_score():
    assert pick("pl=strong,healthy") == ["BANK1", "BANK2"]
    assert pick("pl=weak") == ["STEEL"] and pick("pl=poor") == ["CHEM"] and pick("pl=notrated") == ["BSEONLY"]
    assert pick("pl=bogus") == pick("")                                  # an unknown word is ignored, never an empty list


def test_score_ranges_are_inclusive_clamped_and_a_blank_never_passes():
    assert pick("zvmin=50") == ["BANK1", "STEEL"]
    assert pick("zrmin=65&zvmin=50") == ["BANK1"]
    assert pick("zmax=500") == ["BANK1", "BANK2", "STEEL", "CHEM"]       # held to 100; BSEONLY has no score
    assert pick("zmin=70&zmax=30") == ["BANK2", "STEEL"]                 # swapped: 30 to 70
    assert pick("zfmin=abc") == pick("")


def test_five_trend_words():
    assert pick("st5=su") == ["BANK1"] and pick("st5=u") == ["BANK2"] and pick("st5=s") == ["CHEM"] and pick("st5=d") == ["STEEL"]
    assert pick("lt5=sd") == ["STEEL"] and pick("st5=su,u&lt5=d") == ["BANK2"]


def test_facets_count_each_option_with_the_other_filters_on():
    f = api._facets(ROWS, api._tests(api._bar(_req("macro=Commodities&pl=weak")), None))
    assert dict(f["macros"]) == {"Commodities": 1}                      # its own pick left out of its counts: Financial Services has no Weak company
    assert dict(f["nsecs"]) == {"Metals & Mining": 1}
    assert f["ratings"] == {"strong": 0, "healthy": 0, "average": 0, "weak": 1, "poor": 1, "notrated": 0}
    g = api._facets(ROWS, api._tests(api._bar(_req("")), None))
    assert dict(g["industries"]) == {"Banks": 2, "Ferrous Metals": 1, "Chemicals & Petrochemicals": 1}
    assert g["macros"] == [("Commodities", 2), ("Financial Services", 2)]   # most first, then by name
    assert g["trend"]["st"] == {"su": 1, "u": 1, "s": 1, "d": 1, "sd": 0} and g["trend"]["lt"]["sd"] == 1


def test_classification_is_joined_onto_each_row_once():
    class Conn:
        async def fetch(self, _sql):
            return [{"symbol": "A", "macro_sector": "Energy", "sector": "Oil, Gas & Consumable Fuels", "industry": "Petroleum Products"}]

    class Acq:
        async def __aenter__(self):
            return Conn()

        async def __aexit__(self, *a):
            return False

    store = SimpleNamespace(pool=SimpleNamespace(acquire=lambda: Acq()))
    api._CLS.update({"at": 0.0, "map": {}})
    a, b = {"symbol": "A"}, {"symbol": "B"}
    body = asyncio.run(api._with_classification(store, {"rows": [a], "exportRows": [a, b]}))
    assert (a["cls_macro"], a["cls_sector"], a["cls_industry"]) == ("Energy", "Oil, Gas & Consumable Fuels", "Petroleum Products")
    assert (b["cls_macro"], b["cls_sector"], b["cls_industry"]) == (None, None, None) and body["rows"][0] is a
    api._CLS.update({"at": 0.0, "map": {}})


# ---------------------------------------------------------------------------------------------------------------- SPEC §5: size screens name their range
def test_size_screens_name_their_range_from_the_site_size_lines():
    from finlit.presets import registry
    assert registry.BY_ID["highest-rated-large"].card_text.startswith("Large caps (above ₹75,000 Cr) with")
    assert registry.BY_ID["highest-rated-mid"].card_text.startswith("Mid caps (₹25,000–75,000 Cr) with")
    assert registry.BY_ID["highest-rated-small"].how_it_works[0].startswith("Small caps (₹10,000–25,000 Cr) of ₹1,000 Cr")
    assert registry.BY_ID["highest-rated-micro"].how_it_works[0].startswith("Micro caps (below ₹10,000 Cr) of ₹1,000 Cr")
    assert not any("{range}" in p.card_text or any("{range}" in h for h in p.how_it_works) for p in registry.ALL)
    # the lines are the site's one rule (finlit/sizes.py, task #262)
    assert [registry.size_range(b) for b in ("Large", "Mid", "Small", "Micro")] == ["above ₹75,000 Cr", "₹25,000–75,000 Cr", "₹10,000–25,000 Cr", "below ₹10,000 Cr"]


def test_highest_rated_micro_caps_is_listed_with_the_micro_size():
    from finlit.presets import registry
    from finlit.screener.catalog import CAPS
    assert ("highest-rated-micro" in registry.BY_ID) == ("Micro" in CAPS) == registry.has_size("Micro")
    assert "highest-rated-micro" in registry._PLAIN                          # its words are ready for the day the size appears
    top = [p.id for p in registry.ADVANCED if p.group == "top-rated"]
    assert top[:4] == ["highest-rated-large", "highest-rated-mid", "highest-rated-small", "highest-rated-micro"]
