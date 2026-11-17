"""Insurers (revenue names version 2, 17 November 2026; the model version stays 3.6.18). The production audit put 114 companies in "insufficient history", insurers among them (ICICIGI, NIACL,
STARHEALTH, CANHLIFE), and SBI Life showed "Not rated" with every part blank. FinEdge (read on the server, 17 Nov 2026):
  - SBILIFE, ICICIGI, STARHEALTH have NO consolidated statements (0 rows); their standalone ones are there.
  - life insurers name their revenue `netPremiumIncome`; general and health insurers (ICICIGI, NIACL, STARHEALTH) name it `premiumEarned`.
The insurance group read only `netPremium...` names, so general insurers had no sales at all, and the standalone switch counted revenue without any
insurance name, so an insurer without consolidated statements was rated on empty consolidated statements. These tests replay HDFC Life's recorded
answers in those two shapes; each fails before the fix."""
import copy
import json
import sys
from pathlib import Path

from backend.premium_data import recent_annual_run

sys.path.insert(0, str(Path(__file__).parent))
from test_premium_input_assembly import replay, new_report  # noqa: F401,E402


def _rows(answer):
    return answer.get("financials") if isinstance(answer, dict) else answer


def reshaped(fixture, *, no_consolidated=False, general=False, fees=False):
    """HDFC Life's recording with (no_consolidated) the standalone answers equal to the consolidated ones and every consolidated statement empty, as
    FinEdge answers for SBILIFE, ICICIGI and STARHEALTH; and/or (general) the revenue line named as a general insurer names it."""
    fixture = copy.deepcopy(fixture)
    rec = fixture["recorded"]
    if general or fees:
        for answer in rec.values():
            for row in (_rows(answer) or []) if isinstance(answer, (dict, list)) else []:
                if isinstance(row, dict) and "netPremiumIncome" in row:
                    row["revenueFromOperations" if fees else "premiumEarned"] = row.pop("netPremiumIncome")
    if no_consolidated:
        for key, answer in list(rec.items()):
            path, params = json.loads(key)
            if params.get("statement_type") == "c":
                rec.setdefault(json.dumps([path, {**params, "statement_type": "s"}], sort_keys=True), copy.deepcopy(answer))
        for key, answer in list(rec.items()):
            path, params = json.loads(key)
            if params.get("statement_type") == "c" and path.startswith("/financials/"):
                rec[key] = {**answer, "financials": []} if isinstance(answer, dict) else []
    return fixture


def metric(report, name):
    return next(r for r in report["rating"]["metrics"] if r["metric"] == name)


def test_the_recorded_life_insurer_has_its_premium_line_and_is_rated(replay):  # noqa: F811
    fixture, _ = replay("HDFCLIFE")
    report, _, _ = new_report(fixture)
    assert report["rating"]["group"] == "INSURANCE" and report["rating"]["status"] != "NOT RATED"
    assert metric(report, "SALES_GROWTH")["value"] is not None


def test_a_general_insurer_premium_earned_is_its_revenue(replay):  # noqa: F811
    """ICICIGI / NIACL / STARHEALTH: revenue is `premiumEarned`. Before the fix sales were empty: Sales growth, CAGR and streak had no data."""
    fixture, provider = replay("HDFCLIFE")
    provider.recorded = reshaped(fixture, general=True)["recorded"]
    report, _, _ = new_report(fixture)
    assert report["rating"]["status"] != "NOT RATED", report["rating"].get("notRatedReasons")
    for name in ("SALES_GROWTH", "SALES_CAGR", "SALES_STREAK"):
        assert metric(report, name)["status"] not in ("L", "F"), name
    same, _, _ = new_report(replay("HDFCLIFE")[0])          # the same figures as under their life-insurer name
    assert metric(report, "SALES_GROWTH")["value"] == metric(same, "SALES_GROWTH")["value"]


def test_an_insurer_without_consolidated_statements_uses_its_standalone_ones(replay):  # noqa: F811
    """SBILIFE: no consolidated rows. Before the fix the report stayed "Consolidated statements" on empty data and was NOT RATED with every part blank."""
    fixture, provider = replay("HDFCLIFE")
    provider.recorded = reshaped(fixture, no_consolidated=True)["recorded"]
    report, _, _ = new_report(fixture)
    assert report["statementType"] == "standalone"
    assert report["rating"]["status"] != "NOT RATED", report["rating"].get("notRatedReasons")
    assert metric(report, "SALES_GROWTH")["value"] is not None


def test_a_general_insurer_without_consolidated_statements_uses_its_standalone_ones(replay):  # noqa: F811
    """ICICIGI / STARHEALTH: both at once."""
    fixture, provider = replay("HDFCLIFE")
    provider.recorded = reshaped(fixture, no_consolidated=True, general=True)["recorded"]
    report, _, _ = new_report(fixture)
    assert report["statementType"] == "standalone"
    assert report["rating"]["status"] != "NOT RATED", report["rating"].get("notRatedReasons")
    assert metric(report, "SALES_CAGR")["status"] not in ("L", "F")


def test_no_consolidated_full_year_is_counted_by_profit_whatever_revenue_is_called():
    """The 'no consolidated statements at all' rule counts reported profit, so it does not depend on the name of the revenue line."""
    standalone = [{"period_start": f"{y}0401", "period_end": f"{y + 1}0331", "profitLossAfterTaxAndExtraordinaryItems": 100.0, "someNewRevenueName": 1.0}
                  for y in (2024, 2025)]
    assert recent_annual_run([]) == (0, None)
    assert recent_annual_run(standalone)[0] == 2


def test_an_insurance_group_company_without_premiums_uses_its_revenue_from_operations(replay):  # noqa: F811
    """MEDIASSIST (a claims administrator in the insurance group) earns fees and reports no premium line: its revenue from operations is its sales."""
    fixture, provider = replay("HDFCLIFE")
    provider.recorded = reshaped(fixture, fees=True)["recorded"]
    report, _, _ = new_report(fixture)
    assert report["rating"]["group"] == "INSURANCE" and report["rating"]["status"] != "NOT RATED", report["rating"].get("notRatedReasons")
    assert metric(report, "SALES_GROWTH")["value"] is not None
    assert "revenueFromOperations" in report["inputMeta"]["provenance"]["sales"]
