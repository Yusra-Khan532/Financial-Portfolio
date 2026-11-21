"""From a document's page texts to points (task #266; the workflow's section 3: extraction, cleaning, segmentation, exclusions).

A point is one sentence, one bullet or one table row. A short title line starts a new section and is kept for structure only (a heading). Wrapped lines
are joined, words split at a line end are re-joined ("commis-\\nsioned"), page numbers are kept with every point. In a call transcript a point is one
sentence of a speaker's turn: the moderator's and the analysts' lines are excluded (a question is not a company statement); an analyst is a speaker the
moderator introduces ("the next question is from the line of Priya Shah from ABC Securities") or one labelled Analyst / Participant / Q. Everyone else is
treated as management. Pure functions on text; the PDF is read elsewhere (pypdf, as FinLit AI and the Discovery job read it).
"""
from __future__ import annotations

import re
from typing import List, Optional, Sequence, Set

from .scorer import Point

BULLET = re.compile(r"^\s*(?:[•●▪■◦▸►➢➤✓✔\-–—*·]|\(?[a-z0-9]{1,2}[.)])\s+", re.I)
SPEAKER = re.compile(r"^\s*([A-Z][A-Za-z.'’-]*(?:\s+[A-Z][A-Za-z.'’-]*){0,4})\s*[:：]\s+(.*)$")
MODERATOR = re.compile(r"^(moderator|operator|coordinator|host)$", re.I)
ANALYST_LABEL = re.compile(r"^(analyst|participant|question|q|unidentified (?:analyst|participant)|investor)$", re.I)
INTRODUCED = re.compile(r"(?:question|questions|line)\s+(?:is\s+)?(?:from|of)\s+(?:the\s+line\s+of\s+)?(?:mr\.?|ms\.?|mrs\.?|dr\.?)?\s*([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){0,3})\s+(?:from|of|with)\b")
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(\"'‘“])")
NUMBER = re.compile(r"(?<![A-Za-z\d])\(?-?\d[\d,]*(?:\.\d+)?\)?%?(?![A-Za-z\d])")   # a figure on its own, not the 2 of "Q2" or the 27 of "FY27"
ABBREV = re.compile(r"\b(Mr|Ms|Mrs|Dr|Rs|No|Nos|Ltd|Pvt|Inc|Co|Corp|vs|approx|Sr|Jr|St|Govt|Dept|Fig|i\.e|e\.g|etc|viz)\.", re.I)
PAGE_NO = re.compile(r"^\s*(?:page\s*)?\d{1,3}\s*(?:of\s*\d{1,3})?\s*$", re.I)


def _clean_lines(page: str) -> List[str]:
    page = re.sub(r"(\w)-\n\s*(\w)", r"\1\2", page)               # commis-\nsioned -> commissioned
    return [re.sub(r"[ \t]+", " ", ln).strip() for ln in page.split("\n")]


def is_heading(line: str) -> bool:
    """A short title line: at most eight words, no sentence end, not a table row, mostly capitalised words."""
    words = line.split()
    if not words or len(words) > 8 or line.endswith((".", ",", ";", ":")) or len(NUMBER.findall(line)) >= 2:
        return False
    caps = sum(1 for w in words if w[:1].isupper() or not w[:1].isalpha())
    return caps / len(words) >= 0.6 and any(c.isalpha() for c in line)


def numeric(line: str) -> bool:
    """A line that is mostly figures (a table line without a label, a run of dates and amounts): never joined into a paragraph."""
    toks = line.split()
    return len(toks) >= 3 and sum(1 for t in toks if NUMBER.fullmatch(t.strip(",;:")) or re.fullmatch(r"\(?(?:audited|unaudited|reviewed)\)?", t, re.I)) / len(toks) >= 0.5


def is_row(line: str) -> bool:
    """A table row: a label and at least two figures ("Revenue from operations 1,860 1,576 18.0%")."""
    nums = NUMBER.findall(line)
    alpha = [w for w in line.split() if re.search(r"[A-Za-z]", w)]
    return len(nums) >= 2 and bool(re.search(r"[A-Za-z]{3,}", line)) and len(alpha) <= 10 and not line.rstrip().endswith(".")


def _paragraphs(lines: Sequence[str]) -> List[tuple]:
    """(kind, text) blocks: headings, table rows, bullets and joined paragraphs."""
    out: List[tuple] = []
    buf: List[str] = []

    def flush():
        if buf:
            out.append(("para", " ".join(buf)))
            buf.clear()
    for ln in lines:
        if not ln or PAGE_NO.match(ln):
            flush()
            continue
        if BULLET.match(ln):
            flush()
            buf.append(BULLET.sub("", ln))
            out.append(("bullet", None))           # marks that the next flush is a bullet
            continue
        done = not buf or bool(re.search(r"[.!?:]$", buf[-1])) or (bool(out) and out[-1] == ("bullet", None))
        if numeric(ln):                                 # a line of figures stands alone: a table line, scored only if it has a label word
            flush()
            out.append(("row", ln))
            continue
        if is_row(ln) and done:
            flush()
            out.append(("row", ln))
            continue
        if is_heading(ln) and done:
            flush()
            out.append(("heading", ln))
            continue
        buf.append(ln)
        if re.search(r"[.!?:]$", ln) and len(" ".join(buf)) > 160:
            flush()
    flush()
    # fold the bullet markers into the paragraph that follows them
    res: List[tuple] = []
    pending = False
    for kind, text in out:
        if kind == "bullet" and text is None:
            pending = True
            continue
        res.append(("bullet" if pending and kind == "para" else kind, text))
        pending = False
    return res


def segment(pages: Sequence[str], doctype: str) -> List[Point]:
    """Every point of a document, in order, with its page and section; transcripts carry the speaker and leave out the moderator and analysts."""
    points: List[Point] = []
    section = ""
    speaker: Optional[str] = None
    analysts: Set[str] = set()
    for pno, page in enumerate(pages, start=1):
        lines = _clean_lines(page or "")
        if doctype == "C":
            joined: List[str] = []
            for ln in lines:                       # a speaker label starts a new paragraph
                m = SPEAKER.match(ln)
                if m:
                    joined.append("")
                joined.append(ln)
            lines = joined
        for kind, text in _paragraphs(lines):
            if not text:
                continue
            if kind == "heading":
                section = text
                points.append(Point(text, pno, section, "heading", speaker, "heading"))
                continue
            if doctype == "C":
                m = SPEAKER.match(text)
                if m:
                    speaker, text = m.group(1).strip(), m.group(2).strip()
                if speaker and MODERATOR.match(speaker):
                    for n in INTRODUCED.findall(text):
                        analysts.add(n.strip().lower())
            safe = ABBREV.sub(lambda m: m.group(0)[:-1] + "\u2024", text)          # "Mr. Rao" is not a sentence end (one-dot leader, put back below)
            chunks = [text] if kind == "row" else [x.strip().replace("\u2024", ".") for x in SENT_SPLIT.split(safe) if x.strip()]
            for ch in chunks:
                status = "scored"
                if doctype == "C" and speaker:
                    who = speaker.lower()
                    if MODERATOR.match(speaker):
                        status = "excluded: analyst or moderator"
                    elif ANALYST_LABEL.match(speaker) or who in analysts or any(who.split()[-1:] == a.split()[-1:] and who.split()[:1] == a.split()[:1] for a in analysts):
                        status = "excluded: analyst or moderator"
                points.append(Point(ch, pno, section, "row" if kind == "row" else "bullet" if kind == "bullet" else "sentence", speaker if doctype == "C" else None, status))
    # first and last point of each section weigh 1.2 (workflow 3.4)
    by_sec: dict = {}
    for i, p in enumerate(points):
        if p.status == "scored":
            by_sec.setdefault(p.section, []).append(i)
    for idx in by_sec.values():
        points[idx[0]].edge = True
        points[idx[-1]].edge = True
    return points
