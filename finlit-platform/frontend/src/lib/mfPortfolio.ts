// MF portfolio: the mutual funds a member holds. Types of /api/me/mf-portfolio, the hooks, sorting, the review table's state and the CSV export.
// Everything that decides WHAT the member may see (Mutual Fund Score is Gold) is decided by the server; this file only draws what it was sent.
// Nothing here gives buy, sell, hold, switch or redeem advice. Information only, not investment advice.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend, type ApiError } from "./api";
import type { RawRow } from "./mfStatement";

export const MF_PORTFOLIO_NAME = "MF portfolio";
export const MF_INFO_ONLY = "Information only, not investment advice.";
export const MF_SCORE_LINE = "Describes the fund's health from its past NAVs, costs and holdings; not a recommendation.";
export const PARTS = [["performance", "Perf", "Performance"], ["risk", "Risk", "Risk"], ["cost", "Cost", "Cost"], ["quality", "Qual", "Quality"]] as const;
export type PartKey = (typeof PARTS)[number][0];

export type Lot = { id: string; units: number; invested: number | null; boughtOn: string | null };
export type ScoreBlock = {
  locked: boolean; final: number | null; label: string | null; status: string | null; reason: string | null; runDate: string | null;
  parts: Record<PartKey, number | null> | null; inherited: { name: string; why: string } | null;
  /** The server's word for each part (Strong / Fair / Weak, task #183): the page never cuts the numbers itself. */
  words?: Record<PartKey, string> | null;
  /** The fund's place in its category ("13 of 28 in category"); for an IDCW option, its Growth plan's. */
  rank?: { rank: number; of: number; scope: string | null; categoryLabel: string | null } | null;
};
export type Holding = {
  id: string; code: number; folio: string; units: number | null; lots: Lot[]; followed?: boolean;
  /** task #235: every buy and sale as stored (platform, side); `lots` is what is left of each buy, first in, first out */ lines?: Line[];
  name: string | null; amc: string | null; plan: string | null; option: string | null; category: string | null; categoryLabel: string | null; active: boolean; isin?: string | null; isinWhy?: string | null;
  nav: number | null; navDate: string | null; navStale: boolean; navNote: string | null;
  /** task #389 (fault 8): the change against the previous NAV AMFI gave (the public fund page's own figure), named by that NAV's date; null with its reason */
  change?: { abs: number; pct: number; since: string | null } | null; changeWhy?: string | null;
  invested: number | null; investedWhy: string | null; current: number | null; currentWhy: string | null;
  gain: number | null; gainPct: number | null; gainWhy: string | null;
  xirr: number | null; xirrWhy: string | null; xirrKind: "cagr" | "xirr";
  returns: { r1y: number | null; r3y: number | null; r5y: number | null; asOf: string | null; why: string | null; partialWhy?: string | null };
  ter: number | null; terDate: string | null; terWhy: string | null; aum: number | null; aumAsOf: string | null; aumKind?: "q" | "m" | null; aumWhy: string | null;
  weight: number | null; weightWhy: string | null; score: ScoreBlock;
};
export type Share = { label: string; value: number; pct: number };
export type Line = { id: string; units: number; invested: number | null; boughtOn: string | null; pf: string; side: "buy" | "sell" };
export type SoldFund = { id: string; code: number; folio: string; name: string | null; lines: Line[] };
export type Summary = {
  funds: number; valued: number; withCost: number; gainFunds: number; invested: number | null; current: number | null; gain: number | null; gainPct: number | null;
  navFrom: string | null; navTo: string | null; notes: string[]; xirr: number | null; xirrFunds: number; xirrWhy: string | null;
  score: { locked: boolean; value: number | null; label: string | null; why: string | null; funds?: number };
};
export type Concentration = { level: "concentrated" | "moderate" | "spread" | null; text: string; top1Pct: number | null; top3Pct: number | null; topFund?: string; topAmc?: string; topAmcPct?: number | null };
export type MfPortfolio = {
  plan: string; scoreLocked: boolean; limit: number; count: number; dataDate: string | null; holdings: Holding[]; summary: Summary; /** task #235: funds sold in full */ sold?: SoldFund[];
  allocation: { byCategory: Share[]; byAmc: Share[] }; concentration: Concentration; disclaimer: string; scoreDisclaimer: string;
};

export type Fund = { code: number; name: string; amc: string; plan: string; option: string; active: boolean; navDate: string | null };
export type ReviewStatus = "matched" | "choose" | "not_found" | "ignored" | "invalid" | "duplicate";
export type ReviewRow = {
  i: number; row: number; name: string; isin: string; amfi?: number | null; folio?: string; units?: number; invested?: number | null; boughtOn?: string | null;
  status: ReviewStatus; via?: string | null; reason: string; warnings: string[]; fund: Fund | null; suggested?: Fund | null; candidates: Fund[]; existing?: boolean;
};
export type Preview = { rows: ReviewRow[]; counts: Record<ReviewStatus, number>; total: number; capacity: { limit: number; used: number; room: number }; disclaimer: string };
export type CommitResult = { status: string; added: number; replaced: number; skipped: number; duplicates: number };

const KEY = ["mf-portfolio"];
/** Task #235: `pf` reads one platform ("all": every platform together, as before). */
const pq = (pf: string) => (pf && pf !== "all" ? `?pf=${encodeURIComponent(pf)}` : "");
export const useMfPortfolio = (enabled: boolean, pf = "all") => useQuery<MfPortfolio, ApiError>({ queryKey: pf === "all" ? KEY : [...KEY, "pf", pf], queryFn: () => apiGet<MfPortfolio>("/api/me/mf-portfolio" + pq(pf)), enabled, staleTime: 30_000, retry: (n, e) => e.status >= 500 && n < 2 });

export type LotInput = { units: string; invested?: string; avgCost?: string; boughtOn?: string; /** task #235 */ pf?: string; side?: "buy" | "sell" };
export function useMfWrites() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    add: useMutation({ mutationFn: (b: Partial<LotInput> & { code: number; folio?: string; follow?: boolean }) => apiSend<{ id: string; merged: boolean }>("POST", "/api/me/mf-portfolio", b), onSuccess: done }),
    update: useMutation({ mutationFn: (b: { id: string; folio?: string; lots: LotInput[] }) => apiSend("PUT", `/api/me/mf-portfolio/${b.id}`, { folio: b.folio, lots: b.lots }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => apiSend("DELETE", `/api/me/mf-portfolio/${id}`), onSuccess: done }),
    clear: useMutation({ mutationFn: () => apiSend<{ status: string; removed: number; undoSeconds: number }>("POST", "/api/me/mf-portfolio/clear"), onSuccess: done }),   // Clear portfolio (task #183): held 10 s for Undo
    undoClear: useMutation({ mutationFn: () => apiSend<{ status: string; restored: number }>("POST", "/api/me/mf-portfolio/undo-clear"), onSuccess: done }),
    preview: useMutation({ mutationFn: (rows: RawRow[]) => apiSend<Preview>("POST", "/api/me/mf-portfolio/import-preview", { rows }) }),
    commit: useMutation({ mutationFn: (b: { items: CommitItem[]; existing: "skip" | "replace" }) => apiSend<CommitResult>("POST", "/api/me/mf-portfolio/import-commit", b), onSuccess: done }),
  };
}
export type CommitItem = { code: number; folio: string; units: number; invested: number | null; boughtOn: string | null };

/** The fund search of the Funds page, narrowed to what a holding can be: one request per typed query. */
export const searchFunds = (q: string) => apiGet<{ items: { code: number; name: string; amc: string; plan: string; option: string; active: boolean; navDate: string | null }[] }>(`/api/mf?q=${encodeURIComponent(q)}&option=All&size=8`).then((r) => r.items as Fund[]);

// ------------------------------------------------------------------------------------------------------------------ the import review

/** What the member has decided for each row of the review: the scheme chosen (matched rows start with theirs) and whether to import it. */
export type Decision = { code: number | null; fund: Fund | null };
export function initialDecisions(rows: ReviewRow[]): Record<number, Decision> {
  const d: Record<number, Decision> = {};
  for (const r of rows) d[r.i] = r.status === "matched" && r.fund ? { code: r.fund.code, fund: r.fund } : { code: null, fund: null };
  return d;
}
const importable = (r: ReviewRow) => r.status === "matched" || r.status === "choose" || r.status === "not_found";
/** The rows that will be imported: ones with a scheme chosen (matched, or picked by the member). Nothing unmatched is ever included. */
export function commitItems(rows: ReviewRow[], dec: Record<number, Decision>, skip: Set<number> = new Set()): CommitItem[] {
  return rows.filter((r) => importable(r) && !skip.has(r.i) && dec[r.i]?.code != null && r.units != null)
    .map((r) => ({ code: dec[r.i].code as number, folio: r.folio || "", units: r.units as number, invested: r.invested ?? null, boughtOn: r.boughtOn ?? null }));
}
export function reviewCounts(rows: ReviewRow[], dec: Record<number, Decision>, skip: Set<number> = new Set()) {
  const open = rows.filter((r) => importable(r) && !skip.has(r.i));
  const ready = open.filter((r) => dec[r.i]?.code != null);
  return { ready: ready.length, needChoice: open.length - ready.length, existing: ready.filter((r) => r.existing && dec[r.i].code === r.fund?.code).length };
}
export const STATUS_WORD: Record<ReviewStatus, string> = { matched: "Matched", choose: "Needs choosing", not_found: "Not found", ignored: "Skipped", invalid: "Cannot import", duplicate: "Repeated line" };

// ------------------------------------------------------------------------------------------------------------------ the table

export type SortKey = "name" | "score" | "performance" | "risk" | "cost" | "quality" | "nav" | "invested" | "current" | "gain" | "gainPct" | "xirr" | "r1y" | "r3y" | "r5y" | "ter" | "aum" | "weight";
export function sortValue(h: Holding, k: SortKey): number | string | null {
  switch (k) {
    case "name": return (h.name || "").toLowerCase();
    case "score": return h.score.final;
    case "performance": case "risk": case "cost": case "quality": return h.score.parts?.[k] ?? null;
    case "r1y": case "r3y": case "r5y": return h.returns[k];
    default: return h[k];
  }
}
/** Sorted copy. A blank is always last, whichever way the column is sorted; ties keep the member's order. */
export function sortHoldings(rows: Holding[], key: SortKey, dir: "asc" | "desc"): Holding[] {
  return rows.map((h, i) => ({ h, i, v: sortValue(h, key) })).sort((a, b) => {
    if (a.v == null && b.v == null) return a.i - b.i;
    if (a.v == null) return 1;
    if (b.v == null) return -1;
    const c = typeof a.v === "string" ? a.v.localeCompare(b.v as string, "en") : (a.v as number) - (b.v as number);
    return c !== 0 ? (dir === "asc" ? c : -c) : a.i - b.i;
  }).map((x) => x.h);
}

/** Words for the concentration level (the tile's tag). */
export const LEVEL_WORD: Record<NonNullable<Concentration["level"]>, string> = { concentrated: "Concentrated", moderate: "Fairly spread", spread: "Well spread" };

// ------------------------------------------------------------------------------------------------------------------ small text helpers

/** "₹1,23,456" for money: whole rupees, Indian grouping, true minus sign. */
export function rupees(v: number | null | undefined, paise = false): string {
  if (v == null) return "—";
  const s = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: paise ? 2 : 0 });
  return (v < 0 ? "−" : "") + "₹" + s;
}
export const pct1 = (v: number | null | undefined, signed = false) => (v == null ? "—" : (v < 0 ? "−" : signed && v > 0 ? "+" : "") + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%");
/** Fund size in rupees crore with Indian grouping: 12345 -> "₹12,345 cr". */
export const crores = (v: number | null | undefined) => (v == null ? "—" : "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: v >= 100 ? 0 : 1 }) + " cr");
export const gainTone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "up" : "dn");


/** The share of funds by size (large, mid, small cap) and by type (equity, debt, hybrid, solution oriented, others), for the two pie charts.
 *  Weighted by current value when every fund has one; otherwise each fund counts the same (a followed fund has no units, so no value). */
export type Slice = { label: string; value: number; pct: number };
export const sizeOf = (category: string | null): string | null => (/large\s*&\s*mid/i.test(category || "") ? "Large & mid cap" : /large/i.test(category || "") ? "Large cap" : /mid/i.test(category || "") ? "Mid cap" : /small/i.test(category || "") ? "Small cap" : null);
export const typeOf = (category: string | null): string => (/^equity/i.test(category || "") ? "Equity" : /^debt/i.test(category || "") ? "Debt" : /^hybrid/i.test(category || "") ? "Hybrid" : /solution/i.test(category || "") ? "Solution oriented" : "Others");
export function shares(hs: Holding[], keyOf: (h: Holding) => string | null): { slices: Slice[]; by: "value" | "count"; left: number } {
  const byValue = hs.length > 0 && hs.every((h) => h.current != null && h.current > 0), m = new Map<string, number>();
  let left = 0;
  for (const h of hs) { const k = keyOf(h); if (k == null) { left++; continue; } m.set(k, (m.get(k) || 0) + (byValue ? (h.current as number) : 1)); }
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return { slices: [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value, pct: total ? Math.round((value / total) * 1000) / 10 : 0 })), by: byValue ? "value" : "count", left };
}

// ------------------------------------------------------------------------------------------------------------------ how spread the funds are

export type SpreadReading = { word: string } & Record<string, any>;
export type MfSpread = {
  count: number; why?: string; basis: "value" | "equal"; overall: string; knownShares: number; disclaimer: string;
  readings: { together: SpreadReading & { independent: number; of: number; range: [number, number] | null }; underneath: SpreadReading & { stocks: number; inTwoOrMore: number; inTwoOrMoreShare: number };
    overlap: SpreadReading & { top: { a: number; b: number; pct: number; n: number } | null }; theme: SpreadReading & { theme: string | null; funds: number[] };
    houses: SpreadReading & { top: string; count: number }; assets: SpreadReading & { equityShare: number } };
  mix: { shares: number; sharesUnknown: number; debt: number; other: number };
  size: { Large: number; Mid: number; Small: number; Micro?: number; Other: number };   // FinLit's four sizes (Micro since task #262)
  /** NSE's industries (task #192), largest first; "Listed abroad" and "Not classified" are lines of their own */
  industries: { name: string; share: number }[];
  topStocks: { name: string; symbol: string | null; industry: string | null; w: number; funds: number[]; prism?: { score: number | null; label: string | null; st: string | null; lt: string | null } | null }[];
  trendLocked?: boolean; trend?: MfTrend;
  overlap: { a: number; b: number; pct: number; n: number }[];
  together: { codes: number[]; C: number[][]; weeks: number; from: string | null; to: string | null };
  coverage: { funds: number; disclosed: number; missing: number[]; notMatched?: number };
  /** Task #183: the look-through grid. Keys "Macro sector|Large" (or "Sector|Small", "…|Unsized"); w = share of the whole list; every company per cell. */
  lookThrough?: Record<"macro" | "sector", Record<string, { w: number; n: number; stocks: { name: string; symbol: string | null; w: number }[] }>>;
  /** Each NSE sector's macro sector. */
  sectorMacro?: Record<string, string>;
  /** Each fund's split of its own money: by macro sector, by sector and by size (fractions of the fund). */
  perFund?: Record<string, { macro: Record<string, number>; sector: Record<string, number>; size: Record<string, number> }>;
  funds: { code: number; name: string; amc: string; category: string; weight: number; holdingsAsOf: string | null; why: string | null; assetSplit?: { equity?: number; debt?: number; cash?: number; other?: number } | null }[];
};
export const useMfSpread = (enabled: boolean, pf = "all") => useQuery<MfSpread, ApiError>({ queryKey: [...KEY, "spread", pf], queryFn: () => apiGet<MfSpread>("/api/me/mf-portfolio/diversification" + pq(pf)), enabled, staleTime: 60_000, retry: (n, e) => e.status >= 500 && n < 2 });

export type TrendCell = { name: string; share: number; n: number; symbols: string[] };
export type TrendRead = {
  n: number; rated: number; coverage: number; grid: Record<string, TrendCell>; breadth: { up: number; down: number }; direction: { improving: number; weakening: number; steady: number };
  business: Record<"strong_up" | "strong_down" | "weak_up" | "weak_down", { n: number; share: number; symbols: string[] }>; average: { stLabel: string; ltLabel: string } | null;
  /** Rated shares with neither a strong nor a weak business, or a sideways long-term trend (the Equity portfolio counts them under its list). */
  between?: number;
  /** Task #274 change 7: the same shares listed, each with its reason (its Prism score, and whether the long-term trend is flat): the fifth box, In between. */
  betweenList?: { n: number; share: number; items: { symbol: string; prism: number | null; flat: boolean }[] };
  ndirection?: { improving: number; weakening: number; steady: number };
  words: { longTerm: string; shortAgainstLong: string; businessAndPrice: string };
};
export type MfTrend = { all: TrendRead; perFund?: Record<string, TrendRead>; sharedWeakSpots?: { n: number; share: number; symbols: string[] } };
