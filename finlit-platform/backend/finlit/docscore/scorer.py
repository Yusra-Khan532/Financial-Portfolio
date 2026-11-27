"""The document scorer (task #266, the team's "Document Scoring Workflow" v2): score every point of an investor presentation, an earnings-call transcript
or a results filing from 0 to 100 with fixed rules, then roll the points up by theme into a document score, and the three documents into one company
score. Rule-based, no machine-learning model: every score is 50 plus six components that name the words that moved it.

    point = 50 + D + M + E + X + C + T + S18, limited to 0-100        (workflow section 4)
      D  direction words (lexicon.WORDS), longest phrase first then masked, limited to -35..+35
         negation in the three words before a phrase: a raising phrase flips; a lowering phrase reverses and halves
         a contrast word (despite, although, ...) before a lowering phrase halves it
      M  the stated percentage change with an up or a down word within ten words: up +2/+6/+10, down -4/-8/-12 (below 10%, 10-25%, 25% or more);
         the largest effect only; 0 when up and down words both sit next to it (a mixed sentence)
      E  +4 a figure, +2 a period or comparison with it, +2 a source phrase; -3 vague words with no figure
      X  +6 executed words with no intent words, -6 intent words with no executed words, 0 both, +2 in-progress words alone
      C  +2 commitment words, -3 hedge words (both can apply: "we will", "we believe" = -1)
      T  -2 a long horizon, else +2 the current period
      S18  +5 a figure the reference data agrees with, -10 one it differs from, 0 not covered
    a hard trigger that is not negated caps the point at 25 and the document at 64

Bands everywhere: Green 65-100, Yellow 40-64, Red 0-39. The output never names a band as positive, neutral or negative: only the score and its colour.
Pure functions on plain text; the PDF and the exchange are elsewhere (docscore/segment.py, docscore/api.py). Describes what a document says; not advice.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from statistics import pstdev
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from . import lexicon as L

DOC_TYPES = ("P", "C", "R")
DOC_NAMES = {"P": "Investor presentation", "C": "Earnings call transcript", "R": "Results filing"}


# ------------------------------------------------------------------------------------------------ matching
def _norm(text: str) -> str:
    t = text.lower().replace("’", "'").replace("‘", "'").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", t).strip()


def _phrase_re(phrase: str, plural: bool) -> re.Pattern:
    """A phrase as whole words; with `plural`, its last word may take s or es ("order win" matches "order wins")."""
    words = [re.escape(w) for w in phrase.split(" ")]
    last = words[-1] + (r"(?:e?s)?" if plural and re.match(r"[a-z]", phrase[-1]) else "")
    body = r"\s+".join(words[:-1] + [last])
    return re.compile(r"(?<![a-z0-9])" + body + r"(?![a-z0-9])")


@dataclass(frozen=True)
class Entry:
    phrase: str
    weight: float
    theme: str
    types: str
    rx: re.Pattern


def _entries() -> List[Entry]:
    seen: Dict[Tuple[str, str], Entry] = {}
    for p, w, th, ty in L.WORDS:
        key = (p.lower(), ty)
        if key in seen:              # a phrase listed twice keeps its first (stronger) weight: lists are sorted strongest first
            continue
        seen[key] = Entry(p.lower(), float(w), th, ty, _phrase_re(p.lower(), True))
    # longest phrase first, so "supply chain disruption" is matched before "disruption" and then masked
    return sorted(seen.values(), key=lambda e: (-len(e.phrase.split()), -len(e.phrase)))


ENTRIES = _entries()


def _word_list_re(words: Iterable[str]) -> re.Pattern:
    alts = sorted({w.lower() for w in words}, key=len, reverse=True)
    return re.compile(r"(?<![a-z0-9])(?:" + "|".join(re.escape(w).replace(r"\ ", r"\s+") for w in alts) + r")(?![a-z0-9])")


RX = {k: _word_list_re(v) for k, v in {
    "executed": L.EXECUTED, "intent": L.INTENT, "progress": L.IN_PROGRESS, "commit": L.COMMITMENT, "hedge": L.HEDGE, "vague": L.VAGUE,
    "long": L.LONG_HORIZON, "current": L.CURRENT_PERIOD, "up": L.UP, "down": L.DOWN, "neg": L.NEGATION, "contrast": L.CONTRAST,
    "period": L.PERIOD_WORDS, "source": L.SOURCE_WORDS, "conclusion": L.CONCLUSION}.items()}
RX["boiler"] = re.compile("|".join(_phrase_re(p.lower(), True).pattern for p in L.BOILERPLATE))   # plural-aware: "forward-looking statements"
FIGURE = re.compile(r"\d")
WORDS3 = re.compile(r"[a-z]{2,}")
PCT = re.compile(r"(\d+(?:\.\d+)?)\s*(?:%|per\s*cent|percent)")
WORD = re.compile(r"[a-z0-9][a-z0-9'+.-]*")


def hard_triggers_for(doctype: str) -> List[str]:
    return L.HARD_ALL + (L.HARD_R if doctype == "R" else L.HARD_PC)


HARD_RX = {t: [(_phrase_re(p, True), p) for p in hard_triggers_for(t)] for t in DOC_TYPES}


def band(score: Optional[float]) -> Optional[str]:
    """green / yellow / red (the colour only: never a word like positive or negative)."""
    if score is None:
        return None
    return "green" if score >= L.GREEN_FROM else "yellow" if score >= L.YELLOW_FROM else "red"


def _words_before(text: str, start: int, n: int) -> str:
    return " ".join(WORD.findall(text[:start])[-n:])


# ------------------------------------------------------------------------------------------------ one point
@dataclass
class PointScore:
    score: float
    D: float = 0.0
    M: float = 0.0
    E: float = 0.0
    X: float = 0.0
    C: float = 0.0
    T: float = 0.0
    S18: float = 0.0
    theme: Optional[str] = None
    hits: List[Tuple[str, float]] = field(default_factory=list)       # (phrase, the weight it carried after negation and contrast)
    hard: List[str] = field(default_factory=list)                     # hard triggers that fired (not negated)
    figure: bool = False
    executed: bool = False
    intent: bool = False

    @property
    def band(self) -> Optional[str]:
        return band(self.score)

    def rules(self) -> str:
        """The rules that fired, as the workflow's worked examples print them: "order book grew +12; fresh orders +10; M +10, E +6, X +6"."""
        parts = [f"{p} {fmt(w)}" for p, w in self.hits]
        comps = [f"{k} {fmt(v)}" for k, v in (("M", self.M), ("E", self.E), ("X", self.X), ("C", self.C), ("T", self.T), ("S18", self.S18)) if v]
        return "; ".join(parts) + ("; " if parts and comps else "") + ", ".join(comps)


def fmt(v: float) -> str:
    return f"{v:+.1f}" if v != int(v) else f"{int(v):+d}"


NEUTRAL_RX = [_phrase_re(p.lower(), True) for p in sorted(L.NEUTRAL_CONTEXTS, key=len, reverse=True)]


def neutral_mask(text: str) -> str:
    """The text with the neutral contexts blanked out (lexicon 2.1.0), so neither a word-list phrase nor a hard trigger is read inside them."""
    out = text
    for rx in NEUTRAL_RX:
        out = rx.sub(lambda m: "\0" * len(m.group(0)), out)
    return out


def _direction(text: str, doctype: str) -> Tuple[float, List[Tuple[str, float]], Dict[str, float]]:
    """D: the matched word-list phrases, longest first and masked, each with negation and contrast applied; and the weight each theme carried.
    A phrase counts once per point however often it is repeated (2.1.0: "going concern" three times in one auditor sentence)."""
    masked = list(neutral_mask(text))
    hits: List[Tuple[str, float]] = []
    per_theme: Dict[str, float] = {}
    for e in ENTRIES:
        if e.types and doctype not in e.types:
            continue
        for m in e.rx.finditer("".join(masked)):
            s, t = m.start(), m.end()
            if "\0" in "".join(masked[s:t]):
                continue
            w = e.weight
            before3 = _words_before(text, s, 3)
            if RX["neg"].search(before3):
                w = -w if w > 0 else -w / 2           # a raising phrase flips; a lowering one reverses and is halved ("no risk of default")
            elif w < 0 and RX["contrast"].search(_words_before(text, s, 8)):
                w = w / 2                               # "despite supply chain disruption, ... commissioned"
            for i in range(s, t):
                masked[i] = "\0"
            if any(p == e.phrase for p, _ in hits):
                continue
            hits.append((e.phrase, w))
            per_theme[e.theme] = per_theme.get(e.theme, 0.0) + abs(w)
    d = sum(w for _, w in hits)
    return max(-35.0, min(35.0, d)), hits, per_theme


def _magnitude(text: str) -> float:
    """M: each percentage with an up or a down word within about ten words; a percentage with both is mixed and counts 0. The largest effect only."""
    best = 0.0
    for m in PCT.finditer(text):
        v = float(m.group(1))
        pre = " ".join(WORD.findall(text[:m.start()])[-10:])
        post = " ".join(WORD.findall(text[m.end():])[:10])
        near = pre + " " + post
        up, down = bool(RX["up"].search(near)), bool(RX["down"].search(near))
        if up == down:
            continue
        eff = (2 if v < 10 else 6 if v < 25 else 10) if up else (-4 if v < 10 else -8 if v < 25 else -12)
        if abs(eff) > abs(best):
            best = float(eff)
    return best


def _hard(text: str, doctype: str) -> List[str]:
    out = []
    text = neutral_mask(text)
    for rx, p in HARD_RX[doctype]:
        for m in rx.finditer(text):
            if not RX["neg"].search(_words_before(text, m.start(), 3)):
                out.append(p)
                break
    return out


def score_point(raw: str, doctype: str, s18: Optional[str] = None) -> PointScore:
    """One point (a sentence, a bullet or a table row). `s18`: "agree", "differ" or None (not covered)."""
    text = _norm(raw)
    d, hits, per_theme = _direction(text, doctype)
    m = _magnitude(text)
    fig = bool(FIGURE.search(text))
    e = (4.0 if fig else 0.0) + (2.0 if fig and RX["period"].search(text) else 0.0) + (2.0 if RX["source"].search(text) else 0.0) - (3.0 if not fig and RX["vague"].search(text) else 0.0)
    ex, it = bool(RX["executed"].search(text)), bool(RX["intent"].search(text))
    x = 6.0 if ex and not it else -6.0 if it and not ex else 0.0 if ex and it else 2.0 if RX["progress"].search(text) else 0.0
    c = (2.0 if RX["commit"].search(text) else 0.0) - (3.0 if RX["hedge"].search(text) else 0.0)
    t = -2.0 if RX["long"].search(text) else 2.0 if RX["current"].search(text) else 0.0
    s = 5.0 if s18 == "agree" else -10.0 if s18 == "differ" else 0.0
    total = max(0.0, min(100.0, 50 + d + m + e + x + c + t + s))
    hard = _hard(text, doctype)
    if hard:
        total = min(total, 25.0)
    theme = max(per_theme, key=lambda k: per_theme[k]) if per_theme and max(per_theme.values()) > 0 else None
    return PointScore(round(total, 1), d, m, e, x, c, t, s, theme, hits, hard, fig, ex, it)


# ------------------------------------------------------------------------------------------------ importance (workflow 3.4)
def importance(text: str, kind: str, edge: bool, has_hit: bool) -> float:
    """The highest weight that applies, never multiplied: heading 1.5 (not scored), word-list hit 1.3, bullet / first or last of a section / a figure /
    a conclusion word 1.2, else 1.0."""
    if kind == "heading":
        return 1.5
    t = _norm(text)
    if has_hit:
        return 1.3
    if kind == "bullet" or edge or FIGURE.search(t) or RX["conclusion"].search(t):
        return 1.2
    return 1.0


# ------------------------------------------------------------------------------------------------ the document
@dataclass
class Point:
    """One point of a document, before scoring: its text, page, section, kind (sentence / bullet / row / heading) and speaker (transcripts)."""
    text: str
    page: int = 1
    section: str = ""
    kind: str = "sentence"
    speaker: Optional[str] = None
    status: str = "scored"            # scored | heading | excluded: boilerplate | excluded: analyst or moderator | no signal | duplicate
    edge: bool = False


def _mean_w(pairs: Sequence[Tuple[float, float]]) -> Optional[float]:
    tw = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / tw if tw else None


def r1(v: Optional[float]) -> Optional[float]:
    return None if v is None or not math.isfinite(v) else round(v, 1)


def score_document(points: Sequence[Point], doctype: str, s18: Optional[Dict[int, str]] = None, prior: Optional[float] = None) -> Dict:
    """Every point scored, the nine themes, the six parameters, the document score with its band, confidence, flags and trend (workflow 6)."""
    assert doctype in DOC_TYPES
    out_points: List[Dict] = []
    scored: List[Tuple[Point, PointScore, float]] = []
    seen = set()
    for i, p in enumerate(points):
        key = _norm(p.text)
        row: Dict = {"id": i + 1, "page": p.page, "section": p.section, "speaker": p.speaker, "text": p.text, "status": p.status}
        if p.status == "scored" and key in seen:
            row["status"] = "duplicate"
        if row["status"] == "scored" and RX["boiler"].search(key):
            row["status"] = "excluded: boilerplate"
        if row["status"] != "scored":
            out_points.append(row)
            continue
        seen.add(key)
        ps = score_point(p.text, doctype, (s18 or {}).get(i + 1))
        if (not ps.hits and not ps.figure) or len(WORDS3.findall(key)) < 3:          # 2.1.0: a fragment of fewer than three words ("3 • • • . .") is no signal
            row["status"] = "no signal"
            out_points.append(row)
            continue
        w = importance(p.text, p.kind, p.edge, bool(ps.hits))
        scored.append((p, ps, w))
        row.update(score=ps.score, band=ps.band, theme=ps.theme or "GEN", weight=w, components={k: getattr(ps, k) for k in ("D", "M", "E", "X", "C", "T", "S18")},
                   rules=ps.rules(), hard=ps.hard, s18=(s18 or {}).get(i + 1, "not covered"))
        out_points.append(row)

    weights = L.THEME_WEIGHTS[doctype]
    themes = []
    for th, wt in weights.items():
        pts = [(ps.score, w) for _, ps, w in scored if ps.theme == th]
        themes.append({"theme": th, "name": L.THEMES[th], "weight": wt, "points": len(pts), "score": r1(_mean_w(pts)), "band": band(_mean_w(pts))})
    with_data = [t for t in themes if t["score"] is not None]
    n = len(scored)
    green = sum(1 for _, ps, _ in scored if ps.band == "green")
    red = sum(1 for _, ps, _ in scored if ps.band == "red")
    hard_n = sum(len(ps.hard) for _, ps, _ in scored)
    p1 = sum(t["weight"] * t["score"] for t in with_data) / sum(t["weight"] for t in with_data) if with_data else None
    p2 = max(0.0, min(100.0, 50 + (green / n * 100 - red / n * 100) / 2)) if n else None
    figs = sum(1 for _, ps, _ in scored if ps.figure)
    p3 = min(100.0, (figs / n) / 0.70 * 100) if n else None
    exe = sum(1 for _, ps, _ in scored if ps.executed and not ps.intent)
    inten = sum(1 for _, ps, _ in scored if ps.intent and not ps.executed)
    p4 = 50.0 if exe + inten < 3 else exe / (exe + inten) * 100
    red_important = sum(1 for _, ps, w in scored if ps.band == "red" and w >= 1.3)
    p5 = max(0.0, 100 - (25 * hard_n + 10 * red_important)) if n else None
    checked = [st for st in (s18 or {}).values() if st in ("agree", "differ")]
    p6 = sum(1 for st in checked if st == "agree") / len(checked) * 100 if checked else None
    params = {"P1": p1, "P2": p2, "P3": p3, "P4": p4 if n else None, "P5": p5, "P6": p6}
    used = {k: v for k, v in params.items() if v is not None}
    doc = sum(L.PARAM_WEIGHTS[k] * v for k, v in used.items()) / sum(L.PARAM_WEIGHTS[k] for k in used) if used else None
    capped = bool(hard_n) and doc is not None and doc > 64
    if hard_n and doc is not None:
        doc = min(doc, 64.0)
    sd = pstdev([ps.score for _, ps, _ in scored]) if n >= 2 else 0.0
    conf = "High" if n >= 60 and figs / max(n, 1) >= 0.35 and len(checked) >= 10 else "Low" if n < 25 else "Medium"
    trend = None
    if prior is not None and doc is not None:
        trend = "up" if doc - prior >= 5 else "down" if prior - doc >= 5 else "flat"
    return {
        "doctype": doctype, "name": DOC_NAMES[doctype], "lexicon": L.LEXICON_VERSION,
        "score": r1(doc), "band": band(doc), "confidence": conf, "hardTriggers": hard_n, "capped": capped,
        "mixed": sd > 25, "boundary": doc is not None and (62 <= doc <= 67 or 37 <= doc <= 42), "trend": trend,
        "counts": {"found": len(points), "scored": n, "headings": sum(1 for r in out_points if r["status"] == "heading"),
                   "excluded": sum(1 for r in out_points if r["status"].startswith("excluded")), "noSignal": sum(1 for r in out_points if r["status"] == "no signal")},
        "share": {"green": r1(green / n * 100) if n else None, "yellow": r1((n - green - red) / n * 100) if n else None, "red": r1(red / n * 100) if n else None},
        "params": [{"id": k, "weight": L.PARAM_WEIGHTS[k], "value": r1(v), "used": v is not None} for k, v in params.items()],
        "themes": themes, "points": out_points,
    }


def company_score(docs: Dict[str, Optional[float]]) -> Dict:
    """Results 40%, call 35%, presentation 25%; a missing document's weight is shared by the others (workflow 6.4)."""
    have = {k: v for k, v in docs.items() if v is not None and k in L.COMPANY_WEIGHTS}
    if not have:
        return {"score": None, "band": None, "weights": {}}
    tw = sum(L.COMPANY_WEIGHTS[k] for k in have)
    w = {k: L.COMPANY_WEIGHTS[k] / tw for k in have}
    s = sum(w[k] * v for k, v in have.items())
    return {"score": r1(s), "band": band(s), "weights": {k: round(v * 100, 1) for k, v in w.items()}}
