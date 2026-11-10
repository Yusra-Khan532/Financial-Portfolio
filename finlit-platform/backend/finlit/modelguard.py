"""Protects the scoring model from being copied by collecting scores company by company.

Each score is public for the company it belongs to, so someone could open every company and rebuild the model by regression. An honest reader opens a
few dozen companies a day; a copier opens thousands. This layer counts DISTINCT companies per visitor per day and per minute and slows the rest:

* a daily budget of distinct companies (higher for a signed-in member, much lower for a visitor already flagged);
* a per-minute budget of NEW companies, which stops a fast sequential crawl while leaving normal browsing alone;
* trap addresses that no page links to and robots.txt forbids: a client that asks for one is a blind crawler, and is flagged for a week.

Re-opening a company already counted today is always free, so refreshing a page or switching tabs never costs anything. Prices and trading data are
market data, not the model, and are not counted. If Redis is down the guard steps aside (reads stay up); the ordinary rate limit still applies.
"""
import hashlib
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional, Tuple

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from .security import _bucket_ip, client_ip

log = logging.getLogger("finlit.modelguard")

PER_COMPANY = re.compile(r"^/api/(?:stocks|prism)/([A-Za-z0-9&_.\-]{1,24})(?:/([A-Za-z0-9_\-]+))?/?$")
NOT_THE_MODEL = {"price", "trading", "intraday", "logo", "quote"}
SKIP_FIRST = {"search-index", "compare", "screener"}                       # lists and tools, each with its own limits
TRAPS = ("/api/stocks/_all", "/api/stocks/export", "/api/scores", "/api/scores/export", "/api/v1/scores", "/api/prism/export")
FLAG_SECONDS = 7 * 24 * 3600

# distinct companies a day / NEW companies a minute
BUDGET = {"visitor": (300, 40), "member": (1500, 90), "flagged": (30, 4)}


def _day() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def seconds_to_midnight() -> int:
    now = datetime.now(timezone.utc)
    return int(86400 - (now.hour * 3600 + now.minute * 60 + now.second)) + 1


class ModelGuardMiddleware:
    def __init__(self, app: ASGIApp, cookie: str, header: Optional[str] = None):
        self.app, self.cookie, self.header = app, cookie, header

    def identity(self, scope: Scope) -> Tuple[str, bool]:
        ip = _bucket_ip(client_ip(scope, self.header))
        raw = dict(scope["headers"]).get(b"cookie", b"").decode("latin-1", "ignore")
        return hashlib.sha256(ip.encode()).hexdigest()[:20], f"{self.cookie}=" in raw

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http" or scope["method"] not in ("GET", "HEAD"):
            return await self.app(scope, receive, send)
        path = scope["path"].rstrip("/") or "/"
        redis = getattr(getattr(scope["app"].state, "limiter", None), "redis", None)
        trap = path.lower() in TRAPS
        m = None if trap else PER_COMPANY.match(path)
        if redis is None or not (trap or m):
            return await self.app(scope, receive, send)
        if m and (m.group(1).lower() in SKIP_FIRST or (m.group(2) or "").lower() in NOT_THE_MODEL):
            return await self.app(scope, receive, send)
        who, member = self.identity(scope)
        try:
            if trap:
                await redis.set(f"mg:flag:{who}", "1", ex=FLAG_SECONDS)
                log.warning("model guard: client %s asked for a trap address (%s) and is flagged for a week", who, path)
                return await self.app(scope, receive, send)            # the app answers 404 as for any unknown address
            sym = m.group(1).upper()
            flagged = bool(await redis.exists(f"mg:flag:{who}"))
            daily, burst = BUDGET["flagged" if flagged else "member" if member else "visitor"]
            key = f"mg:syms:{who}:{_day()}"
            async with redis.pipeline(transaction=False) as pipe:
                pipe.sadd(key, sym)
                pipe.scard(key)
                pipe.expire(key, 90000)
                added, count, _ = await pipe.execute()
            if not added:
                return await self.app(scope, receive, send)            # a company already opened today: free
            retry = 0
            if count > daily:
                retry = seconds_to_midnight()
            else:
                minute = int(time.time()) // 60
                bkey = f"mg:burst:{who}:{minute}"
                async with redis.pipeline(transaction=False) as pipe:
                    pipe.incr(bkey)
                    pipe.expire(bkey, 70)
                    n, _ = await pipe.execute()
                if n > burst:
                    retry = (minute + 1) * 60 - int(time.time())
            if retry:
                await redis.srem(key, sym)
                log.warning("model guard: client %s slowed (%d distinct companies today, flagged=%s)", who, count, flagged)
                response = JSONResponse({"status": "rate_limited", "detail": "You have opened a lot of companies very quickly. Please slow down and try again shortly."},
                                        status_code=429, headers={"Retry-After": str(max(retry, 1)), "Cache-Control": "no-store"})
                return await response(scope, receive, send)
        except Exception:                                              # Redis trouble: step aside, never take the site down
            log.warning("model guard unavailable", exc_info=True)
        return await self.app(scope, receive, send)
