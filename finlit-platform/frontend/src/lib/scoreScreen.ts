// Pure logic of the Advanced stock screener (FinLit Prism): filters, sorting, paging, presets, summary numbers and URL state.
// No score is computed here: every Prism figure is the stored one. A missing score is null and never passes a score filter or counts as zero.
// Task #283: FinLit Prism is FinLit's only company score; the older overall score's bands, pillars, rating chips and Top N lists left with the Basic screener.
import { scoreBand } from "./scoreBands";
import { CAP_BUCKETS, capBucket, SIZE_SHORTS, type SizeShort } from "./capBuckets";
import { migrateSmall } from "./sizeMigration";
import type { Row } from "./screener";
import { NSE_INDUSTRY, NSE_MACRO, NSE_SECTORS as NSE_SECTOR_NAMES, nseLevels } from "./nseTaxonomy";
import { ratingWord, scoreBand as trendTone } from "./prismTechnical";
import { LABEL_WORD, LABEL_SLUG, PRISM_LABELS, PRISM_NAMES, PRISM_RANGE_KEYS, labelFromSlug, prismRangeValue, hasPrism, type PrismCol, type PrismLabel, type PrismRangeKey } from "./scorePrism";

export type Cap = SizeShort;
/** `ret_3m`, `ret_6m` and `pct_from_high` feed the optional 52-week and return columns: read from the stored screener numbers, blank without enough price history. */
export type Item = Row & { cap: Cap | null; /** task #257: NSE's three levels (macro sector 12, sector 22, industry 59) from the company's industry; null when NSE has not classified it */ lv: { industry: string; sector: string; macro: string } | null; /** Leader / In line / Laggard among its peers (Gold list only, while the label is switched on), and "3 of 13 IT peers". */ lead?: "leader" | "in_line" | "laggard" | null; lead_line?: string | null; ret_3m?: number | null; ret_6m?: number | null; pct_from_high?: number | null };
export type RangeKey = "dh" | PrismRangeKey;   // dh: down from the 52-week high; the rest are Prism's score and its four parts
export type SortKey = "name" | "price" | "market_cap" | "sector" | PrismCol | "ret_3m" | "ret_6m" | "return_1y" | "pct_from_high";
/** `maxExcl`: the maximum is a strict upper bound ("below 50"), so a score of 49.75 is in and 50 is out, with no gap between "below 50" and "50 or more". */
export type Range = { min: number | null; max: number | null; maxExcl?: boolean };
/** The three technical-view bands of the advanced screener: the Prism card's own bands, with "Strong uptrend" counted as Uptrend and "Strong downtrend" as Downtrend. */
export type TechBand = "pos" | "neutral" | "neg";
export type TechKey = "st" | "lt";
export const TECH_KEYS: TechKey[] = ["st", "lt"];
export const TECH_BAND_ORDER: TechBand[] = ["pos", "neutral", "neg"];
export const TECH_BANDS: Record<TechBand, { label: string; short: string }> = {
  // band names only on the page (task #64, 14 Nov N-31): the edges stay with the model (TREND_EDGES, the Prism card's own)
  pos: { label: "Uptrend", short: "Uptrend" },
  neutral: { label: "Sideways", short: "Sideways" },
  neg: { label: "Downtrend", short: "Downtrend" },
};
export const TECH_NAMES: Record<TechKey, string> = { st: "Short-term technical", lt: "Long-term technical" };
/** The band of a technical score, from the same edges as the Prism card; null when there is no score. */
export const techBandOf = (score: number | null | undefined): TechBand | null => {
  const t = trendTone(score ?? null);
  return t === "na" ? null : t === "strongpos" || t === "pos" ? "pos" : t === "neutral" ? "neutral" : "neg";
};
/** The site's descriptive word for a technical score (never the model's own word). */
export const trendWord = (score: number | null | undefined): string | null => (score == null ? null : ratingWord(null, score).word);

export const CAPS: Cap[] = [...SIZE_SHORTS];
/** Task #258 (SPEC §1): each size with its ₹ range, from the site's one rule (lib/capBuckets.ts, task #262). */
export const CAP_RANGE: Record<Cap, string> = Object.fromEntries(CAP_BUCKETS.map((b) => [b.short, b.range])) as Record<Cap, string>;
export const RANGE_KEYS: RangeKey[] = ["dh", ...PRISM_RANGE_KEYS];
/** "dh": how far the price is down from its 52-week high, in percent (0 = at the high). It is about the price, not a model (task #60). */
export const SHARED_RANGES: RangeKey[] = ["dh"];
export const NAMES: Record<RangeKey, string> = { dh: "Down from 52-week high", ...PRISM_NAMES };
export const PAGE_SIZES = [25, 50, 100];      // 25 rows by default (task #64, B-6 / V-9)

/** Colour level of a score: the site's one colour rule (green 70+, orange 50 to 69, red under 50), see lib/scoreBands.ts. Colour only decorates; the model's word and the number carry the meaning. */
export const level = scoreBand;

/** Each row with its size and NSE levels. Size is by market value, one scale for the whole site (lib/capBuckets.ts): Large above ₹75,000 Cr, Mid ₹25,000–75,000 Cr,
 *  Small ₹10,000–25,000 Cr, Micro below ₹10,000 Cr (no size without a market cap). */
export function withScores(rows: Row[]): Item[] {
  return rows.map((r) => {
    const mc = r.market_cap;
    return { ...r, lv: levelsOf(r), cap: mc == null || !(mc > 0) ? null : capBucket(mc)?.short ?? null };
  });
}

// ---------- filters ----------
export type Filters = {
  caps: Cap[]; sectors: string[];
  /** NSE industries (any of these): the Sector and industry filter (14 Nov N-28 / N-34). `sectors` above is the old filter on the company's own label, kept so old links still work. */
  industries: string[];
  /** NSE's macro sectors (12) and sectors (22) (#257, #258): three linked lists with `industries`, AND across the three, OR inside one */
  macros: string[]; nsecs: string[];
  ranges: Record<RangeKey, Range>;
  labels: PrismLabel[];     // FinLit Prism rating labels (any of these)
  rated: boolean;           // only companies that have a Prism score
  tech: Record<TechKey, TechBand[]>;   // Prism short-term and long-term technical views (any of these bands)
  /** Task #258 (SPEC §3): the two technical views in the five trend words (the older three-band `tech` stays for old links and the Prism presets). */
  trend: Record<TechKey, Trend5[]>;
};
export const emptyFilters = (): Filters => ({
  caps: [], sectors: [], industries: [], macros: [], nsecs: [],
  ranges: Object.fromEntries(RANGE_KEYS.map((k) => [k, { min: null, max: null }])) as Filters["ranges"],
  labels: [], rated: false, tech: { st: [], lt: [] }, trend: { st: [], lt: [] },
});
export const cloneFilters = (f: Filters): Filters => ({ caps: [...f.caps], sectors: [...f.sectors], industries: [...(f.industries ?? [])],
  ranges: Object.fromEntries(RANGE_KEYS.map((k) => [k, { ...f.ranges[k] }])) as Filters["ranges"], labels: [...f.labels], rated: f.rated, tech: { st: [...f.tech.st], lt: [...f.tech.lt] },
  macros: [...(f.macros ?? [])], nsecs: [...(f.nsecs ?? [])], trend: { st: [...(f.trend?.st ?? [])], lt: [...(f.trend?.lt ?? [])] } });

/** FinLit Prism's own five bands (task #64, 14 Nov N-32), the edges of the Prism card (scoreBands.BAND_RULE): Poor below 35,
 *  Weak 35, Average 50, Healthy 65, Strong 80. The page shows the names only (N-31); a chip is a half-open range, so no score falls between two. */
export type PBand = "poor" | "weak" | "average" | "healthy" | "strong";
export const PBAND_ORDER: PBand[] = ["poor", "weak", "average", "healthy", "strong"];
export const PBAND_WORD: Record<PBand, string> = { poor: "Poor", weak: "Weak", average: "Average", healthy: "Healthy", strong: "Strong" };
const PEDGE: (number | null)[] = [null, 35, 50, 65, 80];
export function pBandsToRange(bands: PBand[]): Range {
  const idx = PBAND_ORDER.map((b, i) => (bands.includes(b) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return { min: null, max: null };
  const lo = idx[0], hi = idx[idx.length - 1];
  const min = lo === 0 ? null : (PEDGE[lo] as number), max = hi === PBAND_ORDER.length - 1 ? null : (PEDGE[hi + 1] as number);
  return max == null ? { min, max } : { min, max, maxExcl: true };
}
export function rangeToPBands(r: Range): PBand[] {
  if (r.min == null && r.max == null) return [];
  for (let lo = 0; lo < PBAND_ORDER.length; lo++) for (let hi = lo; hi < PBAND_ORDER.length; hi++) {
    const bands = PBAND_ORDER.slice(lo, hi + 1), w = pBandsToRange(bands);
    if (w.min === r.min && w.max === r.max && !!w.maxExcl === !!r.maxExcl) return bands;
  }
  return [];
}
export function togglePRangeBand(r: Range, b: PBand): Range {
  const cur = rangeToPBands(r), i = PBAND_ORDER.indexOf(b);
  if (cur.includes(b)) { const rest = cur.filter((x) => x !== b); const ok = rest.length === 0 || rest.every((x, k) => k === 0 || PBAND_ORDER.indexOf(x) === PBAND_ORDER.indexOf(rest[k - 1]) + 1); return pBandsToRange(ok ? rest : []); }
  const next = cur.length && (PBAND_ORDER.indexOf(cur[0]) === i + 1 || PBAND_ORDER.indexOf(cur[cur.length - 1]) === i - 1) ? [...cur, b] : [b];
  return pBandsToRange(next);
}
export const inRange = (v: number | null, r: Range) => (r.min == null && r.max == null) || (v != null && (r.min == null || v >= r.min) && (r.max == null || (r.maxExcl ? v < r.max : v <= r.max)));
const rangeValue = (r: Item, k: RangeKey) => (k === "dh" ? r.pct_from_high ?? null : prismRangeValue(r, k) ?? null);

/** True when the company passes every filter. `skip` leaves one group out (used for the live counts beside the size and sector options). */
export type Skip = "caps" | "sectors" | "macro" | "nsec" | "ind" | "labels" | "trend:st" | "trend:lt";
export function passes(r: Item, f: Filters, skip?: Skip): boolean {
  if (skip !== "caps" && f.caps.length && !(r.cap && f.caps.includes(r.cap))) return false;
  if (skip !== "sectors" && f.sectors.length && !(r.sector && f.sectors.includes(r.sector))) return false;
  // the three NSE levels (#257 and #258): one rule for both screeners, on the company's `lv`
  if (skip !== "sectors" && skip !== "ind" && f.industries?.length) { const i = industryOf(r); if (!(i && f.industries.includes(i))) return false; }
  if (skip !== "macro" && f.macros?.length && !(r.lv && f.macros.includes(r.lv.macro))) return false;
  if (skip !== "nsec" && f.nsecs?.length && !(r.lv && f.nsecs.includes(r.lv.sector))) return false;
  if (f.rated && !hasPrism(r)) return false;
  if (skip !== "labels" && f.labels.length && !f.labels.includes(ratingOf(r))) return false;
  if (!TECH_KEYS.every((k) => { const b = techBandOf(r[k === "st" ? "prism_st_score" : "prism_lt_score"]); return !f.tech[k].length || (b != null && f.tech[k].includes(b)); })) return false;
  if (!TECH_KEYS.every((k) => { if (skip === `trend:${k}` || !f.trend?.[k]?.length) return true; const b = trend5Of(r[k === "st" ? "prism_st_score" : "prism_lt_score"]); return b != null && f.trend[k].includes(b); })) return false;
  return RANGE_KEYS.every((k) => inRange(rangeValue(r, k), f.ranges[k]));
}
export const applyFilters = (items: Item[], f: Filters) => items.filter((r) => passes(r, f));

/** Counts shown beside each size and sector option: companies that pass every other filter in the draft, so the numbers follow what you are setting. */
export function facetCounts(items: Item[], f: Filters) {
  const caps = { Large: 0, Mid: 0, Small: 0, Micro: 0 } as Record<Cap, number>;
  for (const r of items) if (r.cap && passes(r, f, "caps")) caps[r.cap]++;
  const m = new Map<string, number>();
  for (const r of items) if (r.sector) { if (passes(r, f, "sectors")) m.set(r.sector, (m.get(r.sector) || 0) + 1); else if (!m.has(r.sector)) m.set(r.sector, 0); }
  const sectors = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { caps, sectors, tree: sectorTree(items, f) };
}

/** 14 Nov N-28 / N-34: NSE's sectors, each with its industries under it and the companies that pass every other filter, for the Sector and industry filter. */
export type SectorNode = { sector: string; n: number; industries: { name: string; n: number }[] };
export function sectorTree(items: Item[], f: Filters): SectorNode[] {
  const by = new Map<string, Map<string, number>>();
  for (const r of items) {
    if (!r.nse_sector || !r.nse_industry) continue;
    const inds = by.get(r.nse_sector) ?? new Map<string, number>(); by.set(r.nse_sector, inds);
    inds.set(r.nse_industry, (inds.get(r.nse_industry) ?? 0) + (passes(r, f, "sectors") ? 1 : 0));
  }
  return [...by.entries()].map(([sector, m]) => ({ sector, n: [...m.values()].reduce((a, b) => a + b, 0), industries: [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.sector.localeCompare(b.sector));
}

/** Task #257 (SHARED §1, SPEC §1-2): the three linked lists. Every NSE name of a level is listed (12, 22, 59), narrowed only by the parent level picked
 *  (a macro sector narrows Sector and Industry, a sector narrows Industry); each count is the companies that pass every OTHER filter (its own level left
 *  out), so it follows what is set. `on` is false for a name no company passes now (shown greyed, "Not on this list" in an open screen). */
export type LevelOpt = { name: string; n: number; on: boolean };
export type Levels = { macro: LevelOpt[]; sector: LevelOpt[]; industry: LevelOpt[] };
const INDUSTRY_NAMES = Object.keys(NSE_INDUSTRY);
export const sectorsOf = (macros: string[]): string[] => (macros.length ? NSE_SECTOR_NAMES.filter((s) => INDUSTRY_NAMES.some((i) => NSE_INDUSTRY[i][0] === s && macros.includes(NSE_INDUSTRY[i][1]))) : [...NSE_SECTOR_NAMES]);
export const industriesOf = (macros: string[], secs: string[]) => INDUSTRY_NAMES.filter((i) => (!secs.length || secs.includes(NSE_INDUSTRY[i][0])) && (!macros.length || macros.includes(NSE_INDUSTRY[i][1]))).sort((a, b) => a.localeCompare(b));
export function levelCounts(items: Item[], f: Filters): Levels {
  const count = (skip: Skip, key: (r: Item) => string | null) => { const m = new Map<string, number>(); for (const r of items) { const k = key(r); if (k && passes(r, f, skip)) m.set(k, (m.get(k) ?? 0) + 1); } return m; };
  const mac = count("macro", (r) => r.lv?.macro ?? null), sec = count("nsec", (r) => r.lv?.sector ?? null), ind = count("ind", (r) => r.lv?.industry ?? null);
  const opts = (names: readonly string[], m: Map<string, number>) => names.map((name) => ({ name, n: m.get(name) ?? 0, on: (m.get(name) ?? 0) > 0 })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return { macro: opts(NSE_MACRO, mac), sector: opts(sectorsOf(f.macros ?? []), sec), industry: opts(industriesOf(f.macros ?? [], f.nsecs ?? []), ind) };
}
/** Picking at one level takes off a lower-level choice that no longer fits (SHARED §1): returns the new filters and the names taken off. */
export function fitLevels(f: Filters): { f: Filters; dropped: string[] } {
  const n = cloneFilters(f), okSec = sectorsOf(n.macros), okInd = industriesOf(n.macros, n.nsecs);
  const dropped = [...n.nsecs.filter((s) => !okSec.includes(s)), ...n.industries.filter((i) => NSE_INDUSTRY[i] && !okInd.includes(i))];
  n.nsecs = n.nsecs.filter((s) => okSec.includes(s)); n.industries = n.industries.filter((i) => !NSE_INDUSTRY[i] || okInd.includes(i));
  return { f: n, dropped };
}
// ---------- validation ----------
export type Problems = Partial<Record<RangeKey, string>>;
/** Problems with the min-max boxes: outside 0 to 100, or a minimum above the maximum. */
export function validate(f: Filters): Problems {
  const out: Problems = {};
  for (const k of RANGE_KEYS) {
    const { min, max } = f.ranges[k];
    if ([min, max].some((v) => v != null && (!Number.isFinite(v) || v < 0 || v > 100))) out[k] = "Use numbers from 0 to 100.";
    else if (min != null && max != null && min > max) out[k] = "The minimum is above the maximum.";
  }
  return out;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
/** Views of the advanced screener, built from the Prism parts only. A preset OWNS the Prism score, its four parts, the rating labels, the "rated only"
 *  switch and the two technical views: choosing it sets those exactly (cleared where it names nothing), every other filter stays. */
export type PrismPreset = { id: string; label: string; say: string; ranges: Partial<Record<RangeKey, Range>>; labels: PrismLabel[]; rated: boolean; tech?: Partial<Record<TechKey, TechBand[]>> };
const min = (n: number): Range => ({ min: n, max: null });
export const PRISM_PRESETS: PrismPreset[] = [
  { id: "strongsafe", label: "Prism strong and lower risk", say: "A Prism score of 80 or more (Strong) and Prism Risk 65 or more (a higher Risk score means lower risk).", ranges: { z: min(80), zr: min(65) }, labels: [], rated: true },
  { id: "fairvalue", label: "Strong Growth & Profitability at a fair valuation", say: "Prism Growth & Profitability 65 or more and Prism Valuation 50 or more. Valuation is higher when the price is more modest for what the company earns.", ranges: { zf: min(65), zv: min(50) }, labels: [], rated: true },
  { id: "bothtech", label: "Uptrend on both technical views", say: "Prism's short-term and long-term technical views are both in an uptrend (+20 or more).", ranges: {}, labels: [], rated: false, tech: { st: ["pos"], lt: ["pos"] } },
  { id: "weakvalue", label: "Growth & Profitability strong but valuation weak", say: "Prism Growth & Profitability 65 or more but Prism Valuation below 50: a business that scores well, at a price that is less modest for what it earns.", ranges: { zf: min(65), zv: { min: null, max: 50, maxExcl: true } }, labels: [], rated: true },
];
const OWNED: RangeKey[] = [...PRISM_RANGE_KEYS];
const none = (): Range => ({ min: null, max: null });
export function withPrismPreset(f: Filters, p: PrismPreset): Filters {
  const n = cloneFilters(f);
  OWNED.forEach((k) => { n.ranges[k] = { ...none(), ...(p.ranges[k] || {}) }; });
  n.labels = [...p.labels]; n.rated = p.rated; n.tech = { st: [...(p.tech?.st ?? [])], lt: [...(p.tech?.lt ?? [])] };
  return n;
}
export const activePrismPreset = (f: Filters) => PRISM_PRESETS.find((p) => f.rated === p.rated && same(f.labels, p.labels) && same(f.tech.st, p.tech?.st ?? []) && same(f.tech.lt, p.tech?.lt ?? [])
  && OWNED.every((k) => { const want = { ...none(), ...(p.ranges[k] || {}) }; return f.ranges[k].min === want.min && f.ranges[k].max === want.max && !!f.ranges[k].maxExcl === !!want.maxExcl; }))?.id ?? null;
/** Clearing a Prism preset again removes what it set. */
export const withoutPrismPreset = (f: Filters): Filters => withPrismPreset(f, { id: "", label: "", say: "", ranges: {}, labels: [], rated: false });

// ---------- chips ----------
export type Chip = { id: string; label: string };
const rangeText = (r: Range) => (r.max != null && r.maxExcl ? (r.min != null ? `${r.min} to below ${r.max}` : `below ${r.max}`) : r.min != null && r.max != null ? `${r.min} to ${r.max}` : r.min != null ? `${r.min} or more` : `${r.max} or less`);
/** One chip per active filter (one per selected sector), each removable on its own. */
export function chipsFor(f: Filters): Chip[] {
  const out: Chip[] = [];
  if (f.caps.length) out.push({ id: "caps", label: `Market cap: ${CAPS.filter((c) => f.caps.includes(c)).join(", ")}` });
  f.sectors.forEach((s) => out.push({ id: "sector:" + s, label: s }));
  (f.macros ?? []).forEach((s) => out.push({ id: "macro:" + s, label: `Macro sector: ${s}` }));
  (f.nsecs ?? []).forEach((s) => out.push({ id: "nsec:" + s, label: `Sector: ${s}` }));
  (f.industries ?? []).forEach((s) => out.push({ id: "ind:" + s, label: NSE_INDUSTRY[s] ? `Industry: ${s}` : s }));
  RANGE_KEYS.forEach((k) => { const r = f.ranges[k]; if (r.min != null || r.max != null) {
    const pb = (PRISM_RANGE_KEYS as readonly string[]).includes(k) ? rangeToPBands(r) : [];   // a Prism part set by its band chips reads as the band names, never the cut-offs (N-31)
    out.push({ id: "range:" + k, label: `${NAMES[k]}: ${pb.length ? pb.map((b) => PBAND_WORD[b]).join(", ") : rangeText(r)}${k === "dh" ? "%" : ""}` }); } });
  if (f.labels.length) out.push({ id: "labels", label: `Prism rating: ${PRISM_LABELS.filter((l) => f.labels.includes(l)).map((l) => LABEL_WORD[l]).join(", ")}` });
  TECH_KEYS.forEach((k) => { if (f.tech[k].length) out.push({ id: "tech:" + k, label: `${TECH_NAMES[k]}: ${TECH_BAND_ORDER.filter((b) => f.tech[k].includes(b)).map((b) => TECH_BANDS[b].short).join(", ")}` }); });
  TECH_KEYS.forEach((k) => { if (f.trend?.[k]?.length) out.push({ id: "trend:" + k, label: `${k === "st" ? "Short term" : "Long term"}: ${TREND5.filter((b) => f.trend[k].includes(b)).map((b) => TREND5_WORD[b]).join(", ")}` }); });
  if (f.rated) out.push({ id: "rated", label: "Only companies rated by Prism" });
  return out;
}
export function removeChip(f: Filters, id: string): Filters {
  const n = cloneFilters(f);
  if (id === "caps") n.caps = [];
  else if (id.startsWith("sector:")) n.sectors = n.sectors.filter((s) => s !== id.slice(7));
  else if (id.startsWith("ind:")) n.industries = n.industries.filter((s) => s !== id.slice(4));
  else if (id.startsWith("macro:")) return fitLevels({ ...n, macros: n.macros.filter((s) => s !== id.slice(6)) }).f;
  else if (id.startsWith("nsec:")) n.nsecs = n.nsecs.filter((s) => s !== id.slice(5));
  else if (id.startsWith("trend:")) n.trend[id.slice(6) as TechKey] = [];
  else if (id.startsWith("range:")) n.ranges[id.slice(6) as RangeKey] = { min: null, max: null };
  else if (id === "labels") n.labels = [];
  else if (id === "rated") n.rated = false;
  else if (id.startsWith("tech:")) n.tech[id.slice(5) as TechKey] = [];
  return n;
}

// ---------- sorting and paging ----------
export type Sort = { key: SortKey; dir: 1 | -1 };
export const DEFAULT_SORT: Sort = { key: "market_cap", dir: -1 };
const sortValue = (r: Item, k: SortKey) => (k === "name" ? r.name || r.symbol : r[k]);
/** Stable sort; companies with no value for the column always go last, in either direction. */
export function sortRows(rows: Item[], s: Sort): Item[] {
  return rows.map((r, i) => ({ r, i, v: sortValue(r, s.key) })).sort((a, b) => {
    if (a.v == null && b.v == null) return a.i - b.i;
    if (a.v == null) return 1;
    if (b.v == null) return -1;
    const c = typeof a.v === "string" ? a.v.localeCompare(b.v as string) : (a.v as number) - (b.v as number);
    return c * s.dir || a.i - b.i;
  }).map((x) => x.r);
}
/** Clicking a heading: same column flips the direction, a new column starts high-to-low (A to Z for text). */
const firstDir = (key: SortKey): 1 | -1 => (key === "name" || key === "sector" || key === "pct_from_high" ? 1 : -1);
export const nextSort = (s: Sort, key: SortKey): Sort => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : firstDir(key) });

export function pageOf<T>(rows: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { page: p, pages, view: rows.slice(p * size, (p + 1) * size), from: rows.length ? p * size + 1 : 0, to: Math.min((p + 1) * size, rows.length) };
}
/** Page numbers to show: first, last, and two either side of the current one, with null for a gap. */
export function pageList(page: number, pages: number): (number | null)[] {
  const keep = new Set([0, pages - 1, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 0 && n < pages));
  const out: (number | null)[] = []; let prev = -1;
  [...keep].sort((a, b) => a - b).forEach((n) => { if (n - prev > 1) out.push(null); out.push(n); prev = n; });
  return out;
}

// ---------- summary ----------
export function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function summarize(rows: Item[]) {
  return { found: rows.length, sectors: new Set(rows.map((r) => r.sector).filter(Boolean)).size,
    medZ: median(rows.map((r) => r.prism_final ?? null)), nZ: rows.filter(hasPrism).length };
}
/** Sector shares of the result: the biggest `top` sectors, the rest as "Other sectors", and companies with no sector listed. */
export function concentration(rows: Item[], top = 5): { label: string; n: number; pct: number }[] {
  if (!rows.length) return [];
  const m = new Map<string, number>(); let none = 0;
  rows.forEach((r) => (r.sector ? m.set(r.sector, (m.get(r.sector) || 0) + 1) : none++));
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out = sorted.slice(0, top).map(([label, n]) => ({ label, n }));
  const rest = sorted.slice(top).reduce((a, [, n]) => a + n, 0);
  if (rest) out.push({ label: "Other sectors", n: rest });
  if (none) out.push({ label: "Sector not listed", n: none });
  return out.map((x) => ({ ...x, pct: (x.n / rows.length) * 100 }));
}

// ---------- URL state ----------
export type State = { filters: Filters; sort: Sort; size: number; page: number };
export const SORT_KEYS: SortKey[] = ["name", "price", "market_cap", "sector", "prism_final", "prism_fundamental", "prism_valuation", "prism_quality", "prism_risk", "prism_st_score", "prism_lt_score", "ret_3m", "ret_6m", "return_1y", "pct_from_high"];
const num = (s: string | null) => { if (s == null || s.trim() === "") return null; const n = Number(s); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null; };
/** True for an older address whose ?q= held a band list of the retired score (the toolbar search then starts empty). */
export const isBandList = (s: string | null) => !!s && s.split(",").every((x) => ["low", "mixed", "mid", "healthy", "high"].includes(x));
const parseTech = (s: string | null): TechBand[] => TECH_BAND_ORDER.filter((b) => (s || "").split(",").includes(b));
/** How the address is written: "advanced" (the page: ?size=large,mid and ?rows=) or "all" (the older ?cap= and ?size=, kept for the pure logic and its tests).
 *  Both read the same filters; the retired score's parameters (its bands, ranges, rating chips, Top 10 and its sorts) are ignored. */
export type Scope = "all" | "advanced";

/** The address marker of a size filter written under the four-size rule (a "Small" without it is from an older link). */
export const SIZE_PARAM = "sz";
/** True for an address from before 20 Nov 2026 whose size filter says Small (below ₹10,000 Cr then, Micro now). */
export const isOldSizeLink = (p: URLSearchParams) => p.get(SIZE_PARAM) !== "4" && (p.get("cap") || "").split(",").includes("Small");

/** Reads the address. Unknown or broken values are ignored, so a hand-edited link never breaks the page. Old links (?cap=Large&sector=X&f=high) still work. */
export function parseState(p: URLSearchParams, _scope: Scope = "all"): State {   // both scopes read the same filters (task #283)
  const f = emptyFilters();
  // ?size=large,mid (task #258) or the older ?cap=Large. A ?cap= link from before the four sizes (20 Nov 2026) has no size marker: its "Small" meant
  // below ₹10,000 Cr, which is Micro now (sizeMigration.ts); ?size= is written only on the four-size rule
  const oldCaps = (p.get("cap") || "").split(",");
  const caps = [...(isOldSizeLink(p) ? migrateSmall(oldCaps) : oldCaps), ...(p.get("size") || "").split(",").map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())];
  f.caps = CAPS.filter((c) => caps.includes(c));
  // ?sector=: a name from NSE's 22 sectors filters on NSE's sector (task #258); any other value is the older filter on the company's own label
  const secs = [...new Set(p.getAll("sector").filter(Boolean))];
  f.nsecs = secs.filter((x) => NSE_SECTOR_SET.has(x));
  f.sectors = secs.filter((x) => !NSE_SECTOR_SET.has(x));
  f.macros = [...new Set(p.getAll("macro").filter((x) => NSE_MACRO_SET.has(x)))];
  f.industries = [...new Set(p.getAll("ind").filter(Boolean))];
  RANGE_KEYS.forEach((k) => {
    let min = num(p.get(k + "min")), max = num(p.get(k + "max"));
    const lt = num(p.get(k + "lt"));      // ?zvlt=50: below 50 (a strict bound); an exact maximum in the same address wins
    if (lt != null && max == null) { f.ranges[k] = { min, max: lt, maxExcl: true }; return; }
    if (min != null && max != null && min > max) [min, max] = [max, min];
    f.ranges[k] = { min, max };
  });
  f.labels = (p.get("pl") || "").split(",").map(labelFromSlug).filter((l): l is PrismLabel => !!l).sort((a, b) => PRISM_LABELS.indexOf(a) - PRISM_LABELS.indexOf(b));
  f.rated = p.get("rated") === "1";
  f.tech = { st: parseTech(p.get("st")), lt: parseTech(p.get("lt")) };
  f.trend = { st: parseTrend5(p.get("st5")), lt: parseTrend5(p.get("lt5")) };
  const key = SORT_KEYS.find((k) => k === p.get("sort"));      // an older sort on the retired score (or a pillar) is no sort any more: the default order applies
  const sort: Sort = key ? { key, dir: p.get("dir") === "asc" ? 1 : p.get("dir") === "desc" ? -1 : firstDir(key) } : DEFAULT_SORT;
  const size = PAGE_SIZES.find((n) => n === Number(p.get("rows") ?? p.get("size"))) ?? 25;   // rows per page: ?rows= (task #258, since ?size= names the market-cap sizes there), or a number in the older ?size=
  const page = Math.max(0, (Math.floor(Number(p.get("page"))) || 1) - 1);
  return { filters: f, sort, size, page };
}
/** `scope` "advanced" writes the sizes as ?size=large,mid and the rows per page as ?rows= (task #258); "all" keeps the older ?cap= and ?size= addresses. */
export function serializeState(s: State, scope: Scope = "all"): URLSearchParams {
  const p = new URLSearchParams(), f = s.filters;
  if (f.caps.length) { const c = CAPS.filter((x) => f.caps.includes(x)); if (scope === "advanced") p.set("size", c.map((x) => x.toLowerCase()).join(",")); else { p.set("cap", c.join(",")); if (c.includes("Small")) p.set(SIZE_PARAM, "4"); } }   // sz=4 marks a four-size "Small" (task #262)
  (f.macros ?? []).forEach((x) => p.append("macro", x));
  (f.nsecs ?? []).forEach((x) => p.append("sector", x));
  f.sectors.forEach((x) => p.append("sector", x));
  f.industries.forEach((x) => p.append("ind", x));
  RANGE_KEYS.forEach((k) => { const r = f.ranges[k]; if (r.min != null) p.set(k + "min", String(r.min)); if (r.max != null) p.set(k + (r.maxExcl ? "lt" : "max"), String(r.max)); });
  if (f.labels.length) p.set("pl", PRISM_LABELS.filter((l) => f.labels.includes(l)).map((l) => LABEL_SLUG[l]).join(","));
  if (f.rated) p.set("rated", "1");
  TECH_KEYS.forEach((k) => { if (f.tech[k].length) p.set(k, TECH_BAND_ORDER.filter((b) => f.tech[k].includes(b)).join(",")); });
  TECH_KEYS.forEach((k) => { if (f.trend?.[k]?.length) p.set(k + "5", TREND5.filter((b) => f.trend[k].includes(b)).join(",")); });
  if (s.sort.key !== DEFAULT_SORT.key || s.sort.dir !== DEFAULT_SORT.dir) { p.set("sort", s.sort.key); p.set("dir", s.sort.dir === 1 ? "asc" : "desc"); }
  if (s.size !== 25) p.set(scope === "advanced" ? "rows" : "size", String(s.size));
  if (s.page > 0) p.set("page", String(s.page + 1));
  return p;
}
export const filtersKey = (f: Filters) => serializeState({ filters: f, sort: DEFAULT_SORT, size: 25, page: 0 }).toString();

// ---------- task #258 (20 Nov handoff): NSE's three levels, the five trend words and the Prism rating words ----------
// The linked-level rules are #257's (`lv`, levelCounts, fitLevels): both screeners share them; these are thin views for the Advanced page and its open screens.
const NSE_SECTOR_SET = new Set<string>(NSE_SECTOR_NAMES), NSE_MACRO_SET = new Set<string>(NSE_MACRO);
/** The company's NSE levels, named as the site's one taxonomy names them (nseTaxonomy.ts), from the stored classification's industry (task #192) or else the
 *  Stock screener's; the stored triple only when the taxonomy does not know the industry. One set of names, so the lists and the rows always match. */
export function levelsOf(r: Pick<Row, "cls_macro" | "cls_sector" | "cls_industry" | "nse_industry">): { industry: string; sector: string; macro: string } | null {
  const lv = nseLevels(r.cls_industry ?? r.nse_industry) ?? nseLevels(r.nse_industry);
  if (lv) return lv;
  return r.cls_industry && r.cls_sector && r.cls_macro ? { industry: r.cls_industry, sector: r.cls_sector, macro: r.cls_macro } : null;
}
export const industryOf = (r: Item): string | null => r.lv?.industry ?? r.nse_industry ?? null;
/** "Commodities › Metals & Mining › Ferrous Metals": the full path, shown on hover (SPEC §4); null for a company in no NSE industry. */
export const nsePath = (r: Item): string | null => (r.lv ? `${r.lv.macro} › ${r.lv.sector} › ${r.lv.industry}` : null);
export type Level = "macro" | "nsec" | "ind";
const LEVEL_KEY = { macro: "macros", nsec: "nsecs", ind: "industries" } as const;
const LEVEL_OF = { macro: "macro", nsec: "sector", ind: "industry" } as const;
/** One list's options (every name, narrowed by the parent picked), most companies first: #257's levelCounts. */
export const levelOptions = (items: Item[], f: Filters, level: Level): LevelOpt[] => levelCounts(items, f)[LEVEL_OF[level]];
/** Ticks or unticks one option; #257's fitLevels takes off a lower pick that no longer fits, and the line the page shows says so. */
export function pickLevel(f: Filters, level: Level, name: string): { filters: Filters; message: string | null } {
  const k = LEVEL_KEY[level], cur = f[k];
  const r = fitLevels({ ...cloneFilters(f), [k]: cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name] });
  return { filters: r.f, message: r.dropped.length ? `${r.dropped.join(", ")} ${r.dropped.length === 1 ? "was" : "were"} taken off: not inside your other choice.` : null };
}
/** The same on the three lists alone (an open screen keeps them in its own filter state). */
export type NsePicks = { macros: string[]; nsecs: string[]; industries: string[] };
export const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function pickNse(sel: NsePicks, level: Level, name: string): { sel: NsePicks; message: string | null } {
  const r = pickLevel({ ...emptyFilters(), ...sel }, level, name);
  return { sel: { macros: r.filters.macros, nsecs: r.filters.nsecs, industries: r.filters.industries }, message: r.message };
}
/** SPEC §2: every name of a level narrowed only by the parents picked, those on the list first by count, then the rest ("Not on this list"). */
export function screenLevel(sel: NsePicks, level: Level, counts: [string, number][] | undefined): { on: LevelOpt[]; off: string[]; all: number } {
  // facets come from the stored classification (NSE's spelling, "Oil, Gas & ..."): matched to the taxonomy's names without case, commas or spacing
  const names: string[] = level === "macro" ? [...NSE_MACRO] : level === "nsec" ? sectorsOf(sel.macros) : industriesOf(sel.macros, sel.nsecs);
  const byKey = new Map((counts ?? []).map(([k, n]) => [nameKey(k), n])), c = new Map(names.map((x) => [x, byKey.get(nameKey(x)) ?? 0]));
  const on = names.filter((x) => (c.get(x) ?? 0) > 0).map((name) => ({ name, n: c.get(name)!, on: true })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return { on, off: names.filter((x) => !(c.get(x) ?? 0)).sort((a, b) => a.localeCompare(b)), all: names.length };
}

/** SPEC §3: the five trend words of the two technical views, from the same edges as the Prism card. */
export type Trend5 = "su" | "u" | "s" | "d" | "sd";
export const TREND5: Trend5[] = ["su", "u", "s", "d", "sd"];
export const TREND5_WORD: Record<Trend5, string> = { su: "Strong uptrend", u: "Uptrend", s: "Sideways", d: "Downtrend", sd: "Strong downtrend" };
export function trend5Of(score: number | null | undefined): Trend5 | null {
  const t = trendTone(score ?? null);
  return t === "na" ? null : t === "strongpos" ? "su" : t === "pos" ? "u" : t === "neutral" ? "s" : t === "neg" ? "d" : "sd";
}
function parseTrend5(s: string | null): Trend5[] { const w = (s || "").split(","); return TREND5.filter((b) => w.includes(b)); }

/** SHARED §4: the rating word of a Prism score. Strong 80 and above, Healthy 65 to 79, Average 50 to 64, Weak 35 to 49, Poor below 35; Not rated without a score. */
export const ratingOfScore = (v: number | null | undefined): PrismLabel => (v == null || !Number.isFinite(v) ? "NOT RATED" : v >= 80 ? "STRONG" : v >= 65 ? "HEALTHY" : v >= 50 ? "AVERAGE" : v >= 35 ? "WEAK" : "POOR");
export const ratingOf = (r: Item): PrismLabel => ratingOfScore(r.prism_final);

/** SPEC §3: the counts beside the rating words and the trend words, each given every other filter. */
export function scoreCounts(items: Item[], f: Filters) {
  const labels = Object.fromEntries(PRISM_LABELS.map((l) => [l, 0])) as Record<PrismLabel, number>;
  const trend = { st: Object.fromEntries(TREND5.map((b) => [b, 0])), lt: Object.fromEntries(TREND5.map((b) => [b, 0])) } as Record<TechKey, Record<Trend5, number>>;
  for (const r of items) {
    if (passes(r, f, "labels")) labels[ratingOf(r)]++;
    for (const k of TECH_KEYS) {
      if (!passes(r, f, `trend:${k}`)) continue;
      const b = trend5Of(r[k === "st" ? "prism_st_score" : "prism_lt_score"]);
      if (b) trend[k][b]++;
    }
  }
  return { labels, trend };
}
/** How many filters of the Prism score panel are on (SPEC §3: the "Prism score · N" button and the panel's "N on"): the rating words, the five score ranges and
 *  the two technical views in the five trend words. The header row's own "Technical view" (the older three bands) and "52-week high" count on their own buttons. */
export const prismOnCount = (f: Filters) => f.labels.length + PRISM_RANGE_KEYS.filter((k) => f.ranges[k].min != null || f.ranges[k].max != null).length + f.trend.st.length + f.trend.lt.length + (f.rated ? 1 : 0);   // each ticked word and each range counts, as in the pack
/** "Clear score filters": only the panel's own filters; every other filter stays. */
export function withoutScoreFilters(f: Filters): Filters {
  const n = cloneFilters(f);
  n.labels = []; n.rated = false; n.trend = { st: [], lt: [] };
  PRISM_RANGE_KEYS.forEach((k) => { n.ranges[k] = { min: null, max: null }; });
  return n;
}
