"""Task #262 (the owner's rule of 20 Nov 2026, handoff 06_Company_sizes_whole_site): four company sizes on one rule for the whole site."""
import pathlib

from finlit import sizes
from finlit.screener import ql


def test_the_pack_cases():
    cases = {9999.99: "Micro", 10000: "Small", 24999.99: "Small", 25000: "Mid", 75000: "Mid", 75000.01: "Large", None: None, 0: None, "x": None, float("nan"): None}
    assert {k: sizes.size_of(k) for k in cases} == cases
    assert sizes.SIZES == ("Large", "Mid", "Small", "Micro")


def test_every_module_reads_the_one_rule():
    from finlit.diversification import calc
    from finlit.myinvest import calc as mi
    from finlit.portfolio_page import inputs, risk_sizes
    from finlit.screener import data
    for f in (calc.size_band, mi.size_of, risk_sizes.size_of, data.size_of):
        assert [f(v) for v in (80000, 50000, 15000, 5000, None)] == ["Large", "Mid", "Small", "Micro", None], f
    assert inputs.size_code("Micro") == "X" and inputs.size_code(None) == "U"
    assert risk_sizes.SIZE_INDEX["Micro"] == ("NIFMIC250", "Nifty Microcap 250")


def test_old_small_filters_read_micro_and_keep_their_companies():
    assert sizes.migrate_small(["Small"]) == ["Micro"]
    assert sizes.migrate_small(["Large", "small cap", "Mid", "Small"]) == ["Large", "Micro", "Mid"]
    # a company the old Small held (below ₹10,000 Cr) is in the migrated filter; one of ₹15,000 Cr (old Mid, new Small) is not
    assert sizes.size_of(8000) in sizes.migrate_small(["Small"]) and sizes.size_of(15000) not in sizes.migrate_small(["Small"])
    sql = (pathlib.Path(__file__).parents[1] / "finlit" / "migrations" / "116_four_sizes.sql").read_text()
    assert '\'"Small"\'::jsonb THEN \'"Micro"\'::jsonb' in sql and "sizesMoved" in sql


def test_a_typed_size_is_its_range_and_problems_point_at_what_was_typed():
    assert ql.canonical(ql.analyze("Size = micro AND ROE > 15").root) == "Market cap < 10000 Cr AND Return on equity > 15"
    assert ql.canonical(ql.analyze("size is small cap").root) == "Market cap >= 10000 Cr AND Market cap < 25000 Cr"
    assert ql.canonical(ql.analyze("Size = Large").root) == "Market cap > 75000 Cr"
    a = ql.analyze("Size = mid AND Foo > 3")
    assert a.text == "Size = mid AND Foo > 3" and [(p.code, a.text[p.start:p.end]) for p in a.problems] == [("unknown_metric", "Foo")]


def test_the_ready_made_size_screens_include_micro_and_say_the_rule_in_rupees():
    from finlit.presets.registry import BY_ID
    for pid in ("highest-rated-micro", "basic-top-micro"):
        p = BY_ID[pid]
        assert "below ₹10,000 Cr" in " ".join(p.how_it_works) and "ranked" not in " ".join(p.how_it_works)
    assert "₹25,000–75,000 Cr" in " ".join(BY_ID["highest-rated-mid"].how_it_works) and "₹50,000" not in " ".join(BY_ID["highest-rated-large"].how_it_works)


def test_stress_lab_keeps_its_coverage_and_names_it_in_four_sizes():
    from finlit.stress import service
    assert service.LAUNCH_FLOOR_CR == 10000.0 and "large, mid and small caps" in service.NOT_SIZE


import json  # noqa: E402

import pytest  # noqa: E402

from test_auth import app, signed_in  # noqa: E402,F401
from test_integration import ingested, store  # noqa: E402,F401


@pytest.mark.integration
async def test_the_migration_moves_saved_small_to_micro_and_marks_the_screen(app):
    c = await signed_in(app, "sizes262@example.com", plan="gold")
    screens = {"screens": [{"name": "Old small", "state": {"caps": ["Large", "Small"]}, "notify": True}, {"name": "No size", "state": {"ranges": {"pe": {"max": 20}}}},
                           {"name": "Mid only", "state": {"caps": ["Mid"]}}]}
    assert (await c.put("/api/me/screens", json=screens)).status_code == 200
    sql = (pathlib.Path(__file__).parents[1] / "finlit" / "migrations" / "116_four_sizes.sql").read_text()
    async with app.state.store.pool.acquire() as conn:
        await conn.execute(sql)
        await conn.execute(sql)                                                            # a second run changes nothing
    back = (await c.get("/api/me/state")).json()["screens"]
    assert back[0]["state"]["caps"] == ["Large", "Micro"] and back[0]["sizesMoved"] == "2026-11-20" and back[0]["notify"] is True
    assert back[1].get("sizesMoved") is None and back[2]["state"]["caps"] == ["Mid"] and back[2].get("sizesMoved") is None
    assert (await c.put("/api/me/screens", json={"screens": back})).status_code == 200   # the marked screen saves back as it is
    assert json.dumps((await c.get("/api/me/state")).json()["screens"][0]).count("Micro") == 1
    await c.aclose()
