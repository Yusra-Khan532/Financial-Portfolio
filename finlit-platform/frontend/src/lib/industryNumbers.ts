// Developer file 51 (founder, 27 Nov 2026, 4:07 pm: "can we add something more to industry analysis?", then "Industry in numbers"): 14 Industry analysis
// showed only prices (breadth, the industry's rank, the stock's 6-month rank). This puts the company against the median company of its industry on nine
// measures from FinLit's screener figures (the same definitions as the Screener: lib/screener METRICS). The industry is the section's own group: the
// NSE-listed members of its Sector Pulse industry (GET /api/sectors/membership, open to every plan). Each company counts once, whatever its size.
// Describes; never advice: "higher than 11 of the other 12", never better or worse.
import { METRICS, fmt, type NumKey, type Row } from "./screener";
import { median } from "./standsList";

export const IND_GROUPS: [string, NumKey[]][] = [
  ["Valuation", ["pe", "pb", "dividend_yield"]],
  ["Returns and margin", ["roe", "roce", "operating_margin"]],
  ["Growth over five years", ["sales_cagr", "profit_cagr"]],
  ["Debt", ["debt_to_equity"]],
];
export const IND_KEYS: NumKey[] = IND_GROUPS.flatMap(([, k]) => k);

export type IndDot = { symbol: string; name: string | null; v: number };
export type IndMeasure = {
  key: NumKey; label: string; say: string;
  me: number | null; med: number | null; dots: IndDot[];
  below: number; others: number; left: number;   // others below the company / others with a figure / members without a figure
  why: string | null;                                // why the company's own figure is blank
};

/** A P/E of a loss-making company (zero or below) is not a price for its profit: that company is left out of the P/E row. */
const usable = (k: NumKey, v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && !(k === "pe" && v <= 0);

export function industryNumbers(rows: Row[], members: string[], symbol: string): { measures: IndMeasure[]; n: number; inIt: boolean } {
  const set = new Set(members), mem = rows.filter((r) => set.has(r.symbol));
  const meRow = mem.find((r) => r.symbol === symbol) ?? null;
  const measures = IND_KEYS.map((k): IndMeasure => {
    const m = METRICS[k], raw = (r: Row) => r[k] as unknown;
    const dots = mem.filter((r) => usable(k, raw(r))).map((r) => ({ symbol: r.symbol, name: r.name, v: raw(r) as number }));
    const me = meRow && usable(k, raw(meRow)) ? (raw(meRow) as number) : null;
    const others = dots.filter((d) => d.symbol !== symbol);
    const why = me != null ? null : !meRow ? "no screener figures" : k === "pe" && typeof raw(meRow) === "number" ? "a loss, so no P/E" : "not reported";
    return { key: k, label: m.label, say: m.say, me, med: median(dots.map((d) => d.v)), dots, below: me == null ? 0 : others.filter((d) => d.v < me).length, others: others.length, left: mem.length - dots.length, why };
  });
  return { measures, n: mem.length, inIt: !!meRow };
}

/** Where the company sits on one measure, in words that describe and never judge. */
export function placeText(x: IndMeasure): string {
  if (x.me == null) return `No figure: ${x.why}`;
  if (!x.others) return "The only company with a figure";
  const level = x.dots.filter((d) => d.v === x.me).length - 1, above = x.others - x.below - level;   // others level with it, others above it
  if (above === 0 && level === 0) return `Highest of the ${x.others + 1}`;
  if (x.below === 0 && level === 0) return `Lowest of the ${x.others + 1}`;
  return `Higher than ${x.below} of the other ${x.others}`;
}

const SAY: Partial<Record<NumKey, [string, string, string?]>> = {
  pe: ["is priced at more times its profit", "is priced at fewer times its profit"],
  pb: ["is priced higher against its book value", "is priced lower against its book value"],
  dividend_yield: ["pays a higher dividend yield", "pays a lower dividend yield"],
  roe: ["earns a higher return on equity", "earns a lower return on equity"],
  roce: ["earns a higher return on capital", "earns a lower return on capital"],
  operating_margin: ["keeps a wider operating margin", "keeps a narrower operating margin"],
  sales_cagr: ["has grown sales faster over five years", "has grown sales more slowly over five years", " a year"],
  profit_cagr: ["has grown profit faster over five years", "has grown profit more slowly over five years", " a year"],
  debt_to_equity: ["carries more debt for its equity", "carries less debt for its equity"],
};

/** One plain sentence: the measures where the company sits furthest from the middle of its industry (in its top or bottom fifth), at most one from each
 *  group and at most three, in the groups' order. Near the middle on all of them, it says so. */
export function industryLead(name: string, ind: string, ms: IndMeasure[]): string | null {
  const usableMs = ms.filter((m) => m.me != null && m.med != null && m.others >= 3 && m.me !== m.med);
  if (!usableMs.length) return null;
  const far = (m: IndMeasure) => Math.abs(m.below / m.others - 0.5);
  const picks: { m: IndMeasure; g: number }[] = [];
  IND_GROUPS.forEach(([, keys], g) => { const m = keys.map((k) => usableMs.find((x) => x.key === k)).find((x) => x && far(x) >= 0.3); if (m) picks.push({ m, g }); });
  const top = picks.sort((a, b) => far(b.m) - far(a.m)).slice(0, 3).sort((a, b) => a.g - b.g).map(({ m }) => {
    const s = SAY[m.key]!, met = METRICS[m.key], per = s[2] ?? "";
    return `${s[(m.me as number) > (m.med as number) ? 0 : 1]} (${fmt(met, m.me)}${per} against ${fmt(met, m.med)})`;
  });
  if (!top.length) return `${name} sits near the middle of the ${ind} companies on these measures.`;
  const list = top.length === 1 ? top[0] : `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
  return `Against the median ${ind} company, ${name} ${list}.`;
}

/** The strip's scale: from the lowest to the highest value within 1.5 middle-halves (Tukey's fences) of the middle half, so one far company does not
 *  squeeze the other thirteen into a corner. A value past it sits at the end, drawn hollow; the end labels still give the true lowest and highest. */
export function fences(values: number[]): { lo: number; hi: number } | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p: number) => { const i = (v.length - 1) * p, f = Math.floor(i); return v[f] + (v[Math.min(v.length - 1, f + 1)] - v[f]) * (i - f); };
  const iqr = q(0.75) - q(0.25);
  if (!(iqr > 0)) return { lo: v[0], hi: v[v.length - 1] };
  const lo = v.find((x) => x >= q(0.25) - 1.5 * iqr) ?? v[0], hi = [...v].reverse().find((x) => x <= q(0.75) + 1.5 * iqr) ?? v[v.length - 1];
  return { lo, hi };
}
