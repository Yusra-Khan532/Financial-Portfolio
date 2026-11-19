"""Task #240: FinLit AI learns the team's finance reference (FinLit_AI_Finance_Training_Parameters_and_Sources.pdf) the way the reference itself
says: knowledge retrieval (ask/knowledge.py, the tool get_finance_framework), answering rules (service.SYSTEM) and an evaluation set
(scripts/ask_eval.py)."""

import importlib.util
import json
from pathlib import Path

from finlit.ask import knowledge as KN, pages as P, service, tools as T


def test_every_family_and_sector_of_the_reference_is_there():
    for k in ("income_statement", "balance_sheet", "cash_flow", "growth", "earnings_quality", "valuation", "profitability", "liquidity_leverage",
              "efficiency", "ownership", "valuation_methods", "investment_reasoning", "portfolio", "technical", "funds", "fixed_income", "macro",
              "corporate_actions", "governance_risk"):
        assert KN.TOPICS[k]["measures"] and KN.TOPICS[k]["read"], k
    assert set(KN.SECTORS) == {"banks", "nbfc", "insurance", "amc_exchanges", "it", "fmcg", "auto", "pharma", "real_estate", "telecom_media",
                               "energy_power", "metals_chemicals", "capital_goods"}
    assert {"NIM", "CASA ratio", "GNPA and NNPA", "PCR (provision coverage)"} <= set(KN.SECTORS["banks"]["measures"])
    assert "VNB and VNB margin" in KN.SECTORS["insurance"]["measures"] and "Collection efficiency" in KN.SECTORS["nbfc"]["measures"]


def test_nse_sector_and_industry_names_find_their_family():
    cases = {"Private Sector Bank": "banks", "Banks": "banks", "Non Banking Financial Company (NBFC)": "nbfc", "Housing Finance Company": "nbfc",
             "Life Insurance": "insurance", "IT - Software": "it", "Information Technology": "it", "Pharmaceuticals": "pharma",
             "Hospital": "pharma", "Passenger Cars & Utility Vehicles": "auto", "Iron & Steel": "metals_chemicals", "Power Generation": "energy_power",
             "Refineries & Marketing": "energy_power", "Residential, Commercial Projects": "real_estate", "Telecom - Cellular & Fixed line services": "telecom_media",
             "Asset Management Company": "amc_exchanges", "Fast Moving Consumer Goods": "fmcg", "Heavy Electrical Equipment": "capital_goods",
             "Finance": "nbfc", "Financial Services": "nbfc", "Consumable Fuels": "energy_power", "Cigarettes & Tobacco Products": "fmcg",
             "Retailing": "fmcg", "Electrical Equipment": "capital_goods",
             "Aerospace & Defense": "capital_goods"}
    for name, want in cases.items():
        assert KN.sector_key(name) == want, (name, KN.sector_key(name))
    assert KN.sector_key("Something unheard of") is None


async def test_the_tool_answers_a_sector_and_a_topic_with_patterns_sources_and_checklist():
    r = await T.run(object(), "get_finance_framework", {"sector": "Private Sector Bank", "topic": "valuation"})
    assert not r["error"]
    d = json.loads(r["text"])["data"] if "data" in json.loads(r["text"]) else json.loads(r["text"])
    assert d["sector"]["family"] == "Banks" and "NIM" in d["sector"]["measures"] and "not meaningful" in d["sector"]["note"]
    assert d["topic"]["title"] == "Valuation ratios" and "never alone" in d["topic"]["read"]
    assert any("P/E" in p["question"] for p in d["answerPatterns"]) and d["sources"]["primary"][0].startswith("NSE")
    assert "Standalone and consolidated never mixed" in d["checklist"]
    menu = json.loads((await T.run(object(), "get_finance_framework", {}))["text"])
    menu = menu.get("data", menu)
    assert len(menu["topics"]) == 19 and len(menu["sectors"]) == 13
    unknown = json.loads((await T.run(object(), "get_finance_framework", {"sector": "Tulip farming"}))["text"])
    assert (unknown.get("data", unknown))["sector"]["family"] is None


def test_the_tool_is_offered_in_the_fixed_order_and_named_while_it_runs():
    names = [d["name"] for d in T.definitions()]
    assert "get_finance_framework" in names and names[-1] == "web_search"          # the cached prefix stays one fixed list
    assert T.label("get_finance_framework", {}) == "Reading FinLit's finance reference"
    assert any(t.name == "get_finance_framework" for t in P.TOOLS)


def test_the_instructions_carry_the_references_rules():
    s = service.SYSTEM
    for words in ("get_finance_framework", "sector's own measures", "Never judge a valuation ratio alone", "Never mix standalone and consolidated",
                  "Keep facts apart from estimates", "Never invent a filing", "primary (NSE, BSE, SEBI, RBI, MOSPI, AMFI, Nifty Indices"):
        assert words in s, words
    assert "Describe, never advise" in s and "haiku" not in s.lower()                 # no model names in the instructions or code


def test_the_evaluation_set_checks_what_the_reference_asks():
    spec = importlib.util.spec_from_file_location("ask_eval", Path(__file__).resolve().parents[1] / "scripts" / "ask_eval.py")
    ev = importlib.util.module_from_spec(spec); spec.loader.exec_module(ev)
    qs = [q for q, _s, _c in ev.CASES]
    assert {"What does ROCE mean?", "Is a PE of 45 expensive?", "Which ratios matter for an NBFC?", "Is ITC a value trap?"} <= set(qs)
    run = lambda q, text: [(n, h, fn(text, [])) for n, h, fn in dict((c[0], c[2]) for c in ev.CASES)[q] + ev.GLOBAL]   # noqa: E731
    good = run("Which ratios matter for an NBFC?", "For an NBFC, asset quality (GNPA, NNPA), capital adequacy, cost of funds and AUM growth matter most.")
    assert all(ok for _n, h, ok in good if h)
    bad = run("Is a PE of 45 expensive?", "Yes, a P/E of 45 is expensive, you should sell.")
    assert any(h and not ok for _n, h, ok in bad)
    trap = run("Is ITC a value trap?", "Avoid it: buy something else.")
    assert any(h and not ok for _n, h, ok in trap)
    # task #228: FinLit AI's summary of the Prism card says what it means, never the scores
    summ = next(q for q in qs if q.startswith(ev.SUMMARY))
    numbers = run(summ, "Reliance scores 58.1 out of 100 (Average). Risk 86, Valuation 35. Short term +38, long term −32.")
    assert any(n == "no scores" and not ok for n, _h, ok in numbers)
    words = run(summ, "Reliance's finances are sound: borrowing is low and cash backs its profits; the share price looks high against its earnings. "
                      "The price has risen over recent weeks while the longer trend is down.")
    assert all(ok for _n, h, ok in words if h)
