"""Task #243 round 3b (screeners pack v4, sections 2 to 4): the six Sectors screens on Advanced, the sector reading each company gets from the live Sector Pulse and
Rotation files, Tailwinds, the "Industry ahead and gaining" and "Peer leaders only" filters with their counts, and the industry board (its counts add up to the list)."""
import json
from datetime import date
from types import SimpleNamespace

from starlette.datastructures import QueryParams

from finlit.presets import api, engine, sectorread
from finlit.presets.registry import BANNED_WORDS, BASIC, BY_ID, SECTOR_ADV, STD_SECTOR
from finlit.screener.data import Table

AS_OF = date(2026, 11, 19)

BOARD = {"date": "2026-11-06", "rows": [
    {"name": "Banks", "slug": "banks", "state": "Confirmed", "state_code": "confirmed", "breadth": {"above_50": 61.0}, "last_thrust": {"type": "C", "sessions_ago": 12}},
    {"name": "Finance", "slug": "finance", "state": "Thrust CAP", "state_code": "thrust_cap", "breadth": {"above_50": 44.8}, "last_thrust": {"type": "CAP", "sessions_ago": 1}},
    {"name": "Power", "slug": "power", "state": "Washout", "state_code": "washout", "breadth": {"above_50": 12.0}, "last_thrust": None},
    {"name": "Realty", "slug": "realty", "state": "Fading", "state_code": "fading", "breadth": {"above_50": 30.0}},
]}
ROT = {"date": "2026-11-06", "rows": [
    {"slug": "banks", "corner": "ahead_gaining", "weeks_in_corner": 3, "rank": 4, "ranked": 37, "rank_change_4w": 2},
    {"slug": "finance", "corner": "behind_slipping", "weeks_in_corner": 14, "rank": 27, "ranked": 37, "rank_change_4w": 3},
    {"slug": "power", "corner": "behind_gaining", "weeks_in_corner": 2, "rank": 30, "ranked": 37, "rank_change_4w": 6},
    {"slug": "realty", "corner": "behind_gaining", "weeks_in_corner": 1, "rank": 33, "ranked": 37, "rank_change_4w": 1},
]}
PAGES = {
    "banks": {"stocks": [{"symbol": "HDFCBANK", "quarter": 1, "quarter_name": "Top quarter", "peer_label": "Leader", "leader_flag": None},
                         {"symbol": "SBIN", "quarter": 2, "quarter_name": "Second quarter", "peer_label": "In line", "leader_flag": None}],
              "not_counted": [{"symbol": "TINYBANK"}]},
    "finance": {"stocks": [{"symbol": "BAJFIN", "quarter": 1, "quarter_name": "Top quarter", "peer_label": "Leader", "leader_flag": {"tier_code": 2}},
                           {"symbol": "LOWFIN", "quarter": 4, "quarter_name": "Bottom quarter", "peer_label": "Laggard", "leader_flag": None}]},
    "power": {"stocks": [{"symbol": "NTPC", "quarter": 1, "quarter_name": "Top quarter", "peer_label": "Leader", "leader_flag": {"tier_code": 1}},
                         {"symbol": "TATAPOWER", "quarter": 3, "quarter_name": "Third quarter", "peer_label": "Leader", "leader_flag": None}]},
    "realty": {"stocks": [{"symbol": "DLF", "quarter": 1, "quarter_name": "Top quarter", "peer_label": "Leader", "leader_flag": None}]},
}
SYMS = ["HDFCBANK", "SBIN", "TINYBANK", "BAJFIN", "LOWFIN", "NTPC", "TATAPOWER", "DLF", "NOREAD"]


def row(sym, mcap=20000, **m):
    m.setdefault("market_cap", mcap)
    return {"symbol": sym, "name": sym.title(), "sector": "S", "industry": "I", "band": "mixed", "metrics": json.dumps(m)}


def pz(st=30, lt=30, **extra):
    return {"prism_final": 70, "prism_status": "RATED", "prism_label": "HEALTHY", "prism_fundamental": 60, "prism_valuation": 60, "prism_quality": 60, "prism_risk": 60,
            "prism_st_score": st, "prism_lt_score": lt, "prism_st": "Positive", "prism_lt": "Positive", **extra}


def frame(prism=None, setups=None):
    prism = prism or {s: pz() for s in SYMS}
    sectorread.mark(prism, {"date": BOARD["date"], "rotationDate": ROT["date"], "by": sectorread.build(BOARD, ROT, PAGES)})
    fr = engine.Frame(Table([row(s) for s in SYMS], {}, {}, None), prism, AS_OF)
    fr.sector_dates = {"sectors": "2026-11-06", "rotation": "2026-11-06"}
    if setups is not None:
        sectorread.mark_setups(fr, setups)
    return fr


def syms(body):
    return [r["symbol"] for r in body["rows"]]


# ---------------------------------------------------------------------------------------------------------------- the reading each company gets
def test_every_company_gets_its_groups_reading_and_a_counted_one_its_own_place():
    by = sectorread.build(BOARD, ROT, PAGES)
    h = by["HDFCBANK"]
    assert (h["sr_industry"], h["sr_rotation"], h["sr_pulse"], h["sr_above50"], h["sr_rebound"], h["sr_peer"]) == ("Banks", "Ahead and gaining · 3 wk", "Rising together", 61.0, "12 sessions ago", "Leader")
    assert (h["sr_ag"], h["sr_up"], h["sr_thrust"], h["sr_lead"], h["sr_rank"], h["sr_rank_4w"]) == (1.0, 1.0, 0.0, 1.0, 4.0, 2.0)
    assert by["TINYBANK"]["sr_industry"] == "Banks" and by["TINYBANK"]["sr_peer"] is None          # not counted: the group's reading, no peer label
    assert by["BAJFIN"]["sr_flag"] == "Full flag" and by["NTPC"]["sr_flag"] == "Early flag" and by["SBIN"]["sr_flag"] is None
    assert by["BAJFIN"]["sr_rebound"] == "1 session ago" and by["NTPC"]["sr_rebound"] is None
    assert "NOREAD" not in by                                                                        # outside every group: no reading, never guessed


def test_tailwinds_counts_four_facts():
    fr = frame(setups={"Near a 52-week high base": ["HDFCBANK", "NTPC"]})
    tw = {s: fr.pz[i]["sr_tailwinds"] for i, s in enumerate(fr.symbols) if fr.pz[i].get("sr_industry")}
    assert tw["HDFCBANK"] == 4.0          # ahead and gaining, Confirmed, Leader, on a setup list
    assert tw["SBIN"] == 2.0              # ahead and gaining, Confirmed
    assert tw["BAJFIN"] == 2.0            # Thrust CAP, Leader
    assert tw["NTPC"] == 2.0              # Leader, on a setup list (Washout and Behind but gaining add nothing)
    assert fr.pz[fr.symbols.index("NTPC")]["sr_setups"] == "Near a 52-week high base"
    assert "sr_tailwinds" not in fr.pz[fr.symbols.index("NOREAD")]


# ---------------------------------------------------------------------------------------------------------------- the six screens
def test_six_sectors_screens_on_advanced_only_with_words_and_i_notes():
    assert [p.id for p in SECTOR_ADV] == ["sector-leaders-leading", "sector-rebound-leaders", "sector-early-leaders", "sector-setups-behind", "sector-turning-up", "sector-results-leading"]
    assert not any(p.group == "sectors" for p in BASIC)
    for p in SECTOR_ADV:
        assert p.group == "sectors" and p.tab == "advanced" and p.card_text and p.how_it_works and len(p.about) == 2 and len(p.about[1]) == 3, p.id
        text = " ".join([p.name, p.card_text, p.about[0], *p.about[1], *p.how_it_works, *p.notes]).lower()
        for w in BANNED_WORDS + ("hold", "avoid", "reduce", "accumulate", "target", "buy", "sell", "best"):
            assert f" {w} " not in f" {text} ", (p.id, w)


def test_each_sectors_rule():
    prism = {s: pz() for s in SYMS}
    prism["SBIN"] = pz(lt=10)
    prism["TATAPOWER"] = pz(st=10)
    prism.update({"HDFCBANK": pz(res_fresh=1.0, res_rank=5, res_verdict="Strong", res_profit_yoy=30.0), "BAJFIN": pz(res_fresh=1.0, res_rank=4, res_verdict="Good", res_profit_yoy=50.0),
                  "DLF": pz(res_fresh=1.0, res_rank=5, res_verdict="Strong", res_profit_yoy=90.0)})
    fr = frame(prism, setups={"Tight range": ["SBIN", "NTPC", "LOWFIN"]})
    assert syms(engine.run(fr, BY_ID["sector-leaders-leading"])) == ["HDFCBANK"]            # SBIN is In line; BAJFIN's industry is behind
    assert syms(engine.run(fr, BY_ID["sector-rebound-leaders"])) == ["BAJFIN"]              # Thrust CAP, top quarter; LOWFIN is bottom quarter
    assert syms(engine.run(fr, BY_ID["sector-early-leaders"])) == ["BAJFIN", "NTPC"]         # Full and Early flags, ordered by Tailwinds
    assert syms(engine.run(fr, BY_ID["sector-setups-behind"])) == ["SBIN", "LOWFIN"]        # NTPC's industry is in a Washout and behind
    assert syms(engine.run(fr, BY_ID["sector-turning-up"])) == ["NTPC", "DLF"]              # Behind but gaining Leaders, the industry climbing most first; TATAPOWER st 10
    assert syms(engine.run(fr, BY_ID["sector-results-leading"])) == ["HDFCBANK", "BAJFIN"]  # DLF's industry is behind and Fading


def test_any_advanced_screen_carries_the_sector_reading_and_its_dates():
    fr = frame()
    body = engine.run(fr, BY_ID["sector-leaders-leading"])
    bands = [c for c in body["columns"] if c.get("band") == "Sector reading"]
    assert [c["label"] for c in bands] == ["Industry", "Rotation", "Pulse", "Vs peers", "Tailwinds"] == [x[1] for x in STD_SECTOR]
    r = body["rows"][0]
    assert (r["sr_industry"], r["sr_rotation"], r["sr_pulse"], r["sr_peer"], r["sr_slug"], r["sr_rank"], r["sr_rank_4w"]) == ("Banks", "Ahead and gaining · 3 wk", "Rising together", "Leader", "banks", 4.0, 2.0)
    assert body["dataDates"] == {"prices": "2026-11-19", "setups": None, "sectors": "2026-11-06", "rotation": "2026-11-06"}
    basic = engine.run(engine.Frame(Table([row("X", overall=70)], {}, {}, None), {}, AS_OF), BY_ID["basic-strong-all-four"])
    assert not any(c.get("band") == "Sector reading" for c in basic["columns"]) and "dataDates" not in basic   # Basic gets no sector reading


# ---------------------------------------------------------------------------------------------------------------- filters and the industry board
def _req(qs):
    return SimpleNamespace(query_params=QueryParams(qs))


def test_two_sector_filters_and_their_counts():
    rows = [{"symbol": "A", "sr_ag": 1, "sr_lead": 1, "sr_slug": "banks"}, {"symbol": "B", "sr_ag": 1, "sr_lead": 0, "sr_slug": "banks"},
            {"symbol": "C", "sr_ag": 0, "sr_lead": 1, "sr_slug": "power"}, {"symbol": "D"}]
    pick = lambda qs: [r["symbol"] for r in api._filtered(_req(qs), rows)]       # noqa: E731
    assert pick("sag=1") == ["A", "B"] and pick("plead=1") == ["A", "C"] and pick("sag=1&plead=1") == ["A"] and pick("ind=power") == ["C"]
    f = api._facets(rows, api._tests(api._bar(_req("plead=1")), None))
    assert (f["sag"], f["plead"]) == (1, 2)          # with Peer leaders on, Industry ahead and gaining would leave A only; the plead count ignores itself


def test_the_industry_board_adds_up_to_the_list_and_a_chip_narrows_it():
    fr = frame()
    body = engine.run(fr, BY_ID["sector-early-leaders"])
    out = api._page(_req(""), body)
    board = out["industryBoard"]
    assert sum(b["n"] for b in board) == out["available"] == 2
    assert {(b["slug"], b["rotation"], b["pulse"]) for b in board} == {("finance", "Behind and slipping", "Bouncing back after a crash"), ("power", "Behind but gaining", "Sold off")}
    narrowed = api._page(_req("ind=power"), body)
    assert [r["symbol"] for r in narrowed["rows"]] == ["NTPC"] and sum(b["n"] for b in narrowed["industryBoard"]) == 2   # the board still shows every chip
    assert "industryBoard" not in api._page(_req(""), engine.run(fr, BY_ID["momentum-leaders"]))


def test_the_sectors_group_is_new_and_has_an_intro_with_an_i():
    g = api.GROUP_EXTRA["sectors"]
    assert g["isNew"] and g["intro"] and len(g["about"]["use"]) == 3
    words = (g["intro"] + " " + g["about"]["shows"] + " " + " ".join(g["about"]["use"])).lower()
    for w in ("buy", "sell", "hold", "avoid", "best", "target"):
        assert f" {w} " not in f" {words} "
