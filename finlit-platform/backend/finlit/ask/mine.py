"""Task #349 PR 4: holdings-aware answers. How the signed-in member is linked to the companies a question is about (docs/ASK-AI.md "Your holdings").

Founder: "If I ask about Reliance and it is in my portfolio, or my ETF, or anywhere I am related to it, it should give more importance to that in a
personalised way. It can't say buy more or sell, but it can give more importance according to that."

`relation(pool, user_id, symbols)` reads, for each company, the member's own links, one SQL query per source and every one scoped to the member's id:
    Equity portfolio  user_state.portfolio.holdings: the quantity still held (rows marked `owned`, sales matched first in, first out within each
                      portfolio, the page's lib/ledger.ts rule via etfportfolio.book), the latest stored close (price_daily) and its day, the value, and
                      its weight with portfolio_page.score.weights_of, the function the Equity portfolio page's score uses (by value only when every
                      share has a value). The buy price counts as cost only when the member entered it; one taken from a statement's Rate column
                      (priceFrom "rate") is said as the statement rate, never as what was paid.
    ETFs              etf_holdings (the open units the ETF book writes back from etf_lots) -> the ETF's ISIN -> its scheme family (mf_schemes) -> the
                      family's latest disclosure_portfolios file: the company's % weight in the ETF and the file's date; about how many rupees of the
                      member's units that is (units x the ETF's latest price, with its date).
    Mutual funds      mf_holdings -> mf_schemes -> family -> disclosure_portfolios: the % weight and the file's date; about how many rupees of the member's
                      units (open units, first in, first out, x the latest NAV, with its date).
    Watchlists        the member's lists that hold the company.
    Alerts            the member's active alerts on the company, and Sector Pulse alerts (prefs.sectorAlerts) on its sector or industry.

Nothing here is advice: it says how the member is linked, with each figure's date. The result is kept in Redis for 10 minutes under
ask:rel:<user>:<user_state updated_at>:<symbols>, so a change to the member's lists is read at once. A member with no link gets an empty result:
no block, no tags, and the answer is exactly as before (golden test)."""

from __future__ import annotations

import datetime as dt
import json
import logging
import re
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

log = logging.getLogger("finlit.ask")
IST = ZoneInfo("Asia/Kolkata")
CACHE_SECONDS = 10 * 60
VERSION = "v1"
MINUS = "−"
SYMBOL = re.compile(r"^[A-Z0-9&_.\-]{1,24}$")
MAX_SYMBOLS = 3
MAX_FUNDS = 3                                   # funds and ETFs named in the block, the largest share of the member's money first

INSTRUCTION = ("[The member is linked to this company as <member_relation> says. Open with one line on how they are linked, from those facts only, "
               "each with its date. Then put first the facts that touch their position: the price against their own cost, the latest results, "
               "FinLit Prism, new filings. Describe only, never advise: never say to buy, add, average down, trim, reduce, exit, book profits, "
               "rebalance, keep holding or stay invested, and never call the holding too large or too small.]")

KIND_WORDS = {"state": "when its state changes", "box": "when it moves to another box", "top5": "when it enters or leaves the top 5"}
SECTOR_ALERT = re.compile(r"^(state|box|top5):(sectors|industries):([a-z0-9][a-z0-9-]{0,79})$")


# ------------------------------------------------------------------------------------------------------------------ words and numbers

def _group(n: int) -> str:
    """Indian grouping: 118000 -> 1,18,000."""
    s = str(abs(n))
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts) + "," + tail


def inr(v: float, paise: bool = False) -> str:
    """₹1,18,000; a price keeps its paise when it has them (₹2,950.40)."""
    neg = v < 0
    a = abs(float(v))
    if paise and round(a * 100) % 100:
        whole = int(a)
        out = f"₹{_group(whole)}.{round((a - whole) * 100):02d}"
    else:
        out = f"₹{_group(int(round(a)))}"
    return (MINUS if neg else "") + out


def pct(v: float, signed: bool = False) -> str:
    s = f"{abs(v):.1f}%"
    if not signed:
        return (MINUS if v < 0 else "") + s
    return ("+" if v > 0 else MINUS if v < 0 else "") + s


def qty_words(q: float) -> str:
    n = float(q)
    txt = _group(int(n)) if n == int(n) else f"{n:,.4f}".rstrip("0").rstrip(".")
    return f"{txt} share" + ("" if n == 1 else "s")


def day(d: Any) -> str:
    """21 Nov 2026."""
    if d is None:
        return ""
    if isinstance(d, str):
        try:
            d = dt.date.fromisoformat(d[:10])
        except ValueError:
            return ""
    if isinstance(d, dt.datetime):
        d = d.astimezone(IST).date() if d.tzinfo else d.date()
    return f"{d.day} {d.strftime('%b %Y')}"


def ordinal(n: int) -> str:
    return "the largest" if n == 1 else f"the {n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')} largest"


def slug(name: str) -> str:
    """The Sector Pulse address of a sector or industry name (finlit_technicals.industries.slug)."""
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")


def _date(v: Any) -> Optional[dt.date]:
    if isinstance(v, dt.date):
        return v
    if isinstance(v, str) and re.match(r"^\d{4}-\d{2}-\d{2}", v):
        try:
            return dt.date.fromisoformat(v[:10])
        except ValueError:
            return None
    return None


def _json(v: Any, default: Any) -> Any:
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return default
    return default if v is None else v


def clean(symbols: Iterable[str]) -> List[str]:
    out: List[str] = []
    for s in symbols or []:
        s = str(s or "").strip().upper()
        if SYMBOL.match(s) and s not in out:
            out.append(s)
    return out[:MAX_SYMBOLS]


# ------------------------------------------------------------------------------------------------------------------ the sources

async def linked_any(pool, user_id: str) -> bool:
    """One cheap read: does the member keep anything a company could be linked to? False: the answer is made exactly as before."""
    async with pool.acquire() as conn:
        return bool(await conn.fetchval(
            """SELECT EXISTS (SELECT 1 FROM user_state WHERE user_id = $1 AND (jsonb_path_exists(portfolio, '$.holdings[0]')
                                 OR jsonb_path_exists(watchlist, '$.lists[*].symbols[0]') OR jsonb_path_exists(prefs, '$.sectorAlerts[0]')))
                   OR EXISTS (SELECT 1 FROM etf_holdings WHERE user_id = $1)
                   OR EXISTS (SELECT 1 FROM mf_holdings WHERE user_id = $1)
                   OR EXISTS (SELECT 1 FROM alerts WHERE user_id = $1 AND status = 'active' AND symbol <> '')""", user_id))


# The company's ISINs (t, in the ETF and fund queries): NSE's ISIN -> symbol table and NSE's classification, so a renamed share is still found.


async def _closes(conn, user_id: str) -> Dict[str, Tuple[float, dt.date]]:
    """The latest stored close (and its day) of every share in the member's Equity portfolio."""
    rows = await conn.fetch(
        """WITH s AS (SELECT DISTINCT upper(e->>'symbol') AS symbol FROM user_state u,
                          jsonb_array_elements(CASE WHEN jsonb_typeof(u.portfolio->'holdings') = 'array' THEN u.portfolio->'holdings' ELSE '[]'::jsonb END) e
                      WHERE u.user_id = $1 AND coalesce(e->>'symbol', '') <> '')
           SELECT s.symbol, p.day, p.close FROM s
           JOIN LATERAL (SELECT day, close FROM price_daily WHERE symbol = s.symbol AND close > 0 ORDER BY day DESC LIMIT 1) p ON true""", user_id)
    return {r["symbol"]: (float(r["close"]), r["day"]) for r in rows}


async def _etfs(conn, user_id: str, symbols: List[str]) -> List[Dict[str, Any]]:
    """The member's ETFs that hold the companies, through the ETF's ISIN, its scheme family and the family's latest monthly file."""
    rows = await conn.fetch(
        """WITH t AS (SELECT isin, symbol FROM disclosure_isin WHERE symbol = ANY($2::text[])
                      UNION SELECT isin, symbol FROM company_classification WHERE symbol = ANY($2::text[]) AND isin IS NOT NULL AND isin <> '')
            SELECT h.symbol AS etf, coalesce(nullif(f.display_name, ''), h.symbol) AS name, h.qty, f.price, f.price_date, p.as_of, t.symbol,
                   sum((e->>4)::float) AS pct
            FROM etf_holdings h
            LEFT JOIN etf_funds f ON f.symbol = h.symbol
            JOIN LATERAL (SELECT family FROM mf_schemes m WHERE m.isin = coalesce(h.isin, f.isin) OR m.isin_reinvest = coalesce(h.isin, f.isin) LIMIT 1) fam ON true
            JOIN LATERAL (SELECT as_of, holdings FROM disclosure_portfolios d WHERE d.fkey = fam.family ORDER BY as_of DESC LIMIT 1) p ON true
            CROSS JOIN LATERAL jsonb_array_elements(p.holdings) e
            JOIN t ON t.isin = e->>1
            WHERE h.user_id = $1 AND jsonb_typeof(e->4) = 'number'
            GROUP BY h.symbol, f.display_name, h.qty, f.price, f.price_date, p.as_of, t.symbol""", user_id, symbols)
    return [dict(r) for r in rows]


async def _funds(conn, user_id: str, symbols: List[str]) -> List[Dict[str, Any]]:
    """The member's mutual funds that hold the companies (scheme -> family -> latest monthly file), with each holding's buys and sales."""
    rows = await conn.fetch(
        """WITH t AS (SELECT isin, symbol FROM disclosure_isin WHERE symbol = ANY($2::text[])
                      UNION SELECT isin, symbol FROM company_classification WHERE symbol = ANY($2::text[]) AND isin IS NOT NULL AND isin <> ''),
            hit AS (SELECT h.id, h.code, s.name, s.nav, s.nav_date, p.as_of, t.symbol, sum((e->>4)::float) AS pct
                    FROM mf_holdings h
                    JOIN mf_schemes s ON s.code = h.code
                    JOIN LATERAL (SELECT as_of, holdings FROM disclosure_portfolios d WHERE d.fkey = s.family ORDER BY as_of DESC LIMIT 1) p ON true
                    CROSS JOIN LATERAL jsonb_array_elements(p.holdings) e
                    JOIN t ON t.isin = e->>1
                    WHERE h.user_id = $1 AND jsonb_typeof(e->4) = 'number'
                    GROUP BY h.id, h.code, s.name, s.nav, s.nav_date, p.as_of, t.symbol)
            SELECT hit.*, (SELECT coalesce(jsonb_agg(jsonb_build_object('units', l.units, 'invested', l.invested, 'bought_on', l.bought_on, 'side', l.side,
                                                                        'pf', l.pf, 'pos', l.pos) ORDER BY l.pos, l.created_at), '[]'::jsonb)
                           FROM mf_holding_lots l WHERE l.holding_id = hit.id) AS lots
            FROM hit""", user_id, symbols)
    return [dict(r) for r in rows]


async def _alerts(conn, user_id: str, symbols: List[str]) -> List[Dict[str, Any]]:
    rows = await conn.fetch("SELECT upper(symbol) AS symbol, metric, op, value, last_fired_at FROM alerts "
                            "WHERE user_id = $1 AND status = 'active' AND upper(symbol) = ANY($2::text[]) ORDER BY created_at LIMIT 20", user_id, symbols)
    return [dict(r) for r in rows]


async def _groups(conn, symbols: List[str]) -> Dict[str, List[str]]:
    """The NSE sector and industry names of each company (Sector Pulse addresses are made from them)."""
    rows = await conn.fetch("SELECT c.symbol, c.sector, c.industry, k.macro_sector, k.sector AS nse_sector, k.industry AS nse_industry, k.basic_industry "
                            "FROM companies c LEFT JOIN company_classification k ON k.symbol = c.symbol WHERE c.symbol = ANY($1::text[])", symbols)
    out: Dict[str, List[str]] = {}
    for r in rows:
        out[r["symbol"]] = [v for v in (r["nse_industry"], r["nse_sector"], r["macro_sector"], r["basic_industry"], r["industry"], r["sector"]) if v]
    return out


# ------------------------------------------------------------------------------------------------------------------ the Equity portfolio

def _lots(rows: List[Dict[str, Any]], entered_only: bool) -> List[Dict[str, Any]]:
    out = []
    for h in rows:
        try:
            q = float(h.get("qty") or 0)
        except (TypeError, ValueError):
            continue
        if not h.get("owned") or q <= 0:                         # a name added without a quantity is kept as qty 1, not owned: never a quantity
            continue
        p = h.get("price")
        p = float(p) if isinstance(p, (int, float)) and p > 0 else None
        if entered_only and h.get("priceFrom") == "rate":
            p = None
        out.append({"symbol": str(h.get("symbol") or "").upper(), "pf": h.get("pf") or "main", "side": "sell" if h.get("side") == "sell" else "buy",
                    "qty": Decimal(str(q)), "price": None if p is None else Decimal(str(p)), "date": _date(h.get("date"))})
    return out


def equity(holdings: List[Dict[str, Any]], closes: Dict[str, Tuple[float, dt.date]], symbol: str) -> Optional[Dict[str, Any]]:
    """The member's Equity portfolio and one company: None when the company is not on it."""
    from ..etfportfolio.book import open_cost, open_units
    from ..portfolio_page.score import weights_of
    rows = [h for h in holdings if isinstance(h, dict) and str(h.get("symbol") or "").upper()]
    names = list(dict.fromkeys(str(h["symbol"]).upper() for h in rows))
    if symbol not in names:
        return None
    units = {s: float(q) for s, q in open_units(_lots(rows, False)).items()}
    values = {s: units[s] * closes[s][0] for s in names if units.get(s, 0) > 0 and s in closes}
    w, basis = weights_of(names, values)                       # the Equity portfolio page's own rule: by value only when every share has one
    q = units.get(symbol, 0.0)
    owned = any(h.get("owned") and str(h["symbol"]).upper() == symbol for h in rows)
    out: Dict[str, Any] = {"listed": True, "qty": q if q > 0 else None, "of": len(names), "basis": basis, "sold": owned and q <= 0}
    if symbol in closes:
        out["close"], out["closeOn"] = closes[symbol][0], closes[symbol][1].isoformat()
    if q > 0 and symbol in closes:
        out["value"] = q * closes[symbol][0]
    if basis == "value" and q > 0:
        out["weight"] = w[symbol] * 100
        out["rank"] = 1 + sum(1 for s in names if w[s] > w[symbol])
    if q > 0:
        mine = [h for h in rows if str(h["symbol"]).upper() == symbol]
        entered = open_cost(_lots(mine, True)).get(symbol)
        if entered is not None and entered > 0:
            out["cost"] = {"kind": "entered", "invested": float(entered), "avg": float(entered) / q}
        elif any(h.get("priceFrom") == "rate" for h in mine):
            rated = open_cost(_lots(mine, False)).get(symbol)
            if rated is not None and rated > 0:
                on = max((str(h.get("priceOn")) for h in mine if h.get("priceFrom") == "rate" and _date(h.get("priceOn"))), default=None)
                out["cost"] = {"kind": "rate", "invested": float(rated), "avg": float(rated) / q, "on": on}
    return out


# ------------------------------------------------------------------------------------------------------------------ the whole relation

async def relation(pool, user_id: str, symbols: Iterable[str], redis=None) -> Dict[str, Dict[str, Any]]:
    """{symbol: facts} for each company the member is linked to (none: {}). Every query is scoped to `user_id`; kept 10 minutes in Redis."""
    syms = clean(symbols)
    if not syms:
        return {}
    async with pool.acquire() as conn:
        st = await conn.fetchrow("SELECT portfolio, watchlist, prefs, updated_at FROM user_state WHERE user_id = $1", user_id)
        stamp = st["updated_at"].isoformat() if st and st["updated_at"] else "none"
        key = f"ask:rel:{VERSION}:{user_id}:{stamp}:{','.join(syms)}"
        if redis is not None:
            try:
                hit = await redis.get(key)
                if hit is not None:
                    return json.loads(hit)
            except Exception:   # nosec B110 - the cache is a speed-up; the database answers without it
                pass
        out = await _build(conn, user_id, syms, st)
    if redis is not None:
        try:
            await redis.set(key, json.dumps(out, default=str), ex=CACHE_SECONDS)
        except Exception:   # nosec B110 - the cache is a speed-up
            pass
    return out


async def _build(conn, user_id: str, syms: List[str], st) -> Dict[str, Dict[str, Any]]:
    from ..alertengine import METRICS
    from ..mfportfolio.book import open_lots
    portfolio = _json(st["portfolio"], {}) if st else {}
    watchlist = _json(st["watchlist"], {}) if st else {}
    prefs = _json(st["prefs"], {}) if st else {}
    holdings = portfolio.get("holdings") if isinstance(portfolio, dict) and isinstance(portfolio.get("holdings"), list) else []
    held_names = {str(h.get("symbol") or "").upper() for h in holdings if isinstance(h, dict)}
    closes = await _closes(conn, user_id) if held_names & set(syms) else {}
    etfs = await _etfs(conn, user_id, syms)
    funds = await _funds(conn, user_id, syms)
    alerts = await _alerts(conn, user_id, syms)
    sector_alerts = [m.groups() for m in (SECTOR_ALERT.match(e) for e in (prefs.get("sectorAlerts") or []) if isinstance(e, str)) if m] \
        if isinstance(prefs, dict) and isinstance(prefs.get("sectorAlerts"), list) else []
    groups = await _groups(conn, syms) if sector_alerts else {}

    out: Dict[str, Dict[str, Any]] = {}
    for s in syms:
        f: Dict[str, Any] = {}
        eq = equity(holdings, closes, s)
        if eq:
            f["equity"] = eq
        es = []
        for r in (x for x in etfs if x["symbol"] == s):
            item = {"name": r["name"], "symbol": r["etf"], "pct": float(r["pct"]), "asOf": r["as_of"].isoformat()}
            if r["qty"] and r["price"] and r["price_date"]:          # every figure with its date: no date, no amount
                item["amount"] = float(r["qty"]) * float(r["price"]) * float(r["pct"]) / 100
                item["priceOn"] = r["price_date"].isoformat()
            es.append(item)
        if es:
            f["etfs"] = sorted(es, key=lambda x: -(x.get("amount") or 0))
        by_code: Dict[int, Dict[str, Any]] = {}
        for r in (x for x in funds if x["symbol"] == s):
            lots = [{**l, "bought_on": _date(l.get("bought_on"))} for l in _json(r["lots"], [])]
            units = sum((Decimal(str(l["units"])) for l in open_lots(lots)), Decimal(0))
            cur = by_code.setdefault(r["code"], {"name": r["name"], "code": r["code"], "pct": float(r["pct"]), "asOf": r["as_of"].isoformat(), "units": 0.0,
                                                 "nav": r["nav"], "navOn": r["nav_date"].isoformat() if r["nav_date"] else None})
            cur["units"] += float(units)
        ms = []
        for cur in by_code.values():
            nav, u = cur.pop("nav"), cur.pop("units")
            if nav and u > 0 and cur.get("navOn"):
                cur["amount"] = u * float(nav) * cur["pct"] / 100
            else:
                cur.pop("navOn", None)
            ms.append(cur)
        if ms:
            f["funds"] = sorted(ms, key=lambda x: -(x.get("amount") or 0))
        lists = watchlist.get("lists") if isinstance(watchlist, dict) and isinstance(watchlist.get("lists"), list) else []
        wl = [str(x.get("name") or "My watchlist")[:28] for x in lists
              if isinstance(x, dict) and s in {str(y).upper() for y in (x.get("symbols") or []) if isinstance(y, str)}]
        if wl:
            f["watchlists"] = wl
        al = []
        for a in (x for x in alerts if x["symbol"] == s):
            meta = METRICS.get(a["metric"], {})
            al.append({"label": meta.get("label", a["metric"]), "unit": meta.get("unit", ""), "op": a["op"],
                       "value": float(a["value"]) if a["value"] is not None else None,
                       "firedAt": a["last_fired_at"].isoformat() if a["last_fired_at"] else None})
        if al:
            f["alerts"] = al
        names = {slug(n): n for n in groups.get(s, [])}
        sa = [{"kind": k, "view": v, "name": names[g]} for k, v, g in sector_alerts if g in names]
        if sa:
            f["sectorAlerts"] = sa
        if f:
            out[s] = f
    return out


# ------------------------------------------------------------------------------------------------------------------ what the model and the member see

def _alert_text(a: Dict[str, Any]) -> str:
    if a["op"] == "event" or a.get("value") is None:
        base = f"{a['label']} alert"
    else:
        unit, v = a.get("unit") or "", a["value"]
        val = inr(v, paise=True) if unit == "₹" else f"{v:g}%" if unit == "%" else f"{v:g}×" if unit == "×" else f"{v:g} {unit}".strip()
        base = f"{a['label'].lower() if a['label'] in ('Price',) else a['label']} {a['op']} {val}"
    fired = f"last fired {day(a['firedAt'])}" if a.get("firedAt") else "not fired yet"
    return f"{base}, active, {fired}"


def lines(f: Dict[str, Any]) -> List[str]:
    """The facts of one company, one line each, every figure with its date."""
    out: List[str] = []
    eq = f.get("equity")
    if eq:
        on = day(eq.get("closeOn"))
        if eq.get("qty"):
            parts = [qty_words(eq["qty"])]
            if eq.get("value") is not None:
                parts.append(f"{inr(eq['value'])} at {inr(eq['close'], paise=True)} (close {on})")
            if eq.get("weight") is not None:
                parts.append(f"{eq['weight']:.1f}% of the Equity portfolio by value, {ordinal(eq['rank'])} of {eq['of']}")
            elif eq.get("of", 0) > 1:
                parts.append(f"one of {eq['of']} holdings; no weight by value, as not every holding has a quantity and a price")
            out.append("Equity portfolio: " + "; ".join(parts) + ".")
            c = eq.get("cost")
            if c and eq.get("close"):
                ch = (eq["close"] / c["avg"] - 1) * 100
                if c["kind"] == "entered":
                    gain = eq["qty"] * eq["close"] - c["invested"]
                    word = "gain" if gain >= 0 else "loss"
                    out.append(f"Average buy price you entered {inr(c['avg'], paise=True)}; {word} {inr(abs(gain))} ({pct(ch, True)}) at the close of {on}.")
                else:
                    when = f" of {day(c['on'])}" if c.get("on") else ""
                    out.append(f"Buy price from your statement's rate (statement rate{when}) {inr(c['avg'], paise=True)}, not a price you entered; "
                               f"the close of {on} is {pct(abs(ch))} {'higher' if ch >= 0 else 'lower'}.")
            elif eq.get("close"):
                out.append("No buy price entered, so no gain or loss is worked out.")
        elif eq.get("sold"):
            out.append("Equity portfolio: on your list; every share entered has been sold, so none is held now.")
        else:
            out.append("Equity portfolio: on your list with no quantity saved (no shares counted).")
    for key, word, price_word in (("funds", "Through funds", "NAV"), ("etfs", "Through ETFs", "price")):
        items = f.get(key) or []
        if not items:
            continue
        bits = []
        for x in items[:MAX_FUNDS]:
            b = f"{x['name']} holds {x['pct']:.1f}% ({day(x['asOf'])} disclosure)"
            if x.get("amount") is not None:
                b += f", about {inr(x['amount'])} of your units ({price_word} {day(x.get('navOn' if key == 'funds' else 'priceOn'))})"
            bits.append(b)
        more = f"; and {len(items) - MAX_FUNDS} more" if len(items) > MAX_FUNDS else ""
        out.append(f"{word}: " + "; ".join(bits) + more + ".")
    tail = []
    if f.get("watchlists"):
        tail.append(("Watchlist " if len(f["watchlists"]) == 1 else "Watchlists ") + ", ".join(f"'{n}'" for n in f["watchlists"]) + ".")
    for a in f.get("alerts") or []:
        tail.append(f"Alert: {_alert_text(a)}.")
    for a in f.get("sectorAlerts") or []:
        tail.append(f"Sector Pulse alert on {a['name']} ({KIND_WORDS.get(a['kind'], a['kind'])}).")
    if tail:
        out.append(" ".join(tail))
    return out


def note(rel: Dict[str, Dict[str, Any]]) -> str:
    """The <member_relation> block for the note with the question (never the system prompt), and the one instruction. Empty with no link."""
    if not rel:
        return ""
    blocks = []
    for s, f in rel.items():
        ls = lines(f)
        if ls:
            blocks.append(f"<member_relation company=\"{s}\">\n" + "\n".join(f"- {x}" for x in ls) + "\n</member_relation>")
    return ("\n".join(blocks) + "\n" + INSTRUCTION) if blocks else ""


def tags(rel: Dict[str, Dict[str, Any]]) -> List[Dict[str, str]]:
    """The `relation` event's tags: [{kind, text, tip}], shown as chips on the answer."""
    out: List[Dict[str, str]] = []
    many = len(rel) > 1
    for s, f in rel.items():
        suffix = f" ({s})" if many else ""
        eq = f.get("equity")
        if eq and eq.get("qty"):
            tip = qty_words(eq["qty"])
            if eq.get("weight") is not None:
                tip += f" · {eq['weight']:.1f}% of your Equity portfolio by value"
            if eq.get("closeOn"):
                tip += f" (close {day(eq['closeOn'])})"
            out.append({"kind": "hold", "text": "You hold this" + suffix, "tip": tip})
        elif eq:
            out.append({"kind": "hold", "text": "In your portfolio list" + suffix, "tip": "On your Equity portfolio with no quantity saved"})
        for key, kind, one, many_w in (("funds", "fund", "In your fund", "In {n} of your funds"), ("etfs", "etf", "In your ETF", "In {n} of your ETFs")):
            items = f.get(key) or []
            if items:
                text = one if len(items) == 1 else many_w.format(n=len(items))
                tip = "; ".join(f"{x['name']} {x['pct']:.1f}% ({day(x['asOf'])} disclosure)" for x in items[:MAX_FUNDS])
                out.append({"kind": kind, "text": text + suffix, "tip": tip})
        if f.get("watchlists"):
            out.append({"kind": "watch", "text": "On your watchlist" + suffix, "tip": ", ".join(f["watchlists"])})
        if f.get("alerts") or f.get("sectorAlerts"):
            tip = "; ".join([_alert_text(a) for a in f.get("alerts") or []] + [f"Sector Pulse: {a['name']}" for a in f.get("sectorAlerts") or []])
            out.append({"kind": "alert", "text": "Alert set" + suffix, "tip": tip})
    return out[:10]
