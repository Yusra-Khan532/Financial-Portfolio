// Sector Rotation, developer file 31 (task #332): the plain logic of the six additions and the new layout, kept apart from the drawing so each rule has a test
// (rotation332.test.ts). Every figure is the server's: GET /api/rotation (boxes, ranks, the 8-week tails, "what_next"), GET /api/results/quarter?view=industries
// (results groups), GET /api/sectors/<slug> (stocks) and GET /api/prism/scores (stored scores, Gold). This file only joins, filters and words them.
// Describes what happened and what is on file; never advice, never a forecast.
import type { RotationMap, RotationRow } from "./rotation";
import type { Card } from "./pulsePack";
import type { Box } from "./rotationPack";

// ------------------------------------------------------------------------------------------------ the boxes and their tabs
export type BoxId = "all" | "chg" | "chk" | "full";
export const BOX_TABS: Record<BoxId, readonly string[]> = {
  all: ["four", "map", "ahead", "moves"],
  chg: ["changed", "next"],
  chk: ["results", "next"],
  full: ["ranking", "six", "twelve", "next"],
};
const TAB_KEY = (b: BoxId) => `finlit-rotation-tab-${b}`;
/** The tab a box opens on: box 1 takes `&tab=` from the address first; then the member's last tab for that box; a first visit opens tab 1. */
export function openTab(box: BoxId, param: string | null, saved: string | null): string {
  const tabs = BOX_TABS[box];
  if (box === "all" && param && tabs.includes(param)) return param;
  return saved && tabs.includes(saved) ? saved : tabs[0];
}
export const readTab = (b: BoxId) => { try { return localStorage.getItem(TAB_KEY(b)); } catch { return null; } };
export const saveTab = (b: BoxId, t: string) => { try { localStorage.setItem(TAB_KEY(b), t); } catch { /* private mode: the page still works, it just forgets */ } };

/** "Why it matters" opens by default on a member's first visit to the page, closed after (task #332, fix 3). */
const SEEN_KEY = "finlit-rotation-seen";
export function firstVisit(): boolean {
  try { const seen = localStorage.getItem(SEEN_KEY); if (!seen) localStorage.setItem(SEEN_KEY, "1"); return !seen; } catch { return false; }
}

// ------------------------------------------------------------------------------------------------ Today in one minute
export type HeadTone = "bad" | "watch" | "good";
/** The headline chip's tint (fix 2): red when selling is spreading, amber when the boxes are shifting, green when rises are spreading. */
export function headlineTone(m: RotationMap): HeadTone {
  const LV: Record<Box, number> = { behind_slipping: 0, behind_gaining: 1, ahead_slowing: 2, ahead_gaining: 3 };
  let up = 0, down = 0;
  for (const r of m.rows) {
    if (r.weeks_in_corner !== 1 || !r.previous_corner || r.previous_corner === "middle" || r.corner === "middle") continue;
    if (LV[r.corner as Box] > LV[r.previous_corner as Box]) up++; else down++;
  }
  if (down > up && m.rows.filter((r) => r.corner === "behind_slipping").length * 2 > m.rows.length) return "bad";
  if (up > down) return "good";
  return "watch";
}
/** Callouts cut to two: a Warning first, then a Good sign, then the first other. */
export function pickTwo(cards: Card[]): Card[] {
  const w = cards.find((c) => c.kind === "warning"), g = cards.find((c) => c.kind === "good");
  const out = [w, g].filter((c): c is Card => !!c);
  for (const c of cards) if (out.length < 2 && !out.includes(c)) out.push(c);
  return out.slice(0, 2);
}

// ------------------------------------------------------------------------------------------------ Your sectors: portfolio, watchlist or both
export type Source = "portfolio" | "watchlist" | "both";
export type MemberShares = { held: Map<string, string[]>; watched: Map<string, string[]> };
/** The shares of each group for the chosen source. A share in both shows once (as held). */
export function sharesFor(src: Source, m: MemberShares): Map<string, { sym: string; watch: boolean }[]> {
  const out = new Map<string, { sym: string; watch: boolean }[]>();
  const add = (slug: string, sym: string, watch: boolean) => { const l = out.get(slug) ?? []; if (!l.some((x) => x.sym === sym)) l.push({ sym, watch }); out.set(slug, l); };
  if (src !== "watchlist") for (const [slug, syms] of m.held) syms.forEach((s) => add(slug, s, false));
  if (src !== "portfolio") for (const [slug, syms] of m.watched) syms.forEach((s) => { if (src === "watchlist" || ![...m.held.values()].some((h) => h.includes(s))) add(slug, s, true); });
  return out;
}
/** Groups the member holds or watches: the gold rows and "Yours" tags. Empty with no shares and no watchlist, so nothing is tinted. */
export const mineOf = (m: MemberShares) => new Set([...m.held.keys(), ...m.watched.keys()]);

// ------------------------------------------------------------------------------------------------ Price against results
export type ResultsGroup = { name: string; withNumbers?: number; medianRevenueYoY?: number | null; medianProfitYoY?: number | null; vsMarket?: "Ahead" | "In line" | "Behind" | null; market?: { medianRevenueYoY: number | null; medianProfitYoY: number | null } };
export type ResultsLine = { name: string; label: string; g: ResultsGroup };
const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
/** The results groups read beside one row. Sectors view: each of the sector's industries with its own results group, largest first; the sector's smaller industries
 *  are read together on the Results page under the sector's own name, shown as "Other <sector> (N smaller industries together)". Industries view: the one match. */
export function resultsFor(r: RotationRow, groups: ResultsGroup[], sectors: boolean): ResultsLine[] {
  const by = new Map(groups.map((g) => [norm(g.name), g]));
  const out: ResultsLine[] = [];
  if (!sectors) { const g = by.get(norm(r.name)); return g ? [{ name: g.name, label: g.name, g }] : []; }
  const own = (r.industries ?? []).filter((i) => by.has(norm(i)) && norm(i) !== norm(r.name));
  for (const i of own) out.push({ name: i, label: i, g: by.get(norm(i))! });
  const rest = by.get(norm(r.name));
  if (rest) {
    const n = (r.industries ?? []).length - own.length;
    out.push({ name: rest.name, label: own.length ? `Other ${r.name} (${n} smaller ${n === 1 ? "industry" : "industries"} together)` : rest.name, g: rest });
  }
  return out.sort((a, b) => (b.g.withNumbers ?? 0) - (a.g.withNumbers ?? 0));
}
export type ReadKey = "weak_ahead" | "weak_behind" | "strong_ahead" | "strong_behind" | "mixed" | "inline" | "none";
export const READ_SENTENCE: Record<ReadKey, string> = {
  weak_ahead: "Price is weak while results are ahead of the market.",
  weak_behind: "Price and results are both behind.",
  strong_ahead: "Price and results are both ahead.",
  strong_behind: "Price is strong while results are behind the market.",
  mixed: "Results are mixed across its industries.",
  inline: "Results are in line with the market.",
  none: "No results to read it against yet.",
};
/** Price side is weak when the box is Behind but gaining or Behind and slipping; otherwise strong. */
export const priceWeak = (corner: string | null | undefined) => corner === "behind_gaining" || corner === "behind_slipping";
/** "Read together": one fixed sentence from the price side and whether most of its results groups are Ahead or Behind the market. */
export function readTogether(corner: string | null | undefined, vs: (string | null | undefined)[]): ReadKey {
  const v = vs.filter((x): x is string => !!x);
  if (!v.length) return "none";
  const ahead = v.filter((x) => x === "Ahead").length, behind = v.filter((x) => x === "Behind").length, weak = priceWeak(corner);
  if (ahead * 2 > v.length) return weak ? "weak_ahead" : "strong_ahead";
  if (behind * 2 > v.length) return weak ? "weak_behind" : "strong_behind";
  return v.length === 1 ? "inline" : "mixed";
}
export type ResFilter = "all" | "mine" | "weak_ahead" | "strong_ahead" | "weak_behind" | "strong_behind";
export const RES_FILTERS: [ResFilter, string][] = [["all", "All"], ["mine", "My sectors"], ["weak_ahead", "Price weak, results ahead"], ["strong_ahead", "Both ahead"], ["weak_behind", "Both behind"], ["strong_behind", "Price strong, results behind"]];
export const inResFilter = (f: ResFilter, key: ReadKey, mine: boolean) => f === "all" || (f === "mine" ? mine : key === f);

// ------------------------------------------------------------------------------------------------ Playback
export type Frame = { date: string; label: string; dots: Record<string, { strength: number; change: number; corner: string }> };
/** Eight weekly closes, the same weeks as the 8-week paths (rows[].tail): one frame per week, every dot where its group stood then, coloured by its reading then. */
export function playFrames(m: RotationMap): Frame[] {
  const weeks = [...new Set(m.rows.flatMap((r) => r.tail.map((p) => p.date)))].sort().slice(-8);
  return weeks.map((d) => {
    const dots: Frame["dots"] = {};
    for (const r of m.rows) { const p = r.tail.find((t) => t.date === d); if (p && p.strength != null && p.change != null) dots[r.slug] = { strength: p.strength, change: p.change, corner: p.corner }; }
    const lab = (m.rows.flatMap((r) => r.tail).find((p) => p.date === d) as { date_label?: string } | undefined)?.date_label ?? d;
    return { date: d, label: lab, dots };
  });
}

// ------------------------------------------------------------------------------------------------ What happened next (sent by the server)
export type NextCard = { box: Box; box_name: string; entered: number; ended: number; typical_weeks: number | null; now: number; next: { box: Box; box_name: string; n: number }[] };
export type WhatNext = { from: string; to: string; from_label: string; to_label: string; weeks: number; groups: number; cards: NextCard[]; caption: string };
export const weeksText = (n: number | null) => (n == null ? "–" : `${n} ${n === 1 ? "week" : "weeks"}`);

// ------------------------------------------------------------------------------------------------ Inside a sector
export type InsideStock = { symbol: string; name: string; return_6m_pct: number | null; peer_label: string | null };
/** The 12 strongest counted stocks by 6-month return, and the Leaders / In line / Laggards count of all counted stocks. */
export function insideTop<T extends InsideStock>(stocks: T[], n = 12): { top: T[]; counted: number; leaders: number; inline: number; laggards: number } {
  const counted = stocks.filter((s) => s.return_6m_pct != null);
  const lab = (w: string) => counted.filter((s) => (s.peer_label ?? "").toLowerCase() === w).length;
  return { top: [...counted].sort((a, b) => b.return_6m_pct! - a.return_6m_pct!).slice(0, n), counted: counted.length, leaders: lab("leader"), inline: lab("in line"), laggards: lab("laggard") };
}
/** The picker opens on the member's first sector (portfolio, then watchlist); with neither, the first group on the page. */
export function insideStart(rows: RotationRow[], held: string[], watched: string[]): string | null {
  const has = new Set(rows.map((r) => r.slug));
  return held.find((s) => has.has(s)) ?? watched.find((s) => has.has(s)) ?? rows[0]?.slug ?? null;
}
export type InsideFilter = "all" | "leaders" | "prism";
export const inInside = (f: InsideFilter, peer: string | null, prismLabel: string | null) =>
  f === "all" || (f === "leaders" ? (peer ?? "").toLowerCase() === "leader" : /^(healthy|strong)$/i.test(prismLabel ?? ""));

// ------------------------------------------------------------------------------------------------ the four boxes: equal cards, six names each
export const FOUR_SHOW = 6;
