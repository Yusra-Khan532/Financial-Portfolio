"""Task #243 (screeners update pack v4, section L): the figures of a screen's past lists, worked out only from its saved lists. The cases are the pack's own:
MENONBE as on 16 Nov, NRL's compounding, the 12 Nov gap, and the companies the old spells said had left with 0 sessions on the list (L15)."""
from datetime import date

from finlit.presets import savedlists as sl

D11, D12, D13, D16, D17 = date(2026, 11, 11), date(2026, 11, 12), date(2026, 11, 13), date(2026, 11, 16), date(2026, 11, 17)
RUNS = [(D11, 108, "v14"), (D13, 155, "v15"), (D16, 150, "v15"), (D17, 145, "v15")]      # 13 Nov: rules updated
SNAPS = [
    (D11, "SBC", 40.0), (D11, "OLD", 10.0), (D11, "544310", 100.0),
    (D13, "SBC", 41.0), (D13, "MENONBE", 366.85), (D13, "NRL", 172.10), (D13, "544310", 101.0),
    (D16, "SBC", 42.0), (D16, "MENONBE", 355.30), (D16, "NRL", 174.00), (D16, "544310", 102.0),
    (D17, "SBC", 43.0), (D17, "NRL", 190.96), (D17, "544310", 103.0), (D17, "NEWCO", 50.0),
]
BENCH = {"2026-11-11": 100.0, "2026-11-12": 100.5, "2026-11-13": 101.0, "2026-11-14": 0, "2026-11-16": 101.1, "2026-11-17": 101.4}
BENCH.pop("2026-11-14")     # a Saturday has no close
L = sl.build(RUNS, SNAPS)


def test_menonbe_as_on_16_nov_since_added_and_since_then_add_up():
    f = sl.row_figures(L, "MENONBE", D16, latest_price=346.00, bench=BENCH)
    assert f["added_on"] == "2026-11-13" and f["lists_on"] == 2
    assert f["since_added_pct"] == -3.148 and round(f["since_added_pct"], 1) == -3.1   # 355.30 / 366.85 - 1: the pack's -3.1%
    assert f["since_then_pct"] == -2.618 and round(f["since_then_pct"], 1) == -2.6    # 346.00 / 355.30 - 1: the pack's -2.6%
    whole = (1 + f["since_added_pct"] / 100) * (1 + f["since_then_pct"] / 100) - 1
    assert round(whole * 100, 1) == round((346.00 / 366.85 - 1) * 100, 1)   # the two make the whole run
    assert f["price_added"] == 366.85 and f["price_on"] == 355.30 and f["price_latest"] == 346.00
    assert f["bench_since_added_pct"] == sl.pct(101.0, 101.1) and f["bench_since_then_pct"] == sl.pct(101.1, 101.4)


def test_since_added_compounds_each_days_move_never_adds_them():
    f = sl.row_figures(L, "NRL", D17, latest_price=None, bench=BENCH)
    assert round(f["since_added_pct"], 2) == 10.96              # 190.96 / 172.10 - 1, the pack's figure
    assert round(((1.0110 * 1.0975) - 1) * 100, 1) == 11.0 and round(1.10 + 9.75, 2) == 10.85   # adding the moves would give 10.85
    assert "since_then_pct" not in f                           # the latest list has no Since then (pack P5)
    assert round(sl.pct(100, 100 * 1.05 * 0.99 * 1.02 * 0.99 * 1.05), 1) == 10.2     # +5, -1, +2, -1, +5 compounds to +10.2%


def test_added_is_the_start_of_the_unbroken_run_across_a_rules_change():
    assert sl.run_start(L, "SBC", D17) == (D11, 4)              # L8: runs carry across the 13 Nov rules change
    assert sl.row_figures(L, "SBC", D17, None, BENCH)["added_baseline"] is True   # "first saved list"
    assert sl.run_start(L, "544310", D17) == (D11, 4)           # L15: on all four saved lists, so Added 11 Nov (the spells said 13 Nov)
    assert sl.run_start(L, "NEWCO", D17) == (D17, 1)
    assert sl.run_start(L, "MENONBE", D17) == (None, 0)          # not on the 17 Nov list


def test_joined_and_left_against_the_previous_saved_list():
    assert sl.joined_left(L, D17) == (["NEWCO"], ["MENONBE"], D16)
    assert sl.joined_left(L, D13) == (["MENONBE", "NRL"], ["OLD"], D11)
    assert sl.joined_left(L, D11) == ([], [], None)


def test_the_date_menu_lists_each_saved_list_and_shows_12_nov_as_not_saved():
    v = sl.sessions_view(L, BENCH)
    assert [(r["date"], r["status"]) for r in v] == [("2026-11-17", "latest"), ("2026-11-16", "saved"), ("2026-11-13", "rules"), ("2026-11-12", "not_saved"), ("2026-11-11", "first")]
    top = v[0]
    assert top["count"] == 145 and top["joined"] == 1 and top["left"] == 1 and top["prev"] == "2026-11-16"
    assert v[3]["saved"] is False and v[3]["count"] is None
    assert v[4]["joined"] is None                               # the first saved list has nothing to compare with


def test_left_the_list_follows_the_date_and_uses_only_saved_lists():
    on17 = sl.left_rows(L, D17, "on", {("MENONBE", "2026-11-17"): "Momentum score below the cut-off"})
    assert [(r["symbol"], r["added_on"], r["left_on"], r["lists_on"]) for r in on17] == [("MENONBE", "2026-11-13", "2026-11-17", 2)]
    assert on17[0]["change_pct"] == sl.pct(366.85, 355.30) and on17[0]["reason"] == "Momentum score below the cut-off"
    upto16 = sl.left_rows(L, D16, "upto")
    assert [(r["symbol"], r["left_on"]) for r in upto16] == [("OLD", "2026-11-13")]      # nothing that left after 16 Nov (L9)
    after13 = sl.left_rows(L, D13, "after")
    assert [r["symbol"] for r in after13] == ["MENONBE"]          # of 13 Nov's companies, only MENONBE left later
    assert sl.left_rows(L, D11, "on") == []                        # nothing to compare the first list with
    for r in upto16 + after13 + on17:
        assert r["lists_on"] >= 1                                   # L15: never "0 sessions on the list"


def test_a_missing_price_gives_no_return_never_a_guess():
    l2 = sl.build([(D16, 1, "v"), (D17, 1, "v")], [(D16, "X", None), (D17, "X", 10.0)])
    f = sl.row_figures(l2, "X", D17, None, {})
    assert f["since_added_pct"] is None and f["bench_since_added_pct"] is None
    assert sl.pct(0, 5) is None and sl.pct(None, 5) is None


def test_the_open_screens_filters_and_their_counts_given_the_other_filters():
    """Pack P4: Market cap, Sector, rating (Strong or Healthy / Strong only), New on this list, Ahead of NIFTY 500 since added, NSE-listed only. Each option's count
    is the rows it would leave with the OTHER filters that are on."""
    from types import SimpleNamespace
    from starlette.datastructures import QueryParams
    from finlit.presets import api
    rows = [
        {"symbol": "A", "sector": "Banks", "market_cap": 60000, "prism_final": 82, "added_on": "2026-11-17", "since_added_pct": 1.0, "bench_since_added_pct": 0.2},
        {"symbol": "B", "sector": "Banks", "market_cap": 20000, "prism_final": 70, "added_on": "2026-11-13", "since_added_pct": -1.0, "bench_since_added_pct": 0.5},
        {"symbol": "C", "sector": "IT", "market_cap": 5000, "prism_final": 50, "added_on": "2026-11-17", "since_added_pct": 3.0, "bench_since_added_pct": 0.2, "exchange": "BSE"},
    ]
    req = lambda qs: SimpleNamespace(query_params=QueryParams(qs))      # noqa: E731
    pick = lambda qs: [r["symbol"] for r in api._filtered(req(qs), rows, "2026-11-17")]   # noqa: E731
    assert pick("") == ["A", "B", "C"]
    assert pick("size=Large&size=Mid") == ["A", "B"] and pick("sector=IT") == ["C"]
    assert pick("rating=healthy") == ["A", "B"] and pick("rating=strong") == ["A"] and pick("strong=1") == ["A", "B"]   # the older link still works
    assert pick("new=1") == ["A", "C"] and pick("ahead=1") == ["A", "C"] and pick("nse=1") == ["A", "B"]
    assert pick("new=1&nse=1&size=Large") == ["A"]
    f = api._facets(rows, api._tests(api._bar(req("sector=Banks")), "2026-11-17"), "2026-11-17")
    assert f["sizes"] == {"Large": 1, "Mid": 1}                       # with Banks on, Small would leave nothing
    assert f["sectors"] == [("Banks", 2), ("IT", 1)]                   # the sector counts ignore the sector filter itself
    assert (f["strong"], f["strongOnly"], f["new"], f["ahead"], f["nse"], f["bse"]) == (2, 1, 1, 1, 2, 1)
    assert [r["symbol"] for r in api._filtered(req("new=1"), rows, None)] == []   # the first saved list has nothing "new"
