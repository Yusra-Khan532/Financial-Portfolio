/** "Your themes, from Discover" on the equity portfolio and Watchlists pages: filters, sort and find (22 Nov 2026, round 2).
 *  Pure: the themes table component (Holdings `Lr` data) keeps the four controls in state and renders what this returns.
 *   - How far along: one or more stages (Operating, Under execution, Planned, MoU / pilot, Not stated), each chip with its count of shares;
 *   - 3-month move: up, down, ahead of its theme (above the theme's 3-month median), behind its theme;
 *   - Sort: most of your shares (the order Lr gives), 3-month median high to low or low to high, most in a long-term uptrend, theme A to Z;
 *   - Find a share: part of the symbol, upper case.
 *  A theme stays while at least one of its shares matches; with any filter on, every matching line shows (no "N more"). */

export type ThemeShare = { s: string; r3m: number | null; st: string };
export type ThemeRow = { name: string; m3: number | null; up: number; rated: number; mine: ThemeShare[] };
export type ThemeFilters = { stages: string[]; move: "" | "up" | "down" | "ahead" | "behind"; sort: "n" | "med-d" | "med-a" | "ut" | "az"; q: string };
export const NO_FILTERS: ThemeFilters = { stages: [], move: "", sort: "n", q: "" };
export const STAGES = ["Operating", "Under execution", "Planned", "MoU / pilot", "Not stated"] as const;

/** The chips' counts: shares by stage, over every theme (each share has one main theme). Stages with no share are left out. */
export function stageCounts(rows: ThemeRow[]): { stage: string; n: number }[] {
  const all = rows.flatMap((r) => r.mine);
  return STAGES.map((stage) => ({ stage: stage as string, n: all.filter((x) => x.st === stage).length })).filter((x) => x.n > 0);
}

const shareOk = (x: ThemeShare, row: ThemeRow, f: ThemeFilters) => {
  if (f.stages.length && !f.stages.includes(x.st)) return false;
  const m = x.r3m;
  if (f.move === "up" && !(m != null && m >= 0)) return false;
  if (f.move === "down" && !(m != null && m < 0)) return false;
  if (f.move === "ahead" && !(m != null && row.m3 != null && m > row.m3)) return false;
  if (f.move === "behind" && !(m != null && row.m3 != null && m < row.m3)) return false;
  if (f.q.trim() && !x.s.toUpperCase().includes(f.q.trim().toUpperCase())) return false;
  return true;
};

export const filtersOn = (f: ThemeFilters) => !!(f.stages.length || f.move || f.q.trim());

/** The rows to show (each with only its matching shares when a filter is on), sorted, and the line above the table. */
export function filterThemes(rows: ThemeRow[], f: ThemeFilters, noun = "shares"): { rows: (ThemeRow & { i: number })[]; themes: number; shares: number; summary: string } {
  const on = filtersOn(f);
  const all = rows.reduce((n, r) => n + r.mine.length, 0);
  let out = rows.map((r, i) => ({ ...r, i, mine: on ? r.mine.filter((x) => shareOk(x, r, f)) : r.mine })).filter((r) => !on || r.mine.length > 0);
  const ut = (r: ThemeRow) => (r.rated ? r.up / r.rated : -1);
  const by: Record<ThemeFilters["sort"], (a: ThemeRow & { i: number }, b: ThemeRow & { i: number }) => number> = {
    n: (a, b) => a.i - b.i,
    "med-d": (a, b) => (b.m3 ?? -Infinity) - (a.m3 ?? -Infinity) || a.i - b.i,
    "med-a": (a, b) => (a.m3 ?? Infinity) - (b.m3 ?? Infinity) || a.i - b.i,
    ut: (a, b) => ut(b) - ut(a) || a.i - b.i,
    az: (a, b) => a.name.localeCompare(b.name),
  };
  out = [...out].sort(by[f.sort]);
  const shares = out.reduce((n, r) => n + r.mine.length, 0);
  const summary = on ? `${out.length} of ${rows.length} themes · ${shares} of ${all} ${noun} match` : `All ${rows.length} themes · ${all} ${noun}`;
  return { rows: out, themes: out.length, shares, summary };
}
