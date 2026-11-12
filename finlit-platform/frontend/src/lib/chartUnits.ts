// Units and round tick values for the financial statement charts (task #63). Statement figures are in rupees crore; an axis is drawn in ₹ Cr (with thousands separators) up to
// ₹1 lakh crore and in ₹ lakh crore above it, so a company with revenue of ₹3,000 Cr reads 3,000 and not 0.03, and the ticks are round numbers (0, 1,000, 2,000 ...) instead of 4,873.
export type AxisUnit = { div: number; label: string; digits: number };
export const axisUnit = (max: number): AxisUnit => (max >= 1e5 ? { div: 1e5, label: "₹ lakh Cr", digits: 2 } : { div: 1, label: "₹ Cr", digits: 0 });

/** The smallest "round" number (1, 2, 2.5, 5 or 10 times a power of ten) that is not below `x`: the top of an axis. */
export function niceCeil(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
/** Three ticks from zero to a round top, and the top itself (the domain the bars are drawn against). */
export function niceTicks(max: number): { top: number; ticks: number[] } { const top = niceCeil(max); return { top, ticks: [0, top / 2, top] }; }
/** Two-sided axis (cash flow): a round step that covers both ends, ticks at the bottom, zero and the top. */
export function niceRange(min: number, max: number): { lo: number; hi: number } {
  const span = Math.max(Math.abs(min), Math.abs(max), 1), step = niceCeil(span / 2);
  return { lo: min < 0 ? -Math.ceil(Math.abs(min) / step) * step : 0, hi: max > 0 ? Math.ceil(max / step) * step : step };
}
