from pathlib import Path

from backend.portfolio_report import parse_portfolio_pdf


def test_parse_upstox_portfolio_pdf_summary():
    pdf = Path(__file__).parents[1] / "portfolio_data" / "sources" / "realizedPnL_EQ_2026-04-01_To_2026-08-23_BR2287.pdf"

    report = parse_portfolio_pdf(pdf, "upstox.pdf")

    assert report["source"] == "pdf"
    assert report["profile"]["reportPeriod"] == "01 Apr 2026 – 23 Aug 2026"
    assert report["headline"]["grossPnl"] == "₹4,95,447.61"
    assert report["headline"]["netPnl"] == "₹4,57,612.61"
    assert report["charges"]["total"] == 37835.00
    assert report["summary"] == {"tradeCount": 375, "winningTrades": 314, "losingTrades": 60, "zeroPnlTrades": 1}
    assert report["metrics"][0]["value"] == "83.73%"
    assert report["charts"]["grossPnl"] == 495447.61
