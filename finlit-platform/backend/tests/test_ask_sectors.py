"""Task #349 PR 5: Sector Pulse and Sector Rotation tools for FinLit AI (finlit/ask/sectors.py; docs/ASK-AI.md "Sector Pulse and Sector Rotation").

No database and no model here: the routes answer with copies of the live site's own answers (tests/fixtures/ask_sectors, saved 23 Nov 2026 from
https://finlitventures.com as a visitor, so the Basic view: states and breadth open, the ranked stocks and leader flags locked to Silver) through a
fake gateway. What must hold: each tool reads the page's own route with `show`, as the member (the plan is the route's business; a lock is said);
the board, one group by a loose name, several matches never guessed; rotation boxes, ranks and "what happened next" from /api/rotation's
`what_next`; the Sectors view not loaded falls back to Industries and says so; sector questions are routed to these tools first; the tool list is
one fixed list for every kind of question (its new hash is recorded below, on purpose)."""

import hashlib
import re
import json
from pathlib import Path
from typing import Any, Dict

import pytest

from finlit.ask import memory, pages as P, routing as R, sectors as S, service, tools as T
from finlit.mcp.gateway import ToolError

FIX = Path(__file__).parent / "fixtures" / "ask_sectors"
load = lambda n: json.loads((FIX / n).read_text(encoding="utf-8"))   # noqa: E731


class Gw:
    def __init__(self, answers: Dict[str, Any]):
        self.answers, self.calls = answers, []

    async def json(self, path, params=None, *, method="GET", body=None, subject="That"):
        self.calls.append((path, dict(params or {})))
        a = self.answers.get((path, (params or {}).get("show"))) or self.answers.get(path)
        if isinstance(a, Exception):
            raise a
        if a is None:
            raise ToolError(f"{subject} was not found in FinLit's data.")
        return a


def live() -> Gw:
    return Gw({("/api/sectors", "industries"): load("pulse_industries.json"), ("/api/sectors", "sectors"): load("pulse_sectors.json"),
               "/api/sectors/banks": load("pulse_banks.json"), "/api/sectors/pharmaceuticals-biotechnology": load("pulse_pharma.json"),
               ("/api/rotation", "industries"): load("rotation_industries.json"), ("/api/rotation", "sectors"): load("rotation_sectors.json"),
               "/api/rotation/banks": load("rotation_banks.json")})


async def run(gw, name, args):
    r = await T.run(gw, name, args)
    assert not r["error"], r["text"]
    assert len(r["text"].encode()) <= T.RESULT_CAP + 2000
    return json.loads(r["text"])


# ------------------------------------------------------------------------------------------------------------------ 1. Sector Pulse

async def test_the_board_gives_every_groups_state_and_breadth_with_the_date():
    gw = live()
    out = await run(gw, "get_sector_pulse", {"show": "industries"})
    d = out["data"]
    assert gw.calls == [("/api/sectors", {"show": "industries"})]
    assert d["date"] == "20 Nov 2026" and d["market"] == "The Nifty 50 is 7.3% above its long-term trend." and d["counts"]["Washout"] == 18
    assert len(d["groups"]) == 38 and out["truncated"] is False
    banks = next(g for g in d["groups"] if g["slug"] == "banks")
    assert banks == {"name": "Banks", "slug": "banks", "state": "Confirmed", "aboveShort/Near/MediumTrend": "81/92/86", "vs52wHighPct": 0.0, "stocks": 36,
                     "lastThrust": "C 10 Jul 2026", "box": "Ahead and gaining"}
    assert d["stateMeanings"]["Confirmed"] == "Most stocks trending up together"
    assert "Services" in d["tooFewStocksForAReading"] and "Sector Pulse" in out["source"]
    assert any("leader flags is part of every paid plan" in n for n in out["notes"])          # the Basic view's lock, said
    sectors = (await run(live(), "get_sector_pulse", {}))["data"]                             # the default view: NSE's sectors
    assert sectors["show"] == "sectors" and {g["name"] for g in sectors["groups"]} >= {"Construction", "Information Technology"}
    assert next(g for g in sectors["groups"] if g["name"] == "Information Technology")["industries"] == ["IT - Hardware", "IT - Services", "IT - Software"]


@pytest.mark.parametrize("asked,slug", [("pharma", "pharmaceuticals-biotechnology"), ("banking", "banks"), ("Banks", "banks"), ("banks", "banks")])
async def test_one_group_by_a_loose_name(asked, slug):
    gw = live()
    d = (await run(gw, "get_sector_pulse", {"show": "industries", "slug": asked}))["data"]
    assert gw.calls[-1] == (f"/api/sectors/{slug}", {"show": "industries"})
    g = d["group"]
    assert g["slug"] == slug and g["state"] and g["date"] == "20 Nov 2026" and g["summary"]
    if slug == "banks":
        assert g["state"] == "Confirmed" and g["since"] == "11 Nov 2026" and g["breadth"] == {"shortTerm": 80.6, "nearTerm": 91.7, "mediumTerm": 86.1}
        assert g["lastThrust"] == "C on 10 Jul 2026 (92 sessions ago)" and "stocks" not in d                    # Basic: the table is Silver


async def test_several_matches_are_listed_never_guessed_and_the_sectors_view_finds_an_industry_inside():
    d = (await run(live(), "get_sector_pulse", {"show": "industries", "slug": "IT"}))["data"]
    assert d["found"] is False and {m["slug"] for m in d["matches"]} == {"it-software", "it-services"}
    d = (await run(live(), "get_sector_pulse", {"show": "industries", "slug": "auto"}))["data"]
    assert {m["name"] for m in d["matches"]} == {"Auto Components", "Automobiles"}
    hit, _ = S.pick_group(load("pulse_sectors.json")["rows"], "cement")
    assert hit["name"] == "Construction Materials"                                           # by the industry inside the sector
    assert S.pick_group(load("pulse_industries.json")["rows"], "zzz") == (None, [])


async def test_silver_sees_the_ranked_stocks_strongest_first():
    page = load("pulse_banks.json")
    page = {**page, "stocks": [{"symbol": f"B{i}", "name": f"Bank {i}", "rank_6m": 20 - i, "return_6m_pct": float(i), "peer_label": "Leader", "close": 1.0}
                               for i in range(20)], "locked": {}}
    gw = Gw({**live().answers, "/api/sectors/banks": page})
    d = (await run(gw, "get_sector_pulse", {"show": "industries", "slug": "banks"}))["data"]
    assert len(d["stocks"]) == S.STOCKS and d["stocks"][0] == {"symbol": "B19", "name": "Bank 19", "return_6m_pct": 19.0, "rank_6m": 1, "peer_label": "Leader"}


async def test_the_sectors_view_not_loaded_falls_back_to_industries_and_says_so():
    gw = live()
    gw.answers[("/api/sectors", "sectors")] = ToolError("The Sectors view is not loaded yet.")
    out = await run(gw, "get_sector_pulse", {"show": "sectors"})
    assert out["data"]["show"] == "industries" and any("Sectors view could not be read" in n for n in out["notes"])


async def test_washout_is_said_consistently_and_no_day_count_reaches_the_model():
    """Task #349 fix I: "Financial Services: Washout" beside "56.2% of its stocks above their 50-day average" read as a contradiction, and printed
    a scoring rule. A Washout group (live fixture: Cement, 68 of every 100 above the medium-term trend) is said in one consistent sentence, and
    no "N-day average" is in any Sector Pulse result the model reads."""
    board = load("pulse_industries.json")
    wash = next(r for r in board["rows"] if r.get("state_code") == "washout" and r["slug"] == "cement-cement-products")
    page = {**load("pulse_banks.json"), "name": wash["name"], "slug": wash["slug"], "state": "Washout", "state_code": "washout", "breadth": wash["breadth"],
            "summary": "Cement & Cement Products stocks have been sold broadly: 68% of them are above their 50-day average today, and no broad rebound has followed yet."}
    gw = Gw({**live().answers, f"/api/sectors/{wash['slug']}": page})
    out = await run(gw, "get_sector_pulse", {"show": "industries", "slug": "cement"})
    g = out["data"]["group"]
    assert g["summary"] == ("Cement & Cement Products was sold broadly in recent weeks (Washout), and no broad rebound has followed yet. "
                            "Today 68 of every 100 of its stocks are above their medium-term trend.")
    assert S.PLAIN_NOTE in out["notes"] and "never as a contradiction" in S.PLAIN_NOTE
    for args in ({"show": "industries"}, {"show": "sectors"}, {"show": "industries", "slug": "banks"}, {"show": "industries", "slug": "cement"}):
        r = await T.run(gw, "get_sector_pulse", args)
        body = json.loads(r["text"])
        assert not re.search(r"\b\d+-day average", json.dumps(body["data"])), args
    assert S.plain("above their 9, 20 and 50-day averages; the 200-day average") == "above their short, near and medium-term trends; the long-term trend"


async def test_a_route_that_refuses_is_said_in_plain_words():
    gw = Gw({"/api/sectors": ToolError("Sector data is not loaded yet: the nightly run has not finished.")})
    r = await T.run(gw, "get_sector_pulse", {"show": "industries"})
    assert r["error"] and "not loaded yet" in r["text"]


# ------------------------------------------------------------------------------------------------------------------ 2. Sector Rotation

async def test_rotation_gives_box_rank_and_what_happened_next():
    gw = live()
    out = await run(gw, "get_sector_rotation", {"show": "industries"})
    d = out["data"]
    assert gw.calls == [("/api/rotation", {"show": "industries"})] and d["date"] == "20 Nov 2026" and d["weekClosed"] is True
    assert len(d["groups"]) == 38 and out["truncated"] is False                                # every group fits one result
    banks = next(g for g in d["groups"] if g["slug"] == "banks")
    assert banks == {"name": "Banks", "slug": "banks", "box": "Ahead and gaining", "weeksInBox": 2, "rank": "1 of 37", "rankChange1w": 2,
                     "rankChange4w": 10, "vsAverage6mPts": 12.6, "vsAverage1mPts": 6.6, "breadth": "Broad"}
    wn = d["whatHappenedNext"]
    assert wn["from"] == "29 May 2026" and wn["to"] == "20 Nov 2026" and "what did happen, not what will" in wn["caption"]
    ag = next(b for b in wn["boxes"] if b["box"] == "Ahead and gaining")
    assert ag["timesEntered"] == 36 and ag["typicalWeeks"] == 5 and ag["wentNext"][0] == {"box": "Ahead but slowing", "times": 17}
    assert d["movedThisWeek"][0] == {"name": "Petroleum Products", "from": "Ahead and gaining", "to": "Ahead but slowing"}
    assert any("never what will" in n for n in out["notes"])


async def test_one_groups_rotation_with_what_happened_next_after_its_box():
    gw = live()
    out = await run(gw, "get_sector_rotation", {"show": "industries", "slug": "banking"})
    assert gw.calls == [("/api/rotation", {"show": "industries"}), ("/api/rotation/banks", {"show": "industries"})]
    r = out["data"]["rotation"]
    assert r["box"] == "Ahead and gaining" and r["since"] == "13 Nov 2026" and r["rank"] == "1 of 37" and r["previousBox"] == "Behind but gaining"
    assert r["lastWeeks"][-1] == {"date": "20 Nov 2026", "box": "Ahead and gaining"} and r["asOf"] == "20 Nov 2026"
    nx = out["data"]["whatHappenedNextAfterThisBox"]
    assert [b["box"] for b in nx["boxes"]] == ["Ahead and gaining"] and nx["boxes"][0]["staysEnded"] == 27
    # the box is kept with the answer's figures, so "since you last asked" can say when it changes (task #349 PR 3)
    figs = memory.extract_figures([("get_sector_rotation", {"slug": "banking"}, json.dumps(out))])
    assert figs["sector"] == {"box": "Ahead and gaining", "name": "Banks", "asOf": "20 Nov 2026"}


async def test_rotation_in_the_sectors_view():
    d = (await run(live(), "get_sector_rotation", {}))["data"]
    assert d["show"] == "sectors" and len(d["groups"]) == 19 and d["whatHappenedNext"]["boxes"]


# ------------------------------------------------------------------------------------------------------------------ 3. routing, links, the tool list

@pytest.mark.parametrize("q", ["which sectors are strong right now", "sector rotation kya hai", "banking sector breadth", "which industries are lagging"])
def test_sector_questions_go_to_the_sector_tools_first(q):
    kinds = R.classify(q)
    assert kinds == ["sectors"]
    assert "sectors and industries: FinLit first (get_sector_pulse, get_sector_rotation)" in R.note(kinds)


def test_a_named_sector_also_reads_the_sector_pages_first():
    assert R.classify("pharma sector outlook") == ["sector:pharma"]
    assert "pharma and healthcare: FinLit first (get_sector_pulse, get_sector_rotation, get_finance_framework)" in R.note(["sector:pharma"])
    assert R.classify("how is TCS doing") == [] and "sectors" not in R.classify("what is the repo rate")


def test_the_answer_links_the_sector_pages():
    assert P.page_links([("get_sector_pulse", {"slug": "pharma"}), ("get_sector_rotation", {"show": "industries"})]) == \
        [{"to": "/sectors?show=sectors", "label": "Sector Pulse"}, {"to": "/sectors/rotation?show=industries", "label": "Sector Rotation"}]
    assert T.label("get_sector_pulse", {}) == "Reading Sector Pulse" and T.label("get_sector_rotation", {}) == "Reading Sector Rotation"


# Task #349 PR 5: adding the two tools changed the tool list once (deliberately). Task #410 changed it once more (the sector tool says "on the paid plans",
# not "on Silver"). This is its hash now; it must be the same for every question.
TOOLS_SHA256 = "d852b889b7c229dcca3af66b4ba5b7d14be2879a187289138095a4979e9939c4"


def test_the_tool_list_is_one_fixed_list_with_the_sector_tools():
    d = T.definitions()
    names = [x["name"] for x in d]
    assert names.index("get_sector_pulse") == names.index("screen_by_finlit_score") + 1 and names[names.index("get_sector_pulse") + 1] == "get_sector_rotation"
    assert names[-1] == "web_search" and len(names) == len(set(names))
    assert hashlib.sha256(json.dumps(d, ensure_ascii=False, sort_keys=True).encode()).hexdigest() == TOOLS_SHA256
    assert "Sector" not in service.SYSTEM.split("FinLit's pages")[1].split("Answer every question")[0]   # the system prompt is unchanged
    assert hashlib.sha256(service.SYSTEM.encode()).hexdigest() == SYSTEM_SHA256


SYSTEM_SHA256 = "19e486143b18968f3b99e2cd2c3f65d68f616d892035d8ed84d0bfd934d6bf55"   # service.SYSTEM on origin/main before this PR
