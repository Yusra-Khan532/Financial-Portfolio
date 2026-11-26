"""Trading Lab > Trading journal (lab/journal.py): a member's own trades and the numbers from the closed ones. Private to each member."""
import pytest

from finlit.lab import journal as J
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration


def tr(i, side, entry, exit_, qty=10, fees=0.0, day="2026-11-24", setup=None):
    return {"id": i, "symbol": "X", "side": side, "qty": qty, "entryPrice": entry, "exitPrice": exit_, "fees": fees, "setup": setup,
            "entryAt": f"{day}T09:30:00+05:30", "exitAt": None if exit_ is None else f"{day}T{10 + i:02d}:00:00+05:30"}


def test_pnl_for_long_and_short_less_fees_and_none_while_open():
    assert J.pnl(tr(1, "long", 100, 110, qty=5, fees=20)) == 30.0        # (110 - 100) x 5 - 20
    assert J.pnl(tr(1, "short", 100, 90, qty=5, fees=0)) == 50.0
    assert J.pnl(tr(1, "short", 100, 104, qty=5)) == -20.0
    assert J.pnl(tr(1, "long", 100, None)) is None


def test_stats_over_closed_trades_in_exit_order():
    ts = [tr(1, "long", 100, 110, setup="ORB"),                         # +100
          tr(2, "long", 100, 95, setup="ORB"),                          # -50
          tr(3, "short", 100, 104),                                     # -40
          tr(4, "long", 100, 130, day="2026-11-25", setup="Gap"),       # +300
          tr(5, "long", 100, 100, day="2026-11-25"),                    # 0: neither a win nor a loss
          tr(6, "long", 100, None)]                                     # open
    s = J.stats(ts)
    assert (s["closed"], s["open"], s["net"], s["wins"], s["losses"]) == (5, 1, 310.0, 2, 2)
    assert s["winRate"] == 40.0 and s["profitFactor"] == round(400 / 90, 2) and s["expectancy"] == 62.0
    assert (s["avgWin"], s["avgLoss"], s["largestWin"], s["largestLoss"]) == (200.0, -45.0, 300.0, -50.0)
    assert s["maxDrawdown"] == -90.0                                    # peak 100, then 50, then 10
    assert [c["cum"] for c in s["curve"]] == [100, 50, 10, 310, 310]
    assert s["days"] == [{"day": "2026-11-24", "net": 10.0}, {"day": "2026-11-25", "net": 300.0}]
    assert s["bestDay"] == {"day": "2026-11-25", "net": 300.0} and s["worstDay"] is None   # no day lost money
    assert s["longestWinRun"] == 1 and s["longestLossRun"] == 2 and s["currentRun"] is None
    assert [x["setup"] for x in s["setups"]] == ["Gap", "ORB", "No setup"] and s["setups"][1] == {"setup": "ORB", "trades": 2, "net": 50.0, "wins": 1}


def test_stats_of_an_empty_journal_are_empty_not_guessed():
    s = J.stats([])
    assert s["closed"] == 0 and s["winRate"] is None and s["profitFactor"] is None and s["expectancy"] is None and s["curve"] == []


def test_csv_import_reads_common_column_names_and_reports_each_bad_line():
    text = ("Symbol,Direction,Quantity,Entry Price,Exit Price,Entry Time,Exit Time,Charges,Strategy\n"
            "reliance,BUY,10,1400,1420.5,2026-11-24 09:30,2026-11-24 11:00,20,ORB\n"
            "NIFTY 24300 CE,sell,75,\"1,20\",,26/11/2026 10:15,,,\n"
            "TCS,hold,1,3000,,2026-11-24,,,\n"
            "INFY,long,1,1500,1490,2026-11-24 10:00,2026-11-24 09:00,,\n"
            "SBIN,long,x,800,,2026-11-24,,,\n"
            "HDFCBANK,long,1,1700,,yesterday,,,\n"
            "ITC,long,-5,400,,2026-11-24,,,\n")
    good, bad = J.parse_csv(text)
    assert [g.symbol for g in good] == ["RELIANCE", "NIFTY 24300 CE"]
    assert good[0].side == "long" and good[0].exitPrice == 1420.5 and good[0].fees == 20 and good[0].setup == "ORB"
    assert good[0].entryAt.isoformat() == "2026-11-24T09:30:00+05:30"
    assert good[1].side == "short" and good[1].entryPrice == 120 and good[1].exitPrice is None and good[1].entryAt.day == 26
    assert [b["line"] for b in bad] == [4, 5, 6, 7, 8]
    assert bad[2]["reason"] == "qty 'x' is not a number" and bad[3]["reason"] == "'yesterday' is not a date like 2026-11-26 10:15"
    assert bad[4]["reason"].startswith("qty") and "Traceback" not in repr(bad) and "float" not in repr(bad)   # only plain reasons reach the member
    assert "hold" in bad[0]["reason"] and "before the entry" in bad[1]["reason"]
    assert J.parse_csv("a,b\n1,2\n")[1][0]["reason"].startswith("Missing columns")


def test_a_trade_needs_both_exit_price_and_time_or_neither():
    with pytest.raises(ValueError):
        J.Trade(symbol="X", side="long", qty=1, entryPrice=10, exitPrice=11, entryAt="2026-11-24T09:30:00+05:30")


@pg
async def test_the_journal_is_for_lab_members_and_private_to_each(app):  # noqa: F811
    admin = await admin_with_mfa(app, "journal-boss@example.com")
    a = await signed_in(app, "journal-a@example.com", plan="basic")
    b = await signed_in(app, "journal-b@example.com", plan="gold")
    assert (await a.get("/api/lab/journal")).status_code == 403             # no Lab access yet, whatever the plan
    for who in ("journal-a@example.com", "journal-b@example.com"):
        assert (await admin.put("/api/admin/lab/grants", json={"email": who})).status_code == 200
    body = {"symbol": "reliance", "side": "long", "qty": 10, "entryPrice": 1400, "entryAt": "2026-11-24T09:30:00+05:30", "setup": " ORB "}
    r = await a.post("/api/lab/journal", json=body)
    assert r.status_code == 200, r.text
    t = r.json()["trade"]
    assert t["symbol"] == "RELIANCE" and t["exitPrice"] is None and t["pnl"] is None and t["setup"] == "ORB"
    closed = {**body, "exitPrice": 1420, "exitAt": "2026-11-24T11:00:00+05:30", "fees": 25}
    assert (await a.put(f"/api/lab/journal/{t['id']}", json=closed)).json()["trade"]["pnl"] == 175.0
    got = (await a.get("/api/lab/journal")).json()
    assert len(got["trades"]) == 1 and got["stats"]["net"] == 175.0 and got["stats"]["winRate"] == 100.0
    # another member sees nothing of it and cannot change or remove it
    assert (await b.get("/api/lab/journal")).json()["trades"] == []
    assert (await b.put(f"/api/lab/journal/{t['id']}", json=closed)).status_code == 404
    assert (await b.delete(f"/api/lab/journal/{t['id']}")).status_code == 404
    # bad input is refused
    assert (await a.post("/api/lab/journal", json={**body, "exitPrice": 1410})).status_code == 422
    assert (await a.post("/api/lab/journal", json={**body, "qty": -1})).status_code == 422
    # CSV import adds the good lines and lists the rest
    csv = "symbol,side,qty,entry,exit,entry time,exit time\nINFY,short,5,1500,1480,2026-11-25 10:00,2026-11-25 10:45\nTCS,hold,1,1,,2026-11-25,\n"
    imp = (await a.post("/api/lab/journal/import", json={"csv": csv})).json()
    assert imp["added"] == 1 and imp["rejected"][0]["line"] == 3
    assert (await a.get("/api/lab/journal")).json()["stats"]["net"] == 275.0
    assert (await a.delete(f"/api/lab/journal/{t['id']}")).json() == {"status": "removed"}
    assert len((await a.get("/api/lab/journal")).json()["trades"]) == 1
    # a write without the session's CSRF token is refused
    a.headers.pop("X-CSRF-Token")
    assert (await a.post("/api/lab/journal", json=body)).status_code == 403


# ---------------------------------------------------------------------------------------------------- reflection of a closed trade
from datetime import date, datetime  # noqa: E402
import re  # noqa: E402

NIFTY = {date(2026, 11, 20): 24000.0, date(2026, 11, 23): 24100.0, date(2026, 11, 24): 24200.0, date(2026, 11, 25): 24050.0,
         date(2026, 11, 26): 24340.0, date(2026, 11, 27): 24400.0}
# Wording a reflection never uses: judging the trade, advising the next one, or forecasting (CLAUDE.md "describe, never advise").
BANNED = re.compile(r"\b(lessons?|should|next time|better|worse|mistakes?|good|bad|best|worst|buy|sell|hold|avoid|accumulate|target|advice|advise|"
                    r"recommend\w*|will|would|likely|forecast\w*|expect\w*|predict\w*|opportunit\w*|wrong|right call|well done)\b", re.I)


def rt(side, entry, exit_, at, out, qty=10, fees=0.0, setup=None, notes=None, symbol="RELIANCE"):
    t = {"id": 1, "symbol": symbol, "side": side, "qty": qty, "entryPrice": entry, "exitPrice": exit_, "entryAt": at, "exitAt": out, "fees": fees,
         "setup": setup, "notes": notes}
    t["pnl"] = J.pnl(t)
    return t


def test_reflection_of_an_intraday_long_win_with_fees_and_a_reached_level():
    r = J.reflection(rt("long", 1400, 1425, "2026-11-24T09:30:00+05:30", "2026-11-24T11:00:00+05:30", fees=25,
                        setup="ORB long, expected a move above 1,420"), NIFTY)
    assert r["sentences"][0] == ("Long RELIANCE (quantity 10) was entered at ₹1,400 and exited at ₹1,425 after 1 hour 30 minutes, closing with a net "
                                 "gain of ₹225 after ₹25 of fees: +1.61% on the ₹14,000 position.")
    assert r["nifty"] == {"status": "intraday"} and r["sentences"][1] == J.NIFTY_INTRADAY and "not stored" in r["sentences"][1]
    assert r["assumption"] == {"status": "reached", "level": 1420.0, "way": "above", "field": "setup"}
    assert r["sentences"][2] == "The level noted in the setup, 1,420 (a move above it), was reached at the exit: the exit price of ₹1,425 is above it."
    assert r["text"] == " ".join(r["sentences"]) and r["returnPct"] == 1.61 and r["held"] == "1 hour 30 minutes"


def test_reflection_of_a_multi_day_short_win_against_nifty_turned_around_and_a_level_not_reached():
    r = J.reflection(rt("short", 1500, 1480, "2026-11-24T10:00:00+05:30", "2026-11-26T14:15:00+05:30", qty=5, fees=12.5, notes="target 1450",
                        symbol="INFY"), NIFTY)
    assert r["sentences"][0].startswith("Short INFY (quantity 5) was entered at ₹1,500 and exited at ₹1,480 after 2 days 4 hours, closing with a net gain "
                                        "of ₹87.50 after ₹12.50 of fees: +1.17% on the ₹7,500 position.")
    # the close before the entry (23 Nov: the 24th's close came after a 10:00 entry) to the first close after the exit (26 Nov, exit 14:15)
    assert r["nifty"] == {"status": "ok", "from": "2026-11-23", "to": "2026-11-26", "fromClose": 24100.0, "toClose": 24340.0, "pct": 1.0,
                          "against": -1.0, "gap": 2.17}
    assert r["sentences"][1] == ("Nifty 50 moved +1.00% over the same period (its close on 23 Nov 2026 before the entry to its close on 26 Nov 2026 "
                                 "after the exit); a short gains when prices fall, so against the index's move turned around (−1.00%) the "
                                 "position's +1.17% was 2.17 percentage points above it.")
    assert r["assumption"]["status"] == "not_reached" and r["assumption"]["way"] == "below"     # a short with no direction written: below
    assert "was not reached at the exit" in r["sentences"][2] and "is above it (prices between entry and exit are not checked)" in r["sentences"][2]


def test_reflection_of_a_multi_day_long_loss_below_nifty_and_no_assumption():
    r = J.reflection(rt("long", 800, 790, "2026-11-23T15:45:00+05:30", "2026-11-25T16:00:00+05:30", qty=20, symbol="SBIN"), NIFTY)
    assert "closing with a net loss of ₹200 with no fees entered: −1.25% on the ₹16,000 position." in r["sentences"][0]
    # entered after the 23rd's close, so that close counts; exited after the 25th's close, so the 26th is the first close after it
    assert (r["nifty"]["from"], r["nifty"]["to"], r["nifty"]["pct"]) == ("2026-11-23", "2026-11-26", 1.0)
    assert r["sentences"][1].endswith("the position's −1.25% was 2.25 percentage points below it.")
    assert r["sentences"][2] == J.NO_ASSUMPTION == "No assumption was noted to check."


def test_reflection_short_loss_and_a_flat_trade():
    r = J.reflection(rt("short", 100, 104, "2026-11-24T10:00:00+05:30", "2026-11-25T11:00:00+05:30", qty=5), NIFTY)
    assert "a net loss of ₹20 with no fees entered: −4.00% on the ₹500 position" in r["sentences"][0]
    assert r["nifty"]["pct"] == -0.21 and r["nifty"]["against"] == 0.21 and r["nifty"]["gap"] == -4.21     # 23 Nov close to 25 Nov close
    flat = J.reflection(rt("long", 100, 100, "2026-11-24T10:00:00+05:30", "2026-11-24T10:20:00+05:30"), NIFTY)
    assert "closing with no net gain or loss with no fees entered: 0.00% on the ₹1,000 position" in flat["sentences"][0]
    assert flat["held"] == "20 minutes"


def test_holding_time_wording():
    a = datetime.fromisoformat("2026-11-24T09:30:00+05:30")
    at = lambda s: datetime.fromisoformat(s)  # noqa: E731
    assert J.held_for(a, at("2026-11-24T09:30:30+05:30")) == "under a minute"
    assert J.held_for(a, at("2026-11-24T09:31:00+05:30")) == "1 minute"
    assert J.held_for(a, at("2026-11-24T10:30:00+05:30")) == "1 hour"
    assert J.held_for(a, at("2026-11-24T12:05:00+05:30")) == "2 hours 35 minutes"
    assert J.held_for(a, at("2026-11-25T09:30:00+05:30")) == "1 day"
    assert J.held_for(a, at("2026-11-27T13:00:00+05:30")) == "3 days 3 hours"


def test_nifty_missing_is_said_plainly_never_guessed():
    t = rt("long", 100, 110, "2026-11-24T10:00:00+05:30", "2026-12-03T10:00:00+05:30")
    r = J.reflection(t, NIFTY)                                     # no close on or after 3 Dec is stored yet
    assert r["nifty"] == {"status": "missing"} and r["sentences"][1] == J.NIFTY_NOT_STORED
    assert J.reflection(t, {})["nifty"] == {"status": "missing"}
    gap = {date(2026, 10, 1): 23000.0, date(2026, 11, 26): 24340.0}  # the close before the entry is weeks old: not the same period
    assert J.nifty_window(datetime.fromisoformat("2026-11-24T10:00:00+05:30"), datetime.fromisoformat("2026-11-26T10:00:00+05:30"), gap) == {"status": "missing"}
    # a holiday or weekend between is fine: the nearest close each side, within a week
    ok = J.nifty_window(datetime.fromisoformat("2026-11-23T10:00:00+05:30"), datetime.fromisoformat("2026-11-27T10:00:00+05:30"), NIFTY)
    assert (ok["from"], ok["to"]) == ("2026-11-20", "2026-11-27")


def test_noted_level_reads_only_simple_explicit_cases():
    lv = lambda side, setup=None, notes=None, exit_=1425: J.noted_level(rt(side, 1400, exit_, "2026-11-24T09:30:00+05:30", "2026-11-24T11:00:00+05:30", setup=setup, notes=notes))  # noqa: E731
    assert lv("long", "ORB long, expected a move above 1,420") == {"status": "reached", "level": 1420.0, "way": "above", "field": "setup"}
    assert lv("long", notes="expected 1450")["status"] == "not_reached"
    assert lv("long", notes="Expecting a fall below 1,380", exit_=1375) == {"status": "reached", "level": 1380.0, "way": "below", "field": "notes"}
    assert lv("short", notes="tgt 1390", exit_=1395)["status"] == "not_reached"
    assert lv("long", notes="expected 1425", exit_=1425)["status"] == "reached"
    for text in ("ORB", "stop 1390", "breakout above 1420", "expected 2% more", "expected 15 min candle", "expected stop at 1390", None):
        assert lv("long", notes=text) == {"status": "none"}, text            # no cue word, a percentage, not a price, or a stop: not read
    assert lv("long", setup="aim 1420", notes="expected 1450") == {"status": "several"}
    assert lv("long", setup="aim 1420", notes="expected 1,420")["status"] == "reached"     # the same level twice is one level
    r = J.reflection(rt("long", 1400, 1410, "2026-11-24T09:30:00+05:30", "2026-11-24T11:00:00+05:30", setup="aim 1420", notes="expected 1450"), NIFTY)
    assert r["sentences"][2] == J.SEVERAL_LEVELS


def test_an_open_trade_has_no_reflection():
    assert J.reflection(rt("long", 100, None, "2026-11-24T10:00:00+05:30", None), NIFTY) is None


def test_reflections_never_judge_advise_or_forecast():
    cases = []
    for side in ("long", "short"):
        for exit_ in (90.0, 100.0, 104.5, 125.0):
            for out in ("2026-11-24T10:45:00+05:30", "2026-11-26T14:00:00+05:30", "2026-12-09T10:00:00+05:30"):
                for fees in (0.0, 17.25):
                    for notes in (None, "expected 110", "expected a fall below 95", "aim 110, target 120", "no plan"):
                        cases.append(J.reflection(rt(side, 100, exit_, "2026-11-24T10:00:00+05:30", out, fees=fees, notes=notes), NIFTY))
    for r in cases:
        assert 2 <= len(r["sentences"]) <= 4
        assert not BANNED.search(r["text"]), r["text"]
    assert BANNED.search("A lesson for next time") and BANNED.search("This will likely rise")      # the guard itself works


@pg
async def test_the_journal_list_carries_each_closed_trades_reflection_and_only_the_members_own(app):  # noqa: F811
    admin = await admin_with_mfa(app, "refl-boss@example.com")
    a = await signed_in(app, "refl-a@example.com", plan="basic")
    b = await signed_in(app, "refl-b@example.com", plan="gold")
    for who in ("refl-a@example.com", "refl-b@example.com"):
        assert (await admin.put("/api/admin/lab/grants", json={"email": who})).status_code == 200
    async with app.state.store.pool.acquire() as conn:
        await conn.executemany("INSERT INTO flows_index (code, d, close) VALUES ('NIF50', $1, $2) ON CONFLICT (code, d) DO UPDATE SET close = EXCLUDED.close",
                               [(date(2025, 3, d), c) for d, c in ((3, 22000.0), (4, 22100.0), (5, 22220.0), (6, 22330.0))])
    try:
        multi = {"symbol": "TCS", "side": "long", "qty": 2, "entryPrice": 3000, "exitPrice": 3060, "entryAt": "2025-03-04T10:00:00+05:30",
                 "exitAt": "2025-03-06T11:00:00+05:30", "fees": 20, "notes": "expected 3,050"}
        day = {"symbol": "SBIN", "side": "short", "qty": 10, "entryPrice": 800, "exitPrice": 806, "entryAt": "2025-03-05T09:30:00+05:30",
               "exitAt": "2025-03-05T10:15:00+05:30"}
        gone = {"symbol": "ITC", "side": "long", "qty": 1, "entryPrice": 400, "exitPrice": 410, "entryAt": "2025-03-05T10:00:00+05:30",
                "exitAt": "2025-03-20T10:00:00+05:30"}
        opened = {"symbol": "HDFCBANK", "side": "long", "qty": 1, "entryPrice": 1700, "entryAt": "2025-03-05T10:00:00+05:30"}
        for body in (multi, day, gone, opened):
            r = await a.post("/api/lab/journal", json=body)
            assert r.status_code == 200, r.text
        assert r.json()["trade"]["reflection"] is None                      # an add answers with its reflection too (none while open)
        got = {t["symbol"]: t for t in (await a.get("/api/lab/journal")).json()["trades"]}
        m = got["TCS"]["reflection"]
        assert m["nifty"]["status"] == "ok" and (m["nifty"]["from"], m["nifty"]["to"]) == ("2025-03-03", "2025-03-06")
        assert m["nifty"]["pct"] == round((22330 / 22000 - 1) * 100, 2) and m["assumption"]["status"] == "reached"
        assert m["sentences"][0].startswith("Long TCS (quantity 2) was entered at ₹3,000 and exited at ₹3,060 after 2 days 1 hour, closing with a net "
                                            "gain of ₹100 after ₹20 of fees")
        assert got["SBIN"]["reflection"]["nifty"] == {"status": "intraday"} and "net loss of ₹60" in got["SBIN"]["reflection"]["text"]
        assert got["ITC"]["reflection"]["nifty"] == {"status": "missing"}        # no close stored on or after 20 Mar 2025 within a week
        assert got["HDFCBANK"]["reflection"] is None
        for t in got.values():
            assert t["reflection"] is None or not BANNED.search(t["reflection"]["text"])
        # closing a trade answers with its reflection
        put = await a.put(f"/api/lab/journal/{got['HDFCBANK']['id']}", json={**opened, "exitPrice": 1690, "exitAt": "2025-03-06T15:30:00+05:30"})
        assert (put.json()["trade"]["reflection"]["nifty"]["from"], put.json()["trade"]["reflection"]["nifty"]["to"]) == ("2025-03-04", "2025-03-06")
        # another member sees none of these trades or their reflections
        other = (await b.get("/api/lab/journal")).json()
        assert other["trades"] == [] and "TCS" not in str(other)
    finally:
        async with app.state.store.pool.acquire() as conn:
            await conn.execute("DELETE FROM flows_index WHERE code = 'NIF50' AND d BETWEEN '2025-03-01' AND '2025-03-31'")
