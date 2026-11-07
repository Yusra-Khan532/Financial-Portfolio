// Content of the Tools & Research Hub (the 7 Nov 2026 design package, folder 2_landing/CONTENT.md). Names, tiers, routes and icons live in lib/toolIcons.ts.
import type { ToolId } from "./toolIcons";
export type GroupId = "discover" | "company360" | "quantlab" | "track" | "follow" | "learn";
export const GROUPS: { id: GroupId; name: string; desc: string }[] = [
  { id: "discover", name: "Discover", desc: "Find stocks, ETFs and mutual funds worth a closer look." },
  { id: "company360", name: "Company 360", desc: "Open one company up from every side: charts, comparisons and ratings." },
  { id: "quantlab", name: "Quant Lab", desc: "Value a company, test a forecast, read the option chain." },
  { id: "track", name: "Track & manage", desc: "Keep the stocks and funds you care about in one place." },
  { id: "follow", name: "Follow the market", desc: "Breadth, flows, results and news, in one place." },
  { id: "learn", name: "Learn & connect", desc: "Learn the terms, talk to other investors, or bring FinLit into your AI assistant." },
];
export interface ToolCopy { group: GroupId; n: number; desc: string; features: string[] }
export const TOOL_COPY: Record<ToolId, ToolCopy> = {
  "stock-radar": { group: "discover", n: 1, desc: "Filter every listed company by size, valuation, growth and debt.", features: ["14 free filters, first 25 matches", "Silver: 160+ filters, every match, CSV download", "Query builder: type P/E < 15, get the list"] },
  "score-screener": { group: "discover", n: 2, desc: "Rank every listed company by its score.", features: ["Silver: the FinLit IQ table, by size, sector and band", "Gold: FinLit Prism parts and two technical views", "Quick views and ready-made screens"] },
  "etf-explorer": { group: "discover", n: 3, desc: "Every exchange-traded fund by price, return and risk.", features: ["Broad, sector and thematic ETFs", "Returns, risk and tracking in one view", "Compare across categories"] },
  "fund-finder": { group: "discover", n: 4, desc: "NAV, returns, fund size and risk for every scheme.", features: ["Equity, debt and hybrid in one place", "Fund screener: type, cost, returns and risk", "Consistency checks across categories"] },
  "fund-health-check": { group: "discover", n: 5, desc: "A 0–100 health score for every mutual fund, with reasons.", features: ["Built from NAVs, costs and holdings", "Performance, risk, cost and quality", "Category leaderboards and CSV"] },
  "chart-studio": { group: "company360", n: 6, desc: "Put price and financials on the same chart.", features: ["Line, bar and candlestick charts", "Overlay price on financials and ratios", "Correlation charts: how two measures move together"] },
  "peer-compare": { group: "company360", n: 7, desc: "Two to four companies side by side.", features: ["Financials, charts and ratios side by side", "Spider chart and valuation view", "2 free, up to 4 on Gold"] },
  "company-health-score": { group: "company360", n: 8, desc: "A company's financial health, rated in four parts.", features: ["Growth & profitability, valuation, quality, risk", "Short and long-term technical views, kept apart", "Every factor with its reading; save as PDF"] },
  "company-financials": { group: "company360", n: 9, desc: "Every ratio over the years, in tables and charts.", features: ["Full ratio and valuation history", "Named shareholders and promoter pledge", "Peers, dividends, corporate actions"] },
  "deep-dive-report": { group: "company360", n: 10, desc: "A one-document report on any company, to print or share.", features: ["FinLit IQ, band and what drives it", "Strengths, watch-outs, ownership and peers", "Print it or save as a PDF"] },
  "fair-value-calculator": { group: "quantlab", n: 11, desc: "Work out what a share could be worth, step by step.", features: ["Margin of safety, cash flow and debt", "Sensitivity grids and reverse DCF", "Checks that block impossible inputs"] },
  "forecast-builder": { group: "quantlab", n: 12, desc: "Estimates from the company's own history and its sector.", features: ["1, 3 or 5-year horizons", "Solid line reported, dotted estimated", "Set the weight of each input"] },
  "finance-calculators": { group: "quantlab", n: 13, desc: "Change one assumption and watch the result.", features: ["EPS & P/E: Bear, Base and Bull cases", "SIP: step-ups, lump sums, goal planner", "Free; the SIP calculator needs no sign-in"] },
  "option-chain": { group: "quantlab", n: 14, desc: "Read an option chain at a glance.", features: ["OI, OI change, volume, implied volatility", "Put-call ratio worked out for you", "Max pain and busiest strikes"] },
  "watchlists": { group: "track", n: 15, desc: "Keep every stock you follow in sight.", features: ["3 lists on Silver, up to 50 on Gold", "Notes and price levels on each stock", "Group by industry and size"] },
  "portfolio-check-up": { group: "track", n: 16, desc: "See the score and mix of the shares you hold.", features: ["Add shares by name or from a file", "FinLit Prism score for each holding", "Band mix and sector spread"] },
  "alerts": { group: "track", n: 17, desc: "Get a ping the moment a level is hit.", features: ["Price, volume, technical and filing alerts", "3 free, 30 on Silver, 300 on Gold", "In the app, by email or in your browser"] },
  "compare-funds": { group: "track", n: 18, desc: "Two funds side by side, costs included.", features: ["1, 3, 5 and 10-year comparison", "Costs against the category average", "Gold: Fund Health Score from past NAVs"] },
  "theme-tracker": { group: "follow", n: 19, desc: "Which NSE industries are in a washout, a rebound or fading.", features: ["Breadth of every NSE industry, each evening", "Washout, Thrust, Confirmed and Fading", "Sector Rotation: who is pulling ahead"] },
  "market-dashboard": { group: "follow", n: 20, desc: "Index moves and the events behind them.", features: ["IPO and results calendars", "Announcements and call transcripts", "Index valuations and commodities"] },
  "market-data": { group: "follow", n: 21, desc: "Flows, the economy and commodity prices.", features: ["FII & DII flows, streaks and history", "India economy: inflation, growth, rates", "Gold, silver, crude and metals"] },
  "newsroom": { group: "follow", n: 22, desc: "Exchange filings and headlines as they land.", features: ["Company news and market updates", "Filings, announcements and concalls", "Filter by company or watchlist"] },
  "learn": { group: "learn", n: 23, desc: "Finance terms in plain words, with formulas.", features: ["Hundreds of terms with formulas", "Explainers and research notes", "How to read the sector pages"] },
  "investor-circle": { group: "learn", n: 24, desc: "Ask questions and learn from other investors.", features: ["Discussion tied to listed companies", "Information and opinion only", "Moderated"] },
  "connect-ai": { group: "learn", n: 25, desc: "Use FinLit data inside Claude, ChatGPT or Cursor.", features: ["Free and read-only; no sign-in or key", "Prices, financials, ratios, funds and flows", "Every answer carries its source and date"] },
};
