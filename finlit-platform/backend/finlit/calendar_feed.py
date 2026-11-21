"""Task #297 (the team, 21 Nov 2026: "integrate the IPO, listing etc. calendars of our website with Google Calendar; give the user a button or link
with Google Calendar and associate it with the Gmail id used in sign-up").

Each member gets a private calendar address in the iCalendar format every calendar app reads. "Add to Google Calendar" opens Google Calendar's own
"add by URL" page with that address filled in, in the Google account of the member's sign-up email (authuser=<email>); Google then reads the address
again by itself, so new IPOs and result dates arrive without the member doing anything. No Google sign-in or key is needed on FinLit's side, and FinLit
never sees the member's Google account.

GET  /api/me/calendar          the member's address (made on first ask), the Google Calendar link and what the calendar holds
POST /api/me/calendar/reset    a new address; the old one stops working at once (CSRF)
GET  /api/calendar/{token}.ics the calendar: IPO opening, closing and listing days (every IPO on FinLit's IPO calendar from 30 days back to 120 ahead)
                               and the announced results dates of the member's own companies (portfolio and watchlists), as all-day events.
Describes dates; never advises.
"""
from __future__ import annotations

import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from .auth.routes import Ctx, fail, secure_ctx
from .calendars import today_ist
from .superinvestors_follow import member_stocks

router = APIRouter()
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{24,64}$")
NAME = "FinLit: IPOs and your results"
BACK, AHEAD = 30, 120
DISCLAIMER = "Dates from FinLit's IPO and results calendars. Information only, not investment advice."
GOOGLE = "https://calendar.google.com/calendar/render"


# ------------------------------------------------------------------------------------------------------------------ pure parts
def esc(text: Any) -> str:
    """iCalendar TEXT: backslash, semicolon, comma and new lines escaped."""
    return str(text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")


def fold(line: str) -> str:
    """Lines longer than 75 octets continue on the next line after a space (RFC 5545 §3.1), never inside a UTF-8 character."""
    out, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > (75 if not out else 74):
            out.append(cur.decode("utf-8"))
            cur = b""
        cur += b
    out.append(cur.decode("utf-8"))
    return "\r\n ".join(out)


def event(uid: str, day: date, summary: str, description: str, url: Optional[str], stamp: datetime) -> List[str]:
    """One all-day event."""
    lines = ["BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{stamp.strftime('%Y%m%dT%H%M%SZ')}", f"DTSTART;VALUE=DATE:{day.strftime('%Y%m%d')}",
             f"DTEND;VALUE=DATE:{(day + timedelta(days=1)).strftime('%Y%m%d')}", f"SUMMARY:{esc(summary)}", f"DESCRIPTION:{esc(description)}",
             "TRANSP:TRANSPARENT"]
    if url:
        lines.append(f"URL:{url}")
    lines.append("END:VEVENT")
    return lines


def _money(v: Any) -> Optional[str]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f"₹{f:,.0f}" if f == int(f) else f"₹{f:,.2f}"


def ipo_events(ipos: Iterable[Dict[str, Any]], site: str, stamp: datetime) -> List[List[str]]:
    out = []
    for r in ipos:
        tag = " (SME)" if r.get("kind") == "sme" else ""
        band = " to ".join(x for x in (_money(r.get("price_low")), _money(r.get("price_high"))) if x) or None
        facts = [f"Price band {band}" if band else None, f"Lot {r['lot_size']} shares" if r.get("lot_size") else None,
                 f"Issue size ₹{float(r['issue_size_cr']):,.0f} cr" if r.get("issue_size_cr") else None,
                 f"Bidding {r['open_date']:%d %b} to {r['close_date']:%d %b %Y}", f"Listing {r['listing_date']:%d %b %Y}" if r.get("listing_date") else None]
        desc = ". ".join(f for f in facts if f) + ". " + DISCLAIMER
        url = f"{site}/ipo/{r['id']}"
        out.append(event(f"ipo-{r['id']}-open@finlit", r["open_date"], f"IPO opens: {r['name']}{tag}", desc, url, stamp))
        out.append(event(f"ipo-{r['id']}-close@finlit", r["close_date"], f"IPO closes: {r['name']}{tag}", desc, url, stamp))
        if r.get("listing_date"):
            out.append(event(f"ipo-{r['id']}-list@finlit", r["listing_date"], f"Listing: {r['name']}{tag}", desc, url, stamp))
    return out


def result_events(rows: Iterable[Dict[str, Any]], site: str, stamp: datetime) -> List[List[str]]:
    out, seen = [], set()
    for r in rows:
        key = (r["symbol"], r["item_date"])
        if key in seen:
            continue
        seen.add(key)
        name = re.sub(r"\s+(Ltd|Limited)\.?$", "", r.get("company") or r["symbol"])
        out.append(event(f"result-{r['symbol']}-{r['item_date']:%Y%m%d}@finlit", r["item_date"], f"Results: {name}",
                         f"{name} ({r['symbol']}) has announced its board meeting for results on this day. In your FinLit portfolio or watchlist. {DISCLAIMER}",
                         f"{site}/stocks/{quote(r['symbol'])}", stamp))
    return out


def calendar(events: List[List[str]]) -> str:
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FinLit//Calendar 1.0//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", f"X-WR-CALNAME:{esc(NAME)}",
             "X-WR-TIMEZONE:Asia/Kolkata", f"X-WR-CALDESC:{esc(DISCLAIMER)}", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"]
    for e in events:
        lines += e
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(x) for x in lines) + "\r\n"


def links(site: str, token: str, email: Optional[str]) -> Dict[str, str]:
    """The address, its webcal form (calendar apps open it to subscribe) and the Google Calendar link in the member's sign-up account."""
    https = f"{site}/api/calendar/{token}.ics"
    webcal = re.sub(r"^https?://", "webcal://", https)
    params = {"cid": webcal}
    if email:
        params["authuser"] = email
    return {"url": https, "webcal": webcal, "google": f"{GOOGLE}?{urlencode(params)}"}


# ------------------------------------------------------------------------------------------------------------------ API
async def _token(conn, uid: str, fresh: bool = False) -> str:
    if not fresh:
        t = await conn.fetchval("SELECT token FROM calendar_feeds WHERE user_id = $1", uid)
        if t:
            return t
    t = secrets.token_urlsafe(32)
    await conn.execute("INSERT INTO calendar_feeds (user_id, token) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET token = $2, created_at = now(), last_read_at = NULL",
                       uid, t)
    return t


def _answer(request: Request, ctx: Ctx, token: str, last: Optional[datetime]) -> dict:
    site = request.app.state.settings.public_site_url
    return {**links(site, token, ctx.email), "email": ctx.email, "name": NAME, "lastReadAt": last.isoformat() if last else None,
            "holds": [f"IPO opening, closing and listing days, {BACK} days back to {AHEAD} ahead", "Results dates of the companies in your portfolio and watchlists"],
            "note": "Google Calendar reads the address again by itself every few hours. Keep it private: anyone with it can see these dates. Replace it to stop the old one."}


@router.get("/api/me/calendar")
async def my_calendar(request: Request, ctx: Ctx = Depends(secure_ctx)):
    async with request.app.state.store.pool.acquire() as conn:
        token = await _token(conn, ctx.user_id)
        last = await conn.fetchval("SELECT last_read_at FROM calendar_feeds WHERE user_id = $1", ctx.user_id)
    return _answer(request, ctx, token, last)


@router.post("/api/me/calendar/reset")
async def reset_calendar(request: Request, ctx: Ctx = Depends(secure_ctx)):
    async with request.app.state.store.pool.acquire() as conn:
        token = await _token(conn, ctx.user_id, fresh=True)
    return _answer(request, ctx, token, None)


@router.get("/api/calendar/{token}.ics")
async def feed(request: Request, token: str):
    if not TOKEN_RE.fullmatch(token):
        raise fail(404, "not_found", "No such calendar.")
    today = today_ist()
    async with request.app.state.store.pool.acquire() as conn:
        uid = await conn.fetchval("UPDATE calendar_feeds SET last_read_at = now() WHERE token = $1 RETURNING user_id", token)
        if not uid:
            raise fail(404, "not_found", "No such calendar.")
        ipos = [dict(r) for r in await conn.fetch(
            "SELECT id, name, kind, open_date, close_date, listing_date, price_low, price_high, lot_size, issue_size_cr FROM ipos "
            "WHERE open_date <= $2 AND coalesce(listing_date, close_date) >= $1 ORDER BY open_date, id", today - timedelta(days=BACK), today + timedelta(days=AHEAD))]
        st = await conn.fetchrow("SELECT watchlist, portfolio FROM user_state WHERE user_id = $1", uid)
        syms = sorted({s for s, _isin, _w in member_stocks(st["portfolio"] if st else None, st["watchlist"] if st else None)})
        res = [dict(r) for r in await conn.fetch(
            "SELECT DISTINCT ON (symbol, item_date) symbol, company, item_date FROM feed_items WHERE kind = 'result' AND symbol = ANY($1::text[]) "
            "AND item_date BETWEEN $2 AND $3 ORDER BY symbol, item_date", syms, today - timedelta(days=BACK), today + timedelta(days=AHEAD))] if syms else []
    site = request.app.state.settings.public_site_url
    stamp = datetime.now(timezone.utc)
    body = calendar(ipo_events(ipos, site, stamp) + result_events(res, site, stamp))
    return Response(content=body, media_type="text/calendar; charset=utf-8",
                    headers={"Cache-Control": "private, max-age=1800", "Content-Disposition": 'inline; filename="finlit.ics"', "X-Robots-Tag": "noindex"})
