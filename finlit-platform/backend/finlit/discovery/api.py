"""GET /api/discovery (task #221): the themes companies' newest investor presentations talk about (finlit/discovery/service.py).
  (no query)      every theme with its counts and first names
  ?theme=<name>   that theme's companies, with keywords, evidence sentences and the presentation (title, date, link)
  ?symbol=<SYM>   one company's themes
Open on every plan: it quotes what companies filed with the exchange. Cached by the browser and Caddy for 10 minutes (the job runs nightly)."""

from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from . import keywords as K
from . import service

router = APIRouter(prefix="/api/discovery", tags=["discovery"])
SYMBOL = re.compile(r"^[A-Z0-9&\-\.]{1,20}$")


@router.get("")
async def discovery(request: Request, theme: Optional[str] = Query(default=None, max_length=60), symbol: Optional[str] = Query(default=None, max_length=20)):
    if theme is not None and theme not in K.BUCKETS:
        raise HTTPException(404, "No such theme")
    if symbol is not None:
        symbol = symbol.strip().upper()
        if not SYMBOL.fullmatch(symbol):
            raise HTTPException(400, "bad symbol")
    data = await service.overview(request.app.state.store, theme=theme, symbol=symbol)
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=600"})
