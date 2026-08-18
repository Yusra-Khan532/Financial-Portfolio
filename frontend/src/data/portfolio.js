// FY2026-27 performance data — Nishant Jain
// profile/headline/winrate/holding/active-trades reflect the 01 Apr–17 Aug 2026 realised P&L report.
// Everything below still reflects the prior (01 Apr–07 Aug 2026) report — see per-export notes.

export const profile = {
  name: "Nishant Jain",
  title: "Independent Equity Investor & Researcher",
  credentials: [
    "CFA Level I Cleared",
    "NISM Certified Research Analyst",
    "IIT Kanpur — BSc Earth Sciences",
    "Minor in Finance & Industrial Management",
  ],
  quote:
    "Invest with a margin of safety, think long term and let compounding do the heavy lifting.",
  reportPeriod: "01 Apr 2026 – 17 Aug 2026",
  financialYear: "FY 2026-27",
  deployedCapital: "₹30,00,000.00",
};

export const headline = {
  grossPnl: "₹4,43,450.11",
  netPnl: "₹4,08,616.00",
  grossRoi: "14.78%",
  netRoi: "13.62%",
};

// NOTE: xirr, cagr, sharpe, sortino, alpha-* and drawdown cannot be derived from the
// realised P&L report (it has no current holdings, NAV curve or benchmark data) — left
// at their last-known values pending a source that supports them. winrate, holding and
// active-trades are recomputed from the PDF upload pipeline (backend/portfolio_report.py).
// profit-factor and best-month ARE derivable straight from the realised trade ledger
// (01 Apr–17 Aug 2026, 350 trades):
//   profit-factor = gross winning-trade P&L ÷ |gross losing-trade P&L|
//                  = 537180.21 / 93730.10 = 5.73
//   best-month     = calendar month with the highest summed realised P&L
//                  Apr 99,050.85 · May 1,21,853.90 · Jun 1,26,245.03 (highest)
//                  · Jul 45,654.43 · Aug(1-17) 50,645.90
//   best-month is shown as a rupee figure, not a % return — the report has no NAV/capital
//   history to support a defensible monthly % (deployed capital isn't static intra-month).
export const metrics = [
  { key: "xirr", label: "XIRR (Annualized)", value: "52.81%", tone: "positive" },
  { key: "cagr", label: "CAGR (Annualized)", value: "45.52%", tone: "positive" },
  { key: "winrate", label: "Win Rate", value: "83.67%", tone: "positive" },
  { key: "profit-factor", label: "Profit Factor", value: "5.73", tone: "neutral" },
  { key: "holding", label: "Avg Holding Period", value: "74 Days", tone: "neutral" },
  { key: "sharpe", label: "Sharpe Ratio", value: "2.14", tone: "neutral" },
  { key: "sortino", label: "Sortino Ratio", value: "3.21", tone: "neutral" },
  { key: "alpha-nifty", label: "Alpha vs NIFTY 50", value: "+28.31%", tone: "positive" },
  { key: "alpha-midcap", label: "Alpha vs NIFTY Midcap 150", value: "+23.05%", tone: "positive" },
  { key: "drawdown", label: "Max Drawdown", value: "-8.67%", tone: "negative" },
  { key: "best-month", label: "Best Realised P&L Month (Jun '26)", value: "₹1,26,245", tone: "positive" },
  { key: "active-trades", label: "Realised Trades", value: "350", tone: "neutral" },
];

// STALE vs the latest (17 Aug 2026) report: a cumulative-return curve needs a daily NAV
// and benchmark index series, which a realised-trades P&L export does not contain.
export const growthData = [
  { date: "Apr 01", Portfolio: 0, "NIFTY 50": 0, "NIFTY Midcap 150": 0 },
  { date: "Apr 15", Portfolio: 4, "NIFTY 50": 2, "NIFTY Midcap 150": -1 },
  { date: "Apr 30", Portfolio: 9, "NIFTY 50": 4, "NIFTY Midcap 150": -2 },
  { date: "May 15", Portfolio: 15, "NIFTY 50": 6, "NIFTY Midcap 150": 0 },
  { date: "May 31", Portfolio: 21, "NIFTY 50": 8, "NIFTY Midcap 150": 2 },
  { date: "Jun 15", Portfolio: 27, "NIFTY 50": 10, "NIFTY Midcap 150": 3 },
  { date: "Jun 30", Portfolio: 33, "NIFTY 50": 13, "NIFTY Midcap 150": 4 },
  { date: "Jul 15", Portfolio: 42, "NIFTY 50": 17, "NIFTY Midcap 150": 6 },
  { date: "Jul 31", Portfolio: 51, "NIFTY 50": 21, "NIFTY Midcap 150": 8 },
  { date: "Aug 07", Portfolio: 55, "NIFTY 50": 24, "NIFTY Midcap 150": 10 },
];

// STALE: XIRR and benchmark-index levels are not derivable from the realised P&L report.
export const returnsComparison = [
  { name: "Portfolio", value: 52.81 },
  { name: "NIFTY 50", value: 24.5 },
  { name: "NIFTY Midcap 150", value: 29.76 },
];

// STALE: sector/cap/segment/geography allocation reflects CURRENT open holdings, which
// this realised (closed-trade) P&L report does not include.
export const sectorAllocation = [
  { name: "Capital Goods", value: 20.6 },
  { name: "Automobiles", value: 16.5 },
  { name: "Information Technology", value: 12.7 },
  { name: "Financial Services", value: 10.4 },
  { name: "Real Estate", value: 8.3 },
  { name: "Defence", value: 7.1 },
  { name: "Chemicals", value: 6.5 },
  { name: "Infrastructure", value: 5.4 },
  { name: "Consumer Discretionary", value: 4.3 },
  { name: "Healthcare", value: 3.3 },
  { name: "Metals & Mining", value: 2.3 },
  { name: "Cash & Others", value: 2.0 },
];

export const marketCapAllocation = [
  { name: "Large Cap", value: 55 },
  { name: "Mid Cap", value: 25 },
  { name: "Small Cap", value: 15 },
  { name: "Cash & Others", value: 5 },
];

export const segmentAllocation = [
  { name: "Equity Stocks", value: 60 },
  { name: "ETFs", value: 30 },
  { name: "Cash & Others", value: 10 },
];

export const etfGeography = [
  { name: "India ETFs", value: 47 },
  { name: "US ETFs", value: 28 },
  { name: "China ETFs", value: 15 },
  { name: "Gold & Others", value: 10 },
];

// UPDATED — derived from the 01 Apr–17 Aug 2026 realised trade ledger (350 trades):
// realised P&L summed per stock symbol, expressed as % of total gross P&L (₹4,43,450.11).
// Sector-level attribution is NOT CALCULABLE — the report has no sector classification
// per symbol, only per-trade P&L — so this is grouped by stock instead of sector.
export const attribution = [
  { stock: "SKYGOLD", value: 10.9 },
  { stock: "AVALON", value: 9.8 },
  { stock: "TDPOWERSYS", value: 9.5 },
  { stock: "MON100", value: 9.1 },
  { stock: "RPEL", value: 8.0 },
  { stock: "KRN", value: 5.6 },
  { stock: "NETWEB", value: 4.3 },
  { stock: "DATAPATTNS", value: 4.3 },
  { stock: "Other Stocks (30)", value: 38.9 },
  { stock: "HIRECT", value: -0.1 },
  { stock: "POLICYBZR", value: -0.2 },
];

// STALE: per-sleeve ROI/XIRR needs current holdings + a valuation date, not in this report.
export const marketCapPerf = [
  { cap: "Large Cap", roi: "52.83%", xirr: "41.26%" },
  { cap: "Mid Cap", roi: "52.34%", xirr: "55.14%" },
  { cap: "Small Cap", roi: "44.68%", xirr: "63.42%" },
  { cap: "Overall Portfolio", roi: "13.64%", xirr: "52.81%" },
];

export const etfPerf = [
  { cat: "India ETFs", roi: "17.42%", xirr: "21.36%" },
  { cat: "US ETFs", roi: "17.50%", xirr: "21.28%" },
  { cat: "China ETFs", roi: "11.33%", xirr: "14.02%" },
  { cat: "Gold & Others", roi: "9.00%", xirr: "11.57%" },
  { cat: "Overall ETF Portfolio", roi: "15.70%", xirr: "19.27%" },
];

// STALE and currently unused by any page — top-holdings % needs a live positions/valuation
// statement, not a realised P&L export. Left as-is (not rendered anywhere in the UI).
export const holdings = [
  { company: "Endurance Technologies", sector: "Auto Ancillaries", cap: "Mid Cap", pct: "3.40%" },
  { company: "Shriram Finance", sector: "Financials", cap: "Large Cap", pct: "3.20%" },
  { company: "Minda Corp (UNO MINDA)", sector: "Auto Ancillaries", cap: "Mid Cap", pct: "2.90%" },
  { company: "Netweb Technologies", sector: "IT Services", cap: "Small Cap", pct: "2.70%" },
  { company: "HDFC Small Cap 250 ETF", sector: "India ETF", cap: "—", pct: "2.50%" },
  { company: "Data Patterns (India)", sector: "Defence", cap: "Small Cap", pct: "2.40%" },
  { company: "Solar Industries", sector: "Capital Goods", cap: "Large Cap", pct: "2.20%" },
  { company: "Avalon Technologies", sector: "IT Services", cap: "Small Cap", pct: "2.10%" },
  { company: "Macrotech Developers", sector: "Real Estate", cap: "Large Cap", pct: "2.00%" },
  { company: "Sky Gold Ltd", sector: "Jewellery", cap: "Small Cap", pct: "1.90%" },
];

// STALE: Sharpe/Sortino/Calmar/Beta need a daily return series and benchmark data, not in
// this report — same underlying values as the xirr/cagr/sharpe/... metrics above.
export const riskSummary = [
  { label: "Max Drawdown", value: "-8.67%", tone: "negative" },
  { label: "Sharpe Ratio", value: "2.14", tone: "neutral" },
  { label: "Sortino Ratio", value: "3.21", tone: "neutral" },
  { label: "Calmar Ratio", value: "6.09", tone: "neutral" },
  { label: "Beta vs NIFTY", value: "0.82", tone: "neutral" },
];

export const process = [
  { n: "01", title: "Idea Generation", detail: "Macro & sector analysis to identify structural tailwinds and emerging themes before the crowd." },
  { n: "02", title: "Industry Analysis", detail: "Top-down evaluation of industry cycles, competitive intensity and growth runways." },
  { n: "03", title: "Business Quality", detail: "Bottom-up study of business quality, management integrity and durable moats." },
  { n: "04", title: "Valuation & Modelling", detail: "DCF, relative, PEG, EV/EBITDA and ROE frameworks to buy with a margin of safety." },
  { n: "05", title: "Position Sizing & Risk", detail: "Disciplined sizing, stop-loss and diversification to protect capital first." },
  { n: "06", title: "Monitoring & Review", detail: "Continuous tracking of thesis, earnings and price action against the plan." },
  { n: "07", title: "Exit Discipline", detail: "Systematic exits when the thesis breaks, targets hit or better opportunities emerge." },
];

export const researchApproach = [
  "Fundamental & bottom-up stock picking",
  "Sectoral & industry cycle analysis",
  "Financial statement analysis",
  "Valuation — DCF, Relative, PEG, EV/EBITDA, ROE",
  "Competitive & moat evaluation",
  "Risk management & position sizing",
];

export const services = [
  {
    title: "Discretionary Portfolio Management",
    detail: "A concentrated, research-driven equity portfolio built and rebalanced on your behalf with a long-term wealth creation mindset.",
    points: ["Bespoke portfolio construction", "Active rebalancing", "Quarterly performance reporting"],
  },
  {
    title: "Equity Research & Advisory",
    detail: "Deep, independent research on Indian equities — high-conviction ideas backed by financial modelling and valuation work.",
    points: ["High-conviction stock ideas", "Detailed research notes", "Entry, sizing & exit guidance"],
  },
  {
    title: "Risk & Portfolio Review",
    detail: "A structured audit of your existing holdings — allocation, concentration, drawdown risk and quality assessment.",
    points: ["Allocation & risk audit", "Quality & moat scoring", "Actionable rebalancing plan"],
  },
];

export const pillars = [
  { title: "Disciplined Research", detail: "Fundamental, quantitative & qualitative analysis" },
  { title: "Strong Risk Management", detail: "Position sizing, stop-loss & diversification" },
  { title: "Long-Term Wealth Creation", detail: "Quality businesses with strong moats" },
  { title: "Continuous Learning", detail: "Upgrading skills & staying aligned with markets" },
  { title: "Performance Driven", detail: "Process-oriented approach with measurable results" },
];
