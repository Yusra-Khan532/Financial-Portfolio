// Task #183 part 2 (MF portfolio, pack 02 "Changes of 15 Nov (afternoon)"): the top of the page (the dark "Your MF list" box and one tile per tab, the whole
// tile opens its tab), each tab's Key figures (three cards) and the sections in the pack's order. Every figure is the server's (/api/me/mf-portfolio,
// /diversification, /risk); this file only counts and words them. Words describe; never advice.
import type { KeyCard } from "./equityTop";
import { typeOf, type Holding, type MfSpread } from "./mfPortfolio";
import { shortFund, type MfRisk } from "./mfPack";
import type { Sec } from "../portfolio/pack/PageTop";

export type MfTab = "funds" | "mix" | "risk";
export type MfTile = { id: MfTab; k: string; v: string; sub: string; link: string; tone: "good" | "info" | "watch"; help: string; how: string };

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const num = (n: number) => (n < NUM.length ? NUM[n] : String(n));
const pct = (x: number) => `${Math.round(x)}%`;
const b2 = (x: number | null | undefined) => (x == null ? "–" : x.toFixed(2));
const ORDER = ["strong", "healthy", "average", "weak", "poor"];
const PARTS: [keyof NonNullable<Holding["score"]["parts"]>, string][] = [["performance", "Performance"], ["risk", "Risk"], ["cost", "Cost"], ["quality", "Quality"]];

/** The type the list box counts: "2 thematic · 1 small cap · 1 multi asset · 1 liquid". */
export const fundKind = (h: Holding) => {
  const c = (h.categoryLabel || "Other").toLowerCase();
  return /sectoral|thematic/.test(c) ? "thematic" : /multi asset/.test(c) ? "multi asset" : c;
};
export const isLiquid = (h: Holding) => /liquid|overnight|money market/i.test(h.categoryLabel || "");

export function listBox(hs: Holding[], sp: MfSpread | undefined) {
  const kinds = new Map<string, number>(); hs.forEach((h) => kinds.set(fundKind(h), (kinds.get(fundKind(h)) ?? 0) + 1));
  const grp = (k: string) => { const h = hs.find((x) => fundKind(x) === k); const t = typeOf(h?.category ?? null); return ["Equity", "Hybrid", "Debt"].indexOf(t) < 0 ? 3 : ["Equity", "Hybrid", "Debt"].indexOf(t); };
  const parts = [...kinds].sort((a, b) => b[1] - a[1] || grp(a[0]) - grp(b[0]) || a[0].localeCompare(b[0])).map(([k, n]) => `${n} ${k}`).join(" · ");
  const stocks = sp?.readings.underneath.stocks;
  const valued = hs.length > 0 && hs.every((h) => h.current != null && h.current > 0);
  return { n: hs.length, line: `${parts}${stocks ? `, with ${stocks} stocks inside them` : ""}.`, weights: valued ? "Each fund counts by the value of your units." : "Every fund counts the same until you add units.", valued };
}

export function mfTiles(hs: Holding[], sp: MfSpread | undefined, rk: MfRisk | undefined): MfTile[] {
  const scored = hs.filter((h) => h.score.final != null);
  const avg = scored.length ? Math.round(scored.reduce((a, h) => a + (h.score.final as number), 0) / scored.length) : null;
  const words = new Map<string, number>(); scored.forEach((h) => { const w = (h.score.label || "").toLowerCase(); if (w) words.set(w, (words.get(w) ?? 0) + 1); });
  const t = sp?.readings.together, top = sp?.readings.overlap.top, own = rk?.own?.list;
  const word = !own?.betaOwn ? null : own.betaOwn < 0.9 ? "Lower" : own.betaOwn > 1.1 ? "Higher" : "In line";
  return [
    { id: "funds", k: "Your funds", v: avg == null ? "Not scored yet" : `Average health · ${avg}`, tone: "good", link: "Open Your funds",
      sub: avg == null ? "None of your funds has a Health Score yet" : `${ORDER.filter((w) => words.get(w)).map((w) => `${words.get(w)} ${w}`).join(" · ")}${hs.length - scored.length ? ` · ${hs.length - scored.length} not scored` : ""}, by Fund Health Score`,
      help: "The average Fund Health Score of your funds, from 0 to 100, and how many read Strong, Healthy, Average, Weak or Poor.", how: "Higher reads healthier. Each fund's own score and its four parts are in the Your funds tab." },
    { id: "mix", k: "Mix & overlap", v: t && t.of ? `Moves like ${t.independent.toFixed(1)} of ${t.of}` : "–", tone: "info", link: "Open Mix & overlap",
      // task #389 (file 32, Mix 10, W16, fault 11): "the most two share is 61%" → "Equity-type funds move almost as one; the closest pair shares 61%"
      sub: t && t.of ? `Equity-type funds ${t.word === "Move as one" ? "move almost as one" : t.word === "Move partly together" ? "move partly together" : "move on their own"}${top ? `; the closest pair shares ${pct(top.pct)}` : ""}` : "Needs two or more equity-type funds with a year of NAVs",
      help: "How many truly separate funds your equity-type funds behave like, from their weekly NAV changes over the past year, and how much of their money the closest pair keeps in the same stocks.",
      how: "Moves like 1.3 of 4: the four rise and fall almost as one. Closer to the count of funds: they move more on their own." },
    { id: "risk", k: "Risk analytics", v: own?.betaOwn != null ? `${word} · β ${b2(own.betaOwn)}` : "–", tone: "watch", link: "Open Risk analytics",
      sub: own?.betaOwn != null ? `Each fund against its own benchmark; swings ${rk?.list.swing != null ? `${rk.list.swing.toFixed(1)}% a year vs ${rk.bench.swing?.toFixed(1)}%` : "–"}` : rk?.list.why ?? "Working out the risk figures",
      help: "The list's beta with each fund against its own category's benchmark (past year of weekly NAVs), and how much it swings in a typical year against the Nifty 500 (3 years).",
      how: "A beta below 1 has moved less than its markets, above 1 more. The swing sits beside the Nifty 500's." },
  ];
}

// ------------------------------------------------------------------------------------------------ Key figures, one row per tab
export function fundsCards(hs: Holding[], sp: MfSpread | undefined): KeyCard[] {
  const out: KeyCard[] = [];
  const th = sp?.readings.theme;
  if (th && th.theme && th.funds.length > 1) {
    const nm = new Map((sp?.funds ?? []).map((f) => [f.code, shortFund(f.name)]));
    out.push({ tone: "watch", k: "One theme twice", v: `${th.theme} × ${th.funds.length}`, text: `${th.funds.map((c) => nm.get(c)).filter(Boolean).join(" and ")} follow the same theme from ${new Set((sp?.funds ?? []).filter((f) => th.funds.includes(f.code)).map((f) => f.amc)).size === 1 ? "one fund house" : "two fund houses"}.`, go: "See how they move", to: "mfp-move" });
  }
  let low: { h: Holding; part: string; v: number } | null = null;
  for (const h of hs) for (const [k, w] of PARTS) { const v = h.score.parts?.[k]; if (v != null && (!low || v < low.v)) low = { h, part: w, v }; }
  if (low) out.push({ tone: "warn", k: "Weakest health part", v: `${low.part} ${Math.round(low.v)}`, text: `${shortFund(low.h.name)}'s ${low.part.toLowerCase()} part is the lowest in the list.`, go: `Show ${(low.h.score.label || "its").toString()} funds`, to: "mfp-funds" });
  const liq = hs.filter(isLiquid), valued = hs.every((h) => h.current != null && h.current > 0);
  if (liq.length && !valued) out.push({ tone: "info", k: "Liquid counts as a fund", v: pct((liq.length / hs.length) * 100), text: `Until units are added, the liquid ${liq.length === 1 ? "fund weighs" : "funds weigh"} as much as each equity fund.`, go: "Add units", to: "mfp-units" });
  return out;
}

export function mixCards(sp: MfSpread | undefined): KeyCard[] {
  if (!sp || !sp.count) return [];
  const r = sp.readings, out: KeyCard[] = [];
  if (r.together.of) out.push({ tone: r.together.word === "Move as one" ? "warn" : "info", k: r.together.word === "Move as one" ? "Move almost as one" : r.together.word === "Move partly together" ? "Move partly together" : "Move on their own",
    v: `${r.together.independent.toFixed(1)} of ${r.together.of}`, text: `${num(r.together.of).replace(/^./, (c) => c.toUpperCase())} equity-type funds with different labels behave like ${r.together.independent.toFixed(1)} independent funds.`, go: "See how they move", to: "mfp-move" });
  if (r.overlap.top) out.push({ tone: r.overlap.word === "Low" ? "good" : "watch", k: r.overlap.word === "Low" ? "Little overlap in stocks" : r.overlap.word === "Moderate" ? "Some overlap in stocks" : "Much overlap in stocks",
    v: `${pct(r.overlap.top.pct)} at most`, text: `The closest pair of funds keeps ${pct(r.overlap.top.pct)} of its money in the same stocks.`, go: "See shared stocks", to: "mfp-shared" });
  // task #262: "below ₹10,000 Cr" was the old Small; it is the Micro size now, so the figure reads Micro and keeps its meaning
  const small = (sp.size.Micro ?? 0) * 100;
  out.push({ tone: "info", k: "Stocks underneath", v: String(r.underneath.stocks), text: `${r.underneath.inTwoOrMore} are held through two or more funds; ${pct(small)} of the shares sit in companies below ₹10,000 Cr.`, go: "See the biggest", to: "mfp-biggest" });
  return out;
}

export function riskCards(rk: MfRisk | undefined): KeyCard[] {
  const own = rk?.own?.list;
  if (!rk || !own) return [];
  const out: KeyCard[] = [];
  if (own.betaOwn != null) out.push({ tone: own.betaOwn <= 1 ? "good" : "watch", k: own.betaOwn < 0.9 ? "Moves less than its markets" : own.betaOwn > 1.1 ? "Moves more than its markets" : "Moves with its markets", v: `β ${b2(own.betaOwn)}`,
    text: `Each fund against its own benchmark, the list has moved ${b2(own.betaOwn)}% for each 1%.`, go: "See how it is built", to: "mfp-build" });
  const most = [...rk.funds].filter((f) => f.riskShare != null && f.listShare != null).sort((a, b) => (b.riskShare as number) - (b.listShare as number) - ((a.riskShare as number) - (a.listShare as number)))[0];
  if (most) out.push({ tone: "warn", k: "Most risk for its size", v: `${most.short} ${pct(most.riskShare as number)}`, text: `${pct(most.listShare as number)} of the list, ${pct(most.riskShare as number)} of its ups and downs.`, go: "See the risk split", to: "mfp-share" });
  const hi = [...rk.funds].filter((f) => f.betaOwn != null && f.compared).sort((a, b) => (b.betaOwn as number) - (a.betaOwn as number))[0];
  if (hi) out.push({ tone: "info", k: "Highest beta", v: b2(hi.betaOwn), text: `${hi.short} against ${hi.benchKind === "blend" ? `its ${hi.benchmark} blend` : `the ${hi.benchmark}`}.`, go: "See each fund", to: "mfp-each" });
  return out;
}

/** The sections of each tab, in the pack's order (the sections bar, and "All sections" lists every one of the three tabs). */
export const MF_SECS: Record<MfTab, { label: string; secs: Sec[] }> = {
  funds: { label: "Your funds", secs: [["mfp-funds", "Your funds"], ["mfp-kf-funds", "Key figures"]] },
  mix: { label: "Mix & overlap", secs: [["mfp-own", "What they own"], ["mfp-kf-mix", "Key figures"], ["mfp-spread", "Spread"], ["mfp-money", "Money in"], ["mfp-secin", "Sectors inside"], ["mfp-move", "Move together"],
    ["mfp-shared", "Shared stocks"], ["mfp-sizes", "Company sizes"], ["mfp-biggest", "Biggest stocks"], ["mfp-trend", "Trend"]] },
  risk: { label: "Risk analytics", secs: [["mfp-glance", "At a glance"], ["mfp-kf-risk", "Key figures"], ["mfp-build", "Beta build"], ["mfp-ownb", "Own benchmark"], ["mfp-share", "Risk share"], ["mfp-fall", "If the Nifty 500 fell"], ["mfp-each", "Each fund"]] },
};
