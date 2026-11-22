"""Task #322 (developer file 24): every index's P/E against its own five years and its returns, in one saved answer for the Market events table."""
import asyncio
import json
from pathlib import Path

from finlit import indices
from tests.test_indices import FIX, make


def test_band_describes_the_past_in_three_words():
    assert [indices.band(p) for p in (None, 5, 25, 25.1, 50, 74.9, 75, 99)] == [None, "low", "low", "usual", "usual", "usual", "high", "high"]


def test_board_row_from_the_sites_own_histories():
    val = json.loads((FIX / "index_valuation_nif50.json").read_text())
    lev = json.loads((FIX / "index_price_nif50.json").read_text())
    row = indices.board_row("NIF50", val, lev)
    st = indices.shape_history(val, 5)["stats"]["pe"]
    assert row["pe"]["now"] == round(st["now"], 2) and row["pe"]["median"] == round(st["median"], 2) and row["pe"]["pctile"] == st["pctile"]
    assert row["pe"]["band"] == indices.band(st["pctile"])
    closes = [r["c"] for r in indices.shape_levels(lev, 1)["rows"]]
    for k, n in indices.RET_SESSIONS.items():
        if len(closes) > n:
            assert row["ret"][k] == round(100 * (closes[-1] / closes[-1 - n] - 1), 2)
    assert row["lo1y"] == min(closes) and row["hi1y"] == max(closes) and 0 <= row["pos1y"] <= 1


def test_board_row_without_history_is_empty_not_zero():
    row = indices.board_row("SNSXSENSEX", None, None)
    assert row == {"code": "SNSXSENSEX", "pe": None, "ret": {}, "lo1y": None, "hi1y": None, "pos1y": None}


def test_board_endpoint_builds_once_then_serves_the_saved_copy(monkeypatch):
    async def run():
        app, c = make("gold")
        started = []
        async def job(a):
            started.append(1)
            await a.state.store.redis.set(indices.BOARD_KEY, json.dumps({"t": __import__("time").time(), "v": {"items": [{"code": "NIF50"}], "indices": 1, "withPe": 1, "withReturns": 1, "built": "x"}}))
        monkeypatch.setattr(indices, "_board_job", job)
        monkeypatch.setattr(indices, "spawn", lambda coro: asyncio.ensure_future(coro))
        r1 = (await c.get("/api/indices/board")).json()
        await asyncio.sleep(0)
        r2 = (await c.get("/api/indices/board")).json()
        return r1, r2, started
    r1, r2, started = asyncio.run(run())
    assert r1 == {"ready": False, "items": []} and r2["ready"] is True and r2["items"] == [{"code": "NIF50"}] and started == [1]


def test_board_is_gold_only():
    async def run():
        _, c = make("silver")
        return (await c.get("/api/indices/board")).status_code
    assert asyncio.run(run()) == 403


def test_build_board_uses_the_feed_and_counts(monkeypatch):
    async def run():
        app, _ = make("gold")
        return await indices._build_board(app)
    out = asyncio.run(run())
    assert out["indices"] == 229 and len(out["items"]) == 229
    nif = next(x for x in out["items"] if x["code"] == "NIF50")
    assert nif["pe"] and nif["ret"] and out["withPe"] >= 1 and out["withReturns"] >= 1
