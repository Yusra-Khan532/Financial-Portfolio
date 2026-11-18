// Task #224 (results update pack of 18 Nov, A1): sort a table by any heading. First click: numbers high to low, words A to Z; second click: the other way;
// third click: back to the page's own order. Verdict words sort by rank (Strong > Good > Ahead > Agree > In line > Mixed > Weak > Behind > Poor), and a value
// that is not a number or a word ("—", "Not declared", null) always goes last. Rows are sorted as whole units, so a row and what belongs to it (its drawer,
// its note row) move together. Descriptive only.
import { useMemo, useState } from "react";

export type SortVal = number | string | null | undefined;
export type SortDir = "desc" | "asc";
export type SortState = { key: string; dir: SortDir } | null;

/** The rank of a verdict or reading word; null when the word is not one of them. */
export const RANK_WORDS = ["Strong", "Good", "Ahead", "Agree", "In line", "Mixed", "Weak", "Behind", "Poor"];
export function rankOf(v: SortVal): number | null {
  if (typeof v !== "string") return null;
  const i = RANK_WORDS.findIndex((w) => w.toLowerCase() === v.trim().toLowerCase());
  return i < 0 ? null : RANK_WORDS.length - i;
}
const BLANK = /^(—|–|-|not declared|n\/a|)$/i;
/** A value as the sort sees it: a number, a rank (as a number), a word, or a blank. */
export function sortKey(v: SortVal): { kind: "num"; n: number } | { kind: "text"; s: string } | { kind: "blank" } {
  if (typeof v === "number") return Number.isFinite(v) ? { kind: "num", n: v } : { kind: "blank" };
  if (v == null || BLANK.test(v.trim())) return { kind: "blank" };
  const r = rankOf(v);
  return r != null ? { kind: "num", n: r } : { kind: "text", s: v.trim() };
}
/** Compare two values for a sort direction: blanks last whatever the direction; "desc" means high to low for numbers and A to Z for words. */
export function compareVals(a: SortVal, b: SortVal, dir: SortDir): number {
  const x = sortKey(a), y = sortKey(b);
  if (x.kind === "blank" || y.kind === "blank") return x.kind === y.kind ? 0 : x.kind === "blank" ? 1 : -1;
  if (x.kind === "num" && y.kind === "num") return dir === "desc" ? y.n - x.n : x.n - y.n;
  const s = (k: typeof x) => (k.kind === "num" ? String(k.n) : k.kind === "text" ? k.s : "");
  const c = s(x).localeCompare(s(y), "en", { sensitivity: "base", numeric: true });
  return dir === "desc" ? c : -c;
}
/** The next state of a heading's three-click cycle. */
export function nextSort(cur: SortState, key: string): SortState {
  if (!cur || cur.key !== key) return { key, dir: "desc" };
  return cur.dir === "desc" ? { key, dir: "asc" } : null;
}
/** Sorted rows (a stable sort; the page's own order on a tie and when no sort is on). */
export function sortRows<T>(rows: T[], get: (r: T, key: string) => SortVal, s: SortState): T[] {
  if (!s) return rows;
  return rows.map((r, i) => ({ r, i })).sort((a, b) => compareVals(get(a.r, s.key), get(b.r, s.key), s.dir) || a.i - b.i).map((x) => x.r);
}
export function useTableSort<T>(rows: T[], get: (r: T, key: string) => SortVal) {
  const [s, setS] = useState<SortState>(null);
  const sorted = useMemo(() => sortRows(rows, get, s), [rows, s]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { sorted, sort: s, toggle: (key: string) => setS((c) => nextSort(c, key)), reset: () => setS(null) };
}
