"""POST /api/portfolio/page end to end: names only (422), plan gating, the page object for a stored list, one score with the Diversification card, the cache."""
from datetime import datetime

import pytest

from finlit.diversification import api as div_api
from finlit.indices import IST
from finlit.portfolio_page import api as pf_api
from test_auth import app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_diversification_calc import SAMPLE
from test_diversification_api import seed as _seed, _clock  # noqa: F401  (seed data + fixed clock)

pytestmark = pytest.mark.integration
URL = "/api/portfolio/page"


async def seed(app, classes=None):  # noqa: F811
    """The diversification seed (it clears the stored NSE classification of these symbols), plus `classes` (symbol -> macro sector) when given."""
    await _seed(app)
    async with app.state.store.pool.acquire() as conn:
        for sym, macro in (classes or {}).items():
            await conn.execute("INSERT INTO company_classification (symbol, macro_sector, sector, industry, source, rule_version) VALUES ($1, $2, $2, $2, 'test', 1)", sym, macro)


async def test_only_share_names_are_accepted(app):  # noqa: F811
    silver = await signed_in(app, "s422@example.com", plan="silver")
    base = {"symbols": ["TCS", "INFY", "HCLTECH"]}
    for extra in ({"quantity": [10, 5, 1]}, {"amount": 5000}, {"price": 3500.5}, {"date": "2026-01-01"}, {"qty": 1}, {"weights": [1, 1, 1]}):
        assert (await silver.post(URL, json={**base, **extra})).status_code == 422, extra
    assert (await silver.post(URL, json={"symbols": [{"symbol": "TCS", "qty": 3}]})).status_code == 422
    assert (await silver.post(URL, json={"symbols": []})).status_code == 422
    assert (await silver.post(URL, json={"symbols": ["bad symbol!"]})).status_code == 422
    assert (await silver.post(URL, json={"symbols": [f"S{i}" for i in range(501)]})).status_code == 422


async def test_plan_gating(app):  # noqa: F811
    await seed(app)
    async with new_client(app) as anon:
        assert (await anon.post(URL, json={"symbols": SAMPLE})).status_code in (401, 403)
    basic = await signed_in(app, "b@example.com", plan="basic")
    r = await basic.post(URL, json={"symbols": SAMPLE})
    assert r.status_code == 403 and "plan_required" in r.text
    silver = await signed_in(app, "s@example.com", plan="silver")
    j = (await silver.post(URL, json={"symbols": SAMPLE})).json()
    assert j["page"]["score"]["score"] == 68 and j["styleTilt"]["locked"] == "gold" and "parts" not in j["styleTilt"]
    gold = await signed_in(app, "g@example.com", plan="gold")
    t = (await gold.post(URL, json={"symbols": SAMPLE})).json()["styleTilt"]
    assert len(t["parts"]) == 6 and t["sentence"].startswith("This list leans towards")


async def test_page_for_a_stored_list_and_the_card_agree(app):  # noqa: F811
    await seed(app)
    silver = await signed_in(app, "s2@example.com", plan="silver")
    r = await silver.post(URL, json={"symbols": [s.lower() for s in SAMPLE] + ["ZZUNKNOWN", "NEWCO"]})
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "private, no-store"
    j = r.json()
    page = j["page"]
    assert j["unknown"] == ["ZZUNKNOWN"] and j["symbols"][-1] == "NEWCO" and "NEWCO" in page["short_history"] and "NEWCO" not in page["order"]
    assert page["to"] == "2026-10-30" and page["weeks"] == 104 and page["layout"] == "long" and page["together_open_by_default"] is False   # 16 shares
    assert set(j["meta"]["TCS"]) == {"name", "sector", "size", "mcap_cr", "nse"} and j["meta"]["TCS"]["size"] == "L"   # nse: the three NSE levels (task #183)
    assert len(page["summary"]["eq"]) <= 5 and all(x["text"] for x in page["summary"]["eq"])
    card = (await silver.post("/api/diversification", json={"symbols": SAMPLE + ["NEWCO"]})).json()
    clean = (await silver.post(URL, json={"symbols": SAMPLE + ["NEWCO"]})).json()["page"]["score"]
    assert card["score"]["value"] == clean["score"] and card["score"]["band"] == clean["band"]
    assert card["score"]["coMovement"] == clean["comovement"] and card["score"]["sectorSpread"] == clean["sector_spread"]
    assert card["headline"]["effectiveStocks"] == clean["effective_stocks"]


async def test_too_few_shares_and_all_unknown(app):  # noqa: F811
    await seed(app)
    silver = await signed_in(app, "s3@example.com", plan="silver")
    two = (await silver.post(URL, json={"symbols": ["TCS", "INFY"]})).json()
    assert [x["rule"] for x in two["page"]["readings"]] == ["D3"] and two["page"]["order"] == ["INFY", "TCS"] or len(two["page"]["order"]) == 2
    none = (await silver.post(URL, json={"symbols": ["ZZUNKNOWN"]})).json()
    assert none["page"] is None and none["unknown"] == ["ZZUNKNOWN"] and "styleTilt" not in none


async def test_cache_by_list_and_week(app, monkeypatch):  # noqa: F811
    await seed(app)
    calls = []
    real = pf_api._compute
    monkeypatch.setattr(pf_api, "_compute", lambda *a, **k: (calls.append(1), real(*a, **k))[1])
    silver = await signed_in(app, "s4@example.com", plan="silver")
    first = (await silver.post(URL, json={"symbols": SAMPLE})).json()
    again = await silver.post(URL, json={"symbols": list(reversed(SAMPLE))})        # same names in another order: the same entry
    assert again.status_code == 200 and again.json()["page"]["score"] == first["page"]["score"] and len(calls) == 1
    await silver.post(URL, json={"symbols": SAMPLE[:-1]})                           # a changed list is computed afresh
    assert len(calls) == 2
    monkeypatch.setattr(div_api, "now_ist", lambda: datetime(2026, 11, 10, 12, 0, tzinfo=IST))   # the next ISO week: a new entry
    await silver.post(URL, json={"symbols": SAMPLE})
    assert len(calls) == 3


async def test_trend_is_gold_names_only_and_has_no_cutoffs(app):  # noqa: F811
    await seed(app)
    silver = await signed_in(app, "st@example.com", plan="silver")
    s = (await silver.post("/api/portfolio/trend", json={"symbols": SAMPLE})).json()
    assert s["locked"] is True and "trend" not in s
    assert (await silver.post("/api/portfolio/trend", json={"symbols": SAMPLE, "quantity": [1]})).status_code == 422
    gold = await signed_in(app, "gt@example.com", plan="gold")
    g = (await gold.post("/api/portfolio/trend", json={"symbols": SAMPLE})).json()
    assert g["locked"] is False and g["trend"]["n"] == len(SAMPLE) and "gap" not in g["trend"]
    basic = await signed_in(app, "bt@example.com", plan="basic")
    assert (await basic.post("/api/portfolio/trend", json={"symbols": SAMPLE})).status_code == 403


SCORE = "/api/portfolio/score"


async def test_score_is_gold_strict_and_never_returns_weights(app):  # noqa: F811
    await seed(app)
    items = [{"symbol": s, "qty": 10} for s in SAMPLE]
    silver = await signed_in(app, "ss@example.com", plan="silver")
    r = (await silver.post(SCORE, json={"items": items})).json()
    assert r["locked"] is True and "total" not in r
    basic = await signed_in(app, "bs@example.com", plan="basic")
    assert (await basic.post(SCORE, json={"items": items})).status_code == 403
    gold = await signed_in(app, "gs@example.com", plan="gold")
    for bad in ({"items": [{"symbol": "TCS", "qty": 0}]}, {"items": [{"symbol": "TCS", "qty": -1}]}, {"items": [{"symbol": "TCS", "qty": 2e9}]},
                {"items": [{"symbol": "TCS", "qty": 1, "price": 5}]}, {"items": [{"symbol": "TCS"}, {"symbol": "TCS"}]}, {"items": items, "horizon": "never"},
                {"items": items, "benchmark": "SENSEX"}, {"items": items, "extra": 1}, {"items": []}):
        assert (await gold.post(SCORE, json=bad)).status_code == 422, bad
    none = (await gold.post(SCORE, json={"items": [{"symbol": s} for s in SAMPLE]})).json()
    # developer file 28: with no quantities every share counts the same, and the total is still given (the panel asks for the buys)
    assert none["locked"] is False and none["needsQuantities"] is True and none["basis"] == "equal" and isinstance(none["total"], int) and "byValue" not in none
    one = (await gold.post(SCORE, json={"items": [{"symbol": SAMPLE[0], "qty": 10}] + [{"symbol": s} for s in SAMPLE[1:]]})).json()
    assert one["basis"] == "equal" and one["valued"] == 1 and one["total"] == none["total"] and "byValue" not in one   # one quantity is not the list
    full = (await gold.post(SCORE, json={"items": items, "risk": "low", "goal": "protect"})).json()
    assert full["needsQuantities"] is False and full["basis"] == "value" and isinstance(full["total"], int)
    assert full["band"] in ("Strong", "Healthy", "Average", "Weak", "Poor")
    bv = full["byValue"]                                                             # what the top cards show once every share has a value
    page = (await gold.post("/api/portfolio/page", json={"symbols": SAMPLE})).json()["page"]
    assert set(bv["spread"]) == set(page["score"]) and set(bv["market"]) == {"beta", "vol", "vol_nifty", "max_fall", "max_fall_nifty"}
    assert bv["market"]["vol_nifty"] == page["market"]["eq"]["vol_nifty"]           # the same NIFTY 50 weeks as the page
    import json as _json
    import time as _time
    from test_diversification_api import PRICES_MAX
    rows = [{"quote_date": r["d"], "close_price": r["c"] * 1.1} for r in PRICES_MAX["__NIFTY"]["rows"]]
    await app.state.store.redis.set("idx:px:NIF500", _json.dumps({"t": _time.time(), "v": {"rows": rows}}))
    n500 = (await gold.post(SCORE, json={"items": items, "risk": "low", "goal": "protect", "benchmark": "NIF500"})).json()
    assert n500["byValue"] == bv                                                     # the cards stay against the NIFTY 50 whatever the score compares with
    text = str(full).lower()
    assert "weight" not in text and "points" not in text and "blend" not in text
    # the names-only page endpoint is untouched
    assert (await gold.post("/api/portfolio/page", json={"symbols": SAMPLE, "qty": [1]})).status_code == 422


async def test_task_183_risk_by_size_each_share_against_its_own_index(app):  # noqa: F811
    """POST /api/portfolio/risk (W8): Silver and Gold, never Basic; each share against its size index (index closes), the three list betas, 3-year swing and fall."""
    import json as _json
    import time as _time
    from test_diversification_api import PRICES_MAX
    await seed(app)
    rows = [{"quote_date": r["d"], "close_price": r["c"]} for r in PRICES_MAX["__NIFTY"]["rows"]]
    for code, k in (("NIFMID150", 1.1), ("NIFSMA250", 1.25), ("NIFMIC250", 1.4)):   # task #262: Micro is read against the Nifty Microcap 250
        await app.state.store.redis.set(f"idx:px:{code}", _json.dumps({"t": _time.time(), "v": {"rows": [{**r, "close_price": r["close_price"] * k} for r in rows]}}))
    basic = await signed_in(app, "rb@example.com", plan="basic")
    assert (await basic.post("/api/portfolio/risk", json={"symbols": SAMPLE})).status_code == 403
    silver = await signed_in(app, "rs@example.com", plan="silver")
    assert (await silver.post("/api/portfolio/risk", json={"symbols": SAMPLE, "qty": [1]})).status_code == 422
    r = await silver.post("/api/portfolio/risk", json={"symbols": SAMPLE + ["NEWCO", "ZZUNKNOWN"]})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["unknown"] == ["ZZUNKNOWN"] and j["missingIndex"] == []
    by = {x["symbol"]: x for x in j["shares"]}
    assert by["NEWCO"]["beta"] is None and by["NEWCO"]["why"] in ("Under a year of prices", "No size band yet")
    counted = [x for x in j["shares"] if x["beta"] is not None]
    assert counted and all(x["benchmark"] in ("Nifty 50", "Nifty Midcap 150", "Nifty Smallcap 250", "Nifty Microcap 250") and 0 <= x["explained"] <= 100 for x in counted)
    assert sum(s["n"] for s in j["sizes"]) == j["counted"] == len(counted)
    assert j["betas"]["weighted"] == round(sum((s["avgBeta"] or 0) * s["listShare"] / 100 for s in j["sizes"]), 2) or abs(j["betas"]["weighted"] - sum((s["avgBeta"] or 0) * s["listShare"] / 100 for s in j["sizes"])) < 0.02
    assert j["glance"]["list"]["swing"] > 0 and j["glance"]["nifty"]["worstFall"] <= 0 and j["glance"]["worst10"]["nifty"] < 0


async def test_task_183_card_and_page_agree_when_nse_levels_are_stored(app):  # noqa: F811
    """With NSE's stored macro sectors for part of the list, the Diversification card and the page read the same levels, so their scores still agree."""
    await seed(app, {s: "Financial Services" for s in list(SAMPLE)[:4]})
    silver = await signed_in(app, "s183c@example.com", plan="silver")
    page = (await silver.post(URL, json={"symbols": SAMPLE})).json()
    card = (await silver.post("/api/diversification", json={"symbols": SAMPLE})).json()
    assert [page["meta"][s]["nse"]["macro_sector"] for s in list(SAMPLE)[:4]] == ["Financial Services"] * 4
    assert card["score"]["value"] == page["page"]["score"]["score"] and card["score"]["sectorSpread"] == page["page"]["score"]["sector_spread"]
