"""Task #281 round 7: the admin route for fund-house files (finlit/fund_files.py): admin only, the file's type checked from its bytes, and room in the body
limit for a real monthly file (several MB as base64)."""
import base64
import os
import time

import pytest

from test_auth import app, make_admin, new_client, signed_in  # noqa: F401
from test_fund_files_281r7 import _xlsx
from test_integration import ingested, make_settings, store  # noqa: F401

pytestmark = pytest.mark.integration


# ------------------------------------------------------------------------------------------------------------ the route
async def _admin(app):  # noqa: F811
    from finlit.auth import crypto
    admin = await make_admin(app, "files-admin@example.com")
    secret = (await admin.post("/api/me/mfa/setup")).json()["secret"]
    assert (await admin.post("/api/me/mfa/enable", json={"code": crypto.totp_code(secret, int(time.time()) // 30)})).status_code == 200
    return admin


async def test_upload_is_admin_only_and_checks_the_file(app):  # noqa: F811
    body = {"house": "kotak", "month": "2026-10", "name": "k.xlsx", "file": base64.b64encode(_xlsx([["x"]])).decode()}
    assert (await new_client(app).post("/api/admin/fund-files", json=body)).status_code in (401, 403)
    user = await signed_in(app, "plain-files@example.com")
    assert (await user.post("/api/admin/fund-files", json=body)).status_code == 403
    assert (await user.get("/api/admin/fund-files")).status_code == 403
    admin = await _admin(app)
    html = {**body, "file": base64.b64encode(b"<html>Access Denied</html>").decode()}
    r = await admin.post("/api/admin/fund-files", json=html)
    assert r.status_code == 422 and "not an Excel" in r.text
    assert (await admin.post("/api/admin/fund-files", json={**body, "house": "nobody"})).status_code == 422
    r = await admin.post("/api/admin/fund-files", json=body)
    assert r.status_code == 201 and r.json()["status"] == "stored, no reader"
    o = (await admin.get("/api/admin/fund-files")).json()
    assert o["houses"][0]["key"] == "hdfc" and o["uploads"][0]["house"] == "kotak"


async def test_a_large_file_gets_through_the_body_limit_for_an_admin_upload(app):  # noqa: F811
    """A real monthly file is several MB; the API's 64 KB body limit must not refuse it (only for these admin file routes, with a session cookie)."""
    admin = await _admin(app)
    big = _xlsx([["Kotak"]] + [[f"row {i}", os.urandom(60).hex(), i] for i in range(6000)])   # random text: a workbook does not compress it away
    assert len(big) > 200_000
    r = await admin.post("/api/admin/fund-files", json={"house": "kotak", "month": "2026-10", "name": "big.xlsx", "file": base64.b64encode(big).decode()})
    assert r.status_code == 201, r.text
    anon = new_client(app)
    r = await anon.post("/api/admin/fund-files", json={"house": "kotak", "month": "2026-10", "name": "big.xlsx", "file": base64.b64encode(big).decode()})
    assert r.status_code == 413                                            # no session cookie: the small limit still applies
