// F&O Academy (Learn): profit and loss at expiry of an option structure, from its legs. Pure arithmetic, used by the payoff diagram
// (components/academy/PayoffWidget.tsx) and checked in payoff.test.ts. Every structure is described, never suggested: the names are the
// textbook names of the shapes, and each preset says what it does at expiry, with its own costs and risks.
//
// A leg is one position: a call or a put (long = the buyer, who paid the premium; short = the writer, who received it), or the shares
// themselves (long = owning them from `strike`, the price paid). Per unit at an expiry price P:
//   call  side × (max(P − K, 0) − premium)      put  side × (max(K − P, 0) − premium)      shares  side × (P − K)
// and the structure's P&L is the sum over legs × lots × lot size. Costs and taxes (module 8) are not included.

export type LegKind = "call" | "put" | "shares";
export type Leg = { kind: LegKind; side: 1 | -1; strike: number; premium: number; lots: number };
export type StructureId = "long-call" | "long-put" | "covered-call" | "protective-put" | "call-spread" | "put-spread" | "straddle" | "strangle" | "iron-condor";

/** P&L of one leg per unit at expiry price `p`. */
export function legValue(l: Leg, p: number): number {
  if (l.kind === "call") return l.side * (Math.max(p - l.strike, 0) - l.premium);
  if (l.kind === "put") return l.side * (Math.max(l.strike - p, 0) - l.premium);
  return l.side * (p - l.strike);
}

/** P&L in ₹ of the whole structure at expiry price `p`. */
export const payoffAt = (legs: Leg[], p: number, lotSize: number) => legs.reduce((s, l) => s + legValue(l, p) * l.lots * lotSize, 0);

/** Change in P&L per ₹1 rise in the price above every strike (the slope to the right), in ₹. */
const slopeRight = (legs: Leg[], lotSize: number) => legs.reduce((s, l) => s + (l.kind === "put" ? 0 : l.side) * l.lots * lotSize, 0);

export type Analysis = {
  /** the prices where the slope changes (the strikes), sorted */ kinks: number[];
  /** prices where the P&L crosses zero, rounded to paise */ breakevens: number[];
  /** the largest profit in ₹ and where it happens; `unlimited` when it keeps growing as the price rises */ maxProfit: { value: number; at: string; unlimited: boolean };
  maxLoss: { value: number; at: string; unlimited: boolean };
  /** the net premium: positive = paid (a debit), negative = received (a credit), per unit */ netPremium: number;
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const fmt = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Breakevens, largest profit and largest loss at expiry. The P&L is a straight line between strikes, so it is enough to read it at
 *  price 0, at each strike and on the far side of the highest strike. */
export function analyse(legs: Leg[], lotSize: number): Analysis {
  const kinks = [...new Set(legs.filter((l) => l.kind !== "shares").map((l) => l.strike))].sort((a, b) => a - b);
  const pts = [0, ...kinks.filter((k) => k > 0)];
  const vals = pts.map((p) => payoffAt(legs, p, lotSize));
  const right = slopeRight(legs, lotSize);
  const breakevens: number[] = [];
  const add = (x: number) => { const v = r2(x); if (v >= 0 && !breakevens.some((b) => Math.abs(b - v) < 0.005)) breakevens.push(v); };
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b, va, vb] = [pts[i], pts[i + 1], vals[i], vals[i + 1]];
    if (va === 0 && vb === 0) continue;                       // flat at zero: no single breakeven
    if (va === 0) { if (i > 0 || pts.length === 1) add(a); continue; }
    if (va * vb < 0) add(a + ((b - a) * -va) / (vb - va));
    else if (vb === 0) add(b);
  }
  const last = pts[pts.length - 1], vl = vals[vals.length - 1];
  if (right !== 0 && vl * right < 0) add(last - vl / right);
  if (pts.length === 1 && vl === 0) add(0);
  breakevens.sort((a, b) => a - b);
  /** Where an extreme value is reached, in words: runs of neighbouring prices with the same value become a range. */
  const where = (v: number) => {
    const runs: [number, number][] = [];
    vals.forEach((x, k) => { if (Math.abs(x - v) >= 0.005) return; const r = runs[runs.length - 1]; if (r && r[1] === k - 1) r[1] = k; else runs.push([k, k]); });
    return runs.map(([a, b]) => {
      const lastFlat = b === pts.length - 1 && right === 0;
      if (a === 0 && lastFlat) return "at every price";
      if (a === 0) return b === 0 ? "if the price fell to 0" : `at ${fmt(pts[b])} and below`;
      if (lastFlat) return `at ${fmt(pts[a])} and above`;
      return a === b ? `at ${fmt(pts[a])}` : `from ${fmt(pts[a])} to ${fmt(pts[b])}`;
    }).join(" or ");
  };
  const hi = Math.max(...vals), lo = Math.min(...vals);
  const maxProfit = right > 0 ? { value: Infinity, at: "keeps growing as the price rises", unlimited: true } : { value: r2(hi), at: where(hi), unlimited: false };
  const maxLoss = right < 0 ? { value: -Infinity, at: "keeps growing as the price rises", unlimited: true } : { value: r2(lo), at: where(lo), unlimited: false };
  const netPremium = r2(legs.reduce((s, l) => s + (l.kind === "shares" ? 0 : l.side * l.premium * l.lots), 0));
  return { kinks, breakevens, maxProfit, maxLoss, netPremium };
}

/** One input of a structure: a strike, a premium or the share price paid. */
export type Field = { key: string; label: string; kind: "strike" | "premium" | "price" };
export type Structure = {
  id: StructureId; name: string; also?: string;
  /** one neutral line: what the structure is made of and what it does at expiry */ line: string;
  fields: Field[];
  /** a worked set of inputs (index-like levels, lot size of the example) */ preset: Record<string, number>; lotSize: number; spot: number;
  legs: (v: Record<string, number>) => Leg[];
  /** an input problem in words (strikes in the wrong order), or null */ check?: (v: Record<string, number>) => string | null;
  /** the writer's side can be shown by flipping every leg (straddle, strangle) */ flip?: boolean;
};

const C = (side: 1 | -1, strike: number, premium: number): Leg => ({ kind: "call", side, strike, premium, lots: 1 });
const P = (side: 1 | -1, strike: number, premium: number): Leg => ({ kind: "put", side, strike, premium, lots: 1 });
const S = (price: number): Leg => ({ kind: "shares", side: 1, strike: price, premium: 0, lots: 1 });

/** The structures taught in module 7 (and the two single options of module 3). Lot sizes and prices are illustrative. */
export const STRUCTURES: Structure[] = [
  { id: "long-call", name: "Call (the buyer's side)", line: "The buyer pays a premium for the right to the underlying at the strike. At expiry the loss is at most the premium; the gain grows as the price rises above the strike plus the premium.",
    fields: [{ key: "k", label: "Strike", kind: "strike" }, { key: "c", label: "Call premium paid", kind: "premium" }], preset: { k: 24000, c: 180 }, lotSize: 65, spot: 24000,
    legs: (v) => [C(1, v.k, v.c)] },
  { id: "long-put", name: "Put (the buyer's side)", line: "The buyer pays a premium for the right to hand over the underlying at the strike. At expiry the loss is at most the premium; the gain grows as the price falls below the strike less the premium.",
    fields: [{ key: "k", label: "Strike", kind: "strike" }, { key: "p", label: "Put premium paid", kind: "premium" }], preset: { k: 24000, p: 150 }, lotSize: 65, spot: 24000,
    legs: (v) => [P(1, v.k, v.p)] },
  { id: "covered-call", name: "Covered call", line: "Owning the shares and writing a call on the same number of shares. The premium received adds to the shares' result; any rise above the strike is given up; a fall in the shares is cushioned only by the premium.",
    fields: [{ key: "s", label: "Price paid for the shares", kind: "price" }, { key: "k", label: "Call strike (written)", kind: "strike" }, { key: "c", label: "Call premium received", kind: "premium" }],
    preset: { s: 1200, k: 1260, c: 22 }, lotSize: 500, spot: 1200, legs: (v) => [S(v.s), C(-1, v.k, v.c)] },
  { id: "protective-put", name: "Protective put", line: "Owning the shares and being the buyer of a put on the same number of shares. Below the put's strike the shares' fall is offset; the premium paid is the cost of that floor.",
    fields: [{ key: "s", label: "Price paid for the shares", kind: "price" }, { key: "k", label: "Put strike", kind: "strike" }, { key: "p", label: "Put premium paid", kind: "premium" }],
    preset: { s: 1200, k: 1150, p: 18 }, lotSize: 500, spot: 1200, legs: (v) => [S(v.s), P(1, v.k, v.p)] },
  { id: "call-spread", name: "Call spread (debit)", also: "also called a bull call spread", line: "The buyer of a call at a lower strike who also writes a call at a higher strike. Both the largest loss (the net premium) and the largest gain (the gap between strikes less the net premium) are capped.",
    fields: [{ key: "k1", label: "Lower strike (call paid for)", kind: "strike" }, { key: "c1", label: "Premium paid", kind: "premium" }, { key: "k2", label: "Higher strike (call written)", kind: "strike" }, { key: "c2", label: "Premium received", kind: "premium" }],
    preset: { k1: 24000, c1: 180, k2: 24200, c2: 90 }, lotSize: 65, spot: 24000, legs: (v) => [C(1, v.k1, v.c1), C(-1, v.k2, v.c2)],
    check: (v) => (v.k1 < v.k2 ? null : "The lower strike must be below the higher strike.") },
  { id: "put-spread", name: "Put spread (debit)", also: "also called a bear put spread", line: "The buyer of a put at a higher strike who also writes a put at a lower strike. The largest loss is the net premium; the largest gain is the gap between strikes less the net premium.",
    fields: [{ key: "k1", label: "Higher strike (put paid for)", kind: "strike" }, { key: "p1", label: "Premium paid", kind: "premium" }, { key: "k2", label: "Lower strike (put written)", kind: "strike" }, { key: "p2", label: "Premium received", kind: "premium" }],
    preset: { k1: 24000, p1: 160, k2: 23800, p2: 85 }, lotSize: 65, spot: 24000, legs: (v) => [P(1, v.k1, v.p1), P(-1, v.k2, v.p2)],
    check: (v) => (v.k2 < v.k1 ? null : "The lower strike must be below the higher strike.") },
  { id: "straddle", name: "Straddle", line: "A call and a put at the same strike. The buyer's side gains when the price ends far from the strike in either direction and loses at most both premiums; the writer's side is the mirror image, with losses that are not capped.",
    fields: [{ key: "k", label: "Strike", kind: "strike" }, { key: "c", label: "Call premium", kind: "premium" }, { key: "p", label: "Put premium", kind: "premium" }],
    preset: { k: 24000, c: 180, p: 160 }, lotSize: 65, spot: 24000, legs: (v) => [C(1, v.k, v.c), P(1, v.k, v.p)], flip: true },
  { id: "strangle", name: "Strangle", line: "A put at a lower strike and a call at a higher strike. Cheaper than a straddle for the buyer, so the price has to move further before it gains; the writer's side again has losses that are not capped.",
    fields: [{ key: "kp", label: "Put strike (lower)", kind: "strike" }, { key: "p", label: "Put premium", kind: "premium" }, { key: "kc", label: "Call strike (higher)", kind: "strike" }, { key: "c", label: "Call premium", kind: "premium" }],
    preset: { kp: 23800, p: 85, kc: 24200, c: 90 }, lotSize: 65, spot: 24000, legs: (v) => [P(1, v.kp, v.p), C(1, v.kc, v.c)], flip: true,
    check: (v) => (v.kp < v.kc ? null : "The put strike must be below the call strike.") },
  { id: "iron-condor", name: "Iron condor", line: "Four options: the writer of a put and a call near the price, and the buyer of a put further below and a call further above. The net premium received is the largest gain, between the inner strikes; the wings cap the largest loss.",
    fields: [{ key: "k1", label: "Lowest strike (put paid for)", kind: "strike" }, { key: "p1", label: "Premium paid", kind: "premium" }, { key: "k2", label: "Put strike (written)", kind: "strike" }, { key: "p2", label: "Premium received", kind: "premium" },
      { key: "k3", label: "Call strike (written)", kind: "strike" }, { key: "c3", label: "Premium received", kind: "premium" }, { key: "k4", label: "Highest strike (call paid for)", kind: "strike" }, { key: "c4", label: "Premium paid", kind: "premium" }],
    preset: { k1: 23600, p1: 40, k2: 23800, p2: 85, k3: 24200, c3: 90, k4: 24400, c4: 45 }, lotSize: 65, spot: 24000,
    legs: (v) => [P(1, v.k1, v.p1), P(-1, v.k2, v.p2), C(-1, v.k3, v.c3), C(1, v.k4, v.c4)],
    check: (v) => (v.k1 < v.k2 && v.k2 < v.k3 && v.k3 < v.k4 ? null : "The four strikes must rise from the first to the last.") },
];
export const structure = (id: StructureId) => STRUCTURES.find((s) => s.id === id)!;

/** The legs of a structure with `lots` applied to every leg, flipped to the writer's side when asked. */
export function buildLegs(s: Structure, v: Record<string, number>, lots: number, writer = false): Leg[] {
  return s.legs(v).map((l) => ({ ...l, lots, side: (writer && s.flip ? -l.side : l.side) as 1 | -1 }));
}

/** Prices to draw: from below the lowest strike to above the highest, wide enough to show every breakeven. */
export function priceRange(legs: Leg[], spot: number, a: Analysis): [number, number] {
  const marks = [spot, ...a.kinks, ...a.breakevens, ...legs.filter((l) => l.kind === "shares").map((l) => l.strike)].filter((x) => x > 0);
  const lo = Math.min(...marks), hi = Math.max(...marks), pad = Math.max((hi - lo) * 0.35, spot * 0.03);
  return [Math.max(0, lo - pad), hi + pad];
}

/** Labels of a leg in plain words ("Call 24,200, written at ₹90"). */
export function legLabel(l: Leg): string {
  const n = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (l.kind === "shares") return `Shares from ₹${n(l.strike)}`;
  return `${l.kind === "call" ? "Call" : "Put"} ${n(l.strike)}, ${l.side > 0 ? "paid" : "written at"} ₹${n(l.premium)}`;
}
