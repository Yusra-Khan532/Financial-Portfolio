"""GET /api/mf/{code}/score, GET /api/mf/etf/{symbol}/score and GET /api/mf/scores: the Mutual Fund Score, read from mf_scores.

Plan gating, enforced here and not only on the page: the score is a Gold feature. A Basic or Silver account (or a visitor) gets
a locked answer with no value, no pillar, no breakdown, no rank and no order: a locked field is present and null, so the browser cannot tell a locked value from a
missing one (as the screener's list does). Schemes named in MF_SCORE_SHOWCASE (scheme codes, none by default: the site has no free fund showcase list) stay open to everyone.
Answers that depend on the plan are private and never stored by a shared cache.

Placement: this router is included BEFORE finlit.mf's, whose /api/mf/{code} would otherwise claim /api/mf/scores."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from ..auth.entitlements import has, sees_all
from ..auth.routes import fail
from ..auth.service import current
from . import MODEL_VERSION
from .dashboard import summarize
from .groups import GROUP_NAMES
from .reasons import texts
from .scorehist import part_scores, part_word, part_words
from .sheets import PILLAR_NAMES, PILLARS, WEIGHTS

router = APIRouter(prefix="/api/mf")
log = logging.getLogger(__name__)

DISCLAIMER = "Describes the fund's health from its past NAVs, costs and holdings; not a recommendation. Information only, not investment advice."
METHOD_URL = "/methodology/mf-score"
PRIVATE = "private, no-store"
SYMBOL_RE = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
SORTS = {"final": "final", "perf": "perf", "risk": "risk", "cost": "cost", "quality": "quality", "rank": "percentile", "name": "key"}
LIST_COLS = "key, kind, code, symbol, plan, grp, sub, category, final, label, status, reason, perf, risk, cost, quality, rank, rank_of, rank_scope, percentile, flags, confidence, run_date"
NOT_SCORED = {
    "idcw": "Not scored: IDCW and other options show the score of the Growth option of the same plan, and this fund has no scored Growth option of this plan.",
    "inactive": "Not scored: this scheme has stopped publishing NAVs.",
    "no_plan": "Not scored: the plan (Direct or Regular) is not stated for this scheme.",
    "etf_no_price": "Not scored: this exchange-traded fund has no exchange price history loaded yet.",
    "etf_not_offered": "Mutual Fund Score is not given for exchange-traded funds.",
    "not_yet": "Not scored yet: the daily score run has not reached this scheme.",
}

# task #281 (owner, 20 Nov 2026): an IDCW / payout option shows its Growth option's score (same fund, same plan), labelled as that option's.
INHERITED_LABEL = "Growth option's score"
INHERITED_WHY = "This option pays out or has no Growth NAV of its own, so it shows the score of the Growth option of the same fund and plan."
# Each plan is scored against its own plan's peers, so a Regular plan can score higher than its own Direct plan (Parag Parikh Flexi Cap, 20 Nov 2026:
# Regular 62.0, Direct 58.3). The model is unchanged; the lists and the score's tooltip say so.
PLAN_NOTE = "Scores compare Direct plans with Direct plans and Regular with Regular."


LANDING_FUND = 122639   # task #239: Parag Parikh Flexi Cap Fund, Direct plan, Growth, the landing page's sample fund (MF_LANDING_FUND overrides; "off" shows none)


def landing_fund() -> Optional[int]:
    """The scheme the landing page's Mutual Fund Score card shows (task #239), or None when switched off."""
    v = os.getenv("MF_LANDING_FUND", "").strip().lower()
    if v in ("off", "none", "0"):
        return None
    return int(v) if v.isdigit() else LANDING_FUND


def showcase() -> set:
    """Schemes whose score every visitor may see: MF_SCORE_SHOWCASE, plus the landing page's sample fund (task #239: as the landing page's
    Prism company is open on its own report, the sample fund's score is open on its own page, so the card's button leads to the same figures)."""
    out = {int(x) for x in os.getenv("MF_SCORE_SHOWCASE", "").replace(" ", "").split(",") if x.isdigit()}
    lf = landing_fund()
    return out | {lf} if lf else out


async def may_see(request: Request, code: Optional[int] = None) -> bool:
    """Gold (an admin too), or a showcase scheme."""
    if code is not None and code in showcase():
        return True
    ctx = await current(request)
    return has(ctx.plan, "gold") or sees_all(ctx)


async def require_score_plan(request: Request) -> None:
    """For routes whose ORDER would say what the value says (the fund list sorted by score)."""
    if not await may_see(request):
        raise fail(403, "plan_required", "The Mutual Fund Score is part of the Gold plan.", plan="gold")


def _load(v: Any) -> Any:
    return json.loads(v) if isinstance(v, str) else v


def pillars_view(group: str, r: Dict[str, Any], values: bool = True) -> List[Dict[str, Any]]:
    """The four parts of a score: the word and, when the score is rated and may be seen, the part's figure (task #238). No weight is sent: how much each
    part counts stays on the server."""
    flags = (_load(r["breakdown"]) or {}).get("pillarFlags", {}) if values else {}
    out = []
    for p in PILLARS:
        score = r[{"performance": "perf", "risk": "risk", "cost": "cost", "quality": "quality"}[p]] if values else None
        row = {"key": p, "name": PILLAR_NAMES[p], "reading": part_word(score), "allNotApplicable": bool(flags.get(p))}
        if values:   # task #238: a rated score shows each part's own figure (0 to 100) beside its word; a locked or unrated answer carries none
            row["points"] = None if score is None else round(float(score), 1)
        out.append(row)
    return out


def locked_payload(group: Optional[str], plan: Optional[str], **extra: Any) -> Dict[str, Any]:
    """What a plan below Gold gets: the four part names and nothing a fund scored (no weights, no readings)."""
    return {"locked": True, "plan": "gold", "detail": "The Mutual Fund Score is part of the Gold plan.", "group": group, "groupName": GROUP_NAMES.get(group or ""),
            "fundPlan": plan, "final": None, "label": None, "status": None, "pillars": [{"key": p, "name": PILLAR_NAMES[p], "reading": None} for p in PILLARS] if group in WEIGHTS else [],
            "disclaimer": DISCLAIMER, "method": METHOD_URL, "model": MODEL_VERSION, **extra}


def rank_view(r: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if r["rank"] is None:
        return None
    return {"rank": r["rank"], "of": r["rank_of"], "scope": r["rank_scope"], "percentile": None if r["percentile"] is None else int(r["percentile"]),
            "category": r["category"], "categoryLabel": _sub_label(r["category"]), "plan": r["plan"]}


def _sub_label(category: Optional[str]) -> Optional[str]:
    if not category:
        return None
    try:
        from ..mf import classify
        return classify(category)[2]
    except Exception:
        return category


PEER_TEXT = texts()["peerSets"]
PRIVATE_METRIC_KEYS = ("weight", "pillarWeight")



# Task #132 (and the site rule "no cut-offs, weights, formulas or look-back lengths on pages"): reasons.json no longer names a look-back window, but texts
# written before that by the nightly scoring run are stored with it. They are cleaned on the way out, so the page never shows one; the next run stores clean text.
_LOOKBACK = [(re.compile(r" of the months compared \(\d+ months compared\)"), " of months"), (re.compile(r" \(\d+ (?:months compared|down months)\)"), ""),
             (re.compile(r" over three years"), ""), (re.compile(r" in the last three years"), ""), (re.compile(r" of the last three years"), " of the time")]


def plain_text(text: str) -> str:
    for rx, rep in _LOOKBACK:
        text = rx.sub(rep, text)
    return text


def _plain_lines(lines):
    return [{**x, "text": plain_text(x["text"])} if isinstance(x, dict) and isinstance(x.get("text"), str) else x for x in lines or []]


def payload(r: Dict[str, Any], *, inherited: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """One stored score row -> the answer of /api/mf/{code}/score (values included: the caller has checked the plan)."""
    b = _load(r["breakdown"]) or {}
    t = texts()["metrics"]
    metrics = []
    tx = texts()
    for m in b.get("metrics", []):
        table = {"F": "gaps", "N": "na", "S": "substitutes"}.get(m["state"])
        m = {k: v for k, v in m.items() if k not in PRIVATE_METRIC_KEYS}      # the stored breakdown keeps its weights for the engine; the site never gets them
        metrics.append({**m, "label": t.get(m["id"], {}).get("label", m["id"]), "whyText": (tx.get(table, {}).get(m.get("why") or "") if table else None)})
    n_f = sum(1 for m in metrics if m["state"] == "F")
    n_all = sum(1 for m in metrics if m["state"] != "N")
    rated = r["final"] is not None
    reasons = b.get("reasons") or {}
    return {
        "locked": False, "key": r["key"], "kind": r["kind"], "code": r["code"], "symbol": r["symbol"], "plan": r["plan"], "group": r["grp"], "groupName": GROUP_NAMES.get(r["grp"]),
        "type": r["mtype"], "category": r["category"], "categoryLabel": _sub_label(r["category"]) if r["kind"] == "mf" else "Exchange-traded fund", "runDate": r["run_date"].isoformat(),
        "navDate": r["nav_date"].isoformat() if r["nav_date"] else None, "status": r["status"], "reason": r["reason"], "final": r["final"] if rated else None,
        "label": r["label"], "rawFinal": r["raw_final"] if rated else None, "cap": r["cap"], "pillars": pillars_view(r["grp"], r, rated), "confidence": r["confidence"],
        "months": r["months"], "flags": list(r["flags"] or []), "rank": rank_view(r) if rated else None,
        "peers": {"kind": r["peer_kind"], "n": r["peer_n"], "text": PEER_TEXT.get(r["peer_kind"] or "", None)},
        "family": b.get("family"), "nearIdentical": "NEAR_IDENTICAL" in (r["flags"] or []),
        "reasons": {"strengths": _plain_lines(reasons.get("strengths", [])), "watchouts": _plain_lines(reasons.get("watchouts", [])), "gaps": reasons.get("gaps", []),
                    "notApplicable": reasons.get("notApplicable", []), "substitutions": reasons.get("substitutions", [])},
        "filled": {"n": n_f, "of": n_all}, "metrics": metrics if rated else [], "inherited": inherited, "planNote": PLAN_NOTE, "model": r["model"], "disclaimer": DISCLAIMER, "method": METHOD_URL,
    }


def _json(body: Dict[str, Any], status: int = 200) -> JSONResponse:
    return JSONResponse(body, status_code=status, headers={"Cache-Control": PRIVATE, "Vary": "Cookie"})


async def _row(conn, key: str):
    if key.startswith("etf:"):   # Mutual Fund Score is not given for exchange-traded funds: nothing about one leaves the server (the score run still reads them as peers)
        return None
    r = await conn.fetchrow("SELECT * FROM mf_scores WHERE key = $1", key)
    return dict(r) if r else None


@router.get("/scores")
async def scores(request: Request, group: str = Query("", max_length=12), category: str = Query("", max_length=160), plan: str = Query("", max_length=10),
                 codes: str = Query("", max_length=1200), symbols: str = Query("", max_length=2400), sort: str = Query("final", max_length=10), dir: str = Query("desc", pattern="^(asc|desc)$"),
                 status: str = Query("", max_length=12), limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0, le=100000)) -> JSONResponse:
    """Scores for tables: by scheme codes (up to 100: the funds on the page), or a group / category, sorted. Gold only; below that the values are
    null for the codes asked and a list query returns nothing (its order would leak the ranking)."""
    if sort not in SORTS:
        raise fail(400, "bad_request", "Unknown sort column.")
    if group and group not in GROUP_NAMES:
        raise fail(400, "bad_request", "Unknown group.")
    if plan and plan not in ("Direct", "Regular", "ETF"):
        raise fail(400, "bad_request", "Unknown plan.")
    if status and status not in ("RATED", "PROVISIONAL", "NOT RATED"):
        raise fail(400, "bad_request", "Unknown status.")
    try:
        ids = list(dict.fromkeys(int(x) for x in codes.split(",") if x.strip()))
    except ValueError:
        raise fail(400, "bad_request", "codes must be scheme codes separated by commas.")
    if len(ids) > 100 or any(not 0 < c < 10 ** 7 for c in ids):
        raise fail(400, "bad_request", "Up to 100 scheme codes.")
    syms = list(dict.fromkeys(x.strip().upper() for x in symbols.split(",") if x.strip()))
    if len(syms) > 100 or any(not SYMBOL_RE.match(x) for x in syms):
        raise fail(400, "bad_request", "Up to 100 ETF symbols.")
    seen = showcase()
    full = await may_see(request)
    if not full and not ids and not syms:
        return _json({"locked": True, "plan": "gold", "total": None, "items": [], "disclaimer": DISCLAIMER, "method": METHOD_URL})
    where, args = ["kind <> 'etf'"], []   # no exchange-traded fund is ever listed with a score

    def arg(v):
        args.append(v)
        return f"${len(args)}"
    if ids or syms:   # the funds on a page: scheme codes (an ETF symbol asked for is answered below with the reason, never with a score)
        where.append(f"code = ANY({arg(ids)}::int[])" if ids else "false")
    for col, v in (("grp", group), ("category", category), ("plan", plan), ("status", status)):
        if v:
            where.append(f"{col} = {arg(v)}")
    w = ("WHERE " + " AND ".join(where)) if where else ""
    order = f"{SORTS[sort]} {'ASC' if dir == 'asc' else 'DESC'} NULLS LAST, key"
    async with request.app.state.store.pool.acquire() as conn:
        total = await conn.fetchval(f"SELECT count(*) FROM mf_scores {w}", *args)  # nosec B608 - fixed column names; every value is a bound parameter
        rows = await conn.fetch(f"SELECT {LIST_COLS} FROM mf_scores {w} ORDER BY {order} LIMIT {limit} OFFSET {offset}", *args)  # nosec B608 - column list and sort come from fixed maps; limit and offset are range-checked integers
        run = await conn.fetchval("SELECT max(run_date) FROM mf_scores")
    items = []
    for r in rows:
        open_ = full or (r["code"] is not None and r["code"] in seen)
        item = {"code": r["code"], "symbol": r["symbol"], "plan": r["plan"], "group": r["grp"]}
        if open_:
            item.update(final=r["final"], label=r["label"], status=r["status"], reason=r["reason"], pillars=part_words(r["perf"], r["risk"], r["cost"], r["quality"]),
                        pillarScores=part_scores(r["perf"], r["risk"], r["cost"], r["quality"]),   # task #378: each part's figure (Gold, like the score)
                        rank=r["rank"], rankOf=r["rank_of"], rankScope=r["rank_scope"], percentile=None if r["percentile"] is None else int(r["percentile"]), flags=list(r["flags"] or []),
                        confidence=r["confidence"], category=r["category"])
        else:
            item.update(final=None, label=None, status=None, reason=None, pillars=None, pillarScores=None, rank=None, rankOf=None, rankScope=None, percentile=None, flags=[], confidence=None, category=None)
        items.append(item)
    if syms:   # an ETF asked for with no row: say why (a symbol the exchange list does not know is left out)
        have_s = {i["symbol"] for i in items}
        gone = [x for x in syms if x not in have_s]
        if gone:
            async with request.app.state.store.pool.acquire() as conn:
                known = {r["symbol"] for r in await conn.fetch("SELECT symbol FROM etf_funds WHERE symbol = ANY($1::text[])", gone)}
            for x in gone:
                if x in known:
                    items.append({"code": None, "symbol": x, "plan": "ETF", "group": None, "final": None, "label": None, "status": None, "pillars": None, "pillarScores": None, "rank": None, "rankOf": None,
                                  "rankScope": None, "percentile": None, "flags": [], "confidence": None, "category": None, "reason": NOT_SCORED["etf_not_offered"] if full else None, "notOffered": True})
    if ids:   # a scheme asked for with no row: say why (the page shows the reason, never a blank)
        have = {i["code"] for i in items}
        missing = [c for c in ids if c not in have]
        if missing:
            async with request.app.state.store.pool.acquire() as conn:
                info = {r["code"]: r for r in await conn.fetch("SELECT code, option_class, active, plan, category, isin FROM mf_schemes WHERE code = ANY($1::int[])", missing)}
                # task #281: an IDCW / payout option shows the score of the Growth option of the same fund and plan, labelled as that option's
                sib = {r["of_code"]: r for r in await conn.fetch(
                    f"""SELECT s.code AS of_code, g.code AS g_code, g.name AS g_name, {', '.join('m.' + c.strip() for c in LIST_COLS.split(','))}
                          FROM mf_schemes s
                          JOIN LATERAL (SELECT code, name FROM mf_schemes g WHERE g.family = s.family AND g.plan = s.plan AND g.option_class = 'Growth' AND g.active
                                         ORDER BY g.code LIMIT 1) g ON true
                          JOIN mf_scores m ON m.key = 'mf:' || g.code
                         WHERE s.code = ANY($1::int[]) AND s.option_class <> 'Growth' AND s.active""", missing)}  # nosec B608 - fixed column list; codes are a bound parameter
            from ..mf import classify
            from .groups import ETF_SUBS
            for c in missing:
                s = info.get(c)
                if s is None:
                    continue
                if classify(s["category"] or "")[1] in ETF_SUBS:   # task #281: an ETF's AMFI code: the score is not given (not "IDCW" or "plan not stated")
                    items.append({"code": c, "symbol": None, "plan": "ETF", "group": None, "final": None, "label": None, "status": None, "pillars": None, "pillarScores": None, "rank": None,
                                  "rankOf": None, "rankScope": None, "percentile": None, "flags": [], "confidence": None, "category": None,
                                  "reason": NOT_SCORED["etf_not_offered"] if full else None, "notOffered": True})
                    continue
                g = sib.get(c)
                if g is not None:
                    open_ = full or g["g_code"] in seen
                    it = {"code": c, "symbol": None, "plan": s["plan"], "group": g["grp"],
                          "inherited": {"code": g["g_code"], "name": g["g_name"], "label": INHERITED_LABEL, "why": INHERITED_WHY}}
                    if open_:
                        it.update(final=g["final"], label=g["label"], status=g["status"], reason=g["reason"], pillars=part_words(g["perf"], g["risk"], g["cost"], g["quality"]),
                                  pillarScores=part_scores(g["perf"], g["risk"], g["cost"], g["quality"]),   # task #378: each part's figure (Gold, like the score)
                                  rank=g["rank"], rankOf=g["rank_of"], rankScope=g["rank_scope"], percentile=None if g["percentile"] is None else int(g["percentile"]),
                                  flags=list(g["flags"] or []), confidence=g["confidence"], category=g["category"])
                    else:
                        it.update(final=None, label=None, status=None, reason=None, pillars=None, pillarScores=None, rank=None, rankOf=None, rankScope=None, percentile=None, flags=[], confidence=None, category=None)
                    items.append(it)
                    continue
                items.append({"code": c, "symbol": None, "plan": s["plan"], "group": None, "final": None, "label": None, "status": None, "pillars": None, "pillarScores": None, "rank": None, "rankOf": None,
                              "rankScope": None, "percentile": None, "flags": [], "confidence": None, "category": None,
                              "reason": (NOT_SCORED["inactive"] if not s["active"] else NOT_SCORED["idcw"] if s["option_class"] != "Growth" else NOT_SCORED["no_plan"] if s["plan"] not in ("Direct", "Regular") else NOT_SCORED["not_yet"]) if full else None})
    return _json({"locked": not full, "total": total if full else None, "runDate": run.isoformat() if run else None, "items": items, "planNote": PLAN_NOTE, "disclaimer": DISCLAIMER, "method": METHOD_URL, "model": MODEL_VERSION})


@router.get("/scores/categories")
async def category_scores(request: Request) -> JSONResponse:
    """The Funds dashboard: median Mutual Fund Score, number scored and band counts per sub-category, over scored Direct-plan mutual funds. Gold only; a
    plan below that gets `locked` and no number at all (the cards would otherwise show what the list hides). `runDate` is null until the score job has run."""
    if not await may_see(request):
        return _json({"locked": True, "plan": "gold", "items": {}, "runDate": None, "disclaimer": DISCLAIMER, "method": METHOD_URL})
    async with request.app.state.store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT sub, final FROM mf_scores WHERE kind = 'mf' AND plan = 'Direct' AND final IS NOT NULL")
        run = await conn.fetchval("SELECT max(run_date) FROM mf_scores")
    return _json({"locked": False, "plan": "Direct", "runDate": run.isoformat() if run else None, "items": summarize((r["sub"], r["final"]) for r in rows),
                  "disclaimer": DISCLAIMER, "method": METHOD_URL, "model": MODEL_VERSION})


async def resolve_mf(conn, code: int):
    """(row, inherited, reason): the score row for a scheme code, or the Growth plan's row it inherits, or why there is none."""
    r = await _row(conn, f"mf:{code}")
    if r:
        return r, None, None
    s = await conn.fetchrow("SELECT code, name, family, plan, option_class, active, isin, category FROM mf_schemes WHERE code = $1", code)
    if s is None:
        return None, None, "unknown"
    # an ETF category scheme: no Mutual Fund Score is given (checked first: an ETF has no Direct / Regular plan and is not an IDCW option, task #281)
    from ..mf import classify
    from .groups import ETF_SUBS
    if classify(s["category"])[1] in ETF_SUBS:
        return None, None, "etf_not_offered"
    if s["option_class"] != "Growth":
        # task #281 (owner, 20 Nov 2026): the Growth option of the SAME plan only. Each plan is scored against its own plan's peers, so a Direct plan's
        # score on a Regular IDCW row would compare unlike with unlike; with no Growth option of this plan the row says so instead.
        g = await conn.fetchrow("SELECT code, name FROM mf_schemes WHERE family = $1 AND plan = $2 AND option_class = 'Growth' AND active ORDER BY code LIMIT 1", s["family"], s["plan"])
        if g:
            gr = await _row(conn, f"mf:{g['code']}")
            if gr:
                return gr, {"code": g["code"], "name": g["name"], "label": INHERITED_LABEL, "why": INHERITED_WHY}, None
        return None, None, "idcw"
    if not s["active"]:
        return None, None, "inactive"
    if s["plan"] not in ("Direct", "Regular"):
        return None, None, "no_plan"
    return None, None, "not_yet"


@router.get("/{code}/score")
async def score_of(request: Request, code: int) -> JSONResponse:
    if not 0 < code < 10 ** 7:
        raise fail(404, "not_found", "No mutual fund scheme has this code.")
    async with request.app.state.store.pool.acquire() as conn:
        row, inherited, why = await resolve_mf(conn, code)
        if why == "unknown":
            raise fail(404, "not_found", "No mutual fund scheme has this code.")
    return await _answer(request, row, inherited, why, code)


@router.get("/etf/{symbol}/score")
async def etf_score(request: Request, symbol: str) -> JSONResponse:
    sym = symbol.strip().upper()
    if not sym.isalnum() or len(sym) > 20:
        raise fail(404, "not_found", "No exchange-traded fund has this symbol.")
    async with request.app.state.store.pool.acquire() as conn:
        known = await conn.fetchval("SELECT 1 FROM etf_funds WHERE symbol = $1", sym)
    if not known:
        raise fail(404, "not_found", "No exchange-traded fund has this symbol.")
    return await _answer(request, None, None, "etf_not_offered", None)


async def _answer(request: Request, row, inherited, why, code: Optional[int]) -> JSONResponse:
    if not await may_see(request, code):
        return _json(locked_payload(row["grp"] if row else None, row["plan"] if row else None))
    if row is None:
        return _json({"locked": False, "final": None, "status": "NOT SCORED", "reason": NOT_SCORED.get(why or "not_yet", NOT_SCORED["not_yet"]), "notOffered": why == "etf_not_offered", "pillars": [], "reasons": {}, "metrics": [],
                      "disclaimer": DISCLAIMER, "method": METHOD_URL, "model": MODEL_VERSION})
    body = payload(row, inherited=inherited)
    if row["final"] is not None:   # the category's median parts, for the radar: the same category and plan (the tracking family for index funds and ETFs)
        body["categoryMedian"] = await category_median(request, row)
    return _json(body)


async def category_median(request: Request, row) -> Dict[str, Any]:
    async with request.app.state.store.pool.acquire() as conn:
        m = await conn.fetchrow("SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY perf) AS perf, percentile_cont(0.5) WITHIN GROUP (ORDER BY risk) AS risk, "
                                "percentile_cont(0.5) WITHIN GROUP (ORDER BY cost) AS cost, percentile_cont(0.5) WITHIN GROUP (ORDER BY quality) AS quality, "
                                "percentile_cont(0.5) WITHIN GROUP (ORDER BY final) AS final, count(*) AS n FROM mf_scores WHERE sub = $1 AND plan = $2 AND final IS NOT NULL", row["sub"], row["plan"])
    r1 = lambda v: None if v is None else round(float(v), 1)  # noqa: E731
    return {**part_words(m["perf"], m["risk"], m["cost"], m["quality"]), "final": r1(m["final"]), "n": m["n"],
            "plan": row["plan"], "categoryLabel": _sub_label(row["category"]) if row["kind"] == "mf" else "Exchange-traded funds"}


SHOWCASE_MAX_AGE = 300   # seconds a browser or proxy may keep the landing card's reading (a score is worked out at most once a day)
_PART_COL = {"performance": "perf", "risk": "risk", "cost": "cost", "quality": "quality"}


@router.get("/score-showcase")
async def score_showcase(request: Request) -> JSONResponse:
    """The landing page's Mutual Fund Score card (task #239, as /api/prism/showcase is for FinLit Prism): the newest stored score of the sample fund
    (landing_fund), open to every visitor like that fund's own score. Only the card figures: the score, its label, the four parts (figure and word),
    the fund's name, plan and category, and the day it was worked out; never the measures or the reasons. No rated score: 404 with the reason."""
    code = landing_fund()
    if code is None:
        return JSONResponse({"status": "none", "detail": "No sample fund is set."}, status_code=404, headers={"Cache-Control": "no-store"})
    try:
        async with request.app.state.store.pool.acquire() as conn:
            r = await _row(conn, f"mf:{code}")
            name = await conn.fetchval("SELECT name FROM mf_schemes WHERE code = $1", code)
    except Exception as exc:
        log.warning("mf score showcase not read: %s", type(exc).__name__)
        return JSONResponse({"status": "unavailable", "detail": "The sample score cannot be read right now."}, status_code=503,
                            headers={"Cache-Control": "no-store", "Retry-After": "60"})
    if r is None or r["final"] is None or not r["label"]:
        return JSONResponse({"status": "none", "detail": "No rated Mutual Fund Score is stored for the sample fund yet."}, status_code=404, headers={"Cache-Control": "no-store"})
    one = lambda v: None if v is None else round(float(v), 1)  # noqa: E731
    body = {"code": code, "name": name or f"Scheme {code}", "plan": r["plan"], "category": r["category"], "categoryLabel": _sub_label(r["category"]),
            "final": one(r["final"]), "label": r["label"], "status": r["status"], "runDate": r["run_date"].isoformat(),
            "parts": [{"key": p, "name": PILLAR_NAMES[p], "points": one(r[_PART_COL[p]]), "reading": part_word(r[_PART_COL[p]])} for p in PILLARS],
            "disclaimer": DISCLAIMER}
    return JSONResponse(body, headers={"Cache-Control": f"public, max-age={SHOWCASE_MAX_AGE}"})
