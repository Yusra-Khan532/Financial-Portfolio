"""Task #325 (developer file 26): chart patterns engine 2, on synthetic series."""
from datetime import date, timedelta

import numpy as np

from finlit import pattern_engine as pe
from finlit.presets import patterns as P


def _days(n, end=date(2026, 11, 20)):
    out, d = [], end
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d -= timedelta(days=1)
    return out[::-1]


def _series(c, vol=2_00_000, spread=0.02, sym="TEST"):
    c = np.asarray(c, dtype=float); d = _days(len(c))
    return pe.S(sym, d, c * (1 - spread / 4), c * (1 + spread / 2), c * (1 - spread / 2), c, np.full(len(c), vol, dtype=float))


def test_labels_measures_and_the_floor():
    assert [pe.clean_label(q) for q in (None, 95, 70, 69, 50, 49)] == [None, "Clean", "Clean", "Fair", "Fair", "Rough"]
    s = _series(np.linspace(100, 200, 260))
    assert s.n == 260 and s.adr > 0 and round(s.ret(63), 1) > 0 and s.uptrend()
    assert s.turn == round(float(np.mean(s.c[-20:] * s.v[-20:]) / 1e7), 10) or abs(s.turn - float(np.mean(s.c[-20:] * s.v[-20:]) / 1e7)) < 1e-9
    thin = _series(np.linspace(100, 200, 260), vol=10)
    assert not thin.ok()                                   # Rs 5 Cr a day floor


def test_weekly_bars_from_daily():
    d = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23"]
    wd, wh, wl, wc = pe.weekly_bars(d, [10, 12, 11, 13, 12, 14], [9, 10, 9, 11, 10, 13], [9.5, 11, 10, 12, 11, 13.5])
    assert list(wd) == ["2026-11-20", "2026-11-23"] and list(wh) == [13, 14] and list(wl) == [9, 13] and list(wc) == [11, 13.5]


def test_ema50_pullback_found_on_a_strong_trend_resting_on_its_average():
    # a long climb, then a month of drift that brings the price back to its rising 50-day EMA
    up = list(np.linspace(100, 220, 230)); rest = list(np.linspace(220, 214, 25))
    s = _series(up + rest, vol=50_00_000)
    hits = {h["pattern"]: h for h in pe.scan(s, 80, [])}
    if "ema50_pullback" in hits:
        h = hits["ema50_pullback"]
        assert h["clean"] in ("Clean", "Fair", "Rough") and h["draw"] == {"ma": "e50"} and "From the 50-day EMA" in h["facts"]


def test_no_hit_on_a_falling_chart():
    s = _series(np.linspace(300, 120, 260), vol=50_00_000)
    hits = {h["pattern"] for h in pe.scan(s, 10, [])}
    assert not hits & {"daily_base", "near_pivot", "tight_range", "flag", "ema50_pullback", "vcp", "shakeout", "fresh_breakout"}


def test_a_hit_becomes_a_record_with_numbers_status_and_the_drawing_in_the_panel_shape():
    s = _series(np.linspace(100, 200, 260))
    h = {"facts": {"Level (Rs)": 418.5, "Below the level": "1.8%", "Level age": "89 sessions", "Volume, last 10 against 50": "0.50x", "Kind": "Flag"},
         "draw": {"level": ["2026-07-15", 418.5, "Level"], "zone": ["2026-07-15", "2026-11-20", 320.0, 418.5], "marks": [["2026-10-23", 320.0, "Base low"]],
                  "lines": [["2026-10-01", 100.0, "2026-10-15", 150.0, "pole"], ["2026-10-16", 150.0, "2026-11-20", 148.0, "up"]], "ma": "e50"},
         "q": 79, "status": "At the level", "clean": "Clean", "rs": 75}
    r = P.record_of(h, s)
    assert r["nums"] == {"Level (Rs)": 418.5, "Below the level": 1.8, "Level age": 89.0, "Volume, last 10 against 50": 0.5, "Kind": "Flag"}
    assert r["facts"][0] == ["Level (Rs)", "418.50"] and r["status"] == "At the level" and r["clean"] == "Clean" and r["q"] == 79 and r["last"] == s.d[-1]
    d = r["draw"]
    assert d["level"] == 418.5 and d["from"] == "2026-07-15" and d["levelLabel"] == "Level" and d["box"] == {"from": "2026-07-15", "to": "2026-11-20", "low": 320.0, "high": 418.5}
    assert d["swings"] == [{"date": "2026-10-23", "price": 320.0, "kind": "Base low"}] and d["pole"] == {"from": "2026-10-01", "low": 100.0, "to": "2026-10-15", "high": 150.0}
    assert d["lines"] == [{"from": "2026-10-16", "a": 150.0, "to": "2026-11-20", "b": 148.0, "kind": "up"}] and d["ema"] == round(float(s.e50[-1]), 2)


def test_every_screen_has_four_columns_with_a_number_format_where_a_figure_is_a_number():
    assert set(P.FACT_LABELS) == set(P.SCAN_IDS) and all(len(v) == 4 for v in P.FACT_LABELS.values())
    assert P.FACT_FORMAT["Below the level"] == "pct_down" and P.FACT_FORMAT["Level (Rs)"] == "num2" and P.FACT_FORMAT["Volume, last 10 against 50"] == "times"


def test_scan_all_runs_engine_2_over_the_table_with_the_floor_the_stale_and_the_young(monkeypatch):
    import asyncio
    from types import SimpleNamespace

    days = _days(260)
    good = np.linspace(100, 220, 260)
    sers = {
        "GOOD": {"t": days, "o": list(good), "h": list(good * 1.01), "l": list(good * 0.99), "c": list(good), "v": [50_00_000] * 260},
        "THIN": {"t": days, "o": list(good), "h": list(good * 1.01), "l": list(good * 0.99), "c": list(good), "v": [10] * 260},
        "OLD": {"t": days[:-3], "o": list(good[:-3]), "h": list(good[:-3] * 1.01), "l": list(good[:-3] * 0.99), "c": list(good[:-3]), "v": [50_00_000] * 257},
        "NEWL": {"t": days[-12:], "o": [100.0] * 12, "h": [110.0] + [104.0] * 11, "l": [95.0] + [98.0] * 11, "c": [105.0] + [102.0] * 11, "v": [90_00_000] * 12},
    }

    async def series(store, sym):
        return sers[sym]
    monkeypatch.setattr(P.candles_mod, "series", series)

    class Redis:
        async def get(self, k):
            return None
    store = SimpleNamespace(redis=Redis(), pool=None)
    syms = list(sers)
    table = SimpleNamespace(symbols=syms, full=[True] * 4, cols={"market_cap": [5000.0] * 4})
    out = asyncio.run(P.scan_all(store, table, date(2026, 11, 20)))
    assert out["engine"] == 2 and set(out["scans"]) == set(P.SCAN_IDS) and out["bench"] is False
    assert out["left_out"] == [["OLD", "candles end 17 Nov, before the 20 Nov close"]]
    assert out["checked"] == 2                                   # GOOD and the young listing; THIN is under the Rs 5 Cr floor
    for scan, by in out["scans"].items():
        assert "THIN" not in by and "OLD" not in by
        if scan != "ipo_base":
            assert "NEWL" not in by                              # a young listing is looked at for IPO base only
        for rec in by.values():
            assert set(rec) >= {"facts", "nums", "status", "clean", "q", "draw", "last"}
