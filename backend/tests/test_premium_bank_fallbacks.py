import json
from pathlib import Path
from copy import deepcopy
import pytest
from backend.premium_engine import score_company
from backend.premium_model_config import GROUPS
from backend.premium_presentation import build_report_review
from backend.premium_trace import build_calculation_trace


def inputs():
    d = json.loads(Path(__file__).with_name('premium_example.json').read_text())
    d.update(loans_now=120,loans_1y_ago=100,gross_npa_pct=2,net_npa_pct=.5,capital_adequacy_pct=15,total_assets=10000,industry_median_pb=2,own_5y_median_pb=2)
    return d


def rows(d, group='BANK'):
    return {r['metric']:r for r in score_company(d,group)['metrics']}


def test_bank_uses_industry_pe_when_available_and_keeps_original_slot_weight():
    d=inputs(); r=rows(d)
    assert 'PE_VS_INDUSTRY' in r and 'PE_VS_HISTORY' not in r
    assert r['PE_VS_INDUSTRY']['weight']==30
    d['industry_median_pe']=None
    r=rows(d)
    assert 'PE_VS_INDUSTRY' not in r
    assert r['PE_VS_HISTORY']['status']=='A'
    assert r['PE_VS_HISTORY']['fallbackFor']=='PE_VS_INDUSTRY'
    assert r['PE_VS_HISTORY']['weight']==30
    result=score_company(d,'BANK')
    review=build_report_review({'rating':result,'inputMeta':{},'statementType':'consolidated'})
    factor=next(item for part in review['parts'] for bucket in ('pros','cons','mixed') for item in part[bucket] if item['metric']=='PE_VS_HISTORY')
    assert 'Company history is used' in factor['summary']
    trace=build_calculation_trace(d,result,{})
    assert 'Replaces unavailable PE_VS_INDUSTRY' in next(r for r in trace['metrics'] if r['metric']=='PE_VS_HISTORY')['valueCalculation']


@pytest.mark.parametrize('missing',[None,0,-1])
def test_bank_keeps_missing_industry_slot_if_history_also_unavailable(missing):
    d=inputs();d.update(industry_median_pe=missing,own_5y_median_pe=None)
    r=rows(d)
    assert r['PE_VS_INDUSTRY']['status']=='F'
    assert 'PE_VS_HISTORY' not in r


def test_bank_does_not_treat_a_zero_loss_score_as_missing_or_mutate_shared_config():
    before=deepcopy(GROUPS)
    d=inputs();d.update(eps_q=[-1]*14,industry_median_pe=None)
    r=rows(d)
    assert r['PE_VS_INDUSTRY']['status']=='Z' and r['PE_VS_INDUSTRY']['points']==0
    assert 'PE_VS_HISTORY' not in r
    score_company(inputs(),'BANK')
    assert GROUPS==before


def test_nbfc_does_not_use_bank_fallback():
    d=inputs();d['industry_median_pe']=None
    r=rows(d,'NBFC')
    assert r['PE_VS_INDUSTRY']['status']=='F'
    assert 'PE_VS_HISTORY' not in r


@pytest.mark.parametrize('capital',[0,12,18])
def test_reported_capital_adequacy_always_wins_even_when_zero(capital):
    d=inputs();d.update(capital_adequacy_pct=capital,profit_before_tax=900,interest_cost=100)
    r=rows(d)
    assert r['CAPITAL_ADEQUACY']['value']==capital
    assert 'INTEREST_COVER' not in r


@pytest.mark.parametrize('interest,pbt,value,points',[(100,100,2,0),(100,400,5,50),(100,700,8,100),(100,-100,0,0),(0,100,None,100)])
def test_bank_capital_fallback_uses_interest_cover_formula_scale_and_existing_slot(interest,pbt,value,points):
    d=inputs();d.update(capital_adequacy_pct=None,profit_before_tax=pbt,interest_cost=interest)
    result=score_company(d,'BANK');r={r['metric']:r for r in result['metrics']}
    assert 'CAPITAL_ADEQUACY' not in r
    cover=r['INTEREST_COVER']
    assert cover['value']==value and cover['points']==points
    assert cover['weight']==25 and cover['share']==.25
    assert cover['fallbackFor']=='CAPITAL_ADEQUACY' and cover['status']=='A'
    assert cover['unit']=='x' and (cover['worst'],cover['best'])==(2,8)
    assert result['coverage']['quality']==1
    assert result['parts']['quality']==pytest.approx(sum(r[m]['points'] for m in ['GROSS_NPA','NET_NPA','ROA','INTEREST_COVER'])/4)
    review=build_report_review({'rating':result,'inputMeta':{},'statementType':'consolidated'})
    part=review['parts'][2]
    item=next(i for b in ['pros','cons','mixed'] for i in part[b] if i['metric']=='INTEREST_COVER')
    assert item['label']=='Interest coverage (capital adequacy unavailable)'
    assert 'Used in place of unavailable capital adequacy' in item['summary']
    assert 'Capital adequacy is unavailable' in review['notes'][0]
    trace=build_calculation_trace(d,result,{})
    entry=next(i for i in trace['metrics'] if i['metric']=='INTEREST_COVER')
    assert 'Annual PBT + interest cost' in entry['valueCalculation']
    assert 'Replaces unavailable CAPITAL_ADEQUACY' in entry['valueCalculation']


@pytest.mark.parametrize('interest,pbt',[(None,100),(100,None),(None,None),(-10,100)])
def test_missing_capital_and_unusable_interest_inputs_keep_missing_data_fill(interest,pbt):
    d=inputs();d.update(capital_adequacy_pct=None,interest_cost=interest,profit_before_tax=pbt)
    r=rows(d)
    assert r['CAPITAL_ADEQUACY']['status']=='F'
    assert 'INTEREST_COVER' not in r
    assert score_company(d,'BANK')['coverage']['quality']==.75


def test_capital_fallback_is_bank_only_and_never_mutates_shared_model():
    before=deepcopy(GROUPS)
    d=inputs();d.update(capital_adequacy_pct=None,interest_cost=100,profit_before_tax=400,total_debt=0)
    r=rows(d,'NBFC')
    assert 'INTEREST_COVER' not in r and r['CAPITAL_ADEQUACY']['status']=='F'
    assert rows(d)['INTEREST_COVER']['points']==50
    assert GROUPS==before
