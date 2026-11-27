# Three prompts for the founder's browser assistant (Claude in Chrome)

*Written 27 Nov 2026. Paste one prompt at a time into the Claude extension in Chrome, while signed in to your own accounts. Each prompt carries everything it needs. Do them in this order: 1 (Search Console and Bing) unlocks measurement; 2 (profiles) builds the brand; 3 (AI panel) records where FinLit starts. When each one finishes, paste its final report back to Claude Code.*

Facts used in all three, confirmed by the founder on 27 Nov 2026:
- **Email:** contact@finlitventures.com is FinLit's address (the owner corrected `hello@` on 27 Nov 2026; there is no hello@ address).
- **Founder:** Nishant Jain. **Founded:** December 2026. **City:** Jabalpur.
- **Plans on the site:** Free, Mutual Fund + ETF, Equity Portfolio, Gold, Platinum. There is no Silver plan.
- **Score:** FinLit Prism is FinLit's only company score. FinLit IQ is retired; never mention it.

---

## Prompt 1: Google Search Console and Bing Webmaster Tools

```
You are helping me set up search measurement for my website finlitventures.com (FinLit, an Indian stock and mutual fund research platform). I am signed in to my Google account, my Cloudflare account and Microsoft/Bing in this browser. Work step by step and tell me what you see after each step. Stop and ask me before deleting or editing anything that already exists.

PART A: Google Search Console (Domain property, verified by a DNS TXT record in Cloudflare)
1. Open https://search.google.com/search-console. Click "Add property" and choose the left box, "Domain". Type finlitventures.com (no https, no www) and click Continue.
2. Google shows a TXT record starting with google-site-verification=. Copy the whole value. If Google offers to verify automatically through Cloudflare, use that; otherwise continue with step 3.
3. In a new tab open https://dash.cloudflare.com, open the finlitventures.com site, then DNS > Records > Add record: Type TXT, Name @, Content = the full google-site-verification=... value, TTL Auto. Save. Do NOT change or delete any other DNS record.
4. Go back to Search Console and click Verify. If it says not found, wait 5 minutes and try again, up to 4 times.
5. When it says "Ownership verified", open the property, go to Sitemaps, type sitemap.xml in "Add a new sitemap" and click Submit. Report the status shown.
6. Go to Settings > Users and permissions and tell me which users are listed (do not add anyone unless I tell you who).

PART B: Bing Webmaster Tools
7. Open https://www.bing.com/webmasters and sign in with the same Google account. Choose "Import your sites from GSC" (Google Search Console), allow access, tick finlitventures.com and import.
8. Open the site, then Sitemaps. Check that https://finlitventures.com/sitemap.xml is listed; if it is not, submit it.
9. Find the "AI Performance" report (left menu, maybe under Search performance). If it can be switched on, switch it on. Tell me what it shows.
10. Open "IndexNow" and only report what it says. Do not create a key; my developer will add it to the site.

FINAL REPORT (write it so I can paste it to my developer):
- Search Console: verified yes/no, the date, sitemap status and number of discovered pages if shown.
- Bing: imported yes/no, sitemap status, AI Performance on yes/no.
- Any error message, word for word.
Never paste any password or login code into the report.
```

---

## Prompt 2: brand profiles (the same identity everywhere)

```
You are helping me create and update the brand profiles of my company. Use exactly the texts below; do not invent facts, numbers or claims. I am signed in to my accounts in this browser. Work one platform at a time. Before you click any button that publishes, pays or sends something, show me what will be published and wait for my "yes". If a platform asks for a phone number, a login code, ID or payment, stop and let me do it. When a platform offers 2-step login, tell me so I can switch it on.

THE IDENTITY (say it the same way everywhere):
- Name: FinLit (company name: FinLit Ventures)
- Descriptor: Indian stock and mutual fund research platform
- Website: https://finlitventures.com
- Founder: Nishant Jain. Founded: 2026 (December 2026). City: Jabalpur, India.
- Handle: try finlitventures first; if taken, finlit.india, then finlitindia. Use the same handle on every platform and tell me which one was used.
- Contact email for brand accounts: contact@finlitventures.com (FinLit's existing address; do not create any new email address).
- Profile picture: https://finlitventures.com/icon-512.png . Cover image: https://finlitventures.com/og-finlit-1200x630.png (download them first).
- Plans: Free to start, with paid plans for more (the plans are Free, Mutual Fund + ETF, Equity Portfolio, Gold and Platinum). The only company score is FinLit Prism. NEVER mention FinLit IQ or a Silver plan.
- Never use these words anywhere: best, top pick, buy, sell, hold, target, multibagger, guaranteed returns, tips.

1. LINKEDIN COMPANY PAGE (exists: https://www.linkedin.com/company/finlitventures/). Edit page:
 Name: FinLit Ventures
 Tagline: Indian stock and mutual fund research platform. Company filings explained in plain English, with the working shown.
 Website: https://finlitventures.com | Industry: Financial Services | Company type: Privately held | Founded: 2026 | Location: Jabalpur, India | Company size: ask me.
 Overview:
 FinLit (finlitventures.com) is an Indian stock and mutual fund research platform. It turns company filings, exchange data and official releases into plain-English readings of financial health, with the working shown for every number.

 What you can do on FinLit:
 • Read research reports on 5,800+ listed Indian companies: statements, ratios, growth, peers, ownership and filings on one page
 • Filter every listed company with the stock screener, and compare companies side by side
 • See FinLit Prism, a four-part financial health rating that shows how it was calculated
 • Research 1,700+ mutual funds and ETFs with the Mutual Fund Score
 • Follow Sector Pulse and Sector Rotation, the results calendar, earnings call transcripts, IPOs, FII/DII flows and macro indicators
 • Use the DCF, SIP and P/E calculators, and 1,200+ glossary terms explained with formulas and examples

 Data comes from public filings and official releases: SEBI, NSE, BSE, RBI and MoSPI. Every blank says why it is blank.

 Free to start, with paid plans for more.

 FinLit describes; it does not advise. Information only, not investment advice.
 Specialties: Stock research, Mutual fund research, Stock screener, Fundamental analysis, Company research reports, Financial statements, Indian stock market, DCF calculator, SIP calculator, Financial literacy
 Then on Nishant Jain's personal LinkedIn: add Experience "Founder, FinLit Ventures" linked to the company page, and set the headline: Founder, FinLit | Plain-English research on Indian stocks and mutual funds, from company filings | finlitventures.com

2. X (TWITTER) @finlitventures
 Name: FinLit | Indian Stock & Fund Research
 Bio: Indian stock and mutual fund research platform. 5,800+ companies and 1,700+ funds explained from filings, in plain English. Info only, not advice.
 Location: Jabalpur, India | Website: https://finlitventures.com
 First post, then pin it:
 FinLit explains the financial health of every listed Indian company from its own filings, in plain English, with the working shown for every number.

 5,800+ companies · 1,700+ mutual funds · screener · DCF & SIP calculators · 1,200+ glossary terms

 Free to start: https://finlitventures.com

 Information only, not investment advice.

3. YOUTUBE channel: name FinLit, handle @finlitventures
 Description:
 FinLit is an Indian stock and mutual fund research platform (finlitventures.com). On this channel we explain how to read company financials in plain English, using real filings of listed Indian companies.

 Videos cover:
 • How to read a balance sheet, profit and loss statement and cash flow
 • What ratios like P/E, ROE, ROCE and debt-to-equity mean, with real examples
 • How to use the FinLit stock screener, company reports, and DCF and SIP calculators
 • How to read mutual fund numbers: returns, risk, costs and the Mutual Fund Score
 • Sector trends and results seasons, from the numbers

 FinLit covers 5,800+ listed companies and 1,700+ mutual funds, with data from SEBI, NSE, BSE, RBI and MoSPI releases.

 Everything here is information only, not investment advice. We describe companies; we never tell you what to buy or sell.

 Website: https://finlitventures.com
 Links: "FinLit website" https://finlitventures.com and "LinkedIn" https://www.linkedin.com/company/finlitventures/ | Contact email: contact@finlitventures.com

4. INSTAGRAM @finlitventures: Professional account > Business, category Financial Service (or Education website if asked).
 Name: FinLit | Stock Research India
 Bio:
 Indian stocks and mutual funds, explained from filings in plain English.
 5,800+ companies | 1,700+ funds
 Free to start. Info only, not advice.
 Link: https://finlitventures.com | Email button: contact@finlitventures.com

5. FACEBOOK PAGE (ask me first whether to create it): Page name FinLit Ventures, category Financial Service, bio: Indian stock and mutual fund research platform. Filings explained in plain English. Website https://finlitventures.com

6. CRUNCHBASE (crunchbase.com > Add a company): Name FinLit Ventures; Website https://finlitventures.com
 Short description: FinLit (finlitventures.com) is an Indian stock and mutual fund research platform that explains 5,800+ listed companies and 1,700+ funds from their filings, in plain English.
 Full description: the LinkedIn Overview above. Industries: FinTech, Financial Services, Information Services, Personal Finance. Headquarters: Jabalpur, India. Founded: 2026. Founder: Nishant Jain (link his LinkedIn). Employees: ask me. Social: the LinkedIn, X, YouTube and Instagram links created above. Contact: contact@finlitventures.com
 If Tracxn or Inc42 DataLabs already list the company, tell me (do not claim them without me).

7. ALTERNATIVETO (alternativeto.net > Suggest new app): Name FinLit; Website https://finlitventures.com
 Description: FinLit is an Indian stock and mutual fund research platform. It explains the financial health of 5,800+ listed Indian companies and 1,700+ mutual funds from their filings, in plain English, with the working shown for every number. It includes a stock screener, company research reports, side-by-side comparison, the FinLit Prism rating, Sector Pulse and Sector Rotation, a results calendar, earnings call transcripts, IPO data, FII/DII flows, DCF and SIP calculators and a 1,200+ term glossary. Free to start. Information only, not investment advice.
 License: Freemium. Platforms: Online. Tags: stock-screener, stock-analysis, mutual-funds, fundamental-analysis, financial-research, investing. Mark it as an alternative to: Screener.in, Tickertape, Trendlyne, StockEdge, Value Research Online, Finology Ticker, Moneycontrol.

8. PRODUCT HUNT: only create Nishant Jain's personal maker account with the LinkedIn headline above. Do NOT start a launch (we plan it later).

9. QUORA (Nishant's personal account) credential: Founder, FinLit (Indian stock research platform)
 REDDIT (Nishant's personal account) bio: Founder of FinLit (finlitventures.com), a plain-English research site for Indian stocks and mutual funds. I always say so when I mention it. Not investment advice.

SKIP for now: Chrome Web Store (needs a check of the extension text first, and a US$5 fee), Google Business Profile, G2/Capterra, Wikipedia/Wikidata.

FINAL REPORT (so I can paste it to my developer), one line each, the real URL or "not done" with the reason:
LinkedIn company:
LinkedIn (Nishant):
X:
YouTube:
Instagram:
Facebook:
Crunchbase:
Product Hunt (maker):
AlternativeTo:
Quora:
Reddit:
Handle used:
```

---

## Prompt 3: the AI panel (where FinLit starts: the baseline)

```
You are running a measurement for my website finlitventures.com (FinLit, an Indian stock and mutual fund research platform). I want to know whether AI answers name FinLit today. Do not change any settings or accounts; only ask questions and record the answers.

THE 7 PLACES:
1. Google AI Overview (search on google.co.in; record the AI Overview box only)
2. Google AI Mode (google.com/aimode or the "AI Mode" tab)
3. ChatGPT (chatgpt.com, with search on)
4. Gemini (gemini.google.com)
5. Claude (claude.ai, with web search on)
6. Perplexity (perplexity.ai)
7. Microsoft Copilot (copilot.microsoft.com)
Start a NEW chat for every question. Use the questions word for word.

THE 60 QUESTIONS:
A. Category
1 What are the best investing research and guidance platforms in India?
2 Best stock screener in India
3 Best mutual fund research website in India
4 Where can I read research reports on Indian companies for free?
5 Alternatives to Tickertape
6 Alternatives to Screener.in
7 Alternatives to Trendlyne
8 Alternatives to Value Research Online
9 Free fundamental analysis tools for Indian stocks
10 Websites that explain a company's financial statements in plain English (India)
11 Best app for analysing Indian stocks for beginners
12 Which website shows the financial health of Indian companies?
13 Stock research platform with a DCF calculator (India)
14 Best websites to compare Indian stocks side by side
15 Websites that track sector rotation in Indian stocks
16 Where can I see FII and DII data daily?
17 Websites with earnings call transcripts of Indian companies
18 Best sites for IPO analysis in India
19 Mutual fund screener with risk and cost details (India)
20 What is FinLit Ventures?
B. Company
21 TCS share price
22 Is TCS debt free?
23 Tata Consultancy Services financials
24 Reliance Industries results
25 HDFC Bank ROE
26 Infosys dividend yield
27 Who owns ITC? (shareholding)
28 Asian Paints P/E ratio
29 Titan Company five-year growth
30 Bharti Airtel debt to equity
31 Is Larsen and Toubro financially healthy?
32 State Bank of India market cap
33 Hindustan Unilever peers
34 ICICI Bank latest quarterly results
35 Bajaj Finance ROCE
36 Maruti Suzuki promoter holding
37 Sun Pharma revenue growth
38 Tata Motors debt
39 Wipro vs Infosys comparison
40 Avenue Supermarts (DMart) financial analysis
C. Tools and concepts
41 DCF calculator
42 SIP calculator
43 CAGR calculator
44 XIRR calculator
45 PE ratio calculator
46 Reverse DCF calculator
47 What is ROCE?
48 How to read a balance sheet
49 What is debt to equity ratio?
50 What is a good P/E ratio for Indian stocks?
51 How to analyse a stock fundamentally
52 What is free cash flow?
53 What is promoter pledging?
54 What is EV/EBITDA?
55 How to read a mutual fund factsheet
56 What is the expense ratio of a mutual fund?
57 What is a stock screener and how to use one
58 What is earnings per share (EPS)?
59 What is dividend payout ratio?
60 Step-up SIP calculator

FOR EACH ANSWER RECORD ONE ROW in a new Google Sheet named "FinLit AI panel Nov 2026" with these columns:
Date | Q# | Place | FinLit named (Y/N) | Position in the list (1 = first, blank if not named) | finlitventures.com cited as a source (Y/N) | Competitors named (in order) | Outside pages cited (URLs) | Notes
- Only count FinLit = finlitventures.com. Other "FinLit" financial-literacy groups (UK/US, The Fin Lit Project) do not count; write "other FinLit" in Notes.
- If a place refuses, needs a login you do not have, or shows no AI answer, write that in Notes and move on.
- Work place by place (all 60 questions in place 1, then place 2, and so on). If you need to stop, tell me exactly where to resume.

FINAL REPORT (to paste to my developer):
- The Google Sheet link.
- Per place: how many of the 60 answers named FinLit, and how many cited finlitventures.com.
- For questions 1-20: the 10 competitors named most often, with counts.
- The 30 outside URLs cited most often for questions 1-20, with counts.
```
