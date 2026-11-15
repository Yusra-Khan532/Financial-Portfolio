"""Interest cover for low-debt companies (3.6.14). The owner's v3.6 rule leaves interest cover out of the score when debt / equity is below 0.1, but the
value is still worked out and shown (marked not scored), so the Prism report agrees with the interest coverage on the company page."""
import json
from pathlib import Path
import pytest
from backend.premium_engine import score_company
from backend.premium_presentation import build_report_review


def inputs(**kw):
    d = json.loads(Path(__file__).with_name('premium_example.json').read_text())
    d.update(kw)
    return d


def cover_row(result):
    return next(r for r in result['metrics'] if r['metric'] == 'INTEREST_COVER')


def test_low_debt_company_shows_interest_cover_but_does_not_score_it():
    low = score_company(inputs(total_debt=10, net_worth=1000, profit_before_tax=900, interest_cost=5), 'MFG')
    row = cover_row(low)
    assert row['status'] == 'N' and row['value'] == pytest.approx(181.0) and row['points'] is None and row['share'] == 0
    assert row['details']['shownNotScored'] is True
    # the score is exactly what it was when the value was left empty: interest cover adds nothing
    blank = score_company(inputs(total_debt=10, net_worth=1000, profit_before_tax=900, interest_cost=None), 'MFG')
    assert low['final'] == pytest.approx(blank['final']) and low['parts'] == pytest.approx(blank['parts'])
    review = build_report_review({'rating': low, 'inputMeta': {}, 'statementType': 'consolidated'})
    item = next(i for p in review['parts'] for i in p['notApplicable'] if i['metric'] == 'INTEREST_COVER')
    assert item['valueText'] == '181.00x' and 'not scored' in item['summary']


def test_low_debt_low_cover_raises_no_alert():
    result = score_company(inputs(total_debt=10, net_worth=1000, profit_before_tax=1, interest_cost=5), 'MFG')
    assert cover_row(result)['value'] == pytest.approx(1.2)
    assert "Interest cover is below 1.5 times." not in result['alerts']


def test_indebted_company_is_scored_as_before():
    row = cover_row(score_company(inputs(total_debt=500, net_worth=1000, profit_before_tax=400, interest_cost=100), 'MFG'))
    assert row['status'] == 'A' and row['value'] == pytest.approx(5.0) and row['points'] is not None
