"""Answer blueprints (the founder, 25 Nov 2026: "work on the structure, answer structure ... at the end we need perfect things"; the model stays
Haiku for cost). A small model follows one concrete shape far better than many abstract rules, so each kind of question gets its own shape: the
lead line, the section titles in order, and what each section holds. The shape goes in the note with the question (after the cached prefix, so the
cache stays warm and it costs nothing), and only when the answer style "ask_answer_v2" is switched on (Console > Data health > Features).

`kind_of(question, kinds, bank)` picks one blueprint; `blueprint(kind)` is its text. Pure functions; no model, no reads.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Sequence

# ------------------------------------------------------------------------------------------------ what shape a question needs
_GREETING = re.compile(r"^\s*(hi|hello|hey|namaste|thanks|thank you|ok|okay|good (?:morning|evening|afternoon))\b[\s!.?]*$", re.I)
_DEFINE = re.compile(r"\b(what (?:is|are|does)|meaning of|define|definition|explain|kya (?:hai|hota)|matlab|how (?:is|do you) (?:calculate|compute)d?)\b", re.I)
_HOWTO = re.compile(r"\b(how (?:do|can|to) (?:i|you|we)|where (?:do|can) i|steps? to|how does finlit|use the|set up|add (?:a|my)|create (?:a|an))\b", re.I)
_METRIC = (r"(?:current |latest |today'?s )?(?:price|share price|stock price|market cap|p/?e|pe ratio|p/?b|roe|roce|dividend yield|nav|eps|book value|"
           r"debt to equity|52[- ]week (?:high|low))")
_LOOKUP = re.compile(r"\b(what(?:'s| is| was) (?:the )?(?:[\w&.-]+(?:'s|s')? ){0,4}?" + _METRIC + r"\b|price of|share price|stock price|\bnav of|market cap of|"
                     r"when (?:is|are|was|were) .{0,40}(?:results?|agm|dividend|record date|ex[- ]date|listing))", re.I)
_COMPARE = re.compile(r"\b(compare|comparison|versus|vs\.?|better than|worse than|difference between|or\b.{1,40}\?$)\b", re.I)
_RESULTS = re.compile(r"\b(results?|quarter|q[1-4]\b|q[1-4]fy|earnings|profit (?:this|last) quarter|nat(?:i)?ja)\b", re.I)
_MOVE = re.compile(r"\b(why (?:did|is|are|was|were|has|have) .{0,50}\b(?:fall|fell|falling|drop|dropped|down|crash|crashed|rise|rose|rising|up|jump|jumped|"
                   r"rally|rallied|surge|surged|gain|gained)|kyun (?:gira|badha|upar|neeche))\b", re.I)
_RISK = re.compile(r"\b(red ?flags?|risks?|concerns?|issues?|problems?|worr(?:y|ies)|warning signs?|weak(?:ness|nesses)?|challenges?|headwinds?)\b", re.I)
_HEALTH = re.compile(r"\b(health|healthy|how (?:is|are) .{0,40}(?:doing|performing|placed)|fundamentals?|analy[sz]e|analysis|overview|review|assess|good company|"
                     r"strong|in good shape|outlook|prospects?)\b", re.I)
_VALUE = re.compile(r"\b(valuation|valued|expensive|cheap|over-?valued|under-?valued|p/?e|price to earnings|p/?b|ev/?ebitda|fair value|intrinsic)\b", re.I)
_MINE = re.compile(r"\b(my (?:holdings?|portfolio|shares|stocks|funds|watchlists?|investments?)|mere (?:shares|stocks|funds))\b", re.I)


def kind_of(question: str, kinds: Sequence[str] = (), bank: bool = False) -> Optional[str]:
    """The blueprint for this question, or None when the question needs no particular shape (anything outside markets)."""
    q = (question or "").strip()
    if not q:
        return None
    if _GREETING.match(q):
        return "greeting"
    if _HOWTO.search(q) and not {"company", "financials", "funds"} & set(kinds):
        return "howto"                                   # "how do I add a stock to my watchlist?" is a how-to, not about their lists
    if _MINE.search(q):
        return "mine"
    if _MOVE.search(q):
        return "move"
    if _COMPARE.search(q) and ("company" in kinds or "funds" in kinds):
        return "compare"
    if "company" in kinds or "financials" in kinds:
        if _RISK.search(q):
            return "bank_risk" if bank else "risks"
        if _LOOKUP.search(q) and not _HEALTH.search(q):
            return "lookup"
        if _VALUE.search(q):
            return "valuation"
        if _RESULTS.search(q):
            return "bank_results" if bank else "results"
        return "bank" if bank else "company"
    if "funds" in kinds:
        return "lookup" if _LOOKUP.search(q) and not _HEALTH.search(q) else "fund"
    if any(k == "sectors" or k.startswith("sector:") for k in kinds):
        return "sector"
    if "economy" in kinds:
        return "lookup" if _LOOKUP.search(q) else "economy"
    if "news" in kinds:
        return "news"
    if "concept" in kinds or "valuation" in kinds or "regulation" in kinds or _DEFINE.search(q):
        return "howto" if _HOWTO.search(q) else "concept"
    if _HOWTO.search(q):
        return "howto"
    return None


# ------------------------------------------------------------------------------------------------ the shapes
# Each: the lead line, then the sections in order (title: what goes in it). "Stance" only where the question asks for a reading (service.stance_note).
_SECTIONED = "Write it as: one lead line, then the numbered sections below in this order (leave out a section only when nothing was read for it; never add other sections):"
SHAPES: Dict[str, Dict[str, object]] = {
    "company": {"lead": "how the company is doing now, in one line, with its most telling figure",
                "sections": [("Growth", "revenue and profit growth, year on year, latest year and latest quarter"),
                             ("Profitability", "margins and return on capital (ROE or ROCE), with the year before"),
                             ("Balance sheet and cash", "debt against equity, cash flow from operations, any pledge"),
                             ("Valuation", "P/E or P/B against its own five-year range or its peers")]},
    "bank": {"lead": "how the bank is doing now, in one line, with its most telling figure",
             "sections": [("Business growth", "advances and deposit growth, CASA ratio"),
                          ("Asset quality", "GNPA, NNPA, provision coverage, credit cost, each with the quarter before"),
                          ("Margins and costs", "net interest margin, cost-to-income, ROA"),
                          ("Capital", "capital adequacy (CRAR or CET1)")]},
    "results": {"lead": "the quarter in one line: revenue and profit growth year on year",
                "sections": [("Revenue and profit", "this quarter against the same quarter last year and the quarter before"),
                             ("Margins", "operating margin and its change"),
                             ("What management said", "guidance, orders, demand, from the call or the presentation"),
                             ("One-offs", "exceptional items or anything that makes the quarter not comparable")]},
    "bank_results": {"lead": "the quarter in one line: net interest income and profit growth year on year",
                     "sections": [("Income and profit", "net interest income, other income, net profit, year on year"),
                                  ("Asset quality", "GNPA, NNPA, slippages, credit cost against the quarter before"),
                                  ("Margins and growth", "NIM, advances and deposit growth"),
                                  ("What management said", "guidance from the call or the presentation")]},
    "risks": {"lead": "the main thing to watch, in one line",
              "sections": [("What the results and call show", "what fell, slowed or was flagged, with figures"),
                           ("Debt and cash flow", "borrowings, interest cover, operating cash flow against profit"),
                           ("Ownership", "promoter holding and pledge changes, large holders selling"),
                           ("What FinLit Prism flags", "the weakest of its parts and the company card's watch-outs")]},
    "bank_risk": {"lead": "the main thing to watch, in one line",
                  "sections": [("Asset quality", "GNPA, NNPA, slippages, unsecured or stressed books"),
                               ("Margins and funding", "NIM pressure, deposit growth against loan growth, cost of funds"),
                               ("Capital", "capital adequacy and any capital raising"),
                               ("What FinLit Prism flags", "the weakest of its parts and the company card's watch-outs")]},
    "valuation": {"lead": "where the valuation stands, in one line, with the main multiple",
                  "sections": [("Current multiples", "P/E, P/B or EV/EBITDA now"),
                               ("Against its own history", "the same multiples against the five-year median or range"),
                               ("Against peers", "the same multiple for two or three NSE peers"),
                               ("What the price assumes", "the growth that today's price builds in, from FinLit's reading")]},
    "compare": {"lead": "the main difference between them, in one line",
                "sections": [("Growth", "each one's revenue and profit growth, side by side in one point each"),
                             ("Profitability", "margins and ROE or ROCE, side by side"),
                             ("Balance sheet", "debt and cash flow, side by side"),
                             ("Valuation", "P/E or P/B, side by side")],
                "extra": "Every point names both, for example \"- ROE: A 18.2% vs B 12.4% in FY2026 [FinLit company pages, 20 Nov 2026]\"."},
    "fund": {"lead": "what the fund is and how it has done, in one line",
             "sections": [("Returns", "1, 3 and 5-year returns against its category and benchmark"),
                          ("Risk", "volatility or worst fall, against the category"),
                          ("Costs", "expense ratio, exit load"),
                          ("Portfolio", "top holdings or sectors, fund size")]},
    "sector": {"lead": "where the sector stands, in one line",
               "sections": [("Where it stands", "FinLit's Sector Pulse state and Sector Rotation box, with dates"),
                            ("Leaders and laggards", "the companies doing best and worst in it, with one figure each"),
                            ("What is driving it", "the news or policy behind it, with the date")]},
    "economy": {"lead": "the latest reading, in one line, with its date",
                "sections": [("Latest figures", "the reading and the one before it"),
                             ("The trend", "the last few readings or the year"),
                             ("What RBI or the government said", "the policy view, with the date"),
                             ("What it means for markets", "described, never advised")]},
    "move": {"lead": "what moved and by how much, in one line, with the date",
             "sections": [("The move", "the price change and the day, from FinLit's prices"),
                          ("The trigger", "the filing or news behind it, with its date and source"),
                          ("The context", "how the sector and the Nifty did that day")]},
    "news": {"lead": "the news in one line, with its date",
             "sections": [("What happened", "the facts, with dates and sources"),
                          ("Why it matters", "the figures it touches, described")]},
    "mine": {"lead": "the overall picture of their holdings, in one line",
             "sections": [("Overall", "value, change, the number of holdings"),
                          ("Biggest moves", "the holdings that moved most, with figures"),
                          ("What is new", "results, filings or rating changes since they last looked")]},
}
_SHORT = {
    "lookup": "Answer in one sentence: the figure, its date or period, and its source in square brackets. No sections, no lead line.",
    "concept": "Answer in two or three short sentences: what it is, how it is worked out, and how to read it (one Indian example if it helps). No sections, no figures about a specific company.",
    "howto": "Answer in two to four short numbered steps naming the FinLit page and the buttons as the site shows them. No sections.",
    "greeting": "Answer in one short friendly sentence and offer two questions you can answer.",
}


def blueprint(kind: Optional[str]) -> str:
    """The shape, as plain lines for the note with the question; empty for None."""
    if not kind:
        return ""
    if kind in _SHORT:
        return "Answer shape: " + _SHORT[kind]
    s = SHAPES[kind]
    lines = [f"Answer shape: {_SECTIONED}", f"- Lead line (at most 25 words): {s['lead']}."]
    for i, (title, what) in enumerate(s["sections"], 1):    # type: ignore[arg-type]
        lines.append(f"- {i}. {title}: {what}. One to three points, each one fact with its figure, what it compares with, and [source, date].")
    if s.get("extra"):
        lines.append(f"- {s['extra']}")
    lines.append("- Use these section titles as written. A point you could not read a figure for is left out, never filled with a guess.")
    return "\n".join(lines)


def kinds_list() -> List[str]:
    return sorted([*SHAPES, *_SHORT])
