// Shared portfolio ("what it invests in") types. Shape = backend finlit.disclosure.get_portfolio (see the contract in the task notes).
export type Holding = {
  name: string; isin: string | null;
  /** NSE's industry of an equity line (one of its 59, "Listed abroad" or "Not classified"; task #192): null for debt and cash lines */
  industry: string | null; macroSector?: string | null;
  /** NSE's 22-level sector of the same line */
  sector?: string | null;
  /** why an equity line is "Not classified" or "Listed abroad"; null when placed */
  industryNote?: string | null;
  /** the fund house's own industry name, as published */
  amfiIndustry?: string | null;
  assetClass: string | null; pct: number | null; qty: number | null; valueLakh: number | null;
  stockSymbol: string | null; prevPct: number | null; change: number | null;
};
export type AssetSplit = { equity: number | null; debt: number | null; cash: number | null; other: number | null };
export type PortfolioSummary = { count: number; top10Pct: number | null; assetSplit: AssetSplit; industries: { industry: string; pct: number }[]; sectors?: { sector: string; pct: number }[]; macroSectors?: { macroSector: string; pct: number }[] };
export type Portfolio = {
  asOf: string | null; previousAsOf: string | null; source: string; sourceUrl: string | null;
  holdings: Holding[]; exited: Partial<Holding>[]; summary: PortfolioSummary;
};
/** What the API gives: a portfolio, or the reason there is none. */
export type PortfolioResult = Portfolio | { unavailable: string };
export const isPortfolio = (p: PortfolioResult | null | undefined): p is Portfolio => !!p && !("unavailable" in p);
