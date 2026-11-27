"""Task #259 (pack 03 Stock screener §3, SHARED §1): Macro sector (12) · Sector (22) · Industry (59), linked. Every company's sector and macro sector
come from its NSE industry (data/nse_classification.json); AND across the three levels, OR inside one; each level is a funnel step; each option's
count follows the other filters already set."""
import json

import pytest

from finlit.screener import data
from finlit.screener.data import Table, nse_levels, nse_tree
from test_auth import app, new_client  # noqa: F401
from test_integration import ingested, store  # noqa: F401


def _row(sym, macro, industry, **m):
    return {"symbol": sym, "name": sym.title(), "sector": macro, "macro_sector": macro, "industry": industry, "band": "mixed", "metrics": json.dumps({"market_cap": 1000, **m})}


ROWS = [_row("BEL", "Industrials", "Aerospace & Defense"), _row("ABB", "Industrials", "Electrical Equipment"),
        _row("SIEMENS", "Industrials", "Electrical Equipment"), _row("HDFCBANK", "Financial Services", "Banks"),
        _row("ICICIBANK", "Financial Services", "Banks"), _row("BAJFINANCE", "Financial Services", "Finance"),
        _row("TRADEX", "Services", "Trading"), _row("NOIND", "Industrials", None)]


def test_the_tree_has_nses_counts():
    tree = nse_tree()
    assert len(tree) == 59 and len({s for s, _ in tree.values()}) == 22 and len({m for _, m in tree.values()}) == 12


def test_each_company_gets_sector_and_macro_from_its_industry():
    assert nse_levels("Electrical Equipment", "Industrials") == ("Capital Goods", "Industrials")
    assert nse_levels("Banks", None) == ("Financial Services", "Financial Services")
    assert nse_levels("Trading", "Services") == ("Services", "Services")          # not in NSE's file: its macro sector's only sector
    assert nse_levels("Unknown thing", "Industrials") == (None, "Industrials")       # a macro sector with several sectors cannot be guessed


def test_and_across_levels_or_inside_one_and_funnel_steps():
    t = Table(ROWS, {}, {})
    assert t.macro[t.pos["ABB"]] == "Industrials" and t.nsector[t.pos["ABB"]] == "Capital Goods"
    assert t.macro[t.pos["NOIND"]] is None and t.nsector[t.pos["NOIND"]] is None   # no NSE industry: in no list
    names = lambda idx: sorted(t.symbols[i] for i in idx)
    assert names(t.match({}, {"macro": ["Industrials"]})) == ["ABB", "BEL", "SIEMENS"]
    assert names(t.match({}, {"macro": ["Industrials", "Financial Services"]})) == ["ABB", "BAJFINANCE", "BEL", "HDFCBANK", "ICICIBANK", "SIEMENS"]   # OR inside
    assert names(t.match({}, {"macro": ["Industrials"], "nsector": ["Capital Goods"]})) == ["ABB", "BEL", "SIEMENS"]
    assert names(t.match({}, {"macro": ["Industrials"], "industry": ["Banks"]})) == []                                                    # AND across
    assert names(t.match({}, {"nsector": ["Financial Services"], "industry": ["Banks"]})) == ["HDFCBANK", "ICICIBANK"]
    f = t.funnel({}, {"macro": ["Financial Services"], "nsector": ["Financial Services"], "industry": ["Banks"]})
    assert [(s["key"], s["after"]) for s in f] == [("macro", 3), ("nsector", 3), ("industry", 2)]
    assert dict((n, c) for n, c in t.macros) == {"Financial Services": 3, "Industrials": 3, "Services": 1}
    assert ("Capital Goods", "Industrials", 3) in t.nsectors


@pytest.fixture
def table():
    data._table = Table(ROWS, {}, {})
    yield data._table
    data.reset()


@pytest.mark.integration
async def test_catalog_lists_the_three_levels_and_counts_follow_the_other_filters(app, table):  # noqa: F811
    async with new_client(app) as anon:
        cat = (await anon.get("/api/screener/catalog")).json()
        assert {m["name"]: m["n"] for m in cat["macros"]} == {"Financial Services": 3, "Industrials": 3, "Services": 1}
        assert {"name": "Capital Goods", "macro": "Industrials", "n": 3} in cat["nseSectors"]
        assert next(x for x in cat["industries"] if x["name"] == "Banks")["nseSector"] == "Financial Services"
        q = {"cats": {"macro": ["Industrials"]}, "columns": ["market_cap"], "limit": 50, "funnel": True}
        d = (await anon.post("/api/screener/query", json=q)).json()
        assert d["total"] == 3 and [s["key"] for s in d["funnel"]] == ["macro"]
        assert d["facets"]["macro"] == {"Financial Services": 3, "Industrials": 3, "Services": 1}          # its own level left out: every macro keeps a count
        assert d["facets"]["industry"] == {"Aerospace & Defense": 1, "Electrical Equipment": 2}            # narrowed by the macro sector picked
        assert d["facets"]["nsector"] == {"Capital Goods": 3}
