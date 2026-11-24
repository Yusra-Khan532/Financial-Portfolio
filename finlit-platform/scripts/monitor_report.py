"""Reports a monitoring result to the site's admin console (POST /api/monitor/ingest with X-Monitor-Key), and sends the outside check's alert
email. Used by .github/workflows/platform-uptime.yml and platform-load.yml (docs/MONITORING.md). Standard library only.

    python3 monitor_report.py outside <ok 0|1> <http status> <ms> <version> <fails in a row>
    python3 monitor_report.py k6 <smoke|weekly|manual> <summary.json> <k6 exit code> <vus>
    python3 monitor_report.py email "<subject>" "<body>"         (SMTP_* and ALERT_EMAIL_* from the environment; exit 3 when not set)

Environment: BASE_URL (default https://finlitventures.com), MONITOR_INGEST_KEY (no key: nothing is posted, and that is not an error),
RUN_URL (the GitHub run, shown in the console)."""
from __future__ import annotations

import json
import os
import smtplib
import sys
import urllib.request
from email.message import EmailMessage

BASE = (os.environ.get("BASE_URL") or "https://finlitventures.com").rstrip("/")


def post(body: dict) -> None:
    key = os.environ.get("MONITOR_INGEST_KEY") or ""
    if not key:
        print("MONITOR_INGEST_KEY is not set: the result is not sent to the console")
        return
    req = urllib.request.Request(BASE + "/api/monitor/ingest", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-Monitor-Key": key, "User-Agent": "FinLit-monitor"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:   # nosec B310 - a fixed https address
            print("console:", r.status)
    except Exception as e:   # noqa: BLE001 - the site may be the thing that is down
        print("could not report to the console:", e)


def k6_body(run: str, summary: dict, code: int, vus: int) -> dict:
    m = summary.get("metrics") or {}
    dur = m.get("http_req_duration") or {}
    failed = (m.get("http_req_failed") or {}).get("value")
    if failed is None:
        failed = (m.get("http_req_failed") or {}).get("rate")
    run_url = os.environ.get("RUN_URL") or None
    return {"kind": "k6", "k6": {"run": run, "passed": code == 0, "requests": int((m.get("http_reqs") or {}).get("count") or 0),
                                 "p95Ms": dur.get("p(95)"), "avgMs": dur.get("avg"),
                                 "errorPct": round(100.0 * failed, 2) if isinstance(failed, (int, float)) else None,
                                 "vus": vus, "runUrl": run_url if run_url and run_url.startswith("https://github.com/") else None}}


FROM = "FinLit Alerts <alerts@finlitventures.com>"
REPLY_TO = "alerts@finlitventures.com"


def email(subject: str, text: str) -> int:
    """Through Resend's SMTP (smtp.resend.com:465, implicit TLS, username "resend", password = RESEND_API_KEY). Returns 3 when the key is not set,
    so the caller can open a GitHub issue instead."""
    key = os.environ.get("RESEND_API_KEY") or ""
    to = os.environ.get("ALERT_EMAIL_TO") or "finlit.start@gmail.com"
    if not key:
        print("RESEND_API_KEY is not set")
        return 3
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"], msg["Reply-To"] = subject, FROM, to, REPLY_TO
    msg.set_content(text)
    with smtplib.SMTP_SSL("smtp.resend.com", 465, timeout=30) as s:
        s.login("resend", key)
        s.send_message(msg)
    print("alert email sent")
    return 0


def main(a: list) -> int:
    if a[:1] == ["outside"]:
        ok, status, ms, version, fails = a[1] == "1", int(a[2] or 0), int(a[3] or 0), a[4] or None, int(a[5] or 0)
        post({"kind": "outside", "outside": {"ok": ok, "status": status or None, "ms": ms or None, "version": (version or "")[:40] or None, "failsInARow": fails}})
        return 0
    if a[:1] == ["k6"]:
        try:
            summary = json.load(open(a[2]))
        except Exception:   # noqa: BLE001 - k6 did not write a summary (it could not start)
            summary = {}
        post(k6_body(a[1], summary, int(a[3]), int(a[4] or 0)))
        return 0
    if a[:1] == ["email"]:
        return email(a[1], a[2])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
