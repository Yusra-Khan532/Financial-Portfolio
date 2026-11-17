"""Task #193 (results calendar pack, 15 Nov): the calendar and the day's list read ONE source, so their counts match for every day, and "Coming up" lists
every company the calendar shows as due.

Bug 1 (START-HERE): 14 Nov showed "694 declared" in the calendar but "687 companies declared" in the list; on 17 Nov the calendar said 3 and the list 2. The
calendar counted every results filing (/api/feed: press releases, clarifications, presentations); the list counts companies (/api/results/quarter).
Bug 2: "Coming up this week" left out MUTHOOTMF (board meeting 19 Nov, figures already in, so not "due") although the calendar showed it."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from finlit import results as R
from test_auth import app, new_client, signed_in  # noqa: F401  (fixtures + helpers)
from test_integration import ingested, make_settings, store  # noqa: F401
from test_results import FIG, seeded  # noqa: F401

D = date
E = D(2026, 9, 30)
TODAY = D(2026, 11, 17)


def row(sym, when, mcap=100.0, m=None, name=None, today=TODAY):
    return R.build_row(sym, R.Decl(when, True, name), {"name": name or sym.title(), "sector": "IT", "market_cap": mcap}, m or {}, E, today, "Small", [])


def entry(rows):
    return R.Entry(quarter=R.quarter_info(E), rows=rows, sectors=[])


def decls_of(rows):
    return {"2026-09": {r["symbol"]: R.Decl(D.fromisoformat(r["date"]), True) for r in rows}}


def test_one_quarter_rule_for_the_list_and_the_calendar():
    d = {"2026-09": {"A": R.Decl(D(2026, 10, 14), True), "B": R.Decl(D(2026, 10, 14), True)}, "2026-06": {"C": R.Decl(D(2026, 10, 14), True)}}
    assert R.majority_quarter(d, D(2026, 10, 14), D(2026, 10, 14)) == "2026-09"
    assert R.majority_quarter(d, D(2026, 10, 15), D(2026, 10, 15)) is None
    tie = {"2026-09": {"A": R.Decl(D(2026, 10, 1), True)}, "2026-06": {"C": R.Decl(D(2026, 10, 1), True)}}
    assert R.majority_quarter(tie, D(2026, 10, 1), D(2026, 10, 1)) == "2026-09"   # a tie goes to the later quarter, as the list always did


def test_each_calendar_day_counts_the_companies_its_list_shows():
    rows = [row("PROPEQUITY", D(2026, 11, 17), 50.0, FIG), row("545007", D(2026, 11, 17), 169.0, name="Core4 Engineers Ltd"), row("530267", D(2026, 11, 17), 18.0, name="Arigato Universe Ltd"),
            row("ASHOKLEY", D(2026, 11, 14), 90000.0, FIG), row("KAYNES", D(2026, 11, 14), 30000.0, FIG), row("MBAPL", D(2026, 11, 14), 2000.0, FIG), row("PATANJALI", D(2026, 11, 14), 60000.0),
            row("MUTHOOTMF", D(2026, 11, 19), 2500.0, FIG), row("ANTGRAPHIC", D(2026, 11, 19), 11.0)]
    days = {x["date"]: x for x in R.calendar_days(decls_of(rows), {"2026-09": entry(rows)}, D(2026, 11, 1), D(2026, 11, 30), TODAY)}
    for iso, x in days.items():                       # the list for that day: the same rows, the same count
        listed = R.select(rows, date_from=iso, date_to=iso, today=TODAY.isoformat())
        assert x["n"] == len(listed)
    assert days["2026-11-17"]["n"] == 3 and not days["2026-11-17"]["due"]
    assert days["2026-11-14"]["names"] == ["ASHOKLEY", "PATANJALI", "KAYNES"]                 # the three biggest by market value
    assert days["2026-11-17"]["names"] == ["Core4 Engineers Ltd", "PROPEQUITY", "Arigato Universe Ltd"]   # a BSE-only company is named, not shown as a number
    assert days["2026-11-19"]["due"] and days["2026-11-19"]["n"] == 2                           # MUTHOOTMF counts although its figures are in
    mine = R.calendar_days(decls_of(rows), {"2026-09": entry(rows)}, D(2026, 11, 1), D(2026, 11, 30), TODAY, symbols={"KAYNES"})
    assert [(x["date"], x["n"]) for x in mine] == [("2026-11-14", 1)]                           # "Only my watchlist"


def test_upcoming_lists_every_company_the_calendar_shows_as_due():
    rows = [row("MUTHOOTMF", D(2026, 11, 19), 2500.0, FIG), row("ANTGRAPHIC", D(2026, 11, 19), 11.0), row("BLSPOLY", D(2026, 11, 18), 1717.0), row("SANDHAR", D(2026, 11, 16), 3000.0, FIG)]
    due = R.select(rows, status="due", date_from="2026-11-18", date_to="2026-11-24", today=TODAY.isoformat())
    assert {r["symbol"] for r in due} == {"ANTGRAPHIC", "BLSPOLY"}                               # the old rule: MUTHOOTMF was left out
    up = R.select(rows, status="upcoming", date_from="2026-11-18", date_to="2026-11-24", today=TODAY.isoformat())
    cal = R.calendar_days(decls_of(rows), {"2026-09": entry(rows)}, D(2026, 11, 18), D(2026, 11, 24), TODAY)
    assert {r["symbol"] for r in up} == {"MUTHOOTMF", "ANTGRAPHIC", "BLSPOLY"} and len(up) == sum(x["n"] for x in cal if x["due"])


@pytest.mark.integration
async def test_calendar_endpoint_matches_the_list_and_is_open_to_every_plan(app, seeded):  # noqa: F811
    today = R.today_ist()
    when = seeded["when"]
    lo, hi = when - timedelta(days=10), when + timedelta(days=10)
    async with new_client(app) as anon:
        r = await anon.get(f"/api/results/calendar?from={lo.isoformat()}&to={hi.isoformat()}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["days"] and all(not x["due"] for x in body["days"] if x["date"] <= today.isoformat())
        for x in body["days"]:
            if x["date"] <= today.isoformat():
                listed = (await anon.get(f"/api/results/quarter?date={x['date']}&limit=1")).json()
                assert listed["total"] == x["n"], x["date"]                   # calendar and list counts match for every day
        assert (await anon.get(f"/api/results/calendar?from={lo.isoformat()}&to={(lo + timedelta(days=200)).isoformat()}")).status_code == 400
        assert (await anon.get(f"/api/results/calendar?from={lo.isoformat()}&to={hi.isoformat()}&scope=watchlist")).status_code == 401
        later = (await anon.get(f"/api/results/calendar?from={(today + timedelta(days=380)).isoformat()}&to={(today + timedelta(days=420)).isoformat()}")).json()
        assert all(x["due"] for x in later["days"])                           # dates still to come are allowed and marked due
        up = await anon.get(f"/api/results/quarter?from={(today + timedelta(days=1)).isoformat()}&to={(today + timedelta(days=7)).isoformat()}&status=upcoming")
        assert up.status_code == 200, up.text
    silver = await signed_in(app, "res-cal@example.com", plan="silver")
    await silver.put("/api/me/watchlist", json={"lists": [{"id": "a1", "name": "Mine", "symbols": ["NOSCORE"]}], "meta": {}})
    mine = (await silver.get(f"/api/results/calendar?from={lo.isoformat()}&to={hi.isoformat()}&scope=watchlist")).json()
    assert sum(x["n"] for x in mine["days"]) == 1
