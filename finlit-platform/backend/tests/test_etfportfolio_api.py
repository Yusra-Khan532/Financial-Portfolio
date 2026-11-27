"""/api/me/etf-portfolio (task #136) against real Postgres and Redis: the Silver gate, the plan's 15 ETFs, add / quantities / remove / remove all, per-member
ownership, Origin and CSRF, the import preview (ISIN first, then symbol; a company's shares never become an ETF) and the commit, and the three readings
(list, what's inside, risk) filled from the ETF data. The ETF data sources are stood in for, so the figures are known."""

import json
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
REAL_TER_FOR = ep.ter_for          # the fixture below stands in for it; one test reads the real one
REAL_NAMES_FOR = ep.names_of_isins   # task #390: the same for the master's names


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


MASTER: dict = {}      # ISIN -> the listed-company master's name, as names_of_isins answers (task #390, fault 9); empty unless a test fills it


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
        await conn.execute((MIGRATION.parent / "109_etf_holdings_isin.sql").read_text())   # task #183: each ETF stored with its ISIN

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
        return {s: {"model": "prism", "score": 73.0, "label": "HEALTHY"} for s in syms} if gold else {}     # task #283 PR C: no retired FinLit IQ below Gold

    async def sizes(_app, isins):
        return {i: "Large" for i in isins}

    async def ter(_app, isin):            # task #183: the expense ratio comes from AMFI's TER file by ISIN
        t = next(r["_ter"] for r in ROWS.values() if r["isin"] == isin)
        return {"value": float(t.split("%")[0]), "asOf": "2026-11-06", "source": "AMFI, TER of mutual fund schemes", "why": None} if t else \
            {"value": None, "why": "AMFI's TER file shows no figure for the Direct plan (the scheme may not offer it)."}

    async def names(_app, isins):          # task #390 (fault 9): the master's names; none by default, so the fund files' text stays (a test below sets some)
        return {i: MASTER[i] for i in isins if i in MASTER}

    for name, fn in (("etf_rows", rows), ("facts_for", facts), ("index_keys", idx), ("tracking_for", track), ("holdings_for", holds), ("closes_for", closes),
                     ("nifty500", bench), ("scores_for", scores), ("size_of_isins", sizes), ("ter_for", ter), ("names_of_isins", names)):
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
    for plan, model in (("gold", "prism"), ("silver", "none")):
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
        assert hdfc["etfs"] == ["NIFTYBEES", "SBINIFTY50"] and hdfc["w"] == 4.0 and (hdfc["score"] or {}).get("model", "none") == model and hdfc["size"] == "Large"
        assert "NVIDIA Corp" not in top                                   # task #183: the largest stocks are Indian; holdings abroad are listed apart
        assert b["abroadTop"] == {"MON100": [{"name": "NVIDIA Corp", "isin": "US67066G1040", "pct": 9.0}]}
        assert b["size"]["Large"] == 100.0
        assert plan == "gold" or (hdfc["score"] is None and hdfc["scoreWhy"] and '"iq"' not in json.dumps(b))
        # task #183: the look-through grid adds up to the list's share in Indian shares, both levels, with each company and its plan's reading
        assert b["knownShares"] == pytest.approx(0.076) and sum(c["w"] for c in b["lookThrough"]["macro"].values()) == pytest.approx(0.076)
        assert sum(c["w"] for c in b["lookThrough"]["sector"].values()) == pytest.approx(0.076)
        cell = b["lookThrough"]["sector"]["Banks|Large"]
        assert cell["n"] == 2 and [x["symbol"] for x in cell["stocks"]] == ["HDFCBANK", "ICICIBANK"] and (cell["stocks"][0]["score"] or {}).get("model", "none") == model
        assert b["perEtf"]["NIFTYBEES"]["size"] == {"Large": pytest.approx(0.19)} and "MON100" not in b["perEtf"]
        why = {f["symbol"]: f["why"] for f in b["files"]}
        assert why["GOLDBEES"] and why["NIFTYBEES"] is None


async def test_task_390_inside_names_come_from_the_listed_company_master(app, monkeypatch):  # noqa: F811
    """File 34, fault 9: a holding whose ISIN the master knows takes the master's name in the largest stocks and in every grid chip; one with no match keeps
    the fund file's text; holdings abroad are not looked up. The stored fund-file lines are not changed."""
    monkeypatch.setitem(MASTER, "INE040A01034", "HDFC Bank Ltd")         # the fixture's files say "HDFC Bank Limited" (NIFTYBEES) and "HDFC Bank Ltd" (SBINIFTY50)
    asked: list = []
    real = ep.names_of_isins

    async def spy(a, isins):
        asked.extend(isins)
        return await real(a, isins)
    monkeypatch.setattr(ep, "names_of_isins", spy)
    c = await signed_in(app, "gold390@example.com", plan="gold")
    await fill(c)
    b = (await c.get(URL + "/inside")).json()
    top = {t["isin"]: t["name"] for t in b["top"]}
    assert top["INE040A01034"] == "HDFC Bank Ltd" and top["INE090A01021"] == "ICICI Bank Limited"      # ICICI: no master match, the file's name stays
    chips = {st["symbol"]: st["name"] for cells in b["lookThrough"].values() for cl in cells.values() for st in cl["stocks"]}
    assert chips["HDFCBANK"] == "HDFC Bank Ltd" and chips["ICICIBANK"] == "ICICI Bank Limited"
    assert "US67066G1040" not in asked and b["abroadTop"]["MON100"][0]["name"] == "NVIDIA Corp"
    assert HOLD["NIFTYBEES"][0]["name"] == "HDFC Bank Limited"                                         # the fund file's own lines are left as they were


async def test_task_390_names_of_isins_reads_the_master(app):  # noqa: F811
    """The real lookup: disclosure_isin -> companies.name; an ISIN the master does not know, or a company whose name is only its symbol, is left out."""
    async with app.state.store.pool.acquire() as conn:
        for sym, name, isin in (("ZZSONA", "Zz Sona Precision Forgings Ltd", "INE0ZZ390011"), ("ZZBARE", "ZZBARE", "INE0ZZ390021")):
            await conn.execute("INSERT INTO companies (symbol, name) VALUES ($1, $2) ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name", sym, name)
            await conn.execute("INSERT INTO disclosure_isin (isin, symbol) VALUES ($1, $2) ON CONFLICT (isin) DO UPDATE SET symbol = EXCLUDED.symbol", isin, sym)
    got = await REAL_NAMES_FOR(app, ["INE0ZZ390011", "INE0ZZ390021", "INE0ZZ390099"])
    assert got == {"INE0ZZ390011": "Zz Sona Precision Forgings Ltd"}
    assert await REAL_NAMES_FOR(app, []) == {}


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


async def test_import_preview_says_company_shares_for_a_report_that_names_them_by_symbol(app):  # noqa: F811
    """22 Nov 2026: a broker's holdings report names shares and ETFs by symbol alone (no ISIN). A company's line (NSE symbol, BSE code or BSE scrip ID)
    is "a company's shares, left for the Equity portfolio", not "no ETF with this ISIN or symbol"; an unknown symbol stays not found."""
    c = await signed_in(app, "s22n@example.com", plan="silver")
    async with app.state.store.pool.acquire() as conn:
        await conn.executemany("INSERT INTO companies (symbol, name, nse_code, bse_code) VALUES ($1, $2, $3, $4) ON CONFLICT (symbol) DO NOTHING",
                               [("ZZCOA", "Zz Company A Ltd", "ZZCOA", "999201"), ("999202", "Zz Bse Only Ltd", None, "999202")])
        await conn.execute("INSERT INTO dhan_instruments (exch, security_id, symbol, name, series) VALUES ('BSE', '999202', 'ZZPRIMEID', 'Zz Bse Only', 'X') "
                           "ON CONFLICT DO NOTHING")
    try:
        rows = [{"row": 4, "symbol": "ZZCOA", "qty": "60"}, {"row": 5, "symbol": "999201", "qty": "1"}, {"row": 6, "symbol": "ZZPRIMEID", "qty": "45"},
                {"row": 7, "symbol": "NIFTYBEES", "qty": "270"}, {"row": 8, "symbol": "ZZNOTHING", "qty": "1"}]
        p = (await c.post(URL + "/import-preview", json={"rows": rows})).json()
        assert [r["status"] for r in p["rows"]] == ["ignored", "ignored", "ignored", "matched", "not_found"]
        assert p["rows"][0]["reason"] == "A company's shares, not an ETF: left for the Equity portfolio."
        assert p["rows"][4]["reason"] == "No ETF with this ISIN or symbol."
        assert p["counts"]["ignored"] == 3 and p["counts"]["matched"] == 1
    finally:
        async with app.state.store.pool.acquire() as conn:
            await conn.execute("DELETE FROM companies WHERE symbol = ANY($1)", ["ZZCOA", "999202"])
            await conn.execute("DELETE FROM dhan_instruments WHERE exch = 'BSE' AND security_id = '999202'")


# ------------------------------------------------------------------------------------------------------------------------ task #183 part 3 (15 Nov pack)

async def test_183_added_by_isin_stored_with_it_and_cleared_with_undo(app, monkeypatch):  # noqa: F811
    c = await signed_in(app, "s183@example.com", plan="silver")
    r = await c.post(URL, json={"symbol": "inf204kb17i5"})                  # an ETF named by its ISIN
    assert r.status_code == 201 and r.json()["symbol"] == "GOLDBEES" and r.json()["isin"] == "INF204KB17I5"
    assert (await c.post(URL, json={"symbol": "INE040A01034"})).status_code == 404    # a company's ISIN is not an ETF
    await fill(c, ("NIFTYBEES",))
    await c.put(URL + "/quantities", json={"items": [{"symbol": "NIFTYBEES", "qty": "12.5"}]})
    async with app.state.store.pool.acquire() as conn:
        stored = {r["symbol"]: r["isin"] for r in await conn.fetch("SELECT symbol, isin FROM etf_holdings")}
    assert stored == {"GOLDBEES": "INF204KB17I5", "NIFTYBEES": "INF204KB14I2"}
    r = (await c.post(URL + "/clear")).json()
    assert r == {"status": "cleared", "removed": 2, "undoSeconds": 10} and (await c.get(URL)).json()["count"] == 0
    assert (await c.post(URL + "/undo-clear")).json() == {"status": "restored", "restored": 2}
    got = {i["symbol"]: i["qty"] for i in (await c.get(URL)).json()["items"]}
    assert got == {"GOLDBEES": None, "NIFTYBEES": 12.5}                       # exactly what was there, quantities too
    assert (await c.post(URL + "/undo-clear")).status_code == 410            # Undo once; after that (or after 10 s) the clear is final
    other = await signed_in(app, "o183@example.com", plan="silver")
    await c.post(URL + "/clear")
    assert (await other.post(URL + "/undo-clear")).status_code == 410        # another member cannot undo it
    assert (await c.post(URL + "/undo-clear")).status_code == 200


async def test_183_types_and_the_expense_ratio_from_amfi(app):  # noqa: F811
    c = await signed_in(app, "g183@example.com", plan="gold")
    await fill(c)
    it = {i["symbol"]: i for i in (await c.get(URL)).json()["items"]}
    assert [it[s]["type"]["key"] for s in it] == ["indian", "indian", "gold", "abroad", "liquid"]
    assert it["LIQUIDCASE"]["type"]["payout"] is False and it["MON100"]["type"]["badge"] == "A"   # its price grows: a growth liquid ETF
    assert it["NIFTYBEES"]["ter"] == {"value": 0.04, "asOf": "2026-11-06", "source": "AMFI, TER of mutual fund schemes", "why": None}
    assert it["LIQUIDCASE"]["ter"]["value"] is None and "TER file" in it["LIQUIDCASE"]["ter"]["why"]
    assert it["NIFTYBEES"]["isin"] == "INF204KB14I2"


async def test_183_every_etf_against_the_nifty_500_weekly_liquid_counts_0(app):  # noqa: F811
    c = await signed_in(app, "r183@example.com", plan="silver")
    await fill(c)
    b = (await c.get(URL + "/risk")).json()
    e = {x["symbol"]: x for x in b["etfs"]}
    assert e["NIFTYBEES"]["betaPast"] == pytest.approx(1.0, abs=0.03) and e["NIFTYBEES"]["explained"] >= 99 and e["NIFTYBEES"]["band"]["key"] == "similar"
    assert e["NIFTYBEES"]["downPer100"] is not None and e["NIFTYBEES"]["differentAsset"] is False
    assert e["GOLDBEES"]["differentAsset"] is True and e["GOLDBEES"]["downPer100"] is None and e["GOLDBEES"]["upPer100"] is None   # R² under 0.2
    assert e["LIQUIDCASE"]["compared"] is False and e["LIQUIDCASE"]["betaPast"] == 0.0 and e["LIQUIDCASE"]["type"]["key"] == "liquid"
    assert sum(x["riskShare"] for x in b["etfs"]) == pytest.approx(100, abs=0.2)
    lst = b["own"]["list"]
    assert lst["betaOwn"] == pytest.approx(sum(x["betaPast"] for x in b["etfs"]) / 5, abs=0.01)                    # each type's share x its beta, liquid 0
    assert lst["betaExLiquid"] == pytest.approx(sum(x["betaPast"] for x in b["etfs"] if x["compared"]) / 4, abs=0.01)
    assert lst["betaIndian"] == pytest.approx((e["NIFTYBEES"]["betaPast"] + e["SBINIFTY50"]["betaPast"]) / 2, abs=0.01)
    assert lst["fall10"]["indian"] == pytest.approx(-10 * lst["betaIndian"], abs=0.06) and lst["liquidShare"] == 20.0
    assert "GOLDBEES" in lst["leftOutOfFall"] and "NIFTYBEES" not in lst["leftOutOfFall"]
    assert b["own"]["to"] == "2026-11-13" and b["own"]["from"] == "2025-11-14"                                        # 52 Friday-to-Friday weeks
    # task #276 (number fixes 4 and 5): the page's one beta carries its window, every index figure its window, and the 3-year daily list beta is renamed
    assert e["NIFTYBEES"]["betaWindow"] == {"index": "Nifty 500", "grain": "weekly", "window": "1y", "from": "2025-11-14", "to": "2026-11-13"}
    assert b["bench"]["grain"] == "daily" and b["bench"]["years"] > 0 and b["list"]["grain"] == "daily" and b["list"]["from"]
    assert "beta" not in b["list"] and "betaDaily3y" in b["list"]
    swings = [(x["swing"], x["weight"]) for x in b["etfs"] if x["swing"] is not None]
    assert b["list"]["swing"] <= sum(s * w for s, w in swings) / sum(w for _, w in swings) + 0.5     # fix 3: never above the weighted average


def test_183_type_of_reads_payout_or_growth_and_the_grid_leaves_out_what_is_abroad():
    from finlit.etf import FLAT_WHY
    from finlit.etfportfolio import calc
    assert calc.type_of("liquid", "debt", FLAT_WHY)["payout"] is True and calc.type_of("liquid", "debt", None)["payout"] is False
    assert [calc.type_of(c, a)["key"] for c, a in (("nifty50", "equity"), ("gold", "gold"), ("intl", "international"), ("silver", "silver"))] == ["indian", "gold", "abroad", "silver"]
    etfs = [{"symbol": "A", "w": 0.5, "assetClass": "equity", "holdings": [
                {"name": "X", "isin": "INE000000001", "stockSymbol": "X", "macroSector": "Energy", "sector": "Oil, Gas & Consumable Fuels", "assetClass": "equity", "pct": 60},
                {"name": "Y", "isin": "INE000000002", "stockSymbol": "Y", "macroSector": "Energy", "sector": "Power", "assetClass": "equity", "pct": 40}]},
            {"symbol": "B", "w": 0.25, "assetClass": "international", "holdings": [{"name": "Z", "isin": "US0000000001", "assetClass": "equity", "pct": 50}]},
            {"symbol": "C", "w": 0.25, "assetClass": "equity", "holdings": None}]                     # no monthly file: left out, never spread
    lt = calc.look_through(etfs, lambda i: "Large" if i.endswith("1") else None)
    assert lt["knownShares"] == pytest.approx(0.5) and set(lt["perEtf"]) == {"A"}
    assert lt["lookThrough"]["macro"] == {"Energy|Large": {"w": 0.3, "n": 1, "stocks": [{"name": "X", "symbol": "X", "w": 0.3, "etfs": ["A"]}]},
                                          "Energy|Unsized": {"w": 0.2, "n": 1, "stocks": [{"name": "Y", "symbol": "Y", "w": 0.2, "etfs": ["A"]}]}}   # task #276: which ETFs hold each company
    assert lt["sectorMacro"] == {"Oil, Gas & Consumable Fuels": "Energy", "Power": "Energy"}
    assert calc.abroad_top(etfs) == {"B": [{"name": "Z", "isin": "US0000000001", "pct": 50.0}]}


async def test_183_an_etf_url_works_by_isin(app, monkeypatch):  # noqa: F811
    from finlit import etf

    async def load(_app):
        return {"by": ROWS}
    monkeypatch.setattr(etf, "_load", load)
    c = new_client(app)
    r = await c.get("/api/etf/INF204KB17I5/portfolio", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/api/etf/GOLDBEES/portfolio"
    r = await c.get("/api/etf/inf204kb14i2?range=3Y", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/api/etf/NIFTYBEES?range=3Y"
    assert (await c.get("/api/etf/INE040A01034", follow_redirects=False)).status_code == 404


async def test_183_the_expense_ratio_prefers_amfi_over_a_fund_house_page(app, monkeypatch):  # noqa: F811
    from finlit import disclosure

    async def facts(_pool, code):
        return {"terDirect": {"value": "0.00% a year", "source": "SBI Mutual Fund, scheme-wise TER (sbimf.com)"}, "terRegular": {"value": "0.05% a year", "asOf": "2026-11-05", "source": "AMFI, TER of mutual fund schemes"}}
    monkeypatch.setattr(disclosure, "get_facts", facts)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO mf_schemes (code, name, amc, scheme_type, category, plan, option_class, family, isin, active) VALUES (135106, 'SBI Nifty 50 ETF', "
                           "'SBI Mutual Fund', 'Open Ended', 'Other Scheme - Other ETFs', 'Direct', 'Other', 'sbi-nifty-50-etf', 'INF200KA1FS1', true) ON CONFLICT DO NOTHING")
    got = await REAL_TER_FOR(app, "INF200KA1FS1")
    assert got == {"value": 0.05, "asOf": "2026-11-05", "source": "AMFI, TER of mutual fund schemes", "why": None}
    assert (await REAL_TER_FOR(app, None))["value"] is None
