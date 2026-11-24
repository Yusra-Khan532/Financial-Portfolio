"""Monitoring: what the uptime checker (Gatus) sees, the outside check (GitHub Actions) and the load test (k6), for the public status page and the
admin console's Monitoring tab. Owner's request of 24 Nov 2026; docs/MONITORING.md.

    GET  /api/status/public       anyone: each check's name, up or down, its share of good checks lately, and when it was last checked.
                                  Nothing else: no addresses, no error text, no response times. Cached 30 s, at most 30 asks a minute per visitor.
    GET  /api/admin/monitoring     administrators: every check with its response time, recent incidents, the failing jobs, the last outside check,
                                  the last load test and the Uptime Kuma link.
    POST /api/monitor/ingest       the outside check and the load test report here, with the header X-Monitor-Key = MONITOR_INGEST_KEY.
                                  No key set on the server, or a wrong key: 401. Only the listed fields are kept (in Redis), nothing else.

Gatus runs as its own container on the private network (deploy/aws/docker-compose.aws.yml, deploy/aws/gatus/config.yaml); GATUS_URL names it.
When Gatus is not running (local runs, before the first deploy) both pages say so instead of failing.
"""
from __future__ import annotations

import hmac
import json
import os
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Literal, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from .auth.routes import NO_STORE, Ctx, admin_ctx, ip_of

public = APIRouter()
admin = APIRouter()

CACHE_S = 30.0
PUBLIC_PER_MIN = 30
OUTSIDE_KEY, OUTSIDE_LOG_KEY, K6_KEY = "monitor:outside:last", "monitor:outside:log", "monitor:k6:last"
OUTSIDE_LOG_MAX = 288   # a day of five-minute checks

_cache: Dict[str, Tuple[float, Any]] = {}
_hits: Dict[str, Deque[float]] = {}


def gatus_url() -> str:
    return os.environ.get("GATUS_URL", "http://gatus:8080").rstrip("/")


def _iso(ts: Any) -> Optional[str]:
    return ts if isinstance(ts, str) and ts else None


def summarize(raw: Any) -> List[Dict[str, Any]]:
    """Gatus's /api/v1/endpoints/statuses as one row per check. 'goodPct' is the share of good results among those Gatus returned (the newest
    page), with 'checks' saying how many that is, so the figure never claims more history than it has."""
    rows: List[Dict[str, Any]] = []
    for e in raw if isinstance(raw, list) else []:
        if not isinstance(e, dict):
            continue
        results = [r for r in (e.get("results") or []) if isinstance(r, dict)]
        last = results[-1] if results else None
        good = sum(1 for r in results if r.get("success") is True)
        dur = last.get("duration") if last else None
        rows.append({
            "key": str(e.get("key") or ""), "name": str(e.get("name") or ""), "group": str(e.get("group") or ""),
            "up": (last.get("success") is True) if last else None,
            "latencyMs": round(dur / 1e6) if isinstance(dur, (int, float)) else None,   # Gatus gives nanoseconds
            "checkedAt": _iso(last.get("timestamp")) if last else None,
            "goodPct": round(100.0 * good / len(results), 1) if results else None, "checks": len(results),
            "errors": [str(x)[:200] for x in (last.get("errors") or [])][:3] if last else [],
            "events": [{"type": str(v.get("type") or ""), "at": _iso(v.get("timestamp"))} for v in (e.get("events") or []) if isinstance(v, dict)][-10:],
        })
    return rows


def public_view(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Only what a visitor may see: no address, no error text, no response time, no internal group name."""
    return [{"name": r["name"], "up": r["up"], "goodPct": r["goodPct"], "checks": r["checks"], "checkedAt": r["checkedAt"]} for r in rows]


def incidents(rows: List[Dict[str, Any]], limit: int = 20) -> List[Dict[str, Any]]:
    """The newest UNHEALTHY / HEALTHY changes across every check, newest first."""
    ev = [{"name": r["name"], "type": e["type"], "at": e["at"]} for r in rows for e in r["events"] if e["type"] in ("UNHEALTHY", "HEALTHY") and e["at"]]
    return sorted(ev, key=lambda x: x["at"], reverse=True)[:limit]


async def gatus_rows(client: Optional[httpx.AsyncClient] = None) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    """The checks (cached 30 s), or None and why when Gatus does not answer."""
    hit = _cache.get("gatus")
    if hit and time.monotonic() - hit[0] < CACHE_S:
        return hit[1]
    try:
        own = client is None
        c = client or httpx.AsyncClient(timeout=5.0)
        try:
            r = await c.get(gatus_url() + "/api/v1/endpoints/statuses", params={"page": 1, "pageSize": 100})
        finally:
            if own:
                await c.aclose()
        r.raise_for_status()
        out: Tuple[Optional[List[Dict[str, Any]]], Optional[str]] = (summarize(r.json()), None)
    except Exception:   # noqa: BLE001 - any failure reads as "the checker is not answering"
        out = (None, "The uptime checker is not answering right now.")
    _cache["gatus"] = (time.monotonic(), out)
    return out


def _limited(ip: str) -> bool:
    now = time.monotonic()
    q = _hits.setdefault(ip, deque())
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= PUBLIC_PER_MIN:
        return True
    q.append(now)
    if len(_hits) > 5000:   # keep the table small
        for k in [k for k, v in _hits.items() if not v][:2500]:
            _hits.pop(k, None)
    return False


@public.get("/api/status/public")
async def status_public(request: Request):
    if _limited(ip_of(request)):
        return JSONResponse({"detail": "Too many requests; try again in a minute."}, status_code=429, headers={"Retry-After": "60"})
    rows, why = await gatus_rows()
    body = {"checks": public_view(rows) if rows is not None else [], "allUp": bool(rows) and all(r["up"] for r in rows),
            "note": why, "asOf": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    return JSONResponse(body, headers={"Cache-Control": "public, max-age=30"})


async def _redis_json(redis: Any, key: str) -> Any:
    try:
        raw = await redis.get(key)
        return json.loads(raw) if raw else None
    except Exception:   # noqa: BLE001
        return None


@admin.get("/api/admin/monitoring")
async def admin_monitoring(request: Request, ctx: Ctx = Depends(admin_ctx)):
    rows, why = await gatus_rows()
    store = request.app.state.store
    failing: List[str] = []
    try:
        from .jobs.status import build
        failing = list((await build(store, store.redis, admin=True)).get("failing") or [])
    except Exception:   # noqa: BLE001
        failing = []
    log = []
    try:
        log = [json.loads(x) for x in (await store.redis.lrange(OUTSIDE_LOG_KEY, 0, 47) or [])]
    except Exception:   # noqa: BLE001
        log = []
    body = {"checks": rows or [], "note": why, "incidents": incidents(rows or []), "failingJobs": failing,
            "outside": await _redis_json(store.redis, OUTSIDE_KEY), "outsideRecent": log,
            "k6": await _redis_json(store.redis, K6_KEY), "kumaUrl": os.environ.get("KUMA_URL") or None,
            "asOf": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    return JSONResponse(body, headers=NO_STORE)


class OutsideIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ok: bool
    status: Optional[int] = Field(None, ge=0, le=999)
    ms: Optional[int] = Field(None, ge=0, le=600_000)
    version: Optional[str] = Field(None, max_length=40)
    failsInARow: int = Field(0, ge=0, le=10_000)


class K6In(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run: Literal["smoke", "weekly", "manual"]
    passed: bool
    requests: int = Field(..., ge=0, le=100_000_000)
    p95Ms: Optional[float] = Field(None, ge=0, le=600_000)
    avgMs: Optional[float] = Field(None, ge=0, le=600_000)
    errorPct: Optional[float] = Field(None, ge=0, le=100)
    vus: Optional[int] = Field(None, ge=0, le=10_000)
    runUrl: Optional[str] = Field(None, max_length=300, pattern=r"^https://github\.com/[\w.\-/]+$")


class IngestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["outside", "k6"]
    outside: Optional[OutsideIn] = None
    k6: Optional[K6In] = None


def key_ok(sent: Optional[str], env: Optional[Dict[str, str]] = None) -> bool:
    want = (env if env is not None else os.environ).get("MONITOR_INGEST_KEY") or ""
    return len(want) >= 24 and bool(sent) and hmac.compare_digest(str(sent).encode(), want.encode())


@public.post("/api/monitor/ingest")
async def ingest(request: Request, body: IngestIn):
    if not key_ok(request.headers.get("x-monitor-key")):
        return JSONResponse({"detail": "missing or wrong X-Monitor-Key"}, status_code=401, headers=NO_STORE)
    redis = request.app.state.store.redis
    at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if body.kind == "outside" and body.outside:
        rec = {**body.outside.model_dump(), "at": at}
        await redis.set(OUTSIDE_KEY, json.dumps(rec))
        await redis.lpush(OUTSIDE_LOG_KEY, json.dumps(rec))
        await redis.ltrim(OUTSIDE_LOG_KEY, 0, OUTSIDE_LOG_MAX - 1)
    elif body.kind == "k6" and body.k6:
        await redis.set(K6_KEY, json.dumps({**body.k6.model_dump(), "at": at}))
    else:
        return JSONResponse({"detail": f"'{body.kind}' needs its '{body.kind}' part"}, status_code=422, headers=NO_STORE)
    return JSONResponse({"status": "stored", "at": at}, headers=NO_STORE)
