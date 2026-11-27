"""The tools Ask FinLit AI may use: the FinLit MCP tools (finlit/mcp/tools.py: quotes, financials, ratios, shareholding, results, screener, flows, IPOs,
funds, ETFs, data freshness), plus three that read the member's own lists. Each one asks the website's routes as the member (ask/gateway.py), so a plan
sees here exactly what it sees on the website. One fixed list for every plan keeps the prompt cache warm; the plan is enforced by the routes."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List

from ..mcp.gateway import Gateway, ToolError
from ..mcp.schema import SYMBOL_SCHEMA, ArgError, clean_symbol, validate
from ..mcp.server import envelope
from ..mcp.tools import TOOLS as MCP_TOOLS, Out, Tool
from . import pages as P
from . import prism_meaning   # task #382: what each FinLit Prism figure means
from . import sectors as S   # task #349 PR 5: Sector Pulse and Sector Rotation

# A tool result is kept under about 3,000 tokens (the MCP server allows 100 KB): smaller is faster and cheaper, and the biggest list is cut with a note.
RESULT_CAP = 12_000
SOURCE_MINE = "The member's own saved lists on FinLit, read with FinLit's figures for each company"

# The MCP descriptions speak of what "a visitor" or "the free website" sees; for a member the routes return their plan's view, so say that instead.
DESCRIBE = {
    "get_ratios": "Margins, returns (ROE, ROCE), valuation and the other ratios the FinLit website shows on this member's plan, with the period each one is for, plus a short history.",
    "get_finlit_score": "FinLit Prism, FinLit's only company score (0 to 100, with its label and four parts), where this member's plan includes it. If the plan does not include it, the result says so.",
    "get_quarter_results": "Companies that announced results for a quarter or on a date, with status and the figures this member's plan shows.",
    "screen_stocks": "Filter listed companies on the FinLit screener metrics (market cap, price, P/E, ROE, ROCE, margins, growth, debt, returns). Each filter is {min, max} in the metric's unit.",
}


# The MCP notes speak to an anonymous visitor; here the routes answered as the member, so the same notes are said for the member's plan.
FOR_MEMBER = (("Only the ratios the website shows to a visitor without an account are included.", "Only the ratios this member's plan includes are shown."),
              (" and is not available through this free server", ", which this member's plan does not include"),
              (" It is not available through this free server.", " It is not included in this member's plan."))


async def _my_holdings(gw: Gateway) -> List[Dict[str, Any]]:
    state = await gw.json("/api/me/state", subject="Your saved lists")
    rows = ((state or {}).get("portfolio") or {}).get("holdings") or []
    out: Dict[str, Dict[str, Any]] = {}
    for h in rows:
        sym = str(h.get("symbol") or "").upper()
        if not sym:
            continue
        cur = out.setdefault(sym, {"symbol": sym, "quantity": None})
        if h.get("owned") and (h.get("qty") or 0) > 0:
            cur["quantity"] = (cur["quantity"] or 0) + h["qty"]
    return list(out.values())


async def get_my_portfolio(gw: Gateway, a: Dict[str, Any]) -> Out:
    held = await _my_holdings(gw)
    if not held:
        return Out({"holdings": [], "count": 0}, source=SOURCE_MINE, routes=["/api/me/state"],
                   notes=["The member has no shares in their Equity portfolio on FinLit yet (Workspace > Equity portfolio)."])
    ov = await gw.json("/api/portfolio/overview", method="POST", body={"symbols": [h["symbol"] for h in held]}, subject="Your Equity portfolio")
    by = {r.get("symbol"): r for r in (ov or {}).get("holdings") or []}
    rows = [{**h, "figures": by.get(h["symbol"])} for h in held]
    notes = [] if any(h["quantity"] for h in held) else ["No quantities are saved, so the list is read as names only (no amounts or weights)."]
    return Out({"model": (ov or {}).get("model"), "holdings": rows, "count": len(rows)}, source=SOURCE_MINE, routes=["/api/me/state", "/api/portfolio/overview"], notes=notes)


async def get_my_funds(gw: Gateway, a: Dict[str, Any]) -> Out:
    data = await gw.json("/api/me/mf-portfolio", subject="Your mutual fund portfolio")
    return Out(data, source=SOURCE_MINE, routes=["/api/me/mf-portfolio"])


async def get_my_watchlists(gw: Gateway, a: Dict[str, Any]) -> Out:
    state = await gw.json("/api/me/state", subject="Your saved lists")
    wl = (state or {}).get("watchlist") or {}
    lists = [{"name": x.get("name"), "symbols": x.get("symbols") or x.get("items") or []} for x in wl.get("lists") or []]
    return Out({"lists": lists}, source=SOURCE_MINE, routes=["/api/me/state"],
               notes=[] if lists else ["The member has no watchlists on FinLit yet."])


# ------------------------------------------------------------------ the company page, as the member sees it (task #211 rework, 18 Nov 2026)
# The MCP tools were made for an anonymous visitor: they have no FinLit Prism and none of the company page's own sections (peer rank, NSE's four
# levels, F&O and margin trading, company brief, ownership insights, dividends ...). These read the same routes the company page reads, as the member.
SYM = {"symbol": dict(SYMBOL_SCHEMA)}
SOURCE_PAGE = "FinLit's company page: the same figures, ratings and texts the member sees on finlitventures.com/stocks/<symbol> on their plan"


async def _try(coro) -> Any:
    """One part of a card: its data, or {"unavailable": reason} (a plan the member does not have, a part not built for this company ...)."""
    try:
        return await coro
    except ToolError as e:
        return {"unavailable": str(e)}


def _prism_card(p: Any) -> Any:
    s = (p or {}).get("summary") if isinstance(p, dict) else None
    if not s:
        return p if isinstance(p, dict) and p.get("unavailable") else {"unavailable": "No FinLit Prism report is stored for this company yet."}
    tech = s.get("technical") or {}
    return {"score": s.get("final"), "label": s.get("label"), "status": s.get("status"), "confidence": s.get("confidence"), "parts": s.get("parts"),
            "technical": {k: tech.get(k) for k in ("shortTerm", "longTerm", "alignment", "asOf") if k in tech} or tech or None,
            "topPros": s.get("topPros"), "topCons": s.get("topCons"), "calculatedAt": s.get("generatedAt"), "freshness": s.get("freshness")}


async def _prism(gw: Gateway, sym: str) -> Any:
    return _prism_card(await _try(gw.json("/api/prism/reports/latest", {"symbol": sym, "view": "summary"}, subject=f"FinLit Prism for {sym}")))


async def get_company_card(gw: Gateway, a: Dict[str, Any]) -> Out:
    sym = clean_symbol(a["symbol"])
    summary, tax, lead, trading, prism = await asyncio.gather(
        gw.json(f"/api/stocks/{sym}", subject=f"The company {sym}"), _try(gw.json(f"/api/taxonomy/company/{sym}", subject="The classification")),
        _try(gw.json(f"/api/stocks/{sym}/leadership", subject="The peer comparison")), _try(gw.json(f"/api/stocks/{sym}/trading", subject="F&O and margin trading")),
        _prism(gw, sym))
    prof = dict(summary.get("profile") or {})
    if isinstance(prof.get("description"), str) and len(prof["description"]) > 500:
        prof["description"] = prof["description"][:500] + "…"
    card = {"symbol": sym, "profile": prof, "classification": tax, "quote": summary.get("quote"), "range52": summary.get("range52"),
            "finlitPrism": prism, "keyMetrics": summary.get("keyMetrics"), "returns": summary.get("returns"),
            "strengths": summary.get("strengths"), "watchouts": summary.get("watchouts"),
            "vsPeers": lead, "tradingFacts": trading, "statementBasis": (summary.get("meta") or {}).get("statement")}
    return Out(card, as_of=(summary.get("meta") or {}).get("generatedAt"), source=SOURCE_PAGE,
               routes=[f"/api/stocks/{sym}", f"/api/taxonomy/company/{sym}", f"/api/stocks/{sym}/leadership", f"/api/stocks/{sym}/trading", "/api/prism/reports/latest"],
               notes=["finlitPrism is FinLit's only company score (0 to 100), shown at the top of the company page on a plan that has it. "
                      "A part marked unavailable says why (for example, not included in the member's plan)."])


async def get_finlit_prism(gw: Gateway, a: Dict[str, Any]) -> Out:
    sym = clean_symbol(a["symbol"])
    card = await _prism(gw, sym)
    # Task #382: what each figure means, read off the method's own bands and words (ask/prism_meaning), so an explanation is never made up.
    sheet = prism_meaning.meaning(card)
    return Out({"symbol": sym, "finlitPrism": card, **({"whatEachFigureMeans": sheet} if sheet else {})},
               as_of=card.get("calculatedAt") if isinstance(card, dict) else None, source=SOURCE_PAGE, routes=["/api/prism/reports/latest"])


SECTIONS = {   # name -> (route, what it is)
    "peers": ("/api/stocks/{s}/peers", "the companies FinLit compares it with, and their figures"),
    "vs_peers": ("/api/stocks/{s}/leadership", "its rank among its NSE peers and against the sector index over 12 months"),
    "dividends_and_actions": ("/api/stocks/{s}/events", "dividends by year, dividend yield, splits, bonuses and other corporate actions, announcements"),
    "segments": ("/api/stocks/{s}/segments", "revenue and profit by business segment"),
    "ownership_insights": ("/api/stocks/{s}/ownership-insights", "what changed in promoter, FII, DII and public holdings, and pledges"),
    "company_brief": ("/api/stocks/{s}/brief", "FinLit's written brief of the company"),
    "prism_history": ("/api/prism/history?symbol={s}", "how the FinLit Prism score and its parts have moved over time (Gold)"),
    "forecast": ("/api/outlook/{s}", "FinLit's profit and revenue forecasting for the company (Gold)"),
    "macro_outlook": ("/api/stocks/{s}/macro-outlook", "how the economy's signals bear on the company's sector"),
    "trading_facts": ("/api/stocks/{s}/trading", "F&O lot size, margin trading eligibility, circuit limits, surveillance"),
}


async def get_company_section(gw: Gateway, a: Dict[str, Any]) -> Out:
    sym = clean_symbol(a["symbol"])
    route = SECTIONS[a["section"]][0].format(s=sym)
    path, _, q = route.partition("?")
    params = dict(x.split("=", 1) for x in q.split("&")) if q else None
    data = await gw.json(path, params, subject=f"The {a['section'].replace('_', ' ')} section for {sym}")
    if a["section"] == "prism_history" and isinstance(data, dict) and isinstance(data.get("points"), list):
        data = {**data, "points": data["points"][-60:]}                 # the latest 60 readings are plenty for a chat answer
    return Out({"symbol": sym, "section": a["section"], "data": data}, source=SOURCE_PAGE, routes=[path])


PAGE = [
    Tool("get_company_card", "Company card", "Everything at the top of a company's FinLit page in one call: name, NSE classification (macro sector, sector, industry, basic "
         "industry), market cap, price and day change, 52-week range, FinLit Prism (Gold rating, 0 to 100, with its parts and short- and long-term technical "
         "view), key ratios, returns, strengths and watch-outs, rank against NSE peers, F&O and margin trading. "
         "Use it first for almost any question about one company.", SYM, get_company_card, ["symbol"]),
    Tool("get_finlit_prism", "FinLit Prism", "FinLit Prism for one company: the score (0 to 100) and its label (for example Strong), the four parts (fundamental "
         "and growth, valuation, quality, risk), the short- and long-term technical view, the main positives and negatives, and when it was calculated. "
         "Also called the Prism score, Prism rating or the advanced model. Gold plan; other plans get a message saying so.", SYM, get_finlit_prism, ["symbol"]),
    Tool("get_company_section", "Company page section", "One section of a company's FinLit page: " + "; ".join(f"{k}: {v}" for k, v in SECTIONS.items()) + ".",
         {**SYM, "section": {"type": "string", "enum": list(SECTIONS), "description": "Which section"}}, get_company_section, ["symbol", "section"]),
]

MINE = [
    Tool("get_my_portfolio", "My equity portfolio", "The shares in this member's own FinLit Equity portfolio, with the quantity they saved (if any) and FinLit's figures for each "
         "(price, day change, size, sector, score on their plan). Use it for any question about 'my portfolio', 'my shares' or 'my holdings'.", {}, get_my_portfolio),
    Tool("get_my_funds", "My mutual funds", "This member's own mutual fund portfolio on FinLit: the funds, units, value, and how the funds are spread and overlap, as their plan shows it.", {}, get_my_funds),
    Tool("get_my_watchlists", "My watchlists", "The names of this member's watchlists on FinLit and the companies in each.", {}, get_my_watchlists),
]
TOOLS: List[Tool] = [*PAGE, *P.TOOLS, *S.TOOLS, *MCP_TOOLS, *MINE]   # P: the other FinLit pages (task #218); S: Sector Pulse and Rotation (task #349)
BY_NAME: Dict[str, Tool] = {t.name: t for t in TOOLS}
# What the panel says while a tool runs ("Reading RELIANCE's ratios…")
DOING = {"search_stocks": "Finding the company", "get_stock_quote": "Reading the latest price", "get_batch_quotes": "Reading the latest prices",
         "get_company_profile": "Reading the company profile", "get_financials": "Reading the financial statements", "get_ratios": "Reading the ratios",
         "get_shareholding": "Reading the shareholding", "get_price_history": "Reading the price history", "get_finlit_score": "Reading FinLit Prism",
         "get_quarter_results": "Reading the results", "get_results_calendar": "Reading the results calendar", "screen_stocks": "Running the screener",
         "get_market_overview": "Reading the market overview", "get_fii_dii_flows": "Reading FII and DII flows", "get_ipo_calendar": "Reading the IPO calendar", "get_bulk_block_deals": "Reading NSE's bulk and block deals",
         "search_funds": "Finding the fund", "get_fund_details": "Reading the fund details", "list_etfs": "Reading the ETF list", "get_etf": "Reading the ETF",
         "get_data_freshness": "Checking how fresh the data is", "get_my_portfolio": "Reading your portfolio", "get_my_funds": "Reading your mutual funds",
         "get_my_watchlists": "Reading your watchlists", "get_company_card": "Reading the company page", "get_finlit_prism": "Reading FinLit Prism",
         "get_company_section": "Reading the company page", **P.DOING, **S.DOING}


# The web, for what FinLit's data does not hold (founder, 18 Nov 2026: answer every question, as Claude does, in a few simple lines). Run by the provider;
# at most two searches an answer keeps it fast and its cost small, and the location makes results Indian first.
WEB_SEARCH = {"type": "web_search_20250305", "name": "web_search", "max_uses": 2,
              "user_location": {"type": "approximate", "country": "IN", "timezone": "Asia/Kolkata"}}


def definitions() -> List[Dict[str, Any]]:
    """The tool list sent to Claude: byte for byte the same for every question, member and plan, so the cached prompt prefix (tools come before
    the instructions) is one entry for all. FinLit's tools first, the web last. Task #349: the web search used to carry the question type's
    `allowed_domains` (task #253), which made one cache entry per type and re-sent the whole prefix uncached; the type's sites now go in the note
    with the question (routing.note), after the cached part."""
    out: List[Dict[str, Any]] = []
    for t in TOOLS:
        schema = t.listing()["inputSchema"]
        out.append({"name": t.name, "description": DESCRIBE.get(t.name, t.description), "input_schema": schema})
    out.append(dict(WEB_SEARCH))
    return out


def label(name: str, args: Dict[str, Any]) -> str:
    what = DOING.get(name, "Reading FinLit data")
    if name == "read_company_document" and isinstance(args, dict) and args.get("document") in P.DOC_KINDS:   # task #254: which document
        what = f"Reading the {P.DOC_KINDS[args['document']].lower()}"
    sym = args.get("symbol") if isinstance(args, dict) else None
    return f"{what} ({str(sym).upper()[:20]})" if isinstance(sym, str) and sym else what


async def run(gw: Gateway, name: str, args: Any) -> Dict[str, Any]:
    """One tool call -> the tool_result content for Claude: the figures with their source and date, or a plain-words error (is_error)."""
    tool = BY_NAME.get(name)
    if tool is None:
        return {"text": f"There is no tool called {name[:60]}.", "error": True}
    if not isinstance(args, dict):
        return {"text": "The arguments must be an object.", "error": True}
    try:
        clean, notes = validate(args, tool.listing()["inputSchema"])
        out = await asyncio.wait_for(tool.handler(gw, clean), timeout=P.TIMEOUTS.get(name, 20))
        env = envelope(name, out, notes, RESULT_CAP)
    except ArgError as e:
        return {"text": f"Invalid arguments: {e}", "error": True}
    except ToolError as e:
        return {"text": str(e), "error": True}
    except asyncio.TimeoutError:
        return {"text": "The data service took too long to answer.", "error": True}
    except Exception:      # a fault inside one route must not end the answer: the model is told, and says it could not read it
        import logging
        logging.getLogger("finlit.ask").exception("ask tool %s failed", name)
        return {"text": "This data could not be read just now.", "error": True}
    env.pop("disclaimer", None)      # the answer carries the disclaimer once; it need not be repeated in every tool result
    text = json.dumps(env, separators=(",", ":"), ensure_ascii=False, default=str)
    for a, b in FOR_MEMBER:
        text = text.replace(a, b)
    return {"text": text, "error": False}
