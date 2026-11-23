"""Task #350 (23 Nov 2026): the Mutual Fund Screener filters by the FinLit Mutual Fund Score, the total and each of its four parts, each on its own and all
together (AND). The parser and the SQL it adds; Gold only and never shared-cached is checked through the API in finlit/mf.py (list_funds, filters)."""

import pytest

from finlit.mfscreen import spec
from test_mf_screen import CTX, QP


def parse(*pairs):
    return spec.parse(QP(pairs), CTX)


def sc_sql(scr):
    w, args = spec.where([p for p in scr.preds if p.group.startswith("sc:")])
    return w, args


def test_total_and_each_part_are_independent_filters_joined_with_and():
    scr = parse(("sc", "total:65:80"), ("sc", "risk:70:100"), ("sc", "cost:0:50"))
    assert scr.scores == {"total": (65.0, 80.0), "risk": (70.0, 100.0), "cost": (0.0, 50.0)}
    w, args = sc_sql(scr)
    assert w.count(" AND ") >= 2 and "sc.final" in w and "sc.risk" in w and "sc.cost" in w and "sc.perf" not in w
    assert "< $2" in w            # Healthy 65-80: up to, not including, 80 (80 is Strong)
    assert "<= $4" in w           # a part's Strong 70-100 includes 100
    assert args == [65.0, 80.0, 70.0, 100.0, 0.0, 50.0] or sorted(args) == sorted([65.0, 80.0, 70.0, 100.0, 0.0, 50.0])


def test_one_sided_and_cleared_ranges():
    assert parse(("sc", "total:80:")).scores == {"total": (80.0, None)}
    assert parse(("sc", "total::35")).scores == {"total": (None, 35.0)}
    assert parse(("sc", "total::")).scores == {}             # nothing set: no filter (clearing one leaves the others)
    assert parse().scores == {}


def test_the_total_takes_any_figure_but_a_part_only_its_band_edges():
    assert parse(("sc", "total:61.5:72.25")).scores == {"total": (61.5, 72.25)}
    with pytest.raises(spec.ScreenError, match="bands only"):
        parse(("sc", "perf:55:100"))                           # an exact part range would give the part's figure away
    assert parse(("sc", "quality:50:70")).scores == {"quality": (50.0, 70.0)}


@pytest.mark.parametrize("bad, msg", [("total:80:65", "not below"), ("total:-1:50", "0 to 100"), ("total:0:101", "0 to 100"), ("speed:0:50", "total, perf"),
                                      ("total:50", "total, perf"), ("total:50:50", "not below")])
def test_bad_ranges_are_refused(bad, msg):
    with pytest.raises(spec.ScreenError, match=msg):
        parse(("sc", bad))


def test_a_field_twice_or_too_many_ranges_is_refused():
    with pytest.raises(spec.ScreenError, match="twice"):
        parse(("sc", "total:0:50"), ("sc", "total:50:100"))
    with pytest.raises(spec.ScreenError, match="At most"):
        parse(*[("sc", f"total:0:{i}") for i in range(1, 8)])


def test_the_cache_key_follows_the_score_filters():
    a, b = parse(("sc", "total:65:80")), parse(("sc", "total:65:79"))
    assert a.key != b.key and parse().key != a.key
