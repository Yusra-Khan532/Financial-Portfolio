# Search growth progress (keep up to date every session)

*Every session on search growth (SEO, AEO, GEO): read `MASTER-PROMPT.md` (the founder's brief, kept word for word), `PLAN.md` (the 27 Nov 2026 evaluation and plan) and this file first. Then continue with the first unchecked item, unless the founder asks for something else. Update this file in the same pull request as the work, and never end a session without updating it.*

*Delivery note (27 Nov 2026): MASTER-PROMPT.md says the founder merges with "Create a merge commit". `finlit-platform/CLAUDE.md` (newer, and it wins) says work arrives as a pull request on this repository, squash-merged once every check passes. "Decide, do not ask" (owner, 18 Nov 2026) applies here as well.*

## Phase 0 measurement
- [ ] Search Console verified (domain) + sitemap submitted (founder: `FOUNDER-STEPS.md` step 1)
- [ ] Bing Webmaster verified + AI Performance report on (founder: step 2)
- [ ] IndexNow key + pings on changed URLs
- [ ] Analytics option chosen and live (founder: step 3; recommended Option B, FinLit's own counter)
- [ ] Baseline recorded (indexed pages, top queries, CWV, AI panel of 50 questions)
## Phase 1 crawler-visible content
- [ ] Company pages: facts, answer block, Q&A, peers/sector/glossary links, richer Corporation JSON-LD
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
## Phase 7 off-site + AI presence
## Measurements log (date: indexed / clicks / impressions / top-10 keywords / AI citations / CWV)
- 27 Nov 2026 (from PLAN.md's audit, before any change):
  - Search Console: not set up, so indexed pages, clicks and impressions are unknown.
  - Sitemap: 8,848 URLs.
  - `/stocks/TCS` crawler HTML: one sentence about the company, plus about 5,300 characters of a shared link list.
  - Speed: home LCP 3.7 s (simulated mid-range phone); the company page makes 139 requests.
  - AI citations: not measured yet.
## Waiting on the founder
- `FOUNDER-STEPS.md`:
  - step 1, Search Console (DNS TXT record in Cloudflare);
  - step 2, Bing Webmaster import;
  - step 3, analytics, Option A or B.
- Later (step 4): company identity facts, a lawyer's read of the per-company DCF wording, whether `app.` is still used, the Mumbai move, outreach people.
## Session log
- **27 Nov 2026, session 1:**
  - Kept the brief in the repository, so no session forgets it: MASTER-PROMPT.md, PLAN.md, this file, FOUNDER-STEPS.md, and a pointer at the top of `finlit-platform/CLAUDE.md`.
  - Wrote the founder's steps for Search Console, Bing and the analytics choice.
## Next step
- Phase 1, company pages: `render_company()` in `backend/finlit/seo.py` writes the company's real stored facts into the crawler HTML (same as the app shows, dated and sourced, no plan-gated scores), following `render_fund()`, with an advice-word test over every crawler template.
