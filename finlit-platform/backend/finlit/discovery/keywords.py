"""Discovery (task #221): the keyword buckets and the scoring of the founder's notes (Notes-18-11-2026.pdf, bucket_investor_presentations.py), from the
Investor Presentation Keyword Directory. Copied as written: the 22 buckets and their terms, word-bounded matching (short all-capital acronyms matched in
capitals only, to avoid noise), a bucket counts when 2 different keywords or 5 mentions appear, score = 2 x distinct + 0.5 x min(total, 20), the
primary bucket is the highest score and a secondary one scores at least half of it, and the evidence is up to 2 sentences that name a keyword AND hold
a figure. Plurals count ("solar cells", "EVs"). One fix: the notes set status "ok" from the evidence function itself (always true); here "ok" needs an evidence sentence.

The directory's own caution stays with every result: a keyword mention by itself is not proof of material business exposure."""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Dict, List, Pattern, Tuple

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


def compile_patterns() -> Dict[Tuple[str, str], Pattern[str]]:
    """Word-bounded patterns. Short all-capital acronyms (5 letters or fewer) are matched in capitals only, so 'cam' in 'campaign' or 'Ess' never count."""
    pats: Dict[Tuple[str, str], Pattern[str]] = {}
    for bucket, terms in BUCKETS.items():
        for term in terms:
            acronym = term.isupper() and len(term) <= 5
            # plural endings count (upgrade, 18 Nov 2026: decks say "solar cells", "EVs", "electrodes"; the notes' exact boundary missed every plural)
            pats[(bucket, term)] = re.compile(r"(?<![A-Za-z])" + re.escape(term) + r"(?:s|es)?(?![A-Za-z])", 0 if acronym else re.IGNORECASE)
    return pats


PATTERNS = compile_patterns()


def analyse(text: str, pats: Dict[Tuple[str, str], Pattern[str]] = PATTERNS, min_distinct: int = MIN_DISTINCT, min_total: int = MIN_TOTAL) -> Dict[str, dict]:
    """bucket -> {distinct, total, score, terms (the 8 most mentioned)}, highest score first; only buckets with breadth or repetition."""
    hits: Dict[str, Dict[str, int]] = defaultdict(dict)
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
    return dict(sorted(scores.items(), key=lambda kv: -kv[1]["score"]))


def evidence(text: str, terms: List[str], bucket: str, pats: Dict[Tuple[str, str], Pattern[str]] = PATTERNS, k: int = 2) -> List[str]:
    """Up to k sentences that mention one of the bucket's keywords AND hold a figure (capacity, order value, revenue ...), as the notes ask."""
    out: List[str] = []
    term_pats = [pats[(bucket, t)] for t in terms if (bucket, t) in pats]
    for s in re.split(r"(?<=[.!?])\s+|\n{2,}", text):
        s = " ".join(s.split())
        if 20 <= len(s) and NUM_RE.search(s) and any(p.search(s) for p in term_pats):
            out.append(s[:300])
            if len(out) == k:
                break
    return out


def classify(text: str) -> dict:
    """One presentation's text -> {status, primary, secondary, scores, evidence}, as the notes' run() decides it."""
    if len(text) < 200:
        return {"status": "no_text_layer", "primary": None, "secondary": [], "scores": {}, "evidence": []}
    scores = analyse(text)
    if not scores:
        return {"status": "no_bucket_match", "primary": None, "secondary": [], "scores": {}, "evidence": []}
    buckets = list(scores)
    top = buckets[0]
    secondary = [b for b in buckets[1:] if scores[b]["score"] >= 0.5 * scores[top]["score"]]
    ev = evidence(text, list(scores[top]["terms"]), top)
    return {"status": "ok" if ev else "keyword_only_no_figures", "primary": top, "secondary": secondary, "scores": scores, "evidence": ev}
