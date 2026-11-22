"""The two links of the nightly scores export (task #326, SPEC section 2). Internal: for the owner's Mac only, no login session, one header key.

  GET /internal/export/scores/dates           {"dates": [...]}: every day a file exists for, oldest first
  GET /internal/export/scores?date=YYYY-MM-DD the day's file (application/json; gzip-encoded when the client accepts gzip), 404 when there is none

Both read the export folder only (never the database) and need `X-Export-Key` equal to the server's EXPORT_KEY (compared in constant time). Wrong or missing
key, or no EXPORT_KEY set on the server: 401. HTTPS only: on the live site (PUBLIC_SITE_URL https) a request that did not reach the front door over HTTPS
(X-Forwarded-Proto from Caddy, or Cloudflare's CF-Visitor) is refused with 403, so the key is never accepted from the plain http address.
"""
from __future__ import annotations

import gzip
import hmac
import json
import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from . import scores_export as X

router = APIRouter()
MIN_KEY_LEN = 32          # a short key is treated as no key: 401 for everyone
HEADERS = {"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"}


def _https(request: Request) -> bool:
    settings = getattr(request.app.state, "settings", None)
    if not str(getattr(settings, "public_site_url", "")).startswith("https://"):
        return True       # a local or plain-http install has no HTTPS to insist on
    if request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower() == "https":
        return True
    try:
        return json.loads(request.headers.get("cf-visitor") or "{}").get("scheme") == "https"
    except (ValueError, AttributeError):
        return False


def _refused(request: Request):
    if not _https(request):
        return JSONResponse({"detail": "HTTPS only: use the https:// address of the site"}, status_code=403, headers=HEADERS)
    want = os.environ.get("EXPORT_KEY", "")
    got = request.headers.get("x-export-key", "")
    if len(want) < MIN_KEY_LEN or not hmac.compare_digest(got.encode("utf-8"), want.encode("utf-8")):
        return JSONResponse({"detail": "missing or wrong X-Export-Key"}, status_code=401, headers=HEADERS)
    return None


@router.get("/internal/export/scores/dates", include_in_schema=False)
async def export_dates(request: Request):
    bad = _refused(request)
    if bad is not None:
        return bad
    return JSONResponse({"dates": X.dates()}, headers=HEADERS)


@router.get("/internal/export/scores", include_in_schema=False)
async def export_day(request: Request, date: str = ""):
    bad = _refused(request)
    if bad is not None:
        return bad
    path = X.export_dir() / f"scores_{date}.json.gz"
    if not X.DAY.match(date or "") or not path.is_file():
        return JSONResponse({"detail": f"no file for {date or 'that day'}"}, status_code=404, headers=HEADERS)
    raw = path.read_bytes()
    if "gzip" in request.headers.get("accept-encoding", "").lower():
        return Response(raw, media_type="application/json", headers={**HEADERS, "Content-Encoding": "gzip"})
    return Response(gzip.decompress(raw), media_type="application/json", headers=HEADERS)
