// Glossary data (generated from backend/finlit/normalize/glossary_data.json by backend/scripts/sync_glossary.py) and search.
import data from "../content/glossary.json";
import { cycleIndex, istDayNumber, wordOrder } from "./wordOfDay";

/** `change`: board 03 of the "FinLit final pages" pack marks the 7 new terms and the 35 renamed or rewritten ones of this update. */
export type Term = { id: string; term: string; letter: string; topic: string; meaning: string; why: string; how: string; formula: string; finlit: string; aliases: string[]; change?: "new" | "updated" };
export const TERMS = data.terms as Term[];
export const TOPICS = data.topics as string[];
export const LETTERS = ["0–9", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

/** Lower-case letters and digits only, so "EV / CFO", "ev-cfo" and "EVCFO" are the same. */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function within1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Score 0 = no match. Names and aliases first, then the text; one typo is tolerated in words of 4+ letters. */
export function score(t: Term, q: string): number {
  const nq = norm(q);
  if (!nq) return 1;
  const names = [t.term, ...t.aliases].map(norm);
  if (names.some((n) => n === nq)) return 100;
  if (names.some((n) => n.startsWith(nq))) return 80;
  if (names.some((n) => n.includes(nq))) return 60;
  const body = norm(`${t.meaning} ${t.why} ${t.how} ${t.formula}`);
  if (body.includes(nq)) return 30;
  if (nq.length >= 4) {
    const words = [t.term, ...t.aliases].join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    if (words.some((w) => within1(w, nq)) || names.some((n) => n.length >= 4 && n.length <= nq.length + 1 && within1(n, nq))) return 20;
  }
  return 0;
}

export function search(q: string, pool: Term[] = TERMS): Term[] {
  return pool.map((t) => [t, score(t, q)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || a[0].term.localeCompare(b[0].term)).map(([t]) => t);
}

/** Task #315: the order the Word of the Day walks: every term once before any repeats, shuffled with a fixed seed (lib/wordOfDay.ts). */
/** Neighbouring days never fall on terms next to each other A to Z (by id or as the glossary lists them) or on the same letter. */
export const WORD_ORDER: Term[] = (() => {
  const byId = new Map(TERMS.map((t, i) => [t.id, { t, i }]));
  const ids = TERMS.map((t) => t.id), sorted = [...ids].sort(), rank = new Map(sorted.map((id, i) => [id, i]));
  const clash = (a: string, b: string) => { const x = byId.get(a)!, y = byId.get(b)!; return x.t.letter === y.t.letter || Math.abs(x.i - y.i) === 1 || Math.abs(rank.get(a)! - rank.get(b)!) === 1; };
  return wordOrder(ids, clash).map((id) => byId.get(id)!.t);
})();
/** The term for an India day number (lib/wordOfDay.ts istDayNumber). */
export const termForDay = (day: number): Term => WORD_ORDER[cycleIndex(day, WORD_ORDER.length)];
/** Today's word, on the India calendar day (changes at midnight IST). The header's Word of the Day and the dashboard's Term of the day both read this. */
export const termOfTheDay = (now: number = Date.now()): Term => termForDay(istDayNumber(now));
