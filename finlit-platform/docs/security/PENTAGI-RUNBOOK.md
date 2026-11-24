# PentAGI authorized-testing runbook (FinLit)

_Added 24 November 2026 as part of the security checkup. This is the **setup and safe-usage** guide for running [PentAGI](https://github.com/vxcontrol/pentagi) against FinLit. It is deliberately a runbook, not a live run: see "Why this was not run from the review session" below._

PentAGI (vxcontrol, MIT licence, v2.2.0) is an autonomous multi-agent penetration-testing tool. It drives an LLM to plan and execute attacks — port/vuln scans, web fuzzing, exploitation attempts — against a target you give it, inside Docker containers, and writes up what it finds. It is a real offensive tool: treat every run as a live attack on whatever host you point it at.

---

## 1. Rules before anything else

1. **Only test infrastructure FinLit owns and controls.** The live site, or a staging copy. Never a third-party host, a shared dependency, or an endpoint that proxies to someone else's service.
2. **Prefer a staging / throwaway target over production.** Stand up the stack from `deploy/aws/` on a separate box (or locally with Docker Compose) seeded with non-real data, and point PentAGI at that. Production is a last resort and only under the throttled, windowed rules in §5.
3. **Never run it from a session or machine that holds production credentials or proxy-injected secrets.** PentAGI executes attacker tooling; give it nothing it could turn on the real business.
4. **One operator, scope in writing, a time window agreed in advance.** Record who ran it, against what, from when to when, in `docs/security/` next to this file.
5. **No denial-of-service, no stress/flood modes, no data destruction.** FinLit's own SECURITY.md forbids this for outside researchers; we hold ourselves to the same line.
6. **Stop immediately** if the target shows errors, the job supervisor reports a stalled job, or real user traffic is affected. Background jobs must never be knocked over (see `docs/JOBS.md`).

---

## 2. What you need

- A machine **isolated from production** (a laptop, or a dedicated cloud VM you will tear down). Not the EC2 app server, not a CI runner with deploy rights.
- Docker + Docker Compose, ~4 GB RAM free, ~10 GB disk.
- **An LLM API key you create for this purpose** (OpenAI / Anthropic / etc.), funded and rate-limited on its own account. Do **not** reuse any FinLit provider key. Add it through PentAGI's own `.env` on the isolated box — never paste it into chat, a PR, or this repo (same rule as every FinLit secret: `/opt/finlit/.env.aws` or the host dashboard only).
- Network egress from that box to the LLM provider and to the target.

---

## 3. Install (isolated box)

```bash
# On the isolated testing box, NOT the production server:
git clone https://github.com/vxcontrol/pentagi.git
cd pentagi
cp .env.example .env
```

Edit `.env` on that box:
- Set exactly one LLM provider key (the throwaway key from §2).
- Keep the default internal Postgres/observability stack; do not expose its ports to the internet.
- Pin the image you reviewed (v2.2.0 at time of writing) rather than `latest`, and read the compose file before `up` so you know what is being started.

```bash
docker compose up -d
# PentAGI UI comes up on its configured local port. Reach it over an SSH tunnel,
# not a public bind. Do not expose the PentAGI UI to the internet.
```

> CVE note: PentAGI itself had a disclosed issue (CVE-2026-14784) in older builds. Run a current release, keep it on the isolated box, and never leave the instance running or reachable after a test window.

---

## 4. Define the scope (staging first)

Create a scope file and give PentAGI a narrow, explicit target:

- Target host: the **staging** hostname/IP (preferred), e.g. a fresh deploy of `deploy/aws/` on a test box.
- In-scope paths: `/`, `/api/*`, the authenticated app behind a **test** account you created.
- Out of scope: any third-party host, the AMFI/exchange data sources, the mail provider, the LLM provider, and anything the app merely links to.
- Test accounts: create disposable Basic / Silver / Gold accounts so PentAGI can probe plan-gating and IDOR as a real low-privilege user, exactly as the SECURITY.md "test only your own account" rule intends.

Point PentAGI's task at: "Enumerate and test `https://<staging-host>` for OWASP Top 10 — authn/session, access control / IDOR, injection, SSRF, XSS, security headers, and plan-gating bypass — using only the provided test accounts. No DoS, no destructive actions."

---

## 5. If (and only if) testing production

Production testing is allowed only when staging cannot reproduce the thing you need to check, and then under all of:

- **A pre-agreed window** (owner-approved), ideally off-peak for Indian readers, and announced to the team.
- **Throttling:** cap PentAGI/its tools to a low request rate. The app's limiter is ~300 req/min; stay well under it and never trip it deliberately.
- **Read/benign only:** no account creation storms, no password-spray, no export floods, no anything that could exhaust the t3.small (2 GB) box or stall a job.
- **A watcher** on `/api/jobs/status` and server load for the whole window, ready to stop.
- **Only your own test accounts** for anything authenticated.
- Tear the PentAGI instance down the moment the window closes.

---

## 6. After a run

1. Export PentAGI's report off the box.
2. Triage every finding by hand — autonomous tools over-report. Confirm each with a manual repro and a `file:line` in this repo before believing it.
3. File confirmed issues as normal security PRs (branch per fix, test that fails before / passes after), the same way the November 2026 checkup shipped #892–#895.
4. Record the run (operator, scope, window, headline findings) in `docs/security/`.
5. **Destroy the PentAGI instance and revoke the throwaway LLM key.**

---

## Why this was not run from the review session

The November 2026 security checkup was performed from a session that carries production-scoped GitHub access and proxy-injected credentials for `workspace.finlitventures.com`. Running an autonomous offensive tool from such a session — or pointing it at the live 2 GB production box without an agreed window — would risk both the credentials and the service, and would breach FinLit's own no-DoS / no-scanner disclosure rule.

So the checkup instead used **non-destructive, manual** methods from the session — a full static review of the backend, second backend, frontend and infra by parallel reviewers, plus light read-only header/CORS probes of the live site — and shipped the fixes it found as PRs. PentAGI is delivered here as this runbook so the team can run it deliberately, on an isolated box against staging, when they choose to. See `docs/security/SECURITY-CHECKUP-2026-11.md` for the checkup results.
