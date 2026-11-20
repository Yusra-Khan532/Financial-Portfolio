"""Task #272 (Watchlists and Alerts, 20 Nov pack): alerts on the filings Discover sorts (finlit/discovery/signals.py), for one stock or a whole list.

"Tell me when a company on this list files an order win, new capacity or any of Discover's eight kinds." The worker's daily run (alertengine.evaluate,
weekday evenings once the day's filings are in) reads discovery_signals above the highest filing the alert has seen, for the companies the list holds that
evening. Each filing is one bell item ("Order win · Welspun Corp"), or, with digest, one summary a day ("2 filings at your companies since 12 Nov").

Lists the server can resolve: the equity portfolio (all accounts, or one account), each watchlist, the companies inside the member's ETFs ("etf", task
#276: 0.3% or more of the ETFs, from each ETF's monthly file), and "mine" (the equity portfolio and every watchlist,
the Quick alerts "at my companies"). A list alert is one alert row, so it counts as 1 of the plan's alerts however many companies the list holds.

Safety: an order-win or capacity alert never fires on a tax, customs or court order, whatever Discover's sorting says (task #273 fixes the sorting;
this rule holds on its own). Describes what was filed; never a recommendation."""

from __future__ import annotations

import json
import logging
import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

log = logging.getLogger("finlit.filingalerts")

METRIC = "discover_filing"
# Discover's eight kinds (discovery/board.EVENTS), with the words of the bell and the chips.
KINDS: Dict[str, str] = {"order": "Order win", "capacity": "Capacity", "partnership": "Partnership", "mna": "Acquisition / merger", "fundraise": "Fund raising",
                         "rating": "Credit rating", "management": "Management", "legal": "Legal / regulatory"}
LOWER = {"order": "order win", "capacity": "capacity", "partnership": "partnership", "mna": "acquisition / merger", "fundraise": "fund raising",
         "rating": "credit rating", "management": "management", "legal": "legal / regulatory"}
DEFAULT_KINDS = ["order", "capacity"]
PER_RUN = 10          # each-filing alerts: at most this many items per alert and run; the rest arrive as one summary line
LIST_REF = re.compile(r"^(mine|equity|equity:[a-z0-9]{1,16}|watch|watch:[A-Za-z0-9_-]{1,40}|etf|invest|invest:through)$")
ETF_MIN = 0.003      # task #276: the ETF list's companies are the ones that make up 0.3% or more of the member's ETFs (the page's What changed)

# A tax, GST, customs, court, tribunal or penalty order: never an order win or new capacity (task #272, README "Before order-win alerts go out").
BLOCKED = re.compile(r"\b(tax|taxes|gst|cgst|sgst|igst|income[- ]tax|customs|excise|court|tribunal|nclt|nclat|itat|cestat|high court|supreme court|"
                     r"penalt(?:y|ies)|demand order|assessment order|show[- ]cause|adjudicat\w*|appellate|arbitral award|order in original|"
                     r"order-in-original|order in appeal|levied|levy)\b", re.I)


def blocked(event: str, title: Optional[str]) -> bool:
    """True when an order-win or capacity filing reads as a tax, customs or court order: such a filing is never sent as one."""
    return event in ("order", "capacity") and bool(BLOCKED.search(title or ""))


def _parse(v: Any) -> Dict[str, Any]:
    try:
        out = json.loads(v) if isinstance(v, str) else (v or {})
    except ValueError:
        return {}
    return out if isinstance(out, dict) else {}


def lists_of(watchlist: Any, portfolio: Any, invest: Any = None) -> List[Dict[str, Any]]:
    """The lists a member can set a list alert on, with their companies: [{ref, label, symbols}]. Equity portfolio (all accounts, then each account
    when there are several), each watchlist, every watchlist together ("watch"), and "mine" (equity portfolio and watchlists). Task #277: once All my
    investments has been opened, "invest" (the companies you own: direct, or 0.1% or more of everything through funds and ETFs) and "invest:through"
    (only through funds and ETFs), as the page last worked them out (user_state.invest_list)."""
    w, p, inv = _parse(watchlist), _parse(portfolio), _parse(invest)
    out: List[Dict[str, Any]] = []
    holdings = [h for h in (p.get("holdings") or []) if isinstance(h, dict) and h.get("symbol")]
    accounts = [a for a in (p.get("portfolios") or []) if isinstance(a, dict) and a.get("id")]
    first = accounts[0]["id"] if accounts else None

    def syms(rows: List[Dict[str, Any]]) -> List[str]:
        return list(dict.fromkeys(str(h["symbol"]).upper() for h in rows))

    eq = syms(holdings)
    out.append({"ref": "equity", "label": "Equity portfolio · All accounts" if len(accounts) > 1 else "Equity portfolio", "symbols": eq})
    if len(accounts) > 1:
        for a in accounts:
            rows = [h for h in holdings if (h.get("pf") or first) == a["id"]]
            out.append({"ref": f"equity:{a['id']}", "label": f"Equity portfolio · {str(a.get('name') or a['id'])[:40]}", "symbols": syms(rows)})
    wl_all: List[str] = []
    for lst in (w.get("lists") or []):
        if not isinstance(lst, dict) or not lst.get("id"):
            continue
        s = list(dict.fromkeys(str(x).upper() for x in (lst.get("symbols") or []) if isinstance(x, str) and x))
        wl_all += s
        out.append({"ref": f"watch:{lst['id']}", "label": f"Watchlist · {str(lst.get('name') or 'My watchlist')[:40]}", "symbols": s})
    wl_all = list(dict.fromkeys(wl_all))
    out.append({"ref": "watch", "label": "Watchlists · All lists", "symbols": wl_all})
    if isinstance(inv.get("direct"), list) and isinstance(inv.get("through"), list):
        clean = lambda xs: list(dict.fromkeys(str(x).upper() for x in xs if isinstance(x, str) and x))   # noqa: E731
        d, t = clean(inv["direct"]), clean(inv["through"])
        out.append({"ref": "invest", "label": "All my investments · the companies you own", "symbols": list(dict.fromkeys(d + t)),
                    "where": "At the companies you own"})
        out.append({"ref": "invest:through", "label": "All my investments · through funds and ETFs", "symbols": t, "where": "At the companies you own through funds and ETFs"})
    out.append({"ref": "mine", "label": "Everything I own and watch (equity portfolio and watchlists)", "symbols": list(dict.fromkeys(eq + wl_all))})
    return out


async def etf_list(conn, user_id: str) -> Optional[Dict[str, Any]]:
    """Task #276: the companies inside the member's ETFs (each ETF's latest monthly file), weighted as the ETF page weights them (by value when every
    ETF has units and a price, else equally), that make up 0.3% or more of the list. None when the member holds no ETF. Database only."""
    from .etfportfolio import calc as ecalc
    from .portfolios import _family, metal_class, unpack_holdings     # noqa: F401  (unpack applies the metal rule)
    held = await conn.fetch("SELECT h.symbol, h.qty, f.isin, f.price, f.asset_class FROM etf_holdings h JOIN etf_funds f ON f.symbol = h.symbol "
                            "WHERE h.user_id = $1", user_id)
    if not held:
        return None
    w, _basis = ecalc.weights([{"symbol": r["symbol"], "qty": r["qty"], "price": r["price"]} for r in held])
    total: Dict[str, float] = {}
    for r in held:
        fkey = await _family(conn, r["isin"])
        raw = await conn.fetchval("SELECT holdings FROM disclosure_portfolios WHERE fkey = $1 ORDER BY as_of DESC LIMIT 1", fkey) if fkey else None
        if not raw:
            continue
        hs = [h for h in unpack_holdings(raw) if h.asset_class == "equity" and h.isin and h.isin.startswith("IN") and h.pct_nav]
        if not hs:
            continue
        sym = {x["isin"]: x["symbol"] for x in await conn.fetch(
            "SELECT i.isin, i.symbol FROM disclosure_isin i JOIN companies c ON c.symbol = i.symbol WHERE i.isin = ANY($1::text[])", [h.isin for h in hs])}
        for h in hs:
            if h.isin in sym:
                total[sym[h.isin]] = total.get(sym[h.isin], 0.0) + w[r["symbol"]] * float(h.pct_nav) / 100
    syms = [s for s, v in sorted(total.items(), key=lambda kv: -kv[1]) if v >= ETF_MIN]
    return {"ref": "etf", "label": "ETF portfolio · companies inside your ETFs", "symbols": syms}


def resolve(watchlist: Any, portfolio: Any, ref: str, invest: Any = None) -> Optional[Dict[str, Any]]:
    return next((x for x in lists_of(watchlist, portfolio, invest) if x["ref"] == ref), None)


async def newest_signal(conn) -> int:
    """The highest filing Discover has sorted so far: a new alert counts only filings after it."""
    return int(await conn.fetchval("SELECT coalesce(max(feed_id), 0) FROM discovery_signals") or 0)


def details_link(event: str, name: str) -> str:
    return f"/discover/changes/{event}?q={quote(name)}"


def _day(d: Any) -> str:
    try:
        x = d if isinstance(d, date) else date.fromisoformat(str(d)[:10])
        return f"{x.day} {x.strftime('%b')}"
    except ValueError:
        return str(d)


def bell_one(hit: Dict[str, Any], where: str) -> Tuple[str, str, str]:
    """One filing: ("Order win · Welspun Corp", "<where> · <subject> (19 Nov) · sent on the evening of the day it is filed", Discover link)."""
    name = hit.get("name") or hit["symbol"]
    subject = (hit.get("title") or "").strip()
    what = f"{subject[:140]} ({_day(hit['item_date'])})" if subject else _day(hit["item_date"])
    body = " · ".join(x for x in (where, what, "sent on the evening of the day it is filed") if x)
    return f"{KINDS.get(hit['event'], 'Filing')} · {name}", body, details_link(hit["event"], name)


def bell_summary(hits: List[Dict[str, Any]], since: Optional[date], link: str) -> Tuple[str, str, str]:
    """One summary a day: "2 filings at your companies since 12 Nov", "Tech Mahindra: fund raising (19 Nov) · Zensar Technologies: management (15 Nov)"."""
    n = len(hits)
    head = f"{n} filing{'s' if n != 1 else ''} at your companies" + (f" since {_day(since)}" if since else "")
    parts = [f"{h.get('name') or h['symbol']}: {LOWER.get(h['event'], 'filing')} ({_day(h['item_date'])})" for h in hits[:8]]
    more = f" · and {n - 8} more" if n > 8 else ""
    return head, " · ".join(parts) + more, link


def list_page(ref: Optional[str]) -> str:
    """Where "See What changed →" opens for a list alert."""
    if not ref:
        return "/discover/changes"
    if ref.startswith("watch"):
        return "/watchlist#what-changed"
    if ref.startswith("invest"):
        return "/my-investments#what-changed"
    if ref.startswith("equity"):
        return "/holdings#what-changed"
    if ref == "etf":
        return "/etf-portfolio#what-changed"
    return "/watchlist#what-changed"


async def hits_for(conn, symbols: List[str], kinds: List[str], seen: int) -> Tuple[List[Dict[str, Any]], int]:
    """New sorted filings of these companies and kinds above `seen`, oldest first (blocked ones dropped), and the new high-water mark."""
    top = await newest_signal(conn)
    if not symbols or not kinds:
        return [], max(top, seen)
    rows = await conn.fetch(
        "SELECT s.feed_id, s.symbol, s.item_date, s.event, s.title, s.link, coalesce(d.company, c.name) AS name FROM discovery_signals s "
        "LEFT JOIN discovery_companies d ON d.symbol = s.symbol LEFT JOIN companies c ON c.symbol = s.symbol "
        "WHERE s.symbol = ANY($1::text[]) AND s.event = ANY($2::text[]) AND s.feed_id > $3 AND s.feed_id <= $4 ORDER BY s.feed_id",
        symbols, kinds, seen, top)
    out, keys = [], set()
    for r in rows:
        h = dict(r)
        if blocked(h["event"], h["title"]):
            continue
        k = (h["symbol"], h["item_date"], (h["title"] or "").strip().lower())
        if k in keys:          # the same filing stored twice (news and document) is one item
            continue
        keys.add(k)
        out.append(h)
    return out, max(top, seen)


async def run_alert(conn, deliver, mailer, site_url: str, user: Dict[str, Any], a: Dict[str, Any], state: Optional[Dict[str, Any]]) -> int:
    """Check one discover_filing alert; returns how many bell items it sent. Updates the alert's high-water mark (last_value)."""
    kinds = [k for k in (a.get("kinds") or DEFAULT_KINDS) if k in KINDS]
    seen = int(a["last_value"] or 0)
    where = ""
    if a.get("list_ref"):
        lst = (await etf_list(conn, user["id"]) if a["list_ref"] == "etf"
               else resolve((state or {}).get("watchlist"), (state or {}).get("portfolio"), a["list_ref"], (state or {}).get("invest")))
        symbols = lst["symbols"] if lst else []
        where = (lst.get("where") or f"On your {lst['label'].lower()}") if lst else ""
    else:
        symbols = [a["symbol"]]
    if a.get("digest") and a.get("last_fired_at") is not None and a["last_fired_at"].date() == date.today():
        await conn.execute("UPDATE alerts SET last_checked = now() WHERE id = $1", a["id"])
        return 0    # one summary a day: today's is sent; the rest wait for tomorrow's (the high-water mark stays)
    hits, top = await hits_for(conn, symbols, kinds, seen)
    sent = 0
    if hits:
        if a.get("digest"):
            since = a["last_fired_at"].date() if a.get("last_fired_at") else (a["created_at"].date() if a.get("created_at") else None)
            title, body, link = bell_summary(hits, since, list_page(a.get("list_ref")))
            await deliver(conn, mailer, site_url, user, a, title, body, link)
            sent = 1
        else:
            for h in hits[:PER_RUN]:
                title, body, link = bell_one(h, where)
                await deliver(conn, mailer, site_url, user, {**a, "symbol": h["symbol"]}, title, body, link)
                sent += 1
            if len(hits) > PER_RUN:
                title, body, link = bell_summary(hits[PER_RUN:], None, list_page(a.get("list_ref")))
                await deliver(conn, mailer, site_url, user, a, "And " + title[0].lower() + title[1:], body, link)
                sent += 1
    await conn.execute("UPDATE alerts SET last_value = $2, last_checked = now(), fired_count = fired_count + $3, "
                       "last_fired_at = CASE WHEN $3 > 0 THEN now() ELSE last_fired_at END, status = CASE WHEN $3 > 0 AND repeat = 'once' THEN 'done' ELSE status END WHERE id = $1",
                       a["id"], top, 1 if sent else 0)
    return sent
