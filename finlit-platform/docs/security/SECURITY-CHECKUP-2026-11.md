# Security checkup — November 2026

_A full defensive security review of the FinLit platform, run on 24 November 2026 at the owner's request. It records the scope, the method, what was found, what was fixed, and what is left for the owner. Live server-configuration specifics went to the owner directly and are not repeated here._

## Headline

Nothing Critical or High turned up anywhere in the review. It covered:
- the main backend and the second `site-api` backend;
- the frontend;
- auth and session handling;
- infrastructure and CI;
- business-logic abuse and IDOR on the newest endpoints;
- the code that landed on `main` during the review (monitoring and the sign-up mobile number);
- non-destructive live probes of the site, its DNS and its email setup.

The codebase was already mature. The review found seven Medium issues:
- unpinned CI actions;
- three abuse paths in the new mobile-number feature;
- DMARC not enforced (a DNS setting);
- admins could sign in without the authenticator (a server setting);
- changing the password did not cancel a pending reset email.

Everything else was Low, latent or defense-in-depth. **All of it is closed** (24-25 Nov 2026):
- every code-level finding was fixed in a pull request (#892-#906) with tests, each new test shown to fail on the old code;
- every DNS, AWS and server step was done by the owner and checked;
- the rest was checked and found safe.

The one item left is on a timer: DMARC `p=reject` about 8 Dec 2026.

## Scope & method

- **Static review by eight parallel reviewers**, each tracing user input to a sink and checking for a guard. Only findings backed by `file:line` and a concrete attacker scenario were kept:
  - main backend: injection, SSRF and the AI tool surface;
  - auth, session, IDOR and plan-gating;
  - frontend and web;
  - infra, CI and dependencies;
  - the second backend (`site-api`);
  - business-logic abuse and IDOR on the newest endpoints;
  - the code merged during the review.
- **Non-destructive live probes**, with no scanning, fuzzing or load:
  - security headers, CORS and TLS;
  - exposure of `/.git`, `/.env`, `/openapi.json` and `/docs`;
  - error bodies and HTTP methods;
  - Cloudflare edge caching of `/api`;
  - client-IP handling behind Cloudflare;
  - DNS records (SPF, DKIM, DMARC, CAA, MX, NS), read over DNS-over-HTTPS.
- **Every fix was verified independently.** Its tests were re-run on a real Postgres 16 + Redis, bandit was run on the touched code, and new tests were shown to fail on the code before the fix.
- **Offensive tooling (PentAGI)** was evaluated and delivered as a hardened authorized-testing runbook (`PENTAGI-RUNBOOK.md`) rather than run from the review session.

## Already strong (verified, kept)

- **Passwords and login:** Argon2id, login timing equalized with a dummy hash, per-account and per-address budgets, 256-bit single-use reset tokens, TOTP replay protection, admin MFA.
- **Sessions:** `__Host-` cookie (HttpOnly, Secure, SameSite), rotation, revoke-all.
- **Access control:**
  - every per-member query is scoped by `user_id`;
  - admin routes require admin plus MFA;
  - plan gates are enforced server-side after a plan-keyed cache;
  - "view as" is honoured only for real admins;
  - the calendar feed uses 256-bit capability tokens.
- **Writes:** CSRF and Origin checks.
- **No exploitable injection:** no SQLi (only constants are interpolated), no command injection, no path traversal, no unsafe deserialization. XML goes through `defusedxml`, and the AI tool list is fixed, read-only and member-scoped.
- **Web:** strict CSP, HSTS for 2 years including subdomains, `nosniff`, `X-Frame-Options: DENY`, COOP/CORP, Referrer-Policy and Permissions-Policy. HTML is sanitized through allowlists, and there are no third-party scripts.
- **CORS:** allow-listed to the real site origin.
- **Behind Cloudflare:**
  - Caddy takes `CF-Connecting-IP` only from Cloudflare's ranges and overwrites `X-Forwarded-For`, so per-visitor limits count real visitors and the address can't be faked;
  - `/api` responses are never edge-cached (`cf-cache-status: DYNAMIC`, `no-store`);
  - every hostname (main, `www`, `app`, `workspace`) is proxied.
- **Config:** `config.validate()` refuses to boot production on weak settings. CI runs bandit, gitleaks, pip-audit and npm audit, and now CodeQL.

## Findings and what was done

| Area | Finding | Sev | Done |
|---|---|---|---|
| Frontend | Feed, news and alert links put in `href` / `location.assign` with no scheme allow-list (`javascript:`/`data:`). Latent: live links are https | Low | **Fixed** #892: `safeUrl()` http(s)-only on every sink, with tests |
| Frontend | Stress Lab company fields concatenated into `innerHTML` | Low | **Fixed** #892: cleaned at the source, with an XSS test |
| Auth | Sign-up timing revealed whether an email already had an account | Low | **Fixed** #893: dummy Argon2 on the existing-email path, with a test |
| CI | 26 third-party GitHub Actions on mutable tags; the image workflow can push to production | Medium | **Fixed** #898: pinned to commit SHAs (Dependabot keeps them current) |
| CI | Workflow secrets set job-wide, so readable by a third-party action | Low | **Fixed** #898: each secret visible only to the step that uses it |
| Supply chain | `.dockerignore` didn't exclude stray env files or keys | Low | **Fixed** #895 |
| Disclosure | No security policy or contact | — | **Added** #894: `SECURITY.md`, RFC 9116 `security.txt` (live), CodeQL |
| Backend | DNS-rebinding gap: name checked, then looked up again on connect (logos, company brief) | Low | **Fixed** #900: connect only to the checked public address, redirects re-checked, 38 tests |
| Backend | Costly public reads (screener, compare, charts, CSV) covered only by the shared site-wide budget | Low | **Fixed** #901: per-endpoint budgets for visitors and members |
| Backend | Anonymous AI-feedback votes deduplicated hourly, so the same answer could be voted 24× a day | Low | **Fixed** #899: daily dedupe; admin totals split members and visitors |
| Mobile (new) | `PATCH /me` 409 let one account test hundreds of numbers a minute | Medium | **Fixed** #903: 5 changes/day per account, 20/hour per address |
| Mobile (new) | Sign-up with a taken mobile sent no email: an oracle, and the real owner got stuck | Medium | **Fixed** #903: exactly one email on every path; only unique violations caught |
| Mobile (new) | Never-confirmed accounts held a mobile forever (squatting) | Medium | **Fixed** #903: the nightly prune removes empty never-confirmed accounts after 7 days |
| Mobile (new) | Unicode digits got past one-account-per-mobile | Low | **Fixed** #903: ASCII digits only |
| Monitoring (new) | `/api/status/public` in-memory limiter grew without bound (memory exhaustion) | Low–Med | **Fixed** #902: shared Redis limiter |
| Monitoring (new) | The public status page would show it if the scores-export lock broke | Low | **Fixed** #902: the security group is admin-only |
| Plans | Plan rank table has no "platinum" | — | **Not reachable:** `users.plan` CHECK allows only basic/silver/gold (migration 009); no change |
| site-api | `X-Frame-Options: SAMEORIGIN` rather than DENY | — | **Intentional:** the Blog embeds same-origin PDFs from `/api/content/assets/`; other sites still can't frame it |
| Email (DNS) | DMARC `p=none`: mail faking `@finlitventures.com` isn't rejected | Medium | **Done (owner, 24 Nov):** `p=quarantine` with Cloudflare DMARC reports; `p=reject` about 8 Dec |
| DNS | No CAA record | Low | **Done (owner, 24 Nov):** CAA issue for letsencrypt.org, sectigo.com, pki.goog, ssl.com (Cloudflare adds its own) |
| Infra | Origin firewall should accept web traffic only from Cloudflare | Low | **Done (owner, 24 Nov):** EC2 security group 80/443 = the 15 Cloudflare IPv4 ranges only; direct requests to the server address time out |
| Infra | SSH (22) open to every address | Low | **Done (owner, 25 Nov):** 22 = EC2 Instance Connect (Sydney, `13.239.158.0/29`) only; checked blocked from outside |
| Server config | Live `.env` hardening (production mode and related settings) | Low | **Done (owner, 24 Nov):** production mode, email confirmation on, real host list, explicit CORS origin; `config.validate()` reports no problems |
| Admin access | Admins could sign in without the authenticator | Medium | **Done (owner, 24 Nov):** `ADMIN_REQUIRE_MFA=1`, authenticator set up, admin password changed, old sessions ended; a fresh sign-in asks for the code |
| Secrets | The monitoring tools share the site's main mail key | Low | **Done:** separate sending-only key (#904 + owner, 24 Nov; test alert delivered); unused old Resend key deleted |
| Server | 14 pending OS security updates incl. a kernel | Low | **Done (owner, 25 Nov):** all installed, rebooted onto the new kernel, 0 pending |
| Deploy | The deploy self-check read the 3-host `DOMAIN` list as one address, so every deploy warned "HTTP 000" | Low | **Fixed** #904 |
| Password reset | The 6-digit reset code was in the email subject (lock-screen previews) | Low | **Fixed** #906 |
| Password reset | Changing the password under Account did not cancel a reset email still in the inbox (link up to 1 h, code 15 min) | Medium | **Fixed** #906 (test shows the old link resetting the password before the fix) |

## Owner steps: done 24-25 Nov 2026

1. ✅ DMARC `p=none` → `p=quarantine`, Cloudflare DMARC reports on.
2. ✅ CAA records for the certificate authorities in use.
3. ✅ EC2 security group: 80/443 from Cloudflare's ranges only.
4. ✅ Production mode (`ENVIRONMENT=production`, `AUTO_VERIFY_EMAIL=0`, `ALLOWED_HOSTS`, `CORS_ORIGINS`), after a dry-run `config.validate()`.
5. ✅ Separate sending-only Resend key for monitoring (server, GitHub secret), test alert delivered; unused old key deleted.
6. ✅ `ADMIN_REQUIRE_MFA=1`, authenticator set up, admin password changed. `ADMIN_PASSWORD` stays in `.env.aws` (deploy.sh requires it; it is the way back in), but it is no longer the live password.
7. ✅ OS security updates and the new kernel installed, rebooted.
8. ✅ SSH limited to EC2 Instance Connect. To SSH from a PC, add that PC's `/32` to port 22, never `0.0.0.0/0`.
9. ⏳ **About 8 Dec 2026:** if Cloudflare → Email → DMARC Management lists only Resend, Amazon SES and Cloudflare as senders, set `p=reject`.

## For the team

- **Dependabot:** about 18 update PRs are open. Today's `pip-audit` and `npm audit` are clean, so none of them fixes a known vulnerability. Several are major-version upgrades to review normally; the two docker-action bumps (#791, #527) need a rebase onto the SHA pins.
- **Amazon SES (#891):** its three DKIM records are already in Cloudflare; confirm the domain shows "Verified" in the SES console before merging, and before DMARC goes to `reject`. `config.validate()` currently requires `MAIL_MODE=resend`, so production mode must allow SES too.
- **Mobile numbers:** one-account-per-mobile without SMS verification can only be made costly, not impossible, to abuse. If SMS one-time codes are ever added, enforce uniqueness only on verified numbers.

## Running deeper (dynamic) testing

Use `PENTAGI-RUNBOOK.md`:
- an isolated box and a throwaway LLM key;
- a staging target where possible;
- an explicit scope file and disposable test accounts;
- throttled and time-windowed if production is ever in scope;
- teardown afterwards.

Triage every autonomous finding by hand, and ship confirmed issues as PRs with a test that fails before the fix and passes after.

- **Not security, seen during the checkup:** the `dhan-check` job has not passed since 18 Nov. Its credentials work (token auto-renews, data plan Active, instruments load) but the live-price probe returns no price (`incomplete`). Still inside its 400-hour limit.
- **OS release:** the server offers Ubuntu 26.04; 24.04 LTS is supported for years. A release upgrade is a planned maintenance job (full backup, quiet window), not part of this checkup.
