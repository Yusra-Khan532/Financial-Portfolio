# Global markets, global trade, emerging markets and market mood: research and plan

Founder's request (26 Nov 2026, chat): global trade data, global indices, global and emerging markets "because the global market affects
the Indian market"; charts like the Trading Lab's for big global companies (JPMorgan and others); and "what is going on in the market via
social media: LinkedIn, Twitter, Reddit". This file records what was found, what is free AND allowed on a public commercial website, the
decisions, and the build order. Checked 26 Nov 2026; each source's terms are linked so they can be re-checked.

## The rule that decides everything

FinLit shows data to its members on a commercial website. A source is usable only if its terms allow **display to other people** (not only
"personal use"). Several free APIs answer technically but forbid exactly this, so they are out, however convenient.

## What was found

| Need | Source | Free? | Display on our site allowed? | Decision |
|---|---|---|---|---|
| Global markets during Indian hours | Indian-listed international ETFs on Dhan (MON100 Nasdaq 100, MAFANG NYSE FANG+, MASPTOP50 S&P 500 Top 50, HNGSNGBEES Hang Seng, MAHKTECH Hang Seng Tech, MONQ50) | yes (Dhan, already used) | yes: NSE data we already show | **Use** (labelled as the ETF's price, never as the index) |
| US interest rates | US Treasury daily yield curve (home.treasury.gov XML, no key) | yes | yes: US government work, public domain | **Use** |
| Dollar index, Fed funds, Brent and WTI crude | FRED's public CSV download (no key; the macro page already reads Brent this way) | yes | yes for series without a copyright note (Fed and EIA series are public domain); FRED's terms: copyrighted series need the owner's permission | **Use** public-domain series only; each series' notes checked for "Copyright" |
| Currencies | ECB euro reference rates (no key); RBI/FBIL USD/INR (already stored) | yes | yes, with the source named | **Use** |
| Emerging and world economies | World Bank API (no key): GDP growth, inflation, current account, trade share | yes | yes: CC BY 4.0 | **Use** |
| India's trade by country and product | Ministry of Commerce TradeStat (DGCI&S) | yes | Government of India data; source named | **Use** (monthly) |
| World trade | WTO Timeseries API (free key) | yes | internal Lab, founder's decision of 26-27 Nov 2026 | **Used (27 Nov 2026)** in Global trade: world merchandise exports and imports by year and India's share (ITS_MTV_AX, ITS_MTV_AM); the key is read from `WTO_API_KEY` (server only); without it that panel says so |
| World trade by product | UN Comtrade | free tier 500 calls/day | **no**: free use is internal; redistribution needs a UNSD licence | Out |
| IMF data (DOTS, WEO) | IMF SDMX API | yes | commercial reuse needs IMF permission (copyright@imf.org) | Out until permission |
| Global company financials (JPMorgan, Apple, ...) | SEC EDGAR companyfacts (data.sec.gov, no key, 10 requests/s, a User-Agent naming FinLit) | yes | yes: US government, public domain | **Use** |
| Global index levels (S&P 500, Dow, Nasdaq, Nikkei, FTSE, DAX, Hang Seng) and US share prices | Yahoo, Twelve Data free, Alpha Vantage free, FMP free, Stooq | free to call | **no**: personal or internal use only; index levels are licensed by the index owners (S&P, Nasdaq, FTSE Russell, Nikkei) | Out; paid option below |
| GIFT Nifty | NSE IX | delayed data is a paid NSE product per medium | no free display right | Paid option below |
| News tone, India and world | FinLit's own FinBERT score on every news item and filing (task #365); GDELT (free, "unlimited and unrestricted use") | yes | yes | **Use**: market mood from our own scores; GDELT for world news tone |
| X (Twitter) | X API | pay per use (about $0.005 a post read); free tier closed | under X's terms | Paid option below |
| Reddit | Reddit Data API | free only for approved non-commercial use; commercial needs a written agreement; new access reportedly closed 31 Oct 2026 | no without an agreement | Out |
| LinkedIn | none: no API reads other people's posts; scraping breaks its terms | — | no | Out |

## What we build (free, allowed), one PR each

1. **Global cues** (`/lab/global`, Lab first): one screen of what moved overnight and today, outside India, that Indian markets react to:
   the international ETFs on NSE (price, change, premium to NAV where published), US 2-year and 10-year yields, the dollar index, Brent and WTI
   crude, EUR/USD and USD/INR, India VIX; each with its day's change, a small chart and a hover card saying what it is and where it comes from.
   Facts only: "US 10-year yield up 0.08 points", never "bad for Indian banks".
2. **Global trade**: India's exports and imports by month, by partner country and by product group (TradeStat), the trade balance, the top 10
   partners and how each changed against last year; the world's trade share of GDP (World Bank). A world map coloured by trade with India.
3. **Emerging markets**: India beside China, Brazil, Indonesia, Mexico, South Africa, Turkey, Saudi Arabia, Korea, Taiwan, Vietnam and others:
   GDP growth, inflation, current account, trade share, from the World Bank, as a comparison table and charts.
4. **Global companies**: JPMorgan, Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta, Berkshire, Tesla, Exxon, Visa and other large US-listed
   companies: revenue, profit, margins, cash, debt and shares over 10 years and by quarter, from SEC filings, drawn with FinLit's own charts.
   No share price (not free to show); where an Indian ETF or fund holds the company, the page says which.
   **Built (27 Nov 2026):** Trading Lab > Order Flow > Global > US companies (`lab/companies.py`, job `global-companies`, `/api/lab/companies`,
   `components/lab/UsCompanies.tsx`): 39 companies, 10 fiscal years and 9 quarters of revenue, operating income, net income and diluted EPS,
   the year-end balance sheet; a derived fourth quarter or liabilities total is labelled. Not built yet: shares outstanding and which Indian
   ETF or fund holds each company.
5. **Market mood**: from the sentiment score FinLit already gives every news item and filing: today's share of positive, neutral and negative
   items for the market and each sector, the trend over 30 days, and the most positive and most negative items; plus the world news tone from
   GDELT. It describes the tone of what was published. It does not say where the market will go (the describe-only rule); a direction call
   would be a Signals-desk tool, only for members with signals switched on.

## Needs a decision or a key (not free, or not ours to switch on)

- **No key is needed for Global cues**: FRED's public CSV download needs none (checked live: the macro page's Brent is current). Later, for world
  trade, `WTO_API_KEY` (free) goes in /opt/finlit/.env.aws, never in chat or the repo.
- **Paid, founder's choice:** (a) global index levels and US share prices with display rights (a commercial plan from a data vendor);
  (b) GIFT Nifty from NSE's delayed-data product; (c) X posts at pay-per-use rates. None is built until the founder chooses.
- **Never:** Yahoo or any "free" feed whose terms forbid showing the data, and scraping LinkedIn or Reddit.

## Already on the site: the dashboard's Global Markets tracker (task #294, `backend/finlit/global_markets.py`, /markets)

It shows S&P 500, Nasdaq Composite, Dow Jones and Nikkei 225 from FRED, and DAX, CAC 40, Hang Seng, Shanghai, FTSE 100 (through a tracker fund) and
gold through Twelve Data or EODHD free keys. **Flag for the founder (not changed here):** on FRED those four index series carry their owners'
copyright notes (S&P Dow Jones Indices, Nasdaq, Nikkei), which FRED's terms say need the owner's permission beyond personal use; and the free plans
of Twelve Data and EODHD are for personal or internal use. Global cues does not repeat those rows; it links to /markets for index levels.

## The founder's follow-up (26 Nov 2026): a global flow board

"How the flowing is going on ... which sector is going ... the same way as ours under India." A board of world sectors and large global companies
moving live needs share prices of many foreign companies with display rights: no free source gives them. Two honest routes: (1) a paid data plan
with display rights (founder's choice); (2) free and allowed now: the international ETFs on NSE (live), and a **fundamentals** board of large US
companies from SEC filings (who grew revenue and profit most last quarter, by sector), which is step 4 above.

## Founder's decision (26 Nov 2026, chat): internal use, all data, free path

"We are not going to show it publicly ... first use it for ourselves ... ignore the copyright thing ... we want all data ... select the free
path." The Trading Lab is invite-only (admin-granted, never indexed), so for the Lab the display-rights limits above are set aside by the
founder. Anything moved to a public page later needs this file's licence check again. Requests stay honest: FinLit names itself in the
User-Agent; no browser impersonation, no getting round a site's bot protection, no login scraping.

Checked live from the build machine on 26 Nov 2026 (FinLit User-Agent):

| Source (free, no key) | What it gives | Use |
|---|---|---|
| Yahoo Finance chart endpoint (`query1.finance.yahoo.com/v8/finance/chart/<symbol>`) | Every world index (S&P 500 ^GSPC, Nasdaq ^IXIC, Dow ^DJI, Nikkei ^N225, FTSE ^FTSE, DAX ^GDAXI, Hang Seng ^HSI, Shanghai 000001.SS, KOSPI ^KS11, Bovespa ^BVSP, ...), US futures (ES=F, NQ=F, CL=F, GC=F), US VIX, any US or foreign share (JPM, 7203.T Toyota, 2330.TW TSMC, 005930.KS Samsung, ASML.AS, 0700.HK Tencent, NESN.SW, SHEL.L), sector and country ETFs (XLK, EEM); daily and 5-minute bars | Global cues, global flow board, emerging markets |
| Nasdaq screener (`api.nasdaq.com/api/screener/stocks?download=true`) | All 7,374 US-listed shares in ONE call: price, change, % change, market cap, volume, sector, industry, country | The US flow board (sectors, boxes sized by the move, the biggest movers as big cards) |
| UN Comtrade public preview (no key) and free key (500 calls/day) | World trade by country and product, monthly | Global trade |
| Google News RSS (`news.google.com/rss/search`) | Headlines for any query (Nifty, Fed, crude, a company), scored by FinLit's own FinBERT model | Market mood |
| SEC EDGAR, World Bank, IMF, WTO, FRED, ECB, US Treasury, TradeStat | as above | as above |

Not found free: GIFT Nifty live (NSE IX's pages load their numbers by script; no open feed found yet), posts from X, LinkedIn posts. Reddit
gives a free API to an app the team registers (non-commercial tier); public JSON scraping is not used.

### What a paid plan would add beyond the free path
1. **X (Twitter) posts** for social mood (pay per post read). No free route exists.
2. **GIFT Nifty** live from NSE IX (NSE's paid delayed-data product), unless a free feed turns up.
3. **A contract**: the free endpoints above are unofficial and can change, slow down or stop without notice; a paid vendor promises uptime and
   support. The pages are built so that a source that stops answering says so and the rest keeps working.
Everything else the founder asked for is covered by the free path.

### Build order (revised)
1. Global cues (adds world indices, US futures, US VIX, gold via Yahoo to the FRED rates and the NSE ETFs). 2. Market mood. 3. Global flow
board (US whole market from the Nasdaq screener + the world's largest companies via Yahoo). 4. Global trade. 5. Emerging markets.
6. Global company financials (SEC). One PR each.
