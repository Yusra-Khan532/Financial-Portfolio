"""What a FinLit Prism report may show outside the server: the readings, never the method.

The stored reader view (prism.reader_view) keeps every number the server needs (history, the stock-page card, the daily technical refresh).
Before a report leaves the server it goes through `public_report`, which

  * turns each factor's points (0 to 100) into one of five readings, so the page can say how a factor reads without the exact points;
  * turns each technical signal into its direction only (supporting, adverse or neutral);
  * drops the part weights, factor weights and points, the best / worst cut-offs, the cap and loss arithmetic, the technical divisor and
    the uncapped score, and the model and baseline versions.

Keys are dropped by name anywhere in the report (PRIVATE_KEYS), so a field the model adds later under one of those names is never sent.
(`method` is not on the list: in a report it only says where a benchmark came from, "reported benchmark" or a peer median.)
`leaks()` lists anything that slipped through; the tests call it on every shape the API returns.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

# Never sent, wherever they appear in a report.
PRIVATE_KEYS = frozenset({
    "partWeights", "weights", "weight", "points", "pointsLost", "pointsEarned", "pointsCalculation", "capPointsLost",
    "ownPoints", "fillPoints", "magnitudePoints", "divisor", "multiplier", "raw", "rawScore", "rawFundamental", "uncappedScore",
    "best", "worst", "thresholds", "threshold", "cutoffs", "cutoff", "params", "parameters", "methodology", "formula",
    "rule", "rules", "zones", "bandEdges", "cap", "share", "redBoundary", "greenBoundary",
    "modelVersion", "baselineVersion", "fillVersion", "classificationVersion",
})
# Inside a factor's `details`: the method's own working, dropped. The rest of `details` is the facts the notes are written from
# (this quarter and last, the years of a growth rate, growth quarters out of those judged), which the page shows.
PRIVATE_IN_DETAILS = frozenset({"credibility", "base"})

# The five readings of a factor, from its points. The edges stay here; the page receives only the word.
READINGS = ((90.0, "very_strong"), (70.0, "strong"), (40.0, "middle"), (20.0, "weak"), (float("-inf"), "very_weak"))
FACTOR_LISTS = ("metrics", "strengths", "weaknesses", "flags")


def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def reading_of(points: Any) -> Optional[str]:
    """very_strong / strong / middle / weak / very_weak for a factor's points, or None when it has none (not available)."""
    p = _num(points)
    if p is None:
        return None
    return next(word for edge, word in READINGS if p >= edge)


def direction_of(signal: Any) -> Optional[str]:
    """supporting / adverse / neutral for a technical signal (-1 to +1), or None when there is none."""
    s = _num(signal)
    if s is None:
        return None
    return "supporting" if s > 0 else "adverse" if s < 0 else "neutral"


def _scrub(v: Any, key: str = "") -> Any:
    if isinstance(v, list):
        return [_scrub(x, key) for x in v]
    if not isinstance(v, dict):
        return v
    out: Dict[str, Any] = {}
    for k, val in v.items():
        if k in PRIVATE_KEYS:
            continue
        if key == "details" and k in PRIVATE_IN_DETAILS:
            continue
        out[k] = _scrub(val, k)
    return out


def _factor(row: Any) -> Any:
    if not isinstance(row, dict):
        return row
    out = dict(row)
    if "reading" not in out or not isinstance(out.get("reading"), str):
        out["reading"] = reading_of(row.get("points"))
    return out


# Look-back lengths in the model's words become plain calendar words ("252-session closing high / low" reads "Closing high / low over 52 weeks").
SESSION_WORDS = ((re.compile(r"\b252-session closing high / low\b", re.I), "Closing high / low over 52 weeks"),
                 (re.compile(r"\b252-session\b", re.I), "52-week"), (re.compile(r"\b126-session\b", re.I), "26-week"),
                 (re.compile(r"\b63-session\b", re.I), "13-week"))


def plain_sessions(text: Any) -> Any:
    if not isinstance(text, str):
        return text
    for pattern, word in SESSION_WORDS:
        text = pattern.sub(word, text)
    return text


def _signal(row: Any) -> Any:
    if not isinstance(row, dict):
        return row
    out = {k: plain_sessions(v) for k, v in row.items() if k != "signal"}
    out["direction"] = direction_of(row.get("signal")) if row.get("status") == "available" else None
    return out


def public_report(report: Dict[str, Any]) -> Dict[str, Any]:
    """The report as a browser may receive it (a new object; the argument is not changed)."""
    if not isinstance(report, dict):
        return report
    body = dict(report)
    rating = body.get("rating")
    if isinstance(rating, dict):
        rating = dict(rating)
        for name in FACTOR_LISTS:
            if isinstance(rating.get(name), list):
                rating[name] = [_factor(r) for r in rating[name]]
        if isinstance(rating.get("adjustments"), list):      # which factor was limited, not by how much or at what level
            rating["adjustments"] = [{k: a[k] for k in ("metric", "part") if k in a} for a in rating["adjustments"] if isinstance(a, dict)]
        body["rating"] = rating
    tech = body.get("technicalAssessment")
    if isinstance(tech, dict):
        tech = dict(tech)
        for h in ("shortTerm", "longTerm"):
            part = tech.get(h)
            if isinstance(part, dict):
                part = {k: v for k, v in part.items() if k != "stageCapped"}
                if isinstance(part.get("factors"), list):
                    part["factors"] = [_signal(f) for f in part["factors"]]
                tech[h] = part
        tech.pop("options", None)                            # which signals the model switches on or off
        body["technicalAssessment"] = tech
    return _scrub(body)


def public_summary(summary: Dict[str, Any]) -> Dict[str, Any]:
    """The stock-page card without the part weights (it keeps the part scores, as the page shows them)."""
    return _scrub(summary)


def leaks(value: Any, path: str = "") -> List[str]:
    """Paths of private keys still present in `value` (empty when it is clean)."""
    bad: List[str] = []
    if isinstance(value, list):
        for i, x in enumerate(value):
            bad += leaks(x, f"{path}[{i}]")
    elif isinstance(value, dict):
        for k, v in value.items():
            if k in PRIVATE_KEYS:
                bad.append(f"{path}.{k}")
            bad += leaks(v, f"{path}.{k}")
    return bad
