"""Interest cover (model 3.6.20, owner, task #199). The interest cover is FinEdge's reported trailing-12-month interest coverage,
the figure the company report shows (section 9: Nestle 37.65x, ABB 131.07x), and it is scored for every company, low-debt ones included (the v3.6
rule that left it unscored below debt / equity 0.1 is retired). Without a reported figure the latest full year's (PBT + interest) / interest is used."""
import json
from datetime import date
from pathlib import Path
import pytest
from backend.premium_data import adapt_inputs
from backend.premium_engine import score_company
from backend.premium_presentation import build_report_review
from backend.premium_trace import build_calculation_trace
import sys
sys.path.insert(0, str(Path(__file__).parent))
from test_premium_input_assembly import replay, new_report  # noqa: F401,E402


def inputs(**kw):
    d = json.loads(Path(__file__).with_name('premium_example.json').read_text())
    d.update(kw)
    return d


def cover_row(result):
    return next(r for r in result['metrics'] if r['metric'] == 'INTEREST_COVER')


def test_debt_free_company_scores_the_reported_ttm_interest_cover():
    # Nestle-like: debt / equity 0, FinEdge TTM interest coverage 37.65x (the company report's figure); the latest year's own calculation differs
    data = inputs(total_debt=0, net_worth=1000, profit_before_tax=900, interest_cost=30, interest_cover_reported=37.65,
                  interest_cover_source='FinEdge reported interest coverage (trailing 12 months)')
    result = score_company(data, 'MFG')
    row = cover_row(result)
    assert row['status'] == 'A' and row['value'] == pytest.approx(37.65) and row['points'] == pytest.approx(100.0) and row['share'] > 0
    assert row['details']['source'] == 'FinEdge reported interest coverage (trailing 12 months)'
    review = build_report_review({'rating': result, 'inputMeta': {}, 'statementType': 'consolidated'})
    item = next(i for p in review['parts'] for b in ('pros', 'cons', 'mixed') for i in p[b] if i['metric'] == 'INTEREST_COVER')
    assert item['comparisonText'] == 'Source: FinEdge reported interest coverage (trailing 12 months).'
    trace = build_calculation_trace(data, result, {})
    assert 'same figure as the company report' in next(i for i in trace['metrics'] if i['metric'] == 'INTEREST_COVER')['valueCalculation']


def test_low_debt_is_no_longer_not_applicable():
    row = cover_row(score_company(inputs(total_debt=10, net_worth=1000, profit_before_tax=1, interest_cost=5, interest_cover_reported=1.2), 'MFG'))
    assert row['status'] == 'A' and row['value'] == pytest.approx(1.2) and row['points'] is not None


def test_without_a_reported_figure_the_latest_year_is_calculated_and_named():
    row = cover_row(score_company(inputs(total_debt=500, net_worth=1000, profit_before_tax=400, interest_cost=100), 'MFG'))
    assert row['status'] == 'A' and row['value'] == pytest.approx(5.0) and row['details']['source'].startswith('Calculated: latest full year')


def test_zero_interest_still_gets_full_points():
    row = cover_row(score_company(inputs(total_debt=0, net_worth=1000, profit_before_tax=400, interest_cost=0), 'MFG'))
    assert row['points'] == 100.0


def test_a_low_cover_alert_now_applies_to_every_company():
    result = score_company(inputs(total_debt=10, net_worth=1000, profit_before_tax=1, interest_cost=5, interest_cover_reported=1.2), 'MFG')
    assert "Interest cover is below 1.5 times." in result['alerts']


def test_adapter_reads_the_ttm_row_of_finedge_li_ratios():
    li = json.loads((Path(__file__).parents[3] / 'backend/tests/fixtures/finedge/ratios_reliance_ratio_type_li.json').read_text())
    raw = {"liquidity": li, "profile": {"industry": "Packaged Foods", "sector": "FMCG"}}
    d = adapt_inputs(raw, "RELIANCE", date(2026, 11, 16), "consolidated")[0]
    assert d["interest_cover_reported"] == 8.85 and d["interest_cover_source"] == "FinEdge reported interest coverage (trailing 12 months)"


def test_lenders_keep_their_own_interest_cover():
    li = {"ratios": [{"header": "TTM", "interestCoverage": 3.3, "year": 2026}]}
    raw = {"liquidity": li, "profile": {"industry": "Banks", "sector": "Financial Services"}}
    d = adapt_inputs(raw, "BANKX", date(2026, 11, 16), "consolidated")[0]
    assert d["interest_cover_reported"] is None


def test_kept_inputs_from_before_the_li_ratios_are_fetched_again():
    from backend import premium_cache
    assert premium_cache.INPUTS_VERSION == 5     # inputs kept without "liquidity" (FinEdge li: interest coverage) are refused


def test_the_real_pipeline_reads_finedge_ttm_interest_coverage(replay):  # noqa: F811
    """Recorded TCS run: the li answer travels resolver -> adapter -> engine; the row shows FinEdge's TTM figure, not the yearly calculation."""
    import gzip
    fixture, _ = replay("TCS")
    rec = json.load(gzip.open(Path(__file__).parent / "fixtures/premium_replay/TCS.json.gz"))["recorded"]
    li = next(v for k, v in rec.items() if json.loads(k)[0] == "/ratios/TCS" and json.loads(k)[1].get("ratio_type") == "li")
    rows = li.get("ratios") if isinstance(li, dict) else li
    ttm = next(r["interestCoverage"] for r in rows if str(r.get("header", "")).upper() == "TTM" and r.get("interestCoverage") is not None)
    report, _, _ = new_report(fixture)
    row = next(r for r in report["rating"]["metrics"] if r["metric"] == "INTEREST_COVER")
    assert report["inputs"]["interest_cover_reported"] == ttm and row["value"] == pytest.approx(ttm) and row["status"] == "A"
