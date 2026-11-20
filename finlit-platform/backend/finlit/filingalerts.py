"""Task #272 (Watchlists and Alerts, 20 Nov pack): alerts on the filings Discover sorts (finlit/discovery/signals.py), for one stock or a whole list.

"Tell me when a company on this list files an order win, new capacity or any of Discover's eight kinds." The worker's daily run (alertengine.evaluate,
weekday evenings once the day's filings are in) reads discovery_signals above the highest filing the alert has seen, for the companies the list holds that
evening. Each filing is one bell item ("Order win · Welspun Corp"), or, with digest, one summary a day ("2 filings at your companies since 12 Nov").

Lists the server can resolve: the equity portfolio (all accounts, or one account), each watchlist, and "mine" (the equity portfolio and every watchlist,
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
LIST_REF = re.compile(r"^(mine|equity|equity:[a-z0-9]{1,16}|watch:[A-Za-z0-9_-]{1,40})$")

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


def lists_of(watchlist: Any, portfolio: Any) -> List[Dict[str, Any]]:
    """The lists a member can set a list alert on, with their companies: [{ref, label, symbols}]. Equity portfolio (all accounts, then each account
    when there are several), each watchlist, and "mine" (both together)."""
    w, p = _parse(watchlist), _parse(portfolio)
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
    out.append({"ref": "mine", "label": "Everything I own and watch (equity portfolio and watchlists)", "symbols": list(dict.fromkeys(eq + wl_all))})
    return out


def resolve(watchlist: Any, portfolio: Any, ref: str) -> Optional[Dict[str, Any]]:
    return next((x for x in lists_of(watchlist, portfolio) if x["ref"] == ref), None)


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
    if ref.startswith("watch:"):
        return "/watchlist#what-changed"
    if ref.startswith("equity"):
        return "/holdings#what-changed"
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
        lst = resolve((state or {}).get("watchlist"), (state or {}).get("portfolio"), a["list_ref"])
        symbols = lst["symbols"] if lst else []
        where = f"On your {lst['label'].lower()}" if lst else ""
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
