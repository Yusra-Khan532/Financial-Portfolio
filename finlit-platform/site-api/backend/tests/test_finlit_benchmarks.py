"""Task #160: FinLit's own industry median fills P/E (or P/B) vs industry only when FinEdge, Upstox and the FinEdge peer median give nothing."""
from copy import deepcopy
from datetime import date
from io import BytesIO
import json
from pathlib import Path

from pypdf import PdfReader
from backend import premium_service
from backend.benchmark_resolution import reported_benchmarks
from backend.premium_benchmarks import finlit_fallbacks
from backend.premium_pdf import render_premium_pdf

FIXTURE = json.loads((Path(__file__).parent / 'fixtures' / 'premium_stock_audit_2026_10_18.json').read_text())['stocks'][2]
FINLIT = [{'key': 'pe', 'value': 21.5, 'count': 38, 'scope': 'industry', 'group': 'Non Banking Financial Company (NBFC)', 'asOf': '2026-11-15'}]


def _report(monkeypatch, peer_result, fallback, upstox=({'name': 'P/E', 'sector_value': -12.64}, {'name': 'P/B', 'sector_value': 2.38})):
    raw = deepcopy(FIXTURE['raw'])
    raw['benchmarkObservations'] = reported_benchmarks([], list(upstox), '2026-11-15')
    monkeypatch.setattr('backend.premium_benchmarks.peer_benchmark', lambda *a, **k: peer_result)
    return premium_service.generate_report(None, FIXTURE['symbol'], 'Example', 'consolidated', 'a' * 32, '2026-11-15T12:00:00+00:00',
                                           lambda *a: (raw, [], 'consolidated', {}), None, fallback)


def _factor(report, metric):
    return next(item for part in report['review']['parts'] for bucket in ('pros', 'cons', 'mixed', 'unavailable') for item in part[bucket] if item['metric'] == metric)


def test_finlit_median_fills_pe_when_every_provider_is_empty(monkeypatch):
    # Upstox's sector P/E is negative (rejected) and the FinEdge peer list gave too few multiples: before the fix P/E vs industry was "Not available"
    peer_meta = {'metrics': {'industry_median_pe': {'value': None, 'provider': 'FinEdge', 'scope': 'industry', 'method': 'available peer median',
                                                    'positiveCount': 2, 'observedCount': 3, 'universeCount': 3}}}
    report = _report(monkeypatch, ({}, peer_meta), FINLIT)
    assert report['inputs']['industry_median_pe'] == 21.5
    assert report['inputs']['industry_median_pb'] == 2.38            # Upstox P/B is still used first
    info = report['inputs']['benchmark_details']['industry_median_pe']
    assert info['provider'] == 'FinLit' and info['peerAttempt']['positiveCount'] == 2
    pe = _factor(report, 'PE_VS_INDUSTRY')
    assert pe['label'] == 'P/E vs industry'
    assert 'Industry median: 21.50x across 38 companies in Non Banking Financial Company (NBFC)' in pe['comparisonText']
    assert 'Source: FinLit company data' in pe['comparisonText']
    assert 'Insufficient benchmark data' not in pe.get('summary', '')
    row = next(r for r in report['rating']['metrics'] if r['metric'] == 'PE_VS_INDUSTRY')
    assert row['status'] != 'F'                                       # a real comparison, not a group estimate
    text = '\n'.join(p.extract_text() for p in PdfReader(BytesIO(render_premium_pdf(report))).pages)
    flat = ' '.join(text.split())
    assert 'Industry median: 21.50x across 38 companies' in flat and 'Source: FinLit company data' in flat


def test_providers_and_peer_median_come_before_finlit(monkeypatch):
    peers = ({'industry_median_pe': 30}, {'metrics': {'industry_median_pe': {'value': 30, 'provider': 'FinEdge', 'scope': 'industry',
             'method': 'available peer median', 'positiveCount': 74, 'observedCount': 122, 'universeCount': 137}}})
    assert _report(monkeypatch, peers, FINLIT)['inputs']['industry_median_pe'] == 30
    upstox = ({'name': 'P/E', 'sector_value': 25}, {'name': 'P/B', 'sector_value': 2.38})
    report = _report(monkeypatch, ({}, {}), FINLIT, upstox)
    assert report['inputs']['industry_median_pe'] == 25
    assert report['inputs']['benchmark_details']['industry_median_pe']['provider'] == 'Upstox'


def test_without_finlit_median_the_reason_stays(monkeypatch):
    report = _report(monkeypatch, ({}, {}), None)
    assert 'industry_median_pe' not in report['inputs']
    row = next(r for r in report['rating']['metrics'] if r['metric'] == 'PE_VS_INDUSTRY')
    assert row['status'] == 'F'
    assert 'group estimate' in _factor(report, 'PE_VS_INDUSTRY')['summary']


def test_malformed_finlit_medians_are_dropped():
    asof = date(2026, 11, 15)
    bad = [{'key': 'pe', 'value': -3, 'count': 40, 'scope': 'industry', 'group': 'X'},
           {'key': 'pe', 'value': 20, 'count': 4, 'scope': 'industry', 'group': 'X'},
           {'key': 'pe', 'value': 20, 'count': 40, 'scope': 'galaxy', 'group': 'X'},
           {'key': 'pe', 'value': 20, 'count': 40, 'scope': 'industry', 'group': ''},
           {'key': 'roe', 'value': 20, 'count': 40, 'scope': 'industry', 'group': 'X'},
           'junk', None]
    assert finlit_fallbacks(bad, asof) == {}
    assert finlit_fallbacks(None, asof) == {}
    good = finlit_fallbacks(bad + [{'key': 'pb', 'value': '1.8', 'count': 12, 'scope': 'sector', 'group': 'Finance'}], asof)
    assert good['pb']['value'] == 1.8 and good['pb']['scope'] == 'sector' and good['pb']['asOf'] == '2026-11-15'
