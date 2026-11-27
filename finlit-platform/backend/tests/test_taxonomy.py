"""Task #192 (15 Nov sector pack, TAXONOMY.md): NSE's four levels for every company, from NSE's own lists.

The site used "sector" for several groupings: FinEdge's `sector` field holds an NSE sector for some companies and a basic industry for others
(TCS: "Computers - Software & Consulting"), and its `macro_sector` is sometimes not a macro sector at all (JPL: a basic industry; HAPPY: an
industry). Every company now gets macro sector (12) > sector (22) > industry (59) > basic industry (197), with the rule used and, for a blank
level, the reason."""
import json
import re

import httpx
import pytest

from finlit import taxonomy
from finlit.api import create_app
from test_integration import ingested, make_settings, store  # noqa: F401  (fixtures)


# ---------------------------------------------------------------- the lists, from NSE's file

def test_nse_lists_have_12_22_59_197_and_every_level_has_one_parent():
    data = json.loads(taxonomy.DATA.read_text(encoding="utf-8"))
    rows = data["basic_industries"]
    assert data["counts"] == {"macro_sector": 12, "sector": 22, "industry": 59, "basic_industry": 197}
    assert len({r["basic_industry"] for r in rows}) == 197
    for child, parent in (("industry", "sector"), ("sector", "macro_sector")):
        parents = {}
        for r in rows:
            parents.setdefault(r[child], set()).add(r[parent])
        assert all(len(p) == 1 for p in parents.values()), f"a {child} under two {parent}s"
    for r in rows:   # NSE's codes nest: IN01 > IN0101 > IN010101 > IN010101001
        assert r["basic_industry_code"].startswith(r["industry_code"]) and r["industry_code"].startswith(r["sector_code"])
        assert r["sector_code"].startswith(r["macro_sector_code"])


def test_names_are_nse_spelling_with_commas_and_no_pdf_artefacts():
    idx = taxonomy.levels_index()
    macro = {m["macro_sector"] for m in idx["macro_sectors"]}
    sectors = {s["sector"] for s in idx["sectors"]}
    assert "Diversified" in macro and "Telecommunication" in macro          # 12, not 11; the PDF wraps "Telecommunic|ation"
    assert {"Oil, Gas & Consumable Fuels", "Media, Entertainment & Publication"} <= sectors
    names = {n for r in idx["basic_industries"] for n in (r["basic_industry"], r["industry"], r["sector"], r["macro_sector"])}
    assert not [n for n in names if "  " in n or n != n.strip()]
    assert "Telecom - Cellular & Fixed line services" in names and "Diversified consumer products" in names   # words not glued together
    assert "Gas Transmission/Marketing" in names


# ---------------------------------------------------------------- placing a company

def test_tcs_gets_four_levels_from_its_basic_industry():
    c = taxonomy.classify("TCS", "Computers - Software & Consulting", "IT - Software", "Computers - Software & Consulting", "Information Technology")
    assert (c["macro_sector"], c["sector"], c["industry"], c["basic_industry"]) == (
        "Information Technology", "Information Technology", "IT - Software", "Computers - Software & Consulting")
    assert c["source"] == "basic_industry" and c["note"] is None


def test_jpl_macro_sector_is_telecommunication_not_a_basic_industry():
    c = taxonomy.classify("JPL", "Telecom - Cellular & Fixed line services", "Telecom - Services", "Telecommunication",
                          "Telecom - Cellular & Fixed line services")   # FinEdge's macro_sector field, as live on 17 Nov
    assert c["macro_sector"] == "Telecommunication" and c["sector"] == "Telecommunication" and c["industry"] == "Telecom - Services"


def test_happy_macro_sector_is_industrials_and_its_non_nse_basic_industry_is_left_out_with_the_reason():
    c = taxonomy.classify("HAPPY", "Forgings & Machined Components", "Industrial Manufacturing", "Industrials", "Auto Components")
    assert (c["macro_sector"], c["sector"], c["industry"]) == ("Industrials", "Capital Goods", "Industrial Manufacturing")
    assert c["basic_industry"] is None and "Forgings & Machined Components" in c["note"] and "197" in c["note"]


def test_spellings_without_commas_find_nse_names():
    c = taxonomy.classify("ZZZ", None, None, "Oil Gas & Consumable Fuels", None)
    assert c["sector"] == "Oil, Gas & Consumable Fuels" and c["macro_sector"] == "Energy" and c["source"] == "sector"
    assert "only the sector" in c["note"]


def test_nse_quote_page_wins_over_a_basic_industry_from_another_industry(monkeypatch):
    monkeypatch.setattr(taxonomy, "quote_pages", lambda: {"ABC": "Pharmaceuticals & Biotechnology"})
    c = taxonomy.classify("ABC", "Computers - Software & Consulting")
    assert c["industry"] == "Pharmaceuticals & Biotechnology" and c["sector"] == "Healthcare" and c["basic_industry"] is None
    assert c["source"] == "nse_quote_page" and "NSE's quote page" in c["note"]


def test_a_company_with_no_nse_name_is_not_classified_and_says_why():
    c = taxonomy.classify("DVRCO", None, "Miscellaneous", "DVR", None)
    assert all(c[level] is None for level in taxonomy.LEVELS)
    assert c["source"] is None and c["note"].startswith("Not classified:") and "DVR" in c["note"]
    assert taxonomy.classify("NONE")["note"] == "Not classified: no classification is given for this company."


def test_every_basic_industry_the_site_showed_is_placed_by_its_own_name():
    # 175 of the 176 basic industries the site's stock pages showed on 15 Nov are NSE names (sector pack, basic_industries_seen_on_site.csv)
    for name in ("Refineries & Marketing", "Private Sector Bank", "Pharmaceuticals", "Cement & Cement Products", "Edible Oil", "Aerospace & Defense"):
        c = taxonomy.classify("X", name)
        assert c["basic_industry"] == name and c["source"] == "basic_industry", name


# ---------------------------------------------------------------- stored per company, served by the API

async def test_every_company_is_placed_at_start_and_the_api_counts_each_level(ingested):  # noqa: F811
    store = ingested
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM company_classification")
    placed = await store.classify_all()
    async with store.pool.acquire() as conn:
        listed = await conn.fetchval("SELECT count(*) FROM companies")
        stored = await conn.fetchval("SELECT count(*) FROM company_classification")
    assert placed["placed"] == listed == stored and listed > 5000
    again = await store.classify_all()                        # the next start places nobody twice
    assert again["placed"] == 0

    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as api:
            r = await api.get("/api/taxonomy")
            assert r.status_code == 200
            body = r.json()
            assert body["counts"] == {"macro_sectors": 12, "sectors": 22, "industries": 59, "basic_industries": 197}
            assert body["companies"] == listed
            assert sum(m["companies"] for m in body["macro_sectors"]) + body["notClassified"]["macro_sector"] == listed
            assert body["labels"]["industry"] == "Industry"
            c = (await api.get("/api/taxonomy/company/RELIANCE")).json()   # RELIANCE has a stored report (the fixture ingests it)
            assert c["macro_sector"] == "Energy" and c["sector"] == "Oil, Gas & Consumable Fuels" and c["industry"] == "Petroleum Products"
            assert c["isin"] is None or re.match(r"^IN[A-Z0-9]{10}$", c["isin"])
            assert (await api.get("/api/taxonomy/company/NOSUCHCO")).status_code == 404


async def test_a_full_report_build_places_the_company_and_a_quote_patch_does_not(ingested):  # noqa: F811
    store = ingested
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM company_classification WHERE symbol = 'RELIANCE'")
        summary = json.loads(await conn.fetchval("SELECT body FROM snapshots WHERE symbol = 'RELIANCE' AND section = 'summary' LIMIT 1"))
    await store.save_snapshot("RELIANCE", "consolidated", {"summary": summary})                     # a quote patch: summary only, no score row
    assert await store.classification("RELIANCE") is None
    await store.save_snapshot("RELIANCE", "consolidated", {"summary": summary}, score_row={       # a full build saves its score row
        "symbol": "RELIANCE", "model": "v1", "overall": 50, "band": "fair", "name": "Reliance"})
    assert (await store.classification("RELIANCE"))["industry"] == "Petroleum Products"


async def test_a_score_only_save_places_a_new_company_but_never_replaces_a_full_report_place(ingested):  # noqa: F811
    store = ingested
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM company_classification WHERE symbol IN ('TCS', 'RELIANCE')")
    await store.save_score_only("TCS", "consolidated", {"symbol": "TCS", "model": "v1", "overall": 60, "band": "good", "name": "TCS",
                                                         "industry": "IT - Software", "sector": "Computers - Software & Consulting"})
    tcs = await store.classification("TCS")
    assert tcs["industry"] == "IT - Software" and tcs["source"] == "nse_quote_page"   # no basic industry in a score row; NSE's quote page names TCS's industry
    await store.classify_all(force=True)                       # RELIANCE from its stored report: four levels
    before = await store.classification("RELIANCE")
    await store.save_score_only("RELIANCE", "consolidated", {"symbol": "RELIANCE", "model": "v1", "overall": 50, "band": "fair", "name": "Reliance",
                                                              "industry": "Miscellaneous"})
    assert (await store.classification("RELIANCE"))["basic_industry"] == before["basic_industry"] == "Refineries & Marketing"


async def test_peer_rows_name_nse_industry_and_basic_industry_not_the_mixed_sector(ingested):  # noqa: F811
    """The peers list sent a `sector` that was mostly a basic industry ("Computers - Software & Consulting" for INFY); round 2a names both levels."""
    store = ingested
    await store.classify_all(force=True)
    [row] = await store.peer_rows(["RELIANCE"])
    assert row["industry"] == "Petroleum Products" and row["basic_industry"] == "Refineries & Marketing"
    assert "sector" not in row


async def test_many_companies_at_once_for_a_watchlist_or_portfolio(ingested):  # noqa: F811
    store = ingested
    await store.classify_all(force=True)
    app = create_app(make_settings(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as api:
            r = await api.get("/api/taxonomy/companies", params={"symbols": "reliance,NOSUCHCO,RELIANCE,bad code!"})
            assert r.status_code == 200
            got = r.json()["companies"]
            assert list(got) == ["RELIANCE"] and got["RELIANCE"]["industry"] == "Petroleum Products"   # unknown and malformed symbols left out, duplicates once
            assert (await api.get("/api/taxonomy/companies")).json() == {"companies": {}}


# ---------------------------------------------------------------- round 3: fund and ETF holdings (T7, F5, T10)

def test_fund_house_names_become_nse_industries_in_nse_spelling():
    for amfi, industry, macro in (("It - Software", "IT - Software", "Information Technology"), ("Diversified Fmcg", "Diversified FMCG", "Fast Moving Consumer Goods"),
                                  ("Agricultural Food & Other Products", "Agricultural Food & other Products", "Fast Moving Consumer Goods"),
                                  ("Non - Ferrous Metals", "Non - Ferrous Metals", "Commodities"), ("Diversified", "Diversified", "Diversified")):
        lv = taxonomy.holding_level(amfi, "INE000000000")
        assert (lv["industry"], lv["macroSector"], lv["note"]) == (industry, macro, None) and lv["sector"], amfi


def test_a_basic_industry_line_is_mapped_up_to_its_industry():
    lv = taxonomy.holding_level("Refineries & Marketing", "INE002A01018")
    assert lv["industry"] == "Petroleum Products" and lv["macroSector"] == "Energy"


def test_a_share_listed_abroad_is_labelled_so_whatever_its_name():
    for name in ("Semiconductors", "Pharmaceuticals", "Banks"):     # "Pharmaceuticals" and "Banks" are NSE names, but the ISIN is American
        lv = taxonomy.holding_level(name, "US11135F1012")
        assert lv["industry"] == lv["macroSector"] == "Listed abroad" and "outside India" in lv["note"]


def test_the_company_own_place_wins_so_fund_and_company_pages_agree():
    cls = {"industry": "Industrial Products", "macro_sector": "Industrials"}
    assert taxonomy.holding_level("Industrial Capital Goods", "INE111A01025", cls)["industry"] == "Industrial Products"
    lv = taxonomy.holding_level("Industrial Capital Goods", "INE111A01025")         # an old AMFI name, company not placed: not classified, with the name
    assert lv["industry"] == "Not classified" and "Industrial Capital Goods" in lv["note"]
    assert taxonomy.holding_level("null", "INE111A01025")["note"] == "Not classified: the fund house gives no industry for this line."


def test_a_portfolio_names_each_line_and_sums_industries_and_macro_sectors():
    from datetime import date
    from finlit.portfolios import build_portfolio_json, pack_holdings
    from finlit.disclosure_parsers.model import Holding
    hs = [Holding(name="Infosys", isin="INE009A01021", sector="It - Software", asset_class="equity", pct_nav=40.0, qty=None, value_lakh=None),
          Holding(name="TCS", isin="INE467B01029", sector="IT - Software", asset_class="equity", pct_nav=30.0, qty=None, value_lakh=None),
          Holding(name="Broadcom Inc", isin="US11135F1012", sector="Semiconductors", asset_class="equity", pct_nav=20.0, qty=None, value_lakh=None),
          Holding(name="Gilt 2033", isin="IN0020230085", sector=None, asset_class="debt", pct_nav=10.0, qty=None, value_lakh=None)]
    cur = {"holdings": pack_holdings(hs), "as_of": date(2026, 10, 31), "source": "x", "source_url": None, "notes": "[]", "net_assets_lakh": None}
    out = build_portfolio_json(cur, None, {})
    lines = {h["name"]: h for h in out["holdings"]}
    assert lines["Infosys"]["industry"] == "IT - Software" and lines["Infosys"]["amfiIndustry"] == "It - Software"
    assert lines["Broadcom Inc"]["industry"] == "Listed abroad" and lines["Gilt 2033"]["industry"] is None
    assert out["summary"]["industries"] == [{"industry": "IT - Software", "pct": 70.0}, {"industry": "Listed abroad", "pct": 20.0}]
    assert out["summary"]["macroSectors"][0] == {"macroSector": "Information Technology", "pct": 70.0}
    assert out["summary"]["sectors"][0] == {"sector": "Information Technology", "pct": 70.0}            # NSE's 22-level sector, not the fund house's name
    assert lines["Infosys"]["sector"] == "Information Technology" and lines["Broadcom Inc"]["sector"] == "Listed abroad" and lines["Gilt 2033"]["sector"] is None
