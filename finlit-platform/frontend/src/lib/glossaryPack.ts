// Words and groupings of the Glossary page as the "FinLit final pages" pack draws it (board 02, 13 Nov 2026), from the glossary data itself
// (content/glossary.json, built from backend/finlit/normalize/glossary_data.json). The `change` mark on a term is board 03's change list: 7 new terms and
// 35 renamed, rewritten or with the scoring rules taken off. Pure functions, tested in glossaryPack.test.ts against the pack's own figures.
import type { Term } from "./glossary";

export type Tab = "az" | "fw" | "nu";
export const FINLIT_WORDS = "FinLit words";
export const DESC = (n: number) => `The language of investing in plain words: ${n} terms from A to Z. Each says what it means, why it matters and how to use it, with the formula where there is a standard one, and how FinLit measures it.`;
export const SEARCH_HINT = (n: number) => `Search ${n} terms, for example "P/E", "Sold off" or "Company size"`;
export const EDU = "For education only; not investment, tax or legal advice.";
export const FOOT = "Definitions are for education only. FinLit Ventures is a technology company and is not registered with SEBI as an investment adviser or research analyst.";

export type Counts = { terms: number; topics: number; added: number; updated: number; finlit: number };
export function counts(terms: Term[], topics: string[]): Counts {
  return { terms: terms.length, topics: topics.length, added: terms.filter((t) => t.change === "new").length, updated: terms.filter((t) => t.change === "updated").length,
    finlit: terms.filter((t) => t.topic === FINLIT_WORDS).length };
}

/** The four tiles under the search box. */
export const tiles = (c: Counts) => [
  { k: "Terms", v: c.terms, s: "from A to Z" }, { k: "Topics", v: c.topics, s: "pick one on the left" },
  { k: "New this update", v: c.added, s: "words used on the new pages" }, { k: "Updated this update", v: c.updated, s: "renamed or rewritten" },
];
/** The three big buttons: Browse A to Z, FinLit words, New and updated. */
export const tabs = (c: Counts): { id: Tab; title: string; sub: string }[] => [
  { id: "az", title: "Browse A to Z", sub: `All ${c.terms} terms, by letter or topic` },
  { id: "fw", title: "FinLit words", sub: `${c.finlit} terms behind the scores and labels` },
  { id: "nu", title: "New and updated", sub: `${c.added + c.updated} terms added or changed` },
];

/** The terms of one letter (or all, when letter is ""), in one topic (or all), optionally only the new and updated ones, A to Z. */
export function pick(terms: Term[], o: { letter?: string; topic?: string; changed?: boolean }): Term[] {
  return terms.filter((t) => (!o.letter || t.letter === o.letter) && (!o.topic || t.topic === o.topic) && (!o.changed || !!t.change)).sort((a, b) => a.term.localeCompare(b.term));
}
/** How many terms each letter holds under the same topic and change filter (the letter buttons and "Other letters"). */
export function letterCounts(terms: Term[], letters: string[], o: { topic?: string; changed?: boolean }): Record<string, number> {
  return Object.fromEntries(letters.map((l) => [l, pick(terms, { ...o, letter: l }).length]));
}
/** The first letter that has any term, so the page never opens on an empty letter. */
export const firstLetter = (n: Record<string, number>, letters: string[]) => letters.find((l) => n[l] > 0) ?? letters[0];
/** "21 terms · select a term to open it". */
export const countLine = (n: number) => `${n} term${n === 1 ? "" : "s"} · select a term to open it`;
/** The badge beside a changed term. */
export const badge = (t: Term): string | null => (t.change === "new" ? "New" : t.change === "updated" ? "Updated" : null);
