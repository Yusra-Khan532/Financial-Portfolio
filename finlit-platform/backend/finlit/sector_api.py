"""Sector Pulse over HTTP (docs/SECTORS.md).

    GET /api/sectors                          the board: every industry and sector group with a reading
    GET /api/sectors/status                   public, read-only: the date of the data, stocks counted, how the last nightly run ended (and why not)
    GET /api/sectors/{slug}                   one industry page
    GET /api/technicals/{symbol}/sector       a stock inside its industry (Gold)
    GET /api/rotation                         Sector Rotation: corners, ranking, paths, rank history, study (every plan)
    GET /api/rotation/{slug}                  one group's rotation card (industry page)

Every board, page, history, map, membership and rotation route takes ?show=sectors for the Sectors view (task #192): the same readings with one group per
NSE sector (22), from the release's by-sector/ folder, measured against the same average industry. Without it (or ?show=industries) nothing changes.

All four read the static JSON the nightly job wrote (finlit/sector_data.py): no database, no pandas. What a plan may see is decided HERE, on the server
(auth/entitlements.py: redact_sector_*): a locked field is present and null, and `locked` names the plan that opens it. Basic sees the state and breadth of
every group; Silver adds the ranked stock tables and the leader flags; Gold adds the stock page's "Sector & peers" cards and the peer label. Administrators see all.

When there is nothing to show the answer is 503 with a sentence that starts "Sector data is not loaded yet:" and says why, never a bare error.
The slug is checked against the board (a fixed list), the symbol against NSE's character set, and the file is always inside the live release folder.
"""
from __future__ import annotations

import hashlib
import time
from typing import Any, Dict, Optional

import orjson
from fastapi import APIRouter, Request, Response

from . import sector_data as sd
from . import sector_extra, sector_history, sector_next
from .rotation_insights import rotation_insights
from .auth.entitlements import redact_rotation_map, redact_sector_board, redact_sector_industry, redact_sector_stock, sector_plan, sees_all
from .auth.service import current
from .background import etag_matches

def _load_public():
    """finlit_technicals/public.py is plain Python; it is loaded by path because importing the package would pull in numpy and pandas, which the website process never loads."""
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().parent.parent / "finlit_technicals" / "public.py"
    spec = importlib.util.spec_from_file_location("finlit_sector_public", path)
    mod = importlib.util.module_from_spec(spec)         # type: ignore[arg-type]
    __import__("sys").modules[spec.name] = mod           # type: ignore[union-attr]
    spec.loader.exec_module(mod)                         # type: ignore[union-attr]
    return mod


_pub = _load_public()
public_board, public_industry, public_rotation = _pub.public_board, _pub.public_industry, _pub.public_rotation
public_rotation_group, public_stock_sector = _pub.public_rotation_group, _pub.public_stock_sector

router = APIRouter()
PRIVATE_CACHE = "private, max-age=300, must-revalidate"      # the answer depends on the plan (Cookie), so no shared cache may keep it
NO_STORE = "no-store"


def _reply(request: Request, payload: Any, started: float, status: int = 200, cache: str = PRIVATE_CACHE) -> Response:
    body = orjson.dumps(payload)
    headers = {"Cache-Control": cache, "Vary": "Cookie", "Server-Timing": f"app;dur={(time.perf_counter() - started) * 1000:.2f}"}
    if status == 200:
        etag = '"' + hashlib.sha1(body).hexdigest()[:20] + '"'  # nosec B324 - cache validator, not security
        headers["ETag"] = etag
        if etag_matches(request.headers.get("if-none-match"), etag):
            return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", status_code=status, headers=headers)


def _not_loaded(request: Request, started: float) -> Response:
    reason = sd.not_loaded_reason()
    return _reply(request, {"available": False, "status": "not_loaded", "reason": reason, "detail": reason}, started, status=503, cache=NO_STORE)


def _not_found(request: Request, started: float, reason: str) -> Response:
    return _reply(request, {"available": False, "status": "not_found", "reason": reason, "detail": reason}, started, status=404, cache=NO_STORE)


SECTORS_VIEW_MISSING = ("The Sectors view is not loaded yet: the current data set was built before NSE's 22 sectors were read as groups. "
                        "The sector job adds them on its next weekend night (it takes a few minutes); the Industries view keeps serving meanwhile.")


def _base(rel: Optional[Any], show: Optional[str]) -> Optional[Any]:
    """The folder a view reads: the release itself (Industries, the default) or its by-sector/ folder (Sectors: one group per NSE sector, task #192).
    `show` is checked against two fixed words, so it never becomes part of a path."""
    if rel is None:
        return None
    return rel / sd.LEVELS_DIR if show == "sectors" else rel


def _sectors_missing(request: Request, started: float) -> Response:
    if sd.live_release() is None:
        return _not_loaded(request, started)
    return _reply(request, {"available": False, "status": "not_loaded", "reason": SECTORS_VIEW_MISSING, "detail": SECTORS_VIEW_MISSING, "show": "sectors"},
                  started, status=503, cache=NO_STORE)


def _no_board(request: Request, started: float, show: Optional[str]) -> Response:
    return _sectors_missing(request, started) if show == "sectors" else _not_loaded(request, started)


async def _plan(request: Request) -> str:
    ctx = await current(request)
    return "gold" if sees_all(ctx) else sector_plan(ctx.plan)


# status first: /api/sectors/{slug} would otherwise claim it
@router.get("/api/sectors/status")
async def status(request: Request) -> Response:
    started = time.perf_counter()
    out = sd.out_dir()
    rel = sd.live_release(out)
    meta = sd.sector_meta(rel)
    last = sd.read_last_run(out)
    board = sd.read_json(rel / "sectors" / "_board.json") if rel else None
    body: Dict[str, Any] = {
        "enabled": sd.enabled(), "loaded": bool(board),
        "dataDate": board.get("date") if board else None,
        "stocksCounted": board.get("stocks_counted") if board else None, "groups": board.get("groups") if board else None,
        "industries": board.get("industries") if board else None,
        "stockFiles": meta.get("stocks"), "stockErrors": meta.get("errors"), "builtAt": meta.get("built_at"), "seconds": meta.get("seconds"),
        "lastRun": ({k: last.get(k) for k in ("status", "at", "reason", "dataDate", "fetch", "seconds", "stocks", "errors")} if last else None),
        "rotationLoaded": bool(rel and (rel / "rotation" / "_map.json").is_file()),
        "sectorsViewLoaded": bool(rel and (rel / sd.LEVELS_DIR / "sectors" / "_board.json").is_file()),
        "reason": None if board else sd.not_loaded_reason(out),
    }
    return _reply(request, body, started, cache="public, max-age=60")


@router.get("/api/sectors")
async def board(request: Request, show: Optional[str] = None) -> Response:
    started = time.perf_counter()
    rel = _base(sd.live_release(), show)
    data = sd.read_json(rel / "sectors" / "_board.json") if rel else None
    if not data:
        return _no_board(request, started, show)
    out = redact_sector_board(public_board(data), await _plan(request))
    if show == "sectors":
        out = with_every_industry(out)
    return _reply(request, {**out, "show": "sectors" if show == "sectors" else "industries"}, started)


def with_every_industry(board: Dict[str, Any]) -> Dict[str, Any]:
    """Sectors view (task #333, file 30): each sector row lists every NSE industry of that sector in NSE's own tree (finlit/data taxonomy, 59 industries), not only
    those with counted stocks, so the 22 sectors account for all 59 industries. An industry already listed (in any spelling: "Agricultural Commercial & Construction
    Vehicles" is NSE's "Agricultural, Commercial & Construction Vehicles") is not added twice. Only the list of names changes; no count or reading does."""
    from . import taxonomy
    by_sector: Dict[str, list] = {}
    for ind in taxonomy.tree()["by"]["industry"].values():
        by_sector.setdefault(taxonomy.key(ind["sector"]), []).append(ind["industry"])
    rows = []
    for r in board.get("rows") or []:
        if isinstance(r, dict) and r.get("kind") == "sector":
            have = list(r.get("industries") or [])
            seen = {taxonomy.key(x) for x in have}
            extra = sorted(x for x in by_sector.get(taxonomy.key(r.get("name")), []) if taxonomy.key(x) not in seen)
            if extra:
                r = {**r, "industries": have + extra}
        rows.append(r)
    return {**board, "rows": rows}


_history_memo: Dict[bool, Dict[str, Any]] = {}


@router.get("/api/sector-history")
async def sector_state_history(request: Request, show: Optional[str] = None) -> Response:
    """Every group's state on each of the last six months of sessions, with the insight cards, for "The market's mood, day by day" and "Six months of every industry". Open to every plan, like the board's states."""
    started = time.perf_counter()
    rel = _base(sd.live_release(), show)
    board = sd.read_json(rel / "sectors" / "_board.json") if rel else None
    if not board:
        return _no_board(request, started, show)
    key = str(rel) + ":" + str((rel / "sectors" / "_board.json").stat().st_mtime_ns)
    memo = _history_memo.setdefault(show == "sectors", {})         # one memo per view
    if memo.get("key") != key:
        pages = [sd.read_json(rel / "sectors" / f"{r['slug']}.json") for r in board.get("rows", []) if isinstance(r, dict) and sd.SLUG.match(str(r.get("slug", "")))]
        memo.clear()
        memo.update(key=key, value=sector_history.build([p for p in pages if isinstance(p, dict)]))
    data = memo.get("value")
    if not data:
        reason = "The state history is not loaded yet: the current data set has too few sessions of history. It is rebuilt at the next nightly run."
        return _reply(request, {"available": False, "status": "not_loaded", "reason": reason, "detail": reason}, started, status=503, cache=NO_STORE)
    return _reply(request, {**data, "date": board.get("date")}, started)


_next_memo: Dict[bool, Dict[str, Any]] = {}


@router.get("/api/sector-next")
async def sector_next_route(request: Request, show: Optional[str] = None) -> Response:
    """Task #333 (file 30, addition 1): "What happened next", counted once per release and view from each group's year of daily readings (finlit/sector_next.py).
    Open to every plan, like the states it counts."""
    started = time.perf_counter()
    rel = _base(sd.live_release(), show)
    board = sd.read_json(rel / "sectors" / "_board.json") if rel else None
    if not board:
        return _no_board(request, started, show)
    key = str(rel) + ":" + str((rel / "sectors" / "_board.json").stat().st_mtime_ns)
    memo = _next_memo.setdefault(show == "sectors", {})
    if memo.get("key") != key:
        pages = [sd.read_json(rel / "sectors" / f"{r['slug']}.json") for r in board.get("rows", []) if isinstance(r, dict) and sd.SLUG.match(str(r.get("slug", "")))]
        memo.clear()
        memo.update(key=key, value=sector_next.build([p for p in pages if isinstance(p, dict)]))
    data = memo.get("value")
    if not data:
        reason = "What happened next is not loaded yet: the current data set has too little history. It is rebuilt at the next weekly run."
        return _reply(request, {"available": False, "status": "not_loaded", "reason": reason, "detail": reason}, started, status=503, cache=NO_STORE)
    return _reply(request, {**data, "date": board.get("date")}, started)


_play_memo: Dict[bool, Dict[str, Any]] = {}


@router.get("/api/sector-playback")
async def sector_playback(request: Request, show: Optional[str] = None) -> Response:
    """Task #333 (file 30, addition 4): every group at each weekly close of the last year, for the Sector map's playback. Open to every plan, like the map."""
    started = time.perf_counter()
    rel = _base(sd.live_release(), show)
    board = sd.read_json(rel / "sectors" / "_board.json") if rel else None
    if not board:
        return _no_board(request, started, show)
    key = str(rel) + ":" + str((rel / "sectors" / "_board.json").stat().st_mtime_ns)
    memo = _play_memo.setdefault(show == "sectors", {})
    if memo.get("key") != key:
        pages = [sd.read_json(rel / "sectors" / f"{r['slug']}.json") for r in board.get("rows", []) if isinstance(r, dict) and sd.SLUG.match(str(r.get("slug", "")))]
        memo.clear()
        memo.update(key=key, value=sector_next.playback([p for p in pages if isinstance(p, dict)]))
    data = memo.get("value")
    if not data:
        reason = "The map's playback is not loaded yet: the current data set has too little history. It is rebuilt at the next weekly run."
        return _reply(request, {"available": False, "status": "not_loaded", "reason": reason, "detail": reason}, started, status=503, cache=NO_STORE)
    return _reply(request, {**data, "date": board.get("date")}, started)


_NSE_FULL: Dict[str, Any] = {}


def _nse_classes() -> Dict[str, Any]:
    """symbol -> (NSE industry, NSE sector), from finlit_technicals/data/nse_industries.json (the classification Sector Pulse groups by)."""
    if not _NSE_FULL:
        import json as _json
        from pathlib import Path
        raw = _json.loads((Path(__file__).resolve().parents[1] / "finlit_technicals" / "data" / "nse_industries.json").read_text(encoding="utf-8")).get("stocks") or {}
        _NSE_FULL.update({str(k).upper(): (v[0], v[1] if len(v) > 1 else None) for k, v in raw.items() if isinstance(v, list) and v and v[0]})
    return _NSE_FULL


@router.get("/api/sectors/membership")
async def sector_membership(request: Request, symbols: str = "", show: Optional[str] = None) -> Response:
    """Which Sector Pulse group each of the given shares belongs to ("How your industries are doing", the final pages pack, 13 Nov 2026): {symbol: {slug, name}} for the ones
    in a group with a reading; the others are left out (no NSE industry, or a group with too few stocks). Names only, open to every plan, at most 200 symbols."""
    started = time.perf_counter()
    rel = _base(sd.live_release(), show)
    board = sd.read_json(rel / "sectors" / "_board.json") if rel else None
    if not board:
        return _no_board(request, started, show)
    want = [s.strip().upper() for s in symbols.split(",") if s.strip()][:200]
    by_ind: Dict[str, Dict[str, str]] = {}
    by_sec: Dict[str, Dict[str, str]] = {}
    for r in board.get("rows", []):
        if not isinstance(r, dict) or not r.get("slug"):
            continue
        ref = {"slug": r["slug"], "name": r.get("name") or r["slug"]}
        if r.get("kind") == "sector":
            by_sec[str(r.get("name") or "")] = ref
        for ind in r.get("industries") or []:
            by_ind[str(ind)] = ref
    cls = _nse_classes()
    out: Dict[str, Dict[str, str]] = {}
    for sym in want:
        if not sd.SYMBOL.match(sym) or sym not in cls:
            continue
        ind, sec = cls[sym]
        hit = (by_sec.get(sec) if sec else None) if show == "sectors" else (by_ind.get(ind) or (by_sec.get(sec) if sec else None))
        if hit:
            out[sym] = hit
    return _reply(request, {"date": board.get("date"), "groups": out}, started)


@router.get("/api/sector-map")
async def sector_map(request: Request, show: Optional[str] = None) -> Response:
    """"Industry map" on Sector Pulse: every industry with a reading as a point (stocks rising of 100, how far below its 1-year high), with the insight sentences. Open to every plan, like the states."""
    started = time.perf_counter()
    rel = _base(sd.live_release(), show)
    board = sd.read_json(rel / "sectors" / "_board.json") if rel else None
    if not board:
        return _no_board(request, started, show)
    data = sector_extra.industry_map(public_board(board))
    if not data:
        reason = "The industry map is not loaded yet: the current data set has too few industries with a reading."
        return _reply(request, {"available": False, "status": "not_loaded", "reason": reason, "detail": reason}, started, status=503, cache=NO_STORE)
    return _reply(request, data, started)


@router.get("/api/sectors/{slug}/year")
async def industry_year(slug: str, request: Request, show: Optional[str] = None) -> Response:
    """"A year of <industry>": how many of every 100 of its stocks were rising each day, its state each day, numbered moments and insights. Open to every plan."""
    started = time.perf_counter()
    rel = _base(sd.live_release(), show)
    board = sd.read_json(rel / "sectors" / "_board.json") if rel else None
    if not board:
        return _no_board(request, started, show)
    slug = sd.resolve_slug(slug, sd.board_slugs(board))
    if not sd.SLUG.match(slug) or slug not in sd.board_slugs(board):
        return _not_found(request, started, "There is no industry or sector group with this address. The groups that are read are listed on Sector Pulse.")
    page = sd.read_json(rel / "sectors" / f"{slug}.json")
    data = sector_extra.industry_year(page) if isinstance(page, dict) else None
    if not data:
        reason = "A year of this industry is not loaded yet: its page has too little history in the current data set."
        return _reply(request, {"available": False, "status": "not_loaded", "reason": reason, "detail": reason}, started, status=503, cache=NO_STORE)
    return _reply(request, data, started)


SMALL_LIST_MAX = 15          # NSE's catch-all groups (Services) list only their largest by market cap, with a line saying so
_SMALL_NORM = __import__("re").compile(r"[^a-z0-9]+")


def _same_name(a: Optional[str], b: Optional[str]) -> bool:
    n = lambda x: _SMALL_NORM.sub(" ", (x or "").lower().replace("&", " and ")).strip()     # noqa: E731
    return bool(a) and n(a) == n(b)


@router.get("/api/sectors/small/{slug}")
async def small_group(slug: str, request: Request, show: Optional[str] = None) -> Response:
    """A group shown as "Too few stocks for a reading": its listed stocks from the screener table (the group has no page of its own), best 6 months first,
    with size, the 6-month and 1-year returns and how far each is below its 1-year high. Silver, like the ranked stock tables; Basic gets the counts only (counted and listed)."""
    started = time.perf_counter()
    rel = _base(sd.live_release(), show)
    board = sd.read_json(rel / "sectors" / "_board.json") if rel else None
    if not board:
        return _no_board(request, started, show)
    g = next((x for x in board.get("too_few_stocks", []) if isinstance(x, dict) and x.get("slug") == slug), None)
    if not g:
        return _not_found(request, started, "There is no small group with this address. The groups are listed on Sector Pulse under \"Too few stocks for a reading\".")
    base = {"slug": slug, "name": g.get("name"), "counted": g.get("stocks_counted")}
    from .screener.data import get_table
    t = await get_table(request.app.state.store)
    if show == "sectors":                                                             # a too-small NSE sector: its companies by their NSE sector (22)
        idx = [i for i in range(len(t.symbols)) if _same_name(getattr(t, "nsector", [None] * len(t.symbols))[i], g.get("name"))]
    else:
        idx = [i for i in range(len(t.symbols)) if _same_name(t.industry[i], g.get("name"))] or [i for i in range(len(t.symbols)) if _same_name(t.sector_label[i], g.get("name"))]
    if await _plan(request) == "basic":                                              # the count of listed stocks is open to all (pack 06: "5 counted · 18 listed"); the names are Silver
        return _reply(request, {**base, "stocks": None, "listed": len(idx), "locked": "silver"}, started)
    num = lambda col, i: (lambda v: None if v != v else round(v, 1))(t.cols[col][i]) if col in t.cols else None     # noqa: E731
    mc = lambda i: t.cols["market_cap"][i] if t.cols["market_cap"][i] == t.cols["market_cap"][i] else -1.0        # noqa: E731
    listed = len(idx)
    capped = listed > SMALL_LIST_MAX and str(g.get("name", "")).strip().lower() == "services"
    if capped:
        idx = sorted(idx, key=lambda i: -mc(i))[:SMALL_LIST_MAX]
    rows = [{"symbol": t.symbols[i], "name": t.name[i], "size": t.cap[i] if hasattr(t, "cap") else None, "market_cap_cr": num("market_cap", i),
             "ret_6m": num("ret_6m", i), "pct_from_high": num("pct_from_high", i), "ret_1y": num("ret_1y", i), "group": t.industry[i] or t.sector_label[i]} for i in idx]
    rows.sort(key=lambda r: (r["ret_6m"] is None, -(r["ret_6m"] or 0)))           # best 6 months first; a stock with no figure goes last
    note = f"Services is NSE's catch-all group, so this lists its {SMALL_LIST_MAX} largest of {listed} by market cap." if capped else None
    return _reply(request, {**base, "listed": listed, "stocks": rows, "note": note}, started)


@router.get("/api/sectors/{slug}")
async def industry(slug: str, request: Request, top: Optional[int] = None, show: Optional[str] = None) -> Response:
    started = time.perf_counter()
    rel = _base(sd.live_release(), show)
    data = sd.read_json(rel / "sectors" / "_board.json") if rel else None
    if not data:
        return _no_board(request, started, show)
    slug = sd.resolve_slug(slug, sd.board_slugs(data))
    if not sd.SLUG.match(slug) or slug not in sd.board_slugs(data):       # only a slug the board lists is ever turned into a file name
        return _not_found(request, started, "There is no industry or sector group with this address. The groups that are read are listed on Sector Pulse.")
    page = sd.read_json(rel / "sectors" / f"{slug}.json")
    if not page:
        reason = "Sector data is not loaded yet: this industry's page is missing from the current data set. It is rebuilt at the next nightly run."
        return _reply(request, {"available": False, "status": "not_loaded", "reason": reason, "detail": reason}, started, status=503, cache=NO_STORE)
    return _reply(request, redact_sector_industry(public_industry(page, top_stocks=top), await _plan(request)), started)


@router.get("/api/technicals/{symbol}/sector")
async def stock_sector(symbol: str, request: Request) -> Response:
    started = time.perf_counter()
    rel = sd.live_release()
    if rel is None:
        return _not_loaded(request, started)
    sym = symbol.strip().upper()
    if not sd.SYMBOL.match(sym):
        return _not_found(request, started, "This is not an NSE symbol.")
    path = rel / f"{sym}.json"
    if path.parent != rel:      # belt and braces: the file must sit directly in the release folder
        return _not_found(request, started, "This is not an NSE symbol.")
    doc = sd.read_json(path)
    if not isinstance(doc, dict):
        return _not_found(request, started, f"No sector reading for {sym}. It did not trade on the last session, or NSE has not classified its industry yet.")
    return _reply(request, redact_sector_stock(public_stock_sector(doc.get("sector")) if isinstance(doc.get("sector"), dict) else doc.get("sector"), sym, await _plan(request)), started)



# ------------------------------------------------------------------------------------------------ Sector Rotation
def _rotation_missing(request: Request, started: float) -> Response:
    """No rotation file in the live release (a set built before rotation existed, or a build where rotation failed): say so in words. The site process never computes it (no pandas here)."""
    if sd.live_release() is None:
        return _not_loaded(request, started)
    reason = "Rotation data is not loaded yet: the current data set has no rotation files. They are written by the next nightly sector run."
    return _reply(request, {"available": False, "status": "not_loaded", "reason": reason, "detail": reason}, started, status=503, cache=NO_STORE)


@router.get("/api/rotation")
async def rotation_map(request: Request, show: Optional[str] = None) -> Response:
    started = time.perf_counter()
    rel = _base(sd.live_release(), show)
    data = sd.read_json(rel / "rotation" / "_map.json") if rel else None
    if not data:
        return _sectors_missing(request, started) if show == "sectors" else _rotation_missing(request, started)
    payload = redact_rotation_map(public_rotation(data), await _plan(request))
    if isinstance(payload, dict) and payload.get("rows"):                    # the insight cards under the Rotation charts, worked out here from the rows this plan may see
        payload = {**payload, "insights": rotation_insights(payload["rows"])}
    if isinstance(payload, dict):
        payload = {**payload, "show": "sectors" if show == "sectors" else "industries"}
    return _reply(request, payload, started)


@router.get("/api/rotation/{slug}")
async def rotation_card(slug: str, request: Request, show: Optional[str] = None) -> Response:
    started = time.perf_counter()
    rel = _base(sd.live_release(), show)
    data = sd.read_json(rel / "rotation" / "_map.json") if rel else None
    if not data:
        return _sectors_missing(request, started) if show == "sectors" else _rotation_missing(request, started)
    slug = sd.resolve_slug(slug, {r.get("slug") for r in data.get("rows", [])})
    if not sd.SLUG.match(slug) or slug not in {r.get("slug") for r in data.get("rows", [])}:       # only a slug the map lists is ever turned into a file name
        why = "This group has no rotation reading: it has fewer than 8 counted stocks, or there is no group with this address."
        return _not_found(request, started, why)
    card = sd.read_json(rel / "rotation" / f"{slug}.json")
    if not card:
        reason = "Rotation data is not loaded yet: this group's rotation card is missing from the current data set. It is rebuilt at the next nightly run."
        return _reply(request, {"available": False, "status": "not_loaded", "reason": reason, "detail": reason}, started, status=503, cache=NO_STORE)
    return _reply(request, public_rotation_group(card), started)
