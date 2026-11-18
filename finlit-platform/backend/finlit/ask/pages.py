"""FinLit AI reads FinLit's own pages (task #218, 18 Nov 2026: "aligning FinLit AI with our pages like stock screener, Prism report, company report,
advanced stock screener, superinvestor, portfolio, Indian economy, FII/DII flows, results calendar, glossary, insights and blogs, news and filings; read
the investor presentation in the Documents section; also aligned with the web pages").

Each tool reads the same route the page reads, as the member (ask/gateway.py), so a plan sees here what it sees on the website. `page_links` turns the
tools an answer used into links to those pages, shown under the answer ("Read on FinLit"). The documents rule (`doc_type`) is the Documents page's own
(frontend lib/feed.ts docType), so the AI and the page agree on what an investor presentation is."""

from __future__ import annotations

import asyncio
import json
import re
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from ..discovery.keywords import BUCKETS as DISCOVERY_THEMES
from ..mcp.gateway import Gateway, ToolError
from ..mcp.schema import SYMBOL_SCHEMA, clean_symbol
from ..mcp.tools import Out, Tool

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
        one = await gw.json(f"/api/superinvestors/{hit['key']}", subject=f"The portfolio of {hit.get('name')}")
        return Out({"investor": hit.get("name"), "key": hit["key"], "portfolio": one}, as_of=(lst or {}).get("asOf"), source=SOURCE_SI,
                   routes=[f"/api/superinvestors/{hit['key']}"])
    rows = [{k: i.get(k) for k in ("key", "name", "kind", "companies", "valueCr", "top", "changes")} for i in investors]
    rows.sort(key=lambda r: r.get("valueCr") or 0, reverse=True)
    return Out({"count": (lst or {}).get("count"), "investors": rows[: a.get("limit", 30)], "covered": (lst or {}).get("covered"), "emptyWhy": (lst or {}).get("emptyWhy")},
               as_of=(lst or {}).get("asOf"), source=SOURCE_SI, routes=["/api/superinvestors"],
               notes=["Largest first, by the value of the holdings FinLit holds for each. valueCr is in Rs crore."])


# ------------------------------------------------------------------------------------------------ India economy (/macro)
SOURCE_MACRO = "FinLit's India economy page (finlitventures.com/macro): MoSPI, RBI and the other official publishers named with each figure"


def macro_digest(m: Dict[str, Any]) -> Dict[str, Any]:
    """The page's own headline cards, insights, policy rates, reserves and inflation by spending group, each with its date; not the long histories."""
    divs = []
    for d in m.get("cpiDivisions") or []:
        pts = d.get("points") or []
        if pts:
            divs.append({"group": d.get("label"), "latest": pts[-1][1], "month": pts[-1][0], "yearBefore": pts[-13][1] if len(pts) >= 13 else None})
    res = (m.get("reserves") or {})
    cards = [{k: v for k, v in c.items() if k != "spark"} for c in m.get("cards") or []]     # the cards' small charts are long histories; the reading is enough
    return {"updatedAt": m.get("updatedAt"), "headline": cards, "insights": m.get("insights"), "inflationTarget": m.get("targetWatch"),
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
DOC_KINDS = {"investor_presentation": "Investor presentation", "annual_report": "Annual report", "call_transcript": "Call transcript"}
DOC_TIMEOUT = 30.0          # seconds to download and read one PDF
MAX_PAGES_READ = 120
_texts: "OrderedDict[str, List[str]]" = OrderedDict()     # link -> page texts; the newest 24 documents stay in memory
_text_lock = asyncio.Lock()


def best_pages(pages: List[str], question: str, n: int = 4, chars: int = 9000) -> List[Tuple[int, str]]:
    """The pages that hold the question's words most often (with the first page, which names the deck), in page order, within `chars`."""
    words = [w for w in re.findall(r"[a-z0-9]+", (question or "").lower()) if len(w) > 3 and w not in {"what", "does", "with", "from", "about", "this",
             "that", "latest", "investor", "presentation", "annual", "report", "transcript", "company", "their", "there", "which", "say", "says", "tell"}]
    scored = sorted(range(len(pages)), key=lambda i: -sum(pages[i].lower().count(w) for w in words)) if words else list(range(len(pages)))
    keep = sorted({0, *scored[: n if words else n + 2]})
    out, used = [], 0
    for i in keep:
        t = re.sub(r"[ \t]+", " ", pages[i]).strip()
        if not t:
            continue
        t = t[: max(0, chars - used)]
        if not t:
            break
        out.append((i + 1, t))
        used += len(t)
    return out


async def _pages_of(link: str) -> List[str]:
    async with _text_lock:
        if link in _texts:
            _texts.move_to_end(link)
            return _texts[link]
    from ..earnings.transcripts import DOC_PDF_BYTES, Blocked, FetchFailed, Fetcher, extract_pages
    f = Fetcher(budget=4, pause=0.0)
    try:
        pdf = await f.pdf(link, DOC_PDF_BYTES)
    except (Blocked, FetchFailed) as e:
        raise ToolError(f"The exchange did not give the file just now ({e}). It can be opened from {link}") from None
    finally:
        await f.aclose()
    pages = await asyncio.to_thread(extract_pages, pdf, MAX_PAGES_READ)
    async with _text_lock:
        _texts[link] = pages
        while len(_texts) > 24:
            _texts.popitem(last=False)
    return pages


async def read_company_document(gw: Gateway, a: Dict[str, Any]) -> Out:
    sym, want = clean_symbol(a["symbol"]), DOC_KINDS[a["document"]]
    data = await gw.json("/api/feed", {"kind": "document", "symbol": sym, "limit": 150}, subject=f"The documents of {sym}")
    docs = [r for r in (_feed_row(i) for i in (data or {}).get("items") or []) if r["type"] == want and r.get("link")]
    if not docs:
        return Out({"symbol": sym, "document": want, "found": False}, source=SOURCE_FEED, routes=["/api/feed"],
                   notes=[f"FinLit's Documents page holds no {want.lower()} for {sym} yet (filings appear as the company's announcements are loaded)."])
    doc = docs[0]                                     # the newest
    try:
        pages = await asyncio.wait_for(_pages_of(doc["link"]), timeout=DOC_TIMEOUT)
    except asyncio.TimeoutError:
        raise ToolError(f"The exchange did not send the {want.lower()} ({doc['title']}, filed {doc['date']}) in time. It can be opened from {doc['link']}") from None
    base = {"symbol": sym, "document": want, "title": doc["title"], "filed": doc["date"], "link": doc["link"], "pages": len(pages)}
    if not any(p.strip() for p in pages):
        return Out({**base, "text": []}, as_of=doc["date"], source=f"{SOURCE_FEED}; the file itself, from the exchange archive", routes=["/api/feed"],
                   notes=["The file has no readable text (it is a scan or images only); it can be opened from the link."])
    return Out({**base, "text": [{"page": n, "text": t} for n, t in best_pages(pages, a.get("question") or "")]}, as_of=doc["date"],
               source=f"{SOURCE_FEED}; the file itself, read from the exchange archive", routes=["/api/feed", doc["link"]],
               notes=["Quote what the document says and name its page; it is the company's own presentation of itself, not FinLit's view."])


# ------------------------------------------------------------------------------------------------ the Basic and Advanced stock screeners (FinLit IQ / FinLit Prism)
SOURCE_SCORES = "FinLit's Basic stock screener (FinLit IQ) and Advanced stock screener (FinLit Prism) pages, as this member's plan shows them"
SCORE_FIELDS = {"iq": ("overall", "band"), "prism": ("prism_final", "prism_label")}


def _stem(w: str) -> str:
    """"banks" and "bank" are the same word; "banking" is not."""
    return w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w


def screen_rows(rows: List[Dict[str, Any]], a: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], int]:
    field, label = SCORE_FIELDS[a["score"]]
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
    field = SCORE_FIELDS[a["score"]][0]
    if rows and not any(r.get(field) is not None for r in rows):
        plan = "Gold" if a["score"] == "prism" else "Silver"
        raise ToolError(f"The {'FinLit Prism' if a['score'] == 'prism' else 'FinLit IQ'} scores of the screener are part of the {plan} plan, which this member's plan does not include.")
    got, total = screen_rows(rows, a)
    return Out({"score": "FinLit Prism (0 to 100)" if a["score"] == "prism" else "FinLit IQ (0 to 100)", "matched": total, "rows": got},
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
                      "stage: the most advanced stage the company's own sentences show (Operating, Under execution, Planned, MoU / pilot). tone: positive "
                      "minus negative finance words of the presentation (-1 to 1). filings: exchange filings of the last 90 days by event type, theme and "
                      "tone (+1, 0, -1). sector: NSE's macro sector, sector and industry. Describe these; never call a company a pick."])


TOOLS: List[Tool] = [
    Tool("get_superinvestors", "Superinvestor portfolios", "FinLit's Superinvestor portfolios page: named investors (people and firms) who hold 1% or more of listed companies, "
         "from the companies' filings. Without `investor`: the list, largest first, with their top holdings and what changed. With `investor` (a name such as "
         "Ashish Kacholia or Rakesh Jhunjhunwala): that investor's holdings in full. Silver and Gold.",
         {"investor": {"type": "string", "maxLength": 80, "description": "An investor's name, if the question is about one"},
          "limit": {"type": "integer", "minimum": 1, "maximum": 60, "default": 30, "description": "How many investors in the list"}}, get_superinvestors),
    Tool("get_india_economy", "India economy", "FinLit's India economy page: inflation (CPI, WPI, by spending group), GDP, IIP, jobs, the RBI's policy rates and decisions, "
         "the rupee, forex reserves, money supply and crude oil, each with its period and publisher, plus the page's own plain-words insights.", {}, get_india_economy),
    Tool("lookup_glossary", "Glossary", "FinLit's Glossary: what a term means, why it matters, how to use it, the formula, and how FinLit uses it (for example P/E, ROCE, "
         "FinLit Prism, FundPulse, free cash flow). Use it for 'what is', 'what does ... mean' questions so the answer uses FinLit's own wording.",
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
    Tool("read_company_document", "Read a company document", "Reads the text of a company's newest investor presentation, annual report or earnings-call transcript "
         "from FinLit's Documents page (the file the company filed with the exchange) and returns the pages that answer the question, with the page numbers "
         "and the link. Use it for 'what does the investor presentation say about ...', the company's own guidance, plans, segment or project details.",
         {"symbol": dict(SYMBOL_SCHEMA), "document": {"type": "string", "enum": list(DOC_KINDS), "default": "investor_presentation"},
          "question": {"type": "string", "maxLength": 200, "description": "What to look for in the document"}}, read_company_document, ["symbol"]),
    Tool("get_discovery", "Discovery", "FinLit AI's Discovery section: companies grouped by the themes their newest investor presentation talks about (AI, defence, "
         "solar, batteries, data centres, semiconductors, EV, nuclear, space and drones, and more: 21 themes), each with its keywords, the sentences that hold figures "
         "and the presentation's link, the stage (operating, under execution, planned, MoU / pilot), the tone of its words, its NSE sector, and the "
         "company's recent exchange filings by event and tone. Without arguments: the themes and their counts, sectors and filings. With `theme`: that theme's companies. With `symbol`: one company's themes. "
         "Use it for 'which companies are into ...', 'companies working on ...', theme or sector-trend questions.",
         {"theme": {"type": "string", "enum": list(DISCOVERY_THEMES)},
          "symbol": dict(SYMBOL_SCHEMA, description="A company symbol (optional)"),
          "sector": {"type": "string", "maxLength": 80, "description": "An NSE macro sector, e.g. Industrials, Information Technology (optional)"},
          "limit": {"type": "integer", "minimum": 1, "maximum": 30, "default": 15}}, get_discovery),
    Tool("screen_by_finlit_score", "Score screeners", "FinLit's Basic stock screener (FinLit IQ, Silver) and Advanced stock screener (FinLit Prism, Gold): companies by their "
         "FinLit score, highest first, optionally within a score range, a sector or industry, and a minimum size. The member's plan decides which score they see.",
         {"score": {"type": "string", "enum": ["iq", "prism"], "description": "iq: FinLit IQ (Basic screener); prism: FinLit Prism (Advanced screener)"},
          "min": {"type": "number", "minimum": 0, "maximum": 100}, "max": {"type": "number", "minimum": 0, "maximum": 100},
          "sector": {"type": "string", "maxLength": 60, "description": "Words of an NSE sector or industry, e.g. Banks, IT, Pharmaceuticals"},
          "min_market_cap": {"type": "number", "minimum": 0, "description": "Rs crore"},
          "order": {"type": "string", "enum": ["asc", "desc"], "default": "desc"},
          "limit": {"type": "integer", "minimum": 1, "maximum": 30, "default": 15}}, screen_by_finlit_score, ["score"]),
]
TIMEOUTS = {"read_company_document": DOC_TIMEOUT + 5}
DOING = {"get_superinvestors": "Reading Superinvestor portfolios", "get_india_economy": "Reading the India economy page", "lookup_glossary": "Reading the Glossary",
         "get_insights_and_blogs": "Reading Insights & blog", "get_news_and_filings": "Reading News & filings",
         "read_company_document": "Reading the document", "screen_by_finlit_score": "Running the score screener", "get_discovery": "Reading Discovery"}


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
        elif name == "screen_by_finlit_score":
            add("/advanced-score-screener" if args.get("score") == "prism" else "/score-screener",
                "Advanced stock screener" if args.get("score") == "prism" else "Basic stock screener")
        elif name == "screen_stocks":
            add("/screener", "Stock screener")
        elif name == "get_fii_dii_flows":
            add("/fii-dii", "FII & DII flows")
        elif name in ("get_results_calendar", "get_quarter_results"):
            add("/results", "Results calendar")
        elif name == "get_ipo_calendar":
            add("/ipo", "IPO calendar")
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
