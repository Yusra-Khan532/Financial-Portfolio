"""Monitoring (docs/MONITORING.md): the public status page shows only names, up/down and the share of good checks; the admin view is admin-only;
the ingest takes only the listed fields and only with the right X-Monitor-Key."""
import json
import time

import httpx
import pytest

from finlit import monitoring as M
from test_auth import make_admin, new_client, signed_in
from test_auth import app  # noqa: F401
from test_integration import ingested, store  # noqa: F401

RAW = [
    {"key": "site_home", "name": "Home page", "group": "site", "results": [
        {"success": True, "duration": 120_000_000, "timestamp": "2026-11-24T05:00:00Z", "errors": []},
        {"success": False, "duration": 9_000_000_000, "timestamp": "2026-11-24T05:01:00Z", "errors": ["dial tcp 10.0.0.5:8000: connection refused"],
         "hostname": "app", "conditionResults": [{"condition": "[STATUS] == 200", "success": False}]}],
     "events": [{"type": "START", "timestamp": "2026-11-24T04:00:00Z"}, {"type": "UNHEALTHY", "timestamp": "2026-11-24T05:01:00Z"}]},
    {"key": "api_health", "name": "API health", "group": "api", "results": [{"success": True, "duration": 80_000_000, "timestamp": "2026-11-24T05:01:00Z"}], "events": []},
]


def test_summarize_and_public_view_hide_internals():
    rows = M.summarize(RAW)
    home = rows[0]
    assert home["up"] is False and home["latencyMs"] == 9000 and home["goodPct"] == 50.0 and home["checks"] == 2
    assert "connection refused" in home["errors"][0]                     # the admin sees why
    pub = M.public_view(rows)
    assert set(pub[0]) == {"name", "up", "goodPct", "checks", "checkedAt"}
    text = json.dumps(pub)
    for leak in ("10.0.0.5", "connection refused", "app", "STATUS", "latency", "site_home"):
        assert leak not in text.replace("checkedAt", "")
    assert M.incidents(rows) == [{"name": "Home page", "type": "UNHEALTHY", "at": "2026-11-24T05:01:00Z"}]
    assert M.summarize("not a list") == [] and M.summarize([{"name": "x"}])[0]["up"] is None


def test_ingest_key_rules():
    good = "k" * 32
    assert M.key_ok(good, {"MONITOR_INGEST_KEY": good})
    assert not M.key_ok("wrong" * 8, {"MONITOR_INGEST_KEY": good})
    assert not M.key_ok(None, {"MONITOR_INGEST_KEY": good})
    assert not M.key_ok("", {"MONITOR_INGEST_KEY": ""})                  # no key on the server: nothing is accepted
    assert not M.key_ok("short", {"MONITOR_INGEST_KEY": "short"})        # a short key is refused too


async def test_gatus_down_reads_as_a_note(monkeypatch):
    M._cache.clear()

    def boom(request):
        raise httpx.ConnectError("no gatus")
    async with httpx.AsyncClient(transport=httpx.MockTransport(boom)) as c:
        rows, why = await M.gatus_rows(c)
    assert rows is None and "not answering" in why
    M._cache.clear()
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=RAW))) as c:
        rows, why = await M.gatus_rows(c)
    assert why is None and len(rows) == 2
    M._cache.clear()


def test_public_rate_limit():
    M._hits.clear()
    assert not any(M._limited("1.2.3.4") for _ in range(M.PUBLIC_PER_MIN))
    assert M._limited("1.2.3.4") and not M._limited("5.6.7.8")
    M._hits.clear()


@pytest.mark.integration
async def test_endpoints(app, monkeypatch):  # noqa: F811
    from finlit.auth import crypto
    M._cache.clear()
    M._cache["gatus"] = (time.monotonic(), (M.summarize(RAW), None))
    key = "m" * 40
    monkeypatch.setenv("MONITOR_INGEST_KEY", key)
    async with new_client(app) as anon:
        r = await anon.get("/api/status/public")
        assert r.status_code == 200 and "10.0.0.5" not in r.text and "connection refused" not in r.text
        assert [c["name"] for c in r.json()["checks"]] == ["Home page", "API health"] and r.json()["allUp"] is False
        assert (await anon.get("/api/admin/monitoring")).status_code == 401
        body = {"kind": "outside", "outside": {"ok": True, "status": 200, "ms": 312, "version": "abc1234", "failsInARow": 0}}
        assert (await anon.post("/api/monitor/ingest", json=body)).status_code == 401
        assert (await anon.post("/api/monitor/ingest", json=body, headers={"X-Monitor-Key": "nope"})).status_code == 401
        assert (await anon.post("/api/monitor/ingest", json={**body, "role": "admin"}, headers={"X-Monitor-Key": key})).status_code == 422
        assert (await anon.post("/api/monitor/ingest", json=body, headers={"X-Monitor-Key": key})).status_code == 200
        k6 = {"kind": "k6", "k6": {"run": "smoke", "passed": True, "requests": 420, "p95Ms": 512.3, "avgMs": 210.0, "errorPct": 0.0, "vus": 2,
                                   "runUrl": "https://github.com/Yusra-Khan532/Financial-Portfolio/actions/runs/1"}}
        assert (await anon.post("/api/monitor/ingest", json=k6, headers={"X-Monitor-Key": key})).status_code == 200
        bad = {"kind": "k6", "k6": {**k6["k6"], "runUrl": "https://evil.example/x"}}
        assert (await anon.post("/api/monitor/ingest", json=bad, headers={"X-Monitor-Key": key})).status_code == 422
    user = await signed_in(app, "mon-member@example.com")
    assert (await user.get("/api/admin/monitoring")).status_code == 403
    boss = await make_admin(app, "mon-boss@example.com")
    secret = (await boss.post("/api/me/mfa/setup")).json()["secret"]
    await boss.post("/api/me/mfa/enable", json={"code": crypto.totp_code(secret, int(time.time()) // 30)})
    m = (await boss.get("/api/admin/monitoring")).json()
    assert m["checks"][0]["errors"] and m["incidents"][0]["type"] == "UNHEALTHY"
    assert m["outside"]["ok"] is True and m["outside"]["ms"] == 312 and m["outsideRecent"][0]["version"] == "abc1234"
    assert m["k6"]["p95Ms"] == 512.3 and m["k6"]["run"] == "smoke"
    M._cache.clear()
