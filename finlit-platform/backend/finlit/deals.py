"""Bulk, block and short-selling deals, as NSE published them (the `deals` job; served by finlit/dealsapi.py; page /ipo?view=deals).

    Bulk deal    a client's trades in one share on one day adding up to more than 0.5% of the company's listed shares, in the normal market;
                 the broker reports them the same day and the exchange publishes them after the close.
    Block deal   one large trade in the separate block-deal windows (since 7 Dec 2025, SEBI circular SEBI/HO/MRD/POD-III/CIR/P/2025/134:
                 08:45-09:00 off the previous close, 14:05-14:20 off a VWAP, within +-3%, at least Rs 25 crore, delivery compulsory).
    Short        short sales the exchange reports for the day (no client, no side).

A block deal is usually also above 0.5%, so NSE often lists the same trade in both files. Such a bulk line is kept with also_block = true (the Bulk
filter still shows it) and every total counts the trade once. The rule is one function, `mark_duplicates`.

Sources, in the order a run reads them:
    1. today's archive files  nsearchives.nseindia.com/content/equities/bulk.csv and block.csv (no cookie needed)
    2. the snapshot           www.nseindia.in/api/snapshot-capital-market-largedeal: short selling, and a cross-check of 1 (it stands in for 1 when
                              the archive does not answer)
    3. the history            www.nseindia.in/api/historical/{bulk-deals,block-deals,short-selling}?from=&to=, a month a request, stepping back
                              one month a run until two years are held (the cookie flow of finlit/iponse.py; FinLit's relay when NSE refuses)

Pure parsing plus fetch helpers, as in finlit/ipobhav.py and finlit/ipocorp.py. One request a second; after 5 refusals a run stops asking and the
next run tries again. Describes what was traded; never advises.
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

log = logging.getLogger("finlit.deals")

IST = timezone(timedelta(hours=5, minutes=30))
NSE_HOME = "https://www.nseindia.in/"   # NSE moved its site and APIs to .in (28 Nov 2026); .com is refused from AWS and Cloudflare
ARCHIVE = {"bulk": "https://nsearchives.nseindia.com/content/equities/bulk.csv", "block": "https://nsearchives.nseindia.com/content/equities/block.csv"}
SNAPSHOT = "https://www.nseindia.in/api/snapshot-capital-market-largedeal"
HISTORICAL = {"bulk": "https://www.nseindia.in/api/historical/bulk-deals", "block": "https://www.nseindia.in/api/historical/block-deals",
              "short": "https://www.nseindia.in/api/historical/short-selling"}
BROWSER = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
           "Accept": "application/json, text/plain, text/csv, */*", "Referer": "https://www.nseindia.in/report-detail/display-bulk-and-block-deals"}
KINDS = ("bulk", "block", "short")
HISTORY_DAYS = 730                 # two years held, then the backfill stops
MAX_REFUSALS = 5                   # refusals in one run before it stops asking (the next run tries again)
META_LAST = "deals:last"
META_BACKFILL = "deals:backfill"
SOURCE_NAME = "NSE"
SOURCE_URL = "https://www.nseindia.in/report-detail/display-bulk-and-block-deals"


# ------------------------------------------------------------------------------------------------ parsing
def num(v: Any) -> Optional[float]:
    """'1,23,456.50' -> 123456.5; '-', '', None -> None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(",", "").replace("₹", "").strip()
    if s in ("", "-", "--", "NA", "N.A."):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_day(v: Any) -> Optional[date]:
    """'27-NOV-2026', '27-Nov-2026', '27-11-2026', '2026-11-27', '27 Nov 2026' -> date."""
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v or "").strip()
    if not s:
        return None
    s = s.split("T")[0] if re.fullmatch(r"\d{4}-\d\d-\d\dT.*", s) else s
    for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%Y-%m-%d", "%d %b %Y", "%d/%m/%Y", "%d-%B-%Y"):
        try:
            return datetime.strptime(s.title() if "%b" in fmt or "%B" in fmt else s, fmt).date()
        except ValueError:
            continue
    return None


_SUFFIX = [(r"\bPRIVATE\s+LIMITED\b", "PVT LTD"), (r"\bPVT\s+LIMITED\b", "PVT LTD"), (r"\bPRIVATE\s+LTD\b", "PVT LTD"), (r"\bLIMITED\b", "LTD")]


def client_key(name: Any) -> Optional[str]:
    """The client name in one comparable form: uppercase, punctuation and runs of spaces collapsed, PRIVATE LIMITED -> PVT LTD, LIMITED -> LTD.
    'BCP ASIA II TOPCO PTE. LTD.' and 'BCP ASIA II TOPCO PTE . LTD .' give the same key. The published name is kept for display."""
    s = str(name or "").upper().strip()
    if not s or s in ("-", "NA"):
        return None
    s = s.replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    for pat, rep in _SUFFIX:
        s = re.sub(pat, rep, s)
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def side_of(v: Any) -> Optional[str]:
    s = str(v or "").strip().upper()
    if s in ("BUY", "B", "PURCHASE"):
        return "buy"
    if s in ("SELL", "S", "SALE"):
        return "sell"
    return None


def remarks_of(v: Any) -> Optional[str]:
    s = re.sub(r"\s+", " ", str(v or "")).strip()
    return None if s in ("", "-", "--", "NA") else s


def value_cr(qty: Optional[float], price: Optional[float]) -> Optional[float]:
    """Traded value in Rs crore: qty * price / 1e7, to four places."""
    if qty is None or price is None:
        return None
    return round(qty * price / 1e7, 4)


def make_row(kind: str, day: Optional[date], symbol: Any, name: Any, client: Any, side: Any, qty: Any, price: Any, remarks: Any,
             source: str, exchange: str = "NSE") -> Optional[Dict[str, Any]]:
    """One published line as a row, or None when it is not a deal line (a header repeated, "NO RECORDS", a line without a share or quantity)."""
    sym = re.sub(r"\s+", "", str(symbol or "")).upper()
    q = num(qty)
    if kind not in KINDS or day is None or not sym or not re.fullmatch(r"[A-Z0-9&\-_.]{1,30}", sym) or q is None or q <= 0:
        return None
    p = num(price)
    cl = re.sub(r"\s+", " ", str(client or "")).strip() or None
    sd = side_of(side) if kind != "short" else None
    if kind != "short" and sd is None:
        return None
    return {"exchange": exchange, "kind": kind, "day": day, "symbol": sym, "security_name": (re.sub(r"\s+", " ", str(name or "")).strip() or None),
            "client": cl if kind != "short" else None, "client_key": client_key(cl) if kind != "short" else None, "side": sd, "qty": int(round(q)),
            "price": round(p, 4) if p is not None else None, "value_cr": value_cr(q, p), "remarks": remarks_of(remarks), "also_block": False, "source": source}


def _col(headers: List[str], *needles: str) -> Optional[str]:
    for h in headers:
        k = re.sub(r"\s+", " ", h.strip().lower())
        if any(n in k for n in needles):
            return h
    return None


def parse_csv(text: str, kind: str, source: str = "nse-archive") -> List[Dict[str, Any]]:
    """NSE's bulk.csv / block.csv: Date, Symbol, Security Name, Client Name, Buy/Sell, Quantity Traded, Trade Price / Wght. Avg. Price[, Remarks]."""
    text = (text or "").lstrip("﻿")
    if not text.strip() or text.lstrip()[:1] == "<":
        return []
    rd = csv.DictReader(io.StringIO(text))
    hs = [h for h in (rd.fieldnames or []) if h]
    c = {"day": _col(hs, "date"), "symbol": _col(hs, "symbol"), "name": _col(hs, "security name", "scrip name"), "client": _col(hs, "client"),
         "side": _col(hs, "buy/sell", "buy / sell", "buysell"), "qty": _col(hs, "quantity"), "price": _col(hs, "price"), "remarks": _col(hs, "remark")}
    if not (c["day"] and c["symbol"] and c["qty"]):
        return []
    out = []
    for r in rd:
        g = lambda k: r.get(c[k]) if c[k] else None            # noqa: E731
        row = make_row(kind, parse_day(g("day")), g("symbol"), g("name"), g("client"), g("side"), g("qty"), g("price"), g("remarks"), source)
        if row:
            out.append(row)
    return out


def _json_row(kind: str, r: Dict[str, Any], source: str) -> Optional[Dict[str, Any]]:
    """A line of the snapshot (date, symbol, name, clientName, buySell, qty, watp, remarks) or of the history (BD_DT_DATE, BD_SYMBOL, BD_SCRIP_NAME,
    BD_CLIENT_NAME, BD_BUY_SELL, BD_QTY_TRD, BD_TP_WATP, BD_REMARKS; short selling SS_DATE, SS_SYMBOL, SS_NAME, SS_QTY)."""
    if not isinstance(r, dict):
        return None
    u = {re.sub(r"[^a-z]", "", str(k).lower()): v for k, v in r.items()}

    def g(*keys):
        for k in keys:
            if u.get(k) not in (None, ""):
                return u[k]
        return None
    return make_row(kind, parse_day(g("date", "bddtdate", "ssdate", "mtimestamp", "tradedate")), g("symbol", "bdsymbol", "sssymbol"),
                    g("name", "bdscripname", "ssname", "securityname"), g("clientname", "bdclientname"), g("buysell", "bdbuysell"),
                    g("qty", "bdqtytrd", "ssqty", "quantity"), g("watp", "bdtpwatp", "price"), g("remarks", "bdremarks"), source)


def parse_snapshot(body: Any) -> Dict[str, Any]:
    """{asOn, bulk, block, short} from NSE's large-deal snapshot (BULK_DEALS_DATA, BLOCK_DEALS_DATA, SHORT_DEALS_DATA, as_on_date)."""
    body = body if isinstance(body, dict) else {}
    out: Dict[str, Any] = {"asOn": parse_day(body.get("as_on_date"))}
    for kind, key in (("bulk", "BULK_DEALS_DATA"), ("block", "BLOCK_DEALS_DATA"), ("short", "SHORT_DEALS_DATA")):
        out[kind] = [x for x in (_json_row(kind, r, "nse-snapshot") for r in (body.get(key) or [])) if x]
    return out


def parse_historical(body: Any, kind: str) -> List[Dict[str, Any]]:
    """Rows from NSE's historical API ({"data": [...]})."""
    data = body.get("data") if isinstance(body, dict) else body
    return [x for x in (_json_row(kind, r, "nse-historical") for r in (data or [])) if x]


def trade_key(r: Dict[str, Any]) -> Tuple:
    """One trade whatever file or source listed it: the share, day, side, client (normalised), price to the paisa and quantity."""
    p = r.get("price")
    return (r["exchange"], r["kind"], r["day"], r["symbol"], r.get("side"), r.get("client_key"), round(float(p), 2) if p is not None else None, int(r["qty"]))


def mark_duplicates(rows: List[Dict[str, Any]]) -> int:
    """Sets also_block on every bulk row that is the same trade as a block row: same exchange, day, share and side, the same client_key, the same price
    to the paisa and a quantity within one share. Returns how many were marked. The near miss (another price, another client, 2+ shares apart) stays."""
    blocks: Dict[Tuple, List[Dict[str, Any]]] = {}
    for b in rows:
        if b["kind"] == "block" and b.get("client_key") and b.get("price") is not None:
            blocks.setdefault((b["exchange"], b["day"], b["symbol"], b.get("side"), b["client_key"]), []).append(b)
    n = 0
    for r in rows:
        if r["kind"] != "bulk":
            continue
        same = blocks.get((r["exchange"], r["day"], r["symbol"], r.get("side"), r.get("client_key")), [])
        hit = r.get("price") is not None and any(round(float(b["price"]), 2) == round(float(r["price"]), 2) and abs(int(b["qty"]) - int(r["qty"])) <= 1 for b in same)
        r["also_block"] = bool(hit)
        n += int(hit)
    return n


# ------------------------------------------------------------------------------------------------ fetching
class Nse:
    """NSE's archive (plain GET) and its API (the cookie its home page sets, a browser-style agent). When NSE refuses, FinLit's relay (deploy/amfi-relay,
    EXCHANGE_RELAY_URL / EXCHANGE_RELAY_KEY) is asked the same address; a relay that could not reach NSE never stands in for NSE's own answer.
    One request a second; every answer's status is counted for the run summary; after MAX_REFUSALS refusals it stops asking."""

    def __init__(self, http=None, pause_s: float = 1.0, relay: Optional[Tuple[str, str]] = None, use_env_relay: bool = True):
        import httpx
        self.own = http is None
        self.http = http or httpx.AsyncClient(timeout=30, follow_redirects=True, headers=BROWSER)
        self.pause_s, self.warm = pause_s, False
        if relay is None and use_env_relay:
            from .earnings.transcripts import relay_settings
            relay = relay_settings()
        self.relay = relay
        self.status: Dict[str, int] = {}
        self.refusals = 0
        self.requests = 0

    @property
    def stopped(self) -> bool:
        return self.refusals >= MAX_REFUSALS

    async def aclose(self):
        if self.own:
            await self.http.aclose()

    def _count(self, code: Any) -> None:
        self.status[str(code)] = self.status.get(str(code), 0) + 1

    async def _warm(self):
        try:
            await self.http.get(NSE_HOME, headers=BROWSER)
        except Exception:
            pass
        self.warm = True

    @staticmethod
    def _usable(text: str, want: str) -> bool:
        t = (text or "").lstrip("﻿").lstrip()
        if want == "json":
            return t[:1] in ("{", "[")
        return bool(t) and t[:1] != "<"                       # an HTML page is NSE's refusal, not a file

    async def get(self, url: str, want: str = "json", params: Optional[Dict[str, str]] = None) -> Optional[str]:
        """The body as text, or None when neither NSE nor the relay gave a usable answer."""
        if self.stopped:
            return None
        api = url.startswith(("https://www.nseindia.in/api/", "https://www.nseindia.com/api/"))
        for attempt in range(2):
            if api and not self.warm:
                await self._warm()
            await asyncio.sleep(self.pause_s)
            self.requests += 1
            try:
                r = await self.http.get(url, params=params, headers=BROWSER)
                self._count(r.status_code)
                if r.status_code == 200 and self._usable(r.text, want):
                    return r.text
                refused = r.status_code in (401, 403, 429) or (r.status_code == 200 and not self._usable(r.text, want))
            except Exception as exc:                              # noqa: BLE001  (a dropped connection counts as a refusal)
                self._count(type(exc).__name__)
                refused = True
            if refused:
                self.refusals += 1
                self.warm = False
                via = await self._relay(url, want, params)
                if via is not None:
                    return via
                if self.stopped:
                    return None
            else:
                return None                                       # 404 or similar: nothing published there
        return None

    async def _relay(self, url: str, want: str, params: Optional[Dict[str, str]]) -> Optional[str]:
        if not self.relay:
            return None
        import httpx
        base, key = self.relay
        full = str(httpx.URL(url, params=params)) if params else url
        await asyncio.sleep(self.pause_s)
        self.requests += 1
        try:
            r = await self.http.get(base + "/fetch", params={"u": full}, follow_redirects=False, headers={"X-Relay-Key": key, "X-Fwd-User-Agent": BROWSER["User-Agent"],
                                                                              "X-Fwd-Referer": BROWSER["Referer"], "X-Fwd-Accept": BROWSER["Accept"]})
        except Exception:                                         # noqa: BLE001
            self._count("relay-error")
            return None
        if r.headers.get("x-relay-error") or not r.headers.get("x-relay"):
            self._count("relay-error")
            return None
        self._count(f"relay-{r.status_code}")
        return r.text if r.status_code == 200 and self._usable(r.text, want) else None

    async def archive(self, kind: str) -> Optional[List[Dict[str, Any]]]:
        t = await self.get(ARCHIVE[kind], want="csv")
        return parse_csv(t, kind) if t is not None else None

    async def snapshot(self) -> Optional[Dict[str, Any]]:
        t = await self.get(SNAPSHOT, want="json")
        if t is None:
            return None
        try:
            return parse_snapshot(json.loads(t))
        except ValueError:
            return None

    async def historical(self, kind: str, a: date, b: date) -> Optional[List[Dict[str, Any]]]:
        t = await self.get(HISTORICAL[kind], want="json", params={"from": a.strftime("%d-%m-%Y"), "to": b.strftime("%d-%m-%Y")})
        if t is None:
            return None
        try:
            return parse_historical(json.loads(t), kind)
        except ValueError:
            return None


# ------------------------------------------------------------------------------------------------ storage
SAVE_SQL = """INSERT INTO market_deals (exchange, kind, day, symbol, security_name, client, client_key, side, qty, price, value_cr, remarks, also_block, source)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, $13)
ON CONFLICT ON CONSTRAINT market_deals_one DO UPDATE SET security_name = COALESCE(market_deals.security_name, EXCLUDED.security_name),
    remarks = COALESCE(market_deals.remarks, EXCLUDED.remarks)
RETURNING id, (xmax = 0) AS inserted"""
DAY_ROWS_SQL = "SELECT id, exchange, kind, day, symbol, client_key, side, qty, price, also_block FROM market_deals WHERE day = ANY($1::date[])"


async def save(conn, rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    """Upserts the rows, then applies the duplicate rule to every day touched. A line already held from another source (the same trade_key: the history
    after the archive, a client name spaced differently) is not stored twice. Returns {inserted: {kind: n}, days, duplicates}."""
    rows = list(rows)
    days = sorted({r["day"] for r in rows})
    inserted = {k: 0 for k in KINDS}
    new_ids: List[int] = []
    if not rows:
        return {"inserted": inserted, "days": [], "duplicates": 0, "newIds": []}
    held = {trade_key(dict(x)) for x in await conn.fetch(DAY_ROWS_SQL, days)}
    seen = set()
    async with conn.transaction():
        for r in rows:
            k = trade_key(r)
            if k in held or k in seen:
                continue
            seen.add(k)
            got = await conn.fetchrow(SAVE_SQL, r["exchange"], r["kind"], r["day"], r["symbol"], r["security_name"], r["client"], r["client_key"], r["side"],
                                      r["qty"], r["price"], r["value_cr"], r["remarks"], r["source"])
            if got and got["inserted"]:
                inserted[r["kind"]] += 1
                new_ids.append(got["id"])
        # the duplicate rule over everything held for those days (a block line may arrive in a later run than its bulk twin)
        day_rows = [dict(x) for x in await conn.fetch(DAY_ROWS_SQL, days)]
        before = {x["id"]: x["also_block"] for x in day_rows}
        dup = mark_duplicates(day_rows)
        for x in day_rows:
            if x["kind"] == "bulk" and x["also_block"] != before[x["id"]]:
                await conn.execute("UPDATE market_deals SET also_block = $2 WHERE id = $1", x["id"], x["also_block"])
    return {"inserted": inserted, "days": [d.isoformat() for d in days], "duplicates": dup, "newIds": new_ids}


async def held(conn) -> Dict[str, Any]:
    r = await conn.fetchrow("SELECT min(day) AS first, max(day) AS last, count(*) FILTER (WHERE kind = 'bulk') AS bulk, count(*) FILTER (WHERE kind = 'block') AS block, "
                            "count(*) FILTER (WHERE kind = 'short') AS short, count(*) FILTER (WHERE also_block) AS also_block FROM market_deals")
    return {"firstDay": r["first"].isoformat() if r["first"] else None, "lastDay": r["last"].isoformat() if r["last"] else None,
            "rows": {"bulk": r["bulk"], "block": r["block"], "short": r["short"]}, "alsoBlock": r["also_block"]}


FOLLOW_SQL = """SELECT f.user_id, f.what, f.key, d.symbol, d.kind, d.side, d.client, d.value_cr, d.day FROM market_deals d
    JOIN deal_follows f ON (f.what = 'symbol' AND f.key = d.symbol) OR (f.what = 'client' AND f.key = d.client_key)
    WHERE d.id = ANY($1::bigint[]) AND d.kind IN ('bulk', 'block') AND NOT d.also_block ORDER BY f.user_id, d.value_cr DESC NULLS LAST"""


async def notify_follows(conn, ids: List[int]) -> int:
    """One notification per member for the new deals (today's files only, each trade once) in the shares and clients they follow. Returns how many."""
    if not ids:
        return 0
    per: Dict[Any, List[Dict[str, Any]]] = {}
    for r in await conn.fetch(FOLLOW_SQL, ids):
        per.setdefault(r["user_id"], []).append(dict(r))
    n = 0
    for uid, rows in per.items():
        seen, lines = set(), []
        for r in rows:
            k = (r["symbol"], r["client"], r["side"], r["value_cr"])
            if k in seen:
                continue
            seen.add(k)
            v = f"₹{float(r['value_cr']):,.2f} Cr" if r["value_cr"] is not None else "value not published"
            lines.append(f"{r['symbol']}: {r['client'] or 'a client'} {'bought' if r['side'] == 'buy' else 'sold'} ({r['kind']}, {v}) on {r['day']:%d %b %Y}")
        syms = sorted({r["symbol"] for r in rows})
        title = f"New bulk or block deal{'s' if len(lines) > 1 else ''}: {', '.join(syms[:3])}{' and more' if len(syms) > 3 else ''}"
        link = f"/ipo?view=deals&q={syms[0]}" if len(syms) == 1 else "/ipo?view=deals&period=1d"
        await conn.execute("INSERT INTO notifications (user_id, symbol, kind, title, body, link, push) VALUES ($1, $2, 'alert', $3, $4, $5, false)",
                           uid, syms[0] if len(syms) == 1 else None, title[:200], ("\n".join(lines[:12]) + ("\n…" if len(lines) > 12 else ""))[:1000], link)
        n += 1
    return n


def months_back(oldest: date, n: int) -> List[Tuple[date, date]]:
    """n ranges of about a month each, going back from the day before `oldest` (NSE's history wants at most a month a request)."""
    out = []
    b = oldest - timedelta(days=1)
    for _ in range(n):
        a = b - timedelta(days=30)
        out.append((a, b))
        b = a - timedelta(days=1)
    return out


def today_ist() -> date:
    return datetime.now(IST).date()


async def refresh(store, backfill_months: int = 1, max_minutes: float = 8.0, http=None, pause_s: float = 1.0, today: Optional[date] = None,
                  relay: Optional[Tuple[str, str]] = None, use_env_relay: bool = True) -> Dict[str, Any]:
    """One run: today's archive files (the snapshot when the archive does not answer) and the snapshot's short selling, then the history one month
    further back per `backfill_months` until HISTORY_DAYS are held. Nothing held is removed. The summary goes to flows_meta 'deals:last'."""
    from .flows import get_meta, set_meta
    today = today or today_ist()
    stop = time.monotonic() + max_minutes * 60
    nse = Nse(http=http, pause_s=pause_s, relay=relay, use_env_relay=use_env_relay)
    out: Dict[str, Any] = {"at": datetime.now(timezone.utc).isoformat(), "inserted": {k: 0 for k in KINDS}, "read": {k: 0 for k in KINDS}, "days": [],
                           "duplicates": 0, "sources": {}, "crossCheck": None, "backfill": None, "notes": []}
    days: set = set()
    fresh_ids: List[int] = []

    async def put(rows: List[Dict[str, Any]], today_files: bool = False):
        if not rows:
            return
        async with store.pool.acquire() as conn:
            res = await save(conn, rows)
        if today_files:
            fresh_ids.extend(res["newIds"])
        for k in KINDS:
            out["inserted"][k] += res["inserted"][k]
            out["read"][k] += sum(1 for r in rows if r["kind"] == k)
        days.update(res["days"])
        out["duplicates"] += res["duplicates"]

    try:
        # 1. today's files
        arch: Dict[str, Optional[List[Dict[str, Any]]]] = {}
        for kind in ("bulk", "block"):
            arch[kind] = await nse.archive(kind)
            out["sources"][f"archive-{kind}"] = "read" if arch[kind] is not None else "not answered"
        snap = await nse.snapshot() if time.monotonic() < stop else None
        out["sources"]["snapshot"] = "read" if snap is not None else "not answered"
        rows: List[Dict[str, Any]] = []
        for kind in ("bulk", "block"):
            if arch[kind] is not None:
                rows += arch[kind]
            elif snap is not None:
                rows += snap[kind]
                out["notes"].append(f"{kind}: the archive file did not answer; the snapshot's {len(snap[kind])} lines were used")
        if snap is not None:
            rows += snap["short"]
            out["crossCheck"] = {k: {"archive": len(arch[k]) if arch[k] is not None else None, "snapshot": len(snap[k]),
                                     "same": arch[k] is None or {trade_key(r) for r in arch[k]} == {trade_key(r) for r in snap[k]}} for k in ("bulk", "block")}
            out["crossCheck"]["asOn"] = snap["asOn"].isoformat() if snap["asOn"] else None
        await put(rows, today_files=True)
        try:
            async with store.pool.acquire() as conn:
                out["notified"] = await notify_follows(conn, fresh_ids)
        except Exception:                                         # noqa: BLE001  (a notification problem never stops the data)
            log.warning("deal follow notifications not sent", exc_info=True)
            out["notified"] = None

        # 2. the history, one month further back a run
        async with store.pool.acquire() as conn:
            bf = await get_meta(conn, META_BACKFILL) or {}
        # the oldest day the history has been read back to; the first run steps back from today itself
        oldest = date.fromisoformat(bf["oldest"]) if bf.get("oldest") else today + timedelta(days=1)
        goal = today - timedelta(days=HISTORY_DAYS)
        bf_out = {"oldest": oldest.isoformat(), "goal": goal.isoformat(), "ranges": [], "done": oldest <= goal}
        for a, b in months_back(oldest, max(0, backfill_months)):
            if oldest <= goal or time.monotonic() > stop or nse.stopped:
                break
            a = max(a, goal)
            got: Dict[str, Optional[int]] = {}
            hist_rows: List[Dict[str, Any]] = []
            for kind in KINDS:
                if time.monotonic() > stop or nse.stopped:
                    break
                r = await nse.historical(kind, a, b)
                got[kind] = len(r) if r is not None else None
                hist_rows += r or []
            if len(got) < len(KINDS) or any(v is None for v in got.values()):
                bf_out["ranges"].append({"from": a.isoformat(), "to": b.isoformat(), "rows": got, "stored": False})
                out["notes"].append(f"history {a} to {b}: NSE did not answer every list; this month is asked again next run")
                break
            await put(hist_rows)
            oldest = a
            bf_out["ranges"].append({"from": a.isoformat(), "to": b.isoformat(), "rows": got, "stored": True})
        bf_out["oldest"], bf_out["done"] = oldest.isoformat(), oldest <= goal
        out["backfill"] = bf_out
        async with store.pool.acquire() as conn:
            last_answer = bf_out["ranges"][-1]["stored"] if bf_out["ranges"] else bf.get("historyAnswers")
            await set_meta(conn, META_BACKFILL, {"oldest": oldest.isoformat(), "goal": goal.isoformat(), "done": oldest <= goal, "historyAnswers": last_answer})
            out.update(await held(conn))
            out["days"] = sorted(days)
            out["http"] = nse.status
            out["requests"] = nse.requests
            out["stoppedAfterRefusals"] = nse.stopped
            await set_meta(conn, META_LAST, out)
    finally:
        await nse.aclose()
    return out
