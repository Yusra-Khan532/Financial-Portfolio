// The structure of the Ask FinLit AI panel (task #46): Landing (general) -> Choose a segment -> Company context with tabs -> Ask & get an answer ->
// Keep exploring, with the company kept. Everything here is plain data and pure functions, so the panel stays small and the flow is testable.
// The questions describe; none asks for or offers advice.
import { bankGroups, isLenderSector, SECOND, STARTERS } from "./questionBank";
import suggestions from "../content/questionSuggestions.json";

export type CategoryId = "company" | "market" | "concepts" | "platform";
export const CATEGORIES: { id: CategoryId; title: string; sub: string; icon: string }[] = [
  { id: "company", title: "Explore a company", sub: "Financials, ratios, risks", icon: "building" },
  { id: "market", title: "Market & economy", sub: "Trends, sectors, policies", icon: "line" },
  { id: "concepts", title: "Investment concepts", sub: "P/E, DCF, valuation etc.", icon: "book" },
  { id: "platform", title: "Platform & tools", sub: "Screener, scores, features", icon: "table" },
];

/** The company tabs, and which of the 12 question groups each one holds. "Suggested" is the five most asked questions. */
export type TabId = "suggested" | "financials" | "valuation" | "business" | "outlook";
export const TABS: { id: TabId; label: string; groups: number[] }[] = [
  { id: "suggested", label: "Suggested questions", groups: [] },
  { id: "financials", label: "Financials", groups: [2, 3, 4, 5] },
  { id: "valuation", label: "Valuation", groups: [6, 8] },
  { id: "business", label: "Business", groups: [1, 7, 10, 11] },
  { id: "outlook", label: "Outlook & Risks", groups: [9, 12] },
];

/** Step 2: what "Explore a company" offers before a company is chosen; each opens its company tab. */
export const SEGMENTS: { id: Exclude<TabId, "suggested">; title: string; sub: string; icon: string }[] = [
  { id: "financials", title: "Financial performance", sub: "Revenue, profit, margins, growth", icon: "bars" },
  { id: "valuation", title: "Valuation & returns", sub: "P/E, EV/EBITDA, price and returns", icon: "line" },
  { id: "business", title: "Business & segment analysis", sub: "Segments, ownership, how it compares", icon: "building" },
  { id: "outlook", title: "Outlook & risks", sub: "Model scores, red flags, key risks", icon: "gauge" },
];

/** Indian financial year quarters: Q1 is April to June, Q4 is January to March. */
export const QUARTERS: { n: 1 | 2 | 3 | 4; months: string }[] = [
  { n: 1, months: "Apr–Jun" }, { n: 2, months: "Jul–Sep" }, { n: 3, months: "Oct–Dec" }, { n: 4, months: "Jan–Mar" },
];
export const quarterQuestion = (sym: string, q: { n: number; months: string }, fy?: string): string =>
  fy ? `How did ${sym} do in Q${q.n} of ${fy} (${q.months}): revenue, profit and margins against the same quarter a year earlier?`
    : `How did ${sym} do in Q${q.n} (${q.months}) of the latest financial year: revenue, profit and margins against the same quarter a year earlier?`;
/** The financial years to pick from (April to March, named by the year they end in): the current one and the three before it. */
export const financialYears = (today: Date = new Date()): string[] => {
  const end = today.getMonth() >= 3 ? today.getFullYear() + 1 : today.getFullYear();
  return [0, 1, 2, 3].map((k) => `FY${String(end - k).slice(2)}`);
};
export const quarterTrendQuestion = (sym: string): string => `How have ${sym}'s revenue and profit moved quarter by quarter (Q1 to Q4) over the last two financial years?`;

export type Q = { id: string; text: string; needsSecondCompany?: boolean };

const fill = (t: string, sym: string) => t.replace(/\{company_2\}/g, SECOND).replace(/\{company\}/g, sym).replace(/\{n\}/g, "5");

/** The questions of one company tab, with the company filled in. */
export function tabQuestions(tab: TabId, sym: string, lender: boolean): Q[] {
  if (tab === "suggested") return suggestions.company.slice(0, 5).map((q) => ({ id: q.id, text: fill(q.text, sym) }));
  const groups = TABS.find((t) => t.id === tab)?.groups ?? [];
  return bankGroups(`/stocks/${sym}`, { lender }).filter((g) => groups.includes(g.n)).flatMap((g) => g.items);
}

/** Market & economy: general questions the assistant answers from its language model (they name no company). */
export const MARKET_QUESTIONS: Q[] = [
  { id: "m1", text: "What do FII and DII flows tell us about the market?" },
  { id: "m2", text: "How do interest rates and the repo rate affect the stock market?" },
  { id: "m3", text: "What does it mean when the Nifty 50 is above or below its 200-day average?" },
  { id: "m4", text: "Which sectors have been leading the market, and how can I see it on FinLit?" },
];
const starter = (i: number): Q => ({ id: "s" + i, text: STARTERS[i].q });
/** Investment concepts and Platform & tools answer at once from the written starters (no model call). */
export const CONCEPT_QUESTIONS: Q[] = [starter(3), starter(2), starter(4)];
export const PLATFORM_QUESTIONS: Q[] = [starter(0), starter(1), starter(5)];
export const writtenAnswer = (text: string): string | undefined => STARTERS.find((s) => s.q === text)?.a;

export const categoryQuestions = (c: Exclude<CategoryId, "company">): Q[] => (c === "market" ? MARKET_QUESTIONS : c === "concepts" ? CONCEPT_QUESTIONS : PLATFORM_QUESTIONS);

/** Related questions after an answer: the next ones from the same list that have not been asked yet (at most 3), so the user keeps exploring with the context kept. */
export function related(pool: Q[], asked: string[], limit = 3): Q[] {
  const done = new Set(asked);
  return pool.filter((q) => !done.has(q.text) && !q.needsSecondCompany).slice(0, limit);
}

export { isLenderSector };
