"""Outbound fetches connect only to the public address that was checked (DNS rebinding): finlit.netguard, used by the logo fetcher (finlit.logos) and the
company-brief fetcher (finlit.company_brief.service). A fake socket layer stands in for the network: it records the address every connection is opened to
and the Host header and TLS server name it was asked with, and answers plain HTTP. Nothing here reaches the network."""
import ssl

import httpcore
import httpx
import pytest

from finlit import logos, netguard
from finlit.company_brief import service as S
from test_logos import png

PUBLIC = "93.184.216.34"
INTERNAL = ("127.0.0.1", "169.254.169.254", "10.0.0.5")


class FakeStream(httpcore.AsyncNetworkStream):
    def __init__(self, net, ip):
        self.net, self.ip, self.sent, self.out, self.sni, self.ctx = net, ip, b"", b"", None, None

    async def write(self, data, timeout=None):
        self.sent += data

    async def read(self, max_bytes, timeout=None):
        if not self.out and b"\r\n\r\n" in self.sent:
            head, _, self.sent = self.sent.partition(b"\r\n\r\n")
            lines = head.decode().split("\r\n")
            path = lines[0].split()[1]
            hdrs = {k.lower(): v for k, v in (ln.split(": ", 1) for ln in lines[1:])}
            self.net.requests.append({"ip": self.ip, "host": hdrs.get("host"), "path": path, "sni": self.sni, "ctx": self.ctx})
            st, body, extra = self.net.routes.get(f"{hdrs.get('host')}{path}", (404, b"", {}))
            hd = "".join(f"{k}: {v}\r\n" for k, v in extra.items())
            self.out = f"HTTP/1.1 {st} X\r\nContent-Length: {len(body)}\r\n{hd}\r\n".encode() + body
        out, self.out = self.out[:max_bytes], self.out[max_bytes:]
        return out

    async def start_tls(self, ssl_context, server_hostname=None, timeout=None):
        self.sni, self.ctx = server_hostname, ssl_context
        return self

    async def aclose(self):
        pass

    def get_extra_info(self, info):
        return None


class FakeSockets(httpcore.AsyncNetworkBackend):
    """routes: 'host/path' -> (status, body, headers)."""

    def __init__(self, routes=None):
        self.routes, self.connects, self.requests = routes or {}, [], []

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        self.connects.append((host, port))
        return FakeStream(self, host)

    async def connect_unix_socket(self, path, timeout=None, socket_options=None):
        raise AssertionError("no unix socket")

    async def sleep(self, seconds):
        pass


@pytest.fixture
def sockets(monkeypatch):
    """The fake socket layer behind every PinnedTransport the code under test builds for itself, and a fake default lookup (public) so that no test
    asks the real DNS; a test that needs another answer replaces netguard.resolve again."""
    net = FakeSockets()

    async def public(host):
        return [PUBLIC]
    monkeypatch.setattr(netguard, "_sockets", lambda: net)
    monkeypatch.setattr(netguard, "resolve", public)
    return net


def rebinding(answers):
    """A resolver whose answer changes from one lookup to the next (per host), the way a rebinding DNS server answers: the first lookup (the
    fetcher's own check) sees a public address, the next one would be internal."""
    calls = {}

    async def resolve(host):
        n = calls.get(host, 0)
        calls[host] = n + 1
        a = answers.get(host, [[PUBLIC]])
        return list(a[n % len(a)])
    resolve.calls = calls
    return resolve


async def nosleep(_):
    return None


@pytest.fixture(autouse=True)
def no_pause(monkeypatch):
    monkeypatch.setattr(logos, "PAUSE", 0)


# ------------------------------------------------------------------------------------------------ the address rule
@pytest.mark.parametrize("addr", ["127.0.0.1", "10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
                                  "::1", "fe80::1%eth0", "fd00::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "not-an-ip", ""])
def test_unsafe_addresses(addr):
    assert netguard.unsafe_address(addr)


@pytest.mark.parametrize("addr", [PUBLIC, "8.8.8.8", "2606:4700:4700::1111", "::ffff:93.184.216.34"])
def test_public_addresses(addr):
    assert not netguard.unsafe_address(addr)


# ------------------------------------------------------------------------------------------------ the transport itself
async def test_connection_goes_to_the_checked_address_with_the_host_name_kept_for_tls():
    net = FakeSockets({"www.example.com/x": (200, b"hello", {})})

    async def resolve(host):
        return [PUBLIC]
    async with httpx.AsyncClient(transport=netguard.PinnedTransport(resolver=resolve, backend=net)) as c:
        r = await c.get("https://www.example.com/x")
    assert r.status_code == 200 and r.content == b"hello"
    assert net.connects == [(PUBLIC, 443)]                                  # the socket went to the address that was checked
    req = net.requests[0]
    assert req["host"] == "www.example.com" and req["sni"] == "www.example.com"      # Host header and TLS name stay the host name
    assert req["ctx"].verify_mode == ssl.CERT_REQUIRED and req["ctx"].check_hostname  # and the certificate is checked against it


@pytest.mark.parametrize("bad", INTERNAL)
async def test_an_internal_answer_at_connect_time_is_refused_before_any_socket(bad):
    net = FakeSockets()

    async def resolve(host):
        return [bad]
    async with httpx.AsyncClient(transport=netguard.PinnedTransport(resolver=resolve, backend=net)) as c:
        with pytest.raises(httpx.ConnectError, match="private or reserved"):
            await c.get("https://www.example.com/")
    assert net.connects == []


async def test_one_internal_address_among_public_ones_refuses_the_host():
    net = FakeSockets()

    async def resolve(host):
        return [PUBLIC, "169.254.169.254"]
    async with httpx.AsyncClient(transport=netguard.PinnedTransport(resolver=resolve, backend=net)) as c:
        with pytest.raises(httpx.ConnectError):
            await c.get("https://www.example.com/")
    assert net.connects == []


async def test_a_name_that_does_not_resolve_is_a_connect_error():
    async def resolve(host):
        raise OSError("Name or service not known")
    async with httpx.AsyncClient(transport=netguard.PinnedTransport(resolver=resolve, backend=FakeSockets())) as c:
        with pytest.raises(httpx.ConnectError, match="does not resolve"):
            await c.get("https://nowhere.example/")


# ------------------------------------------------------------------------------------------------ the logo fetcher
@pytest.mark.parametrize("bad", INTERNAL)
async def test_logos_rebinding_host_is_never_connected_to(sockets, bad):
    """The fetcher's own check sees a public address; the lookup made for the connection answers an internal one. Before the fix the client connected
    to whatever the second lookup said; now that lookup is the one checked, so nothing is connected to at all."""
    resolve = rebinding({"www.example.com": [[PUBLIC], [bad]]})
    sockets.routes = {"www.example.com/": (200, b"<html></html>", {})}
    f = logos.Fetcher(resolver=resolve)
    res = await logos.fetch_logo(f, "www.example.com")
    await f.aclose()
    assert sockets.connects == [] and res["status"] in ("none", "rejected")
    assert resolve.calls["www.example.com"] >= 2                            # it was asked again at connect time, and that answer was refused


async def test_logos_redirect_to_a_rebinding_host_is_refused(sockets):
    """Each redirect hop is checked the same way: a hop to a host whose connect-time answer is the metadata address is never connected to."""
    resolve = rebinding({"cdn.example.net": [[PUBLIC], ["169.254.169.254"]]})
    sockets.routes = {"www.example.com/robots.txt": (404, b"", {}), "www.example.com/": (200, b'<link rel="icon" href="/i.png" sizes="64x64">', {}),
                      "www.example.com/i.png": (302, b"", {"location": "https://cdn.example.net/i.png"})}
    f = logos.Fetcher(resolver=resolve)
    res = await logos.fetch_logo(f, "www.example.com")
    await f.aclose()
    assert {ip for ip, _ in sockets.connects} == {PUBLIC}
    assert all(r["host"] == "www.example.com" for r in sockets.requests)     # cdn.example.net was never reached
    assert res["status"] == "none"


async def test_logos_redirect_to_a_private_address_is_refused(sockets):
    async def resolve(host):
        return ["10.1.2.3"] if host == "internal.example" else [PUBLIC]
    sockets.routes = {"www.example.com/robots.txt": (404, b"", {}), "www.example.com/": (302, b"", {"location": "https://internal.example/"})}
    f = logos.Fetcher(resolver=resolve)
    res = await logos.fetch_logo(f, "www.example.com")
    await f.aclose()
    assert res["status"] == "rejected" and "private" in res["note"]
    assert {ip for ip, _ in sockets.connects} == {PUBLIC}


async def test_logos_public_site_still_works_through_the_pinned_transport(sockets):
    async def resolve(host):
        return [PUBLIC]
    sockets.routes = {"www.example.com/robots.txt": (200, b"User-agent: *\nAllow: /\n", {}),
                      "www.example.com/": (200, b'<link rel="apple-touch-icon" href="/t.png">', {}),
                      "www.example.com/t.png": (200, png(180, 180), {"content-type": "image/png"})}
    f = logos.Fetcher(resolver=resolve)
    res = await logos.fetch_logo(f, "www.example.com")
    await f.aclose()
    assert res["status"] == "ok" and res["width"] == 180 and res["source_url"] == "https://www.example.com/t.png"
    assert {ip for ip, _ in sockets.connects} == {PUBLIC}
    assert {(r["host"], r["sni"]) for r in sockets.requests} == {("www.example.com", "www.example.com")}


# ------------------------------------------------------------------------------------------------ the company-brief fetcher
SITE = "www.acme-site.example"
PDF = b"%PDF-1.4 a report"


def brief_fetcher(**kw):
    return S.BriefFetcher(extra_hosts=[SITE, "files.acme-cdn.example"], resolve=lambda h: [PUBLIC], budget=40, sleep=nosleep, pause=0, relay=None, **kw)


@pytest.mark.parametrize("bad", INTERNAL)
async def test_brief_rebinding_host_is_never_connected_to(sockets, monkeypatch, bad):
    """host_ok() resolves the name and sees a public address; the connection's own lookup answers an internal one and is refused."""
    monkeypatch.setattr(netguard, "resolve", rebinding({SITE: [[bad]]}))
    sockets.routes = {f"{SITE}/ar.pdf": (200, PDF, {})}
    f = brief_fetcher()
    data, info = await f.fetch(f"https://{SITE}/ar.pdf")
    await f.aclose()
    assert data is None and info["outcome"] != "ok"
    assert sockets.connects == []


async def test_brief_redirect_to_a_rebinding_host_is_refused(sockets, monkeypatch):
    monkeypatch.setattr(netguard, "resolve", rebinding({SITE: [[PUBLIC]], "files.acme-cdn.example": [["10.0.0.5"]]}))
    sockets.routes = {f"{SITE}/robots.txt": (404, b"", {}), f"{SITE}/ar.pdf": (302, b"", {"location": "https://files.acme-cdn.example/ar.pdf"}),
                      "files.acme-cdn.example/ar.pdf": (200, PDF, {})}
    f = brief_fetcher()
    data, info = await f.fetch(f"https://{SITE}/ar.pdf")
    await f.aclose()
    assert data is None and info["outcome"] != "ok"
    assert {ip for ip, _ in sockets.connects} == {PUBLIC}
    assert all(r["host"] == SITE for r in sockets.requests)


async def test_brief_redirect_to_a_private_address_is_refused(sockets):
    f = S.BriefFetcher(extra_hosts=[SITE, "intranet.acme.example"], resolve=lambda h: ["10.0.0.5"] if h.startswith("intranet") else [PUBLIC],
                       budget=40, sleep=nosleep, pause=0, relay=None)
    sockets.routes = {f"{SITE}/robots.txt": (404, b"", {}), f"{SITE}/ar.pdf": (302, b"", {"location": "https://intranet.acme.example/ar.pdf"})}
    data, info = await f.fetch(f"https://{SITE}/ar.pdf")
    await f.aclose()
    assert data is None and info["outcome"] == "not_allowed"


async def test_brief_public_report_still_downloads_through_the_pinned_transport(sockets, monkeypatch):
    async def resolve(host):
        return [PUBLIC]
    monkeypatch.setattr(netguard, "resolve", resolve)
    sockets.routes = {f"{SITE}/robots.txt": (404, b"", {}), f"{SITE}/ar.pdf": (200, PDF, {})}
    f = brief_fetcher()
    data, info = await f.fetch(f"https://{SITE}/ar.pdf")
    await f.aclose()
    assert data == PDF and info["outcome"] == "ok"
    assert {ip for ip, _ in sockets.connects} == {PUBLIC}
    assert {(r["host"], r["sni"]) for r in sockets.requests} == {(SITE, SITE)}


def test_both_fetchers_use_the_pinned_transport_by_default():
    f = logos.Fetcher()
    b = S.BriefFetcher(relay=None)
    assert isinstance(f.http._transport, netguard.PinnedTransport) and isinstance(b._client._transport, netguard.PinnedTransport)
