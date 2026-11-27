// "In numbers", 14 Industry analysis's fourth tab. Developer file 51 (founder, 27 Nov 2026, 4:07 pm: "can we add something more to industry analysis?"):
// the company against the typical company of its industry on nine measures from FinLit's screener figures (the Screener's own definitions, lib/screener
// METRICS). Developer file 52 (5:22 pm: "I am not able to understand what it is"): the dot strips, the hollow dots and the word "median" went; each measure
// now says in words what it measures, the company's figure, the typical company's, and where the company sits ("Among the highest"), with "What stands
// out" first; and "Who makes up the industry" (each company's share of its market value) explains why the typical company can look nothing like a giant.
// The industry is the section's own group: the NSE-listed members of its Sector Pulse industry (GET /api/sectors/membership, open to every plan).
// The typical company is the median: the middle one when the members are lined up, each counted once, whatever its size. Describes; never advice.
import { METRICS, fmt, type NumKey, type Row } from "./screener";
import { median } from "./standsList";

export const IND_GROUPS: [string, NumKey[]][] = [
  ["Valuation", ["pe", "pb", "dividend_yield"]],
  ["Returns and margin", ["roe", "roce", "operating_margin"]],
  ["Growth over five years", ["sales_cagr", "profit_cagr"]],
  ["Debt", ["debt_to_equity"]],
];
export const IND_KEYS: NumKey[] = IND_GROUPS.flatMap(([, k]) => k);

/** What each measure means, in words, and its usual short name. */
export const PLAIN: Partial<Record<NumKey, { what: string; term: string }>> = {
  pe: { what: "Price for each ₹1 of yearly profit", term: "P/E" },
  pb: { what: "Price for each ₹1 of book value", term: "P/B" },
  dividend_yield: { what: "Yearly dividend for each ₹100 invested", term: "Dividend yield" },
  roe: { what: "Profit on shareholders' money", term: "ROE" },
  roce: { what: "Profit on all the money in the business", term: "ROCE" },
  operating_margin: { what: "Operating profit from each ₹100 of sales", term: "Operating margin" },
  sales_cagr: { what: "Sales growth a year", term: "5-year average" },
  profit_cagr: { what: "Profit growth a year", term: "5-year average" },
  debt_to_equity: { what: "Debt for each ₹1 of owners' money", term: "Debt to equity" },
};

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

/** Where the company sits, from the lowest to the highest (0 to 1): the share of the other companies below it, level ones counted half. */
export const sitAt = (x: IndMeasure): number | null => {
  if (x.me == null || !x.others) return null;
  const level = x.dots.filter((d) => d.v === x.me).length - 1;
  return (x.below + level / 2) / x.others;
};

/** The place in one word group, and the count behind it ("higher than 11 of the other 12"). Describes; never better or worse. */
export function sitText(x: IndMeasure): { word: string; detail: string } {
  if (x.me == null) return { word: "No figure", detail: x.why ?? "" };
  if (!x.others) return { word: "The only one with a figure", detail: "" };
  const level = x.dots.filter((d) => d.v === x.me).length - 1, above = x.others - x.below - level, n = x.others + 1;
  const detail = above === 0 && level === 0 ? `the highest of the ${n}` : x.below === 0 && level === 0 ? `the lowest of the ${n}` : `higher than ${x.below} of the other ${x.others}`;
  const p = sitAt(x) as number;
  const word = p >= 0.8 ? "Among the highest" : p >= 0.6 ? "Above the middle" : p > 0.4 ? "Near the middle" : p > 0.2 ? "Below the middle" : "Among the lowest";
  return { word, detail };
}

const SAY: Partial<Record<NumKey, [string, string]>> = {
  pe: ["is priced at more times its profit", "is priced at fewer times its profit"],
  pb: ["is priced higher against its book value", "is priced lower against its book value"],
  dividend_yield: ["pays a higher dividend for its price", "pays a lower dividend for its price"],
  roe: ["earns more on shareholders' money", "earns less on shareholders' money"],
  roce: ["earns more on all the money in the business", "earns less on all the money in the business"],
  operating_margin: ["keeps more operating profit from its sales", "keeps less operating profit from its sales"],
  sales_cagr: ["has grown its sales faster over five years", "has grown its sales more slowly over five years"],
  profit_cagr: ["has grown its profit faster over five years", "has grown its profit more slowly over five years"],
  debt_to_equity: ["carries more debt for its owners' money", "carries less debt for its owners' money"],
};

/** "What stands out": the measures where the company sits in its industry's top or bottom fifth, at most one from each group and at most three, in the
 *  groups' order; each one line with both figures. Empty when it sits near the middle on all of them. */
export function standouts(name: string, ms: IndMeasure[]): { key: NumKey; text: string }[] {
  const ok = ms.filter((m) => m.me != null && m.med != null && m.others >= 3 && m.me !== m.med);
  const far = (m: IndMeasure) => Math.abs((sitAt(m) ?? 0.5) - 0.5);
  const picks: { m: IndMeasure; g: number }[] = [];
  IND_GROUPS.forEach(([, keys], g) => { const m = keys.map((k) => ok.find((x) => x.key === k)).find((x) => x && far(x) >= 0.3); if (m) picks.push({ m, g }); });
  return picks.sort((a, b) => far(b.m) - far(a.m)).slice(0, 3).sort((a, b) => a.g - b.g).map(({ m }) => {
    const met = METRICS[m.key], per = m.key === "sales_cagr" || m.key === "profit_cagr" ? " a year" : "";
    return { key: m.key, text: `${name} ${SAY[m.key]![(m.me as number) > (m.med as number) ? 0 : 1]}: ${fmt(met, m.me)}${per}, against ${fmt(met, m.med)}${per} for the typical company.` };
  });
}

export type Share = { symbol: string; name: string | null; cap: number; share: number };
/** "Who makes up the industry": each member's share of the members' total market value (₹ Cr, the screener's figure), largest first. */
export function industryShares(rows: Row[], members: string[], symbol: string): { list: Share[]; total: number; me: { rank: number; share: number } | null; n: number; missing: number } | null {
  const set = new Set(members), mem = rows.filter((r) => set.has(r.symbol));
  const withCap = mem.filter((r) => typeof r.market_cap === "number" && r.market_cap > 0);
  const total = withCap.reduce((a, r) => a + (r.market_cap as number), 0);
  if (!withCap.length || !(total > 0)) return null;
  const list = withCap.map((r) => ({ symbol: r.symbol, name: r.name, cap: r.market_cap as number, share: ((r.market_cap as number) / total) * 100 })).sort((a, b) => b.cap - a.cap);
  const i = list.findIndex((x) => x.symbol === symbol);
  return { list, total, me: i >= 0 ? { rank: i + 1, share: list[i].share } : null, n: list.length, missing: mem.length - list.length };   // missing: members without a market value figure
}
