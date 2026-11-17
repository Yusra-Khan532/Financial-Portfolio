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
    assert len(READY) == 31 and len({r.id for r in READY}) == 31
    assert [r.group for r in READY].count("everyday") == 4 and [r.group for r in READY].count("model") == 10
    for r in READY:
        assert all(k in BY_KEY for k in r.rules), r.id
        assert (r.group == "everyday") == (r.tier == "basic")
        if r.group == "model":   # five on the FinLit IQ for Silver, five on FinLit Prism for Gold, each on its own score only
            assert (r.score, r.tier) in (("iq", "silver"), ("prism", "gold")), r.id
            assert all(BY_KEY[k].group == ("prism" if r.score == "prism" else "model") for k in r.rules), r.id
    for r in MODEL.values():                                               # model screens say it in words: no figure, no "or more"
        assert not any(ch.isdigit() for ch in r.says), r.says
    assert set(STANDARD_COLUMNS) <= set(BY_KEY) and STANDARD_COLUMNS == ["market_cap"]   # task #145: the table opens with the company and its market cap only


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
    assert cat["standardColumns"] == ["market_cap"]   # task #145: name and market cap only
    silver = await signed_in(app, "s04c@example.com", plan="silver")
    scat = (await silver.get("/api/screener/catalog")).json()
    assert scat["standardColumns"] == ["market_cap"] and scat["bandModel"] == "iq"                           # Silver: the same two
    assert "prism" not in {g["id"] for g in scat["groups"]} and "model" in {g["id"] for g in scat["groups"]}
    assert scat["limits"]["export"] is False                                                                  # no downloads on any plan
    m = next(x for g in cat["groups"] for x in g["metrics"] if x["key"] == "market_cap")
    assert {"p25", "p75", "p5", "p95", "scale", "hist30"} <= set(m["stats"]) and len(m["stats"]["hist30"]) == 30
    assert {x["key"]: x["n"] for x in cat["bands"]} == {"strong": 4, "healthy": 0, "mixed": 21, "watch": 0}   # how many companies carry each rating word
    gold = await signed_in(app, "g04@example.com", plan="gold")
    g = await gold.get("/api/screener/catalog")
    gcat = g.json()
    assert gcat["standardColumns"] == ["market_cap", "prism_st_score", "prism_lt_score"]   # Gold: market cap, then the two technical views (tasks #145, #141)
    by_key = {m["key"]: m["label"] for x in gcat["groups"] for m in x["metrics"]}
    assert by_key["prism_final"] == "Fundamental Prism score" and by_key["prism_st_score"] == "Short-term technical" and by_key["prism_lt_score"] == "Long-term technical"   # task #141 names
    assert "prism_st_score" not in scat["standardColumns"] and "prism_lt_score" not in scat["standardColumns"]   # Silver has no Prism views
    assert "model" not in {x["id"] for x in gcat["groups"]} and "prism" in {x["id"] for x in gcat["groups"]}
    assert gcat["bandModel"] == "prism" and [b["key"] for b in gcat["bands"]] == ["strong", "healthy", "average", "weak", "poor"]
    for word in ("FinLit IQ", "pillar", "Mixed", "Watch"):                                                     # task #64 P-1: nothing of the FinLit IQ for Gold
        assert word not in g.text, word


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
        if m.score == "prism":
            assert mid not in by                                                                     # below Gold: no Prism screen
            continue
        assert "state" not in by[mid] and by[mid]["count"] is not None
        for k in m.rules:
            assert k not in text                                                                     # no model figure name, let alone its cut-off
    assert "78" not in text and "70+" not in text


@pytest.mark.integration
async def test_a_model_screen_runs_on_the_server_for_its_plan_only_and_its_funnel_is_one_step(app, table):  # noqa: F811
    gold = await signed_in(app, "g04m@example.com", plan="gold")
    silver = await signed_in(app, "s04m@example.com", plan="silver")
    q = {"model_screen": "modelcompound", "funnel": True, "columns": ["market_cap"], "limit": 50}
    assert (await gold.post("/api/screener/query", json=q)).status_code == 400           # Gold never runs a screen on the FinLit IQ
    r = await silver.post("/api/screener/query", json=q)
    d = r.json()
    want = sum(1 for i in range(24) if 50 + 2 * i >= 70 and 40 + 2 * i >= 60)
    assert r.status_code == 200 and d["total"] == want
    assert d["funnel"] == [{"key": "model", "before": 25, "after": want, "missing": 0}]
    assert "pillar" not in r.text and "70" not in json.dumps(d["funnel"])
    assert (await silver.post("/api/screener/query", json={**q, "model_screen": "nope"})).status_code == 422
    both = (await silver.post("/api/screener/query", json={**q, "filters": {"roe": {"min": 30}}})).json()   # the visitor's own rules narrow it further
    assert both["total"] == sum(1 for i in range(24) if 50 + 2 * i >= 70 and 40 + 2 * i >= 60 and 10 + i >= 30)
    assert [s["key"] for s in both["funnel"]] == ["model", "roe"]
    assert math.isfinite(both["took"])


@pytest.mark.integration
async def test_gold_screens_on_finlit_prism_its_bands_columns_and_screens(app):  # noqa: F811
    """Task #64 P-1 / #100: Gold filters, sorts and screens on FinLit Prism; the Prism ratings ride along with the screener table."""
    rows = [_row(f"P{i:02d}", macro="Energy", industry="Oil", band="mixed", market_cap=1000 * (i + 1), price=100 + i, overall=50) for i in range(10)]
    prism = {f"P{i:02d}": {"prism_final": 40 + 5 * i, "prism_label": "STRONG" if i >= 8 else "AVERAGE", "prism_status": "RATED", "prism_quality": 50 + 3 * i,
                           "prism_fundamental": 50 + 2 * i, "prism_valuation": 60, "prism_risk": 70, "prism_st_score": 10, "prism_lt_score": -30 if i % 2 else 25} for i in range(10)}
    data._table = Table(rows, {}, {}, None, prism)
    try:
        gold = await signed_in(app, "g04p@example.com", plan="gold")
        r = (await gold.post("/api/screener/query", json={"columns": ["prism_final"], "cats": {"band": ["strong"]}, "limit": 50})).json()
        assert {x["symbol"] for x in r["rows"]} == {"P08", "P09"} and all(x["pband"] == "strong" for x in r["rows"])   # the rating chip reads Prism's word for Gold
        s = (await gold.post("/api/screener/query", json={"columns": ["prism_final"], "sort": {"key": "prism_final", "dir": "desc"}, "limit": 3})).json()
        assert [x["v"]["prism_final"] for x in s["rows"]] == [85, 80, 75]
        m = (await gold.post("/api/screener/query", json={"model_screen": "pz_outfavour", "columns": ["market_cap"], "funnel": True, "limit": 50})).json()
        assert m["total"] == sum(1 for i in range(10) if 50 + 3 * i >= 55 and i % 2) and "prism_quality" not in json.dumps(m)
        both = (await gold.post("/api/screener/query", json={"model_screens": ["pz_outfavour", "pz_compound"], "columns": ["market_cap"], "funnel": True, "limit": 50})).json()
        assert both["total"] == sum(1 for i in range(10) if i % 2 and 50 + 3 * i >= 70 and 50 + 2 * i >= 60)       # screens stack: a company must pass all (task #64 P-4)
        mixed = (await gold.post("/api/screener/query", json={"model_screens": ["pz_strong", "pz_outfavour"], "columns": ["market_cap"], "limit": 50})).json()
        assert {x["symbol"] for x in mixed["rows"]} == {"P09"}                                                       # the rating word and the cut-offs both hold
        assert (await gold.post("/api/screener/query", json={"model_screens": ["modelcompound"], "columns": ["market_cap"]})).status_code == 400
        cat = (await gold.get("/api/screener/catalog")).json()
        assert {b["key"]: b["n"] for b in cat["bands"]}["strong"] == 2
        ready = (await gold.get("/api/screener/ready")).json()
        ids = {x["id"] for x in ready["screens"]}
        assert {"pz_strong", "pz_compound"} <= ids and not ids & {"strong", "modelcompound", "improving"}
    finally:
        data.reset()


@pytest.mark.asyncio
async def test_catalog_names_when_the_newest_price_and_score_were_written(app, table):  # noqa: F811
    # task #64 S-9: the page header says "Prices and scores: 12 Nov close" from these, never from a guessed date
    async with new_client(app) as anon:
        cat = (await anon.get("/api/screener/catalog")).json()
    assert cat["pricesAt"] is None and cat["scoresAt"] is None            # nothing known: nothing claimed
    table.sig = {"at": "2026-11-12T23:00:00+00:00", "lat": "2026-11-12T10:05:00+00:00"}
    async with new_client(app) as anon:
        cat = (await anon.get("/api/screener/catalog")).json()
    assert cat["pricesAt"] == "2026-11-12T10:05:00+00:00" and cat["scoresAt"] == "2026-11-12T23:00:00+00:00"


# ---- task #64 Part 3: Custom ratio --------------------------------------------------------------------------------------------------

def test_ratioable_and_family_on_every_measure():
    from finlit.screener.catalog import CATALOG, family, ratioable
    by = {m.key: m for m in CATALOG}
    assert family(by["cash"]) == "cr" and family(by["market_cap"]) == "cr" and family(by["price"]) == "per_share" and family(by["eps"]) == "per_share"
    assert family(by["volume"]) == "shares" and family(by["employees"]) == "people" and family(by["pe"]) is None and family(by["roe"]) is None
    assert family(by["sales_per_employee"]) is None                                                   # Rs Cr per person is not an amount
    assert not any(ratioable(m) for m in CATALOG if m.group in ("model", "prism") or m.unit == "flag")  # never a FinLit score, never a yes-or-no filter
    assert ratioable(by["cash"]) and ratioable(by["pe"])


def test_a_zero_or_negative_bottom_figure_gives_a_dash_and_pct_is_times_100(table):
    v = table.ratio("market_cap", "ret_1y", "times")                 # ret_1y is i - 5: rows 0..5 are negative or zero
    assert all(x != x for x in v[:6]) and v[6] == 7000 / 1
    p = table.ratio("market_cap", "ret_1y", "pct")
    assert p[6] == 700000


@pytest.mark.asyncio
async def test_ratios_validate_count_as_a_funnel_step_and_the_drawer_gets_the_spread(app, table):  # noqa: F811
    silver = await signed_in(app, "s04r@example.com", plan="gold")       # custom ratios are Gold and Platinum only (CR-0); the Silver refusal is tested below
    base = {"filters": {}, "cats": {}, "sort": {"key": "market_cap", "dir": "desc"}, "columns": ["market_cap"], "limit": 5, "funnel": True}
    bad = await silver.post("/api/screener/query", json={**base, "ratios": [{"id": "r1", "num": "pe", "den": "pe"}]})
    assert bad.status_code in (400, 422)
    score = await silver.post("/api/screener/query", json={**base, "ratios": [{"id": "r1", "num": "overall", "den": "pe"}]})
    assert score.status_code == 400                                                                    # a FinLit score is never part of a ratio
    r = (await silver.post("/api/screener/query", json={**base, "ratios": [{"id": "r1", "num": "market_cap", "den": "ret_1y", "show": "times", "min": 1000}]})).json()
    step = next(s for s in r["funnel"] if s["key"] == "r1")
    assert step["missing"] == 7 and step["after"] == r["total"] > 0          # 6 with a bottom of zero or below, and STRAY with no figure: left out
    st = (await silver.get("/api/screener/ratio-stats", params={"num": "market_cap", "den": "price", "show": "times", "first": "NOPE,S03,S04"})).json()
    assert st["have"] == 24 and st["total"] == 25 and len(st["hist30"]) == 30 and st["values"] == sorted(st["values"])
    assert st["example"]["symbol"] == "S03" and st["example"]["value"] == round(4000 / 103, 4)
    assert (await silver.get("/api/screener/ratio-stats", params={"num": "overall", "den": "pe"})).status_code == 400


def test_one_extreme_company_never_squashes_the_ratio_chart_it_sits_in_an_end_bar():
    """Task #64, N-5: the chart runs from p2 to p98 and companies outside it are counted in the end bars (they were dropped, and the drawer had no way
    to say so). Every company with the ratio is in exactly one bar, and `outside` says how many sit beyond each end."""
    from finlit.screener.api import ratio_stats, _ratio_stats

    class T:
        n, loaded = 102, 7

        def ratio(self, num, den, show):
            return [float(i) for i in range(100)] + [-85700.0, float("nan"), 999999.0]
    _ratio_stats.clear()
    st = ratio_stats(T(), "a", "b", "pct")
    assert st["have"] == 102 and sum(st["hist30"]) == 102                    # nobody left out of the chart
    assert st["outside"]["below"] >= 1 and st["outside"]["above"] >= 1
    assert max(st["hist30"]) < 102 / 3                                     # no single bar holds nearly everyone
    _ratio_stats.clear()


@pytest.mark.asyncio
async def test_custom_ratios_are_refused_below_gold_with_the_plain_line_and_the_rest_still_runs(app, table):  # noqa: F811
    """Task #64, N-2 (CR-0 of 13 Nov): Silver could open and use the Custom ratio builder. The server now refuses `ratios` and the drawer's spread
    from Silver with 403 plan_required and "Custom ratios come with Gold and Platinum."; the same query without the ratio runs as before."""
    silver = await signed_in(app, "s04cr@example.com", plan="silver")
    base = {"filters": {}, "cats": {}, "sort": {"key": "market_cap", "dir": "desc"}, "columns": ["market_cap"], "limit": 5}
    r = await silver.post("/api/screener/query", json={**base, "ratios": [{"id": "r1", "num": "market_cap", "den": "ret_1y", "show": "times", "min": 1000}]})
    assert r.status_code == 403 and r.json()["detail"]["status"] == "plan_required" and r.json()["detail"]["plan"] == "gold"
    assert "Custom ratios come with Gold and Platinum." in r.text
    st = await silver.get("/api/screener/ratio-stats", params={"num": "market_cap", "den": "price", "show": "times"})
    assert st.status_code == 403 and "Custom ratios come with Gold and Platinum." in st.text
    assert (await silver.post("/api/screener/query", json=base)).status_code == 200          # everything else on the page is open to Silver
    gold = await signed_in(app, "g04cr@example.com", plan="gold")
    assert (await gold.post("/api/screener/query", json={**base, "ratios": [{"id": "r1", "num": "market_cap", "den": "price", "show": "times"}]})).status_code == 200
    assert (await gold.get("/api/screener/ratio-stats", params={"num": "market_cap", "den": "price", "show": "times"})).status_code == 200


@pytest.mark.integration
async def test_gold_two_sectors_and_prism_average_returns_the_companies_not_an_error(app):  # noqa: F811
    """Task #142: two sectors and the Prism rating Average (or Weak, Poor) gave "The screener is unavailable" for Gold: the request only accepted
    FinLit IQ's words (strong, healthy, mixed, watch) and at most four of them, so Prism's own words were refused before any filtering."""
    labels = ["AVERAGE", "AVERAGE", "WEAK", "POOR", "STRONG", "AVERAGE"]
    rows = [_row(f"S{i}", macro=("Oil, Gas & Consumable Fuels" if i < 3 else "Fast Moving Consumer Goods" if i < 5 else "Information Technology"),
                 industry=("Oil" if i < 3 else "Agricultural Food & other Products" if i < 5 else "IT - Software"), band="mixed", market_cap=1000 * (i + 1), price=100) for i in range(6)]
    prism = {f"S{i}": {"prism_final": 50, "prism_label": labels[i], "prism_status": "RATED"} for i in range(6)}
    data._table = Table(rows, {}, {}, None, prism)
    try:
        gold = await signed_in(app, "g142@example.com", plan="gold")
        two = ["Oil, Gas & Consumable Fuels", "Fast Moving Consumer Goods"]
        r = await gold.post("/api/screener/query", json={"columns": ["prism_final"], "cats": {"sector": two, "band": ["average"]}, "limit": 50})
        assert r.status_code == 200, r.text                                              # was 422: Input should be 'strong', 'healthy', 'mixed' or 'watch'
        assert {x["symbol"] for x in r.json()["rows"]} == {"S0", "S1"}                    # in one of the two sectors and rated Average (S5 is Average but in IT)
        r = await gold.post("/api/screener/query", json={"columns": ["prism_final"], "cats": {"industry": ["Oil", "Agricultural Food & other Products"], "band": ["weak", "poor"]}, "limit": 50})
        assert r.status_code == 200 and {x["symbol"] for x in r.json()["rows"]} == {"S2", "S3"}
        r = await gold.post("/api/screener/query", json={"columns": ["prism_final"], "cats": {"band": ["strong", "healthy", "average", "weak", "poor"]}, "limit": 50})
        assert r.status_code == 200 and r.json()["total"] == 6                            # all five Prism words at once (it allowed four)
        r = await gold.post("/api/screener/query", json={"columns": ["prism_final"], "cats": {"band": ["average"], "sector": ["Information Technology"]}, "limit": 50})
        assert r.status_code == 200 and [x["symbol"] for x in r.json()["rows"]] == ["S5"]
        r = await gold.post("/api/screener/query", json={"columns": ["prism_final"], "cats": {"band": ["nonsense"]}, "limit": 50})
        assert r.status_code == 422                                                       # a word of neither score is still refused
    finally:
        data._table = None


@pytest.mark.integration
async def test_the_catalog_names_the_prism_total_and_sends_each_scores_scale(app):  # noqa: F811
    """Task #144: Gold's Prism total is called "Fundamental Prism score" (task #141's name, kept at the founder's choice), and every score carries its fixed
    scale (0 to 100; the technical views -100 to +100) so the page's From and To boxes keep a value inside it. A figure with no fixed scale has none."""
    rows = [_row(f"C{i}", macro="Energy", industry="Oil", market_cap=1000 * (i + 1), price=100) for i in range(5)]
    prism = {f"C{i}": {"prism_final": 40 + 5 * i, "prism_label": "AVERAGE", "prism_status": "RATED", "prism_st_score": -20 + 10 * i} for i in range(5)}
    data._table = Table(rows, {}, {}, None, prism)
    try:
        gold = await signed_in(app, "g144@example.com", plan="gold")
        ms = {m["key"]: m for g in (await gold.get("/api/screener/catalog")).json()["groups"] for m in g["metrics"]}
        assert ms["prism_final"]["label"] == "Fundamental Prism score" and ms["prism_final"]["scale"] == [0.0, 100.0]
        assert ms["prism_st_score"]["scale"] == [-100.0, 100.0] and ms["prism_lt_score"]["scale"] == [-100.0, 100.0]
        assert all(ms[k]["scale"] == [0.0, 100.0] for k in ("prism_fundamental", "prism_valuation", "prism_quality", "prism_risk"))
        assert ms["market_cap"]["scale"] is None
        silver = await signed_in(app, "s144@example.com", plan="silver")
        sm = {m["key"]: m for g in (await silver.get("/api/screener/catalog")).json()["groups"] for m in g["metrics"]}
        assert sm["overall"]["scale"] == [0.0, 100.0] and "prism_final" not in sm   # Silver keeps FinLit IQ, with its scale; Prism stays Gold
    finally:
        data._table = None
