"""GET /api/stocks/{symbol}/filing-scores (task #266): the company's newest investor presentation, earnings-call transcript and results filing from the
report's Section 18, each scored point by point with the team's rule-based workflow (finlit/docscore). Open on every plan, as Section 18 is: it reads what
the company filed with the exchange. Scores and colours only; never a word like positive or negative. Not cached by the browser while a file is being read."""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from ..auth.routes import ip_of
from . import service

router = APIRouter(prefix="/api/stocks", tags=["docscore"])
SYMBOL = re.compile(r"^[A-Z0-9&\-\.]{1,20}$")


@router.get("/{symbol}/filing-scores")
async def filing_scores(request: Request, symbol: str):
    sym = symbol.strip().upper()
    if not SYMBOL.fullmatch(sym):
        raise HTTPException(400, "bad symbol")
    allowed, retry = await request.app.state.limiter.hit("filing_scores", ip_of(request), 40, 60, fail_open=True)
    if not allowed:
        return JSONResponse({"status": "rate_limited", "detail": "Too many requests. Please wait and try again.", "retryAfter": retry}, status_code=429,
                            headers={"Retry-After": str(retry), "Cache-Control": "no-store"})
    data = await service.company(request.app, sym)
    return JSONResponse(data, headers={"Cache-Control": "no-store" if data["reading"] else "public, max-age=600"})
