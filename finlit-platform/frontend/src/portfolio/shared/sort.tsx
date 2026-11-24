// Task #385 (developer file 33, Sorting): one sorting rule for every data table on the Equity portfolio. Text columns sort A to Z on the first
// click, figures high to low, words that rank by their rank (Strong > Healthy > Average or Fair > Weak; Leader > In line > Laggard; the nine trend
// readings in their order). In a grouped table, rows sort inside each group. ▲ ▼ beside the active heading, aria-sort set, Enter or Space sorts
// (the heading is a button). Blanks always go last. `sortRows` is pure; `useSort` holds the state; `SortHead` draws a heading.
import { useMemo, useState, type ReactNode } from "react";
import { rankOf, RANKS } from "./words";

export type SortKind = "text" | "num" | { rank: keyof typeof RANKS | readonly string[] };
export type SortCol<T> = { kind: SortKind; get: (row: T) => string | number | null | undefined };
export type SortState = { id: string; dir: 1 | -1 } | null;

/** The direction of the first click: A to Z for text (1 = ascending), high to low for figures and ranked words (−1). */
export const firstDir = (kind: SortKind): 1 | -1 => (kind === "text" ? 1 : -1);

function keyOf<T>(c: SortCol<T>, row: T): string | number | null {
  const v = c.get(row);
  if (v == null || v === "" || (typeof v === "number" && !Number.isFinite(v))) return null;
  if (typeof c.kind === "object") return rankOf(c.kind.rank, String(v));
  if (c.kind === "num") { if (typeof v === "number") return v; const n = parseFloat(String(v).replace(/[−]/g, "-").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : null; }
  return String(v).toLowerCase();
}

/** Rows in the order a column asks for. `groupOf`: rows keep their group's place and sort inside it. Stable: equal rows keep their order. */
export function sortRows<T>(rows: T[], col: SortCol<T> | undefined, dir: 1 | -1, groupOf?: (row: T) => string): T[] {
  if (!col) return rows;
  const idx = new Map(rows.map((r, i) => [r, i]));
  const cmp = (a: T, b: T) => {
    const x = keyOf(col, a), y = keyOf(col, b);
    if (x == null && y == null) return idx.get(a)! - idx.get(b)!;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y), "en") : (x as number) - (y as number);
    return c * dir || idx.get(a)! - idx.get(b)!;
  };
  if (!groupOf) return [...rows].sort(cmp);
  const order: string[] = [], by = new Map<string, T[]>();
  rows.forEach((r) => { const g = groupOf(r); if (!by.has(g)) { by.set(g, []); order.push(g); } by.get(g)!.push(r); });
  return order.flatMap((g) => by.get(g)!.sort(cmp));
}

/** The next state after a click on a heading: a new column starts in its first direction; the same column flips. */
export function nextSort(cur: SortState, id: string, kind: SortKind): SortState {
  return cur && cur.id === id ? { id, dir: (cur.dir === 1 ? -1 : 1) } : { id, dir: firstDir(kind) };
}

/** Sorting state for one table. `cols` by id; `initial` the state on load (null: the rows' own order). */
export function useSort<T>(rows: T[], cols: Record<string, SortCol<T>>, opts: { initial?: SortState; groupOf?: (row: T) => string } = {}) {
  const [s, set] = useState<SortState>(opts.initial ?? null);
  const sorted = useMemo(() => (s ? sortRows(rows, cols[s.id], s.dir, opts.groupOf) : rows), [rows, s, cols, opts.groupOf]);
  return {
    sorted, state: s, set,
    click: (id: string) => set((cur) => nextSort(cur, id, cols[id]?.kind ?? "num")),
    ariaSort: (id: string): "ascending" | "descending" | "none" => (s?.id === id ? (s.dir === 1 ? "ascending" : "descending") : "none"),
    arrow: (id: string) => (s?.id === id ? (s.dir === 1 ? "▲" : "▼") : ""),
  };
}

/** A sortable heading cell: the whole label is a button (Enter or Space sorts), ▲ ▼ beside the active one, aria-sort on the cell. `extra` sits after the
 *  button (an i, a note such as "Strong = cheaper"). */
export function SortHead({ id, label, sort, className, num, extra, title }: { id: string; label: ReactNode; sort: { click: (id: string) => void; ariaSort: (id: string) => "ascending" | "descending" | "none"; arrow: (id: string) => string };
  className?: string; num?: boolean; extra?: ReactNode; title?: string }) {
  return <th scope="col" className={[num ? "r" : "", className ?? ""].join(" ").trim() || undefined} aria-sort={sort.ariaSort(id)} title={title}>
    <button type="button" className="eqs-sort" onClick={() => sort.click(id)}>{label}<i aria-hidden="true">{sort.arrow(id)}</i></button>{extra}</th>;
}
