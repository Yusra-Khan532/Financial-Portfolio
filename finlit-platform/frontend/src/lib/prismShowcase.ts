// The sample reading on the landing page's FinLit Prism card (task #122): Reliance Industries on FinLit Prism, 6 Nov 2026, the same real reading the page
// showed as a picture before. Kept here, dated, and shown with that date and "not a recommendation"; it is an example of the panel, not a live figure.
export type PartTone = "gold" | "red" | "green";
export const PRISM_SAMPLE = {
  company: "Reliance Industries", date: "6 Nov 2026",
  score: 59.4, word: "Average",
  parts: [
    { name: "Growth & Profitability", v: 58, word: "Average" },
    { name: "Valuation", v: 39, word: "Weak" },
    { name: "Quality", v: 79, word: "Healthy" },
    { name: "Risk", v: 86, word: "Strong" },
  ],
  tech: [
    { name: "Technical short term", span: "5–20 sessions", v: 29, word: "Uptrend" },
    { name: "Technical long term", span: "6–18 months", v: -55, word: "Strong downtrend" },
  ],
  caption: "Reliance Industries on FinLit Prism, 6 Nov 2026. Shown as an example, not a recommendation.",
} as const;

/** The colour family of a Prism word: Average gold, Weak and Poor red, Healthy and Strong green. */
export const partTone = (word: string): PartTone => (/weak|poor/i.test(word) ? "red" : /healthy|strong/i.test(word) ? "green" : "gold");
/** Where a technical view (−100 strong downtrend … +100 strong uptrend) sits on its bar, as a percentage from the left. */
export const techPos = (v: number) => Math.max(0, Math.min(100, (v + 100) / 2));
