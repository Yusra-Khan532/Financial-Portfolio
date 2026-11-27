"""Task #382 (FinLit AI summary: "explain the meaning behind every number"): what each figure of a FinLit Prism card means, from the method itself.

Nothing here is new: the bands are the card's own (Strong 80 and above, Healthy 65 to 79, Average 50 to 64, Weak 35 to 49, Poor below 35, the
same edges as site-api premium_model_config.RATING_BANDS and frontend stock/prismCardLogic.partWord), the technical words and the nine trend
alignments come from the shared wording file (technical_wording.json, the frontend's copy is kept identical by a test), and what each part
measures is the wording the company page already uses (frontend lib/prism.ts PART_TEXT). The frontend's card summary (stock/prismMeaning.ts)
says the same; a test keeps the two in step.

The sheet is handed to FinLit AI with the card, so every explanation it writes is read off this sheet, never made up. It describes; it never
advises. A figure the sheet cannot read (no score, a provisional view, an unknown word) says so, and the model is told to flag it, not guess.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

_WORDING = json.loads((Path(__file__).resolve().parents[1] / "technical_wording.json").read_text(encoding="utf-8"))

# The card's five bands for the overall score and each part (higher is better on every one of them, Risk included).
BANDS = ((80, "Strong"), (65, "Healthy"), (50, "Average"), (35, "Weak"), (0, "Poor"))
BAND_RULE = "Strong 80 and above, Healthy 65 to 79, Average 50 to 64, Weak 35 to 49, Poor below 35"
SCALE = ("0 to 100 on FinLit Prism's own scale: each measure is scored against the method's fixed bands (some valuation measures against "
         "industry peers or the company's own history), not ranked against other companies")

PARTS: Dict[str, Dict[str, Any]] = {
    "fundamental": {"name": "Fundamental and growth", "area": "business performance",
                    "measures": "how steadily sales and profit grow, and margins",
                    "high": "sales and profit have grown steadily, with sound margins",
                    "mid": "sales and profit growth and margins are middling",
                    "low": "sales and profit growth has been slow or uneven, or margins are thin",
                    "matters": "it shows how the business itself has been doing, apart from the share price"},
    "valuation": {"name": "Valuation", "area": "share price against earnings",
                  "measures": "the share price against earnings, book value, peers and the company's own history",
                  "high": "the share price looks modest against its earnings and its own history",
                  "mid": "the share price is roughly in line with its earnings and its own history",
                  "low": "the share price looks high against its earnings and its own history",
                  "matters": "it is about the price paid for the business, not the health of the business"},
    "quality": {"name": "Quality", "area": "financial strength",
                "measures": "borrowing, interest cover, returns on capital and cash backing for profit",
                "high": "borrowing is under control, interest is well covered and profits are backed by cash",
                "mid": "borrowing, interest cover, returns and cash backing are middling",
                "low": "borrowing is heavy, interest cover or returns are thin, or profits are not well backed by cash",
                "matters": "it shows how sound the balance sheet and the cash behind the profits are"},
    "risk": {"name": "Risk", "area": "market risk of the share",
             "measures": "price swings, the largest fall, trading activity and pledged promoter shares",
             "high": "the share price has moved calmly, with smaller falls, ample trading and few pledged shares",
             "mid": "price swings, falls and trading activity are moderate",
             "low": "the share price swings widely or has fallen sharply, trading is thin or shares are pledged",
             "matters": "a higher Risk score means LOWER risk: it describes how the share has traded and promoter pledges, not the business's results"},
}
OVERALL = {"STRONG": "most of what FinLit Prism measures is sound",
           "HEALTHY": "more of what FinLit Prism measures is sound than weighs on it",
           "AVERAGE": "some parts are sound while others weigh on it",
           "WEAK": "more of what FinLit Prism measures weighs on it than is sound",
           "POOR": "most of what FinLit Prism measures weighs on it"}
STATUS = {"RATED": "Rated: the data the method needs is in place",
          "PROVISIONAL": "Provisional: a first view, some of the data the method needs is missing",
          "NOT RATED": "Not rated: too little of the data the method needs is available"}

_TB = _WORDING["bands"]                      # strongPositive 50, positive 20, neutral -20, negative -50
_ALIGN = _WORDING["alignment"]
TREND_SCALE = ("-100 to +100: above 0 the price signals point up, below 0 down; " + "; ".join([
    f"{_WORDING['bandWords']['strongpos']} +{_TB['strongPositive']} or more", f"{_WORDING['bandWords']['pos']} +{_TB['positive']} up to +{_TB['strongPositive']}",
    f"{_WORDING['bandWords']['neutral']} above {_TB['neutral']} up to +{_TB['positive']}", f"{_WORDING['bandWords']['neg']} above {_TB['negative']} up to {_TB['neutral']}",
    f"{_WORDING['bandWords']['strongneg']} {_TB['negative']} or less"]) + ". It describes the share price only, not the business")


def band(v: Optional[float]) -> Optional[str]:
    """The card's word for a 0-100 score, or None for no score."""
    if not isinstance(v, (int, float)) or v != v:
        return None
    return next(w for edge, w in BANDS if v >= edge)


def _tone(word: str) -> str:
    return "high" if word in ("Strong", "Healthy") else "mid" if word == "Average" else "low"


def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v else None


def _fmt(v: float, signed: bool = False) -> str:
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return f"+{s}" if signed and v > 0 else s


def _trend_tone(h: Dict[str, Any]) -> Optional[str]:
    """The tone of a horizon: its model rating when known, else its score on the shared bands (as the card's ratingWord does)."""
    score = _num(h.get("score"))
    if score is None:
        return None
    r = " ".join(str(h.get("rating") or "").strip().lower().replace("_", " ").split())
    r = _WORDING["ratingAlias"].get(r, r).replace(" ", "_")     # the model's own words ("buy") -> the key in `ratings` ("uptrend")
    known = _WORDING["ratings"].get(r) if not r.startswith("_") else None
    if isinstance(known, dict) and known.get("tone") not in (None, "na"):
        return known["tone"]
    return ("strongpos" if score >= _TB["strongPositive"] else "pos" if score >= _TB["positive"] else "neutral" if score > _TB["neutral"]
            else "neg" if score > _TB["negative"] else "strongneg")


def _align_band(score: Optional[float]) -> Optional[str]:
    if score is None:
        return None
    return "positive" if score >= _ALIGN["bands"]["positive"] else "negative" if score <= _ALIGN["bands"]["negative"] else "neutral"


def meaning(card: Any) -> List[str]:
    """One line per figure of the card (as tools._prism_card shapes it): the figure, its band, what it measures, which way is better, and why it
    matters. Empty when there is no card. A figure that cannot be read is flagged, never guessed."""
    if not isinstance(card, dict) or card.get("unavailable"):
        return []
    out: List[str] = [f"Scale of the overall score and the four parts: {SCALE}. Bands: {BAND_RULE}. Higher is better on all five (a higher Risk score means lower risk)."]
    score, label, status = _num(card.get("score")), str(card.get("label") or "").upper(), str(card.get("status") or "").upper()
    if status == "NOT RATED" or score is None or label not in OVERALL:
        out.append("Overall: CANNOT BE INTERPRETED. " + STATUS["NOT RATED"] + ".")
    else:
        out.append(f"Overall {_fmt(score)} ({label.title()}, {STATUS.get(status, status.title() or 'status not stated')}): the four parts taken together, "
                   f"weighted by the method; {label.title()} means {OVERALL[label]}.")
    parts = card.get("parts") if isinstance(card.get("parts"), dict) else {}
    for key, p in PARTS.items():
        if key not in parts:
            continue
        v = _num(parts.get(key))
        w = band(v)
        if w is None:
            out.append(f"{p['name']}: CANNOT BE INTERPRETED, no score (too little data for this part). It measures {p['measures']}.")
            continue
        out.append(f"{p['name']} {_fmt(v)} ({w}), {p['area']}: measures {p['measures']}. At {w} it means {p[_tone(w)]}. Why it matters: {p['matters']}.")
    tech = card.get("technical") if isinstance(card.get("technical"), dict) else {}
    words = _WORDING["bandWords"]
    if any(isinstance(tech.get(k), dict) for k in ("shortTerm", "longTerm")):
        out.append(f"Scale of the two trend scores: {TREND_SCALE}.")
    # the two horizons as the technical model states them (site-api premium_technical: "5–20 sessions", "6–18 months")
    for key, name, span in (("shortTerm", "Short-term trend", "the last 5 to 20 trading sessions"), ("longTerm", "Long-term trend", "the last 6 to 18 months")):
        h = tech.get(key)
        if not isinstance(h, dict):
            continue
        t = _trend_tone(h)
        if t is None:
            out.append(f"{name}: CANNOT BE INTERPRETED, no score (a required price signal is missing).")
            continue
        flag = " A first view: the share has a short trading history." if h.get("provisional") or h.get("youngListing") else ""
        out.append(f"{name} {_fmt(float(h['score']), True)} ({words[t]}), the share price over {span}: {_WORDING['bandTips'][t].lower()}.{flag}")
    st = _align_band(_num((tech.get("shortTerm") or {}).get("score")) if isinstance(tech.get("shortTerm"), dict) else None)
    lt = _align_band(_num((tech.get("longTerm") or {}).get("score")) if isinstance(tech.get("longTerm"), dict) else None)
    cell = next((c for c in _ALIGN["cells"] if c["st"] == st and c["lt"] == lt), None) if st and lt else None
    if cell:
        out.append(f"Alignment, {cell['label']}: the short-term and long-term trends read together. {cell['text']}.")
    elif tech.get("shortTerm") or tech.get("longTerm"):
        out.append(f"Alignment: CANNOT BE INTERPRETED, {_ALIGN['notAvailable'].split(': ')[-1]} (it needs both trend scores).")
    out.append("The topPros and topCons lines are the method's own reasons, measure by measure (a streak line counts growth quarters against "
               "the same quarter a year before; loss-making quarters do not count as growth). Quote them as they stand.")
    out.append("Business health (Fundamental and growth, Quality), the share price against earnings (Valuation) and how the share trades "
               "(Risk, the two trends) are different things: keep them apart.")
    return out
