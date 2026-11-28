"""Task #378 (team, reopened 25 Nov 2026): "still the scores are not seen". Hovering P R C Q in the funds list showed only the part's word ("Performance:
Weak"); the list now carries each part's own figure (0 to 100, as the score job stored it) beside the unchanged word, in `pillarScores`, for every
list that sends `pillars` (/api/mf/scores, the Fund Score Screener, the leaderboard). The figure follows the score's own plan gate: Gold sees it; Basic,
Silver and a visitor get null and no number anywhere in the item."""

import pytest

from finlit.mfscore import scorehist
from test_auth import app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_mfscore_upgrade import seed

pytestmark = pytest.mark.integration
PARTS = ("performance", "risk", "cost", "quality")
COLS = {"performance": "perf", "risk": "risk", "cost": "cost", "quality": "quality"}


def test_part_scores_round_like_the_fund_page_and_never_make_up_a_figure():
    assert scorehist.part_scores(42.04, 70, None, 59.96) == {"performance": 42.0, "risk": 70.0, "cost": None, "quality": 60.0}
    assert scorehist.part_words(42.04, 70, None, 59.96) == {"performance": "Weak", "risk": "Strong", "cost": "Not scored", "quality": "Fair"}


async def stored(app, code):
    async with app.state.store.pool.acquire() as conn:
        return await conn.fetchrow("SELECT perf, risk, cost, quality FROM mf_scores WHERE code = $1", code)


async def test_gold_list_items_carry_each_part_figure_beside_its_word(app):
    funds, _ = await seed(app, n=12)
    gold = await signed_in(app, "g378@example.com", plan="gold")
    code = funds[0].code
    row = await stored(app, code)
    it = (await gold.get(f"/api/mf/scores?codes={code}")).json()["items"][0]
    assert it["final"] is not None
    for p in PARTS:
        v = row[COLS[p]]
        assert it["pillarScores"][p] == (None if v is None else round(float(v), 1)), p      # the stored figure, never a made-up one
        assert it["pillars"][p] == scorehist.part_word(v)                                     # the word stays as it was (other pages read it)
        assert it["pillarScores"][p] is None or 0 <= it["pillarScores"][p] <= 100
    scr = (await gold.get("/api/mf/score-screener?limit=200")).json()["items"]
    one = next(i for i in scr if i["code"] == code)
    assert one["pillarScores"] == it["pillarScores"] and one["pillars"] == it["pillars"]
    board = (await gold.get(f"/api/mf/leaderboard?sub={one['sub']}&plan={one['plan']}")).json()["items"]
    assert next(i for i in board if i["code"] == code)["pillarScores"] == it["pillarScores"]
    csv = (await gold.get("/api/mf/score-screener?format=csv")).text   # the export keeps the words
    assert "Weak" in csv or "Fair" in csv or "Strong" in csv


async def test_an_idcw_row_carries_its_growth_options_part_figures(app):
    funds, _ = await seed(app, n=12)
    f = funds[0]
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO mf_schemes (code, name, amc, scheme_type, category, plan, option_class, family) VALUES ($1, $2, 'Test AMC', 'Open Ended', $3, $4, 'IDCW', $5)",
                           f.code + 5000, f.name + " IDCW", f.category, f.plan, f.name)
    gold = await signed_in(app, "gi378@example.com", plan="gold")
    items = {i["code"]: i for i in (await gold.get(f"/api/mf/scores?codes={f.code},{f.code + 5000}")).json()["items"]}
    assert items[f.code + 5000]["inherited"]["code"] == f.code and items[f.code + 5000]["pillarScores"] == items[f.code]["pillarScores"]
    basic = await signed_in(app, "bi378@example.com", plan="basic")
    for i in (await basic.get(f"/api/mf/scores?codes={f.code},{f.code + 5000}")).json()["items"]:
        assert i["pillarScores"] is None and i["pillars"] is None and i["final"] is None


@pytest.mark.parametrize("plan", [None, "basic", "silver"])
async def test_below_gold_no_part_figure_leaves_the_server(app, plan):
    funds, _ = await seed(app, n=12)
    c = new_client(app) if plan is None else await signed_in(app, f"{plan}378@example.com", plan=plan)
    codes = ",".join(str(f.code) for f in funds[:5])
    r = await c.get(f"/api/mf/scores?codes={codes}")
    assert r.status_code == 200 and r.json()["locked"] is True
    for i in r.json()["items"]:
        assert i["pillarScores"] is None and i["pillars"] is None and i["final"] is None
    assert '"pillarScores": {' not in r.text and '"pillarScores":{' not in r.text
    scr = await c.get("/api/mf/score-screener")
    assert scr.json()["locked"] is True and "pillarScores" not in scr.text
    board = await c.get(f"/api/mf/leaderboard?sub=x&plan=Direct")
    assert board.json()["locked"] is True and "pillarScores" not in board.text
