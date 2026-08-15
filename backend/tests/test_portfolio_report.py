from pathlib import Path

from backend.portfolio_report import parse_portfolio_pdf


def test_parse_upstox_portfolio_pdf_summary():
    pdf = Path(__file__).parents[1] / "portfolio_data" / "sources" / "7dc7a47d-55d2-41c2-8b1e-76d766b665b9.pdf"

    report = parse_portfolio_pdf(pdf, "upstox.pdf")

    assert report["source"] == "pdf"
    assert report["profile"]["reportPeriod"] == "01 Apr 2026 – 07 Aug 2026"
    assert report["headline"]["grossPnl"] == "₹4,09,161.80"
    assert report["headline"]["netPnl"] == "₹3,78,101.08"
    assert report["charges"]["total"] == 31060.72
    assert report["summary"]["tradeCount"] > 300
    assert report["tradeLedger"][0]["symbol"] == "ENDURANCE"
