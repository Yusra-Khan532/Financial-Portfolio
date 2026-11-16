"""/api/me/etf-portfolio (task #136) against real Postgres and Redis: the Silver gate, the plan's 15 ETFs, add / quantities / remove / remove all, per-member
ownership, Origin and CSRF, the import preview (ISIN first, then symbol; a company's shares never become an ETF) and the commit, and the three readings
(list, what's inside, risk) filled from the ETF data. The ETF data sources are stood in for, so the figures are known."""

import math
import random
from datetime import date, timedelta
from pathlib import Path

import pytest

from finlit.etfportfolio import api as ep
from test_auth import PW, anon, app, make_admin, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401

pytestmark = pytest.mark.integration
URL = "/api/me/etf-portfolio"
MIGRATION = Path(ep.__file__).parent.parent / "migrations" / "104_etf_portfolio.sql"
TODAY = date(2026, 11, 13)


def row(sym, name, isin, cat, cls, price, prem, ter=None, **kw):
    return {"symbol": sym, "display_name": name, "isin": isin, "fund_house": name.split()[0] + " Mutual Fund", "category": cat, "asset_class": cls, "price": price,
            "prev_close": price * 1.005, "change_pct": -0.5, "price_date": TODAY, "avg_turnover": 2.74e9 if sym == "NIFTYBEES" else 3.8e8, "ret_1y": kw.get("r1", -1.97),
            "ret_5y": kw.get("r5"), "nav": price / (1 + prem / 100), "nav_date": TODAY, "nav_premium": prem, "reasons": kw.get("why", {}), "first_date": date(2016, 1, 1),
            "updated_at": None, "_ter": ter}


ROWS = {r["symbol"]: r for r in [
    row("NIFTYBEES", "Nippon India ETF Nifty 50 BeES", "INF204KB14I2", "nifty50", "equity", 286.64, 0.1, "0.04% a year", r5=46.65),
    row("SBINIFTY50", "SBI Nifty 50 ETF", "INF200KA16D8", "nifty50", "equity", 271.04, 0.05, "0.04% a year", r5=46.65),
    row("GOLDBEES", "Nippon India ETF Gold BeES", "INF204KB17I5", "gold", "gold", 111.91, 0.15, "0.79% a year", r5=163.63),
    row("MON100", "Motilal Oswal Nasdaq 100 ETF", "INF247L01AP3", "intl", "international", 302.35, 1.9, "0.58% a year", r5=156.66),
    row("LIQUIDCASE", "Zerodha CASE Nifty 1D Rate Liquid ETF", "INF0R8F01034", "liquid", "debt", 116.91, 0.0, None, why={"ret_5y": "Listed less than 5 years ago"}),
]}
BENCH = {"NIFTYBEES": "Nifty 50 TRI", "GOLDBEES": "Domestic Price of Gold", "MON100": "NASDAQ - 100 TRI"}
HOLD = {
    "NIFTYBEES": [{"name": "HDFC Bank Limited", "isin": "INE040A01034", "stockSymbol": "HDFCBANK", "sector": "Banks", "assetClass": "equity", "pct": 10.0},
                  {"name": "ICICI Bank Limited", "isin": "INE090A01021", "stockSymbol": "ICICIBANK", "sector": "Banks", "assetClass": "equity", "pct": 9.0}],
    "SBINIFTY50": [{"name": "HDFC Bank Ltd", "isin": "INE040A01034", "stockSymbol": "HDFCBANK", "sector": "Banks", "assetClass": "equity", "pct": 10.0},
                   {"name": "ICICI Bank Ltd", "isin": "INE090A01021", "stockSymbol": "ICICIBANK", "sector": "Banks", "assetClass": "equity", "pct": 9.0}],
    "MON100": [{"name": "NVIDIA Corp", "isin": "US67066G1040", "stockSymbol": None, "sector": "Semiconductors", "assetClass": "equity", "pct": 9.0}],
}


def walk(seed, vol, base=None, drift=0.0003):
    r, out, x = random.Random(seed), [], 100.0
    for i, d in enumerate(DAYS):
        x = base[i] * (1 + r.gauss(0, 0.0003)) if base else x * (1 + drift + r.gauss(0, vol))
        out.append(x)
    return out


DAYS = [d for d in (TODAY - timedelta(days=k) for k in range(3 * 366, -1, -1)) if d.weekday() < 5]
N500 = walk(9, 0.009)
SERIES = {"NIFTYBEES": walk(1, 0, N500), "SBINIFTY50": walk(2, 0, N500), "GOLDBEES": walk(3, 0.006), "MON100": walk(4, 0.013),
          "LIQUIDCASE": [100 * (1 + 0.00018) ** i for i in range(len(DAYS))]}


@pytest.fixture(autouse=True)
async def etf_data(app, monkeypatch):  # noqa: F811
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DROP TABLE IF EXISTS etf_holdings CASCADE")
        await conn.execute(MIGRATION.read_text())

    async def rows(_app):
        return ROWS

    async def facts(_app, isin):
        sym = next(s for s, r in ROWS.items() if r["isin"] == isin)
        f = {"ter": {"value": ROWS[sym]["_ter"], "asOf": "2026-10-31", "source": "AMFI"}} if ROWS[sym]["_ter"] else {}
        return {**f, **({"benchmark": {"value": BENCH[sym]}} if sym in BENCH else {})}

    async def idx(_app):
        return {"NIFTYBEES": ("nifty50", "Nifty 50"), "SBINIFTY50": ("nifty50", "Nifty 50")}

    async def track(_req, sym):
        return {"value": 0.87 if sym == "NIFTYBEES" else 0.91, "why": None, "from": "2025-11-13", "to": "2026-11-13"}

    async def holds(_app, isin):
        sym = next(s for s, r in ROWS.items() if r["isin"] == isin)
        if sym not in HOLD:
            return None, "No disclosure has been published or found for this ETF yet"
        return {"asOf": "2026-10-31", "source": "fund house", "holdings": HOLD[sym], "summary": {"assetSplit": {"equity": 99.5, "debt": 0, "cash": 0.5, "other": 0}}}, None

    async def closes(_app, sym, _r):
        return [d.toordinal() for d in DAYS], SERIES[sym], None

    async def bench(_app):
        return {d.toordinal(): v for d, v in zip(DAYS, N500)}

    async def scores(_app, syms, gold):
        return {s: {"model": "prism" if gold else "iq", "score": 73.0, "label": "HEALTHY" if gold else "Healthy"} for s in syms}

    async def sizes(_app, isins):
        return {i: "Large" for i in isins}

    for name, fn in (("etf_rows", rows), ("facts_for", facts), ("index_keys", idx), ("tracking_for", track), ("holdings_for", holds), ("closes_for", closes),
                     ("nifty500", bench), ("scores_for", scores), ("size_of_isins", sizes)):
        monkeypatch.setattr(ep, name, fn)
    yield


async def fill(c, syms=("NIFTYBEES", "SBINIFTY50", "GOLDBEES", "MON100", "LIQUIDCASE")):
    for s in syms:
        r = await c.post(URL, json={"symbol": s})
        assert r.status_code == 201, r.text


async def test_visitors_and_basic_are_refused_silver_and_gold_are_not(app):  # noqa: F811
    assert (await new_client(app).get(URL)).status_code == 401
    basic = await signed_in(app, "b@example.com")
    r = await basic.get(URL)
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_required"
    assert (await basic.post(URL, json={"symbol": "NIFTYBEES"})).status_code == 403
    for plan in ("silver", "gold"):
        r = await (await signed_in(app, f"{plan}@example.com", plan=plan)).get(URL)
        assert r.status_code == 200 and r.json()["limit"] == 15 and r.headers["cache-control"] == "private, no-store"


async def test_add_quantities_remove_and_the_plan_limit(app, monkeypatch):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    assert (await c.post(URL, json={"symbol": "NOPE"})).status_code == 404
    assert (await c.post(URL, json={"symbol": "niftybees", "qty": "0"})).status_code == 422
    await fill(c, ("NIFTYBEES", "GOLDBEES"))
    again = await c.post(URL, json={"symbol": "NIFTYBEES", "qty": "10"})
    assert again.status_code == 201 and again.json()["merged"] is True
    body = (await c.get(URL)).json()
    assert body["count"] == 2 and body["basis"] == "equal" and body["missingQty"] == ["GOLDBEES"]
    assert [i["weight"] for i in body["items"]] == [50.0, 50.0]
    r = await c.put(URL + "/quantities", json={"items": [{"symbol": "GOLDBEES", "qty": "100"}, {"symbol": "NIFTYBEES", "qty": 10}]})
    assert r.status_code == 200
    body = (await c.get(URL)).json()
    assert body["basis"] == "value" and body["items"][0]["value"] == pytest.approx(2866.4) and body["items"][1]["weight"] == pytest.approx(round(11191 / (11191 + 2866.4) * 100, 1))
    assert (await c.put(URL + "/quantities", json={"items": [{"symbol": "MON100", "qty": 1}]})).status_code == 404     # not in the list: refused, not added
    assert (await c.put(URL + "/quantities", json={"items": [{"symbol": "GOLDBEES", "qty": ""}]})).status_code == 200  # cleared: equal weights again
    assert (await c.get(URL)).json()["basis"] == "equal"
    monkeypatch.setitem(ep.LIMITS["silver"], "etf_holdings", 3)
    await fill(c, ("MON100",))
    r = await c.post(URL, json={"symbol": "LIQUIDCASE"})
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_limit"
    assert (await c.delete(URL + "/MON100")).status_code == 200 and (await c.delete(URL + "/MON100")).status_code == 404
    other = await signed_in(app, "o@example.com", plan="silver")
    assert (await other.get(URL)).json()["count"] == 0 and (await other.delete(URL + "/GOLDBEES")).status_code == 404   # another member's list is not reachable
    assert (await c.delete(URL)).json()["removed"] == 2 and (await c.get(URL)).json()["count"] == 0


async def test_writes_need_our_origin_and_csrf(app):  # noqa: F811
    c = await signed_in(app, "s@example.com", plan="silver")
    bare = new_client(app)
    bare.cookies = c.cookies
    assert (await bare.post(URL, json={"symbol": "NIFTYBEES"})).status_code in (401, 403)


async def test_the_list_twice_tag_tracks_costs_and_premiums(app):  # noqa: F811
    c = await signed_in(app, "g@example.com", plan="gold")
    await fill(c)
    b = (await c.get(URL)).json()
    it = {i["symbol"]: i for i in b["items"]}
    assert [i["symbol"] for i in b["items"]] == ["NIFTYBEES", "SBINIFTY50", "GOLDBEES", "MON100", "LIQUIDCASE"]
    assert b["repeats"] == [{"key": "idx:nifty50", "label": "Nifty 50", "symbols": ["NIFTYBEES", "SBINIFTY50"]}]
    assert it["NIFTYBEES"]["twice"] and it["SBINIFTY50"]["twice"] and not it["GOLDBEES"]["twice"]
    assert [it[s]["tracks"]["label"] for s in it] == ["Nifty 50", "Nifty 50", "Gold", "NASDAQ-100", "Liquid / overnight"]
    assert it["NIFTYBEES"]["ter"]["value"] == 0.04 and it["LIQUIDCASE"]["ter"]["value"] is None and it["LIQUIDCASE"]["ter"]["why"]
    assert it["MON100"]["premium"] == 1.9 and it["NIFTYBEES"]["tracking"]["value"] == 0.87
    assert it["GOLDBEES"]["tracking"]["value"] is None and "nothing to measure it against" in it["GOLDBEES"]["tracking"]["why"]
    assert it["LIQUIDCASE"]["ret5y"] is None and it["LIQUIDCASE"]["ret5yWhy"] == "Listed less than 5 years ago"
    assert b["asOf"] == "2026-11-13" and b["basis"] == "equal"


async def test_whats_inside_mix_overlap_and_largest_stocks_by_plan(app):  # noqa: F811
    for plan, model in (("gold", "prism"), ("silver", "iq")):
        c = await signed_in(app, f"{plan}2@example.com", plan=plan)
        await fill(c)
        b = (await c.get(URL + "/inside")).json()
        assert b["scoreModel"] == model and b["asOf"] == "2026-10-31"
        assert b["mix"]["gold"] == 20.0 and b["mix"]["debt"] == pytest.approx(20.3, abs=0.1) and b["mix"]["abroad"] == pytest.approx(19.9, abs=0.1)
        assert b["overlap"]["symbols"] == ["NIFTYBEES", "SBINIFTY50", "MON100"]
        pair = next(p for p in b["overlap"]["pairs"] if {p["a"], p["b"]} == {"NIFTYBEES", "SBINIFTY50"})
        assert pair["pct"] == 19.0 and pair["n"] == 2
        top = {t["name"]: t for t in b["top"]}
        hdfc = top["HDFC Bank Limited"]
        assert hdfc["etfs"] == ["NIFTYBEES", "SBINIFTY50"] and hdfc["w"] == 4.0 and hdfc["score"]["model"] == model and hdfc["size"] == "Large"
        assert top["NVIDIA Corp"]["score"] is None and top["NVIDIA Corp"]["scoreWhy"] == "Not compared: listed abroad"
        assert b["size"]["Large"] == 100.0
        why = {f["symbol"]: f["why"] for f in b["files"]}
        assert why["GOLDBEES"] and why["NIFTYBEES"] is None


async def test_risk_against_the_nifty_500_together_and_each_ones_share(app):  # noqa: F811
    c = await signed_in(app, "s3@example.com", plan="silver")
    await fill(c)
    b = (await c.get(URL + "/risk")).json()
    e = {x["symbol"]: x for x in b["etfs"]}
    assert b["basis"] == "equal" and b["bench"]["name"] == "Nifty 500"
    assert e["NIFTYBEES"]["beta"] == pytest.approx(1.0, abs=0.05) and e["NIFTYBEES"]["fallsTaken"] == pytest.approx(100, abs=5)
    assert b["list"]["swing"] < b["bench"]["swing"] and b["list"]["level"]["word"] in ("Lower", "A little lower")
    assert "funds" not in (b["list"]["level"]["because"] or "") and b["list"]["level"]["because"]
    assert b["together"]["leftOut"] == ["LIQUIDCASE"] and "LIQUIDCASE" not in b["together"]["symbols"]
    r = {(p["a"], p["b"]): p["r"] for p in b["together"]["pairs"]}
    assert r[("NIFTYBEES", "SBINIFTY50")] > 0.99
    shares = b["adds"]["shares"]
    assert sum(shares.values()) == pytest.approx(100, abs=0.5) and abs(shares["LIQUIDCASE"]) < 1 and shares["NIFTYBEES"] > shares["GOLDBEES"]


async def test_import_preview_and_commit(app, monkeypatch):  # noqa: F811
    c = await signed_in(app, "s4@example.com", plan="silver")
    await fill(c, ("GOLDBEES",))
    rows = [{"row": 2, "isin": "INF204KB14I2", "symbol": "NIFTYBEES", "name": "NIPPON NIFTY BEES", "qty": "100"},
            {"row": 3, "symbol": "SBINIFTY50-EQ", "qty": "40"},
            {"row": 4, "isin": "INE040A01034", "symbol": "HDFCBANK", "qty": "5"},
            {"row": 5, "isin": "INF204KB17I5", "qty": "10"},
            {"row": 6, "symbol": "NIFTYBEES", "qty": "20"},
            {"row": 7, "symbol": "ZZZ", "qty": "1"},
            {"row": 8, "symbol": "MON100", "qty": "-1"}]
    p = (await c.post(URL + "/import-preview", json={"rows": rows})).json()
    st = [r["status"] for r in p["rows"]]
    assert st == ["matched", "matched", "ignored", "matched", "duplicate", "not_found", "invalid"]
    assert p["rows"][0]["qty"] == 120 and p["rows"][3]["existing"] is True and p["capacity"] == {"limit": 15, "used": 1, "room": 14}
    items = [{"symbol": r["etf"]["symbol"], "qty": r["qty"]} for r in p["rows"] if r["status"] == "matched"]
    r = (await c.post(URL + "/import-commit", json={"items": items})).json()
    assert (r["added"], r["skipped"], r["replaced"]) == (2, 1, 0)
    r = (await c.post(URL + "/import-commit", json={"items": items, "existing": "replace"})).json()
    assert r["replaced"] == 3
    got = {i["symbol"]: i["qty"] for i in (await c.get(URL)).json()["items"]}
    assert got == {"GOLDBEES": 10.0, "NIFTYBEES": 120.0, "SBINIFTY50": 40.0}
    assert (await c.post(URL + "/import-commit", json={"items": [{"symbol": "ZZZ"}]})).status_code == 422
    monkeypatch.setitem(ep.LIMITS["silver"], "etf_holdings", 3)
    r = await c.post(URL + "/import-commit", json={"items": [{"symbol": "MON100"}]})
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_limit"
