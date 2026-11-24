"""Outbound fetches to addresses that come from outside (a company's website, an annual-report address): connect only to a public address, and only to
the very address that was checked.

Checking a host name and then letting the HTTP client look the name up again leaves a gap (DNS rebinding): the second answer can be 127.0.0.1, a 10.x
address or the cloud metadata address 169.254.169.254. PinnedTransport closes it. The name is resolved once for each new connection, inside the
connection step itself; every address in the answer must be public; the socket is then opened to one of those checked addresses, never to a fresh
lookup. The URL keeps the host name, so the Host header, the TLS server name (SNI) and the certificate check are for the name, exactly as before.
Every redirect hop is a new request through the same transport, so it is checked the same way.

The fetchers keep their own earlier check too: it gives the readable reason ("resolves to a private or reserved address"); this transport is what makes
the check binding.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from typing import Awaitable, Callable, Iterable, List, Optional

import anyio
import httpcore
import httpx

Resolver = Callable[[str], Awaitable[List[str]]]


class UnsafeAddress(httpcore.ConnectError):
    """The host name resolved to an address that is not public. Seen by callers as httpx.ConnectError (no connection was made)."""


def unsafe_address(addr: str) -> bool:
    """True for anything that is not a plain public unicast address: private, loopback, link-local (and so the metadata address), reserved, shared
    (100.64/10), unspecified, multicast, an IPv4 address wrapped in IPv6 that is one of those, or text that is not an address."""
    try:
        ip = ipaddress.ip_address(addr.split("%")[0])
    except ValueError:
        return True
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return not ip.is_global or ip.is_multicast


async def resolve(host: str) -> List[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    return list(dict.fromkeys(i[4][0] for i in infos))


async def public_addresses(host: str, resolver: Optional[Resolver] = None, timeout: Optional[float] = None) -> List[str]:
    """The addresses `host` resolves to, once, when every one of them is public. Raises httpcore.ConnectError when the name does not resolve,
    httpcore.ConnectTimeout when the lookup takes longer than `timeout`, and UnsafeAddress when any address is not public."""
    try:
        with anyio.fail_after(timeout):
            addrs = list(await (resolver or resolve)(host))
    except TimeoutError as exc:
        raise httpcore.ConnectTimeout(f"{host}: the name lookup timed out") from exc
    except httpcore.ConnectError:
        raise
    except Exception as exc:
        raise httpcore.ConnectError(f"{host} does not resolve ({type(exc).__name__})") from exc
    if not addrs or any(unsafe_address(a) for a in addrs):
        raise UnsafeAddress(f"{host} resolves to a private or reserved address")
    return addrs


def _sockets() -> httpcore.AsyncNetworkBackend:
    """The real socket layer (replaced in tests)."""
    return httpcore.AnyIOBackend()


class _PinnedBackend(httpcore.AsyncNetworkBackend):
    """httpcore's socket layer with the lookup done here: the connection goes to a checked address, the host name stays on the request."""

    def __init__(self, resolver: Optional[Resolver], inner: httpcore.AsyncNetworkBackend):
        self._resolver = resolver
        self._inner = inner

    async def connect_tcp(self, host: str, port: int, timeout: Optional[float] = None, local_address: Optional[str] = None,
                          socket_options: Optional[Iterable] = None) -> httpcore.AsyncNetworkStream:
        last: Optional[Exception] = None
        for ip in await public_addresses(host, self._resolver, timeout):
            try:
                return await self._inner.connect_tcp(ip, port, timeout=timeout, local_address=local_address, socket_options=socket_options)
            except httpcore.ConnectError as exc:        # refused or unreachable: the next checked address (as the plain client would)
                last = exc
        raise last or httpcore.ConnectError(f"{host}: no address to connect to")

    async def connect_unix_socket(self, path: str, timeout: Optional[float] = None, socket_options: Optional[Iterable] = None) -> httpcore.AsyncNetworkStream:
        raise UnsafeAddress("a local socket is never used for an outside address")

    async def sleep(self, seconds: float) -> None:
        await self._inner.sleep(seconds)


class PinnedTransport(httpx.AsyncHTTPTransport):
    """httpx's ordinary transport (TLS verified against the host name, the same connection limits) whose connections go only to the public address
    that was checked. `resolver` (async host -> addresses) is replaced in tests. No proxy is used: a proxy would make its own lookup."""

    def __init__(self, resolver: Optional[Resolver] = None, backend: Optional[httpcore.AsyncNetworkBackend] = None):
        super().__init__(trust_env=False)
        limits = httpx.Limits(max_connections=100, max_keepalive_connections=20, keepalive_expiry=5.0)     # httpx's defaults
        self._pool = httpcore.AsyncConnectionPool(
            ssl_context=httpx.create_ssl_context(trust_env=True),
            max_connections=limits.max_connections,
            max_keepalive_connections=limits.max_keepalive_connections,
            keepalive_expiry=limits.keepalive_expiry,
            network_backend=_PinnedBackend(resolver, backend or _sockets()),
        )
