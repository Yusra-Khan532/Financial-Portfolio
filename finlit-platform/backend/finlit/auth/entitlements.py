"""What each plan may see, enforced on the server.

The website also locks features visually, but that is presentation only: anything a plan does not include is removed here,
before it leaves the API. Visitors and Basic accounts are treated the same. Responses that differ by plan are marked
`private` so no shared cache can hand a Gold response to someone else.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

RANK = {"basic": 0, "silver": 1, "gold": 2}
PLANS = tuple(RANK)

# The ratio history cards (every plan) read these five; the full multi-year table (Gold) reads all of them.
BASIC_HISTORY_KEYS = ("gross_margin", "operating_margin", "net_margin", "roe", "roce")
GOLD_RATIO_GROUPS = {"leverage", "liquidity", "efficiency", "quality", "shareholder"}
# Technical fields a Silver account may keep (the 50-day average and the 200-day gap show in the free stats row).
KEEP_TECHNICAL = ("price", "ema50", "vsEma200Pct")
# FinLit Prism figures on a screener row (Gold; the showcase companies stay open to everyone, as on the Prism page itself).
PRISM_FIELDS = ("prism_state", "prism_final", "prism_label", "prism_status", "prism_at", "prism_fundamental", "prism_valuation", "prism_quality", "prism_risk",
                "prism_st", "prism_lt", "prism_st_score", "prism_lt_score", "prism_tech_at")
MODEL_FIELDS = ("overall", "band", "pillar_quality", "pillar_growth", "pillar_profitability", "pillar_balance", "pillar_technical")
# Task #283 PR C (21 Nov 2026): FinLit IQ is retired and FinLit Prism is FinLit's only company score. The IQ job keeps writing its figures (hidden, for a
# rollback, 30 days), but no browser-facing answer carries them for any plan: the universe rows lose these fields, the stored report sections lose the
# blocks below (strip_retired_score), and every other route that read the IQ reads FinLit Prism or nothing.
RETIRED_ROW_FIELDS = MODEL_FIELDS + ("score_change", "strengths_count", "watchouts_count")
RETIRED_SUMMARY_KEYS = ("score", "thesis", "iqInputs")      # the IQ block, its written read (from the IQ's pillars) and its inputs
RETIRED_SECTIONS = ("summary", "ratios", "peers")
PEER_RETIRED = ("overall", "band")

LIMITS = {
    "basic": {"watchlist_lists": 0, "watchlist_symbols": 0, "screens": 3, "baskets": 3, "compare": 2, "holdings": 0, "mf_holdings": 0, "etf_holdings": 0, "earnings_calls_per_month": 0, "ai_questions_per_month": 0, "ai_summaries_per_month": 0},
    "silver": {"watchlist_lists": 3, "watchlist_symbols": 30, "screens": 20, "baskets": 20, "compare": 2, "holdings": 30, "mf_holdings": 30, "etf_holdings": 15, "earnings_calls_per_month": 0, "ai_questions_per_month": 50, "ai_summaries_per_month": 10},
    "gold": {"watchlist_lists": 50, "watchlist_symbols": 1000, "screens": 100, "baskets": 100, "compare": 4, "holdings": 500, "mf_holdings": 500, "etf_holdings": 15, "earnings_calls_per_month": 5, "ai_questions_per_month": 100, "ai_summaries_per_month": 10},
}


def has(plan: str, tier: str) -> bool:
    return RANK.get(plan, 0) >= RANK[tier]


VIEW_AS = ("basic", "silver", "gold")


def sees_all(ctx) -> bool:
    """An administrator sees every plan's features (founder, 14 Nov 2026), unless previewing one plan with "view as" (auth.service.current): then the
    request is served exactly as that plan. Admin tools (moderation, the admin pages, switched-off features) keep their own role check."""
    return getattr(ctx, "role", None) == "admin" and not (getattr(ctx, "extra", None) or {}).get("view_as")


def varies_by_plan(section: str) -> bool:
    return section in ("summary", "ratios", "segments", "stats") or section.startswith("price-")


def strip_retired_score(section: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """A stored report section without the retired FinLit IQ, for every plan (task #283 PR C). `data` is modified in place and returned.
    summary: no `score` (overall, band, the five pillars), `thesis` (the IQ's written read) or `iqInputs`; ratios: no `score` (the pillar drawer);
    peers: no peer's `overall` or IQ `band`."""
    if not isinstance(data, dict):
        return data
    if section == "summary":
        for k in RETIRED_SUMMARY_KEYS:
            data.pop(k, None)
        meta = data.get("meta")
        if isinstance(meta, dict):
            meta.pop("scoreModel", None)
    elif section == "ratios":
        data.pop("score", None)
        meta = data.get("meta")
        if isinstance(meta, dict):
            meta.pop("scoreModel", None)
    elif section == "peers":
        for item in data.get("items") or []:
            if isinstance(item, dict):
                for k in PEER_RETIRED:
                    item.pop(k, None)
        meta = data.get("meta")
        if isinstance(meta, dict):
            meta.pop("scoreModel", None)
    return data


def strip_retired_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """A screener row without the retired FinLit IQ's fields (task #283 PR C): a copy."""
    return {k: v for k, v in row.items() if k not in RETIRED_ROW_FIELDS}


def redact_section(section: str, data: Dict[str, Any], plan: str) -> Dict[str, Any]:
    """Return `data` with everything above `plan` removed. `data` is modified in place and returned."""
    if has(plan, "gold"):
        return strip_retired_score(section, data)
    silver = has(plan, "silver")
    strip_retired_score(section, data)     # the retired FinLit IQ goes for every plan (task #283 PR C)
    if section == "summary":
        if not silver:
            data["strengths"] = []
            data["watchouts"] = []
        data["returns"] = []   # "returns across every holding period" sits in the Gold Momentum card
    elif section == "ratios":
        history = data.get("history") or {}
        rows = history.get("rows") or {}
        history["rows"] = {k: v for k, v in rows.items() if k in BASIC_HISTORY_KEYS}
        vh = data.get("valuationHistory") or {}
        vh["rows"] = {}
        vh["periods"] = []
        latest = data.get("latest") or {}
        for group in data.get("groups", []):
            if group["id"] in GOLD_RATIO_GROUPS:
                for key in group["keys"][2:]:
                    latest.pop(key, None)
                group["keys"] = group["keys"][:2]
    elif section == "stats":
        if not silver:  # the price-statistics charts are a Silver feature
            data.clear()
            data["available"] = False
            data["locked"] = True
    elif section == "segments":
        data["segments"], data["latest"], data["periods"] = {}, [], []
        data.pop("insights", None)
    elif section.startswith("price-"):
        tech = data.get("technical")
        if tech:
            data["technical"] = {k: v for k, v in tech.items() if k in KEEP_TECHNICAL}
        series = data.get("series")
        if series:
            series.pop("ema200", None)
    return data


def redact_universe(rows: list, plan: str, showcase: set) -> list:
    """The screener list: the FinLit Prism figures are a Gold feature (the showcase company stays open as the free example). A locked field is present
    and null, so the browser cannot tell a locked value from a missing one. The retired FinLit IQ's fields are never sent, to any plan (task #283 PR C)."""
    rows = [strip_retired_row(r) for r in rows]
    if has(plan, "gold"):
        return rows
    out = []
    for r in rows:
        if r.get("symbol") in showcase:
            out.append(r)
            continue
        for f in PRISM_FIELDS:
            r[f] = None
        out.append(r)
    return out


# ------------------------------------------------------------------------------------------------ sector pages (docs/SECTORS.md, "Plans")
# Basic: the state and the breadth of every industry (the board, the industry page's chart and number cards, the study text).
# Silver: adds the ranked stock tables, the not-counted lists and the leader flags (counts and list).
# Gold:   adds the peer label column and the stock page's "Sector & peers" cards.
# A locked value is present and null, with `locked` naming the plan that opens it, so the page can say why it is blank and a browser cannot tell a locked value from a missing one.
SECTOR_LEADER_FLAGS = "silver"
SECTOR_STOCK_TABLE = "silver"
SECTOR_PEER_LABEL = "gold"
SECTOR_STOCK_CARDS = "gold"


def sector_plan(plan: str, role: str = "visitor") -> str:
    """The plan a sector request is served at: an administrator sees everything."""
    return "gold" if role == "admin" else (plan if plan in RANK else "basic")


def redact_sector_board(board: Dict[str, Any], plan: str) -> Dict[str, Any]:
    """The Sector Pulse board for `plan` (a copy). Basic loses the leader-flag counts and list."""
    out = dict(board)
    locked: Dict[str, str] = {}
    if not has(plan, SECTOR_LEADER_FLAGS):
        out["rows"] = [{**r, "leader_flags": None} for r in board.get("rows", [])]
        out["leader_flags"] = None
        locked["leader_flags"] = SECTOR_LEADER_FLAGS
    out["locked"] = locked
    out["plan"] = plan
    return out


def redact_rotation_map(rot: Dict[str, Any], plan: str) -> Dict[str, Any]:
    """The Rotation page for `plan` (a copy). Corners, ranks, paths and the study are open to every plan, like the states and breadth of the board;
    only the leader-flag count each row carries follows the board's rule (Silver)."""
    out = dict(rot)
    if not has(plan, SECTOR_LEADER_FLAGS):
        out["rows"] = [{**r, "leader_flags": None} for r in rot.get("rows", [])]
        out["locked"] = {"leader_flags": SECTOR_LEADER_FLAGS}
    else:
        out["locked"] = {}
    out["plan"] = plan
    return out


def redact_sector_industry(page: Dict[str, Any], plan: str) -> Dict[str, Any]:
    """One industry page for `plan` (a copy). Basic loses the stock tables and the leader-flag count; Silver loses the peer label column."""
    out = dict(page)
    locked: Dict[str, str] = {}
    if not has(plan, SECTOR_STOCK_TABLE):
        out["stocks"] = None
        out["not_counted"] = None
        out["leader_flags"] = None
        locked["stocks"] = locked["not_counted"] = locked["leader_flags"] = SECTOR_STOCK_TABLE
    elif not has(plan, SECTOR_PEER_LABEL):
        out["stocks"] = [{**s, "peer_label": None} for s in (page.get("stocks") or [])]
        locked["peer_label"] = SECTOR_PEER_LABEL
    out["locked"] = locked
    out["plan"] = plan
    return out


def redact_sector_stock(sector: Optional[Dict[str, Any]], symbol: str, plan: str) -> Dict[str, Any]:
    """A stock's place in its industry for `plan`. Below Gold only a teaser comes out: the stock's name and its industry's state (which every plan sees on the board)."""
    if has(plan, SECTOR_STOCK_CARDS):
        return {**(sector or {"symbol": symbol, "in_group": False, "group": None, "note": "Industry not yet classified."}), "locked": {}, "plan": plan}
    g = (sector or {}).get("group") or {}
    return {"symbol": symbol, "name": (sector or {}).get("name"), "industry": (sector or {}).get("industry"),
            "group": {k: g.get(k) for k in ("name", "slug", "kind", "state", "state_code", "meaning", "date")} if g else None,
            "rotation": (sector or {}).get("rotation"),            # the industry's corner and rank: the same group-level figures every plan sees on the Rotation page
            "disclaimer": (sector or {}).get("disclaimer"), "in_group": None, "locked": {"stock": SECTOR_STOCK_CARDS}, "plan": plan}
