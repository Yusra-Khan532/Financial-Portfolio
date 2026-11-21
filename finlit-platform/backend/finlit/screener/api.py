"""Screener endpoints. The filters, the plan check and the answer all live here: the website only draws what it is sent."""

from __future__ import annotations

import time
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Query, Request, Response
from pydantic import BaseModel, Field, field_validator, model_validator

from ..auth.routes import NO_STORE, fail
from ..auth.service import current
from .catalog import BY_KEY, CAPS, CATALOG, GROUP_LABEL, GROUPS, GROUP_TIER, HIDDEN, INDEX_LISTS, SCALE, VARIANTS, allowed, family, offered, ratioable
from .data import get_table, nse_levels
from .ready import BY_ID as READY_BY_ID, READY, public as ready_public, shown_to

router = APIRouter(prefix="/api/screener")
BASIC_ROWS = 25
# The table opens with company, market cap and price only; the website adds a column for each filter the visitor adds (and takes it away with the filter).
DEFAULT_COLUMNS = ["market_cap", "price"]
# The Stock screener opens with the company name and the market cap only (task #145, 14 Nov 2026: "only name of company and market cap should be visible";
# it had opened with nine standard columns, task #64 file 04). Every other column is added from the Columns menu, or appears with a rule the visitor sets.
# Task #141: Gold also opens with the two Prism technical views, Short-term technical and Long-term technical, beside the market cap.
STANDARD_COLUMNS = ["market_cap"]
GOLD_TECHNICAL_COLUMNS = ["prism_st_score", "prism_lt_score"]
PRISM_BANDS = ("strong", "healthy", "average", "weak", "poor")
# FinLit Prism's words; "mixed" and "watch" (the retired FinLit IQ's) are still read so an older saved screen is not refused as malformed, and match nothing on Prism
BandWord = Literal["strong", "healthy", "mixed", "watch", "average", "weak", "poor"]


RATIO_PLAN_LINE = "Custom ratios come with Gold and Platinum."


def is_gold(plan: str) -> bool:
    return plan in ("gold", "admin", "platinum")


def standard_columns(plan: str) -> List[str]:
    """The columns the table opens with: the market cap for every plan, and for Gold the two technical views after it."""
    cols = list(STANDARD_COLUMNS) + (GOLD_TECHNICAL_COLUMNS if is_gold(plan) else [])
    return [k for k in cols if allowed(plan, BY_KEY[k].tier)]


class Rng(BaseModel):
    min: Optional[float] = Field(default=None, ge=-1e12, le=1e12)
    max: Optional[float] = Field(default=None, ge=-1e12, le=1e12)


class Cats(BaseModel):
    sector: List[str] = Field(default_factory=list, max_length=40)
    macro: List[str] = Field(default_factory=list, max_length=12)      # task #259: NSE macro sector (12)
    nsector: List[str] = Field(default_factory=list, max_length=22)    # task #259: NSE sector (22)
    industry: List[str] = Field(default_factory=list, max_length=60)
    index: List[str] = Field(default_factory=list, max_length=20)
    cap: List[Literal["Large", "Mid", "Small", "Micro"]] = Field(default_factory=list, max_length=4)   # task #262: four sizes
    # FinLit Prism's rating words (strong, healthy, average, weak, poor), Gold only (task #283: Prism is the only company score).
    # Task #142: a Gold member who picked Average, Weak or Poor must never get a refused request ("The screener is unavailable").
    band: List[BandWord] = Field(default_factory=list, max_length=5)


class Sort(BaseModel):
    key: str = Field(default="market_cap", max_length=40)
    dir: Literal["asc", "desc"] = "desc"


class Ratio(BaseModel):
    """A ratio the member builds: one catalogue figure divided by another, with an optional range on the result (task #61; task #64 CR-8).
    `show` "pct" works the value out x 100 (a range is then in percent); a bottom figure of zero or below gives no value (a dash), never a flipped sign."""
    id: str = Field(pattern=r"^r[0-9]$")
    num: str = Field(max_length=40)
    den: str = Field(max_length=40)
    show: Literal["pct", "times"] = "times"
    min: Optional[float] = Field(default=None, ge=-1e12, le=1e12)
    max: Optional[float] = Field(default=None, ge=-1e12, le=1e12)
    name: str = Field(default="", max_length=40)

    @model_validator(mode="after")
    def _ok(self):
        if self.num == self.den:
            raise ValueError("A ratio needs two different figures.")
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("The lower value is above the upper one.")
        return self


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
        if not offered(plan, gid):           # FinLit Prism for Gold; below Gold, no Prism; the retired FinLit IQ for no plan (tasks #64 P-1, #100, #283)
            continue
        ms = [m for m in CATALOG if m.group == gid]
        groups.append({"id": gid, "label": label, "tier": GROUP_TIER.get(gid, "basic"), "metrics": [
            {"key": m.key, "label": m.label, "unit": m.unit, "better": m.better, "tier": m.tier, "say": m.say, "digits": m.digits,
             "locked": not allowed(plan, m.tier), "stats": t.stats.get(m.key), "hidden": m.key in HIDDEN, "variants": VARIANTS.get(m.key),
             "ratioable": ratioable(m), "family": family(m), "scale": list(SCALE[m.key]) if m.key in SCALE else None} for m in ms]})
    body = {
        "plan": plan, "total": t.n, "withReport": t.n_full, "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t.loaded)), "pricesAt": (t.sig or {}).get("lat"), "scoresAt": (t.sig or {}).get("at"),
        "groups": groups,
        # NSE sectors only: the ones an NSE industry sits under (task #64, file 04, data fix 2); a stray label held by one or two companies is not a sector to filter by
        "sectors": [{"name": n, "n": c} for n, c in t.sectors if n in {s for _, s, _ in t.industries if s}],
        "industries": [{"name": n, "sector": s, "nseSector": nse_levels(n, s)[0], "n": c} for n, s, c in t.industries],
        # task #259 (pack 03 §3): NSE's macro sectors (12) and sectors (22) for the linked lists; "sectors" above stays for older links
        "macros": [{"name": n, "n": c} for n, c in t.macros],
        "nseSectors": [{"name": n, "macro": m, "n": c} for n, m, c in t.nsectors],
        "indices": [{"code": c, "label": INDEX_LISTS[c][0], "n": len(t.members.get(c, ()))} for c in INDEX_LISTS if t.members.get(c)],
        "caps": [{"name": c, "n": sum(1 for x in t.cap if x == c)} for c in CAPS],
        # the rating chips: FinLit Prism's words (task #283: the only company score). Gold has them with counts; below Gold they come locked, with no count
        "bandModel": "prism" if is_gold(plan) else None,
        "bands": ([{"key": b, "label": b.title(), "locked": False, "n": sum(1 for x in t.pband if x == b)} for b in PRISM_BANDS] if is_gold(plan)
                  else [{"key": b, "label": b.title(), "locked": True} for b in PRISM_BANDS]),
        "limits": {"rows": BASIC_ROWS if plan == "basic" else None, "export": False},    # no downloads on any plan (task #64 P-3)
        "defaultColumns": DEFAULT_COLUMNS,
        "standardColumns": standard_columns(plan),
    }
    return Response(content=__import__("json").dumps(body, separators=(",", ":")), media_type="application/json", headers={**NO_STORE, "Vary": "Cookie"})


_ratio_stats: Dict[tuple, dict] = {}


def _pct_of(sorted_vals: List[float], p: float) -> Optional[float]:
    if not sorted_vals:
        return None
    k = (len(sorted_vals) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def ratio_stats(t, num: str, den: str, show: str) -> dict:
    """The spread of one ratio over every company (task #64, CR-4 and CR-8): how many have it, the percentiles, 30 bars (log scale when the spread is wide)
    and every value, sorted, so the drawer counts the companies that pass a condition as it is typed. Kept per pair until the table is rebuilt."""
    key = (num, den, show, t.loaded if hasattr(t, "loaded") else 0)
    if key in _ratio_stats:
        return _ratio_stats[key]
    v = sorted(x for x in t.ratio(num, den, show) if x == x)
    out: Dict[str, object] = {"have": len(v), "total": t.n}
    for name, p in (("p2", .02), ("p5", .05), ("p25", .25), ("p50", .5), ("p75", .75), ("p95", .95), ("p98", .98)):
        q = _pct_of(v, p)
        out[name] = None if q is None else round(q, 6)
    lo, hi = out["p2"], out["p98"]
    scale, bars = "linear", [0] * 30
    if v and lo is not None and hi is not None and hi > lo:
        # the chart runs from p2 to p98; companies outside it sit in the end bars, so one extreme company never squashes the rest (task #64, N-5)
        if lo > 0 and hi / lo >= 50:          # a wide, positive spread reads better on a log scale
            import math
            scale, a, b = "log", math.log(lo), math.log(hi)
            for x in v:
                bars[0 if x <= lo else 29 if x >= hi else min(29, max(0, int((math.log(x) - a) / (b - a) * 30)))] += 1
        else:
            for x in v:
                bars[0 if x <= lo else 29 if x >= hi else min(29, max(0, int((x - lo) / (hi - lo) * 30)))] += 1
    out["outside"] = {"below": sum(1 for x in v if lo is not None and x < lo), "above": sum(1 for x in v if hi is not None and x > hi)}
    out.update(hist30=bars, scale=scale, values=[round(x, 6) for x in v])
    if len(_ratio_stats) > 200:
        _ratio_stats.clear()
    _ratio_stats[key] = out
    return out


@router.get("/ratio-stats")
async def ratio_stats_api(request: Request, num: str, den: str, show: Literal["pct", "times"] = "times", first: str = ""):
    """The spread of a custom ratio for the drawer, and the worked example: the first company of `first` (the reader's current list, comma separated) that has both figures."""
    plan = _plan(await current(request))
    if not is_gold(plan):
        raise fail(403, "plan_required", RATIO_PLAN_LINE, plan="gold")
    if num == den or num not in BY_KEY or den not in BY_KEY or not ratioable(BY_KEY[num]) or not ratioable(BY_KEY[den]):
        raise fail(400, "bad_request", "A ratio needs two different figures that can be divided: no FinLit score and no yes-or-no filter.")
    if _locked(plan, [num, den]):
        raise fail(403, "plan_locked", "One of these figures is part of a higher plan.")
    t = await _table(request)
    body = dict(ratio_stats(t, num, den, show))
    example = None
    for sym in [x.strip().upper() for x in first.split(",") if x.strip()][:50]:
        i = t.pos.get(sym)
        if i is None:
            continue
        a, b = t.cols[num][i], t.cols[den][i]
        if a == a and b == b and b > 0:
            example = {"symbol": sym, "name": t.name[i], "num": round(a, 4), "den": round(b, 4), "value": round(a / b * (100 if show == "pct" else 1), 4)}
            break
    body["example"] = example
    return Response(content=__import__("json").dumps(body, separators=(",", ":")), media_type="application/json", headers={**NO_STORE, "Vary": "Cookie"})


def screens_of(body) -> List[str]:
    """The screens on a FinLit score this query runs: the older single `model_screen` and the stacked `model_screens`."""
    return list(dict.fromkeys(([body.model_screen] if body.model_screen else []) + list(body.model_screens)))


def cats_for(body, plan: str) -> dict:
    """The category filters, with the rating words read against FinLit Prism's band (Gold; below Gold a rating word is refused as part of Gold, task #283).
    A screen on a FinLit score that filters by its rating word (Strong) adds that word."""
    c = body.cats.model_dump()
    bands = list(c.get("band") or [])
    for sid in screens_of(body):          # a screen that keeps one rating word narrows to it (stacked: every word must hold)
        want = set(READY_BY_ID[sid].bands)
        if want:
            bands = sorted((set(bands) & want) if bands else want)
    c["pband"], c["band"] = (bands if is_gold(plan) else []), []      # task #283: the retired FinLit IQ band is never a filter
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
            "screens": [ready_public(r, counts.get(r.id)) for r in READY if shown_to(r, plan)]}     # the screens on FinLit Prism for Gold only
    return Response(content=__import__("json").dumps(body, separators=(",", ":"), ensure_ascii=False), media_type="application/json", headers={**NO_STORE, "Vary": "Cookie"})


def _run(t, body: Query_, plan: str):
    filters = {k: v.model_dump() for k, v in body.filters.items() if v.min is not None or v.max is not None}
    cols = [c for c in (body.columns or DEFAULT_COLUMNS)]
    bad = [c for c in cols if c not in BY_KEY]
    if bad:
        raise fail(400, "bad_request", "Unknown column.")
    if body.ratios and not is_gold(plan):        # task #64, CR-0 (13 Nov): custom ratios are Gold and Platinum only; the page leaves them out on Silver
        raise fail(403, "plan_required", RATIO_PLAN_LINE, plan="gold")
    for rt in body.ratios:
        if rt.num not in BY_KEY or rt.den not in BY_KEY or not ratioable(BY_KEY[rt.num]) or not ratioable(BY_KEY[rt.den]):
            raise fail(400, "bad_request", "A ratio needs two figures that can be divided: no FinLit score and no yes-or-no filter.")
    need = list(filters) + [c for c in cols] + ([body.sort.key] if body.sort.key in BY_KEY else []) + [k for rt in body.ratios for k in (rt.num, rt.den)]
    locked = _locked(plan, need)
    off_plan = [k for k in need if k in BY_KEY and not offered(plan, BY_KEY[k].group)]
    if off_plan or any(not shown_to(READY_BY_ID[sid], plan) for sid in screens_of(body)):
        raise fail(400, "bad_request", "That filter is not offered: the screener's score is FinLit Prism.")
    if (body.cats.band or screens_of(body)) and not is_gold(plan):       # task #283: a rating word is FinLit Prism's, which is Gold
        locked["prism_final"] = "gold"
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
    vals = {rt.id: t.ratio(rt.num, rt.den, rt.show) for rt in body.ratios}
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


def _facets(t, body, plan: str) -> Dict[str, Dict[str, int]]:
    """Companies per macro sector, sector and industry under every other filter (a level's own picks left out, so its other options keep a count)."""
    out: Dict[str, Dict[str, int]] = {}
    for level, col in (("macro", t.macro), ("nsector", t.nsector), ("industry", t.industry)):
        idx, _c, _v = _run(t, body.model_copy(update={"cats": body.cats.model_copy(update={level: []}), "sort": Sort()}), plan)
        counts: Dict[str, int] = {}
        for i in idx:
            if col[i]:
                counts[col[i]] = counts.get(col[i], 0) + 1
        out[level] = counts
    return out


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
    for r in rows:      # task #283: the retired FinLit IQ's band word is never sent (FinLit Prism's, `pband`, is the rating)
        r["band"] = None
    out = {"total": total, "offset": off, "limit": lim, "capped": capped, "columns": cols, "rows": rows,
           "took": round((time.perf_counter() - started) * 1000, 1)}
    if body.funnel:        # task #259 (SHARED §1): each option's count follows the other filters already set (its own level left out)
        out["facets"] = _facets(t, body, plan)
    if body.funnel:        # what is left after each rule in turn, and how many companies a rule left out for having no figure (the Stock screener's funnel)
        out["funnel"] = t.funnel({k: v.model_dump() for k, v in body.filters.items() if v.min is not None or v.max is not None}, cats_for(body, plan),
                                 model=_model_rules(screens_of(body)), ratios=[(rt.id, rv[rt.id], rt.min, rt.max) for rt in body.ratios])
    return Response(content=__import__("json").dumps(out, separators=(",", ":")), media_type="application/json", headers={**NO_STORE, "Vary": "Cookie"})
