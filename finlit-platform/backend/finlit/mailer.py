"""Mail from contact@finlitventures.com through Amazon SES (task #387, owner's choice 24 Nov 2026).

The team writes one mail on one screen ("Send an email", 28 Nov 2026): picks who gets it (every FinLit member and/or the lists it uploaded), sees it as
people will, sends itself a test, then sends to everyone chosen with one click. Members are copied onto the mail list (source "FinLit members") so
the same rules hold for them. Problems from Amazon SES are said in plain words with what to do (plain_error), and an account-level stop (test mode,
daily limit, wrong keys, paused account) halts the sender instead of failing every remaining person.
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
from email import message_from_bytes, policy as email_policy
from email.utils import formataddr, formatdate, make_msgid, parseaddr
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


def raw_sender(raw: bytes) -> str:
    """The address a raw mail is sent from: its own From when that is on the finlitventures.com domain (a personal address such as
    pranshu@finlitventures.com, which SES's domain identity allows), otherwise contact@."""
    try:
        addr = parseaddr(str(message_from_bytes(raw, policy=email_policy.default).get("From", "")))[1].lower()
    except Exception:
        return FROM_ADDRESS
    return addr if valid_from_address(addr) else FROM_ADDRESS


def raw_from_header(raw: bytes) -> str:
    """What SES is told the mail is from: the raw mail's own From WITH its display name ("Pranshu Mishra <pranshu@finlitventures.com>").
    SES puts FromEmailAddress in the From the person sees, so a bare address here dropped the name (founder's test, 28 Nov 2026: Gmail showed
    "pranshu" instead of "Pranshu Mishra"). The address is always the checked one from raw_sender."""
    addr = raw_sender(raw)
    try:
        name = parseaddr(str(message_from_bytes(raw, policy=email_policy.default).get("From", "")))[0].strip()
    except Exception:
        name = ""
    return formataddr((name or FROM_NAME, addr))


async def ses_send_raw(http: httpx.AsyncClient, to: str, raw: bytes) -> str:
    """Send one raw message through SES v2; returns SES's MessageId. Raises SesError with SES's own reason."""
    cfg = ses_config()
    if not cfg:
        raise SesError("SES is not set up on the server (SES_REGION, SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY)")
    region, key_id, secret = cfg
    host, path = f"email.{region}.amazonaws.com", "/v2/email/outbound-emails"
    body = json.dumps({"FromEmailAddress": raw_from_header(raw), "Destination": {"ToAddresses": [to]},   # the shown name is the raw mail's own From
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


MEMBERS = "FinLit members"     # the source name members get on the mail list
HALT_KEY = "mail:halt"         # why the sender stopped (an account-level problem), until the next send or "Carry on"

# SES's own reasons, said plainly with the fix. Order matters: the first match wins.
PLAIN: List[Tuple["re.Pattern[str]", str, bool]] = [   # (pattern, plain words, stops the whole send)
    (re.compile(r"not set up", re.I),
     "Sending is not set up on the server: the Amazon SES keys (SES_REGION, SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY) are missing from .env.aws.", True),
    (re.compile(r"not verified|sandbox", re.I),
     "Amazon SES is still in test mode (the sandbox): it only delivers to addresses verified in SES. That is why a test to your own verified "
     "address can arrive while the send to everyone fails. Fix: in the AWS console open SES, Account dashboard, then Request production access; "
     "once Amazon approves it, press Try the failed ones again.", True),
    (re.compile(r"daily message quota|sending quota|quota exceeded|max ?24 ?hour", re.I),
     "Today's Amazon SES sending limit is used up. The rest can go when the limit resets (24 hours after the first mails): press Carry on then, "
     "or ask AWS for a higher limit (SES, Account dashboard).", True),
    (re.compile(r"security token|InvalidClientTokenId|SignatureDoesNotMatch|UnrecognizedClient|not authorized|AccessDenied|SES 403", re.I),
     "Amazon SES refused the server's key: the key in .env.aws is wrong, expired or not allowed to send from finlitventures.com.", True),
    (re.compile(r"paused|suspended", re.I),
     "Amazon has paused sending for this account (often after too many bounces or spam reports). Open SES, Account dashboard, to see why.", True),
    (re.compile(r"Maximum sending rate|Throttl|TooManyRequests|SES 429", re.I),
     "Amazon SES asked to slow down; the sender waits and tries again by itself.", False),
    (re.compile(r"Illegal address|Missing final|domain|mailbox", re.I),
     "This address cannot receive mail (it is malformed or its domain has no mail server).", False),
    (re.compile(r"timed out|Timeout|ConnectError|connection", re.I),
     "Amazon SES did not answer in time; this person can be tried again.", False),
]


def plain_error(err: Optional[str]) -> Tuple[str, bool]:
    """SES's reason in plain words, and whether it stops the whole send (an account problem, not one address)."""
    for pat, words, stop in PLAIN:
        if err and pat.search(err):
            return words, stop
    return (f"Amazon SES said: {err}" if err else "Unknown problem"), False


_account_cache: Dict[str, Any] = {"at": 0.0, "v": None}


async def ses_account() -> Dict[str, Any]:
    """The SES account's state (GET /v2/email/account): test mode or not, the daily limit and what was sent in the last 24 hours. Kept a
    minute. If the key may not read the account, the page says so quietly and carries on without it."""
    cfg = ses_config()
    if not cfg:
        return {"read": False}
    if _account_cache["v"] is not None and time.monotonic() - _account_cache["at"] < 60:
        return _account_cache["v"]
    region, key_id, secret = cfg
    host, path = f"email.{region}.amazonaws.com", "/v2/email/account"
    headers = sigv4_headers("GET", host, path, "", b"", region, "ses", key_id, secret)
    v: Dict[str, Any]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=5.0)) as h:
            r = await h.get(f"https://{host}{path}", headers=headers)
        if r.status_code != 200:
            v = {"read": False, "why": f"SES {r.status_code}"}
        else:
            j = r.json()
            q = j.get("SendQuota") or {}
            v = {"read": True, "production": bool(j.get("ProductionAccessEnabled")), "sendingEnabled": j.get("SendingEnabled", True) is not False,
                 "max24h": q.get("Max24HourSend"), "sent24h": q.get("SentLast24Hours"), "maxPerSecond": q.get("MaxSendRate")}
    except (httpx.HTTPError, ValueError) as e:
        v = {"read": False, "why": str(e)[:120]}
    _account_cache.update(at=time.monotonic(), v=v)
    return v


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


FORMATS = ("personal", "plain", "html")
# "Personal note" (founder, 28 Nov 2026: a plain-text test still landed in Gmail's Promotions): a mail from a person, for small sends only.
PERSONAL_MAX = 500
PERSONAL_FOOT = "Rather not hear from us? Reply 'stop' and we won't write again.\n\nInformation only, not investment advice."
DOMAIN = FROM_ADDRESS.split("@", 1)[1]
LOCAL_OK = re.compile(r"^[a-z0-9._-]{1,40}$")


def valid_from_address(addr: Optional[str]) -> bool:
    """An address on our own domain only (SES's domain identity sends from any of them), with a simple local part."""
    a = (addr or "").strip().lower()
    local, _, dom = a.partition("@")
    return dom == DOMAIN and bool(LOCAL_OK.match(local)) and not local.startswith(".") and ".." not in local


def from_address_of(value: Optional[str]) -> Optional[str]:
    """The form's From address (a local part such as "pranshu", or the whole address) as the full address; None for contact@ or empty.
    Raises ValueError when it is not an address on our domain."""
    v = (value or "").strip().lower()
    if not v:
        return None
    full = v if "@" in v else f"{v}@{DOMAIN}"
    if not valid_from_address(full):
        raise ValueError(f"The From address must be on {DOMAIN}, like pranshu@{DOMAIN} (letters, digits, dots, dashes).")
    return None if full == FROM_ADDRESS else full
# A "From name" is shown in the inbox before the subject; the address is always contact@. Printable words only: no address, no line break.
FROM_NAME_OK = re.compile(r"^[^\r\n<>@\"\x00-\x1f]{2,80}$")


def from_header(from_name: Optional[str], from_address: Optional[str] = None) -> str:
    n = (from_name or "").strip()
    addr = from_address if valid_from_address(from_address) else FROM_ADDRESS
    return formataddr((n if n and FROM_NAME_OK.match(n) else FROM_NAME, addr))


def personal(body: str, name: Optional[str]) -> str:
    """The body for one person. Only an explicit {name} is replaced (by the first name, or "there" when none is known); a body without it is
    sent exactly as written, so nobody ever sees an invented name."""
    return body.replace("{name}", first_name(name)).strip() if "{name}" in body else body.strip()


def build_message(subject: str, body: str, why: str, to: str, name: Optional[str], unsub_url: str,
                  button_text: Optional[str] = None, button_url: Optional[str] = None, fmt: str = "html",
                  from_name: Optional[str] = None, from_address: Optional[str] = None) -> EmailMessage:
    """One mail. Three formats:
    - "personal" (the default for new mails since 28 Nov 2026, for at most PERSONAL_MAX people): a mail from a person: text only, no
      List-Unsubscribe headers, Reply-To the sender's own address, a two-line footer ("reply 'stop'"); a 'stop' reply is recorded in the Console.
    The other two carry the one-click unsubscribe headers:
    - "plain" (the default for new mails since 28 Nov 2026): text only, like a mail one person writes to another, which Gmail most often keeps in
      Primary; links are written out, the button is a line "words: link", no HTML part and nothing to track;
    - "html": the designed mail with the button, plus the same text as a plain copy."""
    text = personal(body, name)
    if button_text and button_url:
        text += f"\n\n{button_text.strip()}: {button_url.strip()}"
    sender = from_address if valid_from_address(from_address) else FROM_ADDRESS
    m = EmailMessage()
    m["From"] = from_header(from_name, sender)
    m["To"] = to
    m["Subject"] = subject.strip()
    m["Date"] = formatdate(localtime=False)
    m["Reply-To"] = sender
    m["Message-ID"] = make_msgid(domain="finlitventures.com")
    if fmt == "personal":
        m.set_content(f"{text}\n\n{PERSONAL_FOOT}\n")
        return m
    foot = f"{why.strip()}\nUnsubscribe: {unsub_url}\n{DISCLAIMER}\nFinLit Ventures · {FROM_ADDRESS} · https://finlitventures.com"
    m["List-Unsubscribe"] = f"<{unsub_url}>, <mailto:{FROM_ADDRESS}?subject={quote('unsubscribe')}>"
    m["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    m.set_content(f"{text}\n\n--\n{foot}\n")
    if fmt == "plain":
        return m
    body_text = personal(body, name)
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


CAMPAIGN_COLS = "subject, body, why, button_text, button_url, format, from_name, from_address"


def message_for(k: Any, to: str, name: Optional[str], unsub: str, subject_prefix: str = "") -> EmailMessage:
    """One stored mail (a mail_campaigns row with CAMPAIGN_COLS) for one person."""
    return build_message(subject_prefix + k["subject"], k["body"], k["why"], to, name, unsub, k["button_text"], k["button_url"],
                         k["format"] or "html", k["from_name"], k["from_address"])


def preview_html(m: EmailMessage) -> str:
    """The mail as a page for the Console: the HTML part, or for a plain mail its text as a mail app shows it. Only for the Console, never sent:
    every address is wrapped in <!--email_off-->, because Cloudflare's Email Obfuscation rewrites addresses in HTML served through the site
    (it showed "[email protected]" in the footer on 28 Nov 2026)."""
    html = next((p.get_content() for p in m.walk() if p.get_content_type() == "text/html"), None)
    if html is None:
        text = next(p.get_content() for p in m.walk() if p.get_content_type() == "text/plain")
        linked = LINK.sub(lambda x: '<a href="' + x.group(1) + '" style="color:#1a0dab">' + x.group(1) + "</a>", escape(text))
        html = ('<!doctype html><html><body style="margin:0;padding:20px;background:#ffffff;color:#1d1d1b">'
                '<div style="max-width:620px;white-space:pre-wrap;word-wrap:break-word;font:15px/1.55 Arial,Helvetica,sans-serif">'
                f"{linked}</div></body></html>")
    return re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}", lambda x: f"<!--email_off-->{x.group(0)}<!--/email_off-->", html)


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
                        k = await conn.fetchrow(f"SELECT {CAMPAIGN_COLS} FROM mail_campaigns WHERE id = $1", r["campaign_id"])  # nosec B608 - a constant
                    if not c or not k or c["status"] != "active":
                        status, mid, err = "skipped", None, (f"address is {c['status']}" if c else "contact removed")
                    else:
                        try:
                            msg = message_for(k, c["email"], c["name"], unsub_url(app.state.settings, r["contact_id"]))
                            mid, status, err = await ses_send_raw(http, c["email"], msg.as_bytes()), "sent", None
                        except (SesError, httpx.HTTPError) as e:
                            status, mid, err = "failed", None, str(e)[:300]
                            words, stop = plain_error(err)
                            if stop or "slow down" in words:
                                # An account problem (test mode, daily limit, wrong key, paused): this person and everyone after them stay queued, the
                                # sender stops and the page says why, instead of failing every remaining person. Slowing down: wait, then carry on.
                                async with store.pool.acquire() as conn:
                                    await conn.execute("UPDATE mail_sends SET status = 'queued' WHERE status = 'sending'")
                                if stop:
                                    await store.redis.set(HALT_KEY, json.dumps({"reason": words, "error": err, "at": datetime.now(timezone.utc).isoformat()}))
                                    done["halted"] = 1
                                    return done
                                await asyncio.sleep(2)
                                break
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


# ------------------------------------------------------------------------------------------------ who gets a mail
async def sync_members(conn) -> int:
    """Every active FinLit member onto the mail list (source "FinLit members"), so a mail to members keeps the list's rules: one-click
    unsubscribe, never twice, never after unsubscribing. An address already on the list (from an upload) keeps its row. Returns how many were added."""
    return await conn.fetchval(
        "WITH ins AS (INSERT INTO mail_contacts (email, name, source) SELECT DISTINCT ON (lower(u.email)) lower(u.email), u.name, $1 FROM users u "
        "WHERE u.status = 'active' AND u.email LIKE '%_@_%.__%' ORDER BY lower(u.email), u.created_at ON CONFLICT (email) DO NOTHING RETURNING 1) "
        "SELECT count(*) FROM ins", MEMBERS)


# The people one send reaches: active list rows that are members (when chosen), come from a chosen list, or are among the addresses pasted into
# "These addresses" (owner, 28 Nov 2026: "I can send the mail for like 5 to 6 persons"). m: members?, s: the lists, e: the pasted addresses.
def audience_sql(m: str = "$1", s: str = "$2", e: str = "$3") -> str:
    return (f"c.status = 'active' AND (({m}::bool AND c.email IN (SELECT lower(u.email) FROM users u WHERE u.status = 'active')) "
            f"OR c.source = ANY({s}::text[]) OR c.email = ANY({e}::text[]))")


AUDIENCE = audience_sql()


def hand_source(now: Optional[datetime] = None) -> str:
    """The list name pasted addresses are kept under, e.g. "Added by hand, 28 Nov 2026"."""
    d = now or datetime.now(timezone.utc)
    return f"Added by hand, {d.day} {d.strftime('%b %Y')}"


def pasted_split(emails: Iterable[str]) -> Dict[str, Any]:
    """The pasted addresses through the import's own checks (valid, not a misspelt domain, once each); no guess at a correction."""
    return clean({"email": e} for e in emails)


async def add_pasted(conn, emails: List[str]) -> Dict[str, Any]:
    """Put pasted addresses on the list (under today's "Added by hand" name; an address already there keeps its row and its status, so an
    unsubscribed person stays unsubscribed). Returns the addresses to mail and every one left out, with its reason."""
    c = pasted_split(emails)
    async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=5.0)) as http:
        nomx = set(await domains_without_mail(http, (e.split("@", 1)[1] for e in c["good"])))
    no_server = [e for e in c["good"] if e.split("@", 1)[1] in nomx]
    good = [e for e in c["good"] if e.split("@", 1)[1] not in nomx]
    if good:
        await conn.execute("INSERT INTO mail_contacts (email, name, source) SELECT e, NULL, $2 FROM unnest($1::text[]) AS e "
                           "ON CONFLICT (email) DO NOTHING", good, hand_source())
    gone = await conn.fetch("SELECT email FROM mail_contacts WHERE email = ANY($1::text[]) AND status <> 'active' ORDER BY email", good)
    return {"emails": good, "invalid": c["invalid"], "typos": c["typos"], "noMailServer": no_server, "unsubscribed": [r["email"] for r in gone]}


async def audience_count(conn, members: bool, sources: List[str], campaign: Optional[int] = None, emails: Optional[List[str]] = None) -> int:
    """How many people a send to this audience reaches (leaving out those who already had `campaign`). Pasted addresses not on the list yet
    count too (they are added when the mail is sent); each person counts once."""
    pasted = list(pasted_split(emails or [])["good"])
    q = f"SELECT count(*) FROM mail_contacts c WHERE {AUDIENCE}"  # nosec B608 - a constant; the values are parameters
    args: List[Any] = [members, sources, pasted]
    if campaign:
        q += " AND NOT EXISTS (SELECT 1 FROM mail_sends s WHERE s.campaign_id = $4 AND s.contact_id = c.id)"
        args.append(campaign)
    n = await conn.fetchval(q, *args)
    if pasted:
        n += await conn.fetchval("SELECT count(*) FROM unnest($1::text[]) AS e WHERE NOT EXISTS (SELECT 1 FROM mail_contacts c WHERE c.email = e)", pasted)
    return n


async def halted(redis) -> Optional[Dict[str, Any]]:
    raw = await redis.get(HALT_KEY)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return {"reason": str(raw)}


# ------------------------------------------------------------------------------------------------ routes
@router.get("/admin/mail")
async def summary(request: Request, _ctx=Depends(admin_ctx)):
    async with request.app.state.store.pool.acquire() as conn:
        await sync_members(conn)
        mem = await conn.fetchrow(
            "SELECT (SELECT count(*) FROM users WHERE status = 'active') AS members, "
            "(SELECT count(*) FROM users WHERE status = 'active' AND email_verified_at IS NULL) AS unconfirmed, "
            "(SELECT count(*) FROM mail_contacts c WHERE c.status = 'active' AND c.email IN (SELECT lower(email) FROM users WHERE status = 'active')) AS mailable, "
            "(SELECT count(*) FROM mail_contacts c WHERE c.status <> 'active' AND c.email IN (SELECT lower(email) FROM users WHERE status = 'active')) AS optedout")
        lists = await conn.fetch("SELECT source, count(*) FILTER (WHERE status = 'active') AS n, count(*) FILTER (WHERE status <> 'active') AS out "
                                 "FROM mail_contacts WHERE source <> $1 GROUP BY source ORDER BY min(created_at) DESC", MEMBERS)
        contacts = await conn.fetch("SELECT source, status, count(*) AS n FROM mail_contacts GROUP BY source, status ORDER BY source, status")
        camps = await conn.fetch(
            "SELECT k.id, k.subject, k.body, k.why, k.button_text, k.button_url, k.format, k.from_name, k.from_address, k.created_at, k.updated_at, "
            "(SELECT count(*) FROM mail_contacts c WHERE c.status = 'active' AND NOT EXISTS (SELECT 1 FROM mail_sends x WHERE x.campaign_id = k.id "
            "AND x.contact_id = c.id)) AS remaining, "
            "count(s.id) FILTER (WHERE s.status = 'queued' OR s.status = 'sending') AS queued, count(s.id) FILTER (WHERE s.status = 'sent') AS sent, "
            "count(s.id) FILTER (WHERE s.status = 'failed') AS failed, count(s.id) FILTER (WHERE s.status = 'skipped') AS skipped "
            "FROM mail_campaigns k LEFT JOIN mail_sends s ON s.campaign_id = k.id GROUP BY k.id ORDER BY k.id DESC LIMIT 20")
        errors = await conn.fetch("SELECT campaign_id, error, count(*) AS n, max(sent_at) AS last FROM mail_sends WHERE status = 'failed' "
                                  "GROUP BY campaign_id, error ORDER BY n DESC LIMIT 10")
        sending = await conn.fetchval("SELECT count(*) FROM mail_sends WHERE status = 'sending'")
        stuck = await conn.fetchval("SELECT count(*) FROM mail_sends WHERE status IN ('queued', 'sending')")
    redis = request.app.state.store.redis
    halt = await halted(redis)
    if stuck and not halt and not await redis.exists(SENDER_KEY):
        async with request.app.state.store.pool.acquire() as conn:
            await conn.execute("UPDATE mail_sends SET status = 'queued' WHERE status = 'sending'")
        start_sender(request.app)        # a restart left mail queued: carry on
    plain_errors = []
    for r in errors:
        words, stop = plain_error(r["error"])
        plain_errors.append({**dict(r), "plain": words, "account": stop})
    return out({"ready": ses_config() is not None, "from": formataddr((FROM_NAME, FROM_ADDRESS)), "ratePerSecond": RATE_PER_SECOND,
                "sendingNow": bool((sending or stuck) and not halt), "halted": halt, "account": await ses_account(),
                "members": dict(mem), "lists": [dict(r) for r in lists],
                "contacts": [dict(r) for r in contacts], "campaigns": [dict(r) for r in camps], "errors": plain_errors})


class AudienceIn(BaseModel):
    members: bool = False
    sources: List[str] = Field(default_factory=list, max_length=50)
    emails: List[str] = Field(default_factory=list, max_length=MAX_BATCH)    # "These addresses", pasted


@router.post("/admin/mail/audience")
async def audience(request: Request, body: AudienceIn, campaign: Optional[int] = None, _ctx=Depends(admin_ctx)):
    """How many people a send to this choice reaches now (members and lists overlap: each person counts once)."""
    async with request.app.state.store.pool.acquire() as conn:
        if body.members:
            await sync_members(conn)
        n = await audience_count(conn, body.members, [s for s in body.sources if s], campaign, body.emails)
    return out({"n": n})


class DraftIn(BaseModel):
    subject: str = Field(default="", max_length=150)
    body: str = Field(default="", max_length=20000)
    why: str = Field(default="", max_length=300)
    buttonText: Optional[str] = Field(default=None, max_length=60)
    buttonUrl: Optional[str] = Field(default=None, max_length=500)
    format: str = Field(default="personal", pattern="^(personal|plain|html)$")
    fromName: Optional[str] = Field(default=None, max_length=80)
    fromAddress: Optional[str] = Field(default=None, max_length=120)


def admin_name(ctx: Any) -> Optional[str]:
    """The name a test or preview fills {name} with: the signed-in admin's own (never an invented sample); none gives "there"."""
    return (getattr(ctx, "name", None) or "").strip() or None


@router.post("/admin/mail/preview")
async def preview_draft(request: Request, body: DraftIn, ctx=Depends(admin_ctx)):
    """The mail as it will look, from the form as it stands (nothing saved); {name} is the admin's own first name. Also names any advice words."""
    bt, bu = (body.buttonText or "").strip() or None, (body.buttonUrl or "").strip() or None
    try:
        fa = from_address_of(body.fromAddress)
    except ValueError:
        fa = None
    m = build_message(body.subject or "(no subject)", body.body or "", body.why or "", "preview@example.com", admin_name(ctx),
                      f"{request.app.state.settings.public_site_url}/api/mail/unsubscribe?t=preview", bt if bu else None, bu if bt else None,
                      body.format, body.fromName, fa)
    return out({"html": preview_html(m), "from": m["From"], "adviceWords": wording_problems(body.subject, body.body, bt or "")})


class ImportIn(BaseModel):
    filename: str = Field(max_length=200)
    data: str = Field(max_length=MAX_FILE_BYTES * 4 // 3 + 16)     # the file, base64
    source: str = Field(max_length=160)


@router.post("/admin/mail/import")
async def import_list(request: Request, body: ImportIn, _ctx=Depends(admin_ctx)):
    source = body.source.strip()
    if len(source) < 3:
        return out({"detail": "Say where these people gave their address (for example the event name and month)."}, 422)
    if source.lower() == MEMBERS.lower():
        return out({"detail": f'"{MEMBERS}" is the name of the site\'s own members; give this list another name.'}, 422)
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
    format: str = Field(default="personal", pattern="^(personal|plain|html)$")      # a personal note unless the form chose another
    fromName: Optional[str] = Field(default=None, max_length=80)
    fromAddress: Optional[str] = Field(default=None, max_length=120)                # e.g. "pranshu" or pranshu@finlitventures.com; empty: contact@


@router.post("/admin/mail/campaigns")
async def save_campaign(request: Request, body: CampaignIn, id: Optional[int] = None, ctx=Depends(admin_ctx)):
    bt, bu = (body.buttonText or "").strip() or None, (body.buttonUrl or "").strip() or None
    fn = (body.fromName or "").strip() or None
    if fn and not FROM_NAME_OK.match(fn):
        return out({"detail": "The From name can have 2 to 80 letters, without an @ sign, quotes or angle brackets."}, 422)
    try:
        fa = from_address_of(body.fromAddress)
    except ValueError as e:
        return out({"detail": str(e)}, 422)
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
            row = await conn.fetchrow("UPDATE mail_campaigns SET subject = $2, body = $3, why = $4, button_text = $5, button_url = $6, format = $7, "
                                      "from_name = $8, from_address = $9, updated_at = now() WHERE id = $1 RETURNING id", id, body.subject, body.body,
                                      body.why, bt, bu, body.format, fn, fa)
        else:
            row = await conn.fetchrow("INSERT INTO mail_campaigns (subject, body, why, button_text, button_url, format, from_name, from_address, "
                                      "created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id", body.subject, body.body, body.why, bt, bu,
                                      body.format, fn, fa, ctx.user_id)
    return out({"id": row["id"]} if row else {"detail": "No such mail"}, 200 if row else 404)


@router.get("/admin/mail/campaigns/{cid}/preview")
async def preview(request: Request, cid: int, ctx=Depends(admin_ctx)):
    async with request.app.state.store.pool.acquire() as conn:
        k = await conn.fetchrow(f"SELECT {CAMPAIGN_COLS} FROM mail_campaigns WHERE id = $1", cid)  # nosec B608 - a constant
    if not k:
        return out({"detail": "No such mail"}, 404)
    m = message_for(k, "preview@example.com", admin_name(ctx), f"{request.app.state.settings.public_site_url}/api/mail/unsubscribe?t=preview")
    return Response(content=preview_html(m), media_type="text/html", headers={**NO_STORE, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'"})


class TestIn(BaseModel):
    to: str = Field(max_length=1300)      # one address, or up to MAX_TESTS separated by commas, semicolons or spaces


MAX_TESTS = 5


@router.post("/admin/mail/campaigns/{cid}/test")
async def send_test(request: Request, cid: int, body: TestIn, ctx=Depends(admin_ctx)):
    """A test, exactly as the people will get it, to one address or up to five (the admin and a few colleagues); each is marked [Test]. {name} is
    the signed-in admin's own first name ("there" when none is set)."""
    tos = list(dict.fromkeys(t.strip().strip("<>").lower() for t in re.split(r"[,;\s]+", body.to or "") if t.strip()))
    if not tos:
        return out({"detail": "Type the address to send the test to."}, 422)
    if len(tos) > MAX_TESTS:
        return out({"detail": f"A test goes to at most {MAX_TESTS} addresses."}, 422)
    bad = [t for t in tos if not EMAIL.match(t)]
    if bad:
        return out({"detail": f"Not an email address: {', '.join(bad)}"}, 422)
    async with request.app.state.store.pool.acquire() as conn:
        k = await conn.fetchrow(f"SELECT {CAMPAIGN_COLS} FROM mail_campaigns WHERE id = $1", cid)  # nosec B608 - a constant
    if not k:
        return out({"detail": "No such mail"}, 404)
    sent: List[str] = []
    failed: List[Dict[str, str]] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as http:
        for to in tos:
            m = message_for(k, to, admin_name(ctx), f"{request.app.state.settings.public_site_url}/api/mail/unsubscribe?t=test", "[Test] ")
            try:
                await ses_send_raw(http, to, m.as_bytes())
                sent.append(to)
            except (SesError, httpx.HTTPError) as e:
                failed.append({"to": to, "detail": plain_error(str(e))[0], "ses": str(e)[:300]})
    if not sent:
        return out({"detail": failed[0]["detail"], "ses": failed[0]["ses"], "failed": failed}, 502)
    return out({"status": "sent", "sent": sent, "failed": failed})


class SendIn(BaseModel):
    # Who: members and/or lists (the "Send an email" screen). `source` alone is the older one-list form, kept so a call written for it still works.
    members: bool = False
    sources: List[str] = Field(default_factory=list, max_length=50)
    source: Optional[str] = Field(default=None, max_length=160)
    # "These addresses": pasted addresses, added to the list (as "Added by hand, <date>") with the import's checks, then sent to like the rest.
    emails: List[str] = Field(default_factory=list, max_length=MAX_BATCH)
    # How many now: everyone chosen when left out; a number only for "send in steps" (a new sender's warm-up), under More options.
    count: Optional[int] = Field(default=None, ge=1, le=100000)


@router.post("/admin/mail/campaigns/{cid}/send")
async def send_batch(request: Request, cid: int, body: SendIn, _ctx=Depends(admin_ctx)):
    """Queue everyone chosen who may be mailed and has not had this mail yet (or the next `count` of them), then start sending. A send clears an
    earlier stop, so it is also how the team carries on once the account problem is fixed."""
    if not ses_config():
        return out({"detail": plain_error("not set up")[0]}, 503)
    sources = [s for s in ([*body.sources, body.source] if body.source else body.sources) if s]
    members = body.members
    left: Dict[str, Any] = {}
    async with request.app.state.store.pool.acquire() as conn:
        fmt = await conn.fetchval("SELECT format FROM mail_campaigns WHERE id = $1", cid)
        if fmt is None:
            return out({"detail": "No such mail"}, 404)
        if fmt == "personal":
            # A personal note has no one-click unsubscribe header, which Gmail requires of bulk senders: small sends only.
            had = await conn.fetchval("SELECT count(*) FROM mail_sends WHERE campaign_id = $1", cid)
            more = await audience_count(conn, members, sources, cid, body.emails)
            if body.count is not None:
                more = min(more, body.count)
            if had + more > PERSONAL_MAX:
                return out({"detail": f"A personal note goes to at most {PERSONAL_MAX} people (this would be {had + more:,}). Choose Plain email for a "
                                      "send this size: it keeps the one-click unsubscribe that Gmail requires of bulk senders."}, 422)
        if members:
            await sync_members(conn)
        emails: List[str] = []
        if body.emails:
            left = await add_pasted(conn, body.emails)
            emails = left.pop("emails")
        if not members and not sources and not body.emails:
            if body.count is None:
                return out({"detail": "Choose who gets this mail: FinLit members, a list, or addresses under These addresses."}, 422)
            where, args = "c.status = 'active'", []     # the older form without a source: everyone on the list
        else:
            where, args = audience_sql("$3", "$4", "$5"), [members, sources, emails]
        queued = await conn.fetchval(
            f"WITH ins AS (INSERT INTO mail_sends (campaign_id, contact_id) SELECT $1, c.id FROM mail_contacts c WHERE {where} "  # nosec B608 - constants
            "AND NOT EXISTS (SELECT 1 FROM mail_sends s WHERE s.campaign_id = $1 AND s.contact_id = c.id) "
            "ORDER BY c.id LIMIT $2 ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*) FROM ins", cid, body.count, *args)
    await request.app.state.store.redis.delete(HALT_KEY)
    start_sender(request.app)
    return out({"queued": queued, "leftOut": left} if body.emails else {"queued": queued})


class StopIn(BaseModel):
    email: str = Field(max_length=254)


@router.post("/admin/mail/unsubscribe")
async def record_stop(request: Request, body: StopIn, _ctx=Depends(admin_ctx)):
    """Someone replied 'stop' to a personal note: they are never mailed again. An address not on the list yet is added as unsubscribed."""
    e = body.email.strip().strip("<>").lower()
    if not EMAIL.match(e):
        return out({"detail": "That is not an email address."}, 422)
    async with request.app.state.store.pool.acquire() as conn:
        await conn.execute("INSERT INTO mail_contacts (email, source, status, unsubscribed_at) VALUES ($1, 'Unsubscribed by reply', 'unsubscribed', now()) "
                           "ON CONFLICT (email) DO UPDATE SET status = 'unsubscribed', unsubscribed_at = coalesce(mail_contacts.unsubscribed_at, now())", e)
        dropped = await conn.fetchval("WITH d AS (UPDATE mail_sends s SET status = 'skipped', error = 'address is unsubscribed' FROM mail_contacts c "
                                      "WHERE s.contact_id = c.id AND c.email = $1 AND s.status = 'queued' RETURNING 1) SELECT count(*) FROM d", e)
    return out({"status": "unsubscribed", "email": e, "droppedFromQueue": dropped})


@router.post("/admin/mail/resume")
async def resume(request: Request, _ctx=Depends(admin_ctx)):
    """Carry on after a stop (test mode left, the daily limit reset, the key fixed): the queued mail goes again."""
    await request.app.state.store.redis.delete(HALT_KEY)
    _account_cache.update(at=0.0, v=None)
    start_sender(request.app)
    return out({"status": "sending"})


@router.post("/admin/mail/campaigns/{cid}/retry")
async def retry_failed(request: Request, cid: int, _ctx=Depends(admin_ctx)):
    """Try the people this mail failed for again (for example after Amazon took the account out of test mode). Only failed rows; a person
    who was sent the mail, or unsubscribed, is never mailed again."""
    async with request.app.state.store.pool.acquire() as conn:
        n = await conn.fetchval("WITH up AS (UPDATE mail_sends SET status = 'queued', error = NULL WHERE campaign_id = $1 AND status = 'failed' "
                                "RETURNING 1) SELECT count(*) FROM up", cid)
    await request.app.state.store.redis.delete(HALT_KEY)
    _account_cache.update(at=0.0, v=None)
    start_sender(request.app)
    return out({"queued": n})


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
