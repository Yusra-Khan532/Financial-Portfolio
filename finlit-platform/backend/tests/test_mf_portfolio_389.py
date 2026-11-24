"""Task #389 PR C (developer file 32, faults 4, 6 and 10): the MF portfolio's data faults.

  4   an index fund or ETF is set against the index it tracks (UTI Nifty 50 Index read against the Nifty 500 before), one shared rule (bench.tracked_index,
      the ETF vs index page's detector), the Nifty 500 tagged "Stand-in" with the reason when no index on the site matches or its closes are missing;
  6   a fund the own-benchmark step marks not compared shows no "falls taken" figure (a liquid fund read "−4 per 100"), with the reason;
  10  holdings with an ISIN the listed-company master knows carry the master's name, the fund file's text kept as fileName; no match keeps the file's name.

The unit tests run anywhere; the route tests need Postgres and Redis (TEST_DATABASE_URL / TEST_REDIS_URL), like test_mfportfolio_api.py."""

import json
import time

import pytest

from finlit import mf
from finlit.mfportfolio import api as mfp
from finlit.mfportfolio import bench
from finlit.mfportfolio.spread import master_names, spread


# ------------------------------------------------------------------------------------------------------------------ fault 4: the tracked index

@pytest.mark.parametrize("name,want", [
    ("UTI Nifty 50 Index Fund - Direct Plan - Growth Option", ("NIF50", "Nifty 50")),
    ("UTI Nifty Next 50 Index Fund - Direct Plan - Growth", ("NIFNEX50", "Nifty Next 50")),        # never the Nifty 50
    ("SBI Nifty Smallcap 250 Index Fund - Direct Growth", ("NIFSMA250", "Nifty Smallcap 250")),
    ("Navi Nifty Midcap 150 Index Fund - Direct Plan - Growth", ("NIFMID150", "Nifty Midcap 150")),
    ("Bandhan Nifty 100 Index Fund - Direct Plan - Growth", ("NIF100", "Nifty 100")),
    ("Motilal Oswal Nifty 500 Index Fund - Direct Plan", ("NIF500", "Nifty 500")),                  # "Nifty 500" never read as the Nifty 50
    ("HDFC Index Fund-S&P BSE Sensex Plan - Direct Plan", ("SNSXSENSEX", "BSE Sensex")),
    ("Nippon India ETF Nifty BeES", ("NIF50", "Nifty 50")),                                       # a bare "Nifty BeES" is the Nifty 50
    ("ICICI Prudential Nifty Bank Index Fund - Direct Plan", ("NIFBAN", "Nifty Bank")),
    ("Motilal Oswal Nifty 500 Value 50 Index Fund - Direct Plan", None),                         # a variant is not its parent
    ("ICICI Prudential Nifty 50 Equal Weight Index Fund", None),
    ("Some House Index Fund - Direct Plan", None),                                                # names no index
    ("", None), (None, None),
])
def test_tracked_index_reads_the_index_from_the_name(name, want):
    assert bench.tracked_index(name) == want


def test_an_index_fund_is_set_against_the_index_it_tracks_not_the_nifty_500():
    tab, key, _ = mf.classify("Other Scheme - Index Funds")
    b = bench.benchmark_for(tab, key, "UTI Nifty 50 Index Fund - Direct Plan - Growth Option")
    assert (b["name"], b["legs"], b["standIn"], b["compared"], b["kind"], b["tracks"]) == ("Nifty 50", [("NIF50", 1.0)], False, True, "index", "NIF50")
    tab, key, _ = mf.classify("Other Scheme - Other  ETFs")
    assert key == "etf" and bench.benchmark_for(tab, key, "Nippon India ETF Nifty Next 50 Junior BeES")["name"] == "Nifty Next 50"


def test_no_index_on_the_site_falls_back_to_the_nifty_500_as_a_stand_in_with_the_reason():
    tab, key, _ = mf.classify("Other Scheme - Index Funds")
    b = bench.benchmark_for(tab, key, "Motilal Oswal Nifty 500 Value 50 Index Fund - Direct Plan")
    assert (b["name"], b["legs"], b["standIn"], b["tracks"]) == ("Nifty 500", [("NIF500", 1.0)], True, None) and b["why"].startswith("Stand-in:")
    # the tracked index known but with no closes today: the route swaps in the same stand-in, naming the index
    s = bench.stand_in_for(bench.passive_benchmark("UTI Nifty 50 Index Fund"))
    assert (s["name"], s["legs"], s["standIn"]) == ("Nifty 500", [("NIF500", 1.0)], True) and "Nifty 50 it tracks has no index closes" in s["why"]


def test_other_categories_keep_their_benchmarks():
    for cat, name, want in (("Equity Scheme - Flexi Cap Fund", "Parag Parikh Flexi Cap Fund", "Nifty 500"), ("Equity Scheme - Large Cap Fund", "Nippon India Large Cap Fund", "Nifty 100"),
                            ("Other Scheme - FoF Domestic", "Some Nifty 50 FoF", "Nifty 500"), ("Debt Scheme - Liquid Fund", "HDFC Liquid Fund", "Not compared"),
                            ("Other Scheme - Gold ETF", "Nippon India ETF Gold BeES", "Not compared")):
        tab, key, _ = mf.classify(cat)
        assert bench.benchmark_for(tab, key, name)["name"] == want, cat


def test_the_beta_against_the_tracked_index_is_about_one():
    """The fund follows the Nifty 50 exactly; the Nifty 500 moves differently. Against its own index it reads 1.00, explained in full."""
    from datetime import date
    end = date(2026, 11, 20).toordinal()
    days = [end - i for i in range(420, -1, -1) if date.fromordinal(end - i).weekday() < 5]
    n50, n500 = [100.0], [100.0]
    for i in range(1, len(days)):
        n50.append(n50[-1] * (1 + (0.004 if i % 4 else -0.009)))
        n500.append(n500[-1] * (1 + (0.002 if i % 3 else -0.004)))
    tab, key, _ = mf.classify("Other Scheme - Index Funds")
    f = {"code": 1, "bench": bench.benchmark_for(tab, key, "UTI Nifty 50 Index Fund"), "days": days, "navs": [x * 1.7 for x in n50]}
    out = bench.build([f], {"NIF50": (days, n50), "NIF500": (days, n500)}, None, end)["funds"][0]
    assert out["benchmark"] == "Nifty 50" and out["betaOwn"] == 1.0 and out["explained"] == 100 and out["standIn"] is False
    assert out["beta500"] != 1.0, "against the Nifty 500 it would read something else: the fault the file names"


# ------------------------------------------------------------------------------------------------------------------ fault 6: falls taken when not compared

def test_a_fund_not_compared_shows_no_falls_taken_with_the_reason():
    liquid = mfp.not_compared({"code": 1, "compared": False, "fallsTaken": -4.0, "beta": 0.01})
    assert liquid["fallsTaken"] is None and liquid["fallsWhy"].startswith("Not compared")
    eq = mfp.not_compared({"code": 2, "compared": True, "fallsTaken": 93.0})
    assert eq["fallsTaken"] == 93.0 and "fallsWhy" not in eq
    young = mfp.not_compared({"code": 3, "fallsTaken": None})                   # no own-benchmark figures at all: left as it is
    assert young == {"code": 3, "fallsTaken": None}


# ------------------------------------------------------------------------------------------------------------------ fault 10: names from the master

def _fund(code, holdings):
    return {"code": code, "name": f"Fund {code}", "amc": "A", "category": "Flexi Cap", "units": None, "nav": None, "holdings": holdings, "assetSplit": None, "series": None}


def test_holdings_take_the_masters_name_and_keep_the_files_name_without_a_match():
    funds = [_fund(1, [{"isin": "INE423A01024", "name": "EQ - ADANI PORTS AND SPECIAL ECONO", "stockSymbol": "ADANIPORTS", "assetClass": "equity", "pct": 5.0},
                       {"isin": "ine154a01025", "name": "ITC LTD", "stockSymbol": "ITC", "assetClass": "equity", "pct": 4.0},
                       {"isin": "INE999Z01011", "name": "Unlisted Co Pvt Ltd", "stockSymbol": None, "assetClass": "equity", "pct": 1.0},
                       {"isin": None, "name": "TREPS", "assetClass": "cash", "pct": 2.0}]),
             _fund(2, [{"isin": "INE154A01025", "name": "ITC Ltd.", "stockSymbol": "ITC", "assetClass": "equity", "pct": 3.0}]), _fund(3, None)]
    names = {"INE423A01024": "Adani Ports & Special Economic Zone Ltd", "INE154A01025": "ITC Ltd"}
    assert master_names(funds, names) == 3
    h = funds[0]["holdings"]
    assert (h[0]["name"], h[0]["fileName"]) == ("Adani Ports & Special Economic Zone Ltd", "EQ - ADANI PORTS AND SPECIAL ECONO")
    assert (h[1]["name"], h[1]["fileName"]) == ("ITC Ltd", "ITC LTD")
    assert h[2]["name"] == "Unlisted Co Pvt Ltd" and "fileName" not in h[2]                 # no match: the file's own name
    assert h[3]["name"] == "TREPS"
    # every reading the page gets carries the one name, whichever fund was read first
    out = spread(funds, lambda isin, sym: "Large")
    assert {s["name"] for s in out["topStocks"]} == {"Adani Ports & Special Economic Zone Ltd", "ITC Ltd", "Unlisted Co Pvt Ltd"}
    cells = [s["name"] for c in out["lookThrough"]["macro"].values() for s in c["stocks"]]
    assert "ITC Ltd" in cells and not any(n.startswith("EQ - ") or n == "ITC LTD" for n in cells)


# ------------------------------------------------------------------------------------------------------------------ the route, against Postgres and Redis

URL = "/api/me/mf-portfolio"
BASE = 938900


from test_auth import app, signed_in  # noqa: E402,F401
from test_integration import ingested, make_settings, store  # noqa: E402,F401
from test_mfportfolio_api import schemes as _schemes  # noqa: E402,F401  (the MF tables, made again from their migrations)
from test_mfportfolio_api import _trading_days  # noqa: E402

ROUTE_SCHEMES = [(BASE + 1, "Zeta Nifty 50 Index Fund - Direct Plan - Growth", "Other Scheme - Index Funds", 50.0),
                 (BASE + 2, "Zeta Liquid Fund - Direct Plan - Growth", "Debt Scheme - Liquid Fund", 3000.0),
                 (BASE + 3, "Zeta Flexi Cap Fund - Direct Plan - Growth", "Equity Scheme - Flexi Cap Fund", 80.0)]


async def _route_data(app, with_n50=True):
    from finlit import mf as m
    days = _trading_days(800)
    n500, n50 = [100.0], [100.0]
    for i in range(1, len(days)):
        n500.append(n500[-1] * (1 + (0.01 if i % 3 else -0.012)))
        n50.append(n50[-1] * (1 + (0.006 if i % 4 else -0.011)))
    liq = [100.0]
    for i in range(1, len(days)):
        liq.append(liq[-1] * 1.00025)                                          # a liquid fund: up a little every day, also on the index's down days
    navs = {BASE + 1: [x * 0.5 for x in n50], BASE + 2: liq, BASE + 3: [x * 0.8 for x in n500]}
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM mf_schemes WHERE code >= $1 AND code < $2", BASE, BASE + 100)
        for c, name, cat, nav in ROUTE_SCHEMES:
            await conn.execute("INSERT INTO mf_schemes (code, name, amc, scheme_type, category, plan, option_class, option_label, family, isin, nav, nav_date, active, has_hist) "
                               "VALUES ($1,$2,'Zeta Mutual Fund','Open Ended',$3,'Direct','Growth','Growth',$4,$5,$6,$7,true,true)",
                               c, name, cat, name.split(" - ")[0], f"INF0ZZ{c % 1000:03d}011", nav, days[-1])
        for code, v in navs.items():
            await conn.execute("INSERT INTO mf_history (code, n, d0, d1, blob, complete) VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT (code) DO UPDATE SET blob = EXCLUDED.blob, d0 = EXCLUDED.d0, "
                               "d1 = EXCLUDED.d1, n = EXCLUDED.n", code, len(days), days[0], days[-1], m.pack_series([d.toordinal() for d in days], v))
    put = lambda code, xs: app.state.store.redis.set(f"idx:px:{code}", json.dumps({"t": time.time(), "v": {"rows": [{"quote_date": d.isoformat(), "close_price": c} for d, c in zip(days, xs)]}}))  # noqa: E731
    await put("NIF500", n500)
    if with_n50:
        await put("NIF50", n50)
    else:
        await app.state.store.redis.set("idx:px:NIF50", json.dumps({"t": time.time(), "v": {"rows": []}}))


@pytest.mark.integration
async def test_route_index_fund_against_its_index_and_liquid_falls_taken_blank(app):  # noqa: F811
    await _route_data(app)
    c = await signed_in(app, "r389@example.com", plan="silver")
    for code in (BASE + 1, BASE + 2, BASE + 3):
        assert (await c.post(URL, json={"code": code, "units": "100"})).status_code == 201
    body = (await c.get(URL + "/risk")).json()
    by = {f["code"]: f for f in body["funds"]}
    ix, liq, flexi = by[BASE + 1], by[BASE + 2], by[BASE + 3]
    assert (ix["benchmark"], ix["standIn"], ix["betaOwn"], ix["explained"]) == ("Nifty 50", False, 1.0, 100)       # was the Nifty 500
    assert ix["beta500"] != 1.0
    assert liq["compared"] is False and liq["fallsTaken"] is None and liq["fallsWhy"].startswith("Not compared")       # was a figure ("−4 per 100")
    assert flexi["benchmark"] == "Nifty 500" and flexi["fallsTaken"] is not None and "fallsWhy" not in flexi
    assert ix["fallsTaken"] is not None                                                                                  # other funds keep theirs


@pytest.mark.integration
async def test_route_index_fund_without_its_index_closes_is_a_stand_in(app, monkeypatch):  # noqa: F811
    from finlit import indices
    await _route_data(app, with_n50=False)
    real = indices._fetch_levels

    async def no_n50(a, code, *k, **kw):
        return None if code == "NIF50" else await real(a, code, *k, **kw)
    monkeypatch.setattr(indices, "_fetch_levels", no_n50)
    c = await signed_in(app, "r389b@example.com", plan="silver")
    assert (await c.post(URL, json={"code": BASE + 1, "units": "100"})).status_code == 201
    ix = (await c.get(URL + "/risk")).json()["funds"][0]
    assert (ix["benchmark"], ix["standIn"]) == ("Nifty 500", True) and "Nifty 50 it tracks has no index closes" in ix["benchWhy"] and ix["betaOwn"] is not None


@pytest.mark.integration
async def test_route_diversification_names_come_from_the_master(app, monkeypatch):  # noqa: F811
    from finlit import portfolios
    await _route_data(app)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO companies (symbol, name) VALUES ('ZZPORTS', 'Zeta Ports & Special Economic Zone Ltd') ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name")
        await conn.execute("INSERT INTO disclosure_isin (isin, symbol) VALUES ('INE0ZZP01011', 'ZZPORTS') ON CONFLICT (isin) DO UPDATE SET symbol = EXCLUDED.symbol")
    held = {"asOf": "2026-10-31", "summary": {"assetSplit": {"equity": 95, "debt": 0, "cash": 5, "other": 0}},
            "holdings": [{"isin": "INE0ZZP01011", "name": "EQ - ZETA PORTS AND SPECIAL ECONO", "stockSymbol": "ZZPORTS", "assetClass": "equity", "pct": 6.0},
                         {"isin": "INE0ZZQ01019", "name": "Unmatched Co Ltd", "stockSymbol": None, "assetClass": "equity", "pct": 2.0}]}

    async def get(pool, code):
        return held if code == BASE + 3 else None
    monkeypatch.setattr(portfolios, "get_portfolio", get)
    c = await signed_in(app, "r389c@example.com", plan="silver")
    assert (await c.post(URL, json={"code": BASE + 3, "units": "100"})).status_code == 201
    body = (await c.get(URL + "/diversification")).json()
    names = {s["name"] for s in body["topStocks"]}
    assert names == {"Zeta Ports & Special Economic Zone Ltd", "Unmatched Co Ltd"}
    assert not any(s["name"].startswith("EQ - ") for c2 in body["lookThrough"]["macro"].values() for s in c2["stocks"])
