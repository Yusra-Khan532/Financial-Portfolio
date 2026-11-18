"""The tools Ask FinLit AI may use: the FinLit MCP tools (finlit/mcp/tools.py: quotes, financials, ratios, shareholding, results, screener, flows, IPOs,
funds, ETFs, data freshness), plus three that read the member's own lists. Each one asks the website's routes as the member (ask/gateway.py), so a plan
sees here exactly what it sees on the website. One fixed list for every plan keeps the prompt cache warm; the plan is enforced by the routes."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List

from ..mcp.gateway import Gateway, ToolError
from ..mcp.schema import ArgError, validate
from ..mcp.server import envelope
from ..mcp.tools import TOOLS as MCP_TOOLS, Out, Tool

# A tool result is kept under about 3,000 tokens (the MCP server allows 100 KB): smaller is faster and cheaper, and the biggest list is cut with a note.
RESULT_CAP = 12_000
SOURCE_MINE = "The member's own saved lists on FinLit, read with FinLit's figures for each company"

# The MCP descriptions speak of what "a visitor" or "the free website" sees; for a member the routes return their plan's view, so say that instead.
DESCRIBE = {
    "get_ratios": "Margins, returns (ROE, ROCE), valuation and the other ratios the FinLit website shows on this member's plan, with the period each one is for, plus a short history.",
    "get_finlit_score": "The FinLit IQ financial-health score (0 to 100) and its pillars, where this member's plan includes it. If the plan does not include it, the result says so.",
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


MINE = [
    Tool("get_my_portfolio", "My equity portfolio", "The shares in this member's own FinLit Equity portfolio, with the quantity they saved (if any) and FinLit's figures for each "
         "(price, day change, size, sector, score on their plan). Use it for any question about 'my portfolio', 'my shares' or 'my holdings'.", {}, get_my_portfolio),
    Tool("get_my_funds", "My mutual funds", "This member's own mutual fund portfolio on FinLit: the funds, units, value, and how the funds are spread and overlap, as their plan shows it.", {}, get_my_funds),
    Tool("get_my_watchlists", "My watchlists", "The names of this member's watchlists on FinLit and the companies in each.", {}, get_my_watchlists),
]
TOOLS: List[Tool] = [*MCP_TOOLS, *MINE]
BY_NAME: Dict[str, Tool] = {t.name: t for t in TOOLS}
# What the panel says while a tool runs ("Reading RELIANCE's ratios…")
DOING = {"search_stocks": "Finding the company", "get_stock_quote": "Reading the latest price", "get_batch_quotes": "Reading the latest prices",
         "get_company_profile": "Reading the company profile", "get_financials": "Reading the financial statements", "get_ratios": "Reading the ratios",
         "get_shareholding": "Reading the shareholding", "get_price_history": "Reading the price history", "get_finlit_score": "Reading the FinLit IQ",
         "get_quarter_results": "Reading the results", "get_results_calendar": "Reading the results calendar", "screen_stocks": "Running the screener",
         "get_market_overview": "Reading the market overview", "get_fii_dii_flows": "Reading FII and DII flows", "get_ipo_calendar": "Reading the IPO calendar",
         "search_funds": "Finding the fund", "get_fund_details": "Reading the fund details", "list_etfs": "Reading the ETF list", "get_etf": "Reading the ETF",
         "get_data_freshness": "Checking how fresh the data is", "get_my_portfolio": "Reading your portfolio", "get_my_funds": "Reading your mutual funds",
         "get_my_watchlists": "Reading your watchlists"}


def definitions() -> List[Dict[str, Any]]:
    """The tool list sent to Claude: always the same order and text, so the cached prompt prefix stays valid."""
    out = []
    for t in TOOLS:
        schema = t.listing()["inputSchema"]
        out.append({"name": t.name, "description": DESCRIBE.get(t.name, t.description), "input_schema": schema})
    return out


def label(name: str, args: Dict[str, Any]) -> str:
    what = DOING.get(name, "Reading FinLit data")
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
        out = await asyncio.wait_for(tool.handler(gw, clean), timeout=20)
        env = envelope(name, out, notes, RESULT_CAP)
    except ArgError as e:
        return {"text": f"Invalid arguments: {e}", "error": True}
    except ToolError as e:
        return {"text": str(e), "error": True}
    except asyncio.TimeoutError:
        return {"text": "The data service took too long to answer.", "error": True}
    env.pop("disclaimer", None)      # the answer carries the disclaimer once; it need not be repeated in every tool result
    text = json.dumps(env, separators=(",", ":"), ensure_ascii=False, default=str)
    for a, b in FOR_MEMBER:
        text = text.replace(a, b)
    return {"text": text, "error": False}
