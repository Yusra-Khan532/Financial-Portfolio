"""The Stock screener redesign (task #64, file 04): one row per company, the rule-card figures, NSE sectors, the standard columns,
the ready-made screens with today's counts, and screens on the FinLit model that are applied on the server and never show their cut-offs."""

import json
import math

import pytest

from finlit.screener import data
from finlit.screener.api import STANDARD_COLUMNS
from finlit.screener.catalog import BY_KEY
from finlit.screener.data import Table, _hist30, dedupe
from finlit.screener.ready import MODEL, READY
from test_auth import app, new_client, signed_in  # noqa: F401  (fixtures + helpers)
from test_integration import ingested, store  # noqa: F401


def _row(sym, name=None, macro=None, industry=None, band="mixed", **m):
    return {"symbol": sym, "name": name or sym.title(), "sector": macro, "macro_sector": macro, "industry": industry, "band": band, "metrics": json.dumps(m)}


def test_a_company_listed_under_its_nse_symbol_and_its_bse_code_is_one_row():
    rows = [_row("BONDADA", "Bondada Engineering Ltd", market_cap=900), _row("543971", "Bondada Engineering Ltd", market_cap=900),
            _row("INDTONER", "Indian Toners & Developers Ltd."), _row("523586", "Indian Toners and Developers Ltd"),
            _row("500001", "Only On BSE Ltd")]
    kept = [r["symbol"] for r in dedupe(rows)]
    assert kept == ["BONDADA", "INDTONER", "500001"]                       # the NSE row stays; a BSE-only company is never dropped
    t = Table(rows, {}, {})
    assert t.n == 3 and "543971" not in t.pos


def test_rule_card_figures_quartiles_and_a_log_scale_for_long_tails():
    caps = sorted([10.0 * 1.3 ** i for i in range(60)])                    # positive and long-tailed, like market cap
    h = _hist30(caps)
    assert h["scale"] == "log" and len(h["hist30"]) == 30 and sum(h["hist30"]) == len(caps)
    assert max(h["hist30"]) < len(caps) / 3                                # no single tall first bar
    assert h["p5"] <= h["p25"] <= h["p75"] <= h["p95"]
    roe = sorted([-20.0 + i for i in range(60)])                           # negatives: always linear
    g = _hist30(roe)
    assert g["scale"] == "linear" and sum(g["hist30"]) == 60 and g["hist30"][0] >= 3 and g["hist30"][-1] >= 3   # the tails sit in the end bars
    flat = _hist30([5.0] * 10)
    assert flat["hist30"] == [] and flat["scale"] == "linear"


def test_every_ready_made_screen_uses_real_filters_and_the_groups_follow_the_plans():
    assert len(READY) == 26 and len({r.id for r in READY}) == 26
    assert [r.group for r in READY].count("everyday") == 4 and [r.group for r in READY].count("model") == 5
    for r in READY:
        assert all(k in BY_KEY for k in r.rules), r.id
        assert (r.group == "everyday") == (r.tier == "basic") and (r.group == "model") == (r.tier == "gold")
    for r in MODEL.values():                                               # model screens say it in words: no figure, no "or more"
        assert not any(ch.isdigit() for ch in r.says), r.says
    assert set(STANDARD_COLUMNS) <= set(BY_KEY) and len(STANDARD_COLUMNS) == 9


@pytest.fixture
def table():
    rows = [_row(f"S{i:02d}", macro="Information Technology" if i % 2 else "Energy", industry="IT - Software" if i % 2 else "Oil",
                 band="strong" if i < 4 else "mixed", market_cap=1000 * (i + 1), price=100 + i, pe=8 + i, pb=1 + i / 10, roe=10 + i, roce=12 + i,
                 debt_to_equity=0.1 * i, dividend_yield=i / 4, sales_cagr_3y=5 + i, ret_1y=i - 5, ret_1d=0.5,
                 overall=40 + 2 * i, pillar_quality=50 + 2 * i, pillar_growth=40 + 2 * i, pillar_balance=60, pillar_profitability=60, pillar_technical=30, score_change=i - 10)
            for i in range(24)]
    rows.append(_row("STRAY", macro="Auto Ancillaries", market_cap=50))   # a stray label held by one company
    data._table = Table(rows, {}, {})
    yield data._table
    data.reset()


@pytest.mark.integration
async def test_catalog_lists_nse_sectors_and_the_standard_columns_each_plan_may_see(app, table):  # noqa: F811
    async with new_client(app) as anon:
        cat = (await anon.get("/api/screener/catalog")).json()
    assert [s["name"] for s in cat["sectors"]] == ["Energy", "Information Technology"]                # no stray one-company label
    assert cat["standardColumns"] == [k for k in STANDARD_COLUMNS if k not in ("overall", "sales_cagr_3y")]   # FinLit IQ is Gold, 3-year sales growth Silver
    silver = await signed_in(app, "s04c@example.com", plan="silver")
    assert (await silver.get("/api/screener/catalog")).json()["standardColumns"] == [k for k in STANDARD_COLUMNS if k != "overall"]
    m = next(x for g in cat["groups"] for x in g["metrics"] if x["key"] == "market_cap")
    assert {"p25", "p75", "p5", "p95", "scale", "hist30"} <= set(m["stats"]) and len(m["stats"]["hist30"]) == 30
    assert {x["key"]: x["n"] for x in cat["bands"]} == {"strong": 4, "healthy": 0, "mixed": 21, "watch": 0}   # how many companies carry each rating word
    gold = await signed_in(app, "g04@example.com", plan="gold")
    assert (await gold.get("/api/screener/catalog")).json()["standardColumns"] == STANDARD_COLUMNS


@pytest.mark.integration
async def test_ready_made_screens_come_with_todays_count_and_model_screens_carry_no_cut_off(app, table):  # noqa: F811
    async with new_client(app) as anon:
        r = await anon.get("/api/screener/ready")
    body = r.json()
    assert r.status_code == 200 and body["total"] == 25 and len(body["screens"]) == 26
    by = {s["id"]: s for s in body["screens"]}
    assert by["value"]["state"]["ranges"] == {"pe": {"min": 0.1, "max": 15}, "pb": {"min": 0.1, "max": 2}}
    assert by["value"]["count"] == sum(1 for i in range(24) if 8 + i <= 15 and 1 + i / 10 <= 2)       # the same rules the card loads
    assert by["strong"]["state"] == {"ranges": {}, "bands": ["strong"]} and by["strong"]["count"] == 4  # the rating word, never "IQ of 78"
    text = r.text
    for mid, m in MODEL.items():
        assert "state" not in by[mid] and by[mid]["count"] is not None
        for k in m.rules:
            assert k not in text                                                                     # no model figure name, let alone its cut-off
    assert "78" not in text and "70+" not in text


@pytest.mark.integration
async def test_a_model_screen_runs_on_the_server_for_gold_only_and_its_funnel_is_one_step(app, table):  # noqa: F811
    gold = await signed_in(app, "g04m@example.com", plan="gold")
    silver = await signed_in(app, "s04m@example.com", plan="silver")
    q = {"model_screen": "modelcompound", "funnel": True, "columns": ["market_cap"], "limit": 50}
    r = await gold.post("/api/screener/query", json=q)
    d = r.json()
    want = sum(1 for i in range(24) if 50 + 2 * i >= 70 and 40 + 2 * i >= 60)
    assert r.status_code == 200 and d["total"] == want
    assert d["funnel"] == [{"key": "model", "before": 25, "after": want, "missing": 0}]
    assert "pillar" not in r.text and "70" not in json.dumps(d["funnel"])
    assert (await silver.post("/api/screener/query", json=q)).status_code == 403
    assert (await gold.post("/api/screener/query", json={**q, "model_screen": "nope"})).status_code == 422
    both = (await gold.post("/api/screener/query", json={**q, "filters": {"roe": {"min": 30}}})).json()   # the visitor's own rules narrow it further
    assert both["total"] == sum(1 for i in range(24) if 50 + 2 * i >= 70 and 40 + 2 * i >= 60 and 10 + i >= 30)
    assert [s["key"] for s in both["funnel"]] == ["model", "roe"]
    assert math.isfinite(both["took"])
