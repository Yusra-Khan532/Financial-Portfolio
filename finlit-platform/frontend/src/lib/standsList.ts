// Section 14 "Where it stands", tab 1, "Inside its industry: 6-month return" (task #222, 19 Nov pack B2): an industry with more than 15 counted stocks
// shows a short list by default (the top 5, the company with the 2 stocks above and the 2 below it, the bottom 5; groups that touch merge, nothing
// repeats) with "N more" gap lines between them, a rank line under the legend, and "Show all N" for every stock.

export type ListItem = { kind: "row"; i: number } | { kind: "gap"; n: number };

/** The rows of the short list, best first, with the gaps between them; every row when there are 15 or fewer (or the company is not in the list). */
export function shortList(n: number, me: number, all = false): ListItem[] {
  if (all || n <= 15) return Array.from({ length: n }, (_, i) => ({ kind: "row", i }));
  const keep = new Set<number>();
  for (let i = 0; i < Math.min(5, n); i++) keep.add(i);
  for (let i = Math.max(0, n - 5); i < n; i++) keep.add(i);
  if (me >= 0) for (let i = me - 2; i <= me + 2; i++) if (i >= 0 && i < n) keep.add(i);
  const out: ListItem[] = [];
  let skipped = 0;
  for (let i = 0; i < n; i++) {
    if (keep.has(i)) { if (skipped) out.push({ kind: "gap", n: skipped }); skipped = 0; out.push({ kind: "row", i }); }
    else skipped++;
  }
  return out;
}

/** The middle stock's return (the average of the two middle ones for an even count), or null. */
export function median(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
