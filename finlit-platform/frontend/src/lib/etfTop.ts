// Task #183 part 3 (ETF portfolio, pack 03 "Changes of 15 Nov (afternoon)"): the top of the page (the dark "Your ETF list" box and one tile per tab, the whole
// tile opens its tab), each tab's Key figures (three cards) and the sections in the pack's order. Every figure is the server's (/api/me/etf-portfolio, /inside,
// /risk); this file only counts and words them. Words describe; never advice.
import type { KeyCard } from "./equityTop";
import type { EtfPortfolio, EtfRisk, EtfRow, Inside } from "./etfPortfolio";
import type { Sec } from "../portfolio/pack/PageTop";
import { andList, countOf } from "../portfolio/shared/words";
import { num as fmtNum } from "./format";

export type EtfTab = "etfs" | "inside" | "risk";
export type EtfTile = { id: EtfTab; k: string; v: string; sub: string; link: string; tone: "good" | "info" | "watch"; help: string; how: string; tag?: string };

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
const num = (n: number) => (n < NUM.length ? NUM[n] : String(n));
const Num = (n: number) => num(n).replace(/^./, (c) => c.toUpperCase());
const b2 = (x: number | null | undefined) => (x == null ? "–" : fmtNum(x));   // task #390 (file 39 C3): "−0.04", never a hyphen
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
      sub: [mv ? `The list moves like ${mv.independent.toFixed(1)} of ${mv.of} ETFs` : null, twice ? `${andList(twice.symbols)} hold the same ${pair?.n ?? ""} companies`.replace("  ", " ") : null].filter(Boolean).join("; ") || "What your ETFs hold, and how alike they are",
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
  if (rep[0]) out.push({ tone: "watch", k: "Same index twice", v: `${rep[0].label} × ${rep[0].symbols.length}`, text: `${andList(rep[0].symbols)} hold the same companies; the second adds no spread.`, go: "See the overlap", to: "etp-shared" });
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
  risk: { label: "Risk analytics", secs: [["etp-glance", "At a glance"], ["etp-build", "Beta build"], ["etp-n500", "Against the Nifty 500"], ["etp-fall", "If the Nifty 500 fell"], ["etp-share", "Risk share"], ["etp-each", "Each ETF"]] },
};

// ------------------------------------------------------------------------------------------------ task #390 (developer file 34): the calm top and the steps
/** The three view cards (T3–T5, F3): Your ETFs counts the ETFs (the cost has its own card beside it) and names the ETF furthest from its value; Risk
 *  analytics reads "Lower · moves 0.58×" (no β) with the swing beside the Nifty 500's. What's inside keeps its companies, sizes and macro sectors. */
export type EtfCard = { id: EtfTab; k: string; v: string; sub: string };
export function etfCards(d: EtfPortfolio | undefined, u: { companies: number; sizes: number; macros: number; shareEtfs: string[] } | null, rk: EtfRisk | undefined,
  o: { insidePending?: boolean; insideError?: boolean; riskPending?: boolean; riskError?: string | null; about?: (n: number) => string } = {}): EtfCard[] {
  const xs = live(d), f = furthest(d), about = o.about ?? ((n: number) => String(n));
  const far = f.far && Math.abs(f.far.premium as number) >= 0.1 ? `${f.far.symbol} trades ${Math.abs(f.far.premium as number).toFixed(2)}% ${(f.far.premium as number) > 0 ? "above" : "below"} its value` : null;
  const b = rk?.own?.list.beta500 ?? rk?.own?.list.betaOwn ?? null, word = b == null ? null : b < 0.9 ? "Lower" : b > 1.1 ? "Higher" : "In line";
  const idx = new Set(xs.map((e) => e.tracks.key ?? e.symbol)).size;
  return [
    { id: "etfs", k: "Your ETFs", v: countOf(xs.length, "ETF"), sub: far ?? "What each tracks, costs and earned, and how it trades" },
    { id: "inside", k: "What's inside", v: u && u.companies ? `${about(u.companies)} companies` : o.insidePending ? "Reading the files…" : countOf(idx, "index", "indexes"),
      sub: u && u.companies ? `Through ${countOf(u.shareEtfs.length, "share ETF")} · ${u.sizes} sizes · ${u.macros} macro sectors` : o.insideError ? "What sits inside could not be read right now" : "What your ETFs hold, and how alike they are" },
    { id: "risk", k: "Risk analytics", v: b == null ? (o.riskPending ? "Working it out…" : "–") : `${word} · moves ${fmtNum(b)}×`,
      sub: rk?.list.swing != null && rk.bench.swing != null ? `Swings ${rk.list.swing.toFixed(1)}% a year; the Nifty 500 ${rk.bench.swing.toFixed(1)}%` : rk?.list.why ?? o.riskError ?? "Against the Nifty 500" },
  ];
}

/** Task #390 (developer file 34, Section bar, and Update 25 Nov row 1): one section per step. Key figures is no longer a step of its own: its cards sit in
 *  step 1 of every view (so does Sold on Your ETFs; task #390 file 39 A1: "Where your gain or loss came from" left the page, and with it etp-gl), and a remembered "Key figures" opens step 1. `secs`: the DOM ids a
 *  step holds (a jump to one of them opens the step). The address carries the step without its "etp-" (`&step=move`). */
export type EtfStep = { id: string; label: string; badge?: string; secs: string[] };
export const ETF_LABEL: Record<EtfTab, string> = { etfs: "Your ETFs", inside: "What's inside", risk: "Risk analytics" };
export function etfStepsOf(view: EtfTab, o: { wcNew?: number; largest?: boolean; short?: boolean } = {}): EtfStep[] {
  const S = (id: string, label: string, more: string[] = []): EtfStep => ({ id, label, secs: [id, ...more] });
  const short = o.short === false ? [] : [S("etp-short", "In short", ["etp-short-h"])];
  if (view === "etfs") return [S("etp-etfs", "Your ETFs", ["etp-kf-etfs", "etp-sold", "etp-zone"]), { ...S("etp-wc", "What changed", ["wc-h-etf", "what-changed"]), ...(o.wcNew ? { badge: `${o.wcNew} new` } : {}) }, ...short];
  if (view === "inside") return [S("etp-own", "What they own", ["etp-kf-inside"]), S("etp-money", "Money in"), S("etp-secin", "Sectors in each"), S("etp-move", "Move together"),
    S("etp-shared", "Shared stocks"), S("etp-sizes", "Company sizes"), ...(o.largest === false ? [] : [S("etp-largest", "Largest stocks")]), ...short];
  return [S("etp-glance", "At a glance", ["etp-kf-risk"]), S("etp-build", "Beta build", ["etp-read"]), S("etp-n500", "Against the Nifty 500"), S("etp-fall", "If the market fell"),
    S("etp-share", "Risk share"), S("etp-each", "Each ETF"), ...short];
}
/** The step that holds a section id ("etp-kf-risk" → "etp-glance"), or null. */
export const etfStepOf = (steps: EtfStep[], id: string) => steps.find((s) => s.id === id || s.secs.includes(id))?.id ?? null;
/** The step in the address: "all", a step, or the first step (none given, or one this view does not have). A remembered "Key figures" opens step 1. */
export function etfStepFromParam(steps: EtfStep[], p: string | null | undefined): string {
  if (p === "all") return "all";
  const id = p ? (p.startsWith("etp-") ? p : `etp-${p}`) : "";
  return (id && etfStepOf(steps, id)) || steps[0]?.id || "all";
}
export const etfStepParam = (id: string) => (id === "all" ? "all" : id.replace(/^etp-/, ""));
