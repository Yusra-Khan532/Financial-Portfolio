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
