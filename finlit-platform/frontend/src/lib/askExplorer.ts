// The question explorer of the full FinLit AI window (task #68, #59): six topics, each with questions anyone can ask without naming a company first,
// a search over all of them, and the small lists the window keeps in this browser (recent questions and saved questions).
import { MARKET_QUESTIONS, CONCEPT_QUESTIONS, PLATFORM_QUESTIONS, type Q } from "./askFlow";

export type Topic = { id: string; title: string; icon: string; questions: Q[] };
const q = (id: string, text: string): Q => ({ id, text });

export const TOPICS: Topic[] = [
  { id: "company", title: "Company Analysis", icon: "building", questions: [
    q("ex-c1", "What does the dashboard show for a company?"), q("ex-c2", "How do I read the income statement, balance sheet and cash flow?"),
    q("ex-c3", "What are the key strengths and risks of a company?"), q("ex-c4", "How does a company compare with its peers?"), q("ex-c5", "What are the key red flags in the financials?")] },
  { id: "metrics", title: "Financial Metrics", icon: "bars", questions: [
    q("ex-m1", "What is ROE and how is it different from ROCE?"), q("ex-m2", "What does the debt-to-equity ratio tell me?"), q("ex-m3", "How do I read operating margin and net margin?"),
    q("ex-m4", "What is free cash flow and why does it matter?"), q("ex-m5", "What is DuPont analysis?")] },
  { id: "valuation", title: "Valuation", icon: "layers", questions: [
    q("ex-v1", "What is P/E and how is it used?"), q("ex-v2", "What is the difference between P/E, P/B and EV/EBITDA?"), q("ex-v3", "How does a DCF valuation work?"),
    q("ex-v4", "What does dividend yield describe?"), q("ex-v5", "Why can a low P/E be misleading?")] },
  { id: "market", title: "Market & Economy", icon: "line", questions: MARKET_QUESTIONS.slice(0, 5) },
  { id: "concepts", title: "Investing Concepts", icon: "book", questions: CONCEPT_QUESTIONS },
  { id: "platform", title: "Platform & Features", icon: "table", questions: PLATFORM_QUESTIONS },
];

/** Every question in every topic whose words match the search (all the typed words must appear). */
export function searchQuestions(term: string): { topic: Topic; q: Q }[] {
  const w = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (!w.length) return [];
  return TOPICS.flatMap((t) => t.questions.filter((x) => w.every((k) => x.text.toLowerCase().includes(k))).map((x) => ({ topic: t, q: x })));
}

const KEY = { recent: "finlit-ai-recent", saved: "finlit-ai-saved" } as const;
const read = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 30) : []; } catch { return []; } };
const write = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v.slice(0, 30))); } catch { /* a private window: the list lasts for this visit */ } };
export const loadRecent = () => read(KEY.recent);
export const loadSaved = () => read(KEY.saved);
/** Newest first, no repeats, at most 20. */
export const pushRecent = (list: string[], text: string): string[] => { const n = [text, ...list.filter((x) => x !== text)].slice(0, 20); write(KEY.recent, n); return n; };
export const toggleSaved = (list: string[], text: string): string[] => { const n = list.includes(text) ? list.filter((x) => x !== text) : [text, ...list].slice(0, 30); write(KEY.saved, n); return n; };
export const clearRecent = () => { write(KEY.recent, []); return [] as string[]; };
