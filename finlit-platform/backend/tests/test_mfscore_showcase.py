"""Task #239: the landing page's Mutual Fund Score card reads /api/mf/score-showcase: the sample fund's newest stored score, open to every visitor,
with the four parts' figures and words, its name and its date, and nothing else of the score (no measures, no reasons, no weights). The sample fund's
own score is open to every visitor too, so the card's button leads to the same figures; every other fund stays Gold."""

import pytest

from test_auth import app, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_mfscore_upgrade import BASE, RUN, clients, seed

from finlit.mfscore import api as mfapi

pytestmark = pytest.mark.integration


async def test_the_sample_fund_is_open_to_visitors_with_card_figures_only(app, monkeypatch):
    monkeypatch.setenv("MF_LANDING_FUND", str(BASE))
    await seed(app)
    async with app.state.store.pool.acquire() as conn:
        row = dict(await conn.fetchrow("SELECT * FROM mf_scores WHERE key = $1", f"mf:{BASE}"))
    visitor = new_client(app)
    r = await visitor.get("/api/mf/score-showcase")
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "public, max-age=300"
    d = r.json()
    assert set(d) == {"code", "name", "plan", "category", "categoryLabel", "final", "label", "status", "runDate", "parts", "disclaimer"}
    assert d["code"] == BASE and d["final"] == round(float(row["final"]), 1) and d["label"] == row["label"] and d["runDate"] == RUN.isoformat()
    assert [p["key"] for p in d["parts"]] == ["performance", "risk", "cost", "quality"]
    for p, col in zip(d["parts"], ("perf", "risk", "cost", "quality")):
        assert p["points"] == round(float(row[col]), 1)
        assert p["reading"] == ("Strong" if row[col] >= 70 else "Fair" if row[col] >= 50 else "Weak")
        assert set(p) == {"key", "name", "points", "reading"}                     # no weight
    own = (await visitor.get(f"/api/mf/{BASE}/score")).json()                        # the button's page shows the same score
    assert own["locked"] is False and round(own["final"], 1) == d["final"]
    other = (await visitor.get(f"/api/mf/{BASE + 1}/score")).json()                 # every other fund stays Gold
    assert other["locked"] is True and other["final"] is None


async def test_no_sample_or_no_rated_score_says_why(app, monkeypatch):
    await seed(app)
    visitor = new_client(app)
    monkeypatch.setenv("MF_LANDING_FUND", "off")
    r = await visitor.get("/api/mf/score-showcase")
    assert r.status_code == 404 and r.json()["detail"] == "No sample fund is set."
    assert mfapi.showcase() == set()
    monkeypatch.setenv("MF_LANDING_FUND", "9999998")                                 # a scheme with no stored score
    r = await visitor.get("/api/mf/score-showcase")
    assert r.status_code == 404 and "No rated Mutual Fund Score" in r.json()["detail"] and r.headers["cache-control"] == "no-store"


def test_the_default_sample_is_parag_parikh_flexi_cap_direct_growth(monkeypatch):
    monkeypatch.delenv("MF_LANDING_FUND", raising=False)
    monkeypatch.delenv("MF_SCORE_SHOWCASE", raising=False)
    assert mfapi.landing_fund() == 122639 and mfapi.showcase() == {122639}
    monkeypatch.setenv("MF_SCORE_SHOWCASE", "120465, 118989")
    assert mfapi.showcase() == {120465, 118989, 122639}
