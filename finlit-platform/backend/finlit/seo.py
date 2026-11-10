"""Search-engine readiness for the single-page website, without a framework migration.

The website is a React app: the HTML a crawler first receives is an empty page. This module gives every public address its own head (title, description, canonical,
Open Graph, JSON-LD) and a short block of real content inside the page, and gives unknown addresses a true 404, all on the server in web.py. React replaces the block
when it starts (createRoot), so visitors see no difference. It also builds /sitemap.xml from the database and the glossary.

Rules kept here: only facts we hold (a company's name and sector, a glossary entry); nothing that depends on a plan (no scores); no ratings or reviews; wording
describes, it never advises. Private pages carry noindex. Information only, not investment advice.
"""

from __future__ import annotations

import html
import json
import re
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from .normalize.glossary import TERMS

BRAND = "FinLit"
SITE_NAME = "FinLit Ventures"
OG_IMAGE = "/og-finlit-1200x630.png"
SYMBOL = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
DISCLAIMER = "Describes the company's financial health from its filings and prices; not a recommendation. Information only, not investment advice."


@dataclass(frozen=True)
class Page:
    title: str            # 50 to 60 characters where the page can carry it; the brand ends it
    description: str      # 120 to 160 characters
    h1: str
    intro: str
    crumb: str = ""       # the name in the breadcrumb ("" for the home page)
    index: bool = True


PUBLIC: Dict[str, Page] = {
    "": Page("Indian Stock Analysis and Scores for Every Company | FinLit", "Financial statements, ratios, peers, ownership and filings for every listed Indian company, with a 0 to 100 FinLit IQ that shows its working. Start free.",
             "Every listed Indian stock, scored and explained", "FinLit reads company filings and prices and describes each listed Indian company's financial health with a 0 to 100 score that shows its working. Free to start; information only, not investment advice."),
    "research": Page("Stock Research: Company Reports for Indian Stocks | FinLit", "Browse research on listed Indian companies: statements, ratios, peers, ownership and a plain-English reading of each company's financial health.", "Stock research", "Company reports for listed Indian stocks, built from filings and prices.", "Research"),
    "screener": Page("Stock Screener India: Filter Stocks by Ratio | FinLit", "Screen listed Indian stocks by more than 170 ratios and scores, save your screens and see why each company passes. Free to start.", "Stock screener for Indian stocks", "Filter every listed Indian company by ratios, growth, size and score.", "Stock screener"),
    "score-screener": Page("Stock Score Screener: Financial Health Scores | FinLit", "Filter Indian stocks by their FinLit IQ score and the pillars behind it: quality, growth, profitability, balance sheet and technical.", "Stock score screener", "Filter listed Indian companies by FinLit IQ and its pillars.", "Score screener"),
    "compare": Page("Compare Stocks India: Side-by-Side Analysis | FinLit", "Compare listed Indian companies side by side on financials, ratios, growth and FinLit scores to see how they differ.", "Compare stocks", "Put two or more listed Indian companies side by side.", "Compare stocks"),
    "prism": Page("FinLit Prism: Financial Health Rating for Stocks | FinLit", "FinLit Prism rates a company's financial health in four parts from its filings, with the working shown. Information only, not advice.", "FinLit Prism", "A four-part financial health rating for listed companies, from their filings.", "FinLit Prism"),
    "sip-calculator": Page("SIP Calculator: Plan SIP Returns and Step-Up SIPs | FinLit", "Work out what a monthly SIP could grow to, with step-ups, a goal and inflation. A free calculator with clear working. Not a forecast.", "SIP calculator", "Estimate what a monthly SIP could grow to under the rate and years you enter.", "SIP calculator"),
    "eps-calculator": Page("EPS Calculator: Earnings Per Share Explained | FinLit", "Calculate earnings per share from profit and share count, see basic and diluted EPS and how it changes over time. Free, with the formula.", "EPS calculator", "Earnings per share from profit and share count, with the formula shown.", "EPS calculator"),
    "dcf": Page("DCF Calculator: Estimate a Company's Value | FinLit", "Build a simple discounted cash flow from the numbers you enter and see how the value changes with each assumption. A scenario tool, not a forecast.", "DCF calculator", "A discounted cash flow calculator where every assumption is yours.", "DCF calculator"),
    "macro": Page("India Macro Indicators: CPI, GDP, Repo Rate Data | FinLit", "India's inflation, growth, interest rates, reserves and more in one place, from MoSPI and RBI releases, with plain-English readings.", "India macro indicators", "Inflation, growth, interest rates and reserves from official releases.", "Macro"),
    "fii-dii": Page("FII and DII Data: Daily Institutional Flows | FinLit", "Daily FII and DII buying and selling in Indian equities, with trends over time and what the flows describe. Information only.", "FII and DII activity", "Daily institutional flows in Indian equities.", "FII and DII"),
    "sectors": Page("Sector Performance India: Sector Pulse and Rotation | FinLit", "See which Indian sectors are strengthening or weakening, how breadth is changing and which companies lead each sector.", "Indian sectors", "Sector states, breadth and leaders across Indian markets.", "Sectors"),
    "ipo": Page("IPO Calendar India: Upcoming and Recent IPOs | FinLit", "Upcoming and recent Indian IPOs with dates, price bands and issue size, in one calendar. Information only, not advice.", "IPO calendar", "Upcoming and recent Indian IPOs.", "IPO calendar"),
    "results": Page("Quarterly Results Calendar: Company Results India | FinLit", "Which Indian companies report results and when, with the numbers once they are out and how they compare with the year before.", "Quarterly results", "Company results calendar and the numbers as they arrive.", "Results"),
    "funds": Page("Mutual Fund Screener India: Compare Fund Returns | FinLit", "Search and compare Indian mutual funds on returns, cost, size and risk, with the FinLit fund Health Score. Information only.", "Mutual funds", "Search and compare Indian mutual funds.", "Funds"),
    "fund-score-screener": Page("Mutual Fund Health Score: Filter Funds by Score | FinLit", "Filter Indian mutual funds by the FinLit Health Score and the four parts behind it: performance, risk, cost and quality.", "Fund score screener", "Filter mutual funds by Health Score and its four parts.", "Fund score screener"),
    "etfs": Page("ETF List India: Compare ETFs and Index Funds | FinLit", "Indian ETFs and index funds with tracking difference, cost and size, and how each compares with its index.", "ETFs", "Indian ETFs with tracking, cost and size.", "ETFs"),
    "commodities": Page("Commodity Prices India: Gold, Silver, Crude | FinLit", "Gold, silver, crude oil and other commodity prices and trends relevant to Indian markets. Information only.", "Commodities", "Commodity prices and trends.", "Commodities"),
    "news": Page("Market News: Indian Stocks and Economy | FinLit", "Market news for Indian stocks and the economy, collected in one place with links to the original sources.", "Market news", "Market news with links to the sources.", "News"),
    "documents": Page("Company Documents: Annual Reports and Filings | FinLit", "Annual reports, presentations and filings of listed Indian companies, collected in one place.", "Company documents", "Annual reports, presentations and filings.", "Documents"),
    "glossary": Page("Investing Glossary: 443 Terms in Plain English | FinLit", "443 investing and finance terms explained in plain English, each with why it matters, how to use it and the formula where there is one.", "Investing glossary", "443 investing terms in plain English, from A to Z, with formulas.", "Glossary"),
    "blog": Page("Investing Insights and Explainers | FinLit Blog", "Research notes and explainers on Indian stocks, funds and financial ratios, written to inform and not to advise.", "FinLit blog", "Research notes and explainers.", "Blog"),
    "faq": Page("FinLit FAQs: Scores, Data, Plans and Privacy | FinLit", "Answers to common questions about how FinLit scores companies, where the data comes from, plans and how your data is handled.", "Frequently asked questions", "Answers about scores, data, plans and privacy.", "FAQ"),
    "plans": Page("FinLit Plans and Pricing: Free, Silver and Gold | FinLit", "Compare FinLit plans: what is free, what Silver adds and what Gold adds, with every feature listed.", "Plans and pricing", "What each FinLit plan includes.", "Plans"),
    "pricing": Page("FinLit Plans and Pricing: Free, Silver and Gold | FinLit", "Compare FinLit plans: what is free, what Silver adds and what Gold adds, with every feature listed.", "Plans and pricing", "What each FinLit plan includes.", "Plans"),
    "services": Page("Portfolio Review and Financial Planning Services | FinLit", "Portfolio reviews and financial planning conversations with the FinLit team. Information and education, not investment advice.", "Services", "Portfolio reviews and planning conversations.", "Services"),
    "about": Page("About FinLit Ventures: Who We Are and Why | FinLit", "FinLit Ventures builds free, plain-English financial research for Indian investors. Who we are, what we publish and how we work.", "About FinLit Ventures", "Who we are and what we publish.", "About"),
    "why-we-exist": Page("Why FinLit Exists: Financial Research in Plain English", "Why FinLit Ventures was started: to make company filings and prices readable for everyone, with the working shown.", "Why we exist", "Why FinLit was started.", "Why we exist"),
    "contact": Page("Contact FinLit Ventures: Questions and Support", "Contact the FinLit Ventures team with questions about the site, the data, your account or the portfolio review and planning services.", "Contact us", "Reach the FinLit team.", "Contact"),
    "mcp": Page("Connect AI Assistants to FinLit Data | FinLit", "Free, read-only FinLit data for Claude, ChatGPT and Cursor through MCP, with what each tool returns.", "Connect AI assistants", "Read-only FinLit data for AI assistants.", "AI assistants"),
    "browser-extension": Page("FinLit Browser Extension: Select Any Term or Company", "Select a financial term or a listed company on any web page to see its meaning or FinLit IQ score in a small card. Free for Chrome and Edge.", "Browser extension", "Select a financial term or company on any page and see what it means.", "Browser extension"),
    "methodology/mf-score": Page("How the FinLit Mutual Fund Health Score Works | FinLit", "What the fund Health Score describes, which parts it has and how to read it. Information only, not a recommendation.", "Mutual fund Health Score: how to read it", "What the Health Score describes and how to read it.", "Fund score method"),
    "leadership-label": Page("What the FinLit Leadership Labels Mean | FinLit", "What each leadership label on a company page means and how to read it. Describes price strength; not a recommendation.", "What the leadership labels mean", "The meaning of each label.", "Leadership labels"),
    "learn/sector-signals": Page("How to Read Sector Pulse: States and Breadth | FinLit", "A step-by-step guide to the sector states, the breadth bars and the leader flags on the FinLit sector pages, and what each one describes.", "How to use Sector Pulse", "Reading the states, breadth bars and leader flags.", "Sector Pulse guide"),
    "learn/sector-rotation": Page("How to Read Sector Rotation: Four Corners | FinLit", "A step-by-step guide to the four corners of the sector rotation chart and the rotation rank, and what each position describes.", "How to use Sector Rotation", "Reading the four corners and the rotation rank.", "Sector Rotation guide"),
    "legal/terms": Page("Terms of Use of the FinLit Website | FinLit Ventures", "The terms for using the FinLit Ventures website: who we are, what the information is and is not, accuracy, plans and liability.", "Terms of use", "The terms for using this website.", "Terms"),
    "legal/privacy": Page("Privacy Notice: Your Data and Rights | FinLit Ventures", "What FinLit collects, why it is collected, who sees it, where it is stored and your rights to access, correct or delete it.", "Privacy notice", "What we collect and why.", "Privacy"),
    "legal/disclosures": Page("Research Disclosures | FinLit Ventures", "How FinLit scores are made, the limits of the model and any conflicts, disclosed in plain words.", "Research disclosures", "How the scores are made and their limits.", "Disclosures"),
}

# Pages a visitor reaches only after signing in, or that have no content of their own: kept out of search results.
PRIVATE = ("account", "dashboard", "console", "admin", "login", "verify-email", "forgot-password", "reset-password", "watchlist", "holdings", "mf-portfolio", "alerts", "baskets",
           "query-builder", "premium", "portfolio", "feedback", "forum", "graphs", "advanced-score-screener", "outlook", "results/quarter", "funds/screener", "funds/compare",
           "funds/insights", "etfs/compare", "etfs/compare-index-funds", "sectors/rotation", "sectors/capital-goods")
# Addresses that carry a value in the last part and are answered with a generic head (their content is checked in the app).
PARAM_PREFIXES = ("funds", "etfs", "prism", "sectors", "blog", "legal", "outlook", "premium/report", "graphs/advanced", "account", "forum")


def clean(path: str) -> str:
    return "/".join(p for p in path.strip("/").split("/") if p)


def is_private(path: str) -> bool:
    p = clean(path)
    return any(p == x or p.startswith(x + "/") for x in PRIVATE)


def is_known(path: str) -> Optional[bool]:
    """True: a real address; False: not one; None: depends on a database lookup (a company or a glossary term)."""
    p = clean(path)
    if p in PUBLIC or is_private(p):
        return True
    if p.startswith("stocks/") and p.count("/") == 1 or p.startswith("glossary/") and p.count("/") == 1:
        return None
    return any(p.startswith(x + "/") and p.count("/") == x.count("/") + 1 for x in PARAM_PREFIXES)


def _e(s: Any) -> str:
    return html.escape(str(s), quote=True)


def _crumbs(base: str, trail: List[Tuple[str, str]]) -> Dict[str, Any]:
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": base + u} for i, (n, u) in enumerate([("Home", "/")] + trail)]}


def organization(base: str) -> List[Dict[str, Any]]:
    return [{"@context": "https://schema.org", "@type": "Organization", "name": SITE_NAME, "url": base + "/", "logo": base + "/icon-512.png",
             "description": "Free, plain-English financial research for Indian investors: company filings and prices described with a 0 to 100 score that shows its working."},
            {"@context": "https://schema.org", "@type": "WebSite", "name": SITE_NAME, "url": base + "/"}]


@dataclass
class Rendered:
    status: int
    head: str
    body: str
    robots: str
    title: str


def _head(base: str, path: str, title: str, desc: str, index: bool, ld: List[Dict[str, Any]], og_type: str = "website") -> str:
    url = base + ("/" + path if path else "/")
    robots = "index, follow, max-image-preview:large, max-snippet:-1" if index else "noindex, nofollow"
    tags = [f"<title>{_e(title)}</title>", f'<meta name="description" content="{_e(desc)}">', f'<meta name="robots" content="{robots}">']
    if index:
        tags.append(f'<link rel="canonical" href="{_e(url)}">')
        img = base + OG_IMAGE
        tags += [f'<meta property="og:type" content="{og_type}">', f'<meta property="og:site_name" content="{SITE_NAME}">', f'<meta property="og:locale" content="en_IN">',
                 f'<meta property="og:title" content="{_e(title)}">', f'<meta property="og:description" content="{_e(desc)}">', f'<meta property="og:url" content="{_e(url)}">',
                 f'<meta property="og:image" content="{_e(img)}">', '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
                 '<meta name="twitter:card" content="summary_large_image">', f'<meta name="twitter:title" content="{_e(title)}">', f'<meta name="twitter:description" content="{_e(desc)}">',
                 f'<meta name="twitter:image" content="{_e(img)}">']
    for block in ld:
        tags.append('<script type="application/ld+json">' + json.dumps(block, ensure_ascii=False).replace("</", "<\\/") + "</script>")
    return "\n".join(tags)


NAV = [("Stock screener", "/screener"), ("Compare stocks", "/compare"), ("Mutual funds", "/funds"), ("Glossary", "/glossary"), ("Sectors", "/sectors"), ("SIP calculator", "/sip-calculator"),
       ("Plans", "/plans"), ("About", "/about")]


POPULAR = [("Reliance Industries", "RELIANCE"), ("Tata Consultancy Services", "TCS"), ("HDFC Bank", "HDFCBANK"), ("Infosys", "INFY"), ("ICICI Bank", "ICICIBANK"),
           ("State Bank of India", "SBIN"), ("Bharti Airtel", "BHARTIARTL"), ("ITC", "ITC"), ("Larsen and Toubro", "LT"), ("Hindustan Unilever", "HINDUNILVR"),
           ("Asian Paints", "ASIANPAINT"), ("Titan Company", "TITAN")]
GUIDE_TERMS = ("price-to-earnings-ratio-p-e", "return-on-equity-roe", "return-on-capital-employed-roce", "earnings-per-share-eps", "debt-to-equity-ratio-d-e", "market-capitalisation-market-cap", "dividend-yield", "free-cash-flow-fcf", "operating-margin-opm", "book-value")


def _explore(current: str) -> str:
    """The same helpful block on every page: what the site offers, well-known companies and terms. Gives a reader (and a crawler that does not run scripts) real text and real links."""
    tools = [(pg.crumb or pg.h1, "/" + k, pg.intro) for k, pg in PUBLIC.items() if k and k != current and pg.index and not k.startswith("legal/")]
    out = ["<h2>What you can do on FinLit</h2><p>FinLit turns company filings and prices into plain-English readings of financial health. Every number links back to its working, and every blank says why it is blank. These are the main tools, all free to start.</p><ul>"]
    out += [f'<li><a href="{_e(u)}">{_e(n)}</a>: {_e(i)}</li>' for n, u, i in tools]
    out.append("</ul><h2>Well-known companies</h2><p>Open a company report to see its statements, ratios, growth, peers, ownership and filings in one page.</p><ul>")
    out += [f'<li><a href="/stocks/{sym}">{_e(n)} ({sym}) share analysis</a></li>' for n, sym in POPULAR]
    out.append("</ul><h2>Learn the terms</h2><p>New to reading financial statements? The glossary explains each measure with its formula and an example.</p><ul>")
    out += [f'<li><a href="/glossary/{tid}">{_e(TERMS[tid]["term"])}</a></li>' for tid in GUIDE_TERMS if tid in TERMS]
    out.append('<li><a href="/glossary">All glossary terms</a></li></ul>')
    return "".join(out)


def _body(h1: str, paragraphs: List[str], links: List[Tuple[str, str]], current: str = "") -> str:
    return ('<main data-seo="1" style="max-width:760px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif">' + f"<h1>{_e(h1)}</h1>" + "".join(f"<p>{_e(p)}</p>" for p in paragraphs)
            + "<nav aria-label=\"Main pages\"><ul>" + "".join(f'<li><a href="{_e(u)}">{_e(n)}</a></li>' for n, u in links) + "</ul></nav>" + _explore(current) + "</main>")


def render_static(base: str, path: str) -> Rendered:
    p = clean(path)
    pg = PUBLIC[p]
    ld = organization(base) if not p else [_crumbs(base, [(pg.crumb, "/" + p)])]
    return Rendered(200, _head(base, p, pg.title, pg.description, True, ld), _body(pg.h1, [pg.intro, pg.description, DISCLAIMER], NAV, p), "index", pg.title)


def render_private(base: str, path: str) -> Rendered:
    p = clean(path)
    title = f"{p.split('/')[0].replace('-', ' ').title()} | {BRAND}"
    return Rendered(200, _head(base, p, title, "FinLit Ventures member area.", False, []), "", "noindex", title)


def render_generic(base: str, path: str) -> Rendered:
    """An address with a value in it whose content is checked inside the app (a fund, a blog post, a legal document): a real head from the section, no content block."""
    p = clean(path)
    section = p.split("/")[0]
    parent = PUBLIC.get(section) or PUBLIC.get(p.rsplit("/", 1)[0])
    if p.startswith("legal/") and p in PUBLIC:
        return render_static(base, p)
    if is_private(p) or parent is None:
        return render_private(base, p)
    title = f"{parent.crumb} | {BRAND}" if parent.crumb else parent.title
    return Rendered(200, _head(base, p, title, parent.description, True, [_crumbs(base, [(parent.crumb, "/" + section), (p.rsplit('/', 1)[-1].replace('-', ' ').title(), "/" + p)])]), _body(parent.h1, [parent.intro, DISCLAIMER], NAV), "index", title)


def render_company(base: str, symbol: str, name: str, sector: Optional[str]) -> Rendered:
    sym = symbol.upper()
    title = f"{name} ({sym}) Share Analysis and Financial Health | {BRAND}"
    if len(title) > 70:
        title = f"{name[:34].rstrip()} ({sym}) Share Analysis | {BRAND}"
    where = f" in the {sector} sector" if sector else ""
    desc = f"{name} ({sym}){where}: financial statements, ratios, peers, ownership and a plain-English reading of its financial health. Information only, not investment advice."
    ld = [_crumbs(base, [("Research", "/research"), (name, f"/stocks/{sym}")]), {"@context": "https://schema.org", "@type": "WebPage", "name": title, "url": f"{base}/stocks/{sym}", "description": desc,
                                                                               "about": {"@type": "Corporation", "name": name, "tickerSymbol": sym}}]
    body = _body(f"{name} ({sym}) share analysis", [f"{name} is a listed Indian company{where}. FinLit describes its financial health from its filings and prices: statements, ratios, growth, peers, ownership and filings.", DISCLAIMER], NAV)
    return Rendered(200, _head(base, f"stocks/{sym}", title, desc, True, ld, "article"), body, "index", title)


def render_term(base: str, term_id: str) -> Optional[Rendered]:
    t = TERMS.get(term_id)
    if not t:
        return None
    meaning = t["meaning"].strip()
    title = f"{t['term']}: Meaning, Formula and Example | {BRAND}"
    if len(title) > 70:
        title = f"{t['term'][:40].rstrip()}: Meaning and Formula | {BRAND}"
    desc = (meaning if len(meaning) <= 155 else meaning[:152].rsplit(" ", 1)[0] + "...")
    ld = [_crumbs(base, [("Glossary", "/glossary"), (t["term"], f"/glossary/{term_id}")]),
          {"@context": "https://schema.org", "@type": "DefinedTerm", "name": t["term"], "description": meaning, "url": f"{base}/glossary/{term_id}",
           "inDefinedTermSet": {"@type": "DefinedTermSet", "name": "FinLit Glossary", "url": base + "/glossary"}}]
    paras = [meaning] + ([f"Why it matters: {t['why']}"] if t.get("why") else []) + ([f"How to use it: {t['how']}"] if t.get("how") else []) + ([f"Formula: {t['formula']}"] if t.get("formula") else [])
    return Rendered(200, _head(base, f"glossary/{term_id}", title, desc, True, ld, "article"), _body(t["term"], paras + [DISCLAIMER], [("All glossary terms", "/glossary")] + NAV[:5]), "index", title)


def not_found(base: str) -> Rendered:
    return Rendered(404, _head(base, "", f"Page not found | {BRAND}", "This page does not exist.", False, []), "", "noindex", "Page not found")


# ---------------------------------------------------------------------------------------------------------------- putting it into the page

_TITLE = re.compile(r"<title>.*?</title>", re.S)
_STRIP = re.compile(r'<meta (?:name="(?:description|twitter:card)"|property="og:[a-z:_]+")[^>]*>', re.I)
_ROOT = '<div id="root"></div>'


def inject(index_html: str, r: Rendered) -> str:
    """The app shell with this page's head and content. Everything the shell already says about the page is replaced, so there is one title, one description, one set of tags."""
    page = _TITLE.sub("", index_html, count=1)
    page = _STRIP.sub("", page)
    page = page.replace("</head>", r.head + "\n</head>", 1)
    if r.body and _ROOT in page:
        page = page.replace(_ROOT, f'<div id="root">{r.body}</div>', 1)
    return page


# ---------------------------------------------------------------------------------------------------------------- sitemap

def sitemap_xml(base: str, companies: List[Tuple[str, Optional[date]]], today: date) -> str:
    seen = set()
    rows: List[str] = []

    def add(path: str, lastmod: Optional[date], freq: str, prio: str) -> None:
        if path in seen:
            return
        seen.add(path)
        rows.append(f"<url><loc>{_e(base + ('/' + path if path else '/'))}</loc><lastmod>{(lastmod or today).isoformat()}</lastmod><changefreq>{freq}</changefreq><priority>{prio}</priority></url>")

    for p in PUBLIC:
        if p == "pricing":
            continue                                  # the same page as /plans, which is the one listed
        add(p, today, "weekly" if p in ("", "news", "results", "ipo", "fii-dii", "macro") else "monthly", "1.0" if not p else "0.8")
    for tid in TERMS:
        add(f"glossary/{tid}", None, "yearly", "0.5")
    for sym, updated in companies:
        if SYMBOL.match(sym):
            add(f"stocks/{sym}", updated, "weekly", "0.6")
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows[:49000]) + "\n</urlset>\n"


_cache: Dict[str, Tuple[float, Optional[Tuple[str, Optional[str]]]]] = {}


def remember(symbol: str, value: Optional[Tuple[str, Optional[str]]], ttl: float = 600.0) -> None:
    if len(_cache) > 4000:
        _cache.clear()
    _cache[symbol] = (time.monotonic() + ttl, value)


def recall(symbol: str) -> Tuple[bool, Optional[Tuple[str, Optional[str]]]]:
    hit = _cache.get(symbol)
    if hit and hit[0] > time.monotonic():
        return True, hit[1]
    return False, None
