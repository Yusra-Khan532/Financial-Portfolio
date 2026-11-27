# FinLit launch-readiness checklist (everything beyond SEO)

Checked on the live site on 27 Nov 2026. Each line shows what the live site has now:

- ✅ done and verified live
- ⚠️ partly done
- ❌ missing

**Who** says who does it:

- **You**: an account, a dashboard or a decision only you can make.
- **Claude**: code I build and test.
- **Lawyer/CA**: needs a professional sign-off.

The SEO, AEO and GEO work is in the separate Search Growth plan and prompt. This list covers everything else a serious financial website needs for launch.

---

## 0. The 6 things that matter most (do these first)

| # | Item | Why it matters | Who |
|---|------|----------------|-----|
| 1 | **SEBI check before charging for Gold** | Paid stock research or recommendations can require SEBI Research Analyst (RA) registration. Selling Gold that unlocks stock scores or reports needs a written opinion from a securities lawyer first. | You + Lawyer |
| 2 | **Offsite backups** | The nightly database backup is kept on the same server, so if that server or its disk is lost, every backup goes with it. | You (5 min) + Claude |
| 3 | **Refund and cancellation policy, legal name, address** | Razorpay and Cashfree check these on the live site before they activate payments. | You decide, Claude builds |
| 4 | **Grievance officer page** | Indian IT Rules: publish a name and contact, acknowledge complaints within 24 h, resolve them within 7 days. | You name a person, Claude builds |
| 5 | **Uptime and error alerts on your phone** | Today nobody gets told when the site goes down. | You (10 min) |
| 6 | **Move the server from Sydney to Mumbai** | It's the biggest speed gain for Indian users and also keeps logs inside India, which CERT-In requires. | Claude plans, You do the AWS steps |

---

## 1. Legal and regulatory (India)

| Item | Status | Detail | Who |
|---|---|---|---|
| Privacy policy | ⚠️ | `/legal/privacy` exists. By **13 May 2027** (DPDP Rules, main obligations) it must be a standalone, plain-language notice covering: what data is collected, why, how long it's kept, how to withdraw consent, user rights (access, correct, delete), the complaint route to the Data Protection Board, and breach notice. Consent managers became operative on 13 Nov 2026. | Claude drafts, Lawyer reviews |
| Terms of use | ⚠️ | `/legal/terms` exists. Add the Gold subscription terms: price + GST, yearly auto-renew yes/no, cancellation, governing law and courts (your city). | Claude drafts, Lawyer reviews |
| Disclosures / disclaimer | ✅ | `/legal/disclosures` exists and says "Not a registered adviser". Keep the "describe, never advise" rule everywhere. | — |
| **SEBI RA question** | ❌ | Paid recommendations, target prices and model portfolios are regulated research. SEBI's RA Master Circular (6 Feb 2026) covers the advertising code and the finfluencer limits. There are three options: (a) keep every stock score and report free and charge Gold only for tools (portfolio analytics, alerts, exports, screener limits); (b) register as an RA; (c) get a lawyer's opinion on the exact Gold features. **My recommendation: (c) before launch, and design Gold as (a) until you have the answer.** | You + Lawyer |
| Refund and cancellation policy | ❌ | `/refund` returns 404. Needed for gateway activation. You decide the terms (for example, a full refund within 7 days of buying the yearly plan, none after that). | You decide, Claude builds |
| Grievance officer | ❌ | No page anywhere. Name, email, 24 h acknowledge and 7 days resolve, link in the footer. It also serves as the DPDP contact. | You name a person, Claude builds |
| Business identity on the site | ⚠️ | The footer or Contact page needs: legal entity name exactly as on PAN/GST, registered address, CIN (if a company), GSTIN. Gateways check that the name matches. | You give details, Claude adds |
| GST registration and invoices | ❌ (for Gold) | You priced Gold as ₹5,000 + GST, so you need a GSTIN and a GST invoice emailed for every payment. | CA + Claude |
| **Data licence for what we show** | ⚠️ check | Confirm in writing that the FinEdge and Dhan terms allow showing their data **publicly and commercially** on a paid site. Exchange price data has redistribution rules. AMFI NAVs are public. | You (email the providers) |
| Trademark "FinLit" | ❌ | File a trademark in classes 36 (financial information) and 42 (software). It's cheap protection for the brand you're building. | You + Lawyer |
| Cookie notice | ✅ not needed now | Only needed if non-essential cookies or trackers are added. Keep analytics cookie-free (section 7) and no banner is needed. | — |

## 2. Security

| Item | Status | Detail | Who |
|---|---|---|---|
| HTTPS, HSTS (2 years), strict CSP, X-Frame DENY, nosniff, referrer, permissions, COOP | ✅ | All verified live. This is better than most Indian finance sites. | — |
| Cloudflare in front, HTTP/3 | ✅ | Verified. | — |
| security.txt | ✅ | Present, valid until Nov 2027. Change the contact from a Gmail address to `security@finlitventures.com` (Cloudflare Email Routing can forward it to your Gmail). | You (2 min) |
| **Lock the origin to Cloudflare** | ❌ check | The server IP 54.253.190.17 is public. Anyone hitting it directly skips Cloudflare's WAF and DDoS protection. In the AWS Security Group, allow ports 80/443 only from Cloudflare's IP ranges. | Claude gives exact steps, You apply |
| SSH access | ⚠️ check | SSH only from your IP (or use AWS Session Manager), no password login, no root login. | You + Claude |
| Cloudflare WAF and bot rules | ⚠️ check | Turn on the managed WAF rules (free set), Bot Fight Mode, and a rate-limit rule on `/api/auth/*`. | You (Cloudflare dashboard) |
| DNSSEC | ❌ | Not on (checked live). In Cloudflare: DNS → Settings → Enable DNSSEC, then paste the DS record at your domain registrar. It stops DNS spoofing. | You (5 min) |
| Domain lock and auto-renew | ⚠️ check | At the registrar, turn on transfer lock and auto-renew. Losing the domain loses everything. | You |
| Login protection | ✅ | OTP and rate limits exist in the auth code. I will re-test that brute-force attempts are blocked. | Claude |
| Dependency audit and secret scan | ⚠️ | Run `npm audit`, `pip-audit` and a scan of the repo history for leaked keys. | Claude |
| Pen test | ❌ | Before Gold launch: an OWASP ZAP baseline scan (I can run it), then a paid external pen test once there are paying users. | Claude, later a vendor |
| Payment safety (Gold) | ❌ | Use the gateway's hosted checkout (never touch card data), verify webhook signatures, make webhooks safe to repeat. | Claude |

## 3. Reliability, backups, incident response

| Item | Status | Detail | Who |
|---|---|---|---|
| Nightly database backup | ⚠️ | Runs at 02:00 IST and keeps 7 days, but **only on the same server**. | — |
| **Offsite backup copy** | ❌ | Copy each night's dump to an S3 bucket in **another region** (versioning on, kept 30 days). You create the bucket and an access key and put the key only in `/opt/finlit/.env.aws`. Claude adds the upload to `backup.sh`. | You + Claude |
| AWS disk snapshots | ❌ check | AWS console → EC2 → Lifecycle Manager → daily snapshot of the server's disk, keep 7. Five minutes and it saves the whole server. | You |
| Restore test | ❌ | A backup that has never been restored isn't proven. I'll write a monthly restore-test script that loads the newest dump into a scratch database and counts rows. | Claude |
| Uptime monitoring | ❌ | A free external monitor (UptimeRobot or Better Stack) on `/`, `/api/health` and `/stocks/TCS`, checked every 1–5 minutes, with alerts to your phone and email. | You (10 min) |
| Error tracking | ❌ | Server errors are only in container logs. Add backend error reporting (Sentry free tier, with no personal data sent), plus a daily "errors today" email. | Claude |
| Real alert emails for jobs | ⚠️ | Job alerts currently only log "mail (console)". Resend is already set up for the domain (DKIM ✅), so they can be real emails. **Tell me yes and I'll switch them on.** | You say yes, Claude does it |
| **Logs kept 180 days, in India** | ❌ | CERT-In requires ICT logs kept for 180 days **within India**. Today Docker keeps 3 × 10 MB per container (a few days) and the server is in Sydney. The fix is to move to Mumbai (section 4) and keep compressed access, auth and app logs for 180 days. | Claude |
| Clock sync | ⚠️ check | CERT-In asks that system clocks sync to NIC or NPL time servers. It's one setting in `chrony`. | Claude gives the step |
| Incident plan (one page) | ❌ | Who does what when the site is hacked or leaks data. CERT-In needs a report **within 6 hours** of noticing an incident. From May 2027 the DPDP Rules also require telling the Data Protection Board and affected users. | Claude drafts |
| Disk, memory and CPU alerts | ⚠️ | Jobs have their own monitoring. Add a server-level alert at 80% disk or memory. | Claude |

## 4. Speed (your number-one priority)

| Item | Status | Detail | Who |
|---|---|---|---|
| Static files at the Cloudflare edge for a year, brotli, HTTP/3 | ✅ | Verified: `cf-cache-status: HIT`, `max-age=31536000, immutable`. | — |
| **Server location** | ❌ | The origin is in **Sydney**, so every page and API call from India travels about 10,000 km and back. Moving to AWS **Mumbai (ap-south-1)** cuts roughly 150 ms or more from every request, which is the single biggest speed gain left. It also keeps logs and data in India (CERT-In; DPDP comfort). Plan: build the new server, copy the data, switch DNS in Cloudflare, keep Sydney for 1 week as a fallback, with zero downtime. | Claude plans, You do the AWS clicks |
| HTML caching | ❌ | Page HTML is `DYNAMIC` (not cached at the edge). Public pages that are the same for everyone (company pages for crawlers, glossary, funds) can be cached at Cloudflare for a few minutes. | Claude |
| Home page weight | ⚠️ | Measured earlier: LCP 3.7 s and 139 requests on the home page; the goal is under 2.5 s. This is in the Search Growth plan (performance phase). | Claude |
| Real-user speed measurement | ❌ | Measure Core Web Vitals from real visitors with a small first-party script (no third party, fits the CSP), shown in the admin console. | Claude |
| Load test | ❌ | Before launch day, simulate about 10× expected traffic on key pages and the Prism endpoint. | Claude |

## 5. Email deliverability

| Item | Status | Detail | Who |
|---|---|---|---|
| DMARC | ✅ | `p=quarantine` with Cloudflare reports. Stronger than the minimum Gmail, Yahoo and Microsoft require. | — |
| DKIM (Resend) | ✅ | `resend._domainkey` present. | — |
| SPF | ✅ | The root covers Cloudflare routing; the `send.` subdomain covers sending. | — |
| One-click unsubscribe | ❌ check | Any newsletter or alert mail needs `List-Unsubscribe` + one-click headers, and opt-outs honoured within 2 days. Login OTPs and receipts are exempt. | Claude |
| Google Postmaster Tools | ❌ | Register the domain to watch the spam rate (keep it under 0.3%, aim for 0.1%). | You (5 min) |
| Domain email addresses | ⚠️ | Use `support@`, `security@`, `grievance@finlitventures.com` (forwarded by Cloudflare Email Routing) instead of Gmail on the site. | You |

## 6. Accessibility (WCAG 2.2 AA)

| Item | Status | Detail | Who |
|---|---|---|---|
| Skip link and screen-reader text | ✅ | Found in the code. | — |
| Full audit | ❌ | Run axe-core on the 15 main pages in light and dark mode, on desktop and phone: contrast, keyboard use, visible focus, form labels, chart text alternatives, 24 px tap targets. Fix everything it finds. It also helps SEO. | Claude |

## 7. Analytics (privacy-safe)

| Item | Status | Detail | Who |
|---|---|---|---|
| Search Console and Bing Webmaster | ❌ | In the Search Growth plan (Phase 0). | You + Claude |
| Visitor analytics | ❌ | None today; the CSP blocks third-party scripts. **Recommended:** cookie-free analytics (Cloudflare Web Analytics, or self-hosted Umami), so no consent banner is needed under DPDP. Google Analytics 4 would need a consent banner. | You choose, Claude adds |
| Product events | ❌ | Track searches, report opens, Prism runs and Gold sign-ups, with no personal data, to learn what users actually use. | Claude |

## 8. Trust and brand

| Item | Status | Detail | Who |
|---|---|---|---|
| About, Contact, Status pages | ✅ | All live (200). | — |
| Real people | ❌ | Founder and team bios with real credentials, plus a methodology page ("how scores are calculated, where data comes from, when it updates"). Google ranks finance pages on this (YMYL / E-E-A-T). | You give bios, Claude builds |
| favicon.ico | ❌ | `/favicon.ico` returns 404 (some browsers and Google look for it). It's tiny. | Claude |
| Social profiles | ❌ check | The same name and logo on X, LinkedIn, YouTube and Instagram, linked from the site and its Organization data. | You |
| "Report a data error" button | ❌ | On every company page. It builds trust and catches mistakes early. | Claude |

## 9. Data accuracy

| Item | Status | Detail | Who |
|---|---|---|---|
| Daily cross-check | ⚠️ | Automatically compare 20 random companies each day (price, market cap, latest quarter) against a second source and alert on any mismatch. | Claude |
| "Last updated" on every number block | ⚠️ | Shown in places; make it consistent everywhere. | Claude |
| Corporate actions | ⚠️ check | Test splits and bonuses (price history and per-share numbers adjust correctly). | Claude |

## 10. Payments (when Gold launches)

| Item | Status | Detail | Who |
|---|---|---|---|
| Gateway activation needs | ❌ | Legal name, PAN, GST, refund policy, physical address, contact page: sections 1 and 8. | You + Claude |
| Checkout flow | ❌ | Hosted checkout, a GST invoice by email, renewal reminder 7 days before, failed-payment email, a cancel button in the Account page, full test-mode run before going live. | Claude |
| House rule | ⚠️ | `CLAUDE.md` says "Everything stays free". When you decide on Gold, tell me and I'll update that rule so future work follows the new plan. | You decide |

## 11. Support

| Item | Status | Detail | Who |
|---|---|---|---|
| Support channel | ⚠️ | One support email (and optionally WhatsApp Business), with a stated reply time. | You |
| Help and FAQ page | ❌ | The top 20 questions (what the scores mean, data timings, account, Gold). | Claude drafts |
| Feedback button | ❌ | A small in-app "Send feedback" that emails you. | Claude |

## 12. Costs and accounts

| Item | Status | Detail | Who |
|---|---|---|---|
| AWS budget alert | ❌ check | AWS → Billing → Budgets → monthly budget about ₹7,000 with an alert at 80%. | You (2 min) |
| Account security | ❌ check | 2-step login on AWS root, GitHub, Cloudflare, the registrar, Resend and the data providers. One lost password must not lose the company. | You |
| Who owns what | ❌ | A private list (not in the repo) of every service, its login owner and renewal date. | You |

## 13. Launch day and after

**Day before:** stop non-urgent changes, take a fresh backup plus a disk snapshot, run the load test, check that every alert reaches your phone.

**Launch day:** submit the sitemaps (Search Growth plan), post the announcements, keep the admin console Jobs tab and the uptime monitor open, and know the rollback (revert the merge on `main`; the server redeploys in about 5 minutes).

**First 48 hours:** watch errors, speed and sign-ups every few hours and fix anything the same day.

**Every week:** speed (Web Vitals), Search Console, uptime, errors, costs, job report.

**Every month:** restore test, dependency updates, review the legal pages.

**Every quarter:** security review, and a pen test once Gold is live.

---

## PowerShell checks you can run on your PC any time

Email and DNS records:

```powershell
Resolve-DnsName finlitventures.com -Type TXT | Select-Object -ExpandProperty Strings
Resolve-DnsName _dmarc.finlitventures.com -Type TXT | Select-Object -ExpandProperty Strings
Resolve-DnsName resend._domainkey.finlitventures.com -Type TXT | Select-Object -ExpandProperty Strings
```

Security headers on the live site:

```powershell
(Invoke-WebRequest https://finlitventures.com/ -Method Head).Headers.GetEnumerator() | Where-Object { $_.Key -match 'strict|content-security|x-frame|referrer|permissions' } | Format-Table -AutoSize
```

Response time from your PC in India (run it 3 times and compare with after the Mumbai move):

```powershell
1..3 | ForEach-Object { (Measure-Command { Invoke-WebRequest https://finlitventures.com/api/health -UseBasicParsing | Out-Null }).TotalMilliseconds }
```

Legal pages present:

```powershell
'legal/privacy','legal/terms','legal/disclosures','refund','grievance','contact','about' | ForEach-Object { try { $r = Invoke-WebRequest "https://finlitventures.com/$_" -UseBasicParsing; "$_ : $($r.StatusCode)" } catch { "$_ : $($_.Exception.Response.StatusCode.value__)" } }
```

---

## Sources

- DPDP Rules timeline: [Wikipedia: DPDP Rules 2025](https://en.wikipedia.org/wiki/Digital_Personal_Data_Protection_Rules,_2025), [Legismith timeline](https://legismith.com/dpdp-rules-2025-timeline/), [TCSA roadmap](https://www.tcsa.in/resources/dpdp-rules-2025-implementation-roadmap), [Lowerplane](https://lowerplane.com/blog/dpdp-rules-timeline-2026-2027/), [Consently](https://www.consently.in/blog/dpdp-rules-2025-implementation-timeline-india)
- CERT-In 6 hours and 180-day logs: [The Hacker News](https://thehackernews.com/2022/04/indian-govt-orders-organisations-to.html), [Dark Reading](https://www.darkreading.com/cyberattacks-data-breaches/new-regulations-give-indian-orgs-6-hours-to-report-cyber-incidents), [ManageEngine](https://www.manageengine.com/log-management/cyber-security/cert-in-compliance-for-indian-enterprises.html)
- IT Rules 2026 amendment and grievance officer: [S.S. Rana](https://ssrana.in/articles/government-notifies-information-technology-amendment-rules-2026/), [Chambers](https://chambers.com/articles/government-notifies-information-technology-amendment-rules-2026), [Mondaq](https://www.mondaq.com/india/media-entertainment-law/1778894/tightening-the-safe-harbour-legal-implications-of-the-2026-amendments-to-indias-intermediary-guidelines)
- SEBI RA and finfluencer rules: [AlgoTest](https://algotest.in/blog/research-analysts-demystified-what-your-finfluencer-needs-to-do-now-sebi/), [TaxGuru](https://taxguru.in/sebi/death-get-rich-quick-stock-tips-sebi-s-regulations-finfluencers.html), [Univest](https://univest.in/blogs/sebi-finfluencer-rules-explained), [AlphaQuark](https://alphaquark.in/blog/social-media-guidelines-sebi-registered-advisors)
- Payment gateway website rules: [Razorpay compliance](https://razorpay.com/blog/payment-gateway-compliance/), [Razorpay website details](https://razorpay.com/docs/payments/dashboard/account-settings/business-website-details?preferred-country=SG), [Cashfree onboarding FAQ](https://www.cashfree.com/docs/help/onboarding-related/onboarding-faqs)
- Email sender rules: [EasyDMARC](https://easydmarc.com/blog/google-yahoo-microsoft-icloud/), [Bird](https://bird.com/docs/knowledge-base/deliverability/gmail-yahoo-requirements), [Red Sift](https://redsift.com/guides/bulk-email-sender-requirements)
- General launch checklists: [DEV: Web app launch checklist 2026](https://dev.to/david_friedman_c2808375c1/web-app-launch-checklist-2026-47-things-to-check-before-going-live-1j7c), [HostAdvice](https://hostadvice.com/blog/creating-a-website/website-launch-checklist/), [Wbcom legal checklist](https://wbcomdesigns.com/new-website-legal-checklist/)

The sources above are mostly law-firm and vendor summaries. Check the final legal wording against the official texts (MeitY, CERT-In, sebi.gov.in) with your lawyer.
