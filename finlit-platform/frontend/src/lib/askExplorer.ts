// The question explorer of the full FinLit AI window (task #68, #59): six topics, each with questions anyone can ask without naming a company first,
// a search over all of them, and the small lists the window keeps in this browser (recent questions and saved questions).
import { MARKET_QUESTIONS, CONCEPT_QUESTIONS, PLATFORM_QUESTIONS, type Q } from "./askFlow";

export type Topic = { id: string; title: string; icon: string; questions: Q[] };
const q = (id: string, text: string): Q => ({ id, text });

/** Task #138: FinLit AI answers its listed questions from written text (no language model); these are the explorer's own general questions. */
export const EXPLORER_ANSWERS: Record<string, string> = {
  "ex-c1": "A company's report on FinLit shows its FinLit Prism score with its four parts (on a plan that has it), the share price chart, the profit and loss, balance sheet and cash flow for each year and quarter, its ratios (valuation, returns, margins, debt), how it compares with its peers, its shareholding, dividends and corporate actions, its business segments and its latest results. Every figure carries its period and source. Information only, not investment advice.",
  "ex-c2": "The income statement (profit and loss) shows what a company earned and spent over a year or quarter: revenue, costs, operating profit, interest, tax and net profit. The balance sheet is a snapshot on one date: what it owns (assets), what it owes (borrowings and other liabilities) and the shareholders' money (net worth). The cash flow statement shows the cash that actually came in and went out from operations, investments and financing. Reading them together shows whether profit turns into cash and how the company is funded. Information only, not investment advice.",
  "ex-c3": "Strengths and risks come from the figures: steady growth in revenue and profit, high returns on capital, low debt and profit backed by operating cash are usually described as strengths; shrinking margins, rising debt, profit not turning into cash or a falling share of promoter holding are usually described as risks. On FinLit, each company's report lists its strengths and watch-outs from its own figures. Information only, not investment advice.",
  "ex-c4": "Comparing with peers means looking at the same figures side by side for companies in the same business: growth, margins, returns on capital, debt and valuation. A figure that looks high or low on its own often reads differently next to peers. FinLit's company report has a Peers section, and Compare Companies puts companies side by side (two at a time on Silver, four on Gold). Information only, not investment advice.",
  "ex-c5": "Common red flags in a company's figures: debt rising while margins fall, receivable days rising year after year (customers taking longer to pay), operating cash flow below net profit for several years, returns on capital falling three years running, and a high share of promoter holding pledged. One flag alone is not a verdict; it is a reason to look closer at the figures. Information only, not investment advice.",
  "ex-m1": "ROE (return on equity) is net profit divided by shareholders' equity: what the company earns on the owners' money. ROCE (return on capital employed) is operating profit before interest and tax divided by all the capital used (equity plus debt): what it earns on all the money in the business. A company with a lot of debt can show a high ROE but a lower ROCE; ROCE shows how well the whole business uses its capital. Information only, not investment advice.",
  "ex-m2": "Debt to equity is total borrowings divided by shareholders' equity. A ratio of 0.5 means the company owes half as much as its owners have put in. A higher ratio means more of the business is funded by lenders, which raises interest costs and makes profit swing more with the business cycle; banks and lenders naturally run higher ratios. Information only, not investment advice.",
  "ex-m3": "Operating margin is operating profit divided by revenue: how much of each rupee of sales is left after running the business, before interest and tax. Net margin is net profit divided by revenue: what is left after everything, including interest, depreciation and tax. A wide gap between the two usually comes from heavy interest, depreciation or one-off items. Information only, not investment advice.",
  "ex-m4": "Free cash flow is operating cash flow minus capital expenditure: the cash left after the company has paid to keep and grow its assets. It is the cash that can pay dividends, repay debt or repurchase shares. Profit can be high while free cash flow is low (for example when money is tied up in stock or customer dues), so the two are read together. Information only, not investment advice.",
  "ex-m5": "DuPont analysis splits ROE into three parts: net margin (profit per rupee of sales) × asset turnover (sales per rupee of assets) × financial leverage (assets per rupee of equity). It shows whether a company's ROE comes from good margins, from using its assets efficiently, or from borrowing. FinLit's company report shows the DuPont breakdown for each company. Information only, not investment advice.",
  "ex-v1": "P/E (price to earnings) is the share price divided by earnings per share, or market cap divided by net profit: how many rupees investors pay for each rupee of yearly profit. It is used to compare a company with its own past and with peers. A loss-making company has no meaningful P/E. Information only, not investment advice.",
  "ex-v2": "P/E compares price with profit, P/B (price to book) compares price with net worth on the balance sheet, and EV/EBITDA compares the whole business value (market cap plus debt minus cash) with operating profit before depreciation. P/B is often used for banks and asset-heavy firms; EV/EBITDA lets companies with different debt levels be compared fairly. Information only, not investment advice.",
  "ex-v3": "A DCF (discounted cash flow) valuation estimates the cash a company may generate in future years and brings each year's cash back to today's value with a discount rate, then adds a value for the years after. The result depends heavily on the growth, margin and discount-rate assumptions, so it is a range, not a single true price. FinLit's DCF calculator lets you set those assumptions yourself. Information only, not investment advice.",
  "ex-v4": "Dividend yield is the dividends paid per share over the last 12 months divided by the share price. It describes the cash return from dividends alone at today's price; it says nothing about price changes, and a yield can look high simply because the price has fallen. Information only, not investment advice.",
  "ex-v5": "A low P/E can be misleading when profit is unusually high for one year (a one-off gain or a cyclical peak), when profit is expected to fall, when the company carries heavy debt, or when its earnings are of lower quality (profit not backed by cash). Comparing P/E with the company's own history and with peers, and reading it with growth and debt, gives a fuller picture. Information only, not investment advice.",
};

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

// The ⋯ menu on a History chat (owner, 25 Nov 2026): pin it to the top, rename it, take it out of History. Kept in this browser, like the list itself.
const PIN = "finlit-ai-pinned", NAMES = "finlit-ai-names";
export const loadPinned = () => read(PIN);
export const togglePinned = (list: string[], text: string): string[] => { const n = list.includes(text) ? list.filter((x) => x !== text) : [text, ...list].slice(0, 30); write(PIN, n); return n; };
export const loadNames = (): Record<string, string> => {
  try { const v = JSON.parse(localStorage.getItem(NAMES) || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([k, x]) => typeof k === "string" && typeof x === "string").slice(0, 60)) as Record<string, string> : {}; } catch { return {}; }
};
const writeNames = (v: Record<string, string>) => { try { localStorage.setItem(NAMES, JSON.stringify(v)); } catch { /* a private window */ } };
/** A name of its own for a chat (at most 80 characters); an empty name brings back the question itself. */
export const renameChat = (names: Record<string, string>, text: string, name: string): Record<string, string> => {
  const n = { ...names }; const t = name.trim().slice(0, 80);
  if (!t || t === text) delete n[text]; else n[text] = t;
  writeNames(n); return n;
};
/** Delete takes the chat out of History, the pins and the names (Saved Questions are kept: they have their own ×). */
export const removeRecent = (list: string[], text: string): string[] => { const n = list.filter((x) => x !== text); write(KEY.recent, n); return n; };
/** The side list: pinned chats first (kept even when newer questions push them out of the newest 20), then the newest others, `limit` of them. */
export const sideList = (recent: string[], pinned: string[], limit = 5): { text: string; pinned: boolean }[] =>
  [...pinned.map((text) => ({ text, pinned: true })), ...recent.filter((x) => !pinned.includes(x)).slice(0, limit).map((text) => ({ text, pinned: false }))];
