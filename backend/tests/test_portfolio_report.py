from pathlib import Path

from backend.portfolio_report import parse_portfolio_pdf


def test_parse_upstox_portfolio_pdf_summary():
    pdf = Path(__file__).parents[1] / "portfolio_data" / "sources" / "realizedPnL_EQ_2026-04-01_To_2026-08-31_BR2287.pdf"

    report = parse_portfolio_pdf(pdf, "upstox.pdf")

    assert report["source"] == "pdf"
    assert report["profile"]["reportPeriod"] == "01 Apr 2026 – 31 Aug 2026"
    assert report["headline"] == {"grossPnl": "₹5,18,651.56", "netPnl": "₹4,78,887.85", "grossRoi": "17.29%", "netRoi": "15.96%"}
    assert report["charges"]["total"] == 39763.71
    assert report["charges"]["breakdown"] == {"sebiFees": 20.88, "turnoverCharges": 756.48, "brokerage": 14055.79, "dematTransactionCharges": 4520.0, "integratedGst": 3483.56, "securitiesTransactionTax": 15287.0, "stampDuty": 1640.0}
    assert report["summary"] == {"tradeCount": 391, "winningTrades": 327, "losingTrades": 62, "zeroPnlTrades": 2}
    assert report["metrics"][0]["value"] == "83.63%"
    assert report["metrics"][1]["value"] == "71 Days"
    assert report["charts"]["monthlyRealizedPnl"] == [{"month": "Apr 2026", "realizedPnl": 99050.85}, {"month": "May 2026", "realizedPnl": 121853.9}, {"month": "Jun 2026", "realizedPnl": 126245.03}, {"month": "Jul 2026", "realizedPnl": 45654.43}, {"month": "Aug 2026", "realizedPnl": 125847.35}]
    assert report["charts"]["grossPnl"] == 518651.56
    assert report["charts"]["cumulativeRealizedPnl"][-1]["realizedPnl"] == 518651.56
