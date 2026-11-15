"""NBFC financial leverage (model 3.6.13, owner 15 November 2026): FinEdge sends no NPA ratios for NBFCs, so an NBFC with neither Gross NPA nor Net NPA
uses financial leverage (total assets / equity, 10x or more = 0, 4x or less = 100) in those two Quality slots, their weights added. Banks are unchanged."""
import json
from pathlib import Path
import pytest
from backend.premium_engine import score_company
from backend.premium_model_config import MODEL_VERSION
from backend.premium_presentation import build_report_review
from backend.premium_trace import build_calculation_trace


def inputs(**kw):
    d = json.loads(Path(__file__).with_name('premium_example.json').read_text())
    d.update(loans_now=120, loans_1y_ago=100, gross_npa_pct=None, net_npa_pct=None, capital_adequacy_pct=None, profit_before_tax=400, interest_cost=100,
             total_assets=7000, net_worth=1000, industry_median_pb=2, own_5y_median_pb=2)
    d.update(kw)
    return d


def run(d, group='NBFC'):
    result = score_company(d, group)
    return result, {r['metric']: r for r in result['metrics']}


def test_version():
    assert MODEL_VERSION == "3.6.13"


@pytest.mark.parametrize('assets,points', [(10000, 0), (12000, 0), (7000, 50), (4000, 100), (3000, 100), (5500, 75)])
def test_nbfc_without_npa_scores_leverage_in_both_npa_slots(assets, points):
    result, r = run(inputs(total_assets=assets))
    lev = r['FINANCIAL_LEVERAGE']
    assert lev['value'] == pytest.approx(assets / 1000) and lev['points'] == pytest.approx(points)
    assert lev['weight'] == 50 and lev['status'] == 'A' and lev['fallbackFor'] == 'GROSS_NPA,NET_NPA' and (lev['worst'], lev['best']) == (10, 4)
    assert 'GROSS_NPA' not in r and 'NET_NPA' not in r
    quality = {m: row['weight'] for m, row in r.items() if row['part'] == 'quality'}
    assert quality == {'FINANCIAL_LEVERAGE': 50, 'INTEREST_COVER': 25, 'ROA': 25}
    assert sum(i['pointsEarned'] for i in result['metrics']) - result['capPointsLost'] == pytest.approx(result['final'])


def test_reported_leverage_is_preferred():
    _, r = run(inputs(financial_leverage=5.0, financial_leverage_source='FinEdge reported financial leverage'))
    assert r['FINANCIAL_LEVERAGE']['value'] == 5.0 and r['FINANCIAL_LEVERAGE']['points'] == pytest.approx(5 / 6 * 100)
    assert r['FINANCIAL_LEVERAGE']['details']['source'] == 'FinEdge reported financial leverage'


@pytest.mark.parametrize('gross,net', [(2, .5), (2, None), (None, .5)])
def test_any_reported_npa_keeps_the_npa_slots(gross, net):
    _, r = run(inputs(gross_npa_pct=gross, net_npa_pct=net))
    assert 'FINANCIAL_LEVERAGE' not in r
    assert r['GROSS_NPA']['weight'] == 25 and r['NET_NPA']['weight'] == 25


def test_bank_without_npa_is_unchanged():
    _, r = run(inputs(), 'BANK')
    assert 'FINANCIAL_LEVERAGE' not in r and r['GROSS_NPA']['status'] == 'F' and r['NET_NPA']['status'] == 'F'


def test_non_positive_equity_is_invalid_not_scored():
    result, r = run(inputs(net_worth=-50))
    lev = r['FINANCIAL_LEVERAGE']
    assert lev['status'] == 'L' and lev['points'] is None and lev['details']['invalid']
    assert 'GROSS_NPA' not in r


def test_no_assets_falls_back_to_filled_npa_rows():
    _, r = run(inputs(total_assets=None))
    assert 'FINANCIAL_LEVERAGE' not in r and r['GROSS_NPA']['status'] == 'F'


def test_review_and_trace_explain_the_replacement():
    d = inputs()
    result, _ = run(d)
    review = build_report_review({'rating': result, 'inputMeta': {}, 'statementType': 'consolidated'})
    item = next(i for b in ('pros', 'cons', 'mixed') for p in review['parts'] for i in p.get(b, []) if i['metric'] == 'FINANCIAL_LEVERAGE')
    assert item['label'] == 'Financial leverage (NPA ratios unavailable)' and 'NBFC' in item['summary']
    assert any('not reported by the data provider for NBFCs' in n for n in review['notes'])
    assert not any(n.startswith('Insurance financial leverage') for n in review['notes'])
    trace = build_calculation_trace(d, result, {})
    row = next(i for i in trace['metrics'] if i['metric'] == 'FINANCIAL_LEVERAGE')
    assert 'at or above 10x = 0' in row['pointsCalculation'] and 'Replaces unavailable GROSS_NPA,NET_NPA' in row['valueCalculation'] and '7,000 / 1,000 = 7x' in row['valueCalculation']
