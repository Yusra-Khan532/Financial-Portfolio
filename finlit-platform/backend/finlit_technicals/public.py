"""Public views of the Sector Pulse and Sector Rotation data (new in 2.4.2).

The nightly batch keeps writing the full files to site_data/ (rules, parameters, study figures, why each stock is
left out). Those are for FinLit's own team. Everything a visitor's browser receives goes through the functions here
first, so the pages and the APIs show what an industry is doing and how to read it, but not how the readings are
made: no thresholds, look-back lengths, weights, parameters, universe rules or study statistics.

    from finlit_technicals.public import public_board, public_industry, public_rotation, public_rotation_group, \
        public_stock_sector, public_summary_row

Each function takes the dict the library (or the batch file) produces and returns a new dict. It never changes its
input. Fields are copied from an allow-list, so a field added to the library later stays private until someone adds
it here on purpose.
"""
from __future__ import annotations

import copy
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Optional

__all__ = ["public_board", "public_industry", "public_rotation", "public_rotation_group", "public_stock_sector",
           "public_summary_row", "date_label", "HOW_TO_USE_PULSE", "HOW_TO_USE_ROTATION", "STATE_HOW", "CORNER_HOW",
           "DISCLAIMER_PULSE", "DISCLAIMER_ROTATION", "PRIVATE_WORDS"]

# --------------------------------------------------------------------------------------------- page text
DISCLAIMER_PULSE = ("Describes price and breadth data for NSE industries. Not a recommendation to buy, sell or hold any "
                    "security.")
DISCLAIMER_ROTATION = ("Describes past prices of NSE industry groups against the average industry. Not a "
                       "recommendation to buy, sell or hold any security.")
DATA_LINE = "NSE daily data, equal-weighted industry groups"

STATE_MEANING = {
    "neutral": "No washout, rebound or broad trend",
    "washout": "Heavily sold; no broad rebound yet",
    "thrust_c": "Broad rebound after a washout",
    "thrust_cap": "Broad rebound after a capitulation",
    "confirmed": "Most stocks trending up together",
    "fading": "A rebound or trend lost its breadth",
    "none": "Too few stocks for a reading",
}
STATE_HOW = {
    "washout": "Most of the industry has been sold. Watch for it to turn: most stocks turning up together. A "
               "sell-off can last weeks, so on its own it says nothing about timing.",
    "thrust_c": "Most of the industry's stocks turned up together after a sell-off. See whether it holds and moves "
                "on to Rising together, or turns to Losing steam.",
    "thrust_cap": "Most of the industry's stocks turned up together after a sell-off in which almost all of them "
                  "kept falling to the end. See whether it holds and moves on to Rising together, or turns to Losing steam.",
    "confirmed": "Most of the industry's stocks are trending up together. This describes a trend already under way.",
    "fading": "A rebound or uptrend has lost its breadth: fewer of the industry's stocks are taking part.",
    "neutral": "None of the other states applies today. The bars show how many stocks are above their averages.",
    "none": "Too few stocks pass the counting rules for a reading.",
}
CORNER_MEANING = {
    "ahead_gaining": "Ahead of the average industry over 6 months, and still gaining ground last month",
    "ahead_slowing": "Ahead over 6 months, but behind the average last month",
    "behind_slipping": "Behind the average industry over 6 months, and still losing ground last month",
    "behind_gaining": "Behind over 6 months, but ahead of the average last month",
}
CORNER_HOW = {
    "ahead_gaining": "Check breadth: a lead carried by most of the industry's stocks (Broad) is sturdier than one "
                     "carried by a few (Narrow).",
    "ahead_slowing": "Still ahead, but it lagged last month. See whether it turns back up or slips behind.",
    "behind_slipping": "Behind and still losing ground. Sector Pulse shows whether selling is broad (Sold off).",
    "behind_gaining": "Often a short bounce. A second month of gains, with broad breadth, makes it more than that.",
}
HOW_TO_USE_PULSE = [
    {"title": "Read the state", "text": "The coloured state shows where an industry is in its cycle: a broad sell-off "
     "(Sold off), a broad rebound (Bouncing back), an established trend (Rising together), or breadth breaking down (Losing steam)."},
    {"title": "Read the three bars", "text": "They show the share of the industry's counted stocks above their 9, 20 "
     "and 50-day averages: the short, medium and longer trend. Long bars mean most stocks are rising together."},
    {"title": "Check the market", "text": "The Nifty 50 against its 200-day average shows the backdrop. Industry "
     "rebounds have behaved differently in weak and strong markets."},
    {"title": "Open an industry", "text": "See a year of its breadth, every rebound and when it faded, and how each "
     "stock has done inside it. Leader flags mark stocks at 52-week highs while their industry is still well down."},
]
HOW_TO_USE_ROTATION = [
    {"title": "Find the corner", "text": "Each industry is compared with the average industry over 6 months (ahead or "
     "behind) and over the last month (gaining or slowing). The two answers put it in one of four corners."},
    {"title": "Read the corner with breadth", "text": "Broad means most of the industry's stocks are above their "
     "50-day average; Narrow means a few carry it. A broad lead has held up better than a narrow one."},
    {"title": "Watch the rank and its moves", "text": "The rotation rank puts every group on one list each week. The "
     "arrows show the places it moved in 1 and 4 weeks."},
    {"title": "Corners describe the past", "text": "A corner says how an industry has done, not what it will do. "
     "It is not a reason to act on its own."},
]
NOT_COUNTED_TEXT = ("These stocks trade on NSE but are left out of the readings because they are too small, too thinly "
                    "traded or too recently listed. The list is reviewed on the first trading day of each month.")
COUNTED_TEXT = ("Only liquid, established stocks are counted, so a few thinly traded names cannot swing the reading. "
                "The list is reviewed on the first trading day of each month.")
NOT_RANKED_TEXT = "Not ranked yet: a group needs a full year of readings before it gets a rotation rank."
FLAG_TEXT = ("Leader flag: a 52-week closing high while its industry is still well below its own high. Read it with "
             "the company's business scores; a price flag says nothing about the business.")
TIER_NAME = {2: "Full flag", 1: "Early flag"}

# Words that must never reach a public payload (checked by tests/test_public.py and by check_public()).
PRIVATE_WORDS = ("universe_rules", "leader_flag_study", "study", "method", "params", "rule", "divisor", "weight",
                 "lowest_50_last_30", "higher_low", "last_60d_low", "not_counted_because", "this_week_reading",
                 "history_note", "averages_note", "leader_flag_note", "bottom", "reasons", "limits")


# --------------------------------------------------------------------------------------------- helpers
def date_label(d: Any) -> Optional[str]:
    """'2026-11-06' -> '6 Nov 2026', the one date format on every sector page."""
    if not d:
        return None
    if isinstance(d, (date, datetime)):
        dt = d
    else:
        try:
            dt = datetime.strptime(str(d)[:10], "%Y-%m-%d")
        except ValueError:
            return str(d)
    return f"{dt.day} {dt.strftime('%b')} {dt.year}"


def _pick(src: Optional[Dict[str, Any]], keys: Iterable[str]) -> Dict[str, Any]:
    if not src:
        return {}
    return {k: copy.deepcopy(src[k]) for k in keys if k in src}


def _plural(n: Optional[int], one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _ago(n: Optional[int]) -> str:
    if n is None:
        return ""
    return "today" if n == 0 else _plural(n, "session", "sessions") + " ago"


def _market(m: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not m:
        return None
    out = _pick(m, ("date", "nifty50", "nifty50_200d_average", "pct_vs_200d", "above_200d"))
    out["date_label"] = date_label(m.get("date"))
    out["average_label"] = "200-day average"
    pct = m.get("pct_vs_200d")
    if pct is None:
        out["note"] = None
    else:
        side = "above" if m.get("above_200d") else "below"
        out["note"] = f"The Nifty 50 is {abs(pct):.1f}% {side} its 200-day average."
    return out


def _breadth(b: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return _pick(b, ("above_9", "above_20", "above_50"))


def _thrust(t: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not t:
        return None
    out = _pick(t, ("type", "date", "sessions_ago"))
    out["date_label"] = date_label(t.get("date"))
    out["when"] = _ago(t.get("sessions_ago"))
    return out


def _rot_short(r: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The rotation block inside a Sector Pulse row or a stock's sector block."""
    if not r:
        return None
    out = _pick(r, ("corner", "corner_name", "weeks_in_corner", "rank", "ranked", "rank_change_1w", "rank_change_4w",
                    "strength_pts", "change_pts", "breadth", "breadth_name"))
    out["rank_label"] = (f"{r['rank']} of {r['ranked']}" if r.get("rank") is not None and r.get("ranked")
                         else "Not ranked yet")
    return out


def _state_code(d: Dict[str, Any]) -> str:
    return d.get("state_code") or "none"


def _row(r: Dict[str, Any]) -> Dict[str, Any]:
    out = _pick(r, ("name", "slug", "kind", "sector", "industries", "date", "state", "state_code", "index_vs_52w_high",
                    "today", "leader_flags", "stocks_counted", "members_not_traded_today", "stocks_listed",
                    "stocks_traded_today"))
    code = _state_code(r)
    out["meaning"] = STATE_MEANING.get(code, r.get("meaning"))
    out["breadth"] = _breadth(r.get("breadth"))
    out["last_thrust"] = _thrust(r.get("last_thrust"))
    out["date_label"] = date_label(r.get("date"))
    # "Held up" (the "FinLit final pages" pack, 13 Nov 2026): at the industry's last low, the share of its stocks that stayed above their earlier low. The figure only; the rule
    # that turns it into a state stays private. None when the industry has had no recent low to measure.
    hl = r.get("higher_low_share")
    out["held_up"] = round(float(hl), 1) if isinstance(hl, (int, float)) and hl == hl else None
    if "rotation" in r:
        out["rotation"] = _rot_short(r.get("rotation"))
    return out


def plain_summary(ind: Dict[str, Any]) -> str:
    """One descriptive paragraph for an industry, with no rule or threshold in it."""
    nm = ind.get("name", "This group")
    code = _state_code(ind)
    b = ind.get("breadth") or {}
    dd = ind.get("index_vs_52w_high")
    dd_txt = ""
    if dd is not None:
        dd_txt = (f" The equal-weighted {nm} index is {abs(dd):.1f}% below its 52-week high." if dd < 0
                  else f" The equal-weighted {nm} index is at its 52-week high.")
    t = ind.get("last_thrust") or {}
    pct = lambda k: f"{b[k]:.0f}%" if b.get(k) is not None else "n/a"  # noqa: E731
    if code == "washout":
        return (f"{nm} stocks have been sold broadly: {pct('above_50')} of them are above their 50-day average today, "
                f"and no broad rebound has followed yet.{dd_txt}")
    if code in ("thrust_c", "thrust_cap"):
        after = "a sell-off in which almost every stock kept falling" if code == "thrust_cap" else "a washout"
        when = _ago(t.get("sessions_ago")) if t else ""
        when_txt = f" {when}" if when else ""
        return (f"{nm} had a broad rebound{when_txt}, after {after}: {pct('above_9')} of its stocks are above their "
                f"9-day average.{dd_txt}")
    if code == "confirmed":
        return (f"{pct('above_9')}, {pct('above_20')} and {pct('above_50')} of {nm} stocks are above their 9, 20 and "
                f"50-day averages: most of them are trending up together.{dd_txt}")
    if code == "fading":
        return (f"{nm}'s last rebound or uptrend has lost its breadth: {pct('above_20')} of its stocks are above their "
                f"20-day average and {pct('above_50')} above their 50-day average.{dd_txt}")
    if code == "neutral":
        return f"{nm} shows no washout, rebound or broad trend: {pct('above_50')} of its stocks are above their 50-day average.{dd_txt}"
    return f"Too few {nm} stocks pass the counting rules today for a breadth reading."


def _flag(f: Dict[str, Any]) -> Dict[str, Any]:
    out = _pick(f, ("symbol", "name", "group", "group_slug", "sessions_ago", "new_today", "quarter", "state"))
    out["tier"] = TIER_NAME.get(f.get("tier_code"), "Leader flag")
    out["when"] = "52-week high today" if f.get("sessions_ago") == 0 else f"last high {_ago(f.get('sessions_ago'))}"
    return out


def _stock_row(s: Dict[str, Any]) -> Dict[str, Any]:
    out = _pick(s, ("symbol", "name", "industry", "close", "traded_today", "rank_6m", "return_6m_pct", "quarter",
                    "quarter_name", "amfi_category", "peer_label"))
    lf = s.get("leader_flag")
    out["leader_flag"] = (_flag(lf) if isinstance(lf, dict) else (None if not lf else "Leader flag"))
    return out


# --------------------------------------------------------------------------------------------- Sector Pulse
def public_board(board: Dict[str, Any]) -> Dict[str, Any]:
    """GET /api/sectors: the Sector Pulse page."""
    out = _pick(board, ("date", "groups", "industries", "stocks_counted", "counts", "locked", "plan"))
    out["date_label"] = date_label(board.get("date"))
    out["data_line"] = DATA_LINE
    out["state_meanings"] = {name: STATE_MEANING.get(code, "") for name, code in
                             (("Thrust C", "thrust_c"), ("Thrust CAP", "thrust_cap"), ("Confirmed", "confirmed"),
                              ("Washout", "washout"), ("Fading", "fading"), ("Neutral", "neutral"))}
    out["market"] = _market(board.get("market"))
    out["rows"] = [_row(r) for r in board.get("rows", [])]
    out["too_few_stocks"] = [_pick(r, ("name", "slug", "kind", "stocks_counted")) for r in board.get("too_few_stocks", [])]
    u = board.get("universe") or {}
    out["universe"] = _pick(u, ("date", "stocks_with_industry_traded", "meet_rules", "counted_in_groups_with_reading",
                                "not_counted"))
    out["universe"]["text"] = COUNTED_TEXT
    out["leader_flags"] = [_flag(f) for f in board.get("leader_flags", []) if isinstance(f, dict)]
    out["leader_flag_text"] = FLAG_TEXT
    out["how_to_use"] = HOW_TO_USE_PULSE
    out["state_how"] = STATE_HOW
    out["disclaimer"] = DISCLAIMER_PULSE
    return out


def public_industry(ind: Dict[str, Any], *, top_stocks: Optional[int] = None) -> Dict[str, Any]:
    """GET /api/sectors/<slug>: one industry page. top_stocks cuts the ranked list (the page shows 10, then
    'Show all'); leave it None to return every counted stock."""
    out = _row(ind)
    out.update(_pick(ind, ("since", "bands", "events", "ranked_6m", "locked", "plan")))
    out["since_label"] = date_label(ind.get("since"))
    out["summary"] = plain_summary(ind)
    out["how"] = STATE_HOW.get(_state_code(ind), "")
    h = ind.get("history") or {}
    out["history"] = _pick(h, ("dates", "above_9", "above_20", "above_50", "state_code", "index_vs_52w_high",
                               "stocks_counted"))
    out["market"] = _market(ind.get("market"))
    stocks = [_stock_row(s) for s in ind.get("stocks", [])]
    out["stocks"] = stocks if top_stocks is None else stocks[:top_stocks]
    out["stocks_total"] = len(stocks)
    nc = ind.get("not_counted") or []
    out["not_counted"] = {"count": len(nc), "text": NOT_COUNTED_TEXT,
                          "stocks": [_pick(s, ("symbol", "name")) for s in nc]}
    out["disclaimer"] = DISCLAIMER_PULSE
    return out


def public_stock_sector(sec: Dict[str, Any]) -> Dict[str, Any]:
    """The 'sector' block of a stock page (site_data/<SYMBOL>.json -> sector)."""
    out = _pick(sec, ("symbol", "name", "industry", "sector", "amfi_category", "in_group", "rank_6m", "ranked_6m",
                      "return_6m_pct", "quarter", "quarter_name"))
    g = sec.get("group")
    out["group"] = _row(g) if g else None
    out["market"] = _market(sec.get("market"))
    lf = sec.get("leader_flag")
    out["leader_flag"] = _flag(lf) if isinstance(lf, dict) else None
    out["leader_flag_text"] = FLAG_TEXT if lf else "No leader flag."
    out["rotation"] = _rot_short(sec.get("rotation"))
    out["disclaimer"] = DISCLAIMER_PULSE
    return out


def public_summary_row(line: Dict[str, Any]) -> Dict[str, Any]:
    """One line of /api/technicals/summary (screeners): drop the bottom-timing field."""
    out = copy.deepcopy(line)
    out.pop("bottomed_before", None)
    return out


# --------------------------------------------------------------------------------------------- Rotation
def _rot_row(r: Dict[str, Any]) -> Dict[str, Any]:
    out = _pick(r, ("name", "slug", "kind", "sector", "industries", "corner", "corner_name", "corner_since",
                    "weeks_in_corner", "previous_corner", "previous_corner_name", "strength_pts", "change_pts",
                    "vs_average", "breadth_above_50", "breadth", "breadth_name", "sector_state", "sector_state_code",
                    "rank", "ranked", "rank_change_1w", "rank_change_4w", "rank_best_26w", "rank_worst_26w", "tail",
                    "rank_history", "leader_flags", "stocks_counted"))
    out["summary"] = rot_summary(r)
    out["corner_since_label"] = date_label(r.get("corner_since"))
    out["corner_meaning"] = CORNER_MEANING.get(r.get("corner"), "")
    out["how"] = CORNER_HOW.get(r.get("corner"), "")
    if r.get("rank") is None:
        out["rank_label"] = "Not ranked yet"
        out["rank_note"] = NOT_RANKED_TEXT
    else:
        out["rank_label"] = f"{r['rank']} of {r.get('ranked')}"
    for k in ("tail", "rank_history"):
        for p in out.get(k) or []:
            p["date_label"] = date_label(p.get("date"))
    return out


def rot_summary(r: Dict[str, Any]) -> str:
    """One descriptive sentence or three for a rotation group, dates in the page's format."""
    nm, s, c = r.get("name", "This group"), r.get("strength_pts"), r.get("change_pts")
    parts = []
    if s is not None:
        parts.append(f"Over 6 months {nm} is {abs(s):.1f} points {'ahead of' if s > 0 else 'behind'} the average industry")
    if c is not None:
        parts.append(f"last month it was {abs(c):.1f} points {'ahead of' if c > 0 else 'behind'} it")
    txt = (", and ".join(parts) + ".") if parts else ""
    if r.get("corner_name") and r.get("weeks_in_corner") is not None:
        since = date_label(r.get("corner_since"))
        txt += (f" It has been {r['corner_name']} for {_plural(r['weeks_in_corner'], 'week', 'weeks')}"
                + (f", since {since}." if since else "."))
    if r.get("rank") is not None:
        mv = r.get("rank_change_1w")
        mv_txt = "" if not mv else f", {'up' if mv > 0 else 'down'} {_plural(abs(mv), 'place', 'places')} on the week"
        txt += f" Its rotation rank is {r['rank']} of {r.get('ranked')}{mv_txt}."
    else:
        txt += " " + NOT_RANKED_TEXT
    return txt.strip()


def public_rotation(view: Dict[str, Any]) -> Dict[str, Any]:
    """GET /api/rotation: the Sector Rotation page."""
    out = _pick(view, ("date", "week_closed", "groups", "average_industry", "counts", "moved_this_week",
                       "climbers_4w", "fallers_4w", "rank_weeks", "locked", "plan"))
    out["date_label"] = date_label(view.get("date"))
    out["data_line"] = DATA_LINE
    out["benchmark"] = ("The average industry: every NSE industry or sector group with a reading, each counted "
                        "equally.")
    out["market"] = _market(view.get("market"))
    out["corner_meanings"] = {CORNER_MEANING_NAME[c]: m for c, m in CORNER_MEANING.items()}
    rows = [_rot_row(r) for r in view.get("rows", [])]
    out["rows"] = rows
    ranked = sum(1 for r in rows if r.get("rank") is not None)
    out["groups_ranked"] = ranked
    out["groups_line"] = (f"All {len(rows)} groups" if ranked == len(rows)
                          else f"{ranked} of {len(rows)} groups ranked; {len(rows) - ranked} too new for a rank")
    out["rank_weeks_labels"] = [date_label(d) for d in view.get("rank_weeks", [])]
    out["how_to_use"] = HOW_TO_USE_ROTATION
    out["disclaimer"] = DISCLAIMER_ROTATION
    return out


def public_rotation_group(g: Dict[str, Any]) -> Dict[str, Any]:
    """GET /api/rotation/<slug>: the rotation card on industry and stock pages."""
    out = _rot_row(g)
    out["disclaimer"] = DISCLAIMER_ROTATION
    return out


CORNER_MEANING_NAME = {"ahead_gaining": "Ahead and gaining", "ahead_slowing": "Ahead but slowing",
                       "behind_slipping": "Behind and slipping", "behind_gaining": "Behind but gaining"}


# --------------------------------------------------------------------------------------------- self-check
def check_public(payload: Any, path: str = "") -> List[str]:
    """Return the paths of any private field left in a public payload (an empty list means clean). Run it in the
    API's tests, or on a sample of responses after each deploy."""
    bad: List[str] = []
    if isinstance(payload, dict):
        for k, v in payload.items():
            if any(k == w or k.startswith(w + "_") or k.endswith("_" + w) for w in PRIVATE_WORDS) and k not in _ALLOWED:
                bad.append(f"{path}.{k}")
            bad += check_public(v, f"{path}.{k}")
    elif isinstance(payload, list):
        for i, v in enumerate(payload[:3]):
            bad += check_public(v, f"{path}[{i}]")
    return bad


_ALLOWED = {"rank_label", "rank_note", "rank_change_1w", "rank_change_4w"}


# --------------------------------------------------------------------------------------------- stock technical scores
def _tone(sig: Optional[float]) -> Optional[str]:
    if sig is None:
        return None
    return "positive" if sig > 0.05 else "negative" if sig < -0.05 else "neutral"


def _view(v: Dict[str, Any], extra: Iterable[str] = ()) -> Dict[str, Any]:
    out = _pick(v, ("score", "display", "rating", "rating_code", "band", "band_code", *extra))
    out["components"] = [dict(_pick(c, ("key", "name", "reading", "on")), tone=_tone(c.get("signal")))
                         for c in v.get("components", [])]
    return out


def public_score(d: Dict[str, Any]) -> Dict[str, Any]:
    """GET /api/technicals/<symbol>/score: the two technical views with each part's reading and direction, but no
    weights, points, divisors, multipliers or method text."""
    out = _pick(d, ("symbol", "date", "close", "benchmark"))
    out["date_label"] = date_label(d.get("date"))
    out["short_term"] = _view(d.get("short_term") or {})
    out["long_term"] = _view(d.get("long_term") or {}, extra=("stage",))
    ta = d.get("trend_alignment") or {}
    out["trend_alignment"] = _pick(ta, ("label", "code", "st_band", "lt_band", "cells"))
    out["disclaimer"] = d.get("disclaimer")
    return out


def public_peers(d: Dict[str, Any]) -> Dict[str, Any]:
    """GET /api/technicals/<symbol>/peers: drop the rules text and the indicator name."""
    out = copy.deepcopy(d)
    for k in ("rules", "indicator", "method", "params"):
        out.pop(k, None)
    return out
