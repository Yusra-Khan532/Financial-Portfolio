# FinLit search growth plan: SEO, AEO and GEO

*Evaluation and plan, 27 November 2026. Site: https://finlitventures.com (code: `Yusra-Khan532/Financial-Portfolio`, folder `finlit-platform/`).*

**Goal (founder, 27 Nov 2026):** FinLit pages rank at the top, and get quoted by AI answers, for:
- company names (for example "TCS share price", "Tata Consultancy Services financials", "TCS results", "TCS shareholding");
- tools ("DCF calculator", "SIP calculator", "PE ratio calculator" and others);
- finance concepts ("what is ROCE", "how to read a balance sheet");
- the many related sub-questions that AI search spreads one question into.

---

## Part 1. The three things this plan is about, in plain words

| Term | What it means | What wins it |
|---|---|---|
| **SEO**: Search Engine Optimisation | Ranking in Google's normal blue links | Pages Google can read without JavaScript, real and useful content, fast pages, good internal links, trust signals, links from other sites |
| **AEO**: Answer Engine Optimisation | Being the source an answer box, Google AI Overview or AI Mode quotes | Short, direct, self-contained answers under clear question headings; dated, sourced numbers; already ranking well (Google says AI Overviews draw on its normal index, with no special markup) |
| **GEO**: Generative Engine Optimisation | Being cited by ChatGPT, Claude, Perplexity, Gemini and Copilot | Content visible **without JavaScript** (AI crawlers don't run it); a consistent brand and entity across the web; being mentioned on sites AI trusts (Reddit, YouTube, news, Wikipedia-type sources); fresh pages |

**The "router" idea you heard about** is called **query fan-out**. Google AI Mode, ChatGPT and others split one question ("is TCS financially healthy?") into many hidden sub-searches ("TCS debt to equity", "TCS ROCE trend", "TCS free cash flow 2026", "IT sector margins"…). They then build an answer from the pages that answer those sub-questions best. A site that covers a whole topic deeply, with pages that link to each other, gets pulled into answers for questions it never targeted directly. In one large study, pages that also matched a fan-out sub-query were 161% more likely to be cited. FinLit is well placed for this: it already has 5,801 companies, 1,719 funds, 1,261 glossary terms, sectors, macro data and tools. They just aren't visible enough to crawlers yet.

---

## Part 2. Where FinLit stands today (measured 27 Nov 2026)

### What is already good
- Each page gets its own server-built **title, description, canonical link and H1**. Company pages have breadcrumb and Corporation (with ticker) structured data, funds have InvestmentFund, and glossary terms have DefinedTerm (`backend/finlit/seo.py`).
- **Sitemap with 8,848 pages**: 5,801 companies, 1,719 funds, 1,261 glossary terms, plus tools and sections.
- **`robots.txt` is sensible:** AI crawlers may read the public pages and are kept only out of `/api/` and `/prism`. `llms.txt` exists.
- Missing pages return a **real 404**; `www` and `http` **redirect** to `https://finlitventures.com`.
- **HTTP/2 and compression** are on, URLs are clean, and the disclaimer is on every page.
- **Unusual assets to build on:** an MCP server for AI assistants (`/mcp`), a browser extension, the methodology pages, and own scores (FinLit IQ, Prism, Mutual Fund Score).

### What holds FinLit back (most important first)

| # | Problem | Evidence | Why it hurts |
|---|---|---|---|
| **1** | **Company pages are almost empty for crawlers.** | The HTML for `/stocks/TCS` has **one sentence about TCS** (its name and sector). The other ~5,300 characters are the **same site-wide link list on all 5,801 pages**. No price, market cap, P/E, revenue, profit, results, peers or plain-English reading. All of that only appears after JavaScript. | **AI crawlers don't run JavaScript**, so ChatGPT, Claude and Perplexity see 5,801 near-identical empty pages. Google renders later, on a budget, and near-duplicate pages tend to end up as "Crawled – currently not indexed". **This alone decides whether FinLit can rank for company names.** |
| **2** | **No measurement at all.** | No Google Search Console, no Bing Webmaster Tools, no analytics (the security policy blocks outside scripts; the decision has been with the owner since 10 Nov). | You can't see which pages are indexed or refused, which searches show FinLit, or what visitors do. Every other step is blind. |
| **3** | **Calculators are thin.** | `/dcf` has 3 short sentences in its HTML: no explanation, formula, worked example or FAQ, and no WebApplication structured data. The URL is `/dcf`, not `/dcf-calculator`. | "DCF calculator" is fought over by sites with long, expert pages. A tool that is just a form doesn't rank. |
| **4** | **Sitemap dates are not real.** | 5,792 of 5,801 company pages say "last modified: today". | Google learns to ignore the dates, so pages with genuinely new results aren't re-crawled first. |
| **5** | **Few trust signals for finance content.** | No named authors or reviewers, no editorial or corrections policy, no company identity block (registration, address, people). Already flagged on 10 Nov as "needed from the owner". | Finance is a "Your Money or Your Life" topic. Google's 2026 core updates reportedly hit anonymous finance content hardest. |
| **6** | **Speed.** | Home page, simulated mid-range phone: main content after **3.7 s** (Google's "good" is under 2.5 s). The TCS page makes **139 requests**. The server is in **Sydney** while users are in India (about 120–180 ms per round trip; Mumbai would be about 10–30 ms). | Speed is a ranking tie-breaker and a big factor in whether visitors stay. |
| **7** | **Internal links in crawler HTML are generic.** | Company HTML doesn't link to its peers, its sector, or the glossary terms it uses. | Internal links are how Google and AI find related pages and understand topics. They're the "router" for fan-out. |
| **8** | **`app.finlitventures.com` serves full copies.** | It returns 200, with a canonical link pointing to the main site. | Minor, but a 301 redirect is cleaner and saves crawl budget. |
| **9** | **No IndexNow.** | No key file. | Bing (behind Copilot and possibly other AI tools) only learns of new results pages slowly. |

---

## Part 3. The competition

- **Company-name searches** ("TCS share price"): pages from Tickertape, Trendlyne, INDmoney, Investing.com, Kotak Neo, Geojit and MarketScreener appear for TCS today. Moneycontrol, Screener, Groww and Economic Times are the usual giants. Most share one template: price, day and 52-week range, key ratios, then an FAQ.
- **"DCF calculator"**: Finology Ticker (built-in DCF), Trendlyne (DCF and dividend discount intrinsic values), Freefincal (free standalone), Safal Niveshak (classic explainer and calculator), plus global sites.
- **Where FinLit can win:** most competitors are **brokers selling trading**, or ad-heavy news. FinLit's edge is **explained, sourced, plain-English financial health with its working shown**, plus original scores. That's exactly what AI answers prefer to quote ("TCS has had almost no debt for five years; its ROCE was 64% in FY26…"). The price itself is a commodity. **Win the "why" and "how healthy" questions, not the live-price race.**

---

## Part 4. Strategy: 12 workstreams

### A. Make every page readable without JavaScript (the foundation)
1. **Company pages:** `render_company` must put the company's **real facts** into the HTML that every visitor and crawler receives:
   - latest price and date, market cap, P/E, P/B, ROE, ROCE, debt to equity, dividend yield;
   - the latest quarter's revenue and profit, against last year;
   - 5-year revenue and profit growth as sentences;
   - the FinLit IQ with its plain-English reading;
   - the shareholding mix;
   - the top 5 peers as links;
   - the sector as a link;
   - links to the glossary terms used.
   Write it as short, answer-first sentences with an **"as of" date and source** (NSE/BSE filings). It must say exactly what the app shows: **the same content for people and bots** (anything else is "cloaking", which Google penalises).
2. Do the same for **sector, fund and ETF pages, the screener's ready lists, results, IPO and macro pages**: each gets its own real content and facts.
3. Keep the site-wide link block, but **put page-specific content first** and make the shared block shorter, so pages are mostly unique.
4. **Test:** fetch each page type as Googlebot and as GPTBot with `curl`, and confirm the facts are in the raw HTML. Use Search Console's URL Inspection to see the rendered page.

### B. Win company-name searches (5,801 pages)
1. **Title and description patterns** that match how Indians search:
   - title: "TCS Share Price, Financials, Results & Analysis 2026 | FinLit";
   - description: one with real numbers, e.g. "TCS: market cap ₹X lakh crore, P/E Y, debt-free, ROCE Z%. Results, peers and a plain-English health check."
   Check them against Search Console data once it exists.
2. **An answer-first block at the top:** 2–3 sentences answering "How healthy is TCS financially?" from the data.
3. **A "Questions people ask about TCS" section** with numeric answers built from data. For example: "Is TCS debt free?", "What is TCS's dividend yield?", "Who owns TCS?" (promoters X%, FII Y%), "When are TCS's next results?". FAQ rich results ended in May 2026, but these blocks are exactly what AI answers quote.
4. **Name variants:** include the full legal name, the short name, NSE and BSE codes, and common spellings ("Tata Consultancy", "TCS Ltd"). In structured data, use `Corporation` with `tickerSymbol`, `legalName`, `alternateName`, `sameAs` (NSE/BSE company pages, the company's website, Wikipedia/Wikidata where they exist), `industry` and `numberOfEmployees` where known.
5. **Sub-pages only where the content is substantial and unique:** for example `/stocks/TCS/results` (quarter-by-quarter history), `/stocks/TCS/shareholding` (trend), `/stocks/TCS/dividends`. Never create thin pages just for keywords; Google's 2026 updates hit "scaled content".
6. **Freshness:** the sitemap's `lastmod` should be the date the company's data last changed. Ping IndexNow when results arrive. Show a visible "Updated on" date.
7. **Internal links:** peers ↔ peers, company ↔ sector, company ↔ glossary terms, company ↔ results calendar, company ↔ superinvestors who hold it.

### C. Win tool searches ("DCF calculator" and others)
1. **A tools hub** with one strong page per tool, each with:
   - the working calculator;
   - "what it is" in 2 sentences;
   - the formula;
   - a **worked example using a real listed company's numbers** (from FinLit's data);
   - how to read the result and its limits;
   - common mistakes;
   - an FAQ;
   - `WebApplication` structured data (applicationCategory FinanceApplication, free).
2. **URLs:** move `/dcf` → `/dcf-calculator` with a 301 redirect (keep the old URL working), and the same pattern for the others.
3. **New tools that people search for:** reverse DCF (a glossary entry exists), CAGR, XIRR, lumpsum, SWP, step-up SIP (exists inside SIP), PE ratio, PEG, Graham number, WACC, dividend yield, ROE/ROCE, EMI/loan, FD vs SIP, inflation, retirement or FIRE corpus, goal SIP, and tax on capital gains (dated to the current tax year, reviewed carefully).
4. **"Open this company in the DCF calculator":** each company page links to the DCF tool prefilled with its own numbers, and the **user keeps every assumption**. This is a SEBI-sensitive area. Show it as "your scenario"; never label an output "fair value", "target" or "undervalued"; get the lawyer's view first.
5. Make each tool **fast and usable without signing in**.

### D. Learning content and the glossary: topical authority and answers
1. The **1,261 glossary terms** are a strong base. Add to each: a real company example with live numbers ("TCS's ROCE was 64% in FY26"), a "good or bad range by sector" where that's honest, related terms, and a link to the screener filtered by that ratio.
2. **Learning paths** (pillar pages, each linking to 10–30 term and company pages): "How to analyse a stock", "How to read an annual report", "Understanding mutual funds", "Valuation basics". These guides are the natural targets for fan-out sub-queries.
3. **Formats AI likes to quote:** a question as the heading, a 40–60 word direct answer, then detail; comparison tables; numbered steps; a date and source on every number.

### E. Original data that earns links and AI citations
- Monthly or quarterly **data stories** from FinLit's own database. For example: "How many NIFTY 500 companies are debt-free (Nov 2026)", "Results season tracker: who beat last year", "Sector margins table", "FII/DII flows monthly". Each is a page with a chart, a table, the method and the date.
- These are what journalists, bloggers and Reddit link to, and what AI answers cite. Publish them under `/research/…` with `Article` structured data and a named author.

### F. Trust (E-E-A-T) for finance
- **About and Team pages** with real people, their roles and finance credentials, plus **Editorial policy**, **How we calculate** (methodology exists; link it everywhere), **Data sources**, **Corrections policy**, and **Contact** with the company's details (registered name, CIN, address).
- **The SEBI position stated plainly:** FinLit describes and doesn't advise; registration numbers if any.
- **Author and reviewer lines** on research and learning pages ("Written by…, reviewed by… (CFA/CA)").
- `Organization` structured data with `sameAs` links to LinkedIn, X, YouTube and Crunchbase, which keeps the brand consistent across the web.

### G. Answer engines and AI assistants (AEO and GEO specifics)
1. Everything in A, B and D (readable HTML, direct answers, dates, sources).
2. **Keep AI search bots allowed:** OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot/Claude-User and Google-Extended (Gemini) on public pages. The current robots.txt does this; keep it.
3. **`llms.txt` / `llms-full.txt`:** keep them, but note Google says it doesn't use them and AI crawlers rarely fetch them. Low priority.
4. **The MCP server** (`/mcp`) is a real differentiator. List it in MCP directories and document it, so AI assistants can pull FinLit data directly.
5. **Be mentioned where AI looks:** genuine, useful participation on Reddit (r/IndiaInvestments, r/IndianStockMarket), Quora, YouTube (short explainers using FinLit charts), and finance newsletters. Never spam; always disclose that it's FinLit.
6. **Track AI visibility:** a fixed list of 50 test questions, checked monthly in ChatGPT, Perplexity, Gemini and Google AI Mode; plus Bing Webmaster Tools' **AI Performance** report (citations in Copilot and partner AI tools); plus Search Console.

### H. Links from other sites (off-page)
- Data stories (E) pitched to finance journalists and newsletters.
- **Free embeddable widgets** (a company health card, the SIP calculator) with an attribution link.
- Listings: product directories, startup databases, the Chrome Web Store page for the extension, and MCP directories.
- University and finance-education partnerships (the glossary as a free resource).
- Guest explainers on reputable finance blogs.

### I. Measurement (needed before most of the rest)
- **Google Search Console** (domain property): submit the sitemap, watch "Pages" (indexed and not indexed, and why), "Performance" (queries and clicks) and Core Web Vitals.
- **Bing Webmaster Tools** (import from Search Console): the AI Performance report and IndexNow.
- **Analytics:** choose either GA4, allowed narrowly in the security policy (consent and privacy notice needed), or a privacy-friendly counter served from FinLit's own server (no outside script). Track sign-ups and tool use as conversions.
- **Rank tracking** for about 200 target keywords (company names for the NIFTY 100 first, the tools, the top concepts).
- **KPIs:** pages indexed; impressions and clicks; top-10 keywords; AI citations from the 50-question panel; Core Web Vitals pass rate; sign-ups from search.

### J. Speed
- **Home page:** main content in under 2.5 s on mobile. Preload the main image or font, defer non-critical scripts, and split the 216 KB main bundle further.
- **Company page:** cut the 139 requests (combine the first-view data into one call, and load lower sections only when scrolled to).
- **Server region:** moving from Sydney to **Mumbai (AWS ap-south-1)** would cut about 0.5–1 s from every page for Indian users. It's a planned migration and the founder's decision.
- Check the AWS **CPU credit balance**, so the server isn't throttled.

### K. Technical hygiene
- 301 `app.` → the main domain (or `noindex` it if the app needs that hostname).
- Real `lastmod` dates; IndexNow; image sitemaps for charts; Open Graph images per company (a "health card" image that shares well on WhatsApp and X).
- Hindi and other Indian languages later: a big opportunity, but only with properly translated, reviewed pages and `hreflang`, never machine-translated thin copies.

### L. Compliance gate (applies to every item)
- **Describe, never advise:** no buy, sell, hold, target, "undervalued", "best stock" or "multibagger".
- No live-price "tips"; any per-company DCF is the user's scenario; disclaimers on every page.
- No fake reviews or ratings in structured data; no copying others' content; no AI-mass-produced thin pages.
- SEBI's finfluencer rules (2024–2026) and its partnership with Google to track unregistered advice raise the stakes. **Every new content template gets a compliance read before launch**, and a lawyer reviews valuation and score wording.

---

## Part 5. Order of work

| Phase | When | What | Who |
|---|---|---|---|
| **0. Switch on measurement** | This week | Search Console + Bing Webmaster verified, sitemap submitted, IndexNow key; the analytics choice | **Founder** (DNS record or codes) + Claude (env settings, IndexNow) |
| **1. Make content visible** | Weeks 1–3 | A1–A4 for company pages (facts, answer block, FAQ, internal links); real `lastmod`; 301 `app.`; compact shared block | Claude |
| **2. Tools that can rank** | Weeks 2–5 | C1–C3, starting with the DCF, SIP, CAGR, XIRR and PE pages; `/dcf-calculator` with a 301 | Claude, with a compliance read |
| **3. Trust** | Weeks 2–4 | F: About, Team, Editorial, Corrections, Contact and company details | **Founder** supplies the facts and people; Claude builds |
| **4. Speed** | Weeks 3–6 | J: home page LCP, company page requests; Mumbai migration plan | Claude; the region move is the founder's decision |
| **5. Topical authority** | Month 2–3 | D: glossary examples, learning paths; B5 sub-pages where substantial | Claude + a reviewer |
| **6. Data stories and links** | Month 2 onwards | E + H, monthly | Founder/team for outreach; Claude for the pages |
| **7. AI presence** | Ongoing | G4–G6, the monthly AI-citation panel | Team + Claude |

**Realistic timing:** indexing improvements show in Search Console within 2–6 weeks of Phase 1. Ranking for big company-name terms against established brokers typically takes **3–9 months** of steady work. Long-tail questions ("is X debt free", "X ROCE 2026") and tools can move sooner.

---

## Part 6. Needed from the founder
1. **Search Console + Bing Webmaster:** add the domain property and the DNS record (Claude can give exact steps), or share the verification codes.
2. **The analytics choice:** GA4 (allowed narrowly, with consent) or a privacy-friendly server-side counter.
3. **Company identity for the trust pages:** the registered company name and CIN, address, contact email, the founders and team with roles and credentials, social profile links, and any SEBI registration.
4. **A lawyer's read** of the valuation-tool wording (the per-company DCF) and the score wording.
5. **The `app.` hostname:** is it still used, so that it can redirect to the main domain?
6. **Region:** whether to plan the move from Sydney to Mumbai.
7. **People for outreach:** who posts on Reddit, YouTube and LinkedIn, and who pitches data stories.

---

### Sources (research, 27 Nov 2026; most are industry sources, Google's own statements noted where given)
- AI Overviews and AI Mode: [LLM Pulse](https://llmpulse.ai/blog/how-to-rank-in-google-ai-overviews/), [The HOTH](https://www.thehoth.com/blog/how-to-get-cited-in-ai-overviews/), [Lyra](https://www.trylyra.ai/blog/ai-overviews-seo/), [Rankbits](https://rankbits.com/blog/how-to-get-cited-in-google-ai-overviews)
- Query fan-out: [Search Engine Journal](https://beta.searchenginejournal.com/google-explains-query-fan-out-ai-search/569087/), [Aleyda Solis](https://www.aleydasolis.com/en/ai-search/google-query-fan-out/), [Surfer](https://surferseo.com/blog/query-fan-out), [Victorious](https://victorious.com/blog/query-fan-out/)
- GEO research: [arXiv 2607.14035](https://arxiv.org/html/2607.14035), [arXiv 2610.15033](https://arxiv.org/html/2610.15033), [arXiv 2604.25707](https://arxiv.org/abs/2604.25707)
- AI crawlers and JavaScript: [Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler), [Search Engine Land](https://searchengineland.com/javascript-links-pages-invisible-ai-search-485228), [searchVIU](https://www.searchviu.com/en/ai-crawlers-javascript-rendering/)
- 2026 core updates and YMYL: [techseo.es](https://www.techseo.es/en/blog/google-may-2026-core-update), [Lucid Media](https://www.lucidmedia.co.nz/blog/google-march-april-2026-core-updates/), [CapConvert](https://www.capconvert.com/learn/blog/google-march-2026-core-update)
- FAQ rich results ended (May 2026): [Search Engine Land](https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957), [SE Roundtable](https://www.seroundtable.com/google-drops-faq-rich-results-41298.html)
- llms.txt: [Search Engine Land](https://searchengineland.com/does-llms-txt-matter-467740), [Ahrefs](https://ahrefs.com/blog/llms-txt/), [PPC Land](https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/)
- Bing AI Performance and IndexNow: [Bing blog (Feb 2026)](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview), [Bing blog (Jun 2026)](https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare), [eSEOspace](https://eseospace.com/blog/bing-webmaster-tools-indexnow-ai-search/)
- Core Web Vitals: [Meta Digital](https://www.metadigital.co.nz/core-web-vitals-in-2026-what-they-measure-and-whats-actually-worth-fixing/), [seo-kreativ](https://www.seo-kreativ.de/en/blog/core-web-vitals-optimizing/)
- Competitors: [Tickertape TCS](https://www.tickertape.in/stocks/tata-consultancy-services-TCS), [Trendlyne TCS](https://trendlyne.com/equity/1372/TCS/tata-consultancy-services-ltd/), [Finology comparison](https://ticker.finology.in/discover/solutions/screener-vs-tickertape-vs-trendlyne), [Safal Niveshak DCF](https://www.safalniveshak.com/dcf-calculator/), [Freefincal](https://freefincal.com/stock-analysis-tools/)
- SEBI and finfluencers: [Mondaq](https://www.mondaq.com/india/financial-services/1769464/safeguarding-indias-retail-investors-in-the-age-of-finfluencers), [CFA Institute](https://blogs.cfainstitute.org/marketintegrity/2026/10/22/india-needs-stronger-finfluencer-enforcement-and-global-regulators-need-greater-cooperation/), [Business Standard](https://www.business-standard.com/finance/news/sebi-announces-norms-to-restrict-finance-influencer-s-recommendations-124062701002_1.html)
