"""Task #283 PR D: members' saved screens, query baskets and alerts on the retired FinLit IQ, converted once to FinLit Prism (finlit/iq_retire.py),
with one notice per member, shown once."""

import json

import pytest

from finlit import alertengine as eng
from finlit import iq_retire as r
from finlit.screener import ql


# ------------------------------------------------------------------------------------------------------------------------------ the rules
def test_a_level_moves_to_the_nearest_prism_band_edge():
    assert r.edge(70) == 65 and r.edge(78) == 80 and r.edge(40) == 50 and r.edge(90) == 80 and r.edge(57) == 50 and r.edge(60) == 65
    assert r.edge(72.5) == 65 and r.edge(57.5) == 50                       # a tie goes to the lower edge
    assert r.edge(0) == 0 and r.edge(100) == 100 and r.edge(None) is None  # the ends of both scales stay


def test_a_saved_screen_on_the_retired_score_reads_finlit_prism_and_says_what_it_was():
    st = {"ranges": {"overall": {"min": 70}, "pillar_growth": {"min": 60}, "score_change": {"min": 1}, "roe": {"min": 15}},
          "bands": ["strong", "healthy", "mixed", "watch"], "sort": "overall", "dir": "desc", "cols": ["overall", "pillar_quality", "pe"]}
    new, was = r.convert_state(st)
    assert new["ranges"] == {"roe": {"min": 15}, "prism_final": {"min": 65.0, "max": None}}           # overall 70 → Prism 65 (Healthy); parts removed
    assert new["bands"] == ["strong", "healthy", "average", "weak"]                                  # Mixed → Average, Watch → Weak
    assert new["sort"] == "prism_final" and new["cols"] == ["prism_final", "pe"]
    assert "FinLit IQ 70 or more → FinLit Prism score 65 or more (Healthy)" in was
    assert any("Growth part 60 or more: removed" in w for w in was) and any("change since last quarter" in w for w in was)
    assert "FinLit IQ rating Mixed → FinLit Prism rating Average" in was and "FinLit IQ rating Watch → FinLit Prism rating Weak" in was
    assert st["ranges"]["overall"] == {"min": 70}                                                    # pure: the input is not changed
    assert r.convert_state(new) == (new, [])                                                         # a second run changes nothing more
    assert r.convert_state({"ranges": {"overall": {"min": 78}}})[0]["ranges"]["prism_final"]["min"] == 80
    assert r.convert_state({"bands": ["strong", "healthy"]}) == ({"bands": ["strong", "healthy"]}, [])   # Strong and Healthy keep their word


def test_saved_screens_retired_ready_made_screens_are_removed_and_converted_ones_are_marked():
    screens = [{"name": "IQ", "state": {"ranges": {"overall": {"min": 70}}}, "notify": True},
               {"name": "Model", "state": {"model": "modelcompound"}},
               {"name": "Cheap", "state": {"ranges": {"pe": {"max": 20}}}}]
    out, lines = r.convert_screens(screens)
    assert [s["name"] for s in out] == ["IQ", "Cheap"] and out[1] is screens[2]
    assert out[0]["notify"] is True and out[0]["converted"]["on"] == "2026-11-21" and out[0]["converted"]["text"].startswith("Converted from FinLit IQ on 21 Nov 2026")
    assert "scales differ" in out[0]["converted"]["text"] and len(lines) == 2 and "removed (it was a ready-made screen" in lines[1]
    again, more = r.convert_screens(out)
    assert again == out and more == []                                                               # idempotent
    kept, _ = r.convert_screens(screens, drop_retired_model=False)                                   # a save keeps it (PR B: it never runs)
    assert [s["name"] for s in kept] == ["IQ", "Model", "Cheap"]


def test_a_basket_query_is_rewritten_on_finlit_prism():
    q, was = r.convert_query("FinLit IQ > 70 AND ROE > 15")     # saved before PR D, "FinLit IQ" named the retired score
    assert q == "Fundamental Prism score > 65 AND Return on equity > 15" and was == ["FinLit IQ above 70 → FinLit Prism score above 65 (Healthy)"]
    assert r.convert_query("overall score >= 78")[0] == "Fundamental Prism score >= 80"
    assert r.convert_query("overall between 60 and 75")[0] == "Fundamental Prism score >= 65 AND Fundamental Prism score <= 80"
    q, was = r.convert_query("Growth score > 50 OR ROE > 20")    # a part of the retired score has no Prism twin: its condition goes
    assert q == "Return on equity > 20" and "removed" in was[0]
    assert r.convert_query("quality score > 60") == (None, ["“Quality (retired) > 60”: removed (FinLit Prism has no matching part)"])
    assert r.convert_query("ROE > 15") == ("ROE > 15", [])
    q, _ = r.convert_query("FinLit IQ > 70")
    assert r.convert_query(q) == (q, []) and ql.analyze(q, "gold").ok                                # idempotent, and it runs
    b = r.convert_basket({"query": "ROE > 15", "columns": ["overall", "pillar_growth", "pe"], "sort": {"key": "overall", "dir": "desc"}})
    assert b["columns"] == ["prism_final", "pe"] and b["sort"] == {"key": "prism_final", "dir": "desc"} and b["query"] == "ROE > 15"
    assert r.convert_basket({"query": "ROE > 15", "columns": [], "sort": None}) is None


def test_alerts_on_the_score_become_prism_alerts_and_alerts_on_its_parts_are_paused():
    a = r.convert_alert({"symbol": "TCS", "metric": "overall", "op": "above", "value": 70})
    assert a["action"] == "prism" and a["value"] == 65 and a["was"] == "alert on TCS: FinLit IQ at or above 70 → FinLit Prism score at or above 65 (Healthy)"
    assert r.convert_alert({"symbol": "TCS", "metric": "overall", "op": "above", "value": 78})["value"] == 80
    p = r.convert_alert({"symbol": "INFY", "metric": "pillar_quality", "op": "above", "value": 60})
    assert p["action"] == "pause" and "paused" in p["was"]
    assert r.convert_alert({"symbol": "INFY", "metric": "price", "op": "above", "value": 60}) is None
    assert "prism_final" in eng.METRICS and eng.METRICS["prism_final"]["tier"] == "gold"
    assert eng.allowed("gold", "prism_final") and not eng.allowed("silver", "prism_final") and eng.allowed("silver", "pe") and not eng.allowed("basic", "pe")


def test_the_notice_says_what_changed_and_never_advises():
    body = r.notice_body(["saved screen “IQ”: x", "alert on TCS: y"])
    assert body.startswith("FinLit IQ has been retired; FinLit Prism is now FinLit's only score. We changed 2 of your saved screens and alerts: "
                           "saved screen “IQ”: x; alert on TCS: y. Please check their levels.")
    assert "1 of your saved screen or alert" in r.notice_body(["a"]) and "and 5 more" in r.notice_body([str(i) for i in range(25)])
    for w in ("buy", "sell", "hold", "target", "best"):
        assert f" {w} " not in f" {body.lower()} "


def test_typing_the_retired_name_in_the_query_builder_gets_a_clear_message_and_a_prism_fix_never_a_silent_swap():
    a = ql.analyze("FinLit IQ > 70", "gold")
    assert not a.ok and ql.metrics_in(a.root) == ["overall"]                       # the levels differ: 70 on one is not 70 on the other
    (p,) = a.problems
    assert p.code == "plan_score" and "FinLit Prism is FinLit's only company score" in p.message and "FinLit IQ" not in p.message
    assert p.fixes == [{"label": "Use Prism score", "start": 0, "end": 9, "text": "Prism score"}]
    fixed = "Prism score" + "FinLit IQ > 70"[p.fixes[0]["end"]:]
    b = ql.analyze(fixed, "gold")
    assert b.ok and ql.metrics_in(b.root) == ["prism_final"]                       # one click and it runs on FinLit Prism
    assert [q.code for q in ql.analyze("Growth score > 70", "gold").problems] == ["plan_score"]          # a part: no twin, no fix
    assert ql.analyze("Growth score > 70", "gold").problems[0].fixes == []


# ------------------------------------------------------------------------------------------------------------------------------ end to end
from test_auth import app, signed_in  # noqa: E402,F401
from test_integration import ingested, store  # noqa: E402,F401


async def _prism(conn, final):
    await conn.execute("INSERT INTO prism_reports (symbol, statement, id, report, final, label, status) VALUES ('RELIANCE', 'consolidated', $1, '{}'::jsonb, $2, 'HEALTHY', 'RATED') "
                       "ON CONFLICT (symbol, statement) DO UPDATE SET final = EXCLUDED.final, generated_at = now()", "a" * 32, final)


@pytest.mark.integration
async def test_a_member_with_an_iq_screen_alert_and_label_alert_gets_prism_versions_and_one_notice_shown_once(app):
    c = await signed_in(app, "iq283d@example.com", plan="gold")
    pool = app.state.store.pool
    screens = [{"name": "IQ picks", "state": {"ranges": {"overall": {"min": 70}, "pillar_growth": {"min": 60}, "roe": {"min": 15}}, "bands": ["mixed"]}, "notify": True},
               {"name": "Old model", "state": {"model": "modelcompound"}},
               {"name": "Cheap", "state": {"ranges": {"pe": {"max": 20}}}}]
    wl = {"lists": [{"id": "core", "name": "Core", "symbols": ["RELIANCE"], "labelAlert": "laggard"}], "meta": {}}
    assert (await c.put("/api/me/watchlist", json=wl)).status_code == 200
    async with pool.acquire() as conn:
        uid = await conn.fetchval("SELECT id FROM users WHERE email = 'iq283d@example.com'")
        await conn.execute("UPDATE user_state SET screens = $2::jsonb WHERE user_id = $1", uid, json.dumps(screens))   # saved before PR D
        await conn.execute("INSERT INTO screen_state (user_id, screen_name, seen) VALUES ($1, 'IQ picks', '{}')", uid)
        await conn.execute("INSERT INTO query_baskets (user_id, name, query) VALUES ($1, 'Strong IQ', 'FinLit IQ > 78 AND ROE > 15'), ($1, 'Growth', 'Growth score > 50')", uid)
        a_iq = await conn.fetchval("INSERT INTO alerts (user_id, symbol, metric, op, value, met) VALUES ($1, 'RELIANCE', 'overall', 'above', 70, true) RETURNING id", uid)
        a_part = await conn.fetchval("INSERT INTO alerts (user_id, symbol, metric, op, value) VALUES ($1, 'RELIANCE', 'pillar_quality', 'above', 60) RETURNING id", uid)
        await conn.execute("DELETE FROM auto_alert_sent WHERE user_id = $1", uid)
    first = await r.convert_all(pool)
    assert first["failed"] == 0 and first["members"] >= 1
    second = await r.convert_all(pool)                                                         # running twice changes nothing more
    assert second["failed"] == 0
    async with pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM screen_state WHERE user_id = $1", uid) == 0      # the converted screen starts again
        assert await conn.fetchval("SELECT count(*) FROM query_baskets WHERE user_id = $1 AND name = 'Growth'", uid) == 0

    state = (await c.get("/api/me/state")).json()
    got = state["screens"]
    assert [s["name"] for s in got] == ["IQ picks", "Cheap"]
    assert got[0]["state"]["ranges"] == {"prism_final": {"min": 65.0, "max": None}, "roe": {"min": 15}} or got[0]["state"]["ranges"] == {"roe": {"min": 15}, "prism_final": {"min": 65.0, "max": None}}
    assert got[0]["state"]["bands"] == ["average"] and "Converted from FinLit IQ" in got[0]["converted"]["text"] and got[1].get("converted") is None
    assert state["watchlist"]["lists"][0]["labelAlert"] == "laggard"                            # peer labels: nothing on the retired score to convert
    assert (await c.put("/api/me/screens", json={"screens": got})).status_code == 200            # the converted screen saves back as it is
    assert (await c.get("/api/me/state")).json()["screens"][0]["converted"] == got[0]["converted"]

    baskets = {b["name"]: b for b in (await c.get("/api/screener/baskets")).json()["baskets"]}
    assert set(baskets) == {"Strong IQ"} and baskets["Strong IQ"]["query"] == "Fundamental Prism score > 80 AND Return on equity > 15"
    assert baskets["Strong IQ"]["status"] == "ok" and "scales differ" in baskets["Strong IQ"]["converted"]["text"]

    alerts = {a["id"]: a for a in (await c.get("/api/alerts")).json()["alerts"]}
    iq, part = alerts[str(a_iq)], alerts[str(a_part)]
    assert iq["metric"] == "prism_final" and iq["value"] == 65 and iq["status"] == "active" and iq["label"] == "FinLit Prism score" and iq["met"] is None
    assert "FinLit IQ at or above 70 → FinLit Prism score at or above 65 (Healthy)" in iq["converted"]["text"]
    assert part["status"] == "paused" and part["metric"] == "pillar_quality" and "no matching part" in part["pausedReason"] and part["retired"] is True
    assert (await c.patch(f"/api/alerts/{a_part}", json={"status": "active"})).json()["detail"]["status"] == "retired_metric"   # kept paused

    n = (await c.get("/api/notifications")).json()
    notices = [x for x in n["notifications"] if x["kind"] == "notice"]
    assert len(notices) == 1 and notices[0]["title"] == "FinLit IQ has been retired" and not notices[0]["read"]
    body = notices[0]["body"]
    assert body.startswith("FinLit IQ has been retired; FinLit Prism is now FinLit's only score. We changed 6 of your saved screens and alerts: ")
    for part_text in ("saved screen “IQ picks”", "saved screen “Old model”: removed", "query basket “Strong IQ”", "query basket “Growth”: removed",
                      "alert on RELIANCE: FinLit IQ at or above 70", "Quality part at or above 60: paused"):
        assert part_text in body, part_text
    assert "Please check their levels." in body
    await c.post("/api/notifications/read", json={"ids": [notices[0]["id"]]})                   # the card's "Got it": shown once
    assert not [x for x in (await c.get("/api/notifications?unread=true")).json()["notifications"] if x["kind"] == "notice"]
    await r.convert_all(pool)
    assert len([x for x in (await c.get("/api/notifications")).json()["notifications"] if x["kind"] == "notice"]) == 1   # never a second notice

    # the converted alert works: it learns its side first, then fires when the FinLit Prism score crosses 65
    async with pool.acquire() as conn:
        await _prism(conn, 60.0)
    await eng.evaluate(pool, app.state.mailer, "http://test", "daily")
    async with pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM notifications WHERE alert_id = $1", a_iq) == 0
        await conn.execute("UPDATE alerts SET last_fired_at = NULL WHERE id = $1", a_iq)
        await _prism(conn, 71.0)
    await eng.evaluate(pool, app.state.mailer, "http://test", "daily")
    async with pool.acquire() as conn:
        title = await conn.fetchval("SELECT title FROM notifications WHERE alert_id = $1", a_iq)
        assert title and "FinLit Prism score is now 71" in title
        assert await conn.fetchval("SELECT count(*) FROM notifications WHERE alert_id = $1", a_part) == 0          # a paused alert never fires
    await c.aclose()


@pytest.mark.integration
async def test_the_conversion_runs_at_start_once_and_records_that_it_ran(app):
    pool = app.state.store.pool
    async with pool.acquire() as conn:
        assert await conn.fetchval("SELECT 1 FROM schema_migrations WHERE version = $1", r.VERSION) == 1     # Store.migrate ran it
        await conn.execute("DELETE FROM schema_migrations WHERE version = $1", r.VERSION)
    assert (await r.run_once(pool, set())) is not None
    async with pool.acquire() as conn:
        assert await conn.fetchval("SELECT 1 FROM schema_migrations WHERE version = $1", r.VERSION) == 1
    assert await r.run_once(pool, set()) is None                    # recorded: not again
    assert await r.run_once(pool, {r.VERSION}) is None


@pytest.mark.integration
async def test_a_browser_holding_an_old_screen_saves_it_on_finlit_prism(app):
    c = await signed_in(app, "iq283d-put@example.com", plan="gold")
    old = {"screens": [{"name": "Old copy", "state": {"ranges": {"overall": {"min": 78}, "pillar_balance": {"min": 50}}}}]}
    assert (await c.put("/api/me/screens", json=old)).status_code == 200
    s = (await c.get("/api/me/state")).json()["screens"][0]
    assert s["state"]["ranges"] == {"prism_final": {"min": 80.0, "max": None}} and "Converted from FinLit IQ" in s["converted"]["text"]
    await c.aclose()
