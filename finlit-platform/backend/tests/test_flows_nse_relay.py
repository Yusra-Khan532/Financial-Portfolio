"""26 Nov 2026: the flows-nse job failed 22 runs in a row (from 25 Nov) and was held: NSE refused the AWS server's address for its FII/DII report API,
and this was the one NSE fetch with no fallback to FinLit's relay. Now a refused or dropped request is asked again through the relay, which fetches
NSE's home page for the cookie and then the API (deploy/amfi-relay)."""
import httpx
import pytest

from finlit import flows

REPORT = '[{"category":"FII/FPI","date":"26-Nov-2026","buyValue":"1","sellValue":"2","netValue":"-1"}]'


def transport(relay_answer=None):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.host)
        if request.url.host == "relay.example":
            assert request.headers["x-relay-key"] == "k" and request.url.params["u"] == flows.NSE_FIIDII
            return relay_answer or httpx.Response(200, text=REPORT, headers={"x-relay": "1"})
        return httpx.Response(403, text="Access Denied")          # NSE refuses the server
    t = httpx.MockTransport(handler)
    t.seen = seen
    return t


@pytest.fixture(autouse=True)
def no_waits(monkeypatch):
    async def instant(_s):
        return None
    monkeypatch.setattr(flows.asyncio, "sleep", instant)


async def test_nse_refuses_the_server_and_the_relay_brings_the_report():
    t = transport()
    src = flows.Sources(transport=t, relay=("https://relay.example", "k"))
    try:
        assert await src.nse_json() == REPORT
    finally:
        await src.aclose()
    assert {"www.nseindia.com", "relay.example"} <= set(t.seen)        # the hosts asked: NSE first, then the relay (a set check, not a URL test)


async def test_a_relay_that_could_not_reach_nse_is_not_taken_for_nses_answer():
    t = transport(httpx.Response(502, text="", headers={"x-relay": "1", "x-relay-error": "exchange unreachable"}))
    src = flows.Sources(transport=t, relay=("https://relay.example", "k"))
    try:
        with pytest.raises(RuntimeError, match="did not answer"):
            await src.nse_json()
    finally:
        await src.aclose()


async def test_without_a_relay_the_failure_says_so():
    src = flows.Sources(transport=transport(), relay=())
    try:
        with pytest.raises(RuntimeError, match="no relay is set"):
            await src.nse_json()
    finally:
        await src.aclose()


async def test_a_redirect_from_the_relay_is_never_followed_from_the_server():
    """27 Nov 2026: NSE moved its API to www.nseindia.in. An older relay handed the 302 back; following it sent the AWS server to NSE (refused,
    40 failed runs, the answer with no x-relay header). The relay now follows the hop itself; a redirect it hands back is a relay failure."""
    t = transport(httpx.Response(302, headers={"x-relay": "1", "location": "https://www.nseindia.in/api/fiidiiTradeReact"}))
    src = flows.Sources(transport=t, relay=("https://relay.example", "k"))
    try:
        with pytest.raises(RuntimeError, match="did not answer"):
            await src.nse_json()
    finally:
        await src.aclose()
    assert "www.nseindia.in" not in t.seen


def test_the_relay_follows_nse_to_nseindia_in_with_that_hosts_cookie():
    from pathlib import Path
    js = (Path(__file__).resolve().parents[2] / "deploy" / "amfi-relay" / "worker.js").read_text()
    assert "nseindia\\.in" in js and "MAX_HOPS" in js and "nseCookie(ua, target.hostname)" in js and 'redirect: "manual"' in js
