// Reverse valuation (task #69, from the "Reverse-Valuation Tool: Implementation & Improvement Plan"): given today's price, solve for the revenue growth, final EBITDA margin,
// exit multiple or discount rate (implied return) the company must deliver for that price to be justified. A pure function of its inputs: no side effects, no network,
// so the same code runs for the live fields, the miss scenarios and the grid. It describes what the price assumes; it predicts nothing and gives no rating.

export type RvInputs = {
  rev0: number;          // last full-year revenue, ₹ crore
  margin0: number;       // EBITDA margin today, % of revenue
  marginN: number;       // EBITDA margin in the final forecast year, % (moves in a straight line from margin0)
  g: number;             // revenue CAGR over the forecast window, % a year
  exitMultiple: number;  // EV / EBITDA applied in the final year
  r: number;             // discount rate, % a year
  years: number;         // forecast window: 5 or 10
  taxPct: number;        // cash tax rate on operating profit, %
  depPct: number;        // depreciation, % of revenue
  capexPct: number;      // capital expenditure, % of revenue
  nwcPct: number;        // working capital tied up per rupee of extra revenue, %
  netDebt: number;       // ₹ crore, negative for net cash
  marketCap: number;     // ₹ crore
  shares: number;        // crore
  terminal?: "multiple" | "perpetuity";   // how the value after the last forecast year is set: the exit multiple (default) or growth in perpetuity
  termG?: number;        // long-run growth in perpetuity, % a year (default 5), used for the perpetuity terminal and as the level growth fades towards
  growthPath?: "steady" | "fade";         // steady: the same growth every year (default); fade: growth starts higher and fades in a straight line to termG, with the same average
  marginPath?: "straight" | "scurve";     // straight: the margin moves in a straight line (default); scurve: slowly, then quickly, then slowly
};
export type SolveMode = "growth" | "margin" | "multiple" | "return";

const growthAt = (i: RvInputs, t: number, N: number): number => {
  if (i.growthPath !== "fade" || N < 2) return i.g / 100;
  const lr = (i.termG ?? 5) / 100, start = Math.max(lr, 2 * (i.g / 100) - lr);        // a straight fade from `start` to the long-run rate has the average growth the user set
  return start + (lr - start) * ((t - 1) / (N - 1));
};
const marginAt = (i: RvInputs, t: number, N: number): number => {
  const x = t / N, w = i.marginPath === "scurve" ? x * x * (3 - 2 * x) : x;
  return (i.margin0 + (i.marginN - i.margin0) * w) / 100;
};
/** The two parts of the enterprise value: the discounted free cash flows of the forecast years, and the discounted value after the last one. */
export function valueParts(i: RvInputs): { cash: number; terminal: number } {
  const N = Math.round(i.years), r = i.r / 100;
  let rev = i.rev0, cash = 0, lastFcff = 0;
  for (let t = 1; t <= N; t++) {
    const prev = rev; rev = prev * (1 + growthAt(i, t, N));
    const m = marginAt(i, t, N), ebitda = rev * m;
    const fcff = ebitda - (i.taxPct / 100) * Math.max(0, ebitda - (i.depPct / 100) * rev) - (i.capexPct / 100) * rev - (i.nwcPct / 100) * (rev - prev);
    cash += fcff / Math.pow(1 + r, t); lastFcff = fcff;
  }
  const disc = Math.pow(1 + r, N);
  if (i.terminal === "perpetuity") {
    const tg = (i.termG ?? 5) / 100;
    return { cash, terminal: r > tg ? (lastFcff * (1 + tg)) / (r - tg) / disc : NaN };
  }
  return { cash, terminal: (rev * (i.marginN / 100) * i.exitMultiple) / disc };
}
/** Enterprise value from the projection: the discounted free cash flows to the firm plus the discounted value after the last year. */
export function enterpriseValue(i: RvInputs): number { const p = valueParts(i); return p.cash + p.terminal; }
/** How much of the value sits after the forecast window (a share, 0 to 1): the figure a user should read before trusting any single answer. */
export const terminalShare = (i: RvInputs): number | null => { const p = valueParts(i), t = p.cash + p.terminal; return Number.isFinite(t) && t > 0 ? p.terminal / t : null; };
export const marketEv = (i: RvInputs) => i.marketCap + i.netDebt;
/** Value of one share (₹) the projection gives. */
export const fairValue = (i: RvInputs) => (enterpriseValue(i) - i.netDebt) / i.shares;
export const priceOf = (i: RvInputs) => i.marketCap / i.shares;

export type Solved = { value: number | null; why: string | null };
const BOUNDS: Record<SolveMode, [number, number, string]> = {
  growth: [-30, 80, "revenue growth"], margin: [0.5, 80, "final EBITDA margin"], multiple: [0.5, 120, "exit multiple"], return: [0, 60, "return"],
};
const FIELD: Record<SolveMode, keyof RvInputs> = { growth: "g", margin: "marginN", multiple: "exitMultiple", return: "r" };

/** Finds the one value of the unknown that makes the projected value equal the market's: bracketed bisection. If the price cannot be reached inside sensible bounds it says so. */
export function solve(i: RvInputs, mode: SolveMode): Solved {
  const [lo00, hi0, name] = BOUNDS[mode], key = FIELD[mode], target = marketEv(i);
  const lo0 = mode === "return" && i.terminal === "perpetuity" ? Math.max(lo00, (i.termG ?? 5) + 0.1) : lo00;      // a perpetuity needs a discount rate above long-run growth
  if (!(target > 0) || !(i.rev0 > 0) || !(i.shares > 0)) return { value: null, why: "The price, market value or revenue is missing, so nothing can be solved." };
  const f = (x: number) => enterpriseValue({ ...i, [key]: x }) - target;
  let lo = lo0, hi = hi0, flo = f(lo), fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return { value: null, why: "The inputs give no usable value." };
  if (flo === 0) return { value: lo, why: null };
  if (fhi === 0) return { value: hi, why: null };
  if (flo * fhi > 0) {
    const above = mode === "return" ? flo < 0 : flo > 0;   // the projection already exceeds the price even at the low end (or, for the return, below it at the low rate)
    return { value: null, why: mode === "return" ? `No return between ${lo0}% and ${hi0}% matches this price with these assumptions.` : `No ${name} between ${lo0} and ${hi0}${mode === "multiple" ? "x" : "%"} justifies this price with the other inputs held fixed (${above ? "even the lowest value already gives more than the price" : "even the highest value falls short of the price"}).` };
  }
  for (let k = 0; k < 90; k++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (Math.abs(fm) < target * 1e-9) { lo = hi = mid; break; }
    if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
  }
  return { value: (lo + hi) / 2, why: null };
}

export type Miss = { key: string; label: string; change: string; fair: number | null; downside: number | null; irr: number | null; group: "miss" | "upside" | "yours"; recover?: number | null };
const pct = (a: number, b: number) => (b ? (a / b - 1) * 100 : null);
const fmt = (n: number) => n.toFixed(1);
/** The implied annual return if a scenario's assumptions come true and the price stays where it is today. */
export const impliedReturn = (i: RvInputs): number | null => solve(i, "return").value;
export type Patch = { dg?: number; dm?: number; mult?: number; dr?: number };
const apply = (b: RvInputs, p: Patch): RvInputs => ({ ...b, g: b.g + (p.dg ?? 0), marginN: b.marginN + (p.dm ?? 0), exitMultiple: b.exitMultiple * (1 + (p.mult ?? 0)), r: b.r + (p.dr ?? 0) });
/** Re-values the company with the given assumptions changed from the base (normally the inputs with the solved value in place): the value per share, the gap to today's price and the return. */
export function scenario(base: RvInputs, key: string, label: string, group: Miss["group"], p: Patch, change?: string): Miss {
  const price = priceOf(base), x = apply(base, p), fv = fairValue(x), ok = Number.isFinite(fv);
  const parts = [p.dg ? `Revenue CAGR ${p.dg < 0 ? "↓" : "↑"} to ${fmt(x.g)}% (${p.dg > 0 ? "+" : "−"}${fmt(Math.abs(p.dg))} pp)` : "", p.dm ? `Margin ${p.dm < 0 ? "↓" : "↑"} to ${fmt(x.marginN)}% (${p.dm > 0 ? "+" : "−"}${fmt(Math.abs(p.dm))} pp)` : "",
    p.mult ? `Exit multiple ${p.mult < 0 ? "↓" : "↑"} to ${fmt(x.exitMultiple)}x (${p.mult > 0 ? "+" : "−"}${Math.abs(Math.round(p.mult * 100))}%)` : "", p.dr ? `Discount rate ${p.dr < 0 ? "↓" : "↑"} to ${fmt(x.r)}% (${p.dr > 0 ? "+" : "−"}${fmt(Math.abs(p.dr))} pp)` : ""].filter(Boolean);
  const down = ok ? pct(fv, price) : null;
  return { key, label, change: change ?? parts.join(", "), fair: ok ? fv : null, downside: down, irr: ok ? impliedReturn(x) : null, group,
    recover: group === "miss" && ok && fv > 0 && fv < price ? Math.log(price / fv) / Math.log(1 + base.r / 100) : null };
}
/** The scenarios of the plan: growth misses of 2, 5 and 8 points, margin misses of 2, 4 and 6, exit multiple compression of 10, 25 and 40%, rate shocks of 1 and 2 points, a combined miss,
 *  and the same shocks the other way. Starting sizes: they should be scaled to each company's own volatility when that data is wired in. */
export function missScenarios(base: RvInputs): Miss[] {
  const m = (k: string, l: string, p: Patch) => scenario(base, k, l, "miss", p);
  return [
    m("growth2", "Growth miss", { dg: -2 }), m("growth5", "Growth miss, larger", { dg: -5 }), m("growth8", "Growth miss, severe", { dg: -8 }),
    m("margin2", "Margin miss", { dm: -2 }), m("margin4", "Margin miss, larger", { dm: -4 }), m("margin6", "Margin miss, severe", { dm: -6 }),
    m("multiple10", "Multiple compression", { mult: -0.1 }), m("multiple25", "Multiple compression, larger", { mult: -0.25 }), m("multiple40", "Multiple compression, severe", { mult: -0.4 }),
    m("rate1", "Rate shock", { dr: 1 }), m("rate2", "Rate shock, larger", { dr: 2 }),
    m("combined", "Combined miss", { dg: -2, dm: -2, mult: -0.1 }), m("severe", "Combined miss, severe", { dg: -5, dm: -4, mult: -0.25 }),
  ];
}
export function upsideScenarios(base: RvInputs): Miss[] {
  const u = (k: string, l: string, p: Patch) => scenario(base, k, l, "upside", p);
  return [u("ug2", "Growth beat", { dg: 2 }), u("ug5", "Growth beat, larger", { dg: 5 }), u("um2", "Margin beat", { dm: 2 }), u("um4", "Margin beat, larger", { dm: 4 }),
    u("ux10", "Multiple expansion", { mult: 0.1 }), u("ux25", "Multiple expansion, larger", { mult: 0.25 }), u("rate", "Rate relief", { dr: -1 }), u("ucomb", "Combined beat", { dg: 2, dm: 2, mult: 0.1 })];
}
/** A tornado ranking: the single-assumption shocks ordered by how far they move the value per share, so the user sees which assumption the price depends on most. */
export const tornado = (m: Miss[]): Miss[] => m.filter((x) => ["growth5", "margin4", "multiple25", "rate2"].includes(x.key) && x.downside != null).sort((a, b) => Math.abs(b.downside as number) - Math.abs(a.downside as number));
/** An expected value from weights the user sets (base, miss, severe miss; they should add to 100). The weights are the user's judgment and are labelled that way on the page. */
export function expectedValue(base: RvInputs, w: { base: number; miss: number; severe: number }): { value: number | null; pct: number | null } {
  const tot = w.base + w.miss + w.severe;
  if (!(tot > 0)) return { value: null, pct: null };
  const v = (fairValue(base) * w.base + fairValue(apply(base, { dg: -2, dm: -2, mult: -0.1 })) * w.miss + fairValue(apply(base, { dg: -5, dm: -4, mult: -0.25 })) * w.severe) / tot;
  return Number.isFinite(v) ? { value: v, pct: pct(v, priceOf(base)) } : { value: null, pct: null };
}

/** Two-way grid: the value per share for revenue growth (rows) against the final EBITDA margin (columns). */
export function growthMarginGrid(base: RvInputs, gs: number[], ms: number[]): (number | null)[][] {
  return gs.map((g) => ms.map((m) => { const v = fairValue({ ...base, g, marginN: m }); return Number.isFinite(v) ? v : null; }));
}
export const around = (centre: number, step: number, each = 2): number[] => Array.from({ length: each * 2 + 1 }, (_, k) => Math.round((centre + (k - each) * step) * 100) / 100);

export type Validation = { field: keyof RvInputs | "model"; text: string };
export function validateInputs(i: RvInputs): Validation[] {
  const out: Validation[] = [];
  if (!(i.rev0 > 0)) out.push({ field: "rev0", text: "Revenue must be above zero." });
  if (!(i.marginN > 0 && i.marginN <= 100)) out.push({ field: "marginN", text: "The EBITDA margin must be above 0% and at most 100%." });
  if (!(i.margin0 > -100 && i.margin0 <= 100)) out.push({ field: "margin0", text: "Today's margin must be between −100% and 100%." });
  if (!(i.exitMultiple > 0)) out.push({ field: "exitMultiple", text: "The exit multiple must be above zero." });
  if (!(i.r > 0 && i.r < 100)) out.push({ field: "r", text: "The discount rate must be between 0% and 100%." });
  if (!(i.years === 5 || i.years === 10)) out.push({ field: "years", text: "Choose a 5 or 10 year window." });
  if (i.terminal === "perpetuity" && !(i.r > (i.termG ?? 5))) out.push({ field: "r", text: "With a perpetuity, the discount rate must be above the long-run growth rate." });
  if (!(i.shares > 0)) out.push({ field: "shares", text: "Shares outstanding are missing." });
  if (!(i.marketCap > 0)) out.push({ field: "marketCap", text: "The market value is missing." });
  return out;
}
