"""Each company's quarter against the typical company of its NSE industry (the final pages pack, boards 10 and 11): the verdicts the pack shows for its examples."""
from finlit import result_verdicts as rv


def setup_function(_):
    rv._BOARD.update(rel="test", ind={}, sec={})   # no Sector Pulse release: NSE industries as they are


def row(sym, sector, rev, profit, margin, net=10.0, has=True, status="declared"):
    return {"symbol": sym, "sector": sector, "hasNumbers": has, "status": status, "revenueYoY": rev, "profitYoY": profit, "npmChange": margin, "netProfit": net}


def peers(prefix, sector, n=6, rev=10.0, profit=10.0, margin=0.0):
    return [row(f"{prefix}{i}", sector, rev, profit, margin) for i in range(n)]


def test_the_balance_of_three_checks_gives_the_pack_verdicts(monkeypatch):
    monkeypatch.setattr(rv, "_classes", lambda: {**{f"P{i}": ("Pharma & Biotech", "Healthcare") for i in range(6)}, "DIVISLAB": ("Pharma & Biotech", "Healthcare"),
                                                 "A": ("Pharma & Biotech", "Healthcare"), "B": ("Pharma & Biotech", "Healthcare"), "C": ("Pharma & Biotech", "Healthcare"),
                                                 "D": ("Pharma & Biotech", "Healthcare"), "E": ("Pharma & Biotech", "Healthcare"), "F": ("Pharma & Biotech", "Healthcare")})
    rows = peers("P", "Healthcare") + [
        row("DIVISLAB", "Healthcare", 35.4, 63.6, 3.0),      # up up up
        row("A", "Healthcare", 30.0, 40.0, 0.0),             # up up flat
        row("B", "Healthcare", 30.0, 40.0, -2.0),            # up up down
        row("C", "Healthcare", 30.0, 10.0, -2.0),            # up flat down
        row("D", "Healthcare", 10.0, 10.0, -2.0),            # flat flat down
        row("E", "Healthcare", -20.0, -30.0, -2.0),          # down down down
        row("F", "Healthcare", -20.0, None, None, net=-5),   # a loss
    ]
    rv.add_verdicts(rows)
    v = {r["symbol"]: (r["verdict"], r["checks"]) for r in rows}
    assert v["DIVISLAB"] == ("Strong", {"rev": "up", "profit": "up", "margin": "up"})
    assert v["A"][0] == "Strong" and v["B"][0] == "Good" and v["C"][0] == "In line" and v["D"][0] == "Weak" and v["E"][0] == "Poor"
    assert v["F"] == ("Loss", {"rev": "down", "profit": "loss", "margin": "loss"})
    assert all(r["industry"] == "Pharma & Biotech" for r in rows)


def test_a_company_with_no_nse_industry_is_judged_in_its_broad_group_and_one_figure_is_not_enough(monkeypatch):
    monkeypatch.setattr(rv, "_classes", lambda: {})
    rows = peers("Q", "Information Technology") + [row("526433", "Information Technology", 30.0, 30.0, -2.0), row("ONE", "Information Technology", 30.0, None, None)]
    rv.add_verdicts(rows)
    r = {x["symbol"]: x for x in rows}
    assert r["526433"]["industry"] == "Information Technology (broad group)" and r["526433"]["verdict"] == "Good"
    assert r["ONE"]["verdict"] is None


def test_too_few_in_the_industry_falls_back_to_its_broad_group_and_the_industry_roll_up(monkeypatch):
    monkeypatch.setattr(rv, "_classes", lambda: {"S1": ("Small Ind", "Commodities"), "S2": ("Small Ind", "Commodities"), **{f"G{i}": ("Big Ind", "Commodities") for i in range(6)}})
    rows = peers("G", "Commodities") + [row("S1", "Commodities", 30.0, 30.0, 2.0), row("S2", "Commodities", 0.0, 0.0, 0.0, has=False, status="due")]
    rv.add_verdicts(rows)
    s1 = next(r for r in rows if r["symbol"] == "S1")
    assert s1["industry"] == "Small Ind" and s1["verdict"] == "Strong"          # judged against the broad group (the six at +10%)
    ind = {x["name"]: x for x in rv.industries(rows)}
    assert ind["Small Ind"] == {"name": "Small Ind", "companies": 2, "declared": 1, "withNumbers": 1, "medianRevenueYoY": 30.0, "medianProfitYoY": 30.0, "beat": 1, "judged": 1}
    assert ind["Big Ind"]["withNumbers"] == 6 and ind["Big Ind"]["judged"] == 6 and ind["Big Ind"]["beat"] == 0
    assert rv.verdict_counts(rows)["Strong"] == 1 and rv.verdict_counts(rows)["In line"] == 6


def test_the_page_is_never_sent_the_bands():
    import inspect
    from finlit import results
    src = inspect.getsource(results.quarter_results)
    assert "_BAND" not in src and "MIN_PEERS" not in src


def test_small_nse_industries_are_read_as_their_sector_pulse_group(monkeypatch):
    monkeypatch.setattr(rv, "_classes", lambda: {"GILLETTE": ("Personal Products", "Fast Moving Consumer Goods"), "INFY": ("IT - Software", "Information Technology")})
    monkeypatch.setattr(rv, "_sector_groups", lambda: ({"IT - Software": "IT - Software"}, {"Fast Moving Consumer Goods": "Fast Moving Consumer Goods"}))
    assert rv.industry_of("GILLETTE", "FMCG")[0] == "Fast Moving Consumer Goods"
    assert rv.industry_of("INFY", "Information Technology")[0] == "IT - Software"
    assert rv.industry_of("526433", "Information Technology")[0] == "Information Technology (broad group)"
