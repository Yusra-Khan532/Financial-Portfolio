// Pure logic of the Prism report page (arcs, contributions, factor filters and sorting, threshold ticks, history series).
// Tested in prismReport.test.ts. Nothing here invents a number: every figure comes from the report or is a plain ratio of two reported figures.
import {
  isRated, partsOf, readingOf, standing, READINGS,
  type BenchmarkDetail, type PartKey, type PrismLabel, type PrismMetric, type PrismRating, type PrismReport,
} from "./prism";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Score bands of the model: the lowest score of each label. */
export const THRESHOLDS = [35, 50, 65, 80];
/** Tick positions (0-100) drawn on every score bar: the label thresholds. */
export const thresholdTicks = (): number[] => [...THRESHOLDS];

/** One colour variable per part; a part the model adds later gets a spare hue, never a clash with the known four. */
const PART_VAR: Record<string, string> = { fundamental: "--pzr-c1", valuation: "--pzr-c2", quality: "--pzr-c3", risk: "--pzr-c4", technical: "--pzr-c5" };
export const partVar = (k: PartKey, index = 0) => `var(${PART_VAR[k] ?? `--pzr-c${5 + (index % 3)}`})`;

export type ArcSegment = { key: PartKey; start: number; span: number; fill: number; score: number | null };
/** The prism ring: four equal arcs, one per part (fractions of the circle), each filled to its own score. Arc length says nothing about how
 *  much a part counts. Withheld scores (NOT RATED) give empty fills. `gap` is the fraction of the circle left between arcs. */
export function arcSegments(rating: Pick<PrismRating, "status" | "parts">, gap = 0.012): ArcSegment[] {
  const keys = partsOf(rating);
  const each = keys.length ? 1 / keys.length : 0;
  const rated = isRated(rating);
  return keys.map((key, i) => {
    const score = rated ? rating.parts?.[key] ?? null : null;
    const span = Math.max(0, each - gap);
    return { key, start: i * each + gap / 2, span, score, fill: score == null ? 0 : (span * Math.max(0, Math.min(100, score))) / 100 };
  });
}

export type FactorFilter = "all" | "strengths" | "concerns" | "estimated";
export type FactorSort = "model" | "high" | "low";
export const FILTER_WORD: Record<FactorFilter, string> = { all: "All factors", strengths: "Strengths", concerns: "Concerns", estimated: "Estimated or missing" };
/** The word for a factor's input state, as the model defines it (A actual, Z loss rule, S substituted, F estimated, L not supplied, N not applicable). */
export const BADGE_WORD: Record<PrismMetric["status"], string> = { A: "Actual", Z: "Actual, loss rule", S: "Substituted", F: "Estimated", N: "Not applicable", L: "Not available" };
type FactorRow = Pick<PrismMetric, "status" | "reading" | "points">;
export function matchesFilter(row: FactorRow, f: FactorFilter): boolean {
  if (f === "all") return true;
  if (f === "estimated") return row.status === "F" || row.status === "L";
  const s = standing(row);
  return f === "strengths" ? s === "pros" : s === "cons";
}
export const filterFactors = <T extends FactorRow>(rows: T[], f: FactorFilter): T[] => rows.filter((r) => matchesFilter(r, f));
/** 4 for Very strong down to 0 for Very weak; null when the factor has no reading. */
export const readingRank = (row: Pick<PrismMetric, "reading" | "points">): number | null => { const r = readingOf(row); return r == null ? null : READINGS.length - 1 - READINGS.indexOf(r); };
/** Sort by reading; factors without a reading always go last. Stable: ties keep the model's order. */
export function sortFactors<T extends Pick<PrismMetric, "reading" | "points">>(rows: T[], how: FactorSort): T[] {
  if (how === "model") return rows;
  const dir = how === "high" ? -1 : 1;
  return rows.map((r, i) => ({ r, i })).sort((a, b) => {
    const x = readingRank(a.r), y = readingRank(b.r);
    if (x == null && y == null) return a.i - b.i;
    if (x == null) return 1;
    if (y == null) return -1;
    return x === y ? a.i - b.i : (x - y) * dir;
  }).map((o) => o.r);
}

/** Top strength and biggest drag of a part, by reading. Only factors with a real or substituted value count: estimates never appear as a
 *  strength or drag. Ties keep the model's order. */
export function topFactors(rows: PrismMetric[]): { strength: PrismMetric | null; drag: PrismMetric | null } {
  const real = rows.filter((r) => (r.status === "A" || r.status === "S" || r.status === "Z") && readingRank(r) != null);
  const strong = real.filter((r) => standing(r) === "pros");
  const weak = real.filter((r) => standing(r) !== "pros");
  const strength = strong.reduce<PrismMetric | null>((best, r) => (best == null || readingRank(r)! > readingRank(best)! ? r : best), null);
  const drag = weak.reduce<PrismMetric | null>((worst, r) => (worst == null || readingRank(r)! < readingRank(worst)! ? r : worst), null);
  return { strength, drag };
}

export const bandLabel = (score: number | null | undefined): PrismLabel =>
  score == null ? "NOT RATED" : score >= 80 ? "STRONG" : score >= 65 ? "HEALTHY" : score >= 50 ? "AVERAGE" : score >= 35 ? "WEAK" : "POOR";

/** Whole days from a data date to the calculation; null when either is missing. */
export function daysBefore(asOf: string | null | undefined, calculated: string): number | null {
  if (!asOf) return null;
  const a = Date.parse(asOf), b = Date.parse(calculated);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.max(0, Math.round((b - a) / 86_400_000));
}
export const ageWords = (d: number | null) => (d == null ? "Date unavailable" : d === 0 ? "Same day as the calculation" : `${d} day${d === 1 ? "" : "s"} before the calculation`);

/* ---- financial history series */
export type Series = { period: string; value: number | null }[];
/** "2023-03", "Mar 2023" and "2023" as a month number; null when no year is found. */
export function monthIndex(period: string): number | null {
  const iso = period.match(/^(\d{4})-(\d{2})/);
  if (iso) return Number(iso[1]) * 12 + Number(iso[2]) - 1;
  const named = period.match(/^([A-Za-z]{3})\w*\s+(\d{4})/);
  if (named) { const m = MONTHS.findIndex((x) => x.toLowerCase() === named[1].toLowerCase()); return m >= 0 ? Number(named[2]) * 12 + m : null; }
  const y = period.match(/^(\d{4})$/);
  return y ? Number(y[1]) * 12 : null;
}
/** Growth against the same period one year earlier, in %. Null where the period or its comparison is missing, or the comparison is not positive.
 *  Annual series are one year apart, so the comparison is the previous year; quarterly series compare with the same quarter a year before. */
export function yoy(series: Series, stepMonths = 12): (number | null)[] {
  const byIdx = new Map<number, number | null>();
  series.forEach((p) => { const i = monthIndex(p.period); if (i != null) byIdx.set(i, p.value); });
  return series.map((p) => {
    const i = monthIndex(p.period);
    if (i == null || p.value == null) return null;
    const prev = byIdx.get(i - stepMonths);
    return prev == null || prev <= 0 ? null : ((p.value - prev) / prev) * 100;
  });
}
/** a / b in %, null when either is missing or b is not positive. Used for margins and returns on the reported numbers. */
export const ratioPct = (a: number | null | undefined, b: number | null | undefined): number | null => (a == null || b == null || b <= 0 ? null : (a / b) * 100);
export const periodLabel = (p: string) => { const i = p.match(/^(\d{4})-(\d{2})$/); return i ? `${MONTHS[Number(i[2]) - 1]} ${i[1].slice(2)}` : p; };

export type PeerRow = { key: "pe" | "pb" | "ev_ebitda"; label: string; company: number | null; benchmark: number | null; own: number | null; detail?: BenchmarkDetail };
/** Valuation multiples against the benchmark, from the report's latest ratios and its benchmark block. */
export function peerRows(report: Pick<PrismReport, "financialHistory" | "benchmark">): PeerRow[] {
  const latest = new Map((report.financialHistory?.latest || []).map((r) => [r.key, r.value]));
  const bm = report.benchmark?.metrics || {};
  return ([["pe", "P/E"], ["pb", "P/B"], ["ev_ebitda", "EV/EBITDA"]] as const).map(([key, label]) => {
    const detail = bm[`industry_median_${key}`];
    return { key, label, company: latest.get(key) ?? null, benchmark: detail?.value ?? latest.get(`industry_median_${key}`) ?? null, own: latest.get(`own_5y_median_${key}`) ?? null, detail };
  }).filter((r) => r.company != null || r.benchmark != null);
}

