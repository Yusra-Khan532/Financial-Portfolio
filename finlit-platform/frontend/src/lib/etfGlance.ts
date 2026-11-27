// Task #223 (dashboard pack of 18 Nov, D2): "Your ETFs at a glance" on the dashboard, from the ETF portfolio's own figures. It is built on the ETF page's own
// helpers (lib/etfTop.ts: the types, the yearly cost, the price against NAV) and the /risk answer, so every figure is the one the ETF page shows; nothing new
// is worked out here. Mix shares follow the page: by value once every ETF has a quantity, else each ETF the same. Describes; never advice.
import type { EtfPortfolio, EtfRisk } from "./etfPortfolio";
import { byType, live, yearlyCost } from "./etfTop";
import { dateIN } from "./format";

const MINUS = "−";
const WORD: Record<string, string> = { indian: "Indian shares", abroad: "shares abroad", gold: "gold", silver: "silver", debt: "debt", liquid: "liquid" };
export type GlanceMix = { key: string; word: string; n: number; share: number };
export type EtfGlance = {
  n: number; asOf: string | null; mix: GlanceMix[]; level: { word: string; rest: string; higher: boolean } | null; levelWhy: string | null;
  cost: string | null; nav: string | null; swing: string | null; indexes: string;
};
export function etfGlance(d: EtfPortfolio, rk: EtfRisk | undefined, rkWhy: string | null): EtfGlance {
  const xs = live(d), n = xs.length;
  const mix = byType(d).map((g) => ({ key: g.key, word: WORD[g.key] ?? g.word.toLowerCase(), n: g.n, share: Math.round((d.basis === "value" ? g.share : (g.n / Math.max(1, n)) * 100) * 10) / 10 }));
  const cost = yearlyCost(d);
  const prem = xs.filter((e) => e.premium != null), near = prem.filter((e) => Math.abs(e.premium as number) <= 0.2).length;
  const navWord = !prem.length ? null : near === prem.length || near * 4 >= prem.length * 3 ? "Close to NAV" : near * 2 >= prem.length ? "Partly off NAV" : "Off NAV";
  const idx = new Set(xs.map((e) => e.tracks.key ?? e.symbol)).size;
  const lv = rk?.list.level, swing = rk?.list.swing, bench = rk?.bench.swing;
  const pc = (x: number) => `${x < 0 ? MINUS : ""}${Math.abs(x).toFixed(1)}%`;
  const priced = xs.map((e) => e.priceDate).filter(Boolean).sort().pop() ?? d.asOf ?? null;
  return {
    n, asOf: priced ? dateIN(priced).replace(/\s\d{4}$/, "") : null, mix,
    level: lv ? { word: lv.word, rest: `${lv.word === "About the same" ? "as" : "than"} the Nifty 500${lv.because ? `, ${lv.because}` : ""}`, higher: /higher/i.test(lv.word) } : null,
    levelWhy: lv ? null : rk?.list.why ?? rkWhy ?? null,
    cost: cost.avg == null ? null : `${cost.avg.toFixed(2)}% a year · about ₹${Math.round(cost.avg * 1000).toLocaleString("en-IN")} on ₹1 lakh`,
    nav: navWord ? `${navWord} · ${near} of ${prem.length} closed within 0.2%` : null,
    swing: swing == null ? null : `${pc(swing)}${bench != null ? ` · Nifty 500 ${pc(bench)}` : ""}`,
    indexes: `${idx} ${idx === 1 ? "index" : "indexes"}`,
  };
}
