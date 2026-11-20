// Task #268 (20 Nov 2026, the team: "make sure to have both predefined questions getting as suggested when a user searches if it is not in sugeested
// then it moves for claude api"): what the typing box offers, grouped the way the team's reference shows it (a group heading, then each question with a
// short note on the right), and the last line that says where a question no listed one covers goes.
import { MARKET_QUESTIONS, TABS, type Q } from "./askFlow";
import { TOPICS } from "./askExplorer";

export type SuggestGroup = { title: string; items: Q[] };

const MARKET_IDS = new Set(MARKET_QUESTIONS.map((q) => q.id));
const TOPIC_OF = new Map(TOPICS.flatMap((t) => t.questions.map((q) => [q.id, t.title] as const)));
const TAB_OF_GROUP = new Map(TABS.flatMap((t) => t.groups.map((g) => [g, t.label] as const)));

/** The heading a listed question sits under: a company question under its company tab (Financials, Valuation, Business, Outlook & Risks), a general
 *  one under its topic, a starter under "Start here", a market question under "Markets & Economy". */
export function groupOf(q: Q, company?: string | null): string {
  const c = /^C\.(\d+)\./.exec(q.id);
  if (c) return `${company ? company + " · " : ""}${TAB_OF_GROUP.get(Number(c[1])) ?? "Company"}`;
  if (/^s\d+$/.test(q.id)) return "Start here";
  if (MARKET_IDS.has(q.id)) return "Markets & Economy";
  return TOPIC_OF.get(q.id) ?? "Listed questions";
}

/** The matches in groups, best match first: a group appears where its best question ranks, its questions in their rank order. */
export function groupSuggestions(qs: readonly Q[], company?: string | null): SuggestGroup[] {
  const out: SuggestGroup[] = [];
  for (const q of qs) {
    const t = groupOf(q, company);
    const g = out.find((x) => x.title === t);
    if (g) g.items.push(q); else out.push({ title: t, items: [q] });
  }
  return out;
}

export type Fallback = { label: string; note: string };
/** The last line of the list: what Enter does with the words as typed when no listed question is picked. Silver and Gold (written answers on, questions
 *  left): FinLit AI writes the answer. A visitor or Basic member: the listed questions, and written answers are part of Silver and Gold. Written answers
 *  switched off: the closest listed questions. */
export function fallbackLine(text: string, aiReady: boolean, aiPlan: boolean, left?: number | null): Fallback {
  const t = text.trim();
  if (aiReady) return { label: `Ask FinLit AI: “${t}”`, note: `A written answer${left != null ? ` · ${left} left this month` : ""}` };
  if (aiPlan) return { label: `Ask “${t}”`, note: "Written answers are part of Silver and Gold" };
  return { label: `Search the listed questions for “${t}”`, note: "The closest ones answer at once" };
}
