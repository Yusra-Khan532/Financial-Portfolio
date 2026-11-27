# Security Policy

FinLit Ventures (https://finlitventures.com) is a research and tools site for Indian stocks and funds. Everything is free; there is no payment data.
We take security seriously and welcome reports of vulnerabilities.

## Reporting a vulnerability

Please email **finlit.start@gmail.com** with `SECURITY` in the subject line. Do **not** open a public GitHub issue for a security problem.

Include, where you can:

- what the issue is and where (URL, endpoint, or file),
- the steps to reproduce it, and the impact you think it has,
- any proof-of-concept, kept minimal.

We aim to acknowledge a report within 5 working days and to keep you updated while we fix it. We are grateful for responsible disclosure and will credit reporters who want it, once a fix has shipped.

## Scope and rules

- In scope: `finlitventures.com` (and `www`/`app` subdomains) and this repository's code.
- Please test only against **your own account and data**. Do not access, modify, or delete other users' data.
- Please do **not** run denial-of-service, load/stress testing, or automated vulnerability scanners against the live site — it runs on a small shared server, and heavy automated traffic degrades the service for real users. A hand-crafted proof-of-concept is enough.
- Out of scope: findings that require a compromised device, physical access, social engineering of our staff, or already-known issues in third-party services.

## What we already do

- Dependency and secret scanning in CI (`pip-audit`, `npm audit`, `bandit`, `gitleaks`) and continuous CodeQL static analysis.
- Strong transport and content security (HSTS, a strict Content-Security-Policy, `X-Content-Type-Options`, `X-Frame-Options`), per-account and per-IP rate limits, Argon2id password hashing, and server-side enforcement of every plan entitlement.

Thank you for helping keep FinLit and its users safe.
