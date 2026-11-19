"""GET /api/discovery (task #221): the themes companies' newest investor presentations talk about (finlit/discovery/service.py).
  (no query)      every theme with its counts and first names
  ?theme=<name>   that theme's companies, with keywords, evidence sentences and the presentation (title, date, link)
  ?symbol=<SYM>   one company's themes and its filings of the last 90 days (event, themes, tone)
  ?sector=<name>  only companies of one NSE macro sector (with or without theme=)
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
async def discovery(request: Request, theme: Optional[str] = Query(default=None, max_length=60), symbol: Optional[str] = Query(default=None, max_length=20),
                    sector: Optional[str] = Query(default=None, max_length=80)):
    if theme is not None and theme not in K.BUCKETS:
        raise HTTPException(404, "No such theme")
    if symbol is not None:
        symbol = symbol.strip().upper()
        if not SYMBOL.fullmatch(symbol):
            raise HTTPException(400, "bad symbol")
    if sector is not None and not re.fullmatch(r"[A-Za-z0-9 &,\-\.()/]{1,80}", sector):
        raise HTTPException(400, "bad sector")
    data = await service.overview(request.app.state.store, theme=theme, symbol=symbol, sector=sector)
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=600"})


@router.get("/board")
async def discovery_board(request: Request):
    """Task #251: the Discover page's one read (finlit/discovery/board.py): every placed company as a compact row, the themes as shown, the latest filings
    per theme and per event. Open on every plan, like the route above; the page joins FinLit's own readings per plan from the routes that already gate them."""
    from . import board
    data = await board.board(request.app.state.store)
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=600"})


@router.get("/company")
async def discovery_company(request: Request, symbol: str = Query(..., max_length=20)):
    """Task #260: the company panel's read (finlit/discovery/board.py company()): passages with their page, the presentation and filing PDFs."""
    from . import board
    symbol = symbol.strip().upper()
    if not SYMBOL.fullmatch(symbol):
        raise HTTPException(400, "bad symbol")
    data = await board.company(request.app.state.store, symbol)
    if data is None:
        raise HTTPException(404, "Not placed on Discover")
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=600"})
