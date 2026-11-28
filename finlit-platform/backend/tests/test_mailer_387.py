"""Task #387: mail from contact@finlitventures.com through Amazon SES. The signing is AWS's own test vector; SES itself is replaced by a fake
in these tests (the first real mail is the owner's test send on the live site)."""
import base64
import io
from datetime import datetime, timezone

import pytest

from finlit import mailer
from test_auth import app, make_admin, new_client, signed_in  # noqa: F401
from test_integration import ingested, make_settings, store  # noqa: F401


def test_signature_matches_amazons_own_library():
    # The expected value was produced by botocore's SigV4Auth (Amazon's own library) for this exact SES request and time, so this test pins the
    # signing to what Amazon computes without making the AWS SDK a dependency of the site.
    body = b'{"FromEmailAddress":"x"}'
    h = mailer.sigv4_headers("POST", "email.ap-southeast-2.amazonaws.com", "/v2/email/outbound-emails", "", body, "ap-southeast-2", "ses", "AKIDEXAMPLE",
                             "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", now=datetime(2026, 11, 24, 15, 49, 22, tzinfo=timezone.utc),
                             extra={"content-type": "application/json"})
    assert h["X-Amz-Date"] == "20261124T154922Z"
    assert h["Authorization"] == ("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261124/ap-southeast-2/ses/aws4_request, SignedHeaders=content-type;host;x-amz-date, "
                                  "Signature=44de87f5707c682701c2ddf6195a8678633006123b895e7a0dad645489de4d5b")


def test_clean_keeps_good_addresses_and_says_why_the_rest_are_left_out():
    rows = [{"full name": "Priya Sharma", "email address": "Priya@Example.com "}, {"full name": "P2", "email address": "priya@example.com"},
            {"full name": "Bad", "email address": "not-an-email"}, {"full name": "Typo", "email address": "ravi@gmial.com"}, {"full name": "", "email address": ""}]
    c = mailer.clean(rows)
    assert c["good"] == {"priya@example.com": "Priya Sharma"}
    assert c["duplicates"] == 1 and c["invalid"] == ["not-an-email"] and c["typos"] == ["ravi@gmial.com"]


def test_reads_csv_and_excel():
    assert mailer.read_rows("list.csv", "Name,Email\nA B,a@x.in\n".encode()) == [{"name": "A B", "email": "a@x.in"}]
    from openpyxl import Workbook
    wb = Workbook()
    wb.active.append(["Email", "Name"])
    wb.active.append(["b@y.in", "Bee"])
    buf = io.BytesIO()
    wb.save(buf)
    assert mailer.read_rows("list.xlsx", buf.getvalue()) == [{"email": "b@y.in", "name": "Bee"}]
    with pytest.raises(ValueError):
        mailer.read_rows("list.pdf", b"x")


def test_the_mail_has_one_click_unsubscribe_the_reason_and_the_disclaimer():
    m = mailer.build_message("Thanks for joining", "Hi {name},\n\nSee https://finlitventures.com/signup today.", "You registered for XYZ Hackathon, Oct 2026.",
                             "a@x.in", "priya sharma", "https://finlitventures.com/api/mail/unsubscribe?t=1.abc")
    assert m["From"] == "FinLit Ventures <contact@finlitventures.com>"
    assert m["List-Unsubscribe"].startswith("<https://finlitventures.com/api/mail/unsubscribe?t=1.abc>")
    assert m["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    text = next(p for p in m.walk() if p.get_content_type() == "text/plain").get_content()
    html = next(p for p in m.walk() if p.get_content_type() == "text/html").get_content()
    assert text.startswith("Hi Priya,") and "Unsubscribe: https://finlitventures.com/api/mail/unsubscribe?t=1.abc" in text
    for part in (text, html):
        assert "You registered for XYZ Hackathon, Oct 2026." in part and "not investment advice" in part
    assert '<a href="https://finlitventures.com/signup"' in html


def test_advice_words_are_refused_and_tokens_cannot_be_forged():
    assert mailer.wording_problems("Best stocks to buy now", "guaranteed returns") == ["best stocks", "buy", "guaranteed returns"]
    assert mailer.wording_problems("Create your free account", "Read how a company is doing") == []
    t = mailer.unsubscribe_token(42, "s3cret")
    assert mailer.token_contact(t, "s3cret") == 42
    assert mailer.token_contact("43." + t.split(".")[1], "s3cret") is None and mailer.token_contact("junk", "s3cret") is None


async def _admin(app):  # noqa: F811
    import time
    from finlit.auth import crypto
    c = await make_admin(app)
    secret = (await c.post("/api/me/mfa/setup")).json()["secret"]
    assert (await c.post("/api/me/mfa/enable", json={"code": crypto.totp_code(secret, int(time.time()) // 30)})).status_code == 200
    return c


@pytest.mark.integration
async def test_upload_write_test_send_and_unsubscribe(app, monkeypatch):  # noqa: F811
    sent = []

    async def fake_send(http, to, raw):
        sent.append((to, raw))
        return f"mid-{len(sent)}"

    async def no_bad_domains(http, domains):
        return ["nomail.example"]
    monkeypatch.setattr(mailer, "ses_send_raw", fake_send)
    monkeypatch.setattr(mailer, "domains_without_mail", no_bad_domains)
    monkeypatch.setattr(mailer, "start_sender", lambda app: None)
    monkeypatch.setattr(mailer, "RATE_PER_SECOND", 50)
    for k, v in (("SES_REGION", "ap-southeast-2"), ("SES_ACCESS_KEY_ID", "AKIDTEST"), ("SES_SECRET_ACCESS_KEY", "x")):
        monkeypatch.setenv(k, v)

    async with app.state.store.pool.acquire() as conn:
        await conn.execute("TRUNCATE mail_sends, mail_campaigns, mail_contacts RESTART IDENTITY CASCADE")
    member = await signed_in(app, "m387@example.com")
    assert (await member.get("/api/admin/mail")).status_code == 403          # administrators only
    admin = await _admin(app)

    csv_bytes = "Name,Email\nPriya Sharma,priya@a.in\nRavi,ravi@b.in\nRavi again,RAVI@b.in\nNo server,x@nomail.example\nBad,bad\nTypo,t@gmial.com\n".encode()
    up = {"filename": "list.csv", "data": base64.b64encode(csv_bytes).decode(), "source": "XYZ Hackathon, Oct 2026"}
    r = (await admin.post("/api/admin/mail/import", json=up)).json()
    assert (r["added"], r["duplicates"], r["invalidCount"], r["typoCount"], r["noMailServerCount"]) == (2, 1, 1, 1, 1)
    assert (await admin.post("/api/admin/mail/import", json=up)).json()["added"] == 0               # uploading again adds nobody twice
    assert (await admin.post("/api/admin/mail/import", json={**up, "source": ""})).status_code == 422  # the source is required

    bad = await admin.post("/api/admin/mail/campaigns", json={"subject": "Best stocks to buy", "body": "x" * 30, "why": "You registered for XYZ."})
    assert bad.status_code == 422 and "advice words" in bad.json()["detail"]
    mail = {"subject": "Thanks for joining XYZ Hackathon", "body": "Hi {name},\n\nThank you for taking part. Your FinLit account: https://finlitventures.com",
            "why": "You get this because you registered for XYZ Hackathon, Oct 2026.", "buttonText": "Create your free account", "buttonUrl": "https://finlitventures.com/signup"}
    assert (await admin.post("/api/admin/mail/campaigns", json={**mail, "buttonUrl": "javascript:alert(1)"})).status_code == 422   # https only
    assert (await admin.post("/api/admin/mail/campaigns", json={**mail, "buttonUrl": ""})).status_code == 422                       # words and link together
    cid = (await admin.post("/api/admin/mail/campaigns", json=mail)).json()["id"]
    pv = (await admin.get(f"/api/admin/mail/campaigns/{cid}/preview")).text
    # 28 Nov 2026: {name} in a preview or a test is the signed-in admin's own name (Asha here), never an invented sample; a new mail is plain
    # text, so the button is the line "words: link".
    assert "Hi Asha," in pv and "Priya" not in pv and 'Create your free account: <a href="https://finlitventures.com/signup"' in pv

    assert (await admin.post(f"/api/admin/mail/campaigns/{cid}/test", json={"to": "owner@example.com"})).json()["status"] == "sent"
    assert sent[-1][0] == "owner@example.com" and b"Subject: [Test] Thanks for joining" in sent[-1][1]
    sent.clear()

    assert (await admin.post(f"/api/admin/mail/campaigns/{cid}/send", json={"count": 1})).json()["queued"] == 1
    await mailer.drain(app)
    assert [t for t, _ in sent] == ["priya@a.in"]
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid}/send", json={"count": 500})).json()["queued"] == 1   # only the one left

    # Ravi unsubscribes (one click, as Gmail does) before his queued mail goes: it is skipped, and he is never queued again
    async with app.state.store.pool.acquire() as conn:
        ravi = await conn.fetchval("SELECT id FROM mail_contacts WHERE email = 'ravi@b.in'")
    token = mailer.unsubscribe_token(ravi, app.state.settings.secret_key)
    anon = new_client(app)
    assert (await anon.post(f"/api/mail/unsubscribe?t={token}", content=b"List-Unsubscribe=One-Click",
                            headers={"content-type": "application/x-www-form-urlencoded"})).json()["status"] == "unsubscribed"
    assert (await anon.post("/api/mail/unsubscribe?t=1.forged")).status_code == 400
    g = await anon.get(f"/api/mail/unsubscribe?t={token}", follow_redirects=False)
    assert g.status_code == 303 and g.headers["location"] == f"/unsubscribe?t={token}"           # a link scanner opening it changes nothing
    await mailer.drain(app)
    assert [t for t, _ in sent] == ["priya@a.in"]
    s = (await admin.get("/api/admin/mail")).json()
    camp = next(c for c in s["campaigns"] if c["id"] == cid)
    # Since 28 Nov 2026 loading the page also puts the site's members on the list (source "FinLit members": the member and the admin here), so
    # they are the 2 left; the hackathon list itself has nobody left.
    assert (camp["sent"], camp["skipped"], camp["queued"], camp["remaining"]) == (1, 1, 0, 2) and s["ready"] is True
    assert (await admin.post(f"/api/admin/mail/campaigns/{cid}/send", json={"count": 500, "source": "XYZ Hackathon, Oct 2026"})).json()["queued"] == 0
    assert (await admin.post("/api/admin/mail/campaigns", params={"id": cid}, json=mail)).status_code == 409   # a sent mail is not edited
