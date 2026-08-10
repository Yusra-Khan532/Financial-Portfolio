// FY2026-27 performance data — Nishant Jain (01 Apr 2026 – 07 Aug 2026)

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
  reportPeriod: "01 Apr 2026 – 07 Aug 2026",
  financialYear: "FY 2026-27",
  deployedCapital: "₹30,00,000",
};

export const headline = {
  grossPnl: "₹4,09,161.80",
  netPnl: "₹3,78,101.08",
  grossRoi: "13.64%",
  netRoi: "12.60%",
};

export const metrics = [
  { key: "xirr", label: "XIRR (Annualized)", value: "52.81%", tone: "positive" },
  { key: "cagr", label: "CAGR (Annualized)", value: "45.52%", tone: "positive" },
  { key: "winrate", label: "Win Rate", value: "72.22%", tone: "positive" },
  { key: "profit-factor", label: "Profit Factor", value: "2.38", tone: "neutral" },
  { key: "holding", label: "Avg Holding Period", value: "32 Days", tone: "neutral" },
  { key: "sharpe", label: "Sharpe Ratio", value: "2.14", tone: "neutral" },
  { key: "sortino", label: "Sortino Ratio", value: "3.21", tone: "neutral" },
  { key: "alpha-nifty", label: "Alpha vs NIFTY 50", value: "+28.31%", tone: "positive" },
  { key: "alpha-midcap", label: "Alpha vs NIFTY Midcap 150", value: "+23.05%", tone: "positive" },
  { key: "drawdown", label: "Max Drawdown", value: "-8.67%", tone: "negative" },
  { key: "best-month", label: "Best Month (Jul '26)", value: "+18.74%", tone: "positive" },
  { key: "active-trades", label: "Active Trades", value: "63", tone: "neutral" },
];

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

export const returnsComparison = [
  { name: "Portfolio", value: 52.81 },
  { name: "NIFTY 50", value: 24.5 },
  { name: "NIFTY Midcap 150", value: 29.76 },
];

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

export const attribution = [
  { sector: "Capital Goods", value: 32.4 },
  { sector: "Automobiles", value: 18.8 },
  { sector: "Financial Services", value: 14.8 },
  { sector: "Defence", value: 10.7 },
  { sector: "Real Estate", value: 7.5 },
  { sector: "IT", value: 5.6 },
  { sector: "Chemicals", value: -3.4 },
  { sector: "Infrastructure", value: -2.3 },
  { sector: "Others", value: -1.6 },
];

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
  { n: "03", title: "Company Analysis", detail: "Bottom-up study of business quality, management integrity and durable moats." },
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
