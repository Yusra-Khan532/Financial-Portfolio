# SEO and security plan (10 November 2026)

Baseline measurements and the audit are in `SEO_AUDIT.md`. This file records the decisions, what is built, and what is next. Owner facts that are still missing are listed at the end; none has been invented.

## The decision that matters most: how Google sees a React app

Today every page is an empty `<div id="root">` until JavaScript runs, so a crawler's first view of a company page is the home page's title. Three ways to fix that were weighed.

| Option | What it takes | Verdict |
|---|---|---|
| Move to Next.js or Astro | Rewrite routing, data loading and 84 routes; weeks; high risk to the working product | No |
| Prerender static HTML at build time | Fine for 40 fixed pages; impossible for 5,800 company pages whose data lives in the database | Not alone |
| **Server adds the head and content per address** | The FastAPI server that already serves `index.html` writes each address's title, description, canonical, Open Graph, JSON-LD and a short real-content block into the HTML, and returns a true 404 for addresses that do not exist. React replaces the block on start, so visitors see no change | **Chosen** |

It keeps the app as it is, costs one small database read per company page (cached ten minutes), and covers every address type with one mechanism.

## Built in this change
- `backend/finlit/seo.py` and `web.py`: per-address head and content for 38 public pages, every company (`/stocks/SYMBOL`) and every glossary term (`/glossary/<term>`, new address, 443 pages); true 404 for unknown addresses; `noindex` plus `X-Robots-Tag` for private pages; JSON-LD (Organization and WebSite on home, BreadcrumbList everywhere, DefinedTerm on terms, WebPage on companies).
- Dynamic `/sitemap.xml` from the database and the glossary (about 6,300 addresses with dates), cached an hour. The hand-written one is removed.
- `llms.txt`; canonical address kept in step during in-app navigation.
- Tests: every route in `App.tsx` must be classified (so a new page cannot become an accidental soft 404), lengths and uniqueness of titles and descriptions, one-of-each-tag, valid JSON-LD, sitemap contents, server behaviour including a database failure (the plain app is served, never an error).
- Wording rules kept: only facts we hold, no plan-gated score in public HTML, no ratings or reviews, describe never advise.

## Next (in this order)
1. **One hostname.** `finlitventures.com`, `www.` and `app.` all serve the site. Canonical tags already name `finlitventures.com`. A redirect would sign out anyone signed in on `www` or `app`, so it waits for the owner to say what `app.` is for.
2. **Speed (mobile Lighthouse 57, LCP 4.2 s, 1,070 ms blocking).** Measure the bundle first; split charts and heavy pages from the entry file; shorten the splash so real content paints first; preload the one font that matters. Target LCP under 2.5 s.
3. **Browsable directory** (`/companies`, by letter and sector) so crawlers reach all 5,800 companies in three clicks, plus fund and ETF pages in the same head system.
4. **Analytics and Search Console.** The content security policy blocks every outside script on purpose. Options: GA4 with a narrow exception, or a privacy-friendly counter on the server. Needs the owner's choice. Verification meta tags are driven by two environment settings once the owner has the codes.
5. **Content.** Longer introductions and question-and-answer sections on the 20 pages in the keyword map (`SEO_AUDIT.md`), written from real product facts.

## Security: protecting the site and the scoring model

What already protects them (kept): argon2 passwords, admin MFA, CSRF and origin checks on writes, per-member ownership on every query, strict CSP, HSTS, no source maps or API docs exposed, plan rules applied on the server, the Prism reports and part weights never sent to the browser, AI crawlers disallowed from `/api/` and `/prism`.

Gaps and the plan, by size of risk:
1. **Scraping the model.** The scores are public per company, so someone can collect them company by company and learn the model by regression. Controls: per-IP and per-account request budgets on the bulk and company endpoints (the limiter exists at 300 a minute; add a daily budget per account and a lower one for anonymous visitors); return rounded parts as words (done for funds and portfolios; continue for any remaining exact parts); never expose weights, cut-offs or intermediate points; detect sequential crawling of `/api/stocks/*` and slow it; add a small number of fictitious canary companies whose scores no honest user would request, to prove copying.
2. **Account abuse.** Login throttling per account as well as per address, breached-password check on sign-up, email verification on, session rotation on plan change.
3. **Server.** Docker build moved off the production server (less attack surface and memory), unattended security updates (already on), SSH limited to the owner's address, AWS root MFA and billing alarm, off-server encrypted backups with a tested restore.
4. **Edge and response time.** Decision (owner, 10 Nov 2026): no CDN or Cloudflare step. When the AWS account is upgraded, the server moves from Sydney to Mumbai (ap-south-1), which cuts the connection delay for readers in India (the SEO checker measured 1.18 s against its 0.4 s guide, mostly distance). A WAF with bot and rate rules can be added later if traffic needs it; the in-app limits and the model-copy guard cover today's size.
5. **Dependencies and secrets.** Weekly dependency scan (the Security workflow exists), secrets only in `/opt/finlit/.env.aws`, rotate provider keys on a schedule.
6. **Trust signals Google checks for money sites (E-E-A-T).** Real company name, address, registration and any SEBI status on About and Contact; who writes and reviews; how scores are made (Research disclosures exists). These need the owner's real facts.

## Phase 4 built: model-copy guard (`backend/finlit/modelguard.py`)
Counts the DISTINCT companies each visitor opens: 300 a day for a visitor, 1,500 for a signed-in member, 30 once flagged; and at most 40 (visitor), 90 (member) or 4 (flagged) NEW companies a minute, so a fast sequential crawl is slowed with a 429 and `Retry-After`. Re-opening a company already counted today is free; prices and trading data are not counted. Trap addresses (`/api/stocks/_all`, `/api/scores`, `/api/v1/scores`, `/api/stocks/export`, `/api/prism/export`) are linked nowhere and forbidden in robots.txt: a client that asks for one is flagged for 7 days and gets the low budget. Log lines start with `model guard:`. Redis down: the guard steps aside. Already in place and verified: login throttling per account and per address (`/auth/login`), scores locked for visitors, no weights or cut-offs sent to the browser. Not done on purpose: fictitious canary companies (they would appear in search and the directory and break the "never show an invented number" rule); a owner decision is needed before any.

## Needed from the owner
Canonical hostname and the purpose of `app.finlitventures.com`; contact email, phone and address; social profile links; company registration and any SEBI registration numbers; the keywords you want to rank for (the map in `SEO_AUDIT.md` is a proposal); whether Google Analytics may be used.
