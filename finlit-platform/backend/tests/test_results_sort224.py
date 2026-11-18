"""Task #224 (results update pack of 18 Nov, A1): every column of the Companies table sorts on the server, so a sort covers every page.
Numbers high to low (desc) or low to high; the company name A to Z (asc); verdict words by rank; a row with no figure always last."""
from finlit.results import SORTS, select


def row(sym, date="2026-11-10", **kw):
    base = {"symbol": sym, "date": date, "marketCap": 100.0, "status": "declared", "flagged": False, "verdict": None, "eps": None, "opm": None, "npm": None,
            "revenueQoQ": None, "operatingProfit": None, "opYoY": None, "opQoQ": None, "profitQoQ": None}
    return {**base, **kw}


def test_every_column_is_a_known_sort():
    for k in ("company", "revenueQoQ", "operatingProfit", "opYoY", "opQoQ", "opm", "profitQoQ", "npm", "eps", "verdict", "revenue", "revenueYoY", "netProfit", "profitYoY",
              "below52", "belowAth"):
        assert k in SORTS, k


def test_numbers_sort_both_ways_and_blanks_go_last():
    rows = [row("A", eps=5.0), row("B", eps=None), row("C", eps=12.5), row("D", eps=-1.0)]
    assert [r["symbol"] for r in select(rows, sort="eps", desc=True)] == ["C", "A", "D", "B"]
    assert [r["symbol"] for r in select(rows, sort="eps", desc=False)] == ["D", "A", "C", "B"]


def test_company_name_sorts_a_to_z():
    rows = [row("TCS"), row("INFY"), row("WIPRO")]
    assert [r["symbol"] for r in select(rows, sort="company", desc=False)] == ["INFY", "TCS", "WIPRO"]
    assert [r["symbol"] for r in select(rows, sort="company", desc=True)] == ["WIPRO", "TCS", "INFY"]


def test_verdicts_sort_by_rank_not_alphabet_and_none_last():
    rows = [row("A", verdict="Mixed"), row("B", verdict="Strong"), row("C", verdict=None), row("D", verdict="Poor"), row("E", verdict="Good"), row("F", verdict="Weak")]
    assert [r["verdict"] for r in select(rows, sort="verdict", desc=True)] == ["Strong", "Good", "Mixed", "Weak", "Poor", None]
    assert [r["verdict"] for r in select(rows, sort="verdict", desc=False)] == ["Poor", "Weak", "Mixed", "Good", "Strong", None]
