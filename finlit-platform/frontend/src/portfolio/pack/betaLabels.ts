// Task #388 (developer file 36, change 10): the labels on the beta scale of "How your list's beta is built" ("1.29× Your list", "1.38× Large" ...).
//   One row (a laptop), when every label fits side by side (their widths plus 8 px gaps are less than the scale's width): each label is centred over its
//   point; where neighbours overlap they join into one group, placed so its labels sit, on average, centred over their points, and kept inside the scale;
//   repeated until nothing overlaps. A curved line (cubic, vertical at both ends) runs from the bottom middle of each label to its point. Label row 24 px
//   plus 34 px for the lines.
//   Rows (a phone), when they do not fit in one row: each label starts 8 px left of its point (or ends 8 px right of it when there is no room on the right),
//   with a straight line down to the point. Points are placed from the rightmost; each label takes the lowest row where it does not touch another label in
//   that row, no line from a higher label crosses it, and its own line crosses no lower label. 30 px a row.
//   Points close together (a list's figure is the average of its sizes, so it often sits within a few pixels of one) can leave no clean place for
//   vertical lines: three points within about 12 px cannot all be read that way. Then the labels step up one a row, leftmost point on top, each label
//   starting 8 px left of its point or just right of the lines above it, with a straight line (a slight slant) to its point: nothing touches or crosses.
// Pure: widths in, positions and lines out (RiskPack.tsx BetaScale measures and draws). Never advice.

export type ScaleLabel = { key: string; /** the point on the scale, px from its left */ x: number; /** the label's width, px */ w: number };
export type PlacedLabel = ScaleLabel & { left: number; top: number; row: number };
export type ScaleLine = { key: string; x1: number; y1: number; x2: number; y2: number; curve: boolean; d: string };
export type ScaleLayout = { mode: "row" | "rows"; height: number; labels: PlacedLabel[]; lines: ScaleLine[] };

export const GAP = 8, LABEL_H = 24, CURVE_H = 34, ROW_H = 30, ROW_BASE = 14, CLEAR = 4;

/** True when every label fits side by side in one row. */
export const fitsOneRow = (labels: ScaleLabel[], width: number) => labels.reduce((a, l) => a + l.w, 0) + GAP * Math.max(0, labels.length - 1) < width;

function oneRow(labels: ScaleLabel[], width: number): ScaleLayout {
  const ms = [...labels].sort((a, b) => a.x - b.x);
  type Group = { it: { l: ScaleLabel; off: number }[]; w: number };
  let groups: Group[] = ms.map((l) => ({ it: [{ l, off: 0 }], w: l.w }));
  // a group's left edge: its labels, on average, centred over their points; kept inside the scale
  const left = (g: Group) => Math.max(0, Math.min(width - g.w, g.it.reduce((a, q) => a + (q.l.x - q.l.w / 2 - q.off), 0) / g.it.length));
  for (let guard = 0; guard < 200; guard++) {
    let hit = false;
    for (let i = 0; i < groups.length - 1; i++) {
      const a = groups[i], b = groups[i + 1];
      if (left(a) + a.w + GAP > left(b)) {
        const joined: Group = { it: [...a.it, ...b.it.map((q) => ({ l: q.l, off: q.off + a.w + GAP }))], w: a.w + GAP + b.w };
        groups = [...groups.slice(0, i), joined, ...groups.slice(i + 2)];
        hit = true; break;
      }
    }
    if (!hit) break;
  }
  const height = LABEL_H + CURVE_H, placed: PlacedLabel[] = [], lines: ScaleLine[] = [];
  groups.forEach((g) => { const l0 = left(g); g.it.forEach((q) => { const lft = l0 + q.off; placed.push({ ...q.l, left: lft, top: 0, row: 0 });
    const x1 = lft + q.l.w / 2, y1 = LABEL_H, x2 = q.l.x, y2 = height;
    lines.push({ key: q.l.key, x1, y1, x2, y2, curve: true, d: `M${r(x1)} ${y1} C${r(x1)} ${r(y1 + (y2 - y1) * 0.6)} ${r(x2)} ${r(y1 + (y2 - y1) * 0.4)} ${r(x2)} ${y2}` }); }); });
  return { mode: "row", height, labels: placed, lines };
}

/** Rows, file 36's rule: points from the rightmost; each label starts 8 px left of its point (ends 8 px right of it with no room on the right), straight down;
 *  the lowest row where it touches no label in that row, no higher label's line crosses it and its line crosses no lower label. A place that would cover a
 *  point still to be placed is taken only when nothing else fits. Returns null when some label has no clean place (points too close for vertical lines). */
function rowsByRule(labels: ScaleLabel[], width: number): PlacedLabel[] | null {
  const placed: PlacedLabel[] = [], todo = [...labels].sort((a, b) => b.x - a.x);
  const inside = (x: number, p: { left: number; w: number }) => x > p.left - CLEAR && x < p.left + p.w + CLEAR;
  for (let k = 0; k < todo.length; k++) {
    const o = todo[k], later = todo.slice(k + 1), room = o.x - GAP + o.w <= width, clamp = (l: number) => Math.max(0, Math.min(width - o.w, l));
    const tries = [...new Set([room ? o.x - GAP : o.x - o.w + GAP, room ? o.x - o.w + GAP : o.x - GAP].map(clamp))].filter((l) => o.x >= l + 2 && o.x <= l + o.w - 2);
    const fits = (l: number, row: number) => placed.every((p) => p.row === row ? l + o.w + GAP <= p.left || l >= p.left + p.w + GAP
      : p.row < row ? !inside(o.x, p) : !inside(p.x, { left: l, w: o.w }));
    const covers = (l: number) => later.some((q) => inside(q.x, { left: l, w: o.w }));
    let best: { l: number; row: number } | null = null;
    for (let row = 0; row < 8 && !best; row++) { const l = tries.find((x) => fits(x, row) && !covers(x)); if (l != null) best = { l, row }; }
    for (let row = 0; row < 8 && !best; row++) { const l = tries.find((x) => fits(x, row)); if (l != null) best = { l, row }; }
    if (!best) return null;
    placed.push({ ...o, left: best.l, top: 0, row: best.row });
  }
  return placed;
}

/** The fallback when points sit too close for vertical lines: a staircase, one label a row. From the top, the leftmost point; each label starts 8 px left of
 *  its point or, when a higher label's line runs there, just right of it, and its straight line runs from 8 px inside its left end down to its point (a
 *  slight slant). Mirrored (labels reaching left, rightmost point on top) when that keeps every label inside the scale and the other way does not. */
function staircase(labels: ScaleLabel[], width: number): { placed: PlacedLabel[]; anchor: Map<string, number>; out: number } {
  const go = (dir: 1 | -1) => {
    const xs = [...labels].sort((a, b) => dir * (a.x - b.x)), anchor = new Map<string, number>(), placed: PlacedLabel[] = [];
    let edge = dir === 1 ? -Infinity : Infinity, out = 0;
    xs.forEach((o, i) => {
      const row = xs.length - 1 - i;
      let left: number, a: number;
      if (dir === 1) { left = Math.max(o.x - GAP, edge + CLEAR); a = Math.max(o.x, left + GAP); if (left + o.w > width) out++; edge = Math.max(a, o.x); }
      else { const right = Math.min(o.x + GAP, edge - CLEAR); left = right - o.w; a = Math.min(o.x, right - GAP); if (left < 0) out++; edge = Math.min(a, o.x); }
      anchor.set(o.key, a); placed.push({ ...o, left, top: 0, row });
    });
    return { placed, anchor, out };
  };
  const a = go(1), b = go(-1);
  return b.out < a.out ? b : a;
}

function finish(placed: PlacedLabel[], anchor: Map<string, number>): ScaleLayout {
  const R = placed.reduce((a, p) => Math.max(a, p.row + 1), 1), height = ROW_BASE + (R - 1) * ROW_H + LABEL_H + 2;
  const lines: ScaleLine[] = placed.map((p) => { p.top = height - (ROW_BASE + p.row * ROW_H) - LABEL_H; const y1 = p.top + LABEL_H, x1 = anchor.get(p.key) ?? p.x;
    return { key: p.key, x1, y1, x2: p.x, y2: height, curve: false, d: `M${r(x1)} ${y1} L${r(p.x)} ${height}` }; });
  return { mode: "rows", height, labels: placed, lines };
}
const r = (v: number) => Math.round(v * 10) / 10;

/** Where each label sits and the line to its point. */
export function placeLabels(labels: ScaleLabel[], width: number): ScaleLayout {
  if (!labels.length || width <= 0) return { mode: "row", height: 0, labels: [], lines: [] };
  if (fitsOneRow(labels, width)) return oneRow(labels, width);
  const rule = rowsByRule(labels, width);
  if (rule) { const L = finish(rule, new Map()); if (!layoutProblems(L).length) return L; }
  const s = staircase(labels, width);
  for (const p of s.placed) p.left = Math.max(0, Math.min(width - p.w, p.left));   // never off the scale (a crowded right end keeps the label in view)
  return finish(s.placed, s.anchor);
}

/** Checks used by the tests and the browser proof: no two labels touch, no label leaves the scale, and no straight line crosses a label it does not belong to. */
export function layoutProblems(L: ScaleLayout, width?: number): string[] {
  const out: string[] = [];
  L.labels.forEach((a, i) => L.labels.slice(i + 1).forEach((b) => {
    const h = a.left < b.left + b.w && b.left < a.left + a.w, v = a.top < b.top + LABEL_H && b.top < a.top + LABEL_H;
    if (h && v) out.push(`${a.key} touches ${b.key}`);
  }));
  if (width != null) L.labels.forEach((a) => { if (a.left < -0.01 || a.left + a.w > width + 0.01) out.push(`${a.key} leaves the scale`); });
  L.lines.filter((ln) => !ln.curve).forEach((ln) => L.labels.forEach((b) => {
    if (b.key === ln.key) return;
    for (let t = 0; t <= 1.0001; t += 0.02) {   // walk the segment: inside the label's box is a crossing
      const x = ln.x1 + (ln.x2 - ln.x1) * t, y = ln.y1 + (ln.y2 - ln.y1) * t;
      if (x > b.left && x < b.left + b.w && y > b.top && y < b.top + LABEL_H) { out.push(`${ln.key}'s line crosses ${b.key}`); return; }
    }
  }));
  return out;
}
