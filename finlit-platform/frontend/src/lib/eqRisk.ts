// Task #183 W8 (Equity portfolio, Risk analytics, pack 01-equity-portfolio E72–E85): the words of the Risk tab, from the server's risk answer
// (POST /api/portfolio/risk: each share against its own size index, the three list betas, each size against its index, 3-year swing and fall) and the page
// answer's risk shares. Pure, so every sentence is tested. Describes past prices; never advice.
import type { Card } from "./pulsePack";

export type RangeKey = "less" | "defensive" | "similar" | "more" | "high" | "very_high";
export type Band = { key: RangeKey; word: string } | null;
export type RiskShare = { symbol: string; size: "Large" | "Mid" | "Small" | "Micro" | null; sector: string | null; benchmark: string | null; beta: number | null; explained: number | null; band: Band; why: string | null;
  swing: number | null; worstFall: number | null; years: number | null; oneYear: number | null };
export type RiskSize = { size: "Large" | "Mid" | "Small" | "Micro"; benchmark: string; n: number; avgBeta: number | null; band: Band; listShare: number; adds: number | null; oneYear: number | null; benchOneYear: number | null; downPer100: number | null; upPer100: number | null };
export type RiskAnswer = {
  to: string; from: string; counted: number; shares: RiskShare[]; sizes: RiskSize[]; unknown: string[]; missingIndex: string[];
  betas: { weighted: number | null; blended: number | null; nifty: number | null; weightedBand: Band; blendedBand: Band; niftyBand: Band };
  glance: { list?: { swing: number | null; worstFall: number | null }; nifty: { swing: number | null; worstFall: number | null }; worst10: { list: number | null; nifty: number | null }; weighted: number | null };
  ranges: { key: RangeKey; word: string; below: number | null }[];
};
export const RANGE_EDGES: [RangeKey, number, number][] = [["less", 0, 0.65], ["defensive", 0.65, 0.9], ["similar", 0.9, 1.1], ["more", 1.1, 1.35], ["high", 1.35, 1.75], ["very_high", 1.75, 2.5]];
export const RANGE_SUB: Record<RangeKey, string> = { less: "Less sensitive than its market", defensive: "Relatively defensive", similar: "Similar to its market", more: "More sensitive than its market", high: "High market sensitivity", very_high: "Very high market sensitivity" };
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const num = (n: number) => (n <= 10 ? NUM[n] : String(n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const b2 = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(2));
export const signed = (v: number | null | undefined, d = 1) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`);

/** The lede of "Risk at a glance": how each part of the list moves against its own market, and its 3-year swing against the Nifty 50's. */
export function riskLede(r: RiskAnswer): { lead: string; rest: string } {
  const w = r.betas.weighted, sizes = r.sizes.filter((s) => s.n && s.avgBeta != null);
  const above = sizes.filter((s) => (s.avgBeta as number) > 1.1).length, below = sizes.filter((s) => (s.avgBeta as number) < 0.9).length;
  const lead = !sizes.length ? "Not enough prices for a reading." : above === sizes.length ? "Each part of your list moves more than its own market." : below === sizes.length ? "Each part of your list moves less than its own market."
    : above ? "Part of your list moves more than its own market." : "Your list moves about in step with its own markets.";
  const g = r.glance;
  return { lead, rest: w == null ? "" : `Weighted by size, the list has moved ${b2(w)}% for every 1% move in its benchmarks${g.list?.swing != null && g.nifty.swing != null ? `, and over 3 years it has swung ${g.list.swing.toFixed(1)}% in a typical year against ${g.nifty.swing.toFixed(1)}% for the Nifty 50` : ""}.` };
}
/** The four figures of "Risk at a glance", each against the Nifty 50 (E72). */
export function glanceTiles(r: RiskAnswer) {
  const g = r.glance, l = g.list;
  const ratio = l?.swing != null && g.nifty.swing ? l.swing / g.nifty.swing : null;
  return [
    { k: "Typical swing in a year · 3 yrs", v: l?.swing == null ? "–" : `${l.swing.toFixed(1)}%`, nifty: g.nifty.swing == null ? "–" : `${g.nifty.swing.toFixed(1)}%`,
      sub: ratio == null ? "Not enough prices." : ratio >= 1.8 ? "About twice as bumpy as the index." : ratio >= 1.15 ? "Bumpier than the index." : ratio <= 0.85 ? "Steadier than the index." : "About as bumpy as the index.",
      help: "How much the list's value has moved up and down in a typical year (the annualised volatility of daily closes), over the last 3 years.", how: "Higher is a bumpier ride. Set it beside the Nifty 50's figure under it." },
    { k: "Worst fall from a high · 3 yrs", v: signed(l?.worstFall), nifty: signed(g.nifty.worstFall), sub: l?.worstFall == null || g.nifty.worstFall == null ? "Not enough prices." : l.worstFall < g.nifty.worstFall - 1 ? "Deeper than the index." : l.worstFall > g.nifty.worstFall + 1 ? "Shallower than the index." : "About the same as the index.",
      help: "The largest drop from a peak to a later low, over the last 3 years of daily closes.", how: "A larger minus figure is a deeper fall. Set it beside the Nifty 50's." },
    { k: "In the 10 worst weeks · past year", v: signed(g.worst10.list), nifty: signed(g.worst10.nifty), sub: g.worst10.list == null || g.worst10.nifty == null ? "Not enough prices." : g.worst10.list < g.worst10.nifty - 0.3 ? "Falls more when the market falls." : g.worst10.list > g.worst10.nifty + 0.3 ? "Falls less when the market falls." : "Falls about as much as the market.",
      help: "The list's average weekly move in the Nifty 50's 10 worst weeks of the past year.", how: "Below the Nifty 50's figure: the list fell more in those weeks; above it, less." },
    { k: "Beta, size-weighted", v: b2(r.betas.weighted), nifty: "1.00", niftyWord: "benchmarks", sub: r.betas.weighted == null ? "Not enough prices." : r.betas.weighted > 1.1 ? "More sensitive than its market (its own benchmarks)." : r.betas.weighted < 0.9 ? "Less sensitive than its market (its own benchmarks)." : "About as sensitive as its market (its own benchmarks).",
      help: "Each share against the index of companies its size over the past year of weekly closes; the sizes combined by their share of the list.", how: "1.00 moves with its own benchmarks; above 1 more, below 1 less." },
  ];
}
/** Key figures of the Risk tab (the pack): Moves more than its markets, Small companies carry the risk, Highest beta. */
export function riskKeyCards(r: RiskAnswer, riskBySize: Record<string, { list: number; risk: number }>) {
  const out: { tone: "good" | "info" | "watch" | "warn"; k: string; v: string; text: string; go: string; to: string }[] = [];
  const w = r.betas.weighted;
  if (w != null) out.push({ tone: w > 1.1 ? "warn" : w < 0.9 ? "good" : "info", k: w > 1.1 ? "Moves more than its markets" : w < 0.9 ? "Moves less than its markets" : "Moves with its markets", v: `β ${b2(w)}`, go: "See how it is built", to: "eq-build",
    text: `Weighted by size, the list has moved ${b2(w)}% for each 1% move in its own benchmarks.` });
  const big = Object.entries(riskBySize).sort((a, b) => b[1].risk - a[1].risk)[0];
  if (big) { const n = r.sizes.find((s) => s.size === big[0])?.n ?? 0, more = big[1].risk > big[1].list + 2;
    out.push({ tone: more ? "watch" : "info", k: `${big[0]} companies carry ${more ? "the" : "most of the"} risk`, v: `${Math.round(big[1].risk)}%`, go: "See the risk split", to: "eq-mr",
      text: `${n} ${big[0].toLowerCase()} companies are ${Math.round(big[1].list)}% of the list and carry ${Math.round(big[1].risk)}% of its ups and downs.` }); }
  const top = [...r.shares].filter((s) => s.beta != null).sort((a, b) => (b.beta as number) - (a.beta as number));
  if (top[0]) { const rest = top.slice(1, 3);
    out.push({ tone: "info", k: "Highest beta", v: `${top[0].symbol} ${b2(top[0].beta)}`, go: "See each share", to: "eq-each",
      text: `Against ${top[0].benchmark}.${rest.length ? ` ${list(rest.map((s) => `${s.symbol} (${b2(s.beta)})`))} come next.` : ""}` }); }
  return out;
}
/** The three things to know under Risk at a glance. */
export function glanceCards(r: RiskAnswer, riskBySize: Record<string, { list: number; risk: number }>): Card[] {
  const out: Card[] = [];
  // task #262: this card meant the old Small (below ₹10,000 Cr). With four sizes it reads Small and Micro together (below ₹25,000 Cr), the
  // smaller companies whose share of the risk the card is about; with only one of them in the list the sentence names that one.
  const parts = (["Small", "Micro"] as const).filter((k) => riskBySize[k]);
  const sm = parts.length ? parts.reduce((a, k) => ({ list: a.list + riskBySize[k].list, risk: a.risk + riskBySize[k].risk }), { list: 0, risk: 0 }) : null;
  const who = parts.length === 2 ? "Small and micro companies" : parts[0] === "Micro" ? "Micro companies" : "Small companies";
  if (sm && sm.risk > 50) out.push({ kind: "warning", title: `${who} carry over half the risk`, text: `They are ${Math.round(sm.list)}% of the list and ${Math.round(sm.risk)}% of its ups and downs.` });
  const top = [...r.shares].filter((s) => s.beta != null).sort((a, b) => (b.beta as number) - (a.beta as number)).slice(0, 3);
  if (top.length && (top[0].beta as number) > 1.35) out.push({ kind: "watch", title: "The highest betas", text: `${list(top.map((s) => `${s.symbol} (${b2(s.beta)} against ${s.benchmark})`))}.` });
  const lg = r.sizes.find((s) => s.size === "Large");
  if (lg?.n && lg.avgBeta != null && lg.avgBeta < 1.1) out.push({ kind: "good", title: "Large companies steady the list", text: `Your ${lg.n} large ${lg.n === 1 ? "company has" : "companies have"} an average beta of ${b2(lg.avgBeta)} against the Nifty 50.` });
  return out;
}
/** The four plain figures of "Reading a beta" for a filter (all, or one size). */
export function readingFigures(shares: RiskShare[], beta: number | null) {
  const xs = shares.filter((s) => s.beta != null), n = xs.length;
  return [
    { v: b2(beta), k: "Beta of your list" },
    { v: beta == null ? "–" : `about ${(beta * 10).toFixed(1)}%`, k: "its usual move when its benchmarks move 10%" },
    { v: `${xs.filter((s) => (s.beta as number) >= 1.35).length} of ${n}`, k: "shares in the High or Very high range" },
    { v: `${xs.filter((s) => (s.beta as number) < 0.9).length} of ${n}`, k: "shares that move less than their market" },
  ];
}
/** Each range of the scale: its shares (highest first) and their share of the counted list. */
export function rangeCards(shares: RiskShare[]) {
  const xs = shares.filter((s) => s.beta != null), n = xs.length;
  return RANGE_EDGES.map(([key, lo, hi]) => { const who = xs.filter((s) => s.band?.key === key).sort((a, b) => (b.beta as number) - (a.beta as number));
    return { key, lo, hi, who, pct: n ? (who.length / n) * 100 : 0 }; });
}
/** The three things to know under the three beta figures. */
export function betaCards(r: RiskAnswer): Card[] {
  const out: Card[] = [];
  const { weighted: w, blended: b, nifty: n } = r.betas;
  if (w != null && n != null) out.push({ kind: "insight", title: "Two ways to read beta", text: `Against each share's own market the list reads ${b2(w)}; against the Nifty 50 alone it reads ${b2(n)}. ${n < w ? "Mid, small and micro companies move less in step with the Nifty 50, so it reads lower." : "The Nifty 50 reading is the one to use for what a Nifty 50 fall has meant."}` });
  out.push({ kind: "watch", title: "A low beta is not always low risk", text: "A share can move little with its market and still swing a lot on its own news. The swing and worst fall columns show that side." });
  out.push({ kind: "good", title: "Weights follow your money later", text: "Today every share counts the same. Once quantities are in, the sizes are weighted by the money in each." });
  if (b != null && w != null && Math.abs(b - w) > 0.15) out[out.length - 1] = { kind: "insight", title: "The blended figure checks the size-weighted one", text: `Against a benchmark blended in your list's proportions the list reads ${b2(b)}, ${b > w ? "a little above" : "a little below"} the size-weighted ${b2(w)}.` };
  return out;
}
/** "If the market fell 10%": the size-weighted and Nifty-only lines, each size, and the rupee line on ₹10 lakh (E81). */
export function fallLines(r: RiskAnswer) {
  const w = r.betas.weighted, n = r.betas.nifty, lakh = (b: number) => `₹${b.toFixed(2)} lakh`;
  const ten = (b: number) => -Math.round(b * 100) / 10;   // beta × 10%, to one decimal
  return { weighted: w == null ? null : ten(w), nifty: n == null ? null : ten(n), sizes: r.sizes.filter((s) => s.n && s.avgBeta != null).map((s) => ({ size: s.size, fall: ten(s.avgBeta as number) })),
    rupee: w == null ? null : `On ₹10 lakh, a 10% fall in every size index has meant roughly ${lakh(w)}${n != null ? `; a 10% fall in the Nifty 50 alone, roughly ${lakh(n)}` : ""}.` };
}
/** "What stands out" for one share's risk row (E82): the figures only. */
export function riskStandsOut(s: RiskShare, riskShare: number | null, listShare: number | null, below52: number | null, m1: number | null): string {
  const x: string[] = [];
  if (s.beta != null && s.beta >= 1.75) x.push("Very high beta");
  if (riskShare != null && listShare != null && riskShare > listShare * 1.5) x.push("Carries more risk than its weight");
  if (s.worstFall != null && s.worstFall <= -50) x.push(`Fell ${Math.round(-s.worstFall)}% from a high`);
  if (m1 != null && m1 <= -10) x.push(`Fell ${Math.round(-m1)}% last month`);
  if (below52 != null && below52 >= 30) x.push("Far below its 1-year high");
  if (s.explained != null && s.explained < 20 && s.beta != null) x.push("Moves on its own news");
  return x.join(" · ") || "—";
}
export { cap, num };
