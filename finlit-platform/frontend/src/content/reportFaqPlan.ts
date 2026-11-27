// Task #216 (company report handover, README 3.20) and task #283: the old overall score is retired, so the report's FAQ asks about FinLit Prism, FinLit's only company
// score, for every plan. The Prism answer is written from the Prism card's own text. The base questions are in pageFaqs.ts.
import type { ScoreModel } from "../lib/planGate";

type Item = { q: string; a: string };
export const PRISM_Q: Item = {
  q: "What does the FinLit Prism score at the top mean?",
  a: "A score out of 100 for the company’s business and financial strength, built from four parts: Growth & Profitability, Valuation, Quality and Risk. Beside it, two technical views, short term (5 to 20 sessions) and long term (6 to 18 months), read the price trend from −100 to +100; they are shown separately and are not part of the score. It is a research summary, not a recommendation.",
};
/** The report's questions (the same for every plan since the old overall score was retired; `model` is kept for the callers). */
export function reportFaqFor(items: Item[], model: ScoreModel | null): Item[] {
  void model;
  return items;
}
