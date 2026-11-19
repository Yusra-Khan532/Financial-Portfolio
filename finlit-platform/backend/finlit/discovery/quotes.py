"""Discover's quote rule (task #260, the 20 Nov Discover pack, SPEC §10 and §12, code/quote-rule.js), ported word for word.

clean_q()  cleans one passage taken from a presentation: drops design leftovers, letter-spaced headers, © lines, press-release datelines, exchange codes,
           a slide header before a quoted sentence, page numbers and half-words. Returns {"t", "kind"}: "sentence" (shown as a quote) or "slide" (shown
           as slide text), or None (a table of figures, too short).
kw_test()  says whether a passage names the theme: one of the words that placed the company, its short form (AI, LLM ...), or two of its key words.
passages() every passage FinLit kept for a company, cleaned, each with whether it names the theme and the PDF page it is on (from the stored page texts).
Describes what a company wrote; never a pick."""

from __future__ import annotations

import re
from typing import Any, Callable, Dict, List, Optional, Sequence

_DESIGN = re.compile(r"R=\d+\s*G=\d+\s*B=\d+|COLOR PALETTE|ACCENT S \d", re.I)
_COPY = re.compile(r"©\s*\d{4}\s+[A-Z][\w&.]*(?:\s+[A-Z][\w&.]*){0,3}\s*")
_SPACED = re.compile(r"\b(?:[A-Z] ){2,}[A-Z]\b")
_DATELINE = re.compile(r"\b[A-Z][a-z]+(?: [A-Z][a-z]+)?,? (?:India,? )?\d{1,2}(?:st|nd|rd|th)? [A-Z][a-z]+,? \d{4}\s*[:–-]\s")
_DATELINE_END = re.compile(r"^[^:–-]*\d{4}\s*[:–-]\s*")
_EXCH = re.compile(r"\s*\((?:BSE|NSE)\s*:[^)]*\)")
_COMPANY_DEF = re.compile(r"\s*\(\s*[“\"][^”\"]{1,30}[”\"]\s*or the\s*[“\"]Company[”\"]\s*\)", re.I)
_SEG_DROP = re.compile(r"investor (?:presentation|update|release)|quarterly results|analyst presentation|earnings (?:presentation|call)|www\.|\.com\b|\.in\b|©|"
                       r"all rights reserved|^page \d+", re.I)
_NUM_TOK = re.compile(r"^[\d.,%₹$()+\-–x×<>=]+$", re.I)
STOPW = {"and", "the", "for", "with", "from", "of", "in", "on", "to", "new"}


def clean_q(q: Any) -> Optional[Dict[str, str]]:
    t = re.sub(r"\s+", " ", str(q or "")).strip()
    if _DESIGN.search(t):
        return None
    t = _COPY.sub(" ", t)
    t = _SPACED.sub(" ", t)
    t = re.sub(r"_{3,}", " ", t)
    m = _DATELINE.search(t[:260])
    if m:
        m0 = _DATELINE_END.match(t[m.start():])
        if m0:
            t = t[m.start() + m0.end():]
    t = _EXCH.sub("", t)
    t = _COMPANY_DEF.sub("", t)
    seen: set = set()
    segs = []
    for s in re.split(r"\s*\|\s*", t):
        k = s.lower().strip()
        if not k or k in seen:
            continue
        seen.add(k)
        if not _SEG_DROP.search(s) or len(s) > 90:
            segs.append(s)
    t = sorted(segs, key=len, reverse=True)[0] if segs else ""
    oq = t.find("“")
    if 0 < oq < 110 and not re.search(r"[.!?]", t[:oq]) and len(t) - oq > 60:
        t = t[oq + 1:]
    t = re.sub(r"([A-Za-z]) - ([a-z])", r"\1-\2", t)
    for _ in range(4):
        b = t
        t = re.sub(r"^[\s\"“”'’:;.,·\-–—•▪❑➢*]+", "", t)
        t = re.sub(r"^(?:encl\.?\s*:?\s*-?\s*)?as above\b", "", t, flags=re.I)
        t = re.sub(r"^(?:press release|for immediate release)\b", "", t, flags=re.I)
        t = re.sub(r"^(?:page\s*)?\d{1,3}\s+(?=[A-Za-z])", "", t, flags=re.I)
        t = re.sub(r"^(?:section|slide)\s*\d*\s*", "", t, flags=re.I).strip()
        if t == b:
            break
    cp, op = t.find(")"), t.find("(")
    if 0 <= cp < 40 and (op < 0 or op > cp):
        t = "…" + t[cp + 1:].strip()
    t = re.sub(r",\s*,", ",", t)
    t = re.sub(r"(\w) -(\w)", r"\1-\2", t)
    t = re.sub(r"(\w)- (\w)", r"\1-\2", t)
    t = re.sub(r"\s+([,.;:%])", r"\1", t)
    toks = t.split(" ")
    nums = sum(1 for x in toks if _NUM_TOK.match(x))
    if len(toks) < 7 or nums / len(toks) > 0.28:
        return None
    cut = t.endswith("…")
    t = re.sub(r"…$", "", t).strip()
    if re.match(r"^[a-z]", t):
        m = re.search(r"[.!?]\s+(?=[A-Z“\"])", t)
        if m and m.start() < 160:
            t = t[m.end():]
        else:
            t = "…" + t
    whole = not cut and bool(re.search(r"[.!?][”\"')]?$", t))
    if not whole:
        e = max(t.rfind(". "), t.rfind("! "), t.rfind("? "))
        if e > 70:
            t, whole = t[:e + 1], True
        else:
            t = re.sub(r"[,;:\-–(&]+$", "", re.sub(r"\s+\S*$", "", t)).strip() + "…"
    if len(t) < 30:
        return None
    words = t.split(" ")
    caps = sum(1 for w in words if re.match(r"^[A-Z][A-Za-z]", w))
    sentence = whole and len(words) >= 8 and caps / len(words) < 0.5 and bool(re.match(r"^[A-Z“\"…]", t))
    return {"t": t, "kind": "sentence" if sentence else "slide"}


def kw_test(kw: Sequence[str]) -> Optional[Callable[[str], bool]]:
    tests: List[Callable[[str, str], bool]] = []
    for k in kw or []:
        w = str(k).strip().lower()
        if not w:
            continue
        tests.append(lambda t, raw, w=w: w in t)
        words = [x for x in re.split(r"[\s/-]+", w) if len(x) >= 3 and x not in STOPW]
        if len(words) > 1:
            need, stems = min(2, len(words)), [x[:5] for x in words]
            tests.append(lambda t, raw, stems=stems, need=need: sum(1 for st in stems if re.search(r"\b" + re.escape(st), t)) >= need)
            ac = "".join(x[0] for x in re.split(r"[\s/-]+", w) if x)
            if 2 <= len(ac) <= 4:
                tests.append(lambda t, raw, ac=ac: bool(re.search(r"\b" + re.escape(ac.upper()) + r"s?\b", raw)))
        if "artificial intelligence" in w:
            tests.append(lambda t, raw: bool(re.search(r"\bAI\b|\bAI-", raw)))
        if "generative ai" in w:
            tests.append(lambda t, raw: bool(re.search(r"\bGen ?AI\b", raw, re.I)))
    if not tests:
        return None
    return lambda raw: any(f(raw.lower(), raw) for f in tests)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def page_of(raw: str, pages: Optional[Sequence[str]]) -> Optional[int]:
    """The 1-based PDF page whose text holds the passage (its first 60 letters and digits), or None when the page texts are not kept."""
    if not pages:
        return None
    key = _norm(raw)[:60]
    if len(key) < 15:
        return None
    for i, p in enumerate(pages):
        if key in _norm(p):
            return i + 1
    return None


def passages(raw: Sequence[str], keywords: Sequence[str], pages: Optional[Sequence[str]] = None, extra: Sequence[str] = (), limit: int = 8) -> List[Dict[str, Any]]:
    """Every passage FinLit kept (`raw`, the stored evidence, then `extra`, more sentences of the presentation that name the theme's words), cleaned
    by clean_q(), duplicates dropped, each with "names" (it names the theme) and "page". The ones that name the theme come first, sentences before
    slide text, then the rest in the presentation's order."""
    ok = kw_test(keywords)
    seen: set = set()
    out: List[Dict[str, Any]] = []
    for i, q in enumerate([*raw, *extra]):
        c = clean_q(q)
        if not c:
            continue
        k = c["t"].lower()[:60]
        if k in seen:
            continue
        seen.add(k)
        names = bool(ok(c["t"])) if ok else False
        out.append({**c, "names": names, "page": page_of(str(q), pages), "_i": i})
    out.sort(key=lambda x: (not x["names"], x["kind"] != "sentence", x["_i"]))
    for x in out:
        x.pop("_i", None)
    return out[:limit]
