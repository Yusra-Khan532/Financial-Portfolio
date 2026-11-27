"""Task #283 (21 Nov 2026): FinLit IQ is retired and FinLit Prism is FinLit's only company score. Nothing the screeners offer to the browser (the ready-made
screens, their cards, columns, filters and words, the screener's filter catalogue, its ready-made screens and the query builder's ratio list) uses the retired
score's fields (overall, pillar_*) or its words; an older open-screen link's IQ parameters (?iqg=, ?omin= ... ?ptmax=) are ignored; and the retired addresses
answer 301 (the Basic stock screener, the IQ's glossary entries). Replaces task #257's tests of the Basic screen's IQ panel; its NSE levels stay covered here."""
import json
import re
from types import SimpleNamespace

from starlette.datastructures import QueryParams

from finlit import seo
from finlit.presets import api
from finlit.presets.registry import ALL, BY_ID, GROUPS, STD_ADVANCED, STD_RETURNS, STD_SECTOR
from finlit.screener.catalog import CATALOG, GROUPS as CAT_GROUPS, offered
from finlit.screener.ready import READY, public, shown_to

RETIRED = re.compile(r"\boverall\b|\bpillar_\w+|finlit\s*iq|\bIQ\b|\b(Mixed|Watch)\b", re.I)
RETIRED_KEY = re.compile(r"^(overall|pillar_\w+|score_change|iq_\w+)$")
PLANS = ("basic", "silver", "gold", "platinum", "admin")


def req(q: str = ""):
    return SimpleNamespace(query_params=QueryParams(q))


ROWS = [
    {"symbol": "HDFCBANK", "cls_macro": "Financial Services", "cls_sector": "Financial Services", "cls_industry": "Banks", "overall": 81, "pillar_quality": 70, "prism_final": 50},
    {"symbol": "BAJFIN", "cls_macro": "Financial Services", "cls_sector": "Financial Services", "cls_industry": "Finance", "overall": 64, "pillar_quality": 55, "prism_final": 82},
    {"symbol": "INFY", "cls_macro": "Information Technology", "cls_sector": "Information Technology", "cls_industry": "IT - Software", "overall": 50, "pillar_quality": 80, "prism_final": 70},
    {"symbol": "NEWCO", "cls_macro": None, "cls_sector": None, "cls_industry": None, "overall": None},
]


def run(q: str):
    t = api._tests(api._bar(req(q)), None)
    return [r["symbol"] for r in ROWS if api._passes(r, t)], api._facets(ROWS, t)


# ---------------------------------------------------------------------------------------------------------------- the ready-made screens
def _offered_text(p) -> str:
    """Everything a screen sends to the browser about itself: name, card, how it works, notes, i note, chips and its columns."""
    return json.dumps({"name": p.name, "card": p.card_text, "how": p.how_it_works, "notes": p.notes, "about": p.about,
                       "chips": [(c.label, c.description, c.how) for c in p.chips], "cols": [(c.key, c.label) for c in p.columns]})


def test_no_ready_made_screen_offered_to_the_browser_uses_the_retired_score():
    assert ALL and all(p.tab == "advanced" and not p.id.startswith("basic-") for p in ALL)
    for p in ALL:
        assert not any(RETIRED_KEY.match(c.key) for c in p.columns), p.id
        assert not RETIRED.search(_offered_text(p)), (p.id, RETIRED.search(_offered_text(p)))
        rules = " ".join([p.ql] + [r for r, _ in p.derived] + [f for f, _ in p.rank] + [f for f, _ in p.rank_score])
        assert not re.search(r"\boverall\b|\bpillar_|\biq_", rules), p.id                                        # nor any rule, order or rank score reads it
    for k, label, _f, _a, band in STD_ADVANCED + STD_RETURNS + STD_SECTOR:
        assert not RETIRED_KEY.match(k) and not RETIRED.search(label + " " + band), k
    assert not any(RETIRED.search(name) for _, name in GROUPS)


def test_the_card_figure_and_the_strong_filter_read_prism_only():
    assert api._score_figure("basic") == api._score_figure() == ("FinLit Prism", "prism_final")
    assert [api._strong(r) for r in ROWS] == [False, True, True, False]                 # 65 or more on Prism; HDFCBANK's 81 on the retired score does not count
    assert [api._strong_only(r) for r in ROWS] == [False, True, False, False]
    assert api._bands_now([{"key": "overall"}, {"key": "pillar_technical"}, {"key": "prism_final"}]) == [{"key": "prism_final"}]


def test_an_older_links_iq_parameters_are_ignored_and_no_iq_facet_is_sent():
    everyone = [r["symbol"] for r in ROWS]
    for q in ("iqg=good", "iqg=below,nr", "omin=60", "pqmin=60", "ptmin=50&ptmax=70", "omin=-20&omax=500", "pgmin=10&ppmax=90&pbmin=1"):
        got, fc = run(q)
        assert got == everyone, q
        assert "iqGroups" not in fc and not RETIRED.search(json.dumps(fc)), q
    assert "iqg" not in api._bar(req("iqg=good")) and set(api.SCORE_RANGES) == {"z", "zf", "zv", "zq", "zr"}
    assert run("zmin=65")[0] == ["BAJFIN", "INFY"]                                       # Prism's own range still filters


def test_nse_levels_filter_every_screen_and_their_counts_leave_out_their_own_level():
    assert run("macro=Financial+Services")[0] == ["HDFCBANK", "BAJFIN"]
    _, fc = run("indu=Banks&zmin=60")
    assert dict(fc["industries"]) == {"Finance": 1, "IT - Software": 1}                  # its own level left out; Prism 60+ given
    assert dict(fc["macros"]) == {}                                                       # Banks and Prism 60+: nobody


# ---------------------------------------------------------------------------------------------------------------- the screener's catalogue and ready-made screens
def test_no_catalogue_group_or_ready_made_screen_offered_to_any_plan_uses_the_retired_score():
    for plan in PLANS:
        groups = [gid for gid, _ in CAT_GROUPS if offered(plan, gid)]
        assert "model" not in groups, plan
        metrics = [m for m in CATALOG if m.group in groups]
        assert not [m.key for m in metrics if RETIRED_KEY.match(m.key) or RETIRED.search(m.label + " " + m.say)], plan
        screens = [public(r, None) for r in READY if shown_to(r, plan)]
        assert not RETIRED.search(json.dumps(screens)), plan
        assert all(r.score in ("", "prism") for r in READY) and (plan in ("basic", "silver")) == (not any(r.score for r in READY if shown_to(r, plan)))


# ---------------------------------------------------------------------------------------------------------------- the retired addresses
def test_the_retired_addresses_redirect_and_leave_the_sitemap():
    assert seo.redirect_for("score-screener") == seo.redirect_for("/score-screener/") == "/advanced-score-screener"
    assert seo.redirect_for("glossary/finlit-iq") == seo.redirect_for("glossary/finlit-score") == "/glossary/finlit-prism"
    assert seo.redirect_for("glossary/pillars-quality-growth-profitability-balance-sheet-technical") == "/glossary"
    assert seo.redirect_for("glossary/score-bands-strong-healthy-mixed-watch") == "/glossary"
    assert seo.redirect_for("advanced-score-screener") is None and seo.redirect_for("glossary/finlit-prism") is None
    assert "score-screener" not in seo.PUBLIC and seo.is_known("score-screener") is True
    xml = seo.sitemap_xml("https://finlitventures.com", [], __import__("datetime").date(2026, 11, 21))
    assert "/score-screener<" not in xml and "glossary/finlit-score" not in xml and "glossary/finlit-prism" in xml
    for p in seo.PUBLIC.values():
        assert not RETIRED.search(" ".join([p.title, p.description, p.h1, p.intro])), p.title
    assert BY_ID.get("basic-top-large") is None
