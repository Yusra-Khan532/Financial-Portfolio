// Plain number wording for the card. Pure functions.

/** Market value in rupees crore: "₹19.6 L Cr" from a lakh crore up, otherwise "₹5,430 Cr". */
export function crores(v) {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)} L Cr`;
  return `₹${Math.round(v).toLocaleString("en-IN")} Cr`;
}
export const num = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : v.toFixed(d));
export const pct = (v) => (v == null || !Number.isFinite(v) ? null : `${v.toFixed(1)}%`);
