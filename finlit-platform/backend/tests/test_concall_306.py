"""Task #306 (Concall Monitor, compact layout): "Show more" pages through every call (offset, never a limit above the cap of 60), the toolbar's Has,
Quarter and Type filters work over all the calls on the server, every dropdown's counts are worked out with the other filters applied, Sort, the day
counts for the day headings, and the Portfolio / Watchlist tags (finlit/concall/api.py)."""
import json

import pytest

from finlit.concall import api as A


def _c(sym, d, t="16:00", *, up=False, audio=False, tr=False, ppt=False, q="Q2 FY27", kind="Earnings call", name=None):
    return {"id": f"{sym}|{d}", "symbol": sym, "name": name or f"{sym} Ltd", "date": d, "time": t, "upcoming": up, "quarter": q, "kind": kind,
            "sortKey": f"{d} {t}", "listen": {"audio": "https://x/a.mp3"} if audio else {"why": "No recording link filed with the exchange for this call."},
            "transcript": {"doc": {"link": f"https://x/{sym}_tr.pdf"}} if tr else {"why": "Not filed yet."},
            "ppt": {"doc": {"link": f"https://x/{sym}_ppt.pdf"}} if ppt else {"why": "No investor presentation filed with this call."},
            "summary": {"link": f"https://x/{sym}.pdf", "source": "transcript"} if (tr or ppt) else {"why": "Neither is filed yet."}}


CARDS = [_c("AAA", "2026-11-20", audio=True, ppt=True), _c("BBB", "2026-11-20", "12:00", tr=True, q=None),
         _c("CCC", "2026-11-19", audio=True, tr=True, ppt=True, kind="Investor call"), _c("DDD", "2026-11-18")]


def test_has_quarter_and_type_filter_every_call():
    assert [c["symbol"] for c in CARDS if A.passes(c, has=["listen"])] == ["AAA", "CCC"]
    assert [c["symbol"] for c in CARDS if A.passes(c, has=["listen", "transcript"])] == ["CCC"]
    assert [c["symbol"] for c in CARDS if A.passes(c, has=["summary"])] == ["AAA", "BBB", "CCC"]           # a transcript or a presentation to write from
    assert [c["symbol"] for c in CARDS if A.passes(c, quarter="none")] == ["BBB"]                         # "Not stated in the filing"
    assert [c["symbol"] for c in CARDS if A.passes(c, kind="Investor call")] == ["CCC"]


def test_each_dropdown_counts_with_the_other_filters_applied():
    f = A.facets(CARDS, has=["listen"], quarter="", kind="", syms=None, lists={"portfolio": {"AAA"}, "watchlist": {"BBB", "CCC"}})
    assert f["scope"] == {"all": 2, "portfolio": 1, "watchlist": 1}                  # calls with a recording, in each list
    assert f["has"] == {"listen": 2, "transcript": 1, "ppt": 2, "summary": 2}       # each switch counts the calls it would leave
    assert {x["v"]: x["n"] for x in f["quarter"]} == {"Q2 FY27": 2, "none": 0} and f["quarter"][-1]["v"] == "none"
    assert [A._quarter_order(q)[:3] for q in ("Q2 FY27", "Q1 FY27", "Q4 FY26")] == sorted(A._quarter_order(q)[:3] for q in ("Q4 FY26", "Q2 FY27", "Q1 FY27"))
    assert {x["v"]: x["n"] for x in f["kind"]} == {"Earnings call": 1, "Investor call": 1}
    assert A.facets(CARDS, has=[], quarter="", kind="", syms=None, lists=None)["scope"]["portfolio"] is None    # a visitor: no lists


def test_sort_newest_oldest_and_company():
    assert [c["symbol"] for c in A.sort_cards(CARDS, "latest", "new")] == ["AAA", "BBB", "CCC", "DDD"]
    assert [c["symbol"] for c in A.sort_cards(CARDS, "latest", "old")] == ["DDD", "CCC", "BBB", "AAA"]
    assert [c["symbol"] for c in A.sort_cards(CARDS, "latest", "az")] == ["AAA", "BBB", "CCC", "DDD"]
    assert [c["symbol"] for c in A.sort_cards(CARDS, "upcoming", "new")] == ["DDD", "CCC", "BBB", "AAA"]    # upcoming: the soonest first


# ------------------------------------------------------------------------------------------------ the API (database)
from test_auth import app, new_client, signed_in  # noqa: E402,F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: E402,F401  (fixtures)

MANY = [_c(f"S{i:03d}", f"2026-11-{20 - i // 10:02d}", f"{10 + i % 8}:00", audio=i % 3 == 0, tr=i % 5 == 0, ppt=i % 2 == 0,
           q=None if i % 4 == 0 else "Q2 FY27", kind="Investor call" if i % 7 == 0 else "Earnings call") for i in range(95)]


async def _put(app, cards):
    await app.state.store.redis.set(A.CACHE_KEY, json.dumps({"cards": cards, "readAt": "2026-11-21T20:00:00+00:00"}), ex=300)


@pytest.mark.integration
async def test_show_more_pages_through_every_call_and_never_asks_past_the_cap(app):
    await _put(app, MANY)
    c = new_client(app)
    assert (await c.get("/api/concalls", params={"limit": 90})).status_code == 422             # the cap stays at 60: paging, not one heavy answer
    seen = []
    for off in range(0, 95, 30):                                                                 # Show more: the next 30, appended
        r = (await c.get("/api/concalls", params={"limit": 30, "offset": off})).json()
        assert r["total"] == 95 and r["offset"] == off
        seen += [x["id"] for x in r["items"]]
    assert len(seen) == 95 and len(set(seen)) == 95                                              # every call reachable, none twice
    r = (await c.get("/api/concalls")).json()
    assert r["days"]["2026-11-20"] == 10 and sum(r["days"].values()) == 95                       # the day headings' counts, over all the calls
    assert r["have"] == {"listen": 32, "transcript": 19, "ppt": 48, "summary": 57}
    assert all(x["mine"] is None for x in r["items"]) and r["facets"]["scope"]["portfolio"] is None


@pytest.mark.integration
async def test_filters_and_sort_run_over_all_the_calls_and_members_see_their_tags(app):
    await _put(app, MANY)
    c = new_client(app)
    r = (await c.get("/api/concalls", params={"has": "listen,transcript", "limit": 60})).json()
    want = [x for x in MANY if x["listen"].get("audio") and x["transcript"].get("doc")]
    assert r["total"] == len(want) and {x["id"] for x in r["items"]} == {x["id"] for x in want}
    assert r["filters"]["has"] == ["listen", "transcript"]
    q = (await c.get("/api/concalls", params={"quarter": "none", "kind": "Investor call"})).json()
    assert q["total"] == sum(1 for x in MANY if x["quarter"] is None and x["kind"] == "Investor call")
    assert (await c.get("/api/concalls", params={"has": "bogus"})).json()["total"] == 95           # an unknown switch is ignored
    az = (await c.get("/api/concalls", params={"sort": "az", "limit": 3})).json()["items"]
    assert [x["symbol"] for x in az] == ["S000", "S001", "S002"]
    old = (await c.get("/api/concalls", params={"sort": "old", "limit": 1})).json()["items"]
    assert old[0]["date"] == "2026-11-11"
    m = await signed_in(app, "cc306@example.com", plan="silver")
    async with app.state.store.pool.acquire() as conn:
        uid = await conn.fetchval("SELECT id FROM users WHERE lower(email) = 'cc306@example.com'")
        await conn.execute("INSERT INTO user_state (user_id, watchlist, portfolio) VALUES ($1, $2::jsonb, $3::jsonb) ON CONFLICT (user_id) DO UPDATE SET "
                           "watchlist = EXCLUDED.watchlist, portfolio = EXCLUDED.portfolio", uid,
                           json.dumps({"lists": [{"id": "w", "name": "Mine", "symbols": ["S001", "S000"]}]}), json.dumps({"holdings": [{"symbol": "S000"}]}))
    await _put(app, MANY)
    r = (await m.get("/api/concalls", params={"limit": 3, "sort": "az"})).json()
    assert {x["symbol"]: x["mine"] for x in r["items"]} == {"S000": "portfolio", "S001": "watchlist", "S002": None}   # portfolio first
    assert r["facets"]["scope"] == {"all": 95, "portfolio": 1, "watchlist": 2}
    w = (await m.get("/api/concalls", params={"scope": "watchlist"})).json()
    assert {x["symbol"] for x in w["items"]} == {"S000", "S001"} and w["total"] == 2
