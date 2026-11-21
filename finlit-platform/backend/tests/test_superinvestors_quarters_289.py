"""Task #289 (data step 1): each named holder's last 8 quarters are kept, so moves can be quarter on quarter, with a stake line and the price move since the
investor was first named. Until enough companies carry their quarters, the page stays on "Since a year ago"."""
import json
from datetime import date, datetime, timedelta, timezone

import pytest

from finlit import ownership_insights as oi
from finlit import superinvestors as si
from finlit import superinvestors_tracked as T
from finlit_technicals import ownership as own
from test_auth import anon, app, signed_in  # noqa: F401  (fixtures and the sign-in helper)
from test_integration import ingested, make_settings, store  # noqa: F401  (fixtures)

Q = ["Sep 2026", "Jun 2026", "Mar 2026", "Dec 2025", "Sep 2025", "Jun 2025", "Mar 2025", "Dec 2024", "Sep 2024"]


def premium(values):
    return {"shareholdingDetails": [{"label": "Non-Institutions", "children": [{"label": "Ashish Kacholia", "history": [{"period": p, "value": v} for p, v in zip(Q, values)]}]}]}


def test_the_parser_keeps_8_labelled_quarters_newest_first_and_old_readers_still_work():
    pack = own.pack_from_site({"periods": [], "series": {}}, premium([2.0, 1.5, 1.4, 1.2, 0.9, 0, 0, 0, 0]))
    h = pack["holders"][0]
    assert h[:4] == ["Ashish Kacholia", "public", 2.0, 0.9]
    assert h[4] == [[p, v] for p, v in zip(Q[:8], [2.0, 1.5, 1.4, 1.2, 0.9, 0.0, 0.0, 0.0])]
    # a holder named only last quarter is kept (it left this quarter)
    gone = own.pack_from_site({"periods": [], "series": {}}, premium([0, 1.3, 0.5, 0, 0]))
    assert gone["holders"][0][2:4] == [0.0, 0.0] and gone["holders"][0][4][1] == ["Jun 2026", 1.3]
    # a history with unlabelled gaps keeps no quarters (a year-ago figure must never pass for last quarter)
    gaps = own.pack_from_site({"periods": [], "series": {}}, {"shareholdingDetails": [{"label": "Non-Institutions", "children": [{"label": "X", "history": [{"period": "Sep 2026", "value": 2}, {}, {}, {}, {"period": "Sep 2025", "value": 1}]}]}]})
    assert gaps["holders"] == [["X", "public", 2.0, 1.0]]
    # history without quarter labels: the four items, as before
    plain = own.pack_from_site({"periods": [], "series": {}}, {"shareholdingDetails": [{"label": "Non-Institutions", "children": [{"label": "X", "history": [{"value": 2}, {}, {}, {}, {"value": 1}]}]}]})
    assert plain["holders"] == [["X", "public", 2.0, 1.0]]


def test_figures_kept_before_quarters_are_fetched_once_more_last_in_line():
    now = datetime(2026, 11, 21, tzinfo=timezone.utc)
    ok = {"as_of": "Sep 2026", "premium_state": "ok", "premium_at": now - timedelta(days=3), "premium_tried_at": now - timedelta(days=3)}
    assert oi.due_for_premium({**ok, "extra": {"holders": [["A", "public", 1, 1]]}}, "Sep 2026", now) == 3
    assert oi.due_for_premium({**ok, "extra": {"holders": [], "quarters": True}}, "Sep 2026", now) is None


def _stakes():
    rows = [{"symbol": "AAA", "as_of": "Sep 2026", "holders": [["Ashish Kacholia", "public", 2.0, 1.0, [["Sep 2026", 2.0], ["Jun 2026", 1.5], ["Mar 2026", 1.2], ["Dec 2025", 0.0]]]]},
            {"symbol": "BBB", "as_of": "Sep 2026", "holders": [["Ashish Kacholia", "public", 1.1, 1.4, [["Sep 2026", 1.1], ["Jun 2026", 1.6]]]]},
            {"symbol": "CCC", "as_of": "Sep 2026", "holders": [["Ashish Kacholia", "public", 0.0, 0.0, [["Sep 2026", 0.0], ["Jun 2026", 1.3]]]]},
            {"symbol": "DDD", "as_of": "Sep 2026", "holders": [["Ashish Kacholia", "public", 3.0, 3.0]]}]       # no quarters stored yet
    return si.stakes_by_name(rows)


def test_moves_since_last_quarter_the_stake_line_and_the_first_named_quarter():
    cfg = [{"key": "ashish-kacholia", "name": "Ashish Kacholia", "filed_names": [{"key": "ashish-kacholia", "as_filed": "Ashish Kacholia"}]}]
    uni = {s: {"mcap": 1000} for s in ("AAA", "BBB", "CCC", "DDD")}
    med = {"Large": 0, "Mid": 0, "Small": 0, "Micro": 0}
    year = T.build(cfg, _stakes(), uni, {}, med)["investors"]["ashish-kacholia"]
    assert {h["symbol"]: h["move"] for h in year["holdings"]} == {"AAA": "added", "BBB": "reduced", "DDD": "unchanged"}
    qt = T.build(cfg, _stakes(), uni, {}, med, since="quarter", first_named={("AAA", "Mar 2026"): 12.5})["investors"]["ashish-kacholia"]
    h = {x["symbol"]: x for x in qt["holdings"]}
    assert h["AAA"]["move"] == "added" and h["AAA"]["stakeThen"] == 1.5 and h["AAA"]["changePts"] == 0.5          # Jun 2026 -> Sep 2026
    assert h["BBB"]["move"] == "reduced" and h["BBB"]["stakeThen"] == 1.6
    assert h["CCC"]["move"] == "exited" and h["CCC"]["stakeThen"] == 1.3                                           # named last quarter, not now
    assert h["DDD"]["move"] == "unchanged"                                                                          # no quarters yet: no move shown
    assert h["AAA"]["quarters"] == [["Dec 2025", 0.0], ["Mar 2026", 1.2], ["Jun 2026", 1.5], ["Sep 2026", 2.0]]       # oldest first, for the line
    assert h["AAA"]["sinceFirstNamed"] == {"from": "Mar 2026", "pct": 12.5}
    assert h["DDD"]["quarters"] is None and h["DDD"]["sinceFirstNamed"] is None


def test_quarter_order_and_ends():
    assert T.period_key("Sep 2026") == (2026, 9) and T.period_key("2026-06") == (2026, 6) and T.period_key("??") == (0, 0)
    assert T.first_named_period({"Dec 2025": 1.2, "Mar 2026": 0.5, "Jun 2026": 1.1, "Sep 2026": 1.4}) == "Jun 2026"      # the unbroken run up to now
    assert si.quarter_end("Sep 2026") == date(2026, 9, 30) and si.quarter_end("Mar 2024") == date(2024, 3, 31) and si.quarter_end("x") is None


async def _seed(store, rows):
    async with store.pool.acquire() as conn:
        await conn.execute("TRUNCATE ownership_insights")
        for r in rows:
            await conn.execute("INSERT INTO companies (symbol, name) VALUES ($1, $1) ON CONFLICT DO NOTHING", r["symbol"])
            await conn.execute("INSERT INTO ownership_insights (symbol, statement, as_of, rules_version, body, extra, premium_state, premium_at) "
                               "VALUES ($1, 'consolidated', $2, 't', '{}'::jsonb, $3::jsonb, 'ok', now())", r["symbol"], r["as_of"], json.dumps({"holders": r["holders"], "quarters": True}))
        await conn.execute("DELETE FROM price_daily WHERE symbol IN ('AAA', 'BBB')")
        for s, d, c in (("AAA", date(2026, 3, 31), 100), ("AAA", date(2026, 11, 20), 125)):
            await conn.execute("INSERT INTO price_daily (symbol, day, close) VALUES ($1, $2, $3)", s, d, c)
    await store.redis.delete(si.CACHE_KEY)
    si._mem = (0.0, None)


@pytest.mark.asyncio
async def test_the_page_stays_on_a_year_until_quarters_are_stored_then_opens_on_last_quarter(app, anon):  # noqa: F811
    store = app.state.store
    gold = await signed_in(app, "goldq289@example.com", plan="gold")
    # one company in two with quarters: 50% stored, so "Since a year ago" by default; "quarter" can still be asked for
    await _seed(store, [{"symbol": "AAA", "as_of": "Sep 2026", "holders": [["Ashish Kacholia", "public", 2.0, 1.0, [["Sep 2026", 2.0], ["Jun 2026", 1.5], ["Mar 2026", 1.2], ["Dec 2025", 0.0]]]]},
                        {"symbol": "BBB", "as_of": "Sep 2026", "holders": [["Ashish Kacholia", "public", 1.1, 1.4]]}])
    t = (await gold.get("/api/superinvestors/tracked")).json()
    assert t["since"] == "year" and t["quarterReady"] is False and t["quarterAvailable"] is True and t["quarterCover"] == 50
    q = (await gold.get("/api/superinvestors/ashish-kacholia?since=quarter")).json()
    assert q["since"] == "quarter"
    aaa = next(h for h in q["holdings"] if h["symbol"] == "AAA")
    assert aaa["stakeThen"] == 1.5 and aaa["sinceFirstNamed"] == {"from": "Mar 2026", "pct": 25.0}                  # 100 at 31 Mar -> 125 now
    # every company with quarters: "Since last quarter" is the default
    await _seed(store, [{"symbol": "AAA", "as_of": "Sep 2026", "holders": [["Ashish Kacholia", "public", 2.0, 1.0, [["Sep 2026", 2.0], ["Jun 2026", 1.5]]]]},
                        {"symbol": "BBB", "as_of": "Sep 2026", "holders": [["Ashish Kacholia", "public", 1.1, 1.4, [["Sep 2026", 1.1], ["Jun 2026", 1.6]]]]}])
    t = (await gold.get("/api/superinvestors/tracked")).json()
    assert t["since"] == "quarter" and t["sinceText"] == "Since last quarter" and t["quarterReady"] is True
    assert (await gold.get("/api/superinvestors/tracked?since=year")).json()["since"] == "year"
    si._mem = (0.0, None)
