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
        assert await conn.fetchval("SELECT column_default FROM information_schema.columns WHERE table_name = 'mail_campaigns' AND column_name = 'format'") == "'personal'::text"   # migration 151: personal note is the default
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
    # a new mail without a format is a personal note (the default since migration 151)
    new = (await admin.post("/api/admin/mail/campaigns", json={k2: v for k2, v in body.items() if k2 not in ("format", "fromName")})).json()["id"]
    assert next(c for c in (await admin.get("/api/admin/mail")).json()["campaigns"] if c["id"] == new)["format"] == "personal"


# ------------------------------------------------------------------------------------------------ "These addresses" (founder, 28 Nov 2026)
def test_hand_list_name_and_the_paste_checks():
    from datetime import datetime, timezone
    assert mailer.hand_source(datetime(2026, 11, 28, tzinfo=timezone.utc)) == "Added by hand, 28 Nov 2026"
    c = mailer.pasted_split(["A@X.in", "a@x.in", "not-an-address", "b@gmial.com", "c@y.in"])
    assert list(c["good"]) == ["a@x.in", "c@y.in"] and c["invalid"] == ["not-an-address"] and c["typos"] == ["b@gmial.com"] and c["duplicates"] == 1


@pytest.mark.integration
async def test_send_to_pasted_addresses_and_a_test_to_several(app, monkeypatch):  # noqa: F811
    sent = []

    async def fake_send(http, to, raw):
        if to == "refused@x.in":
            raise mailer.SesError("SES 400: Illegal address")
        sent.append(to)
        return "mid"

    async def nomx(http, domains):
        return [d for d in domains if d == "nomail.in"]
    monkeypatch.setattr(mailer, "ses_send_raw", fake_send)
    monkeypatch.setattr(mailer, "domains_without_mail", nomx)
    monkeypatch.setattr(mailer, "start_sender", lambda app: None)
    monkeypatch.setattr(mailer, "RATE_PER_SECOND", 50)
    for k, v in (("SES_REGION", "ap-southeast-2"), ("SES_ACCESS_KEY_ID", "AKIDTEST"), ("SES_SECRET_ACCESS_KEY", "x")):
        monkeypatch.setenv(k, v)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("TRUNCATE mail_sends, mail_campaigns, mail_contacts RESTART IDENTITY CASCADE")
        await conn.execute("INSERT INTO mail_contacts (email, source, status) VALUES ('gone@x.in', 'Old list', 'unsubscribed'), ('there@x.in', 'Old list', 'active')")
    await app.state.store.redis.delete(mailer.HALT_KEY)
    admin = await _admin(app)
    draft = {"subject": "A quick request", "body": "Hi there,\n\nPlease share your feedback.", "why": "You get this because you shared your email address with FinLit Ventures."}
    cid = (await admin.post("/api/admin/mail/campaigns", json=draft)).json()["id"]

    pasted = ["one@x.in", "Two@X.in", "two@x.in", "there@x.in", "gone@x.in", "bad", "typo@gmial.com", "who@nomail.in"]
    # the count before sending: one@, two@ (new, once each), there@ (on a list), who@nomail.in (its domain is checked only at send); gone@ unsubscribed
    assert (await admin.post("/api/admin/mail/audience", json={"emails": pasted})).json()["n"] == 4
    r = (await admin.post(f"/api/admin/mail/campaigns/{cid}/send", json={"emails": pasted})).json()
    assert r["queued"] == 3
    left = r["leftOut"]
    assert left["invalid"] == ["bad"] and left["typos"] == ["typo@gmial.com"] and left["noMailServer"] == ["who@nomail.in"] and left["unsubscribed"] == ["gone@x.in"]
    await mailer.drain(app)
    assert sorted(sent) == ["one@x.in", "there@x.in", "two@x.in"]                                    # never the unsubscribed one
    async with app.state.store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT source FROM mail_contacts WHERE email = 'one@x.in'") == mailer.hand_source()
        assert await conn.fetchval("SELECT source FROM mail_contacts WHERE email = 'there@x.in'") == "Old list"   # an existing row keeps its list
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid}/send", json={"emails": ["one@x.in", "three@x.in"]})).json()["queued"] == 1   # never twice
    assert (await admin.post("/api/admin/mail/audience", json={"emails": ["one@x.in"]}, params={"campaign": cid})).json()["n"] == 0

    # a test to several addresses (at most five), each marked [Test]; one refused address does not stop the others
    sent.clear()
    r = (await admin.post(f"/api/admin/mail/campaigns/{cid}/test", json={"to": "boss@example.com, a@x.in; refused@x.in"})).json()
    assert r["status"] == "sent" and r["sent"] == ["boss@example.com", "a@x.in"] and r["failed"][0]["to"] == "refused@x.in"
    assert sent == ["boss@example.com", "a@x.in"]
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid}/test", json={"to": "a@x.in,b@x.in,c@x.in,d@x.in,e@x.in,f@x.in"})).status_code == 422
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid}/test", json={"to": "a@x.in, nope"})).status_code == 422


# ------------------------------------------------------------------------------------------------ "Personal note" (founder, 28 Nov 2026)
def test_personal_note_reads_like_a_mail_from_a_person():
    m = mailer.build_message("A quick request", "Hi there,\n\nPlease share your feedback: https://forms.gle/x", "Why we write.", "a@x.in", None, UNSUB,
                             fmt="personal", from_name="Pranshu from FinLit Ventures", from_address="pranshu@finlitventures.com")
    assert [p.get_content_type() for p in m.walk()] == ["text/plain"]
    for h in ("List-Unsubscribe", "List-Unsubscribe-Post", "Precedence"):
        assert m[h] is None
    assert m["From"] == "Pranshu from FinLit Ventures <pranshu@finlitventures.com>" and m["Reply-To"] == "pranshu@finlitventures.com"
    assert m["Message-ID"] and m["Date"]
    text = m.get_content()
    assert text == "Hi there,\n\nPlease share your feedback: https://forms.gle/x\n"          # no footer: exactly what was written
    assert "--" not in text and "Unsubscribe:" not in text and "Why we write." not in text and UNSUB not in text
    assert mailer.raw_sender(m.as_bytes()) == "pranshu@finlitventures.com"                           # SES is asked to send from it
    # only an address on our own domain; anything else falls back to contact@
    assert mailer.from_address_of("pranshu") == "pranshu@finlitventures.com" and mailer.from_address_of("contact") is None
    assert mailer.from_address_of("") is None
    for bad in ("me@gmail.com", "a b", "x@finlitventures.com.evil.in", "two..dots"):
        with pytest.raises(ValueError):
            mailer.from_address_of(bad)
    other = mailer.build_message("S", "Hi", "Why.", "a@x.in", None, UNSUB, fmt="personal", from_address="me@gmail.com")
    assert other["From"] == "FinLit Ventures <contact@finlitventures.com>" and mailer.raw_sender(other.as_bytes()) == "contact@finlitventures.com"
    # the other formats still carry the one-click unsubscribe
    assert mailer.build_message("S", "Hi", "Why.", "a@x.in", None, UNSUB, fmt="plain")["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


@pytest.mark.integration
async def test_personal_note_saves_its_address_caps_the_send_and_a_stop_reply_is_recorded(app, monkeypatch):  # noqa: F811
    sent = []

    async def fake_send(http, to, raw):
        sent.append((to, raw))
        return "mid"

    async def nomx(http, domains):
        return []
    monkeypatch.setattr(mailer, "ses_send_raw", fake_send)
    monkeypatch.setattr(mailer, "domains_without_mail", nomx)
    monkeypatch.setattr(mailer, "start_sender", lambda app: None)
    monkeypatch.setattr(mailer, "RATE_PER_SECOND", 50)
    monkeypatch.setattr(mailer, "PERSONAL_MAX", 3)
    for k, v in (("SES_REGION", "ap-southeast-2"), ("SES_ACCESS_KEY_ID", "AKIDTEST"), ("SES_SECRET_ACCESS_KEY", "x")):
        monkeypatch.setenv(k, v)
    async with app.state.store.pool.acquire() as conn:
        await conn.execute("TRUNCATE mail_sends, mail_campaigns, mail_contacts RESTART IDENTITY CASCADE")
    await app.state.store.redis.delete(mailer.HALT_KEY)
    admin = await _admin(app)
    draft = {"subject": "A quick request", "body": "Hi there,\n\nPlease share your feedback.", "why": "You get this because you shared your email address.",
             "fromName": "Pranshu from FinLit Ventures", "fromAddress": "pranshu"}
    assert (await admin.post("/api/admin/mail/campaigns", json={**draft, "fromAddress": "me@gmail.com"})).status_code == 422
    cid = (await admin.post("/api/admin/mail/campaigns", json=draft)).json()["id"]
    k = next(c for c in (await admin.get("/api/admin/mail")).json()["campaigns"] if c["id"] == cid)
    assert (k["format"], k["from_address"]) == ("personal", "pranshu@finlitventures.com")
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid}/test", json={"to": "boss@example.com"})).json()["status"] == "sent"
    raw = sent[-1][1].decode()
    # #1057 (founder, 28 Nov 2026): a Personal note carries no footer, so no "Reply 'stop'" line either; a 'stop' reply is recorded with Unsubscribe (below)
    assert "From: Pranshu from FinLit Ventures <pranshu@finlitventures.com>" in raw and "List-Unsubscribe" not in raw and "Reply 'stop'" not in raw
    pv = (await admin.post("/api/admin/mail/preview", json={**draft, "format": "personal"})).json()
    assert pv["from"] == "Pranshu from FinLit Ventures <pranshu@finlitventures.com>"

    # at most PERSONAL_MAX people a personal note (3 here): a bigger send is refused with the reason, a smaller one goes
    r = await admin.post(f"/api/admin/mail/campaigns/{cid}/send", json={"emails": ["p1@x.in", "p2@x.in", "p3@x.in", "p4@x.in"]})
    assert r.status_code == 422 and "Plain email" in r.json()["detail"] and "at most 3" in r.json()["detail"]
    # a 'stop' reply recorded in the Console: never mailed, even when pasted again
    st = (await admin.post("/api/admin/mail/unsubscribe", json={"email": "P2@x.in"})).json()
    assert st["status"] == "unsubscribed" and st["email"] == "p2@x.in"
    assert (await admin.post("/api/admin/mail/unsubscribe", json={"email": "nope"})).status_code == 422
    r = (await admin.post(f"/api/admin/mail/campaigns/{cid}/send", json={"emails": ["p1@x.in", "p2@x.in", "p3@x.in"]})).json()
    assert r["queued"] == 2 and r["leftOut"]["unsubscribed"] == ["p2@x.in"]
    sent.clear()
    await mailer.drain(app)
    assert sorted(t for t, _ in sent) == ["p1@x.in", "p3@x.in"]
    assert all(b"List-Unsubscribe" not in raw for _, raw in sent)
    async with app.state.store.pool.acquire() as conn:
        assert await conn.fetchval("SELECT status FROM mail_contacts WHERE email = 'p2@x.in'") == "unsubscribed"


def test_ses_is_told_the_display_name_too():
    """28 Nov 2026: Gmail showed "pranshu" because SES was given the bare address; the name must travel with it."""
    from finlit import mailer
    m = mailer.build_message("S", "Hi there,\n\nText here for the test.", "why line here", "a@example.com", None, "https://x/u",
                             fmt="personal", from_name="Pranshu Mishra", from_address="pranshu@finlitventures.com")
    assert mailer.raw_from_header(m.as_bytes()) == "Pranshu Mishra <pranshu@finlitventures.com>"
    plain = mailer.build_message("S", "Hi there,\n\nText here for the test.", "why line here", "a@example.com", None, "https://x/u", fmt="plain")
    assert mailer.raw_from_header(plain.as_bytes()) == "FinLit Ventures <contact@finlitventures.com>"
    odd = mailer.build_message("S", "Hi there,\n\nText here for the test.", "why line here", "a@example.com", None, "https://x/u",
                               fmt="personal", from_name="Pranshu Mishra", from_address="someone@evil.example")
    assert mailer.raw_from_header(odd.as_bytes()).endswith("<contact@finlitventures.com>")
