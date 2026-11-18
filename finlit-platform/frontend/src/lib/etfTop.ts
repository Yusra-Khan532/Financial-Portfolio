// Task #183 part 3 (ETF portfolio, pack 03 "Changes of 15 Nov (afternoon)"): the top of the page (the dark "Your ETF list" box and one tile per tab, the whole
// tile opens its tab), each tab's Key figures (three cards) and the sections in the pack's order. Every figure is the server's (/api/me/etf-portfolio, /inside,
// /risk); this file only counts and words them. Words describe; never advice.
import type { KeyCard } from "./equityTop";
import type { EtfPortfolio, EtfRisk, EtfRow, Inside } from "./etfPortfolio";
import type { Sec } from "../portfolio/pack/PageTop";

export type EtfTab = "etfs" | "inside" | "risk";
export type EtfTile = { id: EtfTab; k: string; v: string; sub: string; link: string; tone: "good" | "info" | "watch"; help: string; how: string; tag?: string };

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
const num = (n: number) => (n < NUM.length ? NUM[n] : String(n));
const Num = (n: number) => num(n).replace(/^./, (c) => c.toUpperCase());
const b2 = (x: number | null | undefined) => (x == null ? "–" : x.toFixed(2));
const sp = (x: number, d = 1) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}%`;
const TYPE_ORDER = ["indian", "gold", "silver", "abroad", "debt", "liquid"];
const TYPE_LOWER: Record<string, string> = { indian: "Indian shares", gold: "gold", silver: "silver", abroad: "shares abroad", debt: "debt", liquid: "liquid" };
export const live = (d: EtfPortfolio | undefined): EtfRow[] => (d?.items ?? []).filter((i) => !i.gone);

/** The ETFs by type, in the pack's order: [{key, word, n, share, symbols}]. Share: by value once every ETF has a quantity, else by count. */
export function byType(d: EtfPortfolio | undefined) {
  const xs = live(d), m = new Map<string, EtfRow[]>();
  for (const e of xs) { const k = e.type?.key ?? "indian"; m.set(k, [...(m.get(k) ?? []), e]); }
  return [...m].sort((a, b) => TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0])).map(([k, es]) => ({
    key: k, word: es[0].type?.word ?? "Indian shares", n: es.length, share: es.reduce((a, e) => a + (e.weight ?? 0), 0), symbols: es.map((e) => e.symbol), etfs: es }));
}

/** The list's average yearly cost (each ETF weighted like the list) and how many have no figure. */
export function yearlyCost(d: EtfPortfolio | undefined) {
  const xs = live(d), have = xs.filter((e) => e.ter?.value != null), w = have.reduce((a, e) => a + (e.weight ?? 0), 0);
  const avg = have.length && w ? have.reduce((a, e) => a + (e.ter!.value as number) * (e.weight ?? 0), 0) / w : null;
  const top = [...have].sort((a, b) => (b.ter!.value as number) - (a.ter!.value as number))[0];
  return { avg, missing: xs.length - have.length, top };
}

/** The ETF furthest from its NAV, and how many others are within 0.2%. */
export function furthest(d: EtfPortfolio | undefined) {
  const xs = live(d).filter((e) => e.premium != null), far = [...xs].sort((a, b) => Math.abs(b.premium as number) - Math.abs(a.premium as number))[0];
  return { far, near: xs.filter((e) => e !== far && Math.abs(e.premium as number) <= 0.2).length, others: xs.length - 1 };
}

/** "Moves like N independent ETFs" = n² ÷ Σᵢⱼ ρᵢⱼ² over the ETFs with a year of weekly prices (COMMON-RULES 8; liquid ETFs left out on the server). */
export function movesLike(rk: EtfRisk | undefined) {
  const t = rk?.together;
  if (!t || t.symbols.length < 2) return null;
  const n = t.symbols.length;
  let s = n;                                    // the diagonal: each ETF with itself, 1² each
  for (const p of t.pairs) { if (p.r == null) return null; s += 2 * p.r * p.r; }
  return { of: n, independent: (n * n) / s };
}

export function listBox(d: EtfPortfolio | undefined) {
  const xs = live(d), types = byType(d);
  const valued = xs.length > 0 && d?.basis === "value";
  return { n: xs.length, line: `${types.map((g) => `${g.n} ${TYPE_LOWER[g.key] ?? g.word.toLowerCase()}`).join(" · ")}.`,
    weights: valued ? "Each ETF counts by the value of your quantity." : "Every ETF counts the same until you add quantities.", valued };
}

export function etfTiles(d: EtfPortfolio | undefined, ins: Inside | undefined, rk: EtfRisk | undefined): EtfTile[] {
  const cost = yearlyCost(d), f = furthest(d), xs = live(d), mv = movesLike(rk), rep = d?.repeats ?? [];
  const idx = new Set(xs.map((e) => e.tracks.key ?? e.symbol)).size, twice = rep[0];
  const pair = twice ? ins?.overlap.pairs.find((p) => twice.symbols.includes(p.a) && twice.symbols.includes(p.b)) : undefined;
  const own = rk?.own?.list, beta = own?.betaOwn, word = beta == null ? null : beta < 0.9 ? "Lower" : beta > 1.1 ? "Higher" : "In line";
  return [
    { id: "etfs", k: "Your ETFs", v: cost.avg == null ? "Cost not published" : `${cost.avg.toFixed(2)}% a year`, tone: "good", link: "Open Your ETFs",
      sub: `Average cost.${f.far ? ` ${f.far.symbol} closed ${Math.abs(f.far.premium as number).toFixed(1)}% ${(f.far.premium as number) >= 0 ? "above" : "below"} its value; ${f.near === f.others ? `the other ${num(f.others)} within 0.2%` : `${num(f.near)} of the other ${num(f.others)} within 0.2%`}` : ""}`,
      help: "What your ETFs cost a year on average (AMFI's expense ratios, each ETF weighted like the list), and the ETF whose last close sat furthest from its NAV.",
      how: "A lower cost keeps more of the index's return. A price well above the NAV means buyers paid more than the holdings were worth that day." },
    { id: "inside", k: "What's inside", v: `${idx} ${idx === 1 ? "index" : "indexes"}`, tag: twice ? `${twice.label.toUpperCase()} TWICE` : undefined, tone: "info", link: "Open What's inside",
      sub: [mv ? `The list moves like ${mv.independent.toFixed(1)} of ${mv.of} ETFs` : null, twice ? `${twice.symbols.join(" and ")} hold the same ${pair?.n ?? ""} companies`.replace("  ", " ") : null].filter(Boolean).join("; ") || "What your ETFs hold, and how alike they are",
      help: "How many different indexes or assets your ETFs follow, how many truly separate ETFs they behave like (weekly prices, past year), and whether two follow the same index.",
      how: "Moves like 2.2 of 6: the six rise and fall like about two separate ETFs. A TWICE tag: two ETFs follow one index, so the second adds no spread." },
    { id: "risk", k: "Risk analytics", v: beta != null ? `${word} · β ${b2(beta)}` : "–", tone: "watch", link: "Open Risk analytics",
      sub: beta != null ? `Against the Nifty 500; swings ${rk?.list.swing != null && rk.bench.swing != null ? `${rk.list.swing.toFixed(1)}% a year vs ${rk.bench.swing.toFixed(1)}% over 3 years` : "–"}` : rk?.list.why ?? "Working out the risk figures",
      help: "The list's beta against the Nifty 500 (past year of weekly prices, liquid ETFs as 0), and how much it swings in a typical year against the Nifty 500 (3 years).",
      how: "A beta below 1 has moved less than the Indian market, above 1 more. The swing sits beside the Nifty 500's." },
  ];
}

// ------------------------------------------------------------------------------------------------ Key figures, one row per tab
export function etfsCards(d: EtfPortfolio | undefined): KeyCard[] {
  const out: KeyCard[] = [], rep = d?.repeats ?? [], f = furthest(d), cost = yearlyCost(d);
  if (rep[0]) out.push({ tone: "watch", k: "Same index twice", v: `${rep[0].label} × ${rep[0].symbols.length}`, text: `${rep[0].symbols.join(" and ")} hold the same companies; the second adds no spread.`, go: "See the overlap", to: "etp-shared" });
  if (f.far && Math.abs(f.far.premium as number) >= 1) out.push({ tone: "warn", k: (f.far.premium as number) > 0 ? "Far above its value" : "Far below its value", v: `${f.far.symbol} ${sp(f.far.premium as number)}`,
    text: `It closed ${Math.abs(f.far.premium as number).toFixed(1)}% ${(f.far.premium as number) > 0 ? "above" : "below"} its NAV. ${f.near === f.others ? `The other ${num(f.others)} were within 0.2%.` : `${Num(f.near)} of the other ${num(f.others)} were within 0.2%.`}`, go: "See trading", to: "etp-trading" });
  if (cost.avg != null) out.push({ tone: "info", k: "Yearly cost", v: `${cost.avg.toFixed(2)}%`, text: `About ₹${Math.round(cost.avg * 1000).toLocaleString("en-IN")} a year on ₹1 lakh.${cost.top ? ` ${cost.top.symbol} costs the most, ${cost.top.ter!.value!.toFixed(2)}%.` : ""}`, go: "See costs", to: "etp-etfs" });
  return out;
}

export function insideCards(d: EtfPortfolio | undefined, ins: Inside | undefined, rk: EtfRisk | undefined): KeyCard[] {
  const out: KeyCard[] = [];
  const pair = [...(ins?.overlap.pairs ?? [])].sort((a, b) => b.pct - a.pct)[0];
  if (pair && pair.pct >= 50) out.push({ tone: "warn", k: "Near-identical pair", v: `${pair.pct.toFixed(1)}% overlap`, text: `${pair.a} and ${pair.b} share ${pair.n} stocks.`, go: "See shared stocks", to: "etp-shared" });
  const mv = movesLike(rk);
  if (mv) out.push({ tone: "info", k: "Moves like", v: `${mv.independent.toFixed(1)} of ${mv.of}`, text: `independent ETFs, from weekly prices over the past year; the liquid ETF is left out.`, go: "See how they move", to: "etp-move" });
  const miss = (ins?.files ?? []).filter((f) => f.why && live(d).find((e) => e.symbol === f.symbol)?.type?.key === "indian");
  if (miss.length) out.push({ tone: "watch", k: miss.length === 1 ? "One file missing" : `${Num(miss.length)} files missing`, v: miss.map((f) => f.symbol).join(" · "), text: `${miss.length === 1 ? "Its holdings are" : "Their holdings are"} not loaded, so ${miss.length === 1 ? "it is" : "they are"} left out of the sector and size readings.`, go: "See company sizes", to: "etp-sizes" });
  else if (ins?.size) out.push({ tone: "info", k: "Large companies lead", v: `${Math.round(ins.size.Large)}% large`, text: `Of the Indian shares inside your ETFs, by FinLit's ₹ sizes.`, go: "See company sizes", to: "etp-sizes" });
  return out;
}

export function riskCards(rk: EtfRisk | undefined): KeyCard[] {
  const own = rk?.own?.list;
  if (!rk || !own) return [];
  const out: KeyCard[] = [];
  if (own.betaOwn != null) out.push({ tone: own.betaOwn <= 1 ? "good" : "watch", k: own.betaOwn < 0.9 ? "Moves less than the market" : own.betaOwn > 1.1 ? "Moves more than the market" : "Moves with the market", v: `β ${b2(own.betaOwn)}`,
    text: `Against the Nifty 500, weighted ${rk.basis === "value" ? "by your money" : "by count"}.`, go: "See how it is built", to: "etp-build" });
  const most = [...rk.etfs].filter((e) => e.riskShare != null).sort((a, b) => ((b.riskShare as number) - b.weight) - ((a.riskShare as number) - a.weight))[0];
  if (most) out.push({ tone: "warn", k: "Most risk for its size", v: `${most.symbol} ${Math.round(most.riskShare as number)}%`, text: `${Math.round(most.weight)}% of the list, ${Math.round(most.riskShare as number)}% of its ups and downs.`, go: "See the risk split", to: "etp-share" });
  const odd = rk.etfs.filter((e) => e.differentAsset && e.swing != null && e.betaPast != null && (e.swing as number) >= 10).sort((a, b) => (a.betaPast as number) - (b.betaPast as number))[0];   // the lowest beta with a big swing
  if (odd) out.push({ tone: "info", k: "Low beta, big swings", v: `${odd.symbol} ${(odd.swing as number).toFixed(1)}%`, text: `A beta of ${b2(odd.betaPast)} but a ${(odd.swing as number).toFixed(1)}% typical swing over 3 years.`, go: "See each ETF", to: "etp-each" });
  return out;
}

/** The sections of each tab, in the pack's order (the sections bar, and "All sections" lists every one of the three tabs). */
export const ETF_SECS: Record<EtfTab, { label: string; secs: Sec[] }> = {
  etfs: { label: "Your ETFs", secs: [["etp-etfs", "Your ETFs"]] },
  inside: { label: "What's inside", secs: [["etp-own", "What they own"], ["etp-money", "Money in"], ["etp-secin", "Sectors inside"], ["etp-move", "Move together"], ["etp-shared", "Shared stocks"],
    ["etp-sizes", "Company sizes"], ["etp-largest", "Largest stocks"]] },
  risk: { label: "Risk analytics", secs: [["etp-glance", "At a glance"], ["etp-build", "Beta build"], ["etp-n500", "Against the Nifty 500"], ["etp-share", "Risk share"], ["etp-fall", "If the market fell 10%"], ["etp-each", "Each ETF"]] },
};
