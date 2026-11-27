"""Trading Lab > Strategy backtest (finlit/lab/backtest.py; docs/TRADING-LAB.md "Strategy backtest").

What must hold: each of market-lab's 23 rules fires on a series built to show its pattern, and not on the same series without it; a signal uses
only bars up to its own bar and the trade starts at the next bar's open; R = (exit - entry) / (entry - lower exit level), net of the stated
round-trip cost or gross; the worst run and the drawdown carry their dates; fewer than 30 trades is flagged; the coverage says the real years;
the route is for Lab members only, says 400/404 plainly, and is cached; nothing in the answer tells anyone to trade."""
import math
import re
from datetime import date, datetime, timedelta, timezone

import numpy as np
import orjson
import pytest

from finlit.lab import backtest as B
from test_auth import app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration


def days(n, start=date(2020, 1, 1)):
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def base(n=420, g=1.0015, wiggle=0.004, vol=1e6):
    """A calm uptrend with a small wobble (so some sessions fall), open at the previous close, a narrow range around each candle."""
    c = [100 * g ** i * (1 + wiggle * math.sin(i * 0.9)) for i in range(n)]
    o = [c[0]] + c[:-1]
    return {"t": days(n), "o": o, "h": [max(a, b) * 1.004 for a, b in zip(o, c)], "l": [min(a, b) * 0.996 for a, b in zip(o, c)], "c": c, "v": [vol] * n}


def bar(b, k, o=None, h=None, l=None, c=None, v=None):  # noqa: E741
    """Sets one candle; a new open or close without its own high or low gets a narrow range around its body."""
    for key, val in (("o", o), ("c", c), ("v", v)):
        if val is not None:
            b[key][k] = val
    if o is not None or c is not None:
        b["h"][k] = max(b["o"][k], b["c"][k]) * 1.003 if h is None else h
        b["l"][k] = min(b["o"][k], b["c"][k]) * 0.997 if l is None else l
    else:
        b["h"][k] = b["h"][k] if h is None else h
        b["l"][k] = b["l"][k] if l is None else l
    b["h"][k] = max(b["h"][k], b["o"][k], b["c"][k])
    b["l"][k] = min(b["l"][k], b["o"][k], b["c"][k])


def fires(rule, b, k=-1, nifty=None):
    f = B.features(b, nifty)
    return bool(np.asarray(B.SIGNALS[rule](f)[0])[k])


def F(b, nifty=None):
    return B.features(b, nifty)


# ------------------------------------------------------------------------------------------------------------------ the 23 rules
def test_there_are_23_rules_in_market_labs_order_each_naming_its_source():
    assert len(B.RULES) == 23 and len({r["id"] for r in B.RULES}) == 23
    assert [r["src"] for r in B.RULES] == ["s_breakout20", "s_breakout55", "s_52wk", "s_pullback20", "s_pullback50", "s_rsi2", "s_3down", "s_bb_low",
                                         "s_squeeze", "s_nr7", "s_inside", "s_flag", "s_ema_cross", "s_golden", "s_macd", "s_supertrend", "s_adx",
                                         "s_engulf", "s_hammer", "s_pocket", "s_gap_go", "s_vcp", "s_rs_leader"]
    src = open(B.__file__).read()
    assert "https://github.com/heysanjeevv/market-lab" in src and "MIT" in src
    for r in B.RULES:
        assert r["src"] in src.split('"""')[1], r["src"]        # named in the attribution at the top
        assert r["signal"] and r["lower"]


def test_breakouts_fire_on_a_close_above_the_earlier_high_and_not_without_it():
    for rule in ("breakout20", "breakout55"):
        b = base()
        bar(b, -1, c=max(b["h"][-60:-1]) * 1.03)
        assert fires(rule, b)
        b = base()
        bar(b, -1, c=b["c"][-2] * 0.99)
        assert not fires(rule, b)


def test_52_week_high_needs_the_volume_too():
    b = base()
    bar(b, -1, c=max(b["h"][-260:-1]) * 1.03, v=3e6)
    assert fires("high52", b)
    b["v"][-1] = 1.2e6
    assert not fires("high52", b)


def test_pullbacks_to_the_20_ema_and_the_50_sma():
    b = base()
    bar(b, -1, o=b["c"][-2] * 0.998, c=b["c"][-2] * 1.002)
    f = F(b)
    bar(b, -1, l=f["ema20"][-1] * 0.995)
    assert fires("pullback20", b)
    b2 = base()
    bar(b2, -1, o=b2["c"][-2] * 0.998, c=b2["c"][-2] * 1.002)
    assert not fires("pullback20", b2)                     # the low stayed above the average
    bar(b2, -1, l=F(b2)["sma50"][-1] * 1.004)
    assert fires("pullback50", b2)


def test_rsi2_dip_three_down_days_and_the_lower_bollinger_band():
    b = base()
    for k in (-3, -2, -1):
        bar(b, k, o=b["c"][k - 1], c=b["c"][k - 1] * 0.985)
    assert fires("rsi2", b) and fires("down3", b)
    b = base()
    for k in (-3, -2):
        bar(b, k, o=b["c"][k - 1], c=b["c"][k - 1] * 0.985)
    bar(b, -1, o=b["c"][-2], c=b["c"][-2] * 1.01)
    assert not fires("down3", b) and not fires("rsi2", b)
    b = base()
    bar(b, -1, o=b["c"][-2], c=b["c"][-2] * 0.95)
    assert fires("bblow", b)
    assert not fires("bblow", base())


def test_volatility_squeeze_break():
    b = base(n=420, wiggle=0.004)
    for k in range(-40, -1):                               # 39 quiet sessions: the band is at its narrowest
        bar(b, k, o=b["c"][-41], c=b["c"][-41] * (1 + 0.0005 * (k % 2)), h=b["c"][-41] * 1.002, l=b["c"][-41] * 0.998)
    bar(b, -1, o=b["c"][-2], c=b["c"][-2] * 1.04)
    assert fires("squeeze", b)
    bar(b, -1, c=b["c"][-2] * 1.0002, h=b["c"][-2] * 1.001)
    assert not fires("squeeze", b)


def test_nr7_and_inside_day_breakouts():
    b = base()
    p = b["c"][-3]
    bar(b, -2, o=p, c=p * 1.0005, h=p * 1.001, l=p * 0.9995)    # the narrowest range of seven, and inside the session before
    bar(b, -1, o=p, c=p * 1.012)
    assert fires("nr7", b) and fires("inside", b)
    bar(b, -1, c=p * 0.999)
    assert not fires("nr7", b) and not fires("inside", b)


def test_bull_flag_needs_the_pole():
    def flag(pole):
        b = base()
        s = b["c"][-17]
        for i, k in enumerate(range(-16, -5)):
            bar(b, k, o=s * (1 + pole) ** (i / 11), c=s * (1 + pole) ** ((i + 1) / 11))
        top = b["c"][-6]
        for k in range(-5, -1):
            bar(b, k, o=top, c=top * 0.998, h=top * 1.003, l=top * 0.994)
        bar(b, -1, o=top, c=top * 1.02)
        return b
    assert fires("flag", flag(0.20))
    assert not fires("flag", flag(0.05))


def _first_cross(a, b_, after):
    for i in range(max(after, 1), len(a)):
        if a[i] > b_[i] and a[i - 1] <= b_[i - 1]:
            return i
    return None


def test_moving_average_crosses_fire_on_the_cross_session_only():
    n = 700
    c = [100 * 1.002 ** i for i in range(300)] + [100 * 1.002 ** 299 * 0.997 ** i for i in range(1, 151)] + [100 * 1.002 ** 299 * 0.997 ** 150 * 1.004 ** i for i in range(1, 251)]
    b = base(n)
    b["c"] = c
    b["o"] = [c[0]] + c[:-1]
    b["h"] = [max(x, y) * 1.004 for x, y in zip(b["o"], c)]
    b["l"] = [min(x, y) * 0.996 for x, y in zip(b["o"], c)]
    import pandas as pd
    s = pd.Series(c)
    ema20, sma50, sma200 = s.ewm(span=20, adjust=False).mean().values, s.rolling(50).mean().values, s.rolling(200).mean().values
    f = F(b)
    gold = _first_cross(np.nan_to_num(sma50), np.nan_to_num(sma200), 451)
    sig = np.asarray(B.s_golden(f)[0])
    assert gold is not None and sig[gold] and not sig[gold - 1] and not sig[gold + 1]
    cross = _first_cross(ema20, sma50, 451)
    sig = np.asarray(B.s_ema_cross(f)[0])
    assert sig[cross] == bool(c[cross] > sma200[cross]) and not sig[cross - 1] and not sig[cross + 1]
    # MACD: its cross above the signal line counts only above zero and in an uptrend
    m = s.ewm(span=12, adjust=False).mean() - s.ewm(span=26, adjust=False).mean()
    ms = m.ewm(span=9, adjust=False).mean()
    sig = np.asarray(B.s_macd(f)[0])
    for i in range(1, n):
        crossed = m[i] > ms[i] and m[i - 1] <= ms[i - 1]
        assert sig[i] == bool(crossed and m[i] > 0 and f["uptrend"][i]), i


def test_supertrend_flip_after_a_sharp_drop():
    b = base(n=420, g=1.003)
    for k in range(-12, -6):
        bar(b, k, o=b["c"][k - 1], c=b["c"][k - 1] * 0.97)          # a sharp fall turns the line down
    for k in range(-6, 0):
        bar(b, k, o=b["c"][k - 1], c=b["c"][k - 1] * 1.04)          # a sharp rise turns it up again
    f = F(b)
    sig = np.asarray(B.s_supertrend(f)[0])
    flips = [i for i in range(len(sig) - 14, len(sig)) if f["st"][i] > 0 and f["st"][i - 1] < 0]
    assert flips and all(sig[i] == bool(f["c"][i] > f["sma200"][i]) for i in flips)
    assert sig[-14:].sum() == sum(bool(f["c"][i] > f["sma200"][i]) for i in flips)
    assert np.allclose(np.asarray(B.s_supertrend(f)[1])[flips], f["stl"][flips])   # the lower exit level is the line itself


def test_adx_dip_and_rs_leader_dip_need_a_close_back_above_the_10_ema():
    b = base(n=420, g=1.006, wiggle=0.0)
    f = F(b)
    bar(b, -2, o=b["c"][-3], c=f["ema10"][-3] * 0.99)                # a close under the 10 EMA ...
    bar(b, -1, o=b["c"][-2], c=b["c"][-3] * 1.01)                    # ... and back above it
    flat = {t: 20000.0 for t in b["t"]}
    assert fires("adx", b)
    assert fires("rsleader", b, nifty=flat)
    same = {t: 20000 * c / b["c"][0] for t, c in zip(b["t"], b["c"])}  # Nifty rose just as much: no lead
    assert not fires("rsleader", b, nifty=same)
    assert not fires("rsleader", b, nifty=None)                         # no Nifty: rule 23 cannot fire
    b2 = base(n=420, g=1.006, wiggle=0.0)
    assert not fires("adx", b2)                                         # no dip


def test_engulfing_and_hammer_at_the_averages():
    b = base()
    p = b["c"][-3]
    bar(b, -2, o=p * 1.01, c=p * 0.995)
    e20 = F(b)["ema20"][-1]
    bar(b, -1, o=p * 0.99, c=p * 1.015, l=min(e20, p * 0.99) * 0.999)
    assert fires("engulf", b)
    bar(b, -1, c=p * 1.0)                                            # body no longer covers the previous one
    assert not fires("engulf", b)
    b = base()
    p = b["c"][-2]
    bar(b, -1, o=p * 1.001, c=p * 1.003, h=p * 1.0035)
    bar(b, -1, l=min(F(b)["ema20"][-1], p * 0.99) * 0.998)
    assert fires("hammer", b)
    b["h"][-1] = p * 1.02                                            # a long upper wick: not a hammer
    assert not fires("hammer", b)


def test_pocket_pivot_and_gap_and_go_need_their_volume():
    b = base(g=1.001)
    bar(b, -1, o=b["c"][-2], c=b["c"][-2] * 1.01, v=2e6)
    assert fires("pocket", b)
    b["v"][-1] = 0.9e6
    assert not fires("pocket", b)
    b = base(g=1.001)
    bar(b, -1, o=b["c"][-2] * 1.04, c=b["c"][-2] * 1.06, v=3e6)
    assert fires("gapgo", b)
    b["v"][-1] = 2e6
    assert not fires("gapgo", b)


def test_vcp_tightening_break():
    b = base(g=1.002, wiggle=0.001)
    bar(b, -1, o=b["c"][-2], c=max(b["h"][-11:-1]) * 1.01, v=1.6e6)
    assert fires("vcp", b)
    b["v"][-1] = 1.1e6
    assert not fires("vcp", b)


def test_every_rule_fires_somewhere_on_a_long_random_series():
    rng = np.random.default_rng(7)
    n = 1500
    c = 1000 * np.exp(np.cumsum(rng.normal(0.0009, 0.02, n)))
    o = c * (1 + rng.normal(0, 0.01, n))
    v = rng.integers(100_000, 1_000_000, n).astype(float)
    v[rng.integers(0, n, 60)] *= 4
    for k in range(300, n, 97):                       # gaps up on heavy volume that close above their open
        o[k], c[k], v[k] = c[k - 1] * 1.05, c[k - 1] * 1.06, 4e6
    b = {"t": days(n), "o": list(o), "h": list(np.maximum(o, c) * (1 + abs(rng.normal(0, 0.01, n)))),
         "l": list(np.minimum(o, c) * (1 - abs(rng.normal(0, 0.01, n)))), "c": list(c), "v": list(v)}
    f = F(b, {t: 20000.0 for t in b["t"]})
    for r in B.RULES:
        assert np.asarray(B.SIGNALS[r["id"]](f)[0]).sum() > 0, r["name"]


# ------------------------------------------------------------------------------------------------------------------ method
def _random(n=900, seed=3):
    rng = np.random.default_rng(seed)
    c = 500 * np.exp(np.cumsum(rng.normal(0.0008, 0.018, n)))
    o = c * (1 + rng.normal(0, 0.006, n))
    return {"t": days(n), "o": list(o), "h": list(np.maximum(o, c) * 1.008), "l": list(np.minimum(o, c) * 0.992), "c": list(c),
            "v": list(rng.integers(100_000, 900_000, n).astype(float))}


def test_no_look_ahead_a_signal_and_its_level_never_change_when_later_bars_are_added():
    b = _random()
    nifty = {t: 20000 + i for i, t in enumerate(b["t"])}
    full = F(b, nifty)
    for k in (300, 450, 600, 899):
        part = F({key: v[:k + 1] for key, v in b.items()}, nifty)
        for r in B.RULES:
            s_full, l_full = (np.asarray(x) for x in B.SIGNALS[r["id"]](full))
            s_part, l_part = (np.asarray(x) for x in B.SIGNALS[r["id"]](part))
            assert (s_full[:k + 1] == s_part).all(), (r["id"], k)
            assert np.allclose(np.nan_to_num(l_full[:k + 1], nan=-1), np.nan_to_num(l_part, nan=-1)), (r["id"], k)


def test_every_trade_starts_at_the_next_bars_open_after_its_signal():
    b = _random()
    f = F(b, {t: 20000.0 for t in b["t"]})
    seen = 0
    for r in B.RULES:
        ts, _ = B.trades(f, r["id"], "trail3")
        for t in ts:
            i = b["t"].index(t["trigger"])
            assert t["entry"] == b["t"][i + 1] and t["entryPrice"] == round(b["o"][i + 1], 2) and i >= B.WARMUP
            seen += 1
    assert seen > 20


def _f(o, h, l, c, extra=None):  # noqa: E741
    n = len(c)
    f = {"o": np.array(o, float), "h": np.array(h, float), "l": np.array(l, float), "c": np.array(c, float), "n": n,
         "atr": np.ones(n), "sma5": np.full(n, 1e9), "ema20": np.zeros(n), "date": days(n)}
    f.update(extra or {})
    return f


def test_exits_lower_level_gap_upper_level_and_time():
    #            entry bar   then
    f = _f([100, 101, 103, 104], [101, 102, 104, 107], [99.5, 100.5, 102, 103], [100.5, 101.5, 103.5, 106])
    assert B.follow(f, 0, 98, "rr2_20") == (2, 104.0, "upper")       # upper level 100 + 2 * 2 = 104 reached by bar 2's high
    assert B.follow(f, 0, 98, "time5") == (3, 106.0, "time")         # ran out of bars: the last close
    f = _f([100, 99, 96], [101, 99.5, 97], [99, 98.5, 95], [99.2, 98.8, 96])
    assert B.follow(f, 0, 98.6, "time10") == (1, 98.6, "lower")      # the low reached the lower exit level: filled at it
    assert B.follow(f, 0, 97, "time10") == (2, 96.0, "gap")          # opened under it: filled at the open


def test_r_is_the_result_over_the_initial_risk_net_of_the_stated_costs():
    assert abs(B.COST - 0.0034104) < 1e-6                             # market-lab's cost_frac(): 0.341% round trip
    assert abs(B.SIDE_PCT["entry"] - 0.1686) < 1e-3 and abs(B.SIDE_PCT["exit"] - 0.1724) < 1e-3
    b = _random()
    f = F(b, {t: 20000.0 for t in b["t"]})
    ts, _ = B.trades(f, "breakout20", "time5")
    assert ts
    for t in ts:
        e, lower, x = t["entryPrice"], t["lower"], t["exitPrice"]
        r = e - lower
        assert abs(t["rGross"] - (x - e) / r) < 0.01
        assert abs(t["rNet"] - ((x - e) / e - B.COST) * e / r) < 0.01
        assert t["rNet"] < t["rGross"] and abs(t["pctGross"] - t["pctNet"] - B.COST * 100) < 0.011
    net, gross = B.stats(ts, "rNet"), B.stats(ts, "rGross")
    assert net["totalR"] < gross["totalR"] and net["trades"] == gross["trades"] == len(ts)


def _t(r, k):
    d = days(60)
    return {"entry": d[2 * k], "exit": d[2 * k + 1], "rNet": r, "rGross": r, "days": 2}


def test_worst_run_and_drawdown_carry_their_dates_and_few_trades_are_flagged():
    rs = [1.0, 2.0, -1.0, -0.5, -1.0, 0.5, -1.0, 3.0]
    ts = [_t(r, k) for k, r in enumerate(rs)]
    s = B.stats(ts, "rNet")
    assert s["trades"] == 8 and s["few"] is True and s["winRate"] == 50.0
    assert s["avgR"] == round(sum(rs) / 8, 3) and s["medianR"] == 0.0 and s["totalR"] == 3.0
    assert s["worstRun"] == {"count": 3, "from": ts[2]["entry"], "to": ts[4]["exit"], "r": -2.5}
    assert s["drawdown"] == {"r": 3.0, "from": ts[1]["exit"], "to": ts[6]["exit"]}   # from 3.0 R down to 0.0 R
    many = B.stats([_t(0.5, k % 25) for k in range(30)], "rNet")
    assert many["few"] is False and many["worstRun"]["count"] == 0 and many["drawdown"]["r"] == 0
    assert B.stats([], "rNet") == {**B.stats([], "rNet"), "trades": 0, "few": True, "winRate": None}


def test_the_backtest_shows_every_rule_and_every_exit_it_takes():
    b = _random(n=1200)
    out = B.backtest(b, {t: 20000.0 for t in b["t"]})
    assert [r["id"] for r in out["rules"]] == [r["id"] for r in B.RULES]
    for r in out["rules"]:
        want = set(B.EXITS) if r["kind"] == "mean reversion" else set(B.EXITS) - {"mr5"}
        assert set(r["exits"]) == want, r["id"]
    assert sum(r["kind"] == "mean reversion" for r in out["rules"]) == 3
    assert out["testedFrom"] == b["t"][B.WARMUP]


def test_the_data_join_scales_the_older_series_and_drops_its_volumes():
    t = days(500)
    snap = {"t": t[:450], "o": [50.0] * 450, "h": [51.0] * 450, "l": [49.0] * 450, "c": [50.0] * 450, "v": [10] * 450}
    rows = [{"day": date.fromisoformat(d), "open": 100.0, "high": 102.0, "low": 98.0, "close": 100.0, "volume": 1000, "exch": "NSE"} for d in t[400:]]
    bars, first = B.join(snap, rows)
    assert first == t[400] and bars["t"] == t
    assert bars["c"][0] == 100.0                                     # the provider's older closes scaled to meet the candles
    assert bars["v"][399] is None and bars["v"][400] == 1000.0       # provider volumes are not comparable: dropped
    alone, none = B.join(snap, [])
    assert none is None and alone["v"][0] == 10.0 and alone["c"][0] == 50.0


def test_coverage_says_the_real_years_and_the_sources():
    t = days(800, start=date(2023, 10, 12))
    bars = {"t": t, "o": [1] * 800, "h": [1] * 800, "l": [1] * 800, "c": [1] * 800, "v": [1] * 800}
    cov = B.coverage(bars, t[100], t[260], {"exchange": "NSE", "provider": True})
    a, b = date.fromisoformat(t[0]), date.fromisoformat(t[-1])
    years = round((b - a).days / 365.25, 1)
    assert cov["years"] == years and years < 5
    assert cov["text"].startswith(f"{years} years of daily prices, 12 Oct 2023 – {b.day} {b.strftime('%b')} {b.year} (800 sessions).")
    assert "exchange candles (NSE, through Dhan)" in cov["source"] and "main data provider" in cov["source"]


BANNED = re.compile(r"\b(buy|buying|sell|selling|hold|holding|target|targets|best|top|top pick|winning|forecast|recommend\w*|likely|will rise|will fall|"
                    r"bullish|bearish|signal|signals|stop|stop-loss|sure)\b", re.I)


def _words(x):
    """Every string value a reader can see (dictionary keys are field names, not words shown)."""
    if isinstance(x, dict):
        return [w for v in x.values() for w in _words(v)]
    if isinstance(x, list):
        return [w for v in x for w in _words(v)]
    return [x] if isinstance(x, str) else []


def test_nothing_in_the_answer_or_the_source_strings_tells_anyone_to_trade():
    b = _random(n=1200)
    full = {**B.backtest(b, {t: 20000.0 for t in b["t"]}), "coverage": B.coverage(b, None, b["t"][260], {"provider": True}),
            "prices": {"t": b["t"], "o": b["o"], "h": b["h"], "l": b["l"], "c": b["c"]}}
    a = B.answer(full, "TEST", "trail3")
    assert a["note"] == "Past results of fixed rules on past prices; not a forecast or a recommendation."
    shown = _words({k: v for k, v in a.items() if k not in ("note", "prices")})
    shown += _words([{k: v for k, v in r.items() if k not in ("id", "src")} for r in B.RULES]) + _words(B.EXITS) + _words(B.HOW)
    shown += _words(B.cost_model()) + [n for side in B.COST_PARTS.values() for n, _ in side] + [B.TREND, B.ENTRY]
    text = " | ".join(shown)
    assert not BANNED.search(text), BANNED.search(text)
    assert [r["id"] for r in a["rules"]] == [r["id"] for r in B.RULES]   # list order, never by result


# ------------------------------------------------------------------------------------------------------------------ route
def _series(n=700):
    rng = np.random.default_rng(11)
    c = 800 * np.exp(np.cumsum(rng.normal(0.0008, 0.017, n)))
    o = c * (1 + rng.normal(0, 0.005, n))
    return days(n, start=date(2022, 1, 3)), o, np.maximum(o, c) * 1.007, np.minimum(o, c) * 0.993, c


async def _seed(app, sym="BTTEST", n=700, candles_from=300):
    t, o, h, l, c = _series(n)  # noqa: E741
    daily = {"t": t[:candles_from + 20], "o": [round(float(x), 2) for x in o[:candles_from + 20]], "h": [round(float(x), 2) for x in h[:candles_from + 20]],
             "l": [round(float(x), 2) for x in l[:candles_from + 20]], "c": [round(float(x), 2) for x in c[:candles_from + 20]], "v": [5000] * (candles_from + 20)}
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO snapshots (symbol, statement, section, body, etag, generated_at) VALUES ($1, 'consolidated', 'price', $2, 'x', $3) "
                           "ON CONFLICT (symbol, statement, section) DO UPDATE SET body = EXCLUDED.body",
                           sym, orjson.dumps({"daily": daily}).decode(), datetime.now(timezone.utc))
        await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1, $2, $3, $4, $5, $6, $7, 'NSE') "
                               "ON CONFLICT (symbol, day) DO NOTHING",
                               [(sym, date.fromisoformat(t[i]), float(o[i]), float(h[i]), float(l[i]), float(c[i]), 100_000) for i in range(candles_from, n)])
    return t


@pg
async def test_the_route_is_for_lab_members_and_says_its_coverage_costs_and_every_rule(app, monkeypatch):  # noqa: F811
    async def no_nifty(_app):
        return None
    monkeypatch.setattr(B, "nifty_closes", no_nifty)
    t = await _seed(app)
    async with new_client(app) as anon:
        assert (await anon.get("/api/lab/backtest/BTTEST")).status_code == 401
    member = await signed_in(app, "bt-member@example.com", plan="gold")
    assert (await member.get("/api/lab/backtest/BTTEST")).status_code == 403
    admin = await admin_with_mfa(app, "bt-boss@example.com")
    r = await admin.get("/api/lab/backtest/bttest")
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    body = r.json()
    assert body["symbol"] == "BTTEST" and body["exit"] == "trail3" and len(body["rules"]) == 23
    cov = body["coverage"]
    assert cov["first"] == t[0] and cov["last"] == t[-1] and cov["bars"] == 700 and cov["exchangeFrom"] == t[300]
    assert cov["years"] == round((date.fromisoformat(t[-1]) - date.fromisoformat(t[0])).days / 365.25, 1)
    assert body["costs"]["roundTripPct"] == 0.341 and "gross" in body["costs"]["text"]
    rs = {x["id"]: x for x in body["rules"]}
    assert rs["rsleader"]["available"] is False and "Nifty 50" in rs["rsleader"]["note"]
    assert "exchange's own volumes" in rs["pocket"]["note"]
    for x in body["rules"]:
        assert set(x["net"]) >= {"trades", "few", "winRate", "avgR", "medianR", "totalR", "worstRun", "drawdown"}
    assert len(body["prices"]["t"]) == 700
    assert (await admin.get("/api/lab/backtest/BTTEST?exit=mr5")).json()["rules"][0]["exitApplies"] is False
    assert (await admin.get("/api/lab/backtest/BTTEST?exit=sideways")).status_code == 400
    assert (await admin.get("/api/lab/backtest/bad%20sym")).status_code == 400
    assert (await admin.get("/api/lab/backtest/NOSUCHCO")).status_code == 404
    await _seed(app, "BTSHORT", n=300, candles_from=100)
    short = await admin.get("/api/lab/backtest/BTSHORT")
    assert short.status_code == 404 and "at least 400" in short.json()["detail"]


@pg
async def test_the_answer_is_cached_per_stock_and_last_bar(app, monkeypatch):  # noqa: F811
    async def no_nifty(_app):
        return None
    monkeypatch.setattr(B, "nifty_closes", no_nifty)
    runs = []
    real = B.backtest

    def counted(*a, **k):
        runs.append(1)
        return real(*a, **k)
    monkeypatch.setattr(B, "backtest", counted)
    t = await _seed(app, "BTCACHE")
    await app.state.store.redis.delete(B.cache_key("BTCACHE", t[-1], None))
    admin = await admin_with_mfa(app, "bt-cache@example.com")
    first = (await admin.get("/api/lab/backtest/BTCACHE")).json()
    second = (await admin.get("/api/lab/backtest/BTCACHE?exit=rr3_40")).json()
    assert runs == [1] and first["cached"] is False and second["cached"] is True
    assert second["exit"] == "rr3_40" and second["coverage"] == first["coverage"]
    assert await app.state.store.redis.ttl(B.cache_key("BTCACHE", t[-1], None)) > 23 * 3600


def test_the_api_process_does_not_load_numpy_or_pandas_for_this_module():
    import subprocess
    import sys
    code = "import sys, finlit.lab.backtest; print('numpy' in sys.modules or 'pandas' in sys.modules)"
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)   # nosec B603 - fixed arguments
    assert out.stdout.strip() == "False"
