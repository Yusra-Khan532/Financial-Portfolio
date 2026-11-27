// FinLit's four company sizes (the 20 Nov pack, SHARED §2 and 06_Company_sizes_whole_site, reference company_size.js), by full market value at the last
// close in ₹ crore: Large above ₹75,000 Cr · Mid ₹25,000–75,000 Cr · Small ₹10,000–25,000 Cr · Micro below ₹10,000 Cr. Exactly ₹75,000 and ₹25,000 Cr
// are Mid; exactly ₹10,000 Cr is Small. One stored `size` field per security is the source (task #262); a page reads it when the row carries it and
// falls back to this same rule on the market value, so the two can never disagree.
export type CompanySize = "large" | "mid" | "small" | "micro";
import { SIZE_LINES } from "./capBuckets";   // the one set of lines (lib/capBuckets.ts, the server's finlit/sizes.py)
export { SIZE_LINES };
export const SIZE_ORDER: CompanySize[] = ["large", "mid", "small", "micro"];
export const SIZE_LABEL: Record<CompanySize, string> = { large: "Large cap", mid: "Mid cap", small: "Small cap", micro: "Micro cap" };
export const SIZE_WORD: Record<CompanySize, string> = { large: "Large", mid: "Mid", small: "Small", micro: "Micro" };
export const SIZE_RANGE: Record<CompanySize, string> = { large: "Above ₹75,000 Cr", mid: "₹25,000–75,000 Cr", small: "₹10,000–25,000 Cr", micro: "Below ₹10,000 Cr" };

/** The size of a market value (₹ crore), or null when it is not known (shown as "Not known"). */
export function companySize(mcapCr: number | null | undefined): CompanySize | null {
  if (mcapCr == null || !Number.isFinite(mcapCr) || !(mcapCr > 0)) return null;   // as the server: no positive market value, no size
  if (mcapCr > SIZE_LINES.largeAbove) return "large";
  if (mcapCr >= SIZE_LINES.midFrom) return "mid";
  if (mcapCr >= SIZE_LINES.smallFrom) return "small";
  return "micro";
}

/** The stored size field when the row carries one (task #262), else the rule above on its market value. */
export function sizeOfRow(row: { size?: unknown; market_cap?: number | null } | null | undefined): CompanySize | null {
  const s = typeof row?.size === "string" ? row.size.toLowerCase() : null;
  if (s && (SIZE_ORDER as string[]).includes(s)) return s as CompanySize;
  return companySize(row?.market_cap ?? null);
}
