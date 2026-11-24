// Task #385 phase 2 (developer file 33, Diversification view): the figures the Diversification view works out from what the page already loads (the
// server's correlation matrix, its groups, each share's macro sector and size, and each share's value now). Pure, so each rule is tested
// (shared/divFigs385.test.ts).
//   MACRO_NOTE     each NSE macro sector written out, with a one-line note on what it covers
//   moneyGrid      "Where your list sits" by money: each cell's share of the list's value, its shade, each row's and each size's share
//   divKeyFigs     the three Key figures cards (Where is most of your list?, Which shares move as one?, How many separate bets are in your list?)
//   pairChart      every pair of shares placed in 0.02 slots, the four bands counted, the typical pair; bars when a slot holds more than 12 pairs
//   divFoldLines   the one-line summaries of the folded sections on a phone (All sections)
//   spreadNote / independentNote / spreadCards   the lines of "How spread out is the list?"
// Describes figures; never advice.
import type { KeyFig } from "./KeyFigures";
import { rupeesShort, shareText } from "./numbers";
import { countOf, corrText, corrWord, numWord, type CorrWord } from "./words";

/** NSE's 12 macro sectors, each with a one-line note on what it covers (file 33, Names: written out, never "Cons. Disc."). */
export const MACRO_NOTE: Record<string, string> = {
  "Commodities": "Metals, mining, chemicals, cement and paper",
  "Consumer Discretionary": "Cars, auto parts, appliances, hotels and media",
  "Diversified": "Groups spread over unrelated businesses",
  "Energy": "Oil, gas and coal, and their refiners",
  "Fast Moving Consumer Goods": "Food, drinks and household goods",
  "Financial Services": "Banks, lenders, insurers and brokers",
  "Healthcare": "Medicines, hospitals and diagnostics",
  "Industrials": "Construction, machinery, cables and power gear",
  "Information Technology": "Software, IT services and hardware",
  "Services": "Transport, logistics, retail and ports",
  "Telecommunication": "Phone, internet and network companies",
  "Utilities": "Power, water and gas supply",
};
export const macroNote = (name: string) => MACRO_NOTE[name] ?? "";

// ------------------------------------------------------------------------------------------------ Where your list sits, by money
export type GridIn = { rows: { name: string; cells: { k: string; who: string[] }[] }[]; cols: { k: string }[] };
export type MoneyGrid = { total: number; cell: (row: string, k: string) => { v: number; pct: number; shade: number }; row: (name: string) => { v: number; pct: number }; col: (k: string) => number };
/** The grid counted by money (file 33): each cell's % is its shares' value over the list's value; its shade is 16% + 54% × its value ÷ the largest
 *  cell's value; "Of the list" shows each row's money %; the footer each size's money %. `rowOf`: a share's row (a share with no size band counts in its
 *  row, not in a size column). Null when any share has no value now: the switch then stays hidden. */
export function moneyGrid(g: GridIn, symbols: string[], worth: (s: string) => number | null | undefined, rowOf: (s: string) => string): MoneyGrid | null {
  const V = new Map<string, number>();
  for (const s of symbols) { const v = worth(s); if (v == null || !Number.isFinite(v) || v < 0) return null; V.set(s, v); }
  const total = [...V.values()].reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const sum = (xs: string[]) => xs.reduce((a, s) => a + (V.get(s) ?? 0), 0);
  const cells = new Map<string, number>(), rows = new Map<string, number>(), cols = new Map<string, number>();
  g.rows.forEach((r) => r.cells.forEach((c) => { const v = sum(c.who); cells.set(r.name + "\u0000" + c.k, v); cols.set(c.k, (cols.get(c.k) ?? 0) + v); }));
  symbols.forEach((s) => rows.set(rowOf(s), (rows.get(rowOf(s)) ?? 0) + (V.get(s) ?? 0)));
  const max = Math.max(0, ...cells.values());
  return {
    total,
    cell: (row, k) => { const v = cells.get(row + "\u0000" + k) ?? 0; return { v, pct: (100 * v) / total, shade: v > 0 && max > 0 ? Math.round(16 + (54 * v) / max) : 0 }; },
    row: (name) => { const v = rows.get(name) ?? 0; return { v, pct: (100 * v) / total }; },
    col: (k) => (100 * (cols.get(k) ?? 0)) / total,
  };
}
/** "5 shares · ₹8.43 L": a row's count and its value now. */
export const rowMoneyLine = (n: number, v: number) => `${countOf(n, "share")} · ${rupeesShort(v)}`;

// ------------------------------------------------------------------------------------------------ Key figures
/** The Key figures bar's colours for the macro sectors (the site's chart series), then grey for the rest. */
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
const GREY = "var(--border-strong)";
export type DivKeyIn = {
  /** every share in the list, with its macro sector */ symbols: string[]; macroOf: (s: string) => string;
  /** the shares with a year of prices (the correlation matrix's order), and the groups found from them */ counted: string[]; groups: { members: string[] }[];
  /** "moves like": by what you own now when every share has a value, else each share counted equally */ eff: number; byValue: boolean;
  worth?: (s: string) => number | null | undefined; label: (s: string) => string;
};
/** The Diversification view's Key figures (file 33). 1 Where is most of your list? "38% in Consumer Discretionary", line "5 of your 13 shares · 36.8% of
 *  your money". 2 Which shares move as one? "4 of 13 move together in two groups", line "the other 9 move on their own", worth a look "In the groups:
 *  <names>"; with no group, "None move closely together". 3 How many separate bets are in your list? "5.7 separate bets", line "among your 13 shares; the rest
 *  overlap". Lists of one and two shares read in the singular. */
export function divKeyFigs(d: DivKeyIn): KeyFig[] {
  const out: KeyFig[] = [], N = d.symbols.length;
  if (!N) return out;
  const by = new Map<string, string[]>();
  d.symbols.forEach((s) => { const m = d.macroOf(s); by.set(m, [...(by.get(m) ?? []), s]); });
  const secs = [...by].map(([name, xs]) => ({ name, n: xs.length })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const top = secs[0], vals = d.worth ? d.symbols.map((s) => d.worth!(s)) : [];
  const tot = vals.length && vals.every((v) => v != null && Number.isFinite(v)) ? (vals as number[]).reduce((a, b) => a + b, 0) : 0;
  const money = tot > 0 ? (100 * (by.get(top.name) ?? []).reduce((a, s) => a + (d.worth!(s) as number), 0)) / tot : null;
  const bar = secs.length <= SERIES.length ? secs.map((s, i) => ({ label: s.name, n: s.n, c: SERIES[i] }))
    : [...secs.slice(0, SERIES.length - 1).map((s, i) => ({ label: s.name, n: s.n, c: SERIES[i] })), { label: "Others", n: secs.slice(SERIES.length - 1).reduce((a, s) => a + s.n, 0), c: GREY }];
  out.push({ q: "Where is most of your list?", big: `${Math.round((100 * top.n) / N)}%`, ans: `in ${top.name}`,
    sub: [N === 1 ? "your only share" : top.n === N ? (N === 2 ? "both your shares" : `all ${N} of your shares`) : `${top.n} of your ${countOf(N, "share")}`, money != null && N > 1 ? `${shareText(money)} of your money` : ""].filter(Boolean).join(" · "),
    tip: "Each macro sector's share of your list, counting each share once. The line under it adds that macro sector's share of your money: what its shares are worth now over what the whole list is worth.",
    bar, go: "See where it sits", to: "eq-where" });
  const C = d.counted.length;
  if (C >= 2) {
    const inG = d.groups.reduce((a, g) => a + g.members.length, 0), G = d.groups.length, rest = C - inG;
    const tipG = "Groups found from each pair of shares' weekly prices over the past year, not from sector labels: the shares in a group average a correlation of 0.50 or more with each other (partly linked or closer), so they have tended to rise and fall together.";
    out.push(inG ? { q: "Which shares move as one?", big: `${inG} of ${C}`, ans: `move together in ${numWord(G)} ${G === 1 ? "group" : "groups"}`,
      sub: rest === 0 ? "every share is in a group" : rest === 1 ? "the other share moves on its own" : `the other ${rest} move on their own`, tip: tipG,
      bar: [{ label: "In a group", n: inG, c: SERIES[1] }, { label: "Move on their own", n: rest, c: GREY }].filter((b) => b.n > 0),
      worth: { label: "In the groups", names: d.groups.flatMap((g) => g.members).map((s) => ({ symbol: s, label: d.label(s) })) }, go: "See the groups", to: "eq-groups" }
      : { q: "Which shares move as one?", big: "None", ans: "move closely together", sub: C === 2 ? "your two shares each go more or less their own way" : `each of your ${C} shares goes more or less its own way`, tip: tipG,
        go: "See the groups", to: "eq-groups" });
    const e = Math.max(1, Math.min(C, d.eff)), ov = Math.max(0, C - e);
    out.push({ q: "How many separate bets are in your list?", big: e.toFixed(1), ans: e.toFixed(1) === "1.0" ? "separate bet" : "separate bets",
      sub: ov < 0.05 ? `among your ${countOf(C, "share")}; they barely overlap` : `among your ${countOf(C, "share")}; the rest overlap`,
      tip: `Shares that rise and fall together count as one bet. "${e.toFixed(1)} separate bets" means your ${countOf(C, "share")} with a year of prices have behaved like about ${e.toFixed(1)} shares that each move on their own. ${d.byValue ? "Counted by what you own now, as on the Diversification card." : "Each share counted equally, until every share has a quantity."}`,
      bar: [{ label: "Separate bets", n: Number(e.toFixed(1)), c: SERIES[0] }, { label: "Overlap", n: Number(ov.toFixed(1)), c: GREY }].filter((b) => b.n > 0), go: "See share by share", to: "eq-grid" });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the pairs chart
export const CORR_WORDS: CorrWord[] = ["barely", "loosely", "partly", "closely"];
export const CORR_CUTS = [0.2, 0.4, 0.6];
/** A figure's band: 0 barely, 1 loosely, 2 partly, 3 closely. */
export const corrBand = (v: number) => CORR_CUTS.filter((c) => Math.abs(v) >= c).length;
export type Pair = { a: string; b: string; corr: number };
export type PairChart = { pairs: Pair[]; counts: number[]; median: number | null; max: number; bars: boolean; slot: number;
  slots: { at: number; lo: number; hi: number; pairs: Pair[] }[] };
/** Every pair placed in `slot`-wide slots (0.02 on a laptop) on a 0 to 0.7 scale, wider if a pair is above it; the four bands counted; the typical pair
 *  (the median). `bars` when more than 12 pairs share one slot (a 100-share list has 4,950 pairs). Below zero sits at zero. Each slot lists its pairs
 *  closest first. */
export function pairChart(pairs: Pair[], slot = 0.02): PairChart {
  const counts = [0, 0, 0, 0];
  pairs.forEach((p) => counts[corrBand(Math.max(0, p.corr))]++);
  const vs = pairs.map((p) => p.corr).sort((a, b) => a - b), n = vs.length;
  const median = n ? (n % 2 ? vs[(n - 1) / 2] : (vs[n / 2 - 1] + vs[n / 2]) / 2) : null;
  const max = n ? Math.max(0.7, Math.ceil((vs[n - 1] + 0.05) * 10) / 10) : 0.7;
  const by = new Map<number, Pair[]>();
  pairs.forEach((p) => { const k = Math.round(Math.max(0, p.corr) / slot); by.set(k, [...(by.get(k) ?? []), p]); });
  const slots = [...by].sort((a, b) => a[0] - b[0]).map(([k, ps]) => ({ at: k * slot, lo: Math.max(0, k * slot - slot / 2), hi: k * slot + slot / 2, pairs: [...ps].sort((a, b) => b.corr - a.corr) }));
  return { pairs, counts, median, max: Math.min(1, max), bars: slots.some((s) => s.pairs.length > 12), slot, slots };
}
/** "Samvardhana Motherson · Larsen & Toubro · 0.62 · closely linked, about 38% of their weekly moves in common". */
export const pairLine = (a: string, b: string, v: number) => `${a} · ${b} · ${v.toFixed(2)} · ${corrWord(v)} linked, about ${Math.round(v * v * 100)}% of their weekly moves in common`;
/** "40 pairs between 0.27 and 0.29 · the closest of them: A · B, 0.29". */
export const slotLine = (s: { lo: number; hi: number; pairs: Pair[] }, label: (x: string) => string) =>
  `${countOf(s.pairs.length, "pair")} between ${s.lo.toFixed(2)} and ${s.hi.toFixed(2)} · ${s.pairs.length === 1 ? "the pair" : "the closest of them"}: ${label(s.pairs[0].a)} · ${label(s.pairs[0].b)}, ${s.pairs[0].corr.toFixed(2)}`;

// ------------------------------------------------------------------------------------------------ How spread out is the list?
export type SpreadFigs = { score: number; band: string; comovement: number; sector_spread: number; effective_stocks: number; effective_sectors: number };
/** The line under the two readings that ties the section to the Diversification card (file 33 row 142, with open item 7 done): what this basis reads and what the
 *  other one reads. `byValue`: the figures by what you own now, null when a share has no quantity. */
export function spreadNote(mode: "value" | "equal", equal: SpreadFigs, byValue: SpreadFigs | null, n: number): string {
  if (!byValue) return "This score counts each share equally. Once every share has a quantity, it can also be read by what you own now.";
  return mode === "equal"
    ? `This score counts each share equally. By what you own now it reads ${Math.round(byValue.score)}, moving like ${byValue.effective_stocks.toFixed(1)} of ${countOf(n, "share")}: the figures on the Diversification card.`
    : `This score counts each share by what you own now: the figures on the Diversification card. Counting each share equally it reads ${Math.round(equal.score)}, moving like ${equal.effective_stocks.toFixed(1)} of ${countOf(n, "share")}.`;
}
/** Open item 12: why a short list reads low on "How independently they move" while "Moves like" says every share moves on its own. The scale counts how
 *  many shares move on their own, not what part of the list does. */
export function independentNote(s: SpreadFigs, n: number): string {
  const all = n > 0 && s.effective_stocks >= n - 0.15;
  return all
    ? `Reads ${Math.round(s.comovement)} although your ${countOf(n, "share")} ${n === 1 ? "moves" : "move"} like ${s.effective_stocks.toFixed(1)}: the scale counts how many shares move on their own, not what part of the list does, so a short list reads low even when every share goes its own way.`
    : `From a year of weekly prices: the more of your shares move on their own, the higher it reads. The scale counts how many do (here about ${s.effective_stocks.toFixed(1)}), not what part of the list does.`;
}
/** The three things to know under the score. The good sign fires only with two or more macro sectors (open item 11). */
export function spreadCards(a: { n: number; macro: number; sector: number; ind: number; top: [string, number] | null; ones: number; sizes: number[] }) {
  const { n, macro, sector, ind, top, ones, sizes: sz } = a, sm = sz[2] + sz[3];
  const out: { kind: "good" | "watch" | "insight"; title: string; text: string }[] = [];
  if (macro >= 2) out.push({ kind: "good", title: `Spread across ${countOf(macro, "macro sector")}, ${countOf(sector, "sector")} and ${countOf(ind, "industry")}`,
    text: `${top && top[1] > 8 ? `Every macro sector except ${top[0]} has 8 shares or fewer` : "No macro sector has more than 8 shares"}, and ${ones} of the ${countOf(ind, "industry")} ${ones === 1 ? "has" : "have"} just one share.` });
  if (top && n > 0 && top[1] / n >= 0.25) out.push({ kind: "watch", title: `${top[0]} is ${Math.round((top[1] / n) * 100)}% of the list`,
    text: top[1] === n ? `All ${countOf(n, "share")} sit in one macro sector, so they share its business cycle.` : `${top[1]} of ${countOf(n, "share")} sit in one macro sector, so they share its business cycle.` });
  out.push({ kind: "insight", title: sz[0] && sz[1] && sm ? (sm > sz[0] + sz[1] ? "Balanced by size, tilted to smaller companies" : "Balanced by size") : "Leaning to one size",
    text: `${sz[0]} large, ${sz[1]} mid, ${sz[2]} small and ${sz[3]} micro ${sz.reduce((x, y) => x + y, 0) === 1 ? "company" : "companies"}.${sz[0] && sm ? " Large companies steady the list; the small and micro ones add most of the swings." : ""}` });
  return out;
}

// ------------------------------------------------------------------------------------------------ correlation words in the server's and the page's sentences
/** Every two-decimal correlation in a sentence gets its word beside it ("at 0.32" → "at 0.32 (loosely linked)"). Only for sentences whose two-decimal
 *  figures are all correlations (the things to know under the moving-together sections). */
export const withCorrWords = (text: string) => text.replace(/(^|[^\d.×₹])(−?\d\.\d\d)(?![\d%×(]| \()/g, (_m, pre: string, v: string) => `${pre}${corrText(parseFloat(v.replace("−", "-")))}`);

// ------------------------------------------------------------------------------------------------ the folded summaries on a phone
/** "Most of it in Consumer Discretionary: 38.5% of your shares" (or "of your money" in By money). */
export function whereLine(rows: { name: string; pct: number }[], money: boolean): string {
  const t = [...rows].sort((a, b) => b.pct - a.pct)[0];
  return t ? `Most of it in ${t.name}: ${shareText(t.pct)} of your ${money ? "money" : "shares"}` : "Your shares by macro sector and size";
}
/** "Most linked: Consumer Discretionary and Information Technology, 0.34 (loosely linked)". */
export function sectorsLine(cross: { a: string; b: string; avg: number }[], only: string | null): string {
  const t = [...cross].sort((x, y) => y.avg - x.avg)[0];
  return t ? `Most linked: ${t.a} and ${t.b}, ${corrText(t.avg)}` : only ? `All your shares sit in one macro sector: ${only}` : "How your macro sectors move together";
}
/** "13 shares move like 5.7 independent ones." */
export const gridLine = (n: number, eff: number) => `${countOf(n, "share")} ${n === 1 ? "moves" : "move"} like ${eff.toFixed(1)} independent ${eff.toFixed(1) === "1.0" ? "one" : "ones"}.`;
/** The first sentence of a note. */
export const firstSentence = (s: string | null | undefined) => { const t = String(s ?? "").trim(); const m = t.match(/^(.+?[.!?])(\s|$)/); return m ? m[1] : t; };
