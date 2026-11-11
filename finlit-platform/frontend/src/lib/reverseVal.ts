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
};
export type SolveMode = "growth" | "margin" | "multiple" | "return";

/** Enterprise value from the projection: the discounted free cash flows to the firm plus the discounted exit value. */
export function enterpriseValue(i: RvInputs): number {
  const N = Math.round(i.years), g = i.g / 100, r = i.r / 100;
  let rev = i.rev0, ev = 0;
  for (let t = 1; t <= N; t++) {
    const prev = rev; rev = i.rev0 * Math.pow(1 + g, t);
    const m = (i.margin0 + (i.marginN - i.margin0) * (t / N)) / 100, ebitda = rev * m;
    const fcff = ebitda - (i.taxPct / 100) * Math.max(0, ebitda - (i.depPct / 100) * rev) - (i.capexPct / 100) * rev - (i.nwcPct / 100) * (rev - prev);
    ev += fcff / Math.pow(1 + r, t);
  }
  return ev + (rev * (i.marginN / 100) * i.exitMultiple) / Math.pow(1 + r, N);
}
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
  const [lo0, hi0, name] = BOUNDS[mode], key = FIELD[mode], target = marketEv(i);
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

export type Miss = { key: string; label: string; change: string; fair: number | null; downside: number | null };
const pct = (a: number, b: number) => (b ? (a / b - 1) * 100 : null);
/** Re-values the company with one assumption set below the bar the price needs (the base is the inputs as given, normally with the solved value in place). */
export function missScenarios(base: RvInputs): Miss[] {
  const price = priceOf(base);
  const mk = (key: string, label: string, change: string, patch: Partial<RvInputs>): Miss => { const fv = fairValue({ ...base, ...patch }); return { key, label, change, fair: Number.isFinite(fv) ? fv : null, downside: Number.isFinite(fv) ? pct(fv, price) : null }; };
  return [
    mk("growth", "Growth miss", `Revenue CAGR ↓ to ${(base.g - 2).toFixed(1)}% (−2.0 pp)`, { g: base.g - 2 }),
    mk("growth5", "Growth miss, larger", `Revenue CAGR ↓ to ${(base.g - 5).toFixed(1)}% (−5.0 pp)`, { g: base.g - 5 }),
    mk("margin", "Margin miss", `Final margin ↓ to ${(base.marginN - 2).toFixed(1)}% (−2.0 pp)`, { marginN: base.marginN - 2 }),
    mk("multiple", "Multiple compression", `Exit multiple ↓ to ${(base.exitMultiple * 0.9).toFixed(1)}x (−10%)`, { exitMultiple: base.exitMultiple * 0.9 }),
    mk("multiple25", "Multiple compression, larger", `Exit multiple ↓ to ${(base.exitMultiple * 0.75).toFixed(1)}x (−25%)`, { exitMultiple: base.exitMultiple * 0.75 }),
    mk("rate", "Rate shock", `Discount rate ↑ to ${(base.r + 2).toFixed(1)}% (+2.0 pp)`, { r: base.r + 2 }),
    mk("combined", "Combined miss", "Growth −2 pp, margin −2 pp and exit multiple −10% together", { g: base.g - 2, marginN: base.marginN - 2, exitMultiple: base.exitMultiple * 0.9 }),
  ];
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
  if (!(i.shares > 0)) out.push({ field: "shares", text: "Shares outstanding are missing." });
  if (!(i.marketCap > 0)) out.push({ field: "marketCap", text: "The market value is missing." });
  return out;
}
