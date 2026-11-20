"""Concall Monitor (task #278): the `concalls` job and the list of calls the page shows (docs/CONCALLS.md).

The job (`refresh-concalls`): every call filing the site already stores (`feed_items`, filled whenever a company's announcements are loaded) becomes a
row of `concall_docs`; each schedule, recording and transcript letter is then downloaded once from the exchange archive (the same fetcher and relay as
FinLit AI and the company brief) and read by parse.py. A transcript's text is also kept in `document_pages`, so the Transcript button and the AI summary
open at once. Bounded per run and resumable: what is not read this run is read on the next one; a file the exchange does not give is tried again
(three tries), with the reason kept.

The page (`calls`): the rows grouped into one card per call (a company and a call date): the schedule gives the date and time of an upcoming call;
the recording, the transcript and the presentation filed around that date join it. Nothing is guessed: a date or time the filings do not state is
shown as not stated."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo

from . import parse as P

log = logging.getLogger("finlit.concall")
IST = ZoneInfo("Asia/Kolkata")
LOOKBACK_DAYS = 120          # calls shown: the last four months (a full results season and the one before)
READ_PER_RUN = 160           # letters downloaded and read in one run at most
MAX_TRIES = 3
LETTER_PAGES = 3             # a schedule or recording letter is one or two pages; the call's date is on the first
SOURCE = "The company's own filings with NSE (Analysts / Institutional Investor Meet / Con. Call Updates, Investor Presentation)"

# Candidate filings: the stored announcements the exchange lists as call updates or presentations, or whose title names a call document.
FEED_SQL = """
SELECT f.link, f.symbol, f.title, f.category, f.item_date FROM feed_items f
WHERE f.link LIKE 'https://%' AND f.symbol IS NOT NULL AND f.item_date >= current_date - $1::int
  AND ((coalesce(f.category, '') ~* 'analyst|investor meet|con\\.? ?call|investor presentation')
       OR f.title ~* 'con\\.? ?call|earnings? call|transcript|recording|investor presentation')
  AND NOT EXISTS (SELECT 1 FROM concall_docs c WHERE c.link = f.link)
"""


def today_ist() -> date:
    return datetime.now(IST).date()


async def sync_feed(conn, days: int = LOOKBACK_DAYS) -> int:
    """New call filings from the stored announcements into concall_docs (a presentation needs no reading: it is 'read' at once)."""
    rows = await conn.fetch(FEED_SQL, days)
    new = []
    for r in rows:
        k = P.kind_of(r["category"], r["title"] or "")
        if k is None:
            continue
        new.append((r["link"], r["symbol"].upper(), k, (r["title"] or "")[:300], r["item_date"], "read" if k == "presentation" else "pending"))
    if new:
        await conn.executemany("INSERT INTO concall_docs (link, symbol, kind, title, filed, status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (link) DO NOTHING", new)
    return len(new)


async def _pages(link: str) -> List[str]:
    from ..ask.pages import _pages_of
    return await asyncio.wait_for(_pages_of(link), timeout=90)


async def read_one(store, row: Dict[str, Any], pages_of=_pages) -> Dict[str, Any]:
    """Download and read one letter; returns the values written to its row."""
    from ..ask import docstore
    from ..ask.pages import DamagedFile, ToolError
    try:
        pages = await pages_of(row["link"])
    except (DamagedFile, ToolError, asyncio.TimeoutError) as e:
        return {"status": "failed", "why": (str(e) or e.__class__.__name__)[:300]}
    except Exception as e:  # noqa: BLE001 - one file never stops the run
        log.info("concall: %s not read: %s", row["link"][-60:], e)
        return {"status": "failed", "why": f"{e.__class__.__name__}: {str(e)[:200]}"}
    text = " ".join(p for p in pages[:LETTER_PAGES] if p)
    if not text.strip():
        return {"status": "no_text", "why": "The file is a scan (no text on its first pages); the date and links cannot be read from it.", "pages": len(pages)}
    L = P.read_letter(text, row["kind"], row["filed"])
    if row["kind"] == "transcript":
        await docstore.put_pages(store, row["link"], row["symbol"], "Call transcript", row.get("title"), row["filed"], pages)
    earnings = P.is_earnings_schedule(L, row.get("title") or "") if row["kind"] == "schedule" else (L.earnings or bool(L.quarter))
    return {"status": "read", "why": None, "pages": len(pages), "call_date": L.call_date, "call_time": L.call_time, "earnings": earnings,
            "quarter": L.quarter, "audio": L.audio, "links": L.links}


async def run(store, limit: int = READ_PER_RUN, max_minutes: float = 20.0, symbols: Optional[Sequence[str]] = None, pages_of=_pages) -> Dict[str, Any]:
    """The `concalls` job: new filings in, then the unread letters read (newest first), within the run's limits."""
    t0 = time.monotonic()
    async with store.pool.acquire() as conn:
        added = await sync_feed(conn)
        q = ("SELECT link, symbol, kind, title, filed FROM concall_docs WHERE status IN ('pending', 'failed') AND tries < $1 "  # nosec B608 - fixed fragments; every value is a bound parameter
             + ("AND symbol = ANY($3::text[]) " if symbols else "") + "ORDER BY (kind = 'schedule' AND filed >= current_date - 3) DESC, filed DESC LIMIT $2")
        todo = [dict(r) for r in await conn.fetch(q, MAX_TRIES, limit, *([list(symbols)] if symbols else []))]
    done = failed = 0
    for row in todo:
        if time.monotonic() - t0 > max_minutes * 60:
            break
        v = await read_one(store, row, pages_of)
        async with store.pool.acquire() as conn:
            await conn.execute(
                "UPDATE concall_docs SET status=$2, why=$3, pages=COALESCE($4, pages), call_date=$5, call_time=$6, earnings=COALESCE($7, earnings), "
                "quarter=$8, audio=$9::jsonb, links=$10::jsonb, tries=tries+1, read_at=now() WHERE link=$1",
                row["link"], v["status"], v.get("why"), v.get("pages"), v.get("call_date"), v.get("call_time"), v.get("earnings"), v.get("quarter"),
                json.dumps(v.get("audio") or []), json.dumps(v.get("links") or []))
        done += v["status"] == "read"
        failed += v["status"] != "read"
    async with store.pool.acquire() as conn:
        left = await conn.fetchval("SELECT count(*) FROM concall_docs WHERE status IN ('pending', 'failed') AND tries < $1", MAX_TRIES)
    return {"status": "ok", "added": added, "read": done, "notRead": failed, "left": int(left or 0), "minutes": round((time.monotonic() - t0) / 60, 1)}


# ------------------------------------------------------------------------------------------------ calls for the page
@dataclass
class Call:
    symbol: str
    day: Optional[date]                 # the call's date as a filing states it
    anchor: date                        # the date it sorts by: the call's date, else the first filing's date
    time: Optional[str] = None
    quarter: Optional[str] = None
    earnings: bool = False
    docs: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def add(self, d: Dict[str, Any]) -> None:
        k = d["kind"]
        cur = self.docs.get(k)
        if cur is None or d["filed"] > cur["filed"]:
            self.docs[k] = d
        self.time = self.time or d.get("call_time")
        self.quarter = self.quarter or d.get("quarter")
        self.earnings = self.earnings or bool(d.get("earnings"))


def group(rows: Iterable[Dict[str, Any]]) -> List[Call]:
    """One Call per company and call date. Schedules that are not about an earnings call are left out (broker conferences, one-on-ones)."""
    by: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        if r["kind"] == "schedule" and not (r.get("earnings") and r.get("call_date")):
            continue
        by.setdefault(r["symbol"], []).append(r)
    out: List[Call] = []
    for sym, docs in by.items():
        calls: List[Call] = []
        dated = sorted([d for d in docs if d.get("call_date") and d["kind"] != "presentation"], key=lambda d: d["call_date"])
        for d in dated:
            c = next((c for c in calls if c.day and abs((c.day - d["call_date"]).days) <= 1), None)
            if c is None:
                c = Call(sym, d["call_date"], d["call_date"])
                calls.append(c)
            c.add(d)
        for d in sorted([d for d in docs if not d.get("call_date") and d["kind"] in ("recording", "transcript")], key=lambda d: d["filed"]):
            near = [c for c in calls if c.day and c.day <= d["filed"] <= c.day + timedelta(days=14)]
            c = min(near, key=lambda c: (d["filed"] - c.day).days) if near else None
            if c is None:     # a recording or transcript whose letter does not state the call's date: its own card, dated by the filing
                c = next((c for c in calls if c.day is None and abs((c.anchor - d["filed"]).days) <= 7), None)
                if c is None:
                    c = Call(sym, None, d["filed"])
                    calls.append(c)
            c.add(d)
        for d in sorted([d for d in docs if d["kind"] == "presentation"], key=lambda d: d["filed"]):
            near = [c for c in calls if c.anchor - timedelta(days=10) <= d["filed"] <= c.anchor + timedelta(days=3)]
            if near:
                min(near, key=lambda c: abs((c.anchor - d["filed"]).days)).add(d)
        out.extend(calls)
    return out


def _doc(d: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not d:
        return None
    return {"link": d["link"], "title": d.get("title"), "filed": d["filed"].isoformat(), "pages": d.get("pages")}


WORKING_DAYS_TRANSCRIPT = 5


def _working_days_after(day: date, n: int) -> date:
    d = day
    while n > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d


def card(c: Call, names: Dict[str, str], today: date) -> Dict[str, Any]:
    """One call as the page shows it, with the reason for every button that has nothing to open."""
    upcoming = bool(c.day and c.day >= today and "recording" not in c.docs and "transcript" not in c.docs)
    rec, tr, ppt = c.docs.get("recording"), c.docs.get("transcript"), c.docs.get("presentation")
    when = c.day.strftime("%d %b %Y").lstrip("0") if c.day else None
    # Listen: the audio file the recording letter links (played on the page); else the page it names (opened in a new tab); else the letter itself.
    audio = [u for u in ((rec or {}).get("audio") or []) + ((tr or {}).get("audio") or []) if u.lower().startswith("https://")]
    page_links = [u for u in ((rec or {}).get("links") or []) if u.lower().startswith("http")]
    listen: Dict[str, Any]
    if audio:
        listen = {"audio": audio[0], "letter": _doc(rec or tr)}
    elif page_links:
        listen = {"page": page_links[0], "letter": _doc(rec), "pageNote": "The company's letter gives a web page for the recording, not an audio file: it opens in a new tab."}
    elif rec:
        listen = {"letter": _doc(rec), "pageNote": "The company's letter does not give a link FinLit can read; open the letter to see where the recording is."}
    elif upcoming:
        listen = {"why": f"The call is on {when}. Companies file the recording link within 24 hours of the call (SEBI LODR)."}
    elif c.day and (today - c.day).days <= 1:
        listen = {"why": "Not filed yet. Companies file the recording link within 24 hours of the call (SEBI LODR)."}
    else:
        listen = {"why": "No recording link filed with the exchange for this call."}
    transcript: Dict[str, Any]
    if tr:
        transcript = {"doc": _doc(tr)}
    elif upcoming:
        transcript = {"why": f"The call is on {when}. Companies file the transcript within 5 working days of the call (SEBI LODR)."}
    elif c.day and today <= _working_days_after(c.day, WORKING_DAYS_TRANSCRIPT):
        transcript = {"why": "Not filed yet. Companies file the transcript within 5 working days of the call (SEBI LODR)."}
    else:
        transcript = {"why": "No transcript filed with the exchange for this call."}
    deck = {"doc": _doc(ppt)} if ppt else {"why": "No investor presentation filed with this call."}
    src = tr or ppt
    summary = ({"source": "transcript" if tr else "presentation", "link": src["link"]} if src else
               {"why": "An AI summary is written from the call's transcript or presentation; neither is filed yet."})
    sched = c.docs.get("schedule")
    return {"id": f"{c.symbol}|{c.day.isoformat() if c.day else 'f' + c.anchor.isoformat()}", "symbol": c.symbol, "name": names.get(c.symbol) or c.symbol,
            "date": c.day.isoformat() if c.day else None, "time": c.time, "timeLabel": P.time_label(c.time),
            "dateNote": None if c.day else f"The filings do not state the call's date; first filed {c.anchor.strftime('%d %b %Y').lstrip('0')}.",
            "timeNote": None if c.time else "Time not stated in the filings",
            "kind": "Earnings call" if c.earnings else "Investor call", "quarter": c.quarter, "upcoming": upcoming,
            "schedule": _doc(sched), "listen": listen, "transcript": transcript, "ppt": deck, "summary": summary,
            "sortKey": f"{c.anchor.isoformat()} {c.time or '00:00'}"}


async def calls(conn, today: Optional[date] = None, days: int = LOOKBACK_DAYS) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """Every call card of the last `days` days and every upcoming one, newest first, and when the filings were last read."""
    today = today or today_ist()
    rows = [dict(r) for r in await conn.fetch(
        "SELECT link, symbol, kind, title, filed, call_date, call_time, earnings, quarter, audio, links, pages FROM concall_docs "
        "WHERE status = 'read' AND (filed >= current_date - $1::int OR call_date >= current_date)", days)]
    for r in rows:
        for k in ("audio", "links"):
            v = r.get(k)
            r[k] = json.loads(v) if isinstance(v, str) else (v or [])
    syms = sorted({r["symbol"] for r in rows})
    names = {r["symbol"]: r["name"] for r in await conn.fetch("SELECT symbol, name FROM companies WHERE symbol = ANY($1::text[])", syms)} if syms else {}
    cards = [card(c, names, today) for c in group(rows)]
    cards.sort(key=lambda x: x["sortKey"], reverse=True)
    last = await conn.fetchval("SELECT max(read_at) FROM concall_docs")
    return cards, (last.isoformat() if last else None)
