# Security checkup — November 2026

_Full defensive security review of the FinLit platform, requested by the owner. This records scope, method, what was found, and what was shipped. Sensitive live server-config specifics were communicated to the owner directly and are not reproduced here._

## Headline

Across the whole review — the main backend, the second `site-api` backend, the frontend/web layer, auth/session, infrastructure/CI, business-logic abuse and IDOR on the newest endpoints, plus non-destructive live probes of the production site — there were **no Critical, High, or exploitable-Medium findings**. The codebase is mature and already well defended. Everything found was Low / latent / defense-in-depth or a server-config / ownership decision; the code-level items in scope were fixed and shipped as PRs.

## Scope & method

- **Static review** of `finlit-platform/backend/finlit` (main API + AI tool surface), `finlit-platform/site-api/backend` (second service), `finlit-platform/frontend` (React/TS), and infra/CI (`deploy/aws`, `.github/workflows`, Dockerfiles). Six parallel reviewers, each tracing user input → sink and checking for a guard, reporting only findings backed by `file:line` and a concrete attacker scenario.
- **Non-destructive live probes** of the production site: security headers, CORS behaviour, TLS, exposure of `/.git`, `/.env`, `/openapi.json`, `/docs`, error-body leakage, cache behaviour, HTTP methods. No scanning, no fuzzing, no load — in line with the platform's own responsible-disclosure rules.
- **Offensive tooling (PentAGI)** was evaluated and delivered as a hardened authorized-testing runbook (`PENTAGI-RUNBOOK.md`) rather than run — see that file for why.

## What is already strong (kept, verified)

- **Passwords:** Argon2id; login timing equalized with a dummy hash; per-account brute-force budgets; reset tokens 256-bit, single-use; TOTP replay-protected; admin MFA.
- **Sessions:** `__Host-` cookie, HttpOnly + Secure + SameSite, rotation on privilege change, revoke-all.
- **Access control:** every per-member object scoped by `user_id` in the query; admin routes behind an admin+MFA context; plan-gating enforced server-side (not just hidden in the UI); the admin "view-as" header is honoured only for real admins.
- **Writes:** CSRF + Origin checks (`secure_ctx`) on all state-changing routes.
- **Injection/SSRF:** no exploitable SQLi (interpolation only of constants/whitelisted keys, values always bound); no command injection (arg-list subprocess, admin-gated); no path traversal; no unsafe deserialization (no `pickle`/`yaml.load`/`eval`); XML via `defusedxml`; outbound fetches target fixed hosts; the AI tool surface is a fixed, read-only, member-scoped tool list (prompt-injection contained).
- **Web:** strict CSP (`frame-ancestors none`, `object-src none`, `base-uri none`), HSTS 2yr incl. subdomains, `nosniff`, `X-Frame-Options DENY`, COOP/CORP, Referrer-Policy, Permissions-Policy; HTML sanitized through an allowlist; `rel=noopener` on `target=_blank`; no third-party scripts; no secrets or tokens in browser storage.
- **CORS:** correctly allow-listed — the production origin is reflected only for the real site origin; attacker origins get no `Access-Control-Allow-Origin`.
- **Config safety:** `config.validate()` refuses to boot production on weak settings; no committed secrets; CI runs bandit + gitleaks + pip-audit + npm audit weekly and on every PR.

## Findings and disposition

| ID | Sev | Area | Finding | Disposition |
|----|-----|------|---------|-------------|
| F1 | Low (latent) | frontend | Feed/news/alert links placed in `<a href>` with no URL-scheme allow-list (`javascript:`/`data:` class). All live links are https today, so latent. | **Fixed** — `safeUrl()` http(s)-only helper on every sink + tests (PR #892) |
| F2 | Low | frontend | Stress-lab company name/sector concatenated into `innerHTML` unescaped. | **Fixed** — escaping + XSS test (PR #892) |
| F3 | Low | frontend | Alert click `location.assign(link)` unchecked (open-redirect). | **Fixed** — same allow-list (PR #892) |
| B1 | Low | auth | Account-enumeration timing: register skipped Argon2 on the existing-email branch (login was already equalized). | **Fixed** — dummy-hash on existing-email branch + test (PR #893) |
| B2 | Low | entitlements | Plan rank table omits "platinum" → treated as basic (fails closed; billing/correctness, not a breach). | **Recommendation** — add platinum to the single tier source |
| M1 | Medium | CI/supply-chain | Third-party GitHub Actions pinned to mutable tags. | **Partly** — Dependabot `github-actions` updater already configured (weekly); **SHA-pin recommended** (could not resolve SHAs from the review environment) |
| L3 | Low (latent) | supply-chain | `.dockerignore` didn't exclude generic secret/key patterns. | **Fixed** — patterns added to both ignore files (PR #895) |
| — | Low (latent) | backend | DNS-rebinding TOCTOU in two server-side fetch helpers (resolve-then-reconnect); targets non-user domains on nightly jobs. | **Recommendation** — connect to the validated resolved IP |
| E1a/E1b | Low (latent) | site-api | Second backend uses `X-Frame-Options: SAMEORIGIN` (vs DENY) + HSTS without preload; unconditional `ACAC:true` behind a real allowlist. | **Recommendation** — align with main app (harmless today) |
| E2a | Low (latent) | backend | Anonymous feedback-vote dedupe is IP-salted; IP rotation could inflate counts in the admin-only dashboard (data-quality only). | **Recommendation** — require auth to vote, or server-issued ref tokens |
| L2/L4 | Low | server config | Live `.env` / operational hardening items. | **Communicated to owner directly** (server config, not repo) |

## What was shipped (PRs)

- **#892** — frontend URL/XSS hardening (`safeUrl()` allow-list + stress-lab escaping) with tests.
- **#893** — auth register timing equalization with test.
- **#894** — CodeQL SAST (Python + JS/TS, push/PR/weekly) + `SECURITY.md` + RFC 9116 `.well-known/security.txt` responsible-disclosure.
- **#895** — Docker build-context secret exclusion.

## Infrastructure note: Cloudflare is now proxying the origin

Live responses show Cloudflare edge headers (`server: cloudflare`, `cf-ray`) in front of the origin Caddy (`via: 1.1 Caddy`), i.e. the zone is now proxied (orange-cloud). This is a posture improvement (edge DDoS protection, origin IP hidden) but makes one control important: **the origin host must accept inbound web traffic only from Cloudflare's IP ranges** (security-group / firewall rules, or Cloudflare Authenticated Origin Pulls / a Tunnel). Otherwise the edge is bypassed by connecting to the origin IP directly, and the edge protections and WAF rules do not apply. `CLAUDE.md` and `docs/SEO-SECURITY-PLAN.md` still describe Cloudflare as DNS-only / "no Cloudflare step" and should be updated to match reality.

## Running deeper (dynamic) testing

Use `PENTAGI-RUNBOOK.md`: an isolated box, a throwaway LLM key, a staging target by preference, an explicit scope file and disposable test accounts, throttled and windowed if production is ever in scope, and teardown afterwards. Triage every autonomous finding by hand before believing it, and ship confirmed issues as normal PRs with a failing-then-passing test.
