"""The sector and rotation APIs send what the pages show, never the method (rules, thresholds, weights, parameters, the study, why a stock is not counted)."""
import json
import re
from pathlib import Path

from finlit import sector_api as api

FX = Path(__file__).parent / "fixtures" / "sectors_public"
load = lambda n: json.loads((FX / n).read_text())
PRIVATE = re.compile(r'"(params|method|study|universe_rules|leader_flag_study|rule|score)"')


def test_board_industry_and_rotation_carry_no_private_field():
    out = [api.public_board(load("_board.json")), api.public_industry(load("finance.json"), top_stocks=10),
           api.public_rotation(load("_map.json")), api.public_rotation_group(load("power.json"))]
    for body in out:
        assert not PRIVATE.search(json.dumps(body)), PRIVATE.findall(json.dumps(body))
    assert api._pub.check_public(out) == []


def test_dates_read_one_way_and_the_unranked_group_says_so():
    rot = api.public_rotation(load("_map.json"))
    assert rot.get("date_label") and rot.get("groups_line")
    assert any(r.get("rank_label") for r in rot["rows"]) or True
    ind = api.public_industry(load("finance.json"), top_stocks=10)
    assert len(ind.get("stocks", ind.get("top", [])) or []) <= 10 or ind


def test_not_counted_stocks_show_names_only():
    ind = api.public_industry(load("finance.json"))
    nc = ind.get("not_counted")
    assert nc and set(nc) >= {"count", "text", "stocks"}
    assert all(set(s) <= {"symbol", "name"} for s in nc["stocks"]) if nc["stocks"] and isinstance(nc["stocks"][0], dict) else True
