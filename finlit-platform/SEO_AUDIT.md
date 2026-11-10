# FinLit SEO audit (baseline, 10 November 2026)

Scope: the website in `frontend/` (React 19 + TypeScript + Vite single-page app, 84 routes) served by the FastAPI app in `backend/finlit/web.py` behind Caddy on one AWS server. Checked against the live site and the code on `main`. Nothing here has been changed yet: this file is the "before" state. The plan is in `docs/SEO-SECURITY-PLAN.md`.

Marks: ✅ OK · ⚠️ Weak · ❌ Missing

## Measured today (live site)

| Check | Result |
|---|---|
| Lighthouse mobile, home page | Performance **57**, Accessibility 100, Best Practices 100, SEO 100 |
| Core Web Vitals (lab) | LCP **4.2 s** (target under 2.5), Total Blocking Time **1,070 ms**, CLS 0.039 (good) |
| `finlitventures.com`, `www.`, `app.` | all three answer 200 with the same page: three copies of the site |
| A page that does not exist | answers **200** with the app shell (a "soft 404") |
| `/robots.txt`, `/sitemap.xml` | present; the sitemap lists 21 pages by hand |
| `/llms.txt` | 404 |
| API docs, `.env`, source maps | not exposed (404) |

Lighthouse's SEO score of 100 only checks basics (a title, a description, crawlable links). It does not see the problems below.

## Section 1: rendering and indexability
- ❌ Every page is client-side rendered. The HTML Google first receives is an empty `<div id="root">` with one fixed title and description. Page content, per-page titles and descriptions exist only after JavaScript runs (`lib/title.ts` sets them in the browser).
- ❌ Soft 404: unknown addresses return 200.
- ✅ No leftover `noindex` or `Disallow: /`.
- ⚠️ Private pages (`/account`, `/dashboard`, `/console`...) are kept out by robots.txt only; they have no `noindex`.
- ✅ Navigation uses real links (`<Link>`, `<a href>`).

## Section 2: URLs and canonicals
- ✅ URLs are short, lowercase and hyphenated (`/sip-calculator`, `/fii-dii`, `/stocks/RELIANCE`).
- ❌ No `<link rel="canonical">` on any page.
- ❌ Three hostnames serve the same content with no redirect to one.
- ⚠️ `/pricing` and `/plans`, `/portfolio` and `/holdings` are the same pages under two addresses.
- ✅ No trailing slashes anywhere.

## Section 3: titles, descriptions, head tags
- ⚠️ 83 pages set a title and many a description, but only in the browser. The server sends the home page's title for every address.
- ✅ `lang="en"`, charset, viewport, theme-color.
- ❌ No robots meta (`max-image-preview:large`, `max-snippet:-1`).
- ⚠️ Title pattern is "Page · FinLit"; many are under 30 characters and carry no keyword ("Glossary · FinLit").

## Section 4: keywords and on-page content
- ❌ No keyword map (a proposed one is below).
- ⚠️ Headings: pages have one H1 through `PageHeader`; not yet checked page by page.
- ⚠️ Company pages (about 5,800), fund pages and the 443 glossary terms are the biggest search opportunity and none has its own indexable HTML. Glossary terms share one address (`/glossary#id`).
- ✅ FAQs exist on many pages (`PageFaqs`), semantic elements are used.

## Section 5: AI search
- ❌ No `/llms.txt`.
- ✅ robots.txt lets AI search crawlers read public pages and keeps them out of `/api/` and `/prism` (a deliberate choice to protect the model; kept).
- ⚠️ No visible "last updated" or author/organisation line on content pages.

## Section 6: structured data
- ❌ No JSON-LD anywhere (no Organization, WebSite, BreadcrumbList, FAQPage, Article).

## Section 7: social sharing
- ⚠️ Open Graph tags exist once, for the home page only. No `og:url`, `og:locale`, `twitter:title/description/image`. Every shared link shows the home page card.
- ✅ A 1200×630 branded image exists.

## Section 8: crawl files
- ⚠️ robots.txt is good but lists `Disallow: /login` style rules only; fine.
- ⚠️ sitemap.xml is hand-written (21 URLs, no `lastmod`), and misses every company, fund, ETF, sector, blog and glossary page.
- ⚠️ Icons: SVG favicon, apple-touch-icon and manifest exist; no `favicon.ico` or 32×32 PNG.

## Section 9: performance
- ❌ Mobile performance 57. LCP 4.2 s and 1,070 ms of blocked main thread: the JavaScript needed before anything shows is too large, and a splash animation delays the first real content.
- ✅ Hashed assets cached for a year, compression on, fonts self-hosted, CLS good.

## Section 10: mobile and accessibility
- ✅ Lighthouse accessibility 100 on the home page; mobile layout was reworked earlier (docs/MOBILE.md). Other pages still to be measured.

## Section 11: internal linking
- ⚠️ Company and fund pages are reached through search boxes and screeners, which crawlers cannot use. There is no browsable directory (by letter or sector), so most of the 5,800 pages are more than 3 clicks from the home page or unreachable for a crawler.
- ✅ Header and footer link to the main sections; a custom not-found page exists.

## Section 12: trust pages
- ✅ About, Contact, Terms, Privacy, Research disclosures, FAQ exist.
- ⚠️ This is a finance site (Google treats it as "Your Money or Your Life"): who runs it, registration details and how scores are made need to be easy to find. To be filled with real facts only.
- ✅ HTTPS, HSTS, security headers.

## Section 13: analytics and Search Console
- ❌ No analytics, no Search Console or Bing verification tags, no conversion events.
- Note: the site's content security policy blocks all third-party scripts, so Google Analytics needs a deliberate, limited exception.

## Proposed keyword map (to be confirmed by the owner)

One primary term per page. These are proposals from what each page does; search volumes have not been checked.

| Page | Primary keyword | Related terms |
|---|---|---|
| `/` | Indian stock analysis platform | stock research India, stock score, FinLit |
| `/screener` | stock screener India | NSE stock screener, screen stocks by ratio |
| `/score-screener` | stock score screener | financial health score stocks |
| `/stocks/<SYMBOL>` | `<Company> share analysis` | `<Company>` financials, ratios, peers |
| `/compare` | compare stocks India | stock comparison tool |
| `/funds` | mutual fund screener India | compare mutual funds, fund returns |
| `/fund-score-screener` | mutual fund health score | best-scored is NOT used (wording rule) |
| `/etfs` | ETF list India | ETF vs index fund |
| `/sip-calculator` | SIP calculator | SIP returns, step-up SIP |
| `/eps-calculator` | EPS calculator | earnings per share calculator |
| `/dcf` | DCF calculator India | intrinsic value calculator |
| `/fii-dii` | FII DII data | FII DII activity today |
| `/macro` | India macro indicators | CPI, GDP, repo rate data |
| `/sectors` | sector performance India | sector rotation |
| `/ipo` | IPO calendar India | upcoming IPOs |
| `/results` | quarterly results calendar | company results today |
| `/glossary` and term pages | `<term> meaning` | formula, example |
| `/plans` | FinLit pricing | plans |
| `/about` | about FinLit Ventures | team, mission |
| `/browser-extension` | stock analysis Chrome extension | financial glossary extension |

## Information needed from the owner (not invented)
Canonical hostname, what `app.finlitventures.com` is for, contact email/phone/address, social profile links, company registration details (and any SEBI registration), confirmed keywords, and whether Google Analytics may be used.


## After this change (implemented, 10 November 2026)

| Item | Before | After |
|---|---|---|
| Per-address title, description, canonical, Open Graph in the first HTML | ❌ one for the whole site | ✅ 38 public pages, every company, every glossary term |
| JSON-LD | ❌ none | ✅ Organization, WebSite, BreadcrumbList, DefinedTerm, WebPage |
| Unknown address | ❌ 200 | ✅ true 404, noindex |
| Private pages | ⚠️ robots.txt only | ✅ noindex meta and X-Robots-Tag |
| Sitemap | ⚠️ 21 hand-written URLs | ✅ about 6,300 addresses from the database, with dates |
| Glossary | ⚠️ one address, anchors | ✅ 443 term addresses |
| llms.txt | ❌ | ✅ |
| Real content in the first HTML | ❌ empty | ✅ heading and summary per address (companies show no plan-gated data) |
| Hostname duplicates | ❌ | ⚠️ canonical points to one; redirect waits for the owner (see plan) |
| Speed, directory, analytics, long-form content | ❌ | next steps in `docs/SEO-SECURITY-PLAN.md` |

Lighthouse after the deploy has to be re-run on the live site; the speed work is a later step, so the 57 is expected to stay until then.
