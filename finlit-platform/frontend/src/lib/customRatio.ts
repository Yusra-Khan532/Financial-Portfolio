// The Custom ratio drawer's rules (task #64, Part 3, CR-2 to CR-7), kept apart from the drawer so they can be tested on their own.
// Nothing here is a FinLit cut-off: the presets are the ratio's own market spread, and the server works out every value.
import type { CustomRatio, MetricInfo } from "./proscreen";

export type Family = "cr" | "per_share" | "shares" | "people" | null;
export const FAMILY_TAG: Record<Exclude<Family, null>, string> = { cr: "₹ Cr", per_share: "₹ per share", shares: "shares", people: "people" };
const FAMILY_WORD: Record<Exclude<Family, null>, string> = { cr: "₹ Cr", per_share: "₹ per share", shares: "shares", people: "people" };

/** The unit tag beside a figure: its family, or its own unit for a ratio, a percentage or a count. */
export function unitTag(m?: MetricInfo): string {
  if (!m) return "";
  const f = (m.family ?? null) as Family;
  if (f) return FAMILY_TAG[f];
  return m.unit === "%" ? "%" : m.unit === "x" ? "×" : m.unit === "d" ? "days" : m.unit === "pts" ? "points" : m.unit === "n" ? "count" : m.unit;
}

/** CR-5: "<top> to <bottom>", leaving out "(latest year)". */
export const cleanLabel = (s: string) => s.replace(/\s*\((latest year|latest quarter|last 12 months)\)\s*/gi, " ").replace(/\s+/g, " ").trim();
export function suggestName(top?: MetricInfo, bottom?: MetricInfo): string {
  if (!top || !bottom) return "";
  const a = cleanLabel(top.label), b = cleanLabel(bottom.label);
  return `${a} to ${b.charAt(0).toLowerCase()}${b.slice(1)}`.slice(0, 40);
}

/** CR-3: the unit check. Same family: green. Different families: amber. One is already a ratio, a percentage or a count: amber. It warns; it never blocks. */
export type UnitCheck = { tone: "ok" | "warn"; text: string };
export function unitCheck(top?: MetricInfo, bottom?: MetricInfo): UnitCheck | null {
  if (!top || !bottom) return null;
  const a = (top.family ?? null) as Family, b = (bottom.family ?? null) as Family;
  if (a && b && a === b) return { tone: "ok", text: `Both figures are in ${FAMILY_WORD[a]}, so the result is a plain ratio: the top figure as a share, or a multiple, of the bottom one.` };
  if (a && b) return { tone: "warn", text: `These are in different units (${FAMILY_WORD[a]} and ${FAMILY_WORD[b]}), so the result has no plain meaning. Pick two ₹ Cr amounts, or two per-share figures.` };
  return { tone: "warn", text: "One of these is already a ratio, a percentage or a count. You can still use it; check that the result reads the way you expect." };
}

/** CR-3: pairs that are already one of the filters. [top, bottom, filter key]. */
export const CLOSE_TO: [string, string, string][] = [
  ["net_profit", "total_assets", "roa"], ["net_profit", "equity", "roe"], ["op_profit", "revenue", "operating_margin"], ["net_profit", "revenue", "net_margin"],
  ["market_cap", "revenue", "ps"], ["price", "sales_ps", "ps"], ["market_cap", "net_profit", "pe"], ["price", "eps", "pe"],
  ["price", "book_value_ps", "pb"], ["market_cap", "equity", "pb"], ["enterprise_value", "revenue", "ev_sales"], ["enterprise_value", "cfo", "ev_cfo"],
  ["market_cap", "cfo", "price_cfo"], ["market_cap", "fcf", "pfcf"], ["fcf", "market_cap", "fcf_yield"], ["borrowings", "equity", "debt_to_equity"],
  ["revenue", "total_assets", "asset_turnover"], ["cash", "borrowings", "cash_to_debt"], ["cfo", "net_profit", "cfo_to_pat"], ["fcf", "net_profit", "fcf_to_pat"],
  ["borrowings", "fcf", "debt_to_fcf"], ["market_cap", "total_assets", "price_to_tangible"],
];
export function closeFilter(top: string, bottom: string, byKey: Map<string, MetricInfo>): MetricInfo | null {
  const hit = CLOSE_TO.find(([a, b]) => a === top && b === bottom);
  return hit ? byKey.get(hit[2]) ?? null : null;
}

/** CR-3: start on % when both figures are in the same family and the middle value is under 1, on × otherwise. */
export function defaultShow(top?: MetricInfo, bottom?: MetricInfo, middleTimes?: number | null): "pct" | "times" {
  return top?.family && top.family === bottom?.family && middleTimes != null && Math.abs(middleTimes) < 1 ? "pct" : "times";
}
/** Switching % and × converts a value already typed: 5 % is 0.05 ×. */
export const convert = (v: number | undefined, to: "pct" | "times"): number | undefined => (v == null ? v : roundNice(to === "pct" ? v * 100 : v / 100));

/** A value rounded to what a person would type: three significant figures. */
export function roundNice(v: number): number {
  if (!Number.isFinite(v) || v === 0) return v;
  const d = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(v))));
  return Number(v.toFixed(Math.min(d, 6)));
}

/** CR-4: the presets from the ratio's own spread (market spreads, not FinLit cut-offs). */
export type Stats = { have: number; total: number; p2: number | null; p5: number | null; p25: number | null; p50: number | null; p75: number | null; p95: number | null; p98: number | null; hist30: number[]; scale: "linear" | "log"; values: number[];
  example: { symbol: string; name: string | null; num: number; den: number; value: number } | null };
export type Preset = { id: string; label: string; op: "gt" | "lt"; a: number };
export function presets(s: Stats | undefined): Preset[] {
  if (!s || s.p25 == null || s.p50 == null || s.p75 == null) return [];
  return [
    { id: "top", label: "Top quarter", op: "gt", a: roundNice(s.p75) }, { id: "above", label: "Above the middle", op: "gt", a: roundNice(s.p50) },
    { id: "below", label: "Below the middle", op: "lt", a: roundNice(s.p50) }, { id: "low", label: "Lowest quarter", op: "lt", a: roundNice(s.p25) },
  ];
}

/** CR-4: how many companies pass a condition, counted on the sorted values (exact, as typed). */
export function countPass(values: number[], op: CustomRatio["op"], a?: number, b?: number): number {
  if (op === "none") return values.length;
  const lo = op === "gt" ? a : op === "between" ? Math.min(a ?? NaN, b ?? NaN) : undefined;
  const hi = op === "lt" ? a : op === "between" ? Math.max(a ?? NaN, b ?? NaN) : undefined;
  if ((op === "gt" || op === "lt") && a == null) return values.length;
  if (op === "between" && (a == null || b == null)) return values.length;
  return values.filter((v) => (lo == null || v >= lo) && (hi == null || v <= hi)).length;
}

/** The value set, in words, with its unit: "≥ 14.2%", "≤ 1.2×", "2 to 5%", or "Column". */
export function valueText(r: Pick<CustomRatio, "op" | "a" | "b" | "show">): string {
  const u = r.show === "pct" ? "%" : "×", f = (v?: number) => (v == null ? "" : String(roundNice(v)));
  if (r.op === "gt" && r.a != null) return `≥ ${f(r.a)}${u}`;
  if (r.op === "lt" && r.a != null) return `≤ ${f(r.a)}${u}`;
  if (r.op === "between" && r.a != null && r.b != null) return `${f(Math.min(r.a, r.b))} to ${f(Math.max(r.a, r.b))}${u}`;
  return "Column";
}

/** CR-7: the examples, none of them already a filter. */
export const EXAMPLES: { name: string; num: string; den: string; show: "pct" | "times" }[] = [
  { name: "Cash to market cap", num: "cash", den: "market_cap", show: "pct" },
  { name: "Borrowings to market cap", num: "borrowings", den: "market_cap", show: "pct" },
  { name: "Net profit to operating profit", num: "net_profit", den: "op_profit", show: "pct" },
  { name: "Daily trading to market cap", num: "turnover20_cr", den: "market_cap", show: "pct" },
  { name: "Enterprise value vs market cap", num: "enterprise_value", den: "market_cap", show: "times" },
];
