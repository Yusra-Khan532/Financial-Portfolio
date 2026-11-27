# Launch readiness: progress (keep up to date every session)

*The founder's checklist of 27 Nov 2026 is `CHECKLIST.md` in this folder, word for word: everything a serious financial website needs for launch beyond SEO (SEO, AEO and GEO are in `docs/search-growth/`). Every session that works on launch readiness reads `CHECKLIST.md` and this file first. Do one item at a time, start to finish, each in its own pull request, with full focus (the founder's words: "this should be done with the full focus and clarity"). Update this file in the same pull request, and never end a session without updating it.*

*Rules that still apply to every item:*
- *`finlit-platform/CLAUDE.md`: decide, don't ask; describe, never advise; jobs never stop; secrets only in `/opt/finlit/.env.aws`.*
- *Prove each item on the live site before calling it done.*
- *Before building an item, check its line against the live site and the code: some lines may already be partly done (see "Checked against the repository" below). Never redo or undo work that exists.*

## Checked against the repository (27 Nov 2026, before any change)
These lines of CHECKLIST.md need re-checking first, because the repository or `docs/MAINTAINER-MAP.md` says something different. The founder's checklist is kept as written; the facts go here.
- **"Lock the origin to Cloudflare" (section 2):** MAINTAINER-MAP section 5 says that since 24 Nov 2026 the EC2 security group accepts ports 80/443 only from Cloudflare's 15 IPv4 ranges. To check: a direct request to the server's IP should time out.
- **"House rule: Everything stays free" (section 10):** The plans on the live site (task #410, confirmed by the owner 27 Nov 2026) are Free, Mutual Fund + ETF, Equity Portfolio, Gold and Platinum, with prices in `frontend/src/landing/goliveData.js`. There is no Silver plan, and FinLit IQ is retired: FinLit Prism is the only company score. Payments are not live yet. The SEBI question (section 0, item 1) still stands before any paid plan is charged.
- **Uptime monitoring (section 3):** `deploy/aws/gatus/` and `deploy/aws/uptime-kuma/` exist. To check: are they running, and do their alerts reach the founder's phone?
- **Backups (section 3):** `deploy/aws/backup.sh` (nightly, kept on the server) and `test-backup-prune.sh` exist. The offsite copy is the missing part.
- **favicon.ico (section 8):** `frontend/public` has `favicon-16.png` and `favicon-32.png`, but no `favicon.ico`.
- **Analytics (section 7):** the same decision as `docs/search-growth/FOUNDER-STEPS.md` step 3 (recommended: FinLit's own cookie-free counter). Decide it once for both.
- **Mumbai move (sections 0 and 4):** shared with the search-growth plan (Phase 4). One plan document covers both.

## The 6 that matter most (CHECKLIST section 0)
- [ ] 1. SEBI check before charging for any paid plan (founder + lawyer)
- [ ] 2. Offsite backups (founder: S3 bucket in another region + access key in `.env.aws`; Claude: upload in `backup.sh` + restore test)
- [ ] 3. Refund and cancellation policy, legal name, address (founder decides the terms; Claude builds `/refund` and the identity block)
- [ ] 4. Grievance officer page (founder names a person; Claude builds `/grievance` + footer link)
- [ ] 5. Uptime and error alerts on the founder's phone (check gatus / uptime-kuma first)
- [ ] 6. Mumbai move (Claude writes the plan; founder does the AWS steps)

## Claude can do now (no founder input needed), in this order
- [ ] Mumbai migration plan document (zero downtime, Sydney kept 1 week as fallback; also covers CERT-In logs in India)
- [ ] Offsite backup: the `backup.sh` upload code, tested, switched off until the bucket and key exist; plus a monthly restore-test script
- [ ] Incident response plan, one page (CERT-In report within 6 hours; DPDP Board and users from May 2027)
- [ ] `/favicon.ico`
- [ ] Dependency audit (npm audit, pip-audit) + secret scan of history; OWASP ZAP baseline scan
- [ ] Accessibility: axe-core on the 15 main pages, light/dark, desktop/phone; fix findings (one PR per page group)
- [ ] One-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post`) on every non-transactional mail; check opt-outs are honoured within 2 days
- [ ] Server alert at 80% disk or memory; the clock-sync step (chrony to NIC/NPL) for the founder
- [ ] Edge caching of public HTML (company, glossary, fund pages) for a few minutes at Cloudflare (with the search-growth work)
- [ ] "Report a data error" on every company page
- [ ] Daily data cross-check (20 random companies against a second source, alert on a mismatch)
- [ ] "Last updated" consistent on every number block
- [ ] Corporate actions test (splits, bonuses)
- [ ] Help and FAQ page (top 20 questions); "Send feedback" (check what exists: tasks #53/#56/#90/#214 built feedback and query buttons)
- [ ] Error tracking (no personal data) + a daily "errors today" mail
- [ ] Real-user Core Web Vitals (first-party, CSP-safe) in the admin console; load test at 10× expected traffic before launch
- [ ] Drafts for the lawyer: privacy notice to DPDP shape (by 13 May 2027), terms with the paid-plan terms

## Waiting on the founder (from CHECKLIST.md; ask once, record the answer here)
- [ ] SEBI RA opinion from a securities lawyer (recommended: option (c) before launch, with plans designed as option (a) until then)
- [ ] Refund terms; legal entity name as on PAN/GST, registered address, CIN, GSTIN
- [ ] Grievance officer's name and email
- [ ] "Yes" to switch job alert mails from console to real email (Resend is set up)
- [ ] S3 bucket + key for offsite backups; EC2 daily disk snapshots (Lifecycle Manager, keep 7)
- [ ] Uptime monitor alerts to the phone (10 min)
- [ ] DNSSEC (Cloudflare + registrar), domain lock and auto-renew, Cloudflare WAF managed rules + Bot Fight Mode + rate limit on `/api/auth/*`
- [ ] `security@` / `support@` / `grievance@` addresses via Cloudflare Email Routing; security.txt contact moved off Gmail
- [ ] Google Postmaster Tools; AWS budget alert (~₹7,000, 80%); 2-step login on every account; a private list of who owns what
- [ ] Written confirmation from FinEdge and Dhan that public, commercial display is allowed
- [ ] Trademark "FinLit" (classes 36 and 42); GST registration and invoices before charging
- [ ] Bios of real people for the trust pages (shared with search growth, Phase 3)

## Session log
- **27 Nov 2026:** CHECKLIST.md kept word for word, and this file created with what the repository already shows. Pointer added to `finlit-platform/CLAUDE.md`. No item has been built yet.

## Next step
- The Mumbai migration plan document (it serves sections 0, 3 and 4 of the checklist and the search-growth speed phase), then the offsite-backup code.
- Search growth Phase 1 (company pages) is in progress in its own pull request; one task at a time.
