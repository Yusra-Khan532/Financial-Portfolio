"""Task #64, 14 Nov N-28 / N-34: the Sector and industry filter shows NSE's sectors only. A company with no NSE industry used to send its own label
as a sector ("Auto Components", "Industries"), which showed as an extra sector holding one company."""
import json

from finlit.screener.data import Table, nse_pairs


def _row(sym, sector, macro=None, industry=None):
    return {"symbol": sym, "name": sym, "sector": sector, "macro_sector": macro, "industry": industry, "band": None, "metrics": json.dumps({"market_cap": 1000})}


def test_a_company_without_an_nse_industry_gets_no_sector_and_the_rest_follow_the_catalog():
    t = Table([_row("PHARMA1", "Pharmaceuticals", "Healthcare", "Pharmaceuticals & Biotechnology"),
               _row("PHARMA2", "Pharmaceuticals", "Healthcare", "Pharmaceuticals & Biotechnology"),
               _row("ODD", "Auto Components")], {}, {})
    got = nse_pairs(t)
    assert got == {"PHARMA1": ("Healthcare", "Pharmaceuticals & Biotechnology"), "PHARMA2": ("Healthcare", "Pharmaceuticals & Biotechnology")}
    assert "Auto Components" not in {s for s, _ in got.values()}
