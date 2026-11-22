// Task #315: Word of the Day. The India calendar day, the seeded order of the glossary that walks every term once before any repeats,
// the formula laid out as parts, and the member's bookmarks (prefs.wordBookmarks, newest first) and last-opened day (prefs.wordSeen).
// This file does not import the glossary (300 KB): the header reads only the day and the prefs, and the panel loads the terms when it opens.
import { prefs } from "./prefs";

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000;

/** The India (Asia/Kolkata, UTC+05:30, no daylight saving) calendar day as a whole number: it changes at midnight IST, not at 05:30. */
export const istDayNumber = (ms: number = Date.now()): number => Math.floor((ms + IST) / DAY);
/** The India calendar date, `YYYY-MM-DD`. */
export const istDate = (ms: number = Date.now()): string => new Date(istDayNumber(ms) * DAY).toISOString().slice(0, 10);

/** Day 0 of the cycle: 23 Nov 2026 IST, the day the Word of the Day started. Fixed, so today's word stays put between deploys
 *  (only a change to the list of terms reshuffles the order). */
export const WORD_EPOCH = istDayNumber(Date.parse("2026-11-23T00:00:00+05:30"));
const SEED = 0x315_2026;

/** A small seeded random number generator (mulberry32): the same seed always gives the same order on every device. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two ids that must not fall on neighbouring days. The default: next to each other A to Z, or the same first letter. */
export type Clash = (a: string, b: string) => boolean;
const nextTo = (ids: readonly string[]): Clash => { const r = new Map(ids.map((id, i) => [id, i])); return (a, b) => Math.abs(r.get(a)! - r.get(b)!) === 1; };

/** A fixed shuffled order of ALL the ids. The ids are sorted first, so the order does not depend on how the list arrives; every id appears exactly once,
 *  so a full cycle has no repeat; and no two neighbouring days (the last and first day of a cycle included) clash. */
export function wordOrder(ids: readonly string[], clashes?: Clash): string[] {
  const sorted = [...ids].sort();
  const n = sorted.length;
  if (n < 4) return sorted;
  const near = nextTo(sorted);
  const bad: Clash = clashes ?? ((a, b) => near(a, b) || a[0] === b[0]);
  const order = [...sorted];
  const r = rng(SEED);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const at = (i: number) => order[((i % n) + n) % n];
  /** Would the id at position i fit between its neighbours if it were `id`, ignoring position `skip` (the one it is swapped with)? */
  const fits = (i: number, id: string, skip: number) => [i - 1, i + 1].every((k) => { const kk = ((k % n) + n) % n; return kk === skip ? !bad(id, order[i % n]) : !bad(id, order[kk]); });
  // Repair: where a day clashes with the day before it, swap it with the first later id that fits on both sides (deterministic).
  for (let pass = 0; pass < 8; pass++) {
    let fixed = true;
    for (let i = 1; i <= n; i++) {
      const p = i % n;
      if (!bad(at(p - 1), order[p])) continue;
      fixed = false;
      for (let k = 1; k < n; k++) {
        const j = (p + k) % n;
        if (j === (p - 1 + n) % n) continue;
        if (fits(p, order[j], j) && fits(j, order[p], p)) { [order[p], order[j]] = [order[j], order[p]]; break; }
      }
    }
    if (fixed) break;
  }
  return order;
}

/** The position in the cycle for an India day number (works for days before the epoch too). */
export const cycleIndex = (day: number, n: number): number => (((day - WORD_EPOCH) % n) + n) % n;

// ------------------------------------------------------------------ the formula as parts: "ROE = Net margin × Asset turnover × Equity multiplier"
export type FormulaRow = { lhs: string; parts: string[]; ops: string[] } | { text: string };
const OPS = new Set(["×", "÷", "+", "−", "/", "-"]);

/** Splits `s` at the top level (outside brackets and |…|) wherever `at(s, i)` gives a separator length; null when the brackets do not balance. */
function splitTop(s: string, at: (s: string, i: number) => number): { pieces: string[]; seps: string[] } | null {
  const pieces: string[] = [], seps: string[] = [];
  let depth = 0, bar = false, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") { if (--depth < 0) return null; }
    else if (c === "|") bar = !bar;
    else if (depth === 0 && !bar) {
      const len = at(s, i);
      if (len > 0) { pieces.push(s.slice(start, i)); seps.push(s.slice(i, i + len)); start = i + len; i += len - 1; }
    }
  }
  if (depth !== 0 || bar) return null;
  pieces.push(s.slice(start));
  return { pieces, seps };
}

/** One clause, "X = a op b op c", as parts; null when it does not split cleanly. */
function clause(s: string): FormulaRow | null {
  const eq = splitTop(s, (t, i) => (t.startsWith(" = ", i) ? 3 : 0));
  if (!eq || eq.pieces.length !== 2) return null;
  const lhs = eq.pieces[0].trim(), rhs = eq.pieces[1].trim();
  if (!lhs || !rhs || lhs.length > 40) return null;
  // A comma, "or" or "where" outside brackets means words, not a sum of parts ("…, where k = 2 ÷ (n + 1)").
  const words = splitTop(rhs, (t, i) => (t[i] === "," || t.startsWith(" or ", i) || t.startsWith(" where ", i) ? 1 : 0));
  if (!words || words.pieces.length !== 1) return null;
  const sp = splitTop(rhs, (t, i) => (t[i] === " " && OPS.has(t[i + 1]) && t[i + 2] === " " ? 3 : 0));
  if (!sp) return null;
  const parts = sp.pieces.map((p) => p.trim());
  if (parts.some((p) => !p || /^[×÷+/]/.test(p)) || parts.length > 6) return null;
  return { lhs, parts, ops: sp.seps.map((o) => o.trim()) };
}

/** The glossary `formula` laid out for the formula box: one row per clause (split at ";" and line breaks), each either "X =" with its parts
 *  and operators, or the clause as plain text when it does not split cleanly. Null when there is no formula (the box is left out). */
export function parseFormula(formula: string | null | undefined): FormulaRow[] | null {
  const f = (formula ?? "").trim();
  if (!f) return null;
  const rows = splitTop(f, (t, i) => (t[i] === ";" || t[i] === "\n" ? 1 : 0));
  const clauses = (rows ? rows.pieces : [f]).map((c) => c.trim()).filter(Boolean);
  return clauses.map((c) => clause(c) ?? { text: c });
}

// ------------------------------------------------------------------ bookmarks and the "new today" dot (stored in prefs, synced for members)
export const MAX_BOOKMARKS = 200;
export const isBookmarked = (id: string, list: readonly string[] = prefs.get().wordBookmarks) => list.includes(id);
/** Adds the word at the top (newest first) or takes it off; returns whether it is bookmarked now. */
export function toggleBookmark(id: string): boolean {
  const list = prefs.get().wordBookmarks;
  const on = !list.includes(id);
  prefs.set({ wordBookmarks: on ? [id, ...list.filter((x) => x !== id)].slice(0, MAX_BOOKMARKS) : list.filter((x) => x !== id) });
  return on;
}
export const removeBookmark = (id: string) => { const list = prefs.get().wordBookmarks; if (list.includes(id)) prefs.set({ wordBookmarks: list.filter((x) => x !== id) }); };
/** The gold dot shows until today's word has been opened. */
export const wordIsNew = (seen: string, ms: number = Date.now()) => seen !== istDate(ms);
export const markWordSeen = (ms: number = Date.now()) => { const d = istDate(ms); if (prefs.get().wordSeen !== d) prefs.set({ wordSeen: d }); };
