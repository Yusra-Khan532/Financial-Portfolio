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

/** Developer file 43 (founder, 27 Nov 2026: "reduce the size, use a drop-down or whatever suits"): the industry's 6-month returns as one strip of dots.
 *  Each stock's place along the strip (0 to 100, from the lowest return to the highest, 0% always inside) and its lane: dots closer than `gap` take the
 *  next lane up, so none hides another (at most `lanes` lanes; past that a dot goes to the lane whose last dot is furthest away). */
export function stripDots(values: (number | null | undefined)[], gap = 1.8, lanes = 4): { lo: number; hi: number; at: (v: number) => number; dots: ({ i: number; pos: number; lane: number } | null)[] } {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  let lo = Math.min(0, ...nums), hi = Math.max(0, ...nums); const pad = (hi - lo) * 0.03 || 1; lo -= pad; hi += pad;
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const order = values.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => typeof x[0] === "number" && Number.isFinite(x[0])).sort((a, b) => a[0] - b[0]);
  const last: number[] = [], dots: ({ i: number; pos: number; lane: number } | null)[] = values.map(() => null);
  for (const [v, i] of order) {
    const pos = at(v);
    let lane = last.findIndex((x) => pos - x >= gap);
    if (lane < 0) { if (last.length < lanes) lane = last.length; else lane = last.reduce((b, x, k) => (x < last[b] ? k : b), 0); }
    last[lane] = pos; dots[i] = { i, pos, lane };
  }
  return { lo, hi, at, dots };
}
