"""Task #257 (Basic screener pack, SPEC 2 and 3, SHARED 1): the open ready-made screen filters on NSE's three levels (Macro sector, Sector, Industry; OR inside a
level, AND across levels), offers every level's names with counts that follow the other filters, and has the FinLit IQ panel's rating groups and 0-100 ranges."""
from types import SimpleNamespace

from starlette.datastructures import QueryParams

from finlit.presets import api


def req(q: str = ""):
    return SimpleNamespace(query_params=QueryParams(q))


ROWS = [
    {"symbol": "HDFCBANK", "nse_industry": "Banks", "overall": 81, "pillar_quality": 70, "pillar_technical": 40},
    {"symbol": "BAJFIN", "nse_industry": "Finance", "overall": 64, "pillar_quality": 55, "pillar_technical": 90},
    {"symbol": "INFY", "nse_industry": "IT - Software", "overall": 50, "pillar_quality": 80, "pillar_technical": 60},
    {"symbol": "NEWCO", "nse_industry": None, "overall": None},
]


def run(q: str):
    f = api._bar(req(q)); t = api._tests(f, None)
    return [r["symbol"] for r in ROWS if api._passes(r, t)], api._facets(ROWS, t)


def test_levels_from_nse_lists():
    assert api.nse_levels("Banks") == ("Financial Services", "Financial Services", "Banks")
    assert api.nse_levels("it software") == ("Information Technology", "Information Technology", "IT - Software")
    assert api.nse_levels("Not a name") == (None, None, None) and api.nse_levels(None) == (None, None, None)


def test_level_filters_or_inside_and_across():
    assert run("mac=Financial+Services")[0] == ["HDFCBANK", "BAJFIN"]
    assert run("nind=Banks&nind=IT+-+Software")[0] == ["HDFCBANK", "INFY"]
    assert run("mac=Financial+Services&nind=IT+-+Software")[0] == []


def test_level_counts_leave_out_their_own_level():
    _, fc = run("nind=Banks")
    assert fc["industries"] == {"Banks": 1, "Finance": 1, "IT - Software": 1}       # its own level: every name still counted
    assert fc["macros"] == {"Financial Services": 1}                                   # other levels follow the pick
    assert fc["nseSectors"] == {"Financial Services": 1}


def test_iq_groups_and_ranges():
    assert run("iqg=good")[0] == ["HDFCBANK", "BAJFIN"]
    assert run("iqg=nr")[0] == ["NEWCO"]
    assert run("iqg=below&iqg=nr")[0] == ["INFY", "NEWCO"]
    assert run("iqg=bogus")[0] == [r["symbol"] for r in ROWS]                         # an unknown group is ignored
    assert run("qmin=60")[0] == ["HDFCBANK", "INFY"]
    assert run("tmin=50&tmax=70")[0] == ["INFY"]
    assert run("omin=-20&omax=500")[0] == ["HDFCBANK", "BAJFIN", "INFY"]              # clamped to 0-100; a blank score never passes a range
    assert run("omin=abc")[0] == [r["symbol"] for r in ROWS]                          # unreadable = no limit
    _, fc = run("iqg=good&qmin=60")
    assert fc["iqGroups"] == {"good": 1, "below": 1, "nr": 0}
