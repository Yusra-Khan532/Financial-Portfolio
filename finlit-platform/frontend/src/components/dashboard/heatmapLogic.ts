// Task #261 (team pack "05 Dashboard · Index heatmap", 20 Nov 2026): the logic of the dashboard's Index heatmap card, kept apart from the drawing so
// it can be tested: the indices and their groups, which stocks an index shows (NSE's published list), the colour of a move, the sorts, the breadth
// line, how big a symbol can be on a map tile, and the view, index and sort the person chose last.
import { CATEGORIES, largest, stocksFor, type Pill } from "../../lib/markets";
import type { Row } from "../../lib/screener";

export type HView = "grid" | "map" | "list";
export type HSort = "up" | "dn" | "mc" | "az";
export type Cell = { symbol: string; name: string; move: number | null; cap: number; price: number | null };
export type HIndex = { id: string; label: string; code: string; isNew?: boolean };

/** The indices, in the pack's three groups. `code` is the constituent list's key in /api/markets/members (backend screener/catalog INDEX_LISTS). */
export const GROUPS: { title: string; items: HIndex[] }[] = [
  { title: "Broad market", items: [
    { id: "n50", label: "Nifty 50", code: "NIFTY50" }, { id: "next50", label: "Nifty Next 50", code: "NIFTYNEXT50" }, { id: "n100", label: "Nifty 100", code: "NIFTY100" },
    { id: "n200", label: "Nifty 200", code: "NIFTY200" }, { id: "n500", label: "Nifty 500", code: "NIFTY500" }] },
  { title: "Mid and small", items: [
    { id: "mid50", label: "Nifty Midcap 50", code: "NIFTYMIDCAP50", isNew: true }, { id: "mid100", label: "Nifty Midcap 100", code: "NIFTYMIDCAP100", isNew: true },
    { id: "mid150", label: "Nifty Midcap 150", code: "NIFTYMIDCAP150", isNew: true }, { id: "midsel", label: "Nifty Midcap Select", code: "NIFTYMIDCAPSELECT" },
    { id: "sm50", label: "Nifty Smallcap 50", code: "NIFTYSMALLCAP50" }, { id: "sm100", label: "Nifty Smallcap 100", code: "NIFTYSMALLCAP100" },
    { id: "sm250", label: "Nifty Smallcap 250", code: "NIFTYSMALLCAP250" }, { id: "micro250", label: "Nifty Microcap 250", code: "NIFTYMICROCAP250" },
    { id: "lm250", label: "Nifty LargeMidcap 250", code: "NIFTYLARGEMID250" }, { id: "ms400", label: "Nifty MidSmallcap 400", code: "NIFTYMIDSMALL400" }] },
  { title: "Sectors", items: [
    { id: "bank", label: "Nifty Bank", code: "NIFTYBANK" }, { id: "fin", label: "Nifty Financial Services", code: "NIFTYFINSERVICE" }, { id: "it", label: "Nifty IT", code: "NIFTYIT" },
    { id: "auto", label: "Nifty Auto", code: "NIFTYAUTO" }, { id: "pharma", label: "Nifty Pharma", code: "NIFTYPHARMA" }, { id: "fmcg", label: "Nifty FMCG", code: "NIFTYFMCG" },
    { id: "metal", label: "Nifty Metal", code: "NIFTYMETAL" }, { id: "energy", label: "Nifty Energy", code: "NIFTYENERGY" }, { id: "realty", label: "Nifty Realty", code: "NIFTYREALTY" },
    { id: "psubank", label: "Nifty PSU Bank", code: "NIFTYPSUBANK" }] },
];
export const ALL: HIndex[] = GROUPS.flatMap((g) => g.items);
/** The chips, in the pack's order; the rest are under "More indices". */
export const PINNED = ["n50", "mid50", "mid100", "mid150", "bank", "it", "auto", "pharma", "fmcg", "metal"];
export const byId = (id: string): HIndex => ALL.find((x) => x.id === id) ?? ALL[0];

/** The pack's seven colours, −2% to +2% (the colours the dashboard already used; the steps are the pack's). */
export const MOVE_COLOURS = ["#8E2620", "#A12E26", "#B5473D", "#6B6455", "#2E7D57", "#1F6B49", "#17583B"] as const;
/** A stock whose move could not be read today: a light neutral tile with dark text, so it never reads as "flat". */
export const NO_MOVE = "#B9B3A6";
export function moveColour(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return NO_MOVE;
  return v <= -1.5 ? MOVE_COLOURS[0] : v <= -0.75 ? MOVE_COLOURS[1] : v < -0.15 ? MOVE_COLOURS[2] : v <= 0.15 ? MOVE_COLOURS[3]
    : v < 0.75 ? MOVE_COLOURS[4] : v < 1.5 ? MOVE_COLOURS[5] : MOVE_COLOURS[6];
}

const cell = (sym: string, r: Row | undefined): Cell => ({ symbol: sym, name: r?.name || sym, move: r?.change_pct ?? null, cap: r?.market_cap ?? 0, price: r?.price ?? null });

export type Resolved = { cells: Cell[]; basis: "list" | "cap" | "sector" | "none" };
/** The stocks an index shows. NSE's published constituent list when it is loaded: every member, a member with no move today kept (it is counted as
 *  "not readable", never dropped). Without the list: Nifty 50 shows the 50 largest companies by market value, a sector index FinLit's sector
 *  grouping (each said plainly), any other index nothing, with the reason. */
export function resolve(ix: HIndex, rows: readonly Row[], members: Record<string, string[]> | undefined): Resolved {
  const list = members?.[ix.code];
  if (list && list.length >= 5) {
    const by = new Map(rows.map((r) => [r.symbol, r]));
    return { cells: list.map((s) => cell(s, by.get(s))), basis: "list" };
  }
  if (ix.id === "n50") return { cells: largest(rows, 50).map((r) => cell(r.symbol, r)), basis: "cap" };
  const pill: Pill | undefined = CATEGORIES.flatMap((c) => c.pills).find((p) => p.members === ix.code);
  if (pill?.sector) return { cells: stocksFor({ ...pill, members: undefined }, rows, undefined).stocks.map((r) => cell(r.symbol, r)), basis: "sector" };
  return { cells: [], basis: "none" };
}

export function sortCells(cells: readonly Cell[], by: HSort): Cell[] {
  const m = (c: Cell, none: number) => c.move ?? none;
  const cmp: Record<HSort, (a: Cell, b: Cell) => number> = {
    up: (a, b) => m(b, -Infinity) - m(a, -Infinity) || a.symbol.localeCompare(b.symbol),
    dn: (a, b) => m(a, Infinity) - m(b, Infinity) || a.symbol.localeCompare(b.symbol),
    mc: (a, b) => b.cap - a.cap || a.symbol.localeCompare(b.symbol),
    az: (a, b) => a.symbol.localeCompare(b.symbol),
  };
  return [...cells].sort(cmp[by]);
}

export type Breadth = { up: number; down: number; flat: number; none: number; weighted: number | null };
/** How many rose and fell, how many could not be read, and the move weighted by market value (stocks with a move and a market value). */
export function breadth(cells: readonly Cell[]): Breadth {
  const has = cells.filter((c) => c.move != null);
  const w = has.filter((c) => c.cap > 0), t = w.reduce((a, c) => a + c.cap, 0);
  return { up: has.filter((c) => (c.move as number) > 0).length, down: has.filter((c) => (c.move as number) < 0).length, flat: has.filter((c) => c.move === 0).length,
    none: cells.length - has.length, weighted: t > 0 ? w.reduce((a, c) => a + (c.move as number) * c.cap, 0) / t : null };
}

/** The map: up to 100 tiles, the rest of an index above that as one "Other N stocks" tile (Grid and List always show every stock). */
export const MAP_MAX = 100;
export type MapItem = { kind: "stock"; c: Cell } | { kind: "other"; n: number; cap: number; move: number | null; cells: Cell[] };
export function mapItems(cells: readonly Cell[]): MapItem[] {
  const sized = cells.filter((c) => c.cap > 0).sort((a, b) => b.cap - a.cap);
  if (sized.length <= MAP_MAX) return sized.map((c) => ({ kind: "stock", c }));
  const top = sized.slice(0, MAP_MAX), rest = sized.slice(MAP_MAX);
  return [...top.map((c): MapItem => ({ kind: "stock", c })), { kind: "other", n: rest.length, cap: rest.reduce((a, c) => a + c.cap, 0), move: breadth(rest).weighted, cells: rest }];
}

/** Width of one letter of a symbol, as a share of the font size: the site's semibold capitals measure 0.84 in the browser (0.86 leaves a margin). */
export const GLYPH = 0.86;
/** The symbol's font on a w x h map tile: it shrinks with the tile, 7px to 15px, so every tile carries its symbol; the move shows where it fits.
 *  On the few tiles too small for the whole symbol even at 7px it ends in "…" (CSS), and the hover or tap card names the stock in full. */
export function mapLabel(symbol: string, w: number, h: number): { pad: number; size: number; move: number | null } {
  const pad = w < 70 || h < 40 ? 3 : 7;
  const size = Math.max(7, Math.min(15, (w - 2 * pad) / (Math.max(symbol.length, 1) * GLYPH), h / 2.1));
  return { pad, size, move: h >= size * 2.7 && w >= 48 ? Math.max(9.5, Math.min(12.5, size - 1.5)) : null };
}

/** The date of the prices: "19 Nov close" once the session has closed (15:30 IST), else "19 Nov, during the session". */
export function priceDay(asOf: string | null | undefined, now: Date = new Date()): string | null {
  if (!asOf || !/^\d{4}-\d{2}-\d{2}/.test(asOf)) return null;
  const d = new Date(asOf.slice(0, 10) + "T00:00:00Z");
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const ist = new Date(now.getTime() + 5.5 * 3600_000), today = ist.toISOString().slice(0, 10);
  const open = asOf.slice(0, 10) === today && ist.getUTCDay() > 0 && ist.getUTCDay() < 6 && ist.getUTCHours() * 60 + ist.getUTCMinutes() < 15 * 60 + 30;
  return open ? `${day}, during the session` : `${day} close`;
}

/** The person's last view, index and sort (this browser). Unreadable or unknown values fall back to Grid, Nifty 50, biggest gain first. */
export const PREF_KEY = "fl-hm";
export type HPrefs = { view: HView; idx: string; sort: HSort };
export const DEFAULTS: HPrefs = { view: "grid", idx: "n50", sort: "up" };
export function readPrefs(raw: string | null): HPrefs {
  try {
    const s = JSON.parse(raw || "{}") as Partial<HPrefs>;
    return { view: (["grid", "map", "list"] as const).includes(s.view as HView) ? (s.view as HView) : DEFAULTS.view,
      idx: ALL.some((x) => x.id === s.idx) ? (s.idx as string) : DEFAULTS.idx,
      sort: (["up", "dn", "mc", "az"] as const).includes(s.sort as HSort) ? (s.sort as HSort) : DEFAULTS.sort };
  } catch { return { ...DEFAULTS }; }
}
