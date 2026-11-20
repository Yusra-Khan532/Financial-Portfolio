// Prebuilt screens on the Advanced (Gold) and Basic (Silver) score screeners: the API types, the address (?preset=<id>&chip=<id>...), the two queries, client-side sorting and the CSV.
// Every number shown comes from the response; nothing is computed here except ordering and layout.
import { useSyncExternalStore } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ApiError, apiGet } from "./api";

export type PresetChip = { id: string; label: string; default: boolean; description: string };
export type Preset = {
  id: string; name: string; group: string; cardText: string; count: number | null; asOf: string | null; status: "live" | "blocked"; blockedReason: string | null;
  /** "Top 10 of 40 that pass" or "First 25 of 129 that pass", as the card says it; null when the whole match is listed. */
  listText?: string | null;
  chips: PresetChip[]; howItWorks: string[]; locked: boolean; tab?: PresetTab; kind?: string;
  /** The strip's card (task #64, N-38), on the plan's own page only: a "Top 10 …" / "Highest-rated …" list; the figure the first three show;
   *  the first three companies on the stored list with that figure (null when the company has none); how many joined at the latest close. */
  top10?: boolean; figure?: string; first?: { symbol: string; name: string; value: number | null }[]; joined?: number;
  /** Task #243 (pack v4): the i beside a new screen's name, and its NEW tag (two weeks after its first run). */
  about?: ScreenAbout | null; isNew?: boolean;
};
/** "What it shows" in a sentence or two, then three "How to use it" points (task #243). */
export type ScreenAbout = { shows: string; use: string[] };
/** Task #243 round 3b: one chip of a Sectors screen's industry board (counts add up to the list). `slug` is null for "No sector reading". */
export type BoardChip = { slug: string | null; name: string; n: number; corner: string | null; rotation: string | null; pulse: string | null; pulseCode: string | null };
/** Which date each kind of data on an Advanced screen is from (prices and scores, the Setups and Chart patterns lists, Sector Pulse, Sector Rotation). */
export type DataDates = { prices: string | null; setups: string | null; sectors: string | null; rotation: string | null };
/** Advanced screens are Gold (Prism fields); Basic screens are Silver (FinLit score fields). */
export type PresetTab = "advanced" | "basic";
export const PLAN_OF: Record<PresetTab, "gold" | "silver"> = { advanced: "gold", basic: "silver" };
export type PresetGroup = { id: string; name: string; presets: Preset[]; /** Task #243: one of the featured groups (shown first, crowned). */ featured?: boolean;
  /** Round 3b: Sectors (Advanced) is new and has a one-line intro over its cards, with an i. */ isNew?: boolean; intro?: string; about?: ScreenAbout };
export type PresetList = { asOf: string | null; groups: PresetGroup[]; tab?: PresetTab };

export type ColFormat = "text" | "num1" | "num2" | "pct" | "pct_down" | "score" | "cr" | "label" | "badge" | "date" | "since";
export type PresetColumn = { key: string; label: string; format: ColFormat; align?: "left" | "right" | "center"; band?: string };
export type PresetRow = { symbol: string; name?: string | null; exchange?: string | null; badges?: string[] } & Record<string, unknown>;
export type ThemeState = "in_play" | "emerging" | "fading" | "closest";
/** `breadth` is the share of the sector's stocks within 15% of their 52-week high; `marketBreadth` the same for the whole market; `reason` says why a "closest" sector is not in play. */
export type Theme = { industry: string; state: ThemeState; breadth: number | null; marketBreadth?: number | null; r3?: number | null; rs3: number | null; members: number | null; small?: boolean; leaders: string[]; reason?: string | null };
export type Miss = { symbol: string; name?: string | null; exchange?: string | null; failed: string[] };
export type PresetDetail = {
  id: string; name: string; asOf: string | null; count: number; shown: number; /** Task #269: the trading day of the prices shown (they are the latest, after the list's day). */ priceDay?: string | null; topCount?: number; asOn?: string; benchSincePct?: number | null; heading?: string | null; filtered?: number; facets?: { sizes: Record<string, number>; sectors: [string, number][]; strong: number; strongOnly?: number; anyRating?: number; new?: number; ahead?: number; nse?: number; bse?: number; fno?: number; liquid?: number; sag?: number; plead?: number;
    /** Task #258 (Advanced SPEC §2, §3): NSE's three levels on this list with their counts, and the counts of each Prism rating word and trend word. */
    macros?: [string, number][]; nsecs?: [string, number][]; industries?: [string, number][]; ratings?: Record<string, number>; iqGroups?: Record<string, number>; trend?: { st: Record<string, number>; lt: Record<string, number> } }; columns: PresetColumn[]; rows: PresetRow[]; themes?: Theme[]; closestMisses?: Miss[];
  howItWorks: string[]; cardText: string; disclaimer: string;
  /** "Top 10 of 40 that pass": what the list shows of the companies that pass. */
  listText?: string; notes?: string[]; rankScoreNote?: string; emptyText?: string; ratedCount?: number;
  /** Paging (every screen but the Top 10 lists and the theme view): `pageSize` is 25; `offset` the first row's place in the ranked list (0-based); `available` how many rows can be paged to. */
  pageSize?: number; offset?: number; limit?: number; available?: number; hasMore?: boolean;
  /** Task #243 (pack P3, L1): the date bar's figures for the list shown, from the saved lists. */
  list?: { date: string; latest: string; count: number; joined: number | null; left: number | null; prev: string | null; first: string; rulesUpdated: boolean } | null;
  /** Round 3b: the industry board of a Sectors screen, and which date each kind of data is from (Advanced). */
  industryBoard?: BoardChip[]; dataDates?: DataDates;
  /** Task #243 (pack v4): the i beside the name and whether the screen is new. */
  about?: ScreenAbout | null; isNew?: boolean;
};
export const PAGE_SIZE = 25;
/** The rows a page shows, as "26–50 of 76" (the numbers come from the response). */
export function pageRange(d: Pick<PresetDetail, "count" | "offset" | "shown">): { from: number; to: number; of: number } {
  const from = (d.offset ?? 0) + 1, to = (d.offset ?? 0) + d.shown;
  return { from: Math.min(from, to + 1), to, of: d.count };
}

export const DISCLAIMER = "A screen narrows a list. It is not a recommendation.";
/** The order the groups are shown in; a group the API adds later follows these, before "Prism basics". */
/** Task #243 (screeners pack v4, R2): the featured groups first (Top rated · Momentum · Growth · Themes · Sectors), then Prism views · Setups · Chart patterns ·
 *  Top gainers · Value and income · Safety · Ownership. The server sends them in this order too (presets/registry.py GROUPS). */
export const GROUP_ORDER = ["Top rated", "Momentum", "Growth", "Themes", "Sectors", "Prism views", "Setups", "Chart patterns", "Top gainers", "Value and income", "Safety", "Ownership"];
export const BASICS = "Prism views";

/** Groups in the spec's order. A group the API omits is simply absent; unknown ones come last (but before Prism basics, which the page adds itself). */
export function orderGroups(groups: PresetGroup[]): PresetGroup[] {
  const rank = (g: PresetGroup) => { const i = GROUP_ORDER.findIndex((n) => n.toLowerCase() === g.name.trim().toLowerCase()); return i < 0 ? GROUP_ORDER.length : i; };
  return groups.map((g, i) => ({ g, i })).filter(({ g }) => g.presets.length > 0).sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i).map(({ g }) => g);
}

// ---------- the address ----------
export type PresetUrl = { preset: string | null; chips: string[] | null; trend: boolean; subs: string[] };
const NONE = "none";
/** ?preset=<id>, then `chip=<id>` repeated (the contract), plus the friendly `trend=1` and `sub=<id>`. chips === null: no chip in the address, so the screen's defaults apply. */
export function readPresetUrl(p: URLSearchParams): PresetUrl {
  const preset = (p.get("preset") || "").trim() || null;
  const raw = p.getAll("chip").map((c) => c.trim()).filter(Boolean);
  const trend = p.get("trend") === "1", subs = p.getAll("sub").map((s) => s.trim()).filter(Boolean);
  const explicit = raw.length > 0 || trend || subs.length > 0;
  return { preset, chips: explicit ? raw.filter((c) => c !== NONE) : null, trend, subs };
}
/** The chip ids a screen is asked with: the address's chips, with the friendly params mapped to the screen's own chip ids, or the defaults when the address names none. */
export function resolveChips(u: PresetUrl, preset: Preset | null): string[] {
  if (u.chips == null) return preset ? preset.chips.filter((c) => c.default).map((c) => c.id) : [];
  const ids = new Set(preset?.chips.map((c) => c.id) ?? []);
  const out = [...u.chips];
  const pick = (cands: string[], fallback: string) => out.push(cands.find((c) => ids.has(c)) ?? fallback);
  if (u.trend) pick(["trend", "trend-check", "trend_check", "trendcheck"], "trend");
  for (const s of u.subs) pick([s, `sub-${s}`, `sub_${s}`, `sub:${s}`, `sub-${s}s`], s);
  return [...new Set(out)];
}
/** The address for a screen and its chip choice: defaults leave no chip in it; an empty choice where defaults exist is written `chip=none`. */
export function presetParams(prev: URLSearchParams, id: string | null, chips: string[] | null, preset: Preset | null): URLSearchParams {
  const n = new URLSearchParams(prev);
  ["preset", "chip", "trend", "sub"].forEach((k) => n.delete(k));
  n.delete("page");
  if (!id) return n;
  n.set("preset", id);
  if (chips) {
    const defaults = (preset?.chips ?? []).filter((c) => c.default).map((c) => c.id).sort().join(",");
    if (chips.slice().sort().join(",") !== defaults) { if (chips.length) chips.forEach((c) => n.append("chip", c)); else n.append("chip", NONE); }
  }
  return n;
}

// ---------- the queries ----------
export function usePresetList(enabled = true, tab: PresetTab = "advanced") {
  return useQuery<PresetList, ApiError>({
    queryKey: ["presets", tab], staleTime: 300_000, enabled, retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 1,
    queryFn: async () => { const d = await apiGet<PresetList>("/api/screener/presets" + (tab === "basic" ? "?tab=basic" : "")); return { asOf: d.asOf ?? null, tab, groups: Array.isArray(d.groups) ? d.groups : [] }; },
  });
}
/** `offset` and `limit` page a long screen (the first page leaves them out, so it is the cached answer as sent). */
/** The open screen's filters (task #243, pack P4), applied by the server to the screen's own list: search; Market cap; Sector; rating (Strong or Healthy, or Strong
 *  only); New on this list (joined since the previous saved list); Ahead of NIFTY 500 since added; NSE-listed only. */
export type Rating = "" | "healthy" | "strong";
/** Task #243 (pack v4): `fno` = F&O stocks only, `liquid` = Liquid only (20-session average value traded of Rs 10 Cr or more). Both optional so older callers still type-check. */
export type BarFilter = { q: string; sizes: string[]; sectors: string[]; rating: Rating; fresh: boolean; ahead: boolean; nse: boolean; fno?: boolean; liquid?: boolean;
  /** Round 3b (Advanced): Industry ahead and gaining, Peer leaders only, and the industry board's chip (the industry's address on Sector Pulse, with its name for the chip). */
  sag?: boolean; plead?: boolean; ind?: { slug: string; name: string } | null;
  /** Task #258 (Advanced SPEC §2, §3): NSE's macro sectors, sectors and industries; the Prism rating words (strong ... notrated); from-to score ranges
   *  (z Prism, zf Growth & Profitability, zv Valuation, zq Quality, zr Risk); the two technical views in five words (su u s d sd). */
  macros?: string[]; nsecs?: string[]; indus?: string[]; pl?: string[]; rg?: Partial<Record<ScoreRangeKey, [number | null, number | null]>>; st5?: string[]; lt5?: string[];
  /** Task #257 (Basic SPEC §3): the FinLit IQ rating in three groups (good = Strong or Healthy, below = Below Healthy, nr = Not rated); its ranges are `rg`'s
   *  o (FinLit IQ), pq Quality, pg Growth, pp Profitability, pb Balance sheet, pt Technical. */
  iqg?: string[] };
export type ScoreRangeKey = "z" | "zf" | "zv" | "zq" | "zr" | BasicRangeKey;
export type BasicRangeKey = "o" | "pq" | "pg" | "pp" | "pb" | "pt";
export const BASIC_RANGE_KEYS: BasicRangeKey[] = ["o", "pq", "pg", "pp", "pb", "pt"];
export const SCORE_RANGE_KEYS: ScoreRangeKey[] = ["z", "zf", "zv", "zq", "zr", ...BASIC_RANGE_KEYS];
const rangeOn = (b: BarFilter) => SCORE_RANGE_KEYS.filter((k) => b.rg?.[k] && (b.rg[k]![0] != null || b.rg[k]![1] != null));
/** How many filters of the Prism score panel are on: each ticked word and each range, as on the all-companies view. */
export const barScoreCount = (b: BarFilter) => (b.pl?.length ?? 0) + rangeOn(b).length + (b.st5?.length ?? 0) + (b.lt5?.length ?? 0) + (b.iqg?.length ?? 0);
const advParams = (b: BarFilter): string[] => [
  ...(b.macros ?? []).map((x) => "macro=" + encodeURIComponent(x)), ...(b.nsecs ?? []).map((x) => "nsec=" + encodeURIComponent(x)), ...(b.indus ?? []).map((x) => "indu=" + encodeURIComponent(x)),
  ...(b.pl?.length ? ["pl=" + b.pl.join(",")] : []),
  ...rangeOn(b).flatMap((k) => { const [lo, hi] = b.rg![k]!; return [...(lo != null ? [`${k}min=${lo}`] : []), ...(hi != null ? [`${k}max=${hi}`] : [])]; }),
  ...(b.st5?.length ? ["st5=" + b.st5.join(",")] : []), ...(b.lt5?.length ? ["lt5=" + b.lt5.join(",")] : []),
  ...(b.iqg?.length ? ["iqg=" + b.iqg.join(",")] : []),
];
export const NO_BAR: BarFilter = { q: "", sizes: [], sectors: [], rating: "", fresh: false, ahead: false, nse: false, fno: false, liquid: false, sag: false, plead: false, ind: null };
export const barParams = (b: BarFilter): string[] => [...(b.q.trim() ? ["q=" + encodeURIComponent(b.q.trim())] : []), ...b.sizes.map((x) => "size=" + encodeURIComponent(x)),
  ...b.sectors.map((x) => "sector=" + encodeURIComponent(x)), ...(b.rating ? ["rating=" + b.rating] : []), ...(b.fresh ? ["new=1"] : []), ...(b.ahead ? ["ahead=1"] : []), ...(b.nse ? ["nse=1"] : []),
  ...(b.fno ? ["fno=1"] : []), ...(b.liquid ? ["liquid=1"] : []), ...(b.sag ? ["sag=1"] : []), ...(b.plead ? ["plead=1"] : []), ...(b.ind ? ["ind=" + encodeURIComponent(b.ind.slug)] : []), ...advParams(b)];
/** How many filters are on (the search box counts as one). */
export const barCount = (b: BarFilter) => (b.q.trim() ? 1 : 0) + b.sizes.length + b.sectors.length + (b.rating ? 1 : 0) + (b.fresh ? 1 : 0) + (b.ahead ? 1 : 0) + (b.nse ? 1 : 0) + (b.fno ? 1 : 0) + (b.liquid ? 1 : 0) + (b.sag ? 1 : 0) + (b.plead ? 1 : 0) + (b.ind ? 1 : 0)
  + (b.macros?.length ?? 0) + (b.nsecs?.length ?? 0) + (b.indus?.length ?? 0) + barScoreCount(b);
export const detailPath = (id: string, chips: string[], offset = 0, limit?: number, asOn?: string | null, bar: BarFilter = NO_BAR) => {
  const q = chips.map((c) => "chip=" + encodeURIComponent(c));
  q.push(...barParams(bar));
  if (asOn) q.push("as_on=" + encodeURIComponent(asOn));
  if (offset > 0) q.push("offset=" + offset);
  if (limit != null) q.push("limit=" + limit);
  return `/api/screener/presets/${encodeURIComponent(id)}` + (q.length ? "?" + q.join("&") : "");
};
export function usePresetDetail(id: string | null, chips: string[], enabled: boolean, offset = 0, asOn: string | null = null, bar: BarFilter = NO_BAR) {
  return useQuery<PresetDetail, ApiError>({
    queryKey: ["preset", id, [...chips].sort().join(","), offset, asOn, barParams(bar).join("&")], enabled: enabled && !!id, staleTime: 300_000, placeholderData: keepPreviousData,
    retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 1,
    queryFn: () => apiGet<PresetDetail>(detailPath(id!, chips, offset, undefined, asOn, bar)),
  });
}

// ---------- screen history: the day picked in "As on" stays while the reader moves between screens and between the two pages ----------
const AS_ON_KEY = "fl.asOn.v1";
const asOnListeners = new Set<() => void>();
const readAsOn = (): string | null => { try { return sessionStorage.getItem(AS_ON_KEY); } catch { return null; } };
export const setAsOn = (d: string | null) => { try { if (d) sessionStorage.setItem(AS_ON_KEY, d); else sessionStorage.removeItem(AS_ON_KEY); } catch { /* private window: the pick lasts for this page only */ } asOnListeners.forEach((f) => f()); };
export const useAsOn = (): [string | null, (d: string | null) => void] => [useSyncExternalStore((f) => { asOnListeners.add(f); return () => { asOnListeners.delete(f); }; }, readAsOn, () => null), setAsOn];
/** One option of the date menu (task #243, pack P3): a saved list with its count and joined / left against the previous one, or a trading day with no saved list. */
export type HistorySession = { date: string; count: number | null; rulesUpdated: boolean; joined?: number | null; left?: number | null; prev?: string | null;
  status?: "latest" | "saved" | "rules" | "first" | "not_saved"; saved?: boolean };
export function usePresetHistory(id: string | null, chips: string[], enabled: boolean) {
  return useQuery<{ sessions: HistorySession[] }, ApiError>({ queryKey: ["preset-history", id, [...chips].sort().join(",")], enabled: enabled && !!id, staleTime: 600_000, retry: false,
    queryFn: () => apiGet(`/api/screener/presets/${encodeURIComponent(id!)}/history` + (chips.length ? "?" + chips.map((c) => "chip=" + encodeURIComponent(c)).join("&") : "")) });
}
export type LeftRow = { symbol: string; added_on: string | null; left_on: string; sessions: number | null; lists_on?: number; change_pct: number | null; reason: string | null };
export type LeftMode = "on" | "upto" | "after";
/** Left the list (task #243, pack P8): follows the date picked; built only from saved lists. */
export function usePresetLeft(id: string | null, chips: string[], enabled: boolean, asOn: string | null = null, mode: LeftMode = "on") {
  return useQuery<{ left: LeftRow[]; date: string | null; first?: string; mode?: LeftMode; counts?: Record<LeftMode, number> }, ApiError>({
    queryKey: ["preset-left", id, [...chips].sort().join(","), asOn, mode], enabled: enabled && !!id, staleTime: 600_000, retry: false, placeholderData: keepPreviousData,
    queryFn: () => apiGet(`/api/screener/presets/${encodeURIComponent(id!)}/left?` + [...chips.map((c) => "chip=" + encodeURIComponent(c)), ...(asOn ? ["as_on=" + encodeURIComponent(asOn)] : []), "mode=" + mode].join("&")) });
}

// ---------- the table ----------
export type SortState = { key: string; dir: 1 | -1 } | null;
const val = (r: PresetRow, key: string): unknown => (key === "symbol" ? r.symbol : r[key]);
/** Sorts the shown rows only (the screen's own order is the default). Missing values always go last. */
export function sortPresetRows(rows: PresetRow[], s: SortState): PresetRow[] {
  if (!s) return rows;
  return rows.map((r, i) => ({ r, i })).sort((a, b) => {
    const x = val(a.r, s.key), y = val(b.r, s.key), nx = x == null || x === "", ny = y == null || y === "";
    if (nx || ny) return nx && ny ? a.i - b.i : nx ? 1 : -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true, sensitivity: "base" });
    return c * s.dir || a.i - b.i;
  }).map((o) => o.r);
}
export const nextSortState = (s: SortState, key: string, firstDir: 1 | -1 = -1): SortState => (!s || s.key !== key ? { key, dir: firstDir } : s.dir === firstDir ? { key, dir: (firstDir * -1) as 1 | -1 } : null);

/** A theme's leaders only (the row filter behind the theme cards). */
export const rowsForTheme = (rows: PresetRow[], t: Theme | null): PresetRow[] => (t ? rows.filter((r) => t.leaders.includes(r.symbol)) : rows);

/** A breadth figure arrives as a percentage (43) or a share (0.43); both are shown as a percentage. */
export const asPct = (v: number | null | undefined): number | null => (v == null ? null : Math.abs(v) <= 1 ? v * 100 : v);
