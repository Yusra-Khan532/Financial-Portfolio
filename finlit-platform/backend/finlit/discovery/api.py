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


@router.get("/changes")
async def discovery_changes(request: Request, symbols: str = Query(..., max_length=6000)):
    """Task #272: "What changed at these companies" for a list (finlit/discovery/changes.py). Public filings, open on every plan like the routes above;
    the list in the address is the member's own, so the answer is cached privately by the browser only."""
    from . import changes as C
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not syms or len(syms) > C.MAX_SYMBOLS or not all(SYMBOL.fullmatch(s) for s in syms):
        raise HTTPException(400, "bad symbols")
    data = await C.changes(request.app.state.store, syms)
    return JSONResponse(data, headers={"Cache-Control": "private, max-age=300"})


@router.get("/sources")
async def discovery_sources(request: Request, source: str = Query(..., pattern="^(calls|results)$"), bucket: Optional[str] = Query(default=None, max_length=90),
                            symbol: Optional[str] = Query(default=None, max_length=20)):
    """Task #267: what companies' newest earnings-call transcripts (source=calls) and results filings (source=results) say, in the keyword directory's
    call and results buckets (finlit/discovery/sources.py). No other query: every bucket with its counts; bucket=<name>: that bucket's companies with
    their keywords, evidence sentences, the document's date and link and what to verify; symbol=<SYM>: one company's buckets, or why there are none.
    Open on every plan, like the routes above (it quotes what companies filed); cached by the browser and Caddy for 10 minutes (the job runs nightly)."""
    from . import sources as SRC
    if bucket is not None and bucket not in SRC.LEX[source].buckets:
        raise HTTPException(404, "No such bucket")
    if symbol is not None:
        symbol = symbol.strip().upper()
        if not SYMBOL.fullmatch(symbol):
            raise HTTPException(400, "bad symbol")
        data = await SRC.company(request.app.state.store, source, symbol)
    else:
        data = await SRC.overview(request.app.state.store, source, bucket=bucket)
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
