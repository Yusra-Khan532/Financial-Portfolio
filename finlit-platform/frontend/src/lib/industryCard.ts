// Section 05's "Against its industry this quarter" card (task #222, pack finlit-company-report-update-18nov v3): the pure rules, tested in industryCard.test.ts.
// Every figure is the server's, from Latest results -> Industries (GET /api/results/quarter): the company's row, its group's typical company (the median) and the
// typical listed company. Nothing new is computed here beyond differences and positions on a bar. Describes; never advice.
import type { Verdict } from "./resultsPack";
import { sortLabel } from "./companyLabel";

/** "About as fast as" means within 3 percentage points of the typical industry company. The rule itself is never shown on the page. */
export const NEAR = 3;
export type Pace = "about as fast as" | "faster than" | "slower than";
export const pace = (company: number, industry: number): Pace => (Math.abs(company - industry) <= NEAR ? "about as fast as" : company > industry ? "faster than" : "slower than");

/** The lead sentence in parts: [text, bold?]. When sales and profit differ, it names each one. */
export function leadParts(name: string, industry: string, rev: number, profit: number, indRev: number, indProfit: number): [string, boolean][] {
  const a = pace(rev, indRev), b = pace(profit, indProfit), who = `the typical ${industry} company.`;
  if (a === b) return [[`${name} grew `, false], [a, true], [` ${who}`, false]];
  return [[`${name}'s sales grew `, false], [a, true], [" and its profit ", false], [b, true], [` ${who}`, false]];
}

/** The line added to the key points (it keeps the numbers): "Sales and profit grew about as fast as the typical Petroleum Products company (+29.8% and +37.8%)." */
export function keyLine(industry: string, rev: number, profit: number, indRev: number, indProfit: number): string {
  const a = pace(rev, indRev), b = pace(profit, indProfit), nums = `(${signed(indRev)} and ${signed(indProfit)})`;
  if (a === b) return `Sales and profit grew ${a} the typical ${industry} company ${nums}.`;
  return `Sales grew ${a} and profit ${b} the typical ${industry} company ${nums}.`;
}

/** +28.6% / −6.1% (a true minus), one decimal. */
export const signed = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`;

/** The chip against the typical industry company: "+2.8 pts above its industry" (up), "1.2 pts below its industry" (dn), "level with its industry" (eq). */
export function gapChip(company: number, industry: number): { cls: "up" | "dn" | "eq"; text: string } {
  const d = Math.round((company - industry) * 10) / 10;
  if (d === 0) return { cls: "eq", text: "level with its industry" };
  return d > 0 ? { cls: "up", text: `+${d.toFixed(1)} pts above its industry` } : { cls: "dn", text: `${Math.abs(d).toFixed(1)} pts below its industry` };
}

/** The score tile's bullet bar: from 0 (or the lowest value, if negative) to 1.12 × the highest. Returns the position (0 to 100) of a value. */
export function bulletScale(values: number[]): (v: number) => number {
  const lo = Math.min(0, ...values), top = Math.max(...values);
  const hi = top > 0 ? top * 1.12 : Math.abs(lo) * 0.12;
  const span = hi - lo || 1;
  return (v) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
}

/** A tick label near either end of a bar is aligned inward, so it is never cut off. */
export const edge = (pos: number): "" | "al" | "ar" => (pos < 14 ? "al" : pos > 86 ? "ar" : "");

/** The table's bars: one scale per column, from the lowest value (or 0) to the highest (or 0); each bar starts at 0, a negative one grows left of the zero line. */
export function columnScale(values: (number | null | undefined)[]): { pos: (v: number) => number; zero: number; bar: (v: number) => { left: number; width: number } } {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  const lo = Math.min(0, ...xs), hi = Math.max(0, ...xs), span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100, zero = pos(0);
  return { pos, zero, bar: (v) => { const p = pos(v); return { left: Math.min(p, zero), width: Math.abs(p - zero) }; } };
}

export const SIZE_RANK: Record<string, number> = { Large: 3, Mid: 2, Small: 1 };
export const VERDICT_RANK: Record<Verdict, number> = { Strong: 5, Good: 4, "In line": 3, Weak: 2, Poor: 1, Loss: 0 };
/** The verdict's colour class: Strong and Good green, In line amber, Weak, Poor and Loss red. */
export const verdictTone = (v: Verdict | null | undefined) => (v === "Strong" || v === "Good" ? "v-strong" : v === "In line" ? "v-inline" : v ? "v-poor" : "v-none");

export type SortKey = "co" | "sz" | "rv" | "pf" | "vd";
export type PeerRow = { symbol: string; name?: string | null; size: string | null; rev: number | null; profit: number | null; verdict: Verdict | null };
const val = (r: PeerRow, k: SortKey): number | null =>
  k === "sz" ? (r.size ? SIZE_RANK[r.size] ?? null : null) : k === "rv" ? r.rev : k === "pf" ? r.profit : k === "vd" ? (r.verdict ? VERDICT_RANK[r.verdict] : null) : null;

/** First click: high to low (Size puts Large first, Verdict Strong first; Company A to Z); a second click on the same sort turns it round. */
export const nextDir = (cur: SortKey, curDir: "asc" | "desc", k: SortKey): "asc" | "desc" => (cur === k ? (curDir === "desc" ? "asc" : "desc") : k === "co" ? "asc" : "desc");

/** The rows in the chosen order; ties (and missing figures, which go last) keep the page's order, which is by size. */
export function sortPeers(rows: PeerRow[], k: SortKey, dir: "asc" | "desc"): PeerRow[] {
  const s = dir === "asc" ? 1 : -1;
  return rows.map((r, i) => ({ r, i })).sort((a, b) => {
    if (k === "co") return sortLabel(a.r).localeCompare(sortLabel(b.r)) * s || a.i - b.i;
    const x = val(a.r, k), y = val(b.r, k);
    if (x == null || y == null) return x == null && y == null ? a.i - b.i : x == null ? 1 : -1;
    return (x - y) * s || a.i - b.i;
  }).map((x) => x.r);
}

/** The company's name as the card says it: "Reliance Industries Ltd" -> "Reliance", "TD Power Systems Ltd" -> "TD Power Systems" (the company report's rule). */
export const shortName = (name: string) => name.replace(/\s+(industries|limited|ltd\.?|corporation|corp\.?|company)\b.*$/i, "").trim() || name;
