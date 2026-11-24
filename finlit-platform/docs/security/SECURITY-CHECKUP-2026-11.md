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

The codebase was already mature. The review found five Medium issues:
- unpinned CI actions;
- three abuse paths in the new mobile-number feature;
- DMARC not enforced (a DNS setting, fixed by the owner).

Everything else was Low, latent or defense-in-depth. Every code-level finding was fixed in a pull request with tests, and each new test was shown to fail on the old code. The rest are owner steps (DNS, AWS, server settings) or were checked and found safe.

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
| Email (DNS) | DMARC `p=none`: mail faking `@finlitventures.com` isn't rejected | Medium | **Owner step** 1 (quarantine), then step 7 (reject) |
| DNS | No CAA record | Low | **Owner step** 2 |
| Infra | Origin firewall should accept web traffic only from Cloudflare | Low | **Owner step** 3 |
| Server config | Live `.env` hardening (production mode and related settings) | Low | **Owner steps** 4 and 6 (given to the owner directly) |
| Secrets | The monitoring tools share the site's main mail key | Low | **Owner step** 5: separate, restricted key |

## Owner steps (one at a time, outside the code)

1. DMARC from `p=none` to `p=quarantine`, with Cloudflare DMARC reporting on (Cloudflare dashboard).
2. CAA record allowing only the certificate authorities in use (Cloudflare DNS).
3. EC2 security group: ports 80/443 only from Cloudflare's published ranges; SSH stays limited to the owner (AWS console).
4. Server settings to production mode, after a dry-run check that `config.validate()` passes (server).
5. A separate, restricted Resend key for the monitoring tools (Resend, GitHub secret, server).
6. Remove the bootstrap admin and demo passwords from the server environment (server).
7. About two weeks after step 1, with the DMARC reports clean, set `p=reject`.

## For the team

- **Dependabot:** about 18 update PRs are open. Today's `pip-audit` and `npm audit` are clean, so none of them fixes a known vulnerability. Several are major-version upgrades to review normally; the two docker-action bumps (#791, #527) need a rebase onto the SHA pins.
- **Amazon SES (#891):** add SES's DKIM records in Cloudflare before DMARC goes to `reject`. `config.validate()` currently requires `MAIL_MODE=resend`, so production mode must allow SES too.
- **Mobile numbers:** one-account-per-mobile without SMS verification can only be made costly, not impossible, to abuse. If SMS one-time codes are ever added, enforce uniqueness only on verified numbers.

## Running deeper (dynamic) testing

Use `PENTAGI-RUNBOOK.md`:
- an isolated box and a throwaway LLM key;
- a staging target where possible;
- an explicit scope file and disposable test accounts;
- throttled and time-windowed if production is ever in scope;
- teardown afterwards.

Triage every autonomous finding by hand, and ship confirmed issues as PRs with a test that fails before the fix and passes after.
