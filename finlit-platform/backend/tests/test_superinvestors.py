"""Superinvestor portfolios (task #212): named public holders of 1% or more, turned around by investor, from the stored filings."""
import json

import pytest

from finlit import superinvestors as si
from test_auth import anon, app, signed_in  # noqa: F401  (fixtures)
from test_integration import ingested, make_settings, store  # noqa: F401  (fixtures)

H = lambda name, now, ago, grp="public": [name, grp, now, ago]   # noqa: E731

ROWS = [
    {"symbol": "AAA", "as_of": "Sep 2026", "premium_at": "2026-11-10T01:00:00+00:00",
     "holders": [H("ASHISH KACHOLIA", 2.5, 1.5), H("Mr. Vijay Kedia", 1.2, 0.0), H("Bodies Corporate", 4.0, 3.0), H("HDFC Mutual Fund", 6.0, 5.0, "dii")]},
    {"symbol": "BBB", "as_of": "Sep 2026", "premium_at": "2026-11-11T01:00:00+00:00",
     "holders": [H("Ashish Kacholia", 1.1, 1.4), H("Vijay Kedia", 3.0, 3.0), H("Clearing Members", 1.5, 1.0)]},
    {"symbol": "CCC", "as_of": "Jun 2026", "premium_at": "2026-11-09T01:00:00+00:00",
     "holders": [H("Ashish Kacholia", 0.0, 2.0), H("Only Once Holdings Pvt Ltd", 5.0, 5.0)]},
    {"symbol": "DDD", "as_of": "Sep 2026", "premium_at": None, "holders": [H("Ashish Kacholia", 1.0, None)]},
]
NAMES = {"AAA": "Aaa Industries Ltd", "BBB": "Bbb Tech Ltd", "CCC": "Ccc Foods Ltd", "DDD": "Ddd Ltd"}
QUOTES = {"AAA": {"market_cap": 1000}, "BBB": {"market_cap": 2000}, "CCC": {"market_cap": 500}}     # DDD: no market cap today
CLASSES = {"AAA": {"industry": "Auto Components", "sector": "Automobile and Auto Components"}, "BBB": {"industry": "IT - Software", "sector": "Information Technology"}}


def built():
    return si.build(ROWS, NAMES, QUOTES, CLASSES)


def test_names_are_matched_across_spellings_and_categories_funds_and_one_company_holders_are_left_out():
    inv = built()["investors"]
    assert set(inv) == {"ashish-kacholia", "vijay-kedia"}           # not Bodies Corporate / Clearing Members (categories), HDFC MF (dii), Only Once (one company)
    assert inv["ashish-kacholia"]["name"] == "Ashish Kacholia"       # the spelling seen most; all capitals shown in title case
    assert si.holder_key("Mr. Vijay  Kedia") == si.holder_key("VIJAY KEDIA")
    assert si.holder_key("Bengal Finance & Investment Private Limited") == si.holder_key("Bengal Finance and Investment Pvt. Ltd.")
    assert not si.is_investor("Bodies Corporate") and not si.is_investor("Individuals - ii. Individual shareholders holding nominal share capital in excess of Rs. 2 lakhs")
    assert si.is_investor("Ashish Kacholia")


def test_weights_values_sectors_and_the_years_changes():
    a = built()["investors"]["ashish-kacholia"]
    by = {h["symbol"]: h for h in a["holdings"]}
    assert set(by) == {"AAA", "BBB", "DDD"} and a["companies"] == 3      # CCC sold out: not a holding, but in the history
    assert by["AAA"]["valueCr"] == 25.0 and by["BBB"]["valueCr"] == 22.0  # 2.5% of 1,000 cr, 1.1% of 2,000 cr
    assert a["valueCr"] == 47.0 and by["AAA"]["weightPct"] == pytest.approx(53.19, abs=0.01)
    assert by["DDD"]["valueCr"] is None and by["DDD"]["weightPct"] is None and "market capitalisation" in by["DDD"]["valueWhy"]
    assert "1 holding without a market value" in a["valueNote"]
    assert by["DDD"]["sectorWhy"] and by["AAA"].get("sectorWhy") is None
    assert [s["sector"] for s in a["sectors"]] == ["Automobile and Auto Components", "Information Technology"]
    assert by["AAA"]["status"] == "added" and by["BBB"]["status"] == "reduced" and by["DDD"]["status"] == "new"
    hist = {h["symbol"]: h["status"] for h in a["history"]}
    assert hist == {"AAA": "added", "BBB": "reduced", "DDD": "new", "CCC": "exited"}
    assert a["changes"] == {"new": 1, "added": 1, "reduced": 1, "exited": 1}
    assert "below 1%" in next(h for h in a["history"] if h["symbol"] == "CCC")["statusText"]
    k = built()["investors"]["vijay-kedia"]
    assert {h["symbol"]: h["status"] for h in k["holdings"]} == {"AAA": "new", "BBB": "unchanged"}
    assert [h["symbol"] for h in k["history"]] == ["AAA"]                 # an unchanged stake is not a change


def test_the_answer_says_where_it_comes_from_and_when():
    b = built()
    assert b["covered"] == 4 and b["asOf"] == "Sep 2026" and b["fetchedFrom"] == "2026-11-09" and b["fetchedTo"] == "2026-11-11"
    assert "FinEdge" in b["source"] and "not investment advice" in b["disclaimer"] and "1%" in b["rule"]
    s = si.summary(b)
    assert s["count"] == 2 and s["emptyWhy"] is None and "holdings" not in s["investors"][0]
    assert si.summary(si.build([], {}, {}, {}))["emptyWhy"].startswith("No company's named-holder details are stored yet")


def test_status_words():
    assert si.status_of(1.5, None) == "new" and si.status_of(None, 1.5) == "exited" and si.status_of(1.5, 1.5) == "unchanged"
    assert si.status_of(1.505, 1.5) == "unchanged" and si.status_of(1.52, 1.5) == "added" and si.status_of(1.2, 1.5) == "reduced"


@pytest.mark.integration
async def test_the_list_is_open_to_everyone_and_a_portfolio_needs_silver_or_gold(app, anon):  # noqa: F811
    st = app.state.store
    async with st.pool.acquire() as conn:
        await conn.execute("TRUNCATE ownership_insights")
        for r in ROWS:
            await conn.execute("INSERT INTO companies (symbol, name) VALUES ($1, $2) ON CONFLICT (symbol) DO NOTHING", r["symbol"], NAMES[r["symbol"]])
            await conn.execute("INSERT INTO ownership_insights (symbol, statement, as_of, rules_version, body, extra, premium_state, premium_at) "
                               "VALUES ($1, 'consolidated', $2, 't', '{}'::jsonb, $3::jsonb, 'ok', now())", r["symbol"], r["as_of"], json.dumps({"holders": r["holders"]}))
        for s, q in QUOTES.items():
            await conn.execute("INSERT INTO listing_quotes (symbol, market_cap) VALUES ($1, $2) ON CONFLICT (symbol) DO UPDATE SET market_cap = $2", s, q["market_cap"])
    await st.redis.delete(si.CACHE_KEY)
    si._mem = (0.0, None)
    r = await anon.get("/api/superinvestors")
    b = r.json()
    assert r.status_code == 200 and b["count"] == 2 and [i["key"] for i in b["investors"]] == ["vijay-kedia", "ashish-kacholia"] and b["companies"] >= 4
    assert "holdings" not in b["investors"][0] and b["disclaimer"]
    no = await anon.get("/api/superinvestors/ashish-kacholia")
    assert no.status_code == 403 and no.json()["status"] == "plan_required" and no.json()["plan"] == "silver"
    basic = await signed_in(app, "basic212@example.com")
    assert (await basic.get("/api/superinvestors/ashish-kacholia")).status_code == 403
    for plan in ("silver", "gold"):
        c = await signed_in(app, f"{plan}212@example.com", plan=plan)
        p = await c.get("/api/superinvestors/ashish-kacholia")
        assert p.status_code == 200 and p.json()["companies"] == 3 and p.json()["history"] and p.json()["source"], plan
        assert p.headers["cache-control"].startswith("private")
        assert (await c.get("/api/superinvestors/nobody-at-all")).status_code == 404
