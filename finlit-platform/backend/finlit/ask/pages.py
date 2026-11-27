"""FinLit AI reads FinLit's own pages (task #218, 18 Nov 2026: "aligning FinLit AI with our pages like stock screener, Prism report, company report,
advanced stock screener, superinvestor, portfolio, Indian economy, FII/DII flows, results calendar, glossary, insights and blogs, news and filings; read
the investor presentation in the Documents section; also aligned with the web pages").

Each tool reads the same route the page reads, as the member (ask/gateway.py), so a plan sees here what it sees on the website. `page_links` turns the
tools an answer used into links to those pages, shown under the answer ("Read on FinLit"). The documents rule (`doc_type`) is the Documents page's own
(frontend lib/feed.ts docType), so the AI and the page agree on what an investor presentation is."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import OrderedDict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from ..discovery.keywords import BUCKETS as DISCOVERY_THEMES
from . import docstore
from .knowledge import TOPICS as FINANCE_TOPICS
from ..mcp.gateway import Gateway, ToolError
from ..mcp.schema import SYMBOL_SCHEMA, clean_symbol
from ..mcp.tools import Out, Tool

log = logging.getLogger("finlit.ask")

# ------------------------------------------------------------------------------------------------ Superinvestor portfolios (/superinvestors)
SOURCE_SI = "FinLit's Superinvestor portfolios page (finlitventures.com/superinvestors): named holders of 1% or more, from the companies' shareholding filings"


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def pick_investor(investors: List[Dict[str, Any]], name: str) -> Optional[Dict[str, Any]]:
    """The investor a question names: the key or name exactly, then every word of the question's name in the investor's name."""
    want = _slug(name)
    if not want:
        return None
    for i in investors:
        if want in (i.get("key"), _slug(i.get("name", ""))):
            return i
    words = [w for w in want.split("-") if len(w) > 1]
    hits = [i for i in investors if words and all(w in _slug(i.get("name", "")) for w in words)]
    return max(hits, key=lambda i: i.get("valueCr") or 0) if hits else None


async def get_superinvestors(gw: Gateway, a: Dict[str, Any]) -> Out:
    lst = await gw.json("/api/superinvestors", subject="Superinvestor portfolios")
    investors = (lst or {}).get("investors") or []
    if a.get("investor"):
        hit = pick_investor(investors, a["investor"])
        if hit is None:
            return Out({"investor": a["investor"], "found": False, "names": [i.get("name") for i in investors][:60]}, as_of=(lst or {}).get("asOf"),
                       source=SOURCE_SI, routes=["/api/superinvestors"],
                       notes=["No investor of that name holds 1% or more of a listed company in the filings FinLit holds; the names listed are the ones it does."])
        # task #289: a filed name grouped into a tracked investor (Bengal Finance -> Ashish Kacholia) reads the tracked investor's page
        key, name = ((hit.get("tracked") or {}).get("key") or hit["key"]), ((hit.get("tracked") or {}).get("name") or hit.get("name"))
        one = await gw.json(f"/api/superinvestors/{key}", subject=f"The portfolio of {name}")
        return Out({"investor": name, "key": key, "portfolio": one}, as_of=(lst or {}).get("asOf"), source=SOURCE_SI,
                   routes=[f"/api/superinvestors/{key}"])
    rows = [{k: i.get(k) for k in ("key", "name", "kind", "companies", "valueCr", "top", "changes")} for i in investors]
    rows.sort(key=lambda r: r.get("valueCr") or 0, reverse=True)
    return Out({"count": (lst or {}).get("count"), "investors": rows[: a.get("limit", 30)], "covered": (lst or {}).get("covered"), "emptyWhy": (lst or {}).get("emptyWhy")},
               as_of=(lst or {}).get("asOf"), source=SOURCE_SI, routes=["/api/superinvestors"],
               notes=["Largest first, by the value of the holdings FinLit holds for each. valueCr is in Rs crore."])


# ------------------------------------------------------------------------------------------------ India economy (/macro)
SOURCE_MACRO = "FinLit's India economy page (finlitventures.com/macro): MoSPI, RBI and the other official publishers named with each figure"


_CAL_Q = re.compile(r"^(\d{4}) Q([1-4])$")


def target_watch_for_ai(w: Any) -> Any:
    """Task #349 fix I: the page's quarterly CPI averages are CALENDAR quarters ("2026 Q3" is Jul-Sep 2026, Q2 of FY27), each complete (all three
    months). FinLit AI read "2026 Q3" as "Q3 FY27" (Oct-Dec 2026, not over yet). Here each quarter is named by its months and its financial-year
    quarter, and the ambiguous label is left out, so the model cannot mislabel a quarter or call an unfinished one complete."""
    from ..macro import fy_quarter, quarter_months
    if not isinstance(w, dict):
        return w

    def name(label: Any) -> Optional[Dict[str, str]]:
        m = _CAL_Q.match(str(label or ""))
        return {"months": quarter_months(int(m[1]), int(m[2])), "financialYearQuarter": fy_quarter(int(m[1]), int(m[2]))} if m else None
    out = {k: v for k, v in w.items() if k not in ("quarters", "lastQuarter", "lastQuarterMonths", "lastQuarterFy")}
    qs = []
    for q in w.get("quarters") or []:
        if isinstance(q, dict):
            n = name(q.get("q"))
            qs.append({**(n or {"quarter": q.get("q")}), "averageCpi": q.get("avg"), "complete": True})
    out["quarters"] = qs
    last = name(w.get("lastQuarter"))
    if last:
        out["latestCompleteQuarter"] = last
    out["note"] = ("Quarterly averages of monthly CPI over complete calendar quarters only (all three months published). Name each quarter by its "
                   "months and its financial-year quarter as given; a quarter not listed is not complete.")
    return out


def macro_digest(m: Dict[str, Any]) -> Dict[str, Any]:
    """The page's own headline cards, insights, policy rates, reserves and inflation by spending group, each with its date; not the long histories."""
    divs = []
    for d in m.get("cpiDivisions") or []:
        pts = d.get("points") or []
        if pts:
            divs.append({"group": d.get("label"), "latest": pts[-1][1], "month": pts[-1][0], "yearBefore": pts[-13][1] if len(pts) >= 13 else None})
    res = (m.get("reserves") or {})
    cards = [{k: v for k, v in c.items() if k != "spark"} for c in m.get("cards") or []]     # the cards' small charts are long histories; the reading is enough
    return {"updatedAt": m.get("updatedAt"), "headline": cards, "insights": m.get("insights"), "inflationTarget": target_watch_for_ai(m.get("targetWatch")),
            "policyAndFx": m.get("rates"), "recentRateDecisions": (m.get("decisions") or [])[-4:], "brentCrude": m.get("brent"),
            "reserves": {k: res.get(k) for k in ("reserves", "m3_yoy", "asOf", "week", "link") if k in res},
            "cpiBySpendingGroup": divs, "dataIssues": m.get("issues"), "sources": m.get("sources")}


async def get_india_economy(gw: Gateway, a: Dict[str, Any]) -> Out:
    m = await gw.json("/api/macro", subject="The India economy page")
    return Out(macro_digest(m or {}), as_of=(m or {}).get("updatedAt"), source=SOURCE_MACRO, routes=["/api/macro"],
               notes=["Each figure carries its own period and publisher; give them with the figure. Reserves are in Rs crore (inr) and US$ million (usd)."])


# ------------------------------------------------------------------------------------------------ Glossary (/glossary)
GLOSSARY_FILE = Path(__file__).resolve().parents[1] / "normalize" / "glossary_data.json"
SOURCE_GLOSSARY = "FinLit's Glossary page (finlitventures.com/glossary)"
_glossary: Optional[List[Dict[str, Any]]] = None


def glossary_terms() -> List[Dict[str, Any]]:
    global _glossary
    if _glossary is None:
        _glossary = json.loads(GLOSSARY_FILE.read_text(encoding="utf-8")).get("terms") or []
    return _glossary


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def find_terms(terms: Iterable[Dict[str, Any]], q: str, n: int = 3) -> List[Dict[str, Any]]:
    """The page's search, simplified: the name or an alias exactly, then names that start with it, then terms whose text holds every word."""
    nq, words = _norm(q), [w for w in re.findall(r"[a-z0-9]+", (q or "").lower()) if len(w) > 1]
    scored: List[Tuple[int, Dict[str, Any]]] = []
    for t in terms:
        names = [_norm(x) for x in [t.get("term", ""), *(t.get("aliases") or [])]]
        text = " ".join(str(t.get(k, "")) for k in ("term", "meaning", "why", "how", "finlit")).lower()
        s = 100 if nq in names else 80 if any(x.startswith(nq) for x in names if nq) else 40 if words and all(w in text for w in words) else 0
        if s:
            scored.append((s, t))
    scored.sort(key=lambda x: -x[0])
    return [t for _, t in scored[:n]]


async def lookup_glossary(gw: Gateway, a: Dict[str, Any]) -> Out:
    hits = find_terms(glossary_terms(), a["term"])
    keep = ("term", "topic", "meaning", "why", "how", "formula", "finlit", "id")
    return Out({"query": a["term"], "terms": [{k: t.get(k) for k in keep if t.get(k)} for t in hits]}, source=SOURCE_GLOSSARY, routes=["/glossary"],
               notes=[] if hits else ["The Glossary has no term of that name; explain it in plain words without FinLit's wording."])


# ------------------------------------------------------------------------------------------------ Insights & blog (/blog)
SOURCE_BLOG = "FinLit's Insights & blog page (finlitventures.com/blog)"


def _plain(html: str, n: int) -> str:
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()
    return t if len(t) <= n else t[:n] + "…"


async def get_insights_and_blogs(gw: Gateway, a: Dict[str, Any]) -> Out:
    posts = await gw.json("/api/content", subject="The Insights & blog page")
    posts = posts if isinstance(posts, list) else []
    if not posts:
        return Out({"posts": []}, source=SOURCE_BLOG, routes=["/api/content"], notes=["No posts are published on the Insights & blog page yet."])
    q = [w for w in re.findall(r"[a-z0-9]+", (a.get("query") or "").lower()) if len(w) > 2]
    def hit(p: Dict[str, Any]) -> bool:
        text = f"{p.get('title', '')} {p.get('excerpt', '')} {p.get('category', '')}".lower()
        return not q or any(w in text for w in q)
    rows = [p for p in posts if hit(p)][:6]
    out = [{"title": p.get("title"), "slug": p.get("slug"), "category": p.get("category"), "published": p.get("publishedAt") or p.get("createdAt"),
            "excerpt": _plain(p.get("excerpt") or "", 300)} for p in rows]
    if rows and a.get("query"):                      # the best match in full (up to about 6,000 characters), so the answer can quote what it says
        try:
            full = await gw.json(f"/api/content/{rows[0].get('slug')}", subject="The post")
            out[0]["text"] = _plain((full or {}).get("articleHtml") or (full or {}).get("articleBody") or "", 6000)
        except ToolError:
            pass
    return Out({"posts": out, "total": len(posts)}, source=SOURCE_BLOG, routes=["/api/content"],
               notes=[] if rows else [f"No post matches; {len(posts)} posts are published."])


# ------------------------------------------------------------------------------------------------ News & filings, results filings, Documents (/news, /documents)
SOURCE_FEED = "FinLit's News & filings and Documents pages (finlitventures.com/news, /documents): the exchange announcements FinLit stores, each with its link"


def doc_type(category: Optional[str], title: str) -> str:
    """What the Documents page calls a filing (frontend lib/feed.ts docType, the same rule). A call transcript is checked before a presentation, and
    only a filing that is a presentation is one: NSE files meeting notices as "Analysts/Institutional Investor Meet/Con. Call Updates"."""
    s = f"{category or ''} {title or ''}".lower()
    if re.search(r"annual report|integrated report", s):
        return "Annual report"
    if re.search(r"transcript|concall|earnings call", s):
        return "Call transcript"
    if re.search(r"presentation", s):
        return "Investor presentation"
    if re.search(r"prospectus|offer document|\brhp\b|\bdrhp\b", s):
        return "Offer document"
    if re.search(r"result", s):
        return "Results filing"
    return "Other filing"


def _feed_row(i: Dict[str, Any]) -> Dict[str, Any]:
    return {"date": i.get("date"), "symbol": i.get("symbol"), "company": i.get("company"), "category": i.get("category"), "title": i.get("title"),
            "type": doc_type(i.get("category"), i.get("title", "")) if i.get("kind") == "document" else None, "link": i.get("link"), "summary": i.get("summary")}


async def get_news_and_filings(gw: Gateway, a: Dict[str, Any]) -> Out:
    kind = {"news": "news", "results": "result", "documents": "document"}[a["kind"]]
    params: Dict[str, Any] = {"kind": kind, "limit": 60 if a.get("type") else a["limit"]}
    if a.get("symbol"):
        params["symbol"] = clean_symbol(a["symbol"])
    if a.get("query"):
        params["q"] = a["query"][:80]
    data = await gw.json("/api/feed", params, subject="News & filings")
    rows = [_feed_row(i) for i in (data or {}).get("items") or []]
    if a.get("type"):
        rows = [r for r in rows if r["type"] == a["type"]]
    rows = rows[: a["limit"]]
    return Out({"kind": a["kind"], "items": rows}, source=SOURCE_FEED, routes=["/api/feed"],
               notes=[] if rows else ["FinLit holds no such filing yet: filings appear as companies are loaded."])


# ------------------------------------------------------------------------------------------------ the text of a document (Documents > Investor presentation ...)
DOC_KINDS = {"investor_presentation": "Investor presentation", "annual_report": "Annual report", "call_transcript": "Call transcript",
             "results_filing": "Results filing"}      # task #254: the quarterly results the company filed (News & filings > Results)


def is_results_filing(r: Dict[str, Any]) -> bool:
    """Task #254: a results filing is the board-meeting outcome or financial results the company filed (with its PDF), not the notice of the meeting,
    a call or its recording, or a press release: the rule docstore.KIND_RULES["Results filing"] applies in the database."""
    s = f"{r.get('category') or ''} {r.get('title') or ''}".lower()
    if not str(r.get("link") or "").startswith("https://"):
        return False
    if re.search(r"board meeting for results|intimation|con\.? ?call|analyst|recording|transcript|press release|newspaper", s):
        return False
    return bool(re.search(r"financial results|outcome of board meeting|results for the (quarter|period|year)", s))


# ------------------------------------------------------------------------------------------------ the period a question asks about (task #254)
_MONTH_Q = {"june": 6, "jun": 6, "september": 9, "sept": 9, "sep": 9, "december": 12, "dec": 12, "march": 3, "mar": 3}
_QEND = {1: (6, 30), 2: (9, 30), 3: (12, 31), 4: (3, 31)}
QUARTER_FILE_DAYS = 75        # results, calls and decks of a quarter are filed within about two months of its end (60 days for the year's last)
ANNUAL_FILE_DAYS = 270        # an annual report follows the year's end by a few months (the AGM is due within six)


def period_window(text: str, kind: str, today: Optional[date] = None) -> Optional[Tuple[date, date, str]]:
    """The filing dates a document of the period the question names would carry, with the period in words: "Q2 FY27", "the September quarter
    (2026)", "quarter ended 30 September 2026", "FY26", "2025-26". None when the question names no period ("latest", "last quarter")."""
    q, today = (text or "").lower(), today or date.today()

    def quarter(end: date, label: str) -> Tuple[date, date, str]:
        return end + timedelta(days=1), end + timedelta(days=QUARTER_FILE_DAYS), label

    def last_end(month: int, day: int) -> date:          # the latest quarter end on or before today with that month
        y = today.year if (month, day) <= (today.month, today.day) else today.year - 1
        return date(y, month, day)

    m = re.search(r"\bq([1-4])\s*[- ]?\s*(?:fy\s*'?(\d{2}|\d{4}))?", q)
    if m:
        n = int(m.group(1))
        if m.group(2):
            fy = int(m.group(2)) % 100 + 2000
            mo, d = _QEND[n]
            end = date(fy if n == 4 else fy - 1, mo, d)
            return quarter(end, f"Q{n} FY{fy % 100:02d}")
        mo, d = _QEND[n]
        end = last_end(mo, d)
        fy = end.year + (1 if mo != 3 else 0)
        return quarter(end, f"Q{n} FY{fy % 100:02d}")
    m = re.search(r"\b(june|jun|september|sept|sep|december|dec|march|mar)\s+(?:quarter|qtr)(?:\s+(?:of\s+)?(20\d\d))?", q) \
        or re.search(r"\bquarter (?:ended|ending)\s+(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(june|jun|september|sept|sep|december|dec|march|mar)\w*,?\s*(?:\d{1,2},?\s*)?(20\d\d)?", q)
    if m:
        mo = _MONTH_Q[m.group(1)]
        d = 30 if mo in (6, 9) else 31
        end = date(int(m.group(2)), mo, d) if m.group(2) else last_end(mo, d)
        return quarter(end, f"the quarter ended {end.day} {end.strftime('%B')} {end.year}")
    # A year alone: the annual report of that year; for results and calls, the year's last quarter (filed with the year's figures). In a
    # presentation question a year is the year of a plan or a target ("capex for FY27", "FY30 aspiration"), never the filing's, so it is not a period.
    m = re.search(r"\bfy\s*'?(\d{2}|\d{4})\b", q) or re.search(r"\b(20\d\d)\s*[-–/]\s*(\d{2})\b", q)
    if m and kind != "Investor presentation":
        fy = (int(m.group(2)) + 2000) if m.lastindex == 2 else int(m.group(1)) % 100 + 2000
        end = date(fy, 3, 31)
        if kind == "Annual report":
            return end + timedelta(days=1), end + timedelta(days=ANNUAL_FILE_DAYS), f"FY{fy % 100:02d}"
        return quarter(end, f"Q4 FY{fy % 100:02d} (the year's last quarter)")
    return None


def in_window(doc: Dict[str, Any], w: Tuple[date, date, str]) -> bool:
    try:
        d = date.fromisoformat(str(doc.get("date") or "")[:10])
    except ValueError:
        return False
    return w[0] <= d <= w[1]
DOC_TIMEOUT = 30.0          # seconds to download and read one PDF
MAX_PAGES_READ = 120
_texts: "OrderedDict[str, List[str]]" = OrderedDict()     # link -> page texts; the newest 24 documents stay in memory
_text_lock = asyncio.Lock()


_STOP = {"what", "does", "with", "from", "about", "this", "that", "latest", "investor", "presentation", "presentations", "annual", "report",
         "transcript", "company", "companies", "their", "there", "which", "says", "tell", "said", "deck", "concall", "call", "earnings", "management",
         "kya", "hai", "batao", "bata", "mein", "main", "ki", "ka", "ke", "aur", "the", "and", "for", "its", "has", "have", "how", "much", "many", "ppt",
         "document", "documents", "please", "give", "show", "share", "shares", "stock", "new", "their", "they", "them", "into", "over", "will"}
# Words that mean the same thing in a company's documents (task #255): a question about "EV" finds the page that says "electric vehicles". Each group's
# words are searched for together; a phrase counts as one word.
SYNONYMS: List[Tuple[str, ...]] = [
    ("ev", "evs", "electric vehicle", "electric vehicles", "electric mobility", "e-mobility", "two-wheeler electric"),
    ("capex", "capital expenditure", "capital investment", "investment", "investments", "capacity expansion"),
    ("order book", "orderbook", "order inflow", "order inflows", "orders", "order", "order pipeline"),
    ("guidance", "outlook", "target", "targets", "expect", "expected", "aspiration"),
    ("margin", "margins", "ebitda", "operating margin", "ebitda margin"),
    ("revenue", "revenues", "sales", "turnover", "income from operations", "topline"),
    ("debt", "borrowing", "borrowings", "net debt", "leverage", "loans"),
    ("capacity", "capacities", "plant", "plants", "mw", "gw", "mtpa", "tpa", "facility", "facilities", "commissioning", "commissioned"),
    ("profit", "profits", "pat", "net profit", "earnings"),
    ("segment", "segments", "division", "business", "businesses", "vertical"),
    ("export", "exports", "international", "overseas", "global"),
    ("dividend", "dividends", "payout"),
    ("acquisition", "acquisitions", "merger", "m&a", "demerger"),
    ("ai", "artificial intelligence", "genai", "generative ai"),
    ("solar", "renewable", "renewables", "green energy", "new energy"),
    # Task #254 rework (19 Nov): a bank's, an NBFC's and an insurer's own measures, as their results and decks write them
    ("gnpa", "gross npa", "gross non-performing", "nnpa", "net npa", "net non-performing", "asset quality", "slippage", "slippages", "npa", "npas",
     "provision coverage", "pcr", "credit cost", "credit costs", "stage 3", "gs3", "ns3"),
    ("nim", "net interest margin", "net interest income", "nii", "core nim", "spread", "spreads", "cost of funds"),
    ("casa", "current account", "savings account", "deposits", "deposit", "retail deposits"),
    ("crar", "capital adequacy", "car", "cet1", "cet-1", "tier 1", "tier i", "tier-1", "solvency", "solvency ratio"),
    ("advances", "loan book", "loans", "credit growth", "aum", "disbursement", "disbursements", "loan growth"),
    ("cost to income", "cost-to-income", "cost income", "opex", "operating expenses"),
    ("roa", "return on assets", "roe", "return on equity"),
    # "red flags", "issues": the words a company's documents use for what went wrong or what to watch
    ("red flag", "red flags", "risk", "risks", "concern", "concerns", "issue", "issues", "problem", "problems", "challenge", "challenges",
     "headwind", "headwinds", "pressure", "decline", "declined", "slowdown", "stress", "weak", "weakness", "lower", "impact", "impacted"),
]
# Task #254 rework: the measures a bank-like company is read for, added to the question when the company is a bank, an NBFC or an insurer
BANK_TERMS = "GNPA NNPA NIM CASA CRAR credit cost advances deposits"
# Each core measure of a bank, an NBFC or an insurer, as their results and decks write it. A bank-lens read takes the best page for every measure that
# appears (task #254 rework: HDFC Bank's NIM sat on page 19 of 24 and was left out), each page cut to the lines that carry the measures.
BANK_MEASURES: Dict[str, Tuple[str, ...]] = {
    "GNPA/NNPA": ("gnpa", "nnpa", "gross npa", "net npa", "gross non-performing", "net non-performing", "gross non performing", "net non performing",
                  "gross stage 3", "net stage 3", "gs3", "ns3"),
    "NIM": ("net interest margin", "core nim", "nim"),
    "CASA": ("casa",),
    "CRAR/CAR": ("crar", "capital adequacy", "capital to risk", "cet1", "cet-1", "common equity tier", "tier 1", "tier i capital", "solvency ratio"),
    "credit cost/provisions": ("credit cost", "provisions and contingencies", "provisions (other than tax)", "loan loss provision", "provisions"),
    "PCR": ("provision coverage", "pcr"),
    "cost-to-income": ("cost to income", "cost-to-income", "cost income ratio"),
    "ROA": ("return on assets", "return on average assets", "roa"),
    "advances growth": ("gross advances", "loans and advances", "advances", "loan book", "aum"),
    "deposits growth": ("total deposits", "deposits"),
}


def bank_lens(question: str) -> bool:
    """True when the read is for a bank, an NBFC or an insurer (the pre-fetch adds BANK_TERMS to the question for one)."""
    return BANK_TERMS.lower() in (question or "").lower()


def _measure_hits(page: str, words: Tuple[str, ...]) -> int:
    p = page.lower()
    return sum(len(re.findall(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])", p)) for w in words)


def _measure_lines(page: str, words: Tuple[str, ...], keep: int = 1) -> str:
    """The lines of a page that name any of the words, with `keep` lines around each (a table's figures sit beside or under the name)."""
    lines = [ln for ln in page.splitlines() if ln.strip()]
    rx = re.compile(r"(?<![a-z0-9])(" + "|".join(re.escape(w) for w in words) + r")(?![a-z0-9])", re.I)
    hit = {i for i, ln in enumerate(lines) if rx.search(ln)}
    take = sorted({j for i in hit for j in range(max(0, i - keep), min(len(lines), i + keep + 1))})
    out, last = [], -2
    for j in take:
        if j != last + 1 and out:
            out.append("…")
        ln = re.sub(r"[ \t]+", " ", lines[j]).strip()
        if j in hit and len(ln) > 400:                           # a long run-on line: keep the stretch around the measure's name
            m = rx.search(ln)
            ln = "…" + ln[max(0, m.start() - 150): m.end() + 250] + "…"
        elif j not in hit:
            ln = ln[:200]                                        # a line beside a measure is context only: its start is enough
        out.append(ln)
        last = j
    return "\n".join(out)


def bank_pages(pages: List[str], chars: int) -> Tuple[List[Tuple[int, str]], Dict[str, int]]:
    """For a bank-lens read: the best page for each core measure that appears (pages shared by measures are taken once), each cut to the lines
    that carry its measures, in page order, within `chars`; then the measures each page covers. Returns ([(page number, text)], {measure: page})."""
    best: Dict[str, int] = {}
    for m, words in BANK_MEASURES.items():
        scored = [(_measure_hits(p, words), i) for i, p in enumerate(pages)]
        top = max(scored, default=(0, -1))
        if top[0] > 0:
            best[m] = top[1]
    by_page: Dict[int, List[str]] = {}
    for m, i in best.items():
        by_page.setdefault(i, []).append(m)
    out, used = [], 0
    # the pages that carry the most measures first, so the figures most asked for are kept when room runs out; then put back in page order
    for i in sorted(by_page, key=lambda i: (-len(by_page[i]), i)):
        words = tuple(w for m in by_page[i] for w in BANK_MEASURES[m])
        t = _measure_lines(pages[i], words)
        if not t:
            continue
        t = t[: max(0, chars - used)]
        if not t:
            break
        out.append((i + 1, t))
        used += len(t)
    out.sort()
    kept = {n for n, _ in out}
    return out, {m: i + 1 for m, i in best.items() if i + 1 in kept}
SUMMARY_WORDS = ("highlights", "highlight", "key", "summary", "at a glance", "performance", "overview", "snapshot")
GENERAL = re.compile(r"\b(what (does|did) (the |its |their )?(investor )?(presentation|deck|ppt|document|annual report|transcript|concall)\s*(say|says|tell|show)?"
                     r"|summari[sz]e|summary|overview|highlights|key points|main points|kya (bola|kaha|likha))\b", re.I)


def _doc_stem(w: str) -> str:
    """A light English stem: plural and verb endings dropped ('orders' -> 'order', 'expanding' -> 'expand'), so a word matches its forms."""
    for suf in ("ies", "ing", "ed", "es", "s"):
        if len(w) > len(suf) + 3 and w.endswith(suf):
            return w[: -len(suf)] + ("y" if suf == "ies" else "")
    return w


def _terms(question: str) -> List[Tuple[str, ...]]:
    """The question's search terms: each meaningful word (with its stem), plus every synonym group it belongs to, plus numbers and years as written."""
    q = (question or "").lower()
    out: List[Tuple[str, ...]] = []
    for grp in SYNONYMS:
        if any(re.search(rf"(?<![a-z0-9]){re.escape(g)}(?![a-z0-9])", q) for g in grp):
            out.append(grp)
    seen = {g for grp in out for g in grp}
    for w in re.findall(r"[a-z0-9&]+", q):
        if w in seen or w in _STOP:
            continue
        if re.fullmatch(r"(fy)?\d{2,4}", w) or len(w) >= 3:
            out.append((w, _doc_stem(w)) if _doc_stem(w) != w else (w,))
            seen.add(w)
    return out


def _score(page: str, terms: List[Tuple[str, ...]]) -> int:
    p = page.lower()
    total = 0
    for grp in terms:
        hits = sum(len(re.findall(rf"(?<![a-z0-9]){re.escape(g)}", p)) for g in grp)
        total += min(hits, 12) + (3 if hits else 0)          # a page that names each thing asked about beats one that repeats a single word
    return total


# Task #254: an annual report's sections that answer most questions (management's discussion, the board's report, risks, segments, the notes), and
# the words that mark a person from the company's management in a call transcript's list of participants.
ANNUAL_SECTIONS = ("management discussion", "management's discussion", "md&a", "directors' report", "directors report", "board's report",
                   "boards' report", "risks and concerns", "risk management", "risk factors", "segment information", "segment-wise", "segment results",
                   "notes to the", "chairman's message", "chairman's letter", "message from the chairman", "key highlights", "at a glance")
_MGMT_TITLE = (r"(chief(?: [a-z &]{2,30}officer| [a-z &]{2,30})?|cfo|ceo|coo|cto|managing director|joint managing director|executive director"
               r"|whole[- ]?time director|chairman|chairperson|president|director|head[ -][a-z ]{3,30}|company secretary|investor relations)")
_SPEAKER = re.compile(r"^\s*([A-Z][A-Za-z.' ]{1,40}?)\s*:\s+\S", re.M)
# Letterhead and cover-letter labels that look like a speaker's name ("Subject: ...", "Scrip code: ...") but are not.
_NOT_SPEAKERS = {"reg off", "regd off", "regd. off", "registered office", "scrip symbol", "scrip code", "subject", "sub", "encls", "encl", "website",
                 "email", "e-mail", "cin", "reg", "ref", "to", "date", "place", "tel", "fax", "phone", "note", "notes", "source", "page", "disclaimer",
                 "q", "a", "dear sir", "dear sirs", "dear madam", "kind attn", "attn", "isin", "symbol", "series", "time", "venue", "duration"}


def _nm(s: str) -> str:
    """A name for matching: letters only, so "K.N. RADHAKRISHNAN" and "K. N. Radhakrishnan" are one person."""
    return re.sub(r"[^a-z]", "", s.lower())


def management_of(pages: List[str]) -> Dict[str, str]:
    """A call transcript's management, {name: title}, from its first pages: the list of participants ("MANAGEMENT: MR. K.N. RADHAKRISHNAN - DIRECTOR
    AND CHIEF EXECUTIVE OFFICER", "Name - Chief Financial Officer"); the moderator and the analysts are left out."""
    out: Dict[str, str] = {}
    for pg in pages[:3]:
        lines = pg.splitlines()
        for k, line in enumerate(lines):
            head = re.match(r"\s*(management|moderator|participants?|analysts?)\s*:\s*", line, re.I)
            if head and head.group(1).lower() != "management":
                continue
            rest = line[head.end():] if head else line
            m = re.match(rf"\s*(?:mr\.?|ms\.?|mrs\.?|dr\.?)?\s*([A-Z][A-Za-z.' ]{{1,40}}?)\s*[-–—:,|]\s*{_MGMT_TITLE}\b", rest, re.I)
            if m and m.group(1).strip().lower() not in ("moderator", "management", "participants"):
                title = re.sub(r"\s+", " ", rest[m.start(2):]).strip(" ,;|-–—")
                nxt = lines[k + 1].strip() if k + 1 < len(lines) else ""
                if not re.search(r"officer\b", title, re.I) and re.fullmatch(r"(?i)[a-z &]{0,30}officer\b[a-z &]{0,20}", nxt):
                    title = f"{title} {nxt}"                     # a title that runs onto the next line ("CHIEF FINANCIAL / OFFICER")
                out[m.group(1).strip()] = title[:60].strip(" ,;|-–—")
    return out


def _title_of(who: str, mgmt: Dict[str, str]) -> Optional[str]:
    w = _nm(who)
    return next((t for n, t in mgmt.items() if w and (_nm(n) in w or w in _nm(n))), None) if len(w) >= 4 else None


def speakers_on(page: str, mgmt: Dict[str, str]) -> List[str]:
    """The speakers whose turns a transcript page shows, as it names them, with their title when they are management ("Vikas Goel (Chief Financial
    Officer, management)"); an analyst or the moderator is named as the page names them, and letterhead labels are left out."""
    out: List[str] = []
    for m in _SPEAKER.finditer(page):
        who = m.group(1).strip()
        if who.lower().rstrip(".") in _NOT_SPEAKERS or len(who) < 3:
            continue
        title = _title_of(who, mgmt)
        label = f"{who} ({title}, management)" if title else ("Management" if who.lower() == "management" else who)
        if label not in out:
            out.append(label)
    return out


def _kind_bonus(page: str, kind: Optional[str], mgmt: Dict[str, str]) -> int:
    p = page.lower()
    if kind == "Call transcript":         # management's own answers come before the analysts' questions and the moderator
        return 4 if any(_title_of(m.group(1), mgmt) or m.group(1).strip().lower() == "management" for m in _SPEAKER.finditer(page)) else 0
    if kind == "Annual report":
        return 3 if any(w in p for w in ANNUAL_SECTIONS) else 0
    return 0


def best_pages(pages: List[str], question: str, n: int = 6, chars: int = 9000, kind: Optional[str] = None) -> List[Tuple[int, str]]:
    """The pages that answer the question (task #255: by meaning, not exact words: stems, a small finance synonym list, numbers and years), with the
    first page (which names the deck), in page order, within `chars`. A general question ("what does the presentation say") takes the highlights,
    summary and performance pages first. Task #254: in a call transcript the pages where management answers come first; in an annual report its
    main sections (management's discussion, the board's report, risks, segments, the notes)."""
    terms = _terms(question)
    general = bool(GENERAL.search(question or "")) or not terms
    order = list(range(len(pages)))
    mgmt = management_of(pages) if kind == "Call transcript" else {}
    if kind in ("Call transcript", "Annual report"):
        def scored(i: int) -> int:
            s = _score(pages[i], terms) if terms else 0
            return s + _kind_bonus(pages[i], kind, mgmt) if (s or general) else 0
        ranked = sorted((i for i in order if scored(i)), key=lambda i: (-scored(i), i)) or order
        return _cut(pages, ranked, n, chars)
    if general:
        summ = [i for i in order if any(w in pages[i].lower() for w in SUMMARY_WORDS)]
        rest = [i for i in order if i not in summ]
        ranked = summ + rest
        if terms:                                    # "what does it say about EV": the asked-about pages first, then the summaries
            hit = sorted((i for i in order if _score(pages[i], terms)), key=lambda i: -_score(pages[i], terms))
            ranked = hit + [i for i in ranked if i not in hit]
    else:
        ranked = sorted(order, key=lambda i: (-_score(pages[i], terms), i))
        ranked = [i for i in ranked if _score(pages[i], terms)] or [i for i in order if any(w in pages[i].lower() for w in SUMMARY_WORDS)] or order
    return _cut(pages, ranked, n, chars)


def _cut(pages: List[str], ranked: List[int], n: int, chars: int) -> List[Tuple[int, str]]:
    """The first page and the best-ranked ones, in page order, each with its share of `chars`."""
    keep = sorted({0, *ranked[: max(1, n - 1)]})
    per = max(600, chars // max(1, len(keep)))       # each kept page gets its share, so the first pages never crowd out the ones that answer
    out, used = [], 0
    for i in keep:
        t = re.sub(r"[ \t]+", " ", pages[i]).strip()
        if not t:
            continue
        t = t[: max(0, min(per, chars - used))]
        if not t:
            break
        out.append((i + 1, t))
        used += len(t)
    return out


class DamagedFile(Exception):
    """The exchange sent a file that does not open as a PDF (cut off or broken), twice: not a scan, so nothing is kept and the next question tries again."""

    def __init__(self, link: str):
        super().__init__(link)
        self.link = link


async def _download_pages(link: str) -> List[str]:
    """One download and parse: the page texts, or [] when the file does not open as a PDF (cut off, broken, locked)."""
    from ..earnings.transcripts import DOC_PDF_BYTES, Blocked, FetchFailed, Fetcher, extract_pages
    f = Fetcher(budget=4, pause=0.0)
    try:
        pdf = await f.pdf(link, DOC_PDF_BYTES)
    except (Blocked, FetchFailed) as e:
        raise ToolError(f"The exchange did not give the file just now ({e}). It can be opened from {link}") from None
    finally:
        await f.aclose()
    return await asyncio.to_thread(extract_pages, pdf, MAX_PAGES_READ)


async def _pages_of(link: str) -> List[str]:
    """The page texts of a file. A file that does not open, or opens with no text on any page, is downloaded once more before deciding (a broken
    download from the exchange is common): the second copy is used when it has text; both opening with no text is a scan (kept in memory only);
    otherwise the file came damaged (DamagedFile, nothing kept, so the next question tries again)."""
    async with _text_lock:
        if link in _texts:
            _texts.move_to_end(link)
            return _texts[link]
    pages = await _download_pages(link)
    if not any(p.strip() for p in pages):
        log.info("ask: %s gave %s; downloading it once more", link[-60:], "pages with no text" if pages else "a file that does not open")
        try:
            again = await _download_pages(link)
        except ToolError:
            again = []
        if any(p.strip() for p in again):
            pages = again
        elif not (pages and again):
            raise DamagedFile(link)
    async with _text_lock:
        _texts[link] = pages
        while len(_texts) > 24:
            _texts.popitem(last=False)
    return pages


async def _locate(gw: Gateway, sym: str, want: str, store: Any, window: Optional[Tuple[date, date, str]] = None,
                  found: Optional[List[Dict[str, Any]]] = None) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]], Optional[str]]:
    """The document of the kind asked for: the Documents list first (what the website shows; results filings come from News & filings > Results);
    then the database: for a presentation the one Discovery read, then any stored filing that says "presentation" in the last 400 days (task #255);
    for a call transcript, an annual report or a results filing, the stored filings of that kind (task #254). The newest, or, when the question
    names a period, the one filed for it; with none for that period, the newest and a note saying so.
    Returns (document or None, the rows of the Documents list, to say what is there when nothing is, a note or None)."""
    results = want == "Results filing"
    try:
        data = await gw.json("/api/feed", {"kind": "result" if results else "document", "symbol": sym, "limit": 150},
                             subject=f"The {'results filings' if results else 'documents'} of {sym}")
    except ToolError:
        data = None
        if store is None:
            raise
    items = (data or {}).get("items") or []
    rows = [r for r in (_feed_row(i) for i in items)]
    if results:
        docs = [{**r, "type": want} for r in rows if is_results_filing(r)]
    else:
        docs = [r for r in rows if r["type"] == want and r.get("link")]
    if not docs or window:
        if want == "Investor presentation":
            more = [f for f in (await docstore.discovery_presentation(store, sym), await docstore.feed_presentation(store, sym)) if f and f.get("link")]
        else:
            more = await docstore.feed_documents(store, sym, want)
        seen = {d["link"] for d in docs}
        docs += [f for f in more if f.get("link") and f["link"] not in seen]
        docs.sort(key=lambda d: str(d.get("date") or ""), reverse=True)
    if not docs:
        return None, rows, None
    if found is not None:          # task #254 rework: every candidate, newest first, so a covering letter can be passed over
        found.extend(sorted(docs, key=lambda d: str(d.get("date") or ""), reverse=True))
    if window:
        hit = [d for d in docs if in_window(d, window)]
        if hit:
            return hit[0], rows, None
        return docs[0], rows, (f"FinLit holds no {want.lower()} of {sym} filed for {window[2]}; this is the newest one, filed {docs[0].get('date')}. "
                               f"Say so plainly before quoting it.")
    return docs[0], rows, None                                          # the newest


async def _read_pages(store: Any, doc: Dict[str, Any], sym: str, want: str) -> Tuple[List[str], str]:
    """The document's page texts and where they came from: kept text first (read earlier by FinLit AI or the Discovery job), then memory, then the
    exchange (kept for next time)."""
    kept = await docstore.get_pages(store, doc["link"])
    if kept:
        return kept, "kept"
    in_memory = doc["link"] in _texts
    pages = await asyncio.wait_for(_pages_of(doc["link"]), timeout=DOC_TIMEOUT)
    if any(p.strip() for p in pages):
        await docstore.put_pages(store, doc["link"], sym, want, doc.get("title"), doc.get("date"), pages)
    return pages, "memory" if in_memory else "exchange"


# What the AI is told about each kind of document it quotes (task #254): whose words they are, and how to quote them.
KIND_NOTES = {
    "Investor presentation": "It is the company's own presentation of itself, not FinLit's view.",
    "Call transcript": ("These are the words said on the company's earnings call. Name who said each thing as the page names the speaker (for example "
                        "'Management (CFO): ...'); a question from an analyst or the moderator is not management's view. Never put words in management's "
                        "mouth: quote or describe only what the page shows."),
    "Annual report": "It is the company's own annual report: say which section a quote comes from when the page names it.",
    "Results filing": ("It is the results the company filed with the exchange. For the figures use FinLit's own results (get_quarter_results, the "
                       "company card) and quote this filing as their source; say when a figure differs between the two."),
}


# Task #254 rework (19 Nov, HDFC Bank): many filings the exchange lists as an "Investor presentation" (or a transcript) are only the company's covering
# letter: one to three pages to the Listing Department under Regulation 30, saying the deck is enclosed or is on the company's website. Such a letter
# must never be quoted as "the presentation".
_LETTER = re.compile(r"listing department|corporate relationship department|dept\.? of corporate services|regulation 30|regulation 46|"
                     r"pursuant to|please find (?:enclosed|attached)|we enclose|enclosed herewith|enclosed please find|kindly take (?:the same )?on record|"
                     r"take the above on record|scrip (?:code|symbol)|dear sir|dear madam|yours (?:faithfully|truly|sincerely)|company secretary", re.I)
_COMPANY_PDF = re.compile(r"https?://[^\s\"'<>)]+?\.pdf\b", re.I)
EXCHANGE_HOSTS = ("nseindia.com", "bseindia.com")
COVER_PAGES = 3
COVER_CHARS = 6000


def is_cover_letter(pages: List[str]) -> bool:
    """A covering letter only: at most three short pages, written as a letter to the exchange (two or more letter phrases), with no deck or call
    after it. A letter followed by the deck in the same file (most presentations: a letter, then 10 to 40 slides) is not a cover letter."""
    texts = [p for p in pages if p and p.strip()]
    if not texts or len(pages) > COVER_PAGES:
        return False
    body = " ".join(texts)
    return len(body) <= COVER_CHARS and len(set(m.group(0).lower() for m in _LETTER.finditer(body))) >= 2


def letter_links(pages: List[str]) -> Tuple[List[str], List[str]]:
    """(direct PDF links on the company's own site, the other links) a covering letter names; the exchange's own links are left out."""
    body = " ".join(pages)
    pdfs = [u for u in dict.fromkeys(_COMPANY_PDF.findall(body)) if not any(h in u.lower() for h in EXCHANGE_HOSTS)]
    urls = [u.rstrip(".,;") for u in dict.fromkeys(re.findall(r"https?://[^\s\"'<>)]+", body)) if u not in pdfs
            and not any(h in u.lower() for h in EXCHANGE_HOSTS)]
    return pdfs[:2], urls[:3]


async def _real_document(store: Any, doc: Dict[str, Any], docs: List[Dict[str, Any]], sym: str, want: str
                         ) -> Tuple[Dict[str, Any], List[str], str, Optional[Dict[str, Any]]]:
    """The document to quote: `doc`, unless its file is only a covering letter. Then, in turn: (i) another filing of the same kind on the same day
    (the deck filed separately), (ii) a PDF on the company's own site that the letter links to, (iii) the next newest filings of that kind (at most
    two). Returns (document, its pages, where its text came from, the covering letter skipped or None). When every one is a letter, the newest letter
    comes back with `letter` set, so the answer says so plainly."""
    pages, origin = await _read_pages(store, doc, sym, want)
    if not is_cover_letter(pages):
        return doc, pages, origin, None
    letter = {"title": doc.get("title"), "filed": doc.get("date"), "link": doc.get("link"), "pages": len(pages)}
    pdfs, urls = letter_links(pages)
    letter["links"] = pdfs + urls
    same_day = [d for d in docs if d is not doc and d.get("link") != doc.get("link") and d.get("date") == doc.get("date")]
    older = [d for d in docs if d is not doc and d.get("link") != doc.get("link") and str(d.get("date") or "") < str(doc.get("date") or "")]
    tries: List[Dict[str, Any]] = same_day[:2] + [{**doc, "link": u, "title": f"{doc.get('title')} (the file on the company's site)", "from": "company site"}
                                                 for u in pdfs[:1]] + older[:2]
    for cand in tries:
        try:
            p2, o2 = await _read_pages(store, cand, sym, want)
        except Exception:      # nosec B112 - one file the exchange or the company's site does not give must not stop the others
            log.info("ask: %s %s: %s not read", sym, want, str(cand.get("link"))[-60:])
            continue
        if any(x.strip() for x in p2) and not is_cover_letter(p2):
            return cand, p2, o2, letter
    return doc, pages, origin, letter


async def read_company_document(gw: Gateway, a: Dict[str, Any]) -> Out:
    sym, want = clean_symbol(a["symbol"]), DOC_KINDS[a["document"]]
    store = docstore.store_of(gw)
    window = period_window(a.get("period") or a.get("question") or "", want)
    candidates: List[Dict[str, Any]] = []
    doc, rows, period_note = await _locate(gw, sym, want, store, window, candidates)
    if doc is None:
        held = sorted({r["type"] for r in rows if r.get("type")})
        if not held and store is not None:
            held = sorted({doc_type(h["category"], h["title"]) for h in await docstore.held(store, sym)})
        has = f"FinLit holds these documents for {sym}: {', '.join(held)}." if held else f"FinLit holds no company documents for {sym} yet."
        days = docstore.KIND_DAYS.get(want, docstore.KEEP_DAYS)          # task #254: an annual report is looked for over two years
        page = "News & filings page" if want == "Results filing" else "Documents page"
        return Out({"symbol": sym, "document": want, "found": False, "held": held, "searched": f"the last {days} days"},
                   source=SOURCE_FEED, routes=["/api/feed"],
                   notes=[f"FinLit's {page} holds no {want.lower()} for {sym} filed in the last {days} days "
                          f"(filings appear as the company's announcements are loaded). {has} Say so plainly; the web may have the company's own copy."])
    try:
        doc, pages, origin, letter = await _real_document(store, doc, candidates or [doc], sym, want)
    except DamagedFile:
        return Out({"symbol": sym, "document": want, "title": doc["title"], "filed": doc["date"], "link": doc["link"], "pages": 0, "text": [],
                    "damagedFile": True}, as_of=doc["date"], source=SOURCE_FEED, routes=["/api/feed", doc["link"]],
                   notes=([period_note] if period_note else []) + [
                       f"The exchange sent a damaged file just now: the {want.lower()} ({doc['title']}, filed {doc['date']}) was downloaded twice and "
                       "neither copy opens. It is not a scan, and FinLit will try again on the next question. Say so in one short clause, give the "
                       f"link ({doc['link']}), and answer from the other documents and FinLit's own figures."])
    except asyncio.TimeoutError:
        raise ToolError(f"The exchange did not send the {want.lower()} ({doc['title']}, filed {doc['date']}) in time. It can be opened from {doc['link']}") from None
    found_by = " (the presentation FinLit's Discovery read; the Documents list shows newer filings only)" if doc.get("from") == "discovery" else ""
    if doc.get("from") == "company site":
        found_by = " (the file on the company's own site that the exchange filing's covering letter points to)"
    base = {"symbol": sym, "document": want, "title": doc["title"], "filed": doc["date"], "link": doc["link"], "pages": len(pages)}
    if window:
        base["period"] = window[2]
    src = f"{SOURCE_FEED}; the file itself, read from the exchange archive{found_by}"
    lead = [period_note] if period_note else []
    if letter is not None and letter.get("link") == doc.get("link"):
        # every filing found is only a covering letter (HDFC Bank's "presentation" of 17 Oct 2026: one page pointing to its website)
        where = f" It points to {', '.join(letter['links'])}." if letter.get("links") else ""
        return Out({**base, "text": [], "coverLetterOnly": True, "letterLinks": letter.get("links") or []}, as_of=doc["date"], source=src,
                   routes=["/api/feed", doc["link"]],
                   notes=lead + [f"The filing named '{want.lower()}' of {doc['date']} is only the company's covering letter ({len(pages)} page"
                                 f"{'s' if len(pages) != 1 else ''}) to the exchange: the {want.lower()} itself is not in the exchange filing.{where} "
                                 "Never call this letter the presentation and never quote it as the company's view. Read the results filing and the call "
                                 "transcript of the same quarter instead (read_company_document), and the company's own investor-relations page on the web; "
                                 "say plainly which document the figures come from."])
    if letter is not None:
        lead.append(f"The filing of {letter['filed']} ({letter['title']}) is only a covering letter, so this is the {want.lower()} read instead "
                    f"({doc['title']}, {doc['date']}). Say so in one short clause when you quote it.")
    if not any(p.strip() for p in pages):
        return Out({**base, "text": []}, as_of=doc["date"], source=src, routes=["/api/feed"],
                   notes=lead + ["The file is a scan: it was downloaded twice and both copies open with no text on any page (images only). Say so "
                                 "plainly; it can be opened from the link."])
    budget = int(a.get("max_chars") or 9000)                           # task #254 rework: several documents read at once share the room
    q = a.get("question") or ""
    measures: Dict[str, int] = {}
    if bank_lens(q) and want in ("Results filing", "Investor presentation", "Annual report"):
        # a bank, an NBFC or an insurer: the best page for each core measure first (cut to its lines), then the question's own pages in the room left
        chosen, measures = bank_pages(pages, budget)
        left = budget - sum(len(t) for _, t in chosen)
        if left > 600:
            have = {n for n, _ in chosen}
            extra = [(n, t) for n, t in best_pages(pages, q, n=4, chars=left, kind=want) if n not in have]
            chosen = sorted(chosen + extra[:2])
    else:
        chosen = best_pages(pages, q, n=6 if budget >= 6000 else 4, chars=budget, kind=want)
    text: List[Dict[str, Any]] = [{"page": n, "text": t} for n, t in chosen]
    if measures:
        base["measuresOnPages"] = measures                              # which page carries each bank measure
    if want == "Call transcript":                                      # who speaks on each page, as the page names them
        mgmt = management_of(pages)
        for row in text:
            who = speakers_on(pages[row["page"] - 1], mgmt)
            if who:
                row["speakers"] = who
        if mgmt:
            base["management"] = [f"{n} ({t})" for n, t in mgmt.items()]
    return Out({**base, "text": text, "read": origin}, as_of=doc["date"], source=src, routes=["/api/feed", doc["link"]],
               notes=lead + [f"Quote what the document says and name its page, the date it was filed and its link. {KIND_NOTES[want]} "
                             f"This is the document's text: never say the {want.lower()} could not be read."])


# ------------------------------------------------------------------------------------------------ the Advanced stock screener (FinLit Prism)
# Task #283 PR C (21 Nov 2026): FinLit Prism is FinLit's only company score; the Basic stock screener and the score it used are retired.
SOURCE_SCORES = "FinLit's Advanced stock screener (FinLit Prism), as this member's plan shows it"
SCORE_FIELD, SCORE_LABEL = "prism_final", "prism_label"


def _stem(w: str) -> str:
    """"banks" and "bank" are the same word; "banking" is not."""
    return w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w


def screen_rows(rows: List[Dict[str, Any]], a: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], int]:
    field, label = SCORE_FIELD, SCORE_LABEL
    lo, hi = a.get("min"), a.get("max")
    want = [_stem(w) for w in re.findall(r"[a-z0-9]+", (a.get("sector") or "").lower())]
    out = []
    for r in rows:
        v = r.get(field)
        if v is None or (lo is not None and v < lo) or (hi is not None and v > hi):
            continue
        if want:
            have = {_stem(w) for w in re.findall(r"[a-z0-9]+", " ".join(str(r.get(k) or "") for k in ("sector", "nse_sector", "nse_industry")).lower())}
            if not all(w in have for w in want):
                continue
        if a.get("min_market_cap") is not None and (r.get("market_cap") or 0) < a["min_market_cap"]:
            continue
        out.append(r)
    out.sort(key=lambda r: r.get(field) or 0, reverse=a.get("order", "desc") == "desc")
    keep = ("symbol", "name", "nse_sector", "nse_industry", "market_cap", "price", field, label, "pe", "roe", "return_1y")
    return [{k: r.get(k) for k in keep} for r in out[: a.get("limit", 15)]], len(out)


async def screen_by_finlit_score(gw: Gateway, a: Dict[str, Any]) -> Out:
    u = await gw.json("/api/screener/universe", subject="The score screener")
    rows = (u or {}).get("rows") or []
    if rows and not any(r.get(SCORE_FIELD) is not None for r in rows):
        raise ToolError("The FinLit Prism scores of the screener are part of the Gold plan, which this member's plan does not include.")
    got, total = screen_rows(rows, a)
    return Out({"score": "FinLit Prism (0 to 100)", "matched": total, "rows": got},
               as_of=(u or {}).get("as_of"), source=SOURCE_SCORES, routes=["/api/screener/universe"],
               notes=["market_cap is in Rs crore. A company without a score is left out (not yet rated)."])



# ------------------------------------------------------------------------------------------------ Discovery (task #221)
SOURCE_DISCOVERY = ("FinLit AI's Discovery: the themes each company's newest investor presentation talks about, from the keywords of FinLit's directory "
                    "(a keyword mention by itself is not proof of material business exposure)")


async def get_discovery(gw: Gateway, a: Dict[str, Any]) -> Out:
    from ..discovery.keywords import CAUTION
    q: Dict[str, Any] = {}
    if a.get("symbol"):
        q["symbol"] = clean_symbol(a["symbol"])
    elif a.get("theme"):
        if a["theme"] not in DISCOVERY_THEMES:
            raise ToolError(f"No such theme. The themes are: {', '.join(DISCOVERY_THEMES)}")
        q["theme"] = a["theme"]
    if a.get("sector"):
        q["sector"] = a["sector"]
    data = await gw.json("/api/discovery", q, subject="Discovery")
    data = dict(data or {})
    lim = int(a.get("limit") or 15)
    for t in data.get("themes") or []:
        if "companies" in t:
            t["companies"] = t["companies"][:lim]
            t["alsoMentions"] = [{"symbol": c["symbol"], "company": c["company"], "primary": c["primary"]} for c in (t.get("alsoMentions") or [])[:lim]]
            t["recentFilings"] = (t.get("recentFilings") or [])[:lim]
    if data.get("filings"):
        data["filings"] = data["filings"][:lim]
    if q.get("symbol"):
        data["themes"] = [t for t in data.get("themes") or [] if t.get("companies") or t.get("alsoMentions")]
    return Out(data, as_of=data.get("updated"), source=SOURCE_DISCOVERY, routes=["/api/discovery"],
               notes=[CAUTION, "Each company is put in the theme its presentation scores highest (primary); 'alsoMentions' are companies where it is a secondary theme.",
                      "Name each theme by its 'label' (as the Discover page shows it, e.g. 'Corporate developments'), not its internal 'name'. For a bank, finance "
                      "company, broker or insurer a technology theme (AI, cloud ...) is only a mention unless its sentences show revenue, orders or a product.",
                      "stage: the most advanced stage the company's own sentences show (Operating, Under execution, Planned, MoU / pilot). tone: positive "
                      "minus negative finance words of the presentation (-1 to 1). filings: exchange filings of the last 90 days by event type, theme and "
                      "tone (+1, 0, -1). sector: NSE's macro sector, sector and industry. Describe these; never call a company a pick."])



# ------------------------------------------------------------------------------------------------ the finance reference (task #240)
async def get_finance_framework(gw: Gateway, a: Dict[str, Any]) -> Out:
    from . import knowledge as KN
    data = KN.framework(a.get("topic"), a.get("sector"))
    return Out(data, source="FinLit's finance reference (the measures that matter, how each is read, the sector-specific measures, the source order)",
               notes=["This holds no company's figures: read those with FinLit's tools (get_company_card, get_company_section) and give their period."])

TOOLS: List[Tool] = [
    Tool("get_superinvestors", "Superinvestor portfolios", "FinLit's Superinvestor portfolios page: named investors (people and firms) who hold 1% or more of listed companies, "
         "from the companies' filings. Without `investor`: the list, largest first, with their top holdings and what changed. With `investor` (a name such as "
         "Ashish Kacholia or Rakesh Jhunjhunwala): that investor's holdings in full. Paid plans.",
         {"investor": {"type": "string", "maxLength": 80, "description": "An investor's name, if the question is about one"},
          "limit": {"type": "integer", "minimum": 1, "maximum": 60, "default": 30, "description": "How many investors in the list"}}, get_superinvestors),
    Tool("get_india_economy", "India economy", "FinLit's India economy page: inflation (CPI, WPI, by spending group), GDP, IIP, jobs, the RBI's policy rates and decisions, "
         "the rupee, forex reserves, money supply and crude oil, each with its period and publisher, plus the page's own plain-words insights.", {}, get_india_economy),
    Tool("lookup_glossary", "Glossary", "FinLit's Glossary: what a term means, why it matters, how to use it, the formula, and how FinLit uses it (for example P/E, ROCE, "
         "FinLit Prism, Mutual Fund Score, free cash flow). Use it for 'what is', 'what does ... mean' questions so the answer uses FinLit's own wording.",
         {"term": {"type": "string", "minLength": 1, "maxLength": 80, "description": "The term asked about"}}, lookup_glossary, ["term"]),
    Tool("get_insights_and_blogs", "Insights & blog", "FinLit's Insights & blog page: the research notes and explainers FinLit has published. With `query`: the matching posts, "
         "the best one with its text.", {"query": {"type": "string", "maxLength": 80, "description": "Words to look for"}}, get_insights_and_blogs),
    Tool("get_news_and_filings", "News & filings", "FinLit's News & filings, results filings and Documents pages: the exchange announcements FinLit stores, newest first, each "
         "with its date and link. kind: news (announcements), results (results filings), documents (annual reports, investor presentations, call transcripts, "
         "offer documents). Narrow by company symbol, by words, and for documents by type.",
         {"kind": {"type": "string", "enum": ["news", "results", "documents"], "default": "news"}, "symbol": dict(SYMBOL_SCHEMA, description="A company symbol (optional)"),
          "query": {"type": "string", "maxLength": 80, "description": "Words in the title or company name (optional)"},
          "type": {"type": "string", "enum": ["Annual report", "Investor presentation", "Call transcript", "Offer document", "Results filing", "Other filing"],
                   "description": "For documents: one type only (optional)"},
          "limit": {"type": "integer", "minimum": 1, "maximum": 30, "default": 12}}, get_news_and_filings),
    Tool("read_company_document", "Read a company document", "Reads the text of a company's investor presentation, earnings-call transcript, annual report or "
         "results filing from FinLit's Documents and News & filings pages (the file the company filed with the exchange) and returns the pages that answer "
         "the question, with the page numbers, the speakers of a call and the link. The newest by default, or the one of the period asked. Use it for "
         "'what does the investor presentation say about ...', 'what did management say on the call', the company's own guidance, plans, segment or "
         "project details, its annual report (strategy, risks, related parties) and the results filing behind FinLit's results figures.",
         {"symbol": dict(SYMBOL_SCHEMA), "document": {"type": "string", "enum": list(DOC_KINDS), "default": "investor_presentation"},
          "question": {"type": "string", "maxLength": 200, "description": "What to look for in the document"},
          "period": {"type": "string", "maxLength": 40, "description": "Optional: the quarter or year asked about, e.g. 'Q2 FY27', 'September quarter', 'FY26'"},
          "max_chars": {"type": "integer", "minimum": 1500, "maximum": 9000, "default": 9000,
                        "description": "Optional: at most this many characters of pages (smaller when several documents are read together)"}},
         read_company_document, ["symbol"]),
    Tool("get_discovery", "Discovery", "FinLit AI's Discovery section: companies grouped by the themes their newest investor presentation talks about (AI, defence, "
         "solar, batteries, data centres, semiconductors, EV, nuclear, space and drones, and more: 21 themes), each with its keywords, the sentences that hold figures "
         "and the presentation's link, the stage (operating, under execution, planned, MoU / pilot), the tone of its words, its NSE sector, and the "
         "company's recent exchange filings by event and tone. Without arguments: the themes and their counts, sectors and filings. With `theme`: that theme's companies. With `symbol`: one company's themes. "
         "Use it for 'which companies are into ...', 'companies working on ...', theme or sector-trend questions.",
         {"theme": {"type": "string", "enum": list(DISCOVERY_THEMES)},
          "symbol": dict(SYMBOL_SCHEMA, description="A company symbol (optional)"),
          "sector": {"type": "string", "maxLength": 80, "description": "An NSE macro sector, e.g. Industrials, Information Technology (optional)"},
          "limit": {"type": "integer", "minimum": 1, "maximum": 30, "default": 15}}, get_discovery),
    Tool("get_finance_framework", "Finance reference", "FinLit's finance reference: which measures matter for a topic (income statement, balance "
         "sheet, cash flow, growth, earnings quality, valuation, profitability, liquidity and leverage, efficiency, ownership, valuation methods, "
         "investment reasoning, portfolio, technical, funds, fixed income, macro, corporate actions, governance and risk) or for a sector (banks, "
         "NBFCs, insurers, AMCs, IT, FMCG, autos, pharma, real estate, telecom, energy, metals, capital goods), how each is read and its traps, "
         "the answer patterns and the order of sources. Use it for 'what matters for ...', 'how to read ...', 'is a P/E of ... high' questions.",
         {"topic": {"type": "string", "enum": list(FINANCE_TOPICS)},
          "sector": {"type": "string", "maxLength": 80, "description": "A sector, industry or kind of company, e.g. Private Sector Bank, NBFC, IT services"}},
         get_finance_framework),
    Tool("screen_by_finlit_score", "Score screener", "FinLit's Advanced stock screener (FinLit Prism, FinLit's only company score; Gold): companies by their "
         "FinLit Prism score, highest first, optionally within a score range, a sector or industry, and a minimum size.",
         {"min": {"type": "number", "minimum": 0, "maximum": 100}, "max": {"type": "number", "minimum": 0, "maximum": 100},
          "sector": {"type": "string", "maxLength": 60, "description": "Words of an NSE sector or industry, e.g. Banks, IT, Pharmaceuticals"},
          "min_market_cap": {"type": "number", "minimum": 0, "description": "Rs crore"},
          "order": {"type": "string", "enum": ["asc", "desc"], "default": "desc"},
          "limit": {"type": "integer", "minimum": 1, "maximum": 30, "default": 15}}, screen_by_finlit_score),
]
TIMEOUTS = {"read_company_document": DOC_TIMEOUT + 5}
DOING = {"get_superinvestors": "Reading Superinvestor portfolios", "get_india_economy": "Reading the India economy page", "lookup_glossary": "Reading the Glossary",
         "get_insights_and_blogs": "Reading Insights & blog", "get_news_and_filings": "Reading News & filings",
         "read_company_document": "Reading the document", "screen_by_finlit_score": "Running the score screener", "get_discovery": "Reading Discovery", "get_finance_framework": "Reading FinLit's finance reference"}


# ------------------------------------------------------------------------------------------------ "aligned with the web pages": links under the answer
def page_links(calls: Iterable[Tuple[str, Dict[str, Any]]]) -> List[Dict[str, str]]:
    """The FinLit pages an answer read, in the order first used, at most 4: {"to", "label"} for the panel's "Read on FinLit" links."""
    out: List[Dict[str, str]] = []
    def add(to: str, label: str) -> None:
        if to not in (x["to"] for x in out):
            out.append({"to": to, "label": label})
    for name, args in calls:
        args = args if isinstance(args, dict) else {}
        sym = str(args.get("symbol") or "").upper()
        sym = sym if re.fullmatch(r"[A-Z0-9&\-\.]{1,20}", sym) else ""
        if name in ("get_company_card", "get_company_section", "get_stock_quote", "get_company_profile", "get_financials", "get_ratios",
                    "get_shareholding", "get_price_history", "get_finlit_score") and sym:
            add(f"/stocks/{sym}", f"{sym} company report")
        elif name == "get_finlit_prism" and sym:
            add(f"/prism/{sym}", f"FinLit Prism report: {sym}")
        elif name == "get_superinvestors":
            add("/superinvestors", "Superinvestor portfolios")
        elif name == "get_india_economy":
            add("/macro", "India economy")
        elif name == "lookup_glossary":
            add("/glossary", "Glossary")
        elif name == "get_insights_and_blogs":
            add("/blog", "Insights & blog")
        elif name == "get_news_and_filings":
            add("/documents" if args.get("kind") == "documents" else "/news", "Documents" if args.get("kind") == "documents" else "News & filings")
        elif name == "read_company_document":
            add("/documents", "Documents")
        elif name == "get_sector_pulse":     # task #349 PR 5
            add("/sectors" + ("?show=sectors" if args.get("show", "sectors") == "sectors" else "?show=industries"), "Sector Pulse")
        elif name == "get_sector_rotation":
            add("/sectors/rotation" + ("?show=sectors" if args.get("show", "sectors") == "sectors" else "?show=industries"), "Sector Rotation")
        elif name == "get_discovery":
            add("/discover", "Discover")   # task #241: Discovery is a page now; task #260: its address is /discover
        elif name == "screen_by_finlit_score":
            add("/advanced-score-screener", "Advanced stock screener")
        elif name == "screen_stocks":
            add("/screener", "Stock screener")
        elif name == "get_fii_dii_flows":
            add("/fii-dii", "FII & DII flows")
        elif name in ("get_results_calendar", "get_quarter_results"):
            add("/results", "Results calendar")
        elif name == "get_ipo_calendar":
            add("/ipo", "IPO calendar")
        elif name == "get_bulk_block_deals":
            add("/ipo?view=deals", "Bulk & block deals")
        elif name == "get_my_portfolio":
            add("/holdings", "Your Equity portfolio")
        elif name == "get_my_funds":
            add("/mf-portfolio", "Your mutual fund portfolio")
        elif name == "get_my_watchlists":
            add("/watchlist", "Your watchlists")
        elif name in ("get_fund_details", "search_funds"):
            add("/funds", "Mutual funds")
        elif name in ("list_etfs", "get_etf"):
            add("/etfs", "ETFs")
    return out[:4]
