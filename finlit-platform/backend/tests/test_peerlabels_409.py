"""Task #409 (peer label fix pack, 27 Nov 2026): one weekly record, one rule (next_label) applied when a run writes its rows, every reader on the record.

The pack's acceptance checks A1 to A6 and A9 (check_peer_labels.py) run here against the API on a local database, on stocks built to go through every
branch of the rule; A7 (industry pages) and A8 (Advanced screener) are checked on the functions that put the record's label on those answers."""
from __future__ import annotations

import json as _json
from datetime import date, timedelta

import httpx
import pytest

from finlit import labelalerts, leadership_api
from finlit import peerlabels as P
from finlit.api import create_app
from finlit.presets import sectorread
from test_integration import make_settings, store  # noqa: F401  (fixtures)

F = date(2026, 1, 2)                       # a Friday
WEEKS = [F + timedelta(days=7 * i) for i in range(12)]


# ------------------------------------------------------------------------------------------------------------- the rule (pure)
def prev(label, reading, since=F, unranked=0):
    return P.Prev(label, reading, since, unranked)


def test_first_run_is_the_label_and_not_a_change():
    assert P.next_label(None, "leader", F) == ("leader", F, None, False)


def test_one_new_reading_is_pending_and_the_second_changes_the_label_in_that_run():
    w1, w2 = F + timedelta(days=7), F + timedelta(days=14)
    assert P.next_label(prev("laggard", "laggard"), "in_line", w1) == ("laggard", F, "in_line", False)          # pending
    assert P.next_label(prev("laggard", "in_line"), "in_line", w2) == ("in_line", w2, None, True)               # two runs agree: changed now
    # RELIANCE (27 Nov 2026): In line on 6, 13 and 20 Nov and still Laggard "if next week agrees" -- impossible under the rule


def test_a_reading_that_confirms_the_label_clears_a_pending_one():
    assert P.next_label(prev("leader", "in_line"), "leader", F + timedelta(days=7)) == ("leader", F, None, False)


def test_a_new_reading_that_differs_from_the_last_reading_starts_over():
    assert P.next_label(prev("leader", "in_line"), "laggard", F + timedelta(days=7)) == ("leader", F, "laggard", False)


def test_no_rank_keeps_the_label_for_two_runs_then_no_label():
    w = F + timedelta(days=21)
    assert P.next_label(prev("leader", "leader", unranked=0), "none", w) == ("leader", F, None, False)
    assert P.next_label(prev("leader", "none", unranked=1), "none", w) == ("leader", F, None, False)
    assert P.next_label(prev("leader", "none", unranked=2), "none", w) == ("none", w, None, True)
    assert P.next_label(prev("none", "none", since=w, unranked=3), "none", w + timedelta(days=7)) == ("none", w, None, False)
    assert P.next_label(prev("leader", "none", unranked=1), "none", w, hold_unranked=1) == ("none", w, None, True)   # the hold is a setting


def test_a_week_without_a_rank_is_never_pending():
    assert P.next_label(prev("leader", "leader"), "none", F + timedelta(days=7))[2] is None


def test_unknown_reading_is_refused():
    with pytest.raises(ValueError):
        P.next_label(None, "tag", F)


def test_walk_skips_the_weeks_before_the_first_reading():
    rs = [P.Reading("X", r) for r in ("none", "none", "laggard", "in_line", "in_line")]
    rows = P.walk(rs, WEEKS[:5])
    assert [r["week_end"] for r in rows] == WEEKS[2:5]
    assert [(r["label"], r["pending_to"], r["changed"]) for r in rows] == [("laggard", None, False), ("laggard", "in_line", False), ("in_line", None, True)]
    assert rows[2]["label_since"] == WEEKS[4]


def test_group_jumps_are_listed_not_changed():
    weeks = WEEKS[:5]
    assert P.group_jumps(weeks, [8, 35, 8, 9, 8]) == [(weeks[1], 35)]          # HINDUNILVR 8 -> 35 -> 8
    assert P.group_jumps(weeks, [9, 13, 6, 7, 9]) == []                        # RELIANCE's ordinary changes


def test_pending_wording_is_the_packs():
    assert P.pending_text("in_line") == "This week's reading says In line. The label changes if next week's reading agrees."
    assert P.pending_text(None) is None and P.pending_text("none") is None


# ------------------------------------------------------------------------------------------------------------- the pack's checks
def replay(rows, hold=2):
    """check_peer_labels.py's replay: the labels the printed rule gives from the history's readings alone."""
    out, prev_ = [], None
    for r in rows:
        reading = r.get("rawLabel") or "none"
        p = None if prev_ is None else P.Prev(prev_[0], prev_[1], F, prev_[2])
        lab, _, _, _ = P.next_label(p, reading, F, hold)
        out.append(lab if lab != "none" else None)
        prev_ = (lab, reading, (prev_[2] + 1 if prev_ and reading == "none" else 0) if prev_ else (1 if reading == "none" else 0))
    return out


def pack_checks(lead, hist, list_label):
    """A1 to A6 of check_peer_labels.py, the same comparisons."""
    f = []
    rows = hist["rows"]
    label = lead["label"]
    if list_label != label:
        f.append("A1")
    if rows[-1]["label"] != label:
        f.append("A2")
    start = None
    for r in reversed(rows):
        if r["label"] != label:
            break
        start = r["date"]
    if lead["labelSince"] != start:
        f.append("A3")
    if [r["label"] for r in rows] != replay(rows):
        f.append("A4")
    if len(rows) >= 2:
        a, b = rows[-2]["rawLabel"], rows[-1]["rawLabel"]
        if a == b and b not in (None, label):
            f.append("A5")
    pend = bool((lead.get("display") or {}).get("pending"))
    if pend != (lead["rawLabel"] not in (None, label)):
        f.append("A5")
    runs = lead.get("runs52")
    if runs:
        w = rows[-runs["total"]:]
        if any(sum(1 for r in w if r["label"] == k) != runs[k] for k in ("leader", "in_line", "laggard")):
            f.append("A6")
    return f


# Readings per stock (oldest first): every branch of the rule
STORIES = {
    "AAA": ["laggard", "in_line", "in_line", "in_line", "leader", "in_line", "in_line", "in_line", "in_line", "in_line", "in_line", "in_line"],   # RELIANCE's shape
    "BBB": ["leader"] * 3 + ["in_line"] + ["leader"] * 7 + ["in_line"],                                                                          # one new reading at the end: pending
    "CCC": [None, None, "in_line", "in_line", None, None, None, "leader", "leader", "leader", "laggard", "laggard"],                              # late start, unranked spell
    "DDD": ["leader"] * 12,
}


async def _seed(store):
    """leadership_history readings as the live table holds them (the label column deliberately wrong, as on 27 Nov), and one leadership row each."""
    async with store.pool.acquire() as conn:
        for t in ("peer_label_week", "peer_label_run", "leadership", "leadership_history", "leadership_excluded", "auto_alert_sent"):
            await conn.execute(f"DELETE FROM {t}")  # nosec B608 - fixed table names
        await conn.execute("UPDATE feature_flags SET enabled = true WHERE name = 'leadership'")
        for i, (sym, story) in enumerate(STORIES.items()):
            for w, rd in zip(WEEKS, story):
                await conn.execute("INSERT INTO leadership_history (symbol, run_date, rank, ranked, label, raw_label, rel52) VALUES ($1, $2, $3, 10, 'laggard', $4, 0.01)",
                                   sym, w, None if rd is None else i + 1, rd)
            await conn.execute(
                "INSERT INTO leadership (symbol, name, as_of, group_id, group_name, group_short, group_kind, ranked, rank, label, raw_label, label_since, direction, rel13, rel26, rel52, "
                "rel52_market, sector_code, sector_name, sector_kind, sector_ret52, market_code, market_name, market_ret52, held, stale_runs) VALUES "
                "($1, $1, $2, 'g', 'Group', 'Group', 'industry', 10, $3, 'laggard', 'laggard', '2025-01-03', NULL, 0, 0, 0.01, 0, 'peer_average', 'peer average', 'peer_average', 0, NULL, NULL, NULL, false, 0)",
                sym, WEEKS[-1], i + 1)


@pytest.mark.integration
async def test_rebuild_then_every_reader_passes_the_packs_checks_and_a_new_run_changes_no_old_row(store):  # noqa: F811
    await _seed(store)
    assert await P.needs_rebuild(store) is True
    out = await P.rebuild(store)
    assert out["status"] == "ok" and out["stocks"] == 4 and out["weeks"] == 12
    assert await P.needs_rebuild(store) is False and (await P.rebuild(store))["status"] == "skipped"       # one time only

    app = create_app(make_settings(), store=store)
    leadership_api._flag["at"] = 0.0
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            async def check_all():
                listed = (await c.get("/api/leadership/list?symbols=" + ",".join(STORIES))).json()["rows"]
                got = {}
                for sym in STORIES:
                    lead = (await c.get(f"/api/stocks/{sym}/leadership")).json()
                    hist = (await c.get(f"/api/stocks/{sym}/leadership-history")).json()
                    assert pack_checks(lead, hist, listed[sym]["label"]) == [], sym
                    got[sym] = (lead, hist)
                return got

            got = await check_all()
            a, b, cc, d = (got[s][0] for s in ("AAA", "BBB", "CCC", "DDD"))
            # RELIANCE's shape: In line twice in a row -> In line since the second of them, not "Laggard, if next week agrees"
            assert a["label"] == "in_line" and a["labelSince"] == WEEKS[2].isoformat() and a["display"]["pending"] is None and a["held"] is False
            assert b["label"] == "leader" and b["rawLabel"] == "in_line" and b["held"] is True
            assert b["display"]["pending"] == "This week's reading says In line. The label changes if next week's reading agrees."
            assert cc["label"] == "laggard" and d["label"] == "leader" and d["runs52"] == {"leader": 12, "in_line": 0, "laggard": 0, "total": 12}
            h = got["CCC"][1]["rows"]
            assert h[0]["date"] == WEEKS[2].isoformat() and h[0]["source"] == P.SOURCE_REBUILT and "peerListVersion" in h[0]   # the weeks before its first reading: skipped
            assert [r["label"] for r in h[2:5]] == ["in_line", "in_line", None]          # kept for two runs without a rank, then no label

            # the peers on the card carry the record's label, and the stored `leadership` columns now agree with it
            assert {p["symbol"]: p["label"] for p in a["peers"]} == {"AAA": "in_line", "BBB": "leader", "CCC": "laggard", "DDD": "leader"}
            async with store.pool.acquire() as conn:
                assert await conn.fetchval("SELECT label FROM leadership WHERE symbol = 'AAA'") == "in_line"
                # no alert for the migration: its rows are not source = 'run'
                assert (await labelalerts.changes(conn))[1] == []

            # A9: the next weekly run adds exactly one row per stock and changes no stored row
            before = {s: got[s][1]["rows"] for s in STORIES}
            nxt = WEEKS[-1] + timedelta(days=7)
            async with store.pool.acquire() as conn:
                res = await P.write_run(conn, nxt, [P.Reading("AAA", "in_line", ranked=10, rank=5), P.Reading("BBB", "in_line", ranked=10, rank=6),
                                                     P.Reading("DDD", "leader", ranked=10, rank=1), P.Reading("NEW", "laggard", ranked=10, rank=9)])
                assert res["written"] == 5 and res["changed"] == 1 and res["changedSymbols"] == ["BBB"]      # CCC not in the run: a 'none' row; NEW starts unchanged
                again = await P.write_run(conn, nxt, [P.Reading("AAA", "leader")])
                assert again["written"] == 0 and again["skipped"]                                                # a week is written once
                await P.sync_leadership(conn)
                week, moved = await labelalerts.changes(conn)
                assert week == nxt and [m["symbol"] for m in moved] == ["BBB"] and moved[0]["before"] == "leader" and moved[0]["label"] == "in_line"
            got2 = await check_all()
            for s in STORIES:
                rows = got2[s][1]["rows"]
                assert rows[:len(before[s])] == before[s] and len(rows) == len(before[s]) + 1, s
            assert got2["BBB"][0]["label"] == "in_line" and got2["BBB"][0]["labelSince"] == nxt.isoformat() and got2["BBB"][0]["display"]["pending"] is None

            # a correction for the same week replaces the run; the old one is kept, marked superseded
            async with store.pool.acquire() as conn:
                fix = await P.write_run(conn, nxt, [P.Reading("AAA", "in_line"), P.Reading("BBB", "leader"), P.Reading("DDD", "leader")], correction="bad prices")
                assert fix["written"] >= 3
                assert await conn.fetchval("SELECT count(*) FROM peer_label_run WHERE week_end = $1 AND status = 'superseded'", nxt) == 1
                assert (await P.latest(conn, ["BBB"]))["BBB"]["label"] == "leader"
    async with store.pool.acquire() as conn:   # leave the switch as the other leadership tests expect it: off, and not cached as on
        await conn.execute("UPDATE feature_flags SET enabled = false WHERE name = 'leadership'")
    leadership_api._flag["at"] = 0.0


def test_the_screener_takes_the_records_label_and_the_screens_follow_it():
    reading = {"by": {"SBIN": {"sr_industry": "Banks", "sr_peer": "Leader", "sr_lead": 1.0, "sr_ag": 1.0, "sr_up": 0.0, "sr_on_setup": 0.0},
                      "INDIGO": {"sr_industry": "Airlines", "sr_peer": "In line", "sr_lead": 0.0, "sr_ag": 0.0, "sr_up": 0.0, "sr_on_setup": 0.0},
                      "ZZZ": {"sr_industry": "X", "sr_peer": "Leader", "sr_lead": 1.0, "sr_ag": 0.0, "sr_up": 0.0, "sr_on_setup": 0.0}}}
    assert sectorread.apply_labels(reading, None) == 0 and reading["by"]["SBIN"]["sr_peer"] == "Leader"      # no record yet: the sector build's labels stay
    moved = sectorread.apply_labels(reading, {"SBIN": "In line", "INDIGO": "Laggard"})
    assert moved == 3
    assert reading["by"]["SBIN"]["sr_peer"] == "In line" and reading["by"]["SBIN"]["sr_lead"] == 0.0 and reading["by"]["SBIN"]["sr_tailwinds"] == 1.0
    assert reading["by"]["INDIGO"]["sr_peer"] == "Laggard"
    assert reading["by"]["ZZZ"]["sr_peer"] is None and reading["by"]["ZZZ"]["sr_lead"] == 0.0      # no stored row: no label anywhere


@pytest.mark.integration
async def test_the_industry_page_shows_the_records_label(store):  # noqa: F811
    from types import SimpleNamespace

    from finlit import sector_api
    await _seed(store)
    await P.rebuild(store)
    req = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(store=store)))
    page = {"name": "Group", "stocks": [{"symbol": "AAA", "peer_label": "Laggard"}, {"symbol": "DDD", "peer_label": "In line"}, {"symbol": "ZZZ", "peer_label": "Leader"}]}
    out = await sector_api._record_peer_labels(req, page)
    assert [s["peer_label"] for s in out["stocks"]] == ["In line", "Leader", None]
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM peer_label_week")
        await conn.execute("DELETE FROM peer_label_run")
    assert (await sector_api._record_peer_labels(req, page))["stocks"][0]["peer_label"] == "Laggard"     # no record: unchanged


def test_the_rebuild_job_is_one_time_and_never_weakens_the_weekly_job():
    from finlit.jobs.registry import by_name
    j, wk = by_name()["peer-labels"], by_name()["leadership"]
    assert j.probe == "peer-labels" and "rebuild-peer-labels" in j.argv
    assert [a for a in wk.argv if a.startswith("refresh-") or a.startswith("--")] == ["refresh-leadership", "--if-stale", "--backfill-from"] and wk.max_runtime_min == 60


def test_the_frozen_history_never_rewrites_a_stored_week():
    src = open(leadership_api.__file__.replace("leadership_api.py", "leadership.py")).read()
    assert "ON CONFLICT (symbol, run_date) DO NOTHING" in src and "ON CONFLICT (symbol, run_date) DO UPDATE" not in src


def test_peer_label_wording_never_says_tag():
    import pathlib
    root = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "src"
    hits = [str(p) for p in root.rglob("*.ts*") if ".test." not in p.name and "peer tag" in p.read_text(encoding="utf-8")]
    assert hits == []
