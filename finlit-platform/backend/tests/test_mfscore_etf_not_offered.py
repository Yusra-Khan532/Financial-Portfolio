"""The Mutual Fund Score is not given for exchange-traded funds: whatever mf_scores holds for an ETF (the score run still reads ETFs as peers of
index funds), no route sends a score, a rank, a history or an alert for one, and the ETF list cannot be ordered by it. Mutual funds are unchanged."""

import json

import pytest

from test_auth import app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_mfscore_upgrade import BASE, RUN, clients, seed

pytestmark = pytest.mark.integration
SYM = "ZZETFTEST"
OFFERED = "Mutual Fund Score is not given for exchange-traded funds."


async def with_etf(app):
    """The usual seeded universe plus one scored ETF: its row, the exchange-list row, and a week of history for it."""
    funds, _ = await seed(app, weeks=3)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("DELETE FROM etf_funds WHERE symbol = $1", SYM)
        await conn.execute("INSERT INTO etf_funds (symbol, isin, instrument_key, exchange_name, display_name, fund_house, category, active, price, turnover_rank) "
                           "VALUES ($1, 'INF000ZZ0001', 'NSE_EQ|INF000ZZ0001', 'ZZ ETF', 'ZZ Test ETF', 'Test AMC', 'nifty50', true, 100, 1)", SYM)
        for t in ("mf_scores", "mf_score_history"):
            await conn.execute(f"UPDATE {t} SET key = $1, kind = 'etf', code = NULL, symbol = $2, plan = 'ETF' WHERE key = $3", f"etf:{SYM}", SYM, f"mf:{BASE}")
    return funds


async def test_etf_score_route_gives_no_score_to_anyone(app):
    await with_etf(app)
    c = await clients(app)
    for who in ("gold", "silver", "basic", "visitor"):
        r = await c[who].get(f"/api/mf/etf/{SYM}/score")
        assert r.status_code == 200, (who, r.text)
        d = r.json()
        assert d.get("final") is None and not d.get("pillars") and not d.get("rank"), (who, d)
        if who == "gold":
            assert d["notOffered"] is True and d["reason"] == OFFERED
    assert (await c["gold"].get("/api/mf/etf/NOSUCHETF/score")).status_code == 404       # an unknown symbol is still unknown


async def test_etf_never_listed_with_a_score(app):
    funds = await with_etf(app)
    gold = (await clients(app))["gold"]
    d = (await gold.get(f"/api/mf/scores?symbols={SYM}")).json()
    assert [i for i in d["items"] if i["symbol"] == SYM] and all(i["final"] is None for i in d["items"] if i["symbol"] == SYM)
    assert [i for i in d["items"] if i["symbol"] == SYM][0]["reason"] == OFFERED
    listed = (await gold.get("/api/mf/scores")).json()["items"]
    assert listed and all(i["symbol"] != SYM for i in listed)                             # the plain list holds mutual funds only
    shown = (await gold.get("/api/mf/score-screener?limit=200&scored=0")).json()
    assert all(i["kind"] != "etf" and i.get("symbol") != SYM for i in shown["items"]) and shown["total"] == len(shown["items"])
    assert SYM not in json.dumps((await gold.get("/api/mf/leaderboard?sub=large-cap&plan=Direct")).json())


async def test_etf_history_and_alerts_are_refused(app):
    await with_etf(app)
    gold = (await clients(app))["gold"]
    d = (await gold.get(f"/api/mf/etf/{SYM}/score/history")).json()
    assert not d.get("points")
    many = (await gold.get(f"/api/mf/scores/history?symbols={SYM}&codes={BASE + 1}")).json()
    assert f"etf:{SYM}" not in many["series"] and f"mf:{BASE + 1}" in many["series"]
    r = await gold.post("/api/mf/score-alerts", json={"symbol": SYM, "kind": "band"})
    assert r.status_code == 422, r.text


async def test_etf_list_has_no_score_order_and_mutual_funds_keep_theirs(app):
    funds = await with_etf(app)
    gold = (await clients(app))["gold"]
    by_score = await gold.get("/api/etf?sort=score")
    assert by_score.status_code == 200
    assert [i["symbol"] for i in by_score.json()["items"]] == [i["symbol"] for i in (await gold.get("/api/etf")).json()["items"]]   # same as the default order
    mine = await gold.get(f"/api/mf/{BASE + 1}/score")
    assert mine.status_code == 200 and mine.json().get("final") is not None              # a mutual fund still has its score


async def test_an_etfs_amfi_code_says_the_score_is_not_given(app):
    """Task #281: an ETF has no Direct / Regular plan (AMFI's columns said "Regular Plan; IDCW" for SBI's ETFs). Asked for by its AMFI scheme code, its
    score reason is the ETF one: never "plan not stated" or "IDCW options inherit the Growth plan's score"."""
    await seed(app, weeks=3)
    code = BASE + 2
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("UPDATE mf_schemes SET category = 'Other Scheme - Other  ETFs', plan = 'Unspecified', option_class = 'Growth', option_label = 'Growth' "
                           "WHERE code = $1", code)
        await conn.execute("DELETE FROM mf_scores WHERE code = $1", code)
    gold = (await clients(app))["gold"]
    item = [i for i in (await gold.get(f"/api/mf/scores?codes={code}")).json()["items"] if i["code"] == code][0]
    assert item["final"] is None and item["notOffered"] is True and item["reason"] == OFFERED
    one = (await gold.get(f"/api/mf/{code}/score")).json()
    assert one.get("final") is None and one.get("notOffered") is True
    async with app.state.store.pool.acquire() as conn:   # the same with AMFI's old IDCW label: still the ETF reason
        await conn.execute("UPDATE mf_schemes SET plan = 'Regular', option_class = 'IDCW', option_label = 'IDCW' WHERE code = $1", code)
    item = [i for i in (await gold.get(f"/api/mf/scores?codes={code}")).json()["items"] if i["code"] == code][0]
    assert item["reason"] == OFFERED and (await gold.get(f"/api/mf/{code}/score")).json().get("notOffered") is True
