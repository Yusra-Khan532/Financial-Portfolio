// Demo portfolio for previews and tests ONLY: invented names and numbers, never shown as real data (the section says so through its source line).
import type { Portfolio } from "./types";

const mk = (name: string, industry: string, pct: number, prevPct: number | null, stockSymbol: string | null = null) =>
  ({ name, isin: null, industry, assetClass: "equity", pct, qty: null, valueLakh: null, stockSymbol, prevPct, change: prevPct == null ? null : Math.round((pct - prevPct) * 100) / 100 });

export const DEMO_PORTFOLIO: Portfolio = {
  asOf: "2026-09-30", previousAsOf: "2026-08-31", source: "DEMO DATA, not a real fund", sourceUrl: null,
  holdings: [
    mk("Demo Bank Ltd", "Banks", 9.5, 9.1, "DEMOBANK"), mk("Demo Software Ltd", "IT - Software", 7.2, 7.9), mk("Demo Motors Ltd", "Automobiles", 5.1, null), mk("Demo Power Ltd", "Power", 4.4, 4.4),
    mk("Demo Pharma Ltd", "Pharmaceuticals & Biotechnology", 3.9, 3.2), mk("Demo Cement Ltd", "Cement & Cement Products", 2.8, 3.1), mk("Demo Telecom Ltd", "Telecom - Services", 2.2, 2.2), mk("Demo Finance Ltd", "Finance", 1.6, 1.5),
    mk("Demo Retail Ltd", "Retailing", 1.1, 1.0), mk("Demo Steel Ltd", "Ferrous Metals", 0.9, 0.9), mk("Demo Paints Ltd", "Consumer Durables", 0.7, 0.8), mk("Demo Textiles Ltd", "Textiles & Apparels", 0.4, null),
  ],
  exited: [{ name: "Demo Chemicals Ltd", pct: 0, prevPct: 1.3 }],
  summary: { count: 12, top10Pct: 38.8, assetSplit: { equity: 39.8, debt: null, cash: null, other: null }, industries: [{ industry: "Banks", pct: 9.5 }, { industry: "IT - Software", pct: 7.2 }, { industry: "Automobiles", pct: 5.1 }] },
};
