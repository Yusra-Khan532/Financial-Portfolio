# Search growth progress (keep up to date every session)

*Every session on search growth (SEO, AEO, GEO, and being named in AI answers to category questions): read `MASTER-PROMPT.md` (the founder's brief, kept word for word; updated 27 Nov 2026 with goal 5, workstream M and rule 10), `PLAN.md` (the evaluation and plan, with workstream M), `PROFILE-CHECKLIST.md` (the founder's profile texts, word for word), `PROFILE-CHECKLIST-FILLED.md` (the same, filled in and corrected, ready to paste), `AI-PANEL.md` (the monthly share-of-voice sheet), `BROWSER-PROMPTS.md` (the three prompts the founder runs in his browser assistant) and this file first. Then continue with the first unchecked item, unless the founder asks for something else. Update this file in the same pull request as the work, and never end a session without updating it.*

*Delivery note (27 Nov 2026): MASTER-PROMPT.md says the founder merges with "Create a merge commit". `finlit-platform/CLAUDE.md` (newer, and it wins) says work arrives as a pull request on this repository, squash-merged once every check passes. "Decide, do not ask" (owner, 18 Nov 2026) applies here as well.*

## Phase 0 measurement
- [x] Search Console verified (domain) + sitemap submitted. The founder's browser assistant did it on 27 Nov 2026 (`BROWSER-PROMPTS.md` prompt 1):
  - Domain property `finlitventures.com`, verified through Cloudflare ("Domain name provider"). The `google-site-verification` TXT record at `@` must be kept.
  - Owner: the founder's Google account (Nishant). Nobody else added yet.
  - `sitemap.xml` submitted, status Success, but "Discovered pages 0" and "Last read Mar 7, 2022", shown as a "Sitemap index". The live file is a normal urlset of 8,848 URLs (checked 27 Nov: 200, `application/xml`, listed in robots.txt, 200 to a Googlebot user agent).
  - The 2022 date most likely comes from an older Search Console record for this domain. Check again on 29 Nov: if it still shows 0 pages, remove that sitemap entry in Search Console and submit `sitemap.xml` again.
- [x] Bing Webmaster verified + AI Performance report on (27 Nov 2026):
  - Added by hand, not imported: the Search Console owner account could not be signed in there.
  - Owner: Pranshu's Microsoft account. Verified with a CNAME record in Cloudflare (DNS only), which must be kept.
  - Sitemap submitted, "Processing" (up to 48 h).
  - AI Performance (beta) is always on, with no switch.
- [ ] IndexNow key + pings on changed URLs
- [ ] Analytics option chosen and live (founder: step 3; recommended Option B, FinLit's own counter)
- [ ] Baseline recorded (indexed pages, top queries, CWV, AI panel of 50 questions)
## Phase 1 crawler-visible content
- [ ] Company pages: facts, answer block, Q&A, peers/sector/glossary links, richer Corporation JSON-LD. **Part 1 is in the Phase 1 pull request (27 Nov 2026)**; the item stays open until parts 2 and 3 are done.
  - **Done in part 1** (`seo.render_company` and `seo.company_facts`, and `web.company_facts`):
    - Each company's stored snapshot (summary, financials, ownership, peers and events) is trimmed with the API's own `redact_section` at the visitor's plan, so the crawler HTML never shows more than a signed-out visitor is sent.
    - The page writes the figures in this order:
      - an answer-first "How healthy is X financially?";
      - key figures with dates and glossary links;
      - the latest quarter against a year earlier;
      - five-year revenue and profit;
      - the shareholding mix and its change;
      - five questions answered with numbers;
      - 5 peer links and the Sector Pulse group link;
      - sources and the disclaimer;
      - then the shared site links.
    - Titles follow the brief's pattern, shortened step by step to fit 70 characters. Descriptions carry 2–3 real numbers.
    - Corporation JSON-LD has legalName, alternateName, the NSE ticker, the ISIN (when stored), url/sameAs (the company's website) and dateModified.
    - Tests are in `tests/test_seo_company.py`, including an advice-word scan of every crawler template.
  - **Not done yet, with the reason:**
    - The app page doesn't yet show the new answer and questions text. The figures are the same, but the wording appears only in the server HTML. **Part 2:** show the same block in the React company report, so people and crawlers read the same text.
    - "Next results date": the results calendar comes from a provider feed, not a stored table. **Part 3**, once there is a cheap stored source.
    - FinLit Prism or any score: plan-gated, so never in public HTML (not planned).
    - `industry` in Corporation JSON-LD: schema.org's Organization has no such property. The industry appears in the page text instead.
    - The ISIN is added by the API when it serves the page (`with_isin`), so it appears in the JSON-LD only when the stored summary carries it.
  - **Live check after deploy:** `curl -A GPTBot` and `curl -A Googlebot` on 10 sample companies (facts present and unique), then URL Inspection in Search Console.
- [ ] Shared link block shrunk; page content first
- [ ] Sectors, ETFs, results, IPO, macro, superinvestors, screener lists: real content
- [ ] Real lastmod + sitemap index split
- [ ] app. host 301 (after founder confirms)
## Phase 2 tools
- [ ] Tool page template (definition, formula, worked example, FAQ, WebApplication)
- [ ] /dcf-calculator (301 from /dcf) upgraded
- [ ] SIP upgraded; CAGR; XIRR; lumpsum; SWP; PE/PEG; reverse DCF; WACC; Graham; dividend yield; ROE/ROCE; EMI; retirement; goal SIP
- [ ] Per-company DCF link: legal OK from founder? ____
## Phase 3 trust
- [ ] About / Team / Editorial / Corrections / Sources / Contact + Organization sameAs (needs founder's facts)
## Phase 4 speed
- [ ] Home LCP < 2.5 s mobile   - [ ] Company page requests ≤ 30   - [ ] Mumbai plan written
## Phase 5 topical authority
- [ ] Glossary examples   - [ ] Pillar guides   - [ ] Substantial company sub-pages
## Phase 6 data stories (monthly)
## Phase 7 off-site + AI presence + category answers
- [ ] M1 Organization JSON-LD (alternateName, sameAs, founder) + About first sentence
- [ ] M2 category hub pages (screener, research reports, mutual funds, sectors, calculators)
- [ ] M3 comparison pages (founder OK + lawyer read: ____)
- [ ] M4 outreach list of 30–50 cited pages + pitch draft
- [ ] M5 profiles: status on 27 Nov 2026, from the founder's browser assistant (prompt 2):
  - LinkedIn company https://www.linkedin.com/company/finlitventures/: 10 specialties and the HQ (Jabalpur, India) added. Name, tagline, overview and website kept as they were (team decision).
  - Crunchbase https://www.crunchbase.com/organization/finlit-ventures: submitted. Logo still to upload; X, YouTube and Instagram links to add once they exist.
  - AlternativeTo: submitted, waiting for review (as "FinLit" by FinLit Ventures). None of the 7 competitors is listed there, so no "alternative to" links yet.
  - X: @FinLitVentures exists (joined Nov 2026, 0 posts); the team confirms who owns it.
  - YouTube, Instagram and the Facebook page: not created yet (founder). @finlitventures looked free on YouTube and Instagram.
  - Nishant's own LinkedIn experience and headline, Product Hunt maker account, Quora and Reddit: Nishant does them himself (texts in PROFILE-CHECKLIST-FILLED.md).
  - Handle: finlitventures on every platform.
  - Organization `sameAs` (M1) gets the LinkedIn and Crunchbase URLs now, and the others as they go live.
- Founder's named target query (27 Nov 2026, screenshot): "which is best financial research and analytics platform".
  - Google's AI Overview names Value Research, StockEdge, Crisil/ICRA, Bloomberg/FactSet, Koyfin and Fiscal.ai.
  - The cited sources are Value Research, StockEdge and Guideflow's "12 best financial research software tools for 2026" (a third-party list, so a candidate for M4).
  - FinLit is not named. Track it with panel Q1 (similar); add the founder's exact wording to the M4 outreach notes.
- [ ] M6 community guide   - [ ] M7 press pitch templates
- [ ] M8 robots.txt: Claude-SearchBot / Claude-User in AI group (checked 27 Nov: robots.txt lists ClaudeBot, Claude-Web and anthropic-ai, but not Claude-SearchBot or Claude-User)
- [ ] M9 AI-PANEL.md: 60 questions × 7 engines, monthly. Sheet ready 27 Nov 2026; the baseline run needs a person (Claude can't open those AI tools from its container)
## Measurements log (date: indexed / clicks / impressions / top-10 keywords / AI citations / CWV)
- 27 Nov 2026 (from PLAN.md's audit, before any change):
  - Search Console: not set up, so indexed pages, clicks and impressions are unknown.
  - Sitemap: 8,848 URLs.
  - `/stocks/TCS` crawler HTML: one sentence about the company, plus about 5,300 characters of a shared link list.
  - Speed: home LCP 3.7 s (simulated mid-range phone); the company page makes 139 requests.
  - AI citations: not measured yet.
- 27 Nov 2026, Bing AI Performance (last 3 months): 0 citations, 0 cited pages, no grounding queries. This is the baseline.
## Founder facts (given by the owner, 27 Nov 2026; use them, never guess)
- **Founder's full name:** Nishant Jain (the same founder the site's Organization JSON-LD already names).
- **Founded:** December 2026. Profiles may say "2026". `foundingDate` in JSON-LD only from 1 Dec 2026, so structured data never shows a date in the future.
- **City:** Jabalpur (India).
- **Email:** contact@finlitventures.com is FinLit's address for brand profiles and contact; there is no hello@ (owner, 27 Nov 2026). The site's Organization JSON-LD still gives a Gmail address as its contactPoint: change it to contact@ in M1.
- **Plans on the live site:** Free, Mutual Fund + ETF, Equity Portfolio, Gold, Platinum (no Silver). FinLit Prism is the only company score; FinLit IQ is retired (owner, 27 Nov 2026).
- **Profile texts:** `PROFILE-CHECKLIST.md` mentioned the retired FinLit IQ (task #283) and the old Silver and Gold plans (task #410 changed them). `PROFILE-CHECKLIST-FILLED.md` corrects every such line, marked "(corrected)". The extension's plan line is left out until Claude checks what the extension shows today.
## Waiting on the founder
- `FOUNDER-STEPS.md`:
  - step 1, Search Console (DNS TXT record in Cloudflare);
  - step 2, Bing Webmaster import;
  - step 3, analytics, Option A or B.
- Prompt 1 done 27 Nov 2026 (Search Console and Bing verified; see Phase 0).
- The three browser-assistant prompts in `BROWSER-PROMPTS.md` (given to the founder 27 Nov 2026), each ending with a report to paste back:
  1. Search Console + Bing (Phase 0);
  2. profiles (M5);
  3. the baseline AI panel (M9).
- Analytics: a one-line reply, Option A or B (`FOUNDER-STEPS.md` step 3).
- Later (step 4): company identity facts, a lawyer's read of the per-company DCF wording, whether `app.` is still used, the Mumbai move, outreach people.
## Session log
- **27 Nov 2026, session 1:**
  - Kept the brief in the repository, so no session forgets it: MASTER-PROMPT.md, PLAN.md, this file, FOUNDER-STEPS.md, and a pointer at the top of `finlit-platform/CLAUDE.md`.
  - Wrote the founder's steps for Search Console, Bing and the analytics choice.
- **27 Nov 2026, session 1, later:**
  - The founder sent an updated brief and plan (goal 5, workstream M "be the platform AI names for category questions", rule 10 "earn recommendations; never fake them"), saved word for word.
  - Added the profile checklist (word for word, plus a filled-in, corrected copy) and the AI-panel sheet.
  - Recorded the founder's name, founding date and city.
  - Phase 1 company pages are built and tested locally (local branch `search-growth-phase1-companies`). They ship as their own pull request once this one is merged.
- **27 Nov 2026, session 1, end:**
  - PR #1014 (the memory docs) merged.
  - Search Console and Bing verified (prompt 1).
  - Profiles partly done (prompt 2; see M5).
  - The founder named a target query (see M5).
  - The Phase 1 part 1 pull request opened.
## Next step
1. Phase 1 part 1: after it merges and deploys, run the live checks listed under Phase 1, then tick what passes.
2. IndexNow: a key file at `/{key}.txt`, plus pings when results arrive, new funds appear or research pages change (a supervisor-run job; read docs/JOBS.md first).
3. M1 identity: Organization JSON-LD gets `alternateName` "FinLit Ventures", `sameAs` (LinkedIn and Crunchbase now), `founder` Nishant Jain, `areaServed` IN, and the contactPoint contact@finlitventures.com; `foundingDate` only from 1 Dec 2026. The About page's first sentence too.
4. Phase 1 part 2: the same answer and questions block in the React company report.
5. M8: add Claude-SearchBot and Claude-User to robots.txt's AI group.
