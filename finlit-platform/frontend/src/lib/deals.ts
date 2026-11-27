// Bulk & Block Deals (/ipo?view=deals): the filters as address parameters, the requests to /api/deals*, and the shapes they answer with.
// The backend counts a trade once when NSE lists it in both its bulk and block files (finlit/dealsapi.py). Describes; never advises.
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import { dateFormat, MINUS, nf } from "./format";

export type DealKind = "bulk" | "block" | "short";
export type Deal = {
  id: number; exchange: string; kind: DealKind; day: string; symbol: string; name: string | null; client: string | null; clientKey: string | null;
  side: "buy" | "sell" | null; qty: number; price: number | null; valueCr: number | null; remarks: string | null; alsoBlock: boolean; alsoBulk: boolean;
  source: string; pctEquity: number | null; dayClose: number | null; closeNow: number | null; closeAt: string | null; sinceDealPct: number | null; sinceNote: string | null;
};
export type Side = { trades: number; buyCr: number; sellCr: number };
export type Totals = { deals: number; trades: number; alsoListedAsBulk: number; buyCr: number; sellCr: number; days: number;
  byKind: { bulk: Side; block: Side; short: { deals: number; qty: number } } };
export type Coverage = { first_day: string | null; last_day: string | null; exchanges: string[]; byKind: Record<DealKind, [string | null, string | null]>;
  lastUpdated: string | null; historyDone: boolean; historyAnswers?: boolean | null; shorterThanPeriod?: boolean };
export type Period = { from: string; to: string; days: number };
export type Source = { name: string; url: string | null; what: string };
export type DealList = { rows: Deal[]; total: number; page: number; size: number; pages: number; totals: Totals; period: Period; coverage: Coverage;
  sources: Record<string, Source>; note: string };
export type DealSummary = { largest: Deal[]; totals: Totals; period: Period; coverage: Coverage; sources: Record<string, Source>; note: string;
  activeShares: { symbol: string; name: string | null; deals: number; grossCr: number; netCr: number }[];
  activeClients: { clientKey: string; client: string; deals: number; shares: number; grossCr: number; buyCr: number; sellCr: number }[] };
export type ClientDeals = { clientKey: string; client: string | null; spellings: string[]; rows: Deal[]; buyCr: number; sellCr: number; bothSides: string[]; coverage: Coverage; note: string;
  shares: { symbol: string; name: string | null; deals: number; buyCr: number; sellCr: number; netCr: number; bothSides: boolean; first: string; last: string }[] };
export type StockDeals = { symbol: string; rows: Deal[]; trades: number; buyCr: number; sellCr: number; netCr: number; latestClose: number | null; latestCloseAt: string | null;
  since: string | null; coverage: Coverage; note: string };
export type IpoDeals = { byId: Record<string, { symbol: string; deals: number; buyCr: number; sellCr: number; netCr: number }>; historyFrom: string | null; coverage: Coverage;
  lockinsAhead: { id: number; symbol: string; name: string; date: string; what: string; recent: { deals: number; buyCr: number; sellCr: number } | null }[] };

// ------------------------------------------------------------------------------------------------ the filters, as the address keeps them
export type PeriodKey = "1d" | "7d" | "30d" | "90d" | "1y" | "custom";
export type SortKey = "value" | "day" | "qty" | "price" | "symbol" | "client" | "pct";
export type DealFilters = { side: "all" | "buy" | "sell"; kind: "all" | DealKind; period: PeriodKey; from: string; to: string; q: string; min: string;
  sort: SortKey; dir: "asc" | "desc"; page: number; client: string };
export const NO_FILTERS: DealFilters = { side: "all", kind: "all", period: "7d", from: "", to: "", q: "", min: "", sort: "value", dir: "desc", page: 1, client: "" };
export const PERIODS: [PeriodKey, string, number][] = [["1d", "Today", 1], ["7d", "7 days", 7], ["30d", "30 days", 30], ["90d", "90 days", 90], ["1y", "1 year", 365], ["custom", "Custom", 0]];
export const SIDES: [DealFilters["side"], string][] = [["all", "All"], ["buy", "Buy"], ["sell", "Sell"]];
export const KINDS: [DealFilters["kind"], string][] = [["all", "All deals"], ["bulk", "Bulk"], ["block", "Block"], ["short", "Short selling"]];
export const MINS: [string, string][] = [["", "Any value"], ["1", "₹1 Cr and more"], ["10", "₹10 Cr and more"], ["25", "₹25 Cr and more"], ["100", "₹100 Cr and more"]];
const SORTS: SortKey[] = ["value", "day", "qty", "price", "symbol", "client", "pct"];
const ISO = /^\d{4}-\d\d-\d\d$/;

export function filtersFromParams(p: URLSearchParams): DealFilters {
  const pick = <T extends string>(k: string, ok: readonly T[], d: T): T => { const v = p.get(k) ?? ""; return (ok as readonly string[]).includes(v) ? (v as T) : d; };
  const from = p.get("from") ?? "", to = p.get("to") ?? "";
  let period = pick<PeriodKey>("period", ["1d", "7d", "30d", "90d", "1y", "custom"], "7d");
  if (period === "custom" && !ISO.test(from) && !ISO.test(to)) period = "7d";
  return {
    side: pick("side", ["all", "buy", "sell"] as const, "all"), kind: pick("kind", ["all", "bulk", "block", "short"] as const, "all"), period,
    from: ISO.test(from) ? from : "", to: ISO.test(to) ? to : "", q: (p.get("q") ?? "").slice(0, 60), min: pick("min", ["", "1", "10", "25", "100"] as const, ""),
    sort: pick("sort", SORTS, "value"), dir: p.get("dir") === "asc" ? "asc" : "desc", page: Math.max(1, Math.min(10000, parseInt(p.get("page") ?? "1", 10) || 1)),
    client: (p.get("client") ?? "").slice(0, 160),
  };
}

/** The address parameters for these filters (view=deals first, defaults left out, so a shared link stays short). */
export function paramsFromFilters(f: DealFilters): Record<string, string> {
  const o: Record<string, string> = { view: "deals" };
  (Object.keys(NO_FILTERS) as (keyof DealFilters)[]).forEach((k) => {
    if (f[k] !== NO_FILTERS[k] && f[k] !== "" && !(k === "from" || k === "to") ) o[k] = String(f[k]);
  });
  if (f.period === "custom") { if (f.from) o.from = f.from; if (f.to) o.to = f.to; }
  return o;
}

const days = (f: DealFilters) => PERIODS.find(([k]) => k === f.period)?.[2] || 7;

/** The list request for these filters (also the query key, so main.tsx's prefetch and the page share it). */
export function listPath(f: DealFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (f.period === "custom") { if (f.from) q.set("from", f.from); if (f.to) q.set("to", f.to); } else q.set("days", String(days(f)));
  q.set("kind", f.kind); q.set("side", f.side);
  if (f.q.trim()) q.set("q", f.q.trim());
  if (f.client) q.set("client", f.client);
  if (f.min) q.set("min_cr", f.min);
  q.set("sort", f.sort); q.set("dir", f.dir); q.set("page", String(f.page));
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return "/api/deals?" + q.toString();
}

export function summaryPath(f: DealFilters): string {
  const q = new URLSearchParams();
  if (f.period === "custom") { if (f.from) q.set("from", f.from); if (f.to) q.set("to", f.to); } else q.set("days", String(days(f)));
  if (f.side !== "all") q.set("side", f.side);
  if (f.q.trim()) q.set("q", f.q.trim());
  return "/api/deals/summary?" + q.toString();
}

/** The CSV of every row the filters match (the server writes it: up to 10,000 rows, the source and the note at the end). */
export const csvPath = (f: DealFilters) => listPath({ ...f, page: 1 }, { format: "csv" });

export const useDealList = (f: DealFilters, enabled = true) =>
  useQuery({ queryKey: ["deals", listPath(f)], queryFn: () => apiGet<DealList>(listPath(f)), staleTime: 300_000, retry: 1, enabled, placeholderData: (prev) => prev });
export const useDealSummary = (f: DealFilters, enabled = true) =>
  useQuery({ queryKey: ["deals-summary", summaryPath(f)], queryFn: () => apiGet<DealSummary>(summaryPath(f)), staleTime: 300_000, retry: 1, enabled });
export const useClientDeals = (key: string) =>
  useQuery({ queryKey: ["deals-client", key], queryFn: () => apiGet<ClientDeals>("/api/deals/client/" + encodeURIComponent(key)), staleTime: 300_000, retry: 0, enabled: !!key });
export const useStockDeals = (symbol: string | null | undefined, since?: string | null) =>
  useQuery({ queryKey: ["deals-stock", symbol, since ?? null], staleTime: 300_000, retry: 1, enabled: !!symbol,
    queryFn: () => apiGet<StockDeals>(`/api/deals/stock/${encodeURIComponent(symbol!)}${since ? "?since=" + since : ""}`) });
export const useIpoDeals = (enabled = true) =>
  useQuery({ queryKey: ["deals-ipos"], queryFn: () => apiGet<IpoDeals>("/api/deals/ipos"), staleTime: 300_000, retry: 1, enabled });

// ------------------------------------------------------------------------------------------------ words
export const KIND_LABEL: Record<DealKind, string> = { bulk: "Bulk", block: "Block", short: "Short selling" };
export const periodLabel = (f: DealFilters, p?: Period) => (f.period === "custom" ? (p ? `${p.from} to ${p.to}` : "Custom period") : f.period === "1d" ? "Today" : `Last ${PERIODS.find(([k]) => k === f.period)![1]}`);

/** "679 deals (612 trades after removing block deals also listed as bulk)": the line under the header. */
export function countLine(t: Totals): string {
  const d = `${t.deals.toLocaleString("en-IN")} ${t.deals === 1 ? "deal" : "deals"}`;
  if (!t.alsoListedAsBulk) return d;
  return `${d} (${t.trades.toLocaleString("en-IN")} ${t.trades === 1 ? "trade" : "trades"} after removing block deals also listed as bulk)`;
}

/** "27 Nov 2026"; a dash when there is no date. */
export const dayIn = (iso: string | null | undefined) => (iso ? dateFormat({ day: "numeric", month: "short", year: "numeric" }).format(new Date(iso.slice(0, 10) + "T00:00:00")) : MINUS);
/** "₹780 Cr", "₹94.30 Cr"; a dash when there is no value. */
export const crIn = (v: number | null | undefined) => (v == null ? MINUS : `₹${nf(v, Math.abs(v) >= 100 ? 0 : 2)} Cr`);
