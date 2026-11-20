"""Discovery (task #221): the keyword buckets and the scoring of the founder's notes (Notes-18-11-2026.pdf, bucket_investor_presentations.py), from the
Investor Presentation Keyword Directory. Copied as written: the 22 buckets and their terms, word-bounded matching (short all-capital acronyms matched in
capitals only, to avoid noise), a bucket counts when 2 different keywords or 5 mentions appear, score = 2 x distinct + 0.5 x min(total, 20), the
primary bucket is the highest score and a secondary one scores at least half of it, and the evidence is up to 2 sentences that name a keyword AND hold
a figure. Plurals count ("solar cells", "EVs"). One fix: the notes set status "ok" from the evidence function itself (always true); here "ok" needs an evidence sentence.

Upgrade (owner, 18 Nov 2026: "proper bucketing as in the PDF", "sentiment kind of analysis", "sectorization"):
- The directory's own structure (directory.json, read from the PDF's tables): 166 keywords, each with its related terms and what to verify; a keyword
  and its related terms are one CONCEPT, so synonyms are not counted twice; the notes' terms are merged into the concept that holds them (175 in all).
  "2 different keywords" therefore means 2 different concepts.
- The directory's screening discipline: each evidence sentence is tagged operating, under execution, planned or MoU / pilot, and the company's stage
  for a theme is the most advanced one its own sentences show.
- Tone: positive and negative finance words of the presentation (a small list in the spirit of the Loughran-McDonald finance word lists), as a
  score from -1 to 1 and a plain label. It describes the company's own wording, nothing more.

The directory's own caution stays with every result: a keyword mention by itself is not proof of material business exposure."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Pattern, Sequence, Tuple

BUCKETS: Dict[str, List[str]] = {
    "AI & GenAI": ["Artificial intelligence", "Generative AI", "GenAI", "Large language model", "LLM", "AI inference", "AI data centre", "GPU server",
                   "GPU cluster", "Machine learning", "AI automation", "Computer vision"],
    "Agriculture & Food Technology": ["Precision agriculture", "Smart irrigation", "Food processing", "Cold chain"],
    "Battery & Energy Storage": ["Battery cell manufacturing", "Battery module", "Battery pack", "Grid-scale battery storage", "BESS", "Energy storage system",
                                 "ESS", "Battery recycling", "Black mass", "Sodium-ion"],
    "Cloud & Data Centres": ["Data centre capacity", "MW data centre", "Hyperscale data centre", "Cloud hosting", "GPU cloud", "AI compute", "Data centre power",
                             "Data centre cooling", "Data centre EPC", "Colocation data centre", "Hyperscale cloud", "Liquid cooling", "UPS", "Rack capacity"],
    "Corporate Catalysts & Growth Signals": ["Upgraded guidance", "Revenue guidance", "Strategic partnership", "Joint venture", "M&A", "Mergers and acquisitions",
                                             "Export order", "Order inflow", "Order book", "Order backlog", "Letter of award", "Letter of intent", "Controlling stake",
                                             "Stake sale", "Divestment", "New product commercialisation", "Technology licensing", "Royalty income"],
    "Cybersecurity & Connectivity": ["Cybersecurity software", "Managed security", "Threat monitoring", "Zero-trust", "5G network equipment", "Internet of Things",
                                     "IoT", "Blockchain", "Distributed ledger"],
    "Defence & Aerospace": ["Defence order", "Defence indigenisation", "Aatmanirbhar defence", "Missile system", "Ammunition", "Radar system", "Electronic warfare",
                            "Avionics", "Shipbuilding", "Naval system", "Aircraft MRO", "Defence electronics", "Combat UAV", "Loitering munition", "Defence export",
                            "Aircraft structure", "Missile guidance", "Rocket motor", "Solid rocket motor", "Defence R&D"],
    "EV & Automotive Technology": ["Electric vehicle", "EV", "EV powertrain", "Traction motor", "EV charging", "Automotive electronics", "ADAS", "Driver assistance",
                                   "Battery management system", "BMS"],
    "Electrodes & Advanced Materials": ["Graphite electrode", "UHP graphite", "Battery electrode material", "Anode material", "Cathode material", "Synthetic graphite",
                                        "Silicon anode", "LFP", "NMC", "Cathode active material", "CAM", "Welding electrode", "Flux-cored wire", "Carbon paste",
                                        "Carbon block", "Isostatic graphite", "Carbon composite"],
    "Financial Services & Trading": ["Electronic trading platform", "Algorithmic trading", "Brokerage", "Securities trading", "Commodity trading",
                                     "Foreign exchange trading", "FX trading", "Turnover growth", "Average daily turnover", "ADTV", "Traded value"],
    "Healthcare & Life Sciences": ["Biotechnology", "Biologics", "CRDMO", "CDMO", "CRO", "Medical device", "API capacity", "Formulation capacity", "Clinical trial",
                                   "Drug discovery"],
    "Industrial Manufacturing & Capex": ["Capacity expansion", "Capital expenditure", "Capex", "Confirmed backlog", "Major contract win", "Industrial automation",
                                         "Robotics", "3D printing", "Additive manufacturing", "Precision engineering", "Greenfield", "Brownfield",
                                         "Debottlenecking", "Capacity utilisation", "Plant utilisation"],
    "Infrastructure & Transport": ["Railway modernisation", "Signalling", "Metro rail", "Rolling stock", "Road EPC", "Highway EPC", "Ports and logistics",
                                   "Water and wastewater"],
    "Marine & Shipbuilding": ["Commercial shipbuilding", "Cargo vessel", "Naval shipbuilding", "Marine engineering", "Offshore services", "Subsea technology",
                              "Dredging", "Harbour works"],
    "Mobile & Electronics Manufacturing": ["Mobile phone manufacturing", "Smartphone assembly", "EMS", "Electronics manufacturing services", "PCB",
                                           "Printed circuit board", "PCBA", "Camera module", "Display module", "OLED", "LCD", "PLI",
                                           "Production-linked incentive", "Electronics export"],
    "Nuclear Energy": ["Nuclear power", "SMR", "Small modular reactor", "Nuclear reactor component", "Uranium", "Nuclear fuel cycle", "Nuclear EPC"],
    "Renewable Energy & Power": ["Solar PV", "Photovoltaic", "Solar EPC", "Wind turbine", "Hydroelectric", "Green hydrogen", "Green ammonia", "Power transmission",
                                 "Substation", "Capacity addition"],
    "Renewable Power": ["Renewable power generation", "Renewable electricity", "IPP", "Independent power producer", "Hybrid renewable", "Round-the-clock",
                        "RTC power", "Pumped hydro", "Pumped storage", "PSP", "Renewable energy certificate", "REC", "Carbon credit"],
    "Semiconductor & Electronics": ["Chip design", "Semiconductor fabrication", "Wafer fab", "OSAT", "ATMP", "GaN", "SiC", "Semiconductor equipment",
                                    "Electronic component", "Advanced packaging"],
    "Solar Technology": ["TOPCon", "HJT", "PERC", "Solar cell", "Solar module", "PV module", "Bifacial", "Solar inverter", "String inverter", "Tracker",
                         "Mounting structure", "Solar glass", "Solar wafer", "Ingot", "Polysilicon", "Rooftop solar", "Distributed solar"],
    "Space & Drone Technology": ["UAV", "Unmanned aerial vehicle", "Defence drone", "Satellite manufacturing", "Launch vehicle", "Ground station",
                                 "Satellite service", "Drone-as-a-service", "Drone payload", "Counter-drone", "Anti-drone", "Satcom", "Satellite communication",
                                 "Earth observation", "Geospatial", "Space-grade", "Space launch"],
}

CAUTION = ("A keyword mention by itself is not proof of material business exposure: check the figures, orders, capacity and status in the presentation "
           "itself. Describes what the company says about itself; not a recommendation.")
NUM_RE = re.compile(r"\d")
MIN_DISTINCT, MIN_TOTAL = 2, 5        # the notes: "Require breadth, or a lot of repetition, to avoid one-word noise"
MAX_PAGES = 80                        # the notes read the first 80 pages
SIGNAL_BUCKETS = {"Corporate Catalysts & Growth Signals"}
RULES_VERSION = 2                     # bump when the scoring changes: every stored presentation is read again with the new rules (job, bounded per night)
DIRECTORY = json.loads((Path(__file__).with_name("directory.json")).read_text(encoding="utf-8"))["buckets"]
# Related terms of the PDF that are ordinary words in any deck (a power plant's "MW", a test's "trials"): kept in the directory, not matched alone.
TOO_BROAD = {"mw", "trials", "certification", "navigation", "nodes", "payload", "propulsion", "transformers", "hvac"}


def _pattern(term: str) -> str:
    """Whole words; plural endings count (upgrade: decks say "solar cells", "EVs"; the notes' exact boundary missed every plural)."""
    return r"(?<![A-Za-z])" + re.escape(term) + r"(?:s|es)?(?![A-Za-z])"


def compile_patterns() -> Dict[Tuple[str, str], Pattern[str]]:
    """(bucket, concept) -> one pattern for the concept's keyword and related terms. Short all-capital acronyms (5 letters or fewer: EMS, CAM, ESS)
    are matched in capitals only, so 'campaign' or 'ems' never count; the rest ignore case."""
    pats: Dict[Tuple[str, str], Pattern[str]] = {}
    for bucket, concepts in DIRECTORY.items():
        for c in concepts:
            caps = [a for a in c["aliases"] if a.isupper() and len(a) <= 5 and a.lower() not in TOO_BROAD]
            words = [a for a in c["aliases"] if a not in caps and a.lower() not in TOO_BROAD]
            alts = ([r"(?-i:" + _pattern(a) + ")" for a in caps] + [_pattern(a) for a in sorted(words, key=len, reverse=True)])
            if alts:
                pats[(bucket, c["name"])] = re.compile("|".join(alts), re.IGNORECASE)
    return pats


PATTERNS = compile_patterns()


def compile_buckets() -> Dict[str, Tuple[Pattern[str], List[str]]]:
    """bucket -> (one pattern of every alias of its concepts, longest first, each in its own group; group index -> concept). Scanned once, left to
    right, so a piece of text counts for one concept only ("Generative AI" is not also "AI")."""
    out: Dict[str, Tuple[Pattern[str], List[str]]] = {}
    for bucket, concepts in DIRECTORY.items():
        alts: List[Tuple[str, str]] = []
        for c in concepts:
            for a in c["aliases"]:
                if a.lower() in TOO_BROAD:
                    continue
                if a.isupper() and len(a) <= 5:
                    alts.append((r"(?-i:" + _pattern(a) + ")", c["name"]))
                elif a.lower() not in TOO_BROAD:
                    alts.append((_pattern(a), c["name"]))
        alts.sort(key=lambda x: -len(x[0]))
        out[bucket] = (re.compile("|".join(f"({p})" for p, _ in alts), re.IGNORECASE), [n for _, n in alts])
    return out


BUCKET_PATTERNS = compile_buckets()
VERIFY = {(b, c["name"]): c["verify"] for b, cs in DIRECTORY.items() for c in cs}


def analyse(text: str, pats: Dict[Tuple[str, str], Pattern[str]] = PATTERNS, min_distinct: int = MIN_DISTINCT, min_total: int = MIN_TOTAL) -> Dict[str, dict]:
    """bucket -> {distinct, total, score, terms (the 8 most mentioned concepts)}, highest score first; only buckets with breadth or repetition.
    score = 2 x distinct concepts + 0.5 x mentions (up to 20), as the notes."""
    hits: Dict[str, Dict[str, int]] = defaultdict(dict)
    if pats is PATTERNS:
        for bucket, (rx, names) in BUCKET_PATTERNS.items():
            for m in rx.finditer(text):
                term = names[m.lastindex - 1] if m.lastindex else None
                if term:
                    hits[bucket][term] = hits[bucket].get(term, 0) + 1
    else:                                  # a caller's own patterns (tests): one count per pattern
        for (bucket, term), pat in pats.items():
            n = len(pat.findall(text))
            if n:
                hits[bucket][term] = n
    scores: Dict[str, dict] = {}
    for bucket, terms in hits.items():
        distinct, total = len(terms), sum(terms.values())
        if distinct >= min_distinct or total >= min_total:
            scores[bucket] = {"distinct": distinct, "total": total, "score": round(distinct * 2 + min(total, 20) * 0.5, 2),
                              "terms": dict(sorted(terms.items(), key=lambda kv: -kv[1])[:8])}
    return dict(sorted(scores.items(), key=lambda kv: (-kv[1]["score"], kv[0])))


def themes_in(text: str, pats: Dict[Tuple[str, str], Pattern[str]] = PATTERNS) -> Dict[str, List[str]]:
    """A short text (a filing's headline): every bucket with at least one concept named, and the concepts. No threshold: a headline is short."""
    out: Dict[str, List[str]] = defaultdict(list)
    for (bucket, term), pat in pats.items():
        if pat.search(text):
            out[bucket].append(term)
    return dict(out)


# ------------------------------------------------------------------------------------------------ the directory's screening discipline: the stage
# "Distinguish operating businesses from plans, pilots, MoUs and unexecuted announcements." Checked in this order; the first that matches wins.
STAGES = ("operating", "execution", "planned", "mou_pilot")
STAGE_LABEL = {"operating": "Operating", "execution": "Under execution", "planned": "Planned", "mou_pilot": "MoU / pilot"}
_STAGE_RE = [
    ("mou_pilot", re.compile(r"\b(mou|memorandum of understanding|pilot|proof of concept|poc|letter of intent|loi|prototype|feasibility|exploring|"
                             r"evaluat(?:e|es|ing|ion)|in talks|non-binding)\b", re.I)),
    ("planned", re.compile(r"\b(plan(?:s|ned|ning)? to|proposed|propose|will (?:set up|be|add|commission|launch|start|build|enter|expand|develop|invest)|"
                           r"to be (?:set up|commissioned|completed|built)|expected to|intend(?:s|ed)? to|aims? to|upcoming|roadmap|pipeline|"
                           r"by (?:fy|cy)\s?'?\d{2}|envisag\w*|under (?:planning|consideration|evaluation))\b", re.I)),
    ("execution", re.compile(r"\b(under (?:construction|execution|implementation|development|installation)|being (?:set up|built|executed)|"
                             r"ramp(?:ing)?[- ]?up|trial (?:run|production)|order book|order backlog|backlog|executing|work in progress|"
                             r"partially commissioned|commissioning (?:is|of|underway)|in progress|ongoing|order inflows?|"
                             r"orders? (?:received|won|secured|bagged|worth)|(?:received|won|secured|bagged) (?:an? )?(?:orders?|contracts?))\b", re.I)),
    ("operating", re.compile(r"\b(commissioned|operational|in operation|installed capacity|existing capacity|current capacity|delivered|supplied|"
                             r"shipped|achieved|completed|revenue (?:of|from|grew|up|rose)|sales (?:of|grew|rose)|generated|manufactured|produced|"
                             r"commercial production|deployed|in production|we (?:make|manufacture|supply|operate|run))\b", re.I)),
]


def stage_of(sentence: str) -> Optional[str]:
    for name, rx in _STAGE_RE:
        if rx.search(sentence):
            return name
    return None


def most_advanced(stages: List[Optional[str]]) -> Optional[str]:
    got = [s for s in stages if s]
    return min(got, key=STAGES.index) if got else None


# ------------------------------------------------------------------------------------------------ tone (sentiment of the company's own words)
POSITIVE = re.compile(r"\b(grow(?:th|s|n)?|grew|record|highest|strong(?:er)?|improv(?:e|ed|ement|ing)|increas(?:e|ed|ing)|expan(?:d|ded|sion)|"
                      r"wins?|won|award(?:ed)?|robust|milestones?|commissioned|ahead|profitab(?:le|ility)|upgrad(?:e|ed)|healthy|gains?|"
                      r"surg(?:e|ed)|accelerat(?:e|ed|ing)|resilien(?:t|ce)|best[- ]in[- ]class|leadership|successful(?:ly)?)\b", re.I)
NEGATIVE = re.compile(r"\b(declin(?:e|ed|ing)|loss(?:es)?|lower|weak(?:er|ness)?|delay(?:s|ed)?|shortfall|impairment|default(?:s|ed)?|penalt(?:y|ies)|"
                      r"litigation|downgrad(?:e|ed)|slowdown|pressures?|headwinds?|challeng(?:e|es|ing)|decreas(?:e|ed|ing)|fell|drop(?:ped)?|"
                      r"deficit|adverse(?:ly)?|terminat(?:e|ed|ion)|cancel(?:led|lation)?|shutdown|disruptions?|fire|strike|volatil(?:e|ity)|"
                      r"uncertaint(?:y|ies)|subdued|muted)\b", re.I)


def tone(text: str) -> dict:
    """{score -1..1, label, positive, negative}: (positive - negative) / (positive + negative) over the finance words found."""
    pos, neg = len(POSITIVE.findall(text)), len(NEGATIVE.findall(text))
    if pos + neg < 3:
        return {"score": None, "label": "Too few words to tell", "positive": pos, "negative": neg}
    sc = round((pos - neg) / (pos + neg), 2)
    label = "Positive" if sc >= 0.4 else "Negative" if sc <= -0.1 else "Mixed"
    return {"score": sc, "label": label, "positive": pos, "negative": neg}


# ------------------------------------------------------------------------------------------------ evidence and the whole presentation
def sentences(text: str) -> List[str]:
    return [" ".join(s.split()) for s in re.split(r"(?<=[.!?])\s+|\n{2,}", text)]


def chart_like(s: str) -> bool:
    """A line of a chart or table read as text ("2.0 2.2 3.1 2.6 ... FY15 FY16 FY17"): more than a third of its words are numbers or year labels.
    Seen live on the first night; such a line is no sentence to quote."""
    words = s.split()
    nums = sum(1 for w in words if re.fullmatch(r"[\(\[]?[-+]?(?:rs\.?|₹|\$)?[\d.,%]+[\)\]]?|(?:fy|cy|q[1-4])\s?'?\d{2,4}[a-z]?", w, re.I))
    return len(words) >= 6 and nums / len(words) > 0.34


def evidence(text: str, terms: List[str], bucket: str, pats: Dict[Tuple[str, str], Pattern[str]] = PATTERNS, k: int = 2) -> List[str]:
    """Up to k sentences that mention one of the bucket's keywords AND hold a figure (capacity, order value, revenue ...), as the notes ask."""
    out: List[str] = []
    term_pats = [pats[(bucket, t)] for t in terms if (bucket, t) in pats]
    for s in sentences(text):
        if 20 <= len(s) and NUM_RE.search(s) and not chart_like(s) and any(p.search(s) for p in term_pats):
            out.append(s[:300])
            if len(out) == k:
                break
    return out


def theme_stage(text: str, terms: List[str], bucket: str, pats: Dict[Tuple[str, str], Pattern[str]] = PATTERNS) -> dict:
    """The stage the company's own sentences on this theme show: the most advanced one, and how many sentences showed each."""
    term_pats = [pats[(bucket, t)] for t in terms if (bucket, t) in pats]
    mix: Dict[str, int] = {}
    for s in sentences(text):
        if len(s) >= 20 and any(p.search(s) for p in term_pats):
            st = stage_of(s)
            if st:
                mix[st] = mix.get(st, 0) + 1
    top = most_advanced(list(mix))
    return {"stage": top, "label": STAGE_LABEL.get(top or "", "Not stated"), "mix": mix}


def classify(text: str) -> dict:
    """One presentation's text -> {status, primary, secondary, scores, evidence, stage, tone}, as the notes' run() decides it, plus the upgrade."""
    empty = {"primary": None, "secondary": [], "scores": {}, "evidence": [], "stage": None, "tone": tone(text)}
    if len(text) < 200:
        return {"status": "no_text_layer", **empty}
    scores = analyse(text)
    if not scores:
        return {"status": "no_bucket_match", **empty}
    buckets = list(scores)
    # "Corporate Catalysts & Growth Signals" (order book, JV, M&A, guidance) are events every deck names, not a line of business: seen live on the first
    # night (43 of 133 companies). A business theme that qualifies is the primary; the catalysts stay as a secondary theme.
    business = [b for b in buckets if b not in SIGNAL_BUCKETS]
    top = business[0] if business else buckets[0]
    secondary = [b for b in buckets if b != top and (scores[b]["score"] >= 0.5 * scores[top]["score"] or b in SIGNAL_BUCKETS)]
    for b in [top, *secondary]:
        scores[b]["stage"] = theme_stage(text, list(scores[b]["terms"]), b)
        scores[b]["verify"] = sorted({VERIFY[(b, t)] for t in scores[b]["terms"] if VERIFY.get((b, t))})[:3]
    ev = evidence(text, list(scores[top]["terms"]), top, k=3)
    return {"status": "ok" if ev else "keyword_only_no_figures", "primary": top, "secondary": secondary, "scores": scores, "evidence": ev,
            "stage": scores[top]["stage"], "tone": tone(text)}


# ------------------------------------------------------------------------------------------------ task #273: lenders and technology themes
# The team, 20 Nov 2026: about 49 of the 176 companies with AI & GenAI as main theme were lenders and brokers (CreditAccess Grameen, Cholamandalam,
# ICICI Bank ...): their decks name AI for their own operations, which is not an AI business. For a bank, a finance company, a broker or an insurer a
# technology theme is only a MENTION, unless the sentences that placed it show revenue, orders or a product sold in that theme.
FIN_INDUSTRIES = frozenset({"Banks", "Finance", "Capital Markets", "Insurance"})
TECH_THEMES = frozenset({"AI & GenAI", "Cloud & Data Centres", "Cybersecurity & Connectivity", "Semiconductor & Electronics", "Space & Drone Technology"})
BUSINESS = re.compile(r"\b(revenues?|income from|order(?:s| book| inflow| backlog)?\b(?! of (?:the|magnitude))|contracts?|licen[cs](?:e|es|ing)|subscriptions?|"
                      r"monetis\w*|monetiz\w*|sold to|sells? to|selling to|(?:products?|platforms?|solutions?|services?) (?:for|to|sold to) "
                      r"(?:clients|customers|enterprises|businesses|banks|insurers|other))\b", re.I)


_SHORT_FORMS = re.compile(r"(?-i:\bAI\b|\bGen ?AI\b|\bML\b|\bLLMs?\b)")
_CELLS = re.compile(r"\s*[|;•▪●■◆➢❑]\s*|(?<=[.!?])\s+(?=[A-Z])")
NEAR = 160      # characters: the business word and the theme's word in one stretch of the same sentence or slide


def _business_in_theme(text: str, bucket: str) -> bool:
    """A business word (revenue, orders, a product sold ...) close to a word of the theme itself (task #273 live check: a KPI slide's "Revenue Rs 865 Mn"
    elsewhere on the page kept 5paisa, Kotak Mahindra Bank and four more lenders on AI & GenAI)."""
    pat = BUCKET_PATTERNS.get(bucket, (None, []))[0]
    for seg in _CELLS.split(text):              # one sentence or one table cell: a KPI slide's cells are separate statements
        spots = [m.start() for m in BUSINESS.finditer(seg)]
        if not spots:
            continue
        hits = [m.start() for m in (*(pat.finditer(seg) if pat else ()), *(_SHORT_FORMS.finditer(seg) if bucket == "AI & GenAI" else ()))]
        if any(abs(a - b) <= NEAR for a in spots for b in hits):
            return True
    return False


def seat(primary: Optional[str], secondary: Sequence[str], scores: Dict[str, Any], evidence: Sequence[str], industry: Optional[str]
         ) -> Tuple[Optional[str], List[str], bool]:
    """(main theme, other themes, moved) for one company as every Discover read shows it (board, company panel, overview, FinLit AI). Unchanged except
    for a bank, finance company, broker or insurer whose main theme is a technology theme with no business sentence: that theme becomes a mention and
    the strongest non-technology theme it qualified for is the main one (None when there is none: the company is not placed, the mention stays)."""
    sec = [b for b in (secondary or []) if b != primary]
    if not primary or industry not in FIN_INDUSTRIES or primary not in TECH_THEMES:
        return primary, sec, False
    if any(_business_in_theme(str(s), primary) for s in (evidence or [])):
        return primary, sec, False
    ranked = sorted((b for b in (scores or {}) if b not in TECH_THEMES), key=lambda b: -float((scores.get(b) or {}).get("score") or 0))
    business = [b for b in ranked if b not in SIGNAL_BUCKETS]
    main = business[0] if business else (ranked[0] if ranked else None)
    others = [primary, *[b for b in sec if b != main]]
    return main, list(dict.fromkeys(others)), True
