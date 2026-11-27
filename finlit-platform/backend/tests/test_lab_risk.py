"""Trading Lab > Risk read-out (docs/TRADING-LAB.md "Risk read-out", Build order item 6): finlit/lab/risk.py.

What must hold: each formula gives the hand-worked answer on a series built for it (constant returns, a fall that recovers and one that has not,
VaR and expected shortfall on a known spread of returns, Sortino with and without downside, Calmar, beta of a scaled copy, alignment with missing
days); a figure from fewer than 200 returns is flagged; the store that is current and longer is used; the route is for Lab members (401 signed
out, 403 without a grant), never cached by the browser, 404 for an unknown stock; nothing in the module or the answer tells anyone what to do."""
import math
import re
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import orjson
import pytest

from finlit.lab import risk
from test_auth import app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration


def days(n, start=date(2023, 1, 2)):
    """n weekdays from `start`, as ISO days."""
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def series(closes, start=date(2023, 1, 2)):
    return list(zip(days(len(closes), start), [float(c) for c in closes]))


def from_returns(rets, first=100.0):
    closes = [first]
    for r in rets:
        closes.append(closes[-1] * (1 + r))
    return closes


# ------------------------------------------------------------------------------------------------------------------ formulas

def test_constant_returns_have_no_volatility_no_fall_and_no_downside():
    pts = series(from_returns([0.01] * 300))
    f = risk.figures(pts)
    assert f["vol20"]["pct"] == pytest.approx(0, abs=1e-9) and f["vol1y"]["pct"] == pytest.approx(0, abs=1e-9)
    assert f["volRatio"]["value"] is None                                            # 0 / 0 is not a figure
    assert f["drawdown1y"]["deepest"] is None
    assert f["sortino1y"]["value"] is None and "no downside" in f["sortino1y"]["why"]
    assert f["calmar1y"]["value"] is None and f["calmar1y"]["annReturnPct"] == pytest.approx((1.01 ** 252 - 1) * 100)


def test_volatility_is_the_sample_deviation_of_log_returns_times_root_252():
    closes = [100, 110, 99, 108.9, 98.01]
    lr = [math.log(b / a) for a, b in zip(closes, closes[1:])]
    m = sum(lr) / 4
    sd = math.sqrt(sum((x - m) ** 2 for x in lr) / 3)
    assert risk.ann_vol(risk.log_returns(closes)) == pytest.approx(sd * math.sqrt(252))
    assert risk.ann_vol([0.01]) is None


def test_volatility_ratio_twenty_sessions_against_one_year():
    calm = [0.01, -0.01] * 116                                  # 232 returns of ±1%
    wild = [0.03, -0.03] * 10                                   # the last 20 of ±3%
    f = risk.figures(series(from_returns(calm + wild)))
    v20 = risk.ann_vol(risk.log_returns(from_returns(wild, 1.0)))
    assert f["vol20"]["pct"] == pytest.approx(v20 * 100, rel=1e-3)
    assert f["volRatio"]["value"] == pytest.approx(f["vol20"]["pct"] / f["vol1y"]["pct"], rel=1e-3)
    assert f["volRatio"]["value"] > 1.5
    assert f["vol20"]["window"] == {"label": "20 sessions", "from": days(253)[232], "to": days(253)[252], "returns": 20, "wanted": 20, "full": True, "short": False}


def test_deepest_fall_with_its_recovery():
    pts = series([100, 120, 90, 60, 90, 120, 130])
    d = risk.drawdown(pts)
    deep = d["deepest"]
    assert deep["depthPct"] == pytest.approx(-50)
    assert (deep["peak"]["d"], deep["peak"]["close"]) == (pts[1][0], 120)
    assert (deep["trough"]["d"], deep["trough"]["close"]) == (pts[3][0], 60)
    assert deep["recovered"] == {"d": pts[5][0], "close": 120}
    assert (deep["fallSessions"], deep["recoverySessions"]) == (2, 2)
    assert deep["fallDays"] == (date.fromisoformat(pts[3][0]) - date.fromisoformat(pts[1][0])).days
    assert [round(x, 4) for x in d["series"]] == [0, 0, -0.25, -0.5, -0.25, 0, 0]


def test_deepest_fall_not_recovered_yet_counts_the_days_so_far():
    pts = series([100, 80, 50, 70])
    deep = risk.drawdown(pts)["deepest"]
    assert deep["depthPct"] == pytest.approx(-50) and deep["peak"]["d"] == pts[0][0] and deep["trough"]["d"] == pts[2][0]
    assert deep["recovered"] is None and deep["recoverySessions"] is None
    assert deep["sessionsSincePeak"] == 3
    assert deep["daysSincePeak"] == (date.fromisoformat(pts[3][0]) - date.fromisoformat(pts[0][0])).days
    assert deep["belowPeakPct"] == pytest.approx(-30)


def test_the_later_of_two_equal_highs_is_the_peak_of_the_fall():
    pts = series([100, 120, 110, 120, 60])
    assert risk.drawdown(pts)["deepest"]["peak"]["d"] == pts[3][0]


def test_var_and_expected_shortfall_on_a_known_spread_of_returns():
    rets = [-k / 1000 for k in range(1, 101)]                  # -0.1% ... -10%, 100 returns
    t95, t99 = risk.tail(rets, 0.95), risk.tail(rets, 0.99)
    assert t95["k"] == 5 and t95["varPct"] == pytest.approx(9.6) and t95["esPct"] == pytest.approx(9.8)   # 9.6, 9.7, ... 10.0
    assert t95["varRs"] == pytest.approx(9600) and t95["esRs"] == pytest.approx(9800)                     # per ₹1 lakh held
    assert t99["k"] == 1 and t99["varPct"] == pytest.approx(10) and t99["esPct"] == pytest.approx(10)
    year = [0.001] * 239 + [-0.01 * k for k in range(1, 14)]   # 252 returns: k = ceil(252 x 5%) = 13, ceil(252 x 1%) = 3
    t95, t99 = risk.tail(year, 0.95), risk.tail(year, 0.99)
    assert (t95["k"], t99["k"]) == (13, 3)
    assert t95["varPct"] == pytest.approx(1) and t95["esPct"] == pytest.approx(7)
    assert t99["varPct"] == pytest.approx(11) and t99["esPct"] == pytest.approx(12)
    assert risk.tail([], 0.95) is None


def test_sortino_with_and_without_downside():
    s = risk.sortino([0.02, -0.01])
    assert s["value"] == pytest.approx(0.005 / math.sqrt(0.0001 / 2) * math.sqrt(252))
    none = risk.sortino([0.01, 0.02, 0.0])
    assert none["value"] is None and none["downsidePct"] == 0


def test_calmar_is_the_yearly_return_over_the_deepest_fall():
    closes = [100.0] + [100 - 2 * i for i in range(1, 11)]    # to 80 on day 10: a 20% fall
    rest = 494
    g = (121 / 80) ** (1 / rest)
    closes += [80 * g ** i for i in range(1, rest + 1)]       # then to 121 on day 504: 10% a year over 504 returns
    c = risk.calmar(series(closes))
    assert c["annReturnPct"] == pytest.approx(10) and c["maxFallPct"] == pytest.approx(-20) and c["value"] == pytest.approx(0.5)


def test_beta_of_a_scaled_copy_is_the_scale():
    import random
    rnd = random.Random(7)
    rm = [rnd.gauss(0, 0.01) for _ in range(260)]
    b = risk.beta([2 * x for x in rm], rm)
    assert b["value"] == pytest.approx(2) and b["corr"] == pytest.approx(1)
    b = risk.beta([0.5 * x + 0.001 for x in rm], rm)
    assert b["value"] == pytest.approx(0.5) and b["alphaPct"] == pytest.approx(0.1)
    assert risk.beta([0.1, 0.2], [0.1, 0.2])["value"] is None


def test_alignment_uses_only_days_both_have_and_counts_the_rest():
    d = days(6)
    stock = [(d[0], 100), (d[1], 110), (d[3], 121), (d[4], 133.1), (d[5], 146.41)]          # no close on d[2]
    index = [(d[0], 1000), (d[1], 1010), (d[2], 1020), (d[3], 1030), (d[5], 1050)]          # no close on d[4]
    al = risk.align(stock, index, d[0])
    assert al["days"] == [d[1], d[3], d[5]]
    assert al["s"] == pytest.approx([0.1, 0.1, 146.41 / 121 - 1])                            # d[1] to d[3] and d[3] to d[5]: both sides span the gap
    assert al["m"] == pytest.approx([0.01, 1030 / 1010 - 1, 1050 / 1030 - 1])
    assert (al["onlyStock"], al["onlyIndex"]) == (1, 1)


def test_the_readout_names_the_aligned_days_and_the_nifty_reference_row():
    import random
    rnd = random.Random(3)
    rm = [rnd.gauss(0.0003, 0.009) for _ in range(800)]
    idx = series(from_returns(rm, 20000))
    stk = series(from_returns([1.5 * x for x in rm], 500))
    out = risk.readout(stk, idx)
    assert out["beta"]["value"] == pytest.approx(1.5, rel=1e-3) and out["beta"]["aligned"] == 252
    assert out["beta"]["window"]["from"] == stk[-253][0] and not out["beta"]["window"]["short"]
    assert out["nifty"]["vol1y"]["pct"] == pytest.approx(out["stock"]["vol1y"]["pct"] / 1.5, rel=0.02)
    assert len(out["pairs"]["d"]) == 252 and len(out["returns1y"]["r"]) == 252
    assert len(out["underwater"]["d"]) == 757 and out["stock"]["drawdown3y"]["window"]["label"] == "3 years"
    assert len(out["rolling"]["d"]) == 252 and out["rolling"]["d"][-1] == stk[-1][0]
    assert out["note"] == "Measures of how the stock moved in the past; not a forecast or a recommendation."
    assert set(out["explain"]) >= {"vol20", "vol1y", "volRatio", "drawdown", "var", "es", "sortino", "calmar", "beta", "corr"}


def test_short_history_is_flagged_and_three_year_figures_are_left_out():
    out = risk.readout(series(from_returns([0.01, -0.005] * 50)), [])
    f = out["stock"]
    assert f["vol1y"]["window"]["returns"] == 100 and f["vol1y"]["window"]["short"] is True
    assert f["tail"]["window"]["short"] and f["sortino1y"]["window"]["short"] and f["calmar1y"]["window"]["short"]
    assert f["vol20"]["window"]["short"] is False
    assert f["drawdown3y"] is None and f["sortino3y"] is None and "3-year figures are not shown" in f["threeYearNote"]
    assert out["nifty"] is None and out["beta"] is None
    assert any("fewer than 200" in n for n in out["notes"]) and any("Nifty 50 closes are not stored" in n for n in out["notes"])


def test_between_one_and_three_years_is_called_stored_history():
    f = risk.figures(series(from_returns([0.01, -0.005] * 200)))
    assert f["drawdown3y"]["window"]["label"] == "Stored history" and f["drawdown3y"]["window"]["returns"] == 400
    assert f["sortino3y"]["window"]["full"] is False


def test_a_one_day_move_of_thirty_percent_is_named_never_changed():
    closes = from_returns([0.001] * 100 + [-0.5] + [0.001] * 50)
    out = risk.readout(series(closes), [])
    assert [round(m["pct"], 1) for m in out["bigMoves"]] == [-50.0]
    assert any("split, bonus" in n for n in out["notes"])
    assert out["underwater"]["c"][101] == pytest.approx(closes[101], abs=1e-3)


def test_clean_and_the_choice_of_price_store():
    assert risk.clean([(date(2026, 1, 2), Decimal("10.5")), (date(2026, 1, 1), 0), (date(2026, 1, 3), None), (date(2026, 1, 5), "x")]) == [("2026-01-02", 10.5)]
    long_ = series([100] * 800, date(2023, 9, 1))
    short = series([100] * 400, date(2025, 3, 1))
    assert long_[-1][0] >= short[-1][0]
    assert risk.pick_source([("daily_candles", long_), ("price_daily", short)])[0] == "daily_candles"
    stale = long_[:-30]                                                                    # six weeks behind: not current
    assert risk.pick_source([("daily_candles", stale), ("price_daily", series([100] * 300, date.fromisoformat(long_[-300][0])))])[0] == "price_daily"
    same = series([100] * 300)
    assert risk.pick_source([("daily_candles", same), ("price_daily", same)])[0] == "daily_candles"
    assert risk.pick_source([("daily_candles", []), ("price_daily", [])]) is None


BANNED = re.compile(r"\b(buy|buying|sell|selling|hold|holding|target|best|top pick|recommend\w*|forecast\w*|likely|will (rise|fall)|bullish|bearish|signal\w*)\b", re.I)


def test_nothing_in_the_module_or_the_answer_tells_anyone_what_to_do():
    import random
    rnd = random.Random(5)
    rm = [rnd.gauss(0, 0.01) for _ in range(400)]
    out = risk.readout(series(from_returns([1.2 * x for x in rm])), series(from_returns(rm, 20000)))
    text = orjson.dumps(out).decode().replace(risk.NOTE, "")
    assert not BANNED.search(text), BANNED.search(text)
    src = Path(risk.__file__).read_text().replace(risk.NOTE, "")
    strings = " ".join(re.findall(r'"([^"\n]*)"', src))
    assert not BANNED.search(strings), BANNED.search(strings)
    assert "not a forecast or a recommendation" in risk.NOTE


# ------------------------------------------------------------------------------------------------------------------ route

async def _seed(app, symbol="RISKCO"):
    import random
    rnd = random.Random(11)
    d = days(800, date(2023, 9, 4))
    rm = [rnd.gauss(0.0003, 0.009) for _ in range(799)]
    idx, stk = from_returns(rm, 20000), from_returns([1.3 * x for x in rm], 800)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO companies (symbol, name) VALUES ($1, $2) ON CONFLICT (symbol) DO NOTHING", symbol, "Risk Co Ltd")
        await conn.execute("INSERT INTO companies (symbol, name) VALUES ('NOPRICE', 'No Price Ltd') ON CONFLICT (symbol) DO NOTHING")
        await conn.executemany("INSERT INTO daily_candles (symbol, day, open, high, low, close, volume, exch) VALUES ($1, $2, $3, $3, $3, $3, 1, 'NSE') "
                               "ON CONFLICT (symbol, day) DO UPDATE SET close = EXCLUDED.close",
                               [(symbol, date.fromisoformat(x), c) for x, c in zip(d, stk)])
        await conn.executemany("INSERT INTO price_daily (symbol, day, close) VALUES ($1, $2, $3) ON CONFLICT (symbol, day) DO UPDATE SET close = EXCLUDED.close",
                               [(symbol, date.fromisoformat(x), round(c, 2)) for x, c in list(zip(d, stk))[-400:]])
        await conn.executemany("INSERT INTO flows_index (code, d, close) VALUES ('NIF50', $1, $2) ON CONFLICT (code, d) DO UPDATE SET close = EXCLUDED.close",
                               [(date.fromisoformat(x), c) for x, c in zip(d, idx) if x != d[-5]])   # the index misses one day
    for s in (symbol, "NOPRICE", "NOSUCH"):
        await app.state.store.redis.delete(risk.CACHE_KEY + s)
    return d


@pg
async def test_the_route_is_for_lab_members_and_reads_the_stored_closes(app):  # noqa: F811
    d = await _seed(app)
    async with new_client(app) as anon:
        assert (await anon.get("/api/lab/risk/RISKCO")).status_code == 401
    member = await signed_in(app, "risk-member@example.com", plan="gold")
    assert (await member.get("/api/lab/risk/RISKCO")).status_code == 403
    admin = await admin_with_mfa(app, "risk-boss@example.com")
    r = await admin.get("/api/lab/risk/riskco")
    body = r.json()
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    assert body["symbol"] == "RISKCO" and body["name"] == "Risk Co Ltd" and body["asOf"] == d[-1]
    assert body["source"]["table"] == "daily_candles" and body["source"]["closes"] == 800 and body["source"]["label"] == "Exchange daily candles (Dhan), NSE"
    assert body["source"]["other"] == {"price_daily": {"closes": 400, "to": d[-1]}}
    assert body["index"]["table"] == "flows_index" and body["index"]["closes"] == 799
    assert body["beta"]["value"] == pytest.approx(1.3, rel=0.01) and body["beta"]["aligned"] == 251 and body["beta"]["onlyStock"] == 1
    assert body["stock"]["drawdown3y"]["window"]["label"] == "3 years" and body["nifty"]["vol1y"]["window"]["returns"] == 252
    again = await admin.get("/api/lab/risk/RISKCO")
    assert again.content == r.content and again.headers["cache-control"] == "no-store"                   # the Redis copy
    assert (await admin.get("/api/lab/risk/NOSUCH")).status_code == 404
    nop = await admin.get("/api/lab/risk/NOPRICE")
    assert nop.status_code == 404 and nop.json()["status"] == "no_prices"
    assert (await admin.get("/api/lab/risk/bad%20sym")).status_code == 400
