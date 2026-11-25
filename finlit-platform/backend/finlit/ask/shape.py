"""The shape of a finished answer (task: the founder, 25 Nov 2026, answer structure): tidy small slips without a model, and measure the shape.

`tidy(text)` mends what the panel would draw badly and changes no fact: an opening filler line ("Sure, here is ...", "Based on the data ..."),
headings written as "**1. Title**" or "## 1. Title", bullets written as "•" or "*", runs of blank lines, a second "Sources:" line.
`measure(text)` counts the shape: the lead line and its words, the sections, the points, the figures and how many carry a source, the longest
point. The Answer check (ask/check.py) scores answers with it, and every answer's measures are logged.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

_FILLER = re.compile(r"^\s*(sure|certainly|of course|great question|here(?:'s| is| are)|based on (?:the|my|what)|let me|i(?:'ll| will) (?:look|check|answer)|"
                     r"according to (?:the )?(?:data|tools?)|okay|alright)\b[^\n]{0,120}?[:.!]?\s*$", re.I)
_HEAD_DECOR = re.compile(r"^\s*(?:#{1,4}\s*)?\*{0,2}\s*(\d{1,2})[.)]\s+(.+?)\s*\*{0,2}\s*:?\s*$")
_BULLET = re.compile(r"^\s*(?:[•*·▪–]|-(?=\S))\s*")
_SOURCES = re.compile(r"^\s*sources?\s*:", re.I)
_FIG = re.compile(r"(?:₹\s?[\d,]+(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|×|x\b|crore|cr\b|lakh|bps|pts?\b))", re.I)
_CITE = re.compile(r"\[[^\]\n]{3,120}\]\s*\.?\s*$")


def tidy(text: str) -> str:
    lines = (text or "").replace("\r", "").split("\n")
    while lines and (not lines[0].strip() or _FILLER.match(lines[0]) and len(lines) > 1):
        lines.pop(0)                                                     # an opening filler line (never the only line)
    out: List[str] = []
    seen_sources = False
    for raw in lines:
        line = raw.rstrip()
        h = _HEAD_DECOR.match(line)
        if h and not line.lstrip().startswith(("-", "•", "*  ")) and len(h.group(2)) <= 60 and not _FIG.search(h.group(2)):
            line = f"{h.group(1)}. {h.group(2).strip('*').strip()}"     # "**2. Asset quality**" -> "2. Asset quality"
        elif _BULLET.match(line) and not line.lstrip().startswith("**"):
            line = "- " + _BULLET.sub("", line, count=1).strip()
        if _SOURCES.match(line):
            if seen_sources:
                continue                                                 # one "Sources:" line is enough
            seen_sources = True
        if not line.strip() and out and not out[-1].strip():
            continue                                                     # one blank line at most
        out.append(line)
    while out and not out[-1].strip():
        out.pop()
    return "\n".join(out)


def measure(text: str) -> Dict[str, Any]:
    lines = [l.strip() for l in (text or "").split("\n") if l.strip()]
    heads = [l for l in lines if re.match(r"^\d{1,2}\.\s+\S", l) and not _FIG.search(l)]
    points = [l for l in lines if l.startswith("- ")]
    body = [l for l in lines if l not in heads and not _SOURCES.match(l)]
    lead = body[0] if body and not body[0].startswith("- ") else ""
    with_fig = [p for p in points + ([lead] if lead else []) if _FIG.search(p)]
    cited = [p for p in with_fig if _CITE.search(p) or "[" in p]
    words = len(re.findall(r"\S+", text or ""))
    longest = max((len(p.split()) for p in points), default=0)
    paras = [l for l in body if not l.startswith("- ") and l != lead and len(l.split()) > 35]
    return {"words": words, "lead": bool(lead), "leadWords": len(lead.split()) if lead else 0, "sections": len(heads), "points": len(points),
            "figures": len(with_fig), "citedFigures": len(cited), "longestPoint": longest, "paragraphs": len(paras)}


def problems(m: Dict[str, Any], kind: str | None) -> List[str]:
    """What is off in the shape, in words (empty when the shape is right for its blueprint)."""
    out: List[str] = []
    sectioned = kind not in (None, "lookup", "concept", "howto", "greeting")
    if sectioned:
        if not m["lead"]:
            out.append("no lead line")
        elif m["leadWords"] > 30:
            out.append(f"lead line of {m['leadWords']} words (at most 25)")
        if m["sections"] < 2:
            out.append(f"{m['sections']} sections (2 to 4 expected)")
        elif m["sections"] > 4:
            out.append(f"{m['sections']} sections (at most 4)")
    if m["figures"] and m["citedFigures"] < m["figures"]:
        out.append(f"{m['figures'] - m['citedFigures']} of {m['figures']} lines with a figure have no source")
    if m["longestPoint"] > 30:
        out.append(f"a point of {m['longestPoint']} words (at most 20)")
    if m["paragraphs"]:
        out.append(f"{m['paragraphs']} paragraph(s) instead of points")
    if m["words"] > (260 if sectioned else 90):
        out.append(f"{m['words']} words (at most {'200' if sectioned else '60'})")
    return out
