"""Task #281: the portfolio job's AMFI requests (fund houses, schemes, scheme details with the exit load, the fund-performance POSTs with benchmark and
risk-o-meter) and Baroda BNP Paribas's portfolio files ended in ConnectTimeout every night, because they went to the sites directly while the AWS server
reaches them only through the relay (deploy/amfi-relay). portfolios.make_client() now sends them through it; with no relay set nothing changes.
Fake transports only: no network, no database."""
import re
from pathlib import Path

import httpx
import pytest

from finlit import portfolios as P
from finlit.disclosure_parsers import amfi

HSBC_ROW = {"schemeName": "HSBC Small Cap Fund", "benchmark": "Nifty Smallcap 250 TRI", "riskometerScheme": "Very High", "riskometerBenchmark": "Very High",
            "navDate": "19-Nov-2026", "navRegular": 89.7123, "navDirect": 101.0485, "return5YearDirect": 15.956594, "dailyAUM": 18720.74}


def recorder(seen, reply=None):
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append({"method": request.method, "url": str(request.url), "key": request.headers.get("x-relay-key"), "body": request.content,
                     "ctype": request.headers.get("content-type"), "fwd_ua": request.headers.get("x-fwd-user-agent")})
        return reply(request) if reply else httpx.Response(200, json={"validationStatus": "SUCCESS", "data": [HSBC_ROW]})
    return handler


def no_relay(monkeypatch):
    for k in ("AMFI_RELAY_URL", "AMFI_RELAY_KEY", "EXCHANGE_RELAY_URL", "EXCHANGE_RELAY_KEY"):
        monkeypatch.delenv(k, raising=False)


def with_relay(monkeypatch):
    no_relay(monkeypatch)
    monkeypatch.setenv("AMFI_RELAY_URL", "https://relay.test/")
    monkeypatch.setenv("AMFI_RELAY_KEY", "k-test")


@pytest.mark.asyncio
async def test_without_a_relay_every_request_goes_to_the_site_itself(monkeypatch):
    no_relay(monkeypatch)
    seen = []
    async with P.make_client(httpx.MockTransport(recorder(seen))) as c:
        await P.get_json(c, P.URL_PERF, method="POST", json={"category": 1})
        await P.get_json(c, P.URL_DETAILS, params={"MF_ID": "1", "scheme_id": "2"})
    assert [s["url"] for s in seen] == [P.URL_PERF, P.URL_DETAILS + "?MF_ID=1&scheme_id=2"]
    assert all(s["key"] is None for s in seen)


@pytest.mark.asyncio
async def test_the_fund_performance_post_goes_through_the_relay_with_its_json_body_and_the_key(monkeypatch):
    with_relay(monkeypatch)
    seen = []
    async with P.make_client(httpx.MockTransport(recorder(seen))) as c:
        j = await P.get_json(c, P.URL_PERF, method="POST", json={"maturityType": 1, "category": 1, "subCategory": 6, "mfid": 0, "reportDate": "19-Nov-2026"})
        await P.get_json(c, P.URL_PERF_SUB, method="POST", json={"category": 1})
    assert seen[0]["method"] == "POST" and seen[0]["url"] == "https://relay.test/gateway/pollingsebi/api/amfi/fundperformance"
    assert b'"subCategory":6' in seen[0]["body"].replace(b" ", b"") and seen[0]["ctype"] == "application/json" and seen[0]["key"] == "k-test"
    assert seen[1]["url"] == "https://relay.test/gateway/pollingsebi/api/amfi/getsubcategory"
    rows = amfi.parse_performance(j)
    assert [(r.name, r.benchmark, r.risk_scheme, r.risk_benchmark, r.aum_crore) for r in rows] == [
        ("HSBC Small Cap Fund", "Nifty Smallcap 250 TRI", "Very High", "Very High", 18720.74)]


@pytest.mark.asyncio
async def test_the_exit_load_requests_go_through_the_relay(monkeypatch):
    with_relay(monkeypatch)
    seen = []
    async with P.make_client(httpx.MockTransport(recorder(seen, lambda r: httpx.Response(200, json=[])))) as c:
        for url, params in ((P.URL_MF_LIST, None), (P.URL_SCHEMES, {"MF_ID": "53"}), (P.URL_DETAILS, {"MF_ID": "53", "scheme_id": "9"})):
            await P.get_json(c, url, params=params)
    assert [s["url"] for s in seen] == ["https://relay.test/api/populate-mf", "https://relay.test/api/populate-scheme?MF_ID=53",
                                        "https://relay.test/api/scheme-details?MF_ID=53&scheme_id=9"]
    assert {s["method"] for s in seen} == {"GET"} and {s["key"] for s in seen} == {"k-test"}


@pytest.mark.asyncio
async def test_a_baroda_bnp_file_comes_through_the_relays_fetch_route_byte_for_byte(monkeypatch, tmp_path):
    with_relay(monkeypatch)
    xlsx = b"PK\x03\x04" + bytes(range(256)) * 40
    seen = []
    url = "https://www.barodabnpparibasmf.in/download_documents/BOBBNPMF_Monthly_Portfolio_31-10-2026.xlsx"
    async with P.make_client(httpx.MockTransport(recorder(seen, lambda r: httpx.Response(200, content=xlsx)))) as c:
        n = await P.download(c, url, str(tmp_path / "f.xlsx"))
    assert n == len(xlsx) and (tmp_path / "f.xlsx").read_bytes() == xlsx
    assert seen[0]["url"] == str(httpx.URL("https://relay.test/fetch", params={"u": url})) and seen[0]["key"] == "k-test" and seen[0]["fwd_ua"]


@pytest.mark.asyncio
async def test_a_redirect_from_the_fetch_route_is_followed_on_the_original_site_and_relayed_again(monkeypatch):
    with_relay(monkeypatch)
    seen = []

    def reply(r):
        return httpx.Response(302, headers={"Location": "/downloads/new-page"}) if len(seen) == 1 else httpx.Response(200, text="ok")
    async with P.make_client(httpx.MockTransport(recorder(seen, reply))) as c:
        r = await c.get("https://www.barodabnpparibasmf.in/downloads/monthly-portfolio-scheme")
    assert r.text == "ok"
    assert seen[1]["url"] == str(httpx.URL("https://relay.test/fetch", params={"u": "https://www.barodabnpparibasmf.in/downloads/new-page"}))


@pytest.mark.asyncio
async def test_other_sites_are_never_relayed(monkeypatch):
    with_relay(monkeypatch)
    seen = []
    async with P.make_client(httpx.MockTransport(recorder(seen, lambda r: httpx.Response(200, text="x")))) as c:
        await c.get("https://amc.ppfas.com/downloads/portfolio-disclosure/")
        await c.get("https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0")
    assert [s["url"] for s in seen] == ["https://amc.ppfas.com/downloads/portfolio-disclosure/", "https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0"]
    assert all(s["key"] is None for s in seen)


def test_the_relay_worker_allows_exactly_these_amfi_paths_methods_and_hosts():
    src = (Path(__file__).resolve().parents[2] / "deploy" / "amfi-relay" / "worker.js").read_text()
    get_rules = re.findall(r"/\^\\/api\\/([a-z-]+)\$/", src)
    assert set(get_rules) == {"populate-ter-month", "populate-te-rdata-revised", "average-aum-schemewise", "populate-mf", "populate-scheme", "scheme-details"}
    post_block = src[src.index("const AMFI_POST"):src.index("];", src.index("const AMFI_POST"))]
    assert "fundperformance" in post_block and "getsubcategory" in post_block and post_block.count("/^") == 2
    assert "barodabnpparibasmf\\.in" in src
    assert 'request.method !== "GET" && request.method !== "POST"' in src          # PUT, DELETE ... still refused
    assert "X-Relay-Key" in src and "POST_MAX_BYTES" in src
