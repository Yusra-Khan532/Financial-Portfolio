// The ETF portfolio's words (task #136, design pack 07): the five tiles and the insight cards under Your ETFs. Figures come from the server
// (/api/me/etf-portfolio, /inside, /risk); this file only puts them into sentences. Describes; never advice. Information only, not investment advice.
import type { Card } from "./pulsePack";
import { dateIN } from "./format";
import type { EtfRisk, EtfRow, EtfPortfolio, Inside } from "./etfPortfolio";

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
const Num = (n: number) => { const w = n < NUM.length ? NUM[n] : String(n); return w.charAt(0).toUpperCase() + w.slice(1); };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const MINUS = "−";
export const pp = (x: number, dp = 2) => `${x < 0 ? MINUS : x > 0 ? "+" : ""}${Math.abs(x).toFixed(dp)}%`;
const dayMonth = (iso: string | null | undefined) => (iso ? dateIN(iso).replace(/\s\d{4}$/, "") : "");

/** One ETF's kind in the ETFs tile: "Indian shares", "shares abroad", "gold", "silver", "liquid", "debt", "blend". */
export function kindOf(e: EtfRow): string {
  if (e.category === "liquid") return "liquid";
  return ({ equity: "Indian shares", international: "shares abroad", gold: "gold", silver: "silver", debt: "debt", hybrid: "blend" } as Record<string, string>)[e.assetClass || ""] ?? "other";
}
/** The asset group used by "N asset types, not one": shares (Indian or abroad), gold, silver, debt / liquid, blend. */
const assetOf = (e: EtfRow) => (["equity", "international"].includes(e.assetClass || "") ? "shares" : e.assetClass || "other");

const live = (d: EtfPortfolio) => d.items.filter((e) => !e.gone);
/** Each ETF's share of the list (0..1): the server's weight. */
const wOf = (e: EtfRow) => (e.weight ?? 0) / 100;

export type Tile = { k: string; v: string; sub: string; tag?: string; to: "etfs" | "inside" | "risk"; cols?: "returns" | "trading" | "risk"; link: string; tone: "info" | "watch" | "good" | "warn" | "mute" };

/** The average expense ratio weighted like the list, over the ETFs with a published one; and how many have none. */
export function yearlyCost(d: EtfPortfolio): { avg: number | null; missing: number } {
  const xs = live(d), with_ = xs.filter((e) => e.ter?.value != null), tw = with_.reduce((a, e) => a + wOf(e), 0);
  return { avg: with_.length && tw > 0 ? with_.reduce((a, e) => a + wOf(e) * (e.ter!.value as number), 0) / tw : null, missing: xs.length - with_.length };
}

export function etfTiles(d: EtfPortfolio, rk: EtfRisk | undefined, rkWhy: string | null): Tile[] {
  const xs = live(d);
  const kinds = new Map<string, number>(); xs.forEach((e) => kinds.set(kindOf(e), (kinds.get(kindOf(e)) ?? 0) + 1));
  const ORDER = ["Indian shares", "shares abroad", "gold", "silver", "blend", "debt", "liquid", "other"];
  const keys = new Set(xs.map((e) => e.tracks.key ?? `one:${e.symbol}`));
  const rep = d.repeats[0];
  const cost = yearlyCost(d);
  const prem = xs.filter((e) => e.premium != null), near = prem.filter((e) => Math.abs(e.premium as number) <= 0.2);
  const far = [...prem].sort((a, b) => Math.abs(b.premium as number) - Math.abs(a.premium as number))[0];
  const pDay = prem.map((e) => e.navDate).filter(Boolean).sort().pop();
  const lv = rk?.list.level;
  return [
    { k: "ETFs", v: String(xs.length), sub: ORDER.filter((k) => kinds.get(k)).map((k) => `${kinds.get(k)} ${k}`).join(" · "), to: "etfs", link: "See your ETFs", tone: "info" },
    { k: "What they track", v: `${keys.size} ${keys.size === 1 ? "index" : "indexes"}`, tag: rep ? `${rep.label} twice` : undefined, to: "inside", link: "See what's inside", tone: "watch",
      sub: rep ? `${list(rep.symbols)} follow the same index` : xs.length > 1 ? "Each ETF follows a different index" : "One ETF so far" },
    { k: "Yearly cost", v: cost.avg == null ? "–" : `${cost.avg.toFixed(2)}% a year`, to: "etfs", cols: "returns", link: "See costs", tone: "good",
      sub: cost.avg == null ? "No expense ratio is published for these ETFs in our sources" : `Average expense ratio. On ₹1 lakh, about ₹${Math.round(cost.avg * 1000).toLocaleString("en-IN")} a year${cost.missing ? ` · ${cost.missing} without a published cost` : ""}` },
    { k: "Price against value", v: !prem.length ? "–" : near.length === prem.length ? "Close to NAV" : near.length * 4 >= prem.length * 3 ? "Close to NAV" : near.length * 2 >= prem.length ? "Partly off NAV" : "Off NAV",
      to: "etfs", cols: "trading", link: "See trading", tone: "info",
      sub: !prem.length ? "No NAV for the day of the last close" : `${near.length} of ${prem.length} closed within 0.2% of their NAV on ${dayMonth(pDay)}` +
        (far && Math.abs(far.premium as number) > 0.2 ? `; ${far.symbol} ${Math.abs(far.premium as number).toFixed(1)}% ${(far.premium as number) > 0 ? "above" : "below"}` : "") },
    { k: "Risk level", v: lv ? lv.word : "–", to: "risk", link: "See risk analytics", tone: !lv ? "mute" : /higher/i.test(lv.word) ? "warn" : "mute",
      sub: lv ? `${lv.word === "About the same" ? "as" : "than"} the Nifty 500${lv.because ? `, ${lv.because}` : ""}` : rk?.list.why ?? rkWhy ?? "Working out the risk figures" },
  ];
}

/** The insight cards under Your ETFs: only those that apply, at most three, in the pack's order. */
export function etfCards(d: EtfPortfolio, rk: EtfRisk | undefined): Card[] {
  const xs = live(d), out: Card[] = [];
  for (const r of d.repeats) {
    const es = xs.filter((e) => r.symbols.includes(e.symbol)), share = Math.round(es.reduce((a, e) => a + (e.weight ?? 0), 0));
    const houses = new Set(es.map((e) => e.fundHouse || ""));
    out.push({ kind: "watch", title: `${Num(es.length)} ETFs follow the ${r.label}`, text: `${list(r.symbols)} follow the same index, so ${share}% of your ETF list sits in one index. ` +
      `${es.length === 2 ? "The second one adds" : "The others add"} no spread; ${houses.size > 1 ? `${es.length === 2 ? "it adds" : "they add"} ${houses.size === 2 ? "a second fund house" : "other fund houses"}.` : "they come from the same fund house."}` });
  }
  const groups = new Set(xs.map(assetOf));
  const shareSwings = (rk?.etfs ?? []).filter((e) => e.swing != null && ["equity", "international"].includes(xs.find((x) => x.symbol === e.symbol)?.assetClass || ""));
  if (groups.size >= 2 && rk?.list.swing != null && shareSwings.length && rk.list.swing < Math.min(...shareSwings.map((e) => e.swing as number))) {
    const words = [...groups].map((g) => ({ shares: "shares", gold: "gold", silver: "silver", debt: xs.some((e) => e.category === "liquid") ? "a liquid ETF" : "debt", hybrid: "a blend" } as Record<string, string>)[g] ?? g);
    out.push({ kind: "good", title: `${Num(groups.size)} asset types, not one`, text: `${list(words).replace(/^./, (c) => c.toUpperCase())} move differently. Over the last three years your list swung less than any one of its share ETFs.` });
  }
  const payout = xs.find((e) => e.category === "liquid" && e.ret1y == null && /pays out/i.test(e.ret1yWhy || ""));
  if (payout) out.push({ kind: "insight", title: "A liquid ETF earns through payouts", text: `${payout.symbol}'s price barely moves; what it earns comes as payouts, so its price return says little.` +
    (payout.ret5y == null && payout.ret5yWhy ? ` Its 5-year return is blank: ${payout.ret5yWhy.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())}.` : "") });
  const big = xs.filter((e) => e.premium != null && Math.abs(e.premium) > 1).sort((a, b) => Math.abs(b.premium as number) - Math.abs(a.premium as number))[0];
  if (big) out.push({ kind: "watch", title: `${big.symbol} closed ${Math.abs(big.premium as number).toFixed(1)}% ${(big.premium as number) > 0 ? "above" : "below"} its NAV`,
    text: `On ${dayMonth(big.navDate)} its last price was ${Math.abs(big.premium as number).toFixed(1)}% ${(big.premium as number) > 0 ? "above" : "below"} the value of what each unit holds. The gap can close or widen from day to day.` });
  for (const r of d.repeats) {
    const es = xs.filter((e) => r.symbols.includes(e.symbol) && e.ter?.value != null).sort((a, b) => (b.ter!.value as number) - (a.ter!.value as number));
    if (es.length >= 2 && (es[0].ter!.value as number) > (es[es.length - 1].ter!.value as number)) {
      out.push({ kind: "insight", title: `${es[0].symbol} costs the most of your ${r.label} ETFs`, text: `${(es[0].ter!.value as number).toFixed(2)}% a year, against ${(es[es.length - 1].ter!.value as number).toFixed(2)}% for ${es[es.length - 1].symbol}, for the same index.` });
      break;
    }
  }
  return out.slice(0, 3);
}

/** "Same index twice": for each pair, the fund house, the cost and how much trades each day of each ETF. */
export function sameIndexText(d: EtfPortfolio, inside: Inside | undefined, traded: (v: number | null | undefined) => string): Card[] {
  const xs = live(d);
  return d.repeats.map((r) => {
    const es = r.symbols.map((s) => xs.find((e) => e.symbol === s)!).filter(Boolean);
    const pair = es.length === 2 ? inside?.overlap.pairs.find((p) => (p.a === es[0].symbol && p.b === es[1].symbol) || (p.a === es[1].symbol && p.b === es[0].symbol)) : undefined;
    const ters = es.map((e) => e.ter?.value), sameTer = ters.every((t) => t != null && t === ters[0]);
    const cost = ters.some((t) => t == null) ? "" : sameTer ? `the cost (${(ters[0] as number).toFixed(2)}% each)` : `the cost (${es.map((e) => `${(e.ter!.value as number).toFixed(2)}%`).join(" against ")})`;
    const parts = [new Set(es.map((e) => e.fundHouse)).size > 1 ? "the fund house" : "", cost, `how much trades each day (${es.map((e) => traded(e.avgTurnover)).join(" against ")})`].filter(Boolean);
    return { kind: "watch" as const, title: pair ? `${list(r.symbols)}: ${Math.round(pair.pct)}% the same companies` : `${list(r.symbols)} follow the ${r.label}`,
      text: `${es.length === 2 ? "Both" : "All"} follow the ${r.label}. The only differences are ${list(parts)}.` };
  });
}

/** Task #223 (dashboard pack of 18 Nov, D2): "Your ETFs at a glance" on the dashboard, from the ETF portfolio's own figures. Every figure is the one the
 *  ETF page's tiles and Risk view show (etfTiles and /risk); nothing new is worked out here. Mix shares follow the page's weights (equal until quantities
 *  are in, then by value). */
export type GlanceMix = { key: string; n: number; share: number };
export type EtfGlance = {
  n: number; asOf: string | null; mix: GlanceMix[]; level: { word: string; rest: string; higher: boolean } | null; levelWhy: string | null;
  cost: string | null; nav: string | null; swing: string | null; indexes: string;
};
export const MIX_ORDER = ["Indian shares", "shares abroad", "gold", "silver", "blend", "debt", "liquid", "other"];
export function etfGlance(d: EtfPortfolio, rk: EtfRisk | undefined, rkWhy: string | null): EtfGlance {
  const xs = live(d), tiles = etfTiles(d, rk, rkWhy), t = (k: string) => tiles.find((x) => x.k === k)!;
  const n = xs.length, eq = n ? 1 / n : 0;
  const mix = MIX_ORDER.map((key) => {
    const es = xs.filter((e) => kindOf(e) === key);
    const w = d.basis === "value" ? es.reduce((a, e) => a + wOf(e), 0) : es.length * eq;
    return { key, n: es.length, share: Math.round(w * 1000) / 10 };
  }).filter((m) => m.n > 0);
  const lv = rk?.list.level;
  const cost = yearlyCost(d), nav = t("Price against value"), swing = rk?.list.swing, bench = rk?.bench.swing;
  const pc = (x: number) => `${x < 0 ? MINUS : ""}${Math.abs(x).toFixed(1)}%`;
  const priced = xs.map((e) => e.priceDate).filter(Boolean).sort().pop() ?? d.asOf ?? null;
  return {
    n, asOf: priced ? dayMonth(priced) : null, mix,
    level: lv ? { word: lv.word, rest: `${lv.word === "About the same" ? "as" : "than"} the Nifty 500${lv.because ? `, ${lv.because}` : ""}`, higher: /higher/i.test(lv.word) } : null,
    levelWhy: lv ? null : rk?.list.why ?? rkWhy ?? null,
    cost: cost.avg == null ? null : `${cost.avg.toFixed(2)}% a year · about ₹${Math.round(cost.avg * 1000).toLocaleString("en-IN")} on ₹1 lakh`,
    nav: nav.v === "–" ? null : `${nav.v} · ${nav.sub.replace(/ of their NAV on [^;]*/, "").replace(/;.*$/, "")}`,
    swing: swing == null ? null : `${pc(swing)}${bench != null ? ` · Nifty 500 ${pc(bench)}` : ""}`,
    indexes: t("What they track").v,
  };
}
