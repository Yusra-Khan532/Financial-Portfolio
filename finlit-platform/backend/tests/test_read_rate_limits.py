"""Costly reads anyone may call have their own per-request budget (security finding: screener, compare, advanced charts, query builder and their CSV
downloads could be called nonstop without signing in). A visitor is counted by IP, a signed-in member by account with a larger budget; past the budget
the answer is the site's usual 429 {status: rate_limited, detail, retryAfter} with a Retry-After header, and normal use under it is unchanged."""

import json
from types import SimpleNamespace

import pytest

from finlit import security
from finlit.screener import data
from finlit.screener.data import Table
from test_advanced_api import fake_table as advanced_table
from test_auth import app, new_client, signed_in  # noqa: F401  (fixtures and helpers)
from test_integration import ingested, store  # noqa: F401  (fixtures)

pytestmark = pytest.mark.integration


def row(sym, **m):
    return {"symbol": sym, "name": sym.title(), "sector": "IT", "industry": None, "band": "mixed", "metrics": json.dumps(m)}


@pytest.fixture(autouse=True)
def screener_table():
    rows = [row(f"S{i:02d}", market_cap=100 * (i + 1), price=10 + i, pe=5 + i, roe=i, debt_to_equity=(i % 5) / 2) for i in range(40)]
    data._table = Table(rows, {}, {})
    yield data._table
    data.reset()


@pytest.fixture
def clock(monkeypatch):
    """Freeze the limiter's clock so a test never straddles a window edge; `clock[0] += 60` moves to the next minute."""
    now = [1_800_000_000.0]
    monkeypatch.setattr(security, "time", SimpleNamespace(time=lambda: now[0]))
    return now


def limited(r):
    body = r.json()["detail"]
    return (r.status_code == 429 and body["status"] == "rate_limited" and body["detail"] == "Too many attempts. Please wait and try again."
            and body["retryAfter"] > 0 and r.headers["retry-after"] == str(body["retryAfter"]))


async def burst(c, path, body, n):
    return [(await c.post(path, json=body)).status_code for _ in range(n)]


SCREEN = {"filters": {"roe": {"min": 5}}, "cats": {}, "sort": {"key": "market_cap", "dir": "desc"}, "columns": [], "offset": 0, "limit": 25}


async def test_screener_query_visitor_then_member_budget(app, clock):  # noqa: F811
    from finlit.screener.api import READ_MEMBER, READ_VISITOR
    async with new_client(app) as anon:
        ok = await anon.post("/api/screener/query", json=SCREEN)
        assert ok.status_code == 200 and ok.json()["total"] == 35                    # results unchanged under the limit
        assert await burst(anon, "/api/screener/query", SCREEN, READ_VISITOR - 1) == [200] * (READ_VISITOR - 1)
        assert limited(await anon.post("/api/screener/query", json=SCREEN))
        member = await signed_in(app, "rl-member@example.com")                     # same IP, own (larger) budget by account
        assert await burst(member, "/api/screener/query", SCREEN, READ_MEMBER) == [200] * READ_MEMBER
        assert limited(await member.post("/api/screener/query", json=SCREEN))
        await member.aclose()
        clock[0] += 60                                                             # the next minute: the visitor may search again
        assert (await anon.post("/api/screener/query", json=SCREEN)).status_code == 200


async def test_query_builder_run_and_export(app, clock):  # noqa: F811
    from finlit.screener.qapi import EXPORT_VISITOR, RUN_VISITOR
    async with new_client(app) as anon:
        assert await burst(anon, "/api/screener/ql/run", {"query": "ROE > 3"}, RUN_VISITOR) == [200] * RUN_VISITOR
        assert limited(await anon.post("/api/screener/ql/run", json={"query": "ROE > 3"}))
        # the download is Silver: a visitor's refusal is cheap but still counted, on a stricter 10-minute budget
        assert await burst(anon, "/api/screener/ql/export", {"query": "ROE > 3"}, EXPORT_VISITOR) == [403] * EXPORT_VISITOR
        assert limited(await anon.post("/api/screener/ql/export", json={"query": "ROE > 3"}))
        clock[0] += 60
        assert (await anon.post("/api/screener/ql/run", json={"query": "ROE > 3"})).status_code == 200
        assert limited(await anon.post("/api/screener/ql/export", json={"query": "ROE > 3"}))   # still inside the 10 minutes
    silver = await signed_in(app, "rl-silver@example.com", plan="silver")
    r = await silver.post("/api/screener/ql/export", json={"query": "ROE >= 38"})
    assert r.status_code == 200 and "S38" in r.text and "S39" in r.text
    await silver.aclose()


async def test_compare_metrics(app, clock):  # noqa: F811
    from finlit.compare import METRICS_VISITOR
    body = {"symbols": ["S01", "S02"], "keys": ["pe", "roe"]}
    async with new_client(app) as anon:
        r = await anon.post("/api/compare/metrics", json=body)
        assert r.status_code == 200 and r.json()["values"]["pe"]["S01"]["v"] == 6
        assert await burst(anon, "/api/compare/metrics", body, METRICS_VISITOR - 1) == [200] * (METRICS_VISITOR - 1)
        assert limited(await anon.post("/api/compare/metrics", json=body))


async def test_advanced_cross_and_export(app, clock, monkeypatch):  # noqa: F811
    import finlit.advanced.api as A
    from finlit.advanced import table as T
    t = advanced_table()

    async def fake_get_table(_store, force=False):
        return t
    monkeypatch.setattr(A, "get_table", fake_get_table)
    T.reset()
    async with new_client(app) as anon:
        assert await burst(anon, "/api/advanced/cross", {"pair": "1.9"}, A.CROSS_VISITOR) == [403] * A.CROSS_VISITOR   # Silver chart: plan answer unchanged
        assert limited(await anon.post("/api/advanced/cross", json={"pair": "1.9"}))
        assert await burst(anon, "/api/advanced/export", {"pair": "1.9"}, A.EXPORT_VISITOR) == [403] * A.EXPORT_VISITOR
        assert limited(await anon.post("/api/advanced/export", json={"pair": "1.9"}))
    silver = await signed_in(app, "rl-adv@example.com", plan="silver")              # a member on the same IP is not caught by the visitor's budget
    r = await silver.post("/api/advanced/cross", json={"pair": "1.9"})
    assert r.status_code == 200 and r.json()["n"] == 39
    assert (await silver.post("/api/advanced/export", json={"mode": "cross", "pair": "1.9"})).status_code == 200
    await silver.aclose()
