"""Console > Email made easy (the founder, 28 Nov 2026: "too much confusing to send ... we have to today send the email to all peoples"):
members are an audience, one send reaches everyone chosen, SES's problems are said plainly, and an account-level stop (test mode, the daily limit,
a wrong key) halts the sender instead of failing everyone left. SES itself is replaced by a fake."""
import json

import pytest

from finlit import mailer
from test_auth import app, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401
from test_mailer_387 import _admin  # noqa: E402


def test_ses_reasons_in_plain_words_and_which_ones_stop_the_send():
    words, stop = mailer.plain_error("SES 400: Email address is not verified. The following identities failed the check in region AP-SOUTHEAST-2: a@b.in")
    assert stop and "test mode" in words and "Request production access" in words and "Try the failed ones again" in words
    words, stop = mailer.plain_error("SES 400: Daily message quota exceeded.")
    assert stop and "limit is used up" in words
    words, stop = mailer.plain_error("SES 403: The security token included in the request is invalid.")
    assert stop and "key" in words
    words, stop = mailer.plain_error("SES 429: Maximum sending rate exceeded.")
    assert not stop and "slow down" in words
    words, stop = mailer.plain_error("SES 400: Illegal address")
    assert not stop and "cannot receive mail" in words
    assert mailer.plain_error("SES 500: something new") == ("Amazon SES said: SES 500: something new", False)


async def test_the_account_read_gives_test_mode_and_the_daily_limit(monkeypatch):
    calls = []

    class Fake:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers):
            calls.append((url, headers))
            body = {"ProductionAccessEnabled": False, "SendingEnabled": True, "SendQuota": {"Max24HourSend": 200.0, "SentLast24Hours": 3.0, "MaxSendRate": 1.0}}
            return type("R", (), {"status_code": 200, "json": lambda self: body})()
    for k, v in (("SES_REGION", "ap-southeast-2"), ("SES_ACCESS_KEY_ID", "AKIDTEST"), ("SES_SECRET_ACCESS_KEY", "x")):
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(mailer.httpx, "AsyncClient", Fake)
    mailer._account_cache.update(at=0.0, v=None)
    a = await mailer.ses_account()
    assert a == {"read": True, "production": False, "sendingEnabled": True, "max24h": 200.0, "sent24h": 3.0, "maxPerSecond": 1.0}
    assert calls[0][0] == "https://email.ap-southeast-2.amazonaws.com/v2/email/account" and "AWS4-HMAC-SHA256" in calls[0][1]["Authorization"]
    await mailer.ses_account()
    assert len(calls) == 1                                                       # kept a minute

    class Denied(Fake):
        async def get(self, url, headers):
            return type("R", (), {"status_code": 403, "json": lambda self: {}})()
    monkeypatch.setattr(mailer.httpx, "AsyncClient", Denied)
    mailer._account_cache.update(at=0.0, v=None)
    assert await mailer.ses_account() == {"read": False, "why": "SES 403"}        # a key that may only send: the page carries on
    mailer._account_cache.update(at=0.0, v=None)


@pytest.mark.integration
async def test_send_to_all_members_and_a_list_in_one_click_and_stop_on_test_mode(app, monkeypatch):  # noqa: F811
    sent, mode = [], {"sandbox": False}

    async def fake_send(http, to, raw):
        if mode["sandbox"] and to != "boss@example.com":
            raise mailer.SesError(f"SES 400: Email address is not verified. The following identities failed the check in region AP-SOUTHEAST-2: {to}")
        sent.append(to)
        return f"mid-{len(sent)}"

    async def no_bad_domains(http, domains):
        return []

    async def no_account():
        return {"read": False}
    monkeypatch.setattr(mailer, "ses_send_raw", fake_send)
    monkeypatch.setattr(mailer, "domains_without_mail", no_bad_domains)
    monkeypatch.setattr(mailer, "ses_account", no_account)
    monkeypatch.setattr(mailer, "start_sender", lambda app: None)
    monkeypatch.setattr(mailer, "RATE_PER_SECOND", 50)
    for k, v in (("SES_REGION", "ap-southeast-2"), ("SES_ACCESS_KEY_ID", "AKIDTEST"), ("SES_SECRET_ACCESS_KEY", "x")):
        monkeypatch.setenv(k, v)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("TRUNCATE mail_sends, mail_campaigns, mail_contacts RESTART IDENTITY CASCADE")
    await app.state.store.redis.delete(mailer.HALT_KEY)

    for e in ("m1@a.in", "m2@a.in", "shared@a.in"):
        await signed_in(app, e)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("UPDATE users SET status = 'disabled' WHERE email = 'm2@a.in'")          # a disabled account is never mailed
    admin = await _admin(app)                                                                       # boss@example.com is a member too

    csv = "email,name\nshared@a.in,Shared\nlist1@b.in,L One\nlist2@b.in,L Two\n"
    import base64
    up = {"filename": "l.csv", "data": base64.b64encode(csv.encode()).decode(), "source": "Hackathon, Oct 2026"}
    assert (await admin.post("/api/admin/mail/import", json=up)).json()["added"] == 3

    s = (await admin.get("/api/admin/mail")).json()                                                  # loading the page puts members on the list
    assert s["members"]["members"] == 3 and s["members"]["mailable"] == 3                           # m1, shared, boss (m2 is disabled)
    assert s["lists"] == [{"source": "Hackathon, Oct 2026", "n": 3, "out": 0}]                      # members are not shown as a list
    assert s["halted"] is None and s["account"] == {"read": False}
    n = lambda body: admin.post("/api/admin/mail/audience", json=body)                              # noqa: E731
    assert (await n({"members": True})).json()["n"] == 3
    assert (await n({"sources": ["Hackathon, Oct 2026"]})).json()["n"] == 3
    assert (await n({"members": True, "sources": ["Hackathon, Oct 2026"]})).json()["n"] == 5        # shared@ counts once
    assert (await n({})).json()["n"] == 0

    draft = {"subject": "FinLit is open", "body": "Hi {name},\n\nYour account is ready.", "why": "You get this because you have a FinLit account."}
    pv = (await admin.post("/api/admin/mail/preview", json={**draft, "body": "Hi {name}, the best stocks to buy"})).json()
    assert "Hi Asha," in pv["html"] and "Priya" not in pv["html"] and pv["adviceWords"] == ["best stocks", "buy"]   # the admin's own name
    cid = (await admin.post("/api/admin/mail/campaigns", json=draft)).json()["id"]
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid}/send", json={})).status_code == 422  # nobody chosen
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid}/send", json={"members": True, "sources": ["Hackathon, Oct 2026"]})).json()["queued"] == 5
    await mailer.drain(app)
    assert sorted(sent) == ["boss@example.com", "list1@b.in", "list2@b.in", "m1@a.in", "shared@a.in"]
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid}/send", json={"members": True})).json()["queued"] == 0   # never twice

    # Test mode: a test to the admin's own (verified) address arrives, the send to everyone stops at the first refusal with the plain reason,
    # and the people not reached stay queued instead of failing. Out of test mode: retry and carry on reaches them.
    sent.clear()
    mode["sandbox"] = True
    cid2 = (await admin.post("/api/admin/mail/campaigns", json={**draft, "subject": "Second mail"})).json()["id"]
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid2}/test", json={"to": "boss@example.com"})).json()["status"] == "sent"
    bad = await admin.post(f"/api/admin/mail/campaigns/{cid2}/test", json={"to": "m1@a.in"})
    assert bad.status_code == 502 and "test mode" in bad.json()["detail"]
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid2}/send", json={"members": True})).json()["queued"] == 3
    res = await mailer.drain(app)
    assert res.get("halted") == 1
    s = (await admin.get("/api/admin/mail")).json()
    assert "test mode" in s["halted"]["reason"] and s["sendingNow"] is False
    camp = next(c for c in s["campaigns"] if c["id"] == cid2)
    assert camp["failed"] == 0 and camp["queued"] + camp["sent"] == 3                               # nobody marked failed by the stop
    mode["sandbox"] = False
    assert (await admin.post("/api/admin/mail/resume")).json()["status"] == "sending"
    assert await app.state.store.redis.get(mailer.HALT_KEY) is None
    await mailer.drain(app)
    s = (await admin.get("/api/admin/mail")).json()
    assert next(c for c in s["campaigns"] if c["id"] == cid2)["sent"] == 3

    # A failed row (one bad address) can be tried again; sent and unsubscribed people never are.
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("UPDATE mail_sends SET status = 'failed', error = 'SES 400: Illegal address' WHERE campaign_id = $1 AND id = "
                           "(SELECT min(id) FROM mail_sends WHERE campaign_id = $1)", cid2)
    s = (await admin.get("/api/admin/mail")).json()
    assert any(e["plain"].startswith("This address cannot receive mail") for e in s["errors"])
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid2}/retry")).json()["queued"] == 1
    sent.clear()
    await mailer.drain(app)
    assert len(sent) == 1
    assert json.loads(json.dumps(s["members"]))["unconfirmed"] >= 0


# ------------------------------------------------------------------------------------------------ founder's live test, 28 Nov 2026
UNSUB = "https://finlitventures.com/api/mail/unsubscribe?t=1.abc"


def test_no_invented_name_ever():
    # A body without {name} is sent exactly as written; {name} with no known name is "there"; with a name, its first word.
    assert mailer.personal("Hi there,\n\nWelcome.", "Priya Sharma") == "Hi there,\n\nWelcome."
    assert mailer.personal("Hi {name},", None) == "Hi there,"
    assert mailer.personal("Hi {name},", "pranshu mishra") == "Hi Pranshu,"
    m = mailer.build_message("S", "Hi there,\n\nWelcome to FinLit.", "Why.", "a@x.in", "Priya Sharma", UNSUB, fmt="plain")
    assert "Priya" not in m.as_string()


def test_plain_format_is_text_only_with_the_unsubscribe_headers_and_a_from_name():
    m = mailer.build_message("FinLit is open", "Hi {name},\n\nYour account: https://finlitventures.com/account", "You get this because you have a FinLit account.",
                             "a@x.in", "Asha Rao", UNSUB, "Open FinLit", "https://finlitventures.com", fmt="plain", from_name="Pranshu from FinLit Ventures")
    assert [p.get_content_type() for p in m.walk()] == ["text/plain"]                     # no HTML part, no styled button, nothing to track
    text = m.get_content()
    assert text.startswith("Hi Asha,\n\nYour account: https://finlitventures.com/account")
    assert "Open FinLit: https://finlitventures.com" in text                               # the button as a plain line
    for line in ("You get this because you have a FinLit account.", f"Unsubscribe: {UNSUB}", "not investment advice", "contact@finlitventures.com"):
        assert line in text
    assert m["From"] == "Pranshu from FinLit Ventures <contact@finlitventures.com>" and m["Reply-To"] == "contact@finlitventures.com"
    assert m["List-Unsubscribe"].startswith(f"<{UNSUB}>") and m["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    # a From name that could inject a header or another address falls back to the company name
    bad = mailer.build_message("S", "Hi", "Why.", "a@x.in", None, UNSUB, fmt="plain", from_name="x <evil@y.in>")
    assert bad["From"] == "FinLit Ventures <contact@finlitventures.com>"
    # the designed mail is still there as an option, with both parts
    h = mailer.build_message("S", "Hi", "Why.", "a@x.in", None, UNSUB, "Open", "https://finlitventures.com", fmt="html")
    assert [p.get_content_type() for p in h.walk()] == ["multipart/alternative", "text/plain", "text/html"]


def test_the_console_preview_keeps_addresses_away_from_cloudflare_and_real_mails_are_unchanged():
    for fmt in ("plain", "html"):
        m = mailer.build_message("S", "Write to us at help@finlitventures.com", "Why.", "a@x.in", None, UNSUB, fmt=fmt)
        pv = mailer.preview_html(m)
        assert "<!--email_off-->contact@finlitventures.com<!--/email_off-->" in pv
        assert "<!--email_off-->help@finlitventures.com<!--/email_off-->" in pv
        assert "email_off" not in m.as_string()                                             # what is sent is untouched


@pytest.mark.integration
async def test_mail_2_keeps_working_switches_to_plain_and_the_test_uses_the_admins_name(app, monkeypatch):  # noqa: F811
    sent = []

    async def fake_send(http, to, raw):
        sent.append((to, raw))
        return "mid"
    monkeypatch.setattr(mailer, "ses_send_raw", fake_send)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("TRUNCATE mail_sends, mail_campaigns, mail_contacts RESTART IDENTITY CASCADE")
        # a mail saved before migration 150 (as Mail 2 on the live site): the column default for it was 'html'
        old = await conn.fetchval("INSERT INTO mail_campaigns (subject, body, why, button_text, button_url, format) VALUES "
                                  "('Mail 2', 'Hi {name},\n\nWelcome to FinLit.', 'You get this because you have a FinLit account.', 'Open FinLit', "
                                  "'https://finlitventures.com', 'html') RETURNING id")
        assert await conn.fetchval("SELECT column_default FROM information_schema.columns WHERE table_name = 'mail_campaigns' AND column_name = 'format'") == "'plain'::text"
    admin = await _admin(app)
    s = (await admin.get("/api/admin/mail")).json()
    k = next(c for c in s["campaigns"] if c["id"] == old)
    assert (k["format"], k["from_name"]) == ("html", None)
    assert (await admin.post(f"/api/admin/mail/campaigns/{old}/test", json={"to": "boss@example.com"})).json()["status"] == "sent"
    raw = sent[-1][1].decode()
    assert "Hi Asha," in raw and "Priya" not in raw and "text/html" in raw                          # still the designed mail, with the admin's name
    # the founder opens Mail 2, picks Plain email and a From name, and saves: it is now plain
    body = {"subject": "Mail 2", "body": "Hi there,\n\nWelcome to FinLit.", "why": "You get this because you have a FinLit account.",
            "buttonText": "Open FinLit", "buttonUrl": "https://finlitventures.com", "format": "plain", "fromName": "Pranshu from FinLit Ventures"}
    assert (await admin.post("/api/admin/mail/campaigns", params={"id": old}, json=body)).json()["id"] == old
    assert (await admin.post("/api/admin/mail/campaigns", params={"id": old}, json={**body, "fromName": "a@b <c>"})).status_code == 422
    assert (await admin.post(f"/api/admin/mail/campaigns/{old}/test", json={"to": "boss@example.com"})).json()["status"] == "sent"
    raw = sent[-1][1].decode()
    assert "text/html" not in raw and "Hi there," in raw and "Open FinLit: https://finlitventures.com" in raw
    assert "From: Pranshu from FinLit Ventures <contact@finlitventures.com>" in raw and "List-Unsubscribe-Post: List-Unsubscribe=One-Click" in raw
    pv = (await admin.get(f"/api/admin/mail/campaigns/{old}/preview")).text
    assert "<!--email_off-->contact@finlitventures.com<!--/email_off-->" in pv
    # a new mail without a format is plain
    new = (await admin.post("/api/admin/mail/campaigns", json={k2: v for k2, v in body.items() if k2 not in ("format", "fromName")})).json()["id"]
    assert next(c for c in (await admin.get("/api/admin/mail")).json()["campaigns"] if c["id"] == new)["format"] == "plain"
