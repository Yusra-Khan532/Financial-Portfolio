"""The FinLit Prism report as the page renders it, and nothing more (task #220, Prism report handover of 18 Nov 2026, README 4).

`page_view` builds the response from an ALLOW-LIST: every key below is one the report page (/prism/<SYMBOL>) renders, and every number is rounded
to the precision the page shows. A field the model adds later is not sent until it is listed here (a deny-list would send it by default).

Left out on purpose (README 4.3): the peer group code, the streak internals (growth quarters, slips, judged quarters, median growth, loss fill:
the page shows one finished sentence instead), the loss tier and the cap flags, the trend observations the page does not show (trend multiplier),
switched-off signals, per-part coverage and the completeness list, the input metadata and sources, and `pdfAvailableUntil` (there are no PDFs).
The page shows "Stage 2" with "a fresh advance" or "an established advance" and "the longer-term average price has moved −3.9%"; those two
observations are sent only as the page shows them (the stage-2 flag only with stage 2, the slope to one decimal).
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Optional

PARTS = ("fundamental", "valuation", "quality", "risk")
REVIEW_BUCKETS = ("pros", "cons", "mixed", "unavailable", "notApplicable")


def rnd(v: Any, digits: int) -> Optional[float]:
    """A number rounded to `digits` (whole numbers come back as int), or None for anything that is not a finite number."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        return None
    out = round(float(v), digits)
    return int(out) if digits == 0 else out


def _s(v: Any) -> Optional[str]:
    return v if isinstance(v, str) else None


def _strs(v: Any, limit: int = 200) -> List[str]:
    return [x for x in v if isinstance(x, str)][:limit] if isinstance(v, list) else []


def _d(v: Any) -> Dict[str, Any]:
    return v if isinstance(v, dict) else {}


def _l(v: Any) -> List[Any]:
    return v if isinstance(v, list) else []


def _drop_none(d: Dict[str, Any], keep: Iterable[str] = ()) -> Dict[str, Any]:
    keep = set(keep)
    return {k: v for k, v in d.items() if v is not None or k in keep}


# ------------------------------------------------------------------ the fundamental rating
def income_note(group: Any) -> Optional[str]:
    """The note under the history tables for banks, NBFCs and insurers (the page used the group code for this; the code itself stays here)."""
    if group in ("BANK", "NBFC"):
        return "For banks and NBFCs the model's sales line is net interest income: interest earned less interest paid."
    if group == "INSURANCE":
        return "For insurers the model's sales line is net premium earned."
    return None


def streak_text(details: Dict[str, Any]) -> Optional[str]:
    """The streak factor's sentence as the page shows it ("10 growth quarters across 10 of 10 comparable quarters.")."""
    judged = details.get("judged")
    if not isinstance(judged, (int, float)) or isinstance(judged, bool):
        return None
    if not judged:
        return "No comparable quarters yet."
    good = int(details.get("good") or 0)
    slips = int(details.get("slips") or 0)
    slip = f" and {slips} forgiven slip{'' if slips == 1 else 's'}" if slips else ""
    return f"{good} growth quarter{'' if good == 1 else 's'}{slip} across {int(judged)} of 10 comparable quarters."


def _crore(v: Any) -> Optional[float]:
    """Rupee crore as the page writes it: whole crore from 100 up, two decimals below."""
    n = rnd(v, 2)
    return None if n is None else (rnd(n, 0) if abs(n) >= 100 else n)


def _details(metric: str, d: Dict[str, Any]) -> Dict[str, Any]:
    if metric.endswith("_STREAK"):
        return _drop_none({"streakText": streak_text(d)})
    out = {
        "basis": _s(d.get("basis")), "note": _s(d.get("note")),
        "years": rnd(d.get("years"), 0), "growthUsed": rnd(d.get("growthUsed"), 1), "growthBasis": _s(d.get("growthBasis")),
        "opMarginNow": rnd(d.get("opMarginNow"), 2), "operatingLoss": True if d.get("operatingLoss") is True else None,
    }
    if "current" in d or "previous" in d:                  # the growth and CAGR notes say "₹X Cr against ₹Y Cr"; a missing one says so
        out["current"], out["previous"] = _crore(d.get("current")), _crore(d.get("previous"))
        return _drop_none(out, keep=("current", "previous"))
    return _drop_none(out)


def _metric(m: Dict[str, Any]) -> Dict[str, Any]:
    metric = _s(m.get("metric")) or ""
    unit = _s(m.get("unit"))
    return {
        "part": _s(m.get("part")), "metric": metric, "label": _s(m.get("label")),
        "value": rnd(m.get("value"), 0 if unit == "quarters" else 2), "unit": unit,
        "status": _s(m.get("status")), "statusLabel": _s(m.get("statusLabel")), "reading": _s(m.get("reading")),
        "fallbackFor": _s(m.get("fallbackFor")), "details": _details(metric, _d(m.get("details"))),
    }


def _rating(r: Dict[str, Any]) -> Dict[str, Any]:
    parts = _d(r.get("parts"))
    return {
        "final": rnd(r.get("final"), 1), "label": _s(r.get("label")), "status": _s(r.get("status")),
        "parts": {k: rnd(parts.get(k), 1) for k in PARTS if k in parts},
        "confidence": rnd(r.get("confidence"), 2),          # the page shows it as a whole percentage
        "dataIntegrityStatus": _s(r.get("dataIntegrityStatus")),
        "incomeNote": income_note(r.get("group")),
        "metrics": [_metric(m) for m in _l(r.get("metrics")) if isinstance(m, dict) and m.get("status") != "disabled"],
        "notRatedReasons": [{"code": _s(x.get("code")), "text": _s(x.get("text"))} for x in _l(r.get("notRatedReasons")) if isinstance(x, dict)],
    }


def _review_item(i: Dict[str, Any]) -> Dict[str, Any]:
    return _drop_none({"metric": _s(i.get("metric")), "label": _s(i.get("label")), "valueText": _s(i.get("valueText")),
                       "summary": _s(i.get("summary")), "comparisonText": _s(i.get("comparisonText"))})


def _review(v: Dict[str, Any]) -> Dict[str, Any]:
    parts = []
    for p in _l(v.get("parts")):
        if not isinstance(p, dict):
            continue
        part = {"key": _s(p.get("key")), "name": _s(p.get("name")), "score": rnd(p.get("score"), 1), "notes": _strs(p.get("notes"))}
        for b in REVIEW_BUCKETS:
            if b in p:
                part[b] = [_review_item(i) for i in _l(p.get(b)) if isinstance(i, dict)]
        parts.append(part)
    return {"parts": parts, "notes": _strs(v.get("notes"))}


# ------------------------------------------------------------------ history, trends, benchmark
def _rows(rows: Any, keys: Iterable[str]) -> List[Dict[str, Any]]:
    keys = tuple(keys)
    return [{"period": _s(r.get("period")), **{k: rnd(r.get(k), 2) for k in keys}} for r in _l(rows) if isinstance(r, dict)]


def _history(h: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "quarterly": _rows(h.get("quarterly"), ("sales", "profit", "ebitda", "eps")),
        "annual": _rows(h.get("annual"), ("sales", "profit", "cashFlow", "netWorth")),
        "latest": [{"key": _s(x.get("key")), "label": _s(x.get("label")), "value": rnd(x.get("value"), 2), "unit": _s(x.get("unit"))}
                   for x in _l(h.get("latest")) if isinstance(x, dict)],
    }


def _benchmark(b: Dict[str, Any]) -> Dict[str, Any]:
    metrics = {}
    for k, m in _d(b.get("metrics")).items():
        if not isinstance(m, dict):
            continue
        metrics[str(k)] = _drop_none({
            "value": rnd(m.get("value"), 2), "provider": _s(m.get("provider")), "scope": _s(m.get("scope")), "method": _s(m.get("method")),
            "positiveCount": rnd(m.get("positiveCount"), 0), "observedCount": rnd(m.get("observedCount"), 0), "universeCount": rnd(m.get("universeCount"), 0),
            "partial": True if m.get("partial") is True else None, "asOf": _s(m.get("asOf")),
        }, keep=("value",))
    return _drop_none({"note": _s(b.get("note")), "metrics": metrics})


# ------------------------------------------------------------------ the technical view
def _signal(f: Dict[str, Any]) -> Dict[str, Any]:
    return {"key": _s(f.get("key")), "label": _s(f.get("label")), "status": _s(f.get("status")), "detail": _s(f.get("detail")),
            "direction": _s(f.get("direction"))}


def _horizon(h: Dict[str, Any]) -> Dict[str, Any]:
    return _drop_none({
        "score": rnd(h.get("score"), 0), "rating": _s(h.get("rating")), "status": _s(h.get("status")), "horizon": _s(h.get("horizon")),
        "availableCount": rnd(h.get("availableCount"), 0), "requiredCount": rnd(h.get("requiredCount"), 0),
        "provisional": h.get("provisional") if isinstance(h.get("provisional"), bool) else None, "provisionalNote": _s(h.get("provisionalNote")),
        "factors": [_signal(f) for f in _l(h.get("factors")) if isinstance(f, dict) and f.get("status") != "disabled"],
    }, keep=("score",))


def _observations(o: Dict[str, Any]) -> Dict[str, Any]:
    stage = o.get("stage") if o.get("stage") in (1, 2, 3, 4) else None
    return _drop_none({
        "stage": stage,
        "freshStage2": o.get("freshStage2") if stage == 2 and isinstance(o.get("freshStage2"), bool) else None,
        "slope150Pct": rnd(o.get("slope150Pct"), 1), "benchmark": _s(o.get("benchmark")), "benchmarksUsed": _strs(o.get("benchmarksUsed"), 10) or None,
        "beta": rnd(o.get("beta"), 2), "rsRatingST": rnd(o.get("rsRatingST"), 1), "rsRatingLT": rnd(o.get("rsRatingLT"), 1),
    })


def _technical(t: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = _drop_none({"asOf": _s(t.get("asOf")), "status": _s(t.get("status")), "provider": _s(t.get("provider"))})
    for h in ("shortTerm", "longTerm"):
        if isinstance(t.get(h), dict):
            out[h] = _horizon(t[h])
    if isinstance(t.get("verdict"), dict):
        out["verdict"] = {"label": _s(t["verdict"].get("label")), "tone": _s(t["verdict"].get("tone"))}
    out["notes"] = _strs(t.get("notes"))
    out["observations"] = _observations(_d(t.get("observations")))
    sources = _d(t.get("benchmarkSources"))
    if sources:
        out["benchmarkSources"] = {str(k): _drop_none({"provider": _s(v.get("provider")), "asOf": _s(v.get("asOf"))}) for k, v in sources.items() if isinstance(v, dict)}
    return out


# ------------------------------------------------------------------ the report
def page_view(report: Dict[str, Any]) -> Dict[str, Any]:
    """The report the page receives. `report` is the public report (prism_public.public_report) plus the server's own stamps."""
    company = _d(report.get("company"))
    out: Dict[str, Any] = {
        "id": _s(report.get("id")), "createdAt": _s(report.get("createdAt")), "completedAt": _s(report.get("completedAt")),
        "statementType": _s(report.get("statementType")),
        "company": _drop_none({k: _s(company.get(k)) for k in ("symbol", "name", "industry", "sector")}),
        "rating": _rating(_d(report.get("rating"))),
        "warnings": _strs(report.get("warnings")),
        "trends": [{"period": _s(t.get("period")), **{k: rnd(t.get(k), 2) for k in ("revenue", "profit", "eps")}} for t in _l(report.get("trends")) if isinstance(t, dict)],
        "benchmark": _benchmark(_d(report.get("benchmark"))),
        "cached": report.get("cached") is True,
    }
    if isinstance(report.get("review"), dict):
        out["review"] = _review(report["review"])
    if isinstance(report.get("financialHistory"), dict):
        out["financialHistory"] = _history(report["financialHistory"])
    if isinstance(report.get("technicalAssessment"), dict):
        out["technicalAssessment"] = _technical(report["technicalAssessment"])
    if isinstance(report.get("technical"), dict):
        t = report["technical"]
        out["technical"] = {"asOf": _s(t.get("asOf")), "calculatedAt": _s(t.get("calculatedAt")), "stale": t.get("stale") is True, "refreshing": t.get("refreshing") is True}
    return out


def card_view(summary: Dict[str, Any]) -> Dict[str, Any]:
    """The stock page's small Prism card, rounded as it shows: score and parts to one decimal, completeness as a whole percentage."""
    out = dict(summary)
    out["final"] = rnd(summary.get("final"), 1)
    out["confidence"] = rnd(summary.get("confidence"), 2)
    if isinstance(summary.get("parts"), dict):
        out["parts"] = {k: rnd(v, 1) for k, v in summary["parts"].items()}
    return out


def freshness_view(f: Any) -> Optional[Dict[str, Any]]:
    """Whether the stored report is behind (a newer quarter, a completed session or a newer model) and is being rebuilt, as the page may say it."""
    if not isinstance(f, dict):
        return None
    return {"calculatedAt": _s(f.get("calculatedAt")), "stale": f.get("stale") is True, "reason": _s(f.get("reason")), "kind": _s(f.get("kind")),
            "refreshing": f.get("refreshing") is True}
