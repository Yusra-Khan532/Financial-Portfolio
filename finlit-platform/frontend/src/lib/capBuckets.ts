// Company size by market value, in rupees crore: one scale for the whole site (the 9 Nov 2026 pages update): Large above ₹50,000 Cr, Mid ₹10,000–50,000 Cr, Small below ₹10,000 Cr.
// No Mega, Micro or Nano. These are plain money bands, not an official classification (SEBI ranks the top 100 / next 150 / the rest by rank).
export type CapBucket = { id: "large" | "mid" | "small"; label: string; range: string; min: number };
export const CAP_BUCKETS: CapBucket[] = [
  { id: "large", label: "Large cap", range: "Above ₹50,000 Cr", min: 50000 },
  { id: "mid", label: "Mid cap", range: "₹10,000–50,000 Cr", min: 10000 },
  { id: "small", label: "Small cap", range: "Below ₹10,000 Cr", min: 0 },
];

/** The bucket a market value (₹ crore) falls in; null when the value is not known. A value exactly on an edge belongs to the bucket whose range ends there (50,000 is Mid cap, 10,000 is Small cap). */
export function capBucket(crore: number | null | undefined): CapBucket | null {
  if (crore == null || !Number.isFinite(crore) || crore < 0) return null;
  if (crore > 50000) return CAP_BUCKETS[0];
  if (crore > 10000) return CAP_BUCKETS[1];
  return CAP_BUCKETS[2];
}

