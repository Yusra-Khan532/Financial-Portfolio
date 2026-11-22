from datetime import date, timedelta
from backend.premium_completeness import build_input_completeness
from backend.premium_data import adapt_inputs
from backend.premium_engine import score_company


def _sessions(n, placeholders=(), bad_close=()):
    rows, day, i = [], date(2026, 10, 26), 0
    while len(rows) < n:
        if day.weekday() < 5:
            if i in placeholders:   # the provider's all-zero padding row for a day it has no record of
                rows.append({'quote_date': day.isoformat(), 'open_price': 0, 'close_price': 0, 'high_price': 0, 'low_price': 0, 'volume': 0})
            else:
                c = 0 if i in bad_close else 100 + (i % 7)
                rows.append({'quote_date': day.isoformat(), 'open_price': 100, 'close_price': c, 'high_price': 110, 'low_price': 90, 'volume': 1_000_000})
            i += 1
        day -= timedelta(days=1)
    return rows


def _inputs(rows):
    return adapt_inputs({'prices': {'symbol': 'X', 'price': rows}}, 'X', date(2026, 10, 26), 'consolidated')[0]


def test_all_zero_padding_rows_do_not_break_the_250_and_60_session_windows():
    d = _inputs(_sessions(300, placeholders={5, 40}))
    assert d['biggest_fall_pct'] is not None and d['trading_value_cr'] is not None
    assert d['risk_calculation']['sessions'] == 298 and d['risk_calculation']['invalidCloseLast250'] == 0


def test_a_zero_close_beside_real_volume_stays_a_bad_tick_and_the_reason_is_given():
    d = _inputs(_sessions(300, bad_close={10}))
    assert d['biggest_fall_pct'] is None and d['risk_calculation']['invalidCloseLast250'] == 1
    rep = {'inputs': d, 'rating': score_company(d, 'MFG'), 'inputMeta': {}}
    rows = {i['metric']: i for i in build_input_completeness(rep)['items']}
    assert '300 trading sessions' in rows['BIGGEST_FALL']['missingInputs'][0] and '1 of the latest 250' in rows['BIGGEST_FALL']['missingInputs'][0]


def test_short_history_reason():
    # 3.6.21 (task #318): under 120 sessions there is still no largest fall, and the reason names both windows
    d = _inputs(_sessions(100))
    rep = {'inputs': d, 'rating': score_company(d, 'MFG'), 'inputMeta': {}}
    rows = {i['metric']: i for i in build_input_completeness(rep)['items']}
    assert '100 trading sessions, 250 are needed, or at least 120 complete ones since listing' in rows['BIGGEST_FALL']['missingInputs'][0]


def test_largest_fall_since_listing_from_120_sessions():
    # 3.6.21 (task #318): a company listed under a year ago gets its largest fall over every session since listing
    d = _inputs(_sessions(171))
    assert d['biggest_fall_pct'] is not None and d['biggest_fall_sessions'] == 171
    row = next(r for r in score_company(d, 'MFG')['metrics'] if r['metric'] == 'BIGGEST_FALL')
    assert row['status'] == 'A' and row['details']['sessions'] == 171 and 'Since listing: 171 sessions' in row['details']['note']
    # a full year keeps the 250-session window and no since-listing note
    full = _inputs(_sessions(300))
    assert full['biggest_fall_sessions'] is None and full['biggest_fall_pct'] is not None
