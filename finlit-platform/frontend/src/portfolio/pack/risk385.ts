// Task #385 phase 2 (developer file 33, Risk view): the words and figures of the Equity portfolio's Risk view, worked out from the risk answer
// (POST /api/portfolio/risk). Pure, so each sentence is tested (risk385.test.tsx). Beta is said in plain words ("1.29× as much as its markets"), the six
// ranges use the new names, every figure says what it is measured against, and the list is read by what is held now (open item 7) or in equal amounts.
// Describes past prices; never advice.
import type { RiskAnswer, RiskShare, RiskSize, RangeKey } from "../../lib/eqRisk";
import { SIZE_C } from "../../lib/keyAnswers";
import { BETA_RANGE_WORD, MINUS, andList, betaRangeWord, cap1, countOf, indexName, numWord, pctText, shareText, signedNum, times, type KeyFig } from "../shared";

export type Basis = "value" | "equal";
/** The answer the page reads: by what is held now when the server sent it, else equal amounts. */
export const pickBasis = (r: RiskAnswer, want: Basis): { r: RiskAnswer; basis: Basis } =>
  want === "value" && r.byValue ? { r: r.byValue, basis: "value" } : { r, basis: "equal" };
/** "by what you hold now" / "in equal amounts" (how the list is weighted). */
export const basisWords = (b: Basis) => (b === "value" ? "by what you hold now" : "in equal amounts");

/** A range's word in the new names (file 33: no "Defensive"). */
export const rangeWord = (band: { key: string; word: string } | null | undefined) => (band ? betaRangeWord(band.key, band.word) : "");
/** The line under each range (the old "Relatively defensive" reads "Less sensitive than its market"). */
export const RANGE_LINE: Record<RangeKey, string> = { less: "Much less sensitive than its market", defensive: "Less sensitive than its market", similar: "Moves about as much as its market",
  more: "More sensitive than its market", high: "High sensitivity to its market", very_high: "Very high sensitivity to its market" };
/** The six ranges in their order (for sorting a range by rank: Very high first). */
export const RANGE_RANK = ["very_high", "high", "more", "similar", "defensive", "less"].map((k) => BETA_RANGE_WORD[k]);
export const SIZE_ORDER = ["Large", "Mid", "Small", "Micro"] as const;
export { SIZE_C };

/** Overall, from the down-week and up-week figures (file 33): green when it rose more and fell less, red when it rose less and fell more. */
export function overallOf(down: number | null | undefined, up: number | null | undefined): { word: string; tone: "g" | "r" | "n" } | null {
  if (down == null || up == null) return null;
  if (up >= 100 && down < 100) return { word: "Rises more, falls less", tone: "g" };
  if (up < 100 && down >= 100) return { word: "Rises less, falls more", tone: "r" };
  return up >= 100 ? { word: "Moves more both ways", tone: "n" } : { word: "Moves less both ways", tone: "n" };
}
export const OVERALL_RANK = ["Rises more, falls less", "Moves more both ways", "Moves less both ways", "Rises less, falls more"];

/** The headline sentence of Risk at a glance and the line under it ("Measuring each share against its own size index, …"). */
export function glanceLede(r: RiskAnswer, idx: { name: string; swing: number | null }): { lead: string; rest: string } {
  const w = r.betas.weighted, sizes = r.sizes.filter((s) => s.n && s.avgBeta != null);
  const above = sizes.filter((s) => (s.avgBeta as number) > 1.1).length, below = sizes.filter((s) => (s.avgBeta as number) < 0.9).length;
  const one = sizes.length === 1;
  const lead = !sizes.length ? "Not enough prices for a reading yet."
    : above === sizes.length ? (one ? "Your list moves more than its own market." : "Each part of your list moves more than its own market.")
    : below === sizes.length ? (one ? "Your list moves less than its own market." : "Each part of your list moves less than its own market.")
    : above ? "Part of your list moves more than its own market." : "Your list moves about in step with its own markets.";
  const sw = r.glance.list?.swing;
  return { lead, rest: w == null ? "" : `Measuring each share against its own size index, the list has moved ${times(w)} as much as its markets${sw != null && idx.swing != null ? `, and over 3 years it has swung ${shareText(sw)} in a typical year against ${shareText(idx.swing)} for the ${idx.name}` : ""}.` };
}

const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** The one small line under the four boxes: how they are measured, and to which week (open item 1: the list and the index the same way). */
export function measureLine(r: RiskAnswer, basis: Basis, idxName: string) {
  return `How these are measured: ${basis === "value" ? "each share by what you hold now" : "equal amounts in each share"} · swing and worst fall: 3 years of weekly closes, the list and the ${idxName} alike · `
    + `moves with its markets and the 10 worst weeks: the past year of weekly closes · all to ${day(r.to)} · ${countOf(r.counted, "share")} counted`;
}

/** Open item 3: which shares drop out of the beta and the swing, and why, by name. Empty when every share is counted. */
export function coverageLine(r: RiskAnswer, nameOf: (s: string) => string): string {
  const why = (w: string) => r.shares.filter((s) => s.beta == null && (s.why ?? "") === w).map((s) => nameOf(s.symbol));
  const none = why("No stored prices"), young = why("Under a year of prices"), noSize = r.shares.filter((s) => s.beta == null && !["No stored prices", "Under a year of prices"].includes(s.why ?? "")).map((s) => nameOf(s.symbol));
  const parts = [none.length ? `${andList(none)} ${none.length === 1 ? "has" : "have"} no stored prices yet, so ${none.length === 1 ? "it is" : "they are"} left out of the beta, the swing and the worst fall` : "",
    young.length ? `${andList(young)} ${young.length === 1 ? "has" : "have"} under a year of prices: left out of the beta and the list's swing; ${young.length === 1 ? "its own swing shows" : "their own swings show"} in Each share's risk` : "",
    noSize.length ? `${andList(noSize)}: no beta yet (${r.shares.find((s) => noSize.includes(nameOf(s.symbol)))?.why?.toLowerCase() ?? "no size band yet"})` : ""].filter(Boolean);
  return parts.length ? parts.join(". ") + "." : "";
}

/** Item 169 and open item 13: the line tying the four boxes to the Risk card, the card's figure named as the alternate it is. */
export function cardLine(basis: Basis, card: { beta: number; swing: number; worstFall?: number | null; byValue: boolean } | null): string {
  if (!card) return "";
  const figs = `moves ${times(card.beta)} the Nifty 50, swings ${shareText(card.swing)} in a typical year${card.worstFall != null ? `, worst fall ${signedNum(card.worstFall)}%` : ""}`;
  if (basis === "equal") return card.byValue ? `These four hold equal amounts in each share. By what you hold now, as on the Risk card: ${figs}.` : `These four hold equal amounts in each share, as the Risk card does: ${figs}, over the past year.`;
  return `The Risk card reads the whole list against the Nifty 50 alone over the past year: ${figs}. Here each share is measured against its own size index, the headline figure.`;
}

// ------------------------------------------------------------------------------------------------ Key figures (file 33, Risk)
/** The three Key figures cards of the Risk view, through the shared KeyFigures. Lists of one and two read in the singular where they should. */
export function riskKeyFigs(r: RiskAnswer, bySize: Record<string, { list: number; risk: number }>, nameOf: (s: string) => string, basis: Basis): KeyFig[] {
  const out: KeyFig[] = [], w = r.betas.weighted, how = basis === "value" ? "each share counted by what you hold now" : "each share counted in equal amounts";
  if (w != null) {
    const parts = r.sizes.filter((s) => s.n && s.adds != null);
    out.push({ q: "How much does your list move with the market?", big: times(w), ans: "as much as its markets move", sub: rangeWord(r.betas.weightedBand).toLowerCase() || undefined,
      tip: `Each share against the index of companies its size (Nifty 50, Midcap 150, Smallcap 250, Microcap 250), past year of weekly closes; each size's average times its share of the list, ${how}. What each size adds is in the legend.`,
      bar: parts.filter((s) => (s.adds as number) > 0).map((s) => ({ label: `${s.size} adds`, n: s.adds as number, c: SIZE_C[s.size], shown: (s.adds as number).toFixed(2) })),
      go: "See how it is built", to: "eq-build" });
  }
  const sizes = SIZE_ORDER.filter((k) => bySize[k] && bySize[k].risk > 0).map((k) => [k, bySize[k]] as const);
  const big = [...sizes].sort((a, b) => b[1].risk - a[1].risk)[0];
  if (big) out.push({ q: "Where do the ups and downs come from?", big: `${Math.round(big[1].risk)}%`, ans: `from ${big[0].toLowerCase()} companies`, sub: `which are ${Math.round(big[1].list)}% of the list`,
    tip: `Each size's part of the list's ups and downs over the past year of weekly closes, ${how}; the parts add to 100%. Set beside each size's share of the list.`,
    bar: sizes.map(([k, v]) => ({ label: k, n: v.risk, c: SIZE_C[k], shown: `${Math.round(v.risk)}%` })), go: "See the risk split", to: "eq-mr" });
  const hi = r.shares.filter((s) => s.beta != null).sort((a, b) => (b.beta as number) - (a.beta as number));
  if (hi[0]) out.push({ q: "Which share moves most with the market?", big: times(hi[0].beta), ans: nameOf(hi[0].symbol),
    sub: hi.length === 1 ? `against the ${indexName(hi[0].benchmark)}` : `moves the most of your shares, against the ${indexName(hi[0].benchmark)}`,
    tip: "Each share against the index of companies its own size, past year of weekly closes. The bars show the three that move the most, with a line at 1.00×, where a share moves as much as its index.",
    rows: hi.slice(0, 3).map((s) => ({ label: nameOf(s.symbol), v: s.beta as number })), go: "See each share", to: "eq-each" });
  return out;
}

// ------------------------------------------------------------------------------------------------ the folded summaries on a phone (file 33, rows 213–217)
export function foldLines(r: RiskAnswer, bySize: Record<string, { list: number; risk: number }>, nameOf: (s: string) => string) {
  const w = r.betas.weighted;
  const sb = r.sizes.filter((s) => s.n).map((s) => { const o = overallOf(s.downPer100, s.upPer100); return o ? `${s.size}: ${o.word.toLowerCase()}` : ""; }).filter(Boolean).join(" · ");
  const rows = SIZE_ORDER.filter((k) => bySize[k]).map((k) => [k, bySize[k]] as const).sort((a, b) => b[1].risk - a[1].risk);
  const mr = rows.find(([, x]) => x.risk > x.list + 1) ?? rows[0];
  const hi = r.shares.filter((s) => s.beta != null).sort((a, b) => (b.beta as number) - (a.beta as number))[0];
  const fall = w == null ? null : Math.round(w * 100) / 10;
  return {
    glance: glanceLede(r, { name: "Nifty 50", swing: null }).lead,
    keys: w == null ? "Where the list's risk sits, in three answers" : `Moves ${times(w)} as much as its markets${mr ? ` · ${Math.round(mr[1].risk)}% of the ups and downs from ${mr[0].toLowerCase()} companies` : ""}`,
    build: w == null ? "Not enough prices for a reading yet" : `Moves ${times(w)} as much as its markets${r.betas.weightedBand ? ` · ${rangeWord(r.betas.weightedBand)}` : ""}`,
    sizeb: sb || "Each size against the index of companies its size",
    mr: mr ? `${mr[0]} companies: ${shareText(mr[1].list)} of the list, ${shareText(mr[1].risk)} of the ups and downs` : "Each part's share of the list beside its share of the ups and downs",
    fall: fall == null ? "What a 10% fall in the market has meant for the list" : `Your list would fall about ${fall.toFixed(1)}% if the market fell 10%`,
    each: hi ? `${nameOf(hi.symbol)} moves the most with its market: ${times(hi.beta)}` : "Every share against its own size index",
  };
}

// ------------------------------------------------------------------------------------------------ things to know, in names
/** The things to know under Risk at a glance (the old cards wrote share codes; file 33 names). */
export function glanceNotes(r: RiskAnswer, bySize: Record<string, { list: number; risk: number }>, nameOf: (s: string) => string) {
  const out: { kind: "warning" | "watch" | "good"; title: string; text: string }[] = [];
  const parts = (["Small", "Micro"] as const).filter((k) => bySize[k]);
  const sm = parts.length ? parts.reduce((a, k) => ({ list: a.list + bySize[k].list, risk: a.risk + bySize[k].risk }), { list: 0, risk: 0 }) : null;
  const who = parts.length === 2 ? "Small and micro companies" : parts[0] === "Micro" ? "Micro companies" : "Small companies";
  if (sm && sm.risk > 50) out.push({ kind: "warning", title: `${who} carry over half the ups and downs`, text: `They are ${Math.round(sm.list)}% of the list and ${Math.round(sm.risk)}% of its ups and downs.` });
  const top = r.shares.filter((s) => s.beta != null).sort((a, b) => (b.beta as number) - (a.beta as number)).slice(0, 3);
  if (top.length && (top[0].beta as number) > 1.35) out.push({ kind: "watch", title: top.length === 1 ? "The share that moves the most" : `The ${numWord(top.length)} shares that move the most`,
    text: `${andList(top.map((s) => `${nameOf(s.symbol)} (${times(s.beta)} its ${indexName(s.benchmark)})`))}.` });
  const lg = r.sizes.find((s) => s.size === "Large");
  if (lg?.n && lg.avgBeta != null && lg.avgBeta < 1.1) out.push({ kind: "good", title: "Large companies steady the list", text: `Your ${lg.n} large ${lg.n === 1 ? "company moves" : "companies move"} ${times(lg.avgBeta)} as much as the Nifty 50 on average.` });
  return out;
}

/** The things to know under How your list's beta is built: two ways to read it, a low beta is not low risk, and how the list is weighted. */
export function buildNotes(r: RiskAnswer, basis: Basis) {
  const { weighted: w, nifty: n } = r.betas;
  const out: { kind: "insight" | "watch" | "good"; title: string; text: string }[] = [];
  if (w != null && n != null) out.push({ kind: "insight", title: "Two ways to read it", text: `Against each share's own market the list moves ${times(w)} as much; against the Nifty 50 alone, ${times(n)}. ${n < w ? "Mid, small and micro companies move less in step with the Nifty 50, so it reads lower." : "The Nifty 50 reading is the one for what a Nifty 50 fall has meant."}` });
  out.push({ kind: "watch", title: "Moving little with the market is not the same as low risk", text: "A share can move little with its market and still swing a lot on its own news. The swing and worst fall columns in Each share's risk show that side." });
  out.push({ kind: "insight", title: basis === "value" ? "Weighted by what you hold now" : "Every share counts the same here", text: basis === "value" ? "Each size counts by the money in it today (quantity × last close). Pick Equal amounts above to count every share the same." : "Each share counts the same. Once every share has a quantity, the page reads the list by what you hold now." });
  return out;
}

/** "−12.9%" with the real minus. */
export const pc1 = (v: number | null | undefined) => (v == null ? MINUS : pctText(v));
export const cap = cap1;

/** Each size's figures for the Each size table, in the order the page draws them. */
export const sizeRows = (r: RiskAnswer): RiskSize[] => r.sizes.filter((s) => s.n);
/** Each share's own part of the list and of the ups and downs (by the basis the answer was worked out on). */
export const shareParts = (s: RiskShare) => ({ list: s.listShare ?? null, risk: s.riskShare ?? null });
