"""Task #243 round 3a (screeners pack v4: R5 and version 4): the thirteen new screens' rules, their order and own columns, the score-history and results fields
they read, the "F&O stocks only" and "Liquid only" filters with their counts, the promoter cap (D3), and the i notes and NEW tag the API sends."""
import json
from datetime import date
from types import SimpleNamespace

from starlette.datastructures import QueryParams

from finlit.presets import api, engine
from finlit.presets import service as svc
from finlit.presets.registry import BANNED_WORDS, BY_ID, NEW_ADV, NEW_BASIC
from finlit.screener.data import Table
from finlit.screener.ready import READY

AS_OF = date(2026, 11, 19)


def row(sym, mcap=5000, **m):
    m.setdefault("market_cap", mcap)
    return {"symbol": sym, "name": sym.title(), "sector": "S", "industry": "I", "band": "mixed", "metrics": json.dumps(m)}


def pz(final=70, label="HEALTHY", st=10, lt=10, status="RATED", **extra):
    return {"prism_final": final, "prism_status": status, "prism_label": label, "prism_fundamental": 60, "prism_valuation": 60, "prism_quality": 60, "prism_risk": 60,
            "prism_st_score": st, "prism_lt_score": lt, "prism_st": "Positive", "prism_lt": "Positive", **extra}


def run(pid, rows, prism=None, fno=None):
    t = Table(rows, {}, {}, fno)
    return engine.run(engine.Frame(t, prism or {}, AS_OF), BY_ID[pid])


def syms(body):
    return [r["symbol"] for r in body["rows"]]


# ---------------------------------------------------------------------------------------------------------------- the registry
def test_thirteen_new_screens_in_their_groups_with_words_and_i_notes():
    adv = {p.id: p.group for p in NEW_ADV}
    basic = {p.id: p.group for p in NEW_BASIC}
    assert adv == {"strong-results": "growth", "dividend-payers": "value-income", "turnarounds": "value-income", "rating-downgrades": "safety", "institutions-buying": "ownership",
                   "promoter-buying": "ownership", "fresh-results": "growth", "weak-results": "safety"}
    assert basic == {"basic-iq-upgrades": "top-rated", "basic-strong-results": "growth", "basic-dividend-payers": "value-income", "basic-iq-downgrades": "safety",
                     "basic-institutions-buying": "ownership", "basic-promoter-buying": "ownership", "basic-fresh-results": "growth", "basic-weak-results": "safety"}
    for p in NEW_ADV + NEW_BASIC:
        assert p.tab == ("basic" if p.id.startswith("basic-") else "advanced") and p.added == "2026-11-19" and p.status == "live"
        assert p.card_text and p.how_it_works and len(p.about) == 2 and len(p.about[1]) == 3, p.id          # "What it shows", then three "How to use it" points
        text = " ".join([p.name, p.card_text, p.about[0], *p.about[1], *p.how_it_works, *p.notes]).lower()
        for w in BANNED_WORDS + ("hold", "avoid", "reduce", "accumulate", "target"):
            assert f" {w} " not in f" {text} ", (p.id, w)
        if p.tab == "basic":
            assert "prism" not in text, p.id                                                                       # the Basic tab never names Prism
    assert [c.label for c in BY_ID["fresh-results"].columns if c.key.startswith("res_")] == ["Declared", "Result", "Sales vs a year ago", "Profit vs a year ago", "Net margin change (points)"]
    assert [c.label for c in BY_ID["rating-downgrades"].columns if c.key.startswith(("prism_before", "prism_change"))] == ["Prism before", "Rating before", "Scored on", "Change"]
    assert [c.label for c in BY_ID["basic-iq-upgrades"].columns if c.key.startswith("iq_")] == ["FinLit IQ before", "Band before", "Scored on", "Change"]


# ---------------------------------------------------------------------------------------------------------------- each rule on a small universe
def test_strong_results_dividend_payers_and_institutions_buying():
    rows = [row("A", q_sales_yoy=25, q_profit_yoy=40, dividend_yield=3, div_years=6, own_fii_chg_1q=0.6, own_dii_chg_1q=0.7, own_promoters_chg_1y=0),
            row("B", q_sales_yoy=25, q_profit_yoy=60, dividend_yield=2.5, div_years=5, own_fii_chg_1q=0.4, own_dii_chg_1q=2, own_promoters_chg_1y=0),
            row("C", q_sales_yoy=19, q_profit_yoy=90, dividend_yield=4, div_years=4, own_fii_chg_1q=1, own_dii_chg_1q=1, own_promoters_chg_1y=-2),
            row("D", q_sales_yoy=50, q_profit_yoy=50, dividend_yield=5, div_years=6, own_fii_chg_1q=1, own_dii_chg_1q=1, own_promoters_chg_1y=0),
            row("E", mcap=800, q_sales_yoy=50, q_profit_yoy=50, dividend_yield=5, div_years=6, own_fii_chg_1q=1, own_dii_chg_1q=1, own_promoters_chg_1y=0)]
    prism = {"A": pz(70), "B": pz(82, "STRONG"), "C": pz(70), "D": pz(60, "AVERAGE"), "E": pz(80)}       # D is not sound; E is under Rs 1,000 Cr
    assert syms(run("strong-results", rows, prism)) == ["B", "A"]                       # largest profit growth first; C misses the sales bar
    assert syms(run("dividend-payers", rows, prism)) == ["A", "B"]                      # yield first; C paid in only 4 of 6 years
    assert syms(run("institutions-buying", rows, prism)) == ["A"]                       # B: foreign institutions under 0.5; C: promoters down 2 in a year


def test_turnarounds_need_a_short_term_uptrend_and_a_flat_long_term_view():
    rows = [row(s) for s in "ABCD"]
    prism = {"A": pz(70, st=45, lt=5), "B": pz(70, st=25, lt=-30), "C": pz(70, st=45, lt=30), "D": pz(70, st=45, lt=None)}
    assert syms(run("turnarounds", rows, prism)) == ["A", "B"]                          # C's long-term view is already up; D has none, so it is left out


def test_promoter_buying_keeps_rises_of_half_a_point_to_ten_points():
    rows = [row("A", own_promoters_chg_1q=2.0, own_promoters=55), row("B", own_promoters_chg_1q=0.5, own_promoters=40),
            row("VENKEYS", own_promoters_chg_1q=56.11, own_promoters=80), row("D", own_promoters_chg_1q=0.4, own_promoters=60)]
    prism = {s: pz(70) for s in ("A", "B", "VENKEYS", "D")}
    body = run("promoter-buying", rows, prism)
    assert syms(body) == ["A", "B"] and body["rows"][0]["own_promoters_chg_1q"] == 2.0      # D3: the 56-point jump is a reclassification, not buying


def test_basic_screens_use_the_finlit_iq_band():
    rows = [row("A", overall=70, q_sales_yoy=30, q_profit_yoy=30), row("B", overall=55, q_sales_yoy=30, q_profit_yoy=30)]
    assert syms(run("basic-strong-results", rows)) == ["A"]                             # B's FinLit IQ is Mixed


# ---------------------------------------------------------------------------------------------------------------- score history: before, change, same model
def test_move_fields_change_is_now_minus_before_and_band_moves():
    f = svc.move_fields("prism", 61.0, 72.0, date(2026, 11, 3), svc.band_of, svc.BAND_NAMES)
    assert f == {"prism_before": 72.0, "prism_before_rating": "Healthy", "prism_before_day": "2026-11-03", "prism_change": -11.0, "prism_band_up": 0.0, "prism_band_down": 1.0}
    g = svc.move_fields("iq", 63.0, 55.0, date(2026, 10, 27), svc.iq_band_of, svc.IQ_NAMES)
    assert g["iq_before_band"] == "Mixed" and g["iq_change"] == 8.0 and g["iq_band_up"] == 1.0
    assert svc.move_fields("iq", None, 55.0, date(2026, 10, 27), svc.iq_band_of, svc.IQ_NAMES) == {}      # no score today: no row, never a guess


def test_rating_downgrades_and_iq_upgrades_downgrades_on_every_row_change_adds_up():
    rows = [row(s, overall=o) for s, o in (("A", 70), ("B", 60), ("C", 75), ("D", 50))]
    prism = {"A": pz(60, **svc.move_fields("prism", 60, 72, date(2026, 11, 3), svc.band_of, svc.BAND_NAMES)),      # Healthy -> Average: a band down
             "B": pz(55, **svc.move_fields("prism", 55, 62, date(2026, 11, 3), svc.band_of, svc.BAND_NAMES)),      # 7 points, same band: not listed
             "C": pz(66, **svc.move_fields("prism", 66, 78, date(2026, 11, 3), svc.band_of, svc.BAND_NAMES)),      # 12 points down, same band: listed
             "D": pz(50)}
    body = run("rating-downgrades", rows, prism)
    assert syms(body) == ["A", "C"] or syms(body) == ["C", "A"]
    for r in body["rows"]:
        assert round(r["prism_final"] - r["prism_before"], 1) == r["prism_change"]       # pack R5: score now - score before = Change, on every row
    assert syms(body)[0] == "A" or body["rows"][0]["prism_change"] <= body["rows"][1]["prism_change"]
    iq = {"A": svc.move_fields("iq", 70, 60, date(2026, 10, 27), svc.iq_band_of, svc.IQ_NAMES), "B": svc.move_fields("iq", 60, 64, date(2026, 10, 27), svc.iq_band_of, svc.IQ_NAMES),
          "C": svc.move_fields("iq", 75, 70, date(2026, 10, 27), svc.iq_band_of, svc.IQ_NAMES), "D": svc.move_fields("iq", 50, 59, date(2026, 10, 27), svc.iq_band_of, svc.IQ_NAMES)}
    up, down = run("basic-iq-upgrades", rows, iq), run("basic-iq-downgrades", rows, iq)
    assert syms(up) == ["A"] and syms(down) == ["D", "B"]               # A rose 10; D fell 9; B fell a band (Healthy to Mixed); C rose 5 in its band
    for r in up["rows"] + down["rows"]:
        assert round(r["overall"] - r["iq_before"], 1) == r["iq_change"]


class _Conn:
    def __init__(self, prism_rows, iq_rows):
        self.p, self.i = prism_rows, iq_rows

    async def fetch(self, sql, *args):
        assert "model_version IS NOT DISTINCT FROM" in sql or "model = 'v1'" in sql        # the same scoring model only
        return self.p if "prism_history" in sql else self.i

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


async def test_score_moves_read_the_histories_into_the_frame_fields():
    conn = _Conn([{"symbol": "A", "day": date(2026, 11, 3), "final": 72.0}], [{"symbol": "A", "day": date(2026, 10, 27), "overall": 60}, {"symbol": "B", "day": AS_OF, "overall": 50}])
    store = SimpleNamespace(pool=SimpleNamespace(acquire=lambda: conn))
    prism = {"A": pz(60)}
    await svc._score_moves(store, prism, AS_OF, {"A": 70.0, "B": 52.0})
    assert prism["A"]["prism_change"] == -12.0 and prism["A"]["iq_change"] == 10.0 and prism["A"]["iq_before_day"] == "2026-10-27"
    assert "B" not in prism                                                   # nothing on file before today: no move


# ---------------------------------------------------------------------------------------------------------------- the results screens
def test_results_window_takes_the_last_week_with_numbers_and_the_page_verdict():
    rr = [{"symbol": "A", "date": "2026-11-18", "hasNumbers": True, "verdict": "Strong", "revenueYoY": 30.0, "profitYoY": 45.0, "npmChange": 2.1},
          {"symbol": "B", "date": "2026-11-12", "hasNumbers": True, "verdict": "Loss", "revenueYoY": -5.0, "profitYoY": -120.0, "npmChange": -6.0},
          {"symbol": "C", "date": "2026-11-11", "hasNumbers": True, "verdict": "Strong", "revenueYoY": 30.0, "profitYoY": 45.0, "npmChange": 1.0},   # 8 days back: outside
          {"symbol": "D", "date": "2026-11-17", "hasNumbers": False, "verdict": None},
          {"symbol": "E", "date": "2026-11-16", "hasNumbers": True, "verdict": None, "revenueYoY": 1.0, "profitYoY": 1.0, "npmChange": 0.0}]
    f = svc.results_fields(rr, AS_OF)
    assert sorted(f) == ["A", "B", "E"]
    assert f["A"]["res_rank"] == 5 and f["B"]["res_rank"] == 0 and f["E"]["res_rank"] is None and f["A"]["res_declared"] == "2026-11-18"
    rows = [row(s, overall=70) for s in "ABE"]
    prism = {s: pz(70, **f[s]) for s in "ABE"}
    fresh, weak = run("fresh-results", rows, prism), run("weak-results", rows, prism)
    assert syms(fresh) == ["A"] and syms(weak) == ["B"]                          # E was not judged: on neither list
    r = fresh["rows"][0]
    assert (r["res_declared"], r["res_verdict"], r["res_sales_yoy"], r["res_profit_yoy"], r["res_npm_change"]) == ("2026-11-18", "Strong", 30.0, 45.0, 2.1)
    assert syms(run("basic-fresh-results", rows, {s: dict(f[s]) for s in "ABE"})) == ["A"]


# ---------------------------------------------------------------------------------------------------------------- filters, D3 on the Stock screener, the API's i and NEW
def test_fno_and_liquid_filters_with_their_counts():
    rows = [{"symbol": "A", "market_cap": 60000, "fno": 1.0, "turnover20_cr": 55.0}, {"symbol": "B", "market_cap": 20000, "fno": 0.0, "turnover20_cr": 12.5},
            {"symbol": "C", "market_cap": 5000, "fno": None, "turnover20_cr": 3.0}, {"symbol": "D", "market_cap": 5000, "fno": 1.0, "turnover20_cr": None}]
    req = lambda qs: SimpleNamespace(query_params=QueryParams(qs))      # noqa: E731
    pick = lambda qs: [r["symbol"] for r in api._filtered(req(qs), rows)]   # noqa: E731
    assert pick("fno=1") == ["A", "D"] and pick("liquid=1") == ["A", "B"] and pick("fno=1&liquid=1") == ["A"]
    f = api._facets(rows, api._tests(api._bar(req("liquid=1")), None))
    assert (f["fno"], f["liquid"]) == (1, 2)                             # F&O given Liquid on; Liquid ignores itself
    body = run("strong-results", [row("A", q_sales_yoy=30, q_profit_yoy=30, turnover20_cr=55)], {"A": pz(70)}, fno={"A": True})
    assert body["rows"][0]["fno"] == 1.0 and body["rows"][0]["turnover20_cr"] == 55.0     # every row carries what the two filters read


def test_promoters_and_funds_buying_is_capped_at_ten_points():
    buying = next(r for r in READY if r.id == "buying")
    assert buying.rules["own_promoters_chg_1y"] == {"min": 0.25, "max": 10}


def test_api_sends_the_i_and_the_new_tag_for_two_weeks():
    p = BY_ID["promoter-buying"]
    assert api._about(p)["use"] and len(api._about(p)["use"]) == 3 and api._about(BY_ID["momentum-leaders"]) is None
    assert api._is_new(p, date(2026, 11, 19)) and api._is_new(p, date(2026, 12, 3)) and not api._is_new(p, date(2026, 12, 4))
    assert not api._is_new(BY_ID["momentum-leaders"], date(2026, 11, 19))
    body = api._with_meta({"notes": ["Other"]}, p)
    assert body["isNew"] in (True, False) and body["about"]["shows"].startswith("Companies where the promoters") and body["notes"][0].startswith("Holdings come from") and body["notes"][-1] == "Other"
