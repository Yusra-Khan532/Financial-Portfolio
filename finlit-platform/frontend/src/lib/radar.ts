// Trading Lab > Order Flow > Stock radar (docs/TRADING-LAB.md "Stock radar"): the five facts of one F&O stock (backend finlit/lab/flow.py
// `agreement`) drawn as a radar. The fact itself (met, not met, not known) comes from the engine; each axis's 0-1 strength is measured here from
// the real number behind the fact, along the stock's own move (direction), on a scale where the dashed ring at 0.5 is the fact's own line:
// outside the ring the fact is met, inside it is not. A description of where the stock stands, never a call.
import { inr, pct, type FactKey, type FlowStock } from "./flow";

export type AxisState = "yes" | "no" | "unknown";
export type RadarAxis = {
  key: FactKey;
  /** The short name on the axis label. */
  short: string;
  /** The fact as the Flow board words it. */
  fact: string;
  state: AxisState;
  /** 0 (centre) to 1 (rim), or null when the number is not known. */
  value: number | null;
  /** The number behind the axis, in plain words. */
  number: string;
  /** What the centre, the dashed ring and the rim stand for on this axis. */
  scale: string;
  /** Why the axis is blank, when it is. */
  note: string | null;
};

/** The dashed ring: where each axis's fact begins. */
export const FACT_RING = 0.5;
/** How far an OI change or a VWAP gap reaches the rim. */
export const OI_FULL = 10;    // |OI change| of 10% or more: the rim of the 5% axis (5% sits on the ring)
export const OI_SPAN = 5;     // new positions: OI change of +5% at the rim, 0% on the ring, -5% at the centre
export const VWAP_SPAN = 1;   // VWAP side: 1% on the move's side at the rim, at VWAP on the ring, 1% the other side at the centre

const AXES: { key: FactKey; up: string; down: string; factUp: string; factDown: string }[] = [
  { key: "newPositions", up: "New positions", down: "New positions", factUp: "Open interest rose with the move (new positions)", factDown: "Open interest rose with the move (new positions)" },
  { key: "vwapSide", up: "Above VWAP", down: "Below VWAP", factUp: "Price above the day's VWAP", factDown: "Price below the day's VWAP" },
  { key: "pastLevel", up: "Beyond R1", down: "Beyond S1", factUp: "Price above R1", factDown: "Price below S1" },
  { key: "strongOi", up: "OI change 5%+", down: "OI change 5%+", factUp: "Open interest changed 5% or more", factDown: "Open interest changed 5% or more" },
  { key: "rangeEnd", up: "Top of range", down: "Bottom of range", factUp: "Price in the top quarter of the day's range", factDown: "Price in the bottom quarter of the day's range" },
];
export const AXIS_COUNT = AXES.length;

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Straight lines between the given (x, y) points, flat beyond the first and the last; the xs must rise. */
export function piecewise(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

const stateOf = (v: boolean | null | undefined): AxisState => (v == null ? "unknown" : v ? "yes" : "no");
export const MARK: Record<AxisState, string> = { yes: "✓", no: "✕", unknown: "?" };
export const STATE_WORD: Record<AxisState, string> = { yes: "met", no: "not met", unknown: "not known" };
const noteOf = (s: FlowStock, prefix: string) => s.notes.find((n) => n.startsWith(prefix))?.slice(prefix.length).trim() ?? null;
const n2 = (v: number) => v.toFixed(2);

/** The five axes of one stock: the engine's fact state, the strength measured from its number, and that number in words. */
export function radarAxes(s: FlowStock): RadarAxis[] {
  const d = s.direction, up = d >= 0;
  const flat = d === 0 ? "The stock moved neither way, so no facts are counted along a move." : null;
  const oi = s.oiChangePct;
  const pv = s.pivots;
  const rangeOk = s.low != null && s.high != null && s.high > s.low;
  const pos = rangeOk ? clamp((s.price - (s.low as number)) / ((s.high as number) - (s.low as number))) : null;
  const out: RadarAxis[] = [];
  for (const a of AXES) {
    const base = { key: a.key, short: up ? a.up : a.down, fact: up ? a.factUp : a.factDown, state: d === 0 ? "unknown" as AxisState : stateOf(s.agreement.facts[a.key]) };
    if (a.key === "newPositions") {
      out.push({ ...base, value: flat || oi == null ? null : clamp(FACT_RING + oi / (2 * OI_SPAN)),
        number: oi == null ? "Open interest change not known" : `Open interest ${pct(oi)} against the previous close`,
        scale: `Centre: open interest down ${OI_SPAN}% or more · dashed ring: no change · rim: up ${OI_SPAN}% or more`,
        note: flat ?? (oi == null ? noteOf(s, "oi:") ?? "The open interest change is not known yet." : null) });
    } else if (a.key === "vwapSide") {
      const g = s.vwapGapPct;
      out.push({ ...base, value: flat || g == null ? null : clamp(FACT_RING + (d * g) / (2 * VWAP_SPAN)),
        number: g == null || s.vwap == null ? "VWAP not known" : `Price ${inr(s.price)} is ${pct(g)} from VWAP ${inr(s.vwap)}`,
        scale: `Centre: ${VWAP_SPAN}% or more on the other side of VWAP · dashed ring: at VWAP · rim: ${VWAP_SPAN}% or more ${up ? "above" : "below"} it`,
        note: flat ?? (g == null ? noteOf(s, "vwap:") ?? "VWAP is not known." : null) });
    } else if (a.key === "pastLevel") {
      const lvl = pv ? (up ? pv.r1 : pv.s1) : null;
      const v = !pv || flat ? null : up
        ? piecewise(s.price, [[pv.s1, 0], [pv.p, 0.25], [pv.r1, FACT_RING], [pv.r2, 1]])
        : piecewise(s.price, [[pv.s2, 1], [pv.s1, FACT_RING], [pv.p, 0.25], [pv.r1, 0]]);
      out.push({ ...base, value: v == null ? null : clamp(v),
        number: lvl == null ? "Pivot levels not known" : `Price ${inr(s.price)} is ${pct(((s.price - lvl) / lvl) * 100)} from ${up ? "R1" : "S1"} ${inr(lvl)}`,
        scale: up ? "Centre: at or below S1 · a quarter: the pivot · dashed ring: R1 · rim: R2 or above" : "Centre: at or above R1 · a quarter: the pivot · dashed ring: S1 · rim: S2 or below",
        note: flat ?? (!pv ? noteOf(s, "pivots:") ?? "Pivot levels are not available for this stock." : null) });
    } else if (a.key === "strongOi") {
      out.push({ ...base, value: flat || oi == null ? null : clamp(Math.abs(oi) / OI_FULL),
        number: oi == null ? "Open interest change not known" : `Open interest changed ${n2(Math.abs(oi))}% (${oi >= 0 ? "up" : "down"})`,
        scale: `Centre: no change · dashed ring: 5% · rim: ${OI_FULL}% or more, up or down`,
        note: flat ?? (oi == null ? noteOf(s, "oi:") ?? "The open interest change is not known yet." : null) });
    } else {
      const along = pos == null ? null : up ? pos : 1 - pos;
      out.push({ ...base, value: flat || along == null ? null : piecewise(along, [[0, 0], [0.75, FACT_RING], [1, 1]]),
        number: pos == null ? "The day's range not known" : `Price at ${Math.round(pos * 100)}% of the day's range (low ${inr(s.low)}, high ${inr(s.high)})`,
        scale: up ? "Centre: the day's low · dashed ring: three quarters of the way up · rim: the day's high" : "Centre: the day's high · dashed ring: three quarters of the way down · rim: the day's low",
        note: flat ?? (pos == null ? "The day's high and low are not both known yet." : null) });
    }
  }
  return out;
}

/** Stocks whose symbol starts with the text first, then those whose symbol or name holds it; at most `n`. */
export function matchStocks(stocks: FlowStock[], text: string, n = 8): FlowStock[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const first = stocks.filter((s) => s.symbol.toLowerCase().startsWith(q));
  const rest = stocks.filter((s) => !first.includes(s) && (s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)));
  return [...first, ...rest].slice(0, n);
}

/** The stocks with the most facts lined up one way (the engine's order: facts, then OI change, then the move), at most `n`. */
export const linedUp = (stocks: FlowStock[], up: boolean, n = 4) => stocks.filter((s) => (up ? s.direction > 0 : s.direction < 0)).slice(0, n);

/** The point of axis `i` of `n` at strength `v` around (cx, cy) with radius r; axis 0 points up, the rest go clockwise. */
export function axisPoint(i: number, n: number, v: number, cx: number, cy: number, r: number): [number, number] {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  return [cx + r * v * Math.cos(a), cy + r * v * Math.sin(a)];
}

/** The outline through each axis's strength: one closed shape when every axis is known, otherwise only the sides between two known axes. */
export function outline(values: (number | null)[], cx: number, cy: number, r: number): { d: string; closed: boolean } {
  const n = values.length, f = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  if (values.every((v) => v != null)) return { d: values.map((v, i) => `${i ? "L" : "M"}${f(axisPoint(i, n, v as number, cx, cy, r))}`).join("") + "Z", closed: true };
  let d = "";
  values.forEach((v, i) => {
    const w = values[(i + 1) % n];
    if (v != null && w != null) d += `M${f(axisPoint(i, n, v, cx, cy, r))}L${f(axisPoint((i + 1) % n, n, w, cx, cy, r))}`;
  });
  return { d, closed: false };
}
