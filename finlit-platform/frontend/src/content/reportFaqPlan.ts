// Task #216 (company report handover, README 3.20): the report's FAQ follows the plan, one score per screen. Gold and Platinum (FinLit Prism) get the Prism
// question instead of "What does the FinLit IQ at the top mean?"; Silver keeps it, and its "What is in a report?" starts with "The FinLit IQ". The Prism answer
// is written from the Prism card's own text (the owner confirms the wording). The base questions are in pageFaqs.ts.
import type { ScoreModel } from "../lib/planGate";

type Item = { q: string; a: string };
const IQ_Q = "What does the FinLit IQ at the top mean?";
const PRISM: Item = {
  q: "What does the FinLit Prism score at the top mean?",
  a: "A score out of 100 for the company’s business and financial strength, built from four parts: Growth & Profitability, Valuation, Quality and Risk. Beside it, two technical views, short term (5 to 20 sessions) and long term (6 to 18 months), read the price trend from −100 to +100; they are shown separately and are not part of the score. It is a research summary, not a recommendation.",
};
/** The report's questions for the plan's score model: Prism on Gold and Platinum, the FinLit IQ on Silver; anything else as written. */
export function reportFaqFor(items: Item[], model: ScoreModel | null): Item[] {
  if (model === "prism") return items.map((i) => (i.q === IQ_Q ? PRISM : i));
  if (model === "iq") return items.map((i) => (i.q === "What is in a report?" ? { ...i, a: i.a.replace(/^The FinLit Prism score and how it has moved/, "The FinLit IQ") } : i));
  return items;
}
