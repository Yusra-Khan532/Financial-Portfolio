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
    assert {"www.nseindia.in", "relay.example"} <= set(t.seen)        # the hosts asked: NSE first, then the relay (a set check, not a URL test)


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
    t = transport(httpx.Response(302, headers={"x-relay": "1", "location": "https://moved.nseindia.example/api/fiidiiTradeReact"}))
    src = flows.Sources(transport=t, relay=("https://relay.example", "k"))
    try:
        with pytest.raises(RuntimeError, match="did not answer"):
            await src.nse_json()
    finally:
        await src.aclose()
    assert "moved.nseindia.example" not in t.seen                     # the relay's redirect is never followed from the server


def test_the_relay_follows_nse_to_nseindia_in_with_that_hosts_cookie():
    from pathlib import Path
    js = (Path(__file__).resolve().parents[2] / "deploy" / "amfi-relay" / "worker.js").read_text()
    assert "nseindia\\.in" in js and "MAX_HOPS" in js and "nseCookie(ua, target.hostname)" in js and 'redirect: "manual"' in js


def test_the_report_is_asked_at_nseindia_in_and_27_nov_reads_as_the_page_shows():
    """28 Nov 2026: NSE serves the FII/DII report from www.nseindia.in (NSE refuses AWS and Cloudflare at .com). Figures as the page showed them for
    27-Nov-2026 (NSE + BSE + MSEI, Rs crore): DII 17,263.65 / 17,820.07 / -556.42; FII/FPI 14,259.45 / 12,625.12 / 1,634.33."""
    from finlit import flows_sources as S
    assert flows.NSE_FIIDII == "https://www.nseindia.in/api/fiidiiTradeReact" and flows.NSE_HOME == "https://www.nseindia.in/"
    for fmt in ("{:.2f}", "{:,.2f}"):
        v = lambda x: fmt.format(x)   # noqa: E731  (plain, and with comma grouping)
        body = ('[{"category":"DII","date":"27-Nov-2026","buyValue":"%s","sellValue":"%s","netValue":"%s"},'
                '{"category":"FII/FPI","date":"27-Nov-2026","buyValue":"%s","sellValue":"%s","netValue":"%s"}]'
                % (v(17263.65), v(17820.07), v(-556.42), v(14259.45), v(12625.12), v(1634.33)))
        days = S.parse_nse(body)
        assert len(days) == 1 and not days[0].problems and str(days[0].d) == "2026-11-27"
        d = days[0]
        assert (d.fii.buy, d.fii.sell, d.fii.net) == (14259.45, 12625.12, 1634.33)
        assert (d.dii.buy, d.dii.sell, d.dii.net) == (17263.65, 17820.07, -556.42)
