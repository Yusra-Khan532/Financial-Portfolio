"""Trading Lab > Option Pulse, Global (lab/global_options.py): US option open interest by strike from Nasdaq's public chain, shaped like Dhan's so
options.summarize (PCR, max pain, the strike nearest the price) is reused; OI change only once FinLit holds a previous day, never made up."""
import json
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
import orjson
import pytest

from finlit.lab import global_options as G
from finlit.options import summarize
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_lab_access import admin_with_mfa

pg = pytest.mark.integration
BODY = json.loads((Path(__file__).parent / "fixtures/global/nasdaq_options_aapl.json").read_text())   # a real answer of 26 Nov 2026: two expiries


def test_the_last_trade_line_gives_price_and_day():
    assert G.last_trade("LAST TRADE: $716.81 (AS OF NOV 25, 2026)") == (716.81, date(2026, 11, 25))
    assert G.last_trade("LAST TRADE: $1,016.10 (AS OF DEC 2, 2026)") == (1016.1, date(2026, 12, 2))
    assert G.last_trade(None) == (None, None)


def test_rows_are_grouped_by_expiry_and_summarized_by_the_india_maths():
    groups, spot, day = G.parse(BODY)
    assert list(groups) == ["2026-11-27", "2026-11-30"] and spot == 355.58 and day == date(2026, 11, 25)
    s = summarize(G.dhan_like(groups["2026-11-27"], spot, {}))
    assert s["atm"] == 355.0 and s["summary"]["strikes"] == 78 and s["summary"]["maxPain"]["strike"] == 352.5
    r = next(x for x in s["rows"] if x["strike"] == 310.0)
    assert r["ce"]["oi"] == 172 and r["ce"]["ltp"] == 43.75 and r["ce"]["prevClose"] == 43.76 and r["ce"]["oiChange"] is None and r["ce"]["buildup"] is None
    assert r["ceItm"] and not r["peItm"]


def test_oi_change_and_build_up_come_from_the_previous_day_kept():
    groups, spot, _ = G.parse(BODY)
    rows = groups["2026-11-27"]
    prev = {k: max(0, v - 100) for k, v in G.oi_map(rows).items()}
    s = summarize(G.dhan_like(rows, spot, prev))
    r = next(x for x in s["rows"] if x["strike"] == 310.0)
    assert r["pe"]["oiChange"] == 100 and r["pe"]["buildup"] == "short_buildup"       # price down, OI up
    assert s["summary"]["totals"]["pe"]["oiChange"] > 0


@pg
async def test_routes_are_for_lab_members_and_keep_each_days_oi(app, monkeypatch):  # noqa: F811
    store = app.state.store

    async def fake_fetch(sym, kind, today, client=None):
        return BODY
    monkeypatch.setattr(G, "_fetch", fake_fetch)
    member = await signed_in(app, "gopt-member@example.com", plan="gold")
    assert (await member.get("/api/lab/options/global/underlyings")).status_code == 403
    admin = await admin_with_mfa(app, "gopt-boss@example.com")
    u = (await admin.get("/api/lab/options/global/underlyings")).json()
    assert [i["key"] for i in u["indices"]] == ["SPY", "QQQ", "IWM", "DIA"] and any(s["key"] == "AAPL" for s in u["stocks"])
    e = (await admin.get("/api/lab/options/global/expiries?u=aapl")).json()
    assert e["expiries"] == ["2026-11-27", "2026-11-30"] and e["underlying"]["key"] == "AAPL"
    c = (await admin.get("/api/lab/options/global/chain?u=AAPL&expiry=2026-11-27")).json()
    assert c["spot"] == 355.58 and c["atm"] == 355.0 and c["lotSize"] == 100 and any("second US session" in n for n in c["notes"])
    assert orjson.loads(await store.redis.get(G.OI_KEY + "AAPL:2026-11-27:2026-11-25"))["c:310"] == 172      # kept for tomorrow
    assert (await admin.get("/api/lab/options/global/chain?u=AAPL&expiry=2027-01-01")).status_code == 404
    assert (await admin.get("/api/lab/options/global/chain?u=XYZ&expiry=2026-11-27")).status_code == 400
