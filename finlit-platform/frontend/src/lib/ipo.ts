import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

/** Extra facts read from the provider's row. Every key is optional: a fact the provider did not send is simply absent. */
export type IpoDetails = {
  issueType?: string; exchange?: string[]; registrar?: string; leadManagers?: string[];
  subscription?: { overall?: number; qib?: number; nii?: number; retail?: number; employees?: number; shareholders?: number };
  allotmentDate?: string; refundDate?: string; creditDate?: string; faceValue?: number; minInvestmentProvided?: number; issuePrice?: number;
  freshIssueCr?: number; ofsCr?: number; promoterPrePct?: number; promoterPostPct?: number; objectives?: string[];
  docs?: { drhp?: string; rhp?: string; prospectus?: string }; about?: string; statusText?: string; gmp?: { rupees: number; pct: number; source: string };
};
export type Ipo = {
  id: number; name: string; symbol: string | null; kind: "mainboard" | "sme"; sector: string | null; status: "upcoming" | "open" | "closed" | "listed";
  openDate: string; closeDate: string; listingDate: string | null; priceLow: number | null; priceHigh: number | null; lotSize: number | null;
  issueSizeCr: number | null; listingPrice: number | null; note: string | null; link: string | null;
  details?: IpoDetails; updatedAt?: string | null; source?: string | null; recordId?: number | null;
};
/** `fresh` skips the browser cache (the admin console must see its own changes at once). */
export const useIpos = (fresh = false) => useQuery({ queryKey: ["ipos", fresh], queryFn: () => apiGet<{ ipos: Ipo[] }>("/api/ipos", fresh ? { cache: "reload" } : undefined).then((d) => d.ipos), staleTime: 120_000, retry: 1 });
/** Smallest application: one lot at the top of the price band. */
export const minInvest = (i: Ipo) => (i.priceHigh && i.lotSize ? i.priceHigh * i.lotSize : null);
/** The issue price a listing is compared with: the provider's own issue price when it sends one, else the top of the band. */
export const issuePriceOf = (i: Ipo) => i.details?.issuePrice ?? i.priceHigh;
export type ListingMove = { issue: number; listing: number; rupees: number; pct: number; basis: "issue price" | "upper end of the price band" };
/** Listing price against the issue price: arithmetic on those two figures only. */
export function listingMove(i: Ipo): ListingMove | null {
  const issue = issuePriceOf(i);
  if (!i.listingPrice || !issue) return null;
  return { issue, listing: i.listingPrice, rupees: i.listingPrice - issue, pct: ((i.listingPrice - issue) / issue) * 100, basis: i.details?.issuePrice ? "issue price" : "upper end of the price band" };
}
export const listingGain = (i: Ipo) => listingMove(i)?.pct ?? null;

export type TimelineStep = { key: string; label: string; date: string };
/** Key dates, in the order they happen, only the ones that exist. */
export function timeline(i: Ipo): TimelineStep[] {
  const d = i.details || {};
  const all: [string, string, string | null | undefined][] = [["open", "Issue opens", i.openDate], ["close", "Issue closes", i.closeDate], ["allot", "Allotment", d.allotmentDate], ["refund", "Refunds", d.refundDate], ["credit", "Shares credited", d.creditDate], ["list", "Listing", i.listingDate]];
  const out: TimelineStep[] = [];
  for (const [key, label, date] of all) if (date) out.push({ key, label, date });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export const SUBSCRIPTION_ROWS: [keyof NonNullable<IpoDetails["subscription"]>, string][] = [["qib", "Qualified institutional buyers"], ["nii", "Non-institutional investors"], ["retail", "Retail investors"], ["employees", "Employees"], ["shareholders", "Shareholders"], ["overall", "Total"]];
export const hasSubscription = (i: Ipo) => SUBSCRIPTION_ROWS.some(([k]) => i.details?.subscription?.[k] != null);

/** One listed IPO in the GMP record: the last grey-market premium InvestorGain recorded before listing, against the listing price (both as a percent of
 *  the issue price). `verdict`: beat = listed more than `bandPts` above what the GMP said, short = more than `bandPts` below, band = within. */
export type GmpPoint = { id: number; name: string; symbol: string | null; board: "mainboard" | "sme"; issuePrice: number; gmp: number; gmpPct: number; listingPrice: number;
  listingPct: number; day1Close?: number | null; day1ClosePct?: number | null; listingDate: string | null; subscription: number | null; issueSizeCr: number | null; verdict: "beat" | "short" | "band"; url: string };
export type GmpRecord = {
  board: "all" | "mainboard" | "sme"; items: GmpPoint[]; source: { name: string; url: string }; updatedAt: string | null; note: string;
  summary: { count: number; beat: number; short: number; band: number; bandPts: number; directionRight: number; medianGap: number | null; fit: { slope: number; intercept: number } | null };
};
export const useGmpRecord = (board: GmpRecord["board"]) =>
  useQuery({ queryKey: ["ipo-gmp", board], queryFn: () => apiGet<GmpRecord>(`/api/ipos/gmp-record?board=${board}`), staleTime: 600_000, retry: 1 });
