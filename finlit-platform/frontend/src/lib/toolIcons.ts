// The single registry of the 25 platform tools: id, name, one-line tagline, lowest plan, real route and icon. The Tools & Research Hub on the Home page and every tile that stands for one of these tools read from here.
export type ToolTier = "free" | "silver" | "gold";
export type ToolId =
  | "stock-radar" | "score-screener" | "etf-explorer" | "fund-finder" | "fund-health-check"
  | "chart-studio" | "peer-compare" | "company-health-score" | "company-financials" | "deep-dive-report"
  | "fair-value-calculator" | "forecast-builder" | "finance-calculators" | "option-chain"
  | "watchlists" | "portfolio-check-up" | "alerts" | "compare-funds"
  | "theme-tracker" | "market-dashboard" | "market-data" | "newsroom"
  | "learn" | "investor-circle" | "connect-ai";
export interface ToolMeta { id: ToolId; name: string; tagline: string; tier: ToolTier; route: string }

/** The names match the site's menus, so a card and the page it opens agree. (The ids are the image file names in public/feature-bucket/.) */
export const TOOL_ICONS: Record<ToolId, ToolMeta> = {
  "stock-radar": { id: "stock-radar", name: "Stock Screener", tagline: "Filter every listed company", tier: "free", route: "/screener" },
  "score-screener": { id: "score-screener", name: "Score Screener", tagline: "Rank every company by its score", tier: "silver", route: "/score-screener" },
  "etf-explorer": { id: "etf-explorer", name: "ETFs", tagline: "Every ETF by return and risk", tier: "free", route: "/etfs" },
  "fund-finder": { id: "fund-finder", name: "Mutual Funds", tagline: "Every scheme, NAV to risk", tier: "free", route: "/funds" },
  "fund-health-check": { id: "fund-health-check", name: "Fund Health Score", tagline: "A 0–100 score for every fund", tier: "gold", route: "/fund-score-screener" },
  "chart-studio": { id: "chart-studio", name: "Chart Builder", tagline: "Price and financials together", tier: "free", route: "/graphs" },
  "peer-compare": { id: "peer-compare", name: "Compare Companies", tagline: "Two to four side by side", tier: "free", route: "/compare" },
  "company-health-score": { id: "company-health-score", name: "FinLit Prism", tagline: "Financial health in four parts", tier: "gold", route: "/prism" },
  "company-financials": { id: "company-financials", name: "Financials Dashboard", tagline: "Every ratio over the years", tier: "gold", route: "/premium/fundamentals" },
  "deep-dive-report": { id: "deep-dive-report", name: "Premium Report", tagline: "A one-document company report", tier: "gold", route: "/premium/report" },
  "fair-value-calculator": { id: "fair-value-calculator", name: "DCF Calculator", tagline: "Step-by-step DCF, reverse DCF", tier: "gold", route: "/dcf" },
  "forecast-builder": { id: "forecast-builder", name: "Profit & Revenue Outlook", tagline: "Estimates from its own history", tier: "gold", route: "/outlook" },
  "finance-calculators": { id: "finance-calculators", name: "Calculators", tagline: "Change one assumption", tier: "free", route: "/eps-calculator" },
  "option-chain": { id: "option-chain", name: "Option Chain", tagline: "OI, max pain, PCR", tier: "gold", route: "/premium/options" },
  "watchlists": { id: "watchlists", name: "Watchlists", tagline: "Keep every stock in sight", tier: "silver", route: "/watchlist" },
  "portfolio-check-up": { id: "portfolio-check-up", name: "Equity Portfolio", tagline: "Score and mix of what you hold", tier: "silver", route: "/holdings" },
  "alerts": { id: "alerts", name: "Alerts", tagline: "Pinged when a level is hit", tier: "free", route: "/alerts" },
  "compare-funds": { id: "compare-funds", name: "Compare Funds", tagline: "Two funds, costs included", tier: "free", route: "/funds/compare" },
  "theme-tracker": { id: "theme-tracker", name: "Sector Pulse", tagline: "Washout, rebound or fading", tier: "gold", route: "/sectors" },
  "market-dashboard": { id: "market-dashboard", name: "Markets Dashboard", tagline: "Index moves and their events", tier: "gold", route: "/premium/markets" },
  "market-data": { id: "market-data", name: "Market Data", tagline: "Flows, economy, commodities", tier: "free", route: "/fii-dii" },
  "newsroom": { id: "newsroom", name: "News & Filings", tagline: "Filings as they land", tier: "free", route: "/news" },
  "learn": { id: "learn", name: "Glossary & Guides", tagline: "Finance terms in plain words", tier: "free", route: "/glossary" },
  "investor-circle": { id: "investor-circle", name: "Discussion Forums", tagline: "Learn from other investors", tier: "free", route: "/forum" },
  "connect-ai": { id: "connect-ai", name: "Connect AI", tagline: "FinLit data in your AI assistant", tier: "free", route: "/mcp" },
};
export const TOOL_IDS = Object.keys(TOOL_ICONS) as ToolId[];
export const TIER_LABEL: Record<ToolTier, string> = { free: "Free", silver: "Silver", gold: "Gold" };
