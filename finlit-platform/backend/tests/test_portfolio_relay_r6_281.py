"""Task #281 round 6. The first portfolio run through the redeployed relay (21 Nov) ended: performance "404 Not Found", loads "429 Too Many Requests",
barodabnp "522". Causes and fixes tested here, with fake transports (no network, no database):
- a retried POST went out as GET (get_json popped `method` inside the retried call), and the relay's GET branch has no such path: its own 404;
- AMFI answered 429 to three scheme-details calls at a time: one at a time now, Retry-After honoured, the step stops cleanly after repeated 429s;
- an error now says who answered (the relay itself, Cloudflare, or the site) and by which route;
- Baroda BNP's site refuses Cloudflare's connection (522): the site is then asked directly once, and the error names both routes."""
import httpx
import pytest

from finlit import portfolios as P


def with_relay(monkeypatch):
    for k in ("AMFI_RELAY_URL", "AMFI_RELAY_KEY", "EXCHANGE_RELAY_URL", "EXCHANGE_RELAY_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("AMFI_RELAY_URL", "https://relay.test/")
    monkeypatch.setenv("AMFI_RELAY_KEY", "k-test")


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    async def fast(_s):
        return None
    monkeypatch.setattr(P.asyncio, "sleep", fast)


@pytest.mark.asyncio
async def test_a_retried_post_stays_a_post(monkeypatch):
    """The original bug: after one 429 the retry went out as GET, the relay answered its own 404 and the performance step ended."""
    with_relay(monkeypatch)
    seen = []

    def reply(req):
        seen.append(req.method)
        if len(seen) == 1:
            return httpx.Response(429, headers={"Retry-After": "2"})
        if req.method != "POST":   # what the relay's GET branch says for a gateway path
            return httpx.Response(404, text="not found")
        return httpx.Response(200, json={"validationStatus": "SUCCESS", "data": [{"name": "Large Cap", "id": 1}]})
    async with P.make_client(httpx.MockTransport(reply)) as c:
        j = await P.get_json(c, P.URL_PERF_SUB, method="POST", json={"category": 1})
    assert seen == ["POST", "POST"] and j["data"][0]["id"] == 1


@pytest.mark.asyncio
async def test_retry_after_is_honoured_and_capped(monkeypatch):
    waits = []

    async def rec(s):
        waits.append(s)
    monkeypatch.setattr(P.asyncio, "sleep", rec)
    calls = []

    def reply(req):
        calls.append(1)
        return httpx.Response(429, headers={"Retry-After": "7"}) if len(calls) == 1 else httpx.Response(429, headers={"Retry-After": "900"}) if len(calls) == 2 \
            else httpx.Response(200, json={})
    async with P.make_client(httpx.MockTransport(reply)) as c:
        await P.get_json(c, P.URL_MF_LIST)
    assert waits == [7.0, P.RETRY_AFTER_MAX]


@pytest.mark.asyncio
async def test_an_error_says_who_answered_and_by_which_route(monkeypatch):
    with_relay(monkeypatch)
    async with P.make_client(httpx.MockTransport(lambda r: httpx.Response(404, text="not found", headers={"X-Relay": "1", "X-Relay-Error": "path not allowed"}))) as c:
        with pytest.raises(httpx.HTTPStatusError) as e:
            await P.get_json(c, P.URL_PERF, method="POST", json={})
    msg = P.who_answered(e.value)
    assert msg.startswith("HTTP 404 from the relay itself (path not allowed)") and "via relay /gateway/pollingsebi/api/amfi/fundperformance" in msg
    assert "k-test" not in msg
    async with P.make_client(httpx.MockTransport(lambda r: httpx.Response(404, text="<html>No such page</html>"))) as c:
        with pytest.raises(httpx.HTTPStatusError) as e:
            await P.get_json(c, P.URL_PERF, method="POST", json={})
    msg = P.who_answered(e.value)
    assert msg.startswith("HTTP 404 from www.amfiindia.com through the relay") and "body: <html>No such page</html>" in msg


@pytest.mark.asyncio
async def test_baroda_refusing_cloudflare_is_asked_directly_once(monkeypatch):
    with_relay(monkeypatch)
    seen = []

    def reply(req):
        seen.append(str(req.url))
        if req.url.host == "relay.test":
            return httpx.Response(522, text="error code: 522")
        return httpx.Response(200, text="<html>portfolio page</html>")
    page = "https://www.barodabnpparibasmf.in/downloads/monthly-portfolio-scheme"
    async with P.make_client(httpx.MockTransport(reply)) as c:
        r = await c.get(page)
    assert r.status_code == 200 and "portfolio page" in r.text and r.headers["X-Via"] == "direct (the relay's route answered 522)"
    assert seen[0].startswith("https://relay.test/fetch?u=") and seen[1] == page

    def both_fail(req):
        if req.url.host == "relay.test":
            return httpx.Response(522)
        raise httpx.ConnectTimeout("timed out", request=req)
    async with P.make_client(httpx.MockTransport(both_fail)) as c:
        with pytest.raises(httpx.ConnectError) as e:
            await c.get(page)
    assert "did not answer the relay (Cloudflare 522" in str(e.value) and "nor the server directly" in str(e.value)


class FakeIdx:
    def resolve(self, names):
        return (names[0].lower().replace(" ", "-"), "name")


class FakeConn:
    def __init__(self, store):
        self.store = store

    async def fetch(self, sql, *a):
        if "FROM mf_schemes" in sql:
            return [{"family": f"fund-{i}"} for i in range(20)]
        return []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class FakePool:
    def __init__(self):
        self.stored = []

    def acquire(self):
        return FakeConn(self)


def amfi_reply(refuse_from=None):
    """AMFI's three calls; scheme-details answers 429 from the `refuse_from`-th call on."""
    state = {"details": 0}

    def reply(req):
        p = req.url.path
        if p.endswith("populate-mf"):
            return httpx.Response(200, json=[{"mfId": 9, "mfName": "Test Mutual Fund"}])
        if p.endswith("populate-scheme"):
            return httpx.Response(200, json=[{"scheme_name": f"Fund {i}", "scheme_id": str(100 + i)} for i in range(20)])
        state["details"] += 1
        if refuse_from and state["details"] >= refuse_from:
            return httpx.Response(429)
        return httpx.Response(200, json={"data": [{"Scheme_load": "Exit Load: 1% if redeemed within 1 year", "Launch_Date": "2014-04-22T00:00:00+05:30",
                                                   "Scheme_min_amt": "Rs. 5,000 and in multiples of Re.1 thereafter"}]})
    return reply, state


@pytest.mark.asyncio
async def test_loads_one_at_a_time_store_exit_load_launch_and_minimum(monkeypatch):
    stored = []

    async def put(pool, rows):
        stored.extend(rows)
    monkeypatch.setattr(P, "put_facts", put)
    reply, state = amfi_reply()
    async with P.make_client(httpx.MockTransport(reply)) as c:
        out = await P.step_loads(FakePool(), c, FakeIdx(), P._today())
    assert out["status"] == "ok" and out["loadsStored"] == 20 and out["asked"] == 20
    kinds = {k for _f, k, *_ in stored}
    assert kinds == {"exitload", "launch_details", "min_amount_amfi"}
    mins = [v for _f, k, _d, v, *_ in stored if k == "min_amount_amfi"]
    assert mins[0]["rupees"] == 5000


@pytest.mark.asyncio
async def test_loads_stop_cleanly_after_repeated_429_and_keep_what_was_stored(monkeypatch):
    stored = []

    async def put(pool, rows):
        stored.extend(rows)
    monkeypatch.setattr(P, "put_facts", put)
    reply, state = amfi_reply(refuse_from=4)
    async with P.make_client(httpx.MockTransport(reply)) as c:
        out = await P.step_loads(FakePool(), c, FakeIdx(), P._today())
    assert out["status"] == "partial" and "429" in out["why"] and "next run continues" in out["why"]
    assert out["loadsStored"] == 3 and out["refused429"] == P.LOAD_STOP_AFTER_429
    assert len([1 for _f, k, *_ in stored if k == "exitload"]) == 3    # what was read before the refusals is kept


@pytest.mark.asyncio
async def test_loads_stop_at_the_runs_call_limit(monkeypatch):
    async def put(pool, rows):
        return None
    monkeypatch.setattr(P, "put_facts", put)
    monkeypatch.setattr(P, "LOAD_MAX_CALLS", 5)
    reply, state = amfi_reply()
    async with P.make_client(httpx.MockTransport(reply)) as c:
        out = await P.step_loads(FakePool(), c, FakeIdx(), P._today())
    assert out["status"] == "partial" and out["asked"] == 5 and "15 schemes left" in out["why"]
