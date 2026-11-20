"""Task #257 (Basic screener pack, SPEC 2 and 3): an open Basic screen uses the same NSE levels as the Advanced one (task #258: cls_macro / cls_sector /
cls_industry joined onto every row, ?macro / nsec / indu), plus the FinLit IQ panel: the rating in three groups (?iqg=good,below,nr) with their counts, and
0-100 from-to ranges for the FinLit IQ (o) and its five scores (pq pg pp pb pt)."""
import inspect
from types import SimpleNamespace

from starlette.datastructures import QueryParams

from finlit.presets import api


def req(q: str = ""):
    return SimpleNamespace(query_params=QueryParams(q))


ROWS = [
    {"symbol": "HDFCBANK", "cls_macro": "Financial Services", "cls_sector": "Financial Services", "cls_industry": "Banks", "overall": 81, "pillar_quality": 70, "pillar_technical": 40},
    {"symbol": "BAJFIN", "cls_macro": "Financial Services", "cls_sector": "Financial Services", "cls_industry": "Finance", "overall": 64, "pillar_quality": 55, "pillar_technical": 90},
    {"symbol": "INFY", "cls_macro": "Information Technology", "cls_sector": "Information Technology", "cls_industry": "IT - Software", "overall": 50, "pillar_quality": 80, "pillar_technical": 60},
    {"symbol": "NEWCO", "cls_macro": None, "cls_sector": None, "cls_industry": None, "overall": None},
]


def run(q: str):
    t = api._tests(api._bar(req(q)), None)
    return [r["symbol"] for r in ROWS if api._passes(r, t)], api._facets(ROWS, t)


def test_rating_groups():
    assert [api.iq_group(r) for r in ROWS] == ["good", "good", "below", "nr"]
    assert run("iqg=good")[0] == ["HDFCBANK", "BAJFIN"]
    assert run("iqg=below,nr")[0] == ["INFY", "NEWCO"]
    assert run("iqg=bogus")[0] == [r["symbol"] for r in ROWS]                          # an unknown group is ignored


def test_score_ranges_on_the_iq_and_its_parts():
    assert run("pqmin=60")[0] == ["HDFCBANK", "INFY"]
    assert run("ptmin=50&ptmax=70")[0] == ["INFY"]
    assert run("omin=-20&omax=500")[0] == ["HDFCBANK", "BAJFIN", "INFY"]               # held to 0-100; a blank score never passes a range
    assert run("omin=abc")[0] == [r["symbol"] for r in ROWS]                           # unreadable = no limit


def test_counts_leave_out_their_own_filter():
    _, fc = run("iqg=good&pqmin=60")
    assert fc["iqGroups"] == {"good": 1, "below": 1, "nr": 0}
    _, fc = run("indu=Banks&iqg=good")
    assert dict(fc["industries"]) == {"Banks": 1, "Finance": 1}                        # its own level: every name the other filters leave
    assert dict(fc["macros"]) == {"Financial Services": 1}


def test_levels_on_basic_screens_too():
    assert run("macro=Financial+Services&iqg=below")[0] == []
    src = inspect.getsource(api.detail)
    assert "_with_classification" in src and 'p.tab != "basic"' not in src            # the classification is joined on every screen
