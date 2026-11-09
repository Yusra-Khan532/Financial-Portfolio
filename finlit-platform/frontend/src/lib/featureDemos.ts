// The short "see it working" clips behind the (i) next to each feature on the Plans page and the plan table (task #51).
// Each demo is a short walkthrough recording of the real page (public/plans/demos/<id>.mp4 with a poster .jpg): a cursor, a ring on what is pressed and
// numbered captions. The same captions are the "What you will see" list in the player (content/featureSteps.json, written from scripts/record-feature-demos.mjs).
// A demo may still be a full-page picture (kind "still", public/landing/tools/<image>.webp) when a recording cannot be made. Every feature label used in Plans.tsx maps to one demo.
export type Demo = {
  id: string; title: string;
  /** One or two plain sentences: what the clip shows and what the feature does. Describes; never advises. */
  say: string;
  /** "video": public/plans/demos/<id>.mp4 + .jpg; "still": a picture of the page, from public/landing/tools. */
  kind: "video" | "still"; image?: string;
  to: string; toLabel: string;
};

const v = (id: string, title: string, say: string, to: string, toLabel: string): Demo => ({ id, title, say, kind: "video", to, toLabel });

export const DEMOS: Record<string, Demo> = {
  overview: v("overview", "Company overview", "Open any listed company: what it does, its price, its scores and its key figures on one page, then scroll through every section.", "/stocks/RELIANCE", "Open a company page"),
  iq: v("iq", "FinLit IQ and its five pillars", "The 0 to 100 score on every company page, the five pillars behind it and plain notes on what lifts or weighs on it.", "/stocks/RELIANCE#notes", "See a FinLit IQ"),
  price: v("price", "Price chart and technicals", "Switch the chart from one month to several years; the 50 and 200-day averages, volume and the trend readings sit with it.", "/stocks/RELIANCE#price", "Open the price chart"),
  quarter: v("quarter", "Latest quarter and trends", "The newest quarter against the last quarter and a year earlier, and how sales, profit and cash have moved.", "/stocks/RELIANCE#quarter", "See the latest quarter"),
  financials: v("financials", "Financial statements", "Profit and loss, balance sheet and cash flow for up to ten years, switching between them in one click.", "/stocks/RELIANCE#financials", "Open the statements"),
  ratios: v("ratios", "Key ratios and their history", "Valuation, returns, margins and debt, and how each ratio moved over the years against its own usual level.", "/stocks/RELIANCE#ratios", "Open the ratios"),
  ownership: v("ownership", "Shareholding pattern", "Promoters, institutions and the public, quarter by quarter, and how their shares changed.", "/stocks/RELIANCE#ownership", "Open shareholding"),
  peers: v("peers", "Peer comparison", "How the company stands against others in its industry on size, growth, returns and valuation.", "/stocks/RELIANCE#peers", "Open peers"),
  screener: v("screener", "Stock screener", "Filter every listed company by size, valuation, growth and more, sort the matches and save the screen.", "/screener", "Open the screener"),
  glossary: v("glossary", "Glossary", "Type a word and get its meaning in plain English, why it matters and the formula.", "/glossary", "Open the glossary"),
  flows: v("flows", "FII & DII flows and the economy", "Daily buying and selling by foreign and domestic institutions, their streaks and history, next to the economy and commodity prices.", "/fii-dii", "Open FII & DII flows"),
  dcf: v("dcf", "DCF calculator", "Change the growth or discount rate and the intrinsic value, margin of safety and the full working update at once.", "/dcf", "Open the DCF calculator"),
  "adv-screener": v("adv-screener", "Advanced score screener", "Every listed company rated by FinLit Prism: ready-made screens by size and theme, with the parts and technical views beside each one.", "/advanced-score-screener", "Open the advanced screener"),
  prism: v("prism", "FinLit Prism", "A company's financial health in four parts, with the short and long-term technical views kept apart.", "/prism", "Open FinLit Prism"),
  "fund-health": v("fund-health", "Mutual Fund Health Score", "A 0 to 100 health score for every fund from its NAVs, costs and holdings, with category leaderboards.", "/fund-score-screener", "Open the Fund Health Score"),
  portfolio: v("portfolio", "Portfolio scorecard", "Add your shares by name to see each one's score, the average for your list, its sector mix and how spread it is.", "/holdings", "Open the portfolio"),
  compare: v("compare", "Compare companies", "Two companies side by side (four on Gold): financials, charts, a spider view of the scores and valuation.", "/compare", "Open Compare"),
  alerts: v("alerts", "Alerts", "Get a message when a price, a ratio, a score or a new filing reaches the level you set.", "/alerts", "Open alerts"),
  watchlists: v("watchlists", "Watchlists", "Keep the companies you follow in lists, with your notes and price levels, grouped by industry and size.", "/watchlist", "Open watchlists"),
  calendars: v("calendars", "Results, IPO and news calendars", "Result dates, open and upcoming IPOs and company filings, in one place.", "/results", "Open the calendars"),
  "iq-table": v("iq-table", "FinLit IQ table", "Every listed company with its score and five pillars, to sort and filter.", "/score-screener", "Open the score screener"),
  outlook: v("outlook", "Revenue and profit outlook", "Estimates of revenue and profit from the company's own history and its sector, with the weights you choose.", "/outlook", "Open the outlook"),
  downloads: v("downloads", "Downloads", "Save a company's report as a PDF note or an offline copy, and download tables as CSV.", "/stocks/RELIANCE", "Open a company report"),
  segments: v("segments", "Revenue by segment", "Where the company's revenue and profit come from, segment by segment, over the years.", "/premium/fundamentals", "Open company financials"),
  "gold-dash": v("gold-dash", "Gold dashboards", "Markets and financials: index moves with the events behind them, and every ratio over the years.", "/premium", "Open the Gold dashboards"),
  options: v("options", "Option chain", "Open interest, its change, volume and implied volatility by strike, with the put-call ratio and max pain.", "/premium/options", "Open the option chain"),
};

/** Feature names as the Plans page writes them (cards and table) -> the demo that shows them. A name not listed here gets no (i). */
export const FEATURE_DEMO: Record<string, string> = {
  "Starter stock screener": "screener", "Starter screener": "screener", "Full screener: 190+ filters": "screener", "FinLit model filters in the screener": "screener",
  "Compare two companies": "compare", "Compare up to 4 companies": "compare", "Compare up to four companies": "compare", "Score-based comparison": "compare",
  "Glossary": "glossary", "Glossary of finance terms": "glossary",
  "Latest quarter and trends": "quarter", "Company overview": "overview", "Financial statements": "financials",
  "Key ratios and their history": "ratios", "Full ratio history": "ratios", "Key ratios, peers and shareholding": "ratios",
  "Shareholding pattern": "ownership", "Peer comparison": "peers",
  "Price chart": "price", "Price chart, volume and 50-day average": "price", "Technical analysis": "price", "Technical analysis and momentum": "price",
  "Alerts": "alerts", "More alerts": "alerts", "Results, IPO and news calendars": "calendars",
  "FinLit IQ and five pillars": "iq", "How the score is built": "iq", "Growth & Profitability and technical scores side by side": "iq", "FinLit IQ table for every company": "iq-table",
  "Watchlists": "watchlists", "Watchlists with notes and targets": "watchlists", "Bigger watchlists": "watchlists",
  "Downloads": "downloads", "Downloads: PDF note, offline copy, CSV": "downloads", "Portfolio scorecard": "portfolio",
  "FinLit Prism": "prism", "Advanced score screener": "adv-screener", "DCF calculator": "dcf", "Revenue and profit outlook": "outlook",
  "FinLit Mutual Fund Health Score": "fund-health", "Fund Health Score": "fund-health", "Revenue by segment": "segments",
  "Gold dashboards": "gold-dash", "Option chain": "options", "FII & DII flows, India economy and commodity prices": "flows",
};

export const demoFor = (feature: string): Demo | null => { const id = FEATURE_DEMO[feature.replace(" (coming soon)", "")]; return id ? DEMOS[id] ?? null : null; };
