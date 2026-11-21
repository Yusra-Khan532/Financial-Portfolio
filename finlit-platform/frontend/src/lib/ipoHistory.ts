// Every IPO on record (the all-IPOs table) and one IPO in full (the IPO report): types, data hooks, and the table's filtering, sorting and summary.
// Arithmetic only; describes, never advises.
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

export type IpoStatus = "upcoming" | "open" | "closed" | "listed" | "not_listed" | "withdrawn";
export type IpoRow = {
  id: number; name: string; symbol: string | null; nse: string | null; bse: string | null; board: "mainboard" | "sme"; sector: string | null;
  exchanges: string[]; kind: string | null; status: IpoStatus; openDate: string | null; closeDate: string | null; listingDate: string | null;
  priceLow: number | null; priceHigh: number | null; issuePrice: number | null; lotSize: number | null; minAmount: number | null;
  issueSizeCr: number | null; freshCr: number | null; ofsCr: number | null;
  subscription: number | null; subQib: number | null; subNii: number | null; subRetail: number | null;
  gmp: number | null; gmpPct: number | null; listingPrice: number | null; listingPct: number | null;
  listingClose: number | null; listingClosePct: number | null; lastClose: number | null; lastDay: string | null; sinceIpoPct: number | null; adjustedBy: number | null; companyPage: boolean;
  verdict: "beat" | "short" | "band" | null;
};
export type Source = { name: string; url: string | null; what: string };
export type IpoHistory = { items: IpoRow[]; asOf: string; updatedAt: string | null; sources: Record<"issue" | "nse" | "prices", Source>; note: string };

export const useIpoHistory = () => useQuery({ queryKey: ["ipo-history"], queryFn: () => apiGet<IpoHistory>("/api/ipos/history"), staleTime: 600_000, retry: 1 });

export const STATUS_LABEL: Record<IpoStatus, string> = { upcoming: "Upcoming", open: "Open now", closed: "Closed, not listed yet", listed: "Listed", not_listed: "Did not list", withdrawn: "Withdrawn" };

// ------------------------------------------------------------------------------------------------ filters
export type Range = [number | null, number | null];
export type Filters = {
  q: string; status: "all" | IpoStatus; board: "all" | "mainboard" | "sme"; year: "all" | string; sector: "all" | string; exchange: "all" | "NSE" | "BSE";
  gain: "any" | "up" | "down" | "gt25" | "gt50" | "gt100"; sub: "any" | "lt1" | "gt10" | "gt50" | "gt100"; size: "any" | "lt100" | "100to1000" | "gt1000";
};
export const NO_FILTERS: Filters = { q: "", status: "all", board: "all", year: "all", sector: "all", exchange: "all", gain: "any", sub: "any", size: "any" };

export const GAIN_OPTIONS: [Filters["gain"], string][] = [["any", "Any"], ["up", "Listed above issue price"], ["down", "Listed below issue price"], ["gt25", "Listed over 25% above"], ["gt50", "Listed over 50% above"], ["gt100", "Listed over 100% above"]];
export const SUB_OPTIONS: [Filters["sub"], string][] = [["any", "Any subscription"], ["lt1", "Under 1x (not fully subscribed)"], ["gt10", "Above 10x"], ["gt50", "Above 50x"], ["gt100", "Above 100x"]];
export const SIZE_OPTIONS: [Filters["size"], string][] = [["any", "Any issue size"], ["lt100", "Under ₹100 Cr"], ["100to1000", "₹100 – 1,000 Cr"], ["gt1000", "Above ₹1,000 Cr"]];

/** The year an issue belongs to: the year its bidding opened (or, failing that, it listed). */
export const yearOf = (r: IpoRow) => (r.openDate || r.listingDate || "").slice(0, 4) || null;

const inGain = (v: number | null, g: Filters["gain"]) =>
  g === "any" || (v != null && (g === "up" ? v > 0 : g === "down" ? v < 0 : g === "gt25" ? v > 25 : g === "gt50" ? v > 50 : v > 100));
const inSub = (v: number | null, s: Filters["sub"]) => s === "any" || (v != null && (s === "lt1" ? v < 1 : s === "gt10" ? v > 10 : s === "gt50" ? v > 50 : v > 100));
const inSize = (v: number | null, s: Filters["size"]) => s === "any" || (v != null && (s === "lt100" ? v < 100 : s === "100to1000" ? v >= 100 && v <= 1000 : v > 1000));

export function applyFilters(rows: IpoRow[], f: Filters): IpoRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || (r.symbol || "").toLowerCase().includes(q)) &&
    (f.status === "all" || r.status === f.status) && (f.board === "all" || r.board === f.board) && (f.year === "all" || yearOf(r) === f.year) &&
    (f.sector === "all" || r.sector === f.sector) && (f.exchange === "all" || r.exchanges.some((e) => e.startsWith(f.exchange))) &&
    inGain(r.listingPct, f.gain) && inSub(r.subscription, f.sub) && inSize(r.issueSizeCr, f.size));
}

// ------------------------------------------------------------------------------------------------ sorting
export type SortKey = "date" | "name" | "issuePrice" | "issueSizeCr" | "subscription" | "gmpPct" | "listingPct" | "listingClosePct" | "lastClose" | "sinceIpoPct";
const dateOf = (r: IpoRow) => r.listingDate || r.openDate || "";

/** Sorted copy; issues without the figure go last whichever way the column is sorted. */
export function sortRows(rows: IpoRow[], key: SortKey, dir: "asc" | "desc"): IpoRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const val = (r: IpoRow): string | number | null => (key === "date" ? dateOf(r) || null : key === "name" ? r.name.toLowerCase() : r[key]);
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return a.id - b.id;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * sign || b.id - a.id;
  });
}

// ------------------------------------------------------------------------------------------------ the summary over what is shown
export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarise(rows: IpoRow[]) {
  const listed = rows.filter((r) => r.status === "listed" && r.listingPct != null);
  const gains = listed.map((r) => r.listingPct as number);
  const since = rows.map((r) => r.sinceIpoPct).filter((v): v is number => v != null);
  const subs = rows.map((r) => r.subscription).filter((v): v is number => v != null);
  return {
    count: rows.length, listed: listed.length, above: gains.filter((g) => g > 0).length, below: gains.filter((g) => g < 0).length,
    medianGain: median(gains), medianSince: median(since), sinceCount: since.length, medianSub: median(subs),
    raisedCr: rows.reduce((a, r) => a + (r.issueSizeCr ?? 0), 0),
  };
}

// ------------------------------------------------------------------------------------------------ URL <-> filters (so a filtered view can be shared)
const KEYS = Object.keys(NO_FILTERS) as (keyof Filters)[];
export function filtersFromParams(p: URLSearchParams): Filters {
  const f = { ...NO_FILTERS };
  for (const k of KEYS) { const v = p.get(k); if (v) (f as Record<string, string>)[k] = v.slice(0, 80); }
  return f;
}
export function paramsFromFilters(f: Filters, sort: SortKey, dir: "asc" | "desc"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of KEYS) if (f[k] !== NO_FILTERS[k]) out[k] = String(f[k]);
  if (sort !== "date") out.sort = sort;
  if (dir !== "desc") out.dir = dir;
  return out;
}

// ------------------------------------------------------------------------------------------------ CSV of the rows shown
/** One CSV cell: numbers as they are; text quoted when needed, and text a spreadsheet would run as a formula (=, +, -, @) made plain with a leading '. */
const csvCell = (v: unknown) => { if (typeof v === "number") return Number.isFinite(v) ? String(v) : ""; const s = v == null ? "" : String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s; };
export function toCsv(rows: IpoRow[]): string {
  const cols: [string, (r: IpoRow) => unknown][] = [["Company", (r) => r.name], ["Symbol", (r) => r.symbol], ["Board", (r) => (r.board === "sme" ? "SME" : "Mainboard")],
    ["Status", (r) => STATUS_LABEL[r.status]], ["Opened", (r) => r.openDate], ["Closed", (r) => r.closeDate], ["Listed", (r) => r.listingDate],
    ["Issue price (Rs)", (r) => r.issuePrice], ["Issue size (Rs Cr)", (r) => r.issueSizeCr], ["Subscribed (x)", (r) => r.subscription],
    ["QIB (x)", (r) => r.subQib], ["NII (x)", (r) => r.subNii], ["Retail (x)", (r) => r.subRetail], ["GMP before listing (%)", (r) => r.gmpPct],
    ["Listing price (Rs)", (r) => r.listingPrice], ["Listing price vs issue (%)", (r) => r.listingPct], ["Listing-day close (%)", (r) => r.listingClosePct],
    ["Latest close (Rs)", (r) => r.lastClose], ["Latest close date", (r) => r.lastDay], ["Since IPO (%)", (r) => r.sinceIpoPct], ["Sector", (r) => r.sector]];
  return [cols.map(([h]) => csvCell(h)).join(","), ...rows.map((r) => cols.map(([, f]) => csvCell(f(r))).join(","))].join("\n");
}

// ------------------------------------------------------------------------------------------------ one IPO in full (the IPO report)
export type ReservationRow = { key: string; label: string; shares: number; pct: number; maxAllottees?: number };
export type BookCategory = { key: string; label: string; offered: number; bid: number | null; times: number };
export type IpoDetail = {
  company: { fullName: string | null; incorporated: string | null; city: string | null; sector: string | null; website: string | null; promoters: string[] };
  issue: {
    kind: string | null; board: "SME" | "Mainboard"; exchanges: string[]; faceValue: number | null; priceLow: number | null; priceHigh: number | null; issuePrice: number | null;
    lotSize: number | null; minAmount: number | null; retailMaxShares: number | null; sniiMinShares: number | null; sniiMinAmount: number | null; bniiMinShares: number | null;
    bniiMinAmount: number | null; totalShares: number | null; freshShares: number | null; ofsShares: number | null; totalCr: number | null; freshCr: number | null; ofsCr: number | null;
    preIssueShares: number | null; postIssueShares: number | null; promoterPre: number | null; promoterPost: number | null; marketCapCr: number | null;
    pe: number | null; postPe: number | null; eps: number | null; epsPost: number | null; withdrawn: boolean;
  };
  reservation: { total: number; rows: ReservationRow[] } | null;
  timetable: Record<"anchorBid" | "open" | "close" | "allotment" | "refunds" | "credit" | "listing" | "anchorLockin30" | "anchorLockin90", string | null>;
  documents: { drhp: string | null; rhp: string | null; prospectus: string | null; anchorList: string | null };
  people: { registrar: string | null; allotmentUrl: string | null; leadManagers: string[] };
  kpis: { asOf: string | null; roe: number | null; roce: number | null; debtEquity: number | null; ronw: number | null; patMargin: number | null; ebitdaMargin: number | null; nav: number | null; priceToBook: number | null }[];
  financials: { basis: string | null; unit: string | null; periods: string[]; rows: { label: string; values: (number | null)[] }[] } | null;
  objects: { label: string; amountCr: number | null }[] | null;
  expenses: { label: string; amountCr: number | null }[] | null;
  anchors: { count: number; shares: number; amountCr: number; investors: { name: string; shares: number; amountCr: number | null }[] } | null;
};
export type IpoRecord = IpoRow & {
  url: string; isin: string | null; detail: IpoDetail | null; updatedAt: string | null; sources: IpoHistory["sources"]; note: string;
  nseBook: { total: number; categories: BookCategory[]; demand: { price: string; lakhShares: number }[] } | null;
  gmpHistory: { t: string; gmp: number }[];
};
export const useIpoRecord = (id: number) =>
  useQuery({ queryKey: ["ipo-record", id], queryFn: () => apiGet<IpoRecord>(`/api/ipos/record/${id}`), staleTime: 600_000, retry: 1, enabled: Number.isInteger(id) && id > 0 });
