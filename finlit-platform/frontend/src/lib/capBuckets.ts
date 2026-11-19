// Company size by market value (full market cap at last close), in rupees crore: one scale for the whole site.
// Four sizes since the owner's rule of 20 Nov 2026 (#262): Large above ₹75,000 Cr, Mid ₹25,000–75,000 Cr, Small ₹10,000–25,000 Cr,
// Micro below ₹10,000 Cr. (Before that there were three: Large above 50,000, Mid 10,000 to 50,000 and Small below 10,000 crore, so an
// old "Small" is today's "Micro".) These are FinLit's own fixed rupee amounts, not an official classification (SEBI ranks the top 100 /
// next 150 / the rest by rank). This file is the single source: every page that sorts companies by size uses capBucket() / CAP_BUCKETS.
export type CapId = "large" | "mid" | "small" | "micro";
export type CapBucket = { id: CapId; label: string; short: "Large" | "Mid" | "Small" | "Micro"; range: string; min: number };

/** The size lines in ₹ crore. Large: above largeAbove. Mid: midFrom to largeAbove (both included). Small: smallFrom up to midFrom. Micro: below smallFrom. */
export const SIZE_LINES = { largeAbove: 75000, midFrom: 25000, smallFrom: 10000 } as const;

/** The date the four-size rule took effect. */
export const SIZE_RULE_DATE = "20 Nov 2026";

export const CAP_BUCKETS: CapBucket[] = [
  { id: "large", label: "Large cap", short: "Large", range: "Above ₹75,000 Cr", min: SIZE_LINES.largeAbove },
  { id: "mid", label: "Mid cap", short: "Mid", range: "₹25,000–75,000 Cr", min: SIZE_LINES.midFrom },
  { id: "small", label: "Small cap", short: "Small", range: "₹10,000–25,000 Cr", min: SIZE_LINES.smallFrom },
  { id: "micro", label: "Micro cap", short: "Micro", range: "Below ₹10,000 Cr", min: 0 },
];

/** The size words in site order (Large, Mid, Small, Micro). */
export const SIZE_SHORTS = CAP_BUCKETS.map((b) => b.short) as ("Large" | "Mid" | "Small" | "Micro")[];
export type SizeShort = CapBucket["short"];

/** One line on the four sizes, for i-buttons and help text. */
export const SIZE_RULE_TEXT = "Large above ₹75,000 Cr, Mid ₹25,000–75,000 Cr, Small ₹10,000–25,000 Cr, Micro below ₹10,000 Cr";

/** The bucket a market value (₹ crore) falls in; null when the value is not known.
 * Edges: exactly 75,000 is Mid, exactly 25,000 is Mid, exactly 10,000 is Small. */
export function capBucket(crore: number | null | undefined): CapBucket | null {
  if (crore == null || !Number.isFinite(crore) || crore < 0) return null;
  if (crore > SIZE_LINES.largeAbove) return CAP_BUCKETS[0];
  if (crore >= SIZE_LINES.midFrom) return CAP_BUCKETS[1];
  if (crore >= SIZE_LINES.smallFrom) return CAP_BUCKETS[2];
  return CAP_BUCKETS[3];
}

/** The size word (Large / Mid / Small / Micro) of a market value; null when not known. */
export const sizeShort = (crore: number | null | undefined): SizeShort | null => capBucket(crore)?.short ?? null;
