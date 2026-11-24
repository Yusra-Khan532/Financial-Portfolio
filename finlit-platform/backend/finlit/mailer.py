"""Mail from contact@finlitventures.com through Amazon SES (task #387, owner's choice 24 Nov 2026).

The team uploads a list (CSV or Excel) with where those people gave their address, writes one mail, sends a test to itself, then sends in batches.
Every mail carries a one-click unsubscribe (List-Unsubscribe and List-Unsubscribe-Post headers, RFC 8058, plus a link in the footer); an address that
unsubscribed is never mailed again. Bounces and complaints are held back by SES's account-level suppression list. Nobody gets the same mail twice
(mail_sends is unique per mail and person). Administrators only (signed in with the authenticator code), except the unsubscribe link.

Sending uses the SES v2 API (SendEmail with a raw message), signed with AWS Signature Version 4 here, so no AWS SDK is needed. The key is the
IAM user finlit-ses-sender, which may only send from the finlitventures.com identity: SES_REGION, SES_ACCESS_KEY_ID and SES_SECRET_ACCESS_KEY
in the server's .env.aws, never in the code.
"""
from __future__ import annotations

import asyncio
import base64
import csv
import hashlib
import hmac
import io
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from html import escape
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .auth.routes import NO_STORE, admin_ctx

router = APIRouter(prefix="/api")
log = logging.getLogger("finlit.mailer")

FROM_NAME = "FinLit Ventures"
FROM_ADDRESS = "contact@finlitventures.com"
DISCLAIMER = "FinLit Ventures describes companies and funds from their filings and prices; this is not a recommendation. Information only, not investment advice."
RATE_PER_SECOND = 8            # below the account's 14 a second, so other mail from the account still has room
MAX_BATCH = 5000
MAX_FILE_BYTES = 5 * 1024 * 1024
EMAIL = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}$")
# Misspelt mail domains seen in hand-typed registration forms: such an address bounces, and bounces are what push a sender into spam.
TYPO_DOMAINS = {"gmial.com", "gmai.com", "gamil.com", "gmal.com", "gmail.co", "gmail.con", "gmail.cm", "gmaill.com", "gnail.com", "yaho.com",
                "yahoo.co", "yahooo.com", "hotmial.com", "hotmail.co", "outlok.com", "outlook.co", "rediffmail.co", "gmail.in"}
# The site's rule: describe, never advise. A mail with any of these words is refused before it can be sent.
ADVICE = re.compile(r"\b(buy|sell|hold|accumulate|avoid|reduce|target price|top pick|multibagger|sure[- ]shot|guaranteed returns?|best stocks?)\b", re.I)


def out(body: Any, status: int = 200) -> Response:
    return Response(content=json.dumps(body, default=str), media_type="application/json", headers=NO_STORE, status_code=status)


# ------------------------------------------------------------------------------------------------ AWS Signature Version 4 and SES
def _hmac(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def sigv4_headers(method: str, host: str, path: str, query: str, body: bytes, region: str, service: str, key_id: str, secret: str,
                  now: Optional[datetime] = None, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """The Authorization and X-Amz-Date headers for one request (AWS Signature Version 4). `extra` headers are signed too."""
    t = (now or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
    day = t[:8]
    headers = {"host": host, "x-amz-date": t, **{k.lower(): v for k, v in (extra or {}).items()}}
    names = sorted(headers)
    canonical = "\n".join([method, path, query, "".join(f"{n}:{headers[n].strip()}\n" for n in names), ";".join(names),
                           hashlib.sha256(body).hexdigest()])
    scope = f"{day}/{region}/{service}/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", t, scope, hashlib.sha256(canonical.encode("utf-8")).hexdigest()])
    k = _hmac(_hmac(_hmac(_hmac(("AWS4" + secret).encode("utf-8"), day), region), service), "aws4_request")
    signature = hmac.new(k, to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    return {"X-Amz-Date": t, "Authorization": f"AWS4-HMAC-SHA256 Credential={key_id}/{scope}, SignedHeaders={';'.join(names)}, Signature={signature}"}


def ses_config() -> Optional[Tuple[str, str, str]]:
    region, key_id, secret = (os.environ.get(k, "").strip() for k in ("SES_REGION", "SES_ACCESS_KEY_ID", "SES_SECRET_ACCESS_KEY"))
    return (region, key_id, secret) if region and key_id and secret else None


class SesError(Exception):
    pass


async def ses_send_raw(http: httpx.AsyncClient, to: str, raw: bytes) -> str:
    """Send one raw message through SES v2; returns SES's MessageId. Raises SesError with SES's own reason."""
    cfg = ses_config()
    if not cfg:
        raise SesError("SES is not set up on the server (SES_REGION, SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY)")
    region, key_id, secret = cfg
    host, path = f"email.{region}.amazonaws.com", "/v2/email/outbound-emails"
    body = json.dumps({"FromEmailAddress": formataddr((FROM_NAME, FROM_ADDRESS)), "Destination": {"ToAddresses": [to]},
                       "Content": {"Raw": {"Data": base64.b64encode(raw).decode("ascii")}}}).encode("utf-8")
    headers = {"content-type": "application/json"}
    headers.update(sigv4_headers("POST", host, path, "", body, region, "ses", key_id, secret, extra=headers))
    r = await http.post(f"https://{host}{path}", content=body, headers=headers)
    if r.status_code != 200:
        try:
            reason = r.json().get("message") or r.text[:200]
        except ValueError:
            reason = r.text[:200]
        raise SesError(f"SES {r.status_code}: {reason}")
    return r.json().get("MessageId", "")


# ------------------------------------------------------------------------------------------------ the list
def read_rows(filename: str, data: bytes) -> List[Dict[str, str]]:
    """Rows of a CSV or Excel file as {header: value}, headers lower-case. The first row is the header row."""
    name = (filename or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        rows = [["" if c is None else str(c).strip() for c in row] for row in wb.active.iter_rows(values_only=True)]
    elif name.endswith((".csv", ".txt")):
        text = data.decode("utf-8-sig", errors="replace")
        rows = [[c.strip() for c in row] for row in csv.reader(io.StringIO(text))]
    else:
        raise ValueError("Upload a .csv or .xlsx file")
    rows = [r for r in rows if any(r)]
    if not rows:
        return []
    head = [h.lower() for h in rows[0]]
    return [dict(zip(head, r)) for r in rows[1:]]


def pick(row: Dict[str, str], *words: str) -> str:
    for k, v in row.items():
        if any(w in k for w in words) and v:
            return v
    return ""


def clean(rows: Iterable[Dict[str, str]]) -> Dict[str, Any]:
    """Split a list into people to add and the rest, each with its reason. Never guesses a correction."""
    good: Dict[str, str] = {}
    invalid: List[str] = []
    typos: List[str] = []
    dupes = 0
    for row in rows:
        email = pick(row, "mail").strip().strip("<>").lower()
        name = pick(row, "name").strip()[:120]
        if not email:
            continue
        if not EMAIL.match(email):
            invalid.append(email)
            continue
        if email.split("@", 1)[1] in TYPO_DOMAINS:
            typos.append(email)
            continue
        if email in good:
            dupes += 1
            continue
        good[email] = name
    return {"good": good, "invalid": invalid, "typos": typos, "duplicates": dupes}


async def domains_without_mail(http: httpx.AsyncClient, domains: Iterable[str]) -> List[str]:
    """Domains with no mail server (no MX record): mail to them bounces. Looked up through Cloudflare's public DNS over HTTPS; a domain that
    cannot be looked up is kept (never dropped on a guess)."""
    bad: List[str] = []
    sem = asyncio.Semaphore(10)

    async def one(d: str) -> None:
        async with sem:
            try:
                r = await http.get("https://cloudflare-dns.com/dns-query", params={"name": d, "type": "MX"}, headers={"accept": "application/dns-json"})
                j = r.json()
            except (httpx.HTTPError, ValueError):
                return
            if j.get("Status") == 3 or (j.get("Status") == 0 and not any(a.get("type") == 15 for a in j.get("Answer") or [])):
                bad.append(d)
    await asyncio.gather(*(one(d) for d in sorted(set(domains))))
    return sorted(bad)


# ------------------------------------------------------------------------------------------------ the mail
def wording_problems(*texts: str) -> List[str]:
    return sorted({m.group(0).lower() for t in texts for m in ADVICE.finditer(t or "")})


def unsubscribe_token(contact_id: int, secret: str) -> str:
    sig = hmac.new(secret.encode("utf-8"), f"unsub:{contact_id}".encode("utf-8"), hashlib.sha256).hexdigest()[:24]
    return f"{contact_id}.{sig}"


def token_contact(token: str, secret: str) -> Optional[int]:
    try:
        cid = int((token or "").split(".", 1)[0])
    except ValueError:
        return None
    return cid if hmac.compare_digest(unsubscribe_token(cid, secret), token or "") else None


def first_name(name: Optional[str]) -> str:
    part = (name or "").strip().split()
    return part[0].capitalize() if part else "there"


LINK = re.compile(r"(https?://[^\s<>()]+[^\s<>().,;:!?])")


def _html_para(p: str) -> str:
    return "<br>".join(LINK.sub(lambda m: f'<a href="{m.group(1)}" style="color:#1F6F50">{m.group(1)}</a>', escape(line)) for line in p.split("\n"))


def build_message(subject: str, body: str, why: str, to: str, name: Optional[str], unsub_url: str,
                  button_text: Optional[str] = None, button_url: Optional[str] = None) -> EmailMessage:
    """A plain-text and HTML mail with the one-click unsubscribe headers. {name} in the body becomes the first name. The optional button sits
    under the text (in the plain-text copy it is the words and the link)."""
    text = body.replace("{name}", first_name(name)).strip()
    if button_text and button_url:
        text += f"\n\n{button_text.strip()}: {button_url.strip()}"
    foot = f"{why.strip()}\nUnsubscribe: {unsub_url}\n{DISCLAIMER}\nFinLit Ventures · {FROM_ADDRESS} · https://finlitventures.com"
    m = EmailMessage()
    m["From"] = formataddr((FROM_NAME, FROM_ADDRESS))
    m["To"] = to
    m["Subject"] = subject.strip()
    m["Reply-To"] = FROM_ADDRESS
    m["Message-ID"] = make_msgid(domain="finlitventures.com")
    m["List-Unsubscribe"] = f"<{unsub_url}>, <mailto:{FROM_ADDRESS}?subject={quote('unsubscribe')}>"
    m["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    m.set_content(f"{text}\n\n--\n{foot}\n")
    body_text = body.replace("{name}", first_name(name)).strip()
    paras = "".join(f'<p style="margin:0 0 14px">{_html_para(p)}</p>' for p in re.split(r"\n\s*\n", body_text) if p.strip())
    if button_text and button_url:
        paras += (f'<p style="margin:22px 0 8px"><a href="{escape(button_url.strip())}" style="display:inline-block;background:#1F6F50;color:#ffffff;'
                  f'text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">{escape(button_text.strip())}</a></p>')
    html = (f'<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff;font:15px/1.6 Arial,Helvetica,sans-serif;color:#1d1d1b">'
            f'<div style="max-width:560px;margin:0 auto">{paras}'
            f'<hr style="border:0;border-top:1px solid #e3e3e3;margin:24px 0 12px">'
            f'<p style="margin:0 0 6px;font-size:12px;color:#6b6b6b">{escape(why.strip())} <a href="{escape(unsub_url)}" style="color:#6b6b6b">Unsubscribe</a></p>'
            f'<p style="margin:0 0 6px;font-size:12px;color:#6b6b6b">{escape(DISCLAIMER)}</p>'
            f'<p style="margin:0;font-size:12px;color:#6b6b6b">FinLit Ventures · {FROM_ADDRESS} · <a href="https://finlitventures.com" style="color:#6b6b6b">finlitventures.com</a></p>'
            f"</div></body></html>")
    m.add_alternative(html, subtype="html")
    return m


def unsub_url(settings: Any, contact_id: int) -> str:
    return f"{settings.public_site_url}/api/mail/unsubscribe?t={unsubscribe_token(contact_id, settings.secret_key)}"


# ------------------------------------------------------------------------------------------------ the sender
SENDER_KEY = "mail:sender"


async def drain(app) -> Dict[str, int]:
    """Send every queued mail, a few at a time, at RATE_PER_SECOND. One sender at a time (a Redis lock); a row is claimed before it is sent, so
    a restart never sends it twice; a person who unsubscribed after the row was queued is skipped."""
    store = app.state.store
    got = await store.redis.set(SENDER_KEY, str(os.getpid()), nx=True, ex=120)
    if not got:
        return {"sent": 0, "busy": 1}
    done = {"sent": 0, "failed": 0, "skipped": 0}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as http:
            while True:
                await store.redis.expire(SENDER_KEY, 120)
                async with store.pool.acquire() as conn:
                    rows = await conn.fetch(
                        "UPDATE mail_sends s SET status = 'sending' FROM (SELECT id FROM mail_sends WHERE status = 'queued' ORDER BY id LIMIT $1 "
                        "FOR UPDATE SKIP LOCKED) q WHERE s.id = q.id RETURNING s.id, s.campaign_id, s.contact_id", RATE_PER_SECOND)
                if not rows:
                    break
                started = time.monotonic()
                for r in rows:
                    async with store.pool.acquire() as conn:
                        c = await conn.fetchrow("SELECT email, name, status FROM mail_contacts WHERE id = $1", r["contact_id"])
                        k = await conn.fetchrow("SELECT subject, body, why, button_text, button_url FROM mail_campaigns WHERE id = $1", r["campaign_id"])
                    if not c or not k or c["status"] != "active":
                        status, mid, err = "skipped", None, (f"address is {c['status']}" if c else "contact removed")
                    else:
                        try:
                            msg = build_message(k["subject"], k["body"], k["why"], c["email"], c["name"], unsub_url(app.state.settings, r["contact_id"]), k["button_text"], k["button_url"])
                            mid, status, err = await ses_send_raw(http, c["email"], msg.as_bytes()), "sent", None
                        except (SesError, httpx.HTTPError) as e:
                            status, mid, err = "failed", None, str(e)[:300]
                    async with store.pool.acquire() as conn:
                        await conn.execute("UPDATE mail_sends SET status = $2, message_id = $3, error = $4, sent_at = CASE WHEN $2 = 'sent' THEN now() END "
                                           "WHERE id = $1", r["id"], status, mid, err)
                    done[status] = done.get(status, 0) + 1
                wait = 1.0 - (time.monotonic() - started)
                if wait > 0:
                    await asyncio.sleep(wait)
    finally:
        await store.redis.delete(SENDER_KEY)
    return done


_task: Optional[asyncio.Task] = None


def start_sender(app) -> None:
    """Start the sender in the background if it is not running in this process."""
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_run(app))


async def _run(app) -> None:
    try:
        res = await drain(app)
        log.info("mail sender finished: %s", res)
    except Exception:
        log.exception("mail sender stopped")
        async with app.state.store.pool.acquire() as conn:
            await conn.execute("UPDATE mail_sends SET status = 'queued' WHERE status = 'sending'")


# ------------------------------------------------------------------------------------------------ routes
@router.get("/admin/mail")
async def summary(request: Request, _ctx=Depends(admin_ctx)):
    async with request.app.state.store.pool.acquire() as conn:
        contacts = await conn.fetch("SELECT source, status, count(*) AS n FROM mail_contacts GROUP BY source, status ORDER BY source, status")
        camps = await conn.fetch(
            "SELECT k.id, k.subject, k.body, k.why, k.button_text, k.button_url, k.created_at, k.updated_at, "
            "(SELECT count(*) FROM mail_contacts c WHERE c.status = 'active' AND NOT EXISTS (SELECT 1 FROM mail_sends x WHERE x.campaign_id = k.id "
            "AND x.contact_id = c.id)) AS remaining, "
            "count(s.id) FILTER (WHERE s.status = 'queued' OR s.status = 'sending') AS queued, count(s.id) FILTER (WHERE s.status = 'sent') AS sent, "
            "count(s.id) FILTER (WHERE s.status = 'failed') AS failed, count(s.id) FILTER (WHERE s.status = 'skipped') AS skipped "
            "FROM mail_campaigns k LEFT JOIN mail_sends s ON s.campaign_id = k.id GROUP BY k.id ORDER BY k.id DESC LIMIT 20")
        errors = await conn.fetch("SELECT campaign_id, error, count(*) AS n, max(sent_at) AS last FROM mail_sends WHERE status = 'failed' "
                                  "GROUP BY campaign_id, error ORDER BY n DESC LIMIT 10")
        sending = await conn.fetchval("SELECT count(*) FROM mail_sends WHERE status = 'sending'")
        stuck = await conn.fetchval("SELECT count(*) FROM mail_sends WHERE status IN ('queued', 'sending')")
    if stuck and not await request.app.state.store.redis.exists(SENDER_KEY):
        async with request.app.state.store.pool.acquire() as conn:
            await conn.execute("UPDATE mail_sends SET status = 'queued' WHERE status = 'sending'")
        start_sender(request.app)        # a restart left mail queued: carry on
    return out({"ready": ses_config() is not None, "from": formataddr((FROM_NAME, FROM_ADDRESS)), "ratePerSecond": RATE_PER_SECOND, "sendingNow": bool(sending or stuck),
                "contacts": [dict(r) for r in contacts], "campaigns": [dict(r) for r in camps], "errors": [dict(r) for r in errors]})


class ImportIn(BaseModel):
    filename: str = Field(max_length=200)
    data: str = Field(max_length=MAX_FILE_BYTES * 4 // 3 + 16)     # the file, base64
    source: str = Field(max_length=160)


@router.post("/admin/mail/import")
async def import_list(request: Request, body: ImportIn, _ctx=Depends(admin_ctx)):
    source = body.source.strip()
    if len(source) < 3:
        return out({"detail": "Say where these people gave their address (for example the event name and month)."}, 422)
    try:
        data = base64.b64decode(body.data, validate=True)
    except ValueError:
        return out({"detail": "The file could not be read."}, 422)
    if len(data) > MAX_FILE_BYTES:
        return out({"detail": "The file is larger than 5 MB."}, 413)
    try:
        rows = read_rows(body.filename, data)
    except Exception as e:   # a damaged or password-protected workbook
        return out({"detail": f"The file could not be read: {str(e)[:160]}"}, 422)
    if rows and not any("mail" in k for k in rows[0]):
        return out({"detail": "No column with 'email' in its heading was found in the first row."}, 422)
    c = clean(rows)
    async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=5.0)) as http:
        nomx = set(await domains_without_mail(http, (e.split("@", 1)[1] for e in c["good"])))
    no_server = [e for e in c["good"] if e.split("@", 1)[1] in nomx]
    good = {e: n for e, n in c["good"].items() if e.split("@", 1)[1] not in nomx}
    async with request.app.state.store.pool.acquire() as conn:
        added = await conn.fetchval(
            "WITH ins AS (INSERT INTO mail_contacts (email, name, source) SELECT * FROM unnest($1::text[], $2::text[], $3::text[]) "
            "ON CONFLICT (email) DO NOTHING RETURNING 1) SELECT count(*) FROM ins",
            list(good), [n or None for n in good.values()], [source] * len(good))
    return out({"rows": len(rows), "added": added, "alreadyThere": len(good) - added, "duplicates": c["duplicates"],
                "invalid": c["invalid"][:50], "invalidCount": len(c["invalid"]), "typos": c["typos"][:50], "typoCount": len(c["typos"]),
                "noMailServer": no_server[:50], "noMailServerCount": len(no_server)})


class CampaignIn(BaseModel):
    subject: str = Field(min_length=3, max_length=150)
    body: str = Field(min_length=20, max_length=20000)
    why: str = Field(min_length=10, max_length=300)
    buttonText: Optional[str] = Field(default=None, max_length=60)
    buttonUrl: Optional[str] = Field(default=None, max_length=500)


@router.post("/admin/mail/campaigns")
async def save_campaign(request: Request, body: CampaignIn, id: Optional[int] = None, ctx=Depends(admin_ctx)):
    bt, bu = (body.buttonText or "").strip() or None, (body.buttonUrl or "").strip() or None
    if bool(bt) != bool(bu):
        return out({"detail": "A button needs both its words and its link."}, 422)
    if bu and not re.match(r"^https://[^\s<>\"']+$", bu):
        return out({"detail": "The button link must start with https://"}, 422)
    bad = wording_problems(body.subject, body.body, bt or "")
    if bad:
        return out({"detail": f"The mail uses advice words: {', '.join(bad)}. FinLit describes; it never advises."}, 422)
    async with request.app.state.store.pool.acquire() as conn:
        if id:
            if await conn.fetchval("SELECT count(*) FROM mail_sends WHERE campaign_id = $1", id):
                return out({"detail": "This mail has already been sent to some people; make a new mail instead of changing it."}, 409)
            row = await conn.fetchrow("UPDATE mail_campaigns SET subject = $2, body = $3, why = $4, button_text = $5, button_url = $6, updated_at = now() "
                                      "WHERE id = $1 RETURNING id", id, body.subject, body.body, body.why, bt, bu)
        else:
            row = await conn.fetchrow("INSERT INTO mail_campaigns (subject, body, why, button_text, button_url, created_by) VALUES ($1, $2, $3, $4, $5, $6) "
                                      "RETURNING id", body.subject, body.body, body.why, bt, bu, ctx.user_id)
    return out({"id": row["id"]} if row else {"detail": "No such mail"}, 200 if row else 404)


@router.get("/admin/mail/campaigns/{cid}/preview")
async def preview(request: Request, cid: int, _ctx=Depends(admin_ctx)):
    async with request.app.state.store.pool.acquire() as conn:
        k = await conn.fetchrow("SELECT subject, body, why, button_text, button_url FROM mail_campaigns WHERE id = $1", cid)
    if not k:
        return out({"detail": "No such mail"}, 404)
    m = build_message(k["subject"], k["body"], k["why"], "preview@example.com", "Priya Sharma", f"{request.app.state.settings.public_site_url}/api/mail/unsubscribe?t=preview",
                      k["button_text"], k["button_url"])
    html = next(p for p in m.walk() if p.get_content_type() == "text/html").get_content()
    return Response(content=html, media_type="text/html", headers={**NO_STORE, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'"})


class TestIn(BaseModel):
    to: str = Field(max_length=254)


@router.post("/admin/mail/campaigns/{cid}/test")
async def send_test(request: Request, cid: int, body: TestIn, _ctx=Depends(admin_ctx)):
    to = body.to.strip().lower()
    if not EMAIL.match(to):
        return out({"detail": "That is not an email address."}, 422)
    async with request.app.state.store.pool.acquire() as conn:
        k = await conn.fetchrow("SELECT subject, body, why, button_text, button_url FROM mail_campaigns WHERE id = $1", cid)
    if not k:
        return out({"detail": "No such mail"}, 404)
    m = build_message("[Test] " + k["subject"], k["body"], k["why"], to, "Priya Sharma", f"{request.app.state.settings.public_site_url}/api/mail/unsubscribe?t=test",
                      k["button_text"], k["button_url"])
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as http:
            mid = await ses_send_raw(http, to, m.as_bytes())
    except (SesError, httpx.HTTPError) as e:
        return out({"detail": str(e)[:300]}, 502)
    return out({"status": "sent", "messageId": mid})


class SendIn(BaseModel):
    count: int = Field(ge=1, le=MAX_BATCH)
    source: Optional[str] = Field(default=None, max_length=160)


@router.post("/admin/mail/campaigns/{cid}/send")
async def send_batch(request: Request, cid: int, body: SendIn, _ctx=Depends(admin_ctx)):
    """Queue the next `count` people who may be mailed and have not had this mail yet (optionally from one source), then start sending."""
    if not ses_config():
        return out({"detail": "SES is not set up on the server."}, 503)
    async with request.app.state.store.pool.acquire() as conn:
        if not await conn.fetchval("SELECT 1 FROM mail_campaigns WHERE id = $1", cid):
            return out({"detail": "No such mail"}, 404)
        queued = await conn.fetchval(
            "WITH ins AS (INSERT INTO mail_sends (campaign_id, contact_id) SELECT $1, c.id FROM mail_contacts c WHERE c.status = 'active' "
            "AND ($3::text IS NULL OR c.source = $3) AND NOT EXISTS (SELECT 1 FROM mail_sends s WHERE s.campaign_id = $1 AND s.contact_id = c.id) "
            "ORDER BY c.id LIMIT $2 ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*) FROM ins", cid, body.count, body.source or None)
    start_sender(request.app)
    return out({"queued": queued})


async def _unsubscribe(request: Request, token: str) -> bool:
    cid = token_contact(token, request.app.state.settings.secret_key)
    if cid is None:
        return False
    async with request.app.state.store.pool.acquire() as conn:
        await conn.execute("UPDATE mail_contacts SET status = 'unsubscribed', unsubscribed_at = now() WHERE id = $1 AND status = 'active'", cid)
    return True


@router.post("/mail/unsubscribe")
async def unsubscribe(request: Request, t: str = ""):
    """One click: mail apps POST here (List-Unsubscribe-Post), and the page /unsubscribe posts here too. Needs no sign-in, only the signed token."""
    token = t
    if not token:
        try:
            token = (await request.json()).get("t", "")
        except ValueError:
            token = ""
    return out({"status": "unsubscribed"}) if await _unsubscribe(request, token) else out({"detail": "This unsubscribe link is not valid."}, 400)


@router.get("/mail/unsubscribe")
async def unsubscribe_page(t: str = ""):
    """A person who opens the link in a browser: send them to the page that asks for the click (a link scanner opening it unsubscribes nobody)."""
    return Response(status_code=303, headers={"Location": f"/unsubscribe?t={quote(t)}", **NO_STORE})
