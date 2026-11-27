"""Developer file 37 (23 Nov 2026): the MF portfolio's add box typed "quant" listed quant PSU, BFSI, Gilt, Teck ... and never quant Small Cap.
Cause: every quant fund matches "quant" alike and the tie went to the shorter name; the box asked for 60 scheme rows (about 15 funds) and showed 8.
Now equal matches put the larger fund first (fund size, all plans together), and GET /api/mf/search gives one row per fund with how many match.
Sample fund names and sizes (not AMFI's figures)."""
from datetime import date

import pytest

from finlit import mf
from test_mf import api, loaded, needs_db, store  # noqa: F401 - pytest fixtures of the fund tests

# twelve sample funds of one house, each with four plans and options, sizes in crore (samples); the names keep AMFI's mixed "quant" / "Quant"
QUANT = [("quant PSU Fund", "Equity Scheme - Sectoral/ Thematic", 1000), ("quant BFSI Fund", "Equity Scheme - Sectoral/ Thematic", 600),
         ("quant Gilt Fund", "Debt Scheme - Gilt Fund", 150), ("quant Teck Fund", "Equity Scheme - Sectoral/ Thematic", 400),
         ("Quant Value Fund", "Equity Scheme - Value Fund", 1700), ("quant Liquid Fund", "Debt Scheme - Liquid Fund", 1600),
         ("Quant Focused Fund", "Equity Scheme - Focused Fund", 1000), ("quant Small Cap Fund", "Equity Scheme - Small Cap Fund", 29000),
         ("quant Mid Cap Fund", "Equity Scheme - Mid Cap Fund", 8000), ("quant Flexi Cap Fund", "Equity Scheme - Flexi Cap Fund", 6800),
         ("quant ELSS Tax Saver Fund", "Equity Scheme - ELSS", 11000), ("quant Large Cap Fund", "Equity Scheme - Large Cap Fund", 2600)]
VARIANTS = [("Direct", "Growth"), ("Regular", "Growth"), ("Direct", "IDCW"), ("Regular", "IDCW")]
HOUSE = "quant Mutual Fund"


def rows(with_size=True):
    out = []
    for i, (name, _cat, crore) in enumerate(QUANT):
        for j, _v in enumerate(VARIANTS):
            out.append((900000 + i * 10 + j, name, HOUSE) + ((crore * 100,) if with_size else ()))
    return out


def funds_in(codes):
    """The funds in the order their codes come, each once."""
    seen = []
    for c in codes:
        n = QUANT[(c - 900000) // 10][0]
        if n not in seen:
            seen.append(n)
    return seen


def test_the_cause_without_sizes_the_shorter_name_wins_and_small_cap_is_not_in_the_first_eight():
    got = funds_in(mf.SearchIndex(rows(with_size=False)).search("quant"))
    assert got[:4] == ["quant PSU Fund", "quant BFSI Fund", "quant Gilt Fund", "quant Teck Fund"]          # as the founder's screenshot of 23 Nov
    assert "quant Small Cap Fund" not in got[:8]


def test_equal_matches_put_the_larger_fund_first_and_keep_each_funds_plans_together():
    codes = mf.SearchIndex(rows()).search("quant")
    assert funds_in(codes) == ["quant Small Cap Fund", "quant ELSS Tax Saver Fund", "quant Mid Cap Fund", "quant Flexi Cap Fund", "quant Large Cap Fund",
                               "Quant Value Fund", "quant Liquid Fund", "quant PSU Fund", "Quant Focused Fund", "quant BFSI Fund", "quant Teck Fund", "quant Gilt Fund"]
    # same size (1000): the shorter name first, as before; the four plans and options of each fund sit together
    assert [QUANT[(c - 900000) // 10][0] for c in codes[:4]] == ["quant Small Cap Fund"] * 4


def test_a_better_match_still_beats_a_larger_fund():
    idx = mf.SearchIndex(rows())
    assert funds_in(idx.search("quant small"))[0] == "quant Small Cap Fund"
    assert funds_in(idx.search("quant psu"))[0] == "quant PSU Fund"                 # 1,000 Cr, but the only one named PSU
    assert funds_in(idx.search("quant gilt"))[0] == "quant Gilt Fund"
    assert funds_in(idx.search("quant smallcap"))[0] == "quant Small Cap Fund"     # spaces ignored, as before


def test_rows_without_a_size_still_work_and_a_fund_with_no_size_comes_after_those_with_one():
    r = rows()
    r = [x if QUANT[(x[0] - 900000) // 10][0] != "quant Small Cap Fund" else x[:3] + (None,) for x in r]
    assert funds_in(mf.SearchIndex(r).search("quant"))[-1] == "quant Small Cap Fund"
    assert mf.SearchIndex([(1, "Axis Liquid Fund", "Axis Mutual Fund")]).search("axis") == [1]   # three columns, as the older callers give


def test_fund_groups_gives_one_row_per_fund_in_search_order():
    def row(code, name, plan, option, lakh):
        return {"code": code, "name": name, "amc": HOUSE, "category": "Equity Scheme - Small Cap Fund", "plan": plan, "option_label": option, "active": True,
                "nav_date": date(2026, 11, 21), "aum_lakh": lakh, "aum_asof": date(2026, 9, 30)}
    got = mf.fund_groups([row(1, "quant Small Cap Fund", "Direct", "Growth", 2_900_000), row(2, "quant Small Cap Fund ", "Regular", "Growth", 2_900_000),
                          row(3, "Quant Value Fund", "Direct", "Growth", None), row(4, "QUANT small cap fund", "Direct", "IDCW", 2_900_000)])
    assert [g["name"] for g in got] == ["quant Small Cap Fund", "Quant Value Fund"]
    assert [v["code"] for v in got[0]["variants"]] == [1, 2, 4]                    # case and spaces ignored, as the box groups them
    assert got[0]["aum"] == 29000.0 and got[0]["aumAsOf"] == "2026-09-30" and got[1]["aum"] is None
    assert got[0]["variants"][0] == {"code": 1, "name": "quant Small Cap Fund", "amc": HOUSE, "category": "Equity Scheme - Small Cap Fund", "plan": "Direct",
                                     "option": "Growth", "active": True, "navDate": "2026-11-21"}


async def _add_quant(store, stopped=()):
    async with store.pool.acquire() as conn:
        for i, (name, cat, crore) in enumerate(QUANT):
            for j, (plan, opt) in enumerate(VARIANTS):
                code = 900000 + i * 10 + j
                await conn.execute(
                    "INSERT INTO mf_schemes (code, name, isin, amc, scheme_type, category, plan, option_class, option_label, family, nav, nav_date, active, aum_lakh, aum_asof) "
                    "VALUES ($1, $2, $3, $4, 'Open Ended', $5, $6, $7, $8, $9, 100, '2026-10-20', $10, $11, '2026-09-30')",
                    code, name, f"INF966L01{code % 1000:03d}", HOUSE, cat, plan, opt, opt, f"{HOUSE}|{cat}|{name}", code not in stopped, crore * 100)
    mf._index_cache["index"] = None                                         # the in-memory index is rebuilt on the next search


@needs_db
async def test_the_search_answers_one_row_per_fund_with_how_many_match(api, loaded):  # noqa: F811
    await _add_quant(loaded, stopped={900070, 900071, 900072, 900073})          # quant Small Cap Fund's four schemes stopped publishing NAVs
    got = (await api.get("/api/mf/search?q=quant")).json()
    names = [f["name"] for f in got["items"]]
    assert got["total"] == 11 and len(names) == 11 and "quant Small Cap Fund" not in names     # stopped schemes are left out, as in the list
    async for k in loaded.redis.scan_iter("mf:*"):
        await loaded.redis.delete(k)
    async with loaded.pool.acquire() as conn:
        await conn.execute("UPDATE mf_schemes SET active = true WHERE code >= 900000")
    got = (await api.get("/api/mf/search?q=quant")).json()
    assert got["total"] == 12 and got["items"][0]["name"] == "quant Small Cap Fund" and len(got["items"][0]["variants"]) == 4
    assert got["items"][0]["aum"] == 29000.0 and got["items"][0]["category"] == "Equity Scheme - Small Cap Fund"
    few = (await api.get("/api/mf/search?q=quant&limit=5")).json()
    assert few["total"] == 12 and [f["name"] for f in few["items"]] == ["quant Small Cap Fund", "quant ELSS Tax Saver Fund", "quant Mid Cap Fund", "quant Flexi Cap Fund", "quant Large Cap Fund"]


@needs_db
async def test_the_search_finds_by_isin_says_nothing_for_one_letter_and_checks_its_limit(api, loaded):  # noqa: F811
    await _add_quant(loaded)
    got = (await api.get("/api/mf/search?q=INF966L01070")).json()                # Small Cap, Direct Growth
    assert got["total"] == 1 and got["items"][0]["name"] == "quant Small Cap Fund" and [v["code"] for v in got["items"][0]["variants"]] == [900070]
    assert (await api.get("/api/mf/search?q=q")).json() == {"q": "q", "total": 0, "items": []}
    assert (await api.get("/api/mf/search?q=zzzzqqqq")).json()["total"] == 0
    assert (await api.get("/api/mf/search?q=quant&limit=51")).status_code == 422
    assert (await api.get("/api/mf/search?q=" + "x" * 81)).status_code == 422


@needs_db
async def test_the_mutual_funds_list_search_puts_the_larger_fund_first_too(api, loaded):  # noqa: F811
    await _add_quant(loaded)
    got = (await api.get("/api/mf?q=quant&option=All&size=8")).json()
    assert got["total"] == 48 and {i["name"] for i in got["items"][:4]} == {"quant Small Cap Fund"}
