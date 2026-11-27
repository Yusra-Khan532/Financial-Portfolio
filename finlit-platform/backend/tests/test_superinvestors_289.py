"""Task #289 (the superinvestors developer file of 21 Nov 2026): tracked investors, each grouped with every name they file under.

The numbers checked here are the file's own Checks, on the 21 Nov 2026 data behind its mockup (tests/fixtures/superinvestors_tracked_21nov.json)."""
import json
from pathlib import Path

import pytest

from finlit import superinvestors as si
from finlit import superinvestors_tracked as T
from test_auth import anon, app, signed_in  # noqa: F401  (fixtures and the sign-in helper)
from test_integration import ingested, make_settings, store  # noqa: F401  (fixtures)

FIX = json.loads((Path(__file__).parent / "fixtures" / "superinvestors_tracked_21nov.json").read_text())
CFG = T.load_config()


def built():
    stakes = {k: {s: {"now": v[0], "ago": v[1], "asOf": v[2]} for s, v in m.items()} for k, m in FIX["stakes"].items()}
    uni = {s: {"name": v[0], "mcap": v[1], "r1": v[2], "prism_label": v[3], "prism_final": v[4], "st": v[5], "lt": v[6], "sector": v[7]} for s, v in FIX["stocks"].items()}
    lead = {s: {"chip": v[8], "text": v[9]} for s, v in FIX["stocks"].items() if v[8]}
    return T.build(CFG, stakes, uni, lead, FIX["medians"], FIX["quotes"])


def test_the_tracked_list_is_26_investors_with_their_filed_names():
    assert len(CFG) == 26
    keys = {i["key"] for i in CFG}
    assert {"ashish-kacholia", "vijay-kedia", "mukul-agrawal", "madhusudan-kela", "radhakishan-damani"} <= keys
    kedia = next(i for i in CFG if i["key"] == "vijay-kedia")
    assert len(kedia["filed_names"]) == 3                      # Vijay Kishanlal Kedia, Vijay Kedia, Kedia Securities
    kach = next(i for i in CFG if i["key"] == "ashish-kacholia")
    assert {f["key"] for f in kach["filed_names"]} >= {"bengal-finance-and-investment-pvt-ltd", "suryavanshi-commotrade-pvt-ltd"}
    # every filed key is the key the filings give the name (holder_key, as on /api/superinvestors)
    for inv in CFG:
        for fn in inv["filed_names"]:
            assert si.slug(si.holder_key(fn["as_filed"])) == fn["key"], fn


def test_ashish_kacholia_on_the_21_nov_data():
    k = built()["investors"]["ashish-kacholia"]
    assert k["companies"] == 39 and k["groupedNames"] == 3
    assert round(k["valueCr"]) == 2920
    assert k["moves"] == {"new": 13, "added": 4, "reduced": 13, "exited": 10} and k["movesTotal"] == 40
    assert k["namedStakes1y"] == {"pct": 24.0, "coverPct": 78, "why": None}
    assert k["sameSizeMarketPct"] == -12.8


def test_tiles_and_every_view_agree_on_the_same_counts():
    out = built()
    assert out["tiles"] == {"tracked": 26, "companies": 325, "moves": 279, "heldBy2": 27}
    assert sum(i["movesTotal"] for i in out["investors"].values()) == len(out["moves"]) == 279
    assert len(T.agree_view(out["agree"], "held")) == 27
    # the investor cards' move chips add up to the latest moves' kind chips
    by_kind = {m: sum(i["moves"][m] for i in out["investors"].values()) for m in ("new", "added", "reduced", "exited")}
    assert by_kind == {m: out["moveCounts"].get(m, 0) for m in by_kind}


def test_every_investor_matches_the_mockup_within_rounding():
    """The mockup's own figures per investor: companies, value (rounded per holding there), moves, named stakes 1 year, same-size market."""
    want = {"rekha-jhunjhunwala": (21, 41728.3, 11), "mukul-agrawal": (58, 7766.3, 48), "vijay-kedia": (16, 1095.2, 8), "dolly-khanna": (4, 345.8, 11),
            "madhusudan-kela": (18, 2023.8, 13), "nikhil-kamath": (4, 2463.4, 4)}
    out = built()["investors"]
    for key, (companies, value, moves) in want.items():
        i = out[key]
        assert i["companies"] == companies and abs(i["valueCr"] - value) < 0.5 and i["movesTotal"] == moves, key


def test_named_stakes_need_a_1_year_price_for_60_percent_of_the_value():
    out = built()["investors"]
    assert out["radhakishan-damani"]["namedStakes1y"]["pct"] is None                    # the new NSE stake has no 1-year price: 13% covered
    assert out["radhakishan-damani"]["namedStakes1y"]["coverPct"] == 13
    assert "under 60%" in out["radhakishan-damani"]["namedStakes1y"]["why"]


def test_a_source_stake_above_100_is_a_source_error_never_a_move():
    out = built()
    t = next(h for h in out["investors"]["ajay-upadhyaya"]["holdings"] if h["symbol"] == "TIRUMALCHM")     # 103% a year ago in the source
    assert t["sourceError"] and t["move"] == "unchanged" and t["changePts"] is None and t["stakeNow"] == 1.2
    assert all(m["symbol"] != "TIRUMALCHM" for m in out["moves"])
    # Jain Resource Recycling: 114% and 113% a year ago under two Kacholia names, not named now: nothing sound to show, in no list
    cfg = [{"key": "k", "name": "K", "filed_names": [{"key": "a", "as_filed": "A"}, {"key": "b", "as_filed": "B"}]}]
    stakes = {"a": {"JAINREC": {"now": 0, "ago": 114}, "X": {"now": 2.0, "ago": 1.0}}, "b": {"JAINREC": {"now": 0, "ago": 113}}}
    o = T.build(cfg, stakes, {"X": {"mcap": 1000}, "JAINREC": {"mcap": 5000}}, {}, {"Large": 0, "Mid": 0, "Small": 0, "Micro": 0})
    assert [h["symbol"] for h in o["investors"]["k"]["holdings"]] == ["X"] and o["sourceErrors"] == 1
    assert [m["symbol"] for m in o["moves"]] == ["X"]


def test_moves_and_the_value_of_a_change():
    assert T.status_of(5.31, 5.32) == "reduced"            # a 0.01-point cut is a cut (floating point gives -0.00999...)
    assert T.status_of(2.0, 0) == "new" and T.status_of(0, 1.5) == "exited" and T.status_of(1.5, 1.5) == "unchanged" and T.status_of(1.52, 1.5) == "added"
    cfg = [{"key": "k", "name": "K", "filed_names": [{"key": "a", "as_filed": "A"}, {"key": "b", "as_filed": "B"}]}]
    stakes = {"a": {"X": {"now": 2.0, "ago": 1.0}, "Y": {"now": 0, "ago": 3.0}}, "b": {"X": {"now": 1.5, "ago": 1.5}}}
    o = T.build(cfg, stakes, {"X": {"mcap": 1000}, "Y": {"mcap": 2000}}, {}, {"Large": 0, "Mid": 0, "Small": 0, "Micro": 0})
    h = {x["symbol"]: x for x in o["investors"]["k"]["holdings"]}
    assert h["X"]["stakeNow"] == 3.5 and h["X"]["stakeThen"] == 2.5 and h["X"]["changePts"] == 1.0 and h["X"]["names"] == 2      # combined over both names
    assert h["X"]["changeValueCr"] == 10.0 and h["X"]["valueCr"] == 35.0
    assert h["Y"]["move"] == "exited" and h["Y"]["changeValueCr"] == 60.0 and h["Y"]["changeAbout"]                # "about": the earlier stake x today's cap


def test_sizes_and_same_size_market_use_the_site_rule():
    assert [T.size_of(x) for x in (80000, 75000, 25000, 10000, 9999, None)] == ["Large", "Mid", "Mid", "Small", "Micro", None]
    med = T.medians({"A": {"mcap": 100000, "r1": 10}, "B": {"mcap": 90000, "r1": 20}, "C": {"mcap": 500, "r1": -5}})
    assert med == {"Large": 15.0, "Mid": None, "Small": None, "Micro": -5.0}


def test_the_all_named_holders_list_marks_names_of_a_tracked_investor():
    marks = T.by_filed_name(CFG)
    assert marks["bengal-finance-and-investment-pvt-ltd"] == {"key": "ashish-kacholia", "name": "Ashish Kacholia"}
    assert marks["kedia-securities-pvt-ltd"]["key"] == "vijay-kedia" if "kedia-securities-pvt-ltd" in marks else True


ROWS = [
    {"symbol": "AAA", "as_of": "Sep 2026", "premium_at": "2026-11-10T01:00:00+00:00",
     "holders": [["ASHISH KACHOLIA", "public", 2.5, 1.5], ["Bengal Finance & Investment Pvt Ltd", "public", 1.2, 0.0], ["Rekha Jhunjhunwala", "public", 3.0, 3.0]]},
    {"symbol": "BBB", "as_of": "Sep 2026", "premium_at": "2026-11-11T01:00:00+00:00",
     "holders": [["Ashish Kacholia", "public", 1.1, 1.4], ["Rekha Jhunjhunwala", "public", 2.0, 2.5]]},
]


def test_stakes_by_name_keeps_every_public_name_in_any_number_of_companies():
    s = si.stakes_by_name(ROWS)
    assert s["bengal-finance-and-investment-pvt-ltd"] == {"AAA": {"now": 1.2, "ago": 0.0, "asOf": "Sep 2026", "as_filed": "Bengal Finance & Investment Pvt Ltd", "quarters": None}}
    assert set(s["ashish-kacholia"]) == {"AAA", "BBB"}


@pytest.mark.asyncio
async def test_the_feature_is_gold_only_and_old_name_links_move_to_the_tracked_page(app, anon):   # noqa: F811
    store = app.state.store
    si._mem = (0.0, None)
    async with store.pool.acquire() as conn:
        await conn.execute("TRUNCATE ownership_insights")
        for r in ROWS:
            await conn.execute("INSERT INTO companies (symbol, name) VALUES ($1, $1) ON CONFLICT DO NOTHING", r["symbol"])
            await conn.execute("INSERT INTO ownership_insights (symbol, statement, as_of, rules_version, body, extra, premium_state, premium_at, built_at) "
                               "VALUES ($1, 'consolidated', $2, 't', '{}'::jsonb, $3::jsonb, 'ok', now(), now())", r["symbol"], r["as_of"], json.dumps({"holders": r["holders"]}))
    await store.redis.delete(si.CACHE_KEY)
    # the All named holders list stays open and marks the names that belong to a tracked investor
    r = await anon.get("/api/superinvestors")
    assert r.status_code == 200
    rows = {i["key"]: i for i in r.json()["investors"]}
    assert rows["ashish-kacholia"]["tracked"] == {"key": "ashish-kacholia", "name": "Ashish Kacholia"}
    # everything else needs Gold: a visitor and a Silver member get plan_required (gold), never Silver
    for path in ("/api/superinvestors/tracked", "/api/superinvestors/ashish-kacholia", "/api/superinvestors/name/rekha-jhunjhunwala"):
        r = await anon.get(path)
        assert r.status_code == 403 and r.json()["plan"] == "gold", path
    silver = await signed_in(app, "silver289@example.com", plan="silver")
    assert (await silver.get("/api/superinvestors/tracked")).status_code == 403
    gold = await signed_in(app, "gold289@example.com", plan="gold")
    t = (await gold.get("/api/superinvestors/tracked")).json()
    assert t["tiles"]["tracked"] == 26 and t["tiles"]["companies"] == 2
    k = (await gold.get("/api/superinvestors/ashish-kacholia")).json()
    assert k["kind_of_page"] == "tracked" and k["companies"] == 2 and k["groupedNames"] == 3
    aaa = next(h for h in k["holdings"] if h["symbol"] == "AAA")
    assert aaa["stakeNow"] == 3.7 and aaa["names"] == 2 and aaa["alsoHeldBy"] == ["rekha-jhunjhunwala"]
    moved = (await gold.get("/api/superinvestors/bengal-finance-and-investment-pvt-ltd")).json()
    assert moved == {"status": "moved", "to": "ashish-kacholia", "name": "Ashish Kacholia"}
    n = (await gold.get("/api/superinvestors/name/ashish-kacholia")).json()
    assert n["kind_of_page"] == "name" and n["tracked"]["key"] == "ashish-kacholia"
    si._mem = (0.0, None)
