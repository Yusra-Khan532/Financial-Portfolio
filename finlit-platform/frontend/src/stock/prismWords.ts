// FinLit Prism wording shared by the stock page card and the Gold hub (kept apart from the card so the hub does not load the stock page).
// The wording rules are in docs/prism/CONTRACT.md: never "buy", "sell", "avoid" or "target".
import { FUND_PART_NAME } from "../lib/prismNames";

export const PRISM_NOTE = "Describes the company's financial health from its filings and prices; not a recommendation.";

export type PrismPart = "fundamental" | "valuation" | "quality" | "risk";
/** The four parts, in the model's order, with a decorative colour. How much each part counts is FinLit's own and stays on the server. */
export const PRISM_PARTS: [PrismPart, string, string][] = [
  ["fundamental", FUND_PART_NAME, "--p-growth"], ["valuation", "Valuation", "--p-quality"], ["quality", "Quality", "--p-profit"], ["risk", "Risk", "--p-balance"],
];

/** What Prism adds, for the unlock card. */
export const PRISM_POINTS = [
  "A financial-health score out of 100 in four parts: Growth & Profitability, Valuation, Quality and Risk",
  "Each company is judged on the measures that fit its industry, across eight industry groups",
  "Shows how complete the data is, and saves as a PDF you can keep",
];
