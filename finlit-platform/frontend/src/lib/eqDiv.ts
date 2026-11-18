// Task #183 W7 (Equity portfolio, Diversification analytics, pack 01-equity-portfolio D50–D71): the figures the tab draws, worked out from the server's page
// answer (POST /api/portfolio/page: the share-by-share correlation matrix of a year of weekly prices, its order, the groups found by average linkage on
// 1 − ρ cut at 0.5) and each share's NSE levels (meta.nse, task #192). Pure functions, so every figure is tested. Describes how shares moved; never advice.
import type { Card } from "./pulsePack";

export type Level = "macro" | "sector";
export type Size3 = "Large" | "Mid" | "Small";
export const SIZES3: Size3[] = ["Large", "Mid", "Small"];
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const num = (n: number) => (n <= 12 ? NUM[n] : String(n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
export const two = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(2));
const pc = (x: number) => `${Math.round(x)}%`;

/** How many independent shares a group of n moves like, if each pair averages `avg`: n / (1 + (n − 1) · avg). */
export const effective = (n: number, avg: number | null) => (n <= 1 || avg == null ? n : n / (1 + (n - 1) * Math.max(0, avg)));

/** Every pair (i < j) of the matrix with its correlation. */
export function pairsOf(order: string[], corr: number[][]): { a: string; b: string; i: number; j: number; corr: number }[] {
  const out: { a: string; b: string; i: number; j: number; corr: number }[] = [];
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) if (Number.isFinite(corr[i]?.[j])) out.push({ a: order[i], b: order[j], i, j, corr: corr[i][j] });
  return out;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Group against group (sectors, sizes): the average correlation of the pairs between two groups, and inside one group (null with one share). */
export type Heat = { names: string[]; count: Record<string, number>; cell: (a: string, b: string) => { avg: number | null; pairs: number } };
export function heatOf(order: string[], corr: number[][], groupOf: (s: string) => string): Heat {
  const count: Record<string, number> = {}, sums = new Map<string, { s: number; n: number }>(), key = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  order.forEach((s) => { const g = groupOf(s); count[g] = (count[g] ?? 0) + 1; });
  for (const p of pairsOf(order, corr)) { const k = key(groupOf(p.a), groupOf(p.b)), x = sums.get(k) ?? { s: 0, n: 0 }; x.s += p.corr; x.n++; sums.set(k, x); }
  const names = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
  return { names, count, cell: (a, b) => { const x = sums.get(key(a, b)); return { avg: x ? x.s / x.n : null, pairs: x?.n ?? 0 }; } };
}

/** Same group against different groups: the two headline figures (pairs and average). */
export function sameVsDiff(order: string[], corr: number[][], groupOf: (s: string) => string) {
  const same: number[] = [], diff: number[] = [];
  for (const p of pairsOf(order, corr)) (groupOf(p.a) === groupOf(p.b) ? same : diff).push(p.corr);
  return { same: { pairs: same.length, avg: mean(same) }, diff: { pairs: diff.length, avg: mean(diff) } };
}

/** "Tied to the rest of your list": each group's shares against every share outside the group, loosest first. */
export function tiesOf(order: string[], corr: number[][], groupOf: (s: string) => string): { name: string; n: number; avg: number }[] {
  const acc = new Map<string, number[]>(), n = new Map<string, number>();
  order.forEach((s) => n.set(groupOf(s), (n.get(groupOf(s)) ?? 0) + 1));
  for (const p of pairsOf(order, corr)) { const ga = groupOf(p.a), gb = groupOf(p.b); if (ga === gb) continue; (acc.get(ga) ?? acc.set(ga, []).get(ga)!).push(p.corr); (acc.get(gb) ?? acc.set(gb, []).get(gb)!).push(p.corr); }
  return [...acc].map(([name, xs]) => ({ name, n: n.get(name) ?? 0, avg: mean(xs) as number })).sort((a, b) => a.avg - b.avg || a.name.localeCompare(b.name));
}

/** Average linkage on distance 1 − ρ (the server's rule): clusters of two or more shares whose members average `minAvg` or more with each other. */
export function averageLinkage(order: string[], corr: number[][], minAvg: number): string[][] {
  let cl: number[][] = order.map((_, i) => [i]);
  const link = (a: number[], b: number[]) => { let s = 0, n = 0; for (const i of a) for (const j of b) { s += corr[i][j]; n++; } return s / n; };
  for (;;) {
    let best = -Infinity, bi = -1, bj = -1;
    for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) { const v = link(cl[i], cl[j]); if (v > best) { best = v; bi = i; bj = j; } }
    if (bi < 0 || best < minAvg) break;
    cl = [...cl.filter((_, k) => k !== bi && k !== bj), [...cl[bi], ...cl[bj]]];
  }
  return cl.filter((c) => c.length > 1).map((c) => c.map((i) => order[i]));
}

/** "Looser families": wider groups that appear when the net widens (average 0.35 or more), each joining two or more of the groups, or a group and other shares. */
export function looserFamilies(order: string[], corr: number[][], groups: { members: string[] }[], minAvg = 0.35): { members: string[]; joins: number }[] {
  const g = groups.map((x) => new Set(x.members));
  return averageLinkage(order, corr, minAvg).flatMap((m) => {
    const joins = g.filter((s) => m.some((x) => s.has(x))).length, inGroups = m.filter((x) => g.some((s) => s.has(x))).length;
    return (joins >= 2 || (joins === 1 && m.length > inGroups)) ? [{ members: m, joins }] : [];
  });
}

/** One stock group's card: its names joined with " + " across macro sectors (the pack: "Industrials + Utilities"), whether it crosses sectors, how many bets it
 *  counts as, how closely the cross-sector members move with their own sector, and the sizes it holds. */
export function groupCard(members: string[], avg: number, order: string[], corr: number[][], sectorOf: (s: string) => string, sizeOf: (s: string) => Size3 | null) {
  const secs = [...new Set(members.map(sectorOf))], cross = secs.length > 1;
  const idx = new Map(order.map((s, i) => [s, i]));
  const own: number[] = [];
  if (cross) for (const m of members) for (const o of order) if (o !== m && !members.includes(o) && sectorOf(o) === sectorOf(m)) own.push(corr[idx.get(m)!][idx.get(o)!]);
  const sizes = members.map(sizeOf).filter((x): x is Size3 => !!x), uniq = [...new Set(sizes)];
  const sizeWord = !sizes.length ? null : uniq.length === 1 ? `All ${uniq[0].toLowerCase()} companies` : SIZES3.filter((k) => uniq.includes(k)).join(" + ");
  return { name: secs.join(" + "), cross, bets: effective(members.length, avg), withOwn: cross ? mean(own) : null, sizeWord };
}

/** Company size against company size: within each size (and how many independent shares it moves like), the 3 × 3 grid, and where the 30 closest pairs come from. */
export function sizeFigures(order: string[], corr: number[][], sizeOf: (s: string) => Size3 | null, closest = 30) {
  const known = order.filter((s) => sizeOf(s)), heat = heatOf(known, subMatrix(order, corr, known), (s) => sizeOf(s) as string);
  const within = SIZES3.map((k) => { const n = heat.count[k] ?? 0, avg = heat.cell(k, k).avg; return { k, n, avg, eff: effective(n, avg) }; });
  const ps = pairsOf(order, corr).filter((p) => sizeOf(p.a) && sizeOf(p.b));
  const mixKey = (a: Size3, b: Size3) => (SIZES3.indexOf(a) <= SIZES3.indexOf(b) ? `${a} with ${b}` : `${b} with ${a}`);
  const all = new Map<string, number>(), top = new Map<string, number>();
  for (const p of ps) { const k = mixKey(sizeOf(p.a)!, sizeOf(p.b)!); all.set(k, (all.get(k) ?? 0) + 1); }
  const take = [...ps].sort((a, b) => b.corr - a.corr).slice(0, closest);
  for (const p of take) { const k = mixKey(sizeOf(p.a)!, sizeOf(p.b)!); top.set(k, (top.get(k) ?? 0) + 1); }
  const kinds = SIZES3.flatMap((a, i) => SIZES3.slice(i).map((b) => `${a} with ${b}`));
  const mix = kinds.map((k) => ({ k, top: top.get(k) ?? 0, allShare: ps.length ? ((all.get(k) ?? 0) / ps.length) * 100 : 0 })).sort((a, b) => b.top - a.top || b.allShare - a.allShare);
  return { within, heat, mix, closest: take.length };
}
function subMatrix(order: string[], corr: number[][], keep: string[]): number[][] {
  const at = keep.map((s) => order.indexOf(s));
  return at.map((i) => at.map((j) => corr[i][j]));
}

/** The 3 × size grid ("Where your list sits"): one row per macro sector, the shares in each size, each cell's share of the list, the row's share, and totals that add
 *  to 100%. Shares without a size band are counted in the row total and named under the grid. */
export function whereGrid(symbols: string[], sectorOf: (s: string) => string, sizeOf: (s: string) => Size3 | null) {
  const N = symbols.length, rows = new Map<string, Record<Size3, string[]> & { all: string[] }>();
  for (const s of symbols) { const r = rows.get(sectorOf(s)) ?? rows.set(sectorOf(s), { Large: [], Mid: [], Small: [], all: [] }).get(sectorOf(s))!; r.all.push(s); const z = sizeOf(s); if (z) r[z].push(s); }
  const out = [...rows].map(([name, r]) => ({ name, cells: SIZES3.map((k) => ({ k, who: r[k], pct: N ? (r[k].length / N) * 100 : 0 })), n: r.all.length, pct: N ? (r.all.length / N) * 100 : 0 }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const cols = SIZES3.map((k) => { const n = symbols.filter((s) => sizeOf(s) === k).length; return { k, n, pct: N ? (n / N) * 100 : 0 }; });
  return { rows: out, cols, noSize: symbols.filter((s) => !sizeOf(s)), max: Math.max(1, ...out.flatMap((r) => r.cells.map((c) => c.who.length))) };
}

// ------------------------------------------------------------------------------------------------ the words
/** Key figures of the Diversification analytics tab: Concentration, Hidden packs, Moves like (the pack). */
export function divKeyCards(a: { top: { name: string; n: number; pct: number; sectorNames: string[] } | null; N: number; groups: number; cross: number; eff: number; counted: number; small: { n: number; avg: number | null } | null; sameAvg: number | null }) {
  const out: { tone: "good" | "info" | "watch" | "warn"; k: string; v: string; text: string; go: string; to: string }[] = [];
  if (a.top) out.push({ tone: a.top.pct >= 30 ? "watch" : "good", k: "Concentration", v: `${a.top.name} · ${pc(a.top.pct)}`, go: "See sectors", to: "eq-sectors",
    text: `${a.top.n} of ${a.N} shares by count${a.top.sectorNames.length === 1 ? `, all of them ${a.top.sectorNames[0]} at sector level` : a.top.sectorNames.length ? `, across ${num(a.top.sectorNames.length)} sectors` : ""}.` });
  if (a.groups) out.push({ tone: a.cross ? "warn" : "good", k: "Hidden packs", v: `${a.cross} of ${a.groups} ${a.groups === 1 ? "group" : "groups"}`, go: "See the groups", to: "eq-groups",
    text: a.cross ? "Groups that move together cross sector lines, so the labels make the list look more spread than it is." : "Every group that moves together sits inside one sector, so the sector labels tell the story." });
  out.push({ tone: "info", k: "Moves like", v: `${a.eff.toFixed(1)} of ${a.counted}`, go: "See company sizes", to: "eq-sizes",
    text: `independent shares.${a.small && a.small.n > 1 && a.small.avg != null && a.sameAvg != null && a.small.avg > a.sameAvg ? ` Your ${a.small.n} small companies move together more closely (${two(a.small.avg)}) than shares inside one sector.` : ""}` });
  return out;
}
/** The three things to know under "Do your sectors move together?". */
export function sectorCards(ties: { name: string; n: number; avg: number }[], heat: Heat, word: string): Card[] {
  const out: Card[] = [];
  const big = [...ties].sort((a, b) => b.n - a.n)[0], loose = ties[0];
  if (big && big.n > 1) out.push({ kind: "watch", title: `${big.name} sets the pace`, text: `${big.name} has ${big.n} shares, and they move with the rest of the list at ${two(big.avg)}: when ${big.name.toLowerCase()} moves, much of the list moves with it.` });
  if (loose && loose !== big) out.push({ kind: "good", title: `${loose.name} goes its own way`, text: `Its shares move with the rest of the list at ${two(loose.avg)}, the loosest tie of any ${word}.` });
  const ones = heat.names.filter((x) => heat.count[x] === 1);
  if (ones.length) out.push({ kind: "insight", title: ones.length === 1 ? "One share is a thin sample" : `${cap(num(ones.length))} ${word}s have one share each`, text: `${list(ones)} ${ones.length === 1 ? "is" : "are"} read from a single share, so ${ones.length === 1 ? "its row says" : "their rows say"} more about that share than about the ${word}.` });
  return out;
}
/** The three things to know under "Do small, mid and large companies move together?". */
export function sizeCards(f: ReturnType<typeof sizeFigures>): Card[] {
  const out: Card[] = [], w = f.within.filter((x) => x.n > 1 && x.avg != null).sort((a, b) => (b.avg as number) - (a.avg as number));
  const top = f.mix[0];
  if (w[0]) out.push({ kind: w[0].k === "Small" && (w[0].avg as number) >= 0.4 ? "watch" : "insight", title: (w[0].avg as number) >= 0.4 ? `${w[0].k} companies move as a pack` : `${w[0].k} companies move together most`, text: `Your ${w[0].n} ${w[0].k.toLowerCase()} companies average ${two(w[0].avg)} with each other: ${w[0].n} shares move like about ${w[0].eff.toFixed(1)} independent ones.` });
  if (w.length > 1) { const lo = w[w.length - 1]; out.push({ kind: "good", title: `${lo.k} companies spread the risk most`, text: `They average ${two(lo.avg)} with each other: ${lo.n} shares move like about ${lo.eff.toFixed(1)} independent ones.` }); }
  if (top && f.closest) { const lean = (top.top / f.closest) * 100 > top.allShare + 10;
    out.push({ kind: "insight", title: `${top.top} of the ${f.closest} closest pairs: ${top.k.toLowerCase()}`, text: lean ? `Only ${pc(top.allShare)} of all pairs are ${top.k.toLowerCase()}, so the closest pairs lean that way.` : `${cap(pc(top.allShare))} of all pairs are ${top.k.toLowerCase()}, so the closest pairs follow the list's own mix.` }); }
  return out;
}
