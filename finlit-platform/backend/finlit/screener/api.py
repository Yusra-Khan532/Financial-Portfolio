"""Screener endpoints. The filters, the plan check and the answer all live here: the website only draws what it is sent."""

from __future__ import annotations

import time
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Query, Request, Response
from pydantic import BaseModel, Field, field_validator

from ..auth.routes import NO_STORE, fail
from ..auth.service import current
from .catalog import BY_KEY, CAPS, CATALOG, GROUP_LABEL, GROUPS, GROUP_TIER, HIDDEN, INDEX_LISTS, VARIANTS, allowed, offered
from .data import get_table
from .ready import BY_ID as READY_BY_ID, READY, public as ready_public, shown_to

router = APIRouter(prefix="/api/screener")
BASIC_ROWS = 25
# The table opens with company, market cap and price only; the website adds a column for each filter the visitor adds (and takes it away with the filter).
DEFAULT_COLUMNS = ["market_cap", "price"]
# The Stock screener's nine standard columns (task #64, file 04): LTP (with the day's change under it), market cap, P/E, ROE, ROCE, sales growth 3Y, debt to equity,
# 1-year return and FinLit IQ. A visitor is sent only the ones their plan shows (FinLit IQ is Gold).
STANDARD_COLUMNS = ["price", "market_cap", "pe", "roe", "roce", "sales_cagr_3y", "debt_to_equity", "ret_1y", "overall"]
IQ_BANDS = ("strong", "healthy", "mixed", "watch")
PRISM_BANDS = ("strong", "healthy", "average", "weak", "poor")


def is_gold(plan: str) -> bool:
    return plan in ("gold", "admin", "platinum")


def standard_columns(plan: str) -> List[str]:
    """The nine standard columns of the plan: the last is the plan's score (FinLit Prism for Gold, the FinLit IQ below)."""
    cols = [("prism_final" if k == "overall" and is_gold(plan) else k) for k in STANDARD_COLUMNS]
    return [k for k in cols if allowed(plan, BY_KEY[k].tier)]


class Rng(BaseModel):
    min: Optional[float] = Field(default=None, ge=-1e12, le=1e12)
    max: Optional[float] = Field(default=None, ge=-1e12, le=1e12)


class Cats(BaseModel):
    sector: List[str] = Field(default_factory=list, max_length=40)
    industry: List[str] = Field(default_factory=list, max_length=60)
    index: List[str] = Field(default_factory=list, max_length=20)
    cap: List[Literal["Large", "Mid", "Small"]] = Field(default_factory=list, max_length=3)
    band: List[Literal["strong", "healthy", "mixed", "watch"]] = Field(default_factory=list, max_length=4)


class Sort(BaseModel):
    key: str = Field(default="market_cap", max_length=40)
    dir: Literal["asc", "desc"] = "desc"


class Ratio(BaseModel):
    """A ratio the member builds: one catalogue figure divided by another, with an optional range on the result (task #61)."""
    id: str = Field(pattern=r"^r[0-9]$")
    num: str = Field(max_length=40)
    den: str = Field(max_length=40)
    min: Optional[float] = Field(default=None, ge=-1e12, le=1e12)
    max: Optional[float] = Field(default=None, ge=-1e12, le=1e12)


class Query_(BaseModel):
    ratios: List[Ratio] = Field(default_factory=list, max_length=3)
    filters: Dict[str, Rng] = Field(default_factory=dict, max_length=60)
    cats: Cats = Field(default_factory=Cats)
    q: str = Field(default="", max_length=60)
    sort: Sort = Field(default_factory=Sort)
    columns: List[str] = Field(default_factory=list, max_length=40)
    offset: int = Field(default=0, ge=0, le=10000)
    limit: int = Field(default=50, ge=1, le=100)
    funnel: bool = False
    model_screen: Optional[str] = Field(default=None, max_length=40)   # a ready-made screen on a FinLit score, applied here by id: its cut-offs never travel
    model_screens: List[str] = Field(default_factory=list, max_length=12)   # several at once: they stack (task #64 P-4), each one narrowing the result

    @field_validator("model_screens")
    @classmethod
    def known_models(cls, v: List[str]) -> List[str]:
        for x in v:
            if not (x in READY_BY_ID and READY_BY_ID[x].score):
                raise ValueError("unknown model screen")
        return list(dict.fromkeys(v))

    @field_validator("model_screen")
    @classmethod
    def known_model(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not (v in READY_BY_ID and READY_BY_ID[v].score):   # a screen on a FinLit score (its cut-offs or its rating word stay here)
            raise ValueError("unknown model screen")
        return v

    @field_validator("filters")
    @classmethod
    def known(cls, v: Dict[str, Rng]) -> Dict[str, Rng]:
        for k in v:
            if k not in BY_KEY:
                raise ValueError(f"unknown filter {k}")
        return v


def _plan(ctx) -> str:
    return ctx.plan if ctx.authed else "basic"


def _locked(plan: str, keys: List[str]) -> Dict[str, str]:
    return {k: BY_KEY[k].tier for k in keys if k in BY_KEY and not allowed(plan, BY_KEY[k].tier)}


def _refuse(locked: Dict[str, str], what: str):
    tier = "gold" if "gold" in locked.values() else "silver"
    names = ", ".join(BY_KEY[k].label for k in list(locked)[:3])
    return fail(403, "plan_required", f"{what} {names} {'is' if len(locked) == 1 else 'are'} part of the {tier.title()} plan.", plan=tier, keys=list(locked))


def _table(request: Request):
    return get_table(request.app.state.store)


@router.get("/catalog")
async def catalog(request: Request):
    """Every filter, grouped, with its plan, a plain-words hint and where companies sit (for sliders and placeholders)."""
    ctx = await current(request)
    plan = _plan(ctx)
    t = await _table(request)
    groups = []
    for gid, label in GROUPS:
        if not offered(plan, gid):           # Gold sees FinLit Prism and never the FinLit IQ; below Gold, no Prism (tasks #64 P-1, #100)
            continue
        ms = [m for m in CATALOG if m.group == gid]
        groups.append({"id": gid, "label": label, "tier": GROUP_TIER.get(gid, "basic"), "metrics": [
            {"key": m.key, "label": m.label, "unit": m.unit, "better": m.better, "tier": m.tier, "say": m.say, "digits": m.digits,
             "locked": not allowed(plan, m.tier), "stats": t.stats.get(m.key), "hidden": m.key in HIDDEN, "variants": VARIANTS.get(m.key)} for m in ms]})
    body = {
        "plan": plan, "total": t.n, "withReport": t.n_full, "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t.loaded)), "pricesAt": (t.sig or {}).get("lat"), "scoresAt": (t.sig or {}).get("at"),
        "groups": groups,
        # NSE sectors only: the ones an NSE industry sits under (task #64, file 04, data fix 2); a stray label held by one or two companies is not a sector to filter by
        "sectors": [{"name": n, "n": c} for n, c in t.sectors if n in {s for _, s, _ in t.industries if s}],
        "industries": [{"name": n, "sector": s, "n": c} for n, s, c in t.industries],
        "indices": [{"code": c, "label": INDEX_LISTS[c][0], "n": len(t.members.get(c, ()))} for c in INDEX_LISTS if t.members.get(c)],
        "caps": [{"name": c, "n": sum(1 for x in t.cap if x == c)} for c in CAPS],
        # the rating chips: FinLit Prism's words for Gold, the FinLit IQ's below (locked on Basic)
        "bandModel": "prism" if is_gold(plan) else "iq",
        "bands": ([{"key": b, "label": b.title(), "locked": False, "n": sum(1 for x in t.pband if x == b)} for b in PRISM_BANDS] if is_gold(plan)
                  else [{"key": b, "label": b.title(), "locked": not allowed(plan, "silver"), "n": sum(1 for x in t.band if x == b)} for b in IQ_BANDS]),
        "limits": {"rows": BASIC_ROWS if plan == "basic" else None, "export": False},    # no downloads on any plan (task #64 P-3)
        "defaultColumns": DEFAULT_COLUMNS,
        "standardColumns": standard_columns(plan),
    }
    return Response(content=__import__("json").dumps(body, separators=(",", ":")), media_type="application/json", headers={**NO_STORE, "Vary": "Cookie"})


def screens_of(body) -> List[str]:
    """The screens on a FinLit score this query runs: the older single `model_screen` and the stacked `model_screens`."""
    return list(dict.fromkeys(([body.model_screen] if body.model_screen else []) + list(body.model_screens)))


def cats_for(body, plan: str) -> dict:
    """The category filters, with the rating words read against the plan's score: FinLit Prism's band for Gold, the FinLit IQ's below.
    A screen on a FinLit score that filters by its rating word (Strong) adds that word."""
    c = body.cats.model_dump()
    bands = list(c.get("band") or [])
    for sid in screens_of(body):          # a screen that keeps one rating word narrows to it (stacked: every word must hold)
        want = set(READY_BY_ID[sid].bands)
        if want:
            bands = sorted((set(bands) & want) if bands else want)
    if is_gold(plan):
        c["pband"], c["band"] = bands, []
    else:
        c["band"] = bands
    return c


def _model_rules(mids) -> Dict[str, Dict[str, Optional[float]]]:
    """The cut-offs of the model screens that are on, for this server's own use only: applied, never sent. Two that set the same figure keep the overlap."""
    out: Dict[str, Dict[str, Optional[float]]] = {}
    for mid in ([mids] if isinstance(mids, str) else (mids or [])):
        if not (mid and READY_BY_ID[mid].model):
            continue
        for k, v in READY_BY_ID[mid].rules.items():
            cur = out.get(k, {"min": None, "max": None})
            lo = [x for x in (cur.get("min"), v.get("min")) if x is not None]
            hi = [x for x in (cur.get("max"), v.get("max")) if x is not None]
            out[k] = {"min": max(lo) if lo else None, "max": min(hi) if hi else None}
    return out


_ready_counts: Dict[str, object] = {"loaded": None, "counts": {}}


def ready_counts(t) -> Dict[str, int]:
    """How many companies each ready-made screen holds today, worked out once per loaded table."""
    if _ready_counts["loaded"] != t.loaded:
        counts = {}
        for r in READY:
            cats = {"sector": [], "industry": [], "index": [], "cap": list(r.caps), "band": [] if r.score == "prism" else list(r.bands), "pband": list(r.bands) if r.score == "prism" else []}
            counts[r.id] = len(t.match({k: dict(v) for k, v in r.rules.items()}, cats))
        _ready_counts.update(loaded=t.loaded, counts=counts)
    return _ready_counts["counts"]  # type: ignore[return-value]


@router.get("/ready")
async def ready(request: Request):
    """The ready-made screens of the Stock screener with today's count: a metric screen's rules come along (they load into Your rules);
    a screen on the FinLit model is words only."""
    plan = _plan(await current(request))
    t = await _table(request)
    counts = ready_counts(t)
    body = {"asOf": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t.loaded)), "total": t.n,
            "screens": [ready_public(r, counts.get(r.id)) for r in READY if shown_to(r, plan)]}     # FinLit IQ screens below Gold, Prism screens for Gold
    return Response(content=__import__("json").dumps(body, separators=(",", ":"), ensure_ascii=False), media_type="application/json", headers={**NO_STORE, "Vary": "Cookie"})


def _run(t, body: Query_, plan: str):
    filters = {k: v.model_dump() for k, v in body.filters.items() if v.min is not None or v.max is not None}
    cols = [c for c in (body.columns or DEFAULT_COLUMNS)]
    bad = [c for c in cols if c not in BY_KEY]
    if bad:
        raise fail(400, "bad_request", "Unknown column.")
    for rt in body.ratios:
        if rt.num not in BY_KEY or rt.den not in BY_KEY or BY_KEY[rt.num].unit == "flag" or BY_KEY[rt.den].unit == "flag":
            raise fail(400, "bad_request", "A ratio needs two numeric figures.")
    need = list(filters) + [c for c in cols] + ([body.sort.key] if body.sort.key in BY_KEY else []) + [k for rt in body.ratios for k in (rt.num, rt.den)]
    locked = _locked(plan, need)
    off_plan = [k for k in need if k in BY_KEY and not offered(plan, BY_KEY[k].group)]
    if off_plan or any(not shown_to(READY_BY_ID[sid], plan) for sid in screens_of(body)):
        raise fail(400, "bad_request", "That filter is not part of this plan's score: Gold uses FinLit Prism, Silver the FinLit IQ.")
    if (body.cats.band or screens_of(body)) and not allowed(plan, "silver"):
        locked["overall"] = "silver"
    if locked:
        raise _refuse(locked, "Filtering or showing")
    model = _model_rules(screens_of(body))
    for k, v in model.items():             # the reader's own rule on the same figure: the stricter of the two applies
        if k in filters:
            lo = [x for x in (filters[k].get("min"), v.get("min")) if x is not None]
            hi = [x for x in (filters[k].get("max"), v.get("max")) if x is not None]
            filters[k] = {"min": max(lo) if lo else None, "max": min(hi) if hi else None}
    filters = {**model, **filters}
    ids = {rt.id for rt in body.ratios}
    if body.sort.key not in BY_KEY and body.sort.key not in ("name", "symbol") and body.sort.key not in ids:
        raise fail(400, "bad_request", "Unknown sort.")
    idx = t.match(filters, cats_for(body, plan), body.q)
    vals = {rt.id: t.ratio(rt.num, rt.den) for rt in body.ratios}
    for rt in body.ratios:                      # a ratio with a range keeps only companies where both figures exist and the result is inside it
        if rt.min is not None or rt.max is not None:
            v = vals[rt.id]
            idx = [i for i in idx if v[i] == v[i] and (rt.min is None or v[i] >= rt.min) and (rt.max is None or v[i] <= rt.max)]
    if body.sort.key in ids:
        v = vals[body.sort.key]
        known = sorted([i for i in idx if v[i] == v[i]], key=lambda i: v[i], reverse=body.sort.dir == "desc")
        idx = known + [i for i in idx if v[i] != v[i]]
    else:
        idx = t.sort(idx, body.sort.key, body.sort.dir == "desc")
    return idx, cols, vals


@router.post("/query")
async def query(request: Request, body: Query_):
    started = time.perf_counter()
    plan = _plan(await current(request))
    t = await _table(request)
    idx, cols, rv = _run(t, body, plan)
    total = len(idx)
    capped = plan == "basic" and total > BASIC_ROWS
    lim = min(body.limit, BASIC_ROWS) if plan == "basic" else body.limit
    off = 0 if plan == "basic" else body.offset
    page = idx[off: off + lim]
    rows = [t.row(i, cols) for i in page]
    for r, i in zip(rows, page):
        if rv:
            r["r"] = {k: (None if v[i] != v[i] else round(v[i], 4)) for k, v in rv.items()}
    if not allowed(plan, "silver"):  # the score band is a model output: below Silver only the free showcase companies keep it, as on the universe list
        showcase = set(request.app.state.settings.showcase_symbols)
        for r in rows:
            if r["symbol"] not in showcase:
                r["band"] = None
    out = {"total": total, "offset": off, "limit": lim, "capped": capped, "columns": cols, "rows": rows,
           "took": round((time.perf_counter() - started) * 1000, 1)}
    if body.funnel:        # what is left after each rule in turn, and how many companies a rule left out for having no figure (the Stock screener's funnel)
        out["funnel"] = t.funnel({k: v.model_dump() for k, v in body.filters.items() if v.min is not None or v.max is not None}, cats_for(body, plan),
                                 model=_model_rules(screens_of(body)))
    return Response(content=__import__("json").dumps(out, separators=(",", ":")), media_type="application/json", headers={**NO_STORE, "Vary": "Cookie"})
