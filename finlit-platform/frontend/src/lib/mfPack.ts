// The MF portfolio's risk answer types (/api/me/mf-portfolio/risk) and the fund names and tags the page writes. The tiles, cards and sentences of the
// rebuilt page (task #183 part 2) are in lib/mfTop.ts and mf/pack/*. Describes; never advice. Information only, not investment advice.
export type BetaBand = { key: "less" | "defensive" | "similar" | "more" | "high" | "very_high"; word: string } | null;
/** Task #183: each fund against its own category's benchmark, past year of weekly closes (server: mfportfolio/bench.py). */
export type FundOwn = {
  benchmark?: string; standIn?: boolean; benchWhy?: string | null; compared?: boolean; benchKind?: "index" | "blend" | "none"; betaOwn?: number | null; explained?: number | null;
  band?: BetaBand; downPer100?: number | null; upPer100?: number | null; oneYear?: number | null; benchOneYear?: number | null; beta500?: number | null; weeks?: number;
  riskShare?: number | null; saysLittle?: boolean; type?: string; listShare?: number;
};
export type FundRisk = { code: number; name: string; short: string; category: string; swing: number | null; worstFall: number | null; beta: number | null; fallsTaken: number | null; from: string | null; to: string | null; years: number | null; why: string | null;
  /** task #389 (fault 6): why "falls taken" is blank for a fund the own-benchmark step does not compare */ fallsWhy?: string } & FundOwn;
export type MfOwnList = {
  betaOwn: number | null; betaOwnBand: BetaBand; betaExLiquid: number | null; betaExLiquidBand: BetaBand; beta500: number | null; beta500Band: BetaBand; liquidShare: number | null;
  worst10: { list: number | null; nifty500: number | null }; fall10: { own: number | null; nifty500: number | null };
};
export type MfRisk = {
  count: number; why?: string; basis: "value" | "equal"; funds: FundRisk[];
  bench: { name: string; swing: number | null; worstFall: number | null; from: string; to: string };
  list: { swing: number | null; worstFall: number | null; level: { word: string; vs: string; because: string | null; riskier: string[] } | null; why?: string | null };
  own?: { from: string; to: string; list: MfOwnList } | null;
};

const ACRONYMS = new Set(["SBI", "HDFC", "ICICI", "UTI", "DSP", "PPFAS", "IDFC", "LIC", "HSBC", "ITI", "JM", "PGIM", "WOC", "NJ", "IDBI", "BOI", "ELSS", "ETF", "PSU", "IT", "ESG", "MNC", "US"]);
/** The same short name the server writes (mfportfolio.risk.short_name): "HDFC Flexi Cap Fund - Growth Option - Direct Plan" -> "HDFC Flexi Cap",
 *  "ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)" -> "ICICI Prudential Large Cap", "SBI SMALL CAP FUND" -> "SBI Small Cap". */
export function shortFund(n: string | null | undefined): string {
  let s = (n || "").split(" - ")[0].replace(/\s*\([^)]*\)/g, "").trim().replace(/\s+(fund|scheme)$/i, "").trim();
  if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) s = s.split(/\s+/).map((w) => (ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");
  return s;
}
/** The fund's tag in "Held by": the fund house's first word and the category's initials ("HDFC FC", "ICICI LC"); the full name is in its title. */
export function fundTag(name: string | null, amc: string | null, category: string | null): string {
  const house = (amc || name || "").replace(/\s+mutual\s+fund$/i, "").split(/\s+/)[0] || "Fund";
  const ini = (category || "").replace(/\bfunds?\b/gi, "").split(/[\s&-]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("");
  return ini ? `${house} ${ini}` : house;
}

/** The fund's short name as the page writes it: "Quant Small Cap Fund", "ICICI Prudential MNC Fund". */
export const fundName = (n: string | null) => { const s = shortFund(n); return s ? (/\b(fund|scheme)$/i.test((n || "").split(" - ")[0].replace(/\s*\([^)]*\)/g, "").trim()) ? `${s} Fund` : s) : ""; };
