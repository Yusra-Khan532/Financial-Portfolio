"""Task #253 (19 Nov 2026): "train FINLIT AI according to type of question based on below website give in pdf: so if question is for broader economy
then it should be trained separately; if its related to financials refer to finlit company page and moneycontrol and for daily news look
moneycontrol.com; and so on; refer to websites given in pdf".

FinLit AI cannot be retrained by us, so "trained by type of question" is done the way the team's directory itself suggests (official sources first,
education for concepts, platforms and news as secondary): each question is read for its type, and the answer is routed to that type's sources.
  1. `classify` (a pure function): economy, financials, news, concept, valuation, regulation, funds, and a sector when one is named. English and the
     usual Hinglish. Several types can hold at once.
  2. `route` turns the types into (a) a short note placed with the question (never in the system prompt, so the cached prefix stays the same for
     every member) naming FinLit's own tools to use first and the sites to prefer on the web, and (b) for a question of one clear type, the web
     search limited to that type's sites (the provider's `allowed_domains`). A mixed or unclear question keeps the web search open.
The sites are the team's directory (knowledge.DIRECTORY); FinLit AI only searches and links them, and stores none of their content."""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Set

from .knowledge import SECTOR_SOURCES, site_name

# ------------------------------------------------------------------------------------------------ 1. what kind of question it is
_ECONOMY = re.compile(
    r"\b(gdp|economy|economic growth|arthvyavastha|inflation|mehngai|mahangai|cpi|wpi|iip|industrial production|repo|reverse repo|crr|slr"
    r"|monetary policy|mpc|rbi (?:policy|rate|rates|meeting)|interest rates?|rate (?:cut|hike)|fiscal deficit|current account|trade deficit|budget"
    r"|rupee|dollar rate|forex|foreign exchange reserves?|bond yields?|g-?secs?|10[- ]year yield|recession|unemployment|jobs data|pmi|fed\b"
    r"|federal reserve|global economy|world economy|us economy|china economy|tax collections?|gst collections?)\b", re.I)
_NEWS = re.compile(
    r"\b(today|todays|aaj|aaj ka|abhi|latest news|news|headlines?|what happened|kya hua|why (?:did|is|are|was) \S+(?: \S+)? (?:fall|falling|fell|drop|"
    r"dropping|crash|rise|rising|rose|jump|up|down)|(?:kyu|kyun|kyon) (?:gira|giri|gire|chadha|chadhi|badha|toota|tuta)|gira kyu|this week|yesterday"
    r"|kal ka|market (?:fall|crash|rally) today|announced|announcement)\b", re.I)
_CONCEPT = re.compile(
    r"\b(what is|what are|what's|what does \S+(?: \S+)? mean|meaning of|meaning|define|definition|explain|how does \S+(?: \S+)? work|how do \S+ work"
    r"|difference between|kya hai|kya hota|kya hote|kya hoti|matlab|samjhao|samjha do|kaise kaam)\b", re.I)
_FIN_TERMS = re.compile(
    r"\b(results?|quarter(?:ly)?|q[1-4]|profit|munafa|revenue|sales|turnover|margins?|ebitda|ebit|eps|roe|roce|roa|debt|borrowings?|balance sheet"
    r"|cash flow|net worth|book value|dividend|p/?e|pe ratio|p/?b|ev/ebitda|valuation|ratios?|financials|earnings|net income|operating income"
    r"|interest coverage|working capital|promoter holding|shareholding)\b", re.I)
_OWN = re.compile(r"\b(its|iska|iski|iske|this company|the company|their|this stock|is company)\b|'s\b|\b\w+ (?:ka|ki|ke) (?:profit|revenue|sales|results?|debt"
                  r"|margin|eps|roe|roce|valuation|share)", re.I)
_VALUATION = re.compile(
    r"\b(dcf|discounted cash flows?|cost of capital|wacc|cost of equity|equity risk premium|risk premium|terminal value|valuation methods?"
    r"|intrinsic value|fair value method|multiples?|ev/ebitda multiple|historical p/?e|pe history|market p/?e|nifty p/?e|sensex p/?e|shiller|cape ratio"
    r"|factor investing|value investing)\b", re.I)
_REGULATION = re.compile(
    r"\b(sebi|circulars?|regulations?|regulatory|rules?|norms|compliance|insider trading|listing (?:norms|rules|regulations)|lodr|takeover code"
    r"|f&o rules|margin rules|kyc|investor protection|rbi (?:guidelines|circular|norms|directions))\b", re.I)
_FUNDS = re.compile(
    r"\b(mutual funds?|\bmfs?\b|nav|sip|swp|stp|amfi|aum|elss|index funds?|etfs?|expense ratio|fund categor(?:y|ies)|debt funds?|equity funds?"
    r"|liquid funds?|hybrid funds?|small ?cap funds?|large ?cap funds?|flexi ?cap|nfo|fund house|amc)\b", re.I)
# A sector named in the question (the directory's sector sources). FinLit's own sector matcher (knowledge.sector_key) reads a company's sector label;
# a question needs stricter words ("it" is also a pronoun, "auto" begins "automatic").
_SECTORS: Dict[str, re.Pattern] = {
    "insurance": re.compile(r"\b(insurance|insurers?|irdai|life insurance|general insurance|health insurance)\b", re.I),
    "pharma": re.compile(r"\b(pharma|pharmaceuticals?|drugs?|usfda|us fda|fda|cdsco|hospitals?|healthcare)\b", re.I),
    "energy_power": re.compile(r"\b(power sector|electricity|power demand|renewables?|renewable energy|solar|wind power|energy sector|energy demand"
                               r"|oil demand|coal|thermal power|iea|cea)\b", re.I),
    "metals_chemicals": re.compile(r"\b(mining|minerals?|steel production|iron ore|copper|aluminium|aluminum|zinc|metals? sector|indian bureau of mines|usgs)\b", re.I),
    "real_estate": re.compile(r"\b(real estate|realty|housing (?:market|sales|prices)|rera|property prices|home sales|housing finance|nhb)\b", re.I),
    "auto": re.compile(r"\b(auto (?:sales|sector|industry|components?)|car sales|vehicle sales|two[- ]wheelers?|passenger vehicles?|ev sales|siam|acma)\b", re.I),
    "it": re.compile(r"\b(it sector|it services|it industry|it companies|software exports|tech hiring|nasscom)\b", re.I),
    "rural_agri": re.compile(r"\b(agri|agriculture|agricultural|rural|farm|farmers?|crops?|kharif|rabi|msp|nabard|monsoon)\b", re.I),
}

# Task #254 rework (19 Nov): a question about one company's state of affairs ("what is issue with pricol", "red flags of HDFC Bank", "how is TCS doing")
_ISSUE = re.compile(r"\b(issues?|problems?|red ?flags?|risks?|concerns?|worr(?:y|ies)|challenges?|headwinds?|trouble|weak(?:ness)?|wrong|negatives?|cons"
                    r"|how is \S+(?: \S+)? doing|what(?:'s| is) happening|kya (?:problem|dikkat|issue)|dikkat|pareshani|business model|outlook|prospects?"
                    r"|strengths?|positives?|pros|health)\b", re.I)

TYPES = ("company", "economy", "financials", "news", "concept", "valuation", "regulation", "funds")
# Task #254 rework (the owner, 19 Nov): the order a company question is answered from. The system prompt states it once; the note repeats it per question.
COMPANY_ORDER = ["the company's investor presentation", "its results (the results filing, with FinLit's results figures)",
                 "its earnings calls (the call transcript)", "news and the web pages of the team's directory (Moneycontrol first)",
                 "FinLit's company report (the company card, its sections, FinLit Prism)", "any other FinLit page"]
COMPANY_SITES = ["moneycontrol.com", "economictimes.indiatimes.com", "livemint.com", "business-standard.com", "screener.in", "trendlyne.com",
                 "tickertape.in", "nseindia.com", "bseindia.com"]


def classify(question: str, named_company: bool = False, on_company_page: bool = False) -> List[str]:
    """The kinds of question this is, in a fixed order, with "sector:<key>" for a sector named. Empty when none is clear.
    `named_company`: the question names a listed company (ask/companies.named_in found one). `on_company_page`: the member asks from a company's page.
    A finance term is a company's financials when a company is named, or the question points at "its" figures, or (on a company page) is not a
    request for a meaning; otherwise it is a concept ("what is ROCE?")."""
    q = question or ""
    got: Set[str] = set()
    meaning = bool(_CONCEPT.search(q))
    if _ECONOMY.search(q):
        got.add("economy")
    if _NEWS.search(q):
        got.add("news")
    if _VALUATION.search(q):
        got.add("valuation")
    if _REGULATION.search(q):
        got.add("regulation")
    if _FUNDS.search(q):
        got.add("funds")
    if _FIN_TERMS.search(q):
        # "its" points at a company's figures, except in a question about valuation methods or a market's multiple ("the Nifty P/E against its history")
        own = bool(_OWN.search(q)) and "valuation" not in got
        if named_company or own or (on_company_page and not meaning):
            got.add("financials")
        elif meaning:
            got.add("concept")
    # Task #254 rework: a question that names a company is about that company, whatever its first words ("what is issue with pricol" is not a
    # question for a meaning: it once kept the web search to the glossary sites). On a company's page, a question about its issues, risks, health
    # or business is about that company too.
    if named_company or (on_company_page and _ISSUE.search(q)) or ("financials" in got and (named_company or on_company_page)):
        got.add("company")
    if meaning and not got:
        got.add("concept")
    if named_company:
        got.discard("concept")
    # A question for a meaning inside a field ("what is the repo rate", "SIP kya hai", "what is DCF") belongs to that field: its sites explain it.
    if "concept" in got and got & {"economy", "valuation", "regulation", "funds"}:
        got.discard("concept")
    out = [t for t in TYPES if t in got]
    out += [f"sector:{k}" for k, rx in _SECTORS.items() if rx.search(q)]
    return out


# ------------------------------------------------------------------------------------------------ 2. where each kind is answered from
ROUTES: Dict[str, Dict[str, object]] = {
    "company": {"label": "a company",
                "finlit": ["read_company_document", "get_company_card", "get_company_section", "get_finlit_prism"],
                "sites": COMPANY_SITES},
    "economy": {"label": "the economy",
                "finlit": ["get_india_economy"],
                "sites": ["rbi.org.in", "data.rbi.org.in", "mospi.gov.in", "dea.gov.in", "imf.org", "data.worldbank.org", "fred.stlouisfed.org",
                          "oecd.org", "bis.org"]},
    "financials": {"label": "a company's financials",
                   "finlit": ["get_company_card", "get_company_section", "get_finlit_prism"],
                   "sites": ["moneycontrol.com", "screener.in", "tickertape.in", "trendlyne.com", "nseindia.com", "bseindia.com"]},
    "news": {"label": "daily news",
             "finlit": ["get_news_and_filings"],
             "sites": ["moneycontrol.com", "livemint.com", "economictimes.indiatimes.com", "business-standard.com", "reuters.com", "cnbc.com"]},
    "concept": {"label": "what a term means",
                "finlit": ["lookup_glossary", "get_finance_framework"],
                "sites": ["investopedia.com", "corporatefinanceinstitute.com", "cfainstitute.org", "khanacademy.org", "nism.ac.in", "investor.sebi.gov.in"]},
    "valuation": {"label": "valuation methods",
                  "finlit": ["get_finance_framework"],
                  "sites": ["pages.stern.nyu.edu", "morningstar.com", "multpl.com", "gurufocus.com", "papers.ssrn.com"]},
    "regulation": {"label": "rules and regulation",
                   "finlit": ["lookup_glossary"],
                   "sites": ["sebi.gov.in", "rbi.org.in", "nseindia.com", "bseindia.com"]},
    "funds": {"label": "mutual funds",
              "finlit": ["search_funds", "get_fund_details", "get_my_funds"],
              "sites": ["amfiindia.com", "sebi.gov.in", "morningstar.com", "nism.ac.in"]},
}
# A sector question also reads the sector's own measures; its sites are the directory's sector sources, then the business press.
SECTOR_FINLIT = ["get_finance_framework"]
SECTOR_PRESS = ["business-standard.com", "economictimes.indiatimes.com", "livemint.com"]
SECTOR_LABEL = {"insurance": "insurance", "pharma": "pharma and healthcare", "energy_power": "power and energy", "metals_chemicals": "metals and mining",
                "real_estate": "real estate and housing", "auto": "automobiles", "it": "IT services", "rural_agri": "rural and farm finance"}


def _sites_of(kind: str) -> List[str]:
    if kind.startswith("sector:"):
        return SECTOR_SOURCES.get(kind.split(":", 1)[1], []) + SECTOR_PRESS
    return list(ROUTES[kind]["sites"])  # type: ignore[arg-type]


def _tools_of(kind: str) -> List[str]:
    return list(SECTOR_FINLIT) if kind.startswith("sector:") else list(ROUTES[kind]["finlit"])  # type: ignore[arg-type]


def _label_of(kind: str) -> str:
    return SECTOR_LABEL.get(kind.split(":", 1)[1], "a sector") if kind.startswith("sector:") else str(ROUTES[kind]["label"])


def web_domains(kinds: List[str]) -> Optional[List[str]]:
    """The sites the web search keeps to: those of the one kind the question is; None (an open search) when it is several kinds or none.
    A company question with its financials or news is still one kind (the company): the company's sites."""
    core = [k for k in kinds if k not in ("financials", "news")] if "company" in kinds else list(kinds)
    if len(core) != 1:
        return None
    return _sites_of(core[0])


def note(kinds: List[str]) -> str:
    """The note placed with the question: for each kind, FinLit's own tools first, then the sites to prefer on the web. Empty when no kind is clear."""
    if not kinds:
        return ""
    parts = []
    for k in kinds:
        if "company" in kinds and k in ("financials", "news"):
            continue                                           # inside the company's order below
        sites = ", ".join(f"{site_name(d)} ({d})" for d in _sites_of(k))
        if k == "company":
            order = "; ".join(f"({i}) {s}" for i, s in enumerate(COMPANY_ORDER, 1))
            parts.append(f"a company: answer in this order of sources: {order}. The company's own documents already read are with the question; "
                         f"on the web prefer {sites}")
            continue
        tools = ", ".join(_tools_of(k))
        parts.append(f"{_label_of(k)}: FinLit first ({tools}); then on the web prefer {sites}")
    scope = " The web search keeps to these sites." if web_domains(kinds) else ""
    return ("[Sources for this question (the team's source directory). " + "; ".join(parts) + "." + scope
            + " Name the site and the date of every figure taken from the web.]")
